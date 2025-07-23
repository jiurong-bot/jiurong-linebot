// index.js - V4.1.0 (整合所有修正與優化 - 已針對取消課程 400 錯誤加強偵錯與防護)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Client } = require('pg'); // 引入 pg 模組的 Client
const line = require('@line/bot-sdk');
require('dotenv').config(); // 載入 .env 檔案中的環境變數 (Render 會自動注入)
const crypto = require('crypto'); // 用於手動驗證 LINE 簽名，增強健壯性
const fetch = require('node-fetch'); // <--- 修正：明確引入 node-fetch，以確保 fetch 函式可用

// =====================================
//               應用程式常數
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 資料庫連接設定
// 從環境變數 DATABASE_URL 取得連接字串
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 對於 Render 或 Neon，通常需要設定為 false 以接受自簽憑證
  }
});

// 設定與密碼 (從環境變數讀取，未設定則使用預設值)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID; // 從環境變數獲取老師 ID

// 時間相關常數
const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5; // 每 5 分鐘 ping 一次
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 每 5 分鐘檢查一次提醒

// 購點方案定義
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// 銀行匯款資訊 (可根據您的實際資訊修改)
const BANK_INFO = {
  accountName: '湯心怡', // 請替換成您的戶名
  bankName: '中國信托（882）', // 請替換成您的銀行名稱和代碼
  accountNumber: '012540278393', // 請替換成您的銀行帳號
};

// 指令常數 (避免硬編碼字串)
const COMMANDS = {
  SWITCH_ROLE: '@切換身份',
  TEACHER: {
    MAIN_MENU: '@返回老師主選單',
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '@返回點數管理',
  },
  STUDENT: {
    MAIN_MENU: '@返回學員主選單',
    POINTS: '@點數',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購買紀錄',
    CANCEL_PURCHASE: '❌ 取消購買',
    CANCEL_INPUT_LAST5: '❌ 取消輸入後五碼',
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
    CONFIRM_YES: '✅ 是',
    CONFIRM_NO: '❌ 否',
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    RETURN_POINTS_MENU: '返回點數功能',
    CONFIRM_BUY_POINTS: '✅ 確認購買',
  }
};

// =====================================
//        資料庫初始化與工具函式
// =====================================

/**
 * 連接到 PostgreSQL 資料庫並建立必要的資料表。
 */
async function initializeDatabase() {
  try {
    await pgClient.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');

    // 建立 users 表
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        points INTEGER DEFAULT 0,
        role VARCHAR(50) DEFAULT 'student',
        history JSONB DEFAULT '[]' -- 儲存 JSON 陣列
      );
    `);
    console.log('✅ 檢查並建立 users 表完成');

    // 建立 courses 表
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        time TIMESTAMPTZ NOT NULL, -- 帶時區的時間戳
        capacity INTEGER NOT NULL,
        points_cost INTEGER NOT NULL,
        students TEXT[] DEFAULT '{}', -- 儲存學生 LINE ID 陣列
        waiting TEXT[] DEFAULT '{}'   -- 儲存候補學生 LINE ID 陣列
      );
    `);
    console.log('✅ 檢查並建立 courses 表完成');

    // 建立 orders 表
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        points INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        last_5_digits VARCHAR(5),
        status VARCHAR(50) NOT NULL, -- pending_payment, pending_confirmation, completed, cancelled
        timestamp TIMESTAMPTZ NOT NULL
      );
    `);
    console.log('✅ 檢查並建立 orders 表完成');

    // 檢查並更新 courseIdCounter (從資料庫獲取最大 ID)
    const result = await pgClient.query("SELECT MAX(SUBSTRING(id FROM 2)::INTEGER) AS max_id FROM courses WHERE id LIKE 'C%'");
    let maxId = result.rows[0].max_id || 0;
    // 將 courseIdCounter 儲存在一個全域變數中，每次新增課程時遞增
    // 為了與舊有邏輯兼容，我們在記憶體中維護這個計數器
    global.courseIdCounter = maxId + 1;
    console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`);

    // *** 在所有資料表建立並初始化後，執行首次清理 ***
    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。');
    // *************************************************

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
    // 如果資料庫無法初始化，則終止應用程式
    // 為了更好地處理 Render 的自動重啟，這裡不直接 process.exit(1)
    // 而是允許應用程式啟動，但後續操作會失敗，方便調試
    // 通常 Render 會基於健康檢查來判斷是否重啟
    // 如果資料庫連接失敗，最好讓應用程式啟動，並在每個 DB 操作前檢查連接狀態
  }
}

// 應用程式啟動時呼叫資料庫初始化
initializeDatabase();


/**
 * 讀取單個用戶資料。
 * @param {string} userId - 用戶 ID。
 * @returns {object|null} 用戶資料物件，如果不存在則為 null。
 */
async function getUser(userId) {
  const res = await pgClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  const userData = res.rows[0];
  if (userData && typeof userData.history === 'string') {
    userData.history = JSON.parse(userData.history); // 反序列化 history 欄位
  }
  return userData;
}

/**
 * 寫入或更新單個用戶資料。
 * @param {object} user - 用戶資料物件。
 */
async function saveUser(user) {
  const existingUser = await getUser(user.id);
  // 確保 history 欄位在儲存前是 JSON 字串
  const historyJson = JSON.stringify(user.history || []);
  if (existingUser) {
    await pgClient.query(
      'UPDATE users SET name = $1, points = $2, role = $3, history = $4 WHERE id = $5',
      [user.name, user.points, user.role, historyJson, user.id]
    );
  } else {
    await pgClient.query(
      'INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.name, user.points, user.role, historyJson, user.id] // <--- 修正: 這裡應該是 [user.id, user.name, user.points, user.role, historyJson]
    );
  }
}

/**
 * 讀取所有課程資料。
 * @returns {object} 課程資料物件 (以 ID 為鍵的物件)。
 */
async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    // 將資料庫中的 snake_case 轉換為 camelCase
    courses[row.id] = {
      id: row.id,
      title: row.title,
      time: row.time.toISOString(), // 確保時間是 ISO 格式
      capacity: row.capacity,
      pointsCost: row.points_cost, // 注意這裡從 snake_case 轉換
      students: row.students || [],
      waiting: row.waiting || []
    };
  });
  return courses;
}

/**
 * 儲存單個課程資料。
 * @param {object} course - 課程資料物件。
 */
async function saveCourse(course) {
  const existingCourse = await pgClient.query('SELECT id FROM courses WHERE id = $1', [course.id]);
  if (existingCourse.rows.length > 0) {
    await pgClient.query(
      'UPDATE courses SET title = $1, time = $2, capacity = $3, points_cost = $4, students = $5, waiting = $6 WHERE id = $7',
      [course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.id]
    );
  } else {
    await pgClient.query(
      'INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]
    );
  }
}

/**
 * 刪除單個課程。
 * @param {string} courseId - 課程 ID。
 */
async function deleteCourse(courseId) {
  await pgClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
}


/**
 * 讀取所有訂單資料。
 * @returns {object} 訂單資料物件 (以 order_id 為鍵的物件)。
 */
async function getAllOrders() {
  const res = await pgClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { // 注意：資料庫欄位是 snake_case
      orderId: row.order_id,
      userId: row.user_id,
      userName: row.user_name,
      points: row.points,
      amount: row.amount,
      last5Digits: row.last_5_digits,
      status: row.status,
      timestamp: row.timestamp.toISOString()
    };
  });
  return orders;
}

/**
 * 儲存單個訂單資料。
 * @param {object} order - 訂單資料物件。
 */
async function saveOrder(order) {
  const existingOrder = await pgClient.query('SELECT order_id FROM orders WHERE order_id = $1', [order.orderId]);
  if (existingOrder.rows.length > 0) {
    await pgClient.query(
      'UPDATE orders SET user_id = $1, user_name = $2, points = $3, amount = $4, last_5_digits = $5, status = $6, timestamp = $7 WHERE order_id = $8',
      [order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp, order.orderId]
    );
  } else {
    await pgClient.query(
      'INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]
    );
  }
}

/**
 * 刪除單個訂單。
 * @param {string} orderId - 訂單 ID。
 */
async function deleteOrder(orderId) {
  await pgClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}


/**
 * 清理課程資料 (從資料庫中移除過期課程)。
 */
async function cleanCoursesDB() {
  const now = Date.now(); // 使用 Date.now() 獲取毫秒數
  // 刪除課程時間點過期一天以上的課程
  await pgClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
}


// 其他工具函式 (reply, push, formatDateTime 等保持不變)
/**
 * 回覆 LINE 訊息。
 * @param {string} replyToken - 回覆 Token。
 * @param {string|Object|Array<Object>} content - 要回覆的文字訊息、Flex Message 物件或多個訊息物件。
 * @param {Array<Object>} [menu=null] - 快速回覆選單項目。
 * @returns {Promise<any>} LINE Bot SDK 的回覆訊息 Promise。
*/
async function reply(replyToken, content, menu = null) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else { // 假設是 Line Message Object (例如帶 quickReply 的 text 訊息)
    messages = [content];
  }

  // 僅對第一個文字訊息應用 quickReply
  if (menu && messages.length > 0 && messages[0].type === 'text') {
    messages[0].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
  }
  return client.replyMessage(replyToken, messages);
}

/**
 * 推送 LINE 訊息 (非回覆)。
 * 用於主動向用戶發送通知，例如課程取消通知、候補成功通知、購點通知等。
 * @param {string} to - 目標用戶 ID。
 * @param {string|Object|Array<Object>} content - 要推送的文字訊息、Flex Message 物件或多個訊息物件。
 * @returns {Promise<any>} LINE Bot SDK 的推送訊息 Promise。
 */
async function push(to, content) {
  const messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  return client.pushMessage(to, messages);
}

/**
 * 格式化 ISO 時間字串為台灣當地時間顯示格式。
 * @param {string} isoString - ISO 格式的日期時間字串 (e.g., "2023-10-27T02:30:00.000Z").
 * @returns {string} 格式化後的日期時間字串 (e.g., "10-27 (五) 10:30").
 */
function formatDateTime(isoString) {
  if (!isoString) return '無效時間';
  const date = new Date(isoString);

  const formatter = new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei'
  });

  const formattedParts = formatter.formatToParts(date);
  const month = formattedParts.find(p => p.type === 'month').value;
  const day = formattedParts.find(p => p.type === 'day').value;
  let weekday = formattedParts.find(p => p.type === 'weekday').value;
  const hour = formattedParts.find(p => p.type === 'hour').value;
  const minute = formattedParts.find(p => p.type === 'minute').value;

  if (weekday.startsWith('週')) {
    weekday = weekday.slice(-1); // 將 '星期一' 變成 '一'
  }

  return `${month}-${day}（${weekday}）${hour}:${minute}`;
}


// =====================================
//               📋 快速選單定義 (保持不變)
// =====================================
const studentMenu = [
  { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
  { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
  { type: 'message', label: '點數功能', text: COMMANDS.STUDENT.POINTS },
  { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE },
];

const studentPointSubMenu = [
  { type: 'message', label: '剩餘點數', text: COMMANDS.STUDENT.CHECK_POINTS },
  { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS },
  { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY },
  { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU },
];

const teacherCourseSubMenu = [
  { type: 'message', label: '課程列表', text: COMMANDS.TEACHER.COURSE_LIST },
  { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE },
  { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];

const teacherPointSubMenu = [
  { type: 'message', label: '待確認訂單', text: COMMANDS.TEACHER.PENDING_ORDERS },
  { type: 'message', label: '手動加減點', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];

const teacherMenu = [
  { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
  { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
  { type: 'message', label: '查詢學員', text: COMMANDS.TEACHER.SEARCH_STUDENT },
  { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
  { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE },
];


// =====================================
//      📌 暫存狀態物件 (用於多步驟對話流程)
// =====================================
// 這些暫存狀態在服務重啟時會清空，但它們只用於單次對話流程，不是持久資料。
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const sentReminders = {}; // 用於追蹤已發送的提醒，避免重複發送

// 處理取消課程的確認步驟狀態，改為全域變數，並確保其初始化
global.confirmingCancelCourse = {};


// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
/**
 * 處理老師身份下的所有指令。
 * @param {object} event - LINE 事件物件。
 * @param {string} userId - 用戶 ID。
 */
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : ''; // 確保 text 存在

  // 每次操作前從資料庫獲取最新資料，確保操作的是最新數據
  const user = await getUser(userId); // 獲取當前老師用戶
  const courses = await getAllCourses(); // 獲取所有課程
  const orders = await getAllOrders(); // 獲取所有訂單

  // --- 返回主選單/子選單指令處理 ---
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    // <--- 修正: 如果正在取消課程確認中，返回課程管理也應清除該狀態
    if (global.confirmingCancelCourse[userId]) {
        delete global.confirmingCancelCourse[userId];
        console.log(`DEBUG: 從取消課程確認狀態返回課程管理，已清除狀態。`);
    }
    return reply(replyToken, '請選擇課程管理功能：', teacherCourseSubMenu);
  }
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    return reply(replyToken, '請選擇點數管理功能：', teacherPointSubMenu);
  }

  // --- 新增課程指令 ---
  if (text === COMMANDS.TEACHER.ADD_COURSE) {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return reply(replyToken, '請輸入課程名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); // 用學生端的取消指令
  }

  // --- 取消課程指令 ---
  if (text === COMMANDS.TEACHER.CANCEL_COURSE) {
    const now = Date.now();
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcomingCourses.length === 0) {
      console.log('DEBUG: 取消課程 - 沒有可取消的未來課程。'); // 新增除錯日誌
      return reply(replyToken, '目前沒有可取消的未來課程。', teacherCourseSubMenu);
    }

    // 限制顯示的課程數量，避免快速回覆按鈕過多
    const displayCourses = upcomingCourses.slice(0, 10); // 只顯示最近的 10 門課程

    const quickReplyItems = displayCourses.map(c => {
        const labelText = `${formatDateTime(c.time)} ${c.title}`;
        const label = labelText.slice(0, 20); // <--- 修正：確保 label 不超過 20 字元

        // 確保 displayText 也是安全長度，並且用於 Postback 動作的 displayText
        // 實際上是給 LINE 平台顯示在用戶聊天記錄中的文本，限制為 200 字元。
        // 但由於這裡用作 quickReply，最好也限制在合理長度。
        const displayText = `取消課程：${labelText}`.slice(0, 50); // <--- 修正：限制 displayText 長度，避免過長

        // 偵錯：列印即將生成的按鈕資訊
        console.log(`DEBUG: Generating quickReply item for course ${c.id}:`);
        console.log(`  Label: "${label}" (length: ${label.length})`);
        console.log(`  Data: "cancel_course_confirm_${c.id}" (length: ${(`cancel_course_confirm_${c.id}`).length})`);
        console.log(`  DisplayText: "${displayText}" (length: ${displayText.length})`);

        return {
            type: 'action',
            action: {
                type: 'postback',
                label: label,
                data: `cancel_course_confirm_${c.id}`,
                displayText: displayText
            },
        };
    });
    quickReplyItems.push({ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT });

    try {
        console.log(`DEBUG: 準備回覆帶有 ${quickReplyItems.length} 個快速回覆按鈕的訊息。`); // 新增除錯日誌
        // <--- 修正: 確保 quickReply.items 數組不超過 13 個
        return reply(replyToken, {
            type: 'text',
            text: '請選擇要取消的課程：\n\n💡 若課程名稱過長會自動截斷。', // 提示用戶名稱可能截斷
            quickReply: { items: quickReplyItems.slice(0, 13) }
        });
    } catch (error) {
        console.error('❌ 在生成取消課程快速回覆時發生錯誤:', error.message); // 捕捉錯誤
        // <--- 修正: 打印更詳細的錯誤信息
        if (error.originalError && error.originalError.response) {
            console.error('LINE API 響應:', error.originalError.response.data);
        }
        // 如果此處發生錯誤，說明 quickReply 結構或內容有問題
        return reply(replyToken, '生成取消課程選項時發生錯誤，請稍後再試或聯繫管理員。', teacherCourseSubMenu);
    }
  }

  // --- 課程列表 (老師查看) ---
  if (text === COMMANDS.TEACHER.COURSE_LIST) {
    const now = Date.now();
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有未來的課程。', teacherCourseSubMenu);
    }

    let replyMessage = '📋 已建立課程列表：\n\n';
    upcomingCourses.forEach(c => {
      // 課程 ID 不再顯示給老師
      replyMessage += `🗓 ${formatDateTime(c.time)}｜${c.title}\n`;
      replyMessage += `💰 扣點：${c.pointsCost} 點｜👥 上限 ${c.capacity}\n`;
      replyMessage += `✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n\n`;
    });

    return reply(replyToken, replyMessage.trim(), teacherCourseSubMenu);
  }

  // --- 查詢學員指令 (@查學員) ---
  if (text.startsWith(COMMANDS.TEACHER.SEARCH_STUDENT + ' ')) {
    const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT + ' ', '').trim();
    if (!query) {
      return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }

    let foundUser = null;

    // 嘗試透過完整 ID 查找
    const userById = await getUser(query);
    if (userById && userById.role === 'student') { // 確保查到的是學生
        foundUser = userById;
    }

    if (!foundUser) {
        // 嘗試透過名稱部分匹配查找
        // 使用 LOWER() 進行不區分大小寫的匹配，使用 LIKE 進行部分匹配
        const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
        if (res.rows.length > 0) {
            foundUser = res.rows[0];
        }
    }


    if (!foundUser) {
      return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
    }

    let studentInfo = `學員姓名：${foundUser.name}\n`;
    studentInfo += `學員 ID：${foundUser.id}\n`;
    studentInfo += `剩餘點數：${foundUser.points} 點\n`;
    studentInfo += `歷史記錄 (近5筆)：\n`;
    // 歷史記錄可能為 null 或空陣列，需處理
    if (foundUser.history && foundUser.history.length > 0) {
      // 顯示最新 5 筆記錄，倒序排列
      foundUser.history.slice(-5).reverse().forEach(record => {
        studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
    } else {
      studentInfo += `無歷史記錄。\n`;
    }
    return reply(replyToken, studentInfo, teacherMenu);
  }

  // --- 統計報表 (@統計報表) ---
  if (text === COMMANDS.TEACHER.REPORT) {
    const usersRes = await pgClient.query(`SELECT * FROM users WHERE role = 'student'`);
    const students = usersRes.rows;
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length;

    const coursesRes = await pgClient.query(`SELECT * FROM courses`);
    const allCourses = coursesRes.rows;
    const totalCourses = allCourses.length;
    const now = Date.now();
    const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
    const completedCourses = totalCourses - upcomingCourses;

    const ordersRes = await pgClient.query(`SELECT * FROM orders`);
    const allOrders = ordersRes.rows;
    const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
    const completedOrders = allOrders.filter(o => o.status === 'completed').length;
    const totalRevenue = allOrders
      .filter(o => o.status === 'completed')
      .reduce((sum, order) => sum + order.amount, 0);

    let report = '📊 營運報告 📊\n\n';
    report += `👤 學員總數：${students.length} 人\n`;
    report += `🟢 活躍學員：${activeStudentsCount} 人\n`;
    report += `💎 所有學員總點數：${totalPoints} 點\n\n`;
    report += `🗓️ 課程統計：\n`;
    report += `  總課程數：${totalCourses} 堂\n`;
    report += `  進行中/未開課：${upcomingCourses} 堂\n`;
    report += `  已結束課程：${completedCourses} 堂\n\n`;
    report += `💰 購點訂單：\n`;
    report += `  待確認訂單：${pendingOrders} 筆\n`;
    report += `  已完成訂單：${completedCourses} 筆\n`; // <--- 修正: 這裡應該是已完成訂單數，不是 completedOrders
    report += `  總收入 (已完成訂單)：${totalRevenue} 元\n`;

    return reply(replyToken, report.trim(), teacherMenu);
  }

  // --- 待確認清單 (購點) (@待確認清單) ---
  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    // 只查詢 status 為 'pending_confirmation' 的訂單
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
    const pendingConfirmationOrders = ordersRes.rows.map(row => ({
      orderId: row.order_id,
      userId: row.user_id,
      userName: row.user_name,
      points: row.points,
      amount: row.amount,
      last5Digits: row.last_5_digits,
      timestamp: row.timestamp.toISOString()
    }));

    if (pendingConfirmationOrders.length === 0) {
      return reply(replyToken, '目前沒有待確認的購點訂單。', teacherPointSubMenu);
    }

    let replyMessage = '以下是待確認的購點訂單：\n\n';

    pendingConfirmationOrders.forEach(order => {
      replyMessage += `--- 訂單 #${order.orderId} ---\n`;
      replyMessage += `學員名稱: ${order.userName}\n`;
      replyMessage += `學員ID: ${order.userId.substring(0, 8)}...\n`; // 顯示部分 ID
      replyMessage += `購買點數: ${order.points} 點\n`;
      replyMessage += `應付金額: $${order.amount}\n`;
      replyMessage += `匯款後五碼: ${order.last5Digits || 'N/A'}\n`;
      replyMessage += `提交時間: ${formatDateTime(order.timestamp)}\n`;
      replyMessage += `💡 請點擊對應的快速回覆按鈕進行操作。\n\n`;
    });

    // 為每筆訂單生成確認和取消按鈕
    const quickReplyItems = pendingConfirmationOrders.flatMap(order => [
      { type: 'action', action: { type: 'postback', label: `✅ 確認#${order.orderId}`.slice(0, 20), data: `confirm_order_${order.orderId}`, displayText: `✅ 確認訂單 ${order.orderId} 入帳` } },
      { type: 'action', action: { type: 'postback', label: `❌ 取消#${order.orderId}`.slice(0, 20), data: `cancel_order_${order.orderId}`, displayText: `❌ 取消訂單 ${order.orderId}` } },
    ]);
    quickReplyItems.push({ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT });

    return reply(replyToken, {
      type: 'text',
      text: replyMessage.trim(),
      quickReply: { items: quickReplyItems.slice(0, 13) } // 最多 13 個
    });
  }

  // --- 手動調整點數 (@手動調整點數) ---
  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust[userId] = { step: 1 };
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。', [
      { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
    ]);
  }

  // --- 預設回覆 ---
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}

// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
/**
 * 處理學員身份下的所有指令。
 * @param {object} event - LINE 事件物件。
 * @param {string} userId - 用戶 ID。
 */
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : ''; // 確保 text 存在

  // 每次操作前從資料庫獲取最新資料
  const user = await getUser(userId);
  const courses = await getAllCourses();

  // --- 返回主選單/子選單指令處理 ---
  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  if (text === COMMANDS.STUDENT.POINTS) {
    return reply(replyToken, '請選擇點數相關功能：', studentPointSubMenu);
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    delete pendingPurchase[userId]; // 取消購點流程
    return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
  }

  // --- 查詢剩餘點數 (@剩餘點數) ---
  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  // --- 購買點數流程 (@購買點數) ---
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    // 檢查是否有尚未完成的購點訂單 (pending_payment 或 pending_confirmation)
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation')`, [userId]);
    const pendingOrder = ordersRes.rows[0]; // 取得第一筆待處理訂單

    if (pendingOrder) {
      // 如果有待確認的，引導用戶去「購點紀錄」
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } }; // 進入輸入後五碼狀態
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請先完成匯款並至「購點紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
        [
          { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
          { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
        ]
      );
    }

    pendingPurchase[userId] = { step: 'select_plan', data: {} };
    const planOptions = PURCHASE_PLANS.map(plan => ({
      type: 'message', label: plan.label, text: plan.label
    }));
    planOptions.push({ type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
    return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
  }

  // --- 取消購買點數 (學員主動發送) ---
  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    // 檢查是否有正在進行的購點流程，並且狀態為 pending_payment
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_payment'`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
      await deleteOrder(pendingOrder.order_id); // 從資料庫刪除訂單
      delete pendingPurchase[userId]; // 清除流程狀態
      return reply(replyToken, '已取消您的購點訂單。', studentMenu);
    }
    // 如果沒有進行中的訂單，但有流程狀態，也清除
    if (pendingPurchase[userId]) {
      delete pendingPurchase[userId];
    }
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  // --- 購買紀錄功能 (@購買紀錄) ---
  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    // 檢查是否有待確認的訂單 (pending_payment 狀態)
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_payment'`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      return reply(replyToken, `您的訂單 ${pendingOrder.order_id} 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 },
        { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
      ]);
    }

    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    }

    let historyMessage = '以下是你的點數記錄：\n';
    // 顯示最新 5 筆記錄，倒序排列
    user.history.slice(-5).reverse().forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
  }

  // --- 處理學員輸入匯款後五碼 (在 @購買紀錄 流程中) ---
  if (pendingPurchase[userId] && pendingPurchase[userId].step === 'input_last5') {
    const orderId = pendingPurchase[userId].data.orderId;
    const last5Digits = text.trim();

    if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    }
    if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
      return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
    }

    // 驗證輸入是否為 5 位數字
    if (!/^\d{5}$/.test(last5Digits)) {
      return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
    }

    // 查詢並更新訂單狀態
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND status = 'pending_payment'`, [orderId]);
    const order = ordersRes.rows[0];

    if (!order) {
      // 訂單可能已被處理或不存在，清除流程狀態
      delete pendingPurchase[userId];
      return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
    }

    order.last_5_digits = last5Digits; // 更新後五碼
    order.status = 'pending_confirmation'; // 狀態改為待老師確認
    await saveOrder({ // 將資料庫讀出的 snake_case 轉換為 camelCase 傳入 saveOrder
      orderId: order.order_id,
      userId: order.user_id,
      userName: order.user_name,
      points: order.points,
      amount: order.amount,
      last5Digits: order.last_5_digits,
      status: order.status,
      timestamp: order.timestamp.toISOString()
    });
    delete pendingPurchase[userId]; // 清除流程狀態

    await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);
    // 通知老師有新的購點訂單
    if (TEACHER_ID) {
      await push(TEACHER_ID, `🔔 有新的購點訂單待確認！請輸入 ${COMMANDS.TEACHER.PENDING_ORDERS} 進入管理介面。`)
        .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
    } else {
      console.warn('⚠️ TEACHER_ID 未設定，無法通知老師新的購點訂單。');
    }
    return;
  }

  // --- 處理取消輸入後五碼的訊息 ---
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
    if (pendingPurchase[userId]?.step === 'input_last5') {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    } else {
      return reply(replyToken, '目前沒有需要取消的輸入流程。', studentMenu);
    }
  }

  // --- 預約課程功能 (@預約課程) ---
  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const upcoming = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcoming.length === 0) {
      return reply(replyToken, '目前沒有可預約的課程。', studentMenu);
    }

    const quickReplyItems = upcoming.map(c => ({
      type: 'action',
      action: {
        type: 'message', // 使用 message 讓用戶看到自己點擊了什麼
        label: `${formatDateTime(c.time)} ${c.title} (${c.pointsCost}點)`.slice(0, 20), // 限制標籤長度，不再顯示 ID
        text: `我要預約 ${c.id}`, // 發送一個特殊指令，內部仍使用 ID
      },
    }));
    quickReplyItems.push({ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU });

    return reply(replyToken, {
      type: 'text',
      text: '以下是目前可以預約的課程，點擊即可預約並扣除對應點數。\n\n💡 請注意：課程開始前 8 小時不可退課。',
      quickReply: { items: quickReplyItems.slice(0, 13) }, // 最多 13 個
    });
  }

  // --- ✅ 執行預約課程 (接收來自選單的 `我要預約 [ID]` 指令) ---
  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    const course = courses[courseId];
    const now = Date.now();

    if (!course) {
      return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
    }
    if (course.students.includes(userId)) {
      return reply(replyToken, '你已經預約此課程了。', studentMenu);
    }
    if (course.waiting.includes(userId)) {
      return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    }
    if (user.points < course.pointsCost) {
      return reply(replyToken, `你的點數不足，此課程需要 ${course.pointsCost} 點，你目前有 ${user.points} 點。請先購買點數。`, studentMenu);
    }

    if (course.students.length < course.capacity) {
      // 課程未滿，直接預約
      course.students.push(userId);
      user.points -= course.pointsCost;
      // 確保 history 是陣列
      if (!Array.isArray(user.history)) {
        user.history = [];
      }
      user.history.push({ id: courseId, action: `預約成功：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
      await saveCourse(course); // 保存課程資料
      await saveUser(user); // 保存用戶資料
      return reply(replyToken, `已成功預約課程：「${course.title}」，扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
    } else {
      // 課程已滿，加入候補
      course.waiting.push(userId);
      // 確保 history 是陣列
      if (!Array.isArray(user.history)) {
        user.history = [];
      }
      user.history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() });
      await saveCourse(course); // 保存課程資料
      await saveUser(user); // 保存用戶資料
      return reply(replyToken, `該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
    }
  }

  // --- 📖 我的課程功能 (@我的課程) ---
  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.values(courses)
      .filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now) // 已預約且未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    const waitingCourses = Object.values(courses)
      .filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now) // 候補中且未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    let replyMessage = '';

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
    }

    if (enrolledCourses.length > 0) {
      replyMessage += '✅ 你已預約的課程：\n';
      enrolledCourses.forEach(c => {
        replyMessage += `・${c.title} - ${formatDateTime(c.time)} (扣 ${c.pointsCost} 點)\n`;
      });
      replyMessage += '\n';
    }

    if (waitingCourses.length > 0) {
      replyMessage += '⏳ 你候補中的課程：\n';
      waitingCourses.forEach(c => { // 修正為 waitingCourses
        const waitingIndex = c.waiting.indexOf(userId) + 1; // 計算候補排位
        replyMessage += `・${c.title} - ${formatDateTime(c.time)} (目前候補第 ${waitingIndex} 位, 需扣 ${c.pointsCost} 點)\n`;
      });
    }

    return reply(replyToken, replyMessage.trim(), studentMenu);
  }

  // --- ❌ 取消已預約課程（含自動候補轉正） (@取消預約) ---
  if (text === COMMANDS.STUDENT.CANCEL_BOOKING) {
    const now = Date.now();
    const enrolled = Object.values(courses).filter(c =>
      c.students.includes(userId) && new Date(c.time).getTime() > now // 已預約且未來的課程
    ).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (enrolled.length === 0) {
      return reply(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
    }

    const quickReplyItems = enrolled.map(c => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title} (退${c.pointsCost}點)`.slice(0, 20), // 限制標籤長度
        text: `我要取消預約 ${c.id}`, // 發送一個特殊指令，內部仍使用 ID
      },
    }));
    quickReplyItems.push({ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU });

    return reply(replyToken, {
      type: 'text',
      text: '請選擇要取消的預約課程：',
      quickReply: { items: quickReplyItems.slice(0, 13) },
    });
  }

  // --- 執行取消預約 (由快速選單觸發) ---
  if (text.startsWith('我要取消預約 ')) {
    const id = text.replace('我要取消預約 ', '').trim();
    const course = courses[id];
    const now = Date.now();

    if (!course || !course.students.includes(userId)) {
      return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    }
    // 檢查是否在 8 小時內
    if (new Date(course.time).getTime() - now < EIGHT_HOURS_IN_MS) {
      return reply(replyToken, `課程「${course.title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`, studentMenu);
    }

    // 移除學生，退還點數，更新歷史記錄
    course.students = course.students.filter(sid => sid !== userId);
    user.points += course.pointsCost;
    // 確保 history 是陣列
    if (!Array.isArray(user.history)) {
      user.history = [];
    }
    user.history.push({ id, action: `取消預約退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });

    let replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`;

    // 檢查是否有候補學生需要遞補
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting[0]; // 取出第一位候補學生
      const nextWaitingUser = await getUser(nextWaitingUserId); // 從資料庫獲取候補學生資料

      if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
        // 候補學生有足夠點數，進行遞補
        course.waiting.shift(); // 從候補移除
        course.students.push(nextWaitingUserId); // 加入正式學生
        nextWaitingUser.points -= course.pointsCost; // 扣點
        // 確保 history 是陣列
        if (!Array.isArray(nextWaitingUser.history)) {
          nextWaitingUser.history = [];
        }
        nextWaitingUser.history.push({ id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });

        await saveUser(nextWaitingUser); // 保存候補學員資料
        // 推送通知給遞補成功的學生
        push(nextWaitingUserId,
          `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`
        ).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));

        replyMessage += '\n有候補學生已遞補成功。';
      } else if (nextWaitingUser) {
        // 候補學生點數不足
        const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
        course.waiting.shift(); // 無論如何都從候補名單移除
        console.log(`⚠️ 候補學生 ${studentName} (ID: ${nextWaitingUserId}) 點數不足，未能遞補，已從候補名單移除。`);
        // 通知老師有學生點數不足無法遞補
        if (TEACHER_ID) {
          push(TEACHER_ID,
            `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已自動從候補名單移除該學生。`
          ).catch(e => console.error('❌ 通知老師失敗', e.message));
        }
      } else {
        // 候補名單中有無效用戶 (例如，用戶 ID 不存在)
        course.waiting.shift(); // 從候補名單移除無效用戶
        replyMessage += '\n候補名單中存在無效用戶，已移除。';
      }
    } else if (course.waiting.length > 0 && course.students.length >= course.capacity) {
      // 課程仍滿，但仍有候補學生等待
      replyMessage += '\n課程空出一位，但候補名單仍需等待。';
    }

    await saveCourse(course); // 保存課程資料
    await saveUser(user); // 保存用戶資料
    return reply(replyToken, replyMessage, studentMenu);
  }

  // --- ❌ 取消候補 (@取消候補) ---
  if (text === COMMANDS.STUDENT.CANCEL_WAITING) {
    const now = Date.now();
    const waitingCourses = Object.values(courses)
      .filter(c => c.waiting?.includes(userId) && new Date(c.time).getTime() > now) // 候補中且未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
    }

    const quickReplyItems = waitingCourses.map(c => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20), // 限制標籤長度
        text: `我要取消候補 ${c.id}`, // 發送一個特殊指令，內部仍使用 ID
      },
    }));
    quickReplyItems.push({ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU });

    return reply(replyToken, {
      type: 'text',
      text: '請選擇要取消候補的課程：',
      quickReply: { items: quickReplyItems.slice(0, 13) },
    });
  }

  // --- 執行取消候補 (由快速選單觸發) ---
  if (text.startsWith('我要取消候補 ')) {
    const id = text.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    const now = Date.now();

    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId); // 從候補名單中移除
    // 確保 history 是陣列
    if (!Array.isArray(user.history)) {
      user.history = [];
    }
    user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    await saveCourse(course); // 保存課程資料
    await saveUser(user); // 保存用戶資料
    return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
  }

  // --- 預設回覆，提示用戶使用選單 ---
  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}

// =====================================
//      🎯 主事件處理函式 (處理所有 LINE 傳入的訊息和事件)
// =====================================
async function handleEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  console.log(`Received event type: ${event.type}`); // DEBUG: 印出收到的事件類型

  // 更多詳細的訊息日誌
  if (event.type === 'message') {
      console.log(`Received message type: ${event.message.type}`);
      if (event.message.type === 'text') {
          console.log(`Received text message: "${event.message.text}" from user: ${userId}`);
      } else {
          console.log(`Received non-text message from user: ${userId} (Type: ${event.message.type})`);
          // 對於非文字訊息，嘗試回覆一個通用訊息，避免 LINE SDK 拋出 400
          // 但在處理邏輯中，我們會優先處理文字訊息和 Postback
          try {
              if (event.message.type === 'sticker') {
                  await client.replyMessage(replyToken, { type: 'sticker', packageId: '446', stickerId: '1988' }); // 回覆一個可愛的貼圖
              } else if (event.message.type === 'image' || event.message.type === 'video' || event.message.type === 'audio') {
                  await reply(replyToken, '抱歉，目前暫時不支援圖片、影片或語音訊息，請使用文字訊息或點擊選單操作。');
              } else {
                  await reply(replyToken, '抱歉，目前只支援文字訊息或透過選單操作。');
              }
          } catch (replyError) {
              console.error(`❌ 回覆非文字訊息失敗: ${replyError.message}`);
          }
          return; // 處理完非文字訊息後直接返回，不再進入後續邏輯
      }
  } else if (event.type === 'postback') {
      console.log(`Received postback data: ${event.postback.data} from user: ${userId}`);
  } else if (event.type === 'follow') {
      console.log(`New user followed bot: ${userId}`);
      try {
          // 獲取用戶資料並初始化
          let user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
          await saveUser(user); // 保存新用戶資料到資料庫
          const profile = await client.getProfile(userId);
          user.name = profile.displayName || '匿名使用者';
          await saveUser(user);
          await reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。點數儲值請聯絡老師。`, studentMenu);
      } catch (e) {
          console.error(`❌ 處理追蹤事件失敗 for ${userId}:`, e.message);
          // 即使失敗，也嘗試給一個預設回應
          await reply(replyToken, `哈囉！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。點數儲值請聯絡老師。`, studentMenu).catch(e => console.error(`❌ 追蹤事件預設回覆失敗:`, e.message));
      }
      return;
  } else if (event.type === 'unfollow') {
      console.log(`User unfollowed bot: ${userId}`);
      // 可選：從資料庫中刪除用戶資料或標記為不活躍
      // deleteUser(userId); // 您可以實作一個 deleteUser 函式
      return;
  } else if (event.type === 'join' || event.type === 'leave') {
      // 忽略群組加入或離開事件
      console.log(`Ignored event: ${event.type}`);
      return;
  }
  else {
      console.log(`Received other event (ignored): ${JSON.stringify(event)} from user: ${userId}`);
      // 忽略除 message 和 postback 之外的所有事件，避免 400 錯誤
      // 對於這些事件，也不回覆，讓 LINE 認為沒有被處理
      return;
  }

  // --- 用戶資料初始化與更新 (現在只針對 message 和 postback 事件執行) ---
  let user = await getUser(userId);
  if (!user) {
    // 如果用戶不存在（通常只會在 `follow` 事件後發生），則初始化為新用戶
    // 但為確保健壯性，這裡再次檢查並初始化
    user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
    console.log(`ℹ️ 新用戶（經由 message/postback 檢測）加入: ${userId}`);
    await saveUser(user); // 保存新用戶資料到資料庫
  }

  // 嘗試獲取用戶的顯示名稱並更新 (只在用戶名為預設值時才更新)
  // 如果之前在 follow 事件中已處理，這裡不會重複執行
  if (user.name === '匿名使用者' || !user.name) {
    try {
      const profile = await client.getProfile(userId);
      user.name = profile.displayName || '匿名使用者';
      await saveUser(user);
      console.log(`✅ 用戶 ${userId} 的名稱已更新為: ${user.name}`);
    } catch (e) {
      console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
    }
  }


  // --- Postback 事件處理 ---
  if (event.type === 'postback') {
    const data = event.postback.data;
    console.log(`DEBUG: Handling postback data: ${data}`); // DEBUG: 印出 postback data

    // 課程取消確認流程 (老師專用) - Postback觸發
    if (data.startsWith('cancel_course_confirm_')) {
      const currentUser = await getUser(userId); // 獲取最新用戶角色
      if (currentUser.role !== 'teacher') {
        console.log(`DEBUG: 用戶 ${userId} 嘗試執行老師權限的 postback 但非老師身份。`);
        return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
      }
      const courseId = data.replace('cancel_course_confirm_', '');
      const courses = await getAllCourses(); // 獲取最新課程資料
      const course = courses[courseId];
      const now = Date.now();

      if (!course || new Date(course.time).getTime() < now) {
        console.log(`DEBUG: 取消課程 Postback: 找不到課程 ${courseId} 或已過期。`);
        return reply(replyToken, '找不到該課程，或課程已過期。', teacherCourseSubMenu);
      }
      // 暫存待確認的課程 ID
      global.confirmingCancelCourse[userId] = courseId; // 這裡不需要 global.confirmingCancelCourse = global.confirmingCancelCourse || {};，因為已在頂部初始化

      return reply(replyToken, `確認要取消課程「${course.title}」（${formatDateTime(course.time)}）嗎？\n一旦取消，已預約學生的點數將會退還，候補學生將收到取消通知。`, [
        { type: 'message', label: '✅ 是，確認取消', text: `確認取消課程 ${courseId}` }, // 將確認動作綁定到一個新指令
        { type: 'message', label: '❌ 否，返回', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }, // 取消操作，返回課程管理
      ]);
    }

    // 老師購點確認操作 (老師專用) - Postback觸發
    if (data.startsWith('confirm_order_') || data.startsWith('cancel_order_')) {
      const currentUser = await getUser(userId); // 獲取最新用戶角色
      if (currentUser.role !== 'teacher') {
        console.log(`DEBUG: 用戶 ${userId} 嘗試執行老師權限的 postback 但非老師身份。`);
        return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
      }
      const orderId = data.split('_')[2]; // 從 postback data 中解析訂單 ID
      const action = data.split('_')[0]; // confirm 或 cancel
      const orders = await getAllOrders(); // 獲取最新訂單資料
      const order = orders[orderId];

      if (!order || order.status !== 'pending_confirmation') {
        console.log(`DEBUG: 訂單操作 Postback: 找不到訂單 ${orderId} 或狀態不正確。`);
        return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', teacherPointSubMenu);
      }
      const studentUser = await getUser(order.userId); // 獲取購點學員的資料
      if (!studentUser) {
        console.log(`DEBUG: 訂單操作 Postback: 找不到購點學員 (ID: ${order.userId}) 的資料。`);
        return reply(replyToken, `找不到購點學員 (ID: ${order.userId}) 的資料。`, teacherPointSubMenu);
      }

      if (action === 'confirm') {
        studentUser.points += order.points; // 為學員加點
        // 確保 history 是陣列
        if (!Array.isArray(studentUser.history)) {
          studentUser.history = [];
        }
        studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
        order.status = 'completed'; // 更新訂單狀態為已完成
        await saveUser(studentUser); // 保存學員資料
        await saveOrder(order); // 保存訂單資料
        await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, teacherPointSubMenu);
        // 推送通知給學員
        await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。請查詢您的「剩餘點數」。`).catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));
      } else if (action === 'cancel') {
        order.status = 'cancelled'; // 更新訂單狀態為已取消
        await saveOrder(order); // 保存訂單資料
        await reply(replyToken, `❌ 已取消訂單 ${order.orderId} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, teacherPointSubMenu);
      }
      return; // Postback 處理完畢，直接返回
    }
    // 如果有其他 Postback 處理，放在這裡
  }

  // 確保是文字訊息，因為非文字訊息已經在上方被處理或忽略
  if (event.type !== 'message' || event.message.type !== 'text') {
    console.log(`DEBUG: Skipping non-text message event after initial check.`);
    return;
  }

  const text = event.message.text.trim();

  // --- 優先處理特定的、跨角色的指令或多步驟流程的確認訊息 ---

  // 1. 處理老師取消課程的確認指令 (這是之前問題點，需要優先處理)
  // 檢查是否處於取消課程的確認狀態，且發送了確認訊息
  if (global.confirmingCancelCourse[userId] && text.startsWith('確認取消課程 ')) {
      console.log(`DEBUG: 處理老師取消課程確認指令: "${text}"`);
      const currentUser = await getUser(userId);
      if (currentUser.role !== 'teacher') {
          console.log(`DEBUG: 用戶 ${userId} 嘗試執行老師權限的取消確認但非老師身份。`);
          delete global.confirmingCancelCourse[userId]; // 清除無效狀態
          return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
      }
      const courseId = text.replace('確認取消課程 ', '').trim();
      if (global.confirmingCancelCourse[userId] !== courseId) {
          console.log(`DEBUG: 取消課程確認: 課程 ID 不匹配，清除狀態。`);
          delete global.confirmingCancelCourse[userId]; // 清除無效狀態
          return reply(replyToken, '無效的取消確認，請重新操作。', teacherCourseSubMenu);
      }

      const courses = await getAllCourses();
      const course = courses[courseId];
      const now = Date.now();

      if (!course || new Date(course.time).getTime() < now) {
          console.log(`DEBUG: 取消課程確認: 找不到課程 ${courseId} 或已過期。`);
          delete global.confirmingCancelCourse[userId];
          return reply(replyToken, '找不到該課程，取消失敗或已被刪除或已過期。', teacherCourseSubMenu);
      }

      // 處理學生退點和通知
      for (const stuId of course.students) {
          const studentUser = await getUser(stuId);
          if (studentUser) {
              studentUser.points += course.pointsCost;
              if (!Array.isArray(studentUser.history)) {
                  studentUser.history = [];
              }
              studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
              await saveUser(studentUser);
              push(stuId, `您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，已退還 ${course.pointsCost} 點。請確認您的「剩餘點數」。`)
                  .catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
          } else {
              console.warn(`⚠️ 課程取消時找不到已預約學員的資料: ${stuId}`);
          }
      }
      // 處理候補學生通知
      for (const waitId of course.waiting) {
          const waitingUser = await getUser(waitId);
          if (waitingUser) {
              if (!Array.isArray(waitingUser.history)) {
                  waitingUser.history = [];
              }
              waitingUser.history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
              await saveUser(waitingUser);
              push(waitId, `您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`)
                  .catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
          } else {
              console.warn(`⚠️ 課程取消時找不到候補學員的資料: ${waitId}`);
          }
      }

      await deleteCourse(courseId);
      delete global.confirmingCancelCourse[userId];
      console.log(`DEBUG: 課程 ${courseId} 已成功取消。`);
      return reply(replyToken, `課程「${course.title}」已取消，所有相關學員已收到通知。`, teacherCourseSubMenu);
  }

  // 2. 處理老師取消確認的「❌ 否，返回」指令 或 新增課程的取消 (這也需要優先處理，因為它也是一個文字指令，並且清除狀態)
  // 如果處於取消課程確認狀態，且收到返回課程管理的指令
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT && global.confirmingCancelCourse[userId]) {
      console.log(`DEBUG: 處理取消課程確認流程中的返回指令。`);
      delete global.confirmingCancelCourse[userId]; // 清除流程狀態
      return reply(replyToken, '已中止取消課程操作，並返回課程管理。', teacherCourseSubMenu);
  }
  // 如果處於新增課程狀態，且收到取消新增課程的指令
  if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE && pendingCourseCreation[userId]) {
      console.log(`DEBUG: 處理取消新增課程指令。`);
      delete pendingCourseCreation[userId];
      return reply(replyToken, '已取消新增課程流程並返回選單。', teacherCourseSubMenu);
  }


  // 3. 多步驟新增課程流程處理 (老師專用)
  if (pendingCourseCreation[userId]) {
    console.log(`DEBUG: 處理新增課程流程，目前步驟: ${pendingCourseCreation[userId].step}`);
    const stepData = pendingCourseCreation[userId];
    const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };

    switch (stepData.step) {
      case 1: // 輸入課程名稱
        stepData.data.title = text;
        stepData.step = 2;
        const weekdayOptions = Object.keys(weekdays).map(day => ({
          type: 'message', label: day, text: day
        }));
        weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
        return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
      case 2: // 輸入星期幾
        if (!weekdays.hasOwnProperty(text)) {
          const weekdayOptionsError = Object.keys(weekdays).map(day => ({
            type: 'message', label: day, text: day
          }));
          weekdayOptionsError.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
          return reply(replyToken, '請選擇正確的星期（例如：點擊「星期一」）：', weekdayOptionsError);
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
      case 3: // 輸入時間
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
          return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        }
        stepData.data.time = text;
        stepData.step = 4;
        return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
      case 4: // 輸入人數上限
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return reply(replyToken, '人數上限必須是正整數。', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        return reply(replyToken, '請輸入課程所需扣除的點數（正整數，例如 1 或 2）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
      case 5: // 輸入點數花費
        const pointsCost = parseInt(text);
        if (isNaN(pointsCost) || pointsCost <= 0) {
          return reply(replyToken, '扣除點數必須是正整數。', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        }
        stepData.data.pointsCost = pointsCost;
        stepData.step = 6;
        return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
        ]);
      case 6: // 確認新增
        if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
          const targetWeekdayIndex = weekdays[stepData.data.weekday];
          const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);

          const now = new Date();
          const taipeiOffsetHours = 8; // 台北時間 UTC+8

          // 計算目標課程的 UTC 時間點
          // 將當前 UTC 日期設置為今天午夜，然後添加天數差，再設置目標時間
          // <--- 修正: 確保在計算日期時，考慮到時區和目標時間是否已過
          let courseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          
          let dayDiff = (targetWeekdayIndex - courseDate.getUTCDay() + 7) % 7;
          
          // 如果是今天，但目標時間（轉換為台北時間後）已經過去，則設定為下週
          const currentHourTaipei = now.getHours(); // 獲取本地時間的小時 (根據系統時區)
          const currentMinuteTaipei = now.getMinutes(); // 獲取本地時間的分鐘 (根據系統時區)

          // 判斷是否為今天且時間已過
          if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
            dayDiff = 7; // 如果是今天，但時間已過，則設定為下週
          }
          
          courseDate.setUTCDate(courseDate.getUTCDate() + dayDiff);
          // 將時間轉換為 UTC。targetHour 是台灣時間，所以需要減去台灣和 UTC 的時差
          courseDate.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);


          const isoTime = courseDate.toISOString();

          // 使用 global.courseIdCounter 生成 ID
          const newId = `C${String(global.courseIdCounter).padStart(3, '0')}`;
          global.courseIdCounter++; // 遞增計數器

          const newCourse = {
            id: newId,
            title: stepData.data.title,
            time: isoTime,
            capacity: stepData.data.capacity,
            pointsCost: stepData.data.pointsCost,
            students: [],
            waiting: [],
          };
          await saveCourse(newCourse); // 儲存到資料庫
          delete pendingCourseCreation[userId]; // 清除流程狀態
          // 成功訊息中不再顯示課程 ID
          return reply(replyToken, `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, teacherCourseSubMenu);
        } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
          delete pendingCourseCreation[userId];
          return reply(replyToken, '已取消新增課程。', teacherCourseSubMenu);
        } else {
          return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」確認。`, [
            { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
            { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
          ]);
        }
      default: // 處理意外情況，重置流程
        console.log(`DEBUG: 新增課程流程進入默認分支，重置狀態。`);
        delete pendingCourseCreation[userId];
        return reply(replyToken, '流程異常，已重置。', teacherMenu);
    }
  }

  // --- 🔐 老師手動調整點數流程處理 (老師專用) ---
  if (pendingManualAdjust[userId]) {
    console.log(`DEBUG: 處理手動調整點數流程。`);
    // 允許取消操作
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, '已取消手動調整點數。', teacherPointSubMenu);
    }

    const parts = text.split(' ');
    if (parts.length !== 2) {
      return reply(replyToken, '指令格式錯誤，請輸入：[學員ID/姓名] [數量] (正數加點，負數扣點)', [
        { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
      ]);
    }

    const targetIdentifier = parts[0]; // 學員 ID 或姓名
    const amount = parseInt(parts[1]); // 調整數量

    if (isNaN(amount) || amount === 0) {
      return reply(replyToken, '點數數量必須是非零整數。', [
        { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
      ]);
    }

    let foundUser = null;

    // 嘗試透過 ID 查找
    const userById = await getUser(targetIdentifier);
    // 確保查到的是學生
    if (userById && userById.role === 'student') {
        foundUser = userById;
    }

    if (!foundUser) {
        // 嘗試透過名稱部分匹配查找
        const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
        if (res.rows.length > 0) {
            foundUser = res.rows[0];
        }
    }

    if (!foundUser) {
      delete pendingManualAdjust[userId]; // 清除流程狀態
      return reply(replyToken, `找不到學員：${targetIdentifier}。請確認學員 ID 或姓名是否正確。`, teacherPointSubMenu);
    }

    const operation = amount > 0 ? '加點' : '扣點';
    const absAmount = Math.abs(amount);
    let currentPoints = foundUser.points;
    let newPoints = currentPoints + amount;

    // 檢查扣點時點數是否足夠
    if (operation === '扣點' && currentPoints < absAmount) {
      delete pendingManualAdjust[userId]; // 清除流程狀態
      return reply(replyToken, `學員 ${foundUser.name} 點數不足，無法扣除 ${absAmount} 點 (目前 ${currentPoints} 點)。`, teacherPointSubMenu);
    }

    foundUser.points = newPoints;
    // 記錄歷史操作
    // 確保 history 是陣列
    if (!Array.isArray(foundUser.history)) {
      foundUser.history = [];
    }
    foundUser.history.push({
      action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId
    });
    await saveUser(foundUser); // 保存學員資料

    // 通知被調整點數的學員
    push(foundUser.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${newPoints}點。`)
      .catch(e => console.error(`❌ 通知學員 ${foundUser.id} 點數變動失敗:`, e.message));

    delete pendingManualAdjust[userId]; // 清除流程狀態
    return reply(replyToken, `✅ 已成功為學員 ${foundUser.name} ${operation} ${absAmount} 點，目前點數：${newPoints} 點。`, teacherPointSubMenu);
  }

  // --- 學生購點流程處理 (學員專用) ---
  if (pendingPurchase[userId]) {
    console.log(`DEBUG: 處理購點流程，目前步驟: ${pendingPurchase[userId].step}`);
    const stepData = pendingPurchase[userId];

    switch (stepData.step) {
      case 'select_plan': // 選擇購點方案
        const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
        if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
            delete pendingPurchase[userId];
            return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
        }
        if (!selectedPlan) {
          const planOptions = PURCHASE_PLANS.map(plan => ({
            type: 'message', label: plan.label, text: plan.label
          }));
          planOptions.push({ type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
          return reply(replyToken, '請從列表中選擇有效的點數方案。', planOptions);
        }
        // 暫存訂單資訊
        stepData.data = {
          points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment'
        };
        stepData.step = 'confirm_purchase'; // 進入確認購買步驟
        return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
        ]);
      case 'confirm_purchase': // 確認購買
        if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
          const orderId = `O${Date.now()}`; // 生成唯一訂單 ID
          const newOrder = { ...stepData.data, orderId: orderId };
          await saveOrder(newOrder); // 儲存到資料庫
          delete pendingPurchase[userId]; // 清除流程狀態
          return reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳或匯款。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數查詢」>「購點紀錄」並輸入您的匯款帳號後五碼以供核對。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
        } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
          delete pendingPurchase[userId];
          return reply(replyToken, '已取消購買點數。', studentMenu);
        } else {
          return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`, [
            { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
            { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
          ]);
        }
      default: // 處理意外情況，重置流程
        console.log(`DEBUG: 購點流程進入默認分支，重置狀態。`);
        delete pendingPurchase[userId];
        return reply(replyToken, '流程異常，已重置購點流程。', studentMenu);
    }
  }


  // --- 🔁 身份切換指令處理 ---
  if (text === COMMANDS.SWITCH_ROLE) {
    console.log(`DEBUG: 處理切換身份指令。`);
    const currentUser = await getUser(userId); // 獲取最新用戶角色
    if (currentUser.role === 'teacher') {
      currentUser.role = 'student'; // 切換為學生
      await saveUser(currentUser); // 保存更新
      return reply(event.replyToken, '已切換為學員身份。', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true; // 進入老師登入流程
      return reply(event.replyToken, '請輸入老師密碼登入。', [{ type: 'message', label: '取消登入', text: COMMANDS.SWITCH_ROLE }]);
    }
  }

  // --- 🔐 老師登入密碼驗證 ---
  if (pendingTeacherLogin[userId]) {
    console.log(`DEBUG: 處理老師登入流程。`);
    // 允許取消登入
    if (text === COMMANDS.SWITCH_ROLE) {
      delete pendingTeacherLogin[userId];
      return reply(replyToken, '已取消老師登入。', studentMenu);
    }

    if (text === TEACHER_PASSWORD) {
      const currentUser = await getUser(userId);
      currentUser.role = 'teacher'; // 設定為老師身份
      await saveUser(currentUser); // 保存更新
      delete pendingTeacherLogin[userId]; // 清除流程狀態
      return reply(replyToken, '老師登入成功。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId]; // 清除流程狀態
      return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
    }
  }

  // --- 🔀 根據用戶身份導向不同的指令處理函式 ---
  const currentUser = await getUser(userId); // 再次獲取最新用戶角色
  if (currentUser.role === 'teacher') {
    console.log(`DEBUG: 導向老師指令處理。`);
    return handleTeacherCommands(event, userId);
  } else {
    console.log(`DEBUG: 導向學員指令處理。`);
    return handleStudentCommands(event, userId);
  }
}

// =====================================
//           自動提醒功能
// =====================================

/**
 * 檢查並發送課程開始前 1 小時的提醒。
 */
async function checkAndSendReminders() {
  const now = Date.now();
  const courses = await getAllCourses(); // 從資料庫獲取最新課程
  // 優化：只獲取所有學生的 ID 和姓名一次，避免重複查詢
  const usersRes = await pgClient.query('SELECT id, name FROM users WHERE role = $1', ['student']);
  const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u])); // 方便透過 ID 查找用戶

  for (const id in courses) {
    const course = courses[id];
    const courseTime = new Date(course.time).getTime();
    const timeUntilCourse = courseTime - now;

    // 如果課程在未來 1 小時內開始，且尚未發送提醒
    // 增加一個小小的緩衝時間，確保不會因為延遲導致重複發送或未發送
    // 例如：在課程開始前 60 到 55 分鐘之間發送提醒
    const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 55 分鐘
    if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
      console.log(`🔔 準備發送課程提醒：${course.title}`); // 移除 ID 顯示
      for (const studentId of course.students) {
        const student = dbUsersMap.get(studentId); // 從 Map 中獲取學生資料
        if (student) {
          try {
            await push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`);
            console.log(`   ✅ 已向學員 ${student.name} (${studentId.substring(0, 8)}...) 發送提醒。`);
          } catch (e) {
            console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
          }
        }
      }
      sentReminders[id] = true; // 標記為已發送提醒，避免重複發送
    }
  }
  // 清理過期的提醒標記 (例如，課程結束一天後)
  for (const id in sentReminders) {
    const course = courses[id];
    // <--- 修正: 確保在檢查 course 是否存在之前，先獲取它
    if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) {
      delete sentReminders[id];
    }
  }
}


// =====================================
//           LINE Webhook 與伺服器啟動
// =====================================

// 使用 bodyParser.json() 來解析 JSON 請求主體，並將原始請求體儲存到 req.rawBody 以供簽名驗證
app.use(express.json({
  verify: (req, res, buf) => {
    // 只有在 LINE Webhook 請求時才儲存原始請求體
    if (req.headers['x-line-signature']) {
      req.rawBody = buf;
    }
  }
}));

app.post('/webhook', (req, res) => {
  // 手動驗證 LINE 簽名 (LINE SDK 的 middleware 內部會做，但為了防止潛在的 400 錯誤，這裡增加一層保護性檢查)
  const signature = req.headers['x-line-signature'];
  const channelSecret = config.channelSecret; // 從 config 獲取 Channel Secret

  // 只有在 Webhook 請求有簽名時才進行驗證
  if (signature && channelSecret) {
    const hash = crypto.createHmac('sha256', channelSecret)
                       .update(req.rawBody)
                       .digest('base64');

    if (hash !== signature) {
      console.error('❌ LINE Webhook 簽名驗證失敗。');
      return res.status(401).send('Unauthorized: Invalid signature'); // 401 Unauthorized 更合適
    }
  } else {
    console.warn('⚠️ LINE Webhook 請求缺少簽名或 Channel Secret 未設定，跳過簽名驗證。');
    // 如果沒有簽名，可能是非 LINE 請求，或者您的設定有問題
    // 在生產環境中，強烈建議返回錯誤
    // return res.status(400).send('Bad Request: Missing LINE signature or Channel Secret.');
  }

  // 將每個事件異步處理，但使用 Promise.all 確保所有事件處理完成才回應
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.message);
      console.error('完整錯誤物件:', err); // <--- 修正：打印完整錯誤，以便更詳細的調試

      // 對於 400 錯誤，雖然我們盡力在內部處理了，但如果 LINE SDK 仍然返回，則需要發送 400
      // 否則發送 500 表示伺服器內部錯誤
      // 捕獲錯誤並根據錯誤類型返回不同狀態碼
      let statusCode = 500;
      // <--- 修正：更健壯地檢查 line.errors 和 HTTPError。
      // line.errors.HTTPError 是一個自定義錯誤類型，如果直接是 AxiosError，則檢查 response.status
      if (err instanceof line.errors.HTTPError && err.statusCode) { // LINE SDK 自定義錯誤
          statusCode = err.statusCode;
      } else if (err.response && err.response.status) { // Axios 錯誤
          statusCode = err.response.status;
      } else if (err.name === 'SyntaxError') { // 例如 JSON 解析錯誤
          statusCode = 400;
      } else if (err.message.includes('Invalid signature') || err.message.includes('Unauthorized')) {
          statusCode = 401; // 如果是簽名錯誤，返回 401
      }
      res.status(statusCode).end();
    });
});

// 健康檢查路由
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 伺服器監聽啟動
app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.1.0 (整合所有修正與優化 - 修正取消課程 400 錯誤)`);

  // 設定定時清理任務
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS); // 每 24 小時清理一次

  // 設定定時檢查並發送提醒任務
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);

  // Keep-alive pinging (防止 Render 免費服務休眠)
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    // 首次 Ping
    try {
        await fetch(SELF_URL); // <-- 這裡會使用頂部引入的 fetch
        console.log(`Keep-alive initial ping to ${SELF_URL} successful.`);
    } catch (err) {
        console.error('❌ Keep-alive initial ping 失敗:', err.message);
    }
    // 定時 Ping
    setInterval(() => {
        fetch(SELF_URL) // <-- 這裡會使用頂部引入的 fetch
            .then(res => {
                if (!res.ok) { // 如果響應不是 2xx 狀態碼
                    console.error(`❌ Keep-alive ping to ${SELF_URL} responded with status: ${res.status}`);
                } else {
                    console.log(`Keep-alive response from ${SELF_URL}: ${res.status}`);
                }
            })
            .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
    }, PING_INTERVAL_MS);
  } else {
    console.warn('⚠️ SELF_URL 未設定或使用預設值，Keep-alive 功能可能無法防止服務休眠。請在 .env 檔案中設定您的部署網址。');
  }
});
