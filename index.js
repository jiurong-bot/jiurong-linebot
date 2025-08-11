// index.js - V_DEBUG (除錯版)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
// const { Pool } = require('pg'); // [除錯] 暫時註解
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

/* [除錯] 暫時註解掉整個 pgPool 的初始化
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
*/
const pgPool = null; // [除錯] 將 pgPool 設為 null


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
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
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
  /* [除錯] 暫時註解掉所有資料庫操作
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
    if (client) client.release();
  }
  */
  console.log('🟡 [除錯模式] 已跳過資料庫初始化。');
  return Promise.resolve();
}

async function generateUniqueCoursePrefix(dbClient) {
    // [除錯] 因無資料庫，返回一個固定的假 Prefix
    return "XX";
}

// [除錯] 所有資料庫操作函式都先改成返回假資料或直接略過，避免應用程式崩潰
async function getUser(userId, dbClient) {
    console.log(`🟡 [除錯模式] getUser 被呼叫，返回一個假的 user 物件。`);
    // 返回一個基本的假使用者物件，以確保其他函式不會因為 null 而出錯
    return {
        id: userId,
        name: '除錯使用者',
        points: 100,
        role: 'student', // 可手動改為 'teacher' 或 'admin' 來測試不同身份
        history: [],
        last_seen_announcement_id: 0,
        picture_url: null,
        approved_by: null
    };
}

async function saveUser(user, dbClient) {
    console.log(`🟡 [除錯模式] saveUser 被呼叫，但不會執行任何操作。 User ID: ${user.id}`);
    return Promise.resolve();
}

async function getCourse(courseId, dbClient) {
    console.log(`🟡 [除錯模式] getCourse 被呼叫，返回 null。`);
    return null;
}

async function saveCourse(course, dbClient) {
    console.log(`🟡 [除錯模式] saveCourse 被呼叫，但不會執行任何操作。`);
    return Promise.resolve();
}
async function deleteCourse(courseId, dbClient) {
    console.log(`🟡 [除錯模式] deleteCourse 被呼叫，但不會執行任何操作。`);
    return Promise.resolve();
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    console.log(`🟡 [除錯模式] deleteCoursesByPrefix 被呼叫，但不會執行任何操作。`);
    return [];
}

async function saveOrder(order, dbClient) {
    console.log(`🟡 [除錯模式] saveOrder 被呼叫，但不會執行任何操作。`);
    return Promise.resolve();
}

async function deleteOrder(orderId, dbClient) {
    console.log(`🟡 [除錯模式] deleteOrder 被呼叫，但不會執行任何操作。`);
    return Promise.resolve();
}
async function cleanCoursesDB(dbClient) {
  console.log(`🟡 [除錯模式] cleanCoursesDB 被呼叫，但不會執行任何操作。`);
  return Promise.resolve();
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
    // [除錯] 因無資料庫，返回一個靜態的 Flex Message
    console.log(`🟡 [除錯模式] buildPointsMenuFlex 被呼叫，返回靜態選單。`);
    const user = await getUser(userId); // 仍然獲取假的使用者資料以顯示點數
    const pointBubbles = [
        { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: `(除錯模式)`, color: '#666666', size: 'xs', align: 'center' }] }, action: { type: 'postback', label: '重新整理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } },
        { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購買點數', data: `action=run_command&text=${COMMANDS.STUDENT.BUY_POINTS}` } },
        { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購點紀錄', data: `action=run_command&text=${COMMANDS.STUDENT.PURCHASE_HISTORY}` } }
    ];
    return { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
}
async function pushPointsMenu(userId) {
    try {
        const flexMessage = await buildPointsMenuFlex(userId);
        await push(userId, flexMessage);
    } catch (err) {
        console.error(`❌ 推播點數選單失敗 (pushPointsMenu):`, err);
        await push(userId, '抱歉，讀取點數資訊時發生錯誤。').catch(e => console.error("發送錯誤訊息時再次失敗:", e));
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

async function handleCancel(userId, replyToken) {
    const clearedSomething = clearPendingConversations(userId);

    // [除錯] 繞過資料庫檢查
    if (clearedSomething) {
        return reply(replyToken, '操作已取消。');
    } else {
        return reply(replyToken, '目前沒有需要取消的操作。');
    }
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
// [除錯] 由於所有資料庫相關功能都被暫停，這裡建立一個通用的「除錯訊息」函式
async function sendDebugMessage(replyToken, featureName) {
    const message = `🟡 [除錯模式]\n「${featureName}」功能因資料庫連線已暫停而無法使用。\n\n這個測試的目的是確認應用程式本身能否在沒有資料庫的情況下成功啟動。`;
    return reply(replyToken, message);
}

// [除錯] 重寫所有主要的 handler，讓它們只回覆除錯訊息
async function handlePurchaseFlow(event, userId) {
    if (pendingPurchase[userId]) {
        await sendDebugMessage(event.replyToken, "購買點數流程");
        clearPendingConversations(userId);
        return true;
    }
    return false;
}

async function showPurchaseHistory(replyToken, userId, page) {
    return sendDebugMessage(replyToken, "查詢購點紀錄");
}

async function showAvailableCourses(replyToken, userId, page) {
    return sendDebugMessage(replyToken, "查詢可預約課程");
}

async function showMyCourses(replyToken, userId, page) {
    return sendDebugMessage(replyToken, "查詢我的課程");
}

async function showShopProducts(replyToken, page) {
    return sendDebugMessage(replyToken, "查詢商城商品");
}

async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  if (await handlePurchaseFlow(event, userId)) return;
  if (pendingBookingConfirmation[userId] || pendingFeedback[userId]) {
      clearPendingConversations(userId);
      return sendDebugMessage(replyToken, "互動式對話");
  }

  const studentCommands = COMMANDS.STUDENT;
  switch (text) {
      case studentCommands.LATEST_ANNOUNCEMENT:
      case studentCommands.CONTACT_US:
      case studentCommands.POINTS:
      case studentCommands.CHECK_POINTS:
      case studentCommands.RETURN_POINTS_MENU:
      case studentCommands.BUY_POINTS:
      case studentCommands.PURCHASE_HISTORY:
      case studentCommands.BOOK_COURSE:
      case studentCommands.MY_COURSES:
      case studentCommands.SHOP:
      case studentCommands.INPUT_LAST5_CARD_TRIGGER:
      case studentCommands.EDIT_LAST5_CARD_TRIGGER:
          return sendDebugMessage(replyToken, `指令：${text}`);
      default:
          let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。\n(除錯模式：資料庫功能已停用)';
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
}

async function showTeacherListForRemoval(replyToken, page) {
    return sendDebugMessage(replyToken, "移除老師列表");
}


async function handleAdminCommands(event, userId) {
    const text = event.message.text.trim();
    if (pendingTeacherAddition[userId] || pendingTeacherRemoval[userId]) {
        clearPendingConversations(userId);
        return sendDebugMessage(event.replyToken, "新增/移除老師流程");
    }
    if (Object.values(COMMANDS.ADMIN).includes(text)) {
        return sendDebugMessage(event.replyToken, `管理者指令：${text}`);
    }
}

async function showPendingOrders(replyToken, page = 1) {
    return sendDebugMessage(replyToken, "查詢待確認訂單");
}

async function showStudentSearchResults(replyToken, query, page = 1) {
    return sendDebugMessage(replyToken, "查詢學員結果");
}

async function showUnreadMessages(replyToken, page = 1) {
    return sendDebugMessage(replyToken, "查詢未讀留言");
}

async function showAnnouncementsForDeletion(replyToken, page = 1) {
    return sendDebugMessage(replyToken, "查詢可刪除公告");
}

async function showCourseSeries(replyToken, page = 1) {
    return sendDebugMessage(replyToken, "查詢課程系列");
}

async function handleTeacherCommands(event, userId) {
    const text = event.message.text.trim();
    const allPendingStates = [
        pendingAnnouncementCreation, pendingAnnouncementDeletion, pendingCourseCancellation,
        pendingCourseCreation, pendingManualAdjust, pendingStudentSearchQuery, pendingReply,
        pendingMessageSearchQuery, pendingProductCreation
    ];
    for (const state of allPendingStates) {
        if (state[userId]) {
            clearPendingConversations(userId);
            return sendDebugMessage(event.replyToken, "老師互動式對話");
        }
    }

    if (Object.values(COMMANDS.TEACHER).includes(text)) {
        return sendDebugMessage(event.replyToken, `老師指令：${text}`);
    } else {
        return reply(event.replyToken, '無法識別您的指令🤔\n(除錯模式：資料庫功能已停用)');
    }
}

async function showSingleCoursesForCancellation(replyToken, prefix, page) {
    return sendDebugMessage(replyToken, "查詢單堂可取消課程");
}


async function checkAndSendReminders() {
    // [除錯] 因無資料庫，此函式不執行任何操作
    // console.log("🟡 [除錯模式] 跳過課程提醒檢查。");
}
app.use(express.json({ verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; } }));

app.post('/webhook', (req, res) => {
  const signature = crypto.createHmac('SHA256', config.channelSecret).update(req.rawBody).digest('base64');
  if (req.headers['x-line-signature'] !== signature) {
    return res.status(401).send('Unauthorized');
  }
  res.status(200).send('OK');
  Promise.all(req.body.events.map(event => handleEvent(event).catch(err => {
      console.error('❌ handleEvent 執行失敗:', err.stack);
      if (event.replyToken) {
          reply(event.replyToken, '系統發生未預期的錯誤，請稍後再試或聯繫管理員。\n(除錯模式)').catch(e => console.error("最終防線回覆失敗:", e));
      }
  })));
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。(除錯模式)'));

app.listen(PORT, async () => {
  checkEnvironmentVariables();
  // [除錯] 此處呼叫的 initializeDatabase 已經被修改為不會真的連線
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  // 版本號更新
  console.log(`Bot 版本: V_DEBUG (除錯版)`);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => { if(SELF_URL.startsWith('https')) fetch(SELF_URL).catch(err => console.error("Ping self failed:", err.message)); }, PING_INTERVAL_MS);
});

async function handleEvent(event) {
    if (event.type === 'unfollow' || event.type === 'leave' || event.type === 'join' || !event.replyToken) {
        return;
    }
    
    const token = event.replyToken;
    if (repliedTokens.has(token)) {
      console.log('🔄️ 偵測到重複的 Webhook 事件，已忽略。');
      return;
    }
    repliedTokens.add(token);
    setTimeout(() => repliedTokens.delete(token), 60000);

    const userId = event.source.userId;
    let user = await getUser(userId); // [除錯] 這裡會拿到假的 user 物件
    
    if (event.type === 'message' && event.message.type === 'text') {
        if (event.message.text.trim() === COMMANDS.GENERAL.CANCEL) {
            return handleCancel(userId, event.replyToken);
        }
    }
    
    let isNewFlowCommand = false;
    if (event.type === 'message' && event.message.type === 'text') {
        if (event.message.text.trim().startsWith('@')) isNewFlowCommand = true;
    } else if (event.type === 'postback') {
        const action = new URLSearchParams(event.postback.data).get('action');
        const newFlowActions = ['run_command', 'list_teachers_for_removal', 'generate_report', 'add_course_start'];
        if (newFlowActions.includes(action) || action?.startsWith('view_') || action?.startsWith('manage_')) isNewFlowCommand = true;
    }

    if (isNewFlowCommand) {
        const cleared = clearPendingConversations(userId);
        if (cleared) console.log(`使用者 ${userId} 的待辦任務已由新操作自動取消。`);
    }

    // [除錯] 由於 getUser 永遠會返回一個 user 物件，所以省略了創建新用戶的流程
    
    // [除錯] 省略檢查新公告的資料庫操作

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        try {
            if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
                user.role = 'admin'; // [除錯] 模擬切換為 admin
                return handleAdminCommands(event, userId);
            }
            // [除錯] 根據假 user 的 role 來決定呼叫哪個 handler
            switch(user.role) {
                case 'admin': await handleAdminCommands(event, userId); break;
                case 'teacher': await handleTeacherCommands(event, userId); break;
                default: await handleStudentCommands(event, userId); break;
            }
        } catch (err) {
            console.error(`在 ${user.role} 指令處理中發生未捕獲的錯誤:`, err);
            await reply(event.replyToken, '處理您的請求時發生錯誤，請稍後再試。\n(除錯模式)');
        }

    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');
        
        // [除錯] 對於 postback，大多情況下直接回覆除錯訊息
        return sendDebugMessage(event.replyToken, `Postback 功能: ${action}`);
    }
}
