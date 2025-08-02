// utils.js - V7.5 (新增資料庫狀態管理)
const line = require('@line/bot-sdk');
const { Pool } = require('pg');

// --- 組態設定 ---
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

// --- 常數 ---
const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 5; // 5分鐘

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
  // ... (COMMANDS 內容與 V7.4 相同)
  SWITCH_ROLE: '@切換身份',
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

const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];

// --- 資料庫函數 ---

async function initializeDatabase() {
  try {
    const testClient = await pgPool.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    testClient.release();
    
    // 原有資料表
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    
    // V7.5 新增：使用者狀態資料表
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS user_states (
        user_id VARCHAR(255) PRIMARY KEY,
        state_name VARCHAR(100) NOT NULL,
        state_data JSONB DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    console.log('✅ user_states 資料表已確認存在。');

    // 檢查欄位 (此部分不變)
    // ...
    
    console.log('✅ 資料庫初始化完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  }
}

// --- V7.5 新增：資料庫狀態管理函式 ---
async function setUserState(userId, stateName, stateData = {}, ttlSeconds = 300) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const stateDataJson = JSON.stringify(stateData);
    await pgPool.query(
        `INSERT INTO user_states (user_id, state_name, state_data, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           state_name = EXCLUDED.state_name,
           state_data = EXCLUDED.state_data,
           expires_at = EXCLUDED.expires_at`,
        [userId, stateName, stateDataJson, expiresAt]
    );
}

async function getUserState(userId) {
    const res = await pgPool.query(
        'SELECT * FROM user_states WHERE user_id = $1 AND expires_at > NOW()',
        [userId]
    );
    if (res.rows.length === 0) {
        // 順便刪除過期的狀態
        await pgPool.query('DELETE FROM user_states WHERE user_id = $1', [userId]);
        return null;
    }
    return res.rows[0];
}

async function clearUserState(userId) {
    await pgPool.query('DELETE FROM user_states WHERE user_id = $1', [userId]);
}


// --- 原有資料庫函式 (getUser, saveUser 等不變) ---
async function generateUniqueCoursePrefix(dbClient = pgPool) {
    // ... (內容不變)
}
async function getUser(userId, dbClient = pgPool) {
    // ... (內容不變)
}
async function saveUser(user, dbClient = pgPool) {
    // ... (內容不變)
}
async function getAllCourses(dbClient = pgPool) {
    // ... (內容不變)
}
async function getCourse(courseId, dbClient = pgPool) {
    // ... (內容不變)
}
async function saveCourse(course, dbClient = pgPool) {
    // ... (內容不變)
}
async function deleteCourse(courseId, dbClient = pgPool) {
    // ... (內容不變)
}
async function deleteCoursesByPrefix(prefix, dbClient = pgPool) {
    // ... (內容不變)
}
async function saveOrder(order, dbClient = pgPool) {
    // ... (內容不變)
}
async function deleteOrder(orderId, dbClient = pgPool) {
    // ... (內容不變)
}


// --- 通用輔助函數 (reply, push 等不變，移除 setupConversationTimeout) ---
async function reply(replyToken, content) {
    // V7.4 後已不再使用 quick reply，簡化函式
    let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : [content]);
    try { 
        await client.replyMessage(replyToken, messages); 
    } catch (error) { 
        console.error(`❌ reply 函式發送失敗:`, error.originalError ? JSON.stringify(error.originalError.response.data) : error.message); 
        throw error; 
    }
}

async function push(to, content) {
    // ... (內容不變)
}
function formatDateTime(isoString) {
    // ... (內容不變)
}
function getNextDate(dayOfWeek, timeStr, startDate = new Date()) {
    // ... (內容不變)
}


module.exports = {
  // Config & Clients
  config, client, pgPool,
  
  // Constants
  TEACHER_PASSWORD, SELF_URL, TEACHER_ID, STUDENT_RICH_MENU_ID, TEACHER_RICH_MENU_ID,
  ONE_DAY_IN_MS, EIGHT_HOURS_IN_MS, PURCHASE_PLANS, BANK_INFO, COMMANDS, WEEKDAYS,

  // DB Functions
  initializeDatabase, generateUniqueCoursePrefix, getUser, saveUser,
  getAllCourses, getCourse, saveCourse, deleteCourse, deleteCoursesByPrefix,
  saveOrder, deleteOrder,

  // V7.5 NEW State Management
  setUserState, getUserState, clearUserState,

  // Helper Functions
  reply, push, formatDateTime, getNextDate,
};
