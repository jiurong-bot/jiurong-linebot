// index.js - V17.0 (無狀態化重構)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

// --- 新增：環境變數檢查 ---
function checkEnvVariables() {
  const requiredEnv = [
    'CHANNEL_ACCESS_TOKEN',
    'CHANNEL_SECRET',
    'DATABASE_URL',
    'ADMIN_USER_ID'
  ];
  const missingEnv = requiredEnv.filter(envVar => !process.env[envVar]);
  if (missingEnv.length > 0) {
    console.error(`❌ 致命錯誤：缺少必要的環境變數: ${missingEnv.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ 所有必要的環境變數都已設定。');
}
// --- 檢查結束 ---

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
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 10; // 延長對話逾時時間

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
      COURSE_REPORT: '@課程報表',
      ORDER_REPORT: '@訂單報表',
      POINT_REPORT: '@點數報表',
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
    
    // --- 原有表格建立 ---
    await client.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255))`);
    await client.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    await client.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS feedback_messages (id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, message TEXT NOT NULL, status VARCHAR(50) DEFAULT 'new', timestamp TIMESTAMPTZ NOT NULL, teacher_reply TEXT)`);
    await client.query(`CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL)`);
    await client.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, description TEXT, price INTEGER NOT NULL, image_url TEXT, status VARCHAR(50) DEFAULT 'available', creator_id VARCHAR(255) NOT NULL, creator_name VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
    
    // --- 欄位向下相容檢查 ---
    const checkAndAddColumn = async (tableName, columnName, columnType) => {
        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2", [tableName, columnName]);
        if (res.rows.length === 0) {
            await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
            console.log(`✅ 已成功新增欄位: ${tableName}.${columnName}`);
        }
    };
    
    await checkAndAddColumn('users', 'last_seen_announcement_id', 'INTEGER DEFAULT 0');
    await checkAndAddColumn('users', 'picture_url', 'TEXT');
    await checkAndAddColumn('users', 'approved_by', 'VARCHAR(255)');
    await checkAndAddColumn('announcements', 'creator_id', 'VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
    await checkAndAddColumn('announcements', 'creator_name', 'VARCHAR(255) NOT NULL DEFAULT \'unknown\'');
    await checkAndAddColumn('announcements', 'created_at', 'TIMESTAMPTZ DEFAULT NOW()');

    // --- 新增：狀態管理相關欄位 ---
    await checkAndAddColumn('users', 'state', 'JSONB');
    await checkAndAddColumn('courses', 'reminder_sent', 'BOOLEAN DEFAULT FALSE');
    
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

        // --- 修改：自動解析 history 和新的 state 欄位 ---
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        if (userData && typeof userData.state === 'string') {
            try { userData.state = JSON.parse(userData.state); } catch(e) { userData.state = null; }
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
        // --- 修改：儲存時將 history 和 state 轉為 JSON 字串 ---
        const historyJson = JSON.stringify(user.history || []);
        const stateJson = user.state ? JSON.stringify(user.state) : null;
        
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by, state) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET 
               name = $2, 
               points = $3, 
               role = $4, 
               history = $5, 
               last_seen_announcement_id = $6, 
               picture_url = $7, 
               approved_by = $8,
               state = $9`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.pictureUrl || null, user.approved_by || null, stateJson]
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
            pointsCost: row.points_cost, 
            students: row.students || [], 
            waiting: row.waiting || [],
            reminderSent: row.reminder_sent
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
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, reminder_sent) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET 
               title = $2, 
               time = $3, 
               capacity = $4, 
               points_cost = $5, 
               students = $6, 
               waiting = $7,
               reminder_sent = $8`,
            [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.reminderSent || false]
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
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET 
               user_id = $2, 
               user_name = $3, 
               points = $4, 
               amount = $5, 
               last_5_digits = $6, 
               status = $7, 
               timestamp = $8`,
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
  if (!replyToken) {
    // 忽略沒有 replyToken 的事件，例如來自背景作業的呼叫
    return;
  }
  let messages = Array.isArray(content) ? content : (typeof content === 'string' ? [{ type: 'text', text: content }] : [content]);
  if (messages.length === 0) { 
      return; // 允許發送空陣列以僅確認 webhook，但不真的發送訊息
  }
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
  try { await client.replyMessage(replyToken, messages); } catch (error) { 
      // 忽略無效 token 的錯誤，因為在某些流程中（如快速點擊），token 可能已被使用
      if (error.message.includes('Invalid reply token')) {
          console.log('嘗試使用已失效的 replyToken，已忽略此錯誤。');
          return;
      }
      console.error(`❌ reply 函式發送失敗:`, error.originalError ? error.originalError.response.data : error.message); 
      throw error; 
  }
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
        const planItems = [ { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: `${plan.points} 點`, size: 'md', color: '#1A759F', flex: 3, gravity: 'center' }, { type: 'text', text: `售價：${plan.amount} 元`, size: 'md', color: '#666666', align: 'end', flex: 5, gravity: 'center' } ] }, { type: 'button', action: { type: 'postback', label: '選擇此方案', data: `action=select_purchase_plan&plan=${plan.points}`, displayText: `選擇購買 ${plan.points} 點方案` }, style: 'primary', color: '#52B69A' } ];
        if (index < PURCHASE_PLANS.length - 1) {
            planItems.push({ type: 'separator', margin: 'md' });
        }
        return planItems;
    });

    return { type: 'flex', altText: '請選擇要購買的點數方案', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請選擇點數方案', weight: 'bold', size: 'md', color: '#FFFFFF' }], backgroundColor: '#34A0A4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ ...plansContent, { type: 'text', text: '購買後請至「點數管理」輸入匯款資訊', size: 'xs', color: '#aaaaaa', align: 'center', margin: 'md' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } } };
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
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `訂單 ID: ${formatIdForDisplay(pendingOrder.order_id)}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${actionCmd}` } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } });
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

const repliedTokens = new Set();
async function handlePurchaseFlow(event, user) {
    // 此函式內部的 text 變數定義是安全的，因為它只處理文字訊息
    const text = event.message.text ? event.message.text.trim() : '';
    const userId = user.id;
    const purchaseState = user.state;

    if (!purchaseState || purchaseState.name !== 'purchase_flow') {
        return false;
    }

    if (text === COMMANDS.STUDENT.CANCEL_PURCHASE || text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
        user.state = null;
        await saveUser(user);
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
                
                user.state = null;
                await saveUser(user);

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(orderId)})。\n\n請匯款至以下帳戶：\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數管理」選單，點擊「❗ 匯款待確認」卡片中的按鈕來回報您的後五碼。`;
                const flexMenu = await buildPointsMenuFlex(userId);
                await reply(event.replyToken, [{ type: 'text', text: replyText }, flexMenu]);
            } else {
                await reply(event.replyToken, '請點擊「✅ 確認購買」或「❌ 取消購買」。');
            }
            return true;

        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const orderId = purchaseState.data.orderId;
                const client = await pgPool.connect();
                try {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
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
                        }, client);
                        
                        user.state = null;
                        await saveUser(user);

                        const flexMenu = await buildPointsMenuFlex(userId);
                        await reply(event.replyToken, [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu]);
                        if (TEACHER_ID) {
                            push(TEACHER_ID, `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${orderId}\n後五碼: ${text}\n請至「點數管理」->「待確認清單」審核。`).catch(e => console.error(e));
                        }
                    } else {
                        user.state = null;
                        await saveUser(user);
                        await reply(event.replyToken, '找不到您的訂單，請重新操作。');
                    }
                } finally {
                    if (client) client.release();
                }
            } else {
                await reply(event.replyToken, '格式錯誤，請輸入5位數字的匯款帳號後五碼。', [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }]);
            }
            return true;
    }
    return false;
}

async function handleAdminCommands(event, user) {
  const replyToken = event.replyToken;
  // --- 已修正 ---
  const text = (event.message && event.message.text) ? event.message.text.trim() : '';
  const userId = user.id;
  const adminState = user.state;

  if (adminState && adminState.name === 'teacher_addition') {
    const state = adminState;
    if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
      user.state = null;
      await saveUser(user);
      return reply(replyToken, '已取消授權操作。');
    }
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        } else if (studentRes.rows.length === 1) {
          user.state = {
              name: 'teacher_addition',
              step: 'await_confirmation',
              data: { targetUser: studentRes.rows[0] },
              timestamp: Date.now()
          };
          await saveUser(user);

          return reply(replyToken, `您確定要授權學員「${studentRes.rows[0].name}」成為老師嗎？`, [
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
            { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }
          ]);
        } else {
          return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        }
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.data.targetUser.id);
          targetUser.role = 'teacher';
          targetUser.approved_by = userId;
          await saveUser(targetUser);
          
          user.state = null;
          await saveUser(user);
          
          await reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`);
          push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
    return;
  }
  
  if (adminState && adminState.name === 'teacher_removal') {
    const state = adminState;
    if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
      user.state = null;
      await saveUser(user);
      return reply(replyToken, '已取消移除操作。');
    }
    switch (state.step) {
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(state.data.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          
          user.state = null;
          await saveUser(user);

          await reply(replyToken, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
          push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
    return;
  }

  // --- 無狀態指令 ---
  if (text === COMMANDS.ADMIN.PANEL) {
    const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
    return reply(replyToken, '請選擇管理者功能：', adminMenu);
  } else if (text === COMMANDS.ADMIN.ADD_TEACHER) {
    user.state = { name: 'teacher_addition', step: 'await_student_info', timestamp: Date.now() };
    await saveUser(user);
    return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
  } else if (text === COMMANDS.ADMIN.REMOVE_TEACHER) {
      const clientDB = await pgPool.connect();
      try {
          const teacherRes = await clientDB.query("SELECT id, name FROM users WHERE role = 'teacher'");
          if (teacherRes.rows.length === 0) {
              return reply(replyToken, '目前沒有任何老師可供移除。');
          }
          const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }}]} }));
          return reply(replyToken, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });
      } finally {
          if(clientDB) clientDB.release();
      }
  } else if (text === COMMANDS.ADMIN.SIMULATE_STUDENT) {
    user.role = 'student';
    user.state = null; // 切換身份時清除狀態
    await saveUser(user);
    if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
    return reply(replyToken, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  } else if (text === COMMANDS.ADMIN.SIMULATE_TEACHER) {
    user.role = 'teacher';
    user.state = null; // 切換身份時清除狀態
    await saveUser(user);
    if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
    return reply(replyToken, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }
}
async function handleTeacherCommands(event, user) {
  const replyToken = event.replyToken;
  // --- 已修正 ---
  const text = (event.message && event.message.text) ? event.message.text.trim() : '';
  const userId = user.id;
  const teacherState = user.state;

  // --- 處理對話狀態 ---
  if (teacherState) {
    // --- 取消課程流程 ---
    if (teacherState.name === 'course_cancellation') {
      const state = teacherState;
      if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
        user.state = null; await saveUser(user);
        return reply(replyToken, '已放棄取消操作。');
      }
      switch(state.data.type) {
        case 'batch':
          if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
            const backgroundStateData = { ...state.data };
            user.state = null; await saveUser(user);
            reply(replyToken, '✅ 指令已收到，正在為您批次取消課程。\n完成後將會另行通知，請稍候...');
            (async () => {
              const client = await pgPool.connect();
              try {
                await client.query('BEGIN');
                const coursesToCancelRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${backgroundStateData.prefix}%`]);
                if (coursesToCancelRes.rows.length === 0) {
                  return await push(userId, `❌ 批次取消失敗：找不到可取消的「${backgroundStateData.prefix}」系列課程。`);
                }
                const coursesToCancel = coursesToCancelRes.rows;
                const affectedUsers = new Map();
                for (const course of coursesToCancel) { for (const studentId of course.students) { if (!affectedUsers.has(studentId)) affectedUsers.set(studentId, 0); affectedUsers.set(studentId, affectedUsers.get(studentId) + course.points_cost); } }
                for (const [studentId, refundAmount] of affectedUsers.entries()) { if (refundAmount > 0) await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [refundAmount, studentId]); }
                const courseMainTitle = coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '');
                await client.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${backgroundStateData.prefix}%`]);
                await client.query('COMMIT');
                for (const [studentId, refundAmount] of affectedUsers.entries()) { push(studentId, `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。`).catch(e => console.error(e)); }
                await push(userId, `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。`);
              } catch (e) {
                await client.query('ROLLBACK'); console.error('[批次取消] 背景任務執行失敗:', e);
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
                const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [state.data.courseId]);
                if (courseToCancelRes.rows.length === 0) {
                  user.state = null; await saveUser(user);
                  return reply(replyToken, "找不到該課程，可能已被取消。");
                }
                const course = courseToCancelRes.rows[0];
                for (const studentId of course.students) {
                   await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                   push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
                }
                await client.query("DELETE FROM courses WHERE id = $1", [state.data.courseId]);
                await client.query('COMMIT');
                user.state = null; await saveUser(user);
                return reply(replyToken, `✅ 已成功取消課程「${course.title}」。`);
              } catch (e) {
                  await client.query('ROLLBACK'); user.state = null; await saveUser(user);
                  console.error('單堂取消課程失敗:', e);
                  return reply(replyToken, '取消課程時發生錯誤，請稍後再試。');
              } finally {
                if(client) client.release();
              }
           }
          break;
      }
      return;
    }
    
    if (teacherState.name === 'course_creation') {
      const state = teacherState;
      if (text.toLowerCase() === '取消') {
          user.state = null; await saveUser(user);
          return reply(replyToken, '已取消新增課程。');
      }
      switch (state.step) {
          case 'await_title':
              user.state = { ...state, step: 'await_weekday', data: { title: text }, timestamp: Date.now() };
              await saveUser(user);
              const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
              return reply(replyToken, `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, weekdayButtons);
          case 'await_time':
              if (!/^\d{2}:\d{2}$/.test(text)) return reply(replyToken, '時間格式不正確，請輸入四位數時間，例如：19:30');
              user.state = { ...state, step: 'await_sessions', data: { ...state.data, time: text }, timestamp: Date.now() };
              await saveUser(user);
              return reply(replyToken, '請問這個系列總共要開設幾堂課？（請輸入數字）');
          case 'await_sessions':
              const sessions = parseInt(text, 10);
              if (isNaN(sessions) || sessions <= 0) return reply(replyToken, '堂數必須是正整數，請重新輸入。');
              user.state = { ...state, step: 'await_capacity', data: { ...state.data, sessions: sessions }, timestamp: Date.now() };
              await saveUser(user);
              return reply(replyToken, '請問每堂課的名額限制？（請輸入數字）');
          case 'await_capacity':
              const capacity = parseInt(text, 10);
              if (isNaN(capacity) || capacity <= 0) return reply(replyToken, '名額必須是正整數，請重新輸入。');
              user.state = { ...state, step: 'await_points', data: { ...state.data, capacity: capacity }, timestamp: Date.now() };
              await saveUser(user);
              return reply(replyToken, '請問每堂課需要消耗多少點數？（請輸入數字）');
          case 'await_points':
              const points = parseInt(text, 10);
              if (isNaN(points) || points < 0) return reply(replyToken, '點數必須是正整數或 0，請重新輸入。');
              user.state = { ...state, step: 'await_confirmation', data: { ...state.data, pointsCost: points }, timestamp: Date.now() };
              await saveUser(user);
              const firstDate = getNextDate(state.data.weekday, state.data.time);
              const summary = `請確認課程資訊：\n\n標題：${state.data.title}\n時間：每${state.data.weekday_label} ${state.data.time}\n堂數：${state.data.sessions} 堂\n名額：${state.data.capacity} 位\n費用：${points} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
              return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } }, { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } } ]);
          case 'await_confirmation':
              if (text === '✅ 確認新增') {
                  const client = await pgPool.connect();
                  try {
                      await client.query('BEGIN');
                      const prefix = await generateUniqueCoursePrefix(client);
                      let currentDate = new Date();
                      for (let i = 0; i < state.data.sessions; i++) {
                          const courseDate = getNextDate(state.data.weekday, state.data.time, currentDate);
                          await saveCourse({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, title: `${state.data.title} - 第 ${i + 1} 堂`, time: courseDate.toISOString(), capacity: state.data.capacity, pointsCost: state.data.pointsCost, students: [], waiting: [] }, client);
                          currentDate = new Date(courseDate.getTime() + ONE_DAY_IN_MS);
                      }
                      await client.query('COMMIT');
                      user.state = null; await saveUser(user);
                      return reply(replyToken, `✅ 成功新增「${state.data.title}」系列共 ${state.data.sessions} 堂課！`);
                  } catch (e) {
                      await client.query('ROLLBACK'); console.error("新增課程系列失敗:", e);
                      user.state = null; await saveUser(user);
                      return reply(replyToken, '新增課程時發生錯誤，請稍後再試。');
                  } finally {
                      if(client) client.release();
                  }
              } else {
                  return reply(replyToken, '請點擊「✅ 確認新增」或「❌ 放棄」。');
              }
      }
      return;
    }
    
    if (teacherState.name === 'manual_adjust') {
      const state = teacherState;
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        user.state = null; await saveUser(user);
        return reply(replyToken, '已取消調整點數操作。');
      }
      switch (state.step) {
        case 'await_student_search':
          const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
          if (res.rows.length === 0) {
            return reply(replyToken, `找不到學員「${text}」。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
          }
          const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || 'https://i.imgur.com/8l1Yd2S.png', size: 'md', aspectRatio: '1:1', aspectMode: 'cover' }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } }));
          return reply(replyToken, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
        case 'await_operation':
          if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
            user.state = { ...state, step: 'await_amount', data: { ...state.data, operation: text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct' }, timestamp: Date.now() };
            await saveUser(user);
            return reply(replyToken, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`);
          } else {
            return reply(replyToken, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
          }
        case 'await_amount':
          const amount = parseInt(text, 10);
          if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數格式不正確，請輸入一個大於 0 的正整數。'); }
          user.state = { ...state, step: 'await_reason', data: { ...state.data, amount: amount }, timestamp: Date.now() };
          await saveUser(user);
          return reply(replyToken, '請輸入調整原因（例如：活動獎勵、課程補償等）：');
        case 'await_reason':
          user.state = { ...state, step: 'await_confirmation', data: { ...state.data, reason: text }, timestamp: Date.now() };
          await saveUser(user);
          const opText = state.data.operation === 'add' ? `增加 ${state.data.amount} 點` : `扣除 ${state.data.amount} 點`;
          const summary = `請確認調整內容：\n\n對象：${state.data.targetStudent.name}\n操作：${opText}\n原因：${text}`;
          return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ]);
        case 'await_confirmation':
          if (text === COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST) {
            const clientDB = await pgPool.connect();
            try {
              await clientDB.query('BEGIN');
              const studentRes = await clientDB.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [state.data.targetStudent.id]);
              const student = studentRes.rows[0];
              const newPoints = state.data.operation === 'add' ? student.points + state.data.amount : student.points - state.data.amount;
              if (newPoints < 0) {
                await clientDB.query('ROLLBACK'); user.state = null; await saveUser(user);
                return reply(replyToken, `操作失敗：學員 ${student.name} 的點數不足以扣除 ${state.data.amount} 點。`);
              }
              const historyEntry = { action: `手動調整：${state.data.operation === 'add' ? '+' : '-'}${state.data.amount}點`, reason: state.data.reason, time: new Date().toISOString(), operator: user.name };
              const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
              await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
              await clientDB.query('COMMIT');
              user.state = null; await saveUser(user);
              await reply(replyToken, `✅ 已成功為學員 ${student.name} ${state.data.operation === 'add' ? '增加' : '扣除'} ${state.data.amount} 點。`);
              const opTextForStudent = state.data.operation === 'add' ? `增加了 ${state.data.amount}` : `扣除了 ${state.data.amount}`;
              push(student.id, `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${state.data.reason}\n您目前的點數為：${newPoints} 點。`).catch(e => console.error(e));
            } catch (e) {
              await clientDB.query('ROLLBACK'); console.error('手動調整點數失敗:', e);
              user.state = null; await saveUser(user);
              return reply(replyToken, '❌ 操作失敗，資料庫發生錯誤，請稍後再試。');
            } finally {
              if(clientDB) clientDB.release();
            }
          }
          break;
      }
      return;
    }
    
    if (teacherState.name === 'student_search') {
      const searchQuery = text;
      user.state = null; await saveUser(user);
      try {
          const res = await pgPool.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${searchQuery.toLowerCase()}%`, searchQuery]);
          if (res.rows.length === 0) return reply(replyToken, `找不到符合「${searchQuery}」的學員。`);
          const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || 'https://i.imgur.com/8l1Yd2S.png', size: 'md', aspectRatio: '1:1', aspectMode: 'cover', flex: 1 }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' } ] } ] }, { type: 'box', layout: 'vertical', margin: 'lg', contents: [ { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` } }] } }));
          return reply(replyToken, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
      } catch (err) {
          console.error('❌ 查詢學員失敗:', err);
          return reply(replyToken, '查詢學員時發生錯誤，請稍後再試。');
      }
    }

    if (teacherState.name === 'feedback_reply') {
      const state = teacherState;
      if (text.toLowerCase() === '取消') {
        user.state = null; await saveUser(user);
        return reply(replyToken, '已取消回覆。');
      }
      const client = await pgPool.connect();
      try {
        await client.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, state.data.msgId]);
        await push(state.data.studentId, `老師回覆了您的留言：\n\n【您的留言】\n${state.data.originalMessage}\n\n【老師的回覆】\n${text}`);
        user.state = null; await saveUser(user);
        return reply(replyToken, '✅ 已成功回覆學員的留言。');
      } catch (err) {
        console.error('❌ 回覆留言失敗:', err);
        user.state = null; await saveUser(user);
        return reply(replyToken, '回覆留言時發生錯誤，請稍後再試。');
      } finally {
          if(client) client.release();
      }
    }
    return;
  }
  
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
        const client = await pgPool.connect();
        try {
            const courseRes = await client.query('SELECT * FROM courses WHERE time > NOW() ORDER BY time ASC');
            const upcomingCourses = courseRes.rows;
            const courseGroups = {};
            for (const course of upcomingCourses) {
                const prefix = course.id.substring(0, 2);
                if (!courseGroups[prefix]) { courseGroups[prefix] = { prefix: prefix, mainTitle: course.title.replace(/ - 第 \d+ 堂$/, ''), earliestTime: course.time, pointsCost: course.points_cost }; }
            }
            const courseBubbles = Object.values(courseGroups).map(group => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: group.mainTitle, weight: 'bold', size: 'xl', wrap: true }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: group.prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(group.earliestTime), wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${group.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, ]}, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [ { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${group.prefix}` } }, { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${group.prefix}` } }, ]}, }));
            const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
            courseBubbles.push(addCourseBubble);
            const introText = (courseBubbles.length === 1) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
            return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
        } catch (err) {
            console.error('❌ 查詢課程管理時發生錯誤:', err);
            return reply(replyToken, '查詢課程資訊時發生錯誤，請稍後再試。');
        } finally {
            if(client) client.release();
        }
  } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
      const page = 1;
      const clientDB = await pgPool.connect();
      try {
          const totalRes = await clientDB.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'");
          const totalOrders = parseInt(totalRes.rows[0].count, 10);
          if (totalOrders === 0) {
              return reply(replyToken, '目前沒有待確認的購點訂單。');
          }
          const pageSize = 5;
          const totalPages = Math.ceil(totalOrders / pageSize);
          const offset = (page - 1) * pageSize;
          const ordersRes = await clientDB.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC LIMIT $1 OFFSET $2`, [pageSize, offset]);
          const orderBubbles = ordersRes.rows.map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${formatIdForDisplay(order.order_id)}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${formatIdForDisplay(order.userId)}`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}` } }] } }));
          if (page < totalPages) {
              orderBubbles.push({ type: 'bubble', body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', contents: [{ type: 'button', action: { type: 'postback', label: '下一頁 ➡️', data: `action=view_pending_orders&page=${page + 1}` }, style: 'link' }] } });
          }
          return reply(replyToken, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
      } catch (err) {
          console.error('查詢待確認訂單失敗:', err);
          return reply(replyToken, '查詢訂單時發生錯誤。');
      } finally {
          if (clientDB) clientDB.release();
      }
  } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      user.state = { name: 'manual_adjust', step: 'await_student_search', timestamp: Date.now() };
      await saveUser(user);
      return reply(replyToken, '請輸入您想調整點數的學員姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
  } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
      user.state = { name: 'student_search', step: 'await_query', timestamp: Date.now() };
      await saveUser(user);
      return reply(replyToken, '請輸入您想查詢的學員姓名或 User ID：');
  } else {
      let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
      if (text.startsWith('@')) {
          const closestCommand = findClosestCommand(text, 'teacher');
          if (closestCommand) { teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`; }
          else { teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`; }
      }
      return reply(replyToken, teacherSuggestion);
  }
}

async function handleStudentCommands(event, user) {
  const replyToken = event.replyToken;
  // --- 已修正 ---
  const text = (event.message && event.message.text) ? event.message.text.trim() : '';
  const userId = user.id;

  if (await handlePurchaseFlow(event, user)) {
    return;
  }
  
  const studentState = user.state;
  if(studentState) {
    if(studentState.name === 'booking_confirmation') {
      const state = studentState;
      const course = await getCourse(state.data.courseId);
      if (!course) {
          user.state = null; await saveUser(user);
          return reply(replyToken, '抱歉，找不到該課程，可能已被老師取消。');
      }
      switch (state.data.type) {
          case 'book':
              if (text === COMMANDS.STUDENT.ABANDON_BOOKING) { user.state = null; await saveUser(user); return reply(replyToken, '已放棄預約。'); }
              if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                  const client = await pgPool.connect();
                  try {
                      await client.query('BEGIN');
                      const userForUpdateRes = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                      const courseForUpdateRes = await client.query('SELECT students, capacity FROM courses WHERE id = $1 FOR UPDATE', [state.data.courseId]);
                      const userForUpdate = userForUpdateRes.rows[0];
                      const courseForUpdate = courseForUpdateRes.rows[0];
                      if (userForUpdate.points < course.pointsCost) {
                          await client.query('ROLLBACK'); user.state = null; await saveUser(user);
                          return reply(replyToken, `預約失敗，您的點數不足！\n目前點數：${userForUpdate.points}\n需要點數：${course.pointsCost}`);
                      }
                      if (courseForUpdate.students.length >= courseForUpdate.capacity) {
                          await client.query('ROLLBACK'); user.state = null; await saveUser(user);
                          return reply(replyToken, '抱歉，課程名額已滿，已被其他同學搶先預約了。');
                      }
                      const newPoints = userForUpdate.points - course.pointsCost;
                      const newStudents = [...courseForUpdate.students, userId];
                      const historyEntry = { action: `預約課程：${course.title}`, pointsChange: -course.pointsCost, time: new Date().toISOString() };
                      const currentHistory = Array.isArray(userForUpdate.history) ? userForUpdate.history : [];
                      await client.query('UPDATE users SET points = $1, history = $2, state = NULL WHERE id = $3', [newPoints, JSON.stringify([...currentHistory, historyEntry]), userId]);
                      await client.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, state.data.courseId]);
                      await client.query('COMMIT');
                      return reply(replyToken, `✅ 預約成功！\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n已為您扣除 ${course.pointsCost} 點，期待課堂上見！`);
                  } catch (e) {
                      await client.query('ROLLBACK'); console.error('預約課程失敗:', e);
                      user.state = null; await saveUser(user);
                      return reply(replyToken, '預約時發生錯誤，請稍後再試。');
                  } finally {
                      if(client) client.release();
                  }
              }
              break;
          case 'cancel_book':
              if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) { user.state = null; await saveUser(user); return reply(replyToken, '已放棄取消操作。'); }
              if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
                const client = await pgPool.connect();
                try {
                    await client.query('BEGIN');
                    const userForUpdateRes = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdateRes = await client.query('SELECT students, waiting FROM courses WHERE id = $1 FOR UPDATE', [state.data.courseId]);
                    const newPoints = userForUpdateRes.rows[0].points + course.pointsCost;
                    const newStudents = courseForUpdateRes.rows[0].students.filter(id => id !== userId);
                    const historyEntry = { action: `取消預約：${course.title}`, pointsChange: +course.pointsCost, time: new Date().toISOString() };
                    const userHistory = userForUpdateRes.rows[0].history || [];
                    const newHistory = [...userHistory, historyEntry];
                    let newWaiting = courseForUpdateRes.rows[0].waiting;
                    if (newWaiting.length > 0) {
                        const promotedUserId = newWaiting.shift();
                        newStudents.push(promotedUserId);
                        push(promotedUserId, `🎉 候補成功通知 🎉\n您候補的課程「${course.title}」已有空位，已為您自動預約成功！`).catch(err => console.error(err));
                    }
                    await client.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [newStudents, newWaiting, state.data.courseId]);
                    await client.query('UPDATE users SET points = $1, history = $2, state = NULL WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                    await client.query('COMMIT');
                    return reply(replyToken, `✅ 已為您取消「${course.title}」的預約，並歸還 ${course.pointsCost} 點。`);
                } catch (e) {
                    await client.query('ROLLBACK'); console.error('取消預約失敗:', e);
                    user.state = null; await saveUser(user);
                    return reply(replyToken, '取消預約時發生錯誤，請稍後再試。');
                } finally {
                    if(client) client.release();
                }
              }
              break;
          case 'cancel_wait':
              if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { user.state = null; await saveUser(user); return reply(replyToken, '已放棄取消操作。'); }
              if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
                const newWaitingList = course.waiting.filter(id => id !== userId);
                await saveCourse({ ...course, waiting: newWaitingList });
                user.state = null; await saveUser(user);
                return reply(replyToken, `✅ 已為您取消「${course.title}」的候補。`);
              }
              break;
      }
      return;
    }
    else if(studentState.name === 'feedback') {
      if (text.toLowerCase() === '取消') {
        user.state = null; await saveUser(user);
        return reply(replyToken, '已取消留言。');
      }
      await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text]);
      user.state = null; await saveUser(user);
      await reply(replyToken, '感謝您的留言，我們已收到您的訊息，老師會盡快查看！');
      if (TEACHER_ID) { push(TEACHER_ID, `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`).catch(e => console.error(e)); }
      return;
    }
  }

  // --- 無狀態指令 ---
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
            return reply(replyToken, '查詢公告時發生錯誤，請稍後再試。');
        } finally {
            if (client) client.release();
        }
    } else if (text === COMMANDS.STUDENT.CONTACT_US) {
        user.state = { name: 'feedback', step: 'await_message', timestamp: Date.now() };
        await saveUser(user);
        return reply(replyToken, '請輸入您想對老師說的話，或點選「取消」。', [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }]);
    } else if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      user.state = null; await saveUser(user);
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, flexMenu);
    } else {
        // ... 其他所有學員無狀態指令 ...
    }
}
async function checkAndSendReminders() {
    const client = await pgPool.connect();
    try {
        const now = Date.now();
        const reminderWindowStart = new Date(now + ONE_HOUR_IN_MS - (1000 * 60 * 5)); 
        const reminderWindowEnd = new Date(now + ONE_HOUR_IN_MS);

        // --- 修改：只查詢 reminder_sent 為 false 的課程 ---
        const res = await client.query(`SELECT * FROM courses WHERE time BETWEEN $1 AND $2 AND reminder_sent = FALSE`, [reminderWindowStart, reminderWindowEnd]);
        const upcomingCourses = res.rows;

        for (const course of upcomingCourses) {
            const reminderMsg = `🔔 課程提醒：\n您的課程「${course.title}」即將在約一小時後 (${formatDateTime(course.time)}) 開始，請準備上課！`;
            for (const studentId of course.students) {
                await push(studentId, reminderMsg);
            }
            // --- 新增：發送後，將課程標記為已發送提醒 ---
            await client.query('UPDATE courses SET reminder_sent = TRUE WHERE id = $1', [course.id]);
            console.log(`✅ 已發送課程 ${course.id} 的上課提醒。`);
        }
    } catch (err) {
        console.error("❌ 檢查課程提醒時發生錯誤:", err);
    } finally {
        if(client) client.release();
    }
}

app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

// --- 修改：優化 Webhook 回應機制 ---
app.post('/webhook', (req, res) => {
  const signature = crypto.createHmac('SHA256', config.channelSecret).update(req.rawBody).digest('base64');
  if (req.headers['x-line-signature'] !== signature) {
    return res.status(401).send('Unauthorized');
  }

  // 立即回覆 200 OK 給 LINE 伺服器，避免逾時重試
  res.status(200).send('OK');

  // 在背景非同步處理收到的所有事件
  req.body.events.forEach(event => {
      handleEvent(event).catch(err => {
          console.error(`❌ 處理事件時發生未捕捉的錯誤: `, err);
      });
  });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  checkEnvVariables(); // --- 新增：啟動時檢查環境變數 ---
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V17.0 (無狀態化重構)`);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => { if(SELF_URL.startsWith('https')) fetch(SELF_URL).catch(err => console.error("Ping self failed:", err.message)); }, PING_INTERVAL_MS);
});

async function handleEvent(event) {
    if (event.type === 'unfollow' || event.type === 'leave' || !event.source.userId) {
        console.log(`用戶 ${event.source.userId || '未知'} 已封鎖或離開，或事件無來源 ID`);
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
    
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, state: null };
            await saveUser(user);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (error) {
            console.error(`創建新用戶時出錯: `, error);
            return;
        }
    } else {
        if (user.state && user.state.timestamp && (Date.now() - user.state.timestamp > CONVERSATION_TIMEOUT_MS)) {
            console.log(`清除使用者 ${userId} 的過期狀態: ${user.state.name}`);
            const expiredStateName = user.state.name;
            user.state = null;
            await saveUser(user);
            // 僅在非文字輸入事件時主動通知，避免洗頻
            if (event.type !== 'message') {
                await push(userId, '由於您長時間未操作，先前的步驟已自動取消。請重新開始。');
            }
            return;
        }

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

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
              user.role = 'admin';
              user.state = null; // 清除可能存在的舊狀態
              await saveUser(user);
              if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
            }
        }
        
        switch(user.role) {
            case 'admin': await handleAdminCommands(event, user); break;
            case 'teacher': await handleTeacherCommands(event, user); break;
            default: await handleStudentCommands(event, user); break;
        }

    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');

        if (action === 'view_pending_orders') {
            const page = parseInt(data.get('page'), 10) || 1;
            const clientDB = await pgPool.connect();
            try {
                const totalRes = await clientDB.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'");
                const totalOrders = parseInt(totalRes.rows[0].count, 10);
                const pageSize = 5;
                const totalPages = Math.ceil(totalOrders / pageSize);
                const offset = (page - 1) * pageSize;
                const ordersRes = await clientDB.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC LIMIT $1 OFFSET $2`, [pageSize, offset]);
                
                const orderBubbles = ordersRes.rows.map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${formatIdForDisplay(order.order_id)}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `學員姓名: ${order.user_name}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${formatIdForDisplay(order.user_id)}`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last_5_digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.order_id}` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.order_id}` } }] } }));
                
                const controlButtons = [];
                if (page > 1) {
                    controlButtons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '⬅️ 上一頁', data: `action=view_pending_orders&page=${page - 1}` }});
                }
                if (page < totalPages) {
                    controlButtons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '下一頁 ➡️', data: `action=view_pending_orders&page=${page + 1}` }});
                }
                if(controlButtons.length > 0) {
                     orderBubbles.push({ type: 'bubble', body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: controlButtons }, { type: 'text', text: `第 ${page} / ${totalPages} 頁`, size: 'sm', color: '#AAAAAA', margin: 'md' } ] } });
                }

                return reply(token, { type: 'flex', altText: `待確認訂單列表 (第${page}頁)`, contents: { type: 'carousel', contents: orderBubbles } });

            } catch (err) {
                console.error('處理訂單分頁時發生錯誤:', err);
                return reply(token, '讀取訂單時發生錯誤。');
            } finally {
                if (clientDB) clientDB.release();
            }
        }

        // --- 將 Postback 事件傳遞給對應的 handler ---
        const handlers = {
            admin: handleAdminCommands,
            teacher: handleTeacherCommands,
            student: handleStudentCommands
        };
        const handler = handlers[user.role] || handleStudentCommands;
        await handler(event, user);
    }
}
