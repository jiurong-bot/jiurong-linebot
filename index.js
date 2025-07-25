// index.js - V4.5.5T （隱藏身份切換）(Enhanced Push Error Logging)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Client } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

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
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID;

// 時間相關常數
const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;

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
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '@返回點數管理',
  },
  STUDENT: {
    MAIN_MENU: '@返回學員主選單',
    POINTS: '@點數管理', 
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CANCEL_PURCHASE: '❌ 取消購買',
    CANCEL_INPUT_LAST5: '❌ 取消輸入後五碼',
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    RETURN_POINTS_MENU: '返回點數管理',
    CONFIRM_BUY_POINTS: '✅ 確認購買',
    INPUT_LAST5_CARD_TRIGGER: '@輸入匯款後五碼',
    EDIT_LAST5_CARD_TRIGGER: '@修改匯款後五碼',
  }
};

// =====================================
//        資料庫初始化與工具函式
// =====================================
async function initializeDatabase() {
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
    global.courseIdCounter = maxId + 1;
    console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`);

    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。');

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
  }
}

initializeDatabase();

async function getUser(userId, dbClient = pgClient) { // Add optional client for transactions
  const res = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  const userData = res.rows[0];
  if (userData && typeof userData.history === 'string') {
    try {
      userData.history = JSON.parse(userData.history);
    } catch (e) {
      console.error(`❌ 解析用戶 ${userId} 歷史記錄 JSON 失敗:`, e.message);
      userData.history = [];
    }
  }
  return userData;
}

async function saveUser(user, dbClient = pgClient) { // Add optional client for transactions
  try {
    const existingUser = await dbClient.query('SELECT id FROM users WHERE id = $1', [user.id]);
    const historyJson = JSON.stringify(user.history || []);
    
    if (existingUser.rows.length > 0) {
      await dbClient.query(
        'UPDATE users SET name = $1, points = $2, role = $3, history = $4 WHERE id = $5',
        [user.name, user.points, user.role, historyJson, user.id]
      );
    } else {
      await dbClient.query(
        'INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5)',
        [user.id, user.name, user.points, user.role, historyJson]
      );
    }
  } catch (err) {
    console.error(`FATAL ERROR: saveUser 函式捕獲到錯誤!`, {
      message: err.message,
      stack: err.stack,
      userId: user.id,
    });
    throw err; // Re-throw to be caught by transaction handler
  }
}

async function getAllCourses(dbClient = pgClient) { // Add optional client for transactions
  const res = await dbClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    courses[row.id] = { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
  });
  return courses;
}

async function saveCourse(course, dbClient = pgClient) { // Add optional client for transactions
  const existingCourse = await dbClient.query('SELECT id FROM courses WHERE id = $1', [course.id]);
  if (existingCourse.rows.length > 0) {
    await dbClient.query('UPDATE courses SET title = $1, time = $2, capacity = $3, points_cost = $4, students = $5, waiting = $6 WHERE id = $7', [course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.id]);
  } else {
    await dbClient.query('INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)', [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]);
  }
}

async function deleteCourse(courseId, dbClient = pgClient) { // Add optional client for transactions
  await dbClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
}

async function getAllOrders(dbClient = pgClient) { // Add optional client for transactions
  const res = await dbClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, status: row.status, timestamp: row.timestamp.toISOString() };
  });
  return orders;
}

async function saveOrder(order, dbClient = pgClient) { // Add optional client for transactions
  try {
    const existingOrder = await dbClient.query('SELECT order_id FROM orders WHERE order_id = $1', [order.orderId]);
    if (existingOrder.rows.length > 0) {
      await dbClient.query('UPDATE orders SET user_id = $1, user_name = $2, points = $3, amount = $4, last_5_digits = $5, status = $6, timestamp = $7 WHERE order_id = $8', [order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp, order.orderId]);
    } else {
      await dbClient.query('INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', 
        [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]);
    }
  } catch (err) {
    console.error('❌ saveOrder 函式錯誤:', err.message, 'Order ID:', order.orderId);
    throw err; // Re-throw to be caught by transaction handler
  }
}

async function deleteOrder(orderId, dbClient = pgClient) { // Add optional client for transactions
  await dbClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

async function cleanCoursesDB() {
  const now = Date.now();
  await pgClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
}

async function reply(replyToken, content, menu = null) {
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
    await client.replyMessage(replyToken, messages);
    console.log(`DEBUG: reply - 成功回覆訊息給 ${replyToken}`);
  } catch (error) {
    console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response : error.message);
  }
}

// 修正後的 push 函式，增強錯誤記錄
async function push(to, content) {
  let messages;
  if (Array.isArray(content)) {
    // 如果 content 已經是一個陣列，直接使用
    messages = content;
  } else if (typeof content === 'string') {
    // 如果是字串，包裝成文字訊息物件
    messages = [{ type: 'text', text: content }];
  } else if (typeof content === 'object' && content !== null && content.type) {
    // 如果是單個 Line Message Object (包括 Flex Message)，直接放入陣列
    messages = [content];
  } else {
    // 預防性措施，如果收到不明內容，發送錯誤提示或忽略
    console.error(`WARN: push 函式收到不明內容，將發送預設錯誤訊息。`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }

  try {
    await client.pushMessage(to, messages);
    console.log(`DEBUG: push - 成功推播訊息給 ${to}`);
  } catch (error) {
    // --- 增強錯誤日誌 ---
    if (error.originalError && error.originalError.response) {
        console.error(`❌ push 函式發送失敗給 ${to}:`, 
                      `狀態碼: ${error.originalError.response.status},`,
                      `訊息: ${error.originalError.response.statusText},`);
        // 嘗試打印響應數據，這通常包含詳細的 LINE API 錯誤信息
        if (error.originalError.response.data) {
            console.error(`響應數據:`, error.originalError.response.data);
        }
    } else {
        console.error(`❌ push 函式發送失敗給 ${to}:`, error.message);
    }
  }
}

function formatDateTime(isoString) {
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
}

// =====================================
//               📋 快速選單定義
// =====================================
const studentMenu = [
    { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
    { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
    { type: 'message', label: '點數管理', text: COMMANDS.STUDENT.POINTS },
    // 已隱藏切換身份選項，但功能仍可透過指令使用
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
    // 已隱藏切換身份選項，但功能仍可透過指令使用
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
  console.log(`DEBUG: handleTeacherCommands - 處理指令: "${text}", 用戶ID: ${userId}`);

  const courses = await getAllCourses();

  // 處理手動調整點數的輸入 (如果還處於這個狀態且不是其他指令)
  if (pendingManualAdjust[userId]) {
      console.log(`DEBUG: handleTeacherCommands - 進入手動調整點數流程，當前狀態: ${pendingManualAdjust[userId].step}`);
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, '已取消手動調整點數。', teacherMenu);
      }
      
      const parts = text.split(' ');
      if (parts.length !== 2) {
          console.log(`DEBUG: 手動調整點數 - 格式錯誤，收到 "${text}"`);
          return reply(replyToken, '指令格式錯誤。\n請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5\n或輸入 @返回點數管理 取消。');
      }
      const targetIdentifier = parts[0];
      const amount = parseInt(parts[1]);
      if (isNaN(amount) || amount === 0) {
          console.log(`DEBUG: 手動調整點數 - 點數數量無效，收到 "${parts[1]}"`);
          return reply(replyToken, '點數數量必須是非零整數。');
      }
      let foundUser = await getUser(targetIdentifier);
      if (!foundUser) {
          const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) foundUser = res.rows[0];
      }
      if (!foundUser) {
          console.log(`DEBUG: 手動調整點數 - 找不到學員: "${targetIdentifier}"`);
          delete pendingManualAdjust[userId]; // 找不到學員也清除狀態，避免循環
          return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherMenu);
      }

      console.log(`DEBUG: 手動調整點數 - 找到學員 ${foundUser.name} (ID: ${foundUser.id})，原始點數: ${foundUser.points}`); 
      
      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);
      if (operation === '扣點' && foundUser.points < absAmount) {
          console.log(`DEBUG: 手動調整點數 - 學員點數不足，無法扣點。`);
          delete pendingManualAdjust[userId];
          return reply(replyToken, `學員 ${foundUser.name} 點數不足。`, teacherMenu);
      }

      // --- TRANSACTION START ---
      try {
          await pgClient.query('BEGIN');
          // Re-fetch user inside transaction to avoid race conditions
          const userInTransaction = await getUser(foundUser.id, pgClient);
          userInTransaction.points += amount;

          console.log(`DEBUG: 手動調整點數 - 學員 ${userInTransaction.name} 點數計算後: ${userInTransaction.points}`); 
          
          if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
          userInTransaction.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
          
          await saveUser(userInTransaction, pgClient); // Pass client to use transaction
          await pgClient.query('COMMIT');

          push(userInTransaction.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
          delete pendingManualAdjust[userId];
          return reply(replyToken, `✅ 已成功為學員 ${userInTransaction.name} ${operation} ${absAmount} 點，目前點數：${userInTransaction.points} 點。`, teacherMenu);
      } catch (err) {
          await pgClient.query('ROLLBACK');
          console.error('❌ 手動調整點數交易失敗:', err.message);
          delete pendingManualAdjust[userId];
          return reply(replyToken, '操作失敗，資料庫發生錯誤，請稍後再試。', teacherMenu);
      }
      // --- TRANSACTION END ---

  } else if (text !== COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST && !text.match(/^\S+\s+(-?\d+)$/)) {
      // 如果不是手動調整點數相關的指令，則清除 pendingManualAdjust 狀態
      // 這個 else if 確保只在不是手動調整點數的文字輸入時才清除
      if (pendingManualAdjust[userId]) {
          console.log(`DEBUG: handleTeacherCommands - 清除 pendingManualAdjust 狀態，因為收到新指令: "${text}"`);
          delete pendingManualAdjust[userId];
      }
  }


  // 以下是其他指令的處理邏輯
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    console.log(`DEBUG: handleTeacherCommands - 處理 MAIN_MENU`);
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    console.log(`DEBUG: handleTeacherCommands - 處理 POINT_MANAGEMENT`);
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
      altText: '點數管理功能',
      contents: { type: 'carousel', contents: pointManagementBubbles },
    };

    const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];
    return reply(replyToken, flexMessage, menuOptions);
  }

  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
    console.log(`DEBUG: handleTeacherCommands - 處理 COURSE_MANAGEMENT 相關指令`);
    const now = Date.now();
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
                label: '取消此課程',
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
    console.log(`DEBUG: handleTeacherCommands - 處理 SEARCH_STUDENT`);
    const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT + ' ', '').trim();
    if (!query) {
      return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }
    let foundUser = null;
    const userById = await getUser(query);
    if (userById && userById.role === 'student') {
        foundUser = userById;
    }
    if (!foundUser) {
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
    if (foundUser.history && foundUser.history.length > 0) {
      foundUser.history.slice(-5).reverse().forEach(record => {
        studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
    } else {
      studentInfo += `無歷史記錄。\n`;
    }
    return reply(replyToken, studentInfo.trim(), teacherMenu);
  }

  if (text === COMMANDS.TEACHER.REPORT) {
    console.log(`DEBUG: handleTeacherCommands - 處理 REPORT`);
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
    console.log(`DEBUG: handleTeacherCommands - 處理 PENDING_ORDERS`);

    // 1. 立即回覆，避免 reply token 超時
    // 這裡只回覆一個提示訊息，不包含 Quick Reply
    reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));

    // 2. 在背景執行耗時的資料庫查詢，並使用 pushMessage 推送結果
    (async () => {
        try {
            const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
            const pendingConfirmationOrders = ordersRes.rows.map(row => ({
                orderId: row.order_id, userId: row.user_id, userName: row.user_name,
                points: row.points, amount: row.amount, last5Digits: row.last_5_digits,
                timestamp: row.timestamp.toISOString()
            }));

            if (pendingConfirmationOrders.length === 0) {
                // 如果沒有訂單，也用 push 通知
                return push(userId, '目前沒有待確認的購點訂單。');
            }

            // 使用 Flex Message 來顯示每筆訂單，並提供確認/退回按鈕
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => { // 最多顯示10筆訂單
                return {
                    type: 'bubble',
                    header: {
                        type: 'box', layout: 'vertical',
                        contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }],
                        backgroundColor: '#ff9e00', // Pending order color
                        paddingAll: 'lg'
                    },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' },
                            { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' },
                            { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `匯款後五碼: ${order.last5Digits || 'N/A'}`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, wrap: true, size: 'sm', color: '#666666' }
                        ],
                    },
                    footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0,
                        contents: [
                            {
                                type: 'button', style: 'primary', color: '#52b69a', height: 'sm',
                                action: {
                                    type: 'postback',
                                    label: '✅ 確認',
                                    data: `action=confirm_order&orderId=${order.orderId}`,
                                    displayText: `確認訂單 ${order.orderId} 入帳`
                                },
                            },
                            {
                                type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                                action: {
                                    type: 'postback',
                                    label: '❌ 退回',
                                    data: `action=reject_order&orderId=${order.orderId}`, // 新增的退回動作
                                    displayText: `退回訂單 ${order.orderId}`
                                },
                            },
                        ],
                    },
                };
            });

            const flexMessage = {
                type: 'flex',
                altText: '待確認購點訂單列表',
                contents: { type: 'carousel', contents: orderBubbles }
            };

            // 3. 使用 push 將帶有 Flex Message 的結果發送出去
            await push(userId, flexMessage);

        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            // 發生錯誤時，也用 push 通知使用者
            await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
        }
    })();
    
    // 因為我們已經用非同步方式處理，這裡直接返回，結束函式
    return;
  }

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    console.log(`DEBUG: handleTeacherCommands - 處理 MANUAL_ADJUST_POINTS，設定 pendingManualAdjust 狀態。`);
    pendingManualAdjust[userId] = { step: 1 };
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回老師主選單 取消。', [ // 修改這裡的取消指令
      { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU } // 修改這裡的按鈕
    ]);
  }

  console.log(`DEBUG: handleTeacherCommands - 未匹配任何已知指令。`);
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}

// =====================================
//        🔄 購點流程處理函式 (重構)
// =====================================
async function handlePurchaseFlow(event, userId) {
  // 如果使用者不在購點流程中，或收到的不是文字訊息，則直接返回 false
  if (!pendingPurchase[userId] || event.message.type !== 'text') {
    return false;
  }

  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];

  // 通用取消和返回邏輯
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
      delete pendingPurchase[userId];
      await reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
      return true; // Flow handled
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
      // 模擬點擊「點數管理」回到該選單
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true; // Flow handled
  }

  switch (stepData.step) {
    case 'input_last5':
      const orderId = stepData.data.orderId;
      const last5Digits = text;

      if (!/^\d{5}$/.test(last5Digits)) {
        await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
        return true; // Flow handled, but waiting for correct input
      }
      
      const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected')`, [orderId]);
      const order = ordersRes.rows[0];

      if (!order) {
        delete pendingPurchase[userId];
        await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
        return true;
      }

      // --- TRANSACTION START ---
      try {
        await pgClient.query('BEGIN');
        // Re-fetch order inside transaction
        const orderInTransaction = (await pgClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId])).rows[0];
        if (!orderInTransaction) {
          await pgClient.query('ROLLBACK');
          delete pendingPurchase[userId];
          await reply(replyToken, '無法找到此訂單或訂單已被處理，請重新開始購點流程。', studentMenu);
          return true;
        }

        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        
        await saveOrder({
          orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name,
          points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits,
          status: orderInTransaction.status, timestamp: orderInTransaction.timestamp.toISOString()
        }, pgClient); // Pass client for transaction
        await pgClient.query('COMMIT');

        delete pendingPurchase[userId]; // 完成後清除狀態

        await reply(replyToken, `✅ 已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。\n\n目前訂單狀態：等待老師確認。`);
        
        // 完成後，模擬用戶點擊「點數管理」按鈕，返回主介面
        await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
        return true; // Flow handled
      } catch (err) {
        await pgClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        delete pendingPurchase[userId];
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。', studentMenu);
        return true;
      }
      // --- TRANSACTION END ---

    case 'select_plan':
      const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
      if (!selectedPlan) {
        await reply(replyToken, '請從列表中選擇有效的點數方案。');
        return true;
      }
      stepData.data = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
      stepData.step = 'confirm_purchase';
      await reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
      ]);
      return true;

    case 'confirm_purchase':
      if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        // --- TRANSACTION START ---
        try {
          await pgClient.query('BEGIN');
          const orderId = `O${Date.now()}`;
          const newOrder = { ...stepData.data, orderId: orderId };
          await saveOrder(newOrder, pgClient); // Pass client for transaction
          await pgClient.query('COMMIT');

          delete pendingPurchase[userId]; // 完成後清除狀態
          await reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數管理」查看新的匯款提示卡片，並輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
        } catch (err) {
          await pgClient.query('ROLLBACK');
          console.error('❌ 確認購買交易失敗:', err.message);
          delete pendingPurchase[userId];
          await reply(replyToken, '確認購買時發生錯誤，請稍後再試。', studentMenu);
        }
        // --- TRANSACTION END ---

      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        delete pendingPurchase[userId]; // 取消後清除狀態
        await reply(replyToken, '已取消購買點數。', studentMenu);
      } else {
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
      }
      return true;
  }
  return false; // Flow not handled by this function, continue to other command handlers
}


// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  console.log(`DEBUG: handleStudentCommands - 處理指令: "${text}", 用戶ID: ${userId}`);

  // Refactored: Handle purchase flow first
  // 如果事件被購點流程處理掉了，就直接結束
  if (await handlePurchaseFlow(event, userId)) {
    return;
  }

  const user = await getUser(userId);
  const courses = await getAllCourses();

  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    // 清除所有與購點相關的 pending 狀態，回到主菜單
    delete pendingPurchase[userId]; 
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    // 進入點數功能時，確保清除 pendingPurchase 狀態，除非是明確進入 input_last5 或 edit_last5 流程
    if (!pendingPurchase[userId] || (pendingPurchase[userId].step !== 'input_last5' && pendingPurchase[userId].step !== 'edit_last5')) {
      delete pendingPurchase[userId]; 
    }

    // 查詢最近一筆狀態為 pending_payment, pending_confirmation, 或 rejected 的訂單
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    const pointBubbles = [];

    // 如果有待確認或待付款訂單，則新增提示卡片
    if (pendingOrder) {
        console.log(`DEBUG: POINTS - 發現待處理訂單 ${pendingOrder.order_id}，新增提示卡片。`);
        let actionButtonLabel;
        let actionButtonCommand;
        let cardTitle;
        let cardColor;
        let statusText;
        let additionalInfo = '';

        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionButtonCommand = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款已提交，等待確認';
            cardColor = '#ff9e00'; // 黃色表示已提交
            statusText = '已提交五碼，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交匯款後五碼';
            actionButtonCommand = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; // 仍然用這個觸發重新輸入
            cardTitle = '❌ 訂單被退回！';
            cardColor = '#d90429'; // 紅色表示被退回
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查匯款金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionButtonCommand = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
            cardTitle = '❗ 匯款待確認';
            cardColor = '#f28482'; // 淺紅色表示待提交
            statusText = '待付款';
        }

        pointBubbles.push({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px',
                contents: [
                    { type: 'text', text: `訂單 ID: ${pendingOrder.order_id}`, weight: 'bold', size: 'md', align: 'center' },
                    { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' },
                    { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' },
                    { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' },
                    ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), // Conditional additional info
                    { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }
                ],
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [{
                    type: 'button', style: 'primary', height: 'sm', color: '#de5246',
                    action: { type: 'message', label: actionButtonLabel, text: actionButtonCommand }
                }, {
                    type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae',
                    action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }
                }]
            }
        });
    }

    // 剩餘點數卡片
    pointBubbles.push({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px',
            contents: [
                { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' },
                { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' }
            ],
        },
        action: { type: 'message', label: '重新整理', text: COMMANDS.STUDENT.POINTS }
    });

    // 購買點數卡片
    pointBubbles.push({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px',
            contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }]
        },
        action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }
    });

    // 購點紀錄卡片
    pointBubbles.push({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px',
            contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }]
        },
        action: { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }
    });
    
    const flexMessage = {
        type: 'flex',
        altText: '點數管理選單',
        contents: { type: 'carousel', contents: pointBubbles }
    };

    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
  }

  // 處理點擊「輸入匯款後五碼」或「修改匯款後五碼」卡片按鈕
  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    // 這裡查詢包含 rejected 狀態的訂單，因為用戶可能想重新提交
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
      console.log(`DEBUG: INPUT/EDIT_LAST5_CARD_TRIGGER - 發現待處理訂單 ${pendingOrder.order_id}，引導用戶輸入/修改後五碼。`);
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } }; // 設定狀態，準備接收後五碼
      let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
      if (pendingOrder.status === 'rejected') {
        promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
      }
      return reply(replyToken, promptText, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 },
        { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
      ]);
    } else {
      // 如果沒有待處理訂單，但用戶點了這個按鈕，可能是誤觸或訂單已處理
      delete pendingPurchase[userId]; // 清除可能殘留的狀態
      return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。', studentPointSubMenu);
    }
  }


  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  // 修改 BUY_POINTS 處理邏輯
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
      // 如果有待處理訂單，引導用戶去處理它
      console.log(`DEBUG: BUY_POINTS - 發現待處理訂單 ${pendingOrder.order_id}，引導用戶處理。`);
      // 直接回到點數功能主畫面，因為卡片已經顯示了
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請在「點數管理」主頁面輸入後五碼，或選擇「❌ 取消購買」。`,
        [
          { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU },
          { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
        ]
      );
    } else {
      // 沒有待處理訂單，正常啟動購買流程
      console.log(`DEBUG: BUY_POINTS - 無待處理訂單，啟動新購買流程。`);
      pendingPurchase[userId] = { step: 'select_plan', data: {} };
      const planOptions = PURCHASE_PLANS.map(plan => ({
        type: 'message', label: plan.label, text: plan.label
      }));
      planOptions.push({ type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
      return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
    }
  }

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
        if (pendingOrder.status === 'pending_confirmation') {
            // 如果訂單已經提交後五碼，不允許用戶自行取消
            return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。', studentMenu);
        } else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
            // 如果訂單只是待付款或被退回，還沒有輸入後五碼，則可以取消
            // --- TRANSACTION START ---
            try {
              await pgClient.query('BEGIN');
              await deleteOrder(pendingOrder.order_id, pgClient); // Pass client for transaction
              await pgClient.query('COMMIT');
              delete pendingPurchase[userId]; // 清除狀態
              return reply(replyToken, '已取消您的購點訂單。', studentMenu);
            } catch (err) {
              await pgClient.query('ROLLBACK');
              console.error('❌ 取消購點訂單交易失敗:', err.message);
              return reply(replyToken, '取消訂單失敗，請稍後再試。', studentMenu);
            }
            // --- TRANSACTION END ---
        }
    }
    
    // 如果沒有找到任何待處理訂單，或者 pendingPurchase 狀態不符，則清除狀態
    if (pendingPurchase[userId]) {
      delete pendingPurchase[userId];
    }
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  // 修改 PURCHASE_HISTORY 處理邏輯
  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    // 這裡只顯示歷史記錄，因為待確認訂單已經顯示在主頁面了
    console.log(`DEBUG: PURCHASE_HISTORY - 顯示歷史記錄。`);
    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    }

    let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
    user.history.slice(-5).reverse().forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
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
                        text: `我要預約 ${course.id}`
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

    // --- TRANSACTION START ---
    try {
        await pgClient.query('BEGIN');
        const currentUser = await getUser(userId, pgClient); // Get user inside transaction

        if (currentUser.points < course.pointsCost) {
            await pgClient.query('ROLLBACK');
            return reply(replyToken, `你的點數不足，此課程需要 ${course.pointsCost} 點，你目前有 ${currentUser.points} 點。`, studentMenu);
        }

        // Re-fetch course inside transaction to avoid race conditions
        const courseInTransaction = (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
        if (!courseInTransaction) { // Should not happen if checked before, but good for robustness
            await pgClient.query('ROLLBACK');
            return reply(replyToken, '預約失敗，課程不存在或已被移除。', studentMenu);
        }

        if (courseInTransaction.students.length < courseInTransaction.capacity) {
          courseInTransaction.students.push(userId);
          currentUser.points -= courseInTransaction.points_cost; // Use points_cost from DB
          if (!Array.isArray(currentUser.history)) currentUser.history = [];
          currentUser.history.push({ id: courseId, action: `預約成功：${courseInTransaction.title} (扣 ${courseInTransaction.points_cost} 點)`, time: new Date().toISOString() });
          
          await saveCourse(courseInTransaction, pgClient);
          await saveUser(currentUser, pgClient);
          await pgClient.query('COMMIT');
          
          return reply(replyToken, `✅ 已成功預約課程：「${courseInTransaction.title}」，扣除 ${courseInTransaction.points_cost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
        } else {
          courseInTransaction.waiting.push(userId);
          if (!Array.isArray(currentUser.history)) currentUser.history = [];
          currentUser.history.push({ id: courseId, action: `加入候補：${courseInTransaction.title}`, time: new Date().toISOString() });
          await saveCourse(courseInTransaction, pgClient);
          await saveUser(currentUser, pgClient); // Save user to record history
          await pgClient.query('COMMIT');
          
          return reply(replyToken, `✅ 該課程「${courseInTransaction.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${courseInTransaction.points_cost} 點。`, studentMenu);
        }
    } catch (err) {
        await pgClient.query('ROLLBACK');
        console.error("❌ 預約課程交易失敗:", err.message);
        return reply(replyToken, '預約失敗，系統發生錯誤，請稍後再試。', studentMenu);
    }
    // --- TRANSACTION END ---
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

    // --- TRANSACTION START ---
    let replyMessage = '';
    try {
        await pgClient.query('BEGIN');
        
        // 1. Refund cancelling user
        const cancellingUser = await getUser(userId, pgClient);
        cancellingUser.points += course.pointsCost;
        if (!Array.isArray(cancellingUser.history)) cancellingUser.history = [];
        cancellingUser.history.push({ id, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
        await saveUser(cancellingUser, pgClient);
        
        // 2. Update course student list
        const updatedCourse = await (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
        updatedCourse.students = updatedCourse.students.filter(sid => sid !== userId);
        replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`;

        // 3. Handle waitlist promotion
        if (updatedCourse.waiting.length > 0 && updatedCourse.students.length < updatedCourse.capacity) {
            const nextWaitingUserId = updatedCourse.waiting.shift(); // Get and remove from waiting list
            const nextWaitingUser = await getUser(nextWaitingUserId, pgClient);

            if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
                updatedCourse.students.push(nextWaitingUserId);
                nextWaitingUser.points -= course.pointsCost;
                if (!Array.isArray(nextWaitingUser.history)) nextWaitingUser.history = [];
                nextWaitingUser.history.push({ id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                
                await saveUser(nextWaitingUser, pgClient);
                
                push(nextWaitingUserId, `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(updatedCourse.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`)
                    .catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));
                replyMessage += '\n有候補學生已遞補成功。';
            } else if (nextWaitingUser) {
                const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUser.id.substring(0, 4)}...)`; // Fix: Use nextWaitingUser.id
                replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
                if (TEACHER_ID) {
                  push(TEACHER_ID, `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已自動從候補名單移除該學生。`)
                    .catch(e => console.error('❌ 通知老師失敗', e.message));
                }
            } else {
                replyMessage += '\n候補名單中存在無效用戶，已移除。';
            }
        }
        await saveCourse(updatedCourse, pgClient);
        await pgClient.query('COMMIT');
        return reply(replyToken, replyMessage.trim(), studentMenu);
    } catch(err) {
        await pgClient.query('ROLLBACK');
        console.error("❌ 取消預約交易失敗:", err.message);
        return reply(replyToken, '取消預約失敗，系統發生錯誤，請稍後再試。', studentMenu);
    }
    // --- TRANSACTION END ---
  }

  if (text.startsWith('我要取消候補 ')) {
    const id = text.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    const now = Date.now(); // Fix: Corrected to Date.now() 

    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }

    // --- TRANSACTION START ---
    try {
      await pgClient.query('BEGIN');
      const courseInTransaction = (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const userInTransaction = await getUser(userId, pgClient);

      courseInTransaction.waiting = courseInTransaction.waiting.filter(x => x !== userId);
      if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
      userInTransaction.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });

      await saveCourse(courseInTransaction, pgClient);
      await saveUser(userInTransaction, pgClient);
      await pgClient.query('COMMIT');

      return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
    } catch(err) {
      await pgClient.query('ROLLBACK');
      console.error("❌ 取消候補交易失敗:", err.message);
      return reply(replyToken, '取消候補失敗，系統發生錯誤，請稍後再試。', studentMenu);
    }
    // --- TRANSACTION END ---
  }


  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}


// =====================================
//      🎯 主事件處理函式
// =====================================
async function handleEvent(event) {
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    console.log(`DEBUG: handleEvent - 收到事件類型: ${event.type}, 用戶ID: ${userId}`);
    if (event.type === 'message' && event.message.type === 'text') {
        console.log(`DEBUG: handleEvent - 收到文字訊息: "${event.message.text}"`);
    }

    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow' && event.type !== 'unfollow') {
        console.log(`Ignored event type: ${event.type}`);
        return;
    }
  
    if (event.type === 'follow') {
        console.log(`New user followed bot: ${userId}`);
        try {
            let user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
            await saveUser(user);
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            await saveUser(user);
            await reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。`, studentMenu);
        } catch (e) {
            console.error(`❌ 處理追蹤事件失敗 for ${userId}:`, e.message);
            await reply(replyToken, `哈囉！歡迎來到九容瑜伽小助手！`, studentMenu).catch(e => console.error(`❌ 追蹤事件預設回覆失敗:`, e.message));
        }
        return;
    }

    if (event.type === 'unfollow') {
        console.log(`User unfollowed bot: ${userId}`);
        return;
    }
  
    let user = await getUser(userId);
    if (!user) {
        user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
        await saveUser(user);
    }
    if (user.name === '匿名使用者' || !user.name) {
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            await saveUser(user);
        } catch (e) {
            console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
        }
    }

    // --- Postback 事件處理 ---
    if (event.type === 'postback') {
        console.log(`DEBUG: handleEvent - 處理 Postback 事件: ${event.postback.data}`);
        const data = event.postback.data;
        const params = new URLSearchParams(data);
        const postbackAction = params.get('action');
        const courseId = params.get('courseId');
        const orderId = params.get('orderId');

        const currentUser = await getUser(userId);
        
        // --- Teacher Postbacks ---
        if (currentUser.role === 'teacher') {
            if (postbackAction === 'add_course_start') {
                pendingCourseCreation[userId] = { step: 1, data: {} };
                return reply(replyToken, '請輸入課程名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            }

            if (postbackAction === 'cancel_course_confirm') {
                const courses = await getAllCourses();
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
                // --- TRANSACTION START ---
                try {
                    await pgClient.query('BEGIN');
                    const courses = await getAllCourses(pgClient);
                    const course = courses[courseId];
                    if (!course) { 
                        await pgClient.query('ROLLBACK');
                        return reply(replyToken, '找不到該課程，取消失敗。', teacherMenu); 
                    }
                    
                    // Notify and refund enrolled students
                    for (const stuId of course.students) {
                        const studentUser = await getUser(stuId, pgClient);
                        if (studentUser) {
                            studentUser.points += course.pointsCost;
                            if (!Array.isArray(studentUser.history)) studentUser.history = [];
                            studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                            await saveUser(studentUser, pgClient);
                            push(stuId, `【課程取消通知】\n您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，系統已自動退還 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 通知學員 ${stuId} 課程取消失敗:`, e.message));
                        }
                    }
                    // Notify waiting students
                    for (const waitId of course.waiting) {
                        const waitingUser = await getUser(waitId, pgClient);
                        if (waitingUser) {
                            if (!Array.isArray(waitingUser.history)) waitingUser.history = [];
                            waitingUser.history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
                            await saveUser(waitingUser, pgClient);
                            push(waitId, `【候補取消通知】\n您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`).catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
                        }
                    }
                    await deleteCourse(courseId, pgClient);
                    await pgClient.query('COMMIT');
                    
                    console.log(`✅ 課程 ${courseId} (${course.title}) 已成功取消。`);
                    return reply(replyToken, `✅ 課程「${course.title}」已成功取消，並已通知所有相關學員。`, teacherMenu);
                } catch(err) {
                    await pgClient.query('ROLLBACK');
                    console.error("❌ 課程取消交易失敗:", err.message);
                    return reply(replyToken, '取消課程失敗，系統發生錯誤，請稍後再試。', teacherMenu);
                }
                // --- TRANSACTION END ---
            }
        
            if (postbackAction === 'cancel_course_abort') {
                return reply(replyToken, '操作已取消。', teacherMenu);
            }
        
            if (postbackAction === 'confirm_order') {
                // --- TRANSACTION START ---
                try {
                    await pgClient.query('BEGIN');
                    const ordersRes = await pgClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    const order = ordersRes.rows[0];

                    if (!order || order.status !== 'pending_confirmation') {
                        await pgClient.query('ROLLBACK');
                        return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    }
                    
                    const studentUser = await getUser(order.user_id, pgClient); // Use order.user_id
                    if (!studentUser) {
                        await pgClient.query('ROLLBACK');
                        return reply(replyToken, `找不到購點學員 (ID: ${order.user_id}) 的資料。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    }

                    studentUser.points += order.points;
                    if (!Array.isArray(studentUser.history)) studentUser.history = [];
                    studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
                    order.status = 'completed';
                    
                    await saveUser(studentUser, pgClient);
                    await saveOrder(order, pgClient);
                    await pgClient.query('COMMIT');

                    await reply(replyToken, `✅ 已為學員 ${order.user_name} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    await push(order.user_id, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。`).catch(e => console.error(`❌ 通知學員 ${order.user_id} 購點成功失敗:`, e.message));
                } catch (err) {
                    await pgClient.query('ROLLBACK');
                    console.error("❌ 訂單確認交易失敗:", err.message);
                    return reply(replyToken, '訂單確認失敗，系統發生錯誤，請稍後再試。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                }
                // --- TRANSACTION END ---
            } 
            
            if (postbackAction === 'reject_order') { // 新增退回訂單的處理邏輯
                // --- TRANSACTION START ---
                try {
                    await pgClient.query('BEGIN');
                    const ordersRes = await pgClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    const order = ordersRes.rows[0];

                    if (!order || order.status !== 'pending_confirmation') {
                        await pgClient.query('ROLLBACK');
                        return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    }
                    
                    order.status = 'rejected'; // 設定訂單狀態為退回
                    await saveOrder(order, pgClient);
                    await pgClient.query('COMMIT');

                    await reply(replyToken, `❌ 已退回訂單 ${orderId}。已通知學員 ${order.user_name} 匯款資訊有誤。`, [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                    
                    // 通知學員修改匯款資訊
                    await push(order.user_id, `⚠️ 您的購點訂單 ${orderId} 被老師退回了！\n\n原因：匯款金額或匯款帳號後五碼有誤，請您檢查後重新提交。\n\n請您進入「點數管理」查看訂單狀態，並點擊「重新提交匯款後五碼」按鈕修正。`).catch(e => console.error(`❌ 通知學員 ${order.user_id} 訂單退回失敗:`, e.message));

                } catch (err) {
                    await pgClient.query('ROLLBACK');
                    console.error("❌ 訂單退回交易失敗:", err.message);
                    return reply(replyToken, '訂單退回失敗，系統發生錯誤，請稍後再試。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                }
                // --- TRANSACTION END ---
            }
        }
        
        // --- Student Postbacks ---
        if (currentUser.role === 'student') {
            const courses = await getAllCourses();
            const course = courses[courseId];
            if (!course) { return reply(replyToken, '找不到對應的課程，可能已被老師取消。', studentMenu); }

            // Cancel Booking Flow
            if (postbackAction === 'cancel_booking_confirm') {
                return reply(replyToken, {
                    type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消預約課程「${course.title}」嗎？\n點數將會退還。`,
                    quickReply: { items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，取消預約', data: `action=cancel_booking_execute&courseId=${course.id}`, displayText: `確認取消預約：${course.title}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 點錯了', text: COMMANDS.STUDENT.MY_COURSES } }
                    ]}
                });
            }
            if (postbackAction === 'cancel_booking_execute') {
                // Forward to the text command handler which now contains transaction logic
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
                // Forward to the text command handler which now contains transaction logic
                return handleStudentCommands({ ...event, message: { type: 'text', text: `我要取消候補 ${courseId}` } }, userId);
            }
        }
        return;
    }


    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }
    const text = event.message.text.trim();

    if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE && pendingCourseCreation[userId]) {
        delete pendingCourseCreation[userId];
        return reply(replyToken, '已取消新增課程流程並返回老師主選單。', teacherMenu);
    }

    if (pendingCourseCreation[userId]) {
        const stepData = pendingCourseCreation[userId];
        const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };
        switch (stepData.step) {
            case 1:
                stepData.data.title = text;
                stepData.step = 2;
                const weekdayOptions = Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day }));
                weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
                return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
            case 2:
                if (!weekdays.hasOwnProperty(text)) {
                    return reply(replyToken, '請選擇正確的星期。');
                }
                stepData.data.weekday = text;
                stepData.step = 3;
                return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 3:
                if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
                    return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
                }
                stepData.data.time = text;
                stepData.step = 4;
                return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 4:
                const capacity = parseInt(text);
                if (isNaN(capacity) || capacity <= 0) {
                    return reply(replyToken, '人數上限必須是正整數。');
                }
                stepData.data.capacity = capacity;
                stepData.step = 5;
                return reply(replyToken, '請輸入課程所需扣除的點數（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 5:
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
            case 6:
                if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                    const targetWeekdayIndex = weekdays[stepData.data.weekday];
                    const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);
                    const now = new Date();
                    const taipeiOffsetHours = 8;
                    let courseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    let dayDiff = (targetWeekdayIndex - courseDate.getUTCDay() + 7) % 7;
                    const currentHourTaipei = now.getHours();
                    const currentMinuteTaipei = now.getMinutes();
                    if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
                        dayDiff = 7;
                    }
                    courseDate.setUTCDate(courseDate.getUTCDate() + dayDiff);
                    courseDate.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);
                    const isoTime = courseDate.toISOString();
                    const newId = `C${String(global.courseIdCounter++).padStart(3, '0')}`;
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

    if (text === COMMANDS.SWITCH_ROLE) {
        const currentUser = await getUser(userId);
        if (currentUser.role === 'teacher') {
            currentUser.role = 'student';
            await saveUser(currentUser);
            return reply(event.replyToken, '已切換為學員身份。', studentMenu);
        } else {
            pendingTeacherLogin[userId] = true;
            return reply(event.replyToken, '請輸入老師密碼登入。', [{ type: 'message', label: '取消登入', text: '@取消登入' }]);
        }
    }
    
    if (pendingTeacherLogin[userId]) {
        if (text === '@取消登入') {
             delete pendingTeacherLogin[userId];
             return reply(replyToken, '已取消老師登入。', studentMenu);
        }
        if (text === TEACHER_PASSWORD) {
            const currentUser = await getUser(userId);
            currentUser.role = 'teacher';
            await saveUser(currentUser);
            delete pendingTeacherLogin[userId];
            return reply(replyToken, '老師登入成功。', teacherMenu);
        } else {
            delete pendingTeacherLogin[userId];
            return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
        }
    }

    const finalUser = await getUser(userId);
    console.log(`DEBUG: handleEvent - 用戶 ${userId} 角色: ${finalUser.role}`);
    if (finalUser.role === 'teacher') {
        console.log(`DEBUG: handleEvent - 呼叫 handleTeacherCommands`);
        return handleTeacherCommands(event, userId);
    } else {
        console.log(`DEBUG: handleEvent - 呼叫 handleStudentCommands`);
        return handleStudentCommands(event, userId);
    }
}

// =====================================
//           自動提醒功能
// =====================================
async function checkAndSendReminders() {
    const now = Date.now();
    const courses = await getAllCourses();
    const usersRes = await pgClient.query('SELECT id, name FROM users');
    const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u]));

    for (const id in courses) {
        const course = courses[id];
        const courseTime = new Date(course.time).getTime();
        const timeUntilCourse = courseTime - now;
        const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); 

        if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
            console.log(`🔔 準備發送課程提醒：${course.title}`);
            for (const studentId of course.students) {
                const student = dbUsersMap.get(studentId);
                if (student) {
                    try {
                        await push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`);
                    } catch (e) {
                        console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
                    }
                }
            }
            sentReminders[id] = true;
        }
    }
    for (const id in sentReminders) {
        const course = courses[id];
        if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) {
            delete sentReminders[id];
        }
    }
}

// =====================================
//           LINE Webhook 與伺服器啟動
// =====================================
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
  console.log(`Bot 版本: V4.5.5T (Enhanced Push Error Logging)`);

  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);

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
