// index.js - V4.9.15 (Improved error logging, robust reply handling, and quickReply display logic)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Pool } = require('pg');
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

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID; // 老師的 LINE User ID，用於重要通知

const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5; // 5分鐘
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 5分鐘

const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
};

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
    CONFIRM_BOOKING: '✅ 確認預約',
    ABANDON_BOOKING: '❌ 放棄預約'
  }
};

// =====================================
//        資料庫初始化與工具函式
// =====================================

async function initializeDatabase() {
  try {
    const testClient = await pgPool.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    testClient.release();

    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]')`);
    console.log('✅ 檢查並建立 users 表完成');

    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    console.log('✅ 檢查並建立 courses 表完成');

    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    console.log('✅ 檢查並建立 orders 表完成');

    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  }
}

initializeDatabase();

async function generateUniqueCoursePrefix(dbClient = pgPool) {
    let prefix;
    let isUnique = false;
    while (!isUnique) {
        const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
        const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
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

async function getUser(userId, dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  const userData = res.rows[0];
  if (userData && typeof userData.history === 'string') {
    try {
      userData.history = JSON.parse(userData.history);
    } catch (e) {
      console.error(`❌ 解析用戶 ${userId} 歷史記錄 JSON 失敗:`, e.message);
      userData.history = []; // 設置為空陣列以避免後續錯誤
    }
  }
  return userData;
}

async function saveUser(user, dbClient = pgPool) {
  try {
    const historyJson = JSON.stringify(user.history || []);
    await dbClient.query(
        `INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5`,
        [user.id, user.name, user.points, user.role, historyJson]
    );
  } catch (err) {
    console.error(`FATAL ERROR: saveUser 函式捕獲到錯誤!`, {
      message: err.message, stack: err.stack, userId: user.id,
    });
    throw err; // 拋出錯誤以便上層呼叫者處理
  }
}

async function getAllCourses(dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    courses[row.id] = { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
  });
  return courses;
}

async function getCourse(courseId, dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM courses WHERE id = $1', [courseId]);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
}


async function saveCourse(course, dbClient = pgPool) {
    await dbClient.query(
        `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7`,
        [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]
    );
}

async function deleteCourse(courseId, dbClient = pgPool) {
  await dbClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
}

async function deleteCoursesByPrefix(prefix, dbClient = pgPool) {
    const coursesToDeleteRes = await dbClient.query('SELECT id, title, time, points_cost, students, waiting FROM courses WHERE id LIKE $1', [`${prefix}%`]);
    const coursesToDelete = coursesToDeleteRes.rows.map(row => ({
        id: row.id, title: row.title, time: row.time.toISOString(), pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || []
    }));
    if (coursesToDelete.length > 0) {
        await dbClient.query('DELETE FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        console.log(`✅ 已批次刪除 ${coursesToDelete.length} 堂以 ${prefix} 開頭的課程。`);
    }
    return coursesToDelete;
}

async function getAllOrders(dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, status: row.status, timestamp: row.timestamp.toISOString() };
  });
  return orders;
}

async function saveOrder(order, dbClient = pgPool) {
  try {
      await dbClient.query(
        `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
        [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]
    );
  } catch (err) {
    console.error('❌ saveOrder 函式錯誤:', err.message, 'Order ID:', order.orderId);
    throw err;
  }
}

async function deleteOrder(orderId, dbClient = pgPool) {
  await pgPool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

async function cleanCoursesDB() {
  const now = Date.now();
  // 保留過去 24 小時內的課程，以確保近期課程的資訊仍在，並清理更早的
  await pgPool.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
}

/**
 * 回覆 LINE 訊息的通用函式。
 * 自動處理 quickReply 的顯示與格式，避免空 quickReply 導致的 400 錯誤。
 * @param {string} replyToken LINE 的 replyToken。
 * @param {string|object|Array<object>} content 要回覆的訊息內容，可以是字串、單一訊息物件或訊息物件陣列。
 * @param {Array<object>} [menu=null] 選項陣列，用於 quickReply。每個項目應為 { type: 'message', label: '...', text: '...' } 或 { type: 'postback', label: '...', data: '...' }。
 */
async function reply(replyToken, content, menu = null) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else if (typeof content === 'object' && content !== null) {
    // 處理 Flex Message 或其他 LINE 訊息物件
    messages = [content];
  } else {
    console.error(`WARN: reply 函式收到不明內容，類型: ${typeof content}, 值:`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }
  
  // 檢查 menu 是否有效且有內容，才加入 quickReply
  // 確保 menu 是一個陣列，並只取前13個項目
  const validMenuItems = (Array.isArray(menu) ? menu : [])
                          .slice(0, 13)
                          .map(i => {
                              // 轉換為 LINE 要求的 quickReply action 格式
                              if (i.type === 'message') {
                                  return { type: 'action', action: { type: 'message', label: i.label, text: i.text } };
                              } else if (i.type === 'postback') {
                                  return { type: 'action', action: { type: 'postback', label: i.label, data: i.data, displayText: i.displayText || i.label } };
                              }
                              // 如果有其他 quickReply 類型，可以在此添加處理
                              return null; // 不支援的類型則忽略
                          }).filter(item => item !== null); // 過濾掉不支援的類型

  if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (validMenuItems.length > 0) {
          lastMessage.quickReply = { items: validMenuItems };
      } else {
          // 如果沒有有效的 quickReply 項目，則確保不會留下空的 quickReply 物件
          // 這是為了防止 LINE API 返回 400 Bad Request，當 quickReply.items 為空時
          if (lastMessage.quickReply) {
              delete lastMessage.quickReply;
          }
      }
  }

  try {
    await client.replyMessage(replyToken, messages);
    console.log(`✅ 成功回覆訊息。ReplyToken: ${replyToken.substring(0, 8)}...`);
  } catch (error) {
    console.error(`❌ reply 函式發送失敗！ReplyToken: ${replyToken.substring(0, 8)}...`);
    if (error.originalError && error.originalError.response) {
      console.error('   狀態碼:', error.originalError.response.status);
      console.error('   響應數據:', JSON.stringify(error.originalError.response.data, null, 2));
      console.error('   請求數據:', JSON.stringify(error.originalError.response.config.data, null, 2));
    } else {
      console.error('   錯誤訊息:', error.message);
    }
    throw error; // 重新拋出錯誤以便上層呼叫者處理
  }
}

/**
 * 主動推送 LINE 訊息的通用函式。
 * @param {string} to 目標用戶 ID 或群組 ID。
 * @param {string|object|Array<object>} content 要推送的訊息內容，可以是字串、單一訊息物件或訊息物件陣列。
 */
async function push(to, content) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else if (typeof content === 'object' && content !== null && content.type) {
    messages = [content];
  } else {
    console.error(`WARN: push 函式收到不明內容，類型: ${typeof content}, 值:`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }
  
  try {
    await client.pushMessage(to, messages);
    console.log(`✅ 成功推送訊息給 ${to.substring(0, 8)}...`);
  } catch (error) {
    const errorDetails = error.originalError ? error.originalError.response : { status: 'N/A', statusText: error.message, data: 'N/A' };
    console.error(`❌ push 函式發送失敗給 ${to.substring(0, 8)}...:`, `狀態碼: ${errorDetails.status},`, `訊息: ${errorDetails.statusText}`);
    if(errorDetails.data) console.error(`   響應數據:`, errorDetails.data);
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
    if (weekday.startsWith('週')) weekday = weekday.slice(-1); // 簡化為：一、二、三...
    return `${month}-${day}（${weekday}）${hour}:${minute}`;
}

// =====================================
//               快速選單定義
// =====================================
const teacherMenu = [
  { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
  { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
  { type: 'postback', label: '查詢學員', data: 'action=start_student_search', displayText: '準備查詢學員...' },
  { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
  { type: 'message', label: '切換學員身份', text: COMMANDS.SWITCH_ROLE }, // 提供一個切換選項
];

const studentMenu = [
  { type: 'message', label: '點數管理', text: COMMANDS.STUDENT.POINTS },
  { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
  { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
  { type: 'message', label: '切換老師身份', text: COMMANDS.SWITCH_ROLE }, // 提供一個切換選項
];


// =====================================
//      暫存狀態物件 (使用 Map 提升性能，雖然小規模數據影響不大)
// =====================================
const pendingTeacherLogin = new Map();
const pendingCourseCreation = new Map();
const pendingPurchase = new Map();
const pendingManualAdjust = new Map();
const sentReminders = new Map(); // 用於追蹤已發送的提醒，避免重複發送
const pendingStudentSearch = new Map();
const pendingBookingConfirmation = new Map(); // 用於預約確認步驟


// =====================================
//          老師指令處理函式
// =====================================
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  // 檢查是否正在進行學員查詢
  if (pendingStudentSearch.has(userId)) {
      if (text === COMMANDS.TEACHER.MAIN_MENU) {
          pendingStudentSearch.delete(userId);
          return reply(replyToken, '已取消學員查詢。', teacherMenu);
      }
      const query = text;
      let foundUser = await getUser(query);
      if (!foundUser || foundUser.role !== 'student') {
          // 如果沒有直接匹配到ID，嘗試按名稱模糊搜尋
          const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
          if (res.rows.length > 0) {
              foundUser = res.rows[0];
          }
      }
      pendingStudentSearch.delete(userId); // 無論是否找到，都清除狀態
      if (!foundUser) {
          return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
      }

      let studentInfo = `學員姓名：${foundUser.name}\n學員 ID：${foundUser.id}\n剩餘點數：${foundUser.points} 點\n歷史記錄 (近5筆)：\n`;
      if (foundUser.history && foundUser.history.length > 0) {
        // 從最近的記錄開始顯示
        foundUser.history.slice(-5).reverse().forEach(record => {
          studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
        });
      } else {
        studentInfo += '無。';
      }
      return reply(replyToken, studentInfo.trim(), teacherMenu);
  }

  // 檢查是否正在進行手動調整點數
  if (pendingManualAdjust.has(userId)) {
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          pendingManualAdjust.delete(userId);
          return reply(replyToken, '已取消手動調整點數。', teacherMenu);
      }
      const parts = text.split(' ');
      if (parts.length !== 2) {
        return reply(replyToken, '指令格式錯誤。\n請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5\n或輸入 @返回老師主選單 取消。');
      }
      const targetIdentifier = parts[0];
      const amount = parseInt(parts[1]);
      if (isNaN(amount) || amount === 0) {
        return reply(replyToken, '點數數量必須是非零整數。');
      }

      let foundUser = await getUser(targetIdentifier);
      if (!foundUser) {
          // 如果沒有直接匹配到ID，嘗試按名稱模糊搜尋
          const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) {
              foundUser = res.rows[0];
          }
      }

      if (!foundUser) {
          pendingManualAdjust.delete(userId);
          return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherMenu);
      }

      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);
      const transactionClient = await pgPool.connect();
      try {
          await transactionClient.query('BEGIN'); // 開始事務
          const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [foundUser.id]);
          const userInTransaction = userInTransactionRes.rows[0];

          if (!userInTransaction) {
            throw new Error('操作失敗，找不到學員資料。');
          }

          if (operation === '扣點' && userInTransaction.points < absAmount) {
            throw new Error(`學員 ${userInTransaction.name} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${absAmount} 點）。`);
          }

          userInTransaction.points += amount;
          if (!Array.isArray(userInTransaction.history)) {
            userInTransaction.history = []; // 確保 history 是陣列
          }
          userInTransaction.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
          
          await saveUser(userInTransaction, transactionClient); // 在事務中保存用戶
          await transactionClient.query('COMMIT'); // 提交事務

          // 通知學員點數變動 (非關鍵路徑，失敗不影響主流程)
          push(userInTransaction.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
          
          pendingManualAdjust.delete(userId); // 清除狀態
          return reply(replyToken, `✅ 已成功為學員 ${userInTransaction.name} ${operation} ${absAmount} 點，目前點數：${userInTransaction.points} 點。`, teacherMenu);
      } catch (err) {
          await transactionClient.query('ROLLBACK'); // 回滾事務
          console.error('❌ 手動調整點數交易失敗:', err.message);
          pendingManualAdjust.delete(userId); // 清除狀態
          return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。', teacherMenu);
      } finally {
          transactionClient.release(); // 釋放連接
      }
  }

  // 其他老師主選單指令
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    // 清除所有老師相關的暫存狀態
    pendingManualAdjust.delete(userId);
    pendingStudentSearch.delete(userId);
    pendingCourseCreation.delete(userId);
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }

  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
    const pointManagementBubbles = [
      {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' },
            { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' },
          ], justifyContent: 'center', alignItems: 'center', height: '150px' },
        action: { type: 'message', label: '查看待確認訂單', text: COMMANDS.TEACHER.PENDING_ORDERS }
      },
      {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
        body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [
            { type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
          ], justifyContent: 'center', alignItems: 'center', height: '150px' },
        action: { type: 'message', label: '手動調整點數', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS }
      }
    ];
    const flexMessage = { type: 'flex', altText: '點數管理功能', contents: { type: 'carousel', contents: pointManagementBubbles } };
    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }]);
  }

  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.ADD_COURSE) {
    const now = Date.now();
    const allCourses = Object.values(await getAllCourses());
    // 只顯示未來的課程系列
    const courseGroups = {};
    for (const course of allCourses) {
        if (new Date(course.time).getTime() > now) {
            const prefix = course.id.substring(0, 2);
            // 找出每個系列中最早的一堂未來的課程，作為代表顯示
            if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) {
                courseGroups[prefix] = course;
            }
        }
    }
    
    const courseBubbles = [];
    const sortedPrefixes = Object.keys(courseGroups).sort(); // 按系列代碼排序
    for (const prefix of sortedPrefixes) {
        const earliestUpcomingCourse = courseGroups[prefix];
        courseBubbles.push({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''), weight: 'bold', size: 'xl', wrap: true }, // 顯示系列主名稱
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                ],
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` }, },
                    { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` }, },
                ],
            },
        });
    }

    const addCourseBubble = {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [
          { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' },
              { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
            ], justifyContent: 'center', alignItems: 'center', height: '150px' },
        ],
      },
      action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' }
    };
    courseBubbles.push(addCourseBubble); // 將新增課程的氣泡卡片加入列表

    let introText = '課程管理面板';
    if (Object.keys(courseGroups).length === 0) {
      introText = '目前沒有任何進行中的課程系列，點擊「+」可新增。';
    } else {
      introText = '以下為各課程系列的管理選項：';
    }

    const flexMessage = { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }; // 最多顯示10個系列卡片
    return reply(replyToken, [{ type: 'text', text: introText }, flexMessage], [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }]);
  }

  if (text === COMMANDS.TEACHER.REPORT) {
    const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
    const students = usersRes.rows;
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length; // 定義為有任何歷史記錄
    
    const coursesRes = await pgPool.query(`SELECT * FROM courses`);
    const allCourses = coursesRes.rows;
    const totalCourses = allCourses.length;
    const now = Date.now();
    const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
    const completedCourses = totalCourses - upcomingCourses;

    const ordersRes = await pgPool.query(`SELECT * FROM orders`);
    const allOrders = ordersRes.rows;
    const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
    const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
    const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);

    let report = `📊 營運報告 📊\n\n` +
                 `👤 學員總數：${students.length} 人\n` +
                 `🟢 活躍學員：${activeStudentsCount} 人\n` +
                 `💎 所有學員總點數：${totalPoints} 點\n\n` +
                 `🗓️ 課程統計：\n` +
                 `  總課程數：${totalCourses} 堂\n` +
                 `  進行中/未開課：${upcomingCourses} 堂\n` +
                 `  已結束課程：${completedCourses} 堂\n\n` +
                 `💰 購點訂單：\n` +
                 `  待確認訂單：${pendingOrders} 筆\n` +
                 `  已完成訂單：${completedOrdersCount} 筆\n` +
                 `  總收入 (已完成訂單)：${totalRevenue} 元`;
    return reply(replyToken, report.trim(), teacherMenu);
  }

  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    // 先發送一個提示訊息，然後異步查詢並發送結果
    reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
    
    (async () => {
        try {
            const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
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
                // 如果沒有待確認訂單，推送訊息告知
                return push(userId, '目前沒有待確認的購點訂單。');
            }

            // 生成 Flex Message 氣泡卡片
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ // 最多顯示10筆
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' },
                        { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, // 隱藏部分ID
                        { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' },
                        { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' },
                        { type: 'text', text: `匯款後五碼: ${order.last5Digits || 'N/A'}`, wrap: true, size: 'sm', weight: 'bold' },
                        { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, wrap: true, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0,
                    contents: [
                        { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } },
                        { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }
                    ]
                }
            }));
            await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
        }
    })();
    return; // 立即返回，因為 reply 已經處理了提示，後續結果會用 push 發送
  }

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust.set(userId, { step: 1 }); // 使用 Map.set
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回老師主選單 取消。', [
      { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU }
    ]);
  }
  
  // 如果是未知指令，則提供老師選單
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}


// =====================================
//        購點流程處理函式
// =====================================
async function handlePurchaseFlow(event, userId) {
  // 只有在 pendingPurchase 中有該用戶的數據，並且是文字訊息時才處理
  if (!pendingPurchase.has(userId) || event.message.type !== 'text') {
    return false;
  }

  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId); // 確保獲取到用戶最新資料
  const stepData = pendingPurchase.get(userId);

  // 取消購點或返回點數管理的通用處理
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU || text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
      pendingPurchase.delete(userId); // 清除購點流程狀態
      // 這裡直接調用 handleStudentCommands 讓它處理返回點數管理的 Flex Message
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true; // 表示已處理此事件
  }
  
  switch (stepData.step) {
    case 'input_last5':
      const orderId = stepData.data.orderId;
      const last5Digits = text;

      if (!/^\d{5}$/.test(last5Digits)) {
        await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
        return true;
      }

      const transactionClient = await pgPool.connect();
      try {
        await transactionClient.query('BEGIN');
        const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        const orderInTransaction = orderInTransactionRes.rows[0];

        // 檢查訂單狀態是否允許修改/提交後五碼
        if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) {
          await transactionClient.query('ROLLBACK');
          pendingPurchase.delete(userId);
          await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。');
          return true;
        }

        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation'; // 提交後五碼後狀態變為待確認
        await saveOrder({ orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: orderInTransaction.timestamp.toISOString() }, transactionClient);
        await transactionClient.query('COMMIT');
        
        pendingPurchase.delete(userId); // 清除購點流程狀態
        await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。\n\n您可回到「點數管理」查看訂單狀態。`);
        // 推送通知給老師 (可選，但建議做)
        if (TEACHER_ID) {
            push(TEACHER_ID, `收到新的匯款後五碼提交！\n學員: ${user.name}\n訂單ID: ${orderId}\n後五碼: ${last5Digits}\n點數: ${orderInTransaction.points}點\n金額: ${orderInTransaction.amount}元\n請儘快處理待確認清單。`).catch(e => console.error(`❌ 通知老師失敗:`, e.message));
        }
        await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId); // 重新導向點數管理 Flex Message
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        pendingPurchase.delete(userId);
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。');
        return true;
      } finally {
          transactionClient.release();
      }

    case 'select_plan':
      const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
      if (!selectedPlan) {
        await reply(replyToken, '請從列表中選擇有效的點數方案。', PURCHASE_PLANS.map(plan => ({ type: 'message', label: plan.label, text: plan.label })));
        return true;
      }
      stepData.data = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
      stepData.step = 'confirm_purchase';
      pendingPurchase.set(userId, stepData); // 更新 Map 中的狀態
      await reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
        { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
      ]);
      return true;

    case 'confirm_purchase':
      if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        const transactionClientConfirm = await pgPool.connect();
        try {
          await transactionClientConfirm.query('BEGIN');
          const orderId = `O${Date.now()}`; // 生成訂單 ID
          const newOrder = { ...stepData.data, orderId: orderId };
          await saveOrder(newOrder, transactionClientConfirm);
          await transactionClientConfirm.query('COMMIT');
          
          pendingPurchase.delete(userId); // 清除購點流程狀態

          await reply(replyToken, `已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` +
                                   `戶名：${BANK_INFO.accountName}\n` +
                                   `銀行：${BANK_INFO.bankName}\n` +
                                   `帳號：${BANK_INFO.accountNumber}\n\n` +
                                   `完成轉帳後，請再次進入「點數管理」並點選「輸入匯款後五碼」按鈕，輸入您的匯款帳號後五碼。\n\n` +
                                   `您的訂單編號為：${orderId}`);
          
          // 回到點數管理頁面，顯示新的 quickReply 選項
          await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
        } catch (err) {
          await transactionClientConfirm.query('ROLLBACK');
          console.error('❌ 確認購買交易失敗:', err.message);
          pendingPurchase.delete(userId);
          await reply(replyToken, '確認購買時發生錯誤，請稍後再試。');
        } finally {
            transactionClientConfirm.release();
        }
      } else {
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
        ]);
      }
      return true;
  }
  return false; // 如果沒有匹配到任何購點步驟，返回 false
}

// =====================================
//           學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  // 購點流程優先處理，如果已處理則直接返回
  if (await handlePurchaseFlow(event, userId)) {
    return;
  }

  const user = await getUser(userId);
  const courses = await getAllCourses();

  // 清理狀態
  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    pendingPurchase.delete(userId);
    pendingBookingConfirmation.delete(userId);
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    // 檢查是否有進行中的購點訂單
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    
    const pointBubbles = [];
    let quickReplyOptions = []; // 初始化 quickReply 選項

    // 點數顯示卡片
    pointBubbles.push({
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' },
      body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [
          { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' },
          { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' }
        ]
      },
      action: { type: 'message', label: '重新整理', text: COMMANDS.STUDENT.POINTS }
    });

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd;
        let additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '🕒 匯款已提交，等待確認'; cardColor = '#ff9e00'; statusText = '已提交五碼，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '❌ 訂單被退回！'; cardColor = '#d90429'; statusText = '訂單被老師退回'; additionalInfo = '請檢查匯款金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼'; actionCmd = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER; cardTitle = '❗ 匯款待確認'; cardColor = '#f28482'; statusText = '待付款';
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
                    { type: 'text', text: `後五碼: ${pendingOrder.last5Digits || '未輸入'}`, size: 'sm', align: 'center' },
                    ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []),
                    { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                    { type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'message', label: actionButtonLabel, text: actionCmd } },
                    { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
                ]
            }
        });
        // 如果有待處理訂單，則「購買點數」的 quickReply 就不會顯示，因為已經提示用戶處理現有訂單
    } else {
        // 如果沒有待處理訂單，才顯示購買點數的卡片
        pointBubbles.push({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [
                { type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }
            ] },
            action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }
        });
    }

    // 購點紀錄卡片
    pointBubbles.push({
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' },
      body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [
          { type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }
        ]
      },
      action: { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }
    });
    
    const flexMessage = { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
    return reply(replyToken, flexMessage, studentMenu); // 顯示學員通用菜單
  }

  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
      pendingPurchase.set(userId, { step: 'input_last5', data: { orderId: pendingOrder.order_id } }); // 使用 Map.set
      let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
      if (pendingOrder.status === 'rejected') {
        promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
      }
      return reply(replyToken, promptText, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 },
        { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
      ]);
    } else {
      pendingPurchase.delete(userId); // 清除可能殘留的狀態
      return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。', studentMenu);
    }
  }

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
      return reply(replyToken, `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請在「點數管理」頁面處理，或點擊「❌ 取消購買」。`, [
        { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU },
        { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
      ]);
    } else {
      pendingPurchase.set(userId, { step: 'select_plan', data: {} }); // 使用 Map.set
      const planOptions = PURCHASE_PLANS.map(plan => ({ type: 'message', label: plan.label, text: plan.label }));
      planOptions.push({ type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
      return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
    }
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    // 查詢已完成和已取消的訂單歷史
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'completed' OR status = 'canceled') ORDER BY timestamp DESC LIMIT 5`, [userId]);
    const completedOrders = ordersRes.rows;

    if (!user.history || user.history.length === 0 && completedOrders.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄或購點歷史。', studentMenu);
    }

    let historyMessages = [];
    if (user.history && user.history.length > 0) {
      let userHistoryText = '以下是你的點數操作記錄 (近5筆)：\n';
      user.history.slice(-5).reverse().forEach(record => {
        userHistoryText += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
      historyMessages.push({ type: 'text', text: userHistoryText.trim() });
    }

    if (completedOrders.length > 0) {
      let orderHistoryText = '\n以下是你的已完成/已取消購點訂單 (近5筆)：\n';
      completedOrders.forEach(order => {
        orderHistoryText += `・訂單 ${order.order_id}：購買 ${order.points} 點 ($${order.amount})，狀態：${order.status === 'completed' ? '已完成' : '已取消'} (${formatDateTime(order.timestamp)})\n`;
      });
      historyMessages.push({ type: 'text', text: orderHistoryText.trim() });
    }
    
    return reply(replyToken, historyMessages, studentMenu);
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const sevenDaysLater = now + (ONE_DAY_IN_MS * 7); // 未來七天內的課程
    
    // 過濾出未來七天內且用戶尚未預約或候補的課程
    const upcomingCourses = Object.values(courses).filter(c => 
      new Date(c.time).getTime() > now && 
      new Date(c.time).getTime() <= sevenDaysLater && 
      !c.students.includes(userId) && 
      !c.waiting.includes(userId)
    ).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '未來七天內沒有您可以預約的新課程。', studentMenu);
    }

    const courseBubbles = upcomingCourses.slice(0, 10).map(course => { // 最多顯示10堂課
        const isFull = course.students.length >= course.capacity;
        const statusText = `報名 ${course.students.length}/${course.capacity}`;
        
        // 將預約操作改為 postback，以便觸發確認步驟
        const actionButton = {
            type: 'postback',
            label: isFull ? '加入候補' : '立即預約',
            data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`,
            displayText: `確認預約 ${course.title}` // 顯示在聊天框中的文本
        };
        const headerColor = isFull ? '#ff9e00' : '#34a0a4'; // 滿員用橘色，未滿用藍綠色

        return {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: headerColor, paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'separator' }, // 分隔線
                    { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [
                        { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                        { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }
                    ] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                        { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 },
                        { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                    ] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                        { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 },
                        { type: 'text', text: statusText, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                    ] },
                ],
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    { type: 'button', style: 'primary', height: 'sm', color: isFull ? '#ff9e00' : '#1a759f', action: actionButton }
                ]
            }
        };
    });

    return reply(replyToken, [
        { type: 'text', text: '💡 請注意：課程開始前 8 小時不可退課。' },
        { type: 'flex', altText: '可預約課程列表', contents: { type: 'carousel', contents: courseBubbles } }
    ], studentMenu);
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    // 過濾出用戶已預約且未來的課程
    const enrolledCourses = Object.values(courses).filter(c => 
      c.students.includes(userId) && new Date(c.time).getTime() > now
    ).sort((a,b) => new Date(a.time) - new Date(b.time));

    // 過濾出用戶已候補且未來的課程
    const waitingCourses = Object.values(courses).filter(c => 
      c.waiting.includes(userId) && new Date(c.time).getTime() > now
    ).sort((a,b) => new Date(a.time) - new Date(b.time));

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。', studentMenu);
    }

    const courseBubbles = [
        // 已預約課程氣泡卡片
        ...enrolledCourses.map(course => {
            const canCancel = new Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS; // 8小時前可取消
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
                footer: canCancel ? { // 只有在可取消時才顯示取消按鈕
                    type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                        { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` } }
                    ]
                } : undefined // 如果不能取消，則 footer 為 undefined
            };
        }),
        // 候補課程氣泡卡片
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
                type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                    { type: 'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }
                ]
            }
        }))
    ];

    return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }, studentMenu); // 最多顯示10堂課
  }

  // 如果是未知的學員指令，則提供學員選單
  return reply(replyToken, '指令無效，請使用下方學員選單或輸入正確指令。', studentMenu);
}


// =====================================
//           自動提醒功能 & 伺服器啟動
// =====================================
async function checkAndSendReminders() {
    const now = Date.now();
    try {
        const courses = await getAllCourses();
        const usersRes = await pgPool.query('SELECT id, name FROM users');
        const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u]));

        for (const id in courses) {
            const course = courses[id];
            const courseTime = new Date(course.time).getTime();
            const timeUntilCourse = courseTime - now;

            // 在課程開始前1小時發送提醒
            // 設置一個小的時間窗，例如在 55-60 分鐘之間發送，避免多次觸發
            const oneHourInMs = ONE_HOUR_IN_MS;
            const reminderWindowStart = oneHourInMs - (5 * 60 * 1000); // 55分鐘前
            const reminderWindowEnd = oneHourInMs; // 1小時前

            if (timeUntilCourse > 0 && timeUntilCourse <= reminderWindowEnd && timeUntilCourse >= reminderWindowStart && !sentReminders.has(id)) {
                console.log(`🔔 準備發送課程提醒：${course.title}`);
                for (const studentId of course.students) {
                    if (dbUsersMap.has(studentId)) { // 確保用戶存在
                        push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`).catch(e => console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message));
                    }
                }
                sentReminders.set(id, true); // 標記為已發送
            }
        }
        // 清理已發送提醒的過期課程ID，避免記憶體洩漏
        // 如果課程時間已經過去了一天，就從 sentReminders 中移除
        for (const [id, value] of sentReminders.entries()) {
            if (!courses[id] || (new Date(courses[id].time).getTime() < (now - ONE_DAY_IN_MS))) {
                sentReminders.delete(id);
            }
        }
    } catch (err) {
        console.error('❌ 自動提醒功能發生錯誤:', err.stack);
    }
}

app.use(express.json({ verify: (req, res, buf) => { // 驗證 LINE signature 需要原始請求體
  if (req.headers['x-line-signature']) {
    req.rawBody = buf;
  }
} }));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const channelSecret = config.channelSecret;

  if (signature && channelSecret) {
    try {
      const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');
      if (hash !== signature) {
        console.error('❌ LINE Webhook 簽名驗證失敗。');
        return res.status(401).send('Unauthorized: Invalid signature');
      }
    } catch (error) {
        console.error('❌ LINE Webhook 簽名驗證時發生錯誤:', error);
        return res.status(400).send('Bad Request');
    }
  }

  // 處理所有接收到的事件
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.stack);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.9.15 (Improved error logging, robust reply handling, and quickReply display logic)`);
  
  // 定期清理過期課程
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  // 定期檢查並發送課程提醒
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);

  // 啟用 Keep-alive 功能以防止服務休眠
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

// =====================================
//           Webhook事件處理
// =====================================

async function handleEvent(event) {
    // 只處理 message 和 postback 事件
    if (event.type !== 'message' && event.type !== 'postback') {
        return;
    }
    
    const userId = event.source.userId;
    let user = await getUser(userId); // 嘗試從資料庫獲取用戶資料

    // 如果是新用戶，獲取其 LINE Profile 並保存
    if (!user) {
      try {
        const profile = await client.getProfile(userId);
        user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [] };
        await saveUser(user);
        console.log(`✨ 新用戶加入: ${user.name} (${user.id})`);
        // 新用戶歡迎訊息
        await reply(event.replyToken, `哈囉 ${user.name}！歡迎加入九容瑜伽，請多多指教！\n您目前的點數是 ${user.points} 點。您可以點擊下方的選單來預約課程或購買點數。`, studentMenu);
        return; // 新用戶首次處理，直接返回
      } catch (err) {
        console.error('❌ 獲取用戶資料失敗:', err.message);
        // 如果獲取失敗，給予一個預設名稱
        user = { id: userId, name: `新用戶 ${userId.substring(0, 8)}...`, points: 0, role: 'student', history: [] };
        await saveUser(user);
        await reply(event.replyToken, `哈囉 ${user.name}！歡迎加入九容瑜伽，請多多指教！\n您目前的點數是 ${user.points} 點。您可以點擊下方的選單來預約課程或購買點數。`, studentMenu);
        return; // 新用戶首次處理，直接返回
      }
    }

    // 處理文字訊息
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();

        // 身份切換指令
        if (text === COMMANDS.SWITCH_ROLE) {
            if (user.role === 'teacher') {
                user.role = 'student';
                await saveUser(user);
                await reply(event.replyToken, '您已切換為學員身份。', studentMenu);
            } else { // 當前是學員身份，嘗試切換為老師
                pendingTeacherLogin.set(userId, true); // 使用 Map.set
                await reply(event.replyToken, '請輸入老師密碼：');
            }
            return;
        }

        // 老師登入流程 (在身份切換後)
        if (pendingTeacherLogin.has(userId)) {
            pendingTeacherLogin.delete(userId); // 清除登入狀態
            if (text === TEACHER_PASSWORD) {
                user.role = 'teacher';
                await saveUser(user);
                await reply(event.replyToken, '密碼正確，您已切換為老師身份。', teacherMenu);
            } else {
                await reply(event.replyToken, '密碼錯誤。已自動切換回學員身份。', studentMenu);
            }
            return;
        }
        
        // 老師身份的文字指令處理
        if (user.role === 'teacher') {
            // 課程新增流程的文字輸入處理
            if (pendingCourseCreation.has(userId)) { // 使用 Map.has
                const stepData = pendingCourseCreation.get(userId); // 使用 Map.get
                switch (stepData.step) {
                    case 1: // Expecting course title
                        stepData.title = text;
                        stepData.step = 2;
                        pendingCourseCreation.set(userId, stepData); // 更新 Map
                        await reply(event.replyToken, '請輸入單堂課的點數費用 (例如: 2)：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 2: // Expecting points cost
                        const points = parseInt(text);
                        if (isNaN(points) || points <= 0) {
                            await reply(event.replyToken, '點數費用必須是正整數，請重新輸入。');
                            return; // 保持在當前步驟
                        }
                        stepData.pointsCost = points;
                        stepData.step = 3;
                        pendingCourseCreation.set(userId, stepData); // 更新 Map
                        await reply(event.replyToken, '請輸入課程容量 (例如: 5)：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 3: // Expecting capacity
                        const capacity = parseInt(text);
                        if (isNaN(capacity) || capacity <= 0) {
                            await reply(event.replyToken, '課程容量必須是正整數，請重新輸入。');
                            return; // 保持在當前步驟
                        }
                        stepData.capacity = capacity;
                        stepData.step = 4;
                        pendingCourseCreation.set(userId, stepData); // 更新 Map
                        await reply(event.replyToken, '請輸入課程日期和時間，每週至少一堂，持續四週（共四堂課），用換行分隔，格式為 YYYY/MM/DD HH:mm，例如：\n2025/08/01 19:00\n2025/08/08 19:00\n2025/08/15 19:00\n2025/08/22 19:00', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 4: // Expecting course times
                        const timeStrings = text.split('\n').map(s => s.trim()).filter(s => s);
                        if (timeStrings.length < 1) {
                            await reply(event.replyToken, '請至少輸入一堂課的時間。');
                            return; // 保持在當前步驟
                        }
                        const courseTimes = [];
                        for (const ts of timeStrings) {
                            const date = new Date(ts);
                            if (isNaN(date.getTime()) || date.getTime() < Date.now()) {
                                await reply(event.replyToken, `無效的日期時間格式或時間已過期：「${ts}」。請使用 YYYY/MM/DD HH:mm 格式，並確保時間未過期。`);
                                return; // 保持在當前步驟
                            }
                            courseTimes.push(date.toISOString());
                        }
                        stepData.times = courseTimes;
                        stepData.step = 5;
                        pendingCourseCreation.set(userId, stepData); // 更新 Map
                        const confirmMsg = `請確認新增以下課程系列：\n` +
                                           `課程名稱：${stepData.title}\n` +
                                           `點數費用：${stepData.pointsCost} 點/堂\n` +
                                           `課程容量：${stepData.capacity} 人/堂\n` +
                                           `開課時間：\n${stepData.times.map(t => formatDateTime(t)).join('\n')}\n\n` +
                                           `確認無誤請點選「確認新增課程」。`;
                        await reply(event.replyToken, confirmMsg, [
                            { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
                            { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }
                        ]);
                        break;
                    default:
                        // 未知步驟，清除狀態
                        pendingCourseCreation.delete(userId);
                        await reply(event.replyToken, '新增課程流程出錯，請重新開始。', teacherMenu);
                        break;
                }
                return; // 處理完畢，返回
            } else if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                // 確認新增課程
                if (!pendingCourseCreation.has(userId) || pendingCourseCreation.get(userId).step !== 5) {
                    await reply(event.replyToken, '無效操作，請重新從「新增課程」開始。', teacherMenu);
                    return;
                }
                const newCourseData = pendingCourseCreation.get(userId);
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const coursePrefix = await generateUniqueCoursePrefix(transactionClient); // 生成唯一前綴
                    const coursesToAdd = newCourseData.times.map((time, index) => ({
                        id: `${coursePrefix}${String.fromCharCode(65 + index)}`, // 例如 AA_A, AA_B...
                        title: `${newCourseData.title} - 第 ${index + 1} 堂`,
                        time: time,
                        capacity: newCourseData.capacity,
                        pointsCost: newCourseData.pointsCost,
                        students: [],
                        waiting: []
                    }));
                    for (const course of coursesToAdd) {
                        await saveCourse(course, transactionClient); // 在事務中保存課程
                    }
                    await transactionClient.query('COMMIT'); // 提交事務
                    pendingCourseCreation.delete(userId); // 清除狀態
                    await reply(event.replyToken, `課程系列「${newCourseData.title}」已成功新增！\n系列代碼：${coursePrefix}\n共新增 ${newCourseData.times.length} 堂課。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error('❌ 新增課程交易失敗:', err.stack);
                    await reply(event.replyToken, '新增課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
                return; // 處理完畢，返回
            } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
                // 取消新增課程流程
                if (pendingCourseCreation.has(userId)) {
                    pendingCourseCreation.delete(userId);
                    await reply(event.replyToken, '已取消新增課程。', teacherMenu);
                } else {
                    await reply(event.replyToken, '沒有正在進行的課程新增操作。', teacherMenu);
                }
                return; // 處理完畢，返回
            }
            await handleTeacherCommands(event, userId); // 處理其他老師指令
            return; // 處理完畢，返回
        } else { // Student role (學員身份)
            // 處理預約確認步驟 (文字指令確認)
            if (pendingBookingConfirmation.has(userId)) { // 使用 Map.has
                const confirmationData = pendingBookingConfirmation.get(userId); // 使用 Map.get
                const courseId = confirmationData.courseId;
                const course = await getCourse(courseId); // 重新從 DB 讀取最新狀態

                if (!course) { // 課程可能已被取消
                    pendingBookingConfirmation.delete(userId);
                    return reply(replyToken, '無法預約：課程不存在或已被取消。', studentMenu);
                }

                if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                    pendingBookingConfirmation.delete(userId); // 清除待確認狀態
                    const transactionClient = await pgPool.connect();
                    try {
                        await transactionClient.query('BEGIN'); // 開始事務
                        // 鎖定用戶和課程，避免併發問題
                        const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                        const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];

                        if (!currentUser || !courseInTransaction) {
                          throw new Error('用戶或課程資料不存在。');
                        }
                        if (currentUser.points < courseInTransaction.points_cost) {
                          throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。您目前有 ${currentUser.points} 點。`);
                        }
                        if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) {
                          throw new Error('您已預約或候補此課程。');
                        }
                        if (new Date(courseInTransaction.time).getTime() < Date.now()) {
                          throw new Error('課程已過期。');
                        }

                        // 確保課程和用戶數據是可變的副本
                        const courseToSave = {
                            id: courseInTransaction.id,
                            title: courseInTransaction.title,
                            time: courseInTransaction.time,
                            capacity: courseInTransaction.capacity,
                            students: [...courseInTransaction.students], // 拷貝陣列
                            waiting: [...courseInTransaction.waiting],   // 拷貝陣列
                            pointsCost: courseInTransaction.points_cost
                        };

                        if (courseToSave.students.length < courseToSave.capacity) {
                            // 直接預約成功
                            courseToSave.students.push(userId);
                            currentUser.points -= courseToSave.pointsCost;
                            if (!Array.isArray(currentUser.history)) currentUser.history = [];
                            currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                            await saveCourse(courseToSave, transactionClient);
                            await saveUser(currentUser, transactionClient);
                            await transactionClient.query('COMMIT'); // 提交事務
                            return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。\n您的剩餘點數：${currentUser.points} 點。`, studentMenu);
                        } else {
                            // 加入候補
                            courseToSave.waiting.push(userId);
                            if (!Array.isArray(currentUser.history)) currentUser.history = [];
                            currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                            await saveCourse(courseToSave, transactionClient);
                            await saveUser(currentUser, transactionClient);
                            await transactionClient.query('COMMIT'); // 提交事務
                            return reply(replyToken, `課程「${courseToSave.title}」已額滿，您已成功加入候補名單，目前候補第 ${courseToSave.waiting.length} 位。\n當有空位時會自動通知您。`, studentMenu);
                        }
                    } catch (err) {
                        await transactionClient.query('ROLLBACK'); // 回滾事務
                        console.error("❌ 預約課程交易失敗:", err.stack);
                        return reply(replyToken, `預約失敗：${err.message}`, studentMenu);
                    } finally {
                        transactionClient.release(); // 釋放連接
                    }
                } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) {
                    pendingBookingConfirmation.delete(userId); // 清除待確認狀態
                    return reply(replyToken, `已放棄預約課程「${course.title}」。`, studentMenu);
                } else {
                    // 如果用戶輸入了其他內容，提示他們進行選擇
                    const userPoints = (await getUser(userId)).points; // 重新獲取用戶點數以顯示最新
                    return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_BOOKING}」。\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost}點\n您的剩餘點數：${userPoints} 點\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n`, [
                        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING },
                        { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING }
                    ]);
                }
            }
            await handleStudentCommands(event, userId); // 處理其他學員指令
        }
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');
        const replyToken = event.replyToken;
        // 為了確保最新的課程狀態，在處理前重新獲取
        const courses = await getAllCourses(); 

        // 老師相關的 postback 處理
        if (user.role === 'teacher') {
            if (action === 'start_student_search') {
                pendingStudentSearch.set(userId, true);
                return reply(replyToken, '請輸入要查詢的學員 ID 或姓名：', [ { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU } ]);
            } else if (action === 'add_course_start') {
                // 觸發新增課程流程的第一步
                pendingCourseCreation.set(userId, { step: 1 });
                await reply(replyToken, '請輸入課程系列的名稱（例如：初級瑜伽 A 班）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                return;
            } else if (action === 'confirm_order') {
                const orderId = data.get('orderId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    const orderInTransaction = orderInTransactionRes.rows[0];

                    if (!orderInTransaction || orderInTransaction.status !== 'pending_confirmation') {
                        await transactionClient.query('ROLLBACK');
                        await reply(replyToken, `訂單 ${orderId} 狀態不正確或已被處理。`, teacherMenu);
                        return;
                    }

                    orderInTransaction.status = 'completed';
                    const targetUserRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [orderInTransaction.user_id]);
                    const targetUser = targetUserRes.rows[0];

                    if (!targetUser) throw new Error('找不到目標學員。');

                    targetUser.points += orderInTransaction.points;
                    if (!Array.isArray(targetUser.history)) targetUser.history = [];
                    targetUser.history.push({ action: `購點入帳：${orderId} (加 ${orderInTransaction.points} 點)`, time: new Date().toISOString() });
                    
                    await saveUser(targetUser, transactionClient);
                    await saveOrder(orderInTransaction, transactionClient);
                    await transactionClient.query('COMMIT'); // 提交事務

                    await reply(replyToken, `✅ 已確認訂單 ${orderId}，已為學員 ${targetUser.name} 加入 ${orderInTransaction.points} 點。\n目前點數：${targetUser.points} 點。`, teacherMenu);
                    // 通知學員點數已入帳 (非關鍵路徑，失敗不影響主流程)
                    push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已確認入帳，已加入 ${orderInTransaction.points} 點。\n您目前有 ${targetUser.points} 點。`).catch(e => console.error(`❌ 通知學員入帳失敗:`, e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error('❌ 確認訂單交易失敗:', err.message);
                    await reply(replyToken, err.message || '處理訂單時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
                return;
            } else if (action === 'reject_order') {
                const orderId = data.get('orderId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    const orderInTransaction = orderInTransactionRes.rows[0];

                    if (!orderInTransaction || orderInTransaction.status !== 'pending_confirmation') {
                        await transactionClient.query('ROLLBACK');
                        await reply(replyToken, `訂單 ${orderId} 狀態不正確或已被處理。`, teacherMenu);
                        return;
                    }

                    orderInTransaction.status = 'rejected'; // 設置為拒絕狀態
                    await saveOrder(orderInTransaction, transactionClient);
                    await transactionClient.query('COMMIT'); // 提交事務

                    await reply(replyToken, `✅ 已將訂單 ${orderId} 退回。\n已通知學員重新提交或聯繫。`, teacherMenu);
                    // 通知學員訂單被退回 (非關鍵路徑，失敗不影響主流程)
                    push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已被老師退回。原因：匯款資訊有誤或其他原因。\n請您重新確認匯款並在「點數管理」中再次提交匯款後五碼，或聯繫老師。`).catch(e => console.error(`❌ 通知學員訂單退回失敗:`, e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error('❌ 退回訂單交易失敗:', err.message);
                    await reply(replyToken, '處理訂單時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
                return;
            } else if (action === 'manage_course_group') {
                // 顯示課程系列中的單堂課程，並提供取消選項
                const prefix = data.get('prefix');
                const now = Date.now();
                // 查詢該系列中所有未來的課程
                const coursesInGroupRes = await pgPool.query('SELECT * FROM courses WHERE id LIKE $1 AND time > $2 ORDER BY time ASC', [`${prefix}%`, new Date(now)]);
                const coursesInGroup = coursesInGroupRes.rows.map(row => ({
                    id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity,
                    pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || []
                }));

                if (coursesInGroup.length === 0) {
                    return reply(replyToken, `系列代碼 ${prefix} 的課程均已結束或不存在。`, teacherMenu);
                }

                const courseBubbles = coursesInGroup.map(course => ({
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '單堂課程管理', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '課程ID', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: course.id, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `已預約 ${course.students.length}/${course.capacity} 人`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '候補', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.waiting.length} 人`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                        ],
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                        contents: [
                            { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消這堂課', data: `action=cancel_single_course_confirm&courseId=${course.id}`, displayText: `取消 ${course.title}` } }
                        ],
                    },
                }));
                const flexMessage = { type: 'flex', altText: `管理系列 ${prefix} 的課程`, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }; // 最多顯示10個課程卡片
                return reply(replyToken, [{ type: 'text', text: `系列代碼：${prefix} 的課程列表：` }, flexMessage], [{ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }]);
            } else if (action === 'cancel_course_group_confirm') {
                // 確認批次取消課程系列
                const prefix = data.get('prefix');
                return reply(replyToken, `確定要批次取消所有以 ${prefix} 開頭的課程嗎？此操作無法恢復，已預約學員將退還點數並收到通知。`, [
                    { type: 'postback', label: '✅ 確認批次取消', data: `action=cancel_course_group&prefix=${prefix}`, displayText: `確認批次取消 ${prefix} 系列課程` },
                    { type: 'message', label: '❌ 取消', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
                ]);
            } else if (action === 'cancel_course_group') {
                // 執行批次取消課程系列
                const prefix = data.get('prefix');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const canceledCourses = await deleteCoursesByPrefix(prefix, transactionClient); // 刪除課程並返回被刪除的課程列表

                    let refundedCount = 0;
                    for (const course of canceledCourses) {
                        for (const studentId of course.students) {
                            const student = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId])).rows[0];
                            if (student) {
                                student.points += course.pointsCost; // 退還點數
                                if (!Array.isArray(student.history)) student.history = [];
                                student.history.push({ action: `課程批次取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                                await saveUser(student, transactionClient);
                                // 通知學員課程取消 (非關鍵路徑)
                                push(studentId, `您預約的課程「${course.title}」已由老師批次取消，已退還您 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 向學員課程取消失敗:`, e.message));
                                refundedCount++;
                            }
                        }
                    }
                    await transactionClient.query('COMMIT'); // 提交事務
                    await reply(replyToken, `✅ 已成功批次取消所有以 ${prefix} 開頭的課程。共取消 ${canceledCourses.length} 堂，退還點數給 ${refundedCount} 位學員。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error('❌ 批次取消課程交易失敗:', err.stack);
                    await reply(replyToken, '批次取消課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
                return;
            } else if (action === 'cancel_single_course_confirm') {
                // 確認取消單堂課程
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) return reply(replyToken, '課程不存在。', teacherMenu);
                return reply(replyToken, `確定要取消課程：「${course.title}」(${formatDateTime(course.time)}) 嗎？\n已預約學員將退還點數並收到通知。`, [
                    { type: 'postback', label: '✅ 確認取消', data: `action=cancel_single_course&courseId=${courseId}`, displayText: `確認取消 ${course.title}` },
                    { type: 'message', label: '❌ 取消', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
                ]);
            } else if (action === 'cancel_single_course') {
                // 執行取消單堂課程
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const courseToDelete = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    if (!courseToDelete) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '課程不存在或已被取消。', teacherMenu);
                    }

                    let refundedCount = 0;
                    const studentsToNotify = [...courseToDelete.students]; // 複製陣列，避免在循環中修改

                    for (const studentId of studentsToNotify) {
                        const student = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId])).rows[0];
                        if (student) {
                            student.points += courseToDelete.points_cost; // 退還點數
                            if (!Array.isArray(student.history)) student.history = [];
                            student.history.push({ action: `課程取消退點：${courseToDelete.title} (退 ${courseToDelete.points_cost} 點)`, time: new Date().toISOString() });
                            await saveUser(student, transactionClient);
                            // 通知學員課程取消 (非關鍵路徑)
                            push(studentId, `您預約的課程「${courseToDelete.title}」已由老師取消，已退還您 ${courseToDelete.points_cost} 點。`).catch(e => console.error(`❌ 向學員課程取消失敗:`, e.message));
                            refundedCount++;
                        }
                    }
                    await deleteCourse(courseId, transactionClient); // 刪除課程
                    await transactionClient.query('COMMIT'); // 提交事務
                    await reply(replyToken, `✅ 課程「${courseToDelete.title}」已取消，並已退還點數給 ${refundedCount} 位學員。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error('❌ 取消單堂課程交易失敗:', err.stack);
                    await reply(replyToken, '取消課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
                return;
            }
        } else { // Student role postback (學員相關的 postback 處理)
            if (action === 'confirm_booking') { // 預約課程的確認步驟
                const courseId = data.get('courseId');
                const courseType = data.get('type'); // 'book' or 'wait'
                const course = await getCourse(courseId); // 獲取最新課程數據
                const currentUser = await getUser(userId); // 獲取最新用戶數據

                // 再次檢查狀態，防止在點擊後到確認前的時間內狀態發生變化
                if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) {
                    pendingBookingConfirmation.delete(userId); // 清除狀態
                    return reply(replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。', studentMenu);
                }
                if (currentUser.points < course.pointsCost) {
                    pendingBookingConfirmation.delete(userId); // 清除狀態
                    return reply(replyToken, `點數不足，此課程需要 ${course.pointsCost} 點。您目前有 ${currentUser.points} 點。`, studentMenu);
                }

                pendingBookingConfirmation.set(userId, { courseId: courseId, type: courseType }); // 設置待確認狀態

                const confirmMessage = `課程名稱：${course.title}\n` +
                                       `課程時間：${formatDateTime(course.time)}\n` +
                                       `所需點數：${course.pointsCost} 點\n` +
                                       `您的剩餘點數：${currentUser.points} 點\n\n` +
                                       `💡 請注意：課程開始前 8 小時不可退課。\n\n` +
                                       `確定要${courseType === 'book' ? '預約' : '加入候補'}此課程嗎？`;

                return reply(replyToken, confirmMessage, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING },
                    { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING }
                ]);
            }
            else if (action === 'cancel_booking_confirm') { // 取消預約的確認步驟
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    // 鎖定課程和用戶
                    const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];

                    if (!course || !course.students.includes(userId)) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '您並未預約此課程或課程不存在。', studentMenu);
                    }
                    if (new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, `課程「${course.title}」即將開始（不足8小時），無法取消。`, studentMenu);
                    }
                    
                    // 退還點數給取消預約的用戶
                    cancellingUser.points += course.points_cost;
                    if (!Array.isArray(cancellingUser.history)) cancellingUser.history = [];
                    cancellingUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.points_cost} 點)`, time: new Date().toISOString() });
                    await saveUser(cancellingUser, transactionClient);

                    // 從已預約列表中移除用戶
                    course.students = course.students.filter(sid => sid !== userId);
                    let replyMessage = `✅ 課程「${course.title}」已取消，已退還您 ${course.points_cost} 點。\n您目前點數：${cancellingUser.points} 點。`;

                    // 檢查候補列表，如果有空位且有候補，則自動遞補
                    if (course.waiting.length > 0) {
                        const nextWaitingUserId = course.waiting.shift(); // 移除第一個候補者
                        const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0];
                        
                        if (nextWaitingUser && nextWaitingUser.points >= course.points_cost) {
                            // 候補學生點數足夠，遞補成功
                            course.students.push(nextWaitingUserId); // 加入正式預約學生
                            nextWaitingUser.points -= course.points_cost; // 扣點
                            if (!Array.isArray(nextWaitingUser.history)) nextWaitingUser.history = [];
                            nextWaitingUser.history.push({ id: courseId, action: `候補補上：${course.title} (扣 ${course.points_cost} 點)`, time: new Date().toISOString() });
                            await saveUser(nextWaitingUser, transactionClient);
                            push(nextWaitingUserId, `🔔 提醒：您已從候補名單補上課程「${course.title}」！系統已自動扣除 ${course.points_cost} 點。\n請準時上課！`).catch(e => console.error(e.message));
                            replyMessage += '\n有候補學員已自動遞補成功。';
                        } else if (nextWaitingUser) {
                            // 候補學生點數不足，未能遞補
                            replyMessage += `\n候補學員 ${nextWaitingUser.name} (ID: ${nextWaitingUserId.substring(0,8)}...) 點數不足，未能遞補。`;
                            if (TEACHER_ID) push(TEACHER_ID, `課程「${course.title}」有學員取消，但候補者 ${nextWaitingUser.name} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                            // 如果候補者點數不足，將其放回候補列表頭部
                            course.waiting.unshift(nextWaitingUserId);
                        }
                    }
                    await saveCourse({ ...course, pointsCost: course.points_cost }, transactionClient); // 保存更新後的課程狀態
                    await transactionClient.query('COMMIT'); // 提交事務
                    return reply(replyToken, replyMessage.trim(), studentMenu);
                } catch(err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error("❌ 取消預約交易失敗:", err.stack);
                    return reply(replyToken, `取消預約失敗：${err.message}`, studentMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
            } else if (action === 'cancel_waiting_confirm') { // 取消候補的確認步驟
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN'); // 開始事務
                    const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    const user = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];

                    if (!course || !course.waiting?.includes(userId)) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '您並未候補此課程或課程不存在。', studentMenu);
                    }
                    
                    course.waiting = course.waiting.filter(x => x !== userId); // 從候補列表中移除
                    if (!Array.isArray(user.history)) user.history = [];
                    user.history.push({ id: courseId, action: `取消候補：${course.title}`, time: new Date().toISOString() });
                    await saveCourse({ ...course, pointsCost: course.points_cost }, transactionClient); // 保存更新後的課程狀態
                    await saveUser(user, transactionClient);
                    await transactionClient.query('COMMIT'); // 提交事務
                    return reply(replyToken, `✅ 已取消課程「${course.title}」的候補。`, studentMenu);
                } catch(err) {
                    await transactionClient.query('ROLLBACK'); // 回滾事務
                    console.error("❌ 取消候補交易失敗:", err.stack);
                    return reply(replyToken, `取消候補失敗：${err.message}`, studentMenu);
                } finally {
                    transactionClient.release(); // 釋放連接
                }
            }
        }
    }
}
