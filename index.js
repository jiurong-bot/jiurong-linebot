// index.js - V7 (新增公告管理功能)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID;
const STUDENT_RICH_MENU_ID = process.env.STUDENT_RICH_MENU_ID;
const TEACHER_RICH_MENU_ID = process.env.TEACHER_RICH_MENU_ID;

const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 5;

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
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    STUDENT_MANAGEMENT: '@學員管理',
    VIEW_MESSAGES: '@查看留言',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '❌ 取消操作',
    ADD_POINTS: '+ 加點',
    DEDUCT_POINTS: '- 扣點',
    MESSAGE_SEARCH: '@查詢留言',
    ANNOUNCEMENT_MANAGEMENT: '@公告管理', // 新增
    ADD_ANNOUNCEMENT: '📢 新增公告', // 新增
    VIEW_ANNOUNCEMENTS: '📋 歷史公告', // 新增
    DELETE_ANNOUNCEMENT: '🗑️ 刪除公告', // 新增
  },
  STUDENT: {
    POINTS: '@點數管理',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CONTACT_US: '@聯絡我們',
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
    ABANDON_BOOKING: '❌ 放棄預約',
    CONFIRM_CANCEL_BOOKING: '✅ 確認取消預約',
    ABANDON_CANCEL_BOOKING: '❌ 放棄取消預約',
    CONFIRM_CANCEL_WAITING: '✅ 確認取消候補',
    ABANDON_CANCEL_WAITING: '❌ 放棄取消候補',
    LATEST_ANNOUNCEMENT: '@最新公告', // 新增
  }
};

const teacherMenu = [
  { type: 'postback', label: '課程管理', data: `action=run_command&text=${COMMANDS.TEACHER.COURSE_MANAGEMENT}` },
  { type: 'postback', label: '點數管理', data: `action=run_command&text=${COMMANDS.TEACHER.POINT_MANAGEMENT}` },
  { type: 'postback', label: '學員管理', data: `action=run_command&text=${COMMANDS.TEACHER.STUDENT_MANAGEMENT}` },
  { type: 'postback', label: '公告管理', data: `action=run_command&text=${COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT}` }, // 新增
];
const studentMenu = [
  { type: 'postback', label: '點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` },
  { type: 'postback', label: '預約課程', data: `action=run_command&text=${COMMANDS.STUDENT.BOOK_COURSE}` },
  { type: 'postback', label: '我的課程', data: `action=run_command&text=${COMMANDS.STUDENT.MY_COURSES}` },
  { type: 'postback', label: '最新公告', data: `action=run_command&text=${COMMANDS.STUDENT.LATEST_ANNOUNCEMENT}` }, // 新增
];
const WEEKDAYS = [
  { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
  { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
  { label: '週六', value: 6 },
];

const CONVERSATION_STATES = {
  pendingTeacherLogin: {},
  pendingCourseCreation: {},
  pendingPurchase: {},
  pendingManualAdjust: {},
  pendingStudentSearchQuery: {},
  pendingBookingConfirmation: {},
  pendingFeedback: {},
  pendingReply: {},
  pendingMessageSearchQuery: {},
  pendingAnnouncementCreation: {}, // 新增
};

const sentReminders = {};
const latestAnnouncementTimestamp = {};

async function initializeDatabase() {
  try {
    const testClient = await pgPool.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    testClient.release();
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_announcement_viewed TIMESTAMPTZ)`); // 修改
    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW())`); // 新增
    await cleanCoursesDB();
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  }
}

async function generateUniqueCoursePrefix(dbClient = pgPool) {
    let prefix, isUnique = false;
    while (!isUnique) {
        const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        prefix = `${randomChar1}${randomChar2}`;
        const res = await dbClient.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        if (res.rows.length === 0) isUnique = true;
    }
    return prefix;
}

async function getUser(userId, dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  const userData = res.rows[0];
  if (userData && typeof userData.history === 'string') {
    try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
  }
  return userData;
}

async function saveUser(user, dbClient = pgPool) {
  try {
    const historyJson = JSON.stringify(user.history || []);
    await dbClient.query(
        `INSERT INTO users (id, name, points, role, history, last_announcement_viewed) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_announcement_viewed = $6`,
        [user.id, user.name, user.points, user.role, historyJson, user.lastAnnouncementViewed || null]
    );
  } catch (err) {
    console.error(`❌ saveUser 函式捕獲到錯誤!`, { message: err.message, stack: err.stack, userId: user.id });
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
    }
    return coursesToDelete;
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
  await dbPool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

async function saveAnnouncement(title, content, dbClient = pgPool) {
    await dbClient.query('INSERT INTO announcements (title, content, timestamp) VALUES ($1, $2, NOW())', [title, content]);
}

async function deleteAnnouncement(announcementId, dbClient = pgPool) {
    await dbClient.query('DELETE FROM announcements WHERE id = $1', [announcementId]);
}

async function getAnnouncements(dbClient = pgPool, limit = 10, offset = 0) {
    const res = await dbClient.query('SELECT * FROM announcements ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return res.rows;
}

async function getLatestAnnouncement(dbClient = pgPool) {
    const res = await dbClient.query('SELECT * FROM announcements ORDER BY timestamp DESC LIMIT 1');
    return res.rows[0];
}

async function cleanCoursesDB() {
  const now = Date.now();
  await pgPool.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
}

async function reply(replyToken, content, menu = null) {
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : [content]);
  if (menu && messages.length > 0) {
      const validMenuItems = (menu || []).slice(0, 13).map(i => ({ type: 'action', action: i }));
      if (validMenuItems.length > 0 && !messages[messages.length - 1].quickReply) {
          messages[messages.length - 1].quickReply = { items: validMenuItems };
      }
  }
  try { await client.replyMessage(replyToken, messages); } catch (error) { console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response : error.message); throw error; }
}

async function push(to, content) {
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : (typeof content === 'object' && content !== null && content.type ? [content] : [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }]));
  try { await client.pushMessage(to, messages); } catch (error) { console.error(`❌ push 函式發送失敗給 ${to}:`, `狀態碼: ${error.originalError?.response?.status || 'N/A'},`, `訊息: ${error.originalError?.response?.statusText || error.message}`); throw error; }
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

function getNextDate(dayOfWeek, timeStr, startDate = new Date()) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const resultDate = new Date(startDate);
    resultDate.setHours(hours, minutes, 0, 0);
    const currentDay = resultDate.getDay();
    let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
    if (daysToAdd === 0 && resultDate.getTime() < startDate.getTime()) {
      daysToAdd = 7;
    }
    resultDate.setDate(resultDate.getDate() + daysToAdd);
    return resultDate;
}

// V7: 處理對話逾時自動取消的通用函數
function setupConversationTimeout(userId, conversationStateName, onTimeout) {
  const conversationState = CONVERSATION_STATES[conversationStateName];
  if (conversationState[userId]?.timeoutId) {
    clearTimeout(conversationState[userId].timeoutId);
  }
  const timeoutId = setTimeout(() => {
    if (conversationState[userId]) {
      delete conversationState[userId];
      onTimeout(userId);
    }
  }, CONVERSATION_TIMEOUT_MS);
  conversationState[userId] = { ...conversationState[userId], timeoutId };
}

function checkAndClearTimeout(userId, conversationStateName) {
  const conversationState = CONVERSATION_STATES[conversationStateName];
  if (conversationState[userId]?.timeoutId) {
    clearTimeout(conversationState[userId].timeoutId);
    return true;
  }
  return false;
}

// V7: 統一處理所有對話狀態的逾時
function handleConversationTimeouts(userId) {
  for (const stateName in CONVERSATION_STATES) {
    if (CONVERSATION_STATES[stateName][userId]) {
      checkAndClearTimeout(userId, stateName);
      let onTimeout;
      switch(stateName) {
        case 'pendingReply': onTimeout = (u) => push(u, '回覆留言逾時，自動取消。請重新點擊回覆。').catch(e => console.error(e)); break;
        case 'pendingStudentSearchQuery': onTimeout = (u) => push(u, '學員查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)); break;
        case 'pendingMessageSearchQuery': onTimeout = (u) => push(u, '留言查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)); break;
        case 'pendingManualAdjust': onTimeout = (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)); break;
        case 'pendingCourseCreation': onTimeout = (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e)); break;
        case 'pendingFeedback': onTimeout = (u) => push(u, '留言已逾時，自動取消。若要再次留言請重新點選。').catch(e => console.error(e)); break;
        case 'pendingPurchase': onTimeout = (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)); break;
        case 'pendingBookingConfirmation': onTimeout = (u) => push(u, '預約/取消流程逾時，自動取消。請重新操作。').catch(e => console.error(e)); break;
        case 'pendingAnnouncementCreation': onTimeout = (u) => push(u, '新增公告逾時，自動取消。').catch(e => console.error(e)); break; // 新增
        default: continue;
      }
      setupConversationTimeout(userId, stateName, onTimeout);
    }
  }
}

// V7: 重構老師命令處理
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const { pendingReply, pendingStudentSearchQuery, pendingMessageSearchQuery, pendingManualAdjust, pendingCourseCreation, pendingAnnouncementCreation } = CONVERSATION_STATES;
  const now = Date.now();
  
  if (pendingReply[userId]) {
    const replyData = pendingReply[userId];
    checkAndClearTimeout(userId, 'pendingReply');
    if (text === '取消') {
      delete pendingReply[userId];
      return reply(replyToken, '已取消回覆。', teacherMenu);
    }
    
    await push(replyData.targetUserId, `老師回覆您在「聯絡我們」的留言：\n\n${text}`).catch(e => console.error(e));
    await pgPool.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, replyData.msgId]);
    
    delete pendingReply[userId];
    return reply(replyToken, '已成功回覆學員。', teacherMenu);
  }

  if (pendingStudentSearchQuery[userId]) {
      const query = text;
      checkAndClearTimeout(userId, 'pendingStudentSearchQuery');
      const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
      const foundUsers = res.rows;
      delete pendingStudentSearchQuery[userId];

      if (foundUsers.length === 0) return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
      else if (foundUsers.length === 1) {
          const foundUser = foundUsers[0];
          let studentInfo = `學員姓名：${foundUser.name}\n學員 ID：${foundUser.id}\n剩餘點數：${foundUser.points} 點\n歷史記錄 (近5筆)：\n`;
          if (foundUser.history?.length > 0) foundUser.history.slice(-5).reverse().forEach(record => studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`);
          return reply(replyToken, studentInfo.trim(), teacherMenu);
      } else {
          const userBubbles = foundUsers.map(u => ({
              type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
              body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: u.name, weight: 'bold', size: 'xl', wrap: true }, { type: 'text', text: `ID: ${u.id.substring(0, 8)}...`, size: 'sm', color: '#666666' }] },
              footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '查看詳情', data: `action=show_student_detail&studentId=${u.id}`, displayText: `查看學員 ${u.name} 的詳情` } }] }
          }));
          return reply(replyToken, [{ type: 'text', text: '找到多位符合的學員，請點擊查看詳情：' }, { type: 'flex', altText: '請選擇學員', contents: { type: 'carousel', contents: userBubbles.slice(0, 10) } }], null);
      }
  }

  if (pendingMessageSearchQuery[userId]) {
    const query = text;
    checkAndClearTimeout(userId, 'pendingMessageSearchQuery');
    delete pendingMessageSearchQuery[userId];
    const messagesRes = await pgPool.query("SELECT * FROM feedback_messages WHERE user_name LIKE $1 OR message LIKE $2 OR teacher_reply LIKE $3 ORDER BY timestamp DESC LIMIT 10", [`%${query}%`, `%${query}%`, `%${query}%`]);
    const foundMessages = messagesRes.rows;

    if (foundMessages.length === 0) return reply(replyToken, `找不到與「${query}」相關的留言紀錄。`, teacherMenu);

    const messageBubbles = foundMessages.map(msg => {
      const headerColor = msg.status === 'replied' ? '#1A759F' : (msg.status === 'read' ? '#52b69a' : '#6a7d8b');
      const replyContent = msg.teacher_reply ? [{ type: 'text', text: '老師回覆:', size: 'sm', color: '#aaaaaa', margin: 'md' }, { type: 'text', text: msg.teacher_reply, wrap: true }] : [];
      return {
        type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: headerColor, paddingAll: 'lg' },
        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: msg.message, wrap: true },
            { type: 'separator', margin: 'md' }, ...replyContent,
            { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 'md' }
        ]},
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `狀態: ${msg.status === 'replied' ? '已回覆' : (msg.status === 'read' ? '已讀' : '新留言')}`, size: 'sm', color: '#aaaaaa', align: 'center' }
        ]}
      };
    });
    return reply(replyToken, [{ type: 'text', text: '以下是與您搜尋相關的留言紀錄：' }, { type: 'flex', altText: '留言查詢結果', contents: { type: 'carousel', contents: messageBubbles } }]);
  }

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      pendingManualAdjust[userId] = { step: 'awaiting_student_info' };
      setupConversationTimeout(userId, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入要調整點數的學員姓名或 ID (支援模糊查詢)：', [{ type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]);
  }

  if (pendingManualAdjust[userId]) {
      const manualAdjustState = pendingManualAdjust[userId];
      checkAndClearTimeout(userId, 'pendingManualAdjust');
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) { delete pendingManualAdjust[userId]; return reply(replyToken, '已取消手動調整點數。', teacherMenu); }
      switch (manualAdjustState.step) {
          case 'awaiting_student_info':
              const studentRes = await pgPool.query(`SELECT id, name, points, history FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
              const foundStudents = studentRes.rows;
              if (foundStudents.length === 0) { delete pendingManualAdjust[userId]; return reply(replyToken, `找不到符合學員「${text}」。`, teacherMenu); }
              else if (foundStudents.length === 1) {
                  const selectedStudent = foundStudents[0];
                  manualAdjustState.step = 'awaiting_operation';
                  manualAdjustState.targetUserId = selectedStudent.id;
                  manualAdjustState.targetUserName = selectedStudent.name;
                  manualAdjustState.currentPoints = selectedStudent.points;
                  setupConversationTimeout(userId, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)));
                  return reply(replyToken, `您選擇了學員：**${selectedStudent.name}** (目前點數：${selectedStudent.points} 點)。\n請選擇要執行何種操作：`, [
                      { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS },
                      { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS },
                      { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
                  ]);
              } else {
                  const studentSelectionBubbles = foundStudents.map(s => ({
                      type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'text', text: s.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${s.id.substring(0, 8)}...`, size: 'sm', color: '#666666' }] },
                      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_manual_adjust_student&studentId=${s.id}` } }] }
                  }));
                  return reply(replyToken, [{ type: 'text', text: '找到多位符合的學員，請點擊選擇：' }, { type: 'flex', altText: '找到多位符合的學員，請點擊選擇：', contents: { type: 'carousel', contents: studentSelectionBubbles.slice(0, 10) } }], [{ type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]);
              }
          case 'awaiting_operation':
              if (text === COMMANDS.TEACHER.ADD_POINTS) { manualAdjustState.operation = 'add'; manualAdjustState.step = 'awaiting_amount'; setupConversationTimeout(userId, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e))); return reply(replyToken, `請輸入要為 **${manualAdjustState.targetUserName}** 增加的點數數量 (例如：5)：`, [{ type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]); }
              else if (text === COMMANDS.TEACHER.DEDUCT_POINTS) { manualAdjustState.operation = 'deduct'; manualAdjustState.step = 'awaiting_amount'; setupConversationTimeout(userId, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e))); return reply(replyToken, `請輸入要為 **${manualAdjustState.targetUserName}** 扣除的點數數量 (例如：10)：`, [{ type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]); }
              else { return reply(replyToken, `請點擊「${COMMANDS.TEACHER.ADD_POINTS}」或「${COMMANDS.TEACHER.DEDUCT_POINTS}」。`, [{ type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS }, { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS }, { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]); }
          case 'awaiting_amount':
              const amount = parseInt(text);
              if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數數量必須是正整數。請重新輸入。', [{ type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]); }
              const transactionClient = await pgPool.connect();
              try {
                  await transactionClient.query('BEGIN');
                  const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [manualAdjustState.targetUserId]);
                  const userInTransaction = userInTransactionRes.rows[0];
                  if (!userInTransaction) throw new Error('操作失敗，找不到學員資料。');
                  let operationType;
                  if (manualAdjustState.operation === 'add') { userInTransaction.points += amount; operationType = '加點'; }
                  else { if (userInTransaction.points < amount) { throw new Error(`學員 ${userInTransaction.name} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${amount} 點）。`); } userInTransaction.points -= amount; operationType = '扣點'; }
                  if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
                  userInTransaction.history.push({ action: `老師手動${operationType} ${amount} 點`, time: new Date().toISOString(), by: userId });
                  await saveUser(userInTransaction, transactionClient);
                  await transactionClient.query('COMMIT');
                  delete pendingManualAdjust[userId];
                  push(userInTransaction.id, `您的點數已由老師手動調整：${operationType}${amount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
                  return reply(replyToken, `✅ 已確認為學員 **${userInTransaction.name}** ${operationType} ${amount} 點。目前點數：${userInTransaction.points} 點。`, teacherMenu);
              } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 手動調整點數交易失敗:', err.message); delete pendingManualAdjust[userId]; return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。', teacherMenu); }
              finally { transactionClient.release(); }
      }
      return;
  }
  
  if (pendingCourseCreation[userId]) {
      const stepData = pendingCourseCreation[userId];
      checkAndClearTimeout(userId, 'pendingCourseCreation');
      if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) { delete pendingCourseCreation[userId]; return reply(replyToken, '已取消新增課程。', teacherMenu); }
      if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
          if (stepData.step !== 7) { delete pendingCourseCreation[userId]; return reply(replyToken, '無效操作，請重新從「新增課程」開始。', teacherMenu); }
          const transactionClient = await pgPool.connect();
          try {
              await transactionClient.query('BEGIN');
              const coursePrefix = await generateUniqueCoursePrefix(transactionClient);
              const coursesToAdd = stepData.calculatedTimes.map((time, index) => ({ id: `${coursePrefix}${String.fromCharCode(65 + index)}`, title: `${stepData.courseName} - 第 ${index + 1} 堂`, time: time, capacity: stepData.capacity, pointsCost: stepData.pointsCost, students: [], waiting: [] }));
              for (const course of coursesToAdd) await saveCourse(course, transactionClient);
              await transactionClient.query('COMMIT');
              delete pendingCourseCreation[userId];
              return reply(replyToken, `課程系列「${stepData.courseName}」已成功新增！\n系列代碼：${coursePrefix}\n共新增 ${stepData.totalClasses} 堂課。`, null);
          } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 新增課程交易失敗:', err.stack); delete pendingCourseCreation[userId]; return reply(replyToken, '新增課程時發生錯誤，請稍後再試。', teacherMenu); }
          finally { transactionClient.release(); }
      }
      
      switch (stepData.step) {
          case 1: if (!text) { return reply(replyToken, '課程名稱不能為空，請重新輸入。'); } stepData.courseName = text; stepData.step = 2; setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e))); await reply(replyToken, '請輸入總堂數（例如：5，代表您想建立 5 堂課）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); break;
          case 2: const totalClasses = parseInt(text); if (isNaN(totalClasses) || totalClasses <= 0 || totalClasses > 99) { return reply(replyToken, '總堂數必須是 1 到 99 之間的整數，請重新輸入。'); } stepData.totalClasses = totalClasses; stepData.step = 3; const weekdayOptions = WEEKDAYS.map(day => ({ type: 'message', label: day.label, text: day.label })); weekdayOptions.push({ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }); setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e))); await reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions); break;
          case 3: const selectedWeekday = WEEKDAYS.find(day => day.label === text); if (!selectedWeekday) { return reply(replyToken, '請從列表中選擇有效的星期幾。'); } stepData.weekday = selectedWeekday.value; stepData.step = 4; setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e))); await reply(replyToken, '請輸入課程時間（格式為 HH:mm，例如：19:00）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); break;
          case 4: if (!/^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(text)) { return reply(replyToken, '課程時間格式不正確，請使用 HH:mm 格式，例如：19:00。'); } stepData.time = text; stepData.step = 5; setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e))); await reply(replyToken, '請輸入人數上限（例如：10）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); break;
          case 5: const capacity = parseInt(text); if (isNaN(capacity) || capacity <= 0) { return reply(replyToken, '人數上限必須是正整數，請重新輸入。'); } stepData.capacity = capacity; stepData.step = 6; setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e))); await reply(replyToken, '請輸入課程所需扣除點數（例如：2）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); break;
          case 6: const points = parseInt(text); if (isNaN(points) || points <= 0) { return reply(replyToken, '點數費用必須是正整數，請重新輸入。'); } stepData.pointsCost = points; stepData.step = 7;
              const courseTimes = []; let currentDate = new Date();
              for (let i = 0; i < stepData.totalClasses; i++) {
                  let nextClassDate = getNextDate(stepData.weekday, stepData.time, currentDate);
                  if (nextClassDate.getTime() < Date.now()) {
                    currentDate = new Date(Date.now() + ONE_DAY_IN_MS);
                    nextClassDate = getNextDate(stepData.weekday, stepData.time, currentDate);
                  }
                  courseTimes.push(nextClassDate.toISOString());
                  currentDate = new Date(nextClassDate.getTime() + ONE_DAY_IN_MS * 6);
              }
              stepData.calculatedTimes = courseTimes;
              const confirmMsg = `請確認新增以下週期課程系列：\n課程名稱：${stepData.courseName}\n總堂數：${stepData.totalClasses} 堂\n每週：${WEEKDAYS.find(d => d.value === stepData.weekday)?.label} ${stepData.time}\n人數上限：${stepData.capacity} 人/堂\n點數費用：${stepData.pointsCost} 點/堂\n\n預計開課日期：\n${stepData.calculatedTimes.map(t => formatDateTime(t)).join('\n')}\n\n確認無誤請點選「確認新增課程」。`;
              setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e)));
              await reply(event.replyToken, confirmMsg, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE }, { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
              break;
      }
      return;
  }

  // V7: 處理新增公告流程
  if (pendingAnnouncementCreation[userId]) {
    const stepData = pendingAnnouncementCreation[userId];
    checkAndClearTimeout(userId, 'pendingAnnouncementCreation');
    if (text === '取消') {
      delete pendingAnnouncementCreation[userId];
      return reply(replyToken, '已取消新增公告。', teacherMenu);
    }
    switch (stepData.step) {
      case 'awaiting_title':
        if (!text) { return reply(replyToken, '公告標題不能為空，請重新輸入。'); }
        stepData.title = text;
        stepData.step = 'awaiting_content';
        setupConversationTimeout(userId, 'pendingAnnouncementCreation', (u) => push(u, '新增公告逾時，自動取消。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入公告內容：', [{ type: 'message', label: '取消', text: '取消' }]);
      case 'awaiting_content':
        if (!text) { return reply(replyToken, '公告內容不能為空，請重新輸入。'); }
        stepData.content = text;
        delete pendingAnnouncementCreation[userId];
        await saveAnnouncement(stepData.title, stepData.content);
        return reply(replyToken, `已成功發布新公告：\n\n標題：${stepData.title}\n內容：${stepData.content}`, teacherMenu);
    }
    return;
  }
  
  // 處理其他老師指令
  const nowMs = Date.now();
  switch (text) {
      // V7: 新增公告管理命令
      case COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT:
        return reply(replyToken, {
          type: 'flex',
          altText: '公告管理功能',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [{ type: 'text', text: '公告管理', color: '#ffffff', weight: 'bold', size: 'md' }],
              backgroundColor: '#34a0a4',
              paddingAll: 'lg'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                { type: 'text', text: '在此管理學員公告', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }
              ],
              justifyContent: 'center',
              alignItems: 'center',
              height: '150px'
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '📢 新增公告', data: 'action=start_add_announcement' } },
                { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '📋 歷史公告', data: 'action=view_announcements' } }
              ]
            }
          }
        });
      case COMMANDS.TEACHER.STUDENT_MANAGEMENT:
          const newMessagesCount = (await pgPool.query(`SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'`)).rows[0].count;
          const studentManagementBubbles = [
            { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或ID查詢學員資訊', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '學員查詢', data: 'action=start_student_search' } },
            { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '查看留言', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: (newMessagesCount > 0 ? '#de5246' : '#6a7d8b'), paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${newMessagesCount} 則`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看所有新留言', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看留言', data: `action=run_command&text=${COMMANDS.TEACHER.VIEW_MESSAGES}` } },
            { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '留言查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或內容查詢歷史留言', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '留言查詢', data: 'action=start_message_search' } }
          ];
          return reply(replyToken, { type: 'flex', altText: '學員管理功能', contents: { type: 'carousel', contents: studentManagementBubbles } });
      case COMMANDS.TEACHER.VIEW_MESSAGES:
          const messagesRes = await pgPool.query("SELECT * FROM feedback_messages WHERE status IN ('new', 'read') ORDER BY timestamp ASC LIMIT 10");
          if (messagesRes.rows.length === 0) return reply(replyToken, '太棒了，目前沒有新的學員留言！', teacherMenu);
          const messageBubbles = messagesRes.rows.map(msg => ({
              type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: (msg.status === 'read' ? '#52b69a' : '#6a7d8b'), paddingAll: 'lg' },
              body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                  { type: 'text', text: msg.message, wrap: true },
                  { type: 'separator' },
                  { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa' }
              ]},
              footer: { type: 'box', layout: 'vertical', contents: [
                  { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } },
                  { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } }
              ]}
          }));
          return reply(replyToken, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } });
      case COMMANDS.TEACHER.POINT_MANAGEMENT:
          const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
          const pointManagementBubbles = [
            { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看待確認訂單', data: `action=run_command&text=${COMMANDS.TEACHER.PENDING_ORDERS}` } },
            { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '手動調整點數', data: `action=run_command&text=${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS}` } }
          ];
          return reply(replyToken, { type: 'flex', altText: '點數管理功能', contents: { type: 'carousel', contents: pointManagementBubbles } });
      case COMMANDS.TEACHER.COURSE_MANAGEMENT:
      case COMMANDS.TEACHER.CANCEL_COURSE:
      case COMMANDS.TEACHER.COURSE_LIST:
      case COMMANDS.TEACHER.ADD_COURSE:
          const allCourses = Object.values(await getAllCourses());
          const courseGroups = {};
          for (const course of allCourses) {
              if (new Date(course.time).getTime() > nowMs) {
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
              const courseMainTitle = earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''); 
              courseBubbles.push({
                  type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                  body: {
                      type: 'box', layout: 'vertical', spacing: 'md',
                      contents: [
                          { type: 'text', text: courseMainTitle, weight: 'bold', size: 'xl', wrap: true },
                          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                          { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                      ],
                  },
                  footer: {
                      type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                      contents: [
                          { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單堂管理', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` } },
                          { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` } },
                      ],
                  },
              });
          }
          const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
          courseBubbles.push(addCourseBubble);
          let introText = (Object.keys(courseGroups).length === 0) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
          return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
      case COMMANDS.TEACHER.REPORT:
          const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
          const students = usersRes.rows;
          const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
          const activeStudentsCount = students.filter(s => s.history?.length > 0).length;
          const coursesRes = await pgPool.query(`SELECT * FROM courses`);
          const allCoursesData = coursesRes.rows;
          const totalCourses = allCoursesData.length;
          const upcomingCourses = allCoursesData.filter(c => new Date(c.time).getTime() > nowMs).length;
          const completedCourses = totalCourses - upcomingCourses;
          const ordersRes = await pgPool.query(`SELECT * FROM orders`);
          const allOrders = ordersRes.rows;
          const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
          const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
          const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);
          let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
          return reply(replyToken, report.trim(), teacherMenu);
      case COMMANDS.TEACHER.PENDING_ORDERS:
          (async () => {
              try {
                  const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
                  const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
                  if (pendingConfirmationOrders.length === 0) return push(userId, '目前沒有待確認的購點訂單。');
                  const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }}));
                  await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
              } catch (err) {
                  console.error('❌ 查詢待確認訂單時發生錯誤:', err);
                  await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
              }
          })();
          return reply(replyToken, '正在查詢待確認訂單，請稍候...');
      default:
          return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
  }
}

function buildBuyPointsFlex() {
  const bubbles = PURCHASE_PLANS.map(plan => ({
      type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          { type: 'text', text: `${plan.points} 點`, weight: 'bold', size: 'xxl', align: 'center', color: '#1a759f' },
          { type: 'text', text: `售價：${plan.amount} 元`, size: 'sm', align: 'center', color: '#666666' }
      ]},
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '選擇此方案', data: `action=select_purchase_plan&plan=${plan.points}`, displayText: `選擇購買 ${plan.points} 點方案` } }] }
  }));
  return { type: 'flex', altText: '請選擇要購買的點數方案', contents: { type: 'carousel', contents: bubbles } };
}

async function buildPointsMenuFlex(userId) {
    const user = await getUser(userId);
    if (!user) return { type: 'text', text: '無法獲取您的使用者資料。' };
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    const pointBubbles = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') { actionButtonLabel = '修改匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '🕒 匯款已提交，等待確認'; cardColor = '#ff9e00'; statusText = '已提交五碼，等待老師確認'; }
        else if (pendingOrder.status === 'rejected') { actionButtonLabel = '重新提交匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '❌ 訂單被退回！'; cardColor = '#d90429'; statusText = '訂單被老師退回'; additionalInfo = '請檢查匯款金額或後五碼，並重新提交。'; }
        else { actionButtonLabel = '輸入匯款後五碼'; actionCmd = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER; cardTitle = '❗ 匯款待確認'; cardColor = '#f28482'; statusText = '待付款'; }
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `訂單 ID: ${pendingOrder.order_id}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${actionCmd}` } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } });
    }

    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' }] }, action: { type: 'postback', label: '重新整理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購買點數', data: `action=run_command&text=${COMMANDS.STUDENT.BUY_POINTS}` } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購點紀錄', data: `action=run_command&text=${COMMANDS.STUDENT.PURCHASE_HISTORY}` } });

    return { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
}

async function sendPointsMenu(replyToken, userId) {
    const flexMessage = await buildPointsMenuFlex(userId);
    return reply(replyToken, flexMessage);
}

// V7: 重構學生命令處理
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);
  const courses = await getAllCourses();
  const { pendingFeedback, pendingPurchase, pendingBookingConfirmation } = CONVERSATION_STATES;

  handleConversationTimeouts(userId);
  
  if (pendingFeedback[userId]) {
    const feedbackState = pendingFeedback[userId];
    checkAndClearTimeout(userId, 'pendingFeedback');
    
    if (text === '取消') {
      delete pendingFeedback[userId];
      return reply(replyToken, '已取消留言。');
    }
    const messageId = `MSG${Date.now()}`;
    await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)', [messageId, userId, user.name, text, 'new', new Date()]);
    delete pendingFeedback[userId];
    if (TEACHER_ID) push(TEACHER_ID, `🔔 您有來自「${user.name}」的新留言！請至「學員管理」->「查看留言」處理。`).catch(e => console.error(e));
    return reply(replyToken, '感謝您的留言，我們已收到您的訊息！');
  }

  if (pendingPurchase[userId]) {
      const stepData = pendingPurchase[userId];
      checkAndClearTimeout(userId, 'pendingPurchase');
      const returnToPointsMenuBtn = { type: 'postback', label: '返回點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` };

      if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU || text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        delete pendingPurchase[userId]; await sendPointsMenu(replyToken, userId); return;
      }
      switch (stepData.step) {
          case 'input_last5':
              const orderId = stepData.data.orderId;
              const last5Digits = text;
              if (!/^\d{5}$/.test(last5Digits)) { await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。'); return; }
              const transactionClient = await pgPool.connect();
              try {
                  await transactionClient.query('BEGIN');
                  const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
                  let orderInTransaction = orderInTransactionRes.rows[0];
                  if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) { throw new Error('此訂單狀態不正確或已處理，請重新開始購點流程。'); }
                  orderInTransaction.last_5_digits = last5Digits;
                  orderInTransaction.status = 'pending_confirmation';
                  const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
                  await saveOrder(newOrderData, transactionClient);
                  await transactionClient.query('COMMIT');
                  delete pendingPurchase[userId];
                  const successMessage = { type: 'text', text: `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。` };
                  const pointsFlexMessage = await buildPointsMenuFlex(userId);
                  if (TEACHER_ID) push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
                  await reply(replyToken, [successMessage, pointsFlexMessage], null);
              } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 提交後五碼交易失敗:', err.message); delete pendingPurchase[userId]; await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。', [returnToPointsMenuBtn]); }
              finally { transactionClient.release(); }
              return;
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
                      await reply(replyToken, `已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n戶名：${BANK_INFO.accountName}\n銀行：${BANK_INFO.bankName}\n帳號：${BANK_INFO.accountNumber}\n\n完成轉帳後，請再次進入「點數管理」並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`, [returnToPointsMenuBtn]);
                  } catch (err) { await transactionClientConfirm.query('ROLLBACK'); console.error('❌ 確認購買交易失敗:', err.message); delete pendingPurchase[userId]; await reply(replyToken, '確認購買時發生錯誤，請稍後再試。', [returnToPointsMenuBtn]); }
                  finally { transactionClientConfirm.release(); }
              } else { await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); }
              return;
      }
  }

  if (pendingBookingConfirmation[userId]) {
    const confirmationData = pendingBookingConfirmation[userId];
    checkAndClearTimeout(userId, 'pendingBookingConfirmation');
    const courseId = confirmationData.courseId;
    const course = await getCourse(courseId);
    if (!course) { delete pendingBookingConfirmation[userId]; return reply(replyToken, '操作失敗：課程不存在或已被取消。'); }

    if (confirmationData.actionType === 'book' || confirmationData.actionType === 'wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
            delete pendingBookingConfirmation[userId];
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!currentUser || !courseInTransaction) throw new Error('用戶或課程資料不存在。');
                if (currentUser.points < courseInTransaction.points_cost) throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。`);
                if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) throw new Error('您已預約或候補此課程。');
                if (new Date(courseInTransaction.time).getTime() < Date.now()) throw new Error('課程已過期。');
                const courseToSave = { id: courseInTransaction.id, title: courseInTransaction.title, time: courseInTransaction.time, capacity: courseInTransaction.capacity, students: courseInTransaction.students, waiting: courseInTransaction.waiting, pointsCost: courseInTransaction.points_cost };
                if (courseToSave.students.length < courseToSave.capacity) {
                    courseToSave.students.push(userId); currentUser.points -= courseToSave.pointsCost;
                    currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                    await saveUser(currentUser, transactionClient); await saveCourse(courseToSave, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`);
                } else {
                    courseToSave.waiting.push(userId);
                    currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                    await saveCourse(courseToSave, transactionClient); await saveUser(currentUser, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `課程已額滿，您已成功加入候補名單。`);
                }
            } catch (err) { await transactionClient.query('ROLLBACK'); console.error("❌ 預約課程交易失敗:", err.stack); return reply(replyToken, `預約失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄預約課程「${course.title}」。`); }
        else { const userPoints = (await getUser(userId)).points; return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_BOOKING}」。\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost}點\n您的剩餘點數：${userPoints} 點\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n`, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING }, { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING }]); }
    }
    else if (confirmationData.actionType === 'cancel_book') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
            delete pendingBookingConfirmation[userId];
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const courseToCancel = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!courseToCancel || !courseToCancel.students.includes(userId)) { throw new Error('您並未預約此課程或課程不存在。'); }
                if (new Date(courseToCancel.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { throw new Error(`課程「${courseToCancel.title}」即將開始（不足8小時），無法取消。`); }
                const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                cancellingUser.points += courseToCancel.points_cost;
                cancellingUser.history.push({ id: courseId, action: `課程取消退點：${courseToCancel.title} (退 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                await saveUser(cancellingUser, transactionClient);
                courseToCancel.students = courseToCancel.students.filter(sid => sid !== userId);
                let replyMessage = `課程「${courseToCancel.title}」已取消，已退還 ${courseToCancel.points_cost} 點。`;
                if (courseToCancel.waiting.length > 0) {
                    const nextWaitingUserId = courseToCancel.waiting.shift();
                    const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0];
                    if (nextWaitingUser && nextWaitingUser.points >= courseToCancel.points_cost) {
                        courseToCancel.students.push(nextWaitingUserId);
                        nextWaitingUser.points -= courseToCancel.points_cost;
                        nextWaitingUser.history.push({ id: courseId, action: `候補補上：${courseToCancel.title} (扣 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                        await saveUser(nextWaitingUser, transactionClient);
                        push(nextWaitingUserId, `您已從候補名單補上課程「${courseToCancel.title}」！系統已自動扣點。`).catch(e => console.error(e.message));
                        replyMessage += '\n有候補學生已遞補成功。';
                    } else if (nextWaitingUser) {
                        replyMessage += `\n候補學生 ${nextWaitingUser.name} 點數不足，未能遞補。`;
                        if (TEACHER_ID) push(TEACHER_ID, `課程「${courseToCancel.title}」有學生取消，但候補者 ${nextWaitingUser.name} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                    }
                }
                await saveCourse({ ...courseToCancel, pointsCost: courseToCancel.points_cost }, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, replyMessage.trim());
            } catch(err) { await transactionClient.query('ROLLBACK'); console.error("❌ 取消預約交易失敗:", err.stack); return reply(replyToken, `取消失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄取消課程「${course.title}」。`); }
        else { return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING}」。`); }
    }
    else if (confirmationData.actionType === 'cancel_wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
            delete pendingBookingConfirmation[userId];
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const courseToCancelWaiting = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!courseToCancelWaiting || !courseToCancelWaiting.waiting?.includes(userId)) { throw new Error('您並未候補此課程或課程不存在。'); }
                const userInTransaction = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                courseToCancelWaiting.waiting = courseToCancelWaiting.waiting.filter(x => x !== userId);
                userInTransaction.history.push({ id: courseId, action: `取消候補：${courseToCancelWaiting.title}`, time: new Date().toISOString() });
                await saveCourse({ ...courseToCancelWaiting, pointsCost: courseToCancelWaiting.points_cost }, transactionClient); await saveUser(userInTransaction, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `已取消課程「${courseToCancelWaiting.title}」的候補。`);
            } catch(err) { await transactionClient.query('ROLLBACK'); console.error("❌ 取消候補交易失敗:", err.stack); return reply(replyToken, `取消失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄取消課程「${course.title}」的候補。`); }
        else { return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_WAITING}」。`); }
    }
    return;
  }
  
  // 處理其他學生指令
  const returnToPointsMenuBtn = { type: 'postback', label: '返回點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` };
  const nowMs = Date.now();
  switch (text) {
      case COMMANDS.STUDENT.CONTACT_US:
          pendingFeedback[userId] = {};
          setupConversationTimeout(userId, 'pendingFeedback', (u) => push(u, '留言已逾時，自動取消。若要再次留言請重新點選。').catch(e => console.error(e)));
          return reply(replyToken, '請直接輸入您想反應的問題或留言，老師會盡快查看。\n\n若要放棄請點擊下方的「取消」。', [{ type: 'message', label: '取消', text: '取消' }]);
      case COMMANDS.STUDENT.POINTS:
      case COMMANDS.STUDENT.RETURN_POINTS_MENU:
          return sendPointsMenu(replyToken, userId);
      case COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER:
      case COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER:
          const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
          const pendingOrder = ordersRes.rows[0];
          if (pendingOrder) {
            pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
            setupConversationTimeout(userId, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)));
            let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
            if (pendingOrder.status === 'rejected') promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
            return reply(replyToken, promptText, [{ type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }, returnToPointsMenuBtn]);
          } else { delete pendingPurchase[userId]; return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。'); }
      case COMMANDS.STUDENT.CHECK_POINTS:
          return reply(replyToken, `你目前有 ${user.points} 點。`);
      case COMMANDS.STUDENT.BUY_POINTS:
          const hasPendingOrder = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected')`, [userId])).rows[0].count > 0;
          if (hasPendingOrder) return reply(replyToken, `您有一筆待完成的購點訂單，請在「點數管理」主頁面輸入後五碼，或選擇「❌ 取消購買」。`, [returnToPointsMenuBtn, { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }]);
          pendingPurchase[userId] = { step: 'confirm_purchase', data: {} };
          setupConversationTimeout(userId, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)));
          return reply(replyToken, [{ type: 'text', text: '請選擇要購買的點數方案：' }, buildBuyPointsFlex()]);
      case COMMANDS.STUDENT.CANCEL_PURCHASE:
          const orderToDeleteRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
          const orderToDelete = orderToDeleteRes.rows[0];
          if (orderToDelete) {
              const transactionClientCancel = await pgPool.connect();
              try { await transactionClientCancel.query('BEGIN'); await deleteOrder(orderToDelete.order_id, transactionClientCancel); await transactionClientCancel.query('COMMIT'); delete pendingPurchase[userId]; return reply(replyToken, '已取消您的購點訂單。', [returnToPointsMenuBtn]); }
              catch (err) { await transactionClientCancel.query('ROLLBACK'); console.error('❌ 取消購點訂單交易失敗:', err.message); return reply(replyToken, '取消訂單失敗，請稍後再試。'); }
              finally { transactionClientCancel.release(); }
          }
          if (pendingPurchase[userId]) delete pendingPurchase[userId];
          return reply(replyToken, '目前沒有待取消的購點訂單。', [returnToPointsMenuBtn]);
      case COMMANDS.STUDENT.PURCHASE_HISTORY:
          if (!user.history?.length) return reply(replyToken, '你目前沒有點數相關記錄。');
          let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
          user.history.slice(-5).reverse().forEach(record => { historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`; });
          return reply(replyToken, historyMessage.trim());
      case COMMANDS.STUDENT.BOOK_COURSE:
          const sevenDaysLater = nowMs + (ONE_DAY_IN_MS * 7);
          const upcomingCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > nowMs && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId)).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
          if (upcomingCourses.length === 0) return reply(replyToken, '未來七天內沒有您可以預約的新課程。');
          const courseBubbles = upcomingCourses.slice(0, 10).map(course => {
              const isFull = course.students.length >= course.capacity;
              const statusText = `報名 ${course.students.length}/${course.capacity}`;
              const actionButton = { type: 'postback', label: isFull ? '加入候補' : '立即預約', data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`, displayText: `確認預約 ${course.title}` };
              const headerColor = isFull ? '#ff9e00' : '#34a0a4';
              return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: headerColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator' }, { type: 'box', layout: 'baseline', spacing: 'sm', margin: 'md', contents: [{ type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: statusText, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: isFull ? '#ff9e00' : '#1a759f', action: actionButton }] } };
          });
          return reply(replyToken, [{ type: 'text', text: '💡 請注意：課程開始前 8 小時不可退課。' }, { type: 'flex', altText: '可預約課程列表', contents: { type: 'carousel', contents: courseBubbles } }], null);
      case COMMANDS.STUDENT.MY_COURSES:
          const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > nowMs).sort((a,b) => new Date(a.time) - new Date(b.time));
          const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > nowMs).sort((a,b) => new Date(a.time) - new Date(b.time));
          if (enrolledCourses.length === 0 && waitingCourses.length === 0) return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。');
          const myCourseBubbles = [
              ...enrolledCourses.map(course => {
                  const canCancel = new Date(course.time).getTime() - nowMs > EIGHT_HOURS_IN_MS;
                  return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' }] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` } }] } : undefined };
              }),
              ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } }))
          ];
          return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: myCourseBubbles.slice(0, 10) } }, null);
      case COMMANDS.STUDENT.CANCEL_BOOKING:
          const enrolledCoursesToCancel = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > nowMs && new Date(c.time).getTime() - nowMs > EIGHT_HOURS_IN_MS).sort((a,b) => new Date(a.time) - new Date(b.time));
          if (enrolledCoursesToCancel.length === 0) return reply(replyToken, '您目前沒有任何可取消的課程或課程已不足 8 小時。');
          const cancelOptions = enrolledCoursesToCancel.slice(0, 10).map(course => ({ type: 'postback', label: `取消 ${formatDateTime(course.time)} ${course.title}`, data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` }));
          return reply(replyToken, '請選擇要取消預約的課程：', cancelOptions);
      case COMMANDS.STUDENT.CANCEL_WAITING:
          const waitingCoursesToCancel = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > nowMs).sort((a,b) => new Date(a.time) - new Date(b.time));
          if (waitingCoursesToCancel.length === 0) return reply(replyToken, '您目前沒有任何候補中的課程可取消。');
          const cancelWaitingOptions = waitingCoursesToCancel.slice(0, 10).map(course => ({ type: 'postback', label: `取消候補 ${formatDateTime(course.time)} ${course.title}`, data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` }));
          return reply(replyToken, '請選擇要取消候補的課程：', cancelWaitingOptions);
      // V7: 處理最新公告命令
      case COMMANDS.STUDENT.LATEST_ANNOUNCEMENT:
        const latestAnnouncement = await getLatestAnnouncement();
        if (!latestAnnouncement) {
          return reply(replyToken, '目前沒有最新公告。');
        }
        const flex = {
          type: 'flex',
          altText: '最新公告',
          contents: {
            type: 'bubble',
            header: {
              type: 'box',
              layout: 'vertical',
              contents: [{ type: 'text', text: '最新公告', color: '#ffffff', weight: 'bold', size: 'md' }],
              backgroundColor: '#34a0a4',
              paddingAll: 'lg'
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                { type: 'text', text: latestAnnouncement.title, weight: 'bold', size: 'xl', wrap: true },
                { type: 'text', text: latestAnnouncement.content, wrap: true },
                { type: 'text', text: `發佈時間: ${formatDateTime(latestAnnouncement.timestamp.toISOString())}`, size: 'xs', color: '#aaaaaa' }
              ]
            }
          }
        };
        return reply(replyToken, flex);
      default:
          return reply(replyToken, '指令無效，請使用富選單或輸入正確指令。');
  }
}

async function handleStudentCommandsPostback(event, userId) {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');
    const replyToken = event.replyToken;
    const { pendingPurchase, pendingBookingConfirmation } = CONVERSATION_STATES;
    
    if (action === 'select_purchase_plan') {
        const points = parseInt(data.get('plan'));
        const selectedPlan = PURCHASE_PLANS.find(p => p.points === points);
        if (!selectedPlan) return reply(replyToken, '無效的點數方案，請重新選擇。');
        const user = await getUser(userId);
        pendingPurchase[userId] = { step: 'confirm_purchase', data: { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' } };
        setupConversationTimeout(userId, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)));
        return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS }, { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE }]);
    }
    
    if (action === 'confirm_booking') {
        const courseId = data.get('courseId');
        const courseType = data.get('type');
        const course = await getCourse(courseId);
        if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) return reply(replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。');
        const userPoints = (await getUser(userId)).points;
        if (userPoints < course.pointsCost) return reply(replyToken, `點數不足，此課程需要 ${course.pointsCost} 點。您目前有 ${userPoints} 點。`);
        pendingBookingConfirmation[userId] = { courseId: courseId, actionType: courseType };
        setupConversationTimeout(userId, 'pendingBookingConfirmation', (u) => push(u, '預約/取消流程逾時，自動取消。請重新操作。').catch(e => console.error(e)));
        const confirmMessage = `課程名稱：${course.title}\n課程時間：${formatDateTime(course.time)}\n所需點數：${course.pointsCost} 點\n您的剩餘點數：${userPoints} 點\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n確定要${courseType === 'book' ? '預約' : '加入候補'}此課程嗎？`;
        return reply(replyToken, confirmMessage, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING }, { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING }]);
    }

    if (action === 'cancel_booking_confirm') {
        const courseId = data.get('courseId');
        const course = await getCourse(courseId);
        if (!course || !course.students.includes(userId)) return reply(replyToken, '您並未預約此課程或課程不存在。');
        if (new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) return reply(replyToken, `課程「${course.title}」即將開始（不足8小時），無法取消。`);
        pendingBookingConfirmation[userId] = { courseId: courseId, actionType: 'cancel_book' };
        setupConversationTimeout(userId, 'pendingBookingConfirmation', (u) => push(u, '預約/取消流程逾時，自動取消。請重新操作。').catch(e => console.error(e)));
        const confirmMessage = `確定要取消課程「${course.title}」嗎？\n時間：${formatDateTime(course.time)}\n將退還您 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n確認取消請點擊「✅ 確認取消預約」。`;
        return reply(replyToken, confirmMessage, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING }, { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING, text: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING }]);
    }
    
    if (action === 'cancel_waiting_confirm') {
        const courseId = data.get('courseId');
        const course = await getCourse(courseId);
        if (!course || !course.waiting?.includes(userId)) return reply(replyToken, '您並未候補此課程或課程不存在。');
        pendingBookingConfirmation[userId] = { courseId: courseId, actionType: 'cancel_wait' };
        setupConversationTimeout(userId, 'pendingBookingConfirmation', (u) => push(u, '預約/取消流程逾時，自動取消。請重新操作。').catch(e => console.error(e)));
        const confirmMessage = `確定要取消課程「${course.title}」的候補嗎？\n時間：${formatDateTime(course.time)}\n\n確認取消請點擊「✅ 確認取消候補」。`;
        return reply(replyToken, confirmMessage, [{ type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING }, { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING, text: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING }]);
    }
}

async function handleTeacherCommandsPostback(event, userId) {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');
    const replyToken = event.replyToken;
    const { pendingManualAdjust, pendingReply, pendingAnnouncementCreation } = CONVERSATION_STATES;

    // V7: 公告管理 Postback 處理
    if (action === 'start_add_announcement') {
      pendingAnnouncementCreation[userId] = { step: 'awaiting_title' };
      setupConversationTimeout(userId, 'pendingAnnouncementCreation', (u) => push(u, '新增公告逾時，自動取消。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入新公告的標題：', [{ type: 'message', label: '取消', text: '取消' }]);
    }
    
    if (action === 'view_announcements') {
      const announcements = await getAnnouncements();
      if (announcements.length === 0) {
        return reply(replyToken, '目前沒有任何歷史公告。', teacherMenu);
      }
      const announcementBubbles = announcements.map(announcement => ({
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [{ type: 'text', text: `公告 #${announcement.id}`, color: '#ffffff', weight: 'bold', size: 'md' }],
          backgroundColor: '#34a0a4',
          paddingAll: 'lg'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: announcement.title, weight: 'bold', size: 'xl', wrap: true },
            { type: 'text', text: announcement.content, wrap: true, maxLines: 5 },
            { type: 'text', text: `發佈時間: ${formatDateTime(announcement.timestamp.toISOString())}`, size: 'xs', color: '#aaaaaa' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '🗑️ 刪除公告', data: `action=delete_announcement&id=${announcement.id}` } }]
        }
      }));
      return reply(replyToken, {
        type: 'flex',
        altText: '歷史公告列表',
        contents: { type: 'carousel', contents: announcementBubbles }
      });
    }

    if (action === 'delete_announcement') {
      const announcementId = data.get('id');
      await deleteAnnouncement(announcementId);
      return reply(replyToken, `已成功刪除公告 #${announcementId}。`, teacherMenu);
    }

    if (action === 'start_message_search') { 
        pendingMessageSearchQuery[userId] = {};
        setupConversationTimeout(userId, 'pendingMessageSearchQuery', (u) => push(u, '留言查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入學員姓名或留言內容進行查詢（支援模糊篩選）：', null); 
    }

    if (action === 'start_student_search') { 
        pendingStudentSearchQuery[userId] = {};
        setupConversationTimeout(userId, 'pendingStudentSearchQuery', (u) => push(u, '學員查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入要查詢的學員姓名或 ID（支援模糊篩選）：', null); 
    }
    
    if (action === 'show_student_detail') {
        const studentId = data.get('studentId');
        const foundUser = await getUser(studentId);
        if (!foundUser) return reply(replyToken, `找不到學員 ID: ${studentId}。`, teacherMenu);
        let studentInfo = `學員姓名：${foundUser.name}\n學員 ID：${foundUser.id}\n剩餘點數：${foundUser.points} 點\n歷史記錄 (近5筆)：\n`;
        if (foundUser.history?.length > 0) foundUser.history.slice(-5).reverse().forEach(record => studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`);
        return reply(replyToken, studentInfo.trim(), teacherMenu);
    }
    
    if (action === 'mark_feedback_read') {
        const msgId = data.get('msgId');
        await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
        return reply(replyToken, '已將此留言標示為已讀。');
    }
    
    if (action === 'reply_feedback') {
        const msgId = data.get('msgId');
        const targetUserId = data.get('userId');
        pendingReply[userId] = { msgId: msgId, targetUserId: targetUserId };
        setupConversationTimeout(userId, 'pendingReply', (u) => push(u, '回覆留言逾時，自動取消。請重新點擊回覆。').catch(e => console.error(e)));
        return reply(replyToken, '請直接輸入您想回覆的內容：\n\n若要放棄請輸入「取消」。', [{ type: 'message', label: '取消', text: '取消' }]);
    }

    if (action === 'select_manual_adjust_student') {
        const studentId = data.get('studentId');
        const selectedStudent = await getUser(studentId);
        if (!selectedStudent) { delete pendingManualAdjust[userId]; return reply(replyToken, '選擇的學員不存在，請重新開始。', teacherMenu); }
        pendingManualAdjust[userId] = { step: 'awaiting_operation', targetUserId: selectedStudent.id, targetUserName: selectedStudent.name, currentPoints: selectedStudent.points };
        setupConversationTimeout(userId, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)));
        return reply(replyToken, `您選擇了學員：**${selectedStudent.name}** (目前點數：${selectedStudent.points} 點)。\n請選擇要執行何種操作：`, [{ type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS }, { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS }, { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }]);
    }
    
    if (action === 'add_course_start') { 
        CONVERSATION_STATES.pendingCourseCreation[userId] = { step: 1 }; 
        setupConversationTimeout(userId, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e)));
        await reply(replyToken, '請輸入課程名稱（例如：哈達瑜伽）：', [{ type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]); return; 
    }
    
    if (action === 'confirm_order') {
        const orderId = data.get('orderId');
        const transactionClient = await pgPool.connect();
        try {
            await transactionClient.query('BEGIN');
            const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
            const orderInTransaction = orderInTransactionRes.rows[0];
            if (!orderInTransaction || orderInTransaction.status !== 'pending_confirmation') { throw new Error(`訂單 ${orderId} 狀態不正確或已被處理。`); }
            const updatedOrder = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: 'completed', timestamp: new Date(orderInTransaction.timestamp).toISOString() };
            await saveOrder(updatedOrder, transactionClient);
            const targetUserRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [orderInTransaction.user_id]);
            const targetUser = targetUserRes.rows[0];
            if (!targetUser) throw new Error('找不到目標學員。');
            targetUser.points += orderInTransaction.points;
            if (!Array.isArray(targetUser.history)) targetUser.history = [];
            targetUser.history.push({ action: `購點入帳：${orderInTransaction.order_id} (加 ${orderInTransaction.points} 點)`, time: new Date().toISOString() });
            await saveUser(targetUser, transactionClient);
            await transactionClient.query('COMMIT');
            await reply(replyToken, `已確認訂單 ${orderId}，已為學員 ${targetUser.name} 加入 ${orderInTransaction.points} 點。\n目前點數：${targetUser.points} 點。`, teacherMenu);
            push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已確認入帳，已加入 ${orderInTransaction.points} 點。\n您目前有 ${targetUser.points} 點。`).catch(e => console.error(`❌ 通知學員入帳失敗:`, e.message));
        } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 確認訂單交易失敗:', err.stack); await reply(replyToken, err.message || '處理訂單時發生錯誤，請稍後再試。', teacherMenu); }
        finally { transactionClient.release(); }
        return;
    }
    
    if (action === 'reject_order') {
        const orderId = data.get('orderId');
        const transactionClient = await pgPool.connect();
        try {
            await transactionClient.query('BEGIN');
            const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
            const orderInTransaction = orderInTransactionRes.rows[0];
            if (!orderInTransaction || orderInTransaction.status !== 'pending_confirmation') { throw new Error(`訂單 ${orderId} 狀態不正確或已被處理。`); }
            const updatedOrder = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: 'rejected', timestamp: new Date(orderInTransaction.timestamp).toISOString() };
            await saveOrder(updatedOrder, transactionClient);
            await transactionClient.query('COMMIT');
            await reply(replyToken, `已將訂單 ${orderId} 退回。\n已通知學員重新提交或聯繫。`, teacherMenu);
            push(orderInTransaction.user_id, `您的購點訂單 ${orderId} 已被老師退回。原因：匯款資訊有誤或其他原因。\n請您重新確認匯款並在「點數管理」中再次提交匯款後五碼，或聯繫老師。`).catch(e => console.error(`❌ 通知學員訂單退回失敗:`, e.message));
        } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 退回訂單交易失敗:', err.message); await reply(replyToken, '處理訂單時發生錯誤，請稍後再試。', teacherMenu); }
        finally { transactionClient.release(); }
        return;
    }
    
    if (action === 'manage_course_group') {
        const prefix = data.get('prefix');
        const now = Date.now();
        const coursesInGroupRes = await pgPool.query('SELECT * FROM courses WHERE id LIKE $1 AND time > $2 ORDER BY time ASC', [`${prefix}%`, new Date(now)]);
        const coursesInGroup = coursesInGroupRes.rows.map(row => ({ id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] }));
        if (coursesInGroup.length === 0) return reply(replyToken, `系列代碼 ${prefix} 的課程均已結束或不存在。`, teacherMenu);
        const courseBubbles = coursesInGroup.map(course => ({
            type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '單堂課程管理', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '課程ID', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: course.id, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `已預約 ${course.students.length}/${course.capacity} 人`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '候補', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.waiting.length} 人`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                ],
            },
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消這堂課', data: `action=cancel_single_course_confirm&courseId=${course.id}`, displayText: `取消 ${course.title}` } }] },
        }));
        return reply(replyToken, [{ type: 'text', text: `系列代碼：${prefix} 的課程列表：` }, { type: 'flex', altText: `管理系列 ${prefix} の課程`, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }], null);
    }
    
    if (action === 'cancel_course_group_confirm') {
        const prefix = data.get('prefix');
        return reply(replyToken, `確定要批次取消所有以 ${prefix} 開頭的課程嗎？此操作無法恢復，已預約學員將退還點數並收到通知。`, [{ type: 'postback', label: '✅ 確認批次取消', data: `action=cancel_course_group&prefix=${prefix}`, displayText: `確認批次取消 ${prefix} 系列課程` }]);
    }
    
    if (action === 'cancel_course_group') {
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
        } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 批次取消課程交易失敗:', err.stack); await reply(replyToken, '批次取消課程時發生錯誤，請稍後再試。', teacherMenu); }
        finally { transactionClient.release(); }
        return;
    }
    
    if (action === 'cancel_single_course_confirm') {
        const courseId = data.get('courseId');
        const course = await getCourse(courseId);
        if (!course) return reply(replyToken, '課程不存在。', teacherMenu);
        return reply(replyToken, `確定要取消課程：「${course.title}」(${formatDateTime(course.time)}) 嗎？\n已預約學員將退還點數並收到通知。`, [{ type: 'postback', label: '✅ 確認取消', data: `action=cancel_single_course&courseId=${courseId}`, displayText: `確認取消 ${course.title}` }]);
    }
    
    if (action === 'cancel_single_course') {
        const courseId = data.get('courseId');
        const transactionClient = await pgPool.connect();
        try {
            await transactionClient.query('BEGIN');
            const courseToDelete = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
            if (!courseToDelete) { throw new Error('課程不存在或已被取消。'); }
            let refundedCount = 0;
            const studentsToNotify = [...courseToDelete.students];
            for (const studentId of studentsToNotify) {
                const student = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId])).rows[0];
                if (student) {
                    student.points += courseToDelete.points_cost;
                    if (!Array.isArray(student.history)) student.history = [];
                    student.history.push({ action: `課程取消退點：${courseToDelete.title} (退 ${courseToDelete.points_cost} 點)`, time: new Date().toISOString() });
                    await saveUser(student, transactionClient);
                    push(studentId, `您預約的課程「${courseToDelete.title}」已由老師取消，已退還您 ${courseToDelete.points_cost} 點。`).catch(e => console.error(`❌ 向學員課程取消失敗:`, e.message));
                    refundedCount++;
                }
            }
            await deleteCourse(courseId, transactionClient);
            await transactionClient.query('COMMIT');
            await reply(replyToken, `課程「${courseToDelete.title}」已取消，並已退還點數給 ${refundedCount} 位學員。`, teacherMenu);
        } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 取消單堂課程交易失敗:', err.stack); await reply(replyToken, err.message || '取消課程時發生錯誤，請稍後再試。', teacherMenu); }
        finally { transactionClient.release(); }
        return;
    }
}

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
                for (const studentId of course.students) {
                    if (dbUsersMap.has(studentId)) {
                        push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`).catch(e => console.error(`❌ 向學員 ${studentId} 發送提醒失敗:`, e.message));
                    }
                }
                sentReminders[id] = true;
            }
        }
        for (const id in sentReminders) { if (!courses[id] || (new Date(courses[id].time).getTime() < (now - ONE_DAY_IN_MS))) delete sentReminders[id]; }
    } catch (err) { console.error('❌ 自動提醒功能發生錯誤:', err.stack); }
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const channelSecret = config.channelSecret;
  if (signature && channelSecret) {
    try {
      const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');
      if (hash !== signature) { console.error('❌ LINE Webhook 簽名驗證失敗。'); return res.status(401).send('Unauthorized: Invalid signature'); }
    } catch (error) { console.error('❌ LINE Webhook 簽名驗證時發生錯誤:', error); return res.status(400).send('Bad Request'); }
  }
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => { console.error('❌ Webhook 處理失敗:', err.stack); res.status(500).end(); });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7 (新增公告管理功能)`);
  await initializeDatabase();
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    setInterval(() => { fetch(SELF_URL).then(res => console.log(`Keep-alive response from ${SELF_URL}: ${res.status}`)).catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message)); }, PING_INTERVAL_MS);
  } else { console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。'); }
});

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow') return;
    const userId = event.source.userId;
    let user = await getUser(userId);

    if (event.type === 'follow' || !user) {
      try {
        const profile = await client.getProfile(userId);
        user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], lastAnnouncementViewed: null }; // 新增 lastAnnouncementViewed
        await saveUser(user);
        if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        
        // V7: 新增用戶時主動推播最新公告
        const latestAnnouncement = await getLatestAnnouncement();
        if (latestAnnouncement) {
          const flex = {
            type: 'flex',
            altText: '最新公告',
            contents: {
              type: 'bubble',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '最新公告', color: '#ffffff', weight: 'bold', size: 'md' }],
                backgroundColor: '#34a0a4',
                paddingAll: 'lg'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  { type: 'text', text: latestAnnouncement.title, weight: 'bold', size: 'xl', wrap: true },
                  { type: 'text', text: latestAnnouncement.content, wrap: true },
                  { type: 'text', text: `發佈時間: ${formatDateTime(latestAnnouncement.timestamp.toISOString())}`, size: 'xs', color: '#aaaaaa' }
                ]
              }
            }
          };
          await push(userId, [{ type: 'text', text: `哈囉，${profile.displayName}！歡迎加入九容瑜伽，這是我們的最新消息！` }, flex]);
          user.lastAnnouncementViewed = latestAnnouncement.timestamp;
          await saveUser(user);
        } else {
          await push(userId, `哈囉，${profile.displayName}！歡迎加入九容瑜伽！`);
        }
      } catch (err) {
        user = { id: userId, name: `新用戶 ${userId.substring(0, 8)}...`, points: 0, role: 'student', history: [], lastAnnouncementViewed: null };
        await saveUser(user);
        if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(`❌ 備用連結學員 Rich Menu 失敗: ${e.message}`));
        await push(userId, `哈囉，新用戶！歡迎加入九容瑜伽！`);
      }
      return;
    }
    
    // V7: 用戶非新加入，但有未讀公告時主動推播
    const latestAnnouncement = await getLatestAnnouncement();
    if (user.role === 'student' && latestAnnouncement && (!user.lastAnnouncementViewed || new Date(latestAnnouncement.timestamp).getTime() > new Date(user.lastAnnouncementViewed).getTime())) {
      const flex = {
        type: 'flex',
        altText: '最新公告',
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: '最新公告', color: '#ffffff', weight: 'bold', size: 'md' }],
            backgroundColor: '#34a0a4',
            paddingAll: 'lg'
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              { type: 'text', text: latestAnnouncement.title, weight: 'bold', size: 'xl', wrap: true },
              { type: 'text', text: latestAnnouncement.content, wrap: true },
              { type: 'text', text: `發佈時間: ${formatDateTime(latestAnnouncement.timestamp.toISOString())}`, size: 'xs', color: '#aaaaaa' }
            ]
          }
        }
      };
      await push(userId, [{ type: 'text', text: '這是我們最新的消息，請查收！' }, flex]);
      user.lastAnnouncementViewed = latestAnnouncement.timestamp;
      await saveUser(user);
    }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        if (text === COMMANDS.SWITCH_ROLE) {
            if (user.role === 'teacher') {
                user.role = 'student'; await saveUser(user); await reply(event.replyToken, '您已切換為學員身份。');
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            } else { CONVERSATION_STATES.pendingTeacherLogin[userId] = true; await reply(event.replyToken, '請輸入老師密碼：'); }
            return;
        }

        if (CONVERSATION_STATES.pendingTeacherLogin[userId]) {
            delete CONVERSATION_STATES.pendingTeacherLogin[userId];
            if (text === TEACHER_PASSWORD) {
                user.role = 'teacher'; await saveUser(user); await reply(event.replyToken, '密碼正確，您已切換為老師身份。', null);
                if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
            } else {
                await reply(event.replyToken, '密碼錯誤。已自動切換回學員身份。');
                user.role = 'student'; await saveUser(user);
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            }
            return;
        }

        if (user.role === 'teacher') {
            await handleTeacherCommands(event, userId);
        } else {
            await handleStudentCommands(event, userId);
        }
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');

        if (action === 'run_command') {
            const commandText = data.get('text');
            if (commandText) {
                const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: 'simulated_message_id', text: commandText } };
                if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, userId);
                else await handleStudentCommands(simulatedEvent, userId);
            }
            return;
        }
        
        if (user.role === 'teacher') {
            await handleTeacherCommandsPostback(event, userId);
        } else {
            await handleStudentCommandsPostback(event, userId);
        }
    }
}
