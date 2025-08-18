// index.js - V28.0 (智慧回覆系統)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto =require('crypto');
const { default: fetch } = require('node-fetch');
const axios = require('axios');
const ImageKit = require("imagekit");

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

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
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
    SYSTEM_STATUS: '@系統狀態',
    FAILED_TASK_MANAGEMENT: '@失敗任務管理',
    ADD_TEACHER: '@授權老師',
    REMOVE_TEACHER: '@移除老師',
    SIMULATE_STUDENT: '@模擬學員身份',
    SIMULATE_TEACHER: '@模擬老師身份',
    CONFIRM_ADD_TEACHER: '✅ 確認授權',
    CONFIRM_REMOVE_TEACHER: '✅ 確認移除',
    TOGGLE_NOTIFICATIONS: '@切換推播通知'
  },
  TEACHER: {
    COURSE_MANAGEMENT: '@課程管理',
      ADD_COURSE_SERIES: '@新增課程系列',
      MANAGE_OPEN_COURSES: '@管理已開課程',
      COURSE_INQUIRY: '@課程查詢',
    POINT_MANAGEMENT: '@點數管理',
      PENDING_POINT_ORDERS: '@待確認點數訂單',
      MANUAL_ADJUST_POINTS: '@手動調整點數',
    STUDENT_MANAGEMENT: '@學員管理',
      SEARCH_STUDENT: '@查詢學員',
      VIEW_MESSAGES: '@查看未回覆留言',
      MESSAGE_SEARCH: '@查看歷史留言',
    ANNOUNCEMENT_MANAGEMENT: '@公告管理',
      ADD_ANNOUNCEMENT: '@頒佈新公告',
      DELETE_ANNOUNCEMENT: '@刪除舊公告',
    SHOP_MANAGEMENT: '@商城管理',
      ADD_PRODUCT: '@上架新商品',
      VIEW_PRODUCTS: '@商品管理',
      MANAGE_AVAILABLE_PRODUCTS: '@管理販售中商品',
      MANAGE_UNAVAILABLE_PRODUCTS: '@管理已下架商品',
      SHOP_ORDER_MANAGEMENT: '@訂單管理',
    REPORT: '@統計報表',
      COURSE_REPORT: '@課程報表',
      ORDER_REPORT: '@訂單報表',
      POINT_REPORT: '@點數報表',
    // --- 以下為舊指令，保留相容性或改為內部觸發 ---
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    PENDING_ORDERS: '@待確認清單',
    CONFIRM_MANUAL_ADJUST: '✅ 確認調整',
    ADD_POINTS: '+ 加點',
    DEDUCT_POINTS: '- 扣點',
    CONFIRM_ADD_ANNOUNCEMENT: '✅ 確認頒佈',
    CONFIRM_DELETE_ANNOUNCEMENT: '✅ 確認刪除',
    CONFIRM_BATCH_CANCEL: '✅ 確認批次取消',
    CONFIRM_SINGLE_CANCEL: '✅ 確認取消單堂'
  },
  STUDENT: {
    // --- 主選單指令 ---
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    SHOP: '@活動商城',
    POINTS: '@點數查詢',
    LATEST_ANNOUNCEMENT: '@最新公告',
    CONTACT_US: '@聯絡我們',
    // --- 子選單指令 ---
    VIEW_SHOP_PRODUCTS: '@瀏覽商品',
    EXCHANGE_HISTORY: '@兌換紀錄',
    CHECK_POINTS: '@查看剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    // --- 內部觸發或確認指令 ---
    ADD_NEW_MESSAGE: '@新增一則留言', 
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
        'BANK_ACCOUNT_NUMBER',
        'IMAGEKIT_PUBLIC_KEY',
        'IMAGEKIT_PRIVATE_KEY',
        'IMAGEKIT_URL_ENDPOINT'
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
  console.log('[DEBUG] 1. 進入 initializeDatabase 函式...');
  const client = await pgPool.connect();
  console.log('[DEBUG] 2. 資料庫連線成功。');
  try {
    console.log('[DEBUG] 3. 準備開始建立/檢查所有表格...');
    await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255))`);
    await client.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await client.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price INTEGER NOT NULL, image_url TEXT, inventory INTEGER NOT NULL DEFAULT 0, status VARCHAR(50) DEFAULT 'available', creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await client.query(`CREATE TABLE IF NOT EXISTS product_orders (id SERIAL PRIMARY KEY, order_uid VARCHAR(255) UNIQUE NOT NULL, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, product_id INTEGER NOT NULL, product_name VARCHAR(255) NOT NULL, points_spent INTEGER NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ, teacher_notes TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, recipient_id VARCHAR(255) NOT NULL, message_payload JSONB NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'pending', send_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), retry_count INTEGER DEFAULT 0, last_error TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await client.query(`CREATE TABLE IF NOT EXISTS system_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value VARCHAR(255) NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await client.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ('notifications_enabled', 'true') ON CONFLICT (setting_key) DO NOTHING`);
    await client.query(`CREATE TABLE IF NOT EXISTS failed_tasks (id SERIAL PRIMARY KEY, original_task_id INTEGER, recipient_id VARCHAR(255) NOT NULL, message_payload JSONB NOT NULL, last_error TEXT, failed_at TIMESTAMPTZ DEFAULT NOW())`);
    console.log('[DEBUG] 4. 所有核心表格檢查/建立完畢。');
    
    console.log('[DEBUG] 5. 準備開始檢查/新增所有欄位...');
    const lastSeenIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='last_seen_announcement_id'");
    if (lastSeenIdCol.rows.length === 0) { await client.query('ALTER TABLE users ADD COLUMN last_seen_announcement_id INTEGER DEFAULT 0'); }
    const pictureUrlCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='picture_url'");
    if (pictureUrlCol.rows.length === 0) { await client.query('ALTER TABLE users ADD COLUMN picture_url TEXT'); }
    const approvedByCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='approved_by'");
    if (approvedByCol.rows.length === 0) { await client.query('ALTER TABLE users ADD COLUMN approved_by VARCHAR(255)'); }
    const creatorIdCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_id'");
    if (creatorIdCol.rows.length === 0) { await client.query('ALTER TABLE announcements ADD COLUMN creator_id VARCHAR(255) NOT NULL DEFAULT \'unknown\''); }
    const creatorNameCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='creator_name'");
    if (creatorNameCol.rows.length === 0) { await client.query('ALTER TABLE announcements ADD COLUMN creator_name VARCHAR(255) NOT NULL DEFAULT \'unknown\''); }
    const createdAtCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements' AND column_name='created_at'");
    if (createdAtCol.rows.length === 0) { await client.query('ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()'); }
    const inventoryCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='inventory'");
    if (inventoryCol.rows.length === 0) { await client.query('ALTER TABLE products ADD COLUMN inventory INTEGER NOT NULL DEFAULT 0'); }
    const updatedAtCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='product_orders' AND column_name='updated_at'");
    if (updatedAtCol.rows.length === 0) { await client.query('ALTER TABLE product_orders ADD COLUMN updated_at TIMESTAMPTZ'); }
    const teacherNotesCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='product_orders' AND column_name='teacher_notes'");
    if (teacherNotesCol.rows.length === 0) { await client.query('ALTER TABLE product_orders ADD COLUMN teacher_notes TEXT'); }
    
    const studentReadCol = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='feedback_messages' AND column_name='is_student_read'");
    if (studentReadCol.rows.length === 0) {
        console.log('[DEBUG] 5a. is_student_read 欄位不存在，準備新增...');
        await client.query('ALTER TABLE feedback_messages ADD COLUMN is_student_read BOOLEAN NOT NULL DEFAULT FALSE');
        console.log('[DEBUG] 5b. is_student_read 欄位新增成功。');
    } else {
        console.log('[DEBUG] 5a. is_student_read 欄位已存在，無需新增。');
    }
    console.log('[DEBUG] 6. 所有欄位檢查/新增完畢。');

    console.log('[DEBUG] 7. 準備開始建立索引...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_courses_time ON courses (time)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_status ON products (status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_orders_user_id ON product_orders (user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_courses_students_gin ON courses USING GIN (students)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_courses_waiting_gin ON courses USING GIN (waiting)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status_send_at ON tasks (status, send_at)`);
    console.log('[DEBUG] 8. 索引建立完畢。');

    await cleanCoursesDB(client);
    console.log('[DEBUG] 9. cleanCoursesDB 執行完畢。');
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化在此處發生致命錯誤:', err.stack);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
      console.log('[DEBUG] 10. 釋放資料庫連線。');
    }
  }
}

// [V25.1 新增] 讀取推播通知狀態的輔助函式與快取
let notificationStatusCache = {
    value: true,
    timestamp: 0
};
const NOTIFICATION_CACHE_DURATION_MS = 1000 * 30; // 快取 30 秒

// [V28.0 新增] 智慧回覆機制的狀態變數
const SESSION_TIMEOUT_MS = 1000 * 60 * 5; // 5 分鐘
const userLastInteraction = {};

/**
 * [V28.0 新增] 檢查指定使用者的待辦事項通知
 * @param {object} user - 包含 id 和 role 的使用者物件
 * @returns {Promise<object>} - 一個包含各種待辦事項數量的物件
 */
async function getPendingNotificationsForUser(user) {
    const notifications = {
        unreadReplies: 0,
        newStudentMessages: 0,
        pendingPointOrders: 0,
        pendingShopOrders: 0,
        failedTasks: 0,
    };
    const { id, role } = user;

    try {
        if (role === 'student') {
            const res = await pgPool.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [id]);
            notifications.unreadReplies = parseInt(res.rows[0].count, 10);
        } else if (role === 'teacher') {
            const [newMessagesRes, pointOrdersRes, shopOrdersRes] = await Promise.all([
                pgPool.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'"),
                pgPool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'"),
                pgPool.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
            ]);
            notifications.newStudentMessages = parseInt(newMessagesRes.rows[0].count, 10);
            notifications.pendingPointOrders = parseInt(pointOrdersRes.rows[0].count, 10);
            notifications.pendingShopOrders = parseInt(shopOrdersRes.rows[0].count, 10);
        } else if (role === 'admin') {
            const res = await pgPool.query("SELECT COUNT(*) FROM failed_tasks");
            notifications.failedTasks = parseInt(res.rows[0].count, 10);
        }
    } catch (err) {
        console.error(`[getPendingNotificationsForUser] 查詢 ${user.id} (${user.role}) 的通知時出錯:`, err);
    }
    
    return notifications;
}

async function getNotificationStatus() {
    const now = Date.now();
    // 如果快取還在有效期內，直接回傳快取值
    if (now - notificationStatusCache.timestamp < NOTIFICATION_CACHE_DURATION_MS) {
        return notificationStatusCache.value;
    }

    const db = await pgPool.connect();
    try {
        const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
        // 如果資料庫有值，就更新快取；如果沒有，則使用目前的快取值(預設為true)
        if (res.rows.length > 0) {
            const isEnabled = res.rows[0].setting_value === 'true';
            notificationStatusCache = { value: isEnabled, timestamp: now };
            return isEnabled;
        }
    } catch (err) {
        console.error('❌ 讀取推播設定失敗:', err);
    } finally {
        if (db) db.release();
    }
    // 發生錯誤或找不到設定時，回傳目前的快取值，避免功能中斷
    return notificationStatusCache.value;
}

async function enqueuePushTask(recipientId, message, sendAt = null) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
    
  const db = await pgPool.connect();
  try {
    const messagePayload = Array.isArray(message) ? message : [message];
    const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
    if (validMessages.length === 0) {
        console.error(`[enqueuePushTask] 嘗試為 ${recipientId} 加入無效的訊息 payload`, message);
        return;
    }

    const sendTimestamp = sendAt instanceof Date ? sendAt.toISOString() : new Date().toISOString();

    await db.query(
      `INSERT INTO tasks (recipient_id, message_payload, send_at) VALUES ($1, $2, $3)`,
      [recipientId, JSON.stringify(validMessages), sendTimestamp]
    );
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  } finally {
    if (db) db.release();
  }
}
/**
 * [V24.0] 取消超過 24 小時未付款的訂單
 */
async function cancelExpiredPendingOrders() {
    const client = await pgPool.connect();
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * ONE_HOUR_IN_MS);
        // 尋找狀態為 'pending_payment' 且建立時間超過 24 小時的訂單
        const res = await client.query(
            "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
            [twentyFourHoursAgo]
        );

        if (res.rows.length > 0) {
            console.log(`🧹 已自動取消 ${res.rows.length} 筆逾時訂單。`);
            // [V24.0 修改] 將通知改為加入佇列
            for (const order of res.rows) {
                const message = { type: 'text', text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` };
                await enqueuePushTask(order.user_id, message).catch(e => {
                    console.error(`將逾時訂單取消通知加入佇列時失敗 for ${order.user_name} (${order.user_id})`);
                });
            }
        }
    } catch (err) {
        console.error("❌ 自動取消逾時訂單時發生錯誤:", err);
    } finally {
        if(client) client.release();
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

async function getProduct(productId, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function saveProduct(product, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        await client.query(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, inventory = $5, status = $6 WHERE id = $7`,
            [product.name, product.description, product.price, product.image_url, product.inventory, product.status, product.id]
        );
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}

async function getProductOrder(orderUID, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM product_orders WHERE order_uid = $1', [orderUID]);
        return res.rows.length > 0 ? res.rows[0] : null;
    } finally {
        if (shouldReleaseClient && client) client.release();
    }
}
async function saveProductOrder(order, dbClient) {
    const shouldReleaseClient = !dbClient;
    const client = dbClient || await pgPool.connect();
    try {
        await client.query(
            `UPDATE product_orders SET status = $1, updated_at = $2, teacher_notes = $3 WHERE id = $4`,
            [order.status, order.updated_at, order.teacher_notes, order.id]
        );
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

// [V28.0 移除] 舊的 reply 函式。新的回覆邏輯將統一由 handleEvent 處理。

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

function getCourseMainTitle(fullTitle) {
    if (typeof fullTitle !== 'string') return '';
    return fullTitle.replace(/ - 第 \d+ 堂$/, '');
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

function getDateRange(period) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    let startDate, endDate;
    switch (period) {
        case 'week':
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
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
                action: { type: 'postback', label: '選擇此方案', data: `action=select_purchase_plan&plan=${plan.points}`, displayText: `我要購買 ${plan.points} 點` },
                style: 'primary',
                height: 'sm',
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
                contents: [{ type: 'text', text: '➕ 購買點數', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
                backgroundColor: '#34A0A4',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    ...plansContent,
                    { type: 'separator', margin: 'xl' },
                    { type: 'text', text: '購買後請至「點數查詢」回報匯款資訊', size: 'xs', color: '#aaaaaa', align: 'center', margin: 'md', wrap: true }
                ]
            }
        }
    };
}
async function buildPointsMenuFlex(userId) {
    const user = await getUser(userId);
    if (!user) return { type: 'text', text: '無法獲取您的使用者資料。' };

    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];

    const bodyContents = [];

    // 處理待處理訂單的區塊
    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款待確認';
            cardColor = '#ff9e00';
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交後五碼';
            actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '❌ 訂單被退回';
            cardColor = '#d90429';
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionCmd = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
            cardTitle = '❗ 匯款待處理';
            cardColor = '#f28482';
            statusText = '待付款';
        }

        bodyContents.push({
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            paddingAll: 'md',
            backgroundColor: '#FAFAFA',
            cornerRadius: 'md',
            contents: [
                { type: 'text', text: cardTitle, weight: 'bold', color: cardColor, size: 'md' },
                { type: 'separator', margin: 'md' },
                {
                    type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
                    contents: [
                        { type: 'text', text: `訂單: ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', wrap: true },
                        { type: 'text', text: `狀態: ${statusText}`, size: 'sm' },
                         ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', color: '#B00020', wrap: true, margin: 'sm' }] : []),
                    ]
                },
                {
                    type: 'button',
                    style: 'primary',
                    color: cardColor,
                    height: 'sm',
                    margin: 'md',
                    action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${encodeURIComponent(actionCmd)}` }
                }
            ]
        });
        bodyContents.push({ type: 'separator', margin: 'lg' });
    }

    // 顯示目前點數
    bodyContents.push({
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        alignItems: 'center',
        contents: [
            { type: 'text', text: '目前剩餘點數', size: 'sm', color: '#AAAAAA' },
            { type: 'text', text: `${user.points} 點`, weight: 'bold', size: '3xl', margin: 'sm', color: '#1A759F' },
        ]
    });


    return {
        type: 'flex',
        altText: '點數查詢選單',
        contents: {
            type: 'bubble',
            size: 'giga',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '💎 點數查詢', color: '#ffffff', weight: 'bold', size: 'lg' }
                ],
                backgroundColor: '#34A0A4',
                paddingBottom: 'lg',
                paddingTop: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'xl',
                spacing: 'md',
                contents: bodyContents
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '➕ 購買點數', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.BUY_POINTS)}` }
                    },
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.PURCHASE_HISTORY)}` }
                    }
                ]
            }
        }
    };
}
const teacherMenu = [];
const studentMenu = [
    { type: 'action', action: { type: 'postback', label: '點數查詢', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.POINTS)}` } },
    { type: 'action', action: { type: 'postback', label: '預約課程', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.BOOK_COURSE)}` } },
    { type: 'action', action: { type: 'postback', label: '我的課程', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.MY_COURSES)}` } },
    { type: 'action', action: { type: 'postback', label: '最新公告', data: `action=run_command&text=${encodeURIComponent(COMMANDS.STUDENT.LATEST_ANNOUNCEMENT)}` } }
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
const pendingProductEdit = {};
const pendingInventoryAdjust = {};
const userProfileCache = new Map();


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
    pendingProductEdit,
    pendingInventoryAdjust,
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

// [V28.0 重構] handlePurchaseFlow 不再直接 reply，而是回傳 message 物件
async function handlePurchaseFlow(text, user) {
    const purchaseState = pendingPurchase[user.id];

    if (!purchaseState) return null; // 回傳 null 表示不由這個函式處理

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                const order_id = `PO${Date.now()}`;
                const order = {
                    order_id: order_id,
                    user_id: user.id,
                    user_name: user.name,
                    points: purchaseState.data.points,
                    amount: purchaseState.data.amount,
                    last_5_digits: null,
                    status: 'pending_payment',
                    timestamp: new Date().toISOString()
                };
                await saveOrder(order);
                delete pendingPurchase[user.id];

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數查詢」選單，點擊「❗ 匯款待處理」卡片中的按鈕來回報您的後五碼。\n\n⚠️提醒：為確保您的權益，請於24小時內完成匯款與回報，逾時訂單將會自動取消。`;

                const flexMenu = await buildPointsMenuFlex(user.id);
                return [{ type: 'text', text: replyText }, flexMenu];
            } else {
                return { type: 'text', text: '請點擊「✅ 確認購買」或「❌ 取消操作」。' };
            }

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
                        delete pendingPurchase[user.id];

                        if (TEACHER_ID) {
                            const notifyMessage = { type: 'text', text: `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認點數訂單」審核。`};
                            await enqueuePushTask(TEACHER_ID, notifyMessage).catch(e => console.error(e));
                        }
                        
                        const flexMenu = await buildPointsMenuFlex(user.id);
                        return [
                            {type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, 
                            flexMenu
                        ];
                    } else {
                        delete pendingPurchase[user.id];
                        return { type: 'text', text: '找不到您的訂單，請重新操作。' };
                    }
                } finally {
                    if (client) client.release();
                }
            } else {
                return { type: 'text', text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。', quickReply: { items: getCancelMenu() } };
            }
    }
    return null; // 預設情況，不由這個函式處理
}
// [新增] 輔助函式：用來查詢多個使用者的名稱
async function getUserNames(userIds, dbClient) {
    if (!userIds || userIds.length === 0) {
        return new Map();
    }
    const usersRes = await dbClient.query("SELECT id, name FROM users WHERE id = ANY($1::text[])", [userIds]);
    return new Map(usersRes.rows.map(u => [u.id, u.name]));
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showFailedTasks(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            "SELECT * FROM failed_tasks ORDER BY failed_at DESC LIMIT $1 OFFSET $2",
            [PAGINATION_SIZE + 1, offset]
        );
        
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageTasks = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageTasks.length === 0 && page === 1) {
            return { type: 'text', text: '✅ 太好了！目前沒有任何失敗的任務。' };
        }
        if (pageTasks.length === 0) {
            return { type: 'text', text: '沒有更多失敗的任務了。' };
        }

        const userIds = [...new Set(pageTasks.map(task => task.recipient_id))];
        const userNamesMap = await getUserNames(userIds, client);

        const taskBubbles = pageTasks.map(task => {
            const recipientName = userNamesMap.get(task.recipient_id) || '未知用戶';
            const errorMessage = task.last_error || '沒有錯誤訊息。';
            
            return {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🚨 任務失敗', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#d9534f', paddingAll: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '收件人', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${recipientName}`, color: '#666666', size: 'sm', flex: 5, wrap: true } ] },
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '失敗時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(task.failed_at), color: '#666666', size: 'sm', flex: 5, wrap: true } ] },
                    { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'text', text: '錯誤原因', color: '#aaaaaa', size: 'sm' }, { type: 'text', text: errorMessage.substring(0, 100), color: '#666666', size: 'sm', wrap: true, margin: 'md' } ] }
                ]},
                footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
                    { type: 'button', style: 'secondary', flex: 1, height: 'sm', action: { type: 'postback', label: '🗑️ 刪除', data: `action=delete_failed_task&id=${task.id}` } },
                    { type: 'button', style: 'primary', color: '#5cb85c', flex: 1, height: 'sm', action: { type: 'postback', label: '🔄 重試', data: `action=retry_failed_task&id=${task.id}` } }
                ]}
            };
        });

        const paginationBubble = createPaginationBubble('action=view_failed_tasks', page, hasNextPage);
        if (paginationBubble) {
            taskBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '失敗任務列表', contents: { type: 'carousel', contents: taskBubbles } };
    } catch (err) {
        // [V28.0] 拋出錯誤，由主函式統一處理
        console.error('❌ 查詢失敗任務列表失敗:', err);
        throw new Error('查詢失敗任務時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showSystemStatus() {
  const db = await pgPool.connect();
  try {
    const [pendingRes, processingRes, failedRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'processing'"),
      db.query("SELECT COUNT(*) FROM failed_tasks")
    ]);

    const pendingCount = pendingRes.rows[0].count;
    const processingCount = processingRes.rows[0].count;
    const failedCount = failedRes.rows[0].count;

    const statusText = `⚙️ 背景系統狀態 ⚙️\n\n- 待處理任務: ${pendingCount} 個\n- 正在處理中: ${processingCount} 個\n- 失敗任務(DLQ): ${failedCount} 個\n\nℹ️ 「待處理任務」是系統即將要發送的排程訊息 (如課程提醒)。若「失敗任務」數量持續增加，請檢查 Worker 紀錄。`.trim();

    return { type: 'text', text: statusText };
  } catch (err) {
    console.error('❌ 查詢系統狀態失敗:', err);
    throw new Error('查詢系統狀態時發生錯誤。');
  } finally {
    if (db) db.release();
  }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showTeacherListForRemoval(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            "SELECT id, name, picture_url FROM users WHERE role = 'teacher' ORDER BY name ASC LIMIT $1 OFFSET $2",
            [PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageTeachers = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageTeachers.length === 0 && page === 1) {
            return { type: 'text', text: '目前沒有任何已授權的老師可供移除。' };
        }
        if (pageTeachers.length === 0) {
            return { type: 'text', text: '沒有更多老師了。' };
        }

        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'horizontal', spacing: 'md',
                contents: [
                    { type: 'image', url: t.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [
                            { type: 'text', text: t.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(t.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical',
                contents: [{
                    type: 'button', style: 'primary', color: '#DE5246', height: 'sm',
                    action: { type: 'postback', label: '選擇此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }
                }]
            }
        }));

        const paginationBubble = createPaginationBubble('action=list_teachers_for_removal', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles }};
    } catch (err) {
        console.error('❌ 查詢老師列表失敗:', err);
        throw new Error('查詢老師列表時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}
// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showStudentSearchResults(query, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            `SELECT id, name, picture_url FROM users 
             WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) 
             ORDER BY name ASC LIMIT $3 OFFSET $4`,
            [`%${query.toLowerCase()}%`, query, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageUsers = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageUsers.length === 0 && page === 1) {
            return { type: 'text', text: `找不到與「${query}」相關的學員。` };
        }
        if (pageUsers.length === 0) {
            return { type: 'text', text: '沒有更多搜尋結果了。' };
        }

        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = pageUsers.map(u => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'horizontal', spacing: 'md',
                contents: [
                    { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [
                            { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(u.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical',
                contents: [{
                    type: 'button', style: 'primary', color: '#1A759F', height: 'sm',
                    action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` }
                }]
            }
        }));

        const paginationBubble = createPaginationBubble('action=student_search_results', page, hasNextPage, `&query=${encodeURIComponent(query)}`);
        if (paginationBubble) {
            userBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: `學員搜尋結果：${query}`, contents: { type: 'carousel', contents: userBubbles } };
    } catch(err) {
        console.error('❌ 搜尋學員失敗:', err);
        throw new Error('搜尋學員時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showPurchaseHistory(userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`, [userId, PAGINATION_SIZE + 1, offset]);

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return { type: 'text', text: '您沒有任何購點紀錄。' };
        }
         if (pageOrders.length === 0) {
            return { type: 'text', text: '沒有更多紀錄了。' };
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

        const carousel = { type: 'flex', altText: '購點紀錄', contents: { type: 'carousel', contents: historyBubbles } };
        if (page === 1) {
            return [{ type: 'text', text: '以下是您近期的購點紀錄：' }, carousel];
        }
        return carousel;

    } catch(err) {
        console.error('❌ 查詢購點紀錄失敗:', err);
        throw new Error('查詢購點紀錄時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showUnreadMessages(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query("SELECT * FROM feedback_messages WHERE status = 'new' ORDER BY timestamp ASC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageMessages.length === 0 && page === 1) {
            return { type: 'text', text: '太棒了！目前沒有未回覆的學員留言。' };
        }
        if (pageMessages.length === 0) {
            return { type: 'text', text: '沒有更多未回覆的留言了。' };
        }

        const messageBubbles = pageMessages.map(msg => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: msg.user_name, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xs', color: '#AAAAAA' },
                    { type: 'separator', margin: 'lg' },
                    { type: 'text', text: msg.message, wrap: true, margin: 'lg', size: 'md' }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [
                    { type: 'button', style: 'primary', height: 'sm',
                        action: { type: 'postback', label: '💬 回覆此留言', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` }
                    },
                    { type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '標示為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` }
                    }
                ]
            }
        }));
        
        const paginationBubble = createPaginationBubble('action=view_unread_messages', page, hasNextPage);
        if (paginationBubble) {
            messageBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '未回覆的學員留言', contents: { type: 'carousel', contents: messageBubbles } };
    } catch (err) {
        console.error('❌ 查詢未讀留言失敗:', err);
        throw new Error('查詢未回覆留言時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showHistoricalMessages(query, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const searchQuery = `%${query}%`;
        const res = await client.query(
            `SELECT * FROM feedback_messages 
             WHERE user_name ILIKE $1 OR message ILIKE $1 OR teacher_reply ILIKE $1
             ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
            [searchQuery, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageMessages.length === 0 && page === 1) {
            return { type: 'text', text: `找不到與「${query}」相關的歷史留言。` };
        }
        if (pageMessages.length === 0) {
            return { type: 'text', text: '沒有更多搜尋結果了。' };
        }
        
        const statusMap = {
            new: { text: '🟡 新留言', color: '#ffb703' },
            read: { text: '⚪️ 已讀', color: '#adb5bd' },
            replied: { text: '🟢 已回覆', color: '#2a9d8f' },
        };

        const messageBubbles = pageMessages.map(msg => {
            const statusInfo = statusMap[msg.status] || { text: msg.status, color: '#6c757d' };
            const bodyContents = [
                { type: 'box', layout: 'horizontal', contents: [
                    { type: 'text', text: msg.user_name, weight: 'bold', size: 'lg', wrap: true, flex: 5 },
                    { type: 'box', layout: 'vertical', backgroundColor: statusInfo.color, cornerRadius: 'md', paddingAll: 'sm', flex: 2, alignItems: 'center', justifyContent: 'center', contents: [
                        { type: 'text', text: statusInfo.text, color: '#FFFFFF', weight: 'bold', size: 'xs' }
                    ]}
                ]},
                { type: 'text', text: formatDateTime(msg.timestamp), size: 'xs', color: '#AAAAAA' },
                { type: 'separator', margin: 'lg' },
                { type: 'text', text: '【學員留言】', size: 'sm', color: '#888888', margin: 'md'},
                { type: 'text', text: msg.message, wrap: true, size: 'md' },
            ];

            if (msg.teacher_reply) {
                bodyContents.push({ type: 'separator', margin: 'lg' });
                bodyContents.push({ type: 'text', text: '【您的回覆】', size: 'sm', color: '#888888', margin: 'md'});
                bodyContents.push({ type: 'text', text: msg.teacher_reply, wrap: true, size: 'md', color: '#495057' });
            }

            return { type: 'bubble', size: 'giga', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents }};
        });
        
        const paginationBubble = createPaginationBubble('action=view_historical_messages', page, hasNextPage, `&query=${encodeURIComponent(query)}`);
        if (paginationBubble) {
            messageBubbles.push(paginationBubble);
        }

        const flexMessage = { type: 'flex', altText: `歷史留言搜尋結果: ${query}`, contents: { type: 'carousel', contents: messageBubbles }};
        if (page === 1) {
            return [{ type: 'text', text: `以下是關於「${query}」的歷史留言：`}, flexMessage];
        }
        return flexMessage;
    } catch (err) {
        console.error('❌ 搜尋歷史留言失敗:', err);
        throw new Error('搜尋歷史留言時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}
// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showPendingShopOrders(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            "SELECT * FROM product_orders WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1 OFFSET $2",
            [PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return { type: 'text', text: '目前沒有待處理的商品訂單。' };
        }
        if (pageOrders.length === 0) {
            return { type: 'text', text: '沒有更多待處理的訂單了。' };
        }

        const orderBubbles = pageOrders.map(order => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: order.product_name, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'text', text: `兌換者: ${order.user_name}`, size: 'md' },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '花費點數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${order.points_spent} 點`, color: '#666666', size: 'sm', flex: 3, wrap: true } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '訂單時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(order.created_at), color: '#666666', size: 'sm', flex: 3, wrap: true } ] }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'horizontal', spacing: 'sm',
                contents: [
                    { type: 'button', style: 'secondary', flex: 1, action: { type: 'postback', label: '取消訂單', data: `action=cancel_shop_order_start&orderUID=${order.order_uid}` } },
                    { type: 'button', style: 'primary', color: '#28a745', flex: 1, action: { type: 'postback', label: '確認訂單', data: `action=confirm_shop_order&orderUID=${order.order_uid}` } }
                ]
            }
        }));

        const paginationBubble = createPaginationBubble('action=view_pending_shop_orders', page, hasNextPage);
        if (paginationBubble) {
            orderBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '待處理的商品訂單', contents: { type: 'carousel', contents: orderBubbles }};
    } catch (err) {
        console.error('❌ 查詢待處理商品訂單失敗:', err);
        throw new Error('查詢訂單時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showAnnouncementsForDeletion(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            "SELECT * FROM announcements ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            [PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageAnnouncements = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageAnnouncements.length === 0 && page === 1) {
            return { type: 'text', text: '目前沒有任何可刪除的公告。' };
        }
        if (pageAnnouncements.length === 0) {
            return { type: 'text', text: '沒有更多公告了。' };
        }

        const announcementBubbles = pageAnnouncements.map(ann => {
            return {
                type: 'bubble',
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: ann.content, wrap: true, size: 'sm' },
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: `由 ${ann.creator_name} 於 ${formatDateTime(ann.created_at)} 發布`, size: 'xxs', color: '#AAAAAA', margin: 'lg', wrap: true }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical',
                    contents: [
                        { type: 'button', style: 'primary', color: '#DE5246', height: 'sm',
                            action: { type: 'postback', label: '🗑️ 刪除此公告', data: `action=select_announcement_for_deletion&ann_id=${ann.id}` }
                        }
                    ]
                }
            };
        });

        const paginationBubble = createPaginationBubble('action=view_announcements_for_deletion', page, hasNextPage);
        if (paginationBubble) {
            announcementBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '選擇要刪除的公告', contents: { type: 'carousel', contents: announcementBubbles }};
    } catch (err) {
        console.error('❌ 查詢公告列表失敗:', err);
        throw new Error('查詢公告時發生錯誤。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showCourseSeries(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            `SELECT DISTINCT ON (LEFT(id, 2)) id, title
             FROM courses
             WHERE time > NOW()
             ORDER BY LEFT(id, 2), time ASC
             LIMIT $1 OFFSET $2`,
            [PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageSeries = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageSeries.length === 0 && page === 1) {
            return { type: 'text', text: '目前沒有任何已開設且未來的課程系列可供管理。' };
        }
        if (pageSeries.length === 0) {
            return { type: 'text', text: '沒有更多課程系列了。' };
        }

        const seriesBubbles = pageSeries.map(series => {
            const prefix = series.id.substring(0, 2);
            const mainTitle = getCourseMainTitle(series.title); 

            return {
                type: 'bubble',
                header: {
                    type: 'box', layout: 'vertical', backgroundColor: '#343A40', paddingAll: 'lg',
                    contents: [
                        { type: 'text', text: mainTitle, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }
                    ]
                },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm',
                            action: { type: 'postback', label: '🗓️ 單堂管理與取消', data: `action=manage_course_group&prefix=${prefix}&page=1` }
                        },
                        { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm',
                            action: { type: 'postback', label: '🗑️ 批次取消全系列', data: `action=cancel_course_group_confirm&prefix=${prefix}` }
                        }
                    ]
                }
            };
        });

        const paginationBubble = createPaginationBubble('action=view_course_series', page, hasNextPage);
        if (paginationBubble) {
            seriesBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '管理已開課程', contents: { type: 'carousel', contents: seriesBubbles }};
    } catch (err) {
        console.error('❌ 查詢課程系列失敗:', err);
        throw new Error('查詢課程系列時發生錯誤，請稍後再試。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showPendingOrders(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query("SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);
        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return { type: 'text', text: '目前沒有待您確認的點數訂單。' };
        }
        if (pageOrders.length === 0) {
            return { type: 'text', text: '沒有更多待確認的訂單了。' };
        }

        const orderBubbles = pageOrders.map(order => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: order.user_name, weight: 'bold', size: 'xl' },
                    { type: 'text', text: `${order.points} 點 / ${order.amount} 元`, size: 'md' },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '後五碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: order.last_5_digits, color: '#666666', size: 'sm', flex: 5, wrap: true } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(order.timestamp), color: '#666666', size: 'sm', flex: 5, wrap: true } ] }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'horizontal', spacing: 'sm',
                contents: [
                    { type: 'button', style: 'primary', color: '#dc3545', flex: 1, action: { type: 'postback', label: '退回', data: `action=reject_order&order_id=${order.order_id}` } },
                    { type: 'button', style: 'primary', color: '#28a745', flex: 1, action: { type: 'postback', label: '核准', data: `action=confirm_order&order_id=${order.order_id}` } }
                ]
            }
        }));

        const paginationBubble = createPaginationBubble('action=view_pending_orders', page, hasNextPage);
        if (paginationBubble) {
            orderBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '待確認點數訂單', contents: { type: 'carousel', contents: orderBubbles } };
    } catch (err) {
        console.error('❌ 查詢待確認訂單失敗:', err);
        throw new Error('查詢訂單時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}
// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showAvailableCourses(userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const sevenDaysLater = new Date(Date.now() + 7 * ONE_DAY_IN_MS);
        
        const coursesRes = await client.query(
            `SELECT * FROM courses
             WHERE time > NOW() AND time < $1
             AND COALESCE(array_length(students, 1), 0) < capacity
             AND NOT ($2 = ANY(waiting))
             ORDER BY time ASC LIMIT $3 OFFSET $4`,
            [sevenDaysLater, userId, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = coursesRes.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, PAGINATION_SIZE) : coursesRes.rows;

        if (pageCourses.length === 0 && page === 1) {
            return { type: 'text', text: '抱歉，未來 7 天內沒有可預約的課程。\n您可至「我的課程」查看候補中的課程，或等候老師發布新課程。' };
        }
        if (pageCourses.length === 0) {
            return { type: 'text', text: '沒有更多可預約的課程了。' };
        }

        const courseItems = pageCourses.map(c => {
            const remainingSpots = c.capacity - (c.students?.length || 0);
            const mainTitle = c.title;
            return {
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                    { type: 'box', layout: 'horizontal', contents: [
                            { type: 'text', text: mainTitle, weight: 'bold', size: 'md', wrap: true, flex: 3 },
                            { type: 'text', text: `${c.points_cost} 點`, color: '#1A759F', weight: 'bold', size: 'md', align: 'end', flex: 1 }
                    ]},
                    { type: 'box', layout: 'horizontal', contents: [
                          { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666', flex: 2 },
                          { type: 'text', text: `剩餘 ${remainingSpots} 名`, size: 'sm', color: '#666666', align: 'end', flex: 1 }
                    ]},
                    { type: 'button', style: 'primary', height: 'sm', margin: 'md',
                        action: { type: 'postback', label: '預約此課程', data: `action=select_booking_spots&course_id=${c.id}` }
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

        const headerText = (page > 1 || hasNextPage)
            ? `7日內可預約課程 (第${page}頁)`
            : '7日內可預約課程';

        return {
            type: 'flex', altText: '可預約的課程列表',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', backgroundColor: '#52b69a', paddingAll: 'lg',
                    contents: [{ type: 'text', text: headerText, color: '#ffffff', weight: 'bold', size: 'lg' }]
                },
                body: { type: 'box', layout: 'vertical', contents: contents }
            }
        };
    } catch(err) {
        console.error('❌ 查詢可預約課程失敗:', err);
        throw new Error('查詢課程時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showMyCourses(userId, page) {
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
            return { type: 'text', text: '您目前沒有任何已預約或候補中的課程。' };
        }
        if (pageCourses.length === 0) {
            return { type: 'text', text: '沒有更多課程了。' };
        }

        const courseBubbles = pageCourses.map(c => {
            const isBooked = c.students.includes(userId);
            let spotsBooked = isBooked ? c.students.filter(id => id === userId).length : 0;
            const courseMainTitle = c.title; 
            const actionLabel = isBooked ? '取消預約 (1位)' : '取消候補';
            const postbackAction = isBooked ? 'confirm_cancel_booking_start' : 'confirm_cancel_waiting_start';
            const statusBoxContents = [
                { type: 'text', text: isBooked ? `✅ 已預約 (共 ${spotsBooked} 位)` : '🕒 候補中', weight: 'bold', size: 'sm', color: isBooked ? '#1a759f' : '#ff9e00' }
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
                        action: { type: 'postback', label: actionLabel, data: `action=${postbackAction}&course_id=${c.id}` }
                    }]
                }
            };
        });

        const paginationBubble = createPaginationBubble('action=view_my_courses', page, hasNextPage);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles }};
    } catch(err) {
        console.error('❌ 查詢我的課程失敗:', err);
        throw new Error('查詢課程時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 新增] 顯示學員自己的留言歷史
async function showMyMessages(userId, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(
            `SELECT * FROM feedback_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
            [userId, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;
        
        // 將本次所有撈出的「未讀」留言，更新為「已讀」
        if (pageMessages.length > 0) {
            await client.query(
                "UPDATE feedback_messages SET is_student_read = true WHERE user_id = $1 AND status = 'replied' AND is_student_read = false",
                [userId]
            );
        }

        if (pageMessages.length === 0 && page === 1) {
            return { type: 'text', text: '您目前沒有任何留言紀錄。' };
        }
        if (pageMessages.length === 0) {
            return { type: 'text', text: '沒有更多留言紀錄了。' };
        }

        const statusMap = {
            new: { text: '🟡 等待回覆', color: '#ffb703' },
            read: { text: '⚪️ 老師已讀', color: '#adb5bd' },
            replied: { text: '🟢 老師已回覆', color: '#2a9d8f' },
        };

        const messageBubbles = pageMessages.map(msg => {
            const statusInfo = statusMap[msg.status] || { text: msg.status, color: '#6c757d' };
            const bodyContents = [
                { type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: [
                    { type: 'text', text: '【我的留言】', weight: 'bold', size: 'sm', color: '#1A759F'},
                    { type: 'text', text: msg.message, wrap: true, size: 'md' }
                ]}
            ];

            if (msg.teacher_reply) {
                bodyContents.push({ type: 'separator', margin: 'lg' });
                bodyContents.push({ type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: [
                    { type: 'text', text: '【老師的回覆】', weight: 'bold', size: 'sm', color: '#52B69A'},
                    { type: 'text', text: msg.teacher_reply, wrap: true, size: 'md' }
                ]});
            }

            return {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'horizontal', paddingAll: 'lg', backgroundColor: statusInfo.color, contents: [
                    { type: 'text', text: statusInfo.text, color: '#FFFFFF', weight: 'bold' },
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xs', color: '#FFFFFF', align: 'end' }
                ]},
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents }
            };
        });
        
        const paginationBubble = createPaginationBubble('action=view_my_messages', page, hasNextPage);
        if (paginationBubble) {
            messageBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '您的歷史留言紀錄', contents: { type: 'carousel', contents: messageBubbles }};
    } catch (err) {
        console.error('❌ 查詢個人留言失敗:', err);
        throw new Error('查詢留言時發生錯誤，請稍後再試。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showShopProducts(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const productsRes = await client.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC LIMIT $1 OFFSET $2", [PAGINATION_SIZE + 1, offset]);

        const hasNextPage = productsRes.rows.length > PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            return { type: 'text', text: '目前商城沒有任何商品，敬請期待！' };
        }
        if (pageProducts.length === 0) {
            return { type: 'text', text: '沒有更多商品了。' };
        }

        const productBubbles = pageProducts.map(p => {
            const isSoldOut = p.inventory <= 0;
            const buttonStyle = isSoldOut ? 'secondary' : 'primary';
            const buttonLabel = isSoldOut ? '已售完' : '我要兌換';
            const buttonAction = isSoldOut
                ? { type: 'message', label: buttonLabel, text: '此商品已售完' }
                : { type: 'postback', label: buttonLabel, data: `action=confirm_product_purchase&product_id=${p.id}` };

            return {
                type: 'bubble',
                hero: (p.image_url && p.image_url.startsWith('https')) ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'fit' } : undefined,
                body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                        { type: 'text', text: p.name, weight: 'bold', size: 'xl' },
                        {
                            type: 'box', layout: 'horizontal', margin: 'md',
                            contents: [
                                { type: 'text', text: `${p.price} 點`, size: 'lg', color: '#1A759F', weight: 'bold', flex: 2 },
                                { type: 'text', text: `庫存: ${p.inventory}`, size: 'sm', color: '#666666', align: 'end', flex: 1, gravity: 'bottom' }
                            ]
                        },
                        { type: 'text', text: p.description || ' ', wrap: true, size: 'sm', margin: 'md', color: '#666666' },
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical',
                    contents: [
                        { type: 'button', style: buttonStyle, action: buttonAction, color: isSoldOut ? '#AAAAAA' : '#52B69A' }
                    ]
                }
            };
        });

        const paginationBubble = createPaginationBubble('action=view_shop_products', page, hasNextPage);
        if (paginationBubble) {
            productBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles } };
    } catch (err) {
        console.error('❌ 查詢商城商品失敗:', err);
        throw new Error('查詢商城時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
}
// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showSingleCoursesForCancellation(prefix, page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const coursesRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT $2 OFFSET $3", [`${prefix}%`, PAGINATION_SIZE + 1, offset]);

        const hasNextPage = coursesRes.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, PAGINATION_SIZE) : coursesRes.rows;

        if (pageCourses.length === 0 && page === 1) {
          return { type: 'text', text: "此系列沒有可取消的未來課程。" };
        }
        if (pageCourses.length === 0) {
            return { type: 'text', text: '沒有更多課程了。' };
        }

        const courseBubbles = pageCourses.map(c => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: c.title, wrap: true, weight: 'bold' },
                    { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'md'}
                ]
            },
            footer: {
                type: 'box', layout: 'vertical',
                contents: [{ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂課', data: `action=confirm_single_course_cancel&course_id=${c.id}` } }]
            }
        }));

        const paginationBubble = createPaginationBubble('action=manage_course_group', page, hasNextPage, `&prefix=${prefix}`);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '請選擇要單次取消的課程', contents: { type: 'carousel', contents: courseBubbles } };
    } catch (err) {
        console.error('❌ 查詢單堂課程失敗:', err);
        throw new Error('查詢課程時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showProductManagementList(page = 1, filter = null) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        let baseQuery = "SELECT * FROM products";
        const queryParams = [];
        let paramIndex = 1;

        if (filter) {
            baseQuery += ` WHERE status = $${paramIndex++}`;
            queryParams.push(filter);
        }

        baseQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(PAGINATION_SIZE + 1, offset);

        const productsRes = await client.query(baseQuery, queryParams);

        const hasNextPage = productsRes.rows.length > PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            const emptyMessage = filter === 'available'
                ? '目前沒有任何販售中的商品。'
                : (filter === 'unavailable' ? '目前沒有任何已下架的商品。' : '目前沒有任何商品可管理。');
            return { type: 'text', text: emptyMessage };
        }
        if (pageProducts.length === 0) {
            return { type: 'text', text: '沒有更多商品了。' };
        }

        const productBubbles = pageProducts.map(p => {
            const toggleLabel = p.status === 'available' ? '下架商品' : '重新上架';
            const toggleAction = `action=toggle_product_status&product_id=${p.id}`;

            return {
                type: 'bubble',
                hero: (p.image_url && p.image_url.startsWith('https')) ? {
                    type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'fit',
                } : undefined,
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: p.name, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'text', text: p.description || '無描述', wrap: true, size: 'sm', color: '#666666', margin: 'md' },
                        { type: 'separator', margin: 'lg' },
                        { type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: `價格: ${p.price} 點`, size: 'md' },
                                { type: 'text', text: `庫存: ${p.inventory}`, size: 'md', align: 'end' }
                            ]
                        }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm',
                    contents: [
                        { type: 'button', style: 'primary', height: 'sm', color: '#52B69A', action: { type: 'postback', label: '✏️ 編輯資訊', data: `action=manage_product&product_id=${p.id}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 調整庫存', data: `action=adjust_inventory_start&product_id=${p.id}` } },
                        { type: 'button', style: 'secondary', height: 'sm', color: '#D9534F', action: { type: 'postback', label: toggleLabel, data: toggleAction } }
                    ]
                }
            };
        });

        const paginationBubble = createPaginationBubble(
            'action=view_products', page, hasNextPage, filter ? `&filter=${filter}` : ''
        );

        if (paginationBubble) {
            productBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '商品管理列表', contents: { type: 'carousel', contents: productBubbles } };
    } catch (err) {
        console.error('❌ 查詢商品管理列表失敗:', err);
        throw new Error('查詢商品時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showStudentExchangeHistory(userId, page = 1) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const res = await client.query(`SELECT * FROM product_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, PAGINATION_SIZE + 1, offset]);

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return { type: 'text', text: '您沒有任何商品兌換紀錄。' };
        }
         if (pageOrders.length === 0) {
            return { type: 'text', text: '沒有更多紀錄了。' };
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
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                    { type: 'text', text: order.product_name, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: `花費: ${order.points_spent} 點`, size: 'sm' },
                    { type: 'text', text: `訂單ID: ${formatIdForDisplay(order.order_uid)}`, size: 'xxs', color: '#aaaaaa', wrap: true },
                    { type: 'text', text: `兌換時間: ${formatDateTime(order.created_at)}`, size: 'xs', color: '#aaaaaa' },
                    ...(order.status === 'completed' && order.updated_at ? [{ type: 'text', text: `完成時間: ${formatDateTime(order.updated_at)}`, size: 'xs', color: '#aaaaaa' }] : [])
                ]}
            };
        });

        const paginationBubble = createPaginationBubble('action=view_exchange_history', page, hasNextPage);
        if (paginationBubble) {
            historyBubbles.push(paginationBubble);
        }

        const carousel = { type: 'flex', altText: '兌換紀錄', contents: { type: 'carousel', contents: historyBubbles } };
        
        if (page === 1) {
            return [{ type: 'text', text: '以下是您近期的商品兌換紀錄：' }, carousel];
        }
        return carousel;
    } catch(err) {
        console.error('❌ 查詢兌換紀錄失敗:', err);
        throw new Error('查詢兌換紀錄時發生錯誤。');
    } finally {
        if(client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showCourseRosterSummary(page) {
    const offset = (page - 1) * PAGINATION_SIZE;
    const client = await pgPool.connect();
    try {
        const sevenDaysLater = new Date(Date.now() + 7 * ONE_DAY_IN_MS);
        const res = await client.query(
            `SELECT id, title, time,
                    COALESCE(array_length(students, 1), 0) as student_count,
                    COALESCE(array_length(waiting, 1), 0) as waiting_count
             FROM courses
             WHERE time > NOW() AND time < $1
             ORDER BY time ASC LIMIT $2 OFFSET $3`,
            [sevenDaysLater, PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > PAGINATION_SIZE;
        const pageCourses = hasNextPage ? res.rows.slice(0, PAGINATION_SIZE) : res.rows;

        if (pageCourses.length === 0 && page === 1) {
            return { type: 'text', text: '未來 7 天內沒有任何課程。' };
        }
        if (pageCourses.length === 0) {
            return { type: 'text', text: '沒有更多課程了。' };
        }

        const courseBubbles = pageCourses.map(c => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: c.title, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666' },
                    { type: 'separator', margin: 'md' },
                    {
                        type: 'box', layout: 'horizontal', margin: 'md',
                        contents: [
                            { type: 'text', text: `預約: ${c.student_count} 人`, size: 'sm', flex: 1 },
                            { type: 'text', text: `候補: ${c.waiting_count} 人`, size: 'sm', flex: 1, align: 'end' }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical',
                contents: [{
                    type: 'button', style: 'primary', height: 'sm',
                    action: { type: 'postback', label: '查看詳細名單', data: `action=view_course_roster_details&course_id=${c.id}` }
                }]
            }
        }));

        const paginationBubble = createPaginationBubble('action=view_course_roster_summary', page, hasNextPage);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '課程狀態查詢', contents: { type: 'carousel', contents: courseBubbles }};
    } catch (err) {
        console.error('❌ 查詢課程報名概況失敗:', err);
        throw new Error('查詢課程時發生錯誤，請稍後再試。');
    } finally {
        if (client) client.release();
    }
}

// [V28.0 重構] 不再傳入 replyToken，改為回傳 message 物件
async function showCourseRosterDetails(courseId) {
    const client = await pgPool.connect();
    try {
        const courseRes = await client.query("SELECT title, time, students, waiting FROM courses WHERE id = $1", [courseId]);
        if (courseRes.rows.length === 0) {
            return { type: 'text', text: '找不到該課程的資料。' };
        }
        const course = courseRes.rows[0];
        const studentIds = course.students || [];
        const waitingIds = course.waiting || [];
        const allUserIds = [...new Set([...studentIds, ...waitingIds])];

        let users = [];
        if (allUserIds.length > 0) {
            const usersRes = await client.query("SELECT id, name, picture_url FROM users WHERE id = ANY($1::text[])", [allUserIds]);
            users = usersRes.rows;
        }

        const userMap = new Map(users.map(u => [u.id, u]));
        const placeholderAvatar = 'https://i.imgur.com/8l1Yd2S.png';

        const createStudentListComponent = (ids, title) => {
            const studentCounts = ids.reduce((acc, id) => {
                acc[id] = (acc[id] || 0) + 1;
                return acc;
            }, {});
            
            const uniqueIds = Object.keys(studentCounts);
            const studentBoxes = uniqueIds.map(id => {
                const user = userMap.get(id);
                const count = studentCounts[id];
                const displayName = user?.name || '未知用戶';
                const displayText = count > 1 ? `${displayName} (x${count})` : displayName;
                return {
                    type: 'box', layout: 'vertical', alignItems: 'center', spacing: 'sm',
                    contents: [
                        { type: 'image', url: user?.picture_url || placeholderAvatar, aspectRatio: '1:1', size: 'md', flex: 0 },
                        { type: 'text', text: displayText, wrap: true, size: 'sm', align: 'center' }
                    ]
                };
            });

            const listContents = [
                { type: 'text', text: title, weight: 'bold', color: '#1A759F', margin: 'lg', size: 'md', align: 'center' },
            ];

            if (studentBoxes.length === 0) {
                listContents.push({ type: 'text', text: '無', margin: 'md', size: 'sm', color: '#999999', align: 'center' });
            } else {
                for (let i = 0; i < studentBoxes.length; i += 4) {
                    listContents.push({
                        type: 'box', layout: 'horizontal', spacing: 'md', margin: 'lg',
                        contents: studentBoxes.slice(i, i + 4)
                    });
                }
            }
            return listContents;
        };

        const bodyContents = [
            ...createStudentListComponent(studentIds, `✅ 已預約學員 (${studentIds.length})`),
            { type: 'separator', margin: 'xl' },
            ...createStudentListComponent(waitingIds, `🕒 候補中學員 (${waitingIds.length})`)
        ];

        return {
            type: 'flex',
            altText: `課程 ${course.title} 的詳細名單`,
            contents: {
                type: 'bubble', size: 'giga',
                header: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg',
                    contents: [
                        { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'text', text: formatDateTime(course.time), size: 'sm', color: '#666666', margin: 'md' }
                    ]
                },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'md', contents: bodyContents
                }
            }
        };
    } catch (err) {
        console.error('❌ 顯示課程詳細名單失敗:', err);
        throw new Error('查詢名單時發生錯誤，請稍後再試。');
    } finally {
        if (client) client.release();
    }
}
// [V28.0 重構] 傳入 user 物件，改為回傳 message 物件
async function handleAdminCommands(event, user) {
  const text = event.message.text ? event.message.text.trim().normalize() : '';

  if (pendingTeacherAddition[user.id]) {
    const state = pendingTeacherAddition[user.id];
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return { type: 'text', text: `找不到名為「${text}」的學員。請重新輸入或取消操作。`, quickReply: { items: getCancelMenu() } };
        } else if (studentRes.rows.length === 1) {
          state.targetUser = studentRes.rows[0];
          state.step = 'await_confirmation';
          return { type: 'text', text: `您確定要授權學員「${state.targetUser.name}」成為老師嗎？`, quickReply: { items: [
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
            ...getCancelMenu()
          ]}};
        } else {
          return { type: 'text', text: `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, quickReply: { items: getCancelMenu() } };
        }
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'teacher';
          targetUser.approved_by = user.id;
          await saveUser(targetUser);
          delete pendingTeacherAddition[user.id];
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
          const notifyMessage = { type: 'text', text: '恭喜！您的身份已被管理者授權為「老師」。'};
          await enqueuePushTask(targetUser.id, notifyMessage).catch(e => console.error(e));
          return { type: 'text', text: `✅ 已成功授權「${targetUser.name}」為老師。` };
        } else {
          return { type: 'text', text: '請點擊確認或取消按鈕。' };
        }
    }
  } else if (pendingTeacherRemoval[user.id]) {
    const state = pendingTeacherRemoval[user.id];
    if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
      const targetUser = await getUser(state.targetUser.id);
      targetUser.role = 'student';
      targetUser.approved_by = null;
      await saveUser(targetUser);
      delete pendingTeacherRemoval[user.id];
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
      const notifyMessage = { type: 'text', text: '通知：您的「老師」身份已被管理者移除，已切換為學員身份。'};
      await enqueuePushTask(targetUser.id, notifyMessage).catch(e => console.error(e));
      return { type: 'text', text: `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。` };
    } else {
      return { type: 'text', text: '請點擊確認或取消按鈕。' };
    }
  } else {
    if (text === COMMANDS.ADMIN.PANEL) {
      const failedTasksRes = await pgPool.query("SELECT COUNT(*) FROM failed_tasks");
      const failedTasksCount = parseInt(failedTasksRes.rows[0].count, 10);
      let failedTasksLabel = '失敗任務管理';
      if (failedTasksCount > 0) {
        failedTasksLabel += ` (${failedTasksCount})`;
      }
      const adminMenu = [
        { type: 'action', action: { type: 'message', label: '系統狀態', text:COMMANDS.ADMIN.SYSTEM_STATUS } },
        { type: 'action', action: { type: 'message', label: failedTasksLabel, text: COMMANDS.ADMIN.FAILED_TASK_MANAGEMENT } },
        { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } },
        { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } },
        { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } },
        { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } },
        { type: 'action', action: { type: 'message', label: '切換推播通知', text: COMMANDS.ADMIN.TOGGLE_NOTIFICATIONS } }
      ];
      const currentStatus = await getNotificationStatus();
      const statusText = currentStatus ? '【目前為：開啟】' : '【目前為：關閉】';
      return { type: 'text', text: `請選擇管理者功能：\n\n開發者推播通知 ${statusText}`, quickReply: { items: adminMenu } };
    } else if (text === COMMANDS.ADMIN.SYSTEM_STATUS) {
      return showSystemStatus();
    } else if (text === COMMANDS.ADMIN.FAILED_TASK_MANAGEMENT) {
      return showFailedTasks(1);
    } else if (text === COMMANDS.ADMIN.TOGGLE_NOTIFICATIONS) {
        const currentStatus = await getNotificationStatus();
        const newStatus = !currentStatus;
        const db = await pgPool.connect();
        try {
            await db.query(
                `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('notifications_enabled', $1, NOW())
                 ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = NOW()`,
                [newStatus.toString()]
            );
            notificationStatusCache = { value: newStatus, timestamp: Date.now() };
            const statusText = newStatus ? '【開啟】' : '【關閉】';
            return { type: 'text', text: `✅ 開發者推播通知功能已設定為 ${statusText}。\n此設定只會影響傳送給老師/管理員的通知。` };
        } catch(err) {
            console.error("❌ 切換推播通知設定失敗:", err);
            throw new Error("抱歉，切換設定時發生錯誤。");
        } finally {
            if (db) db.release();
        }
    } else if (text === COMMANDS.ADMIN.ADD_TEACHER) {
      pendingTeacherAddition[user.id] = { step: 'await_student_info' };
      setupConversationTimeout(user.id, pendingTeacherAddition, 'pendingTeacherAddition', (u) => {
          const timeoutMessage = { type: 'text', text: '授權老師操作逾時，自動取消。'};
          enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
      });
      return { type: 'text', text: '請輸入您想授權為老師的「學員」姓名或 User ID：', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
        return showTeacherListForRemoval(1);
    } else if (text === COMMANDS.ADMIN.SIMULATE_STUDENT) {
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(user.id, STUDENT_RICH_MENU_ID);
      return { type: 'text', text: '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。' };
    } else if (text === COMMANDS.ADMIN.SIMULATE_TEACHER) {
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(user.id, TEACHER_RICH_MENU_ID);
      return { type: 'text', text: '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。' };
    }
  }
  return null;
}

// [V28.0 重構] 傳入 user 物件，改為回傳 message 物件
async function handleTeacherCommands(event, user) {
  const text = event.message.text ? event.message.text.trim().normalize() : '';

  if (pendingProductCreation[user.id]) {
    const state = pendingProductCreation[user.id];
    switch (state.step) {
        case 'await_name':
            state.name = text;
            state.step = 'await_description';
            return { type: 'text', text: '請輸入商品描述 (可換行)，或輸入「無」：', quickReply: { items: getCancelMenu() } };
        case 'await_description':
            state.description = text === '無' ? null : text;
            state.step = 'await_price';
            return { type: 'text', text: '請輸入商品兌換價格 (點數，純數字)：', quickReply: { items: getCancelMenu() } };
        case 'await_price':
            const price = parseInt(text, 10);
            if (isNaN(price) || price < 0) {
                return { type: 'text', text: '價格格式不正確，請輸入一個非負整數。', quickReply: { items: getCancelMenu() } };
            }
            state.price = price;
            state.step = 'await_inventory';
            return { type: 'text', text: '請輸入商品初始庫存 (純數字)：', quickReply: { items: getCancelMenu() } };
        case 'await_inventory':
            const inventory = parseInt(text, 10);
            if (isNaN(inventory) || inventory < 0) {
                return { type: 'text', text: '庫存格式不正確，請輸入一個非負整數。', quickReply: { items: getCancelMenu() } };
            }
            state.inventory = inventory;
            state.step = 'await_image_url';
            return { type: 'text', text: '請直接上傳一張商品圖片，或輸入「無」：', quickReply: { items: getCancelMenu() } };
        case 'await_image_url':
            let imageUrl = null;
            if (event.message.type === 'text' && event.message.text.trim().toLowerCase() === '無') {
                imageUrl = null;
            } else if (event.message.type === 'image') {
                try {
                    const imageResponse = await axios.get(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { 'Authorization': `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` }, responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(imageResponse.data, 'binary');
                    const uploadResponse = await imagekit.upload({ file: imageBuffer, fileName: `product_${Date.now()}.jpg`, useUniqueFileName: true, folder: "yoga_products" });
                    imageUrl = uploadResponse.url;
                } catch (err) {
                    console.error("❌ 圖片上傳至 ImageKit.io 失敗:", err);
                    return { type: 'text', text: '圖片上傳失敗，請稍後再試。', quickReply: { items: getCancelMenu() } };
                }
            } else {
                return { type: 'text', text: '格式錯誤，請直接上傳一張商品圖片，或輸入「無」。', quickReply: { items: getCancelMenu() } };
            }
            state.image_url = imageUrl;
            state.step = 'await_confirmation';
            const summaryText = `請確認商品資訊：\n\n名稱：${state.name}\n描述：${state.description || '無'}\n價格：${state.price} 點\n庫存：${state.inventory}\n圖片：${state.image_url || '無'}\n\n確認無誤後請點擊「✅ 確認上架」。`;
            return { type: 'text', text: summaryText, quickReply: { items: [
                { type: 'action', action: { type: 'postback', label: '✅ 確認上架', data: 'action=confirm_add_product' } },
                { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
            ]}};
    }
  } else if(pendingProductEdit[user.id]) {
    const state = pendingProductEdit[user.id];
    const product = state.product;
    const field = state.field;
    let newValue = text;
    let isValid = true;
    let errorMessage = '';

    if (field === 'price' || field === 'inventory') {
        const numValue = parseInt(text, 10);
        if (isNaN(numValue) || numValue < 0) {
            isValid = false;
            errorMessage = '請輸入一個非負整數。';
        } else {
            newValue = numValue;
        }
    } else if (field === 'description' && text.toLowerCase() === '無') {
        newValue = null;
    } else if (field === 'image_url') {
        if (text.toLowerCase() === '無') {
           newValue = null;
        } else if (!text.startsWith('https://') || !text.match(/\.(jpeg|jpg|gif|png)$/i)) {
            isValid = false;
            errorMessage = '圖片網址格式不正確，必須是 https 開頭的圖片連結。';
        }
    }

    if (!isValid) {
        return { type: 'text', text: errorMessage, quickReply: { items: getCancelMenu() } };
    }

    product[field] = newValue;
    await saveProduct(product);
    delete pendingProductEdit[user.id];
    const fieldMap = { name: '名稱', description: '描述', price: '價格', image_url: '圖片網址', inventory: '庫存' };
    return { type: 'text', text: `✅ 已成功將商品「${product.name}」的「${fieldMap[field]}」更新為「${newValue === null ? '無' : newValue}」。` };
  } else if(pendingInventoryAdjust[user.id]) {
    const state = pendingInventoryAdjust[user.id];
    const product = state.product;
    const numValue = parseInt(text, 10);

    if(isNaN(numValue)) {
      return { type: 'text', text: '格式錯誤，請輸入一個整數 (正數為增加，負數為減少)。', quickReply: { items: getCancelMenu() } };
    }

    const newInventory = product.inventory + numValue;
    if(newInventory < 0) {
      return { type: 'text', text: `庫存調整失敗，調整後庫存 (${newInventory}) 不可小於 0。`, quickReply: { items: getCancelMenu() } };
    }

    product.inventory = newInventory;
    await saveProduct(product);
    delete pendingInventoryAdjust[user.id];
    return { type: 'text', text: `✅ 已成功調整商品「${product.name}」的庫存。\n原庫存: ${state.originalInventory}\n調整量: ${numValue > 0 ? '+' : ''}${numValue}\n新庫存: ${newInventory}` };
  } else if (pendingAnnouncementCreation[user.id]) {
    const state = pendingAnnouncementCreation[user.id];
    switch (state.step) {
      case 'await_content':
        state.content = text;
        state.step = 'await_confirmation';
        return {
          type: 'flex', altText: '確認公告內容',
          contents: {
            type: 'bubble',
            body: {
              type: 'box', layout: 'vertical', spacing: 'lg',
              contents: [
                { type: 'text', text: '請確認公告內容', weight: 'bold', size: 'lg' },
                { type: 'separator' },
                { type: 'text', text: state.content, wrap: true }
              ]
            },
            footer: {
              type: 'box', layout: 'vertical', spacing: 'sm',
              contents: [
                { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
              ]
            }
          }
        };
      case 'await_confirmation':
        if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
          await pgPool.query( "INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)", [state.content, user.id, user.name] );
          delete pendingAnnouncementCreation[user.id];
          return { type: 'text', text: '✅ 公告已成功頒佈！學員可在「最新公告」中查看。' };
        } else {
          return { type: 'text', text: '請點擊「確認頒佈」或「取消操作」。' };
        }
    }
  } else if (pendingAnnouncementDeletion[user.id]) {
    if (text === COMMANDS.TEACHER.CONFIRM_DELETE_ANNOUNCEMENT) {
        await pgPool.query("DELETE FROM announcements WHERE id = $1", [pendingAnnouncementDeletion[user.id].ann_id]);
        delete pendingAnnouncementDeletion[user.id];
        return { type: 'text', text: '✅ 公告已成功刪除。' };
    } else {
        return { type: 'text', text: '請點擊「確認刪除」或「取消操作」。' };
    }
  } else if (pendingCourseCancellation[user.id]) {
    const state = pendingCourseCancellation[user.id];
    switch(state.type) {
      case 'batch':
        if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
          const backgroundState = { ...state };
          delete pendingCourseCancellation[user.id];
          (async () => {
              const client = await pgPool.connect();
              try {
                await client.query('BEGIN');
                const coursesToCancelRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${backgroundState.prefix}%`]);
                if (coursesToCancelRes.rows.length === 0) {
                  const errMsg = { type: 'text', text: `❌ 批次取消失敗：找不到可取消的「${backgroundState.prefix}」系列課程。`};
                  await enqueuePushTask(user.id, errMsg);
                  return;
                }
                const coursesToCancel = coursesToCancelRes.rows;
                const affectedUsers = new Map();
                for (const course of coursesToCancel) { for (const studentId of course.students) { if (!affectedUsers.has(studentId)) affectedUsers.set(studentId, 0); affectedUsers.set(studentId, affectedUsers.get(studentId) + course.points_cost); } }
                for (const [studentId, refundAmount] of affectedUsers.entries()) { if (refundAmount > 0) { await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [refundAmount, studentId]); } }
                const courseMainTitle = getCourseMainTitle(coursesToCancel[0].title);
                await client.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${backgroundState.prefix}%`]);
                await client.query('COMMIT');
                for (const [studentId, refundAmount] of affectedUsers.entries()) { const studentMsg = { type: 'text', text: `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。` }; enqueuePushTask(studentId, studentMsg).catch(e => console.error(e)); }
                const teacherMsg = { type: 'text', text: `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。` };
                await enqueuePushTask(user.id, teacherMsg);
              } catch (e) {
                await client.query('ROLLBACK');
                console.error('[批次取消] 背景任務執行失敗:', e);
                const errorMsg = { type: 'text', text: `❌ 批次取消課程時發生嚴重錯誤，操作已復原。請聯繫管理員。\n錯誤: ${e.message}` };
                await enqueuePushTask(user.id, errorMsg);
              } finally {
                if(client) client.release();
              }
          })();
          return { type: 'text', text: '✅ 指令已收到，正在為您批次取消課程。\n完成後將會另行通知，請稍候...' };
        }
        break;
      case 'single':
         if (text === COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
            const client = await pgPool.connect();
            try {
              await client.query('BEGIN');
              const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [state.course_id]);
              if (courseToCancelRes.rows.length === 0) {
                delete pendingCourseCancellation[user.id];
                return { type: 'text', text: "找不到該課程，可能已被取消。" };
              }
              const course = courseToCancelRes.rows[0];
              for (const studentId of course.students) {
                 await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                 const studentMsg = { type: 'text', text: `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`};
                 enqueuePushTask(studentId, studentMsg).catch(e => console.error(e));
              }
              await client.query("DELETE FROM courses WHERE id = $1", [state.course_id]);
              await client.query('COMMIT');
              delete pendingCourseCancellation[user.id];
              return { type: 'text', text: `✅ 已成功取消課程「${course.title}」。` };
            } catch (e) {
                await client.query('ROLLBACK');
                delete pendingCourseCancellation[user.id];
                console.error('單堂取消課程失敗:', e);
                throw new Error('取消課程時發生錯誤，請稍後再試。');
            } finally {
              if(client) client.release();
            }
         }
        break;
    }
  } else if (pendingCourseCreation[user.id]) {
    const state = pendingCourseCreation[user.id];
    switch (state.step) {
        case 'await_title':
            state.title = text;
            state.step = 'await_weekday';
            const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
            return { type: 'text', text: `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, quickReply: { items: weekdayButtons } };
        case 'await_time':
            if (!/^\d{2}:\d{2}$/.test(text)) {
                return { type: 'text', text: '時間格式不正確，請輸入四位數時間，例如：19:30', quickReply: { items: getCancelMenu() } };
            }
            state.time = text;
            state.step = 'await_sessions';
            return { type: 'text', text: '請問這個系列總共要開設幾堂課？（請輸入數字）', quickReply: { items: getCancelMenu() } };
       case 'await_sessions':
            const sessions = parseInt(text, 10);
            if (isNaN(sessions) || sessions <= 0) {
                return { type: 'text', text: '堂數必須是正整數，請重新輸入。', quickReply: { items: getCancelMenu() } };
            }
            state.sessions = sessions;
            state.step = 'await_capacity';
            return { type: 'text', text: '請問每堂課的名額限制？（請輸入數字）', quickReply: { items: getCancelMenu() } };
        case 'await_capacity':
            const capacity = parseInt(text, 10);
            if (isNaN(capacity) || capacity <= 0) {
                return { type: 'text', text: '名額必須是正整數，請重新輸入。', quickReply: { items: getCancelMenu() } };
            }
            state.capacity = capacity;
            state.step = 'await_points';
            return { type: 'text', text: '請問每堂課需要消耗多少點數？（請輸入數字）', quickReply: { items: getCancelMenu() } };
        case 'await_points':
            const points = parseInt(text, 10);
            if (isNaN(points) || points < 0) {
                return { type: 'text', text: '點數必須是正整數或 0，請重新輸入。', quickReply: { items: getCancelMenu() } };
            }
            state.points_cost = points;
            state.step = 'await_confirmation';
            const firstDate = getNextDate(state.weekday, state.time);
            const summary = `請確認課程資訊：\n\n標題：${state.title}\n時間：每${state.weekday_label} ${state.time}\n堂數：${state.sessions} 堂\n名額：${state.capacity} 位\n費用：${state.points_cost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
            return { type: 'text', text: summary, quickReply: { items: [
                { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } },
                { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } }
            ]}};
        case 'await_confirmation':
            if (text === '✅ 確認新增') {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    const prefix = await generateUniqueCoursePrefix(client);
                    let currentDate = new Date();
                    for (let i = 0; i < state.sessions; i++) {
                        const courseDate = getNextDate(state.weekday, state.time, currentDate);
                        const course = { id: `${prefix}${String(i + 1).padStart(2, '0')}`, title: state.title, time: courseDate.toISOString(), capacity: state.capacity, points_cost: state.points_cost, students: [], waiting: [] };
                        await saveCourse(course, client);
                        currentDate = new Date(courseDate.getTime() + ONE_DAY_IN_MS);
                    }
                    await client.query('COMMIT');
                    delete pendingCourseCreation[user.id];
                    return { type: 'text', text: `✅ 成功新增「${state.title}」系列共 ${state.sessions} 堂課！` };
                } catch (e) {
                    await client.query('ROLLBACK');
                    console.error("新增課程系列失敗:", e);
                    delete pendingCourseCreation[user.id];
                    throw new Error('新增課程時發生錯誤，請稍後再試。');
                } finally {
                    if(client) client.release();
                }
            } else {
                return { type: 'text', text: '請點擊「✅ 確認新增」或「❌ 取消操作」。' };
            }
    }
  } else if (pendingManualAdjust[user.id]) {
    const state = pendingManualAdjust[user.id];
    switch (state.step) {
      case 'await_student_search':
        const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
        if (res.rows.length === 0) {
          return { type: 'text', text: `找不到學員「${text}」。請重新輸入或取消操作。`, quickReply: { items: getCancelMenu() } };
        }
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } }));
        return { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } };
      case 'await_operation':
        if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
          state.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
          state.step = 'await_amount';
          return { type: 'text', text: `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`, quickReply: { items: getCancelMenu() } };
        } else {
          return { type: 'text', text: '請點擊 `+ 加點` 或 `- 扣點` 按鈕。' };
        }
      case 'await_amount':
        const amount = parseInt(text, 10);
        if (isNaN(amount) || amount <= 0) { return { type: 'text', text: '點數格式不正確，請輸入一個大於 0 的正整數。', quickReply: { items: getCancelMenu() } }; }
        state.amount = amount;
        state.step = 'await_reason';
        return { type: 'text', text: '請輸入調整原因（例如：活動獎勵、課程補償等）：', quickReply: { items: getCancelMenu() } };
      case 'await_reason':
        state.reason = text;
        state.step = 'await_confirmation';
        const opText = state.operation === 'add' ? `增加 ${state.amount} 點` : `扣除 ${state.amount} 點`;
        const summary = `請確認調整內容：\n\n對象：${state.targetStudent.name}\n操作：${opText}\n原因：${state.reason}`;
        return { type: 'text', text: summary, quickReply: { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.GENERAL.CANCEL, text: COMMANDS.GENERAL.CANCEL } } ]}};
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
              delete pendingManualAdjust[user.id];
              return { type: 'text', text: `操作失敗：學員 ${student.name} 的點數不足以扣除 ${state.amount} 點。` };
            }
            const historyEntry = { action: `手動調整：${state.operation === 'add' ? '+' : '-'}${state.amount}點`, reason: state.reason, time: new Date().toISOString(), operator: user.name };
            const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
            await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
            await clientDB.query('COMMIT');
            delete pendingManualAdjust[user.id];
            const opTextForStudent = state.operation === 'add' ? `增加了 ${state.amount}` : `扣除了 ${state.amount}`;
            const notifyMessage = { type: 'text', text: `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${state.reason}\n您目前的點數為：${newPoints} 點。`};
            await enqueuePushTask(student.id, notifyMessage).catch(e => console.error(e));
            return { type: 'text', text: `✅ 已成功為學員 ${student.name} ${state.operation === 'add' ? '增加' : '扣除'} ${state.amount} 點。` };
          } catch (e) {
            await clientDB.query('ROLLBACK');
            console.error('手動調整點數失敗:', e);
            delete pendingManualAdjust[user.id];
            throw new Error('❌ 操作失敗，資料庫發生錯誤，請稍後再試。');
          } finally {
            if(clientDB) clientDB.release();
          }
        }
        break;
    }
  } else if (pendingStudentSearchQuery[user.id]) {
    const searchQuery = text;
    delete pendingStudentSearchQuery[user.id];
    return showStudentSearchResults(searchQuery, 1);
  } else if (pendingReply[user.id]) {
    const state = pendingReply[user.id];
    const client = await pgPool.connect();
    try {
      await client.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1, is_student_read = false WHERE id = $2", [text, state.msgId]);
      const studentId = state.studentId;
      const originalMessage = state.originalMessage;
      delete pendingReply[user.id];
      const notifyMessage = { type: 'text', text: `老師回覆了您的留言：\n\n【您的留言】\n${originalMessage}\n\n【老師的回覆】\n${text}`};
      await enqueuePushTask(studentId, notifyMessage);
      return { type: 'text', text: '✅ 已成功回覆學員的留言。' };
    } catch (err) {
      console.error('❌ 回覆留言失敗:', err);
      delete pendingReply[user.id];
      throw new Error('回覆留言時發生錯誤，請稍後再試。');
    } finally {
        if(client) client.release();
    }
  } else if (pendingMessageSearchQuery[user.id]) {
    const searchQuery = text;
    delete pendingMessageSearchQuery[user.id];
    return showHistoricalMessages(searchQuery, 1);
  } else {
    // --- 處理一般指令 ---
    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
        return {
            type: 'flex', altText: '課程管理',
            contents: {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🗓️ 課程管理', color: '#ffffff', weight: 'bold', size: 'lg'}], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 新增課程系列', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.ADD_COURSE_SERIES)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 課程狀態查詢', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.COURSE_INQUIRY)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 管理已開課程', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.MANAGE_OPEN_COURSES)}` } }
                    ]
                }
            }
        };
    } else if (text === COMMANDS.TEACHER.ADD_COURSE_SERIES) {
        pendingCourseCreation[user.id] = { step: 'await_title' };
        setupConversationTimeout(user.id, pendingCourseCreation, 'pendingCourseCreation', (u) => {
            const timeoutMessage = { type: 'text', text: '新增課程逾時，自動取消。'};
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
        });
        return { type: 'text', text: '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.TEACHER.MANAGE_OPEN_COURSES) {
        return showCourseSeries(1);
    } else if (text === COMMANDS.TEACHER.COURSE_INQUIRY) {
        return showCourseRosterSummary(1);
    } else if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const pendingOrdersRes = await pgPool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'");
        const pendingCount = parseInt(pendingOrdersRes.rows[0].count, 10);
        let pendingOrdersLabel = '✅ 確認處理訂單';
        if (pendingCount > 0) {
            pendingOrdersLabel = `✅ 確認處理訂單 (${pendingCount})`;
        }
        return {
            type: 'flex', altText: '點數管理',
            contents: {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '💎 點數管理', color: '#ffffff', weight: 'bold', size: 'lg' }], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingOrdersLabel, data: `action=view_pending_orders_page&page=1` }},
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✍️ 手動調整點數', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.MANUAL_ADJUST_POINTS)}` }}
                    ]
                }
            }
        };
    } else if (text === COMMANDS.TEACHER.PENDING_POINT_ORDERS) {
        return showPendingOrders(1);
    } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const unreadMessagesRes = await pgPool.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'");
        const unreadCount = parseInt(unreadMessagesRes.rows[0].count, 10);
        let unreadLabel = '💬 查看未回覆留言';
        if (unreadCount > 0) {
            unreadLabel += ` (${unreadCount})`;
        }
        return {
            type: 'flex', altText: '學員管理',
            contents: {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '👤 學員管理', color: '#ffffff', weight: 'bold', size: 'lg' }], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 查詢學員', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.SEARCH_STUDENT)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: unreadLabel, data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.VIEW_MESSAGES)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查看歷史留言', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.MESSAGE_SEARCH)}` } }
                    ]
                }
            }
        };
    } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
        pendingStudentSearchQuery[user.id] = {};
        setupConversationTimeout(user.id, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => {
            if (pendingStudentSearchQuery[u]) {
                delete pendingStudentSearchQuery[u];
                const timeoutMessage = { type: 'text', text: '查詢學員逾時，自動取消。'};
                enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
            }
        });
        return { type: 'text', text: '請輸入您想查詢的學員姓名或 User ID：', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
        return showUnreadMessages(1);
    } else if (text === COMMANDS.TEACHER.MESSAGE_SEARCH) {
        pendingMessageSearchQuery[user.id] = {};
        setupConversationTimeout(user.id, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => {
            if (pendingMessageSearchQuery[u]) {
                delete pendingMessageSearchQuery[u];
                const timeoutMessage = { type: 'text', text: '查詢歷史留言逾時，自動取消。'};
                enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
            }
        });
        return { type: 'text', text: '請輸入您想查詢的學員姓名或留言關鍵字：', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        return {
            type: 'flex', altText: '公告管理',
            contents: {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📢 公告管理', color: '#ffffff', weight: 'bold', size: 'lg' }], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 頒佈新公告', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.ADD_ANNOUNCEMENT)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🗑️ 刪除舊公告', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.DELETE_ANNOUNCEMENT)}` } }
                    ]
                }
            }
        };
    } else if (text === COMMANDS.TEACHER.ADD_ANNOUNCEMENT) {
        pendingAnnouncementCreation[user.id] = { step: 'await_content' };
        setupConversationTimeout(user.id, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => {
            const timeoutMessage = { type: 'text', text: '頒佈公告操作逾時，自動取消。'};
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
        });
        return { type: 'text', text: '請輸入要頒佈的公告內容：', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.TEACHER.DELETE_ANNOUNCEMENT) {
        return showAnnouncementsForDeletion(1);
    } else if (text === COMMANDS.TEACHER.SHOP_MANAGEMENT) {
        const pendingShopOrdersRes = await pgPool.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'");
        const pendingShopOrdersCount = parseInt(pendingShopOrdersRes.rows[0].count, 10);
        let pendingShopOrdersLabel = '📋 查看待處理訂單';
        if (pendingShopOrdersCount > 0) {
            pendingShopOrdersLabel += ` (${pendingShopOrdersCount})`;
        }
        return {
          type: 'flex', altText: '商城管理',
          contents: {
            type: 'bubble', size: 'giga',
            header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '🛍️ 商城管理', weight: 'bold', size: 'lg', color: '#FFFFFF' } ], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
              contents: [
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 上架新商品', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.ADD_PRODUCT)}` } },
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🛒 管理販售中商品', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS)}` } },
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 管理已下架商品', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS)}` } },
                { type: 'separator', margin: 'md'},
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingShopOrdersLabel, data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT)}` } }
              ]
            }
          }
        };
    } else if (text === COMMANDS.TEACHER.ADD_PRODUCT) {
        pendingProductCreation[user.id] = { step: 'await_name' };
        setupConversationTimeout(user.id, pendingProductCreation, 'pendingProductCreation', u => {
            const timeoutMessage = { type: 'text', text: '上架商品操作逾時，自動取消。' };
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
        });
        return { type: 'text', text: '請輸入新商品的名稱：', quickReply: { items: getCancelMenu() } };
    } else if (text === COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS) {
        return showProductManagementList(1, 'available');
    } else if (text === COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS) {
        return showProductManagementList(1, 'unavailable');
    } else if (text === COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT) {
        return showPendingShopOrders(1);
    } else if (text === COMMANDS.TEACHER.REPORT) {
        return {
            type: 'flex', altText: '統計報表',
            contents: {
                type: 'bubble', size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📊 統計報表', weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#343A40', paddingTop: 'lg', paddingBottom: 'lg' },
                body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📈 課程報表', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.COURSE_REPORT)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💰 訂單報表', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.ORDER_REPORT)}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💎 點數報表', data: `action=run_command&text=${encodeURIComponent(COMMANDS.TEACHER.POINT_REPORT)}` } }
                    ]
                }
            }
        };
    } else if (text === COMMANDS.TEACHER.COURSE_REPORT || text === COMMANDS.TEACHER.ORDER_REPORT) {
        const reportType = text === COMMANDS.TEACHER.COURSE_REPORT ? 'course' : 'order';
        const title = text === COMMANDS.TEACHER.COURSE_REPORT ? '課程報表' : '訂單報表';
        return {
            type: 'flex', altText: '選擇時間週期',
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#52b69a' },
                body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本週', data: `action=generate_report&type=${reportType}&period=week` } },
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本月', data: `action=generate_report&type=${reportType}&period=month` } },
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本季', data: `action=generate_report&type=${reportType}&period=quarter` } },
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '今年', data: `action=generate_report&type=${reportType}&period=year` } },
                ] },
                footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請選擇要查詢的時間區間', size: 'sm', color: '#AAAAAA', align: 'center'}] }
            }
        };
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
                (async () => {
                    const reportText = await generateReportTask();
                    await enqueuePushTask(user.id, { type: 'text', text: reportText });
                })();
                return { type: 'text', text: '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。' };
            } else {
                return { type: 'text', text: result };
            }
        } catch (err) {
            console.error('❌ 即時生成點數報表失敗:', err);
            throw new Error('❌ 產生報表時發生錯誤，請稍後再試。');
        }
    } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        return showPendingOrders(1);
    } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
        pendingManualAdjust[user.id] = { step: 'await_student_search' };
        setupConversationTimeout(user.id, pendingManualAdjust, 'pendingManualAdjust', (u) => {
            const timeoutMessage = { type: 'text', text: '手動調整點數逾時，自動取消。'};
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
        });
        return { type: 'text', text: '請輸入您想調整點數的學員姓名或 User ID：', quickReply: { items: getCancelMenu() } };
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
      return { type: 'text', text: teacherSuggestion };
    }
  }
  return null;
}
