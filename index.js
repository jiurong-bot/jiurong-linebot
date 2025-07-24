// index.js - V4.5.0T (Transactional update, bug fixes, refactoring)

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
    POINTS: '@點數功能', // 更改為點數功能
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
    RETURN_POINTS_MENU: '返回點數功能',
    CONFIRM_BUY_POINTS: '✅ 確認購買',
    INPUT_LAST5_CARD_TRIGGER: '@輸入匯款後五碼', // 新增的隱藏指令，用於觸發輸入輸入後五碼流程
    EDIT_LAST5_CARD_TRIGGER: '@修改匯款後五碼', // 新增的隱藏指令，用於觸發修改後五碼流程
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
  await dbClient.query('DELETE FROM orders WHERE id = $1', [orderId]);
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
  } catch (error) {
    console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response : error.message);
  }
}

async function push(to, content) {
  const messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  try {
    await client.pushMessage(to, messages);
  } catch (error) {
    console.error(`❌ push 函式發送失敗給 ${to}:`, error.originalError ? error.originalError.response : error.message);
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
  console.log(`DEBUG: handleTeacherCommands - 處理指令: "${text}", 用戶ID: ${userId}`);

  const courses = await getAllCourses();

  // 處理手動調整點數的輸入
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
      if (!foundUser) {
          const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) foundUser = res.rows[0];
      }
      if (!foundUser) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherMenu);
      }
      
      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);
      if (operation === '扣點' && foundUser.points < absAmount) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, `學員 ${foundUser.name} 點數不足。`, teacherMenu);
      }

      // 使用交易確保操作原子性
      try {
          await pgClient.query('BEGIN');
          foundUser.points += amount;
          if (!Array.isArray(foundUser.history)) foundUser.history = [];
          foundUser.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
          await saveUser(foundUser, pgClient); // Pass client to use transaction
          await pgClient.query('COMMIT');

          push(foundUser.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${foundUser.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
          delete pendingManualAdjust[userId];
          return reply(replyToken, `✅ 已成功為學員 ${foundUser.name} ${operation} ${absAmount} 點，目前點數：${foundUser.points} 點。`, teacherMenu);
      } catch (err) {
          await pgClient.query('ROLLBACK');
          console.error('❌ 手動調整點數交易失敗:', err.message);
          delete pendingManualAdjust[userId];
          return reply(replyToken, '操作失敗，資料庫發生錯誤，請稍後再試。', teacherMenu);
      }
  } else if (text !== COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST && !text.match(/^\S+\s+(-?\d+)$/)) {
      if (pendingManualAdjust[userId]) {
          delete pendingManualAdjust[userId];
      }
  }

  // 以下是其他指令的處理邏輯
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    const pendingOrdersCount = (await pgClient.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
    const pointManagementBubbles = [ /* ...UI Code is unchanged... */ ];
    // ... rest of the function is unchanged ...
  }
  
  // The rest of this function has no database modifications, so it remains unchanged.
  // ...
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}


// =====================================
//        🔄 購點流程處理函式 (重構)
// =====================================
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') {
    return false; // Not in a purchase flow or not a text message
  }

  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];

  // 通用取消和返回邏輯
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    // This cancel logic is now handled in handleStudentCommands, so we just clear state here.
    delete pendingPurchase[userId];
    const message = text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 ? '已取消輸入匯款帳號後五碼。' : '已取消購買點數。';
    await reply(replyToken, message, studentMenu);
    return true; // Flow handled
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    delete pendingPurchase[userId];
    await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
    return true; // Flow handled
  }

  switch (stepData.step) {
    case 'input_last5':
      const orderId = stepData.data.orderId;
      const last5Digits = text;

      if (!/^\d{5}$/.test(last5Digits)) {
        await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
        return true;
      }
      
      const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation')`, [orderId]);
      const order = ordersRes.rows[0];

      if (!order) {
        delete pendingPurchase[userId];
        await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
        return true;
      }

      order.last_5_digits = last5Digits;
      order.status = 'pending_confirmation';
      await saveOrder({
        orderId: order.order_id, userId: order.user_id, userName: order.user_name,
        points: order.points, amount: order.amount, last5Digits: order.last_5_digits,
        status: order.status, timestamp: order.timestamp.toISOString()
      });
      delete pendingPurchase[userId];

      await reply(replyToken, `✅ 已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。\n\n目前訂單狀態：等待老師確認。`);
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true;

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
        const orderId = `O${Date.now()}`;
        const newOrder = { ...stepData.data, orderId: orderId };
        await saveOrder(newOrder);
        delete pendingPurchase[userId];
        await reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數功能」查看新的匯款提示卡片，並輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        delete pendingPurchase[userId];
        await reply(replyToken, '已取消購買點數。', studentMenu);
      } else {
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
      }
      return true;
  }
  return false; // Flow not handled by this function
}


// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  console.log(`DEBUG: handleStudentCommands - 處理指令: "${text}", 用戶ID: ${userId}`);

  // Refactored: Handle purchase flow first
  if (await handlePurchaseFlow(event, userId)) {
    return; // Exit if the purchase flow handler managed the event
  }

  const user = await getUser(userId);
  const courses = await getAllCourses();

  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    delete pendingPurchase[userId]; 
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
     // ... UI Code is unchanged ...
    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
  }

  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    // ... Logic is unchanged ...
  }

  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }
  
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    // ... Logic is unchanged ...
  }

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    if (pendingOrder) {
        if (pendingOrder.status === 'pending_confirmation') {
            return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。', studentMenu);
        } else if (pendingOrder.status === 'pending_payment') {
            await deleteOrder(pendingOrder.order_id);
            delete pendingPurchase[userId];
            return reply(replyToken, '已取消您的購點訂單。', studentMenu);
        }
    }
    
    if (pendingPurchase[userId]) delete pendingPurchase[userId];
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    // ... Logic is unchanged ...
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    // ... UI Code is unchanged ...
  }

  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    const course = courses[courseId];
    const now = Date.now(); // BUG FIX

    if (!course) return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    if (new Date(course.time).getTime() < now) return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
    if (course.students.includes(userId)) return reply(replyToken, '你已經預約此課程了。', studentMenu);
    if (course.waiting.includes(userId)) return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    if (user.points < course.pointsCost) return reply(replyToken, `你的點數不足，此課程需要 ${course.pointsCost} 點，你目前有 ${user.points} 點。請先購買點數。`, studentMenu);

    // --- TRANSACTION START ---
    try {
        await pgClient.query('BEGIN');
        const currentUser = await getUser(userId, pgClient); // Get user inside transaction

        if (course.students.length < course.capacity) {
            course.students.push(userId);
            currentUser.points -= course.pointsCost;
            if (!Array.isArray(currentUser.history)) currentUser.history = [];
            currentUser.history.push({ id: courseId, action: `預約成功：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
            
            await saveCourse(course, pgClient);
            await saveUser(currentUser, pgClient);
            await pgClient.query('COMMIT');
            
            return reply(replyToken, `✅ 已成功預約課程：「${course.title}」，扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
        } else {
            course.waiting.push(userId);
            if (!Array.isArray(currentUser.history)) currentUser.history = [];
            currentUser.history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() });

            await saveCourse(course, pgClient);
            await saveUser(currentUser, pgClient); // Save user to record history
            await pgClient.query('COMMIT');
            
            return reply(replyToken, `✅ 該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${course.pointsCost} 點。`, studentMenu);
        }
    } catch (err) {
        await pgClient.query('ROLLBACK');
        console.error("❌ 預約課程交易失敗:", err.message);
        return reply(replyToken, '預約失敗，系統發生錯誤，請稍後再試。', studentMenu);
    }
    // --- TRANSACTION END ---
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
     // ... UI Code is unchanged ...
  }

  if (text.startsWith('我要取消預約 ')) {
    const id = text.replace('我要取消預約 ', '').trim();
    const course = courses[id];
    const now = Date.now(); // BUG FIX

    if (!course || !course.students.includes(userId)) return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    if (new Date(course.time).getTime() < now) return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    if (new Date(course.time).getTime() - now < EIGHT_HOURS_IN_MS) return reply(replyToken, `課程「${course.title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`, studentMenu);
    
    // --- TRANSACTION START ---
    let replyMessage = '';
    try {
        await pgClient.query('BEGIN');
        
        // 1. Refund cancelling user
        const cancellingUser = await getUser(userId, pgClient);
        cancellingUser.points += course.pointsCost;
        if (!Array.isArray(cancellingUser.history)) cancellingUser.history = [];
        cancellingUser.history.push({ id, action: `取消預約退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
        await saveUser(cancellingUser, pgClient);
        
        // 2. Update course student list
        course.students = course.students.filter(sid => sid !== userId);
        replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`;

        // 3. Handle waitlist promotion
        if (course.waiting.length > 0 && course.students.length < course.capacity) {
            const nextWaitingUserId = course.waiting.shift(); // Get and remove from waiting list
            const nextWaitingUser = await getUser(nextWaitingUserId, pgClient);

            if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
                course.students.push(nextWaitingUserId);
                nextWaitingUser.points -= course.pointsCost;
                if (!Array.isArray(nextWaitingUser.history)) nextWaitingUser.history = [];
                nextWaitingUser.history.push({ id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                
                await saveUser(nextWaitingUser, pgClient);
                
                push(nextWaitingUserId, `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));
                replyMessage += '\n有候補學生已遞補成功。';
            } else if (nextWaitingUser) {
                // If user exists but has no points, just remove them from waitlist (already done with .shift())
                const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
                replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
                if (TEACHER_ID) {
                    push(TEACHER_ID, `課程「${course.title}」有學生取消，但候補學生 ${studentName} 點數不足，未能遞補。`).catch(e => console.error('❌ 通知老師失敗', e.message));
                }
            } else {
                replyMessage += '\n候補名單中存在無效用戶，已移除。';
            }
        }

        await saveCourse(course, pgClient);
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
    const now = Date.now(); // BUG FIX

    if (!course || !course.waiting?.includes(userId)) return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    if (new Date(course.time).getTime() < now) return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    
    // This is a simple operation, but we use a transaction for consistency
    try {
      await pgClient.query('BEGIN');
      course.waiting = course.waiting.filter(x => x !== userId);
      if (!Array.isArray(user.history)) user.history = [];
      user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });

      await saveCourse(course, pgClient);
      await saveUser(user, pgClient);
      await pgClient.query('COMMIT');

      return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
    } catch(err) {
      await pgClient.query('ROLLBACK');
      console.error("❌ 取消候補交易失敗:", err.message);
      return reply(replyToken, '取消候補失敗，系統發生錯誤，請稍後再試。', studentMenu);
    }
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
        return;
    }
  
    if (event.type === 'follow') { /* ... Logic is unchanged ... */ }
    if (event.type === 'unfollow') { /* ... Logic is unchanged ... */ }
  
    let user = await getUser(userId);
    if (!user) { /* ... Logic is unchanged ... */ }
    if (user.name === '匿名使用者' || !user.name) { /* ... Logic is unchanged ... */ }

    // --- Postback 事件處理 ---
    if (event.type === 'postback') {
        const data = event.postback.data;
        const params = new URLSearchParams(data);
        const postbackAction = params.get('action');
        const courseId = params.get('courseId');
        const orderId = params.get('orderId');

        const currentUser = await getUser(userId);
        
        if (currentUser.role === 'teacher') {
            if (postbackAction === 'add_course_start') { /* ... Logic is unchanged ... */ }
            if (postbackAction === 'cancel_course_confirm') { /* ... Logic is unchanged ... */ }

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

                    // Refund all students
                    for (const stuId of course.students) {
                        const studentUser = await getUser(stuId, pgClient);
                        if (studentUser) {
                            studentUser.points += course.pointsCost;
                            studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                            await saveUser(studentUser, pgClient);
                            push(stuId, `【課程取消通知】\n您預約的課程「${course.title}」...`).catch(e => console.error(`❌ 通知學員 ${stuId} 課程取消失敗:`, e.message));
                        }
                    }
                    // Notify waiting list
                    for (const waitId of course.waiting) { /* ... push notification logic ... */ }
                    
                    await deleteCourse(courseId, pgClient);
                    await pgClient.query('COMMIT');

                    return reply(replyToken, `✅ 課程「${course.title}」已成功取消，並已通知所有相關學員。`, teacherMenu);
                } catch(err) {
                    await pgClient.query('ROLLBACK');
                    console.error("❌ 課程取消交易失敗:", err.message);
                    return reply(replyToken, '取消課程失敗，系統發生錯誤，請稍後再試。', teacherMenu);
                }
                // --- TRANSACTION END ---
            }
        
            if (postbackAction === 'cancel_course_abort') { /* ... Logic is unchanged ... */ }
        
            if (postbackAction === 'confirm_order' || postbackAction === 'cancel_order') {
                // --- TRANSACTION START ---
                try {
                    await pgClient.query('BEGIN');
                    const orders = await getAllOrders(pgClient);
                    const order = orders[orderId];
                    if (!order || order.status !== 'pending_confirmation') { /* ... error handling ... */ }
                    const studentUser = await getUser(order.userId, pgClient);
                    if (!studentUser) { /* ... error handling ... */ }

                    if (postbackAction === 'confirm_order') {
                        studentUser.points += order.points;
                        studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
                        order.status = 'completed';
                        await saveUser(studentUser, pgClient);
                        await saveOrder(order, pgClient);
                        await pgClient.query('COMMIT');

                        await reply(replyToken, `✅ 已為學員 ${order.userName} 加點...`);
                        await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！...`);
                    } else if (postbackAction === 'cancel_order') {
                        order.status = 'cancelled';
                        await saveOrder(order, pgClient);
                        await pgClient.query('COMMIT');
                        await reply(replyToken, `❌ 已取消訂單 ${orderId} ...`);
                    }
                } catch (err) {
                    await pgClient.query('ROLLBACK');
                    console.error("❌ 訂單處理交易失敗:", err.message);
                    return reply(replyToken, '訂單處理失敗，系統發生錯誤，請稍後再試。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);
                }
                // --- TRANSACTION END ---
            }
        }
        
        if (currentUser.role === 'student') { /* ... Logic is unchanged, it just calls handleStudentCommands ... */ }
        return;
    }

    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }
    const text = event.message.text.trim();

    // --- Course Creation Flow (No transactions needed as it's stateful) ---
    if (pendingCourseCreation[userId]) { /* ... Logic is unchanged ... */ }
    
    // --- Role Switching and Login Flow ---
    if (text === COMMANDS.SWITCH_ROLE) { /* ... Logic is unchanged ... */ }
    if (pendingTeacherLogin[userId]) { /* ... Logic is unchanged ... */ }

    // --- Final routing to command handlers ---
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
async function checkAndSendReminders() { /* ... Logic is unchanged ... */ }

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

app.post('/webhook', (req, res) => { /* ... Logic is unchanged ... */ });

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.5.0T`); // Updated version number

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
