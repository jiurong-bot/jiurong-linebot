// utils.js - V19.0 (新增公告與回覆輔助函式)
const line = require('@line/bot-sdk');
const { Pool } = require('pg');

// --- 組態設定與客戶端實例 ---
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


// --- 常數 ---
const ONE_DAY_IN_MS = 86400000;

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
    
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    // V19.0 修改: 新增 teacher_name 欄位
    await pgPool.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT, teacher_name VARCHAR(255))`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        image_url TEXT,
        status VARCHAR(50) DEFAULT 'available',
        creator_id VARCHAR(255) NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS user_states (
        user_id VARCHAR(255) PRIMARY KEY,
        state_name VARCHAR(100) NOT NULL,
        state_data JSONB DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);

    // --- 欄位結構檢查 ---
    const usersCols = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
    const userColNames = usersCols.rows.map(r => r.column_name);
    if (!userColNames.includes('last_seen_announcement_id')) { await pgPool.query('ALTER TABLE users ADD COLUMN last_seen_announcement_id INTEGER DEFAULT 0'); }
    if (!userColNames.includes('picture_url')) { await pgPool.query('ALTER TABLE users ADD COLUMN picture_url TEXT'); }
    if (!userColNames.includes('approved_by')) { await pgPool.query('ALTER TABLE users ADD COLUMN approved_by VARCHAR(255)'); }

    const announcementsCols = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='announcements'");
    const announcementColNames = announcementsCols.rows.map(r => r.column_name);
    if (!announcementColNames.includes('creator_id')) { await pgPool.query('ALTER TABLE announcements ADD COLUMN creator_id VARCHAR(255) NOT NULL DEFAULT \'unknown\''); }
    if (!announcementColNames.includes('creator_name')) { await pgPool.query('ALTER TABLE announcements ADD COLUMN creator_name VARCHAR(255) NOT NULL DEFAULT \'unknown\''); }
    if (!announcementColNames.includes('created_at')) { await pgPool.query('ALTER TABLE announcements ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()'); }
    
    // V19.0 新增: 檢查 feedback_messages 是否有 teacher_name 欄位
    const feedbackCols = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='feedback_messages'");
    const feedbackColNames = feedbackCols.rows.map(r => r.column_name);
    if (!feedbackColNames.includes('teacher_name')) {
        await pgPool.query('ALTER TABLE feedback_messages ADD COLUMN teacher_name VARCHAR(255)');
    }

    console.log('✅ 資料庫初始化與結構檢查完成。');
  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.stack);
    process.exit(1);
  }
}

// --- 狀態管理函式 ---
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
    await pgPool.query('DELETE FROM user_states WHERE expires_at <= NOW()');
    const res = await pgPool.query('SELECT * FROM user_states WHERE user_id = $1', [userId]);
    if (res.rows.length === 0) {
        return null;
    }
    return res.rows[0];
}

async function clearUserState(userId) {
    await pgPool.query('DELETE FROM user_states WHERE user_id = $1', [userId]);
}


// --- 資料存取函式 ---
async function generateUniqueCoursePrefix(dbClient = pgPool) { /* ... (內容不變) ... */ }
async function getUser(userId, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function saveUser(user, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function getAllCourses(dbClient = pgPool) { /* ... (內容不變) ... */ }
async function getCourse(courseId, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function saveCourse(course, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function deleteCourse(courseId, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function deleteCoursesByPrefix(prefix, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function saveOrder(order, dbClient = pgPool) { /* ... (內容不變) ... */ }
async function deleteOrder(orderId, dbClient = pgPool) { /* ... (內容不變) ... */ }


// --- V19.0 新增函式 ---
async function getAnnouncements(dbClient = pgPool) {
  const res = await dbClient.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10');
  return res.rows;
}

async function deleteAnnouncement(id, dbClient = pgPool) {
  const result = await dbClient.query('DELETE FROM announcements WHERE id = $1', [id]);
  return result.rowCount;
}

async function updateFeedbackReply(id, replyText, teacherName, dbClient = pgPool) {
  const result = await dbClient.query(
    "UPDATE feedback_messages SET status = 'replied', teacher_reply = $1, teacher_name = $2 WHERE id = $3",
    [replyText, teacherName, id]
  );
  return result.rowCount;
}
// --- 通用輔助函數 ---

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
    throw error; 
  }
}

async function push(to, content) {
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : (typeof content === 'object' && content !== null && content.type ? [content] : [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }]));
  try { 
    await client.pushMessage(to, messages); 
  } catch (error) { 
    console.error(`❌ push 函式發送失敗給 ${to}:`, `狀態碼: ${error.originalError?.response?.status || 'N/A'},`, `訊息: ${error.originalError?.response?.statusText || error.message}`); 
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

function getNextDate(dayOfWeek, timeStr, startDate = new Date()) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const resultDate = new Date(startDate);
    resultDate.setUTCHours(hours - 8, minutes, 0, 0);
    let currentDay = resultDate.getUTCDay();
    let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
    if (daysToAdd === 0 && resultDate.getTime() <= startDate.getTime()) {
      daysToAdd = 7;
    }
    resultDate.setUTCDate(resultDate.getUTCDate() + daysToAdd);
    return resultDate;
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


// --- 模組導出 ---
module.exports = {
  // Config & Clients
  config, client, pgPool,
  
  // Constants
  TEACHER_PASSWORD, SELF_URL, TEACHER_ID, ADMIN_USER_ID, 
  STUDENT_RICH_MENU_ID, TEACHER_RICH_MENU_ID, ADMIN_RICH_MENU_ID,
  ONE_DAY_IN_MS, PURCHASE_PLANS, BANK_INFO, COMMANDS, WEEKDAYS,

  // DB Functions
  initializeDatabase, generateUniqueCoursePrefix, getUser, saveUser,
  getAllCourses, getCourse, saveCourse, deleteCourse, deleteCoursesByPrefix,
  saveOrder, deleteOrder,
  // V19.0 新增
  getAnnouncements,
  deleteAnnouncement,
  updateFeedbackReply,

  // State Management
  setUserState, getUserState, clearUserState,

  // Helper Functions
  reply, push, formatDateTime, getNextDate, levenshtein, findClosestCommand
};
