// index.js - V3.16.2 (修正新增課程時間錯誤) - 進版

// --- 模組載入 ---
const express = require('express'); // Express 框架，用於建立網頁伺服器
const fs = require('fs');         // Node.js 檔案系統模組，用於讀寫檔案
const path = require('path');       // Node.js 路徑模組，用於處理檔案路徑
const line = require('@line/bot-sdk'); // LINE Bot SDK，用於與 LINE 平台互動
require('dotenv').config();       // 載入 .env 檔案中的環境變數，確保敏感資訊不外洩

// --- 應用程式常數定義 ---
const app = express();
const PORT = process.env.PORT || 3000; // 伺服器監聽埠號，優先使用環境變數 PORT，否則預設 3000

// 資料檔案路徑
const DATA_FILE = './data.json';     // 用戶資料檔案：儲存用戶點數、角色、歷史記錄等
const COURSE_FILE = './courses.json'; // 課程資料檔案：儲存課程資訊、預約名單、候補名單
const ORDER_FILE = './orders.json';   // 新增：購點訂單資料檔案
const BACKUP_DIR = './backup';       // 備份檔案存放目錄

// 設定與密碼 (從環境變數讀取，未設定則使用預設值)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527'; // 老師登入密碼
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/'; // Bot 自身的部署網址，用於 Keep-alive
const TEACHER_ID = process.env.TEACHER_ID; // 老師的 LINE User ID，用於發送通知 (可選，但建議設定)

// 時間相關常數
const ONE_DAY_IN_MS = 86400000; // 一天的毫秒數 (24 * 60 * 60 * 1000)
const PING_INTERVAL_MS = 1000 * 60 * 5; // Keep-alive 服務的間隔，5 分鐘
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 資料備份間隔，24 小時

// --- 購點方案定義 ---
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// --- 銀行匯款資訊 (可根據您的實際資訊修改) ---
const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
};


// --- 資料檔案與備份目錄初始化 ---
// 檢查並建立必要的資料檔案和備份目錄，確保應用程式啟動時環境就緒
if (!fs.existsSync(DATA_FILE)) {
  console.log(`ℹ️ 建立新的資料檔案: ${DATA_FILE}`);
  fs.writeFileSync(DATA_FILE, '{}', 'utf8'); // 指定 utf8 編碼
}
// 課程檔案初始化時，要確保包含 courseIdCounter
if (!fs.existsSync(COURSE_FILE)) {
  console.log(`ℹ️ 建立新的課程檔案: ${COURSE_FILE}`);
  fs.writeFileSync(COURSE_FILE, JSON.stringify({ courses: {}, courseIdCounter: 1 }, null, 2), 'utf8');
} else {
  // 如果檔案存在，讀取後檢查 courseIdCounter
  const coursesData = readJSON(COURSE_FILE);
  if (!coursesData.courseIdCounter) {
    coursesData.courseIdCounter = 1;
    writeJSON(COURSE_FILE, coursesData);
    console.log(`ℹ️ 為現有課程檔案添加 courseIdCounter。`);
  }
}
// 新增：訂單檔案初始化
if (!fs.existsSync(ORDER_FILE)) {
  console.log(`ℹ️ 建立新的訂單檔案: ${ORDER_FILE}`);
  fs.writeFileSync(ORDER_FILE, '{}', 'utf8');
}

if (!fs.existsSync(BACKUP_DIR)) {
  console.log(`ℹ️ 建立備份目錄: ${BACKUP_DIR}`);
  fs.mkdirSync(BACKUP_DIR);
}

// --- LINE Bot SDK 設定 ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config); // 建立 LINE Bot 客戶端實例，用於與 LINE 平台通訊

// --- 🛠️ 工具函式 ---
/**
 * 讀取 JSON 檔案內容並解析。
 * @param {string} file - 檔案路徑。
 * @returns {object} 解析後的 JSON 物件，如果檔案不存在或解析失敗則返回空物件。
 */
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // 如果檔案內容為空字串，則解析為空物件，避免 JSON.parse 錯誤
    return content ? JSON.parse(content) : {};
  } catch (error) {
    console.error(`❌ 讀取 JSON 檔案失敗: ${file}`, error.message);
    // 如果檔案不存在，則嘗試建立一個空 JSON
    if (error.code === 'ENOENT') {
      console.log(`ℹ️ 檔案不存在，將建立空檔案: ${file}`);
      // 特別處理 course_file，確保包含 courseIdCounter
      if (file === COURSE_FILE) {
        fs.writeFileSync(file, JSON.stringify({ courses: {}, courseIdCounter: 1 }, null, 2), 'utf8');
        return { courses: {}, courseIdCounter: 1 };
      }
      fs.writeFileSync(file, '{}', 'utf8');
      return {};
    }
    return {}; // 發生其他錯誤時返回空物件
  }
}

/**
 * 將資料寫入 JSON 檔案。
 * @param {string} file - 檔案路徑。
 * @param {object} data - 要寫入的資料物件。
 */
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); // 以 2 個空格縮排格式化 JSON，並指定 utf8 編碼
  } catch (error) {
    console.error(`❌ 寫入 JSON 檔案失敗: ${file}`, error.message);
  }
}

/**
 * 備份資料檔案。
 * 將 `data.json`, `courses.json` 和 `orders.json` 複製到備份目錄，並加上時間戳以區分。
 */
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 產生時間戳 (e.g., 2023-10-27T10-30-00-000Z)
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    fs.copyFileSync(ORDER_FILE, path.join(BACKUP_DIR, `orders_backup_${timestamp}.json`)); // 新增備份訂單檔案
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 資料備份失敗:', err.message);
  }
}

/**
 * 回覆 LINE 訊息。
 * @param {string} token - 回覆 Token。
 * @param {string|Object|Array<Object>} content - 要回覆的文字訊息、Flex Message 物件或多個訊息物件。
 * @param {Array<Object>} [menu=null] - 快速回覆選單項目。
 * @returns {Promise<any>} LINE Bot SDK 的回覆訊息 Promise。
 */
function reply(token, content, menu = null) {
  let msg;
  if (typeof content === 'string') {
    msg = { type: 'text', text: content };
  } else if (Array.isArray(content)) {
      msg = content; // 傳入多個訊息物件
  } else {
      msg = content; // 傳入單一訊息物件 (如 Flex Message)
  }

  if (menu) {
    // 如果 msg 是陣列，則只對第一個訊息添加 quickReply
    if (Array.isArray(msg)) {
      if (msg.length > 0 && msg[0].type === 'text') { // 確保是文字訊息才能加 quickReply
        msg[0].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
      }
    } else if (msg.type === 'text') { // 如果 msg 是單一文字訊息物件
      msg.quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
    }
  }
  return client.replyMessage(token, msg);
}


/**
 * 推送 LINE 訊息 (非回覆)。
 * 用於主動向用戶發送通知，例如課程取消通知、候補成功通知、購點通知等。
 * @param {string} to - 目標用戶 ID。
 * @param {string|Object|Array<Object>} content - 要推送的文字訊息、Flex Message 物件或多個訊息物件。
 * @returns {Promise<any>} LINE Bot SDK 的推送訊息 Promise。
 */
function push(to, content) {
  if (typeof content === 'string') {
    return client.pushMessage(to, { type: 'text', text: content });
  } else {
    return client.pushMessage(to, content);
  }
}

/**
 * 清理課程資料。
 * 移除過期（超過課程時間點一天）的課程，並確保 students 和 waiting 陣列存在。
 * @param {object} coursesData - 課程資料物件，包含 courses 和 courseIdCounter。
 * @returns {object} 清理後的課程資料物件。
 */
function cleanCourses(coursesData) {
  const now = Date.now(); // 當前時間戳
  const cleanedCourses = {}; // 用於存放清理後的課程

  if (!coursesData || !coursesData.courses) {
    return { courses: {}, courseIdCounter: coursesData.courseIdCounter || 1 };
  }

  for (const id in coursesData.courses) {
    const c = coursesData.courses[id];
    // 檢查基本結構完整性
    if (!c || !c.title || !c.time || typeof c.capacity === 'undefined') {
      console.warn(`⚠️ 發現無效課程資料，已移除 ID: ${id}`, c);
      continue; // 跳過此課程
    }

    // 確保 students 和 waiting 是陣列，若無則初始化為空陣列
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waiting)) c.waiting = [];

    // 檢查課程是否過期一天。
    // 課程時間點過期「之後」的 ONE_DAY_IN_MS (24小時) 才進行清理，
    // 這表示課程結束後會保留約 24 小時，方便老師查看當天或前一天的名單。
    if (new Date(c.time).getTime() < now - ONE_DAY_IN_MS) {
      console.log(`🗑️ 課程已過期並移除: ${c.title} (${formatDateTime(c.time)})`);
      continue; // 跳過此課程
    }
    cleanedCourses[id] = c; // 將有效且未過期的課程加入清理後的物件
  }
  return { courses: cleanedCourses, courseIdCounter: coursesData.courseIdCounter || 1 };
}

/**
 * 格式化 ISO 時間字串為台灣當地時間顯示格式。
 * @param {string} isoString - ISO 格式的日期時間字串 (e.g., "2023-10-27T02:30:00.000Z")。
 * @returns {string} 格式化後的日期時間字串 (e.g., "10-27 (五) 10:30")。
 */
function formatDateTime(isoString) {
  if (!isoString) return '無效時間';
  const date = new Date(isoString); // 解析 ISO 字串，這被視為 UTC 時間點

  // 使用 Intl.DateTimeFormat 進行格式化，指定 'Asia/Taipei' 時區
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short', // 'short' 會輸出 '週一', '週二'
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // 24 小時制
    timeZone: 'Asia/Taipei' // 指定台北時間
  });

  const formattedParts = formatter.formatToParts(date);
  const month = formattedParts.find(p => p.type === 'month').value;
  const day = formattedParts.find(p => p.type === 'day').value;
  let weekday = formattedParts.find(p => p.type === 'weekday').value;
  const hour = formattedParts.find(p => p.type === 'hour').value;
  const minute = formattedParts.find(p => p.type === 'minute').value;

  // 將 '週一' 等轉換為 '一'，更簡潔
  if (weekday.startsWith('週')) {
    weekday = weekday.slice(-1);
  }

  return `${month}-${day}（${weekday}）${hour}:${minute}`;
}


// --- 📋 快速選單定義 ---
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '課程名單', text: '@課程名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '購點確認', text: '@購點確認' }, // 老師功能變更
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// --- 📌 暫存狀態物件 (用於多步驟對話流程) ---
const pendingTeacherLogin = {};        // 儲存等待老師密碼輸入的用戶 ID
const pendingCourseCreation = {};      // 儲存新增課程流程的狀態和資料
const pendingCourseCancelConfirm = {}; // 儲存等待課程取消確認的用戶 ID 和課程 ID
const pendingPurchase = {};            // 新增：儲存學員購點流程的狀態和資料
const pendingManualAdjust = {};        // 新增：儲存老師手動調整點數流程的狀態


// --- 🎯 主事件處理函式 (處理所有 LINE 傳入的訊息和事件) ---
async function handleEvent(event) {
  const db = readJSON(DATA_FILE);
  let coursesData = cleanCourses(readJSON(COURSE_FILE)); // 每次處理前都清理一次課程
  const orders = readJSON(ORDER_FILE); // 讀取購點訂單資料

  const userId = event.source.userId;
  const replyToken = event.replyToken; // <--- 確保在函式開頭就定義 replyToken

  // 如果是新用戶，則在資料庫中建立其條目
  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
    console.log(`ℹ️ 新用戶加入: ${userId}`);
  }

  // 嘗試獲取用戶的顯示名稱 (用於紀錄和顯示)
  try {
    const profile = await client.getProfile(userId);
    // 更新用戶名稱，如果已有名稱則保留，避免覆蓋手動設定的名稱 (除非是匿名)
    if (!db[userId].name || db[userId].name === '匿名使用者') {
      db[userId].name = profile.displayName || '匿名使用者';
    }
  } catch (e) {
    console.error('❌ 取得用戶資料失敗:', e.message);
    // 即使失敗也應繼續，使用已有的或預設名稱
    if (!db[userId].name) {
      db[userId].name = '匿名使用者';
    }
  }
  writeJSON(DATA_FILE, db); // 更新用戶資料到檔案

  // 處理 Postback 事件 (例如來自快速選單或按鈕的資料回傳)
  if (event.type === 'postback') {
    const data = event.postback.data;
    // 課程取消確認流程
    if (data.startsWith('cancel_course_')) {
      const courseId = data.replace('cancel_course_', '');

      if (db[userId].role !== 'teacher') {
          return reply(replyToken, '您沒有權限執行此操作。');
      }

      const course = coursesData.courses[courseId];
      if (!course) {
        return reply(replyToken, '找不到該課程，可能已被取消或過期。', teacherMenu);
      }
      if (new Date(course.time) < new Date()) {
          return reply(replyToken, '該課程已過期，無法取消。', teacherMenu);
      }

      pendingCourseCancelConfirm[userId] = courseId;
      return reply(
        replyToken,
        `確認要取消課程「${course.title}」嗎？\n一旦取消將退還所有學生點數。`,
        [
          { type: 'message', label: '✅ 是', text: '✅ 是' },
          { type: 'message', label: '❌ 否', text: '❌ 否' },
        ]
      );
    }

    // 老師購點確認操作
    if (data.startsWith('confirm_order_') || data.startsWith('cancel_order_')) {
        const orderId = data.split('_')[2];
        const action = data.split('_')[0]; // 'confirm' or 'cancel'

        if (db[userId].role !== 'teacher') {
            return reply(replyToken, '您沒有權限執行此操作。');
        }

        const order = orders[orderId];
        if (!order || order.status !== 'pending_confirmation') {
            return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', teacherMenu);
        }

        const studentUser = db[order.userId];
        if (!studentUser) {
            return reply(replyToken, `找不到購點學員 (ID: ${order.userId}) 的資料。`, teacherMenu);
        }

        if (action === 'confirm') {
            studentUser.points += order.points; // 增加點數
            studentUser.history.push({
                action: `購買點數成功：${order.points} 點`,
                time: new Date().toISOString(),
                orderId: orderId
            });
            order.status = 'completed'; // 標記為完成
            writeJSON(DATA_FILE, db);
            writeJSON(ORDER_FILE, orders);

            // 通知老師和學員
            await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, teacherMenu);
            await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。請查詢您的「剩餘點數」。`)
                .catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));

        } else if (action === 'cancel') {
            order.status = 'cancelled'; // 標記為取消
            writeJSON(ORDER_FILE, orders);
            await reply(replyToken, `❌ 已取消訂單 ${orderId} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, teacherMenu);
            // 不主動通知學員，由老師負責聯繫
        }
        return; // 處理完畢
    }
  }


  // 只處理文字訊息事件
  if (event.type !== 'message' || !event.message.text) return;

  const text = event.message.text.trim(); // 獲取用戶發送的訊息文字

  // --- 🔹 多步驟新增課程流程處理 ---
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];
    switch (stepData.step) {
      case 1: // 接收課程名稱
        stepData.data.title = text;
        stepData.step = 2;
        return reply(replyToken, '請選擇課程日期（星期幾）：', [
          { type: 'message', label: '星期一', text: '星期一' },
          { type: 'message', label: '星期二', text: '星期二' },
          { type: 'message', label: '星期三', text: '星期三' },
          { type: 'message', label: '星期四', text: '星期四' },
          { type: 'message', label: '星期五', text: '星期五' },
          { type: 'message', label: '星期六', text: '星期六' },
          { type: 'message', label: '星期日', text: '星期日' },
        ]);

      case 2: // 接收課程星期
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        if (!weekdays.includes(text)) {
          return reply(replyToken, '請輸入正確的星期（例如：星期一）');
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）');

      case 3: // 接收課程時間
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) { // 正則表達式驗證 24 小時制時間格式
          return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return reply(replyToken, '請輸入人員上限（正整數）');

      case 4: // 接收課程人數上限
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return reply(replyToken, '人數上限必須是正整數。');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        // 確認訊息
        return reply(
          replyToken,
          `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}`,
          [
            { type: 'message', label: '✅ 是', text: '確認新增課程' },
            { type: 'message', label: '❌ 否', text: '取消新增課程' },
          ]
        );

      case 5: // 確認新增或取消
        if (text === '確認新增課程') {
          const weekdaysMapping = {
            '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3,
            '星期四': 4, '星期五': 5, '星期六': 6
          };

          const targetWeekdayIndex = weekdaysMapping[stepData.data.weekday]; // 目標是台北的星期幾 (0-6)
          const [targetHour, targetMin] = stepData.data.time.split(':').map(Number); // 目標是台北的小時和分鐘

          // --- 修正後的時區處理邏輯：確保課程時間正確儲存為 UTC ---
          const now = new Date(); // 當前 UTC 時間
          // 獲取當前台北時間的偏移量 (例如，台灣是 +8)
          // 這裡不能直接用 new Date().getTimezoneOffset() 因為它是基於伺服器當地時區
          // 而應該基於目標時區 'Asia/Taipei'
          const taipeiOffset = -new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei", hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' }).indexOf(':') === -1 ? 0 : 480; // 台灣是 UTC+8，偏移量是 -480 分鐘 (480*60*1000 ms)

          // 創建一個基於 UTC 的日期，並調整到台北的日期和時間
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 今天的 UTC 日期
          const todayWeekdayUTC = today.getUTCDay(); // 今天的 UTC 星期幾

          let dayDiff = (targetWeekdayIndex - todayWeekdayUTC + 7) % 7; // 計算相對今天 UTC 的天數差

          // 判斷如果目標是"今天"，但台北時間已過，則順延一週
          // 這裡需要用台北時間判斷，所以需要考慮偏移
          const currentTaipeiTime = new Date(now.getTime() + taipeiOffset * 60 * 1000); // 將當前 UTC 時間加上台北時區偏移，得到台北時間
          const currentHourTaipei = currentTaipeiTime.getUTCHours(); // 獲取偏移後的 UTC 小時，即台北時間的小時
          const currentMinuteTaipei = currentTaipeiTime.getUTCMinutes(); // 獲取偏移後的 UTC 分鐘，即台北時間的分鐘

          if (dayDiff === 0) {
              if (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin)) {
                  dayDiff = 7; // 目標時間已過，設定為下週
              }
          }

          // 構建一個表示目標時間在台北時區的 Date 物件
          const courseDateTaipei = new Date(today.getTime() + dayDiff * ONE_DAY_IN_MS); // 先調整到目標日期 (仍然是 UTC 零點)
          courseDateTaipei.setUTCHours(targetHour - (taipeiOffset / 60), targetMin, 0, 0); // 將目標台北時間轉換為 UTC 時間再設定

          const isoTime = courseDateTaipei.toISOString(); // 儲存為 UTC 的 ISO 字串
          // --- 時區處理修正結束 ---

          // 產生課程 ID (使用計數器確保唯一性)
          const newId = `C${String(coursesData.courseIdCounter).padStart(3, '0')}`;
          coursesData.courseIdCounter++; // 計數器遞增

          coursesData.courses[newId] = {
            title: stepData.data.title,
            time: isoTime, // 儲存為 ISO UTC 時間
            capacity: stepData.data.capacity,
            students: [], // 初始化預約學生列表
            waiting: [],  // 初始化候補學生列表
          };

          writeJSON(COURSE_FILE, coursesData); // 寫入課程資料
          delete pendingCourseCreation[userId]; // 清除暫存狀態

          // 顯示時，formatDateTime 會自動將 isoTime 轉回正確的台北時間
          return reply(
            event.replyToken,
            `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}\n課程 ID: ${newId}`,
            teacherMenu
          );

        } else if (text === '取消新增課程') {
          delete pendingCourseCreation[userId];
          return reply(replyToken, '已取消新增課程。', teacherMenu);
        } else {
          return reply(replyToken, '請點選「✅ 是」或「❌ 否」確認。');
        }

      default: // 未知的步驟，重置流程
        delete pendingCourseCreation[userId];
        return reply(replyToken, '流程異常，已重置。', teacherMenu);
    }
  }

  // --- ✅ 課程取消確認流程處理 ---
  if (pendingCourseCancelConfirm[userId]) {
    const courseId = pendingCourseCancelConfirm[userId];

    // 重新讀取課程資料，確保是最新的
    let coursesDataConfirm = readJSON(COURSE_FILE);
    const course = coursesDataConfirm.courses[courseId];

    if (text === '✅ 是') {
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return reply(replyToken, '找不到該課程，取消失敗或已被刪除。', teacherMenu);
      }

      const dbData = readJSON(DATA_FILE); // 重新讀取用戶資料以進行點數退還

      // 退還所有已預約學生的點數並通知
      course.students.forEach(stuId => {
        if (dbData[stuId]) {
          dbData[stuId].points++; // 退還 1 點
          dbData[stuId].history.push({
            id: courseId,
            action: `課程取消退點：${course.title}`,
            time: new Date().toISOString(),
          });
          // 通知學生課程已取消並退點
          push(stuId, `您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，已退還 1 點。請確認您的「剩餘點數」。`)
            .catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
        }
      });

      // 清理候補名單中的用戶歷史記錄（可選，但保持一致性）
      course.waiting.forEach(waitId => {
        if (dbData[waitId]) {
            dbData[waitId].history.push({
                id: courseId,
                action: `候補課程取消：${course.title}`,
                time: new Date().toISOString(),
            });
            // 通知候補者課程已取消
            push(waitId, `您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`)
                .catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
        }
      });

      delete coursesDataConfirm.courses[courseId]; // 從課程列表中移除該課程
      writeJSON(COURSE_FILE, coursesDataConfirm);
      writeJSON(DATA_FILE, dbData); // 更新用戶資料
      delete pendingCourseCancelConfirm[userId]; // 清除暫存狀態
      return reply(replyToken, `課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);
    }

    if (text === '❌ 否') {
      delete pendingCourseCancelConfirm[userId]; // 清除暫存狀態
      return reply(replyToken, '取消課程操作已中止。', teacherMenu);
    }

    // 提示用戶選擇
    return reply(replyToken, '請選擇是否取消課程：', [
      { type: 'message', label: '✅ 是', text: '✅ 是' },
      { type: 'message', label: '❌ 否', text: '❌ 否' },
    ]);
  }

  // --- 🔐 老師手動調整點數流程處理 ---
  if (pendingManualAdjust[userId]) {
    const stepData = pendingManualAdjust[userId];

    // 預期輸入格式： 學員ID/姓名 數量
    const parts = text.split(' ');
    if (parts.length !== 2) {
        return reply(replyToken, '指令格式錯誤，請輸入：[學員ID/姓名] [數量] (正數加點，負數扣點)', teacherMenu);
    }

    const targetIdentifier = parts[0]; // 可以是 userId 或部分名稱
    const amount = parseInt(parts[1]);

    if (isNaN(amount) || amount === 0) {
        return reply(replyToken, '點數數量必須是非零整數。', teacherMenu);
    }

    let foundUserId = null;
    let foundUserName = null;

    // 嘗試透過完整 ID 查找
    if (db[targetIdentifier] && db[targetIdentifier].role === 'student') {
        foundUserId = targetIdentifier;
        foundUserName = db[targetIdentifier].name;
    } else {
        // 嘗試透過名稱部分匹配查找
        for (const id in db) {
            const user = db[id];
            // 確保是學生角色，且名稱包含關鍵字 (忽略大小寫)
            if (user.role === 'student' && user.name && user.name.toLowerCase().includes(targetIdentifier.toLowerCase())) {
                // 如果有多個匹配，只取第一個
                foundUserId = id;
                foundUserName = user.name;
                break;
            }
        }
    }

    if (!foundUserId) {
        delete pendingManualAdjust[userId]; // 清除狀態
        return reply(replyToken, `找不到學員：${targetIdentifier}。請確認學員 ID 或姓名是否正確。`, teacherMenu);
    }

    const operation = amount > 0 ? '加點' : '扣點';
    const absAmount = Math.abs(amount);
    let currentPoints = db[foundUserId].points;
    let newPoints = currentPoints + amount;

    if (operation === '扣點' && currentPoints < absAmount) {
        delete pendingManualAdjust[userId]; // 清除狀態
        return reply(replyToken, `學員 ${foundUserName} 點數不足，無法扣除 ${absAmount} 點 (目前 ${currentPoints} 點)。`, teacherMenu);
    }

    db[foundUserId].points = newPoints;
    db[foundUserId].history.push({
        action: `老師手動${operation} ${absAmount} 點`,
        time: new Date().toISOString(),
        by: userId // 記錄操作的老師 ID
    });
    writeJSON(DATA_FILE, db);

    // 通知學員點數變動
    push(foundUserId,
      `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${newPoints}點。`
    ).catch(e => console.error(`❌ 通知學員 ${foundUserId} 點數變動失敗:`, e.message));

    delete pendingManualAdjust[userId]; // 清除狀態
    return reply(replyToken, `✅ 已成功為學員 ${foundUserName} ${operation} ${absAmount} 點，目前點數：${newPoints} 點。`, teacherMenu);
  }

  // --- 學生購點流程處理 ---
  if (pendingPurchase[userId]) {
      const stepData = pendingPurchase[userId];

      switch (stepData.step) {
          case 'select_plan': // 學員選擇購買方案
              const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
              if (!selectedPlan) {
                  return reply(replyToken, '請從列表中選擇有效的點數方案。', studentMenu);
              }
              stepData.data = {
                  points: selectedPlan.points,
                  amount: selectedPlan.amount,
                  userId: userId,
                  userName: db[userId].name,
                  timestamp: new Date().toISOString(),
                  status: 'pending_payment' // 標記為等待支付
              };
              stepData.step = 'confirm_purchase';
              return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
                  { type: 'message', label: '✅ 確認購買', text: '✅ 確認購買' },
                  { type: 'message', label: '❌ 取消', text: '❌ 取消購買' },
              ]);

          case 'confirm_purchase': // 學員確認購買
              if (text === '✅ 確認購買') {
                  // 生成訂單 ID
                  const orderId = `O${Date.now()}`; // 簡單的時間戳 ID
                  stepData.data.orderId = orderId;
                  orders[orderId] = stepData.data; // 將訂單存入 orders 物件
                  writeJSON(ORDER_FILE, orders);

                  delete pendingPurchase[userId]; // 清除學員購點流程狀態

                  return reply(replyToken,
                      `✅ 已確認購買 ${stepData.data.points} 點，請先完成轉帳或匯款。\n\n` +
                      `戶名：${BANK_INFO.accountName}\n` +
                      `銀行：${BANK_INFO.bankName}\n` +
                      `帳號：${BANK_INFO.accountNumber}\n\n` +
                      `完成轉帳後，請再次進入「點數查詢」>「購買紀錄」並輸入您的匯款帳號後五碼以供核對。\n\n` +
                      `您的訂單編號為：${orderId}` // 告知訂單ID，方便後續查詢
                      , studentMenu);

              } else if (text === '❌ 取消購買') {
                  delete pendingPurchase[userId];
                  return reply(replyToken, '已取消購買點數。', studentMenu);
              } else {
                  return reply(replyToken, '請點選「✅ 確認購買」或「❌ 取消」。', studentMenu);
              }
      }
  }


  // --- 🔁 身份切換指令處理 ---
  if (text === '@切換身份') {
    if (db[userId].role === 'teacher') {
      db[userId].role = 'student'; // 老師切換為學員
      writeJSON(DATA_FILE, db);
      return reply(event.replyToken, '已切換為學員身份。', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true; // 進入老師登入流程
      return reply(event.replyToken, '請輸入老師密碼登入。');
    }
  }

  // --- 🔐 老師登入密碼驗證 ---
  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher'; // 驗證成功，設定為老師角色
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId]; // 清除暫存狀態
      return reply(replyToken, '老師登入成功。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId]; // 清除暫存狀態
      return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
    }
  }

  // --- 🔀 根據用戶身份導向不同的指令處理函式 ---
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, coursesData.courses, orders); // 傳入 coursesData.courses 和 orders
  } else {
    // --- 💎 點數查詢功能分流 (@點數) ---
    if (msg === '@點數') {
      const pointMenu = [
        { type: 'message', label: '剩餘點數', text: '@剩餘點數' },
        { type: 'message', label: '購買點數', text: '@購買點數' },
        { type: 'message', label: '購買紀錄', text: '@購買紀錄' },
      ];
      return reply(replyToken, '請選擇點數相關功能：', pointMenu);
    }

    // --- 查詢剩餘點數 (@剩餘點數) ---
    if (msg === '@剩餘點數') {
      return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
    }

    // --- 購買點數流程 (@購買點數) ---
    if (msg === '@購買點數') {
      // 檢查是否有進行中的購買流程，防止重複開啟
      const pendingOrder = Object.values(orders).find(order =>
        order.userId === userId && order.status === 'pending_payment'
      );

      if (pendingOrder) {
        return reply(replyToken,
          `您有一筆待完成的購點訂單 (ID: ${pendingOrder.orderId})，請先完成匯款並至「購買紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
          [
            { type: 'message', label: '❌ 取消購買', text: '❌ 取消購買' } // 提供取消選項
          ]
        );
      }


      // 進入選擇方案步驟
      pendingPurchase[userId] = { step: 'select_plan', data: {} };
      const planOptions = PURCHASE_PLANS.map(plan => ({
        type: 'message',
        label: plan.label,
        text: plan.label // 讓用戶直接點選方案名稱
      }));
      return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
    }

    // --- 取消購買點數 (學員主動發送) ---
    if (msg === '❌ 取消購買') {
      // 檢查是否有待完成的購點流程
      const pendingOrder = Object.values(orders).find(order =>
        order.userId === userId && order.status === 'pending_payment'
      );
      if (pendingOrder) {
        // 從 orders 中移除這筆待支付的訂單
        delete orders[pendingOrder.orderId];
        writeJSON(ORDER_FILE, orders);
        delete pendingPurchase[userId]; // 清除狀態
        return reply(replyToken, '已取消您的購點訂單。', studentMenu);
      }
      // 如果沒有待處理的購點流程，則只清除 pendingPurchase 狀態 (以防萬一)
      if (pendingPurchase[userId]) {
        delete pendingPurchase[userId];
      }
      return reply(replyToken, '沒有待取消的購點訂單。', studentMenu);
    }

    // --- 購買紀錄功能 (@購買紀錄) ---
    if (msg === '@購買紀錄') {
      // 檢查是否有尚未輸入後五碼的購點訂單
      const pendingOrder = Object.values(orders).find(order =>
        order.userId === userId && order.status === 'pending_payment'
      );

      if (pendingOrder) {
        pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.orderId } };
        return reply(replyToken, `您的訂單 ${pendingOrder.orderId} 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
          { type: 'message', label: '取消輸入', text: '❌ 取消輸入後五碼' }
        ]);
      }

      // 如果沒有待輸入後五碼的訂單，則顯示歷史記錄
      if (!user.history || user.history.length === 0) {
        return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
      }

      let historyMessage = '以下是你的點數記錄：\n';
      // 顯示最近的 5 筆記錄
      user.history.slice(-5).reverse().forEach(record => { // reverse() 讓最新記錄顯示在最上面
        historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
      return reply(replyToken, historyMessage.trim(), studentMenu);
    }

    // --- 處理學員輸入匯款後五碼 (在 @購買紀錄 流程中) ---
    if (pendingPurchase[userId] && pendingPurchase[userId].step === 'input_last5') {
      const orderId = pendingPurchase[userId].data.orderId;
      const last5Digits = text.trim();

      if (!/^\d{5}$/.test(last5Digits)) {
        return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
      }

      const order = orders[orderId];
      if (!order || order.status !== 'pending_payment') {
        delete pendingPurchase[userId]; // 訂單狀態不對，清除狀態
        return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
      }

      order.last5Digits = last5Digits;
      order.status = 'pending_confirmation'; // 狀態改為等待老師確認
      writeJSON(ORDER_FILE, orders); // 更新訂單檔案

      delete pendingPurchase[userId]; // 清除學員的狀態

      // 通知學員已收到後五碼
      await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);

      // 通知老師有新的購點訂單待確認
      if (TEACHER_ID) {
        await push(TEACHER_ID, `🔔 有新的購點訂單待確認！請輸入 @購點確認 進入管理介面。`)
          .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
      } else {
        console.warn('⚠️ TEACHER_ID 未設定，無法通知老師新的購點訂單。');
      }
      return; // 處理完畢
    }

    // --- 處理取消輸入後五碼的訊息 ---
    if (msg === '❌ 取消輸入後五碼') {
      if (pendingPurchase[userId]?.step === 'input_last5') {
        delete pendingPurchase[userId];
        return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
      } else {
        return reply(replyToken, '目前沒有需要取消的輸入流程。', studentMenu);
      }
    }

    // --- 預約課程功能 ---
    if (msg === '@預約課程' || msg === '@預約') {
      // 篩選未來的課程，並按時間排序
      const upcoming = Object.entries(coursesData.courses)
        .filter(([, c]) => new Date(c.time) > new Date())
        .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

      if (upcoming.length === 0) {
        return reply(replyToken, '目前沒有可預約的課程。', studentMenu);
      }

      // 構建課程列表的快速回覆項目
      const quickReplyItems = upcoming.map(([id, c]) => {
        // 構建按鈕的顯示文字，確保日期時間優先顯示，然後是課程名稱，並截斷到 20 字
        const labelText = `${formatDateTime(c.time)} ${c.title}`;
        return {
          type: 'action',
          action: {
            type: 'message',
            label: labelText.slice(0, 20), // 限制 label 長度 (LINE 最多 20 字)
            text: `我要預約 ${id}`, // 實際發送的指令，包含課程 ID
          },
        };
      });

      // 在回覆中增加一個引導語
      const introText = '以下是目前可以預約的課程，點擊即可預約並扣除 1 點。';

      // 使用 client.replyMessage 發送包含文字和 QuickReply 的訊息
      return client.replyMessage(replyToken, {
        type: 'text',
        text: introText,
        quickReply: {
          items: quickReplyItems,
        },
      });
    }

    // --- ✅ 執行預約課程 (接收來自選單的 `我要預約 [ID]` 指令) ---
    if (msg.startsWith('我要預約 ')) {
      const courseId = msg.replace('我要預約 ', '').trim();
      const course = coursesData.courses[courseId];

      if (!course) {
        return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
      }

      if (new Date(course.time) < new Date()) {
        return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
      }

      // 再次確保 students 和 waiting 陣列存在
      if (!Array.isArray(course.students)) course.students = [];
      if (!Array.isArray(course.waiting)) course.waiting = [];

      if (course.students.includes(userId)) {
        return reply(replyToken, '你已經預約此課程了。', studentMenu);
      }

      if (course.waiting.includes(userId)) {
        return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
      }

      if (user.points <= 0) {
        return reply(replyToken, '你的點數不足，請先購買點數。', studentMenu);
      }

      if (course.students.length < course.capacity) {
        // 課程有空位，直接預約
        course.students.push(userId);
        db[userId].points--; // 扣除點數
        db[userId].history.push({ id: courseId, action: `預約成功：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
        writeJSON(COURSE_FILE, coursesData); // 確保回寫 courseIdCounter
        writeJSON(DATA_FILE, db);
        return reply(replyToken, `已成功預約課程：「${course.title}」。`, studentMenu);
      } else {
        // 課程額滿，加入候補名單
        course.waiting.push(userId);
        db[userId].history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
        writeJSON(COURSE_FILE, coursesData); // 確保回寫 courseIdCounter
        writeJSON(DATA_FILE, db); // 雖然候補不扣點，但也更新 db 確保 history 寫入
        return reply(replyToken, `該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣點。`, studentMenu);
      }
    }

    // --- 📖 我的課程功能 ---
    if (msg === '@我的課程') {
      const now = Date.now();
      // 篩選學生已預約且尚未過期的課程
      const enrolledCourses = Object.entries(coursesData.courses)
        .filter(([, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now)
        .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

      // 篩選學生候補中且尚未過期的課程
      const waitingCourses = Object.entries(coursesData.courses)
        .filter(([, c]) => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
        .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

      let replyMessage = '';

      if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
        return reply(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
      }

      if (enrolledCourses.length > 0) {
        replyMessage += '✅ 你已預約的課程：\n';
        enrolledCourses.forEach(([, c]) => {
          replyMessage += `・${c.title} - ${formatDateTime(c.time)}\n`;
        });
        replyMessage += '\n'; // 預約課程和候補課程之間留一個空行
      }

      if (waitingCourses.length > 0) {
        replyMessage += '⏳ 你候補中的課程：\n';
        waitingCourses.forEach(([, c]) => {
          const waitingIndex = c.waiting.indexOf(userId) + 1; // 候補順位 (從 1 開始)
          replyMessage += `・${c.title} - ${formatDateTime(c.time)} (目前候補第 ${waitingIndex} 位)\n`;
        });
      }

      return reply(replyToken, replyMessage.trim(), studentMenu);
    }

    // --- ❌ 取消已預約課程（含自動候補轉正） ---
    if (msg === '@取消預約') {
      // 只列出未來的、已預約的課程
      const enrolled = Object.entries(coursesData.courses).filter(([id, c]) =>
        c.students.includes(userId) && new Date(c.time) > new Date()
      ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

      if (enrolled.length === 0) {
        return reply(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
      }

      return reply(replyToken, '請選擇要取消的預約課程：', enrolled.map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
          text: `我要取消預約 ${id}`, // 回傳指令包含課程 ID
        },
      })));
    }

    // --- 執行取消預約 (由快速選單觸發) ---
    if (msg.startsWith('我要取消預約 ')) { // 修正為 '我要取消預約 ' 確保與選單文字一致
      const id = msg.replace('我要取消預約 ', '').trim();
      const course = coursesData.courses[id];
      if (!course || !course.students.includes(userId)) {
        return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
      }
      // 檢查課程是否已過期
      if (new Date(course.time) < new Date()) {
        return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
      }

      // 從課程中移除學生
      course.students = course.students.filter(sid => sid !== userId);
      db[userId].points++; // 退還點數
      db[userId].history.push({ id, action: `取消預約退點：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史

      let replyMessage = `課程「${course.title}」已取消，已退還 1 點。`;

      // 🔁 嘗試從候補名單補上 (如果有人取消預約，則嘗試將候補者轉正)
      if (course.waiting.length > 0 && course.students.length < course.capacity) {
        const nextWaitingUserId = course.waiting[0]; // 獲取第一個候補者，但不移除
        if (db[nextWaitingUserId] && db[nextWaitingUserId].points > 0) {
          course.waiting.shift(); // 移除第一個候補者
          course.students.push(nextWaitingUserId); // 候補者轉正
          db[nextWaitingUserId].points--; // 扣除候補者的點數
          db[nextWaitingUserId].history.push({ id, action: `候補補上：${course.title}`, time: new Date().toISOString() }); // 記錄歷史

          // 通知候補者已補上課程
          push(nextWaitingUserId,
            `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 1 點。請確認你的「我的課程」。`
          ).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));

          replyMessage += '\n有候補學生已遞補成功。';
        } else if (db[nextWaitingUserId]) {
          // 如果候補者點數不足
          const studentName = db[nextWaitingUserId].name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
          replyMessage += `\n候補學生 ${studentName} 點數不足，未能遞補。已將其從候補名單移除。`; // 點數不足直接移除
          course.waiting.shift(); // 從候補名單中移除
          console.log(`⚠️ 候補學生 ${studentName} (ID: ${nextWaitingUserId}) 點數不足，未能遞補，已從候補名單移除。`);
          // 可以考慮通知老師此情況
          if (TEACHER_ID) {
            push(TEACHER_ID,
              `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足，未能遞補。已自動從候補名單移除該學生。`
            ).catch(e => console.error('❌ 通知老師失敗', e.message));
          } else {
            console.warn('⚠️ TEACHER_ID 未設定，無法通知老師點數不足的候補情況。');
          }
        } else {
          // 如果候補用戶資料不存在 (不應發生)
          course.waiting.shift(); // 移除無效的候補者
          replyMessage += '\n候補名單中存在無效用戶，已移除。';
        }
      } else if (course.waiting.length > 0 && course.students.length >= course.capacity) {
          replyMessage += '\n課程空出一位，但候補名單仍需等待。'; // 更正語句
      }


      writeJSON(COURSE_FILE, coursesData); // 確保回寫 courseIdCounter
      writeJSON(DATA_FILE, db);
      return reply(replyToken, replyMessage, studentMenu);
    }

    // --- ❌ 取消候補 ---
    if (msg === '@取消候補') {
      // 篩選未來的、已在候補名單中的課程
      const waitingCourses = Object.entries(coursesData.courses).filter(([, c]) =>
        c.waiting?.includes(userId) && new Date(c.time) > new Date()
      ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

      if (waitingCourses.length === 0) {
        return reply(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
      }

      // 提供選單讓使用者選擇取消哪個候補
      return reply(replyToken, '請選擇要取消候補的課程：', waitingCourses.map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
          text: `我要取消候補 ${id}`,
        },
      })));
    }

    // --- 執行取消候補 (由快速選單觸發) ---
    if (msg.startsWith('我要取消候補 ')) {
      const id = msg.replace('我要取消候補 ', '').trim();
      const course = coursesData.courses[id];
      if (!course || !course.waiting?.includes(userId)) {
        return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
      }
      if (new Date(course.time) < new Date()) { // 檢查課程是否已過期
        return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
      }
      course.waiting = course.waiting.filter(x => x !== userId); // 從候補名單中移除
      db[userId].history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
      writeJSON(COURSE_FILE, coursesData); // 確保回寫 courseIdCounter
      writeJSON(DATA_FILE, db); // 更新用戶歷史
      return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
    }

    // --- 預設回覆，提示用戶使用選單 ---
    return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
  }
}

// ====================== 👨‍🏫 老師功能處理 ===========================
async function handleTeacherCommands(event, userId, db, courses, orders) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken; // 確保在子函式中也從 event 獲取 replyToken

  // --- 📋 查詢課程名單 ---
  if (msg === '@課程名單') {
    if (Object.keys(courses).length === 0) {
      return reply(replyToken, '目前沒有任何課程。', teacherMenu);
    }

    let list = '📋 已建立課程列表：\n\n';
    // 按照時間排序課程，讓老師更容易查看未來的課程
    const sortedCourses = Object.entries(courses).sort(([, cA], [, cB]) => {
      return new Date(cA.time).getTime() - new Date(cB.time).getTime();
    });

    sortedCourses.forEach(([courseId, c]) => {
      list += `🗓 ${formatDateTime(c.time)}｜${c.title}\n`;
      list += `👥 上限 ${c.capacity}｜✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n`;
      list += `課程 ID: ${courseId}\n\n`; // 顯示課程 ID 方便取消或管理
    });

    return reply(replyToken, list.trim(), teacherMenu);
  }

  // --- ➕ 新增課程 ---
  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} }; // 初始化新增課程流程狀態
    return reply(replyToken, '請輸入課程名稱。');
  }

  // --- ❌ 取消課程 (提供選單模式) ---
  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date()) // 只列出未來的課程
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime()) // 按時間排序
      .map(([id, c]) => ({
        id,
        label: `${formatDateTime(c.time)} ${c.title}`,
      }));

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有可取消的課程。', teacherMenu);
    }

    // 使用 Quick Reply 顯示課程列表供選擇
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲取消的課程：',
      quickReply: {
        items: upcomingCourses.map(c => ({
          type: 'action',
          action: {
            type: 'postback', // 使用 postback 傳回 ID，不直接顯示給用戶
            label: c.label.slice(0, 20), // LINE Quick Reply label 最多 20 字
            data: `cancel_course_${c.id}`, // Postback 資料包含課程 ID
          },
        })),
      },
    });
  }

  // --- 🧾 手動輸入取消課程 ID (備用模式) ---
  if (msg.startsWith('@取消課程 ')) { // 注意指令後有空格
    const parts = msg.split(' ');
    const courseId = parts[1];
    if (!courseId) {
      return reply(replyToken, '請輸入要取消的課程 ID，例如：@取消課程 C001', teacherMenu); // 修正範例 ID
    }
    if (!courses[courseId]) {
      return reply(replyToken, '找不到該課程 ID，請確認是否已被刪除或已過期。', teacherMenu);
    }
    if (new Date(courses[courseId].time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法取消。', teacherMenu);
    }

    pendingCourseCancelConfirm[userId] = courseId; // 進入取消課程確認流程
    return reply(replyToken,
      `確認取消課程「${courses[courseId].title}」嗎？`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]);
  }

  // --- 老師購點確認主介面 (@購點確認) ---
  if (msg === '@購點確認') {
      const teacherPointMenu = [
          { type: 'message', label: '待確認清單', text: '@待確認清單' },
          { type: 'message', label: '手動調整', text: '@手動調整點數' },
      ];
      return reply(replyToken, '請選擇購點確認功能：', teacherPointMenu);
  }

  // --- 老師查看待確認購點清單 (@待確認清單) ---
  if (msg === '@待確認清單') {
      const pendingOrders = Object.values(orders).filter(order => order.status === 'pending_confirmation');

      if (pendingOrders.length === 0) {
          return reply(replyToken, '目前沒有待確認的購點訂單。', teacherMenu);
      }

      let replyMessages = [];
      let quickReplyItems = [];

      pendingOrders.forEach(order => {
          const orderDate = formatDateTime(order.timestamp).split(' ')[0]; // 只取日期部分
          replyMessages.push(
              `訂單ID: ${order.orderId}\n` +
              `📅 購買日期：${orderDate}\n` +
              `👤 學員名稱：${order.userName}\n` +
              `💎 購買點數：${order.points} 點\n` +
              `💰 應付金額：${order.amount} 元\n` +
              `💳 匯款後五碼：${order.last5Digits}\n` +
              `--------------------`
          );
          quickReplyItems.push({
              type: 'action',
              action: {
                  type: 'postback', // 使用 postback 傳回 ID 和動作
                  label: `✅ 購點確認 ${order.orderId.substring(0,6)}`, // 限制label長度
                  data: `confirm_order_${order.orderId}`,
                  displayText: `確認訂單 ${order.orderId}` // 顯示給用戶的文字
              }
          });
          quickReplyItems.push({
            type: 'action',
            action: {
                type: 'postback',
                label: `❌ 取消訂單 ${order.orderId.substring(0,6)}`, // 限制label長度
                data: `cancel_order_${order.orderId}`,
                displayText: `取消訂單 ${order.orderId}`
            }
        });
      });

      // 將多個訂單訊息合併為一個長字串，或者使用多個訊息物件（取決於LINE API限制和可讀性）
      // 由於 Quick Reply 只能加在單一文字訊息上，且訊息長度有限，這裡會發送一個訊息，並將所有訂單資訊拼接起來
      // 如果訂單過多，可能需要考慮 Flex Message 或分頁
      let finalMessage = '📋 待確認購點訂單列表：\n\n' + replyMessages.join('\n');

      return reply(replyToken, finalMessage.trim(), quickReplyItems); // 將 quickReplyItems 作為第三個參數傳入
  }

  // --- 老師手動調整點數功能 (@手動調整點數) ---
  if (msg === '@手動調整點數') {
      pendingManualAdjust[userId] = true; // 進入手動調整流程
      return reply(replyToken, '請輸入要調整的學員ID/姓名和點數數量 (正數為加點，負數為扣點)，例如：小明 +5 或 Uxxxxxx -3');
  }

  // --- ✨ 查詢學員功能（改為：若無查詢字串則列出所有學員）---
  if (msg.startsWith('@查學員')) {
    const parts = msg.split(' ');
    const query = parts[1]; // 可以是 userId 或部分名稱

    let foundUsers = [];
    // 如果沒有提供查詢字串 (只有 `@查學員`)，則列出所有學生（非老師角色）
    if (!query) {
      for (const id in db) {
        if (db[id].role === 'student') { // 只列出角色為 'student' 的用戶
          foundUsers.push({ id, ...db[id] });
        }
      }
      // 依姓名排序
      foundUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      if (foundUsers.length === 0) {
        return reply(replyToken, '目前沒有任何已註冊的學員。', teacherMenu);
      }

      let replyMsg = `📋 所有學員列表 📋\n\n`;
      foundUsers.forEach(user => {
        replyMsg += `姓名：${user.name || '匿名使用者'}\n`;
        replyMsg += `ID：${user.id.substring(0, 8)}...\n`; // 截斷 ID 顯示，保護隱私
        replyMsg += `點數：${user.points}\n`;
        replyMsg += `\n`; // 每位學員間隔空行
      });
      return reply(replyToken, replyMsg.trim(), teacherMenu);

    } else { // 如果有提供查詢字串 (例如 `@查學員 Uxxxx` 或 `@查學員 小明`)，則進行搜尋
      for (const id in db) {
        const user = db[id];
        // 搜尋匹配完整 ID 或名稱中的部分關鍵字
        if (id === query || (user.name && user.name.toLowerCase().includes(query.toLowerCase()))) {
          foundUsers.push({ id, ...user });
        }
      }

      if (foundUsers.length === 0) {
        return reply(replyToken, `找不到符合「${query}」的學員。`, teacherMenu);
      }

      let replyMsg = `找到以下學員：\n\n`;
      foundUsers.forEach(user => {
        replyMsg += `姓名：${user.name || '匿名使用者'}\n`;
        replyMsg += `ID：${user.id}\n`; // 搜尋結果顯示完整 ID
        replyMsg += `點數：${user.points}\n`;
        replyMsg += `身份：${user.role === 'teacher' ? '老師' : '學員'}\n`;
        if (user.history && user.history.length > 0) {
          replyMsg += `近期操作：\n`;
          // 顯示最近的 3 筆操作記錄
          user.history.slice(-3).forEach(h => {
            replyMsg += `  - ${h.action} (${formatDateTime(h.time)})\n`;
          });
        }
        replyMsg += '\n'; // 每位學員間隔空行
      });
      return reply(replyToken, replyMsg.trim(), teacherMenu);
    }
  }

  // --- ✨ 統計報表功能 (簡單版) ---
  if (msg === '@統計報表') {
    let totalPoints = 0;
    let totalStudents = 0;
    let totalTeachers = 0;
    let activeStudents = 0;
    let coursesCount = Object.keys(courses).length;
    let enrolledStudentsCount = 0; // 預約人數
    let waitingStudentsCount = 0; // 候補人數

    // 遍歷所有用戶統計數據
    for (const userId in db) {
      const user = db[userId];
      if (user.role === 'student') {
        totalStudents++;
        totalPoints += user.points;
        if (user.points > 0) {
          activeStudents++; // 點數大於 0 視為活躍學員
        }
      } else if (user.role === 'teacher') {
        totalTeachers++;
      }
    }

    // 遍歷所有課程統計預約和候補人數
    for (const courseId in courses) {
      const course = courses[courseId];
      enrolledStudentsCount += course.students.length;
      waitingStudentsCount += course.waiting.length;
    }


    let report = `📊 系統統計報表 📊\n\n`;
    report += `👤 總學員數：${totalStudents}\n`;
    report += `👨‍🏫 總老師數：${totalTeachers}\n`;
    report += `💎 學員總點數：${totalPoints}\n`;
    report += `✨ 活躍學員數（有點數）：${activeStudents}\n`;
    report += `📚 課程總數：${coursesCount}\n`;
    report += `👥 預約總人次：${enrolledStudentsCount}\n`;
    report += `🕒 候補總人次：${waitingStudentsCount}\n\n`;

    return reply(replyToken, report, teacherMenu);
  }

  // --- 預設回覆，提示老師使用選單 ---
  return reply(replyToken, '指令無效，請使用選單或輸入正確指令。', teacherMenu);
}

// ====================== LINE Webhook 與伺服器啟動 ===========================

// 設定 Webhook 路由，接收來自 LINE 的訊息
app.post('/webhook', line.middleware(config), (req, res) => {
  // 遍歷所有事件並調用 handleEvent 處理
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK')) // 處理成功，返回 200 OK
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.message);
      res.status(500).end(); // 處理失敗，返回 500 Internal Server Error
    });
});

// 🩺 健康檢查路由，用於檢查 Bot 服務是否正常運行
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 🚀 啟動伺服器與 Keep-alive 機制
app.listen(PORT, () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V3.16.2 (修正新增課程時間錯誤)`);

  // 應用程式啟動時執行一次資料備份
  backupData();
  // 設定定時備份任務
  setInterval(backupData, BACKUP_INTERVAL_MS); // 每 24 小時備份一次

  // Keep-alive pinging to prevent dyno sleep on Free Tier hosting (e.g., Heroku, Render)
  // 如果 SELF_URL 環境變數已設定且不是預設值，則啟用 Keep-alive
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    fetch(SELF_URL)
      .then(res => console.log(`Keep-alive response: ${res.status}`))
      .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
  } else {
    console.warn('⚠️ SELF_URL 未設定或使用預設值，Keep-alive 功能可能無法防止服務休眠。請在 .env 檔案中設定您的部署網址。');
  }
});

// ====================== 👩‍🎓 學員功能處理 ===========================
async function handleStudentCommands(event, user, db, courses, orders) {
  const msg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken; // 確保在子函式中也從 event 獲取 replyToken

  // --- 📅 預約課程功能 ---
  if (msg === '@預約課程' || msg === '@預約') {
    // 篩選未來的課程，並按時間排序
    const upcoming = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date())
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcoming.length === 0) {
      return reply(replyToken, '目前沒有可預約的課程。', studentMenu);
    }

    // 構建課程列表的快速回覆項目
    const quickReplyItems = upcoming.map(([id, c]) => {
      // 構建按鈕的顯示文字，確保日期時間優先顯示，然後是課程名稱，並截斷到 20 字
      const labelText = `${formatDateTime(c.time)} ${c.title}`;
      return {
        type: 'action',
        action: {
          type: 'message',
          label: labelText.slice(0, 20), // 限制 label 長度 (LINE 最多 20 字)
          text: `我要預約 ${id}`, // 實際發送的指令，包含課程 ID
        },
      };
    });

    // 在回覆中增加一個引導語
    const introText = '以下是目前可以預約的課程，點擊即可預約並扣除 1 點。';

    // 使用 client.replyMessage 發送包含文字和 QuickReply 的訊息
    return client.replyMessage(replyToken, {
      type: 'text',
      text: introText,
      quickReply: {
        items: quickReplyItems,
      },
    });
  }

  // --- ✅ 執行預約課程 (接收來自選單的 `我要預約 [ID]` 指令) ---
  if (msg.startsWith('我要預約 ')) {
    const courseId = msg.replace('我要預約 ', '').trim();
    const course = courses[courseId];

    if (!course) {
      return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    }

    if (new Date(course.time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
    }

    // 再次確保 students 和 waiting 陣列存在
    if (!Array.isArray(course.students)) course.students = [];
    if (!Array.isArray(course.waiting)) course.waiting = [];

    if (course.students.includes(userId)) {
      return reply(replyToken, '你已經預約此課程了。', studentMenu);
    }

    if (course.waiting.includes(userId)) {
      return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    }

    if (user.points <= 0) {
      return reply(replyToken, '你的點數不足，請先購買點數。', studentMenu);
    }

    if (course.students.length < course.capacity) {
      // 課程有空位，直接預約
      course.students.push(userId);
      db[userId].points--; // 扣除點數
      db[userId].history.push({ id: courseId, action: `預約成功：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
      writeJSON(COURSE_FILE, { courses, courseIdCounter: readJSON(COURSE_FILE).courseIdCounter }); // 確保回寫 courseIdCounter
      writeJSON(DATA_FILE, db);
      return reply(replyToken, `已成功預約課程：「${course.title}」。`, studentMenu);
    } else {
      // 課程額滿，加入候補名單
      course.waiting.push(userId);
      db[userId].history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
      writeJSON(COURSE_FILE, { courses, courseIdCounter: readJSON(COURSE_FILE).courseIdCounter }); // 確保回寫 courseIdCounter
      writeJSON(DATA_FILE, db); // 雖然候補不扣點，但也更新 db 確保 history 寫入
      return reply(replyToken, `該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣點。`, studentMenu);
    }
  }

  // --- 📖 我的課程功能 ---
  if (msg === '@我的課程') {
    const now = Date.now();
    // 篩選學生已預約且尚未過期的課程
    const enrolledCourses = Object.entries(courses)
      .filter(([, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    // 篩選學生候補中且尚未過期的課程
    const waitingCourses = Object.entries(courses)
      .filter(([, c]) => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    let replyMessage = '';

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
    }

    if (enrolledCourses.length > 0) {
      replyMessage += '✅ 你已預約的課程：\n';
      enrolledCourses.forEach(([, c]) => {
        replyMessage += `・${c.title} - ${formatDateTime(c.time)}\n`;
      });
      replyMessage += '\n'; // 預約課程和候補課程之間留一個空行
    }

    if (waitingCourses.length > 0) {
      replyMessage += '⏳ 你候補中的課程：\n';
      waitingCourses.forEach(([, c]) => {
        const waitingIndex = c.waiting.indexOf(userId) + 1; // 候補順位 (從 1 開始)
        replyMessage += `・${c.title} - ${formatDateTime(c.time)} (目前候補第 ${waitingIndex} 位)\n`;
      });
    }

    return reply(replyToken, replyMessage.trim(), studentMenu);
  }

  // --- ❌ 取消已預約課程（含自動候補轉正） ---
  if (msg === '@取消預約') {
    // 只列出未來的、已預約的課程
    const enrolled = Object.entries(courses).filter(([id, c]) =>
      c.students.includes(userId) && new Date(c.time) > new Date()
    ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (enrolled.length === 0) {
      return reply(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
    }

    return reply(replyToken, '請選擇要取消的預約課程：', enrolled.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消預約 ${id}`, // 回傳指令包含課程 ID
      },
    })));
  }

  // --- 執行取消預約 (由快速選單觸發) ---
  if (msg.startsWith('我要取消預約 ')) { // 修正為 '我要取消預約 ' 確保與選單文字一致
    const id = msg.replace('我要取消預約 ', '').trim();
    const course = courses[id];
    if (!course || !course.students.includes(userId)) {
      return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    // 檢查課程是否已過期
    if (new Date(course.time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    }

    // 從課程中移除學生
    course.students = course.students.filter(sid => sid !== userId);
    db[userId].points++; // 退還點數
    db[userId].history.push({ id, action: `取消預約退點：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史

    let replyMessage = `課程「${course.title}」已取消，已退還 1 點。`;

    // 🔁 嘗試從候補名單補上 (如果有人取消預約，則嘗試將候補者轉正)
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting[0]; // 獲取第一個候補者，但不移除
      if (db[nextWaitingUserId] && db[nextWaitingUserId].points > 0) {
        course.waiting.shift(); // 移除第一個候補者
        course.students.push(nextWaitingUserId); // 候補者轉正
        db[nextWaitingUserId].points--; // 扣除候補者的點數
        db[nextWaitingUserId].history.push({ id, action: `候補補上：${course.title}`, time: new Date().toISOString() }); // 記錄歷史

        // 通知候補者已補上課程
        push(nextWaitingUserId,
          `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 1 點。請確認你的「我的課程」。`
        ).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));

        replyMessage += '\n有候補學生已遞補成功。';
      } else if (db[nextWaitingUserId]) {
        // 如果候補者點數不足
        const studentName = db[nextWaitingUserId].name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 ${studentName} 點數不足，未能遞補。已將其從候補名單移除。`; // 點數不足直接移除
        course.waiting.shift(); // 從候補名單中移除
        console.log(`⚠️ 候補學生 ${studentName} (ID: ${nextWaitingUserId}) 點數不足，未能遞補，已從候補名單移除。`);
        // 可以考慮通知老師此情況
        if (TEACHER_ID) {
          push(TEACHER_ID,
            `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足，未能遞補。已自動從候補名單移除該學生。`
          ).catch(e => console.error('❌ 通知老師失敗', e.message));
        } else {
          console.warn('⚠️ TEACHER_ID 未設定，無法通知老師點數不足的候補情況。');
        }
      } else {
        // 如果候補用戶資料不存在 (不應發生)
        course.waiting.shift(); // 移除無效的候補者
        replyMessage += '\n候補名單中存在無效用戶，已移除。';
      }
    } else if (course.waiting.length > 0 && course.students.length >= course.capacity) {
        replyMessage += '\n課程空出一位，但候補名單仍需等待。'; // 更正語句
    }


    writeJSON(COURSE_FILE, { courses, courseIdCounter: readJSON(COURSE_FILE).courseIdCounter }); // 確保回寫 courseIdCounter
    writeJSON(DATA_FILE, db);
    return reply(replyToken, replyMessage, studentMenu);
  }

  // --- ❌ 取消候補 ---
  if (msg === '@取消候補') {
    // 篩選未來的、已在候補名單中的課程
    const waitingCourses = Object.entries(courses)
      .filter(([, c]) =>
        c.waiting?.includes(userId) && new Date(c.time) > new Date()
      ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
    }

    // 提供選單讓使用者選擇取消哪個候補
    return reply(replyToken, '請選擇要取消候補的課程：', waitingCourses.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消候補 ${id}`,
      },
    })));
  }

  // --- 執行取消候補 (由快速選單觸發) ---
  if (msg.startsWith('我要取消候補 ')) {
    const id = msg.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time) < new Date()) { // 檢查課程是否已過期
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId); // 從候補名單中移除
    db[userId].history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    writeJSON(COURSE_FILE, { courses, courseIdCounter: readJSON(COURSE_FILE).courseIdCounter }); // 確保回寫 courseIdCounter
    writeJSON(DATA_FILE, db); // 更新用戶歷史
    return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
  }

  // --- 💎 點數查詢功能分流 (@點數) ---
  if (msg === '@點數') {
    const pointMenu = [
      { type: 'message', label: '剩餘點數', text: '@剩餘點數' },
      { type: 'message', label: '購買點數', text: '@購買點數' },
      { type: 'message', label: '購買紀錄', text: '@購買紀錄' },
    ];
    return reply(replyToken, '請選擇點數相關功能：', pointMenu);
  }

  // --- 查詢剩餘點數 (@剩餘點數) ---
  if (msg === '@剩餘點數') {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  // --- 購買點數流程 (@購買點數) ---
  if (msg === '@購買點數') {
    // 檢查是否有進行中的購買流程，防止重複開啟
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );

    if (pendingOrder) {
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.orderId})，請先完成匯款並至「購買紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
        [
          { type: 'message', label: '❌ 取消購買', text: '❌ 取消購買' } // 提供取消選項
        ]
      );
    }


    // 進入選擇方案步驟
    pendingPurchase[userId] = { step: 'select_plan', data: {} };
    const planOptions = PURCHASE_PLANS.map(plan => ({
      type: 'message',
      label: plan.label,
      text: plan.label // 讓用戶直接點選方案名稱
    }));
    return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
  }

  // --- 取消購買點數 (學員主動發送) ---
  if (msg === '❌ 取消購買') {
    // 檢查是否有待完成的購點流程
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );
    if (pendingOrder) {
      // 從 orders 中移除這筆待支付的訂單
      delete orders[pendingOrder.orderId];
      writeJSON(ORDER_FILE, orders);
      delete pendingPurchase[userId]; // 清除狀態
      return reply(replyToken, '已取消您的購點訂單。', studentMenu);
    }
    // 如果沒有待處理的購點流程，則只清除 pendingPurchase 狀態 (以防萬一)
    if (pendingPurchase[userId]) {
      delete pendingPurchase[userId];
    }
    return reply(replyToken, '沒有待取消的購點訂單。', studentMenu);
  }

  // --- 購買紀錄功能 (@購買紀錄) ---
  if (msg === '@購買紀錄') {
    // 檢查是否有尚未輸入後五碼的購點訂單
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.orderId } };
      return reply(replyToken, `您的訂單 ${pendingOrder.orderId} 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
        { type: 'message', label: '取消輸入', text: '❌ 取消輸入後五碼' }
      ]);
    }

    // 如果沒有待輸入後五碼的訂單，則顯示歷史記錄
    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    }

    let historyMessage = '以下是你的點數記錄：\n';
    // 顯示最近的 5 筆記錄
    user.history.slice(-5).reverse().forEach(record => { // reverse() 讓最新記錄顯示在最上面
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
  }

  // --- 處理學員輸入匯款後五碼 (在 @購買紀錄 流程中) ---
  if (pendingPurchase[userId] && pendingPurchase[userId].step === 'input_last5') {
    const orderId = pendingPurchase[userId].data.orderId;
    const last5Digits = text.trim();

    if (!/^\d{5}$/.test(last5Digits)) {
      return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
    }

    const order = orders[orderId];
    if (!order || order.status !== 'pending_payment') {
      delete pendingPurchase[userId]; // 訂單狀態不對，清除狀態
      return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
    }

    order.last5Digits = last5Digits;
    order.status = 'pending_confirmation'; // 狀態改為等待老師確認
    writeJSON(ORDER_FILE, orders); // 更新訂單檔案

    delete pendingPurchase[userId]; // 清除學員的狀態

    // 通知學員已收到後五碼
    await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);

    // 通知老師有新的購點訂單待確認
    if (TEACHER_ID) {
      await push(TEACHER_ID, `🔔 有新的購點訂單待確認！請輸入 @購點確認 進入管理介面。`)
        .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
    } else {
      console.warn('⚠️ TEACHER_ID 未設定，無法通知老師新的購點訂單。');
    }
    return; // 處理完畢
  }

  // --- 處理取消輸入後五碼的訊息 ---
  if (msg === '❌ 取消輸入後五碼') {
    if (pendingPurchase[userId]?.step === 'input_last5') {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    } else {
      return reply(replyToken, '目前沒有需要取消的輸入流程。', studentMenu);
    }
  }

  // --- 預設回覆，提示用戶使用選單 ---
  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}
