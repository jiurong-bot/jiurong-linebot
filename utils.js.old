// =================================================================
// utils.js - V16.0
// -----------------------------------------------------------------
// 檔案角色: 公用程式模組 (Toolbox & Data Access Layer)
// 主要職責:
//   - 作為一個集中化的模組，提供整個應用程式共享的設定、常數、客戶端實例。
//   - 封裝所有與資料庫互動的函式，包含資料存取、狀態管理等。
//   - 提供通用的輔助函式，如發送訊息、格式化時間等，消除程式碼重複。
//
// 依賴關係:
//   - 無，此模組為專案最底層，不依賴專案中任何其他檔案。
// =================================================================

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
    
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255), points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255), message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255))`);
    
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS user_states (
        user_id VARCHAR(255) PRIMARY KEY,
        state_name VARCHAR(100) NOT NULL,
        state_data JSONB DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    console.log('✅ user_states 資料表已確認存在。');
    
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
        await pgPool.query('DELETE FROM user_states WHERE user_id = $1', [userId]);
        return null;
    }
    return res.rows[0];
}

async function clearUserState(userId) {
    await pgPool.query('DELETE FROM user_states WHERE user_id = $1', [userId]);
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
        `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7`,
        [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.pictureUrl || null]
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
  await dbClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}

// --- 通用輔助函數 ---
async function reply(replyToken, content) {
    let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : [content]);
    try { 
        await client.replyMessage(replyToken, messages); 
    } catch (error) { 
        console.error(`❌ reply 函式發送失敗:`, error.originalError ? JSON.stringify(error.originalError.response.data) : error.message); 
        throw error; 
    }
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
