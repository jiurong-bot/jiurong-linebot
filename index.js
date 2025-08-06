// index.js - V15.8 (修復 reply 函式重複宣告問題)
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
  bankName: '中國信托 (822)',
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
  const client = await pgPool.connect();
  try {
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    
    await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255))`);
    await client.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await client.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    await client.query(`
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
    
    const lastSeenIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_seen_announcement_id'");
    if (lastSeenIdCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN last_seen_announcement_id INTEGER DEFAULT 0');
        console.log('✅ 已成功為 users 表新增 last_seen_announcement_id 欄位。');
    }
    const pictureUrlCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='picture_url'");
    if (pictureUrlCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN picture_url TEXT');
        console.log('✅ 已成功為 users 表新增 picture_url 欄位。');
    }
    const approvedByCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='approved_by'");
    if (approvedByCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN approved_by VARCHAR(255)');
        console.log('✅ 已成功為 users 表新增 approved_by 欄位。');
    }

    const creatorIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_id'");
    if (creatorIdCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN creator_id VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
        console.log('✅ 已成功為 announcements 表新增 creator_id 欄位。');
    }
    const creatorNameCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_name'");
    if (creatorNameCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN creator_name VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
        console.log('✅ 已成功為 announcements 表新增 creator_name 欄位。');
    }

    const createdAtCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='created_at'");
    if (createdAtCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()');
        console.log('✅ 已成功為 announcements 表新增 created_at 欄位。');
    }

    await cleanCoursesDB(client);
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}
async function generateUniqueCoursePrefix(dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        let prefix, isUnique = false;
        while (!isUnique) {
            const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            prefix = `${randomChar1}${randomChar2}`;
            const res = await client.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
            if (res.rows.length === 0) isUnique = true;
        }
        return prefix;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function getUser(userId, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const userData = res.rows[0];
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        return userData;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function saveUser(user, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const historyJson = JSON.stringify(user.history || []);
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.pictureUrl || null, user.approved_by || null]
        );
    } catch (err) {
        console.error(`FATAL ERROR: saveUser 函式捕獲到錯誤!`, { message: err.message, stack: err.stack, userId: user.id });
        throw err;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function getCourse(courseId, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        return { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function saveCourse(course, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        await client.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7`,
            [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]
        );
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function deleteCourse(courseId, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const coursesToDeleteRes = await client.query('SELECT id, title, time, points_cost, students, waiting FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        const coursesToDelete = coursesToDeleteRes.rows.map(row => ({
            id: row.id, title: row.title, time: row.time.toISOString(), pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || []
        }));
        if (coursesToDelete.length > 0) {
            await client.query('DELETE FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        }
        return coursesToDelete;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function saveOrder(order, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        await client.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
            [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]
        );
    } catch (err) {
        console.error('❌ saveOrder 函式錯誤:', err.message, 'Order ID:', order.orderId);
        throw err;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function deleteOrder(orderId, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
      await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}
async function cleanCoursesDB(dbClient) {
  const shouldReleaseClient = !dbClient;
  const client = dbClient || await pgPool.connect();
  try {
    const now = Date.now();
    await client.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  } finally {
    if (shouldReleaseClient && client) client.release();
  }
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
async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return false;

    if (text === COMMANDS.STUDENT.CANCEL_PURCHASE || text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
        delete pendingPurchase[userId];
        const flexMenu = await buildPointsMenuFlex(userId);
        await reply(event.replyToken, [{type: 'text', text: '已取消購買流程。'}, flexMenu]);
        return true;
    }

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                const orderId = `PO${Date.now()}`;
                const order = {
                    orderId: orderId,
                    userId: userId,
                    userName: user.name,
                    points: purchaseState.data.points,
                    amount: purchaseState.data.amount,
                    last5Digits: null,
                    status: 'pending_payment',
                    timestamp: new Date().toISOString()
                };
                await saveOrder(order);
                purchaseState.step = 'input_last5';
                purchaseState.data.orderId = orderId;

                const replyText = `感謝您的購買！\n訂單已成立 (ID: ${orderId})。\n\n請匯款至以下帳戶：\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請直接於此對話框輸入您的「匯款帳號後五碼」以供核對。`;
                await reply(event.replyToken, replyText, [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }]);
            } else {
                await reply(event.replyToken, '請點擊「✅ 確認購買」或「❌ 取消購買」。');
            }
            return true;

        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const orderId = purchaseState.data.orderId;
                const orderRes = await pgPool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
                if (orderRes.rows.length > 0) {
                    const order = orderRes.rows[0];
                    order.last_5_digits = text;
                    order.status = 'pending_confirmation';
                    order.timestamp = new Date().toISOString();
                    await saveOrder({
                        orderId: order.order_id,
                        userId: order.user_id,
                        userName: order.user_name,
                        points: order.points,
                        amount: order.amount,
                        last5Digits: order.last_5_digits,
                        status: order.status,
                        timestamp: order.timestamp
                    });

                    delete pendingPurchase[userId];
                    const flexMenu = await buildPointsMenuFlex(userId);
                    await reply(event.replyToken, [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu]);
                    if (TEACHER_ID) {
                        push(TEACHER_ID, `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${orderId}\n後五碼: ${text}\n請至「點數管理」->「待確認清單」審核。`).catch(e => console.error(e));
                    }
                } else {
                    delete pendingPurchase[userId];
                    await reply(event.replyToken, '找不到您的訂單，請重新操作。');
                }
            } else {
                await reply(event.replyToken, '格式錯誤，請輸入5位數字的匯款帳號後五碼。', [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }]);
            }
            return true;
    }
    return false;
}

async function handleAdminCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

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
          return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        }
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'teacher';
          targetUser.approved_by = userId;
          await saveUser(targetUser);
          delete pendingTeacherAddition[userId];
          await reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`);
          push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
  } else if (pendingTeacherRemoval[userId]) {
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
          await reply(replyToken, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
          push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
  } else {
    if (text === COMMANDS.ADMIN.PANEL) {
      const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
      return reply(replyToken, '請選擇管理者功能：', adminMenu);
    } else if (text === COMMANDS.ADMIN.ADD_TEACHER) {
      pendingTeacherAddition[userId] = { step: 'await_student_info' };
      setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => push(u, '授權老師操作逾時，自動取消。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
    } else if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
      const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
      if (teacherRes.rows.length === 0) {
        return reply(replyToken, '目前沒有任何老師可供移除。');
      }
      const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }}]} }));
      return reply(replyToken, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });
    } else if (text === COMMANDS.ADMIN.SIMULATE_STUDENT) {
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
    } else if (text === COMMANDS.ADMIN.SIMULATE_TEACHER) {
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
    }
  }
}

async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (pendingCourseCancellation[userId]) {
    const state = pendingCourseCancellation[userId];
    if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
      delete pendingCourseCancellation[userId];
      return reply(replyToken, '已放棄取消操作。');
    }
    switch(state.type) {
      case 'batch':
        if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
          
          const backgroundState = { ...state };
          delete pendingCourseCancellation[userId];

          reply(replyToken, '✅ 指令已收到，正在為您批次取消課程。\n完成後將會另行通知，請稍候...');

          (async () => {
            const client = await pgPool.connect();
            try {
              await client.query('BEGIN');
              const coursesToCancelRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${backgroundState.prefix}%`]);
              
              if (coursesToCancelRes.rows.length === 0) {
                await push(userId, `❌ 批次取消失敗：找不到可取消的「${backgroundState.prefix}」系列課程。`);
                return;
              }

              const coursesToCancel = coursesToCancelRes.rows;
              const affectedUsers = new Map();
              for (const course of coursesToCancel) {
                for (const studentId of course.students) {
                  if (!affectedUsers.has(studentId)) affectedUsers.set(studentId, 0);
                  affectedUsers.set(studentId, affectedUsers.get(studentId) + course.points_cost);
                }
              }
              
              for (const [studentId, refundAmount] of affectedUsers.entries()) {
                if (refundAmount > 0) {
                  await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [refundAmount, studentId]);
                }
              }

              const courseMainTitle = coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '');
              await client.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${backgroundState.prefix}%`]);
              await client.query('COMMIT');

              for (const [studentId, refundAmount] of affectedUsers.entries()) {
                push(studentId, `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。`).catch(e => console.error(e));
              }

              await push(userId, `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。`);
            } catch (e) {
              await client.query('ROLLBACK');
              console.error('[批次取消] 背景任務執行失敗:', e);
              await push(userId, `❌ 批次取消課程時發生嚴重錯誤，操作已復原。請聯繫管理員。\n錯誤: ${e.message}`);
            } finally {
              if(client) client.release();
            }
          })();

          return;
        }
        break;

      case 'single':
         if (text === COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
            const client = await pgPool.connect();
            try {
              await client.query('BEGIN');
              const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [state.courseId]);
              if (courseToCancelRes.rows.length === 0) {
                delete pendingCourseCancellation[userId];
                return reply(replyToken, "找不到該課程，可能已被取消。");
              }
              const course = courseToCancelRes.rows[0];

              for (const studentId of course.students) {
                 await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                 push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
              }
              
              await client.query("DELETE FROM courses WHERE id = $1", [state.courseId]);
              await client.query('COMMIT');

              delete pendingCourseCancellation[userId];
              return reply(replyToken, `✅ 已成功取消課程「${course.title}」。`);

            } catch (e) {
                await client.query('ROLLBACK');
                delete pendingCourseCancellation[userId];
                console.error('單堂取消課程失敗:', e);
                return reply(replyToken, '取消課程時發生錯誤，請稍後再試。');
            } finally {
              if(client) client.release();
            }
         }
        break;
    }
  } else if (pendingCourseCreation[userId]) {
    const state = pendingCourseCreation[userId];
    if (text.toLowerCase() === '取消') {
        delete pendingCourseCreation[userId];
        return reply(replyToken, '已取消新增課程。');
    }
    switch (state.step) {
        case 'await_title':
            state.title = text;
            state.step = 'await_weekday';
            const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
            return reply(replyToken, `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, weekdayButtons);
        case 'await_time':
            if (!/^\d{2}:\d{2}$/.test(text)) {
                return reply(replyToken, '時間格式不正確，請輸入四位數時間，例如：19:30');
            }
            state.time = text;
            state.step = 'await_sessions';
            return reply(replyToken, '請問這個系列總共要開設幾堂課？（請輸入數字）');
       case 'await_sessions':
            const sessions = parseInt(text, 10);
            if (isNaN(sessions) || sessions <= 0) {
                return reply(replyToken, '堂數必須是正整數，請重新輸入。');
            }
            state.sessions = sessions;
            state.step = 'await_capacity';
            return reply(replyToken, '請問每堂課的名額限制？（請輸入數字）');
        case 'await_capacity':
            const capacity = parseInt(text, 10);
            if (isNaN(capacity) || capacity <= 0) {
                return reply(replyToken, '名額必須是正整數，請重新輸入。');
            }
            state.capacity = capacity;
            state.step = 'await_points';
            return reply(replyToken, '請問每堂課需要消耗多少點數？（請輸入數字）');
        case 'await_points':
            const points = parseInt(text, 10);
            if (isNaN(points) || points < 0) {
                return reply(replyToken, '點數必須是正整數或 0，請重新輸入。');
            }
            state.pointsCost = points;
            state.step = 'await_confirmation';
            const firstDate = getNextDate(state.weekday, state.time);
            const summary = `請確認課程資訊：\n\n標題：${state.title}\n時間：每${state.weekday_label} ${state.time}\n堂數：${state.sessions} 堂\n名額：${state.capacity} 位\n費用：${state.pointsCost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
            return reply(replyToken, summary, [
                { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } },
                { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } }
            ]);
        case 'await_confirmation':
            if (text === '✅ 確認新增') {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    const prefix = await generateUniqueCoursePrefix(client);
                    let currentDate = new Date();
                    for (let i = 0; i < state.sessions; i++) {
                        const courseDate = getNextDate(state.weekday, state.time, currentDate);
                        const course = {
                            id: `${prefix}${String(i + 1).padStart(2, '0')}`,
                            title: `${state.title} - 第 ${i + 1} 堂`,
                            time: courseDate.toISOString(),
                            capacity: state.capacity,
                            pointsCost: state.pointsCost,
                            students: [],
                            waiting: []
                        };
                        await saveCourse(course, client);
                        currentDate = new Date(courseDate.getTime() + ONE_DAY_IN_MS);
                    }
                    await client.query('COMMIT');
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, `✅ 成功新增「${state.title}」系列共 ${state.sessions} 堂課！`);
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error("新增課程系列失敗:", e);
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, '新增課程時發生錯誤，請稍後再試。');
                } finally {
                    if(client) client.release();
                }
            } else {
                return reply(replyToken, '請點擊「✅ 確認新增」或「❌ 放棄」。');
            }
    }
  } else if (pendingManualAdjust[userId]) {
    const state = pendingManualAdjust[userId];
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
      delete pendingManualAdjust[userId];
      return reply(replyToken, '已取消調整點數操作。');
    }
    switch (state.step) {
      case 'await_student_search':
        const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
        if (res.rows.length === 0) {
          return reply(replyToken, `找不到學員「${text}」。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
        }
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = res.rows.map(u => ({ 
            type: 'bubble', 
            body: { 
                type: 'box', 
                layout: 'horizontal', 
                spacing: 'md', 
                contents: [ 
                    { 
                        type: 'image', 
                        url: u.picture_url || placeholder_avatar, 
                        size: 'md', 
                        aspectRatio: '1:1', 
                        aspectMode: 'cover'
                    }, 
                    { 
                        type: 'box', 
                        layout: 'vertical',
                        flex: 3,
                        justifyContent: 'center', 
                        contents: [ 
                            { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' }
                        ] 
                    } 
                ] 
            }, 
            footer: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] 
            } 
        }));
        return reply(replyToken, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
      
      case 'await_operation':
        if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
          state.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
          state.step = 'await_amount';
          return reply(replyToken, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`);
        } else {
          return reply(replyToken, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
        }

      case 'await_amount':
        const amount = parseInt(text, 10);
        if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數格式不正確，請輸入一個大於 0 的正整數。'); }
        state.amount = amount;
        state.step = 'await_reason';
        return reply(replyToken, '請輸入調整原因（例如：活動獎勵、課程補償等）：');

      case 'await_reason':
        state.reason = text;
        state.step = 'await_confirmation';
        const opText = state.operation === 'add' ? `增加 ${state.amount} 點` : `扣除 ${state.amount} 點`;
        const summary = `請確認調整內容：\n\n對象：${state.targetStudent.name}\n操作：${opText}\n原因：${state.reason}`;
        return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ]);

      case 'await_confirmation':
        if (text === COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST) {
          const clientDB = await pgPool.connect();
          try {
            await clientDB.query('BEGIN');
            const studentRes = await clientDB.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [state.targetStudent.id]);
            const student = studentRes.rows[0];
            const newPoints = state.operation === 'add' ? student.points + state.amount : student.points - state.amount;
            if (newPoints < 0) {
              await clientDB.query('ROLLBACK');
              delete pendingManualAdjust[userId];
              return reply(replyToken, `操作失敗：學員 ${student.name} 的點數不足以扣除 ${state.amount} 點。`);
            }
            const historyEntry = { action: `手動調整：${state.operation === 'add' ? '+' : '-'}${state.amount}點`, reason: state.reason, time: new Date().toISOString(), operator: user.name };
            const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
            await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
            await clientDB.query('COMMIT');
            
            delete pendingManualAdjust[userId];
            await reply(replyToken, `✅ 已成功為學員 ${student.name} ${state.operation === 'add' ? '增加' : '扣除'} ${state.amount} 點。`);
            
            const opTextForStudent = state.operation === 'add' ? `增加了 ${state.amount}` : `扣除了 ${state.amount}`;
            push(student.id, `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${state.reason}\n您目前的點數為：${newPoints} 點。`).catch(e => console.error(e));
          } catch (e) {
            await clientDB.query('ROLLBACK');
            console.error('手動調整點數失敗:', e);
            delete pendingManualAdjust[userId];
            return reply(replyToken, '❌ 操作失敗，資料庫發生錯誤，請稍後再試。');
          } finally {
            if(clientDB) clientDB.release();
          }
        }
        break;
    }
  } else if (pendingStudentSearchQuery[userId]) {
    const searchQuery = text;
    delete pendingStudentSearchQuery[userId]; 
    
    try {
        const res = await pgPool.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${searchQuery.toLowerCase()}%`, searchQuery]);
        
        if (res.rows.length === 0) {
            return reply(replyToken, `找不到符合「${searchQuery}」的學員。`);
        }
        
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = res.rows.map(u => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'md',
                        contents: [
                            {
                                type: 'image',
                                url: u.picture_url || placeholder_avatar,
                                size: 'md',
                                aspectRatio: '1:1',
                                aspectMode: 'cover',
                                flex: 1
                            },
                            {
                                type: 'box',
                                layout: 'vertical',
                                flex: 3,
                                justifyContent: 'center',
                                contents: [
                                    { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
                                    { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        contents: [
                             { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: '查看詳細資料',
                        data: `action=view_student_details&studentId=${u.id}`
                    }
                }]
            }
        }));

        return reply(replyToken, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
    } catch (err) {
        console.error('❌ 查詢學員失敗:', err);
        return reply(replyToken, '查詢學員時發生錯誤，請稍後再試。');
    }
  } else if (pendingReply[userId]) {
    const state = pendingReply[userId];
    if (text.toLowerCase() === '取消') {
      delete pendingReply[userId];
      return reply(replyToken, '已取消回覆。');
    }
    const client = await pgPool.connect();
    try {
      await client.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, state.msgId]);
      const studentId = state.studentId;
      const originalMessage = state.originalMessage;
      delete pendingReply[userId];
      
      await push(studentId, `老師回覆了您的留言：\n\n【您的留言】\n${originalMessage}\n\n【老師的回覆】\n${text}`);
      return reply(replyToken, '✅ 已成功回覆學員的留言。');
    } catch (err) {
      console.error('❌ 回覆留言失敗:', err);
      delete pendingReply[userId];
      return reply(replyToken, '回覆留言時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
  } else if (pendingAnnouncementCreation[userId]) {
      const state = pendingAnnouncementCreation[userId];
      if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
          delete pendingAnnouncementCreation[userId];
          return reply(replyToken, '已取消發布公告。');
      }
      switch (state.step) {
          case 'await_content':
              state.content = text;
              state.step = 'await_confirmation';
              return reply(replyToken, `請確認公告內容：\n\n${text}\n\n是否確定要發布？`, [
                  { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                  { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
              ]);
          case 'await_confirmation':
              if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
                  const client = await pgPool.connect();
                  try {
                      await client.query('BEGIN');
                      const announcementRes = await client.query(
                          'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3) RETURNING id',
                          [state.content, userId, user.name]
                      );
                      const newAnnouncementId = announcementRes.rows[0].id;
                      const allUsersRes = await client.query(`SELECT id FROM users WHERE role = 'student'`);
                      
                      const pushMessages = allUsersRes.rows.map(student => ({
                        to: student.id,
                        messages: [{ type: 'text', text: `📣 新公告通知：\n\n${state.content}\n\n請點擊【最新公告】查閱完整內容。` }]
                      }));
                      
                      await client.query('COMMIT');
                      delete pendingAnnouncementCreation[userId];
                      
                      Promise.all(pushMessages.map(msg => push(msg.to, msg.messages))).catch(e => console.error("批量推播公告失敗:", e));
                      
                      return reply(replyToken, '✅ 公告已成功發布並推播給所有學員。');
                  } catch (e) {
                      await client.query('ROLLBACK');
                      console.error("發布公告失敗:", e);
                      delete pendingAnnouncementCreation[userId];
                      return reply(replyToken, '發布公告時發生錯誤，請稍後再試。');
                  } finally {
                      if(client) client.release();
                  }
              } else {
                  return reply(replyToken, '請點擊「✅ 確認發布」或「❌ 取消發布」。');
              }
      }
  } else if (pendingMessageSearchQuery[userId] || pendingProductCreation[userId]) {
    // Placeholder for not-yet-implemented conversation flows
    return;
  } else {
    // --- No pending conversation, handle new commands ---
    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
        try {
            const courseRes = await pgPool.query('SELECT * FROM courses WHERE time > NOW() ORDER BY time ASC');
            const upcomingCourses = courseRes.rows;
            
            const courseGroups = {};
            for (const course of upcomingCourses) {
                const prefix = course.id.substring(0, 2);
                if (!courseGroups[prefix]) { 
                    courseGroups[prefix] = {
                        prefix: prefix,
                        mainTitle: course.title.replace(/ - 第 \d+ 堂$/, ''),
                        earliestTime: course.time,
                        pointsCost: course.points_cost
                    };
                }
            }
            
            const courseBubbles = Object.values(courseGroups).map(group => ({
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                    { type: 'text', text: group.mainTitle, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: group.prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(group.earliestTime), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${group.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                ]},
                footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [
                    { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${group.prefix}` } },
                    { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${group.prefix}` } },
                ]},
            }));

            const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
            courseBubbles.push(addCourseBubble);
            
            const introText = (courseBubbles.length === 1) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
            return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
        } catch (err) {
            console.error('❌ 查詢課程管理時發生錯誤:', err);
            return reply(replyToken, '查詢課程資訊時發生錯誤，請稍後再試。');
        }
    } else if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const flexMessage = {
          type: 'flex',
          altText: '點數管理選單',
          contents: {
            type: 'carousel',
            contents: [
              {
                type: 'bubble',
                header: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '待確認清單',
                      color: '#FFFFFF',
                      weight: 'bold',
                      size: 'lg'
                    }
                  ],
                  backgroundColor: '#FF9E00'
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: '審核學員的購點申請，確認匯款資訊並為其加點。',
                      wrap: true,
                      size: 'sm',
                      color: '#666666'
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'button',
                      action: {
                        type: 'message',
                        label: '查看清單',
                        text: COMMANDS.TEACHER.PENDING_ORDERS
                      },
                      style: 'primary',
                      color: '#FF9E00'
                    }
                  ]
                }
              },
              {
                type: 'bubble',
                header: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '手動調整點數',
                      color: '#FFFFFF',
                      weight: 'bold',
                      size: 'lg'
                    }
                  ],
                  backgroundColor: '#1A759F'
                },
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: '用於特殊情況(如活動獎勵、課程補償)，直接為學員增減點數。',
                      wrap: true,
                      size: 'sm',
                      color: '#666666'
                    }
                  ]
                },
                footer: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'button',
                      action: {
                        type: 'message',
                        label: '開始調整',
                        text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS
                      },
                      style: 'primary',
                      color: '#1A759F'
                    }
                  ]
                }
              }
            ]
          }
        };
        return reply(replyToken, flexMessage);
    } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const flexMessage = {
            type: 'flex',
            altText: '學員管理選單',
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{
                        type: 'text',
                        text: '學員管理',
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'lg'
                    }],
                    backgroundColor: '#6A7D8B'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'lg',
                    contents: [
                        {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '查詢學員', weight: 'bold', size: 'md' },
                                { type: 'text', text: '依姓名或ID查詢學員的詳細資料與點數紀錄。', size: 'sm', color: '#666666', wrap: true, margin: 'md' },
                                { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '開始查詢', text: COMMANDS.TEACHER.SEARCH_STUDENT } }
                            ]
                        },
                        { type: 'separator' },
                        {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '查看留言', weight: 'bold', size: 'md' },
                                { type: 'text', text: '查看並回覆學員的留言。', size: 'sm', color: '#666666', wrap: true, margin: 'md' },
                                { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '查看未回覆留言', text: COMMANDS.TEACHER.VIEW_MESSAGES } }
                            ]
                        }
                    ]
                }
            }
        };
        return reply(replyToken, flexMessage);
    } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
        pendingManualAdjust[userId] = { step: 'await_student_search' };
        setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入您想調整點數的學員姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
    } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
        pendingStudentSearchQuery[userId] = {};
        const onTimeoutCallback = (u) => {
            if (pendingStudentSearchQuery[u]) {
                delete pendingStudentSearchQuery[u];
                push(u, '查詢學員逾時，自動取消。').catch(e => console.error(e));
            }
        };
        setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', onTimeoutCallback);
        return reply(replyToken, '請輸入您想查詢的學員姓名或 User ID：');
    } else if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
        const client = await pgPool.connect();
        try {
            const messagesRes = await client.query("SELECT * FROM feedback_messages WHERE status <> 'replied' ORDER BY timestamp DESC LIMIT 10");
            if (messagesRes.rows.length === 0) { return reply(replyToken, '目前沒有未回覆的學員留言。'); }
            const messageBubbles = messagesRes.rows.map(msg => { 
                const headerColor = msg.status === 'read' ? '#52b69a' : '#6a7d8b'; 
                const statusText = msg.status === 'read' ? '已讀' : '新留言';
                return { 
                    type: 'bubble', 
                    header: { 
                        type: 'box', 
                        layout: 'vertical', 
                        contents: [
                            { type: 'text', text: `來自 ${msg.user_name}`, color: '#ffffff', weight: 'bold' },
                            { type: 'text', text: statusText, color: '#ffffff', size: 'xxs', position: 'absolute', offsetTop: '4px', offsetEnd: '10px' }
                        ], 
                        backgroundColor: headerColor, 
                        paddingAll: 'lg' 
                    }, 
                    body: { 
                        type: 'box', 
                        layout: 'vertical', 
                        spacing: 'md', 
                        contents: [
                            { type: 'text', text: msg.message, wrap: true }, 
                            { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 'md' }
                        ] 
                    }, 
                    footer: { 
                        type: 'box', 
                        layout: 'vertical', 
                        spacing: 'sm', 
                        contents: [
                            ...(msg.status !== 'read' ? [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }] : []),
                            { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } }
                        ] 
                    } 
                }; 
            });
            return reply(replyToken, [{ type: 'text', text: '以下是尚未回覆的學員留言：' }, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } }]);
        } catch(err) {
            console.error('❌ 查詢留言時發生錯誤:', err);
            return reply(replyToken, '查詢留言時發生錯誤，請稍後再試。');
        } finally {
            if(client) client.release();
        }
    } else if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        const announcementMenu = [ { type: 'action', action: { type: 'message', label: '發布新公告', text: COMMANDS.TEACHER.ADD_ANNOUNCEMENT } }, { type: 'action', action: { type: 'message', label: '刪除舊公告', text: COMMANDS.TEACHER.DELETE_ANNOUNCEMENT } }, ];
        return reply(replyToken, '請選擇公告管理功能：', announcementMenu);
    } else if (text === COMMANDS.TEACHER.ADD_ANNOUNCEMENT) {
        pendingAnnouncementCreation[userId] = { step: 'await_content' };
        setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => push(u, '發布公告操作逾時，自動取消。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入您要發布的公告內容：', [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }]);
    } else if (text === COMMANDS.TEACHER.DELETE_ANNOUNCEMENT) {
        const client = await pgPool.connect();
        try {
            const announcementsRes = await client.query("SELECT id, content, created_at FROM announcements ORDER BY created_at DESC LIMIT 10");
            if (announcementsRes.rows.length === 0) {
                return reply(replyToken, "目前沒有任何公告。");
            }

            const announcementBubbles = announcementsRes.rows.map(ann => ({
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [ { type: 'text', text: '公告', color: '#ffffff', weight: 'bold', size: 'md' } ],
                    backgroundColor: '#DE5246'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: ann.content.substring(0, 50) + '...', wrap: true },
                        { type: 'text', text: `發布時間: ${formatDateTime(ann.created_at)}`, size: 'xs', color: '#aaaaaa' }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '選擇此公告並刪除', data: `action=confirm_delete_announcement&id=${ann.id}` } }
                    ]
                }
            }));
            return reply(replyToken, { type: 'flex', altText: '請選擇要刪除的公告', contents: { type: 'carousel', contents: announcementBubbles } });
        } catch (e) {
            console.error("查詢公告失敗:", e);
            return reply(replyToken, "查詢公告時發生錯誤。");
        } finally {
            if(client) client.release();
        }
    } else if (text === COMMANDS.TEACHER.SHOP_MANAGEMENT) {
        const shopMenu = [ { type: 'action', action: { type: 'message', label: '上架新商品', text: COMMANDS.TEACHER.ADD_PRODUCT } }, { type: 'action', action: { type: 'message', label: '查看/下架商品', text: COMMANDS.TEACHER.VIEW_PRODUCTS } }, ];
        return reply(replyToken, '請選擇商城管理功能：', shopMenu);
    } else if (text === COMMANDS.TEACHER.REPORT) {
        reply(replyToken, '📊 收到指令，正在為您生成營運報告，請稍候...');

        (async () => {
            const client = await pgPool.connect();
            try {
                const usersRes = await client.query(`SELECT * FROM users WHERE role = 'student'`);
                const coursesRes = await client.query(`SELECT * FROM courses`);
                const ordersRes = await client.query(`SELECT * FROM orders`);
                
                const students = usersRes.rows;
                const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
                const activeStudentsCount = students.filter(s => s.history?.length > 0).length;
                
                const allCourses = coursesRes.rows;
                const totalCourses = allCourses.length;
                const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > Date.now()).length;
                const completedCourses = totalCourses - upcomingCourses;
                
                const allOrders = ordersRes.rows;
                const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
                const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
                const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);
                let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
                await push(userId, report.trim());
            } catch (err) {
                console.error('❌ 生成營運報告時發生錯誤:', err);
                await push(userId, '❌ 生成營運報告時發生錯誤，請稍後再試。');
            } finally {
                if(client) client.release();
            }
        })();
        return;
    } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        const client = await pgPool.connect();
        try {
            const ordersRes = await client.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
            const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
            if (pendingConfirmationOrders.length === 0) { return reply(replyToken, '目前沒有待確認的購點訂單。'); }
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }}));
            return reply(replyToken, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            return reply(replyToken, '查詢訂單時發生錯誤，請稍後再試。');
        } finally {
            if(client) client.release();
        }
    } else {
      let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
      if (text.startsWith('@')) {
          const closestCommand = findClosestCommand(text, 'teacher');
          if (closestCommand) {
              teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
          } else {
              teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
          }
      }
      return reply(replyToken, teacherSuggestion);
    }
  }
}
async function handlePostback(event) {
    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const data = qs.parse(event.postback.data);
    const user = await getUser(userId);
    const text = data.text;

    if (repliedTokens.has(replyToken)) return;
    repliedTokens.add(replyToken);
    setTimeout(() => repliedTokens.delete(replyToken), 10000);

    if (data.action === 'run_command' && text) {
        if (user.role === 'admin') {
            await handleAdminCommands({ ...event, message: { type: 'text', text: text } }, userId);
        } else if (user.role === 'teacher') {
            await handleTeacherCommands({ ...event, message: { type: 'text', text: text } }, userId);
        } else {
            await handleStudentCommands({ ...event, message: { type: 'text', text: text } }, userId);
        }
        return;
    }

    if (user.role === 'admin') {
        if (data.action === 'select_teacher_for_removal') {
            pendingTeacherRemoval[userId] = { step: 'await_confirmation', targetUser: { id: data.targetId, name: decodeURIComponent(data.targetName) } };
            setupConversationTimeout(userId, pendingTeacherRemoval, 'pendingTeacherRemoval', (u) => push(u, '移除老師操作逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, `您確定要移除老師「${decodeURIComponent(data.targetName)}」的身份嗎？\n移除後他將無法使用老師專用功能，並自動切換為學員。`, [
                { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } },
                { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER, text: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER } }
            ]);
        }
    }

    if (user.role === 'teacher' || user.role === 'admin') {
        if (data.action === 'add_course_start') {
            pendingCourseCreation[userId] = { step: 'await_title' };
            setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, '請輸入課程標題：', [{ type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }]);
        } else if (data.action === 'set_course_weekday') {
            if (!pendingCourseCreation[userId]) return reply(replyToken, '新增課程流程已逾時，請重新開始。');
            const dayValue = parseInt(data.day, 10);
            const dayLabel = WEEKDAYS.find(d => d.value === dayValue).label;
            pendingCourseCreation[userId].weekday = dayValue;
            pendingCourseCreation[userId].weekday_label = dayLabel;
            pendingCourseCreation[userId].step = 'await_time';
            return reply(replyToken, `請問課程在每週 ${dayLabel} 的幾點幾分？（例如：19:30）`);
        } else if (data.action === 'cancel_course_group_confirm') {
            const prefix = data.prefix;
            const coursesRes = await pgPool.query('SELECT title, time FROM courses WHERE id LIKE $1 ORDER BY time LIMIT 1', [`${prefix}%`]);
            if (coursesRes.rows.length === 0) {
                return reply(replyToken, '找不到此課程系列。');
            }
            const courseTitle = coursesRes.rows[0].title.replace(/ - 第 \d+ 堂$/, '');
            const firstCourseTime = coursesRes.rows[0].time;
            
            pendingCourseCancellation[userId] = { type: 'batch', step: 'await_confirmation', prefix: prefix };
            setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, `您確定要「批次」取消「${courseTitle}」系列所有課程嗎？\n\n此操作會將所有已預約課程的學員點數歸還。\n\n第一堂課時間：${formatDateTime(firstCourseTime.toISOString())}`, [
                { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL, text: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL } },
                { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_FLOW, text: COMMANDS.TEACHER.CANCEL_FLOW } }
            ]);
        } else if (data.action === 'manage_course_group') {
            const prefix = data.prefix;
            const coursesRes = await pgPool.query('SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC', [`${prefix}%`]);
            const courses = coursesRes.rows.map(row => ({ id: row.id, title: row.title, time: row.time.toISOString(), students: row.students }));
            if (courses.length === 0) {
                return reply(replyToken, `找不到此系列課程的未開課程。`);
            }
            const courseBubbles = courses.slice(0, 10).map(c => ({
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '單堂管理', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' },
                body: { type: 'box', layout: 'vertical', contents: [
                    { type: 'text', text: c.title, weight: 'bold', size: 'md', wrap: true },
                    { type: 'text', text: `時間：${formatDateTime(c.time)}`, size: 'sm', color: '#666666', margin: 'md' },
                    { type: 'text', text: `報名人數：${c.students.length}`, size: 'sm', color: '#666666' }
                ]},
                footer: { type: 'box', layout: 'vertical', contents: [
                    { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂課', data: `action=cancel_single_course&courseId=${c.id}` } }
                ]}
            }));
            return reply(replyToken, { type: 'flex', altText: '單堂課程管理列表', contents: { type: 'carousel', contents: courseBubbles } });
        } else if (data.action === 'cancel_single_course') {
            const courseId = data.courseId;
            const course = await getCourse(courseId);
            if (!course) {
                return reply(replyToken, '此課程不存在。');
            }
            pendingCourseCancellation[userId] = { type: 'single', step: 'await_confirmation', courseId: courseId };
            setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, `您確定要取消單堂課程「${course.title}」嗎？\n\n此操作會將所有已預約此堂課的學員點數歸還。`, [
                { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL, text: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL } },
                { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_FLOW, text: COMMANDS.TEACHER.CANCEL_FLOW } }
            ]);
        } else if (data.action === 'select_student_for_adjust') {
            if (!pendingManualAdjust[userId]) return reply(replyToken, '調整點數流程已逾時，請重新開始。');
            const studentId = data.studentId;
            const student = await getUser(studentId);
            if (!student || student.role !== 'student') {
                delete pendingManualAdjust[userId];
                return reply(replyToken, '找不到此學員。');
            }
            pendingManualAdjust[userId].targetStudent = { id: student.id, name: student.name };
            pendingManualAdjust[userId].step = 'await_operation';
            const studentInfo = `您選擇了學員：${student.name}\n目前點數：${student.points}`;
            return reply(replyToken, studentInfo, [
                { type: 'action', action: { type: 'message', label: '+ 加點', text: COMMANDS.TEACHER.ADD_POINTS } },
                { type: 'action', action: { type: 'message', label: '- 扣點', text: COMMANDS.TEACHER.DEDUCT_POINTS } },
                { type: 'action', action: { type: 'message', label: '❌ 取消', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }
            ]);
        } else if (data.action === 'confirm_order') {
            const orderId = data.orderId;
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                const orderRes = await client.query("SELECT * FROM orders WHERE order_id = $1 FOR UPDATE", [orderId]);
                const order = orderRes.rows[0];
                if (!order) { await client.query('ROLLBACK'); return reply(replyToken, '找不到此訂單。'); }
                if (order.status !== 'pending_confirmation') { await client.query('ROLLBACK'); return reply(replyToken, '此訂單狀態不正確，無法確認。'); }
                const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [order.user_id]);
                const user = userRes.rows[0];
                const newPoints = user.points + order.points;
                const newHistory = user.history ? [...user.history, { action: `購點：+${order.points}點`, reason: `匯款審核通過`, time: new Date().toISOString() }] : [{ action: `購點：+${order.points}點`, reason: `匯款審核通過`, time: new Date().toISOString() }];
                await client.query("UPDATE users SET points = $1, history = $2 WHERE id = $3", [newPoints, JSON.stringify(newHistory), user.id]);
                await client.query("UPDATE orders SET status = 'completed' WHERE order_id = $1", [orderId]);
                await client.query('COMMIT');
                await reply(replyToken, `✅ 已成功為學員「${order.user_name}」增加 ${order.points} 點！`);
                push(order.user_id, `🔔 點數儲值通知\n您的 ${order.points} 點已成功入帳！\n目前點數餘額為：${newPoints} 點。`).catch(e => console.error(e));
            } catch (e) {
                await client.query('ROLLBACK');
                console.error('❌ 確認訂單失敗:', e);
                return reply(replyToken, '確認訂單時發生錯誤，請稍後再試。');
            } finally {
                if(client) client.release();
            }
        } else if (data.action === 'reject_order') {
            const orderId = data.orderId;
            const orderRes = await pgPool.query("SELECT * FROM orders WHERE order_id = $1", [orderId]);
            const order = orderRes.rows[0];
            if (!order) { return reply(replyToken, '找不到此訂單。'); }
            if (order.status !== 'pending_confirmation') { return reply(replyToken, '此訂單狀態不正確，無法退回。'); }
            await pgPool.query("UPDATE orders SET status = 'rejected' WHERE order_id = $1", [orderId]);
            await reply(replyToken, `✅ 已成功將學員「${order.user_name}」的訂單退回。`);
            push(order.user_id, `🔔 訂單通知\n您的購點訂單(ID: ${orderId})已被老師退回。\n請檢查匯款資訊是否正確，並至「點數管理」重新提交。`).catch(e => console.error(e));
        } else if (data.action === 'mark_feedback_read') {
            const msgId = data.msgId;
            await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
            return reply(replyToken, '✅ 已將留言標為已讀。');
        } else if (data.action === 'reply_feedback') {
            const msgId = data.msgId;
            const studentId = data.userId;
            const msgRes = await pgPool.query("SELECT message FROM feedback_messages WHERE id = $1", [msgId]);
            if (msgRes.rows.length === 0) { return reply(replyToken, '找不到此留言。'); }
            const originalMessage = msgRes.rows[0].message;
            pendingReply[userId] = { msgId: msgId, studentId: studentId, originalMessage: originalMessage };
            setupConversationTimeout(userId, pendingReply, 'pendingReply', (u) => push(u, '回覆留言操作逾時，自動取消。').catch(e => console.error(e)));
            await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
            return reply(replyToken, `請輸入您要回覆給學員的內容：\n\n【學員留言】\n${originalMessage}\n\n（輸入「取消」可放棄回覆）`);
        } else if (data.action === 'confirm_delete_announcement') {
            const annId = data.id;
            try {
                await pgPool.query("DELETE FROM announcements WHERE id = $1", [annId]);
                return reply(replyToken, '✅ 公告已成功刪除。');
            } catch (e) {
                console.error("刪除公告失敗:", e);
                return reply(replyToken, "刪除公告時發生錯誤。");
            }
        }
    }

    if (user.role === 'student' || user.role === 'admin') {
        if (data.action === 'select_purchase_plan') {
            const planPoints = parseInt(data.plan, 10);
            const plan = PURCHASE_PLANS.find(p => p.points === planPoints);
            if (!plan) return reply(replyToken, '無效的購買方案，請重新操作。');
            pendingPurchase[userId] = { step: 'confirm_purchase', data: plan };
            setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。').catch(e => console.error(e)));
            const replyMsg = `您選擇了「${plan.points} 點」方案，總金額為 ${plan.amount} 元。\n請點擊下方按鈕確認購買。`;
            const quickReplyMenu = [ { type: 'action', action: { type: 'message', label: '✅ 確認購買', text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } }, { type: 'action', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } } ];
            return reply(replyToken, replyMsg, quickReplyMenu);
        } else if (data.action === 'select_course_for_book') {
            const courseId = data.courseId;
            const course = await getCourse(courseId);
            if (!course) return reply(replyToken, '課程不存在，請重新查看。');
            
            pendingBookingConfirmation[userId] = { courseId: courseId };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => push(u, '預約課程流程逾時，自動取消。').catch(e => console.error(e)));
            
            const replyMsg = `您選擇了「${course.title}」。\n\n課程時間：${formatDateTime(course.time)}\n課程費用：${course.pointsCost} 點\n\n您目前剩餘點數：${user.points} 點。\n\n確定要預約嗎？`;
            const quickReplyMenu = [ { type: 'action', action: { type: 'message', label: '✅ 確認預約', text: COMMANDS.STUDENT.CONFIRM_BOOK_COURSE } }, { type: 'action', action: { type: 'message', label: '❌ 取消', text: COMMANDS.STUDENT.CANCEL_BOOK_COURSE } } ];
            return reply(replyToken, replyMsg, quickReplyMenu);
        } else if (data.action === 'select_course_for_cancel') {
            const courseId = data.courseId;
            const course = await getCourse(courseId);
            if (!course) return reply(replyToken, '課程不存在，請重新查看。');
            
            if (!course.students.includes(userId)) {
                return reply(replyToken, `您並未預約課程「${course.title}」，無法取消。`);
            }
            
            const timeUntilCourse = new Date(course.time).getTime() - Date.now();
            if (timeUntilCourse < (2 * 60 * 60 * 1000)) { // 2 hours
                 return reply(replyToken, `抱歉，課程「${course.title}」已在 2 小時內即將開始，無法取消。`);
            }
            
            const replyMsg = `您確定要取消預約課程「${course.title}」嗎？\n\n課程費用：${course.pointsCost} 點\n取消後點數將會自動歸還。`;
            const quickReplyMenu = [ { type: 'action', action: { type: 'message', label: '✅ 確認取消', text: `${COMMANDS.STUDENT.CONFIRM_CANCEL_COURSE} ${courseId}` } }, { type: 'action', action: { type: 'message', label: '❌ 放棄', text: COMMANDS.STUDENT.MY_COURSES } } ];
            return reply(replyToken, replyMsg, quickReplyMenu);
        } else if (data.action === 'view_course_details') {
            const courseId = data.courseId;
            const course = await getCourse(courseId);
            if (!course) return reply(replyToken, '課程不存在，請重新查看。');
            
            let statusText;
            const isStudent = course.students.includes(userId);
            const isWaiting = course.waiting.includes(userId);
            
            if (isStudent) {
                statusText = '✅ 您已預約此課程';
            } else if (isWaiting) {
                statusText = '⏰ 您在候補名單中';
            } else {
                statusText = '您可以點擊下方按鈕預約';
            }
            
            const studentNames = await Promise.all(course.students.map(async (sid) => {
                const sUser = await getUser(sid);
                return sUser ? sUser.name : '未知學員';
            }));
            
            const detailText = `課程詳情：\n\n標題：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost} 點\n名額：${course.students.length} / ${course.capacity}\n\n預約狀態：${statusText}\n\n已預約學員：\n${studentNames.join('、')}`;
            
            const buttons = [];
            if (!isStudent && !isWaiting) {
                buttons.push({ type: 'action', action: { type: 'postback', label: '預約課程', data: `action=select_course_for_book&courseId=${courseId}` } });
            }
            
            return reply(replyToken, detailText, buttons);
        } else if (data.action === 'input_last5') {
            const orderId = data.orderId;
            const orderRes = await pgPool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
            const order = orderRes.rows[0];
            if (!order) return reply(replyToken, '訂單不存在。');
            if (order.status !== 'pending_payment') return reply(replyToken, '此訂單狀態不正確，無法輸入後五碼。');
            pendingPurchase[userId] = { step: 'input_last5', data: { orderId: orderId, ...order } };
            setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, `請輸入您匯款帳號的後五碼 (5位數字) 以確認訂單 ${orderId}：`, [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }]);
        } else if (data.action === 'edit_last5') {
            const orderId = data.orderId;
            const orderRes = await pgPool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
            const order = orderRes.rows[0];
            if (!order) return reply(replyToken, '訂單不存在。');
            if (order.status !== 'pending_confirmation' && order.status !== 'rejected') return reply(replyToken, '此訂單狀態不正確，無法修改後五碼。');
            pendingPurchase[userId] = { step: 'edit_last5', data: { orderId: orderId, ...order } };
            setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, `請輸入您欲更新的匯款帳號後五碼 (5位數字) 以確認訂單 ${orderId}：`, [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }]);
        }
    }
}
async function handleStudentCommands(event, userId) {
    const replyToken = event.replyToken;
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);

    if (pendingBookingConfirmation[userId]) {
        if (text === COMMANDS.STUDENT.CONFIRM_BOOK_COURSE) {
            const courseId = pendingBookingConfirmation[userId].courseId;
            delete pendingBookingConfirmation[userId];
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                const courseRes = await client.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId]);
                const course = courseRes.rows[0];
                if (!course) { await client.query('ROLLBACK'); return reply(replyToken, '課程不存在，可能已被取消。'); }
                if (user.points < course.points_cost) { await client.query('ROLLBACK'); return reply(replyToken, `您的點數不足，此課程需要 ${course.points_cost} 點，但您只有 ${user.points} 點。`); }
                if (course.students.includes(userId) || course.waiting.includes(userId)) { await client.query('ROLLBACK'); return reply(replyToken, '您已預約或已在候補名單中。'); }

                const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
                const updatedUser = userRes.rows[0];
                const newPoints = updatedUser.points - course.points_cost;
                updatedUser.points = newPoints;
                updatedUser.history = updatedUser.history || [];
                updatedUser.history.push({ action: `預約課程：${course.title}`, time: new Date().toISOString(), pointsChange: -course.points_cost });

                if (course.students.length < course.capacity) {
                    course.students.push(userId);
                    await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [updatedUser.points, JSON.stringify(updatedUser.history), userId]);
                    await client.query('UPDATE courses SET students = $1 WHERE id = $2', [course.students, courseId]);
                    await client.query('COMMIT');
                    const message = `✅ 預約成功！\n課程：「${course.title}」\n時間：${formatDateTime(course.time.toISOString())}\n費用：${course.points_cost} 點\n\n您目前剩餘點數：${newPoints} 點。`;
                    return reply(replyToken, message, studentMenu);
                } else {
                    course.waiting.push(userId);
                    await client.query('UPDATE courses SET waiting = $1 WHERE id = $2', [course.waiting, courseId]);
                    await client.query('COMMIT');
                    const message = `✅ 預約成功！\n課程：「${course.title}」目前已額滿，您已進入候補名單第 ${course.waiting.length} 位。\n\n若有學員取消，您將自動遞補，並扣除點數。`;
                    return reply(replyToken, message, studentMenu);
                }
            } catch (e) {
                await client.query('ROLLBACK');
                console.error('預約課程失敗:', e);
                return reply(replyToken, '預約課程時發生錯誤，請稍後再試。', studentMenu);
            } finally {
                if(client) client.release();
            }
        } else if (text === COMMANDS.STUDENT.CANCEL_BOOK_COURSE) {
            delete pendingBookingConfirmation[userId];
            return reply(replyToken, '已取消預約操作。', studentMenu);
        }
    } else if (text.startsWith(COMMANDS.STUDENT.CONFIRM_CANCEL_COURSE)) {
        const parts = text.split(' ');
        if (parts.length < 2) return reply(replyToken, '指令格式不正確。');
        const courseId = parts[1];
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            const courseRes = await client.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId]);
            const course = courseRes.rows[0];
            if (!course) { await client.query('ROLLBACK'); return reply(replyToken, '課程不存在，可能已被取消。'); }

            const timeUntilCourse = new Date(course.time).getTime() - Date.now();
            if (timeUntilCourse < (2 * 60 * 60 * 1000)) { // 2 hours
                 await client.query('ROLLBACK');
                 return reply(replyToken, `抱歉，課程「${course.title}」已在 2 小時內即將開始，無法取消。`);
            }

            const studentIndex = course.students.indexOf(userId);
            if (studentIndex === -1) { await client.query('ROLLBACK'); return reply(replyToken, '您並未預約此課程。'); }

            const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
            const updatedUser = userRes.rows[0];
            const newPoints = updatedUser.points + course.points_cost;
            updatedUser.points = newPoints;
            updatedUser.history = updatedUser.history || [];
            updatedUser.history.push({ action: `取消課程：${course.title}`, time: new Date().toISOString(), pointsChange: course.points_cost });

            course.students.splice(studentIndex, 1);
            await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [updatedUser.points, JSON.stringify(updatedUser.history), userId]);
            
            if (course.waiting.length > 0) {
                const nextStudentId = course.waiting.shift();
                course.students.push(nextStudentId);
                
                const nextStudentRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextStudentId]);
                const nextStudent = nextStudentRes.rows[0];
                const newNextStudentPoints = nextStudent.points - course.points_cost;
                nextStudent.history = nextStudent.history || [];
                nextStudent.history.push({ action: `課程遞補成功：${course.title}`, time: new Date().toISOString(), pointsChange: -course.points_cost });

                await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newNextStudentPoints, JSON.stringify(nextStudent.history), nextStudentId]);
                push(nextStudentId, `課程遞補通知：\n恭喜！您已成功遞補至「${course.title}」課程。\n已扣除 ${course.points_cost} 點，目前剩餘點數：${newNextStudentPoints} 點。`).catch(e => console.error(e));
            }
            
            await client.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [course.students, course.waiting, courseId]);
            await client.query('COMMIT');
            const message = `✅ 成功取消預約課程「${course.title}」。\n已歸還 ${course.points_cost} 點，您目前剩餘點數：${newPoints} 點。`;
            return reply(replyToken, message, studentMenu);
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('取消課程失敗:', e);
            return reply(replyToken, '取消課程時發生錯誤，請稍後再試。');
        } finally {
            if(client) client.release();
        }
    } else if (pendingFeedback[userId]) {
        const feedback = text;
        delete pendingFeedback[userId];
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          await client.query("INSERT INTO feedback_messages (user_id, user_name, message) VALUES ($1, $2, $3)", [userId, user.name, feedback]);
          await client.query('COMMIT');
          await reply(replyToken, '✅ 您的留言已成功送出，老師將會盡快回覆。', studentMenu);
          if (TEACHER_ID) {
              await push(TEACHER_ID, `🔔 新留言通知\n學員 ${user.name} 傳來了新的留言：\n\n「${feedback}」\n\n請至「學員管理」->「查看留言」進行回覆。`);
          }
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ 傳送留言失敗:', err);
            await reply(replyToken, '傳送留言時發生錯誤，請稍後再試。');
        } finally {
            if(client) client.release();
        }
    } else {
        if (text === COMMANDS.STUDENT.POINTS) {
            const flexMessage = await buildPointsMenuFlex(userId);
            return reply(replyToken, flexMessage);
        } else if (text === COMMANDS.STUDENT.BUY_POINTS) {
            const flexMessage = buildBuyPointsFlex();
            return reply(replyToken, flexMessage);
        } else if (text === COMMANDS.STUDENT.BOOK_COURSE) {
            try {
                const courseRes = await pgPool.query('SELECT * FROM courses WHERE time > NOW() ORDER BY time ASC');
                const upcomingCourses = courseRes.rows.map(row => ({ id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students, waiting: row.waiting }));
                
                if (upcomingCourses.length === 0) {
                    return reply(replyToken, '目前沒有可預約的課程。');
                }
                
                const courseBubbles = upcomingCourses.slice(0, 10).map(c => {
                    let statusText = '';
                    let statusColor = '#AAAAAA';
                    let actionLabel = '預約課程';
                    let actionData = `action=select_course_for_book&courseId=${c.id}`;
                    let isFull = c.students.length >= c.capacity;
                    
                    if (c.students.includes(userId)) {
                        statusText = '已預約';
                        statusColor = '#52B69A';
                        actionLabel = '查看詳情';
                        actionData = `action=view_course_details&courseId=${c.id}`;
                    } else if (isFull && c.waiting.includes(userId)) {
                        statusText = '候補中';
                        statusColor = '#FFC043';
                        actionLabel = '查看詳情';
                        actionData = `action=view_course_details&courseId=${c.id}`;
                    } else if (isFull) {
                        statusText = '已額滿';
                        statusColor = '#DE5246';
                        actionLabel = '查看詳情';
                        actionData = `action=view_course_details&courseId=${c.id}`;
                    }
                    
                    const actions = [];
                    if (!c.students.includes(userId) && !c.waiting.includes(userId) && !isFull) {
                        actions.push({ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '預約課程', data: `action=select_course_for_book&courseId=${c.id}` } });
                    }
                    actions.push({ type: 'button', style: 'secondary', color: '#AAAAAA', height: 'sm', action: { type: 'postback', label: '查看詳情', data: `action=view_course_details&courseId=${c.id}` } });
                    
                    return {
                        type: 'bubble',
                        header: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [{ type: 'text', text: c.title, color: '#ffffff', weight: 'bold', size: 'md', wrap: true }],
                            backgroundColor: '#34a0a4',
                            paddingAll: 'lg'
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'md',
                            contents: [
                                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(c.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${c.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '名額', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${c.students.length} / ${c.capacity}`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                                ...(statusText ? [{ type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: statusText, wrap: true, color: statusColor, size: 'sm', weight: 'bold', flex: 5 } ] }] : []),
                            ]
                        },
                        footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: actions }
                    };
                });
                
                const message = (upcomingCourses.length === 1) ? '目前有一堂課程開放預約：' : '以下是目前開放預約的課程：';
                return reply(replyToken, [{ type: 'text', text: message }, { type: 'flex', altText: '可預約課程列表', contents: { type: 'carousel', contents: courseBubbles } }]);
            } catch (err) {
                console.error('❌ 查詢課程時發生錯誤:', err);
                return reply(replyToken, '查詢課程資訊時發生錯誤，請稍後再試。');
            }
        } else if (text === COMMANDS.STUDENT.MY_COURSES) {
            try {
                const courseRes = await pgPool.query('SELECT * FROM courses WHERE time > NOW() AND ($1 = ANY(students) OR $1 = ANY(waiting)) ORDER BY time ASC', [userId]);
                const myCourses = courseRes.rows.map(row => ({ id: row.id, title: row.title, time: row.time.toISOString(), students: row.students, waiting: row.waiting }));
                
                if (myCourses.length === 0) {
                    return reply(replyToken, '您目前沒有預約或候補任何課程。');
                }
                
                const courseBubbles = myCourses.slice(0, 10).map(c => {
                    const isStudent = c.students.includes(userId);
                    const isWaiting = c.waiting.includes(userId);
                    const statusText = isStudent ? '已預約' : (isWaiting ? '候補中' : '未知狀態');
                    const statusColor = isStudent ? '#52B69A' : (isWaiting ? '#FFC043' : '#DE5246');
                    
                    const timeUntilCourse = new Date(c.time).getTime() - Date.now();
                    const allowCancel = timeUntilCourse >= (2 * 60 * 60 * 1000); // 2 hours
                    
                    const actions = [];
                    if (isStudent && allowCancel) {
                        actions.push({ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=select_course_for_cancel&courseId=${c.id}` } });
                    } else if (isStudent && !allowCancel) {
                        actions.push({ type: 'button', style: 'secondary', color: '#AAAAAA', height: 'sm', action: { type: 'message', label: '無法取消', text: '抱歉，課程已在 2 小時內即將開始，無法取消。' } });
                    }
                    
                    return {
                        type: 'bubble',
                        header: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [{ type: 'text', text: '我的課程', color: '#ffffff', weight: 'bold', size: 'md' }],
                            backgroundColor: '#1A759F',
                            paddingAll: 'lg'
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'md',
                            contents: [
                                { type: 'text', text: c.title, weight: 'bold', size: 'md', wrap: true },
                                { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(c.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                                { type: 'box', layout: 'baseline', contents: [ { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: statusText, wrap: true, color: statusColor, size: 'sm', weight: 'bold', flex: 5 } ] },
                            ]
                        },
                        footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: actions }
                    };
                });
                
                const message = (myCourses.length === 1) ? '您已預約以下一堂課程：' : '以下是您已預約或候補的課程：';
                return reply(replyToken, [{ type: 'text', text: message }, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles } }]);
            } catch (err) {
                console.error('❌ 查詢我的課程時發生錯誤:', err);
                return reply(replyToken, '查詢課程資訊時發生錯誤，請稍後再試。');
            }
        } else if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
            const announcementRes = await pgPool.query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1");
            const userRes = await pgPool.query("SELECT last_seen_announcement_id FROM users WHERE id = $1", [userId]);
            const lastSeenId = userRes.rows[0]?.last_seen_announcement_id || 0;
            
            if (announcementRes.rows.length === 0) {
                return reply(replyToken, '目前沒有任何最新公告。');
            }
            
            const latestAnn = announcementRes.rows[0];
            const isNew = latestAnn.id > lastSeenId;
            
            const message = `📣 最新公告 ${isNew ? '（新）' : ''}\n\n${latestAnn.content}\n\n發布時間：${formatDateTime(latestAnn.created_at.toISOString())}\n\n請點擊下方按鈕以查看歷史公告。`;
            const quickReplyMenu = [ { type: 'action', action: { type: 'message', label: '歷史公告', text: COMMANDS.STUDENT.ANNOUNCEMENT_HISTORY } } ];
            
            await pgPool.query("UPDATE users SET last_seen_announcement_id = $1 WHERE id = $2", [latestAnn.id, userId]);
            
            return reply(replyToken, message, quickReplyMenu);
        } else if (text === COMMANDS.STUDENT.ANNOUNCEMENT_HISTORY) {
            const announcementsRes = await pgPool.query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10 OFFSET 1");
            if (announcementsRes.rows.length === 0) {
                return reply(replyToken, "除了最新一則公告外，目前沒有其他歷史公告。");
            }
            const announcementBubbles = announcementsRes.rows.map(ann => ({
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [ { type: 'text', text: '歷史公告', color: '#ffffff', weight: 'bold', size: 'md' } ],
                    backgroundColor: '#1A759F'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: ann.content.substring(0, 50) + '...', wrap: true },
                        { type: 'text', text: `發布時間: ${formatDateTime(ann.created_at)}`, size: 'xs', color: '#aaaaaa' }
                    ]
                }
            }));
            return reply(replyToken, { type: 'flex', altText: '歷史公告列表', contents: { type: 'carousel', contents: announcementBubbles } });
        } else if (text === COMMANDS.STUDENT.FEEDBACK) {
            pendingFeedback[userId] = { step: 'await_feedback' };
            setupConversationTimeout(userId, pendingFeedback, 'pendingFeedback', (u) => push(u, '留言操作逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, '請輸入您的留言，老師將會盡快回覆。', [{ type: 'action', action: { type: 'message', label: '❌ 取消', text: '取消' } }]);
        } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
            try {
                await pgPool.query(`DELETE FROM orders WHERE user_id = $1 AND status <> 'completed'`, [userId]);
                const flexMenu = await buildPointsMenuFlex(userId);
                return reply(replyToken, [{type: 'text', text: '已取消所有未完成的購點訂單。'}, flexMenu]);
            } catch (err) {
                console.error('❌ 取消訂單失敗:', err);
                return reply(replyToken, '取消訂單時發生錯誤，請稍後再試。');
            }
        } else {
            let studentSuggestion = '無法識別您的指令🤔\n請直接使用下方的學員專用選單進行操作。';
            if (text.startsWith('@')) {
                const closestCommand = findClosestCommand(text, 'student');
                if (closestCommand) {
                    studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
                } else {
                    studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
                }
            }
            return reply(replyToken, studentSuggestion);
        }
    }
}
async function handleEvent(event) {
    const userId = event.source.userId;
    if (!userId) { console.error('找不到 userId'); return null; }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        let user = await getUser(userId);

        if (!user) {
            let profile;
            try {
                profile = await client.getProfile(userId);
            } catch (error) {
                console.error('無法獲取用戶 profile:', error);
                return;
            }
            user = {
                id: userId,
                name: profile.displayName || '新學員',
                points: 0,
                role: 'student',
                history: [],
                last_seen_announcement_id: 0,
                pictureUrl: profile.pictureUrl || null,
                approved_by: null
            };
            await saveUser(user);
            console.log(`✅ 新用戶已註冊: ${user.name} (${user.id})`);
            await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(e));
        }

        const isPendingPurchase = await handlePurchaseFlow(event, userId);
        if (isPendingPurchase) return;

        if (text === COMMANDS.ADMIN.PANEL && user.role === 'admin') {
            return await handleAdminCommands(event, userId);
        } else if (text.startsWith('@') && user.role === 'admin') {
            return await handleAdminCommands(event, userId);
        } else if (text.startsWith('@') && user.role === 'teacher') {
            return await handleTeacherCommands(event, userId);
        } else if (text.startsWith('@') && user.role === 'student') {
            return await handleStudentCommands(event, userId);
        }

        if (user.role === 'admin') {
            await handleAdminCommands(event, userId);
        } else if (user.role === 'teacher') {
            await handleTeacherCommands(event, userId);
        } else {
            await handleStudentCommands(event, userId);
        }
    } else if (event.type === 'postback') {
        return await handlePostback(event);
    } else if (event.type === 'memberJoined') {
        if (event.source.type === 'group') {
            return await reply(event.replyToken, `大家好！我是點數管理機器人，請加我為好友以使用個人功能！`);
        }
    }
}

async function main() {
    console.log('🚀 機器人啟動中...');
    try {
        await pgPool.connect();
        console.log('✅ PostgreSQL 資料庫連線成功！');
    } catch (err) {
        console.error('❌ 資料庫連線失敗！', err);
        process.exit(1);
    }
    await cleanCoursesDB();
    console.log('🧹 已清理過期課程資料');

    const app = express();
    app.use(express.json());
    app.post('/webhook', (req, res) => {
        Promise.all(req.body.events.map(handleEvent))
            .then(() => res.end())
            .catch((err) => {
                console.error(err);
                res.status(500).end();
            });
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`📡 伺服器正在監聽 ${port} 埠...`);
    });
}
main();
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const { Pool } = require('pg');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const STUDENT_RICH_MENU_ID = process.env.STUDENT_RICH_MENU_ID;
const TEACHER_RICH_MENU_ID = process.env.TEACHER_RICH_MENU_ID;
const ADMIN_ID = process.env.ADMIN_ID;
const TEACHER_ID = process.env.TEACHER_ID; // 測試用，實際應從資料庫查詢

const CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

// Conversation state for different commands
const pendingPurchase = {};
const pendingCourseCreation = {};
const pendingManualAdjust = {};
const pendingBookingConfirmation = {};
const pendingCourseCancellation = {};
const pendingFeedback = {};
const pendingStudentSearchQuery = {};
const pendingReply = {};
const pendingTeacherAddition = {};
const pendingTeacherRemoval = {};
const pendingAnnouncementCreation = {};

const repliedTokens = new Set();

const WEEKDAYS = [
    { value: 1, label: '一' }, { value: 2, label: '二' }, { value: 3, label: '三' }, { value: 4, label: '四' }, { value: 5, label: '五' }, { value: 6, label: '六' }, { value: 0, label: '日' }
];

const PURCHASE_PLANS = [
    { points: 100, amount: 90 },
    { points: 200, amount: 170 },
    { points: 500, amount: 400 },
];

const BANK_INFO = {
    bankName: '臺灣銀行',
    accountName: '點數管理系統',
    accountNumber: '004-123-456789-0',
};

const COMMANDS = {
    STUDENT: {
        POINTS: '@我的點數',
        BUY_POINTS: '@購點',
        BOOK_COURSE: '@預約課程',
        MY_COURSES: '@我的課程',
        FEEDBACK: '@聯絡老師',
        LATEST_ANNOUNCEMENT: '@最新公告',
        ANNOUNCEMENT_HISTORY: '@歷史公告',
        CONFIRM_BUY_POINTS: '✅ 確認購買',
        CANCEL_PURCHASE: '❌ 取消購買',
        CANCEL_INPUT_LAST5: '❌ 取消後五碼',
        CONFIRM_BOOK_COURSE: '✅ 確認預約',
        CANCEL_BOOK_COURSE: '❌ 取消預約',
        CONFIRM_CANCEL_COURSE: '✅ 確認取消',
        MY_PROFILE: '@我的資料',
        SHOP: '@商城',
    },
    TEACHER: {
        COURSE_MANAGEMENT: '@課程管理',
        POINT_MANAGEMENT: '@點數管理',
        STUDENT_MANAGEMENT: '@學員管理',
        ANNOUNCEMENT_MANAGEMENT: '@公告管理',
        SHOP_MANAGEMENT: '@商城管理',
        REPORT: '@報表',
        ADD_COURSE: '新增課程',
        MANUAL_ADJUST_POINTS: '開始調整',
        PENDING_ORDERS: '查看清單',
        SEARCH_STUDENT: '開始查詢',
        VIEW_MESSAGES: '查看未回覆留言',
        ADD_ANNOUNCEMENT: '發布新公告',
        DELETE_ANNOUNCEMENT: '刪除舊公告',
        CONFIRM_BATCH_CANCEL: '✅ 確認批次取消',
        CONFIRM_SINGLE_CANCEL: '✅ 確認取消此堂課',
        CANCEL_FLOW: '❌ 放棄',
        ADD_POINTS: '➕ 加點',
        DEDUCT_POINTS: '➖ 扣點',
        CANCEL_MANUAL_ADJUST: '❌ 取消調整',
        CONFIRM_MANUAL_ADJUST: '✅ 確認調整',
        CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認發布',
        CANCEL_ADD_ANNOUNCEMENT: '❌ 取消發布',
        ADD_PRODUCT: '上架新商品',
        VIEW_PRODUCTS: '查看/下架商品',
    },
    ADMIN: {
        PANEL: '@管理模式',
        ADD_TEACHER: '授權老師',
        REMOVE_TEACHER: '移除老師',
        CONFIRM_ADD_TEACHER: '✅ 確認授權',
        CANCEL_ADD_TEACHER: '❌ 取消授權',
        CONFIRM_REMOVE_TEACHER: '✅ 確認移除',
        CANCEL_REMOVE_TEACHER: '❌ 取消移除',
        SIMULATE_STUDENT: '模擬學員身份',
        SIMULATE_TEACHER: '模擬老師身份',
    }
};

// ======================= DB Functions =======================
async function getUser(userId) {
    try {
        const res = await pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length > 0) {
            return res.rows[0];
        }
    } catch (err) {
        console.error('❌ 查詢用戶失敗:', err);
    }
    return null;
}

async function saveUser(user) {
    try {
        const historyJson = JSON.stringify(user.history);
        const approvedBy = user.approved_by || null;
        await pgPool.query(
            `INSERT INTO users (id, name, points, role, history, picture_url, last_seen_announcement_id, approved_by) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             ON CONFLICT (id) DO UPDATE 
             SET name = EXCLUDED.name, points = EXCLUDED.points, role = EXCLUDED.role, history = EXCLUDED.history, picture_url = EXCLUDED.picture_url, last_seen_announcement_id = EXCLUDED.last_seen_announcement_id, approved_by = EXCLUDED.approved_by`,
            [user.id, user.name, user.points, user.role, historyJson, user.pictureUrl, user.last_seen_announcement_id, approvedBy]
        );
    } catch (err) {
        console.error('❌ 儲存用戶失敗:', err);
    }
}

async function getCourse(courseId) {
    try {
        const res = await pgPool.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length > 0) {
            return res.rows[0];
        }
    } catch (err) {
        console.error('❌ 查詢課程失敗:', err);
    }
    return null;
}

async function saveCourse(course, clientDB = pgPool) {
    try {
        const studentsJson = JSON.stringify(course.students);
        const waitingJson = JSON.stringify(course.waiting);
        await clientDB.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             ON CONFLICT (id) DO UPDATE 
             SET title = EXCLUDED.title, time = EXCLUDED.time, capacity = EXCLUDED.capacity, points_cost = EXCLUDED.points_cost, students = EXCLUDED.students, waiting = EXCLUDED.waiting`,
            [course.id, course.title, course.time, course.capacity, course.pointsCost, studentsJson, waitingJson]
        );
    } catch (err) {
        console.error('❌ 儲存課程失敗:', err);
    }
}

async function saveOrder(order) {
    try {
        const res = await pgPool.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             ON CONFLICT (order_id) DO UPDATE 
             SET status = EXCLUDED.status, last_5_digits = EXCLUDED.last_5_digits, timestamp = EXCLUDED.timestamp`,
            [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]
        );
    } catch (err) {
        console.error('❌ 儲存訂單失敗:', err);
    }
}

async function cleanCoursesDB() {
    try {
        await pgPool.query("DELETE FROM courses WHERE time < NOW() - INTERVAL '1 day'");
        console.log('🧹 已清理所有一天前過期的課程。');
    } catch (err) {
        console.error('❌ 清理過期課程失敗:', err);
    }
}
async function generateUniqueCoursePrefix(client) {
    let prefix = '';
    let isUnique = false;
    while (!isUnique) {
        prefix = uuidv4().substring(0, 2).toUpperCase();
        const res = await client.query('SELECT COUNT(*) FROM courses WHERE id LIKE $1', [`${prefix}%`]);
        if (parseInt(res.rows[0].count, 10) === 0) {
            isUnique = true;
        }
    }
    return prefix;
}

// ======================= LINE API Wrappers & Utilities =======================
async function reply(replyToken, messages, quickReplyItems = null) {
    let replyMessages = Array.isArray(messages) ? messages : [{ type: 'text', text: messages }];

    if (quickReplyItems) {
        replyMessages[0].quickReply = { items: quickReplyItems };
    }

    try {
        await client.replyMessage(replyToken, replyMessages);
    } catch (err) {
        console.error('❌ 回覆訊息失敗:', err);
    }
}

async function push(to, messages) {
    let pushMessages = Array.isArray(messages) ? messages : [{ type: 'text', text: messages }];
    try {
        await client.pushMessage(to, pushMessages);
    } catch (err) {
        console.error('❌ 推播訊息失敗:', err);
    }
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    const options = {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return date.toLocaleString('zh-TW', options);
}

function getNextDate(weekday, timeString, startDate = new Date()) {
    const [hour, minute] = timeString.split(':').map(Number);
    const result = new Date(startDate);
    result.setHours(hour, minute, 0, 0);

    const currentDay = result.getDay();
    const diff = (weekday - currentDay + 7) % 7;
    result.setDate(result.getDate() + diff);

    if (result <= startDate) {
        result.setDate(result.getDate() + 7);
    }
    return result;
}

// ======================= Flex Message Builders =======================
async function buildPointsMenuFlex(userId) {
    const user = await getUser(userId);
    const pendingOrderRes = await pgPool.query(`SELECT order_id, points, amount FROM orders WHERE user_id = $1 AND status <> 'completed'`, [userId]);
    const pendingOrder = pendingOrderRes.rows[0];

    let pendingOrderSection = [];
    if (pendingOrder) {
        pendingOrderSection = [
            {
                type: 'text',
                text: '待處理訂單',
                weight: 'bold',
                size: 'md',
                margin: 'lg'
            },
            {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                margin: 'md',
                contents: [
                    { type: 'text', text: `ID: ${pendingOrder.order_id}`, size: 'sm', color: '#666666' },
                    { type: 'text', text: `點數: ${pendingOrder.points} 點`, size: 'sm', color: '#666666' },
                    { type: 'text', text: `金額: ${pendingOrder.amount} 元`, size: 'sm', color: '#666666' }
                ]
            },
            {
                type: 'box',
                layout: 'vertical',
                margin: 'lg',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#FF9E00',
                        action: { type: 'postback', label: '再次輸入後五碼', data: `action=input_last5&orderId=${pendingOrder.order_id}` }
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        color: '#AAAAAA',
                        margin: 'md',
                        action: { type: 'message', label: '❌ 取消訂單', text: COMMANDS.STUDENT.CANCEL_PURCHASE }
                    }
                ]
            }
        ];
    }
    
    return {
        type: 'flex',
        altText: '我的點數',
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: '我的點數',
                        weight: 'bold',
                        size: 'xl',
                        color: '#1A759F'
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'md',
                        contents: [
                            {
                                type: 'text',
                                text: '剩餘點數',
                                flex: 2,
                                size: 'sm',
                                color: '#aaaaaa'
                            },
                            {
                                type: 'text',
                                text: `${user.points} 點`,
                                flex: 5,
                                size: 'xl',
                                weight: 'bold',
                                align: 'end'
                            }
                        ]
                    },
                    {
                        type: 'separator',
                        margin: 'lg'
                    },
                    ...pendingOrderSection,
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#52b69a',
                                action: { type: 'message', label: '💰 購買點數', text: COMMANDS.STUDENT.BUY_POINTS }
                            }
                        ]
                    }
                ]
            }
        }
    };
}

function buildBuyPointsFlex() {
    const planBubbles = PURCHASE_PLANS.map(plan => ({
        type: 'bubble',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'text',
                    text: `${plan.points} 點`,
                    color: '#ffffff',
                    weight: 'bold',
                    size: 'xxl'
                }
            ],
            backgroundColor: '#FF9E00',
            paddingAll: 'lg'
        },
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
                {
                    type: 'text',
                    text: `NT$ ${plan.amount}`,
                    weight: 'bold',
                    size: 'xl'
                },
                {
                    type: 'text',
                    text: `平均每點 ${Math.round(plan.amount / plan.points * 10) / 10} 元`,
                    size: 'sm',
                    color: '#666666'
                }
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'button',
                    action: {
                        type: 'postback',
                        label: '選擇此方案',
                        data: `action=select_purchase_plan&plan=${plan.points}`
                    },
                    style: 'primary',
                    color: '#FF9E00'
                }
            ]
        }
    }));
    
    return {
        type: 'flex',
        altText: '購買點數',
        contents: {
            type: 'carousel',
            contents: planBubbles
        }
    };
}

const studentMenu = [
    { type: 'action', action: { type: 'message', label: '我的點數', text: COMMANDS.STUDENT.POINTS } },
    { type: 'action', action: { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE } },
    { type: 'action', action: { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES } },
    { type: 'action', action: { type: 'message', label: '聯絡老師', text: COMMANDS.STUDENT.FEEDBACK } }
];
