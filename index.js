// index.js - V4.9.0 (Optimized for Error Handling & Database Pooling)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Pool } = require('pg'); // 修改：引入 Pool
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

// 資料庫連接設定 - 修改為連接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // 連接池最大連接數
  idleTimeoutMillis: 30000, // 連接在被釋放之前可以閒置的時間
  connectionTimeoutMillis: 2000, // 客戶端在連接到資料庫時等待的毫秒數
});

// 設定與密碼
// 【安全性建議】TEACHER_PASSWORD 直接從環境變數讀取。對於生產環境，考慮使用更安全的認證機制，例如 OAuth 或更複雜的基於角色的訪問控制。
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

// 指令常數 - 【優化】新增更多魔法字串常量
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
    MANUAL_ADJUST_POINTS_FORMAT_HINT: '請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5', // 新增魔法字串
    STUDENT_SEARCH_CANCEL: '❌ 取消查詢', // 新增魔法字串
  },
  STUDENT: {
    MAIN_MENU: '@返回學員主選單',
    POINTS: '@點數管理',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CANCEL_PURCHASE: '❌ 取消購買',
    CANCEL_INPUT_LAST5: '❌ 取消輸入', // 修改：簡化文字
    CANCEL_INPUT_LAST5_FULL: '❌ 取消輸入後五碼', // 新增魔法字串：用於內部邏輯或訊息
    RETURN_POINTS_MENU: '返回點數管理', // 新增魔法字串：返回點數管理介面
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    CONFIRM_BUY_POINTS: '✅ 確認購買',
    INPUT_LAST5_CARD_TRIGGER: '@輸入匯款後五碼',
    EDIT_LAST5_CARD_TRIGGER: '@修改匯款後五碼',
  }
};

// =====================================
//        資料庫初始化與工具函式
// =====================================

async function initializeDatabase() {
  let client;
  try {
    client = await pool.connect(); // 從連接池獲取客戶端
    console.log('✅ 成功連接到 PostgreSQL 資料庫');

    await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]')`);
    console.log('✅ 檢查並建立 users 表完成');

    await client.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    console.log('✅ 檢查並建立 courses 表完成');

    await client.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    console.log('✅ 檢查並建立 orders 表完成');

    await cleanCoursesDB(client); // 傳遞 client
    console.log('✅ 首次資料庫清理完成。');

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
    // 【日誌詳盡度】增加更多錯誤細節
    if (err.stack) console.error(err.stack);
  } finally {
    if (client) client.release(); // 釋放客戶端回連接池
  }
}

initializeDatabase();

// --- 新增: 課程組代碼 (Prefix) 生成器 ---
async function generateUniqueCoursePrefix(dbClient) { // 接收 dbClient 參數
    let prefix;
    let isUnique = false;
    while (!isUnique) {
        const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        prefix = `${randomChar1}${randomChar2}`;

        const res = await dbClient.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        if (res.rows.length === 0) {
            isUnique = true;
        } else {
            console.log(`DEBUG: 生成的課程組代碼 ${prefix} 已存在，重新生成。`);
        }
    }
    return prefix;
}


async function getUser(userId, dbClient = pool) { // 修改：預設為 pool
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

async function saveUser(user, dbClient = pool) { // 修改：預設為 pool
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

async function getAllCourses(dbClient = pool) { // 修改：預設為 pool
  const res = await dbClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    courses[row.id] = { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
  });
  return courses;
}

async function saveCourse(course, dbClient = pool) { // 修改：預設為 pool
  const existingCourse = await dbClient.query('SELECT id FROM courses WHERE id = $1', [course.id]);
  if (existingCourse.rows.length > 0) {
    await dbClient.query('UPDATE courses SET title = $1, time = $2, capacity = $3, points_cost = $4, students = $5, waiting = $6 WHERE id = $7', [course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.id]);
  } else {
    await dbClient.query('INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)', [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]);
  }
}

async function deleteCourse(courseId, dbClient = pool) { // 修改：預設為 pool
  await dbClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
}

/**
 * 批次刪除特定前綴的課程。
 * @param {string} prefix - 要刪除的課程 ID 前綴 (例如 'Y', 'UT', 'UY')。
 * @param {Pool | Client} dbClient - PostgreSQL 連接池或客戶端。
 * @returns {Array<Object>} 被刪除的課程列表，包含其 ID 和標題。
 */
async function deleteCoursesByPrefix(prefix, dbClient = pool) { // 修改：預設為 pool
    const coursesToDeleteRes = await dbClient.query('SELECT id, title, time, points_cost, students, waiting FROM courses WHERE id LIKE $1', [`${prefix}%`]);
    const coursesToDelete = coursesToDeleteRes.rows.map(row => ({
        id: row.id,
        title: row.title,
        time: row.time.toISOString(),
        pointsCost: row.points_cost,
        students: row.students || [],
        waiting: row.waiting || []
    }));

    if (coursesToDelete.length === 0) {
        console.log(`ℹ️ 沒有找到以 ${prefix} 開頭的課程可供刪除。`);
        return [];
    }

    await dbClient.query('DELETE FROM courses WHERE id LIKE $1', [`${prefix}%`]);
    console.log(`✅ 已批次刪除 ${coursesToDelete.length} 堂以 ${prefix} 開頭的課程。`);
    return coursesToDelete;
}


async function getAllOrders(dbClient = pool) { // 修改：預設為 pool
  const res = await dbClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, status: row.status, timestamp: row.timestamp.toISOString() };
  });
  return orders;
}

async function saveOrder(order, dbClient = pool) { // 修改：預設為 pool
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
    // 【日誌詳盡度】增加更多錯誤細節
    if (err.stack) console.error(err.stack);
    throw err; // Re-throw to be caught by transaction handler
  }
}

async function deleteOrder(orderId, dbClient = pool) { // 修改：預設為 pool
  await dbClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

// 【優化】 cleanCoursesDB 接受 dbClient 參數，使其可以在事務中調用
async function cleanCoursesDB(dbClient = pool) {
  const now = Date.now();
  await dbClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
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
    // 【日誌詳盡度】統一錯誤處理，提供更詳細的日誌
    if (error.originalError && error.originalError.response) {
        console.error(`❌ reply 函式發送失敗給 ${replyToken}:`,
                      `狀態碼: ${error.originalError.response.status},`,
                      `訊息: ${error.originalError.response.statusText},`);
        if (error.originalError.response.data) {
            console.error(`響應數據:`, error.originalError.response.data);
        }
    } else {
        console.error(`❌ reply 函式發送失敗給 ${replyToken}:`, error.message);
    }
    throw error;
  }
}

// 修正後的 push 函式，增強錯誤記錄
async function push(to, content) {
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
    await client.pushMessage(to, messages);
    console.log(`DEBUG: push - 成功推播訊息給 ${to}`);
  } catch (error) {
    // 【日誌詳盡度】統一錯誤處理，提供更詳細的日誌
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
    throw error;
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
    {
        type: 'postback',
        label: '查詢學員',
        data: 'action=start_student_search',
        displayText: '準備查詢學員...'
    },
    { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
];


// =====================================
//      📌 暫存狀態物件
// =====================================
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const sentReminders = {};
const pendingStudentSearch = {};

// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  console.log(`DEBUG: handleTeacherCommands - 處理指令: "${text}", 用戶ID: ${userId}`);

  let pgClient; // 聲明一個變數用於事務
  try {
      pgClient = await pool.connect(); // 從連接池獲取客戶端
      // 【日誌詳盡度】使用結構化日誌
      console.log(`DEBUG: 老師指令處理 - 已獲取資料庫連線`);

      const courses = await getAllCourses(pgClient); // 傳遞 client

      // **(新增) 處理處於「查詢學員」狀態時的文字輸入**
      if (pendingStudentSearch[userId]) {
          if (text === COMMANDS.TEACHER.MAIN_MENU || text === COMMANDS.TEACHER.STUDENT_SEARCH_CANCEL) { // 【優化】使用常量
              delete pendingStudentSearch[userId];
              return reply(replyToken, '已取消學員查詢。', teacherMenu);
          }

          const query = text;
          let foundUser = null;
          const userById = await getUser(query, pgClient); // 傳遞 client
          if (userById && userById.role === 'student') {
              foundUser = userById;
          }
          if (!foundUser) {
              const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
              if (res.rows.length > 0) {
                  foundUser = res.rows[0];
              }
          }

          delete pendingStudentSearch[userId];

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

      // 處理手動調整點數的輸入 (如果還處於這個狀態且不是其他指令)
      if (pendingManualAdjust[userId]) {
          console.log(`DEBUG: 手動調整點數流程，當前狀態: ${pendingManualAdjust[userId].step}`);
          if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
              delete pendingManualAdjust[userId];
              return reply(replyToken, '已取消手動調整點數。', teacherMenu);
          }

          const parts = text.split(' ');
          if (parts.length !== 2) {
              console.log(`DEBUG: 手動調整點數 - 格式錯誤，收到 "${text}"`);
              return reply(replyToken, `指令格式錯誤。\n${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS_FORMAT_HINT}\n或輸入 ${COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST} 取消。`); // 【優化】使用常量
          }
          const targetIdentifier = parts[0];
          const amount = parseInt(parts[1]);
          if (isNaN(amount) || amount === 0) {
              console.log(`DEBUG: 手動調整點數 - 點數數量無效，收到 "${parts[1]}"`);
              return reply(replyToken, '點數數量必須是非零整數。');
          }
          let foundUser = await getUser(targetIdentifier, pgClient); // 傳遞 client
          if (!foundUser) {
              const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
              if (res.rows.length > 0) foundUser = res.rows[0];
          }
          if (!foundUser) {
              console.log(`DEBUG: 手動調整點數 - 找不到學員: "${targetIdentifier}"`);
              delete pendingManualAdjust[userId];
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
          await pgClient.query('BEGIN');
          try {
              // Re-fetch user inside transaction to avoid race conditions
              const userInTransaction = await getUser(foundUser.id, pgClient);
              userInTransaction.points += amount;

              console.log(`DEBUG: 手動調整點數 - 學員 ${userInTransaction.name} 點數計算後: ${userInTransaction.points}`);

              if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
              userInTransaction.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });

              await saveUser(userInTransaction, pgClient); // Pass client to use transaction
              await pgClient.query('COMMIT');

              // 【錯誤訊息統一處理】將 reply 改為 push
              push(userInTransaction.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
              delete pendingManualAdjust[userId];
              return reply(replyToken, `✅ 已成功為學員 ${userInTransaction.name} ${absAmount} 點，目前點數：${userInTransaction.points} 點。`, teacherMenu);
          } catch (err) {
              await pgClient.query('ROLLBACK');
              console.error('❌ 手動調整點數交易失敗:', err.message);
              // 【日誌詳盡度】增加更多錯誤細節
              if (err.stack) console.error(err.stack);
              delete pendingManualAdjust[userId];
              // 【錯誤訊息統一處理】將 reply 改為 push
              await push(userId, '操作失敗，資料庫發生錯誤，請稍後再試。');
              return; // 直接返回，因為已經 push 訊息了
          }
          // --- TRANSACTION END ---

      } else if (text !== COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST && !text.match(/^\S+\s+(-?\d+)$/)) {
          if (pendingManualAdjust[userId]) {
              console.log(`DEBUG: 清除 pendingManualAdjust 狀態，因為收到新指令: "${text}"`);
              delete pendingManualAdjust[userId];
          }
      }


      // 以下是其他指令的處理邏輯
      if (text === COMMANDS.TEACHER.MAIN_MENU) {
        console.log(`DEBUG: 處理 MAIN_MENU`);
        delete pendingManualAdjust[userId];
        delete pendingStudentSearch[userId];
        delete pendingCourseCreation[userId];
        return reply(replyToken, '已返回老師主選單。', teacherMenu);
      }

      if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        console.log(`DEBUG: 處理 POINT_MANAGEMENT`);
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

      // --- 修改：課程管理介面顯示邏輯 ---
      if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
        console.log(`DEBUG: 處理 COURSE_MANAGEMENT 相關指令`);
        const now = Date.now();
        const sevenDaysLater = now + (ONE_DAY_IN_MS * 7); // 未來七天

        let earliestUpcomingCourse = null;
        let earliestCourseTime = Infinity;

        const allCourses = Object.values(await getAllCourses(pgClient)); // 傳遞 client

        allCourses.forEach(course => {
            const courseTime = new Date(course.time).getTime();
            if (courseTime > now && courseTime <= sevenDaysLater) {
                if (courseTime < earliestCourseTime) {
                    earliestCourseTime = courseTime;
                    earliestUpcomingCourse = course;
                }
            }
        });

        const courseBubbles = [];

        if (earliestUpcomingCourse) {
          const coursePrefix = earliestUpcomingCourse.id.substring(0, 2);

          courseBubbles.push({
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical',
              contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }],
              backgroundColor: '#52b69a', paddingAll: 'lg'
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md',
              contents: [
                { type: 'text', text: earliestUpcomingCourse.title, weight: 'bold', size: 'xl', wrap: true },
                {
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [
                    { type: 'text', text: '課程組代碼', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: coursePrefix, wrap: true, color: '#666666', size: 'sm', flex: 5 },
                  ],
                },
                {
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [
                    { type: 'text', text: '未來最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 },
                  ],
                },
                {
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [
                    { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 },
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
                    label: '取消此課程組',
                    data: `action=cancel_course_group_confirm&prefix=${coursePrefix}`,
                    displayText: `準備取消 ${coursePrefix} 系列課程`
                  },
                },
              ],
            },
          });
        }

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

        courseBubbles.push(addCourseBubble);

        let introText = '課程管理面板';
        if (!earliestUpcomingCourse) {
            introText = '目前未來7天內沒有課程，點擊「+」可新增。';
        }

        const flexMessage = {
          type: 'flex',
          altText: introText,
          contents: { type: 'carousel', contents: courseBubbles },
        };

        const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];

        return reply(replyToken, [
            { type: 'text', text: introText },
            flexMessage
        ], menuOptions);
    }

      if (text === COMMANDS.TEACHER.REPORT) {
        console.log(`DEBUG: 處理 REPORT`);
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
        console.log(`DEBUG: 處理 PENDING_ORDERS`);

        // 1. 立即回覆，避免 reply token 超時
        // 【錯誤訊息統一處理】回覆一個提示訊息，並在後續用 push 發送詳細內容
        await reply(replyToken, '正在查詢待確認訂單，請稍候...');

        // 2. 在背景執行耗時的資料庫查詢，並使用 pushMessage 推送結果
        // 不需要單獨 catch，因為外層的 try-catch 會捕獲
        const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
        const pendingConfirmationOrders = ordersRes.rows.map(row => ({
            orderId: row.order_id, userId: row.user_id, userName: row.user_name,
            points: row.points, amount: row.amount, last5Digits: row.last_5_digits,
            timestamp: row.timestamp.toISOString()
        }));

        if (pendingConfirmationOrders.length === 0) {
            return push(userId, '目前沒有待確認的購點訂單。');
        }

        const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => {
            return {
                type: 'bubble',
                header: {
                    type: 'box', layout: 'vertical',
                    contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }],
                    backgroundColor: '#ff9e00',
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
                                data: `action=reject_order&orderId=${order.orderId}`,
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

        return; // 直接返回，因為已經 push 訊息了
      }

      if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
        console.log(`DEBUG: 處理 MANUAL_ADJUST_POINTS，設定 pendingManualAdjust 狀態。`);
        pendingManualAdjust[userId] = { step: 1 };
        return reply(replyToken, `請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS_FORMAT_HINT}\n\n輸入 ${COMMANDS.TEACHER.MAIN_MENU} 取消。`, [
          { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU }
        ]);
      }

      console.log(`DEBUG: 未匹配任何已知指令。`);
      return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);

  } catch (err) {
      console.error('❌ handleTeacherCommands 發生錯誤:', err.message);
      // 【日誌詳盡度】增加更多錯誤細節
      if (err.stack) console.error(err.stack);
      // 【錯誤訊息統一處理】任何未捕獲的錯誤都應該向老師推送一個統一的錯誤訊息
      await push(userId, '處理老師指令時發生未知錯誤，請稍後再試。');
      // 如果回覆尚未發送，嘗試發送一個通用的錯誤回覆
      try {
          // 這裡再次嘗試 reply 是為了確保在某些情況下能給予 immediate feedback
          // 但主要錯誤處理邏輯已經交給 push
          await reply(replyToken, '處理老師指令時發生錯誤。');
      } catch (e) {
          console.error('二次錯誤回覆失敗:', e.message);
      }
  } finally {
      if (pgClient) pgClient.release(); // 釋放客戶端回連接池
      // 【日誌詳盡度】使用結構化日誌
      console.log(`DEBUG: 老師指令處理 - 已釋放資料庫連線`);
  }
}

// =====================================
//        🔄 購點流程處理函式 (重構)
// =====================================
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') {
    return false;
  }

  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];

  // 通用取消和返回邏輯
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5_FULL) { // 【優化】使用常量
      delete pendingPurchase[userId];
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true;
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true;
  }

  let pgClient; // 聲明一個變數用於事務
  try {
      pgClient = await pool.connect(); // 從連接池獲取客戶端

      switch (stepData.step) {
        case 'input_last5':
          const orderId = stepData.data.orderId;
          const last5Digits = text;

          if (!/^\d{5}$/.test(last5Digits)) {
            await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
            return true;
          }

          const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected')`, [orderId]);
          const order = ordersRes.rows[0];

          if (!order) {
            delete pendingPurchase[userId];
            await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
            return true;
          }

          // --- TRANSACTION START ---
          await pgClient.query('BEGIN');
          try {
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
            }, pgClient);
            await pgClient.query('COMMIT');

            delete pendingPurchase[userId];

            await reply(replyToken, `✅ 已收到您的匯款帳號後五碼：**${last5Digits}**。\n感謝您的配合！我們將盡快為您核對並加點。\n\n目前訂單狀態：等待老師確認。`);

            await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
            return true;
          } catch (err) {
            await pgClient.query('ROLLBACK');
            console.error('❌ 提交後五碼交易失敗:', err.message);
            // 【日誌詳盡度】增加更多錯誤細節
            if (err.stack) console.error(err.stack);
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
            await pgClient.query('BEGIN');
            try {
              const orderId = `O${Date.now()}`;
              const newOrder = { ...stepData.data, orderId: orderId };
              await saveOrder(newOrder, pgClient);
              await pgClient.query('COMMIT');

              delete pendingPurchase[userId];
              await reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數管理」查看新的匯款提示卡片，並輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
            } catch (err) {
              await pgClient.query('ROLLBACK');
              console.error('❌ 確認購買交易失敗:', err.message);
              // 【日誌詳盡度】增加更多錯誤細節
              if (err.stack) console.error(err.stack);
              delete pendingPurchase[userId];
              await reply(replyToken, '確認購買時發生錯誤，請稍後再試。', studentMenu);
            }
            // --- TRANSACTION END ---

          } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
            delete pendingPurchase[userId];
            await reply(replyToken, '已取消購買點數。', studentMenu);
          } else {
            await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
          }
          return true;
      }
      return false;
  } catch (err) {
      console.error('❌ handlePurchaseFlow 獲取資料庫連線失敗或發生未知錯誤:', err.message);
      // 【日誌詳盡度】增加更多錯誤細節
      if (err.stack) console.error(err.stack);
      // 【錯誤訊息統一處理】向用戶推送錯誤訊息
      await push(userId, '購點流程中發生錯誤，請稍後再試。');
      // 如果回覆尚未發送，嘗試發送一個通用的錯誤回覆
      try {
          await reply(replyToken, '購點流程發生錯誤。');
      } catch (e) {
          console.error('二次錯誤回覆失敗:', e.message);
      }
      return true; // 即使出錯，也認為此流程已被處理
  } finally {
      if (pgClient) pgClient.release(); // 釋放客戶端回連接池
  }
}


// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  console.log(`DEBUG: 處理學生指令: "${text}", 用戶ID: ${userId}`);

  // Refactored: Handle purchase flow first
  if (await handlePurchaseFlow(event, userId)) {
    return;
  }

  let pgClient; // 聲明一個變數用於事務
  try {
      pgClient = await pool.connect(); // 從連接池獲取客戶端
      // 【日誌詳盡度】使用結構化日誌
      console.log(`DEBUG: 學員指令處理 - 已獲取資料庫連線`);

      const user = await getUser(userId, pgClient); // 傳遞 client
      const courses = await getAllCourses(pgClient); // 傳遞 client

      if (text === COMMANDS.STUDENT.MAIN_MENU) {
        delete pendingPurchase[userId];
        return reply(replyToken, '已返回學員主選單。', studentMenu);
      }

      if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
        if (!pendingPurchase[userId] || (pendingPurchase[userId].step !== 'input_last5' && pendingPurchase[userId].step !== 'edit_last5')) {
          delete pendingPurchase[userId];
        }

        const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = ordersRes.rows[0];

        const pointBubbles = [];

        if (pendingOrder) {
            console.log(`DEBUG: 點數管理 - 發現待處理訂單 ${pendingOrder.order_id}，新增提示卡片。`);
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
                cardColor = '#ff9e00';
                statusText = '已提交五碼，等待老師確認';
            } else if (pendingOrder.status === 'rejected') {
                actionButtonLabel = '重新提交匯款後五碼';
                actionButtonCommand = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
                cardTitle = '❌ 訂單被退回！';
                cardColor = '#d90429';
                statusText = '訂單被老師退回';
                additionalInfo = '請檢查匯款金額或後五碼，並重新提交。';
            } else { // pending_payment
                actionButtonLabel = '輸入匯款後五碼';
                actionButtonCommand = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
                cardTitle = '❗ 匯款待確認';
                cardColor = '#f28482';
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
                        ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []),
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
                        action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } // 【優化】使用常量
                    }]
                }
            });
        }

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

        pointBubbles.push({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px',
                contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }]
            },
            action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }
        });

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
        const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = ordersRes.rows[0];

        if (pendingOrder) {
          console.log(`DEBUG: 輸入/修改後五碼觸發 - 發現待處理訂單 ${pendingOrder.order_id}，引導用戶輸入/修改後五碼。`);
          pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
          let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
          if (pendingOrder.status === 'rejected') {
            promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
          }
          return reply(replyToken, promptText, [
            { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }, // 【優化】使用常量
            { type: 'message', label: COMMANDS.STUDENT.RETURN_POINTS_MENU, text: COMMANDS.STUDENT.RETURN_POINTS_MENU } // 【優化】使用常量
          ]);
        } else {
          delete pendingPurchase[userId];
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
          console.log(`DEBUG: 購買點數 - 發現待處理訂單 ${pendingOrder.order_id}，引導用戶處理。`);
          return reply(replyToken,
            `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請在「點數管理」主頁面輸入後五碼，或選擇「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`, // 【優化】使用常量
            [
              { type: 'message', label: COMMANDS.STUDENT.RETURN_POINTS_MENU, text: COMMANDS.STUDENT.RETURN_POINTS_MENU }, // 【優化】使用常量
              { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE }, // 【優化】使用常量
            ]
          );
        } else {
          console.log(`DEBUG: 購買點數 - 無待處理訂單，啟動新購買流程。`);
          pendingPurchase[userId] = { step: 'select_plan', data: {} };
          const planOptions = PURCHASE_PLANS.map(plan => ({
            type: 'message', label: plan.label, text: plan.label
          }));
          planOptions.push({ type: 'message', label: COMMANDS.STUDENT.RETURN_POINTS_MENU, text: COMMANDS.STUDENT.RETURN_POINTS_MENU }); // 【優化】使用常量
          return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
        }
      }

      if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = ordersRes.rows[0];

        if (pendingOrder) {
            if (pendingOrder.status === 'pending_confirmation') {
                return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。', studentMenu);
            } else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
                // --- TRANSACTION START ---
                await pgClient.query('BEGIN');
                try {
                  await deleteOrder(pendingOrder.order_id, pgClient);
                  await pgClient.query('COMMIT');
                  delete pendingPurchase[userId];
                  return reply(replyToken, '已取消您的購點訂單。', studentMenu);
                } catch (err) {
                  await pgClient.query('ROLLBACK');
                  console.error('❌ 取消購點訂單交易失敗:', err.message);
                  // 【日誌詳盡度】增加更多錯誤細節
                  if (err.stack) console.error(err.stack);
                  await reply(replyToken, '取消訂單失敗，請稍後再試。', studentMenu);
                  return; // 這裡直接返回
                }
                // --- TRANSACTION END ---
            }
        }

        if (pendingPurchase[userId]) {
          delete pendingPurchase[userId];
        }
        return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
      }

      // 修改 PURCHASE_HISTORY 處理邏輯
      if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
        console.log(`DEBUG: 顯示購點歷史記錄。`);
        if (!user.history || user.history.length === 0) {
          return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
        }

        let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
        user.history.slice(-5).reverse().forEach(record => {
          historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
        });
        return reply(replyToken, historyMessage.trim(), studentMenu);
      }

      // 學員預約課程，直接顯示未來7天的課程
      if (text === COMMANDS.STUDENT.BOOK_COURSE) {
        const now = Date.now();
        const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);

        const upcomingCourses = Object.values(courses)
            .filter(c => new Date(c.time).getTime() > now && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId))
            .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

        if (upcomingCourses.length === 0) {
            return reply(replyToken, '未來七天內沒有您可以預約的新課程。', studentMenu);
        }

        const courseBubbles = upcomingCourses.slice(0, 10).map(course => {
            const isEnrolled = course.students.includes(userId);
            const isWaiting = course.waiting.includes(userId);
            const isFull = course.students.length >= course.capacity;

            let statusText = `報名 ${course.students.length}/${course.capacity}`;
            let actionButton = null;
            let headerColor = '#34a0a4';

            if (isEnrolled) {
                statusText = `✅ 已預約`;
                headerColor = '#52b69a';
            } else if (isWaiting) {
                statusText = `⏳ 候補中 (${course.waiting.indexOf(userId) + 1} 位)`;
                headerColor = '#ff9e00';
            } else if (isFull) {
                actionButton = {
                    type: 'message',
                    label: '加入候補',
                    text: `我要預約 ${course.id}`
                };
                headerColor = '#ff9e00';
            } else {
                actionButton = {
                    type: 'message',
                    label: '立即預約',
                    text: `我要預約 ${course.id}`
                };
            }

            return {
                type: 'bubble',
                header: {
                    type: 'box', layout: 'vertical',
                    contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }],
                    backgroundColor: headerColor, paddingAll: 'lg'
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
                                { type: 'text', text: statusText, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                            ]
                        },
                    ]
                },
                footer: actionButton ? {
                    type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                    contents: [{
                        type: 'button', style: 'primary', height: 'sm',
                        color: isFull ? '#ff9e00' : '#1a759f',
                        action: actionButton
                    }]
                } : undefined
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
        await pgClient.query('BEGIN');
        try {
            const currentUser = await getUser(userId, pgClient);

            if (currentUser.points < course.pointsCost) {
                await pgClient.query('ROLLBACK');
                return reply(replyToken, `你的點數不足，此課程需要 ${course.pointsCost} 點，你目前有 ${currentUser.points} 點。`, studentMenu);
            }

            const courseInTransaction = (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
            if (!courseInTransaction) {
                await pgClient.query('ROLLBACK');
                return reply(replyToken, '預約失敗，課程不存在或已被移除。', studentMenu);
            }

            if (courseInTransaction.students.length < courseInTransaction.capacity) {
              courseInTransaction.students.push(userId);
              currentUser.points -= courseInTransaction.points_cost;
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
              await saveUser(currentUser, pgClient);
              await pgClient.query('COMMIT');

              return reply(replyToken, `✅ 該課程「${courseInTransaction.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${course.pointsCost} 點。`, studentMenu);
            }
        } catch (err) {
            await pgClient.query('ROLLBACK');
            console.error("❌ 預約課程交易失敗:", err.message);
            // 【日誌詳盡度】增加更多錯誤細節
            if (err.stack) console.error(err.stack);
            await reply(replyToken, '預約失敗，系統發生錯誤，請稍後再試。', studentMenu);
            return; // 這裡直接返回
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
        await pgClient.query('BEGIN');
        try {
            // 1. Refund cancelling user
            const cancellingUser = await getUser(userId, pgClient);
            cancellingUser.points += course.pointsCost;
            if (!Array.isArray(cancellingUser.history)) cancellingUser.history = [];
            cancellingUser.history.push({ id: id, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
            await saveUser(cancellingUser, pgClient);

            // 2. Update course student list
            const updatedCourse = await (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
            updatedCourse.students = updatedCourse.students.filter(sid => sid !== userId);
            replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`;

            // 3. Handle waitlist promotion
            if (updatedCourse.waiting.length > 0 && updatedCourse.students.length < updatedCourse.capacity) {
                const nextWaitingUserId = updatedCourse.waiting.shift();
                const nextWaitingUser = await getUser(nextWaitingUserId, pgClient);

                if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
                    updatedCourse.students.push(nextWaitingUserId);
                    nextWaitingUser.points -= course.pointsCost;
                    if (!Array.isArray(nextWaitingUser.history)) nextWaitingUser.history = [];
                    nextWaitingUser.history.push({ id: id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });

                    await saveUser(nextWaitingUser, pgClient);

                    // 【錯誤訊息統一處理】統一使用 push 發送通知
                    push(nextWaitingUserId, `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(updatedCourse.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`)
                        .catch(e => console.error(`❌ 向學員 ${nextWaitingUserId} 發送提醒失敗:`, e.message));
                    replyMessage += '\n有候補學生已遞補成功。';
                } else if (nextWaitingUser) {
                    const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUser.id.substring(0, 4)}...)`;
                    replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
                    if (TEACHER_ID) {
                      // 【錯誤訊息統一處理】統一使用 push 發送通知
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
            // 【日誌詳盡度】增加更多錯誤細節
            if (err.stack) console.error(err.stack);
            await reply(replyToken, '取消預約失敗，系統發生錯誤，請稍後再試。', studentMenu);
            return; // 這裡直接返回
        }
        // --- TRANSACTION END ---
      }

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

        // --- TRANSACTION START ---
        await pgClient.query('BEGIN');
        try {
          const courseInTransaction = (await pgClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
          const userInTransaction = await getUser(userId, pgClient);

          courseInTransaction.waiting = courseInTransaction.waiting.filter(x => x !== userId);
          if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
          userInTransaction.history.push({ id: id, action: `取消候補：${course.title}`, time: new Date().toISOString() });

          await saveCourse(courseInTransaction, pgClient);
          await saveUser(userInTransaction, pgClient);
          await pgClient.query('COMMIT');

          return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
        } catch(err) {
          await pgClient.query('ROLLBACK');
          console.error("❌ 取消候補交易失敗:", err.message);
          // 【日誌詳盡度】增加更多錯誤細節
          if (err.stack) console.error(err.stack);
          await reply(replyToken, '取消候補失敗，系統發生錯誤，請稍後再試。', studentMenu);
          return; // 這裡直接返回
        }
        // --- TRANSACTION END ---
      }

      return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);

  } catch (err) {
      console.error('❌ handleStudentCommands 獲取資料庫連線失敗或發生未知錯誤:', err.message);
      // 【日誌詳盡度】增加更多錯誤細節
      if (err.stack) console.error(err.stack);
      // 【錯誤訊息統一處理】向用戶推送錯誤訊息
      await push(userId, '處理學員指令時發生未知錯誤，請稍後再試。');
      // 如果回覆尚未發送，嘗試發送一個通用的錯誤回覆
      try {
          await reply(replyToken, '處理學員指令時發生錯誤。');
      } catch (e) {
          console.error('二次錯誤回覆失敗:', e.message);
      }
  } finally {
      if (pgClient) pgClient.release(); // 釋放客戶端回連接池
      // 【日誌詳盡度】使用結構化日誌
      console.log(`DEBUG: 學員指令處理 - 已釋放資料庫連線`);
  }
}


// =====================================
//      🎯 主事件處理函式
// =====================================
async function handleEvent(event) {
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    console.log(`DEBUG: 收到事件類型: ${event.type}, 用戶ID: ${userId}`);
    if (event.type === 'message' && event.message.type === 'text') {
        console.log(`DEBUG: 收到文字訊息: "${event.message.text}"`);
    }

    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow' && event.type !== 'unfollow') {
        console.log(`Ignored event type: ${event.type}`);
        return;
    }

    // 【日誌詳盡度】使用 try-finally 確保客戶端被釋放
    let pgClient;
    try {
        pgClient = await pool.connect(); // 為每個事件處理獲取一個客戶端
        console.log(`DEBUG: handleEvent - 已獲取資料庫連線 for event ${event.type}`);

        if (event.type === 'follow') {
            console.log(`New user followed bot: ${userId}`);
            try {
                let user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
                await saveUser(user, pgClient); // 傳遞 client
                const profile = await client.getProfile(userId);
                user.name = profile.displayName || '匿名使用者';
                await saveUser(user, pgClient); // 傳遞 client
                await reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。`, studentMenu);
            } catch (e) {
                console.error(`❌ 處理追蹤事件失敗 for ${userId}:`, e.message);
                if (e.stack) console.error(e.stack); // 【日誌詳盡度】
                await reply(replyToken, `哈囉！歡迎來到九容瑜伽小助手！`, studentMenu).catch(e => console.error(`❌ 追蹤事件預設回覆失敗:`, e.message));
            }
            return;
        }

        if (event.type === 'unfollow') {
            console.log(`User unfollowed bot: ${userId}`);
            return;
        }

        let user = await getUser(userId, pgClient); // 傳遞 client
        if (!user) {
            user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
            await saveUser(user, pgClient); // 傳遞 client
        }
        if (user.name === '匿名使用者' || !user.name) {
            try {
                const profile = await client.getProfile(userId);
                user.name = profile.displayName || '匿名使用者';
                await saveUser(user, pgClient); // 傳遞 client
            } catch (e) {
                console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
                if (e.stack) console.error(e.stack); // 【日誌詳盡度】
            }
        }

        // --- Postback 事件處理 ---
        if (event.type === 'postback') {
            console.log(`DEBUG: 處理 Postback 事件: ${event.postback.data}`);
            const data = event.postback.data;
            const params = new URLSearchParams(data);
            const postbackAction = params.get('action');
            const courseId = params.get('courseId');
            const orderId = params.get('orderId');
            const coursePrefix = params.get('prefix');

            const currentUser = await getUser(userId, pgClient); // 傳遞 client

            // --- Teacher Postbacks ---
            if (currentUser.role === 'teacher') {
                if (postbackAction === 'add_course_start') {
                    pendingCourseCreation[userId] = { step: 1, data: {} };
                    return reply(replyToken, '請輸入課程名稱：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); // 【優化】使用常量
                }

                if (postbackAction === 'start_student_search') {
                    pendingStudentSearch[userId] = true;
                    return reply(replyToken, '請輸入您要查詢的學員姓名或 ID：', [
                        { type: 'message', label: COMMANDS.TEACHER.STUDENT_SEARCH_CANCEL, text: COMMANDS.TEACHER.STUDENT_SEARCH_CANCEL } // 【優化】使用常量
                    ]);
                }

                if (postbackAction === 'cancel_course_group_confirm') {
                    if (!coursePrefix) { return reply(replyToken, '找不到課程前綴，取消失敗。', teacherMenu); }

                    const coursesToCancelRes = await pgClient.query('SELECT id, title FROM courses WHERE id LIKE $1', [`${coursePrefix}%`]);
                    const coursesToCancel = coursesToCancelRes.rows;

                    if (coursesToCancel.length === 0) {
                        return reply(replyToken, `找不到任何以「${coursePrefix}」開頭的課程可供取消。`, teacherMenu);
                    }

                    const courseTitles = coursesToCancel.map(c => `・${c.title}`).join('\n');
                    return reply(replyToken, {
                        type: 'text', text: `⚠️ 最終確認 ⚠️\n\n您確定要批次取消所有以「${coursePrefix}」開頭的 ${coursesToCancel.length} 堂課程嗎？\n\n受影響課程：\n${courseTitles}\n\n此操作將會刪除這些課程、自動退點並通知所有相關學生，且無法復原！`,
                        quickReply: { items: [
                            { type: 'action', action: { type: 'postback', label: '✅ 是，確認批次取消', data: `action=cancel_course_group_execute&prefix=${coursePrefix}`, displayText: `正在批次取消 ${coursePrefix} 系列課程` } },
                            { type: 'action', action: { type: 'postback', label: '❌ 否，返回', data: 'action=cancel_course_abort', displayText: '取消操作' } }
                        ]}
                    });
                }

                if (postbackAction === 'cancel_course_group_execute') {
                    // --- TRANSACTION START ---
                    await pgClient.query('BEGIN');
                    try {
                        const cancelledCourses = await deleteCoursesByPrefix(coursePrefix, pgClient);

                        if (cancelledCourses.length === 0) {
                            await pgClient.query('ROLLBACK');
                            return reply(replyToken, `找不到任何以「${coursePrefix}」開頭的課程可供取消。`, teacherMenu);
                        }

                        for (const course of cancelledCourses) {
                            for (const stuId of course.students) {
                                const studentUser = await getUser(stuId, pgClient);
                                if (studentUser) {
                                    studentUser.points += course.pointsCost;
                                    if (!Array.isArray(studentUser.history)) studentUser.history = [];
                                    studentUser.history.push({ id: course.id, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                                    await saveUser(studentUser, pgClient);
                                    // 【錯誤訊息統一處理】統一使用 push 發送通知
                                    push(stuId, `【課程取消通知】\n您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師批次取消，系統已自動退還 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 向學員 ${stuId} 發送提醒失敗:`, e.message));
                                }
                            }
                            for (const waitId of course.waiting) {
                                const waitingUser = await getUser(waitId, pgClient);
                                if (waitingUser) {
                                    if (!Array.isArray(waitingUser.history)) waitingUser.history = [];
                                    waitingUser.history.push({ id: course.id, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
                                    await saveUser(waitingUser, pgClient);
                                    // 【錯誤訊息統一處理】統一使用 push 發送通知
                                    push(waitId, `【候補取消通知】\n您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師批次取消。`).catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
                                }
                            }
                        }

                        await pgClient.query('COMMIT');

                        console.log(`✅ 所有以 ${coursePrefix} 開頭的課程 (共 ${cancelledCourses.length} 堂) 已成功批次取消。`);
                        return reply(replyToken, `✅ 已成功批次取消所有以「${coursePrefix}」開頭的 ${cancelledCourses.length} 堂課程，並已通知所有相關學員。`, teacherMenu);
                    } catch(err) {
                        await pgClient.query('ROLLBACK');
                        console.error("❌ 批次取消課程交易失敗:", err.message);
                        if (err.stack) console.error(err.stack); // 【日誌詳盡度】
                        // 【錯誤訊息統一處理】統一使用 push 發送通知
                        await push(userId, '批次取消課程失敗，系統發生錯誤，請稍後再試。');
                        return; // 這裡直接返回
                    }
                    // --- TRANSACTION END ---
                }

                if (postbackAction === 'cancel_course_abort') {
                    return reply(replyToken, '操作已取消。', teacherMenu);
                }

                if (postbackAction === 'confirm_order') {
                    // 【錯誤訊息統一處理】在開始處理前，立即發送一個 push 訊息給老師，避免 token 超時問題，並提供即時反饋
                    // 此處不需要 reply，因為後續會發送最終結果通知
                    push(userId, '正在處理訂單確認請求，請稍候...');

                    try {
                        await pgClient.query('BEGIN');
                        const ordersRes = await pgClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                        const rawOrder = ordersRes.rows[0];

                        if (!rawOrder || rawOrder.status !== 'pending_confirmation') {
                            await pgClient.query('ROLLBACK');
                            // 【錯誤訊息統一處理】統一使用 push 發送通知
                            await push(userId, '找不到此筆待確認訂單或訂單狀態不正確。');
                            return;
                        }

                        const studentUser = await getUser(rawOrder.user_id, pgClient);
                        if (!studentUser) {
                            await pgClient.query('ROLLBACK');
                            // 【錯誤訊息統一處理】統一使用 push 發送通知
                            await push(userId, `找不到購點學員 (ID: ${rawOrder.user_id}) 的資料。`);
                            return;
                        }

                        studentUser.points += rawOrder.points;
                        if (!Array.isArray(studentUser.history)) studentUser.history = [];
                        studentUser.history.push({ action: `購買點數成功：${rawOrder.points} 點`, time: new Date().toISOString(), orderId: rawOrder.order_id });

                        const orderToSave = {
                            orderId: rawOrder.order_id,
                            userId: rawOrder.user_id,
                            userName: rawOrder.user_name,
                            points: rawOrder.points,
                            amount: rawOrder.amount,
                            last5Digits: rawOrder.last_5_digits,
                            status: 'completed',
                            timestamp: rawOrder.timestamp.toISOString()
                        };

                        await saveUser(studentUser, pgClient);
                        await saveOrder(orderToSave, pgClient);
                        await pgClient.query('COMMIT');

                        // 【錯誤訊息統一處理】成功後也用 push 發送通知，避免 reply token 再次超時
                        await push(userId, `✅ 已為學員 ${rawOrder.user_name} 加點 ${rawOrder.points} 點，訂單 ${rawOrder.order_id} 已完成。`);
                        await push(userId, '現在你可以返回點數管理繼續操作。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);

                        // 通知學員
                        push(rawOrder.user_id, `🎉 您購買的 ${rawOrder.points} 點已成功入帳！目前點數：${studentUser.points} 點。`).catch(e => console.error(`❌ 通知學員 ${rawOrder.user_id} 購點成功失敗:`, e.message));

                    } catch (err) {
                        await pgClient.query('ROLLBACK');
                        console.error("❌ 訂單確認交易失敗:", err.message);
                        if (err.stack) console.error(err.stack); // 【日誌詳盡度】
                        // 【錯誤訊息統一處理】統一使用 push 發送通知
                        await push(userId, '訂單確認失敗，系統發生錯誤，請稍後再試。');
                    }
                    return; // 這裡直接返回，因為已經在上面發送了即時或最終的 push 訊息
                }

                if (postbackAction === 'reject_order') {
                    // 【錯誤訊息統一處理】在開始處理前，立即發送一個 push 訊息給老師，避免 token 超時問題，並提供即時反饋
                    push(userId, '正在處理訂單退回請求，請稍候...');
                    try {
                        await pgClient.query('BEGIN');
                        const ordersRes = await pgClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                        const rawOrder = ordersRes.rows[0];

                        if (!rawOrder || rawOrder.status !== 'pending_confirmation') {
                            await pgClient.query('ROLLBACK');
                            // 【錯誤訊息統一處理】統一使用 push 發送通知
                            await push(userId, '找不到此筆待確認訂單或訂單狀態不正確。');
                            return;
                        }

                        const orderToSave = {
                            orderId: rawOrder.order_id,
                            userId: rawOrder.user_id,
                            userName: rawOrder.user_name,
                            points: rawOrder.points,
                            amount: rawOrder.amount,
                            last5Digits: rawOrder.last_5_digits,
                            status: 'rejected',
                            timestamp: rawOrder.timestamp.toISOString()
                        };

                        await saveOrder(orderToSave, pgClient);
                        await pgClient.query('COMMIT');

                        // 【錯誤訊息統一處理】成功後也用 push 發送通知
                        await push(userId, `❌ 已退回訂單 ${rawOrder.order_id}。已通知學員 ${rawOrder.user_name} 匯款資訊有誤。`);
                        await push(userId, '現在你可以返回點數管理繼續操作。', [{ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }]);

                        // 通知學員
                        push(rawOrder.user_id, `⚠️ 您的購點訂單 ${rawOrder.order_id} 被老師退回了！\n\n原因：匯款金額或匯款帳號後五碼有誤，請您檢查後重新提交。\n\n請您進入「點數管理」查看訂單狀態，並點擊「重新提交匯款後五碼」按鈕修正。`).catch(e => console.error(`❌ 通知學員 ${rawOrder.user_id} 訂單退回失敗:`, e.message));

                    } catch (err) {
                        await pgClient.query('ROLLBACK');
                        console.error("❌ 訂單退回交易失敗:", err.message);
                        if (err.stack) console.error(err.stack); // 【日誌詳盡度】
                        // 【錯誤訊息統一處理】統一使用 push 發送通知
                        await push(userId, '訂單退回失敗，系統發生錯誤，請稍後再試。');
                    }
                    return; // 這裡直接返回
                }
            }

            // --- Student Postbacks ---
            if (currentUser.role === 'student') {
                const courses = await getAllCourses(pgClient); // 傳遞 client
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
                    return reply(replyToken, '請輸入此週期課程的總堂數（例如：5）', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                case 2:
                    const totalClasses = parseInt(text);
                    if (isNaN(totalClasses) || totalClasses <= 0) {
                        return reply(replyToken, '總堂數必須是正整數。');
                    }
                    stepData.data.totalClasses = totalClasses;
                    stepData.step = 3;
                    const weekdayOptions = Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day }));
                    weekdayOptions.push({ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
                    return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
                case 3:
                    if (!weekdays.hasOwnProperty(text)) {
                        return reply(replyToken, '請選擇正確的星期。');
                    }
                    stepData.data.weekday = text;
                    stepData.step = 4;
                    return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                case 4:
                    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
                        return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
                    }
                    stepData.data.time = text;
                    stepData.step = 5;
                    return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                case 5:
                    const capacity = parseInt(text);
                    if (isNaN(capacity) || capacity <= 0) {
                        return reply(replyToken, '人數上限必須是正整數。');
                    }
                    stepData.data.capacity = capacity;
                    stepData.step = 6;
                    return reply(replyToken, '請輸入課程所需扣除的點數（正整數）', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                case 6:
                    const pointsCost = parseInt(text);
                    if (isNaN(pointsCost) || pointsCost <= 0) {
                        return reply(replyToken, '扣除點數必須是正整數。');
                    }
                    stepData.data.pointsCost = pointsCost;
                    stepData.step = 7;
                    return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n總堂數：${stepData.data.totalClasses} 堂\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [
                        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
                        { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
                    ]);
                case 7:
                    if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                        const targetWeekdayIndex = weekdays[stepData.data.weekday];
                        const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);
                        const now = new Date();
                        const taipeiOffsetHours = 8;

                        let firstCourseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        let dayDiff = (targetWeekdayIndex - firstCourseDate.getUTCDay() + 7) % 7;

                        const currentHourTaipei = now.getHours();
                        const currentMinuteTaipei = now.getMinutes();
                        if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
                            dayDiff = 7;
                        }
                        firstCourseDate.setUTCDate(firstCourseDate.getUTCDate() + dayDiff);
                        firstCourseDate.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);

                        const coursePrefix = await generateUniqueCoursePrefix(pgClient); // 傳遞 client
                        const coursesToAdd = [];

                        for (let i = 0; i < stepData.data.totalClasses; i++) {
                            const courseDateTime = new Date(firstCourseDate.getTime() + (i * 7 * ONE_DAY_IN_MS));
                            const sessionNumber = (i + 1).toString().padStart(2, '0');
                            const newId = `${coursePrefix}${sessionNumber}`;

                            coursesToAdd.push({
                                id: newId,
                                title: `${stepData.data.title} - 第 ${i + 1} 堂`,
                                time: courseDateTime.toISOString(),
                                capacity: stepData.data.capacity,
                                pointsCost: stepData.data.pointsCost,
                                students: [],
                                waiting: []
                            });
                        }

                        // --- TRANSACTION START ---
                        await pgClient.query('BEGIN');
                        try {
                            for (const course of coursesToAdd) {
                                await saveCourse(course, pgClient); // 傳遞 client
                            }
                            await pgClient.query('COMMIT');
                            delete pendingCourseCreation[userId];
                            return reply(replyToken, `✅ 已成功新增 ${stepData.data.totalClasses} 堂「${stepData.data.title}」系列課程。\n課程組代碼為【${coursePrefix}】。\n首堂時間：${formatDateTime(coursesToAdd[0].time)}`, teacherMenu);
                        } catch (err) {
                            await pgClient.query('ROLLBACK');
                            console.error("❌ 新增週期課程交易失敗:", err.message);
                            if (err.stack) console.error(err.stack); // 【日誌詳盡度】
                            delete pendingCourseCreation[userId];
                            await reply(replyToken, '新增課程失敗，系統發生錯誤，請稍後再試。', teacherMenu);
                            return; // 這裡直接返回
                        }
                        // --- TRANSACTION END ---

                    } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
                        delete pendingCourseCreation[userId];
                        return reply(replyToken, '已取消新增課程。', teacherMenu);
                    } else {
                        return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」。`);
                    }
            }
        }

        if (text === COMMANDS.SWITCH_ROLE) {
            const currentUser = await getUser(userId, pgClient); // 傳遞 client
            if (currentUser.role === 'teacher') {
                currentUser.role = 'student';
                await saveUser(currentUser, pgClient); // 傳遞 client
                delete pendingManualAdjust[userId];
                delete pendingStudentSearch[userId];
                delete pendingCourseCreation[userId];
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
                const currentUser = await getUser(userId, pgClient); // 傳遞 client
                currentUser.role = 'teacher';
                await saveUser(currentUser, pgClient); // 傳遞 client
                delete pendingTeacherLogin[userId];
                return reply(replyToken, '老師登入成功。', teacherMenu);
            } else {
                delete pendingTeacherLogin[userId];
                return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
            }
        }

        const finalUser = await getUser(userId, pgClient); // 傳遞 client
        console.log(`DEBUG: 用戶 ${userId} 角色: ${finalUser.role}`);
        if (finalUser.role === 'teacher') {
            console.log(`DEBUG: 呼叫 handleTeacherCommands`);
            return handleTeacherCommands(event, userId);
        } else {
            console.log(`DEBUG: 呼叫 handleStudentCommands`);
            return handleStudentCommands(event, userId);
        }
    } catch (err) {
        console.error('❌ handleEvent 處理過程中發生未預期錯誤:', err.message);
        if (err.stack) console.error(err.stack); // 【日誌詳盡度】
        // 【錯誤訊息統一處理】向用戶推送錯誤訊息
        try {
            await push(userId, '抱歉，系統發生了未預期錯誤，請稍後再試。');
            // 如果 reply token 仍然有效，嘗試給一個更即時的錯誤回覆
            if (replyToken) {
                await reply(replyToken, '抱歉，系統發生了未預期錯誤，請稍後再試。');
            }
        } catch (e) {
            console.error('最終錯誤回覆失敗:', e.message);
        }
    } finally {
        if (pgClient) pgClient.release(); // 確保每次事件處理後都釋放客戶端
        console.log(`DEBUG: handleEvent - 已釋放資料庫連線 for event ${event.type}`);
    }
}

// =====================================
//           自動提醒功能
// =====================================
async function checkAndSendReminders() {
    const now = Date.now();
    let pgClient;
    try {
        pgClient = await pool.connect(); // 從連接池獲取客戶端
        console.log(`DEBUG: 自動提醒功能 - 已獲取資料庫連線`);

        const courses = await getAllCourses(pgClient);
        const usersRes = await pgClient.query('SELECT id, name FROM users');
        const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u]));

        for (const id in courses) {
            const course = courses[id];
            const courseTime = new Date(course.time).getTime();
            const timeUntilCourse = courseTime - now;
            const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 確保在1小時前5分鐘內觸發

            if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
                console.log(`🔔 準備發送課程提醒：${course.title}`);
                for (const studentId of course.students) {
                    const student = dbUsersMap.get(studentId);
                    if (student) {
                        // 【錯誤訊息統一處理】統一使用 push 發送通知
                        push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`).catch(e => {
                            console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
                        });
                    }
                }
                sentReminders[id] = true; // 標記為已發送
            }
        }
        // 清理已過期很久的提醒標記
        for (const id in sentReminders) {
            const course = courses[id];
            if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) { // 如果課程已不存在或已過期一天
                delete sentReminders[id];
            }
        }
    } catch (err) {
        console.error('❌ 自動提醒功能發生錯誤:', err.message);
        if (err.stack) console.error(err.stack); // 【日誌詳盡度】
    } finally {
        if (pgClient) pgClient.release(); // 釋放客戶端回連接池
        console.log(`DEBUG: 自動提醒功能 - 已釋放資料庫連線`);
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

  // 【Promise.all 中的錯誤處理】使用 Promise.allSettled 來處理所有事件，並單獨記錄失敗的事件。
  Promise.allSettled(req.body.events.map(handleEvent))
    .then(results => {
      // 遍歷所有結果，記錄失敗的事件
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`❌ 事件 ${index} 處理失敗:`, result.reason);
          // 【日誌詳盡度】可以進一步記錄原始事件數據
          // console.error(`原始事件數據:`, req.body.events[index]);
        } else {
          console.log(`✅ 事件 ${index} 處理成功。`);
        }
      });
      res.status(200).send('OK');
    })
    .catch((err) => { // 這裡的 catch 應該只會捕獲到 Promise.allSettled 本身的錯誤，而非內部事件處理錯誤
      console.error('❌ Webhook 處理 Promise.allSettled 失敗:', err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.9.0 (Optimized for Error Handling & Database Pooling)`);

  // 課程清理邏輯：這個頻率和保留時間可以根據實際需求調整。
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
