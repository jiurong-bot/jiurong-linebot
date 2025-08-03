// index.js - V10
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

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
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

const STUDENT_RICH_MENU_ID = process.env.STUDENT_RICH_MENU_ID;
const TEACHER_RICH_MENU_ID = process.env.TEACHER_RICH_MENU_ID;
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;

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
  ADMIN: {
    PANEL: '@管理模式',
    ADD_TEACHER: '@授權老師',
    REMOVE_TEACHER: '@移除老師',
    SIMULATE_STUDENT: '@模擬學員身份',
    SIMULATE_TEACHER: '@模擬老師身份',
    CONFIRM_ADD_TEACHER: '✅ 確認授權',
    CANCEL_ADD_TEACHER: '❌ 取消操作',
    CONFIRM_REMOVE_TEACHER: '✅ 確認移除',
    CANCEL_REMOVE_TEACHER: '❌ 取消操作',
  },
  TEACHER: {
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    STUDENT_MANAGEMENT: '@學員管理',
    ANNOUNCEMENT_MANAGEMENT: '@公告管理',
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
    CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認發布',
    CANCEL_ADD_ANNOUNCEMENT: '❌ 取消發布',
    CONFIRM_DELETE_ANNOUNCEMENT: '✅ 確認刪除',
    ABANDON_DELETE_ANNOUNCEMENT: '❌ 放棄刪除',
  },
  STUDENT: {
    POINTS: '@點數管理',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CONTACT_US: '@聯絡我們',
    LATEST_ANNOUNCEMENT: '@最新公告',
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
    ABANDON_CANCEL_WAITING: '❌ 放棄取消候補'
  }
};

async function initializeDatabase() {
  try {
    const testClient = await pgPool.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    testClient.release();
    
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    
    const lastSeenIdCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_seen_announcement_id'");
    if (lastSeenIdCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE users ADD COLUMN last_seen_announcement_id INTEGER DEFAULT 0');
        console.log('✅ 已成功為 users 表新增 last_seen_announcement_id 欄位。');
    }
    const pictureUrlCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='picture_url'");
    if (pictureUrlCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE users ADD COLUMN picture_url TEXT');
        console.log('✅ 已成功為 users 表新增 picture_url 欄位。');
    }
    const approvedByCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='approved_by'");
    if (approvedByCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE users ADD COLUMN approved_by VARCHAR(255)');
        console.log('✅ 已成功為 users 表新增 approved_by 欄位。');
    }

    const creatorIdCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_id'");
    if (creatorIdCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE announcements ADD COLUMN creator_id VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
        console.log('✅ 已成功為 announcements 表新增 creator_id 欄位。');
    }
    const creatorNameCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_name'");
    if (creatorNameCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE announcements ADD COLUMN creator_name VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
        console.log('✅ 已成功為 announcements 表新增 creator_name 欄位。');
    }
    
    await cleanCoursesDB();
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  }
}
initializeDatabase();

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
  if (res.rows.length === 0) return null;
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
        `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
        [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.pictureUrl || null, user.approved_by || null]
    );
  } catch (err) {
    console.error(`FATAL ERROR: saveUser 函式捕獲到錯誤!`, { message: err.message, stack: err.stack, userId: user.id });
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
  await pgPool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

async function cleanCoursesDB() {
  const now = Date.now();
  await pgPool.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
}

async function reply(replyToken, content, menu = null) {
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : [content]);
  if (menu !== null && menu !== undefined) {
      const menuItems = Array.isArray(menu) ? menu : [];
      const validMenuItems = menuItems.slice(0, 13).map(item => {
          if (item.type === 'action' && (item.action.type === 'message' || item.action.type === 'postback')) {
              return item;
          }
          return null;
      }).filter(Boolean);

      if (validMenuItems.length > 0 && messages.length > 0) {
          if (!messages[messages.length - 1].quickReply) {
              messages[messages.length - 1].quickReply = { items: [] };
          }
          messages[messages.length - 1].quickReply.items.push(...validMenuItems);
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
    resultDate.setUTCHours(hours - 8, minutes, 0, 0);
    let currentDay = resultDate.getUTCDay();
    let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
    if (daysToAdd === 0 && resultDate.getTime() <= startDate.getTime()) daysToAdd = 7;
    else if (resultDate.getTime() < startDate.getTime() && daysToAdd === 0) daysToAdd = 7;
    resultDate.setUTCDate(resultDate.getUTCDate() + daysToAdd);
    return resultDate;
}

// V10: 以下為點數系統專用函式，確保被 handleStudentCommands 呼叫前已定義
function buildBuyPointsFlex() {
    const plansContent = PURCHASE_PLANS.flatMap((plan, index) => {
        const planItems = [
            {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    { type: 'text', text: `${plan.points} 點`, size: 'md', color: '#1A759F', flex: 3, gravity: 'center' },
                    { type: 'text', text: `售價：${plan.amount} 元`, size: 'md', color: '#666666', align: 'end', flex: 5, gravity: 'center' }
                ]
            },
            {
                type: 'button',
                action: { type: 'postback', label: '選擇此方案', data: `action=select_purchase_plan&plan=${plan.points}`, displayText: `選擇購買 ${plan.points} 點方案` },
                style: 'primary',
                color: '#52B69A'
            }
        ];
        if (index < PURCHASE_PLANS.length - 1) {
            planItems.push({ type: 'separator', margin: 'md' });
        }
        return planItems;
    });

    return {
        type: 'flex',
        altText: '請選擇要購買的點數方案',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '請選擇點數方案', weight: 'bold', size: 'md', color: '#FFFFFF' }],
                backgroundColor: '#34A0A4',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    ...plansContent,
                    { type: 'text', text: '購買後請至「點數管理」輸入匯款資訊', size: 'xs', color: '#aaaaaa', align: 'center', margin: 'md' }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [{
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }
                }]
            }
        }
    };
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

async function pushPointsMenu(userId) {
    try {
        const flexMessage = await buildPointsMenuFlex(userId);
        await push(userId, flexMessage);
    } catch (err) {
        console.error(`❌ 推播點數選單失敗 (pushPointsMenu):`, err);
        await push(userId, '抱歉，讀取點數資訊時發生錯誤。');
    }
}

const teacherMenu = [];
const studentMenu = [
    { type: 'action', action: { type: 'postback', label: '點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } },
    { type: 'action', action: { type: 'postback', label: '預約課程', data: `action=run_command&text=${COMMANDS.STUDENT.BOOK_COURSE}` } },
    { type: 'action', action: { type: 'postback', label: '我的課程', data: `action=run_command&text=${COMMANDS.STUDENT.MY_COURSES}` } },
    { type: 'action', action: { type: 'postback', label: '最新公告', data: `action=run_command&text=${COMMANDS.STUDENT.LATEST_ANNOUNCEMENT}` } }
];
const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];

const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const sentReminders = {};
const pendingStudentSearchQuery = {};
const pendingBookingConfirmation = {};
const pendingFeedback = {};
const pendingReply = {};
const pendingMessageSearchQuery = {};
const pendingAnnouncementCreation = {};
const pendingTeacherAddition = {};
const pendingTeacherRemoval = {};

function setupConversationTimeout(userId, conversationState, stateName, onTimeout) {
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

async function handleAdminCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  // 清理超時
  if (pendingTeacherAddition[userId] || pendingTeacherRemoval[userId]) {
    if(pendingTeacherAddition[userId]) {
      clearTimeout(pendingTeacherAddition[userId].timeoutId);
      setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => push(u, '授權老師操作逾時，自動取消。').catch(e => console.error(e)));
    }
    if(pendingTeacherRemoval[userId]) {
      clearTimeout(pendingTeacherRemoval[userId].timeoutId);
      setupConversationTimeout(userId, pendingTeacherRemoval, 'pendingTeacherRemoval', (u) => push(u, '移除老師操作逾時，自動取消。').catch(e => console.error(e)));
    }
  }

  // 授權老師流程
  if (pendingTeacherAddition[userId]) {
    const state = pendingTeacherAddition[userId];
    if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
      delete pendingTeacherAddition[userId];
      return reply(replyToken, '已取消授權操作。');
    }
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        } else if (studentRes.rows.length === 1) {
          state.targetUser = studentRes.rows[0];
          state.step = 'await_confirmation';
          return reply(replyToken, `您確定要授權學員「${state.targetUser.name}」成為老師嗎？`, [
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }
          ]);
        } else {
          // 多位學員，暫不處理，提示管理者給更精確的資訊
          return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        }
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'teacher';
          targetUser.approved_by = userId;
          await saveUser(targetUser);
          delete pendingTeacherAddition[userId];
          push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
          return reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
    return;
  }
  
  // 移除老師流程
  if (pendingTeacherRemoval[userId]) {
    const state = pendingTeacherRemoval[userId];
    if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
      delete pendingTeacherRemoval[userId];
      return reply(replyToken, '已取消移除操作。');
    }
    switch (state.step) {
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          delete pendingTeacherRemoval[userId];
          push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
          return reply(replyToken, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
    return;
  }

  if (text === COMMANDS.ADMIN.PANEL) {
    const adminMenu = [
        { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } },
        { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } },
        { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } },
        { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } }
    ];
    return reply(replyToken, '請選擇管理者功能：', adminMenu);
  }

  if (text === COMMANDS.ADMIN.ADD_TEACHER) {
    pendingTeacherAddition[userId] = { step: 'await_student_info' };
    setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => push(u, '授權老師操作逾時，自動取消。').catch(e => console.error(e)));
    return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
  }

  if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
    const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
    if (teacherRes.rows.length === 0) {
      return reply(replyToken, '目前沒有任何老師可供移除。');
    }
    const teacherBubbles = teacherRes.rows.map(t => ({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] },
      footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${t.name}` }}]}
    }));
    return reply(replyToken, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });
  }

  if (text === COMMANDS.ADMIN.SIMULATE_STUDENT) {
    user.role = 'student';
    await saveUser(user);
    if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
    return reply(replyToken, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }

  if (text === COMMANDS.ADMIN.SIMULATE_TEACHER) {
    user.role = 'teacher';
    await saveUser(user);
    if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
    return reply(replyToken, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }
}
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);
  
  if (pendingAnnouncementCreation[userId] || pendingReply[userId] || pendingStudentSearchQuery[userId] || pendingMessageSearchQuery[userId] || pendingManualAdjust[userId] || pendingCourseCreation[userId]) {
    if (pendingAnnouncementCreation[userId]) {
        clearTimeout(pendingAnnouncementCreation[userId].timeoutId);
        setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => push(u, '新增公告逾時，自動取消。').catch(e => console.error(e)));
    }
    if (pendingReply[userId]) {
        clearTimeout(pendingReply[userId].timeoutId);
        setupConversationTimeout(userId, pendingReply, 'pendingReply', (u) => push(u, '回覆留言逾時，自動取消。請重新點擊回覆。').catch(e => console.error(e)));
    }
    if (pendingStudentSearchQuery[userId]) {
        clearTimeout(pendingStudentSearchQuery[userId].timeoutId);
        setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => push(u, '學員查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)));
    }
    if (pendingMessageSearchQuery[userId]) {
        clearTimeout(pendingMessageSearchQuery[userId].timeoutId);
        setupConversationTimeout(userId, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => push(u, '留言查詢逾時，自動取消。請重新查詢。').catch(e => console.error(e)));
    }
    if (pendingManualAdjust[userId]) {
        clearTimeout(pendingManualAdjust[userId].timeoutId);
        setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)));
    }
    if (pendingCourseCreation[userId]) {
        clearTimeout(pendingCourseCreation[userId].timeoutId);
        setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。請重新新增。').catch(e => console.error(e)));
    }
  }

  if (pendingAnnouncementCreation[userId]) {
    const state = pendingAnnouncementCreation[userId];
    const confirmationButtons = [
        { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
        { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
    ];

    switch (state.step) {
        case 'await_content':
            state.content = text;
            state.step = 'await_confirmation';
            const confirmMsg = {
                type: 'flex',
                altText: '請確認公告內容',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請確認公告內容', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F' },
                    body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: text, wrap: true }] },
                    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: []}
                }
            };
            return reply(replyToken, confirmMsg, confirmationButtons);
        case 'await_confirmation':
            if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
                try {
                    const newAnnRes = await pgPool.query(
                        'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3) RETURNING *',
                        [state.content, userId, user.name]
                    );
                    const newAnn = newAnnRes.rows[0];
                    delete pendingAnnouncementCreation[userId];
                    await reply(replyToken, '✅ 公告已成功發布！正在推播給所有學員...');

                    (async () => {
                        try {
                            const studentsRes = await pgPool.query("SELECT id FROM users WHERE role = 'student'");
                            const announcementMessage = {
                                type: 'flex',
                                altText: '來自老師的最新公告',
                                contents: {
                                    type: 'bubble',
                                    header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [
                                        { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }
                                    ]},
                                    body: { type: 'box', layout: 'vertical', contents: [
                                        { type: 'text', text: state.content, wrap: true }
                                    ]},
                                    footer: { type: 'box', layout: 'vertical', contents: [
                                         { type: 'text', text: `發布時間: ${formatDateTime(newAnn.created_at)}`, size: 'xs', color: '#aaaaaa', align: 'center' }
                                    ]}
                                }
                            };
                            for (const student of studentsRes.rows) {
                               await push(student.id, announcementMessage);
                            }
                            console.log(`📢 公告已成功推播給 ${studentsRes.rows.length} 位學員。`);
                        } catch (e) {
                            console.error('❌ 推播公告失敗:', e);
                        }
                    })();
                } catch (e) {
                    console.error('❌ 發布公告失敗:', e);
                    delete pendingAnnouncementCreation[userId];
                    return reply(replyToken, '❌ 公告發布失敗，請稍後再試。');
                }
            } else if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
                delete pendingAnnouncementCreation[userId];
                return reply(replyToken, '已取消發布公告。');
            } else {
                return reply(replyToken, `請點擊 "${COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT}" 或 "${COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT}"。`, confirmationButtons);
            }
            break;
    }
    return;
  }
  
  if (pendingAnnouncementCreation[userId]) {
    delete pendingAnnouncementCreation[userId];
  }

  if (pendingReply[userId]) {
    const replyData = pendingReply[userId];
    if (text === '取消') {
      clearTimeout(replyData.timeoutId);
      delete pendingReply[userId];
      return reply(replyToken, '已取消回覆。');
    }
    
    push(replyData.targetUserId, `老師回覆您在「聯絡我們」的留言：\n\n${text}`).catch(e => console.error(e));
    await pgPool.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, replyData.msgId]);
    
    clearTimeout(replyData.timeoutId);
    delete pendingReply[userId];
    return reply(replyToken, '已成功回覆學員。');
  }

  if (pendingStudentSearchQuery[userId]) {
      reply(replyToken, '學員查詢中，請稍候...').catch(e => console.error(e));
      (async () => {
          try {
              const query = text;
              const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
              const foundUsers = res.rows;
              delete pendingStudentSearchQuery[userId];

              if (foundUsers.length === 0) {
                  return push(userId, `找不到學員「${query}」。`);
              }

              const updatedUsersWithFreshProfiles = await Promise.all(
                  foundUsers.map(async (dbUser) => {
                      try {
                          const profile = await client.getProfile(dbUser.id);
                          dbUser.picture_url = profile.pictureUrl;
                          dbUser.name = profile.displayName;
                          pgPool.query(
                              'UPDATE users SET name = $1, picture_url = $2 WHERE id = $3',
                              [profile.displayName, profile.pictureUrl, dbUser.id]
                          ).catch(e => console.error(`背景更新用戶 ${dbUser.id} 資料失敗:`, e.message));
                          return dbUser;
                      } catch (e) {
                          console.error(`查詢用戶 ${dbUser.id} 最新資料失敗:`, e.message);
                          return dbUser;
                      }
                  })
              );
              
              const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';

              if (updatedUsersWithFreshProfiles.length === 1) {
                  const foundUser = updatedUsersWithFreshProfiles[0];
                  const historyRecords = (foundUser.history?.length > 0)
                      ? foundUser.history.slice(-5).reverse().map(record => ({ type: 'text', text: `・${record.action} (${formatDateTime(record.time)})`, size: 'sm', color: '#666666', wrap: true }))
                      : [{ type: 'text', text: '尚無歷史記錄', size: 'sm', color: '#999999' }];
                  
                  const singleResultFlex = { type: 'flex', altText: `學員 ${foundUser.name} 的資訊`, contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: foundUser.picture_url || placeholder_avatar, size: 'sm', aspectRatio: '1:1', aspectMode: 'cover', gravity: 'center', cornerRadius: '50%' }, { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: foundUser.name, weight: 'bold', size: 'xl' }, { type: 'text', text: `剩餘點數：${foundUser.points} 點`, size: 'sm', color: '#666666' } ] } ] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '學員 ID', color: '#aaaaaa', size: 'sm', flex: 3 }, { type: 'text', text: foundUser.id, wrap: true, color: '#666666', size: 'xxs', flex: 5 } ]}, { type: 'separator', margin: 'xxl' }, { type: 'text', text: '近期記錄 (最多5筆)', weight: 'bold', size: 'md', margin: 'lg' }, ...historyRecords ] } } };
                  await push(userId, singleResultFlex);
              } else {
                  const userBubbles = updatedUsersWithFreshProfiles.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover', cornerRadius: '50%' }, { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666' } ] } ] } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '查看詳細資訊', data: `action=show_student_detail&studentId=${u.id}`, displayText: `查看學員 ${u.name} 的詳情` } }] } }));
                  await push(userId, [{ type: 'text', text: `找到 ${updatedUsersWithFreshProfiles.length} 位符合的學員：` }, { type: 'flex', altText: '請選擇學員', contents: { type: 'carousel', contents: userBubbles.slice(0, 10) } }]);
              }
          } catch (err) {
              console.error('❌ 查詢學員時發生錯誤:', err);
              delete pendingStudentSearchQuery[userId];
              await push(userId, '查詢學員時發生錯誤，請稍後再試。');
          }
      })();
      return;
  }

  if (pendingMessageSearchQuery[userId]) {
      reply(replyToken, '留言查詢中，請稍候...').catch(e => console.error(e));
      (async () => {
          try {
              const query = text;
              delete pendingMessageSearchQuery[userId];
              const messagesRes = await pgPool.query(
                "SELECT * FROM feedback_messages WHERE user_name LIKE $1 OR message LIKE $2 OR teacher_reply LIKE $3 ORDER BY timestamp DESC LIMIT 10", 
                [`%${query}%`, `%${query}%`, `%${query}%`]
              );
              const foundMessages = messagesRes.rows;

              if (foundMessages.length === 0) {
                return push(userId, `找不到與「${query}」相關的留言紀錄。`);
              }
              const messageBubbles = foundMessages.map(msg => {
                const headerColor = msg.status === 'replied' ? '#1A759F' : (msg.status === 'read' ? '#52b69a' : '#6a7d8b');
                const replyContent = msg.teacher_reply ? [{ type: 'text', text: '老師回覆:', size: 'sm', color: '#aaaaaa', margin: 'md' }, { type: 'text', text: msg.teacher_reply, wrap: true }] : [];
                return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: headerColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: msg.message, wrap: true }, { type: 'separator', margin: 'md' }, ...replyContent, { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 'md' } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }, { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } } ]} };
              });
              await push(userId, [{ type: 'text', text: '以下是與您搜尋相關的留言紀錄：' }, { type: 'flex', altText: '留言查詢結果', contents: { type: 'carousel', contents: messageBubbles } }]);
          } catch (err) {
              console.error('❌ 查詢留言時發生錯誤:', err);
              delete pendingMessageSearchQuery[userId];
              await push(userId, '查詢留言時發生錯誤，請稍後再試。');
          }
      })();
      return;
  }
  
  // ... (Manual Adjust Points flow is quick, no need to change)
  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      pendingManualAdjust[userId] = { step: 'awaiting_student_info' };
      setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。請重新操作。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入要調整點數的學員姓名或 ID (支援模糊查詢)：', [{ type: 'action', action: {type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST} }]);
  }
  if (pendingManualAdjust[userId]) {
    // ...
  }
  
  if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
    // ... (This one is quick, no need to change)
  }

  if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
    // ... (This one is quick, no need to change)
  }

  if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
      reply(replyToken, '正在查詢新留言...').catch(e => console.error(e));
      (async () => {
          try {
              const messagesRes = await pgPool.query("SELECT * FROM feedback_messages WHERE status IN ('new', 'read') ORDER BY timestamp ASC LIMIT 10");
              if (messagesRes.rows.length === 0) {
                  return push(userId, '太棒了，目前沒有新的學員留言！');
              }
              const messageBubbles = messagesRes.rows.map(msg => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} の留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: (msg.status === 'read' ? '#52b69a' : '#6a7d8b'), paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: msg.message, wrap: true }, { type: 'separator' }, { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa' } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }, { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } } ]} }));
              await push(userId, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } });
          } catch (err) {
              console.error('❌ 查詢新留言時發生錯誤:', err);
              await push(userId, '查詢新留言時發生錯誤，請稍後再試。');
          }
      })();
      return;
  }

  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
      // ... (This one is quick, no need to change)
  }

  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
    reply(replyToken, '正在查詢課程資訊，請稍候...').catch(e => console.error(e));
    (async () => {
        try {
            const allCourses = Object.values(await getAllCourses());
            const courseGroups = {};
            const now = Date.now();
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
                const courseMainTitle = earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''); 
                courseBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: courseMainTitle, weight: 'bold', size: 'xl', wrap: true }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, ], }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [ { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` } }, { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` } }, ], }, });
            }
            const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
            courseBubbles.push(addCourseBubble);
            let introText = (Object.keys(courseGroups).length === 0) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
            await push(userId, [{ type: 'text', text: introText }, { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
        } catch (err) {
            console.error('❌ 查詢課程管理時發生錯誤:', err);
            await push(userId, '查詢課程資訊時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  if (text === COMMANDS.TEACHER.REPORT) {
    reply(replyToken, '正在生成營運報告...').catch(e => console.error(e));
    (async () => {
        try {
            const now = Date.now();
            const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
            const students = usersRes.rows;
            const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
            const activeStudentsCount = students.filter(s => s.history?.length > 0).length;
            const coursesRes = await pgPool.query(`SELECT * FROM courses`);
            const allCourses = coursesRes.rows;
            const totalCourses = allCourses.length;
            const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
            const completedCourses = totalCourses - upcomingCourses;
            const ordersRes = await pgPool.query(`SELECT * FROM orders`);
            const allOrders = ordersRes.rows;
            const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
            const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
            const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);
            let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
            await push(userId, report.trim());
        } catch (err) {
            console.error('❌ 生成營運報告時發生錯誤:', err);
            await push(userId, '生成營運報告時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
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
    return;
  }
  
  let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
  if (text.startsWith('@')) {
      teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
  }
  return reply(replyToken, teacherSuggestion);
}
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') return false;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];
  const returnToPointsMenuBtn = { type: 'action', action: { type: 'postback', label: '返回點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } };

  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) { 
      delete pendingPurchase[userId]; 
      reply(replyToken, '已返回點數管理主選單。').catch(e => console.error(e));
      await pushPointsMenu(userId);
      return true; 
  }

  switch (stepData.step) {
    case 'input_last5':
      const orderId = stepData.data.orderId;
      const last5Digits = text;
      if (!/^\d{5}$/.test(last5Digits)) { await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。'); return true; }
      const transactionClient = await pgPool.connect();
      try {
        await transactionClient.query('BEGIN');
        const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        let orderInTransaction = orderInTransactionRes.rows[0];
        if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) { await transactionClient.query('ROLLBACK'); delete pendingPurchase[userId]; await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', [returnToPointsMenuBtn]); return true; }
        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
        await saveOrder(newOrderData, transactionClient);
        await transactionClient.query('COMMIT');
        delete pendingPurchase[userId];
        await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。`);
        if (TEACHER_ID) push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
        await pushPointsMenu(userId);
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        delete pendingPurchase[userId];
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。', [returnToPointsMenuBtn]);
        return true;
      } finally { transactionClient.release(); }
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
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) { 
        const simulatedEvent = { replyToken, type: 'message', message: { type: 'text', id: 'simulated_cancel_id', text: COMMANDS.STUDENT.CANCEL_PURCHASE } };
        await handleStudentCommands(simulatedEvent, userId);
      } else { 
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); 
      }
      return true;
  }
  return false;
}

async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (pendingFeedback[userId] || pendingPurchase[userId] || pendingBookingConfirmation[userId]) {
    // ... Timeout handling logic remains the same
  }

  if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
    reply(replyToken, '正在查詢最新公告...').catch(e => console.error(e));
    (async () => {
        try {
            const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
            if (res.rows.length === 0) {
                return push(userId, '目前沒有任何公告。');
            }
            const announcement = res.rows[0];
            const announcementMessage = { type: 'flex', altText: '最新公告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } };
            await push(userId, announcementMessage);
        } catch (err) {
            console.error('❌ 查詢最新公告時發生錯誤:', err);
            await push(userId, '查詢公告時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  if (pendingFeedback[userId]) {
    // ... Feedback logic remains the same
  }

  if (await handlePurchaseFlow(event, userId)) return;
  
  if (text === COMMANDS.STUDENT.CONTACT_US) {
    // ... Contact Us logic remains the same
  }

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    reply(replyToken, '正在讀取點數資訊...').catch(e => console.error(e));
    if (pendingPurchase[userId]?.step !== 'input_last5' && pendingPurchase[userId]?.step !== 'edit_last5') delete pendingPurchase[userId];
    delete pendingBookingConfirmation[userId];
    await pushPointsMenu(userId);
    return;
  }

  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    // ... Input Last 5 logic remains the same
  }

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    // ... Buy Points logic remains the same
  }

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const purchaseState = pendingPurchase[userId];
    if (purchaseState) {
        if (purchaseState.step === 'confirm_purchase') {
            delete pendingPurchase[userId];
            pendingPurchase[userId] = { step: 'select_plan', data: {} };
            setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)));
            return reply(replyToken, [{ type: 'text', text: '已取消確認，請重新選擇方案：' }, buildBuyPointsFlex()]);
        } else if (purchaseState.step === 'select_plan') {
            delete pendingPurchase[userId];
            reply(replyToken, '已取消購買，返回點數管理主選單。').catch(e => console.error(e));
            await pushPointsMenu(userId);
            return;
        }
    }
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
        if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。'); }
        else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
            const transactionClientCancel = await pgPool.connect();
            try { await transactionClientCancel.query('BEGIN'); await deleteOrder(pendingOrder.order_id, transactionClientCancel); await transactionClientCancel.query('COMMIT'); delete pendingPurchase[userId]; 
                reply(replyToken, '已取消您的購點訂單。').catch(e => console.error(e));
                await pushPointsMenu(userId);
                return;
            }
            catch (err) { await transactionClientCancel.query('ROLLBACK'); console.error('❌ 取消購點訂單交易失敗:', err.message); return reply(replyToken, '取消訂單失敗，請稍後再試。'); }
            finally { transactionClientCancel.release(); }
        }
    }
    reply(replyToken, '您沒有待處理的購點流程，已返回點數管理主選單。').catch(e => console.error(e));
    await pushPointsMenu(userId);
    return;
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    // ... Purchase History logic is quick, no need to change
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    reply(replyToken, '正在查詢可預約的課程...').catch(e => console.error(e));
    (async () => {
        try {
            const courses = await getAllCourses();
            const now = Date.now();
            const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
            const upcomingCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > now && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId)).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
            
            if (upcomingCourses.length === 0) { 
                return push(userId, '未來七天內沒有您可以預約的新課程。'); 
            }
            // ... Flex message building logic remains the same ...
            const listFlex = { /* ... */ };
            await push(userId, listFlex);
        } catch (err) {
            console.error('❌ 查詢可預約課程時發生錯誤:', err);
            await push(userId, '查詢課程時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  if (text === COMMANDS.STUDENT.MY_COURSES) {
    reply(replyToken, '正在查詢您的課程...').catch(e => console.error(e));
    (async () => {
        try {
            const courses = await getAllCourses();
            const now = Date.now();
            const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
            const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
            if (enrolledCourses.length === 0 && waitingCourses.length === 0) { return push(userId, '您目前沒有任何已預約或候補中的未來課程。'); }
            // ... Flex message building logic remains the same ...
            const courseBubbles = [ /* ... */ ];
            await push(userId, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } });
        } catch (err) {
            console.error('❌ 查詢我的課程時發生錯誤:', err);
            await push(userId, '查詢您的課程時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }

  // ... Booking/Cancelling flows are multi-step and quick, no need to change ...
  if (pendingBookingConfirmation[userId]) {
    // ...
  }

  let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
  if (text.startsWith('@')) {
      studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`;
  }
  return reply(replyToken, studentSuggestion, studentMenu);
}

async function checkAndSendReminders() {
    // ... Reminder logic remains the same
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

app.post('/webhook', (req, res) => {
  // ... Webhook validation remains the same
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => { console.error('❌ Webhook 處理失敗:', err.stack); res.status(500).end(); });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V10`);
  // ... setIntervals remain the same
});

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const userId = event.source.userId;
    let user = await getUser(userId);
    
    // ... User creation/update logic remains the same ...
    if (!user) {
        // ...
    } else {
        // ...
    }

    // ... Announcement check logic remains the same ...

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        
        // V10: 管理者萬能指令
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
              user.role = 'admin';
              await saveUser(user);
              if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
            }
            return handleAdminCommands(event, userId);
        }

        // V10: 指令分流
        switch(user.role) {
            case 'admin':
                await handleAdminCommands(event, userId);
                break;
            case 'teacher':
                // ... Teacher's course creation flow remains the same ...
                await handleTeacherCommands(event, userId);
                break;
            default: // student
                await handleStudentCommands(event, userId);
                break;
        }
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');
        const replyToken = event.replyToken;

        if (action === 'run_command') {
            const commandText = data.get('text');
            if (commandText) {
                const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: 'simulated_message_id', text: commandText } };
                // V10: Postback分流
                if (user.role === 'admin') await handleAdminCommands(simulatedEvent, userId);
                else if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, userId);
                else await handleStudentCommands(simulatedEvent, userId);
            }
            return;
        }
        
        // ... Other postback handling logic ...
        if (user.role === 'admin' && action === 'select_teacher_for_removal') {
          // ... Admin postback logic ...
        }
        
        if (user.role === 'teacher') {
          // ... Teacher postback logic ...
        } else { // Student role postback
          // ... Student postback logic ...
        }
    }
}
