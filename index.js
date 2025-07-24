// index.js - V4.4.3b (Bug Fix: 修正老師指令狀態管理 & orders 表 order_id 欄位錯誤 & 優化資料庫查詢)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Client } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto = require('crypto');
// 修正：如果 Node.js 版本低於 18，則需要手動引入 node-fetch
// 如果您的 Render 環境是 Node.js 18+，可以移除此行並直接使用全局的 fetch
const fetch = require('node-fetch'); // 確保 node-fetch 模組已安裝 (npm install node-fetch)

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
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 設定與密碼
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/'; // 請務必替換為您的實際部署網址
const TEACHER_ID = process.env.TEACHER_ID; // 老師的 LINE User ID

// 時間相關常數
const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5; // 5 分鐘
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 5 分鐘

// 購點方案定義
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// 銀行匯款資訊
const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
};

// 指令常數
const COMMANDS = {
  SWITCH_ROLE: '@切換身份',
  TEACHER: {
    MAIN_MENU: '@返回老師主選單',
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表', // 這個指令似乎沒有直接使用，但保留
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '@返回點數管理', // 這是手動調整點數狀態下的「返回」指令
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
    CANCEL_BOOKING: '@取消預約', // 這是 postback action 的 displayText
    CANCEL_WAITING: '@取消候補', // 這是 postback action 的 displayText
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    RETURN_POINTS_MENU: '返回點數功能', // 購點流程中的返回
    CONFIRM_BUY_POINTS: '✅ 確認購買',
  }
};

// =====================================
//        資料庫初始化與工具函式
// =====================================
async function initializeDatabase() {
  try {
    await pgClient.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');

    // 修正：將 users 表的 id 欄位改為 user_id
    await pgClient.query(`CREATE TABLE IF NOT EXISTS users (user_id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]')`);
    console.log('✅ 檢查並建立 users 表完成');

    // 修正：將 courses 表的 id 欄位改為 course_id
    await pgClient.query(`CREATE TABLE IF NOT EXISTS courses (course_id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    console.log('✅ 檢查並建立 courses 表完成');

    await pgClient.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    console.log('✅ 檢查並建立 orders 表完成');

    // 修正：查詢 courses 表時使用 course_id
    const result = await pgClient.query("SELECT MAX(SUBSTRING(course_id FROM 2)::INTEGER) AS max_id FROM courses WHERE course_id LIKE 'C%'");
    let maxId = result.rows[0].max_id || 0;
    global.courseIdCounter = maxId + 1;
    console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`);

    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。');

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
  }
}

initializeDatabase();

// 修正：GetUser 函式現在使用 user_id
async function getUser(userId) {
  const res = await pgClient.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  const userData = res.rows[0];
  if (userData && typeof userData.history === 'string') {
    try {
        userData.history = JSON.parse(userData.history);
    } catch (e) {
        console.warn(`⚠️ 用戶 ${userId} 的歷史記錄解析失敗，可能不是合法的 JSON 字符串或已是物件。`, e.message);
        if (!Array.isArray(userData.history)) {
            userData.history = [];
        }
    }
  } else if (userData && !Array.isArray(userData.history)) {
      userData.history = [];
  }
  return userData;
}

// 修正：SaveUser 函式現在使用 user_id
async function saveUser(user) {
  const existingUser = await getUser(user.id); // 這裡的 user.id 是 LINE userId，對應到資料庫的 user_id
  const historyJson = JSON.stringify(Array.isArray(user.history) ? user.history : []);
  if (existingUser) {
    await pgClient.query('UPDATE users SET name = $1, points = $2, role = $3, history = $4 WHERE user_id = $5', [user.name, user.points, user.role, historyJson, user.id]);
  } else {
    await pgClient.query('INSERT INTO users (user_id, name, points, role, history) VALUES ($1, $2, $3, $4, $5)', [user.id, user.name, user.points, user.role, historyJson]);
  }
}

// 修正：GetAllCourses 函式現在使用 course_id
async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    // 修正：確保取出的欄位名稱與資料庫一致 (course_id)
    courses[row.course_id] = { id: row.course_id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
  });
  return courses;
}

// 修正：SaveCourse 函式現在使用 course_id
async function saveCourse(course) {
  const existingCourse = await pgClient.query('SELECT course_id FROM courses WHERE course_id = $1', [course.id]); // course.id 對應到資料庫的 course_id
  if (existingCourse.rows.length > 0) {
    await pgClient.query('UPDATE courses SET title = $1, time = $2, capacity = $3, points_cost = $4, students = $5, waiting = $6 WHERE course_id = $7', [course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.id]);
  } else {
    await pgClient.query('INSERT INTO courses (course_id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)', [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]);
  }
}

// 修正：DeleteCourse 函式現在使用 course_id
async function deleteCourse(courseId) {
  await pgClient.query('DELETE FROM courses WHERE course_id = $1', [courseId]);
}

async function getAllOrders() {
  const res = await pgClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, status: row.status, timestamp: row.timestamp.toISOString() };
  });
  return orders;
}

async function saveOrder(order) {
  const existingOrder = await pgClient.query('SELECT order_id FROM orders WHERE order_id = $1', [order.orderId]);
  if (existingOrder.rows.length > 0) {
    await pgClient.query('UPDATE orders SET user_id = $1, user_name = $2, points = $3, amount = $4, last_5_digits = $5, status = $6, timestamp = $7 WHERE order_id = $8', [order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp, order.orderId]);
  } else {
    await pgClient.query('INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]);
  }
}

async function deleteOrder(orderId) {
  await pgClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

async function cleanCoursesDB() {
  const now = Date.now();
  // 清理一天前已結束的課程
  await pgClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
}

// 修正：確保 quickReply label 長度不超過 20 個字元
async function reply(replyToken, content, menu = null) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else {
    messages = [content]; // 假定是 Flex Message 或其他 LINE Message 物件
  }

  if (menu && messages.length > 0) {
    messages[0].quickReply = { 
        items: menu.slice(0, 13).map(i => ({ 
            type: 'action', 
            action: {
                ...i, // 複製原始 action 物件的所有屬性
                label: i.label ? i.label.substring(0, 20) : '' // 確保 label 不超過 20 字元
            }
        })) 
    };
  }

  // --- DEBUG LOGGING ---
  console.log(`Debug: Preparing to reply to ${replyToken.substring(0, 8)}...`);
  console.log(`Debug: Messages content: ${JSON.stringify(messages, null, 2)}`);
  // --- END DEBUG LOGGING ---

  try {
    return await client.replyMessage(replyToken, messages);
  } catch (error) {
    console.error(`❌ replyMessage 失敗:`, error.message);
    if (error.originalError) {
      console.error('   Original Error Response:', JSON.stringify(error.originalError.response?.data, null, 2));
    }
    // 可以嘗試發送一個簡單的錯誤回覆
    try {
        await client.replyMessage(replyToken, { type: 'text', text: '抱歉，系統忙碌中，請稍後再試。' });
    } catch (e) {
        console.error('❌ 發送錯誤回覆也失敗:', e.message);
    }
  }
}

async function push(to, content) {
  const messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  try {
    return await client.pushMessage(to, messages);
  } catch (error) {
    console.error(`❌ pushMessage 失敗 to ${to}:`, error.message);
    if (error.originalError) {
      console.error('   Original Error Response:', JSON.stringify(error.originalError.response?.data, null, 2));
    }
  }
}

function formatDateTime(isoString) {
    if (!isoString) return '無效時間';
    const date = new Date(isoString);
    // 確保時區設定正確，'Asia/Taipei'
    const formatter = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
    const parts = formatter.formatToParts(date);
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    let weekday = parts.find(p => p.type === 'weekday').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    if (weekday.startsWith('週')) {
        weekday = weekday.slice(-1); // 將 '星期一' 轉為 '一'
    }
    return `${month}-${day}（${weekday}）${hour}:${minute}`;
}

// =====================================
//               📋 快速選單定義
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

const teacherMenu = [
    { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
    { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
    { type: 'message', label: '查詢學員', text: COMMANDS.TEACHER.SEARCH_STUDENT },
    { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
    { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE },
];


// =====================================
//      📌 暫存狀態物件
// =====================================
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const sentReminders = {};

// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  // 在處理老師指令前，先檢查並清除手動調整點數的狀態，避免指令混淆
  // 任何非手動調整點數輸入的指令都會清除此狀態
  // 修正：檢查是否為 COMMANDS.TEACHER.MANUAL_ADJUST_POINTS 本身，如果是則不清除狀態
  if (pendingManualAdjust[userId] && text !== COMMANDS.TEACHER.MANUAL_ADJUST_POINTS && text !== COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
    // 檢查是否是手動調整點數流程的後續輸入
    const isManualAdjustInput = pendingManualAdjust[userId].step === 1 && text.split(' ').length === 2 && !isNaN(parseInt(text.split(' ')[1]));
    if (!isManualAdjustInput) {
      console.log(`ℹ️ 老師 ${userId} 已跳出點數調整狀態。`);
      delete pendingManualAdjust[userId];
    }
  }

  // 處理手動調整點數的輸入 (如果還處於這個狀態且不是其他指令)
  if (pendingManualAdjust[userId]) {
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, '已取消手動調整點數。', teacherMenu);
      }
      
      const parts = text.split(' ');
      if (parts.length !== 2) {
          return reply(replyToken, '指令格式錯誤。\n請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5\n或輸入 @返回點數管理 取消。');
      }
      const targetIdentifier = parts[0];
      const amount = parseInt(parts[1]);
      if (isNaN(amount) || amount === 0) {
          return reply(replyToken, '點數數量必須是非零整數。');
      }
      
      let foundUser = await getUser(targetIdentifier);
      if (!foundUser || foundUser.role !== 'student') { // 確保查到的用戶是學生
          // 修正：從 users 表查詢時使用 user_id 和 name
          const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND (user_id = $1 OR LOWER(name) LIKE $2)`, [targetIdentifier, `%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) {
              foundUser = res.rows[0];
          } else if (res.rows.length === 0) { // 如果沒有找到精確匹配，嘗試模糊匹配
             // 確保這裡只有在精確匹配也找不到時才執行
             const fuzzyRes = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
             if (fuzzyRes.rows.length > 0) {
                 foundUser = fuzzyRes.rows[0]; // 選擇第一個匹配項
             }
          }
      }

      if (!foundUser) {
          delete pendingManualAdjust[userId]; // 找不到學員也清除狀態
          return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherMenu);
      }
      
      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);

      if (operation === '扣點' && foundUser.points < absAmount) {
          delete pendingManualAdjust[userId]; // 點數不足也清除狀態
          return reply(replyToken, `學員 ${foundUser.name} 點數不足，無法扣除 ${absAmount} 點。`, teacherMenu);
      }

      foundUser.points += amount;
      // 確保 history 是陣列
      foundUser.history = Array.isArray(foundUser.history) ? foundUser.history : []; 
      foundUser.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
      // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId，對應到資料庫的 user_id
      await saveUser({ ...foundUser, id: foundUser.user_id }); 
      
      // 通知學員點數變動
      await push(foundUser.user_id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${foundUser.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗 for ${foundUser.user_id}:`, e.message));
      
      delete pendingManualAdjust[userId];
      return reply(replyToken, `✅ 已成功為學員 ${foundUser.name} ${operation} ${absAmount} 點，目前點數：${foundUser.points} 點。`, teacherMenu);
  }
  
  // 其餘老師指令處理
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    // 修正：確保任何指令都會清除pendingCourseCreation狀態
    if (pendingCourseCreation[userId]) {
        delete pendingCourseCreation[userId];
        console.log(`ℹ️ 老師 ${userId} 已跳出課程新增狀態。`);
    }
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    const pendingOrdersCount = (await pgClient.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;

    const pointManagementBubbles = [
      {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }],
          backgroundColor: '#52b69a', paddingAll: 'lg'
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          contents: [
            { type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' },
            { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' },
          ],
          justifyContent: 'center', alignItems: 'center', height: '150px'
        },
        action: {
          type: 'message',
          label: '查看待確認訂單',
          text: COMMANDS.TEACHER.PENDING_ORDERS
        },
        styles: {
          body: { separator: false, separatorColor: '#EEEEEE' }
        }
      },
      {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }],
          backgroundColor: '#52b69a', paddingAll: 'lg'
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'xxl',
          contents: [
            { type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
          ],
          justifyContent: 'center', alignItems: 'center', height: '150px'
        },
        action: {
          type: 'message',
          label: '手動調整點數',
          text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS
        },
        styles: {
          body: { separator: false, separatorColor: '#EEEEEE' }
        }
      }
    ];

    const flexMessage = {
      type: 'flex',
      altText: '點數管理功能選單', // 更清晰的 altText
      contents: { type: 'carousel', contents: pointManagementBubbles },
    };

    const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];
    return reply(replyToken, flexMessage, menuOptions);
  }

  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
    // 進入課程管理時清除新增課程狀態
    if (pendingCourseCreation[userId]) {
        delete pendingCourseCreation[userId];
        console.log(`ℹ️ 老師 ${userId} 已跳出課程新增狀態。`);
    }

    const now = Date.now();
    const courses = await getAllCourses(); // 確保在這邊重新獲取最新課程列表
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    const courseBubbles = upcomingCourses.slice(0, 9).map(course => {
      return {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }],
          backgroundColor: '#52b69a', paddingAll: 'lg'
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          contents: [
            { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 },
              ],
            },
            {
              type: 'box', layout: 'baseline', spacing: 'sm',
              contents: [
                { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 },
                { type: 'text', text: `報名 ${course.students.length}/${course.capacity} (候補 ${course.waiting.length})`, wrap: true, color: '#666666', size: 'sm', flex: 5 },
              ],
            },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
          contents: [
            {
              type: 'button', style: 'primary', color: '#de5246', height: 'sm',
              action: {
                type: 'postback',
                label: `取消課程 ${course.id}`.substring(0, 20), // 修正：label 長度
                data: `action=cancel_course_confirm&courseId=${course.id}`,
                displayText: `準備取消課程：${course.title}`
              },
            },
          ],
        },
      };
    });

    const addCourseBubble = {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: 'xxl',
        contents: [
          {
            type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' },
              { type: 'text', text: '新增課程', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
            ],
            justifyContent: 'center', alignItems: 'center', height: '150px'
          },
        ],
      },
      action: {
        type: 'postback',
        label: '新增課程',
        data: 'action=add_course_start'
      },
      styles: {
        body: { separator: false, separatorColor: '#EEEEEE' }
      }
    };

    let introText = '課程管理面板';
    if (upcomingCourses.length === 0) {
        introText = '目前沒有任何未來課程，點擊「+」可新增。';
    }

    const flexMessage = {
      type: 'flex',
      altText: introText, 
      contents: { type: 'carousel', contents: [...courseBubbles, addCourseBubble] },
    };
    
    const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];

    return reply(replyToken, flexMessage, menuOptions);
  }

  if (text.startsWith(COMMANDS.TEACHER.SEARCH_STUDENT + ' ')) {
    const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT + ' ', '').trim();
    if (!query) {
      return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }
    let foundUser = null;
    // 修正： getUser 函式現在內部處理了 user_id
    const userById = await getUser(query); 
    if (userById && userById.role === 'student') {
        foundUser = userById;
    }
    if (!foundUser) {
        // 修正：按名稱模糊匹配時，也要從 users 表中查詢 role = 'student'
        const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
        if (res.rows.length > 0) {
            foundUser = res.rows[0];
            if (res.rows.length > 1) {
              await reply(replyToken, `找到多個匹配學員，顯示第一個：${foundUser.name}`);
            }
        }
    }

    if (!foundUser) {
      return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
    }

    let studentInfo = `學員姓名：${foundUser.name}\n`;
    studentInfo += `學員 ID：${foundUser.user_id}\n`; // 修正：顯示 user_id
    studentInfo += `剩餘點數：${foundUser.points} 點\n`;
    studentInfo += `歷史記錄 (近5筆)：\n`;
    if (foundUser.history && Array.isArray(foundUser.history) && foundUser.history.length > 0) {
      const sortedHistory = foundUser.history.slice().reverse();
      sortedHistory.slice(0, 5).forEach(record => {
        studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
    } else {
      studentInfo += `無歷史記錄。\n`;
    }
    return reply(replyToken, studentInfo, teacherMenu);
  }

  if (text === COMMANDS.TEACHER.REPORT) {
    const usersRes = await pgClient.query(`SELECT * FROM users WHERE role = 'student'`);
    const students = usersRes.rows;
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    // 活躍學員定義為有任何歷史記錄的學員
    const activeStudentsCount = students.filter(s => s.history && Array.isArray(s.history) && s.history.length > 0).length;

    const coursesRes = await pgClient.query(`SELECT * FROM courses`);
    const allCourses = coursesRes.rows;
    const totalCourses = allCourses.length;
    const now = Date.now();
    const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
    const completedCourses = totalCourses - upcomingCourses;

    const ordersRes = await pgClient.query(`SELECT * FROM orders`);
    const allOrders = ordersRes.rows;
    const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
    const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
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
    report += `  已完成訂單：${completedOrdersCount} 筆\n`;
    report += `  總收入 (已完成訂單)：${totalRevenue} 元\n`;

    return reply(replyToken, report.trim(), teacherMenu);
  }
  
  // 處理點擊「查看待確認清單」按鈕後的文字指令
  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
    const pendingConfirmationOrders = ordersRes.rows.map(row => ({
      orderId: row.order_id, userId: row.user_id, userName: row.user_name,
      points: row.points, amount: row.amount, last5Digits: row.last_5_digits,
      timestamp: row.timestamp.toISOString()
    }));

    if (pendingConfirmationOrders.length === 0) {
        return reply(replyToken, '目前沒有待確認的購點訂單。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
    }

    let replyMessage = '以下是待確認的購點訂單：\n\n';
    const displayOrders = pendingConfirmationOrders.slice(0, 6); // 最多顯示6筆
    displayOrders.forEach(order => {
      // --- DEBUG LOGGING ---
      console.log(`Debug: Displaying pending order - OrderId: ${order.orderId}, UserName: ${order.userName}, Status: ${order.status}`);
      // --- END DEBUG LOGGING ---
      replyMessage += `--- 訂單 #${order.orderId} ---\n`;
      replyMessage += `學員名稱: ${order.userName}\n`;
      replyMessage += `學員ID: ${order.userId.substring(0, 8)}...\n`;
      replyMessage += `購買點數: ${order.points} 點\n`;
      replyMessage += `應付金額: $${order.amount}\n`;
      replyMessage += `匯款後五碼: ${order.last5Digits || '未提供'}\n`; // 未提供顯示更友善
      replyMessage += `提交時間: ${formatDateTime(order.timestamp)}\n\n`;
    });

    // 動態生成快速回覆按鈕
    const quickReplyItems = displayOrders.flatMap(order => {
        // --- DEBUG LOGGING ---
        console.log(`Debug: Creating quick reply buttons for order - OrderId: ${order.orderId}`);
        // --- END DEBUG LOGGING ---
        return [
            { type: 'action', action: { type: 'postback', label: `✅ 確認#${order.orderId}`.substring(0, 20), data: `action=confirm_order&orderId=${order.orderId}`, displayText: `✅ 確認訂單 ${order.orderId} 入帳` } },
            { type: 'action', action: { type: 'postback', label: `❌ 取消#${order.orderId}`.substring(0, 20), data: `action=cancel_order&orderId=${order.orderId}`, displayText: `❌ 取消訂單 ${order.orderId}` } },
        ];
    });
    quickReplyItems.push({ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT });

    return reply(replyToken, {
      type: 'text', text: replyMessage.trim(),
      quickReply: { items: quickReplyItems }
    });
  }

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust[userId] = { step: 1 }; // 啟動手動調整點數狀態
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。', [
      { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
    ]);
  }

  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}

// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  // 修正： getUser 函式現在內部處理了 user_id
  const user = await getUser(userId);
  const courses = await getAllCourses();

  // 學員端任何指令都會清除購點流程中的狀態
  if (pendingPurchase[userId] && text !== COMMANDS.STUDENT.CANCEL_PURCHASE && text !== COMMANDS.STUDENT.CANCEL_INPUT_LAST5 && text !== COMMANDS.STUDENT.RETURN_POINTS_MENU && text !== COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
      // 如果是購點流程中的輸入後五碼，則不清除狀態
      const isLast5Input = pendingPurchase[userId].step === 'input_last5' && /^\d{5}$/.test(text);
      if (!isLast5Input) {
          console.log(`ℹ️ 學員 ${userId} 已跳出購點流程。`);
          delete pendingPurchase[userId];
      }
  }

  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    // 清除任何購點流程中的狀態，防止流程混淆
    delete pendingPurchase[userId];

    const pointBubbles = [
        {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px',
                contents: [
                    { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' },
                    { type: 'text', text: `上次查詢時間: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' }
                ],
            },
            action: { type: 'message', label: '重新整理', text: COMMANDS.STUDENT.POINTS }
        },
        {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px',
                contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }]
            },
            action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }
        },
        {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px',
                contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }]
            },
            action: { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }
        }
    ];
    
    const flexMessage = {
        type: 'flex',
        altText: '點數功能選單',
        contents: { type: 'carousel', contents: pointBubbles }
    };

    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
  }

  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation') ORDER BY timestamp DESC`, [userId]);
    const pendingOrder = ordersRes.rows[0]; // 只處理最新一筆待確認的訂單

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，金額 $${pendingOrder.amount} 元，請完成匯款並至「購點紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
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

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    // 查詢所有待付款/待確認的訂單
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation')`, [userId]);
    
    if (ordersRes.rows.length > 0) {
        // 取消所有待處理的訂單
        for (const order of ordersRes.rows) {
            await deleteOrder(order.order_id);
            console.log(`ℹ️ 已取消用戶 ${userId} 的訂單 ${order.order_id}。`);
        }
        delete pendingPurchase[userId]; // 清除狀態
        return reply(replyToken, '已取消您所有待處理的購點訂單。', studentMenu);
    }
    
    // 如果沒有待處理訂單，但 pendingPurchase 狀態還在（可能用戶剛進入購點流程但未選方案）
    if (pendingPurchase[userId]) {
        delete pendingPurchase[userId];
        return reply(replyToken, '已取消購買點數流程。', studentMenu);
    }
    
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation') ORDER BY timestamp DESC`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      return reply(replyToken, `您的訂單 ${pendingOrder.order_id} (購買 ${pendingOrder.points} 點，金額 $${pendingOrder.amount} 元) 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 },
        { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
      ]);
    }

    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    }

    let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
    // 確保 history 是陣列，並反向排序取最新五筆
    const sortedHistory = Array.isArray(user.history) ? user.history.slice().reverse() : [];
    sortedHistory.slice(0, 5).forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
  }

  // 處理輸入後五碼的邏輯
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

    if (!/^\d{5}$/.test(last5Digits)) {
      return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
    }

    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation')`, [orderId]);
    const order = ordersRes.rows[0];

    if (!order) {
      delete pendingPurchase[userId];
      return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
    }

    order.last_5_digits = last5Digits;
    order.status = 'pending_confirmation'; // 更新為待確認狀態
    await saveOrder({
      orderId: order.order_id, userId: order.user_id, userName: order.user_name,
      points: order.points, amount: order.amount, last5Digits: order.last_5_digits,
      status: order.status, timestamp: order.timestamp.toISOString()
    });
    delete pendingPurchase[userId];

    await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);
    if (TEACHER_ID) {
      await push(TEACHER_ID, `🔔 有新的購點訂單待確認！訂單 ID: ${orderId} (學員: ${order.userName}, 後五碼: ${last5Digits})。請點擊「@待確認清單」進入管理介面。`)
        .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
    }
    return;
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const upcoming = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now && !c.students.includes(userId) && !c.waiting.includes(userId))
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcoming.length === 0) {
      return reply(replyToken, '目前沒有您可以預約的新課程。', studentMenu);
    }

    const courseBubbles = upcoming.slice(0, 10).map(course => {
        const isFull = course.students.length >= course.capacity;
        return {
            type: 'bubble',
            header: {
                type: 'box', layout: 'vertical',
                contents: [{ type: 'text', text: '開放預約中', color: '#ffffff', weight: 'bold', size: 'md' }],
                backgroundColor: '#34a0a4', paddingAll: 'lg'
            },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'separator' },
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md',
                        contents: [
                            { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }
                        ]
                    },
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm',
                        contents: [
                            { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                        ]
                    },
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm',
                        contents: [
                            { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: `報名 ${course.students.length}/${course.capacity}`, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                        ]
                    },
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [{
                    type: 'button', style: 'primary', height: 'sm',
                    color: isFull ? '#ff9e00' : '#1a759f',
                    action: {
                        type: 'message',
                        label: isFull ? '加入候補' : '立即預約',
                        text: `我要預約 ${course.id}` // course.id 是 course_id
                    },
                }]
            }
        };
    });

    const flexMessage = {
        type: 'flex',
        altText: '可預約課程列表',
        contents: { type: 'carousel', contents: courseBubbles }
    };
    
    return reply(replyToken, [
        { type: 'text', text: '💡 請注意：課程開始前 8 小時不可退課。' },
        flexMessage
    ], [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
  }

  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
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
      course.students.push(userId);
      user.points -= course.pointsCost;
      // 確保 history 是陣列
      user.history = Array.isArray(user.history) ? user.history : []; 
      // 修正：歷史記錄中保存 course.id (即 course_id)
      user.history.push({ id: course.id, action: `預約成功：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
      await saveCourse(course);
      // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
      await saveUser({ ...user, id: userId }); 
      return reply(replyToken, `✅ 已成功預約課程：「${course.title}」，扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
    } else {
      course.waiting.push(userId);
      // 確保 history 是陣列
      user.history = Array.isArray(user.history) ? user.history : []; 
      // 修正：歷史記錄中保存 course.id (即 course_id)
      user.history.push({ id: course.id, action: `加入候補：${course.title}`, time: new Date().toISOString() });
      await saveCourse(course);
      // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
      await saveUser({ ...user, id: userId }); 
      return reply(replyToken, `✅ 該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${course.pointsCost} 點。`, studentMenu);
    }
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.values(courses)
        .filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now)
        .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
    const waitingCourses = Object.values(courses)
        .filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
        .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
        return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。', studentMenu);
    }
    
    const courseBubbles = [
        ...enrolledCourses.map(course => {
            const canCancel = new Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
            return {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'separator', margin: 'md'},
                        { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' },
                        { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' }
                    ]
                },
                footer: canCancel ? {
                    type: 'box', layout: 'vertical', spacing: 'sm',
                    contents: [{
                        type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                        // 修正： postback data 的 courseId 是 course.id (即 course_id)
                        action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `正在準備取消預約：${course.title}` }
                    }]
                } : undefined
            };
        }),
        ...waitingCourses.map(course => ({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'separator', margin: 'md'},
                    { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' },
                    { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [{
                    type: 'button', style: 'primary', color: '#8d99ae', height: 'sm',
                    // 修正： postback data 的 courseId 是 course.id (即 course_id)
                    action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `正在準備取消候補：${course.title}` }
                }]
            }
        }))
    ];

    const flexMessage = {
        type: 'flex',
        altText: '我的課程列表',
        contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) }
    };
    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
  }

  if (text.startsWith('我要取消預約 ')) {
    // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
    const id = text.replace('我要取消預約 ', '').trim(); 
    const course = courses[id];
    const now = Date.now();

    if (!course || !course.students.includes(userId)) {
      return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() - now < EIGHT_HOURS_IN_MS) {
      return reply(replyToken, `課程「${course.title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`, studentMenu);
    }

    course.students = course.students.filter(sid => sid !== userId);
    user.points += course.pointsCost;
    // 確保 history 是陣列
    user.history = Array.isArray(user.history) ? user.history : []; 
    user.history.push({ id, action: `取消預約退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });

    let replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`;

    // 處理候補學員遞補
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting[0];
      // 修正： getUser 函式現在內部處理了 user_id
      const nextWaitingUser = await getUser(nextWaitingUserId); 

      if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
        course.waiting.shift();
        course.students.push(nextWaitingUserId);
        nextWaitingUser.points -= course.pointsCost;
        // 確保 history 是陣列
        nextWaitingUser.history = Array.isArray(nextWaitingUser.history) ? nextWaitingUser.history : []; 
        nextWaitingUser.history.push({ id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
        // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
        await saveUser({ ...nextWaitingUser, id: nextWaitingUserId }); 
        await push(nextWaitingUserId, `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`)
            .catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));
        replyMessage += '\n有候補學生已遞補成功。';
      } else if (nextWaitingUser) {
        const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
        course.waiting.shift(); // 點數不足或用戶不存在都移除出候補名單
        if (TEACHER_ID) {
          push(TEACHER_ID, `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已自動從候補名單移除該學生。`)
            .catch(e => console.error('❌ 通知老師候補學生點數不足失敗:', e.message));
        }
      } else {
        // 如果候補列表裡有 ID 但查不到用戶 (可能用戶已封鎖或刪除)
        if (course.waiting.length > 0) {
            console.warn(`⚠️ 候補名單中發現無效用戶 ID: ${course.waiting[0]}，已從候補名單移除。`);
            course.waiting.shift(); // 移除無效用戶
            replyMessage += '\n候補名單中存在無效用戶，已移除。';
        }
      }
    }
    await saveCourse(course);
    // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
    await saveUser({ ...user, id: userId }); 
    return reply(replyToken, replyMessage, studentMenu);
  }

  if (text.startsWith('我要取消候補 ')) {
    // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
    const id = text.replace('我要取消候補 ', '').trim(); 
    const course = courses[id];
    const now = Date.now();

    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId);
    // 確保 history 是陣列
    user.history = Array.isArray(user.history) ? user.history : []; 
    user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    await saveCourse(course);
    // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
    await saveUser({ ...user, id: userId }); 
    return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
  }


  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}


// =====================================
//      🎯 主事件處理函式
// =====================================
async function handleEvent(event) {
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow' && event.type !== 'unfollow') {
        console.log(`Ignored event type: ${event.type}`);
        return;
    }
  
    if (event.type === 'follow') {
        console.log(`New user followed bot: ${userId}`);
        try {
            // 首次追蹤時，如果用戶不存在則創建，並嘗試獲取 displayName
            // 修正：這裡的 user.id 應該是 LINE userId，傳遞給 saveUser 的 user.id
            let user = await getUser(userId); // 內部已使用 user_id 查詢
            if (!user) {
                user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
            }
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
            await saveUser({ ...user, id: userId }); 
            await reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。`, studentMenu);
        } catch (e) {
            console.error(`❌ 處理追蹤事件或獲取用戶資料失敗 for ${userId}:`, e.message);
            await reply(replyToken, `哈囉！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。`, studentMenu).catch(e => console.error(`❌ 追蹤事件預設回覆失敗:`, e.message));
        }
        return;
    }

    if (event.type === 'unfollow') {
        console.log(`User unfollowed bot: ${userId}`);
        // 可以考慮在這裡刪除用戶資料或標記為非活躍
        return;
    }
  
    // 確保每次事件處理前都獲取最新的用戶資料
    // 修正： getUser 函式現在內部處理了 user_id
    let user = await getUser(userId);
    if (!user) {
        // 如果用戶資料不存在 (例如，在 unfollow 後重新 follow 或資料庫異常)，則重新初始化
        user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
        } catch (e) {
            console.error(`❌ 取得用戶資料失敗 for ${userId} (二次嘗試):`, e.message);
        }
        // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
        await saveUser({ ...user, id: userId }); 
    } else if (user.name === '匿名使用者' || !user.name) {
        // 如果用戶名稱是預設值或缺失，嘗試更新
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
            await saveUser({ ...user, id: userId }); 
        } catch (e) {
            console.error(`❌ 取得用戶資料失敗 for ${userId} (更新名稱):`, e.message);
        }
    }

    // --- Postback 事件處理 ---
    if (event.type === 'postback') {
        const data = event.postback.data;
        const params = new URLSearchParams(data);
        const postbackAction = params.get('action');
        const courseId = params.get('courseId'); // 這裡的 courseId 是資料庫中的 course_id
        const orderId = params.get('orderId');

        // --- DEBUG LOGGING ---
        console.log(`Debug: Received postback data: ${data}`);
        console.log(`Debug: Parsed postback - Action: ${postbackAction}, CourseId: ${courseId}, OrderId: ${orderId}`);
        // --- END DEBUG LOGGING ---

        // 修正： currentUser 來自於前面 getUser(userId) 的結果
        const currentUser = await getUser(userId); 
        
        // --- Teacher Postbacks ---
        if (currentUser.role === 'teacher') {
            // 清除任何老師狀態
            if (pendingCourseCreation[userId]) delete pendingCourseCreation[userId];
            if (pendingManualAdjust[userId]) delete pendingManualAdjust[userId];

            if (postbackAction === 'add_course_start') {
                pendingCourseCreation[userId] = { step: 1, data: {} };
                return reply(replyToken, '請輸入課程名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            }

            if (postbackAction === 'cancel_course_confirm') {
                const courses = await getAllCourses();
                // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
                const course = courses[courseId]; 
                if (!course) { return reply(replyToken, '找不到該課程，可能已被取消。', teacherMenu); }
                return reply(replyToken, {
                    type: 'text', text: `⚠️ 最終確認 ⚠️\n\n您確定要取消課程「${course.title}」嗎？\n\n此操作將會刪除課程、自動退點並通知所有相關學生，且無法復原！`,
                    quickReply: { items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，確認取消', data: `action=cancel_course_execute&courseId=${course.id}`, displayText: `正在取消課程：${course.title}` } },
                        { type: 'action', action: { type: 'postback', label: '❌ 否，返回', data: 'action=cancel_course_abort', displayText: '取消操作' } }
                    ]}
                });
            }

            if (postbackAction === 'cancel_course_execute') {
                const courses = await getAllCourses();
                // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
                const course = courses[courseId]; 
                if (!course) { return reply(replyToken, '找不到該課程，取消失敗。', teacherMenu); }
                
                // 退點並通知學員
                for (const stuId of course.students) {
                    // 修正： getUser 函式現在內部處理了 user_id
                    const studentUser = await getUser(stuId); 
                    if (studentUser) {
                        studentUser.points += course.pointsCost;
                        // 確保 history 是陣列
                        studentUser.history = Array.isArray(studentUser.history) ? studentUser.history : []; 
                        studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                        // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
                        await saveUser({ ...studentUser, id: stuId }); 
                        await push(stuId, `【課程取消通知】\n您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，系統已自動退還 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 通知學員 ${stuId} 課程取消失敗:`, e.message));
                        console.log(`✅ 已為學員 ${stuId} 退還 ${course.pointsCost} 點並發送通知。`);
                    } else {
                        console.warn(`⚠️ 課程 ${courseId} 的預約學員 ${stuId} 不存在，無法退點或通知。`);
                    }
                }
                // 通知候補學員
                for (const waitId of course.waiting) {
                    // 修正： getUser 函式現在內部處理了 user_id
                    const waitingUser = await getUser(waitId); 
                    if (waitingUser) {
                        // 確保 history 是陣列
                        waitingUser.history = Array.isArray(waitingUser.history) ? waitingUser.history : []; 
                        waitingUser.history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
                        // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
                        await saveUser({ ...waitingUser, id: waitId }); 
                        await push(waitId, `【候補取消通知】\n您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`).catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
                        console.log(`✅ 已通知候補學員 ${waitId} 課程取消。`);
                    } else {
                        console.warn(`⚠️ 課程 ${courseId} 的候補學員 ${waitId} 不存在，無法通知。`);
                    }
                }
                // 修正： deleteCourse 期待 course_id
                await deleteCourse(courseId); 
                console.log(`✅ 課程 ${courseId} (${course.title}) 已成功取消。`);
                return reply(replyToken, `✅ 課程「${course.title}」已成功取消，並已通知所有相關學員。`, teacherMenu);
            }
        
            if (postbackAction === 'cancel_course_abort') {
                return reply(replyToken, '操作已取消。', teacherMenu);
            }
        
            if (postbackAction === 'confirm_order' || postbackAction === 'cancel_order') {
                const orders = await getAllOrders();
                const order = orders[orderId];
                if (!order || order.status !== 'pending_confirmation') {
                    // --- DEBUG LOGGING ---
                    console.log(`Debug: Order ${orderId} not found or status not pending_confirmation.`);
                    // --- END DEBUG LOGGING ---
                    return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                }
                // 修正： getUser 函式現在內部處理了 user_id
                const studentUser = await getUser(order.userId); 
                if (!studentUser) {
                    // --- DEBUG LOGGING ---
                    console.log(`Debug: Student user ${order.userId} not found for order ${orderId}.`);
                    // --- END DEBUG LOGGING ---
                    return reply(replyToken, `找不到購點學員 (ID: ${order.userId}) 的資料。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                }
                if (postbackAction === 'confirm_order') {
                    studentUser.points += order.points;
                    // 確保 history 是陣列
                    studentUser.history = Array.isArray(studentUser.history) ? studentUser.history : []; 
                    studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
                    order.status = 'completed';
                    // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
                    await saveUser({ ...studentUser, id: order.userId }); 
                    await saveOrder(order);
                    await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。`).catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));
                    console.log(`✅ 訂單 ${orderId} 已確認，學員 ${order.userName} 獲得 ${order.points} 點。`);
                } else if (postbackAction === 'cancel_order') {
                    order.status = 'cancelled';
                    await saveOrder(order);
                    await reply(replyToken, `❌ 已取消訂單 ${orderId} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    console.log(`❌ 訂單 ${orderId} 已取消。`);
                }
            }
        }
        
        // --- Student Postbacks ---
        if (currentUser.role === 'student') {
            const courses = await getAllCourses();
            // 修正：從 getAllCourses 獲取的 course 物件使用 course_id 作為 key
            const course = courses[courseId]; 
            if (!course) { return reply(replyToken, '找不到對應的課程，可能已被老師取消。', studentMenu); }

            // Cancel Booking Flow
            if (postbackAction === 'cancel_booking_confirm') {
                // 檢查是否已過退課期限
                const now = Date.now();
                if (new Date(course.time).getTime() - now < EIGHT_HOURS_IN_MS) {
                    return reply(replyToken, `課程「${course.title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`, studentMenu);
                }
                return reply(replyToken, {
                    type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消預約課程「${course.title}」嗎？\n點數將會退還。`,
                    quickReply: { items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，取消預約', data: `action=cancel_booking_execute&courseId=${course.id}`, displayText: `確認取消預約：${course.title}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 點錯了', text: COMMANDS.STUDENT.MY_COURSES } }
                    ]}
                });
            }
            if (postbackAction === 'cancel_booking_execute') {
                return handleStudentCommands({ ...event, message: { type: 'text', text: `我要取消預約 ${courseId}` } }, userId);
            }

            // Cancel Waiting Flow
            if (postbackAction === 'cancel_waiting_confirm') {
                return reply(replyToken, {
                    type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消候補課程「${course.title}」嗎？`,
                    quickReply: { items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，取消候補', data: `action=cancel_waiting_execute&courseId=${course.id}`, displayText: `確認取消候補：${course.title}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 點錯了', text: COMMANDS.STUDENT.MY_COURSES } }
                    ]}
                });
            }
            if (postbackAction === 'cancel_waiting_execute') {
                return handleStudentCommands({ ...event, message: { type: 'text', text: `我要取消候補 ${courseId}` } }, userId);
            }
        }
        return;
    }


    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }
    const text = event.message.text.trim();

    // 處理老師新增課程流程中的取消指令
    if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE && pendingCourseCreation[userId]) {
        delete pendingCourseCreation[userId];
        // 修正：返回老師主選單
        return reply(replyToken, '已取消新增課程流程並返回老師主選單。', teacherMenu); 
    }

    // 處理老師新增課程的輸入流程
    if (pendingCourseCreation[userId]) {
        // 確保只有老師能觸發此狀態
        const currentUser = await getUser(userId);
        if (currentUser.role !== 'teacher') {
            delete pendingCourseCreation[userId]; // 如果不是老師，強制清除狀態
            return reply(replyToken, '您沒有權限執行此操作。', studentMenu);
        }

        const stepData = pendingCourseCreation[userId];
        const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };
        switch (stepData.step) {
            case 1: // 輸入課程名稱
                if (!text) { return reply(replyToken, '課程名稱不能為空。請重新輸入。'); }
                stepData.data.title = text;
                stepData.step = 2;
                const weekdayOptions = Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day }));
                weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
                return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
            case 2: // 輸入星期幾
                if (!weekdays.hasOwnProperty(text)) {
                    return reply(replyToken, '請選擇正確的星期。');
                }
                stepData.data.weekday = text;
                stepData.step = 3;
                return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 3: // 輸入時間
                if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
                    return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
                }
                stepData.data.time = text;
                stepData.step = 4;
                return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 4: // 輸入人員上限
                const capacity = parseInt(text);
                if (isNaN(capacity) || capacity <= 0) {
                    return reply(replyToken, '人數上限必須是正整數。');
                }
                stepData.data.capacity = capacity;
                stepData.step = 5;
                return reply(replyToken, '請輸入課程所需扣除的點數（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 5: // 輸入扣除點數
                const pointsCost = parseInt(text);
                if (isNaN(pointsCost) || pointsCost <= 0) {
                    return reply(replyToken, '扣除點數必須是正整數。');
                }
                stepData.data.pointsCost = pointsCost;
                stepData.step = 6;
                return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
                    { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
                ]);
            case 6: // 確認新增課程
                if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                    const targetWeekdayIndex = weekdays[stepData.data.weekday];
                    const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);
                    const nowInTaipei = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
                    const now = new Date(nowInTaipei); // 取得台北時區的當前時間
                    
                    let courseDate = new Date(now); 
                    
                    let dayDiff = (targetWeekdayIndex - courseDate.getDay() + 7) % 7; // 計算距離目標星期幾的天數
                    
                    // 如果是今天，但時間已過，則設定為下週
                    if (dayDiff === 0 && (courseDate.getHours() > targetHour || (courseDate.getHours() === targetHour && courseDate.getMinutes() >= targetMin))) {
                        dayDiff = 7;
                    }
                    
                    courseDate.setDate(courseDate.getDate() + dayDiff); // 調整日期到目標星期
                    courseDate.setHours(targetHour, targetMin, 0, 0); // 設定目標時間 (這是在台北時區的時間)
                    
                    // 將台北時間轉換回 UTC 的 ISO 格式儲存到資料庫
                    const isoTime = courseDate.toISOString(); 

                    const newId = `C${String(global.courseIdCounter++).padStart(3, '0')}`;
                    // 修正： course.id 應為 course_id
                    const newCourse = { id: newId, title: stepData.data.title, time: isoTime, capacity: stepData.data.capacity, pointsCost: stepData.data.pointsCost, students: [], waiting: [] };
                    await saveCourse(newCourse);
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}`, teacherMenu);
                } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, '已取消新增課程。', teacherMenu);
                } else {
                    return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」。`);
                }
        }
    }
    
    // 處理學員購點流程
    if (pendingPurchase[userId]) {
        const stepData = pendingPurchase[userId];
        switch (stepData.step) {
            case 'select_plan': // 選擇方案
                const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
                if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
                    delete pendingPurchase[userId];
                    return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
                }
                if (!selectedPlan) {
                    return reply(replyToken, '請從列表中選擇有效的點數方案。');
                }
                stepData.data = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
                stepData.step = 'confirm_purchase';
                return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
                    { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
                ]);
            case 'confirm_purchase': // 確認購買
                if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                    const orderId = `O${Date.now()}`; // 生成唯一訂單 ID
                    const newOrder = { ...stepData.data, orderId: orderId };
                    await saveOrder(newOrder);
                    delete pendingPurchase[userId];
                    return reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請至「購點紀錄」輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
                } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
                    delete pendingPurchase[userId];
                    return reply(replyToken, '已取消購買點數。', studentMenu);
                } else {
                    return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
                }
        }
    }

    // 處理角色切換指令
    if (text === COMMANDS.SWITCH_ROLE) {
        // 修正： currentUser 來自於前面 getUser(userId) 的結果
        const currentUser = await getUser(userId); 
        // 清除所有 pending 狀態，避免切換身份後還保留舊狀態
        if (pendingTeacherLogin[userId]) delete pendingTeacherLogin[userId];
        if (pendingCourseCreation[userId]) delete pendingCourseCreation[userId];
        if (pendingPurchase[userId]) delete pendingPurchase[userId];
        if (pendingManualAdjust[userId]) delete pendingManualAdjust[userId];

        if (currentUser.role === 'teacher') {
            currentUser.role = 'student';
            // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
            await saveUser({ ...currentUser, id: userId }); 
            console.log(`ℹ️ 用戶 ${userId} 已切換為學員身份。`);
            return reply(event.replyToken, '已切換為學員身份。', studentMenu);
        } else {
            pendingTeacherLogin[userId] = true; // 設置登入狀態
            console.log(`ℹ️ 用戶 ${userId} 嘗試以老師身份登入。`);
            return reply(event.replyToken, '請輸入老師密碼登入。', [{ type: 'message', label: '取消登入', text: '@取消登入' }]);
        }
    }
    
    // 處理老師登入密碼輸入
    if (pendingTeacherLogin[userId]) {
        if (text === '@取消登入') {
             delete pendingTeacherLogin[userId];
             console.log(`ℹ️ 用戶 ${userId} 已取消老師登入。`);
             return reply(replyToken, '已取消老師登入。', studentMenu);
        }
        if (text === TEACHER_PASSWORD) {
            // 修正： currentUser 來自於前面 getUser(userId) 的結果
            const currentUser = await getUser(userId); 
            currentUser.role = 'teacher';
            // 修正：saveUser 期待 user 物件的 id 屬性是 LINE userId
            await saveUser({ ...currentUser, id: userId }); 
            delete pendingTeacherLogin[userId];
            console.log(`✅ 用戶 ${userId} 成功登入為老師。`);
            return reply(replyToken, '老師登入成功。', teacherMenu);
        } else {
            delete pendingTeacherLogin[userId]; // 密碼錯誤則清除狀態
            console.log(`❌ 用戶 ${userId} 老師密碼錯誤。`);
            return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
        }
    }

    // 根據用戶角色分發指令
    // 修正： finalUser 來自於前面 getUser(userId) 的結果
    const finalUser = await getUser(userId); 
    if (finalUser.role === 'teacher') {
        return handleTeacherCommands(event, userId);
    } else {
        return handleStudentCommands(event, userId);
    }
}

// =====================================
//           自動提醒功能
// =====================================
async function checkAndSendReminders() {
    const now = Date.now();
    const courses = await getAllCourses();
    // 修正：查詢 users 表時使用 user_id
    const usersRes = await pgClient.query('SELECT user_id, name FROM users'); 
    const dbUsersMap = new Map(usersRes.rows.map(u => [u.user_id, u])); // 修正：map 使用 user_id 作為 key

    for (const id in courses) {
        const course = courses[id]; // course.id 是 course_id
        const courseTime = new Date(course.time).getTime();
        const timeUntilCourse = courseTime - now;
        // 定義提醒視窗：課程開始前1小時到1小時-5分鐘之間
        const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); 

        // 修正：確認 timeUntilCourse 在有效範圍內 (>0 且 <= 1小時)
        if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
            console.log(`🔔 準備發送課程提醒：${course.title} (ID: ${id})`);
            for (const studentId of course.students) {
                const student = dbUsersMap.get(studentId);
                if (student) {
                    try {
                        await push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`);
                        console.log(`   ✅ 已向學員 ${studentId} 發送提醒。`);
                    } catch (e) {
                        console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
                    }
                }
            }
            sentReminders[id] = true; // 標記為已發送
        }
    }
    // 清理已發送提醒的過期課程標記
    for (const id in sentReminders) {
        const course = courses[id];
        // 如果課程不存在或課程時間已經遠超過 (例如一天前)，則清除提醒標記
        if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) {
            delete sentReminders[id];
            console.log(`ℹ️ 已清除課程 ${id} 的提醒標記。`);
        }
    }
}

// =====================================
//           LINE Webhook 與伺服器啟動
// =====================================
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.headers['x-line-signature']) {
      req.rawBody = buf; // 將原始請求體儲存到 req.rawBody
    }
  }
}));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const channelSecret = config.channelSecret;
  if (signature && channelSecret) {
    const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');
    if (hash !== signature) {
      console.error('❌ LINE Webhook 簽名驗證失敗。');
      return res.status(401).send('Unauthorized: Invalid signature');
    }
  }

  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.4.3b - Modified`);

  // 定期清理過期課程
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  // 定期檢查並發送課程提醒
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);

  // Keep-alive 功能，防止 Heroku 等平台進入休眠
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    setInterval(() => {
        // 修正：確保 fetch 被正確調用，且處理 potential TypeError: fetch is not a
        // 如果您的 Node.js 版本是 18+，可以直接使用全局的 fetch，否則需要 node-fetch
        // 這裡已經引入了 require('node-fetch')，所以可以直接使用 fetch
        fetch(SELF_URL)
            .then(res => console.log(`Keep-alive response from ${SELF_URL}: ${res.status}`))
            .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
    }, PING_INTERVAL_MS);
  } else {
    console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。請設定 SELF_URL 環境變數以確保機器人持續運行。');
  }
});

