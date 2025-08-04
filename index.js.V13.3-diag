// index.js - V13.3-diag (增加診斷日誌)
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
      ADD_ANNOUNCEMENT: '@發布新公告',
      DELETE_ANNOUNCEMENT: '@刪除舊公告',
    SHOP_MANAGEMENT: '@商城管理',
      ADD_PRODUCT: '@上架新商品',
      VIEW_PRODUCTS: '@查看所有商品',
      REMOVE_PRODUCT: '@下架商品',
    VIEW_MESSAGES: '@查看留言',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查詢學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '❌ 取消調整',
    CONFIRM_MANUAL_ADJUST: '✅ 確認調整',
    ADD_POINTS: '+ 加點',
    DEDUCT_POINTS: '- 扣點',
    MESSAGE_SEARCH: '@查詢留言',
    CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認發布',
    CANCEL_ADD_ANNOUNCEMENT: '❌ 取消發布',
    CONFIRM_DELETE_ANNOUNCEMENT: '✅ 確認刪除',
    ABANDON_DELETE_ANNOUNCEMENT: '❌ 放棄刪除',
    CONFIRM_BATCH_CANCEL: '✅ 確認批次取消',
    CANCEL_FLOW: '❌ 放棄操作',
    CONFIRM_SINGLE_CANCEL: '✅ 確認取消單堂'
  },
  STUDENT: {
    POINTS: '@點數管理',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CONTACT_US: '@聯絡我們',
    LATEST_ANNOUNCEMENT: '@最新公告',
    SHOP: '@活動商城',
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
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        image_url TEXT,
        status VARCHAR(50) DEFAULT 'available', -- 'available' 或 'unavailable'
        creator_id VARCHAR(255) NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ 已檢查/建立 products 表格');
    
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

    const createdAtCol = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='created_at'");
    if (createdAtCol.rows.length === 0) {
        await pgPool.query('ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()');
        console.log('✅ 已成功為 announcements 表新增 created_at 欄位。');
    }

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

async function reply(replyToken, content, menu = null, callerInfo = 'Unknown') {
  console.log(`[DIAGNOSTIC] reply() called by: ${callerInfo}`);
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
  try { await client.replyMessage(replyToken, messages); } catch (error) { console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response.data : error.message); throw error; }
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
const pendingProductCreation = {};
const pendingCourseCancellation = {};
const repliedTokens = new Set();

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

function levenshtein(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
  for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator,
      );
    }
  }
  return matrix[b.length][a.length];
}

function findClosestCommand(userInput, role) {
  const upperCaseRole = role.toUpperCase();
  if (!COMMANDS[upperCaseRole]) return null;
  const commandList = Object.values(COMMANDS[upperCaseRole]);
  let bestMatch = null;
  let minDistance = Infinity;
  const threshold = Math.floor(userInput.length * 0.4);
  for (const command of commandList) {
    const distance = levenshtein(userInput, command);
    if (distance < minDistance && distance <= threshold) {
      minDistance = distance;
      bestMatch = command;
    }
  }
  return bestMatch;
}
async function handleAdminCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (pendingTeacherAddition[userId]) {
    const state = pendingTeacherAddition[userId];
    if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
      delete pendingTeacherAddition[userId];
      return reply(replyToken, '已取消授權操作。', null, 'handleAdminCommands - cancel add teacher');
    }
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }], 'handleAdminCommands - student not found');
        } else if (studentRes.rows.length === 1) {
          state.targetUser = studentRes.rows[0];
          state.step = 'await_confirmation';
          return reply(replyToken, `您確定要授權學員「${state.targetUser.name}」成為老師嗎？`, [
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }
          ], 'handleAdminCommands - confirm add teacher');
        } else {
          return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }], 'handleAdminCommands - multiple students found');
        }
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'teacher';
          targetUser.approved_by = userId;
          await saveUser(targetUser);
          delete pendingTeacherAddition[userId];
          await reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`, null, 'handleAdminCommands - add teacher success');
          push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。', null, 'handleAdminCommands - invalid confirmation for add');
        }
    }
  } else if (pendingTeacherRemoval[userId]) {
    const state = pendingTeacherRemoval[userId];
    if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
      delete pendingTeacherRemoval[userId];
      return reply(replyToken, '已取消移除操作。', null, 'handleAdminCommands - cancel remove teacher');
    }
    switch (state.step) {
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          delete pendingTeacherRemoval[userId];
          await reply(replyToken, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`, null, 'handleAdminCommands - remove teacher success');
          push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。', null, 'handleAdminCommands - invalid confirmation for remove');
        }
    }
  } else {
    if (text === COMMANDS.ADMIN.PANEL) {
      const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
      return reply(replyToken, '請選擇管理者功能：', adminMenu, 'handleAdminCommands - admin panel');
    } else if (text === COMMANDS.ADMIN.ADD_TEACHER) {
      pendingTeacherAddition[userId] = { step: 'await_student_info' };
      setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => push(u, '授權老師操作逾時，自動取消。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }], 'handleAdminCommands - start add teacher');
    } else if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
      const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
      if (teacherRes.rows.length === 0) {
        return reply(replyToken, '目前沒有任何老師可供移除。', null, 'handleAdminCommands - no teachers to remove');
      }
      const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${t.name}` }}]} }));
      return reply(replyToken, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } }, null, 'handleAdminCommands - remove teacher list');
    } else if (text === COMMANDS.ADMIN.SIMULATE_STUDENT) {
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。', null, 'handleAdminCommands - simulate student');
    } else if (text === COMMANDS.ADMIN.SIMULATE_TEACHER) {
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。', null, 'handleAdminCommands - simulate teacher');
    }
  }
}
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (await handlePurchaseFlow(event, userId)) {
    return;
  }
  
  if (pendingBookingConfirmation[userId]) {
    const state = pendingBookingConfirmation[userId];
    const course = await getCourse(state.courseId);
    if (!course) {
        delete pendingBookingConfirmation[userId];
        return reply(replyToken, '抱歉，找不到該課程，可能已被老師取消。', null, 'handleStudentCommands - course not found in booking flow');
    }

    switch (state.type) {
        case 'book':
            if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    const userForUpdate = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdate = await client.query('SELECT students, capacity FROM courses WHERE id = $1 FOR UPDATE', [state.courseId]);
                    
                    if (userForUpdate.rows[0].points < course.pointsCost) {
                        await client.query('ROLLBACK');
                        delete pendingBookingConfirmation[userId];
                        return reply(replyToken, `預約失敗，您的點數不足！\n目前點數：${userForUpdate.rows[0].points}\n需要點數：${course.pointsCost}`, null, 'handleStudentCommands - booking failed, insufficient points');
                    }
                    if (courseForUpdate.rows[0].students.length >= courseForUpdate.rows[0].capacity) {
                        await client.query('ROLLBACK');
                        delete pendingBookingConfirmation[userId];
                        return reply(replyToken, '抱歉，課程名額已滿，已被其他同學搶先預約了。', null, 'handleStudentCommands - booking failed, capacity full');
                    }

                    const newPoints = userForUpdate.rows[0].points - course.pointsCost;
                    const newStudents = [...courseForUpdate.rows[0].students, userId];
                    const historyEntry = { action: `預約課程：${course.title}`, pointsChange: -course.pointsCost, time: new Date().toISOString() };
                    const newHistory = user.history ? [...user.history, historyEntry] : [historyEntry];

                    await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                    await client.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, state.courseId]);
                    await client.query('COMMIT');

                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, `✅ 預約成功！\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n已為您扣除 ${course.pointsCost} 點，期待課堂上見！`, null, 'handleStudentCommands - booking success');
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error('預約課程失敗:', e);
                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, '預約時發生錯誤，請稍後再試。', null, 'handleStudentCommands - booking failed, db error');
                } finally {
                    client.release();
                }
            } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) {
                delete pendingBookingConfirmation[userId];
                return reply(replyToken, '已放棄預約。', null, 'handleStudentCommands - abandon booking');
            }
            break;
        
        case 'cancel_book':
            if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    
                    const userForUpdateRes = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdateRes = await client.query('SELECT students, waiting FROM courses WHERE id = $1 FOR UPDATE', [state.courseId]);
                    
                    const newPoints = userForUpdateRes.rows[0].points + course.pointsCost;
                    const newStudents = courseForUpdateRes.rows[0].students.filter(id => id !== userId);
                    const historyEntry = { action: `取消預約：${course.title}`, pointsChange: +course.pointsCost, time: new Date().toISOString() };
                    const userHistory = userForUpdateRes.rows[0].history || [];
                    const newHistory = [...userHistory, historyEntry];

                    await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                    
                    let newWaiting = courseForUpdateRes.rows[0].waiting;
                    if (newWaiting.length > 0) {
                        const promotedUserId = newWaiting.shift();
                        newStudents.push(promotedUserId);
                        
                        const promotedUser = await getUser(promotedUserId, client);
                        if (promotedUser) {
                             push(promotedUserId, `🎉 候補成功通知 🎉\n您候補的課程「${course.title}」已有空位，已為您自動預約成功！`).catch(err => console.error(err));
                        }
                    }
                    
                    await client.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [newStudents, newWaiting, state.courseId]);
                    await client.query('COMMIT');

                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, `✅ 已為您取消「${course.title}」的預約，並歸還 ${course.pointsCost} 點。`, null, 'handleStudentCommands - cancel booking success');
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error('取消預約失敗:', e);
                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, '取消預約時發生錯誤，請稍後再試。', null, 'handleStudentCommands - cancel booking failed, db error');
                } finally {
                    client.release();
                }
            } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) {
                delete pendingBookingConfirmation[userId];
                return reply(replyToken, '已放棄取消操作。', null, 'handleStudentCommands - abandon cancel booking');
            }
            break;

        case 'cancel_wait':
            if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
                const newWaitingList = course.waiting.filter(id => id !== userId);
                await saveCourse({ ...course, waiting: newWaitingList });
                delete pendingBookingConfirmation[userId];
                return reply(replyToken, `✅ 已為您取消「${course.title}」的候補。`, null, 'handleStudentCommands - cancel waiting success');
            } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) {
                delete pendingBookingConfirmation[userId];
                return reply(replyToken, '已放棄取消操作。', null, 'handleStudentCommands - abandon cancel waiting');
            }
            break;
    }
  } else if (pendingFeedback[userId]) {
    const feedbackState = pendingFeedback[userId];
    if (text.toLowerCase() === '取消') {
      delete pendingFeedback[userId];
      return reply(replyToken, '已取消留言。', null, 'handleStudentCommands - cancel feedback');
    }
    if (feedbackState.step === 'await_message') {
      await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text]);
      delete pendingFeedback[userId];
      await reply(replyToken, '感謝您的留言，我們已收到您的訊息，老師會盡快查看！', null, 'handleStudentCommands - feedback success');
      if (TEACHER_ID) { push(TEACHER_ID, `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`).catch(e => console.error(e)); }
    }
  } else {
    if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
        try {
            const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
            if (res.rows.length === 0) { return reply(replyToken, '目前沒有任何公告。', null, 'handleStudentCommands - no announcements'); }
            const announcement = res.rows[0];
            const announcementMessage = { type: 'flex', altText: '最新公告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } };
            return reply(replyToken, announcementMessage, null, 'handleStudentCommands - latest announcement');
        } catch (err) {
            console.error('❌ 查詢最新公告時發生錯誤:', err);
            return reply(replyToken, '查詢公告時發生錯誤，請稍後再試。', null, 'handleStudentCommands - latest announcement error');
        }
    } else if (text === COMMANDS.STUDENT.CONTACT_US) {
      pendingFeedback[userId] = { step: 'await_message' };
      setupConversationTimeout(userId, pendingFeedback, 'pendingFeedback', (u) => push(u, '留言逾時，自動取消。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入您想對老師說的話，或點選「取消」。', [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }], 'handleStudentCommands - contact us');
    } else if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      if (pendingPurchase[userId]?.step !== 'input_last5' && pendingPurchase[userId]?.step !== 'edit_last5') delete pendingPurchase[userId];
      delete pendingBookingConfirmation[userId];
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, flexMenu, null, 'handleStudentCommands - points menu');
    } else if (text === COMMANDS.STUDENT.BUY_POINTS) {
        const existingOrderRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
        if (existingOrderRes.rows.length > 0) {
            const flexMenu = await buildPointsMenuFlex(userId);
            return reply(replyToken, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu], null, 'handleStudentCommands - buy points, pending order exists');
        }
        pendingPurchase[userId] = { step: 'select_plan', data: {} };
        setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。').catch(e => console.error(e)));
        return reply(replyToken, buildBuyPointsFlex(), null, 'handleStudentCommands - buy points');
    } else if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
        try {
            const res = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10`, [userId]);
            if (res.rows.length === 0) {
                return reply(replyToken, '您沒有任何購點紀錄。', null, 'handleStudentCommands - no purchase history');
            }
            const historyBubbles = res.rows.map(order => {
                let statusText, statusColor;
                switch (order.status) {
                    case 'completed': statusText = '✅ 已完成'; statusColor = '#52b69a'; break;
                    case 'pending_confirmation': statusText = '🕒 等待確認'; statusColor = '#ff9e00'; break;
                    case 'pending_payment': statusText = '❗ 等待付款'; statusColor = '#f28482'; break;
                    case 'rejected': statusText = '❌ 已退回'; statusColor = '#d90429'; break;
                    default: statusText = '未知狀態'; statusColor = '#6c757d';
                }
                return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: statusText, color: '#ffffff', weight: 'bold' }], backgroundColor: statusColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `購買 ${order.points} 點`, weight: 'bold', size: 'lg' }, { type: 'text', text: `金額: ${order.amount} 元`, size: 'sm' }, { type: 'text', text: `後五碼: ${order.last_5_digits || 'N/A'}`, size: 'sm' }, { type: 'text', text: `訂單ID: ${order.order_id}`, size: 'xxs', color: '#aaaaaa', wrap: true }, { type: 'text', text: `時間: ${formatDateTime(order.timestamp)}`, size: 'xs', color: '#aaaaaa' } ] } };
            });
            return reply(replyToken, [{ type: 'text', text: '以下是您近期的購點紀錄：' }, { type: 'flex', altText: '購點紀錄', contents: { type: 'carousel', contents: historyBubbles } }], null, 'handleStudentCommands - purchase history');
        } catch(err) {
            console.error('❌ 查詢購點紀錄失敗:', err);
            return reply(replyToken, '查詢購點紀錄時發生錯誤。', null, 'handleStudentCommands - purchase history error');
        }
    } else if (text === COMMANDS.STUDENT.BOOK_COURSE) {
        try {
            const allCourses = Object.values(await getAllCourses());
            const now = Date.now();
            const sevenDaysLater = now + (7 * ONE_DAY_IN_MS);

            const availableCourses = allCourses.filter(c => {
                const courseTime = new Date(c.time).getTime();
                return courseTime > now && 
                       courseTime < sevenDaysLater &&
                       c.students.length < c.capacity && 
                       !c.students.includes(userId) && 
                       !c.waiting.includes(userId);
            });
            
            if (availableCourses.length === 0) {
                return reply(replyToken, '抱歉，未來 7 天內沒有可預約的課程。\n您可至「我的課程」查看候補中的課程，或等候老師發布新課程。', null, 'handleStudentCommands - no bookable courses');
            }
            
            availableCourses.sort((a, b) => new Date(a.time) - new Date(b.time));

            const courseItems = availableCourses.slice(0, 10).map(c => {
                const remainingSpots = c.capacity - c.students.length;
                return {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                {
                                    type: 'text',
                                    text: c.title,
                                    weight: 'bold',
                                    size: 'md',
                                    wrap: true,
                                    flex: 3
                                },
                                {
                                    type: 'text',
                                    text: `${c.pointsCost} 點`,
                                    color: '#1A759F',
                                    weight: 'bold',
                                    size: 'md',
                                    align: 'end',
                                    flex: 1
                                }
                            ]
                        },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                              {
                                  type: 'text',
                                  text: formatDateTime(c.time),
                                  size: 'sm',
                                  color: '#666666',
                                  flex: 2
                              },
                              {
                                  type: 'text',
                                  text: `剩餘 ${remainingSpots} 名`,
                                  size: 'sm',
                                  color: '#666666',
                                  align: 'end',
                                  flex: 1
                              }
                            ]
                        },
                        {
                            type: 'button',
                            style: 'primary',
                            height: 'sm',
                            action: {
                                type: 'postback',
                                label: '預約此課程',
                                data: `action=confirm_booking_start&courseId=${c.id}`
                            },
                            margin: 'md'
                        }
                    ]
                };
            });
            
            const courseListWithSeparators = [];
            courseItems.forEach((item, index) => {
                courseListWithSeparators.push(item);
                if (index < courseItems.length - 1) {
                    courseListWithSeparators.push({ type: 'separator', margin: 'lg' });
                }
            });

            const flexMessage = {
                type: 'flex',
                altText: '可預約的課程列表',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            {
                                type: 'text',
                                text: '7日內可預約課程',
                                color: '#ffffff',
                                weight: 'bold',
                                size: 'lg'
                            }
                        ],
                        backgroundColor: '#52b69a',
                        paddingAll: 'lg'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: courseListWithSeparators
                    }
                }
            };

            return reply(replyToken, flexMessage, null, 'handleStudentCommands - book course list');
            
        } catch(err) {
            console.error('❌ 查詢可預約課程失敗:', err);
            return reply(replyToken, '查詢課程時發生錯誤，請稍後再試。', null, 'handleStudentCommands - book course list error');
        }
    } else if (text === COMMANDS.STUDENT.MY_COURSES) {
        try {
            const allCourses = Object.values(await getAllCourses());
            const now = Date.now();
            const myCourses = allCourses.filter(c => new Date(c.time).getTime() > now && (c.students.includes(userId) || c.waiting.includes(userId)));
            
            if (myCourses.length === 0) {
                return reply(replyToken, '您目前沒有任何已預約或候補中的課程。', null, 'handleStudentCommands - no courses');
            }
            
            myCourses.sort((a, b) => new Date(a.time) - new Date(b.time));

            const courseItems = myCourses.slice(0, 10).map(c => {
                const isBooked = c.students.includes(userId);
                const courseMainTitle = c.title.replace(/ - 第 \d+ 堂$/, '');
                const actionLabel = isBooked ? '取消預約' : '取消候補';
                const postbackAction = isBooked ? 'confirm_cancel_booking_start' : 'confirm_cancel_waiting_start';
                
                const statusBoxContents = [];
                statusBoxContents.push({
                    type: 'text',
                    text: isBooked ? '✅ 已預約' : '🕒 候補中',
                    weight: 'bold',
                    size: 'sm',
                    color: isBooked ? '#1a759f' : '#ff9e00'
                });

                if (!isBooked) {
                    statusBoxContents.push({
                        type: 'text',
                        text: `候補順位: 第 ${c.waiting.indexOf(userId) + 1} 位`,
                        size: 'sm',
                        color: '#666666',
                        align: 'end'
                    });
                }

                return {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: statusBoxContents
                        },
                        { type: 'text', text: courseMainTitle, weight: 'bold', size: 'md', wrap: true, margin: 'md' },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666' },
                        {
                            type: 'button',
                            style: 'primary',
                            color: '#DE5246',
                            height: 'sm',
                            action: { 
                                type: 'postback', 
                                label: actionLabel, 
                                data: `action=${postbackAction}&courseId=${c.id}` 
                            },
                            margin: 'md'
                        }
                    ]
                };
            });

            const courseListWithSeparators = [];
            courseItems.forEach((item, index) => {
                courseListWithSeparators.push(item);
                if (index < courseItems.length - 1) {
                    courseListWithSeparators.push({ type: 'separator', margin: 'lg' });
                }
            });

            const flexMessage = {
                type: 'flex',
                altText: '我的課程列表',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: '我的課程', color: '#ffffff', weight: 'bold', size: 'lg' }],
                        backgroundColor: '#1a759f',
                        paddingAll: 'lg'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: courseListWithSeparators
                    }
                }
            };

            return reply(replyToken, flexMessage, null, 'handleStudentCommands - my courses list');

        } catch(err) {
            console.error('❌ 查詢我的課程失敗:', err);
            return reply(replyToken, '查詢課程時發生錯誤，請稍後再試。', null, 'handleStudentCommands - my courses list error');
        }
    } else if (text === COMMANDS.STUDENT.SHOP) {
        try {
            const productsRes = await pgPool.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC");
            if (productsRes.rows.length === 0) {
                return reply(replyToken, '目前商城沒有任何商品，敬請期待！', null, 'handleStudentCommands - shop is empty');
            }
            const productBubbles = productsRes.rows.map(p => ({ type: 'bubble', hero: p.image_url ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } : undefined, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: p.name, weight: 'bold', size: 'xl' }, { type: 'text', text: `${p.price} 點`, size: 'lg', margin: 'md', color: '#1A759F', weight: 'bold' }, { type: 'text', text: p.description, wrap: true, size: 'sm', margin: 'md' }, ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'secondary', action: { type: 'uri', label: '聯絡老師詢問', uri: `https://line.me/R/ti/p/${TEACHER_ID}` } } ]} }));
            return reply(replyToken, { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles.slice(0, 10) } }, null, 'handleStudentCommands - shop list');
        } catch (err) {
            console.error('❌ 查詢商城商品失敗:', err);
            return reply(replyToken, '查詢商城時發生錯誤，請稍後再試。', null, 'handleStudentCommands - shop list error');
        }
    } else if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
      return reply(replyToken, '請點擊「點數管理」選單中對應的按鈕來輸入或修改後五碼。', null, 'handleStudentCommands - last 5 trigger text');
    } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
      const purchaseState = pendingPurchase[userId];
      if (purchaseState) {
          if (purchaseState.step === 'confirm_purchase' || purchaseState.step === 'select_plan') {
              delete pendingPurchase[userId];
              const flexMenu = await buildPointsMenuFlex(userId);
              return reply(replyToken, [{type: 'text', text: '已取消購買，返回點數管理主選單。'}, flexMenu], null, 'handleStudentCommands - cancel purchase in progress');
          }
      }
      const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
      const pendingOrder = ordersRes.rows[0];
      if (pendingOrder) {
          if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。', null, 'handleStudentCommands - cannot cancel confirmed order'); }
          if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
              await deleteOrder(pendingOrder.order_id);
              delete pendingPurchase[userId]; 
              const flexMenu = await buildPointsMenuFlex(userId);
              return reply(replyToken, [{type: 'text', text: '已取消您的購點訂單。'}, flexMenu], null, 'handleStudentCommands - cancelled pending order');
          }
      }
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, [{type: 'text', text: '您沒有待處理的購點流程，已返回點數管理主選單。'}, flexMenu], null, 'handleStudentCommands - no pending purchase to cancel');
    } else {
      let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
      if (text.startsWith('@')) {
          const closestCommand = findClosestCommand(text, 'student');
          if (closestCommand) {
              studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
          } else {
              studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`;
          }
      }
      return reply(replyToken, studentSuggestion, null, 'handleStudentCommands - unknown command');
    }
  }
}

async function checkAndSendReminders() {
    const now = Date.now();
    const reminderWindowStart = new Date(now + ONE_HOUR_IN_MS - (1000 * 60 * 5)); 
    const reminderWindowEnd = new Date(now + ONE_HOUR_IN_MS);

    try {
        const res = await pgPool.query(`SELECT * FROM courses WHERE time BETWEEN $1 AND $2`, [reminderWindowStart, reminderWindowEnd]);
        const upcomingCourses = res.rows;

        for (const course of upcomingCourses) {
            if (!sentReminders[course.id]) {
                const reminderMsg = `🔔 課程提醒：\n您的課程「${course.title}」即將在約一小時後 (${formatDateTime(course.time)}) 開始，請準備上課！`;
                for (const studentId of course.students) {
                    await push(studentId, reminderMsg);
                }
                sentReminders[course.id] = true; 
            }
        }
    } catch (err) {
        console.error("❌ 檢查課程提醒時發生錯誤:", err);
    }
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

app.post('/webhook', (req, res) => {
  const signature = crypto.createHmac('SHA256', config.channelSecret).update(req.rawBody).digest('base64');
  if (req.headers['x-line-signature'] !== signature) {
    return res.status(401).send('Unauthorized');
  }
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => { console.error('❌ Webhook 處理失敗:', err.stack); res.status(500).end(); });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V13.3-diag`);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => { if(SELF_URL.startsWith('https')) fetch(SELF_URL).catch(err => console.error("Ping self failed:", err.message)); }, PING_INTERVAL_MS);
});

async function handleEvent(event) {
    if (!event.replyToken) return;
    
    const token = event.replyToken;
    if (repliedTokens.has(token)) {
      console.log('🔄️ 偵測到重複的 Webhook 事件，已忽略。');
      return;
    }
    repliedTokens.add(token);
    setTimeout(() => repliedTokens.delete(token), 60000);

    const userId = event.source.userId;
    let user = await getUser(userId);
    
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl };
            await saveUser(user);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (error) {
            console.error(`創建新用戶時出錯: `, error);
            return;
        }
    } else {
        try {
            const profile = await client.getProfile(userId);
            if (profile.displayName !== user.name || (profile.pictureUrl && profile.pictureUrl !== user.picture_url)) {
                user.name = profile.displayName;
                user.pictureUrl = profile.pictureUrl;
                await saveUser(user);
            }
        } catch(e) {
            console.error(`更新用戶 ${userId} 資料時出錯:`, e.message);
        }
    }

    if (user.role === 'student') {
      const annRes = await pgPool.query('SELECT id FROM announcements ORDER BY created_at DESC LIMIT 1');
      if (annRes.rows.length > 0 && annRes.rows[0].id > (user.last_seen_announcement_id || 0)) {
        // New announcement logic can be placed here if needed
      }
    }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
              user.role = 'admin';
              await saveUser(user);
              if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
            }
            return handleAdminCommands(event, userId);
        }

        switch(user.role) {
            case 'admin':
                await handleAdminCommands(event, userId);
                break;
            case 'teacher':
                await handleTeacherCommands(event, userId);
                break;
            default:
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
                if (user.role === 'admin') await handleAdminCommands(simulatedEvent, userId);
                else if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, userId);
                else await handleStudentCommands(simulatedEvent, userId);
            }
            return;
        }
        
        if (user.role === 'admin') {
            if (action === 'select_teacher_for_removal') { /* ... */ }
        }
        
        if (user.role === 'teacher') {
          if (action === 'add_course_start') {
              pendingCourseCreation[userId] = { step: 'await_title' };
              setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。').catch(e => console.error(e)));
              const newPrompt = '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。';
              const cancelMenu = [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }];
              return reply(replyToken, newPrompt, cancelMenu, 'handleEvent - postback - add_course_start');
          }
          if (action === 'set_course_weekday') {
              const state = pendingCourseCreation[userId];
              if (state && state.step === 'await_weekday') {
                  const day = parseInt(data.get('day'), 10);
                  const dayLabel = WEEKDAYS.find(d => d.value === day).label;
                  state.weekday = day;
                  state.weekday_label = dayLabel;
                  state.step = 'await_time';
                  return reply(replyToken, `已選擇 ${dayLabel}，請問上課時間是？（請輸入四位數時間，例如：19:30）`, null, 'handleEvent - postback - set_course_weekday');
              }
          }
          if (action === 'manage_course_group') {
              const prefix = data.get('prefix');
              const coursesRes = await pgPool.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC", [`${prefix}%`]);
              if (coursesRes.rows.length === 0) {
                return reply(replyToken, "此系列沒有可取消的未來課程。", null, 'handleEvent - postback - manage_course_group (no courses)');
              }
              const courseBubbles = coursesRes.rows.map(c => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: c.title, wrap: true, weight: 'bold' }, { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'md'} ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂課', data: `action=confirm_single_course_cancel&courseId=${c.id}` } }] } }));
              return reply(replyToken, { type: 'flex', altText: '請選擇要單次取消的課程', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }, null, 'handleEvent - postback - manage_course_group');
          }
           if (action === 'cancel_course_group_confirm') {
                const prefix = data.get('prefix');
                const courseRes = await pgPool.query("SELECT title FROM courses WHERE id LIKE $1 LIMIT 1", [`${prefix}%`]);
                if (courseRes.rows.length === 0) return reply(replyToken, "找不到課程系列。", null, 'handleEvent - postback - cancel_course_group_confirm (not found)');
                const courseMainTitle = courseRes.rows[0].title.replace(/ - 第 \d+ 堂$/, '');

                pendingCourseCancellation[userId] = { type: 'batch', prefix: prefix };
                setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時。').catch(e => console.error(e)));
                const message = `您確定要批次取消【${courseMainTitle}】所有未來的課程嗎？\n\n此動作無法復原，並會將點數退還給所有已預約的學員。`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL, text: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_FLOW, text: COMMANDS.TEACHER.CANCEL_FLOW } }
                ], 'handleEvent - postback - cancel_course_group_confirm');
            }
            if (action === 'confirm_single_course_cancel') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) return reply(replyToken, "找不到該課程。", null, 'handleEvent - postback - confirm_single_course_cancel (not found)');

                pendingCourseCancellation[userId] = { type: 'single', courseId: course.id };
                setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時。').catch(e => console.error(e)));

                const message = `您確定要取消單堂課程「${course.title}」嗎？\n(${formatDateTime(course.time)})\n\n將會退點給所有已預約的學員。`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL, text: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_FLOW, text: COMMANDS.TEACHER.CANCEL_FLOW } }
                ], 'handleEvent - postback - confirm_single_course_cancel');
            }
          if (action === 'select_student_for_adjust') { /* ... */ }
          if (action === 'mark_feedback_read') { /* ... */ }
          if (action === 'reply_feedback') { /* ... */ }
        } 
        
        if (user.role === 'student') {
            if (action === 'select_purchase_plan') {
                const planPoints = parseInt(data.get('plan'), 10);
                const selectedPlan = PURCHASE_PLANS.find(p => p.points === planPoints);
                if (selectedPlan) {
                    pendingPurchase[userId] = {
                        step: 'confirm_purchase',
                        data: {
                            points: selectedPlan.points,
                            amount: selectedPlan.amount,
                        }
                    };
                    return reply(replyToken, `您選擇了「${selectedPlan.label}」。\n請確認是否購買？`, [
                        { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } },
                        { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
                    ], 'handleEvent - postback - select_purchase_plan');
                }
            }
            if (action === 'confirm_booking_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。', null, 'handleEvent - postback - confirm_booking_start (not found)'); }
                pendingBookingConfirmation[userId] = { type: 'book', courseId: courseId };
                const message = `您確定要預約以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost} 點\n\n預約後將立即扣點，確認嗎？`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING } }
                ], 'handleEvent - postback - confirm_booking_start');
            }
            if (action === 'confirm_cancel_booking_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。', null, 'handleEvent - postback - confirm_cancel_booking_start (not found)'); }
                pendingBookingConfirmation[userId] = { type: 'cancel_book', courseId: courseId };
                const message = `您確定要取消預約以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n取消後將歸還 ${course.pointsCost} 點，確認嗎？`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING, text: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING } }
                ], 'handleEvent - postback - confirm_cancel_booking_start');
            }
            if (action === 'confirm_cancel_waiting_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。', null, 'handleEvent - postback - confirm_cancel_waiting_start (not found)'); }
                pendingBookingConfirmation[userId] = { type: 'cancel_wait', courseId: courseId };
                const message = `您確定要取消候補以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING, text: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING } }
                ], 'handleEvent - postback - confirm_cancel_waiting_start');
            }
        }
    }
}
