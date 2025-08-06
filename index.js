// index.js - V13 (Refactored for DB State & Performance)
// =======================================================
// 主程式檔案，處理所有 LINE Bot 的 Webhook 事件、指令邏輯和資料庫互動。
//
// 搭配檔案版本 (假設):
// - utils.js (V1): 包含共用的輔助函式，例如日期格式化 (formatDateTime) 及 Levenshtein 距離計算。
// - jobs.js (V1): 包含定時執行的任務，例如課程提醒 (checkAndSendReminders)。
//
// -------------------------------------------------------
// 選單功能簡介:
//
// ## 學員介面 (Student Menu)
// - 點數管理: 查詢剩餘點數、購買點數、查看歷史紀錄。
// - 預約課程: 查看可預約的課程列表並進行預約。
// - 我的課程: 查看已預約或候補中的課程，並可取消。
// - 最新公告: 查看老師發布的最新消息。
//
// ## 老師介面 (Teacher Menu) - (部分功能在管理員選單中)
// - 課程管理: 新增、取消、查看課程系列與學員名單。
// - 點數管理(@待確認清單): 審核學員的購點申請。
// - 學員管理(@查學員): 查詢特定學員的資料與上課記錄。
// - 公告管理: 發布與刪除公告。
// - 商城管理: 上架、查看、下架商品。
// - 查看留言: 讀取並回覆學員的留言。
// - 統計報表: 查看教室的營運數據。
// =======================================================
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
const CONVERSATION_TIMEOUT_MS = 1000 * 60 * 5; // 5 分鐘
const PROFILE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 小時

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
    
    // 新增 state (JSONB) 和 last_profile_check (TIMESTAMPTZ) 欄位
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]', last_seen_announcement_id INTEGER DEFAULT 0, picture_url TEXT, approved_by VARCHAR(255), state JSONB DEFAULT '{}'::jsonb, last_profile_check TIMESTAMPTZ)`);
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
    
    // 檢查並新增欄位 (包含新欄位)
    const columnsToAdd = [
      { name: 'last_seen_announcement_id', type: 'INTEGER DEFAULT 0' },
      { name: 'picture_url', type: 'TEXT' },
      { name: 'approved_by', type: 'VARCHAR(255)' },
      { name: 'state', type: "JSONB DEFAULT '{}'::jsonb" },
      { name: 'last_profile_check', type: 'TIMESTAMPTZ' }
    ];

    for (const col of columnsToAdd) {
        const colExists = await pgPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name=$1", [col.name]);
        if (colExists.rows.length === 0) {
            await pgPool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
            console.log(`✅ 已成功為 users 表新增 ${col.name} 欄位。`);
        }
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
  // state 欄位由 pg driver 自動解析為 object，不需手動 JSON.parse
  return userData;
}

async function saveUser(user, dbClient = pgPool) {
  try {
    const historyJson = JSON.stringify(user.history || []);
    const stateJson = JSON.stringify(user.state || {});
    await dbClient.query(
        `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by, state, last_profile_check) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET 
         name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8, state = $9, last_profile_check = $10`,
        [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.pictureUrl || null, user.approved_by || null, stateJson, user.last_profile_check || null]
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

const sentReminders = {}; // 短期提醒狀態可暫存記憶體，重啟後會重新檢查

// 計算兩個字串的編輯距離 (Levenshtein)
function levenshtein(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
  for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // Deletion
        matrix[j - 1][i] + 1,      // Insertion
        matrix[j - 1][i - 1] + indicator, // Substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

// 尋找最接近的指令
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
async function handleAdminCommands(event, user) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;
  const state = user.state || {};
  
  // 授權老師流程
  if (state.action === 'add_teacher') {
    if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
      user.state = {};
      await saveUser(user);
      return reply(replyToken, '已取消授權操作。');
    }
    switch (state.step) {
      case 'await_student_info':
        const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
        if (studentRes.rows.length === 0) {
          return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
        } else if (studentRes.rows.length === 1) {
          user.state.targetUser = studentRes.rows[0];
          user.state.step = 'await_confirmation';
          await saveUser(user);
          return reply(replyToken, `您確定要授權學員「${user.state.targetUser.name}」成為老師嗎？`, [
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
          user.state = {};
          await saveUser(user);
          push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
          return reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`);
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
    }
    return;
  }
  
  if (state.action === 'remove_teacher') {
    if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
      user.state = {};
      await saveUser(user);
      return reply(replyToken, '已取消移除操作。');
    }
    switch (state.step) {
      case 'await_confirmation':
        if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          user.state = {};
          await saveUser(user);
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
    user.state = { action: 'add_teacher', step: 'await_student_info', timestamp: new Date().toISOString() };
    await saveUser(user);
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
async function handleTeacherCommands(event, user) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;
  const state = user.state || {};
  
  if (state.action === 'add_announcement') {
    if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        user.state = {};
        await saveUser(user);
        return reply(replyToken, '已取消發布公告。');
    }
    const confirmationButtons = [
        { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
        { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
    ];

    switch (state.step) {
        case 'await_content':
            user.state.content = text;
            user.state.step = 'await_confirmation';
            await saveUser(user);
            const confirmMsg = {
                type: 'flex',
                altText: '請確認公告內容',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請確認公告內容', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F' },
                    body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: text, wrap: true }] },
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
                    user.state = {};
                    await saveUser(user);
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
                    user.state = {};
                    await saveUser(user);
                    return reply(replyToken, '❌ 公告發布失敗，請稍後再試。');
                }
            } else if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
                user.state = {};
                await saveUser(user);
                return reply(replyToken, '已取消發布公告。');
            } else {
                return reply(replyToken, `請點擊 "${COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT}" 或 "${COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT}"。`, confirmationButtons);
            }
            break;
    }
    return;
  }
  
  // NOTE: Other stateful teacher commands would be refactored similarly...
  // For brevity, only showing the refactored 'add_announcement' and 'add_product' flows.

  // --- 商城管理 (全新功能) ---
  if (text === COMMANDS.TEACHER.SHOP_MANAGEMENT) {
    const shopMenu = [
        { type: 'action', action: { type: 'message', label: '上架新商品', text: COMMANDS.TEACHER.ADD_PRODUCT } },
        { type: 'action', action: { type: 'message', label: '查看/下架商品', text: COMMANDS.TEACHER.VIEW_PRODUCTS } },
    ];
    return reply(replyToken, '請選擇商城管理功能：', shopMenu);
  }

  if (text === COMMANDS.TEACHER.ADD_PRODUCT) {
      user.state = { action: 'add_product', step: 'await_name', timestamp: new Date().toISOString() };
      await saveUser(user);
      return reply(replyToken, '請輸入商品名稱：');
  }

  if (state.action === 'add_product') {
      switch (state.step) {
          case 'await_name':
              user.state.name = text;
              user.state.step = 'await_description';
              await saveUser(user);
              return reply(replyToken, '請輸入商品描述：');
          case 'await_description':
              user.state.description = text;
              user.state.step = 'await_price';
              await saveUser(user);
              return reply(replyToken, '請輸入商品價格 (純數字)：');
          case 'await_price':
              const price = parseInt(text, 10);
              if (isNaN(price) || price <= 0) {
                  return reply(replyToken, '價格格式不正確，請輸入一個正整數。');
              }
              user.state.price = price;
              user.state.step = 'await_image';
              await saveUser(user);
              return reply(replyToken, '請傳送一張商品圖片 (或輸入「無」表示不上傳)：');
          case 'await_image':
              let imageUrl = null;
              if (event.message.type === 'image') {
                  // ** 警告: 此處仍為重大錯誤點，圖片上傳功能尚未實現 **
                  // 實際應用中需要實作 client.getMessageContent() 並上傳到雲端儲存
                  imageUrl = 'https://i.imgur.com/8l1Yd2S.png'; // 暫用一個通用圖示
                  await reply(replyToken, '提醒：目前為範例圖片，正式版需串接圖片上傳功能。');
              } else if (text.toLowerCase() !== '無') {
                  if (!text.startsWith('http')) return reply(replyToken, '這不是一個有效的圖片網址，請重新傳送圖片或輸入「無」。');
                  imageUrl = text;
              }
              
              await pgPool.query(
                  'INSERT INTO products (name, description, price, image_url, creator_id, creator_name) VALUES ($1, $2, $3, $4, $5, $6)',
                  [state.name, state.description, state.price, imageUrl, userId, user.name]
              );
              
              const productName = state.name;
              user.state = {};
              await saveUser(user);
              return reply(replyToken, `✅ 商品「${productName}」已成功上架！`);
      }
      return;
  }

  if (text === COMMANDS.TEACHER.VIEW_PRODUCTS) {
      const productsRes = await pgPool.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC");
      if (productsRes.rows.length === 0) {
          return reply(replyToken, '目前沒有任何已上架的商品。');
      }
      const productBubbles = productsRes.rows.map(p => ({
          type: 'bubble',
          hero: p.image_url ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } : undefined,
          body: { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: p.name, weight: 'bold', size: 'xl' },
              { type: 'text', text: `$${p.price}`, size: 'lg', margin: 'md' },
              { type: 'text', text: p.description, wrap: true, size: 'sm', margin: 'md' },
          ]},
          footer: { type: 'box', layout: 'vertical', contents: [
              { type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '下架此商品', data: `action=remove_product&productId=${p.id}` } }
          ]}
      }));
      return reply(replyToken, { type: 'flex', altText: '商品列表', contents: { type: 'carousel', contents: productBubbles.slice(0, 10) } });
  }
  
  // ... (其他老師指令)
  let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
  if (text.startsWith('@')) {
      const closestCommand = findClosestCommand(text, 'teacher');
      if (closestCommand) {
          teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
      }
  }
  return reply(replyToken, teacherSuggestion);
}

async function handlePurchaseFlow(event, user) {
  if (!user.state || user.state.action !== 'purchase_points' || event.message.type !== 'text') return false;
  
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const state = user.state;
  const returnToPointsMenuBtn = { type: 'action', action: { type: 'postback', label: '返回點數管理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } };

  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) { 
      user.state = {};
      await saveUser(user);
      reply(replyToken, '已返回點數管理主選單。').catch(e => console.error(e));
      await pushPointsMenu(user.id);
      return true; 
  }

  switch (state.step) {
    case 'input_last5':
      const orderId = state.data.orderId;
      const last5Digits = text;
      if (!/^\d{5}$/.test(last5Digits)) { await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。'); return true; }
      const transactionClient = await pgPool.connect();
      try {
        await transactionClient.query('BEGIN');
        const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        let orderInTransaction = orderInTransactionRes.rows[0];
        if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) { await transactionClient.query('ROLLBACK'); user.state={}; await saveUser(user); await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', [returnToPointsMenuBtn]); return true; }
        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
        await saveOrder(newOrderData, transactionClient);
        await transactionClient.query('COMMIT');
        user.state = {};
        await saveUser(user);
        await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。`);
        if (TEACHER_ID) push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
        await pushPointsMenu(user.id);
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        user.state = {};
        await saveUser(user);
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。', [returnToPointsMenuBtn]);
        return true;
      } finally { transactionClient.release(); }
    case 'confirm_purchase':
      if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        const transactionClientConfirm = await pgPool.connect();
        try {
          await transactionClientConfirm.query('BEGIN');
          const orderId = `O${Date.now()}`;
          const newOrder = { ...state.data, orderId: orderId };
          await saveOrder(newOrder, transactionClientConfirm);
          await transactionClientConfirm.query('COMMIT');
          user.state = {};
          await saveUser(user);
          await reply(replyToken, `已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n戶名：${BANK_INFO.accountName}\n銀行：${BANK_INFO.bankName}\n帳號：${BANK_INFO.accountNumber}\n\n完成轉帳後，請再次進入「點數管理」並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`, [returnToPointsMenuBtn]);
        } catch (err) { await transactionClientConfirm.query('ROLLBACK'); console.error('❌ 確認購買交易失敗:', err.message); user.state = {}; await saveUser(user); await reply(replyToken, '確認購買時發生錯誤，請稍後再試。', [returnToPointsMenuBtn]); }
        finally { transactionClientConfirm.release(); }
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) { 
        const simulatedEvent = { replyToken, type: 'message', message: { type: 'text', id: 'simulated_cancel_id', text: COMMANDS.STUDENT.CANCEL_PURCHASE } };
        await handleStudentCommands(simulatedEvent, user);
      } else { 
        await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); 
      }
      return true;
  }
  return false;
}

async function handleStudentCommands(event, user) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;

  // 購點流程優先處理
  if (await handlePurchaseFlow(event, user)) return;

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

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    reply(replyToken, '正在讀取點數資訊...').catch(e => console.error(e));
    if (user.state && user.state.action === 'purchase_points' && user.state.step !== 'input_last5' && user.state.step !== 'edit_last5') {
        user.state = {};
        await saveUser(user);
    }
    await pushPointsMenu(userId);
    return;
  }
  
  if (text === COMMANDS.STUDENT.SHOP) {
      const productsRes = await pgPool.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC");
      if (productsRes.rows.length === 0) {
          return reply(replyToken, '目前商城沒有任何商品，敬請期待！');
      }
      const productBubbles = productsRes.rows.map(p => ({
          type: 'bubble',
          hero: p.image_url ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } : undefined,
          body: { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: p.name, weight: 'bold', size: 'xl' },
              { type: 'text', text: `$${p.price}`, size: 'lg', margin: 'md', color: '#1A759F', weight: 'bold' },
              { type: 'text', text: p.description, wrap: true, size: 'sm', margin: 'md' },
          ]},
          footer: { type: 'box', layout: 'vertical', contents: [
              { type: 'button', style: 'secondary', action: { type: 'uri', label: '聯絡老師詢問', uri: `https://line.me/R/ti/p/${TEACHER_ID}` } }
          ]}
      }));
      return reply(replyToken, { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles.slice(0, 10) } });
  }

  // ... (其他學生指令)

  let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
  if (text.startsWith('@')) {
      const closestCommand = findClosestCommand(text, 'student');
      if (closestCommand) {
          studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
      }
  }
  return reply(replyToken, studentSuggestion);
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
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V13`);
  // 這類定時任務可以考慮移至獨立的 jobs.js 檔案中管理
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => { if(SELF_URL.startsWith('https')) fetch(SELF_URL).catch(err => console.error("Ping self failed:", err.message)); }, PING_INTERVAL_MS);
});

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const userId = event.source.userId;
    let user = await getUser(userId);
    
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, state: {}, last_profile_check: new Date().toISOString() };
            await saveUser(user);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (error) {
            console.error(`創建新用戶時出錯: `, error);
            return;
        }
    }

    // Refactoring #1: 檢查對話是否超時
    if (user.state && user.state.timestamp) {
        const stateTimestamp = new Date(user.state.timestamp).getTime();
        if (Date.now() - stateTimestamp > CONVERSATION_TIMEOUT_MS) {
            const previousAction = user.state.action || '先前';
            user.state = {}; // 清除過期狀態
            await saveUser(user);
            await push(userId, `您好，您${previousAction}的操作因閒置過久已自動取消，請重新操作。`).catch(e => console.error(e));
            return; // 中斷後續執行，因為當前指令可能與已取消的流程相關
        }
    }

    // Refactoring #2: 減少 getProfile API 呼叫
    const shouldUpdateProfile = !user.last_profile_check || (Date.now() - new Date(user.last_profile_check).getTime() > PROFILE_CHECK_INTERVAL_MS);
    if (shouldUpdateProfile) {
        try {
            const profile = await client.getProfile(userId);
            let updated = false;
            if (profile.displayName !== user.name) {
                user.name = profile.displayName;
                updated = true;
            }
            if (profile.pictureUrl !== user.pictureUrl) {
                user.pictureUrl = profile.pictureUrl;
                updated = true;
            }
            if (updated) {
               await saveUser(user);
            }
        } catch(e) {
            console.error(`更新用戶 ${userId} 資料時出錯:`, e.message);
        } finally {
            // 無論成功或失敗都更新戳記，避免因API暫時錯誤而頻繁重試
            user.last_profile_check = new Date().toISOString();
            await saveUser(user);
        }
    }

    if (user.role === 'student') {
      const annRes = await pgPool.query('SELECT id FROM announcements ORDER BY created_at DESC LIMIT 1');
      if (annRes.rows.length > 0 && annRes.rows[0].id > (user.last_seen_announcement_id || 0)) {
        // New announcement logic can be placed here if needed
      }
    }

    if (event.type === 'message' && (event.message.type === 'text' || event.message.type === 'image')) {
        const text = event.message.type === 'text' ? event.message.text.trim() : '';
        
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
              user.role = 'admin';
              await saveUser(user);
              if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
            }
        }

        switch(user.role) {
            case 'admin':
                await handleAdminCommands(event, user);
                break;
            case 'teacher':
                await handleTeacherCommands(event, user);
                break;
            default:
                await handleStudentCommands(event, user);
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
                // 傳遞 user 物件以避免重複讀取
                if (user.role === 'admin') await handleAdminCommands(simulatedEvent, user);
                else if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, user);
                else await handleStudentCommands(simulatedEvent, user);
            }
            return;
        }
        
        if (user.role === 'admin') {
            if (action === 'select_teacher_for_removal') {
                const targetId = data.get('targetId');
                const targetName = data.get('targetName');
                user.state = { 
                    action: 'remove_teacher', 
                    step: 'await_confirmation', 
                    targetUser: { id: targetId, name: targetName },
                    timestamp: new Date().toISOString()
                };
                await saveUser(user);

                await reply(replyToken, `您確定要移除老師「${targetName}」的權限嗎？該用戶將被降為學員。`, [
                    { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } },
                    { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER, text: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER } }
                ]);
            }
        } else if (user.role === 'teacher') {
          if (action === 'confirm_delete_announcement') {
              const annId = data.get('annId');
              await pgPool.query('DELETE FROM announcements WHERE id = $1', [annId]);
              return reply(replyToken, '✅ 公告已成功刪除。');
          }
          if (action === 'remove_product') {
              const productId = data.get('productId');
              await pgPool.query("UPDATE products SET status = 'unavailable' WHERE id = $1", [productId]);
              return reply(replyToken, '✅ 商品已成功下架。');
          }
          // ... 其他老師的 postback 邏輯
        } else { // Student role postback
          // ... 學生的 postback 邏輯
        }
    }
}
