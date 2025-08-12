// index.js - V20.0 (商城功能 Phase 2 - 管理與優化)
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
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID; // 此為選用項目

const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 5;
const PAGINATION_SIZE = 9; // 用於分頁功能的每頁項目數

const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

const BANK_INFO = {
  accountName: process.env.BANK_ACCOUNT_NAME,
  bankName: process.env.BANK_NAME,
  accountNumber: process.env.BANK_ACCOUNT_NUMBER,
};

const COMMANDS = {
  GENERAL: {
    CANCEL: '❌ 取消操作'
  },
  ADMIN: {
    PANEL: '@管理模式',
    ADD_TEACHER: '@授權老師',
    REMOVE_TEACHER: '@移除老師',
    SIMULATE_STUDENT: '@模擬學員身份',
    SIMULATE_TEACHER: '@模擬老師身份',
    CONFIRM_ADD_TEACHER: '✅ 確認授權',
    CONFIRM_REMOVE_TEACHER: '✅ 確認移除',
  },
  TEACHER: {
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    STUDENT_MANAGEMENT: '@學員管理',
    ANNOUNCEMENT_MANAGEMENT: '@公告管理',
      ADD_ANNOUNCEMENT: '@頒佈新公告',
      DELETE_ANNOUNCEMENT: '@刪除舊公告',
    SHOP_MANAGEMENT: '@商城管理',
      ADD_PRODUCT: '@上架新商品',
      VIEW_PRODUCTS: '@查看所有商品',
      EDIT_PRODUCT: '@修改商品資訊', // [新增]
      REMOVE_PRODUCT: '@下架商品',
      SHOP_ORDER_MANAGEMENT: '@訂單管理', 
      PENDING_SHOP_ORDERS: '@待處理訂單',
    VIEW_MESSAGES: '@查看留言',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查詢學員',
    REPORT: '@統計報表',
      COURSE_REPORT: '@課程報表',
      ORDER_REPORT: '@訂單報表',
      POINT_REPORT: '@點數報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CONFIRM_MANUAL_ADJUST: '✅ 確認調整',
    ADD_POINTS: '+ 加點',
    DEDUCT_POINTS: '- 扣點',
    MESSAGE_SEARCH: '@查詢留言',
    CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認頒佈',
    CONFIRM_DELETE_ANNOUNCEMENT: '✅ 確認刪除',
    CONFIRM_BATCH_CANCEL: '✅ 確認批次取消',
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
    PRODUCT_ORDER_HISTORY: '@兌換紀錄', // [新增]
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
    CONFIRM_CANCEL_BOOKING: '✅ 確認取消預約',
    CONFIRM_CANCEL_WAITING: '✅ 確認取消候補',
  }
};
/**
 * 檢查所有必要的環境變數是否已設定。
 * 如果有任何缺少的變數，將記錄錯誤並終止應用程式。
 */
function checkEnvironmentVariables() {
    const requiredEnvVars = [
        'CHANNEL_ACCESS_TOKEN',
        'CHANNEL_SECRET',
        'DATABASE_URL',
        'ADMIN_USER_ID',
        'TEACHER_ID',
        'STUDENT_RICH_MENU_ID',
        'TEACHER_RICH_MENU_ID',
        'SELF_URL',
        'BANK_NAME',
        'BANK_ACCOUNT_NAME',
        'BANK_ACCOUNT_NUMBER'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('❌ FATAL ERROR: 缺少必要的環境變數:');
        missingVars.forEach(varName => console.error(`  - ${varName}`));
        console.error('請檢查您的 .env 檔案或部署設定。');
        process.exit(1);
    }

    console.log('✅ 所有必要的環境變數都已設定。');
}

/**
 * 創建一個包含分頁按鈕的 Flex Message 氣泡。
 * @param {string} baseAction - Postback 的基本動作字串，例如 'action=view_courses'。
 * @param {number} currentPage - 當前頁碼。
 * @param {boolean} hasNext - 是否有下一頁。
 * @param {string} [customParams=''] - 要附加到 postback data 的額外參數，例如 '&query=yoga'。
 * @returns {object|null} - Flex Message 氣泡物件，如果不需要分頁則返回 null。
 */
function createPaginationBubble(baseAction, currentPage, hasNext, customParams = '') {
    const buttons = [];

    if (currentPage > 1) {
        buttons.push({
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
                type: 'postback',
                label: '⬅️ 上一頁',
                data: `${baseAction}&page=${currentPage - 1}${customParams}`
            }
        });
    }

    if (hasNext) {
        buttons.push({
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
                type: 'postback',
                label: '下一頁 ➡️',
                data: `${baseAction}&page=${currentPage + 1}${customParams}`
            }
        });
    }

    if (buttons.length === 0) return null;

    return {
        type: 'bubble',
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: buttons,
            justifyContent: 'center',
            alignItems: 'center',
            paddingAll: 'md'
        },
    };
}
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
        inventory INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) DEFAULT 'available', -- 'available' 或 'unavailable'
        creator_id VARCHAR(255) NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_orders (
        id SERIAL PRIMARY KEY,
        order_uid VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        product_id INTEGER NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        points_spent INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, cancelled
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ 已檢查/建立 products 與 product_orders 表格');
    const lastSeenIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_seen_announcement_id'");
    if (lastSeenIdCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN last_seen_announcement_id INTEGER DEFAULT 0');
    }
    const pictureUrlCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='picture_url'");
    if (pictureUrlCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN picture_url TEXT');
    }
    const approvedByCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='approved_by'");
    if (approvedByCol.rows.length === 0) {
        await client.query('ALTER TABLE users ADD COLUMN approved_by VARCHAR(255)');
    }
    const creatorIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_id'");
    if (creatorIdCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN creator_id VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
    }
    const creatorNameCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_name'");
    if (creatorNameCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN creator_name VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
    }
    const createdAtCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='created_at'");
    if (createdAtCol.rows.length === 0) {
        await client.query('ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()');
    }

    const inventoryCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='inventory'");
    if (inventoryCol.rows.length === 0) {
        await client.query('ALTER TABLE products ADD COLUMN inventory INTEGER NOT NULL DEFAULT 0');
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
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.picture_url || null, user.approved_by || null]
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
        return { 
            id: row.id, 
            title: row.title, 
            time: row.time.toISOString(), 
            capacity: row.capacity, 
            points_cost: row.points_cost, 
            students: row.students || [], 
            waiting: row.waiting || [] 
        };
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
            [course.id, course.title, course.time, course.capacity, course.points_cost, course.students, course.waiting]
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
            id: row.id, 
            title: row.title, 
            time: row.time.toISOString(), 
            points_cost: row.points_cost, 
            students: row.students || [], 
            waiting: row.waiting || []
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
            [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp]
        );
    } catch (err) {
        console.error('❌ saveOrder 函式錯誤:', err.message, 'Order ID:', order.order_id);
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

function formatIdForDisplay(id) {
    if (!id || typeof id !== 'string') return id;
    const zws = '\u200B'; // Zero-width space
    return id.match(/.{1,8}/g)?.join(zws) || id;
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
                    action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL }
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
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `訂單 ID: ${formatIdForDisplay(pendingOrder.order_id)}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${actionCmd}` } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }] } });
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
// [修改] 主選單新增兌換紀錄
const studentMenu = [
    { type: 'action', action: { type: 'postback', label: '點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } },
    { type: 'action', action: { type: 'postback', label: '預約課程', data: `action=run_command&text=${COMMANDS.STUDENT.BOOK_COURSE}` } },
    { type: 'action', action: { type: 'postback', label: '我的課程', data: `action=run_command&text=${COMMANDS.STUDENT.MY_COURSES}` } },
    { type: 'action', action: { type: 'postback', label: '兌換紀錄', data: `action=run_command&text=${COMMANDS.STUDENT.PRODUCT_ORDER_HISTORY}` } },
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
const pendingTeacherAddition = {};
const pendingTeacherRemoval = {};
const pendingProductCreation = {};
const pendingCourseCancellation = {};
const pendingReportGeneration = {};
const pendingAnnouncementCreation = {};
const pendingAnnouncementDeletion = {};
const repliedTokens = new Set();

const cancellableConversationStates = {
    pendingCourseCreation,
    pendingManualAdjust,
    pendingStudentSearchQuery,
    pendingReply,
    pendingFeedback,
    pendingPurchase,
    pendingTeacherAddition,
    pendingTeacherRemoval,
    pendingAnnouncementCreation,
    pendingAnnouncementDeletion,
    pendingBookingConfirmation,
    pendingCourseCancellation,
    pendingProductCreation,
};

/**
 * 清除使用者所有待處理的對話狀態。
 * 用於「智慧取消」機制，當使用者點擊主選單或輸入新指令時，放棄先前的操作。
 * @param {string} userId - 使用者的 ID。
 * @returns {boolean} - 如果清除了任何狀態，則返回 true。
 */
function clearPendingConversations(userId) {
    let cleared = false;
    for (const state of Object.values(cancellableConversationStates)) {
        if (state[userId]) {
            if (state[userId].timeoutId) {
                clearTimeout(state[userId].timeoutId);
            }
            delete state[userId];
            cleared = true;
        }
    }
    return cleared;
}

/**
 * 產生一個包含取消按鈕的快速回覆選單。
 * @returns {Array} - 可用於 reply 函式的 menu 參數。
 */
function getCancelMenu() {
    return [{ type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }];
}
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

function getDateRange(period) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    let startDate, endDate;

    switch (period) {
        case 'week':
            const dayOfWeek = now.getDay(); // Sunday - 0, Monday - 1, ...
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to make Monday the first day
            startDate = new Date(now.setDate(diff));
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31);
            break;
    }
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return {
        start: new Date(startDate.getTime() - EIGHT_HOURS_IN_MS).toISOString(),
        end: new Date(endDate.getTime() - EIGHT_HOURS_IN_MS).toISOString()
    };
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

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                const order_id = `PO${Date.now()}`;
                const order = {
                    order_id: order_id,
                    user_id: userId,
                    user_name: user.name,
                    points: purchaseState.data.points,
                    amount: purchaseState.data.amount,
                    last_5_digits: null,
                    status: 'pending_payment',
                    timestamp: new Date().toISOString()
                };
                await saveOrder(order);
                delete pendingPurchase[userId];

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數管理」選單，點擊「❗ 匯款待確認」卡片中的按鈕來回報您的後五碼。`;
                const flexMenu = await buildPointsMenuFlex(userId);
                await reply(event.replyToken, [{ type: 'text', text: replyText }, flexMenu]);
            } else {
                await reply(event.replyToken, '請點擊「✅ 確認購買」或「❌ 取消操作」。');
            }
            return true;

        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const client = await pgPool.connect();
                try {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [order_id]);
                    if (orderRes.rows.length > 0) {
                        const order = orderRes.rows[0];
                        order.last_5_digits = text;
                        order.status = 'pending_confirmation';
                        order.timestamp = new Date().toISOString();
                        await saveOrder(order, client);

                        delete pendingPurchase[userId];
                        const flexMenu = await buildPointsMenuFlex(userId);
                        await reply(event.replyToken, [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu]);
                        if (TEACHER_ID) {
                            push(TEACHER_ID, `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認清單」審核。`).catch(e => console.error(e));
                        }
                    } else {
                        delete pendingPurchase[userId];
                        await reply(event.replyToken, '找不到您的訂單，請重新操作。');
                    }
                } finally {
                    if (client) client.release();
                }
            } else {
                await reply(event.replyToken, '格式錯誤，請輸入5位數字的匯款帳號後五碼。', getCancelMenu());
            }
            return true;
    }
    return false;
}
/**
 * 顯示可供移除的老師列表 (支援分頁)
 * @param {string} replyToken - 用於回覆訊息的 token
 * @param {number} page - 要顯示的頁碼
 */
async function showTeacherListForRemoval(replyToken, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const teacherRes = await client.query("SELECT id, name FROM users WHERE role = 'teacher' ORDER BY name LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = teacherRes.rows.length > PAGINATION_SIZE;
        const pageTeachers = hasNextPage ? teacherRes.rows.slice(0, PAGINATION_SIZE) : teacherRes.rows;

        if (pageTeachers.length === 0 && page === 1) {
            return reply(replyToken, '目前沒有任何老師可供移除。');
        }
        if (pageTeachers.length === 0) {
            return reply(replyToken, '沒有更多老師了。');
        }

        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` } }]
            }
        }));
        
        const paginationBubble = createPaginationBubble('action=list_teachers_for_removal', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }

        return reply(replyToken, {
            type: 'flex',
            altText: '請選擇要移除的老師',
            contents: { type: 'carousel', contents: teacherBubbles }
        });
    } catch (err) {
        console.error('❌ 查詢老師列表失敗:', err);
        return reply(replyToken, '查詢老師時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}


async function handleAdminCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (pendingTeacherAddition[userId]) {
    const state = pendingTeacherAddition[userId];
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, getCancelMenu());
        } else if (studentRes.rows.length === 1) {
          state.targetUser = studentRes.rows[0];
          state.step = 'await_confirmation';
          return reply(replyToken, `您確定要授權學員「${state.targetUser.name}」成為老師嗎？`, [
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
            { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
          ]);
        } else {
          return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, getCancelMenu());
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
      return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', getCancelMenu());
    } else if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
        return showTeacherListForRemoval(replyToken, 1);
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
/**
 * 顯示待確認的訂單列表 (支援分頁)
 * @param {string} replyToken - The reply token.
 * @param {number} page - The page number to display.
 */
async function showPendingOrders(replyToken, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC LIMIT $1 OFFSET $2`, [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = ordersRes.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? ordersRes.rows.slice(0, PAGINATION_SIZE) : ordersRes.rows;

        if (pageOrders.length === 0 && page === 1) {
            return reply(replyToken, '目前沒有待確認的購點訂單。');
        }
        if (pageOrders.length === 0) {
            return reply(replyToken, '沒有更多待確認的訂單了。');
        }

        const orderBubbles = pageOrders.map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${formatIdForDisplay(order.order_id)}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.user_name}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${formatIdForDisplay(order.user_id)}`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last_5_digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&order_id=${order.order_id}`, displayText: `確認訂單 ${order.order_id} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&order_id=${order.order_id}`, displayText: `退回訂單 ${order.order_id}` } }] }}));

        const paginationBubble = createPaginationBubble('action=view_pending_orders', page, hasNextPage);
        if (paginationBubble) {
            orderBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
    } catch (err) {
        console.error('❌ 查詢待確認訂單時發生錯誤:', err);
        return reply(replyToken, '查詢訂單時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}

/**
 * 顯示學員搜尋結果 (支援分頁)
 * @param {string} replyToken - The reply token.
 * @param {string} query - The search query.
 * @param {number} page - The page number to display.
 */
async function showStudentSearchResults(replyToken, query, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    try {
        const res = await pgPool.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) ORDER BY name LIMIT $3 OFFSET $4`, [`%${query.toLowerCase()}%`, query, PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageUsers = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;
        
        if (pageUsers.length === 0 && page === 1) {
            return reply(replyToken, `找不到符合「${query}」的學員。`);
        }
        if (pageUsers.length === 0) {
            return reply(replyToken, '沒有更多符合條件的學員了。');
        }
        
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = pageUsers.map(u => ({
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover', flex: 1 }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' } ] } ] }, { type: 'box', layout: 'vertical', margin: 'lg', contents: [ { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true } ] } ] },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` } }] }
        }));

        const paginationBubble = createPaginationBubble('action=student_search_results', page, hasNextPage, `&query=${encodeURIComponent(query)}`);
        if (paginationBubble) {
            userBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
    } catch (err) {
        console.error('❌ 查詢學員失敗:', err);
        return reply(replyToken, '查詢學員時發生錯誤，請稍後再試。');
    }
}
/**
 * 顯示未回覆的留言 (支援分頁)
 * @param {string} replyToken - The reply token.
 * @param {number} page - The page number to display.
 */
async function showUnreadMessages(replyToken, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const messagesRes = await client.query("SELECT * FROM feedback_messages WHERE status <> 'replied' ORDER BY timestamp DESC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = messagesRes.rows.length > PAGINATION_SIZE;
        const pageMessages = hasNextPage ? messagesRes.rows.slice(0, PAGINATION_SIZE) : messagesRes.rows;

        if (pageMessages.length === 0 && page === 1) {
            return reply(replyToken, '目前沒有未回覆的學員留言。');
        }
        if (pageMessages.length === 0) {
            return reply(replyToken, '沒有更多留言了。');
        }

        const messageBubbles = pageMessages.map(msg => {
            const headerColor = msg.status === 'read' ? '#52b69a' : '#6a7d8b'; 
            const statusText = msg.status === 'read' ? '已讀' : '新留言';
            return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `來自 ${msg.user_name}`, color: '#ffffff', weight: 'bold' }, { type: 'text', text: statusText, color: '#ffffff', size: 'xxs', position: 'absolute', offsetTop: '4px', offsetEnd: '10px' } ], backgroundColor: headerColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: msg.message, wrap: true }, { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 'md' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ ...(msg.status !== 'read' ? [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }] : []), { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } } ] } };
        });

        const paginationBubble = createPaginationBubble('action=view_unread_messages', page, hasNextPage);
        if (paginationBubble) {
            messageBubbles.push(paginationBubble);
        }

        const message = page === 1 
            ? [{ type: 'text', text: '以下是尚未回覆的學員留言：' }, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } }]
            : { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } };
        
        return reply(replyToken, message);

    } catch(err) {
        console.error('❌ 查詢留言時發生錯誤:', err);
        return reply(replyToken, '查詢留言時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}
/**
 * 顯示可供刪除的公告列表 (支援分頁)
 * @param {string} replyToken The reply token.
 * @param {number} page The page number.
 */
async function showAnnouncementsForDeletion(replyToken, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const annRes = await client.query("SELECT * FROM announcements ORDER BY created_at DESC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);

        const hasNextPage = annRes.rows.length > PAGINATION_SIZE;
        const pageAnns = hasNextPage ? annRes.rows.slice(0, PAGINATION_SIZE) : annRes.rows;

        if (pageAnns.length === 0 && page === 1) {
            return reply(replyToken, '目前沒有任何可以刪除的公告。');
        }
        if (pageAnns.length === 0) {
            return reply(replyToken, '沒有更多公告了。');
        }

        const announcementBubbles = pageAnns.map(ann => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'text',
                        text: ann.content,
                        wrap: true,
                        maxLines: 5
                    },
                    {
                        type: 'text',
                        text: `由 ${ann.creator_name} 於 ${formatDateTime(ann.created_at)} 發布`,
                        size: 'xs',
                        color: '#aaaaaa',
                        margin: 'md'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#DE5246',
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '刪除此公告',
                            data: `action=select_announcement_for_deletion&ann_id=${ann.id}`
                        }
                    }
                ]
            }
        }));

        const paginationBubble = createPaginationBubble('view_announcements_for_deletion', page, hasNextPage);
        if (paginationBubble) {
            announcementBubbles.push(paginationBubble);
        }

        const message = {
            type: 'flex',
            altText: '請選擇要刪除的公告',
            contents: {
                type: 'carousel',
                contents: announcementBubbles
            }
        };

        return reply(replyToken, message);

    } catch (err) {
        console.error('❌ 查詢公告列表失敗:', err);
        return reply(replyToken, '查詢公告時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}
async function showCourseSeries(replyToken, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const seriesRes = await client.query(
            `SELECT DISTINCT SUBSTRING(id, 1, 2) as prefix 
             FROM courses 
             WHERE time > NOW() 
             ORDER BY prefix 
             LIMIT $1 OFFSET $2`,
            [PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = seriesRes.rows.length > PAGINATION_SIZE;
        const pageSeries = hasNextPage ? seriesRes.rows.slice(0, PAGINATION_SIZE) : seriesRes.rows;

        const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };

        if (pageSeries.length === 0 && page === 1) {
            const introText = '目前沒有任何進行中的課程系列。';
            return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: '新增課程', contents: addCourseBubble }]);
        }
        if (pageSeries.length === 0) {
            return reply(replyToken, '沒有更多課程系列了。');
        }

        const courseGroupPromises = pageSeries.map(async (row) => {
            const prefix = row.prefix;
            const detailRes = await client.query(
                `SELECT title, time, points_cost 
                 FROM courses 
                 WHERE id LIKE $1 AND time > NOW() 
                 ORDER BY time ASC LIMIT 1`,
                [`${prefix}%`]
            );
            if (detailRes.rows.length === 0) return null;
            const details = detailRes.rows[0];
            return {
                prefix: prefix,
                mainTitle: details.title.replace(/ - 第 \d+ 堂$/, ''),
                earliestTime: details.time,
                points_cost: details.points_cost
            };
        });

        const courseGroups = (await Promise.all(courseGroupPromises)).filter(Boolean);

        const courseBubbles = courseGroups.map(group => ({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                { type: 'text', text: group.mainTitle, weight: 'bold', size: 'xl', wrap: true },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: group.prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(group.earliestTime), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${group.points_cost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
            ]},
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [
                { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${group.prefix}` } },
                { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${group.prefix}` } },
            ]},
        }));
        
        courseBubbles.push(addCourseBubble);

        const paginationBubble = createPaginationBubble('action=view_course_series', page, hasNextPage);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        const introText = '以下為各課程系列的管理選項：';
        const message = page === 1
            ? [{ type: 'text', text: introText }, { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles } }]
            : { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles } };

        return reply(replyToken, message);

    } catch (err) {
        console.error('❌ 查詢課程管理時發生錯誤:', err);
        return reply(replyToken, '查詢課程資訊時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}

// [修改] 顯示待處理的商品訂單 (加入管理按鈕)
async function showPendingShopOrders(replyToken, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const ordersRes = await client.query("SELECT * FROM product_orders WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = ordersRes.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? ordersRes.rows.slice(0, PAGINATION_SIZE) : ordersRes.rows;

        if (pageOrders.length === 0 && page === 1) {
            return reply(replyToken, '目前沒有待處理的商品訂單。');
        }
        if (pageOrders.length === 0) {
            return reply(replyToken, '沒有更多待處理的訂單了。');
        }

        const orderBubbles = pageOrders.map(order => ({
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '待處理訂單', color: '#ffffff', weight: 'bold' }],
                backgroundColor: '#6A7D8B',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: `訂單ID: ${order.order_uid}`, size: 'xxs', color: '#aaaaaa' },
                    { type: 'separator', margin: 'md' },
                    { type: 'text', text: `學員: ${order.user_name}`, weight: 'bold', size: 'md' },
                    { type: 'text', text: `商品: ${order.product_name}` },
                    { type: 'text', text: `花費: ${order.points_spent} 點` },
                    { type: 'text', text: `時間: ${formatDateTime(order.created_at)}`, size: 'xs', color: '#aaaaaa', margin: 'md' }
                ]
            },
            footer: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#52B69A',
                        height: 'sm',
                        action: { type: 'postback', label: '✅ 完成', data: `action=complete_shop_order&order_id=${order.id}` }
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        color: '#DE5246',
                        height: 'sm',
                        action: { 
                            type: 'postback', 
                            label: '❌ 取消', 
                            data: `action=cancel_shop_order&order_id=${order.id}&user_id=${order.user_id}&product_id=${order.product_id}&points=${order.points_spent}` 
                        }
                    }
                ]
            }
        }));

        const paginationBubble = createPaginationBubble('action=view_pending_shop_orders', page, hasNextPage);
        if (paginationBubble) {
            orderBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '待處理商品訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
    } catch (err) {
        console.error('❌ 查詢商品訂單時發生錯誤:', err);
        return reply(replyToken, '查詢商品訂單時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}

// [新增] 顯示學員的商品兌換紀錄
async function showProductOrderHistory(replyToken, userId, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query("SELECT * FROM product_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [userId, PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return reply(replyToken, '您沒有任何商品兌換紀錄。');
        }
        if (pageOrders.length === 0) {
            return reply(replyToken, '沒有更多紀錄了。');
        }

        const historyBubbles = pageOrders.map(order => {
            let statusText, statusColor;
            switch (order.status) {
                case 'completed': statusText = '✅ 已完成/可領取'; statusColor = '#52b69a'; break;
                case 'pending': statusText = '🕒 處理中'; statusColor = '#ff9e00'; break;
                case 'cancelled': statusText = '❌ 已取消'; statusColor = '#d90429'; break;
                default: statusText = '未知狀態'; statusColor = '#6c757d';
            }
            return {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: statusText, color: '#ffffff', weight: 'bold' }], backgroundColor: statusColor, paddingAll: 'lg' },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: order.product_name, weight: 'bold', size: 'lg', wrap: true },
                        { type: 'text', text: `花費: ${order.points_spent} 點`, size: 'sm' },
                        { type: 'separator', margin: 'md' },
                        { type: 'text', text: `訂單ID: ${order.order_uid}`, size: 'xxs', color: '#aaaaaa', wrap: true },
                        { type: 'text', text: `時間: ${formatDateTime(order.created_at)}`, size: 'xs', color: '#aaaaaa' }
                    ]
                }
            };
        });

        const paginationBubble = createPaginationBubble('action=view_product_order_history', page, hasNextPage);
        if (paginationBubble) {
            historyBubbles.push(paginationBubble);
        }
        
        const message = page === 1
            ? [{ type: 'text', text: '以下是您近期的商品兌換紀錄：' }, { type: 'flex', altText: '兌換紀錄', contents: { type: 'carousel', contents: historyBubbles } }]
            : { type: 'flex', altText: '兌換紀錄', contents: { type: 'carousel', contents: historyBubbles } };

        return reply(replyToken, message);

    } catch(err) {
        console.error('❌ 查詢兌換紀錄失敗:', err);
        return reply(replyToken, '查詢兌換紀錄時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  // ... (此處省略現有的 pending... 處理區塊，以專注於新增功能)
  // ... (pendingAnnouncementCreation, pendingAnnouncementDeletion, etc. 的程式碼照舊)
    if (pendingProductCreation[userId]) {
        // Phase 1 暫未實作新增流程，待 Phase 2 或之後的版本加入
        // 為了避免卡住，這裡先簡單處理取消
        if (text === COMMANDS.GENERAL.CANCEL) {
            delete pendingProductCreation[userId];
            return reply(replyToken, '已取消新增商品。');
        }
        return reply(replyToken, '商品新增功能開發中，請先取消操作。', getCancelMenu());
    }

  if (pendingAnnouncementCreation[userId]) {
    const state = pendingAnnouncementCreation[userId];
    switch (state.step) {
      case 'await_content':
        state.content = text;
        state.step = 'await_confirmation';
        const confirmMsg = {
          type: 'flex',
          altText: '確認公告內容',
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'lg',
              contents: [
                { type: 'text', text: '請確認公告內容', weight: 'bold', size: 'lg' },
                { type: 'separator' },
                { type: 'text', text: state.content, wrap: true }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
              ]
            }
          }
        };
        return reply(replyToken, confirmMsg);
      case 'await_confirmation':
        if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
          await pgPool.query(
            "INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)",
            [state.content, userId, user.name]
          );
          delete pendingAnnouncementCreation[userId];
          return reply(replyToken, '✅ 公告已成功頒佈！學員可在「最新公告」中查看。');
        } else {
          return reply(replyToken, '請點擊「確認頒佈」或「取消操作」。');
        }
    }
    return;
  }

  if (pendingAnnouncementDeletion[userId]) {
    const state = pendingAnnouncementDeletion[userId];
    if (text === COMMANDS.TEACHER.CONFIRM_DELETE_ANNOUNCEMENT) {
        await pgPool.query("DELETE FROM announcements WHERE id = $1", [state.ann_id]);
        delete pendingAnnouncementDeletion[userId];
        return reply(replyToken, '✅ 公告已成功刪除。');
    } else {
        return reply(replyToken, '請點擊「確認刪除」或「取消操作」。');
    }
    return;
  }
  
  if (pendingCourseCancellation[userId]) {
    const state = pendingCourseCancellation[userId];
    switch(state.type) {
      case 'batch':
        if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
          const backgroundState = { ...state };
          delete pendingCourseCancellation[userId];

          try {
            await push(userId, '✅ 指令已收到，正在為您批次取消課程。\n完成後將會另行通知，請稍候...');
            reply(replyToken, []).catch(err => { if (!err.message.includes('Invalid reply token')) { console.error('Error sending empty reply:', err); } });

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

          } catch (error) {
            const statusCode = error.originalError?.response?.status;
            const errorMessage = error.originalError?.response?.data?.message || '';
            if (statusCode === 429 || errorMessage.toLowerCase().includes('limit')) {
                return reply(replyToken, '❗️操作中止\n原因：本月的主動推播訊息額度已用盡，無法保證能通知您任務結果，因此已自動取消本次操作。');
            } else {
                console.error('❌ 啟動批次取消時發生非預期的錯誤:', error);
                return reply(replyToken, '執行指令時發生未知錯誤，已取消操作。');
            }
          }
          return;
        }
        break;
      case 'single':
         if (text === COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
            const client = await pgPool.connect();
            try {
              await client.query('BEGIN');
              const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [state.course_id]);
              if (courseToCancelRes.rows.length === 0) {
                delete pendingCourseCancellation[userId];
                return reply(replyToken, "找不到該課程，可能已被取消。");
              }
              const course = courseToCancelRes.rows[0];
              for (const studentId of course.students) {
                 await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                 push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
              }
              await client.query("DELETE FROM courses WHERE id = $1", [state.course_id]);
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
    switch (state.step) {
        case 'await_title':
            state.title = text;
            state.step = 'await_weekday';
            const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
            return reply(replyToken, `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, weekdayButtons);
        case 'await_time':
            if (!/^\d{2}:\d{2}$/.test(text)) {
                return reply(replyToken, '時間格式不正確，請輸入四位數時間，例如：19:30', getCancelMenu());
            }
            state.time = text;
            state.step = 'await_sessions';
            return reply(replyToken, '請問這個系列總共要開設幾堂課？（請輸入數字）', getCancelMenu());
       case 'await_sessions':
            const sessions = parseInt(text, 10);
            if (isNaN(sessions) || sessions <= 0) {
                return reply(replyToken, '堂數必須是正整數，請重新輸入。', getCancelMenu());
            }
            state.sessions = sessions;
            state.step = 'await_capacity';
            return reply(replyToken, '請問每堂課的名額限制？（請輸入數字）', getCancelMenu());
        case 'await_capacity':
            const capacity = parseInt(text, 10);
            if (isNaN(capacity) || capacity <= 0) {
                return reply(replyToken, '名額必須是正整數，請重新輸入。', getCancelMenu());
            }
            state.capacity = capacity;
            state.step = 'await_points';
            return reply(replyToken, '請問每堂課需要消耗多少點數？（請輸入數字）', getCancelMenu());
        case 'await_points':
            const points = parseInt(text, 10);
            if (isNaN(points) || points < 0) {
                return reply(replyToken, '點數必須是正整數或 0，請重新輸入。', getCancelMenu());
            }
            state.points_cost = points;
            state.step = 'await_confirmation';
            const firstDate = getNextDate(state.weekday, state.time);
            const summary = `請確認課程資訊：\n\n標題：${state.title}\n時間：每${state.weekday_label} ${state.time}\n堂數：${state.sessions} 堂\n名額：${state.capacity} 位\n費用：${state.points_cost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
            return reply(replyToken, summary, [
                { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } },
                { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
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
                            points_cost: state.points_cost,
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
                return reply(replyToken, '請點擊「✅ 確認新增」或「❌ 取消操作」。');
            }
    }
  } else if (pendingManualAdjust[userId]) {
    const state = pendingManualAdjust[userId];
    switch (state.step) {
      case 'await_student_search':
        const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
        if (res.rows.length === 0) {
          return reply(replyToken, `找不到學員「${text}」。請重新輸入或取消操作。`, getCancelMenu());
        }
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = res.rows.map(u => ({ 
            type: 'bubble', 
            body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, 
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } 
        }));
        return reply(replyToken, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
      
      case 'await_operation':
        if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
          state.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
          state.step = 'await_amount';
          return reply(replyToken, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`, getCancelMenu());
        } else {
          return reply(replyToken, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
        }

      case 'await_amount':
        const amount = parseInt(text, 10);
        if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數格式不正確，請輸入一個大於 0 的正整數。', getCancelMenu()); }
        state.amount = amount;
        state.step = 'await_reason';
        return reply(replyToken, '請輸入調整原因（例如：活動獎勵、課程補償等）：', getCancelMenu());

      case 'await_reason':
        state.reason = text;
        state.step = 'await_confirmation';
        const opText = state.operation === 'add' ? `增加 ${state.amount} 點` : `扣除 ${state.amount} 點`;
        const summary = `請確認調整內容：\n\n對象：${state.targetStudent.name}\n操作：${opText}\n原因：${state.reason}`;
        return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } } ]);

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
    return showStudentSearchResults(replyToken, searchQuery, 1);
  } else if (pendingReply[userId]) {
    const state = pendingReply[userId];
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
  } else if (pendingMessageSearchQuery[userId] || pendingProductCreation[userId]) {
    return;
  } else {
    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
        return showCourseSeries(replyToken, 1);
    } else if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const client = await pgPool.connect();
        try {
            const pendingRes = await client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'");
            const pendingCount = parseInt(pendingRes.rows[0].count, 10);
            const cardTitle = pendingCount > 0 ? `待確認清單 (${pendingCount})` : '待確認清單';
            const cardColor = pendingCount > 0 ? '#DE5246' : '#FF9E00';

            const flexMessage = {
              type: 'flex', altText: '點數管理選單',
              contents: {
                type: 'carousel',
                contents: [
                  { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: cardTitle, color: '#FFFFFF', weight: 'bold', size: 'lg' } ], backgroundColor: cardColor }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: '審核學員的購點申請，確認匯款資訊並為其加點。', wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', action: { type: 'message', label: '查看清單', text: COMMANDS.TEACHER.PENDING_ORDERS }, style: 'primary', color: cardColor } ] } },
                  { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '手動調整點數', color: '#FFFFFF', weight: 'bold', size: 'lg' } ], backgroundColor: '#1A759F' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: '用於特殊情況(如活動獎勵、課程補償)，直接為學員增減點數。', wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', action: { type: 'message', label: '開始調整', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS }, style: 'primary', color: '#1A759F' } ] } }
                ]
              }
            };
            return reply(replyToken, flexMessage);
        } finally {
            if(client) client.release();
        }
    } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const flexMessage = {
            type: 'flex', altText: '學員管理選單',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員管理', color: '#FFFFFF', weight: 'bold', size: 'lg' }], backgroundColor: '#6A7D8B' },
                body: { type: 'box', layout: 'vertical', spacing: 'lg', contents: [ { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查詢學員', weight: 'bold', size: 'md' }, { type: 'text', text: '依姓名或ID查詢學員的詳細資料與點數紀錄。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '開始查詢', text: COMMANDS.TEACHER.SEARCH_STUDENT } } ] }, { type: 'separator' }, { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查看留言', weight: 'bold', size: 'md' }, { type: 'text', text: '查看並回覆學員的留言。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '查看未回覆留言', text: COMMANDS.TEACHER.VIEW_MESSAGES } } ] } ] }
            }
        };
        return reply(replyToken, flexMessage);
    } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
        pendingManualAdjust[userId] = { step: 'await_student_search' };
        setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入您想調整點數的學員姓名或 User ID：', getCancelMenu());
    } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
        pendingStudentSearchQuery[userId] = {};
        const onTimeoutCallback = (u) => {
            if (pendingStudentSearchQuery[u]) {
                delete pendingStudentSearchQuery[u];
                push(u, '查詢學員逾時，自動取消。').catch(e => console.error(e));
            }
        };
        setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', onTimeoutCallback);
        return reply(replyToken, '請輸入您想查詢的學員姓名或 User ID：', getCancelMenu());
    } else if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
        return showUnreadMessages(replyToken, 1);
    } else if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        const announcementMenu = [
            { type: 'action', action: { type: 'message', label: '頒佈新公告', text: COMMANDS.TEACHER.ADD_ANNOUNCEMENT } },
            { type: 'action', action: { type: 'message', label: '刪除舊公告', text: COMMANDS.TEACHER.DELETE_ANNOUNCEMENT } },
        ];
        return reply(replyToken, '請選擇公告管理功能：', announcementMenu);
    } else if (text === COMMANDS.TEACHER.ADD_ANNOUNCEMENT) {
        pendingAnnouncementCreation[userId] = { step: 'await_content' };
        setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => push(u, '頒佈公告操作逾時，自動取消。').catch(e => console.error(e)));
        return reply(replyToken, '請輸入要頒佈的公告內容：', getCancelMenu());
    } else if (text === COMMANDS.TEACHER.DELETE_ANNOUNCEMENT) {
        return showAnnouncementsForDeletion(replyToken, 1);
    } else if (text === COMMANDS.TEACHER.SHOP_MANAGEMENT) {
        const shopMenu = [ 
            { type: 'action', action: { type: 'message', label: '上架新商品', text: COMMANDS.TEACHER.ADD_PRODUCT } }, 
            { type: 'action', action: { type: 'message', label: '修改商品資訊', text: COMMANDS.TEACHER.EDIT_PRODUCT } },
            { type: 'action', action: { type: 'message', label: '訂單管理', text: COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT } } 
        ];
        return reply(replyToken, '請選擇商城管理功能：', shopMenu);
    } else if (text === COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT) {
        const orderMenu = [
            { type: 'action', action: { type: 'message', label: '查看待處理訂單', text: COMMANDS.TEACHER.PENDING_SHOP_ORDERS } }
        ];
        return reply(replyToken, '請選擇訂單管理功能：', orderMenu);
    } else if (text === COMMANDS.TEACHER.PENDING_SHOP_ORDERS) {
        return showPendingShopOrders(replyToken, 1);
    } else if (text === COMMANDS.TEACHER.REPORT) {
        const reportMenu = {
            type: 'flex', altText: '統計報表選單',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📊 統計報表', weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#6A7D8B', paddingBottom: 'none' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '📈 課程報表', text: COMMANDS.TEACHER.COURSE_REPORT } }, { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '💰 訂單報表', text: COMMANDS.TEACHER.ORDER_REPORT } }, { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '💎 點數報表', text: COMMANDS.TEACHER.POINT_REPORT } } ] }
            }
        };
        return reply(replyToken, reportMenu);
    } else if (text === COMMANDS.TEACHER.COURSE_REPORT || text === COMMANDS.TEACHER.ORDER_REPORT) {
        const reportType = text === COMMANDS.TEACHER.COURSE_REPORT ? 'course' : 'order';
        const title = text === COMMANDS.TEACHER.COURSE_REPORT ? '課程報表' : '訂單報表';
        const timePeriodMenu = {
            type: 'flex', altText: '選擇時間週期',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#52b69a' },
                body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本週', data: `action=generate_report&type=${reportType}&period=week` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本月', data: `action=generate_report&type=${reportType}&period=month` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本季', data: `action=generate_report&type=${reportType}&period=quarter` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '今年', data: `action=generate_report&type=${reportType}&period=year` } }, ] },
                 footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請選擇要查詢的時間區間', size: 'sm', color: '#AAAAAA', align: 'center'}] }
            }
        };
        return reply(replyToken, timePeriodMenu);
    } else if (text === COMMANDS.TEACHER.POINT_REPORT) {
        
        const generateReportTask = async () => {
            const usersRes = await pgPool.query(`SELECT name, points FROM users WHERE role = 'student' ORDER BY points DESC`);
            const students = usersRes.rows;
            if (students.length === 0) {
                return '目前沒有任何學員資料可供分析。';
            }
            const totalPoints = students.reduce((sum, s) => sum + s.points, 0);
            const averagePoints = (totalPoints / students.length).toFixed(2);
            const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n');
            const zeroPointStudents = students.filter(s => s.points === 0).length;
            return `💎 全體學員點數報告 💎\n\n總學員數：${students.length} 人\n點數總計：${totalPoints} 點\n平均持有：${averagePoints} 點/人\n零點學員：${zeroPointStudents} 人\n\n👑 點數持有 Top 5：\n${top5}`;
        };

        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));

        try {
            const result = await Promise.race([generateReportTask(), timeoutPromise]);

            if (result === 'timeout') {
                await reply(replyToken, '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。');
                
                const reportText = await generateReportTask();
                await push(userId, reportText);

            } else {
                await reply(replyToken, result);
            }
        } catch (err) {
            console.error('❌ 即時生成點數報表失敗:', err);
            await reply(replyToken, '❌ 產生報表時發生錯誤，請稍後再試。');
        }
        
        return;

    } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        return showPendingOrders(replyToken, 1);
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
