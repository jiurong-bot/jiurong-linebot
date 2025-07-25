// infraModule.js

const express = require('express');
const { Client } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

// 常數 (這些可以從主程式傳入或在此模組內部定義)
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const ONE_DAY_IN_MS = 86400000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;

// Line Bot Client 和 PostgreSQL Client
const lineClient = new line.Client(config);
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 用於追蹤已發送的提醒，避免重複發送
const sentReminders = {};

// 將所有導出內容封裝在一個物件裡，這樣在內部調用方法時 `this` 指向這個物件本身會更明確
const infraModule = {
  // 導出所有必要的客戶端實例和常數
  lineClient,
  pgClient,
  constants: {
    ONE_DAY_IN_MS,
    ONE_HOUR_IN_MS,
  },
  
  /**
   * 初始化基礎設施模組
   * @param {Function} handleEvent - 主程式的事件處理函式，用於 Line Webhook
   * @param {Function} getAllCourses - 從主程式獲取課程數據的函數
   * @param {Function} getUser - 從主程式獲取用戶數據的函數
   */
  async init(PORT, handleEvent, getAllCourses, getUser) {
    const app = express();

    // === Express 中間件和 Webhook 設置 ===
    app.use(express.json({
      verify: (req, res, buf) => {
        if (req.headers['x-line-signature']) {
          req.rawBody = buf;
        }
      }
    }));

    app.post('/webhook', (req, res) => {
      const signature = req.headers['x-line-signature'];
      const channelSecret = config.channelSecret;
      
      // LINE Webhook 簽名驗證
      if (signature && channelSecret) {
        const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');
        if (hash !== signature) {
          console.error('❌ LINE Webhook 簽名驗證失敗。');
          return res.status(401).send('Unauthorized: Invalid signature');
        }
      }

      // 處理所有 LINE 事件
      Promise.all(req.body.events.map(event => handleEvent(event)))
        .then(() => res.status(200).send('OK'))
        .catch((err) => {
          console.error('❌ Webhook 處理失敗:', err);
          res.status(500).end(); 
        });
    });

    app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

    // === 資料庫初始化 ===
    // 這裡使用 infraModule.initializeDatabase() 明確引用，避免 this 上下文問題
    console.log('INFO: 正在初始化資料庫...');
    await infraModule.initializeDatabase(); 

    // === 啟動伺服器和定時任務 ===
    app.listen(PORT, () => {
      console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
      console.log(`Bot 版本: V4.5.4T (基礎設施模組化)`); // 更新版本號

      // 定時清理過期課程 (假設 cleanCoursesDB 依賴 pgClient)
      setInterval(() => infraModule.cleanCoursesDB(), ONE_DAY_IN_MS);
      // 定時檢查並發送提醒 (依賴 getAllCourses, getUser, push, formatDateTime)
      // 注意：formatDateTime 需要被正確地傳遞或引用
      // 這裡假設 formatDateTime 會在主程式中提供，或者在 infraModule 中有自己的版本
      setInterval(() => infraModule.checkAndSendReminders(getAllCourses, getUser, infraModule.push), REMINDER_CHECK_INTERVAL_MS);

      // Keep-alive 功能
      if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
        console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
        setInterval(() => {
            fetch(SELF_URL)
                .then(res => console.log(`Keep-alive response from ${SELF_URL}: ${res.status}`))
                .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
        }, PING_INTERVAL_MS);
      } else {
        console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
      }
    });
  },

  // === 資料庫初始化 ===
  async initializeDatabase() {
    try {
      await pgClient.connect();
      console.log('✅ 成功連接到 PostgreSQL 資料庫');

      await pgClient.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]')`);
      console.log('✅ 檢查並建立 users 表完成');

      await pgClient.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
      console.log('✅ 檢查並建立 courses 表完成');

      await pgClient.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
      console.log('✅ 檢查並建立 orders 表完成');

      const result = await pgClient.query("SELECT MAX(SUBSTRING(id FROM 2)::INTEGER) AS max_id FROM courses WHERE id LIKE 'C%'");
      let maxId = result.rows[0].max_id || 0;
      global.courseIdCounter = maxId + 1; // 課程 ID 計數器放在 global 方便主程式存取
      console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`);

      await infraModule.cleanCoursesDB(); // 首次資料庫清理，使用 infraModule.cleanCoursesDB()
      console.log('✅ 首次資料庫清理完成。');

    } catch (err) {
      console.error('❌ 資料庫初始化失敗:', err.message);
      process.exit(1); // 初始化失敗應退出程式
    }
  },

  // === 資料庫清理函式 ===
  async cleanCoursesDB() {
    try {
      const now = Date.now();
      await pgClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
      console.log('✅ 已清理過期課程。');
    } catch (err) {
      console.error('❌ 清理過期課程失敗:', err.message);
    }
  },

  // === Line 訊息發送工具函式 (reply, push) ===
  async reply(replyToken, content, menu = null) {
    let messages;
    if (Array.isArray(content)) {
      messages = content;
    } else if (typeof content === 'string') {
      messages = [{ type: 'text', text: content }];
    } else {
      messages = [content];
    }

    if (menu && messages.length > 0) {
      messages[0].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
    }

    try {
      await lineClient.replyMessage(replyToken, messages);
      console.log(`DEBUG: reply - 成功回覆訊息給 ${replyToken}`);
    } catch (error) {
      console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response : error.message);
      // 記錄更詳細的錯誤響應
      if (error.originalError && error.originalError.response && error.originalError.response.data) {
          console.error(`響應數據:`, error.originalError.response.data);
      }
    }
  },

  async push(to, content) {
    let messages;
    if (Array.isArray(content)) {
      messages = content;
    } else if (typeof content === 'string') {
      messages = [{ type: 'text', text: content }];
    } else if (typeof content === 'object' && content !== null && content.type) {
      messages = [content];
    } else {
      console.error(`WARN: push 函式收到不明內容，將發送預設錯誤訊息。`, content);
      messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
    }

    try {
      await lineClient.pushMessage(to, messages);
      console.log(`DEBUG: push - 成功推播訊息給 ${to}`);
    } catch (error) {
        // 增強錯誤日誌
        if (error.originalError && error.originalError.response) {
            console.error(`❌ push 函式發送失敗給 ${to}:`, 
                          `狀態碼: ${error.originalError.response.status},`,
                          `訊息: ${error.originalError.response.statusText},`);
            if (error.originalError.response.data) {
                console.error(`響應數據:`, error.originalError.response.data);
            }
        } else {
            console.error(`❌ push 函式發送失敗給 ${to}:`, error.message);
        }
    }
  },

  // === 自動提醒功能 ===
  // 需要從主程式傳入數據獲取函數和推送函數
  async checkAndSendReminders(getAllCoursesFunc, getUserFunc, pushFunc) {
    const now = Date.now();
    const courses = await getAllCoursesFunc();
    const usersRes = await pgClient.query('SELECT id, name FROM users');
    const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u]));

    // 時間格式化函數 (為了模組自洽，這裡也定義一份，但也可以從主程式傳入)
    const formatDateTime = (isoString) => {
        if (!isoString) return '無效時間';
        const date = new Date(isoString);
        const formatter = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
        const parts = formatter.formatToParts(date);
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        let weekday = parts.find(p => p.type === 'weekday').value;
        const hour = parts.find(p => p.type === 'hour').value;
        const minute = parts.find(p => p.type === 'minute').value;
        if (weekday.startsWith('週')) {
            weekday = weekday.slice(-1);
        }
        return `${month}-${day}（${weekday}）${hour}:${minute}`;
    };

    for (const id in courses) {
        const course = courses[id];
        const courseTime = new Date(course.time).getTime();
        const timeUntilCourse = courseTime - now;
        const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 提醒區間 (例如，提前 1 小時，且在提醒前 5 分鐘內)

        if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
            console.log(`🔔 準備發送課程提醒：${course.title}`);
            for (const studentId of course.students) {
                const student = dbUsersMap.get(studentId);
                if (student) {
                    try {
                        await pushFunc(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`);
                    } catch (e) {
                        console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
                    }
                }
            }
            sentReminders[id] = true; // 標記為已發送
        }
    }
    // 清理已發送提醒的標記，如果課程已經過期超過一天
    for (const id in sentReminders) {
        const course = courses[id];
        if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) {
            delete sentReminders[id];
        }
    }
  },
};

module.exports = infraModule; // 導出這個完整的模組物件
