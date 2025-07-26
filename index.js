// index.js - V4.9.3.2 (Fix Student Booking Bug)

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
  await dbClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
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
  if (menu && messages.length > 0) messages[messages.length - 1].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
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
//               📋 快速選單定義
// =====================================
const studentMenu = []; // 移除預約課程、我的課程、點數管理
const studentPointSubMenu = [ { type: 'message', label: '剩餘點數', text: COMMANDS.STUDENT.CHECK_POINTS }, { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }, { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }, { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }, ];
const teacherMenu = [ { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }, { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }, { type: 'postback', label: '查詢學員', data: 'action=start_student_search', displayText: '準備查詢學員...' }, { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT }, ];

// =====================================
//      📌 暫存狀態物件
// =====================================
const pendingTeacherLogin = {}; const pendingCourseCreation = {}; const pendingPurchase = {}; const pendingManualAdjust = {}; const sentReminders = {}; const pendingStudentSearch = {};

// =====================================
//          👨‍🏫 老師指令處理函式
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
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || 'N/A'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [ { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } } ] } }));
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
//        🔄 購點流程處理函式
// =====================================
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') return false;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
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
          await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
          return true;
        }
        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        await saveOrder({ orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: orderInTransaction.timestamp.toISOString() }, transactionClient);
        await transactionClient.query('COMMIT');
        delete pendingPurchase[userId];
        await reply(replyToken, `✅ 已收到您的匯款帳號後五碼：**${last5Digits}**。\n感謝您的配合！我們將盡快為您核對並加點。`);
        await handleStudentCommands({ ...event, message: { type: 'text', text: COMMANDS.STUDENT.POINTS } }, userId);
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        delete pendingPurchase[userId];
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。', studentMenu);
        return true;
      } finally {
          transactionClient.release();
      }
    case 'select_plan':
      const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
      if (!selectedPlan) {
        await reply(replyToken, '請從列表中選擇有效的點數方案。');
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
          await reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數管理」並輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
        } catch (err) {
          await transactionClientConfirm.query('ROLLBACK');
          console.error('❌ 確認購買交易失敗:', err.message);
          delete pendingPurchase[userId];
          await reply(replyToken, '確認購買時發生錯誤，請稍後再試。', studentMenu);
        } finally {
            transactionClientConfirm.release();
        }
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        delete pendingPurchase[userId];
        await reply(replyToken, '已取消購買點數。', studentMenu);
      } else {
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
      }
      return true;
  }
  return false;
}


// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  if (await handlePurchaseFlow(event, userId)) return;

  const user = await getUser(userId);
  const courses = await getAllCourses();

  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    delete pendingPurchase[userId];
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    if (!pendingPurchase[userId] || (pendingPurchase[userId].step !== 'input_last5' && pendingPurchase[userId].step !== 'edit_last5')) delete pendingPurchase[userId];
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
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [ { type: 'text', text: `訂單 ID: ${pendingOrder.order_id}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'message', label: actionButtonLabel, text: actionCmd } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } });
    }
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [ { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' } ] }, action: { type: 'message', label: '重新整理', text: COMMANDS.STUDENT.POINTS } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY } });
    const flexMessage = { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
    return reply(replyToken, flexMessage, [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }]);
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
      return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。', studentPointSubMenu);
    }
  }

  if (text === COMMANDS.STUDENT.CHECK_POINTS) return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) return reply(replyToken, `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請在「點數管理」主頁面輸入後五碼，或選擇「❌ 取消購買」。`, [ { type: 'message', label: '返回點數管理', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }, { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }, ]);
    else {
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
        if (pendingOrder.status === 'pending_confirmation') return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。', studentMenu);
        else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
            const transactionClientCancel = await pgPool.connect();
            try {
              await transactionClientCancel.query('BEGIN');
              await deleteOrder(pendingOrder.order_id, transactionClientCancel);
              await transactionClientCancel.query('COMMIT');
              delete pendingPurchase[userId];
              return reply(replyToken, '已取消您的購點訂單。', studentMenu);
            } catch (err) {
              await transactionClientCancel.query('ROLLBACK');
              console.error('❌ 取消購點訂單交易失敗:', err.message);
              return reply(replyToken, '取消訂單失敗，請稍後再試。', studentMenu);
            } finally {
                transactionClientCancel.release();
            }
        }
    }
    if (pendingPurchase[userId]) delete pendingPurchase[userId];
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    if (!user.history || user.history.length === 0) return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
    user.history.slice(-5).reverse().forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
    const upcomingCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > now && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId)).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
    if (upcomingCourses.length === 0) return reply(replyToken, '未來七天內沒有您可以預約的新課程。', studentMenu);
    const courseBubbles = upcomingCourses.slice(0, 10).map(course => {
        const isFull = course.students.length >= course.capacity;
        const statusText = `報名 ${course.students.length}/${course.capacity}`;
        const actionButton = { type: 'message', label: isFull ? '加入候補' : '立即預約', text: `我要預約 ${course.id}` };
        const headerColor = isFull ? '#ff9e00' : '#34a0a4';
        return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: headerColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator' }, { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: statusText, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] }, ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', height: 'sm', color: isFull ? '#ff9e00' : '#1a759f', action: actionButton }] } };
    });
    return reply(replyToken, [ { type: 'text', text: '💡 請注意：課程開始前 8 小時不可退課。' }, { type: 'flex', altText: '可預約課程列表', contents: { type: 'carousel', contents: courseBubbles } } ], studentMenu);
  }

  // 【【【 錯誤修正 】】】
  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    const course = courses[courseId];
    if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) {
      return reply(replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。', studentMenu);
    }
    const transactionClient = await pgPool.connect();
    try {
        await transactionClient.query('BEGIN');
        const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];

        if (!currentUser || !courseInTransaction) throw new Error('用戶或課程資料不存在。');
        if (currentUser.points < courseInTransaction.points_cost) throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。`);
        if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) throw new Error('您已預約或候補此課程。');

        const courseToSave = {
            id: courseInTransaction.id, title: courseInTransaction.title, time: courseInTransaction.time,
            capacity: courseInTransaction.capacity, students: courseInTransaction.students, waiting: courseInTransaction.waiting,
            pointsCost: courseInTransaction.points_cost // <--- 【修正】確保駝峰式變數被賦值
        };

        if (courseToSave.students.length < courseToSave.capacity) {
          courseToSave.students.push(userId);
          currentUser.points -= courseToSave.pointsCost;
          currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
          await saveUser(currentUser, transactionClient);
          await transactionClient.query('COMMIT');
          return reply(replyToken, `✅ 已成功預約課程：「${courseToSave.title}」。`, studentMenu);
        } else {
          courseToSave.waiting.push(userId);
          currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
          await saveCourse(courseToSave, transactionClient);
          await saveUser(currentUser, transactionClient);
          await transactionClient.query('COMMIT');
          return reply(replyToken, `✅ 課程已額滿，您已成功加入候補名單。`, studentMenu);
        }
    } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error("❌ 預約課程交易失敗:", err.stack);
        return reply(replyToken, `預約失敗：${err.message}`, studentMenu);
    } finally {
        transactionClient.release();
    }
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
    const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
    if (enrolledCourses.length === 0 && waitingCourses.length === 0) return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。', studentMenu);
    const courseBubbles = [
        ...enrolledCourses.map(course => {
            const canCancel = new Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
            return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' } ] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` } }] } : undefined };
        }),
        ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } }))
    ];
    return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }, studentMenu);
  }

  if (text.startsWith('我要取消預約 ')) {
    const id = text.replace('我要取消預約 ', '').trim();
    const transactionClient = await pgPool.connect();
    try {
        await transactionClient.query('BEGIN');
        const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!course || !course.students.includes(userId)) throw new Error('找不到您的預約紀錄。');
        if (new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) throw new Error(`課程即將開始（不足8小時），無法取消。`);
        
        const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        cancellingUser.points += course.points_cost;
        cancellingUser.history.push({ id: id, action: `課程取消退點：${course.title} (退 ${course.points_cost} 點)`, time: new Date().toISOString() });
        await saveUser(cancellingUser, transactionClient);

        course.students = course.students.filter(sid => sid !== userId);
        let replyMessage = `課程「${course.title}」已取消，已退還 ${course.points_cost} 點。`;

        if (course.waiting.length > 0) {
            const nextWaitingUserId = course.waiting.shift();
            const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0];
            if (nextWaitingUser && nextWaitingUser.points >= course.points_cost) {
                course.students.push(nextWaitingUserId);
                nextWaitingUser.points -= course.points_cost;
                nextWaitingUser.history.push({ id: id, action: `候補補上：${course.title} (扣 ${course.points_cost} 點)`, time: new Date().toISOString() });
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
        return reply(replyToken, replyMessage.trim(), studentMenu);
    } catch(err) {
        await transactionClient.query('ROLLBACK');
        console.error("❌ 取消預約交易失敗:", err.stack);
        return reply(replyToken, `取消失敗：${err.message}`, studentMenu);
    } finally {
        transactionClient.release();
    }
  }

  if (text.startsWith('我要取消候補 ')) {
    const id = text.replace('我要取消候補 ', '').trim();
    const transactionClient = await pgPool.connect();
    try {
      await transactionClient.query('BEGIN');
      const course = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!course || !course.waiting?.includes(userId)) throw new Error('找不到您的候補紀錄。');
      const user = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
      course.waiting = course.waiting.filter(x => x !== userId);
      user.history.push({ id: id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
      await saveCourse({ ...course, pointsCost: course.points_cost }, transactionClient);
      await saveUser(user, transactionClient);
      await transactionClient.query('COMMIT');
      return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
    } catch(err) {
      await transactionClient.query('ROLLBACK');
      console.error("❌ 取消候補交易失敗:", err.stack);
      return reply(replyToken, `取消失敗：${err.message}`, studentMenu);
    } finally {
        transactionClient.release();
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

    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow' && event.type !== 'unfollow') return;
    
    if (event.type === 'follow') {
        let user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
        } catch (e) { console.error(`❌ 處理追蹤事件時，取得用戶 ${userId} 資料失敗:`, e.message); }
        await saveUser(user);
        return reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！`, studentMenu);
    }
    if (event.type === 'unfollow') {
        console.log(`User unfollowed bot: ${userId}`);
        return;
    }

    let user = await getUser(userId);
    if (!user) {
        user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
        } catch (e) { console.error(`❌ 取得用戶 ${userId} 資料失敗:`, e.message); }
        await saveUser(user);
    }

    if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const postbackAction = data.get('action');
        const courseId = data.get('courseId');
        const coursePrefix = data.get('prefix');
        const orderId = data.get('orderId');

        if (user.role === 'teacher') {
            if (postbackAction === 'add_course_start') {
                pendingCourseCreation[userId] = { step: 1, data: {} };
                return reply(replyToken, '請輸入課程系列名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            }

            if (postbackAction === 'start_student_search') {
                pendingStudentSearch[userId] = true;
                return reply(replyToken, '請輸入您要查詢的學員姓名或 ID：', [{ type: 'message', label: '❌ 取消查詢', text: COMMANDS.TEACHER.MAIN_MENU }]);
            }

            if (postbackAction === 'manage_course_group') {
                const res = await pgPool.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT 10", [`${coursePrefix}%`]);
                if (res.rows.length === 0) return reply(replyToken, `此系列 (${coursePrefix}) 目前沒有可管理的未來課程。`, [{ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }]);
                const seriesTitle = res.rows[0].title.replace(/ - 第 \d+ 堂$/, '');
                const bubbles = res.rows.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '單堂課程資訊', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: course.title, weight: 'bold', size: 'lg', wrap: true }, { type: 'separator' }, { type: 'text', text: `時間: ${formatDateTime(course.time)}`, size: 'sm' }, { type: 'text', text: `狀態: ${course.students.length}/${course.capacity} 人報名, ${course.waiting.length} 人候補`, size: 'sm' }, ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂課', data: `action=cancel_single_course_confirm&courseId=${course.id}`, displayText: `準備取消 ${course.title}` } }] } }));
                return reply(replyToken, [ { type: 'text', text: `以下是「${seriesTitle}」系列的可管理課程：` }, { type: 'flex', altText: `單堂課程列表`, contents: { type: 'carousel', contents: bubbles } } ], [{ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }]);
            }
            
            if (postbackAction === 'cancel_single_course_confirm') {
                const course = await getCourse(courseId);
                if(!course) return reply(replyToken, '找不到課程，可能已被取消。');
                return reply(replyToken, { type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消單堂課程「${course.title}」嗎？`, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 是，確認取消', data: `action=cancel_single_course_execute&courseId=${course.id}`, displayText: `確認取消 ${course.title}` } }, { type: 'action', action: { type: 'message', label: '❌ 否，返回', text: COMMANDS.TEACHER.COURSE_MANAGEMENT } } ]} });
            }

            if (postbackAction === 'cancel_single_course_execute') {
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const courseRes = await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId]);
                    if (courseRes.rows.length === 0) throw new Error('找不到要取消的課程。');
                    const course = courseRes.rows[0];
                    const courseInfo = { id: course.id, title: course.title, pointsCost: course.points_cost, time: course.time, students: course.students || [], waiting: course.waiting || [] };
                    for (const stuId of courseInfo.students) {
                        const student = await getUser(stuId, transactionClient);
                        if (student) {
                            student.points += courseInfo.pointsCost;
                            student.history.push({ action: `課程取消退點：${courseInfo.title} (退 ${courseInfo.pointsCost} 點)`, time: new Date().toISOString() });
                            await saveUser(student, transactionClient);
                            push(stuId, `【課程取消通知】\n您預約的課程「${courseInfo.title}」(${formatDateTime(courseInfo.time)})已被老師取消，系統已自動退還 ${courseInfo.pointsCost} 點。`).catch(e => console.error(e.message));
                        }
                    }
                    for (const waitId of courseInfo.waiting) {
                         const student = await getUser(waitId, transactionClient);
                         if(student){
                             student.history.push({ action: `候補課程取消：${courseInfo.title}`, time: new Date().toISOString() });
                             await saveUser(student, transactionClient);
                             push(waitId, `【候補取消通知】\n您候補的課程「${courseInfo.title}」(${formatDateTime(courseInfo.time)})已被老師取消。`).catch(e => console.error(e.message));
                         }
                    }
                    await deleteCourse(courseInfo.id, transactionClient);
                    await transactionClient.query('COMMIT');
                    return reply(replyToken, `✅ 已成功取消課程「${courseInfo.title}」，並通知了所有相關學員。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 單堂課程取消交易失敗:", err.stack);
                    return reply(replyToken, `操作失敗：${err.message}`, teacherMenu);
                } finally {
                    transactionClient.release();
                }
            }

            if (postbackAction === 'cancel_course_group_confirm') {
                const res = await pgPool.query('SELECT title FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC', [`${coursePrefix}%`]);
                if (res.rows.length === 0) return reply(replyToken, `找不到任何以「${coursePrefix}」開頭的未來課程。`, teacherMenu);
                const seriesTitle = res.rows[0].title.replace(/ - 第 \d+ 堂$/, '');
                return reply(replyToken, { type: 'text', text: `⚠️ 最終確認 ⚠️\n\n您確定要批次取消「${seriesTitle}」系列的所有 ${res.rows.length} 堂課程嗎？\n\n此操作無法復原！`, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 是，批次取消', data: `action=cancel_course_group_execute&prefix=${coursePrefix}`, displayText: `確認批次取消 ${seriesTitle} 系列` } }, { type: 'action', action: { type: 'message', label: '❌ 否，返回', text: COMMANDS.TEACHER.COURSE_MANAGEMENT } } ]} });
            }

            if (postbackAction === 'cancel_course_group_execute') {
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const cancelledCourses = await deleteCoursesByPrefix(coursePrefix, transactionClient);
                    if (cancelledCourses.length === 0) throw new Error(`找不到以「${coursePrefix}」開頭的課程。`);
                    const seriesTitle = cancelledCourses[0].title.replace(/ - 第 \d+ 堂$/, '');
                    const usersToUpdate = new Map();
                    for (const course of cancelledCourses) {
                        for (const stuId of course.students) {
                            if (!usersToUpdate.has(stuId)) usersToUpdate.set(stuId, { user: await getUser(stuId, transactionClient), refund: 0, enrolled: true });
                            if(usersToUpdate.get(stuId).user) usersToUpdate.get(stuId).refund += course.pointsCost;
                        }
                        for (const waitId of course.waiting) {
                            if (!usersToUpdate.has(waitId)) usersToUpdate.set(waitId, { user: await getUser(waitId, transactionClient), refund: 0, enrolled: false });
                        }
                    }
                    for (const [userIdToUpdate, data] of usersToUpdate.entries()) {
                        if (data.user) {
                           data.user.points += data.refund;
                           data.user.history.push({ action: `「${seriesTitle}」系列課程取消 (退 ${data.refund} 點)`, time: new Date().toISOString() });
                           await saveUser(data.user, transactionClient);
                           const message = data.enrolled ? `【課程取消通知】\n您預約的「${seriesTitle}」系列課程已被老師取消，系統已自動為您辦理所有相關堂數的退點。` : `【候補取消通知】\n您候補的「${seriesTitle}」系列課程已被老師取消。`;
                           push(userIdToUpdate, message).catch(e => console.error(e.message));
                        }
                    }
                    await transactionClient.query('COMMIT');
                    return reply(replyToken, `✅ 已成功批次取消「${seriesTitle}」系列的 ${cancelledCourses.length} 堂課程。`, teacherMenu);
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 批次取消課程交易失敗:", err.stack);
                    return reply(replyToken, `操作失敗：${err.message}`, teacherMenu);
                } finally {
                    transactionClient.release();
                }
            }
            
            if (postbackAction === 'confirm_order') {
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const orderRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    if (orderRes.rows.length === 0 || orderRes.rows[0].status !== 'pending_confirmation') throw new Error('找不到此筆待確認訂單或訂單狀態不正確。');
                    const order = orderRes.rows[0];
                    const studentUser = await getUser(order.user_id, transactionClient);
                    if (!studentUser) throw new Error(`找不到購點學員 (ID: ${order.user_id}) 的資料。`);
                    studentUser.points += order.points;
                    studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: order.order_id });
                    order.status = 'completed';
                    await saveUser(studentUser, transactionClient);
                    await saveOrder({ orderId: order.order_id, userId: order.user_id, userName: order.user_name, points: order.points, amount: order.amount, last5Digits: order.last_5_digits, status: order.status, timestamp: order.timestamp.toISOString() }, transactionClient);
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `✅ 已為學員 ${order.user_name} 加點 ${order.points} 點，訂單 ${order.order_id} 已完成。`, teacherMenu);
                    push(order.user_id, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。`).catch(e => console.error(e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 訂單確認交易失敗:", err.stack);
                    await push(userId, `訂單確認失敗：${err.message}`);
                } finally {
                    transactionClient.release();
                }
            } 
            
            if (postbackAction === 'reject_order') {
                const transactionClient = await pgPool.connect();
                try {
                    await transactionClient.query('BEGIN');
                    const orderRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                    if (orderRes.rows.length === 0 || orderRes.rows[0].status !== 'pending_confirmation') throw new Error('找不到此筆待確認訂單或訂單狀態不正確。');
                    const order = orderRes.rows[0];
                    order.status = 'rejected';
                    await saveOrder({ orderId: order.order_id, userId: order.user_id, userName: order.user_name, points: order.points, amount: order.amount, last5Digits: order.last_5_digits, status: order.status, timestamp: order.timestamp.toISOString() }, transactionClient);
                    await transactionClient.query('COMMIT');
                    await reply(replyToken, `❌ 已退回訂單 ${order.order_id}。已通知學員 ${order.user_name}。`, teacherMenu);
                    push(order.user_id, `⚠️ 您的購點訂單 ${order.order_id} 被老師退回了！\n請檢查匯款資訊後，至「點數管理」重新提交。`).catch(e => console.error(e.message));
                } catch (err) {
                    await transactionClient.query('ROLLBACK');
                    console.error("❌ 訂單退回交易失敗:", err.stack);
                    await push(userId, `訂單退回失敗：${err.message}`);
                } finally {
                    transactionClient.release();
                }
            }
            return;
        }
        
        if (user.role === 'student') {
            const course = await getCourse(courseId);
            if (!course && (postbackAction.startsWith('cancel_booking') || postbackAction.startsWith('cancel_waiting'))) return reply(replyToken, '找不到對應的課程，可能已被老師取消。', studentMenu); 
            if (postbackAction === 'cancel_booking_confirm') return reply(replyToken, { type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消預約課程「${course.title}」嗎？`, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 是，取消預約', data: `action=cancel_booking_execute&courseId=${course.id}`, displayText: `確認取消預約：${course.title}` } }, { type: 'action', action: { type: 'message', label: '❌ 點錯了', text: COMMANDS.STUDENT.MY_COURSES } } ]} });
            if (postbackAction === 'cancel_booking_execute') return handleStudentCommands({ ...event, message: { type: 'text', text: `我要取消預約 ${courseId}` } }, userId);
            if (postbackAction === 'cancel_waiting_confirm') return reply(replyToken, { type: 'text', text: `⚠️ 最終確認 ⚠️\n您確定要取消候補課程「${course.title}」嗎？`, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 是，取消候補', data: `action=cancel_waiting_execute&courseId=${course.id}`, displayText: `確認取消候補：${course.title}` } }, { type: 'action', action: { type: 'message', label: '❌ 點錯了', text: COMMANDS.STUDENT.MY_COURSES } } ]} });
            if (postbackAction === 'cancel_waiting_execute') return handleStudentCommands({ ...event, message: { type: 'text', text: `我要取消候補 ${courseId}` } }, userId);
        }
        return;
    }

    if (event.type !== 'message' || event.message.type !== 'text') return;
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
                stepData.data.title = text; stepData.step = 2; return reply(replyToken, '請輸入此週期課程的總堂數（例如：5）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 2:
                const totalClasses = parseInt(text); if (isNaN(totalClasses) || totalClasses <= 0) return reply(replyToken, '總堂數必須是正整數。');
                stepData.data.totalClasses = totalClasses; stepData.step = 3; const weekdayOptions = Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day })); weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }); return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
            case 3:
                if (!weekdays.hasOwnProperty(text)) return reply(replyToken, '請選擇正確的星期。');
                stepData.data.weekday = text; stepData.step = 4; return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 4:
                if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
                stepData.data.time = text; stepData.step = 5; return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 5:
                const capacity = parseInt(text); if (isNaN(capacity) || capacity <= 0) return reply(replyToken, '人數上限必須是正整數。');
                stepData.data.capacity = capacity; stepData.step = 6; return reply(replyToken, '請輸入課程所需扣除的點數（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 6:
                const pointsCost = parseInt(text); if (isNaN(pointsCost) || pointsCost <= 0) return reply(replyToken, '扣除點數必須是正整數。');
                stepData.data.pointsCost = pointsCost; stepData.step = 7; return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n總堂數：${stepData.data.totalClasses} 堂\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [ { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE }, { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }, ]);
            case 7:
                if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                    const transactionClient = await pgPool.connect();
                    try {
                        await transactionClient.query('BEGIN');
                        const targetWeekdayIndex = weekdays[stepData.data.weekday];
                        const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);
                        const now = new Date();
                        let firstCourseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        let dayDiff = (targetWeekdayIndex - firstCourseDate.getUTCDay() + 7) % 7;
                        if (dayDiff === 0 && (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMin))) dayDiff = 7;
                        firstCourseDate.setUTCDate(firstCourseDate.getUTCDate() + dayDiff);
                        firstCourseDate.setUTCHours(targetHour - 8, targetMin, 0, 0); // UTC+8
                        const coursePrefix = await generateUniqueCoursePrefix(transactionClient);
                        const coursesToAdd = [];
                        for (let i = 0; i < stepData.data.totalClasses; i++) {
                            const courseDateTime = new Date(firstCourseDate.getTime() + (i * 7 * ONE_DAY_IN_MS));
                            const newId = `${coursePrefix}${(i + 1).toString().padStart(2, '0')}`;
                            coursesToAdd.push({ id: newId, title: `${stepData.data.title} - 第 ${i + 1} 堂`, time: courseDateTime.toISOString(), capacity: stepData.data.capacity, pointsCost: stepData.data.pointsCost, students: [], waiting: [] });
                        }
                        for (const course of coursesToAdd) await saveCourse(course, transactionClient);
                        await transactionClient.query('COMMIT');
                        delete pendingCourseCreation[userId];
                        return reply(replyToken, `✅ 已成功新增 ${stepData.data.totalClasses} 堂「${stepData.data.title}」系列課程。\n課程組代碼為【${coursePrefix}】。`, teacherMenu);
                    } catch (err) {
                        await transactionClient.query('ROLLBACK');
                        console.error("❌ 新增週期課程交易失敗:", err.stack);
                        delete pendingCourseCreation[userId];
                        return reply(replyToken, '新增課程失敗，系統發生錯誤。', teacherMenu);
                    } finally {
                        transactionClient.release();
                    }
                } else {
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, '已取消新增課程。', teacherMenu);
                }
        }
    }

    if (text === COMMANDS.SWITCH_ROLE) {
        const currentUser = await getUser(userId);
        if (currentUser.role === 'teacher') {
            currentUser.role = 'student';
            await saveUser(currentUser);
            delete pendingManualAdjust[userId]; delete pendingStudentSearch[userId]; delete pendingCourseCreation[userId];
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
    if (finalUser.role === 'teacher') return handleTeacherCommands(event, userId);
    else return handleStudentCommands(event, userId);
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
            const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000);
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
        for (const id in sentReminders) {
            if (!courses[id] || (new Date(courses[id].time).getTime() < (now - ONE_DAY_IN_MS))) delete sentReminders[id];
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
  console.log(`Bot 版本: V4.9.3 (Fix Student Booking Bug)`);
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
