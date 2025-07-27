// index.js - V4.9.14 (Removed studentMenu quickReply from specific student command replies)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Pool } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto =require('crypto');
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
const TEACHER_ID = process.env.TEACHER_ID;

const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;

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

async function getUser(userId, dbClient = pgPool) {
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
    throw err;
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
  await pgPool.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
}

async function reply(replyToken, content, menu = null) {
  let messages;
  if (Array.isArray(content)) messages = content;
  else if (typeof content === 'string') messages = [{ type: 'text', text: content }];
  else messages = [content];
  
  // 檢查 menu 是否有效且有內容，才加入 quickReply
  const validMenuItems = (menu || []).slice(0, 13).map(i => ({ type: 'action', action: i }));
  
  if (validMenuItems.length > 0 && messages.length > 0) {
      messages[messages.length - 1].quickReply = { items: validMenuItems };
  } else {
      // 如果沒有有效的 quickReply 項目，則確保不會留下空的 quickReply 物件
      if (messages.length > 0 && messages[messages.length - 1].quickReply) {
          delete messages[messages.length - 1].quickReply;
      }
  }

  try {
    await client.replyMessage(replyToken, messages);
  } catch (error) {
    console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response : error.message);
    throw error;
  }
}

async function push(to, content) {
  let messages;
  if (Array.isArray(content)) messages = content;
  else if (typeof content === 'string') messages = [{ type: 'text', text: content }];
  else if (typeof content === 'object' && content !== null && content.type) messages = [content];
  else {
    console.error(`WARN: push 函式收到不明內容`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }
  try {
    await client.pushMessage(to, messages);
  } catch (error) {
    const errorDetails = error.originalError ? error.originalError.response : { status: 'N/A', statusText: error.message, data: 'N/A' };
    console.error(`❌ push 函式發送失敗給 ${to}:`, `狀態碼: ${errorDetails.status},`, `訊息: ${errorDetails.statusText}`);
    if(errorDetails.data) console.error(`響應數據:`, errorDetails.data);
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
    if (weekday.startsWith('週')) weekday = weekday.slice(-1);
    return `${month}-${day}（${weekday}）${hour}:${minute}`;
}

// =====================================
//               快速選單定義 (注意：此選單僅為定義，不再作為常駐 quickReply 使用)
// =====================================
const teacherMenu = [ { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }, { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }, { type: 'postback', label: '查詢學員', data: 'action=start_student_search', displayText: '準備查詢學員...' }, { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT }, ];
const studentMenu = [ { type: 'message', label: '點數管理', text: COMMANDS.STUDENT.POINTS }, { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE }, { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES }];

// =====================================
//      暫存狀態物件
// =====================================
const pendingTeacherLogin = {}; 
const pendingCourseCreation = {}; 
const pendingPurchase = {}; 
const pendingManualAdjust = {}; 
const sentReminders = {}; 
const pendingStudentSearch = {};
const pendingBookingConfirmation = {}; // 新增：用於預約確認步驟

// =====================================
//          老師指令處理函式
// =====================================
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  if (pendingStudentSearch[userId]) {
      if (text === COMMANDS.TEACHER.MAIN_MENU) {
          delete pendingStudentSearch[userId];
          return reply(replyToken, '已取消學員查詢。', teacherMenu);
      }
      const query = text;
      let foundUser = await getUser(query);
      if (!foundUser || foundUser.role !== 'student') {
          const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
          if (res.rows.length > 0) foundUser = res.rows[0];
      }
      delete pendingStudentSearch[userId];
      if (!foundUser) return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
      let studentInfo = `學員姓名：${foundUser.name}\n學員 ID：${foundUser.id}\n剩餘點數：${foundUser.points} 點\n歷史記錄 (近5筆)：\n`;
      if (foundUser.history && foundUser.history.length > 0) {
        foundUser.history.slice(-5).reverse().forEach(record => {
          studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
        });
      }
      return reply(replyToken, studentInfo.trim(), teacherMenu);
  }

  if (pendingManualAdjust[userId] && text !== COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, '已取消手動調整點數。', teacherMenu);
      }
      const parts = text.split(' ');
      if (parts.length !== 2) return reply(replyToken, '指令格式錯誤。\n請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5\n或輸入 @返回點數管理 取消。');
      const targetIdentifier = parts[0];
      const amount = parseInt(parts[1]);
      if (isNaN(amount) || amount === 0) return reply(replyToken, '點數數量必須是非零整數。');
      let foundUser = await getUser(targetIdentifier);
      if (!foundUser) {
          const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) foundUser = res.rows[0];
      }
      if (!foundUser) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherMenu);
      }
      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);
      const transactionClient = await pgPool.connect();
      try {
          await transactionClient.query('BEGIN');
          const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [foundUser.id]);
          const userInTransaction = userInTransactionRes.rows[0];
          if (!userInTransaction) throw new Error('操作失敗，找不到學員資料。');
          if (operation === '扣點' && userInTransaction.points < absAmount) throw new Error(`學員 ${userInTransaction.name} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${absAmount} 點）。`);
          userInTransaction.points += amount;
          if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
          userInTransaction.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
          await saveUser(userInTransaction, transactionClient);
          await transactionClient.query('COMMIT');
          push(userInTransaction.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
          delete pendingManualAdjust[userId];
          return reply(replyToken, `✅ 已成功為學員 ${userInTransaction.name} ${operation} ${absAmount} 點，目前點數：${userInTransaction.points} 點。`, teacherMenu);
      } catch (err) {
          await transactionClient.query('ROLLBACK');
          console.error('❌ 手動調整點數交易失敗:', err.message);
          delete pendingManualAdjust[userId];
          return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。', teacherMenu);
      } finally {
          transactionClient.release();
      }
  } else if (text !== COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST && !text.match(/^\S+\s+(-?\d+)$/) && pendingManualAdjust[userId]) {
      delete pendingManualAdjust[userId];
  }

  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    delete pendingManualAdjust[userId];
    delete pendingStudentSearch[userId];
    delete pendingCourseCreation[userId];
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }

  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
    const pointManagementBubbles = [
      { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' }, ], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'message', label: '查看待確認訂單', text: COMMANDS.TEACHER.PENDING_ORDERS } },
      { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [ { type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }, ], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'message', label: '手動調整點數', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS } }
    ];
    const flexMessage = { type: 'flex', altText: '點數管理功能', contents: { type: 'carousel', contents: pointManagementBubbles } };
    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }]);
  }

  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
    const now = Date.now();
    const allCourses = Object.values(await getAllCourses());
    const courseGroups = {};
    for (const course of allCourses) {
        if (new Date(course.time).getTime() > now) {
            const prefix = course.id.substring(0, 2);
            if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) {
                courseGroups[prefix] = course;
            }
        }
    }
    const courseBubbles = [];
    const sortedPrefixes = Object.keys(courseGroups).sort();
    for (const prefix of sortedPrefixes) {
        const earliestUpcomingCourse = courseGroups[prefix];
        courseBubbles.push({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''), weight: 'bold', size: 'xl', wrap: true },
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
    const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [ { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }, ], justifyContent: 'center', alignItems: 'center', height: '150px' }, ], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
    courseBubbles.push(addCourseBubble);
    let introText = '課程管理面板';
    if (Object.keys(courseGroups).length === 0) introText = '目前沒有任何進行中的課程系列，點擊「+」可新增。';
    else introText = '以下為各課程系列的管理選項：';
    const flexMessage = { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } };
    return reply(replyToken, [{ type: 'text', text: introText }, flexMessage], [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }]);
  }

  if (text === COMMANDS.TEACHER.REPORT) {
    const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
    const students = usersRes.rows;
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length;
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
    let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
    return reply(replyToken, report.trim(), teacherMenu);
  }

  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
    (async () => {
        try {
            const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
            const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
            if (pendingConfirmationOrders.length === 0) return push(userId, '目前沒有待確認的購點訂單。');
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 0)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || 'N/A'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [ { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } } ] } }));
            await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust[userId] = { step: 1 };
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回老師主選單 取消。', [ { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU } ]);
  }
  
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}


// =====================================
//        購點流程處理函式
// =====================================
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') return false;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];

  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
      // 這裡直接調用 handleStudentCommands 讓它處理返回點數管理的 Flex Message
      await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
      return true;
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
        if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) {
          await transactionClient.query('ROLLBACK');
          delete pendingPurchase[userId];
          await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。');
          return true;
        }
        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        await saveOrder({ orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: orderInTransaction.timestamp.toISOString() }, transactionClient);
        await transactionClient.query('COMMIT');
        delete pendingPurchase[userId];
        await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。`);
        // 這裡直接調用 handleStudentCommands 讓它處理返回點數管理的 Flex Message
        await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        delete pendingPurchase[userId];
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。');
        return true;
      } finally {
          transactionClient.release();
      }
    case 'select_plan':
      const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
      if (!selectedPlan) {
        await reply(replyToken, '請從列表中選擇有效的點數方案。'); // 這裡不會有 quickReply，因為沒有傳入 menu 參數
        return true;
      }
      stepData.data = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
      stepData.step = 'confirm_purchase';
      await reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [ { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS }, { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE }, ]);
      return true;
    case 'confirm_purchase':
      if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        const transactionClientConfirm = await pgPool.connect();
        try {
          await transactionClientConfirm.query('BEGIN');
          const orderId = `O${Date.now()}`;
          const newOrder = { ...stepData.data, orderId: orderId };
          await saveOrder(newOrder, transactionClientConfirm);
          await transactionClientConfirm.query('COMMIT');
          delete pendingPurchase[userId];
          await reply(replyToken, `已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數管理」並輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`);
        } catch (err) {
          await transactionClientConfirm.query('ROLLBACK');
          console.error('❌ 確認購買交易失敗:', err.message);
          delete pendingPurchase[userId];
          await reply(replyToken, '確認購買時發生錯誤，請稍後再試。');
        } finally {
            transactionClientConfirm.release();
        }
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        delete pendingPurchase[userId];
        await reply(replyToken, '已取消購買點數。');
        await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId); // 重新導向點數管理 Flex Message
      } else {
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
      }
      return true;
  }
  return false;
}

// =====================================
//           學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  // 購點流程優先處理
  if (await handlePurchaseFlow(event, userId)) return;

  const user = await getUser(userId);
  const courses = await getAllCourses();

  // 清理狀態
  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    delete pendingPurchase[userId];
    delete pendingBookingConfirmation[userId]; 
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    if (!pendingPurchase[userId] || (pendingPurchase[userId].step !== 'input_last5' && pendingPurchase[userId].step !== 'edit_last5')) delete pendingPurchase[userId];
    delete pendingBookingConfirmation[userId]; 
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    const pointBubbles = [];
    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd;
        let additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '🕒 匯款已提交，等待確認'; cardColor = '#ff9e00'; statusText = '已提交五碼，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '❌ 訂單被退回！'; cardColor = '#d90429'; statusText = '訂單被老師退回'; additionalInfo = '請檢查匯款金額或後五碼，並重新提交。';
        } else {
            actionButtonLabel = '輸入匯款後五碼'; actionCmd = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER; cardTitle = '❗ 匯款待確認'; cardColor = '#f28482'; statusText = '待付款';
        }
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [ { type: 'text', text: `訂單 ID: ${pendingOrder.order_id}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last5Digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'message', label: actionButtonLabel, text: actionCmd } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } });
    }
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [ { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' } ] }, action: { type: 'message', label: '重新整理', text: COMMANDS.STUDENT.POINTS } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY } });
    const flexMessage = { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
    return reply(replyToken, flexMessage); // 移除 quickReply
  }

  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
      if (pendingOrder.status === 'rejected') promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
      return reply(replyToken, promptText, [ { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }, { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU } ]);
    } else {
      delete pendingPurchase[userId];
      return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。'); // 移除 quickReply
    }
  }

  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    // 這裡維持 quickReply，因為這是查詢點數的單純文字回覆
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
      return reply(replyToken, `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請在「點數管理」主頁面輸入後五碼，或選擇「❌ 取消購買」。`, [ { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }, { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }, ]);
    } else {
      pendingPurchase[userId] = { step: 'select_plan', data: {} };
      const planOptions = PURCHASE_PLANS.map(plan => ({ type: 'message', label: plan.label, text: plan.label }));
      planOptions.push({ type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
      return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
    }
  }

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
        if (pendingOrder.status === 'pending_confirmation') {
          return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。'); // 移除 quickReply
        }
        else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
            const transactionClientCancel = await pgPool.connect();
            try {
              await transactionClientCancel.query('BEGIN');
              await deleteOrder(pendingOrder.order_id, transactionClientCancel);
              await transactionClientCancel.query('COMMIT');
              delete pendingPurchase[userId];
              // 移除 studentMenu，並讓它重新觸發點數管理 Flex Message
              await reply(replyToken, '已取消您的購點訂單。');
              await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
              return; // 直接返回，避免後續處理
            } catch (err) {
              await transactionClientCancel.query('ROLLBACK');
              console.error('❌ 取消購點訂單交易失敗:', err.message);
              return reply(replyToken, '取消訂單失敗，請稍後再試。'); // 移除 quickReply
            } finally {
                transactionClientCancel.release();
            }
        }
    }
    if (pendingPurchase[userId]) delete pendingPurchase[userId];
    return reply(replyToken, '目前沒有待取消的購點訂單。'); // 移除 quickReply
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。'); // 移除 quickReply
    }
    let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
    user.history.slice(-5).reverse().forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim()); // 移除 quickReply
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
    const upcomingCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > now && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId)).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
    if (upcomingCourses.length === 0) {
      return reply(replyToken, '未來七天內沒有您可以預約的新課程。'); 
    }
    const courseBubbles = upcomingCourses.slice(0, 10).map(course => {
        const isFull = course.students.length >= course.capacity;
        const statusText = `報名 ${course.students.length}/${course.capacity}`;
        // 將預約操作改為 postback，以便觸發確認步驟
        const actionButton = { type: 'postback', label: isFull ? '加入候補' : '立即預約', data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`, displayText: `確認預約 ${course.title}` };
        const headerColor = isFull ? '#ff9e00' : '#34a0a4';
        return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: headerColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator' }, { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: statusText, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', height: 'sm', color: isFull ? '#ff9e00' : '#1a759f', action: actionButton }] } };
    });
    return reply(replyToken, [ { type: 'text', text: '💡 請注意：課程開始前 8 小時不可退課。' }, { type: 'flex', altText: '可預約課程列表', contents: { type: 'carousel', contents: courseBubbles } } ]); // 移除 quickReply
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
    const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。');
    }
    const courseBubbles = [
        ...enrolledCourses.map(course => {
            const canCancel = new Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
            return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' } ] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` } }] } : undefined };
        }),
        ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } }))
    ];
    return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }); // 移除 quickReply
  }

  return reply(replyToken, '指令無效，請使用富選單或輸入正確指令。', studentMenu);
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
            const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 1小時前5分鐘的範圍
            if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
                console.log(`🔔 準備發送課程提醒：${course.title}`);
                for (const studentId of course.students) {
                    if (dbUsersMap.has(studentId)) {
                        push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`).catch(e => console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message));
                    }
                }
                sentReminders[id] = true;
            }
        }
        // 清理已發送提醒的過期課程ID，避免記憶體洩漏
        for (const id in sentReminders) {
            if (!courses[id] || (new Date(courses[id].time).getTime() < (now - ONE_DAY_IN_MS))) { // 如果課程已不存在或已過期一天
                delete sentReminders[id];
            }
        }
    } catch (err) {
        console.error('❌ 自動提醒功能發生錯誤:', err.stack);
    }
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

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
  console.log(`Bot 版本: V4.9.14 (Removed studentMenu quickReply from specific student command replies)`);
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

// =====================================
//           Webhook事件處理
// =====================================

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const userId = event.source.userId;
    let user = await getUser(userId);
    let displayName = `用戶 ${userId.substring(0, 8)}...`;
    if (!user) {
      try {
        const profile = await client.getProfile(userId);
        user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [] };
        displayName = profile.displayName;
        await saveUser(user);
        console.log(`✨ 新用戶加入: ${user.name} (${user.id})`);
      } catch (err) {
        console.error('❌ 獲取用戶資料失敗:', err.message);
        user = { id: userId, name: `新用戶 ${userId.substring(0, 8)}...`, points: 0, role: 'student', history: [] };
        await saveUser(user);
      }
    } else {
        displayName = user.name;
    }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();

        if (text === COMMANDS.SWITCH_ROLE) {
            if (user.role === 'teacher') {
                user.role = 'student';
                await saveUser(user);
                await reply(event.replyToken, '您已切換為學員身份。', studentMenu);
            } else {
                pendingTeacherLogin[userId] = true;
                await reply(event.replyToken, '請輸入老師密碼：');
            }
            return;
        }

        if (pendingTeacherLogin[userId]) {
            delete pendingTeacherLogin[userId];
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
            if (pendingCourseCreation[userId]) {
                const stepData = pendingCourseCreation[userId];
                switch (stepData.step) {
                    case 1: // Expecting course title
                        stepData.title = text;
                        stepData.step = 2;
                        await reply(event.replyToken, '請輸入單堂課的點數費用 (例如: 2)：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 2: // Expecting points cost
                        const points = parseInt(text);
                        if (isNaN(points) || points <= 0) {
                            await reply(event.replyToken, '點數費用必須是正整數，請重新輸入。');
                            return;
                        }
                        stepData.pointsCost = points;
                        stepData.step = 3;
                        await reply(event.replyToken, '請輸入課程容量 (例如: 5)：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 3: // Expecting capacity
                        const capacity = parseInt(text);
                        if (isNaN(capacity) || capacity <= 0) {
                            await reply(event.replyToken, '課程容量必須是正整數，請重新輸入。');
                            return;
                        }
                        stepData.capacity = capacity;
                        stepData.step = 4;
                        await reply(event.replyToken, '請輸入課程日期和時間，每週至少一堂，持續四週（共四堂課），用換行分隔，格式為 YYYY/MM/DD HH:mm，例如：\n2025/08/01 19:00\n2025/08/08 19:00\n2025/08/15 19:00\n2025/08/22 19:00', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                        break;
                    case 4: // Expecting course times
                        const timeStrings = text.split('\n').map(s => s.trim()).filter(s => s);
                        if (timeStrings.length < 1) {
                            await reply(event.replyToken, '請至少輸入一堂課的時間。');
                            return;
                        }
                        const courseTimes = [];
                        for (const ts of timeStrings) {
                            const date = new Date(ts);
                            if (isNaN(date.getTime()) || date.getTime() < Date.now()) {
                                await reply(event.replyToken, `無效的日期時間格式或時間已過期：「${ts}」。請使用 YYYY/MM/DD HH:mm 格式，並確保時間未過期。`);
                                return;
                            }
                            courseTimes.push(date.toISOString());
                        }
                        stepData.times = courseTimes;
                        stepData.step = 5;
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
                }
                return;
            } else if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                if (!pendingCourseCreation[userId] || pendingCourseCreation[userId].step !== 5) {
                    await reply(event.replyToken, '無效操作，請重新從「新增課程」開始。', teacherMenu);
                    return;
                }
                const newCourseData = pendingCourseCreation[userId];
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const coursePrefix = await generateUniqueCoursePrefix(transactionClient);
                    const coursesToAdd = newCourseData.times.map((time, index) => ({
                        id: `${coursePrefix}${String.fromCharCode(65 + index)}`,
                        title: `${newCourseData.title} - 第 ${index + 1} 堂`,
                        time: time,
                        capacity: newCourseData.capacity,
                        pointsCost: newCourseData.pointsCost,
                        students: [],
                        waiting: []
                    }));
                    for (const course of coursesToAdd) {
                        await saveCourse(course, transactionClient);
                    }
                    await transactionClient.query('COMMIT');
                    delete pendingCourseCreation[userId];
                    await reply(event.replyToken, `課程系列「${newCourseData.title}」已成功新增！\n系列代碼：${coursePrefix}\n共新增 ${newCourseData.times.length} 堂課。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error('❌ 新增課程交易失敗:', err.stack);
                    await reply(event.replyToken, '新增課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release();
                }
                return;
            } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
                if (pendingCourseCreation[userId]) {
                    delete pendingCourseCreation[userId];
                    await reply(event.replyToken, '已取消新增課程。', teacherMenu);
                } else {
                    await reply(event.replyToken, '沒有正在進行的課程新增操作。', teacherMenu);
                }
                return;
            }
            await handleTeacherCommands(event, userId); // 處理其他老師指令
            return;
        } else { // Student role
            // 處理預約確認步驟 (文字指令確認)
            if (pendingBookingConfirmation[userId]) {
                const confirmationData = pendingBookingConfirmation[userId];
                const courseId = confirmationData.courseId;
                const course = await getCourse(courseId); // 重新從 DB 讀取最新狀態

                if (!course) { // 課程可能已被取消
                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, '無法預約：課程不存在或已被取消。'); // 移除 quickReply
                }

                if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                    delete pendingBookingConfirmation[userId]; // 清除待確認狀態
                    const transactionClient = await pgPool.connect();
                    try {
                        await transactionClient.query('BEGIN');
                        const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                        const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];

                        if (!currentUser || !courseInTransaction) throw new Error('用戶或課程資料不存在。');
                        if (currentUser.points < courseInTransaction.points_cost) throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。`);
                        if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) throw new Error('您已預約或候補此課程。');
                        if (new Date(courseInTransaction.time).getTime() < Date.now()) throw new Error('課程已過期。');

                        const courseToSave = {
                            id: courseInTransaction.id, title: courseInTransaction.title, time: courseInTransaction.time,
                            capacity: courseInTransaction.capacity, students: courseInTransaction.students, waiting: courseInTransaction.waiting,
                            pointsCost: courseInTransaction.points_cost
                        };

                        if (courseToSave.students.length < courseToSave.capacity) {
                            courseToSave.students.push(userId);
                            currentUser.points -= courseToSave.pointsCost;
                            currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                            await saveCourse(courseToSave, transactionClient); // 修正：確保課程資料寫回資料庫
                            await saveUser(currentUser, transactionClient);
                            await transactionClient.query('COMMIT');
                            return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`); // 移除 quickReply
                        } else {
                            courseToSave.waiting.push(userId);
                            currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                            await saveCourse(courseToSave, transactionClient); // 修正：確保課程資料寫回資料庫
                            await saveUser(currentUser, transactionClient);
                            await transactionClient.query('COMMIT');
                            return reply(replyToken, `課程已額滿，您已成功加入候補名單。`); // 移除 quickReply
                        }
                    } catch (err) {
                        await transactionClient.query('ROLLBACK');
                        console.error("❌ 預約課程交易失敗:", err.stack);
                        return reply(replyToken, `預約失敗：${err.message}`); // 移除 quickReply
                    } finally {
                        transactionClient.release();
                    }
                } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) {
                    delete pendingBookingConfirmation[userId]; // 清除待確認狀態
                    return reply(replyToken, `已放棄預約課程「${course.title}」。`); // 移除 quickReply
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
        const courses = await getAllCourses(); // 確保可以訪問課程資料

        if (action === 'start_student_search') {
            pendingStudentSearch[userId] = true;
            return reply(replyToken, '請輸入要查詢的學員 ID 或姓名：', [ { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU } ]);
        }

        if (user.role === 'teacher') {
            if (action === 'add_course_start') {
                pendingCourseCreation[userId] = { step: 1 };
                await reply(replyToken, '請輸入課程系列的名稱（例如：初級瑜伽 A 班）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
                return;
            } else if (action === 'confirm_order') {
                const orderId = data.get('orderId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
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
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `已確認訂單 ${orderId}，已為學員 ${targetUser.name} 加入 ${orderInTransaction.points} 點。\n目前點數：${targetUser.points} 點。`, teacherMenu);
                    push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已確認入帳，已加入 ${orderInTransaction.points} 點。\n您目前有 ${targetUser.points} 點。`).catch(e => console.error(`❌ 通知學員入帳失敗:`, e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error('❌ 確認訂單交易失敗:', err.message);
                    await reply(replyToken, err.message || '處理訂單時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release();
                }
                return;
            } else if (action === 'reject_order') {
                const orderId = data.get('orderId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    const orderInTransaction = orderInTransactionRes.rows[0];
                    if (!orderInTransaction || orderInTransaction.status !== 'pending_confirmation') {
                        await transactionClient.query('ROLLBACK');
                        await reply(replyToken, `訂單 ${orderId} 狀態不正確或已被處理。`, teacherMenu);
                        return;
                    }
                    orderInTransaction.status = 'rejected';
                    await saveOrder(orderInTransaction, transactionClient);
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `已將訂單 ${orderId} 退回。\n已通知學員重新提交或聯繫。`, teacherMenu);
                    push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已被老師退回。原因：匯款資訊有誤或其他原因。\n請您重新確認匯款並在「點數管理」中再次提交匯款後五碼，或聯繫老師。`).catch(e => console.error(`❌ 通知學員訂單退回失敗:`, e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error('❌ 退回訂單交易失敗:', err.message);
                    await reply(replyToken, '處理訂單時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release();
                }
                return;
            } else if (action === 'manage_course_group') {
                const prefix = data.get('prefix');
                const now = Date.now();
                const coursesInGroupRes = await pgPool.query('SELECT * FROM courses WHERE id LIKE $1 AND time > $2 ORDER BY time ASC', [`${prefix}%`, new Date(now)]);
                const coursesInGroup = coursesInGroupRes.rows.map(row => ({
                    id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity,
                    pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || []
                }));
                if (coursesInGroup.length === 0) return reply(replyToken, `系列代碼 ${prefix} 的課程均已結束或不存在。`, teacherMenu);

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
                        contents: [ { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消這堂課', data: `action=cancel_single_course_confirm&courseId=${course.id}`, displayText: `取消 ${course.title}` } } ],
                    },
                }));
                const flexMessage = { type: 'flex', altText: `管理系列 ${prefix} 的課程`, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } };
                return reply(replyToken, [{ type: 'text', text: `系列代碼：${prefix} 的課程列表：` }, flexMessage], [{ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }]);
            } else if (action === 'cancel_course_group_confirm') {
                const prefix = data.get('prefix');
                return reply(replyToken, `確定要批次取消所有以 ${prefix} 開頭的課程嗎？此操作無法恢復，已預約學員將退還點數並收到通知。`, [
                    { type: 'postback', label: '✅ 確認批次取消', data: `action=cancel_course_group&prefix=${prefix}`, displayText: `確認批次取消 ${prefix} 系列課程` },
                    { type: 'message', label: '❌ 取消', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
                ]);
            } else if (action === 'cancel_course_group') {
                const prefix = data.get('prefix');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const canceledCourses = await deleteCoursesByPrefix(prefix, transactionClient);
                    let refundedCount = 0;
                    for (const course of canceledCourses) {
                        for (const studentId of course.students) {
                            const student = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId])).rows[0];
                            if (student) {
                                student.points += course.pointsCost;
                                if (!Array.isArray(student.history)) student.history = [];
                                student.history.push({ action: `課程批次取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                                await saveUser(student, transactionClient);
                                push(studentId, `您預約的課程「${course.title}」已由老師批次取消，已退還您 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 向學員課程取消失敗:`, e.message));
                                refundedCount++;
                            }
                        }
                    }
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `已成功批次取消所有以 ${prefix} 開頭的課程。共取消 ${canceledCourses.length} 堂，退還點數給 ${refundedCount} 位學員。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error('❌ 批次取消課程交易失敗:', err.stack);
                    await reply(replyToken, '批次取消課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release();
                }
                return;
            } else if (action === 'cancel_single_course_confirm') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) return reply(replyToken, '課程不存在。', teacherMenu);
                return reply(replyToken, `確定要取消課程：「${course.title}」(${formatDateTime(course.time)}) 嗎？\n已預約學員將退還點數並收到通知。`, [
                    { type: 'postback', label: '✅ 確認取消', data: `action=cancel_single_course&courseId=${courseId}`, displayText: `確認取消 ${course.title}` },
                    { type: 'message', label: '❌ 取消', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
                ]);
            } else if (action === 'cancel_single_course') {
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const courseToDelete = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    if (!courseToDelete) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '課程不存在或已被取消。', teacherMenu);
                    }
                    let refundedCount = 0;
                    const studentsToNotify = [...courseToDelete.students]; // Copy array before modification
                    for (const studentId of studentsToNotify) {
                        const student = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId])).rows[0];
                        if (student) {
                            student.points += courseToDelete.points_cost;
                            if (!Array.isArray(student.history)) student.history = [];
                            student.history.push({ action: `課程取消退點：${courseToDelete.title} (退 ${course.points_cost} 點)`, time: new Date().toISOString() });
                            await saveUser(student, transactionClient);
                            push(studentId, `您預約的課程「${courseToDelete.title}」已由老師取消，已退還您 ${course.points_cost} 點。`).catch(e => console.error(`❌ 向學員課程取消失敗:`, e.message));
                            refundedCount++;
                        }
                    }
                    await deleteCourse(courseId, transactionClient);
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `課程「${courseToDelete.title}」已取消，並已退還點數給 ${refundedCount} 位學員。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error('❌ 取消單堂課程交易失敗:', err.stack);
                    await reply(replyToken, '取消課程時發生錯誤，請稍後再試。', teacherMenu);
                } finally {
                    transactionClient.release();
                }
                return;
            }
        } else { // Student role postback
            if (action === 'confirm_booking') { // 預約確認 Postback 處理 (會觸發文字指令的預約確認)
                const courseId = data.get('courseId');
                const courseType = data.get('type'); // 'book' or 'wait'
                const course = await getCourse(courseId);
                if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) {
                    return reply(replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。'); // 移除 quickReply
                }
                const userPoints = (await getUser(userId)).points;
                if (userPoints < course.pointsCost) {
                    return reply(replyToken, `點數不足，此課程需要 ${course.pointsCost} 點。您目前有 ${userPoints} 點。`); // 移除 quickReply
                }

                pendingBookingConfirmation[userId] = { courseId: courseId, type: courseType };

                const confirmMessage = `課程名稱：${course.title}\n` +
                                       `課程時間：${formatDateTime(course.time)}\n` +
                                       `所需點數：${course.pointsCost} 點\n` +
                                       `您的剩餘點數：${userPoints} 點\n\n` +
                                       `💡 請注意：課程開始前 8 小時不可退課。\n\n` +
                                       `確定要${courseType === 'book' ? '預約' : '加入候補'}此課程嗎？`;

                return reply(replyToken, confirmMessage, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING },
                    { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING }
                ]);
            }
            else if (action === 'cancel_booking_confirm') { // 取消預約確認 Postback
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    if (!course || !course.students.includes(userId)) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '您並未預約此課程或課程不存在。'); // 移除 quickReply
                    }
                    if (new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, `課程「${course.title}」即將開始（不足8小時），無法取消。`); // 移除 quickReply
                    }
                    
                    const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                    cancellingUser.points += course.points_cost;
                    cancellingUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.points_cost} 點)`, time: new Date().toISOString() });
                    await saveUser(cancellingUser, transactionClient);

                    course.students = course.students.filter(sid => sid !== userId);
                    let replyMessage = `課程「${course.title}」已取消，已退還 ${course.points_cost} 點。`;

                    if (course.waiting.length > 0) {
                        const nextWaitingUserId = course.waiting.shift();
                        const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0];
                        if (nextWaitingUser && nextWaitingUser.points >= course.points_cost) {
                            course.students.push(nextWaitingUserId);
                            nextWaitingUser.points -= course.points_cost;
                            nextWaitingUser.history.push({ id: courseId, action: `候補補上：${course.title} (扣 ${course.points_cost} 點)`, time: new Date().toISOString() });
                            await saveUser(nextWaitingUser, transactionClient);
                            push(nextWaitingUserId, `您已從候補名單補上課程「${course.title}」！系統已自動扣點。`).catch(e => console.error(e.message));
                            replyMessage += '\n有候補學生已遞補成功。';
                        } else if (nextWaitingUser) {
                            replyMessage += `\n候補學生 ${nextWaitingUser.name} 點數不足，未能遞補。`;
                            if (TEACHER_ID) push(TEACHER_ID, `課程「${course.title}」有學生取消，但候補者 ${nextWaitingUser.name} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                        }
                    }
                    await saveCourse({ ...course, pointsCost: course.points_cost }, transactionClient);
                    await transactionClient.query('COMMIT');
                    return reply(replyToken, replyMessage.trim()); // 移除 quickReply
                } catch(err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 取消預約交易失敗:", err.stack);
                    return reply(replyToken, `取消失敗：${err.message}`); // 移除 quickReply
                } finally {
                    transactionClient.release();
                }
            } else if (action === 'cancel_waiting_confirm') { // 取消候補確認 Postback
                const courseId = data.get('courseId');
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                    if (!course || !course.waiting?.includes(userId)) {
                        await transactionClient.query('ROLLBACK');
                        return reply(replyToken, '您並未候補此課程或課程不存在。'); // 移除 quickReply
                    }
                    const user = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                    course.waiting = course.waiting.filter(x => x !== userId);
                    user.history.push({ id: courseId, action: `取消候補：${course.title}`, time: new Date().toISOString() });
                    await saveCourse({ ...course, pointsCost: course.points_cost }, transactionClient);
                    await saveUser(user, transactionClient);
                    await transactionClient.query('COMMIT');
                    return reply(replyToken, `已取消課程「${course.title}」的候補。`); // 移除 quickReply
                } catch(err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 取消候補交易失敗:", err.stack);
                    return reply(replyToken, `取消失敗：${err.message}`); // 移除 quickReply
                } finally {
                    transactionClient.release();
                }
            }
        }
    }
}
