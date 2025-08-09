// index.js - V18.0 (全方位重構與優化)
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

// [V18.0] 新增通用錯誤訊息
const GENERIC_ERROR_MESSAGE = '系統有點忙碌，請稍後再試。若問題持續發生，請聯繫管理員。';

const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 5;
const PAGINATION_SIZE = 9;

const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// [V18.0] 銀行資訊改由 .env 讀取，增強安全性與彈性
const BANK_INFO = {
  accountName: process.env.BANK_ACCOUNT_NAME,
  bankName: process.env.BANK_NAME,
  accountNumber: process.env.BANK_ACCOUNT_NUMBER,
};

// [V18.0] 統一取消指令
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
      COURSE_REPORT: '@課程報表',
      ORDER_REPORT: '@訂單報表',
      POINT_REPORT: '@點數報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CONFIRM_MANUAL_ADJUST: '✅ 確認調整',
    ADD_POINTS: '+ 加點',
    DEDUCT_POINTS: '- 扣點',
    MESSAGE_SEARCH: '@查詢留言',
    CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認發布',
    CANCEL_ADD_ANNOUNCEMENT: '❌ 取消發布',
    CONFIRM_DELETE_ANNOUNCEMENT: '✅ 確認刪除',
    ABANDON_DELETE_ANNOUNCEMENT: '❌ 放棄刪除',
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
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
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
        // [V18.0] 新增銀行資訊環境變數檢查
        'BANK_ACCOUNT_NAME',
        'BANK_NAME',
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
    
    // [V18.0] 資料庫欄位統一為 snake_case
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
    
    // 以下為舊版本欄位檢查與新增，V18.0 後新部署的資料庫會直接建立正確欄位
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

    await cleanCoursesDB(client);
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  } finally {
    // [V18.0] 確保連線釋放
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
        // [V18.0] 確保 history 屬性是陣列
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
        // [V18.0] 更新欄位為 snake_case
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
        // [V18.0] 返回物件屬性統一為 snake_case
        return { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, points_cost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function saveCourse(course, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        // [V18.0] 傳入物件與欄位統一為 snake_case
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
        // [V18.0] 屬性統一為 snake_case
        const coursesToDelete = coursesToDeleteRes.rows.map(row => ({
            id: row.id, title: row.title, time: row.time.toISOString(), points_cost: row.points_cost, students: row.students || [], waiting: row.waiting || []
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
        // [V18.0] 傳入物件與欄位統一為 snake_case
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
  try {
    await client.replyMessage(replyToken, messages);
  } catch (error) {
    console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response.data : error.message);
    // [V18.0] 不向上拋出錯誤，避免中斷主流程，reply 失敗通常無法補救
  }
}

async function push(to, content) {
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : (typeof content === 'object' && content !== null && content.type ? [content] : [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }]));
  try {
    await client.pushMessage(to, messages);
  } catch (error) {
    console.error(`❌ push 函式發送失敗給 ${to}:`, `狀態碼: ${error.originalError?.response?.status || 'N/A'},`, `訊息: ${error.originalError?.response?.statusText || error.message}`);
    // [V18.0] 不向上拋出錯誤，讓主流程繼續
  }
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
        
        // [V18.0] 屬性統一為 snake_case
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
        // [V18.0] 加強錯誤回覆
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
const pendingReportGeneration = {};
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
    pendingBookingConfirmation, // [V18.0] 加入可取消列表
    pendingCourseCancellation, // [V18.0] 加入可取消列表
};

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

/**
 * [V18.0] 集中處理所有取消操作
 * @param {object} event - LINE Webhook 事件物件
 * @param {object} user - 使用者物件
 */
async function handleCancel(event, user) {
    const userId = user.id;
    const replyToken = event.replyToken;

    clearPendingConversations(userId);

    const client = await pgPool.connect();
    try {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = ordersRes.rows[0];
        
        if (pendingOrder) {
            if (pendingOrder.status === 'pending_confirmation') {
                return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。');
            }
            if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
                await deleteOrder(pendingOrder.order_id, client);
                const flexMenu = await buildPointsMenuFlex(userId);
                return reply(replyToken, [{type: 'text', text: '已取消您的待處理訂單。'}, flexMenu]);
            }
        }
    } catch (err) {
        console.error(`[handleCancel] 處理 ${userId} 的取消操作時發生錯誤:`, err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }

    return reply(replyToken, '操作已取消。');
}


async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return false;

    // [V18.0] 取消操作已由 handleCancel 統一處理，此處為向下相容
    if (text === COMMANDS.GENERAL.CANCEL) {
        await handleCancel(event, user);
        return true;
    }

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                // [V18.0] 物件屬性統一為 snake_case
                const order = {
                    order_id: `PO${Date.now()}`,
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

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order.order_id)})。\n\n請匯款至以下帳戶：\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數管理」選單，點擊「❗ 匯款待確認」卡片中的按鈕來回報您的後五碼。`;
                const flexMenu = await buildPointsMenuFlex(userId);
                await reply(event.replyToken, [{ type: 'text', text: replyText }, flexMenu]);
            } else {
                await reply(event.replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.GENERAL.CANCEL}」。`);
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
                            await push(TEACHER_ID, `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認清單」審核。`);
                        }
                    } else {
                        delete pendingPurchase[userId];
                        await reply(event.replyToken, '找不到您的訂單，請重新操作。');
                    }
                } catch(err) {
                    console.error("[handlePurchaseFlow] 輸入後五碼時發生錯誤:", err);
                    await reply(event.replyToken, GENERIC_ERROR_MESSAGE);
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
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}
async function handleAdminCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  // [V18.0] 統一取消入口
  if (text === COMMANDS.GENERAL.CANCEL) {
      return handleCancel(event, user);
  }

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
          await push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。');
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
        } else {
          return reply(replyToken, `請點擊「${COMMANDS.ADMIN.CONFIRM_ADD_TEACHER}」或「${COMMANDS.GENERAL.CANCEL}」。`);
        }
    }
    return;
  }
  
  if (pendingTeacherRemoval[userId]) {
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
          await push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。');
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else {
          return reply(replyToken, `請點擊「${COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER}」或「${COMMANDS.GENERAL.CANCEL}」。`);
        }
    }
    return;
  }

  if (text === COMMANDS.ADMIN.PANEL) {
    const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
    return reply(replyToken, '請選擇管理者功能：', adminMenu);
  }
  if (text === COMMANDS.ADMIN.ADD_TEACHER) {
    pendingTeacherAddition[userId] = { step: 'await_student_info' };
    setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => push(u, '授權老師操作逾時，自動取消。'));
    return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', getCancelMenu());
  }
  if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
      return showTeacherListForRemoval(replyToken, 1);
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

        const orderBubbles = pageOrders.map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${formatIdForDisplay(order.order_id)}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.user_name}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${formatIdForDisplay(order.user_id)}`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last_5_digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.order_id}`, displayText: `確認訂單 ${order.order_id} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.order_id}`, displayText: `退回訂單 ${order.order_id}` } }] }}));

        const paginationBubble = createPaginationBubble('action=view_pending_orders', page, hasNextPage);
        if (paginationBubble) {
            orderBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
    } catch (err) {
        console.error('❌ 查詢待確認訂單時發生錯誤:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}

async function showStudentSearchResults(replyToken, query, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) ORDER BY name LIMIT $3 OFFSET $4`, [`%${query.toLowerCase()}%`, query, PAGINATION_SIZE + 1, offset]);
        
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
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}
async function showPurchaseHistory(replyToken, userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`, [userId, PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return reply(replyToken, '您沒有任何購點紀錄。');
        }
         if (pageOrders.length === 0) {
            return reply(replyToken, '沒有更多紀錄了。');
        }

        const historyBubbles = pageOrders.map(order => {
            let statusText, statusColor;
            switch (order.status) {
                case 'completed': statusText = '✅ 已完成'; statusColor = '#52b69a'; break;
                case 'pending_confirmation': statusText = '🕒 等待確認'; statusColor = '#ff9e00'; break;
                case 'pending_payment': statusText = '❗ 等待付款'; statusColor = '#f28482'; break;
                case 'rejected': statusText = '❌ 已退回'; statusColor = '#d90429'; break;
                default: statusText = '未知狀態'; statusColor = '#6c757d';
            }
            return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: statusText, color: '#ffffff', weight: 'bold' }], backgroundColor: statusColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `購買 ${order.points} 點`, weight: 'bold', size: 'lg' }, { type: 'text', text: `金額: ${order.amount} 元`, size: 'sm' }, { type: 'text', text: `後五碼: ${order.last_5_digits || 'N/A'}`, size: 'sm' }, { type: 'text', text: `訂單ID: ${formatIdForDisplay(order.order_id)}`, size: 'xxs', color: '#aaaaaa', wrap: true }, { type: 'text', text: `時間: ${formatDateTime(order.timestamp)}`, size: 'xs', color: '#aaaaaa' } ] } };
        });

        const paginationBubble = createPaginationBubble('action=view_purchase_history', page, hasNextPage);
        if (paginationBubble) {
            historyBubbles.push(paginationBubble);
        }
        
        const message = page === 1
            ? [{ type: 'text', text: '以下是您近期的購點紀錄：' }, { type: 'flex', altText: '購點紀錄', contents: { type: 'carousel', contents: historyBubbles } }]
            : { type: 'flex', altText: '購點紀錄', contents: { type: 'carousel', contents: historyBubbles } };

        return reply(replyToken, message);

    } catch(err) {
        console.error('❌ 查詢購點紀錄失敗:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}

async function showAvailableCourses(replyToken, userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const sevenDaysLater = new Date(Date.now() + 7 * ONE_DAY_IN_MS);
        const res = await client.query(
            `SELECT * FROM courses
             WHERE time > NOW() AND time < $1
             AND COALESCE(array_length(students, 1), 0) < capacity
             AND NOT ($2 = ANY(students))
             AND NOT ($2 = ANY(waiting))
             ORDER BY time ASC LIMIT $3 OFFSET $4`,
            [sevenDaysLater, userId, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageCourses.length === 0 && page === 1) {
            return reply(replyToken, '抱歉，未來 7 天內沒有可預約的課程。\n您可至「我的課程」查看候補中的課程，或等候老師發布新課程。');
        }
        if (pageCourses.length === 0) {
            return reply(replyToken, '沒有更多可預約的課程了。');
        }

        const courseItems = pageCourses.map(c => {
            const remainingSpots = c.capacity - (c.students?.length || 0);
            return {
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                    { type: 'box', layout: 'horizontal', contents: [
                            { type: 'text', text: c.title, weight: 'bold', size: 'md', wrap: true, flex: 3 },
                            { type: 'text', text: `${c.points_cost} 點`, color: '#1A759F', weight: 'bold', size: 'md', align: 'end', flex: 1 }
                    ]},
                    { type: 'box', layout: 'horizontal', contents: [
                          { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666', flex: 2 },
                          { type: 'text', text: `剩餘 ${remainingSpots} 名`, size: 'sm', color: '#666666', align: 'end', flex: 1 }
                    ]},
                    { type: 'button', style: 'primary', height: 'sm', margin: 'md',
                        action: { type: 'postback', label: '預約此課程', data: `action=confirm_booking_start&courseId=${c.id}` }
                    }
                ]
            };
        });
        
        let contents = courseItems.flatMap((item, index) =>
            index < courseItems.length - 1 ? [item, { type: 'separator', margin: 'lg' }] : [item]
        );

        const paginationBubbleBody = createPaginationBubble('action=view_available_courses', page, hasNextPage)?.body;
        if(paginationBubbleBody) {
            contents.push({ type: 'separator', margin: 'lg' });
            contents.push(paginationBubbleBody);
        }

        const flexMessage = {
            type: 'flex', altText: '可預約的課程列表',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', backgroundColor: '#52b69a', paddingAll: 'lg',
                    contents: [{ type: 'text', text: `7日內可預約課程 (第${page}頁)`, color: '#ffffff', weight: 'bold', size: 'lg' }]
                },
                body: { type: 'box', layout: 'vertical', contents: contents }
            }
        };
        return reply(replyToken, flexMessage);
    } catch(err) {
        console.error('❌ 查詢可預約課程失敗:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}

async function showMyCourses(replyToken, userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            `SELECT * FROM courses
             WHERE time > NOW()
             AND ($1 = ANY(students) OR $1 = ANY(waiting))
             ORDER BY time ASC LIMIT $2 OFFSET $3`,
            [userId, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageCourses.length === 0 && page === 1) {
            return reply(replyToken, '您目前沒有任何已預約或候補中的課程。');
        }
        if (pageCourses.length === 0) {
            return reply(replyToken, '沒有更多課程了。');
        }

        const courseBubbles = pageCourses.map(c => {
            const isBooked = c.students.includes(userId);
            const courseMainTitle = c.title.replace(/ - 第 \d+ 堂$/, '');
            const actionLabel = isBooked ? '取消預約' : '取消候補';
            const postbackAction = isBooked ? 'confirm_cancel_booking_start' : 'confirm_cancel_waiting_start';
            
            const statusBoxContents = [
                { type: 'text', text: isBooked ? '✅ 已預約' : '🕒 候補中', weight: 'bold', size: 'sm', color: isBooked ? '#1a759f' : '#ff9e00' }
            ];
            if (!isBooked) {
                statusBoxContents.push({ type: 'text', text: `候補順位: 第 ${c.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666', align: 'end' });
            }

            return {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', backgroundColor: '#1a759f', paddingAll: 'lg',
                    contents: [{ type: 'text', text: courseMainTitle, color: '#ffffff', weight: 'bold', size: 'lg', wrap: true }]
                },
                body: { type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'box', layout: 'horizontal', contents: statusBoxContents, margin: 'none', paddingBottom: 'md' },
                        { type: 'text', text: c.title, weight: 'bold', size: 'md', wrap: true, margin: 'md' },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm',
                    contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm',
                        action: { type: 'postback', label: actionLabel, data: `action=${postbackAction}&courseId=${c.id}` }
                    }]
                }
            };
        });
        
        const paginationBubble = createPaginationBubble('action=view_my_courses', page, hasNextPage);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles }});

    } catch(err) {
        console.error('❌ 查詢我的課程失敗:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}

async function showShopProducts(replyToken, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const productsRes = await client.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = productsRes.rows.length > PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            return reply(replyToken, '目前商城沒有任何商品，敬請期待！');
        }
        if (pageProducts.length === 0) {
            return reply(replyToken, '沒有更多商品了。');
        }

        const productBubbles = pageProducts.map(p => ({ type: 'bubble', hero: p.image_url ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } : undefined, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: p.name, weight: 'bold', size: 'xl' }, { type: 'text', text: `${p.price} 點`, size: 'lg', margin: 'md', color: '#1A759F', weight: 'bold' }, { type: 'text', text: p.description, wrap: true, size: 'sm', margin: 'md' }, ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'secondary', action: { type: 'uri', label: '聯絡老師詢問', uri: `https://line.me/R/ti/p/${TEACHER_ID}` } } ]} }));
        
        const paginationBubble = createPaginationBubble('action=view_shop_products', page, hasNextPage);
        if (paginationBubble) {
            productBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles } });
    } catch (err) {
        console.error('❌ 查詢商城商品失敗:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}

async function showSingleCoursesForCancellation(replyToken, prefix, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const coursesRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT $2 OFFSET $3", [`${prefix}%`, PAGINATION_SIZE + 1, offset]);

        const hasNextPage = coursesRes.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, PAGINATION_SIZE) : coursesRes.rows;

        if (pageCourses.length === 0 && page === 1) {
          return reply(replyToken, "此系列沒有可取消的未來課程。");
        }
        if (pageCourses.length === 0) {
            return reply(replyToken, '沒有更多課程了。');
        }

        const courseBubbles = pageCourses.map(c => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: c.title, wrap: true, weight: 'bold' },
                    { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'md'}
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂課', data: `action=confirm_single_course_cancel&courseId=${c.id}` } }]
            }
        }));

        const paginationBubble = createPaginationBubble('action=manage_course_group', page, hasNextPage, `&prefix=${prefix}`);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return reply(replyToken, { type: 'flex', altText: '請選擇要單次取消的課程', contents: { type: 'carousel', contents: courseBubbles } });
    } catch (err) {
        console.error('❌ 查詢單堂課程失敗:', err);
        return reply(replyToken, GENERIC_ERROR_MESSAGE);
    } finally {
        if(client) client.release();
    }
}


async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (text === COMMANDS.GENERAL.CANCEL) {
    return handleCancel(event, user);
  }

  if (await handlePurchaseFlow(event, userId)) {
    return;
  }
  
  if (pendingBookingConfirmation[userId]) {
    const state = pendingBookingConfirmation[userId];
    const course = await getCourse(state.courseId);
    if (!course) {
        delete pendingBookingConfirmation[userId];
        return reply(replyToken, '抱歉，找不到該課程，可能已被老師取消。');
    }

    switch (state.type) {
        case 'book':
            if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    const userForUpdate = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdate = await client.query('SELECT students, capacity FROM courses WHERE id = $1 FOR UPDATE', [state.courseId]);
                    
                    if (userForUpdate.rows[0].points < course.points_cost) {
                        await client.query('ROLLBACK');
                        delete pendingBookingConfirmation[userId];
                        return reply(replyToken, `預約失敗，您的點數不足！\n目前點數：${userForUpdate.rows[0].points}\n需要點數：${course.points_cost}`);
                    }
                    if (courseForUpdate.rows[0].students.length >= courseForUpdate.rows[0].capacity) {
                        await client.query('ROLLBACK');
                        delete pendingBookingConfirmation[userId];
                        return reply(replyToken, '抱歉，課程名額已滿，已被其他同學搶先預約了。');
                    }

                    const newPoints = userForUpdate.rows[0].points - course.points_cost;
                    const newStudents = [...courseForUpdate.rows[0].students, userId];
                    const historyEntry = { action: `預約課程：${course.title}`, pointsChange: -course.points_cost, time: new Date().toISOString() };
                    const newHistory = userForUpdate.rows[0].history ? [...userForUpdate.rows[0].history, historyEntry] : [historyEntry];

                    await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                    await client.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, state.courseId]);
                    await client.query('COMMIT');

                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, `✅ 預約成功！\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n已為您扣除 ${course.points_cost} 點，期待課堂上見！`);
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error('預約課程失敗:', e);
                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, GENERIC_ERROR_MESSAGE);
                } finally {
                    if(client) client.release();
                }
            } else {
                return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.GENERAL.CANCEL}」。`);
            }
            break;
        
        case 'cancel_book':
            if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    
                    const userForUpdateRes = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdateRes = await client.query('SELECT students, waiting, points_cost FROM courses WHERE id = $1 FOR UPDATE', [state.courseId]);
                    
                    const pointsToRefund = courseForUpdateRes.rows[0].points_cost;
                    const newPoints = userForUpdateRes.rows[0].points + pointsToRefund;
                    const newStudents = courseForUpdateRes.rows[0].students.filter(id => id !== userId);
                    const historyEntry = { action: `取消預約：${course.title}`, pointsChange: +pointsToRefund, time: new Date().toISOString() };
                    const userHistory = userForUpdateRes.rows[0].history || [];
                    const newHistory = [...userHistory, historyEntry];

                    await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                    
                    let newWaiting = courseForUpdateRes.rows[0].waiting;
                    if (newWaiting.length > 0) {
                        const promotedUserId = newWaiting.shift();
                        newStudents.push(promotedUserId);
                        
                        const promotedUser = await getUser(promotedUserId, client);
                        if (promotedUser) {
                             await push(promotedUserId, `🎉 候補成功通知 🎉\n您候補的課程「${course.title}」已有空位，已為您自動預約成功！`);
                        }
                    }
                    
                    await client.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [newStudents, newWaiting, state.courseId]);
                    await client.query('COMMIT');

                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, `✅ 已為您取消「${course.title}」的預約，並歸還 ${pointsToRefund} 點。`);
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error('取消預約失敗:', e);
                    delete pendingBookingConfirmation[userId];
                    return reply(replyToken, GENERIC_ERROR_MESSAGE);
                } finally {
                    if(client) client.release();
                }
            } else {
                return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING}」或「${COMMANDS.GENERAL.CANCEL}」。`);
            }
            break;

        case 'cancel_wait':
            if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
                const newWaitingList = course.waiting.filter(id => id !== userId);
                await saveCourse({ ...course, waiting: newWaitingList });
                delete pendingBookingConfirmation[userId];
                return reply(replyToken, `✅ 已為您取消「${course.title}」的候補。`);
            } else {
                return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.GENERAL.CANCEL}」。`);
            }
            break;
    }
    return;
  }
  
  if (pendingFeedback[userId]) {
    const feedbackState = pendingFeedback[userId];
    if (feedbackState.step === 'await_message') {
      await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text]);
      delete pendingFeedback[userId];
      await reply(replyToken, '感謝您的留言，我們已收到您的訊息，老師會盡快查看！');
      if (TEACHER_ID) { await push(TEACHER_ID, `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`); }
    }
    return;
  }

  // Main command handling
  if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
      const client = await pgPool.connect();
      try {
          const res = await client.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
          if (res.rows.length === 0) { return reply(replyToken, '目前沒有任何公告。'); }
          const announcement = res.rows[0];
          const announcementMessage = { type: 'flex', altText: '最新公告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } };
          return reply(replyToken, announcementMessage);
      } catch (err) {
          console.error('❌ 查詢最新公告時發生錯誤:', err);
          return reply(replyToken, GENERIC_ERROR_MESSAGE);
      } finally {
          if (client) client.release();
      }
  }
  if (text === COMMANDS.STUDENT.CONTACT_US) {
    pendingFeedback[userId] = { step: 'await_message' };
    setupConversationTimeout(userId, pendingFeedback, 'pendingFeedback', (u) => push(u, '留言逾時，自動取消。'));
    return reply(replyToken, '請輸入您想對老師說的話，或點選下方的「取消操作」。', getCancelMenu());
  }
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    clearPendingConversations(userId);
    return pushPointsMenu(userId);
  }
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
      const client = await pgPool.connect();
      try {
          const existingOrderRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
          if (existingOrderRes.rows.length > 0) {
              const flexMenu = await buildPointsMenuFlex(userId);
              return reply(replyToken, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu]);
          }
          pendingPurchase[userId] = { step: 'select_plan', data: {} };
          setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。請重新購點。'));
          return reply(replyToken, buildBuyPointsFlex());
      } catch(err) {
          console.error("處理購買點數指令時發生錯誤:", err);
          return reply(replyToken, GENERIC_ERROR_MESSAGE);
      } finally {
          if(client) client.release();
      }
  }
  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
      return showPurchaseHistory(replyToken, userId, 1);
  }
  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
      return showAvailableCourses(replyToken, userId, 1);
  }
  if (text === COMMANDS.STUDENT.MY_COURSES) {
      return showMyCourses(replyToken, userId, 1);
  }
  if (text === COMMANDS.STUDENT.SHOP) {
      return showShopProducts(replyToken, 1);
  }
  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
      const client = await pgPool.connect();
      try {
          const orderRes = await client.query("SELECT order_id FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1", [userId]);
          if (orderRes.rows.length > 0) {
              const order_id = orderRes.rows[0].order_id;
              const step = text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER ? 'input_last5' : 'edit_last5';
              pendingPurchase[userId] = { step: step, data: { order_id: order_id } };
              setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '輸入後五碼逾時，自動取消。'));
              return reply(replyToken, '請輸入您的匯款帳號後五碼 (5位數字)：', getCancelMenu());
          } else {
              return reply(replyToken, '您目前沒有需要輸入後五碼的訂單。');
          }
      } catch(err) {
          console.error("處理後五碼觸發指令時發生錯誤:", err);
          return reply(replyToken, GENERIC_ERROR_MESSAGE);
      } finally {
          if(client) client.release();
      }
  }
  
  // Default reply for unrecognized commands
  let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
  if (text.startsWith('@')) {
      const closestCommand = findClosestCommand(text, 'student');
      if (closestCommand) {
          studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
      } else {
          studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`;
      }
  }
  return reply(replyToken, studentSuggestion);
}

async function checkAndSendReminders() {
    const client = await pgPool.connect();
    try {
        const now = Date.now();
        const reminderWindowStart = new Date(now + ONE_HOUR_IN_MS - (1000 * 60 * 5));
        const reminderWindowEnd = new Date(now + ONE_HOUR_IN_MS);

        const res = await client.query(`SELECT * FROM courses WHERE time BETWEEN $1 AND $2`, [reminderWindowStart, reminderWindowEnd]);
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
    } finally {
        if(client) client.release();
    }
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

app.post('/webhook', (req, res) => {
  const signature = crypto.createHmac('SHA256', config.channelSecret).update(req.rawBody).digest('base64');
  if (req.headers['x-line-signature'] !== signature) {
    return res.status(401).send('Unauthorized');
  }
  res.status(200).send('OK');
  Promise.all(req.body.events.map(event => handleEvent(event).catch(err => console.error('❌ handleEvent 執行失敗:', err.stack))));
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  checkEnvironmentVariables();
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  // [V18.0] 更新版本號
  console.log(`Bot 版本: V18.0 (全方位重構與優化)`);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => { if(SELF_URL.startsWith('https')) fetch(SELF_URL).catch(err => console.error("Ping self failed:", err.message)); }, PING_INTERVAL_MS);
});

async function handleEvent(event) {
    if (event.type === 'unfollow' || event.type === 'leave') {
        console.log(`用戶 ${event.source.userId} 已封鎖或離開`);
        return;
    }
    if (!event.replyToken && event.type !== 'postback') {
         return;
    }
    
    const token = event.replyToken;
    if (token && repliedTokens.has(token)) {
      console.log('🔄️ 偵測到重複的 Webhook 事件，已忽略。');
      return;
    }
    if(token) {
      repliedTokens.add(token);
      setTimeout(() => repliedTokens.delete(token), 60000);
    }

    const userId = event.source.userId;
    let user = await getUser(userId);
    
    let isNewFlowCommand = false;
    if (event.type === 'message' && event.message.type === 'text') {
        if (event.message.text.trim().startsWith('@')) {
            isNewFlowCommand = true;
        }
    } else if (event.type === 'postback') {
        const action = new URLSearchParams(event.postback.data).get('action');
        const newFlowActions = ['run_command', 'list_teachers_for_removal', 'generate_report', 'add_course_start'];
        if (newFlowActions.includes(action) || action?.startsWith('view_') || action?.startsWith('manage_')) {
             isNewFlowCommand = true;
        }
    }

    if (isNewFlowCommand) {
        const cleared = clearPendingConversations(userId);
        if (cleared) {
            console.log(`使用者 ${userId} 的待辦任務已由新操作自動取消。`);
            // 可以在此回覆一則提示訊息，但為避免干擾主要流程，暫時只在後台記錄
        }
    }

    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            // [V18.0] 屬性統一為 snake_case
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], picture_url: profile.pictureUrl, last_seen_announcement_id: 0, approved_by: null };
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
            let userNeedsUpdate = false;
            if (profile.displayName !== user.name) {
                user.name = profile.displayName;
                userNeedsUpdate = true;
            }
            if (profile.pictureUrl && profile.pictureUrl !== user.picture_url) {
                user.picture_url = profile.pictureUrl;
                userNeedsUpdate = true;
            }
            if(userNeedsUpdate) await saveUser(user);
        } catch(e) {
            console.error(`更新用戶 ${userId} 資料時出錯:`, e.message);
        }
    }

    if (user.role === 'student') {
        const client = await pgPool.connect();
        try {
            const annRes = await client.query('SELECT id FROM announcements ORDER BY created_at DESC LIMIT 1');
            if (annRes.rows.length > 0 && annRes.rows[0].id > (user.last_seen_announcement_id || 0)) {
                // 可在此處實作主動推播新公告的邏輯
            }
        } catch (err) {
            console.error("檢查新公告時出錯:", err);
        } finally {
            if(client) client.release();
        }
    }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
              user.role = 'admin';
              await saveUser(user);
              if (ADMIN_RICH_MENU_ID) {
                await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID).catch(e => console.error("連結管理者 RichMenu 失敗:", e));
              }
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
        const page = parseInt(data.get('page') || '1', 10);

        // 分頁指令
        const paginationActions = {
            'view_course_series': () => showCourseSeries(replyToken, page),
            'list_teachers_for_removal': () => showTeacherListForRemoval(replyToken, page),
            'view_pending_orders': () => showPendingOrders(replyToken, page),
            'student_search_results': () => showStudentSearchResults(replyToken, decodeURIComponent(data.get('query') || ''), page),
            'view_unread_messages': () => showUnreadMessages(replyToken, page),
            'view_purchase_history': () => showPurchaseHistory(replyToken, userId, page),
            'view_available_courses': () => showAvailableCourses(replyToken, userId, page),
            'view_my_courses': () => showMyCourses(replyToken, userId, page),
            'view_shop_products': () => showShopProducts(replyToken, page),
            'manage_course_group': () => showSingleCoursesForCancellation(replyToken, data.get('prefix'), page),
        };

        if (paginationActions[action]) {
            return paginationActions[action]();
        }

        if (action === 'run_command') {
            const commandText = data.get('text');
            if (commandText) {
                const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: `simulated-${Date.now()}`, text: commandText } };
                // 重新獲取最新的 user 物件，因為 role 可能在模擬身份時改變
                const currentUser = await getUser(userId);
                switch(currentUser.role) {
                    case 'admin': await handleAdminCommands(simulatedEvent, userId); break;
                    case 'teacher': await handleTeacherCommands(simulatedEvent, userId); break;
                    default: await handleStudentCommands(simulatedEvent, userId); break;
                }
            }
            return;
        }
        
        if (action === 'generate_report') {
            const reportType = data.get('type');
            const period = data.get('period');
            const periodMap = { week: '本週', month: '本月', quarter: '本季', year: '今年' };
            const title = `📊 ${reportType === 'course' ? '課程' : '訂單'}報表 (${periodMap[period]})`;
            
            await push(userId, `收到指令，正在為您生成 ${title}，請稍候...`);

            (async () => {
                const client = await pgPool.connect();
                try {
                    const { start, end } = getDateRange(period);
                    let report = `${title}\n\n`;

                    if (reportType === 'course') {
                        const courseRes = await client.query("SELECT * FROM courses WHERE time BETWEEN $1 AND $2 ORDER BY time DESC", [start, end]);
                        const courses = courseRes.rows;
                        const totalCourses = courses.length;
                        const totalStudents = courses.reduce((sum, c) => sum + c.students.length, 0);
                        const pointsConsumed = courses.reduce((sum, c) => sum + (c.students.length * c.points_cost), 0);
                        
                        const coursePopularity = {};
                        courses.forEach(c => {
                            const mainTitle = c.title.replace(/ - 第 \d+ 堂$/, '');
                            if (!coursePopularity[mainTitle]) coursePopularity[mainTitle] = 0;
                            coursePopularity[mainTitle] += c.students.length;
                        });
                        const sortedPopularity = Object.entries(coursePopularity).sort((a, b) => b[1] - a[1]);
                        const top3Courses = sortedPopularity.slice(0, 3).map(([title, count]) => `  - ${title}: ${count} 人次`).join('\n');

                        report += `總開課數：${totalCourses} 堂\n`;
                        report += `總參與人次：${totalStudents} 人次\n`;
                        report += `總消耗點數：${pointsConsumed} 點\n\n`;
                        report += `⭐ 熱門課程 Top 3：\n${top3Courses || '無資料'}`;

                    } else if (reportType === 'order') {
                        const orderRes = await client.query("SELECT * FROM orders WHERE status = 'completed' AND timestamp BETWEEN $1 AND $2 ORDER BY timestamp DESC", [start, end]);
                        const orders = orderRes.rows;
                        const totalOrders = orders.length;
                        const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
                        const totalPointsSold = orders.reduce((sum, o) => sum + o.points, 0);
                        
                        const userSpending = {};
                        orders.forEach(o => {
                            if(!userSpending[o.user_name]) userSpending[o.user_name] = 0;
                            userSpending[o.user_name] += o.amount;
                        });
                        const sortedSpending = Object.entries(userSpending).sort((a, b) => b[1] - a[1]);
                        const top3Spenders = sortedSpending.slice(0, 3).map(([name, amount]) => `  - ${name}: $${amount}`).join('\n');
                        
                        report += `總成功訂單：${totalOrders} 筆\n`;
                        report += `總收入：$${totalRevenue} 元\n`;
                        report += `總售出點數：${totalPointsSold} 點\n\n`;
                        report += `💰 貢獻榜 Top 3：\n${top3Spenders || '無資料'}`;
                    }
                    await push(userId, report.trim());
                } catch (err) {
                    console.error(`❌ 生成 ${title} 失敗:`, err);
                    await push(userId, `❌ 生成 ${title} 時發生錯誤，請稍後再試。`);
                } finally {
                    if(client) client.release();
                }
            })();
            return;
        }
        
        if (action === 'confirm_order' || action === 'reject_order') {
            const orderId = data.get('orderId');
            const db = await pgPool.connect();
            try {
                await db.query('BEGIN');
                const orderRes = await db.query("SELECT * FROM orders WHERE order_id = $1 FOR UPDATE", [orderId]);
                if (orderRes.rows.length === 0) {
                    await db.query('ROLLBACK');
                    return reply(replyToken, '找不到此訂單，可能已被處理。');
                }
                const order = orderRes.rows[0];

                if (action === 'confirm_order') {
                    const studentRes = await db.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [order.user_id]);
                    const student = studentRes.rows[0];
                    const newPoints = student.points + order.points;
                    const historyEntry = { action: `購買點數成功：${order.points}點`, orderId: order.order_id, time: new Date().toISOString() };
                    const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
                    
                    await db.query("UPDATE users SET points = $1, history = $2 WHERE id = $3", [newPoints, JSON.stringify(newHistory), order.user_id]);
                    await db.query("UPDATE orders SET status = 'completed' WHERE order_id = $1", [orderId]);

                    await db.query('COMMIT');
                    await reply(replyToken, `✅ 已確認訂單 ${orderId}，並為學員 ${order.user_name} 加入 ${order.points} 點。`);
                    await push(order.user_id, `🎉 您的 ${order.points} 點購買方案已審核通過！\n點數已成功存入您的帳戶，目前總點數為 ${newPoints} 點。`).catch(err => {
                        console.error(`發送購點成功通知給 ${order.user_id} 失敗:`, err.originalError ? err.originalError.response.data : err.message);
                        push(userId, `⚠️ 通知學員 ${order.user_name} 失敗，可能是因為您的 Push Message 額度已用盡。請手動通知學員。`);
                    });

                } else {
                    await db.query("UPDATE orders SET status = 'rejected' WHERE order_id = $1", [orderId]);
                    await db.query('COMMIT');

                    await reply(replyToken, `❌ 已退回訂單 ${orderId}。`);
                    await push(order.user_id, `❗ 訂單退回通知\n您購買 ${order.points} 點的訂單已被老師退回，請確認您的匯款金額或後五碼是否正確，並至「點數管理」重新提交。`).catch(err => {
                        console.error(`發送訂單退回通知給 ${order.user_id} 失敗:`, err.originalError ? err.originalError.response.data : err.message);
                        push(userId, `⚠️ 通知學員 ${order.user_name} 失敗，可能是因為您的 Push Message 額度已用盡。請手動通知學員。`);
                    });
                }
            } catch (err) {
                await db.query('ROLLBACK');
                console.error(`處理訂單 ${orderId} 時發生錯誤:`, err);
                return reply(replyToken, '處理訂單時發生嚴重錯誤，操作已取消。');
            } finally {
                if (db) db.release();
            }
            return;
        }

        const currentUser = await getUser(userId);
        if (currentUser.role === 'admin') {
            if (action === 'select_teacher_for_removal') {
                const targetId = data.get('targetId');
                const targetName = decodeURIComponent(data.get('targetName'));
                pendingTeacherRemoval[userId] = { step: 'await_confirmation', targetUser: { id: targetId, name: targetName } };
                setupConversationTimeout(userId, pendingTeacherRemoval, 'pendingTeacherRemoval', (u) => push(u, '移除老師操作逾時，自動取消。'));
                return reply(replyToken, `您確定要移除老師「${targetName}」的權限嗎？該用戶將會變回學員身份。`, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
        }
        
        if (currentUser.role === 'teacher') {
            if (action === 'add_course_start') {
              pendingCourseCreation[userId] = { step: 'await_title' };
              setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => push(u, '新增課程逾時，自動取消。'));
              const newPrompt = '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。';
              return reply(replyToken, newPrompt, getCancelMenu());
            }
            if (action === 'set_course_weekday') {
              const state = pendingCourseCreation[userId];
              if (state && state.step === 'await_weekday') {
                  const day = parseInt(data.get('day'), 10);
                  const dayLabel = WEEKDAYS.find(d => d.value === day).label;
                  state.weekday = day;
                  state.weekday_label = dayLabel;
                  state.step = 'await_time';
                  return reply(replyToken, `已選擇 ${dayLabel}，請問上課時間是？（請輸入四位數時間，例如：19:30）`, getCancelMenu());
              }
            }
           if (action === 'cancel_course_group_confirm') {
                const prefix = data.get('prefix');
                const courseRes = await pgPool.query("SELECT title FROM courses WHERE id LIKE $1 LIMIT 1", [`${prefix}%`]);
                if (courseRes.rows.length === 0) return reply(replyToken, "找不到課程系列。");
                const courseMainTitle = courseRes.rows[0].title.replace(/ - 第 \d+ 堂$/, '');

                pendingCourseCancellation[userId] = { type: 'batch', prefix: prefix };
                setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時。'));
                const message = `您確定要批次取消【${courseMainTitle}】所有未來的課程嗎？\n\n此動作無法復原，並會將點數退還給所有已預約的學員。`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL, text: COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
            if (action === 'confirm_single_course_cancel') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) return reply(replyToken, "找不到該課程。");

                pendingCourseCancellation[userId] = { type: 'single', courseId: course.id };
                setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', (u) => push(u, '取消課程操作逾時。'));

                const message = `您確定要取消單堂課程「${course.title}」嗎？\n(${formatDateTime(course.time)})\n\n將會退點給所有已預約的學員。`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL, text: COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
            if (action === 'select_student_for_adjust') {
              const studentId = data.get('studentId');
              const targetStudent = await getUser(studentId);
              if (!targetStudent) { return reply(replyToken, '找不到該學員，可能已被刪除。'); }
              pendingManualAdjust[userId] = { step: 'await_operation', targetStudent: { id: targetStudent.id, name: targetStudent.name } };
              return reply(replyToken, `您要為學員「${targetStudent.name}」進行何種點數調整？`, [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } }, { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } } ]);
            }
            if (action === 'view_student_details') {
                const studentId = data.get('studentId');
                const student = await getUser(studentId);
                if (!student) return reply(replyToken, '找不到該學員資料。');
                
                const client = await pgPool.connect();
                try {
                    const myCoursesRes = await client.query(
                        `SELECT * FROM courses
                         WHERE time > NOW() AND ($1 = ANY(students) OR $1 = ANY(waiting))
                         ORDER BY time ASC LIMIT 5`,
                        [studentId]
                    );
                    
                    let courseText = '【未來5筆課程】\n';
                    if (myCoursesRes.rows.length > 0) {
                        courseText += myCoursesRes.rows.map(c => {
                            const status = c.students.includes(studentId) ? ' (已預約)' : ' (候補中)';
                            return ` - ${c.title}${status} \n   ${formatDateTime(c.time)}`;
                        }).join('\n\n');
                    } else {
                        courseText += '無';
                    }

                    let historyText = '\n\n【最近10筆點數紀錄】\n';
                    const history = student.history || [];
                    if (history.length > 0) {
                        historyText += history.slice(-10).reverse().map(h => {
                            const pointsChangeText = h.pointsChange ? ` (${h.pointsChange > 0 ? '+' : ''}${h.pointsChange}點)` : '';
                            
                            let actionText = h.action.replace(/([A-Za-z0-9]{10,})/g, (match) => {
                                return formatIdForDisplay(match);
                            });

                            return ` - ${formatDateTime(h.time)}\n   ${actionText}${pointsChangeText}`;
                        }).join('\n\n');
                    } else {
                        historyText += '無';
                    }

                    const fullReport = `【學員詳細資料】\n姓名: ${student.name}\nID: ${formatIdForDisplay(student.id)}\n剩餘點數: ${student.points}\n\n${courseText}${historyText}`;
                    return reply(replyToken, fullReport);
                } catch (err) {
                    console.error('❌ 查詢學員詳細資料失敗:', err);
                    return reply(replyToken, GENERIC_ERROR_MESSAGE);
                } finally {
                    if (client) client.release();
                }
            }
            if (action === 'mark_feedback_read') {
                const msgId = data.get('msgId');
                await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
                return reply(replyToken, '已將此留言標示為已讀。');
            }
            if (action === 'reply_feedback') {
                const msgId = data.get('msgId');
                const studentId = data.get('userId');
                const msgRes = await pgPool.query("SELECT message FROM feedback_messages WHERE id = $1", [msgId]);
                if (msgRes.rows.length > 0) {
                    pendingReply[userId] = {
                        step: 'await_reply',
                        msgId: msgId,
                        studentId: studentId,
                        originalMessage: msgRes.rows[0].message
                    };
                    setupConversationTimeout(userId, pendingReply, 'pendingReply', (u) => push(u, '回覆留言逾時，自動取消。'));
                    return reply(replyToken, '請輸入您要回覆的內容：', getCancelMenu());
                }
            }
        }
        
        if (currentUser.role === 'student') {
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
                        { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                    ]);
                }
            }
            if (action === 'confirm_booking_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。'); }
                pendingBookingConfirmation[userId] = { type: 'book', courseId: courseId };
                const message = `您確定要預約以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.points_cost} 點\n\n預約後將立即扣點，確認嗎？`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
            if (action === 'confirm_cancel_booking_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。'); }
                pendingBookingConfirmation[userId] = { type: 'cancel_book', courseId: courseId };
                const message = `您確定要取消預約以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n取消後將歸還 ${course.points_cost} 點，確認嗎？`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
            if (action === 'confirm_cancel_waiting_start') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course) { return reply(replyToken, '抱歉，找不到該課程。'); }
                pendingBookingConfirmation[userId] = { type: 'cancel_wait', courseId: courseId };
                const message = `您確定要取消候補以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}`;
                return reply(replyToken, message, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
                ]);
            }
        }
    }
}
