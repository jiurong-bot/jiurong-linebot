// index.js - V35.0 (歷史查詢功能擴充)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto =require('crypto');
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
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;
const CONSTANTS = {
  TIME: {
    ONE_DAY_IN_MS: 86400000,
    EIGHT_HOURS_IN_MS: 28800000,
    ONE_HOUR_IN_MS: 3600000,
  },
  INTERVALS: {
    PING_INTERVAL_MS: 1000 * 60 * 5,
    CONVERSATION_TIMEOUT_MS: 1000 * 60 * 5,
    NOTIFICATION_CACHE_DURATION_MS: 1000 * 30,
    SESSION_TIMEOUT_MS: 1000 * 60 * 5, // [V28.0 新增] 對話階段超時時間 (5分鐘)
  },
  PAGINATION_SIZE: 9,
  PURCHASE_PLANS: [
    { points: 5, amount: 500, label: '5 點 (500元)' },
    { points: 10, amount: 1000, label: '10 點 (1000元)' },
    { points: 20, amount: 2000, label: '20 點 (2000元)' },
    { points: 30, amount: 3000, label: '30 點 (3000元)' },
    { points: 50, amount: 5000, label: '50 點 (5000元)' },
  ],
  BANK_INFO: {
    accountName: process.env.BANK_ACCOUNT_NAME,
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER,
  },
  COMMANDS: {
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
        POINT_ORDER_HISTORY: '@查詢點數訂單',
      STUDENT_MANAGEMENT: '@學員管理',
        SEARCH_STUDENT: '@查詢學員',
        VIEW_MESSAGES: '@查看未回覆留言',
        MESSAGE_SEARCH: '@查詢歷史留言',
      ANNOUNCEMENT_MANAGEMENT: '@公告管理',
        ADD_ANNOUNCEMENT: '@頒佈新公告',
        DELETE_ANNOUNCEMENT: '@刪除舊公告',
      SHOP_MANAGEMENT: '@商城管理',
        ADD_PRODUCT: '@上架新商品',
        VIEW_PRODUCTS: '@商品管理',
        MANAGE_AVAILABLE_PRODUCTS: '@管理販售中商品',
        MANAGE_UNAVAILABLE_PRODUCTS: '@管理已下架商品',
        SHOP_ORDER_MANAGEMENT: '@訂單管理',
        SHOP_ORDER_HISTORY: '@查詢商城訂單',
      REPORT: '@統計報表',
        COURSE_REPORT: '@課程報表',
        ORDER_REPORT: '@訂單報表',
        POINT_REPORT: '@點數報表',
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
      BOOK_COURSE: '@預約課程',
      MY_COURSES: '@我的課程',
      SHOP: '@活動商城',
      POINTS: '@點數查詢',
      LATEST_ANNOUNCEMENT: '@最新公告',
      CONTACT_US: '@聯絡我們',
      VIEW_SHOP_PRODUCTS: '@瀏覽商品',
      EXCHANGE_HISTORY: '@兌換紀錄',
      CHECK_POINTS: '@查看剩餘點數',
      BUY_POINTS: '@購買點數',
      PURCHASE_HISTORY: '@購點紀錄',
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
  }
};
// =======================================================
// [V31.3 新增] 通用快取工具
// =======================================================
const simpleCache = {
  _cache: new Map(),

  /**
   * 設定一筆快取資料
   * @param {string} key - 快取的鍵
   * @param {*} value - 要快取的值
   * @param {number} ttlMs - 快取的存活時間 (毫秒)
   */
  set(key, value, ttlMs) {
    const expires = Date.now() + ttlMs;
    this._cache.set(key, { value, expires });
  },

  /**
   * 讀取一筆快取資料
   * @param {string} key - 快取的鍵
   * @returns {*} - 如果快取存在且未過期，則回傳其值，否則回傳 null
   */
  get(key) {
    const entry = this._cache.get(key);
    // 檢查是否存在，且尚未過期
    if (entry && Date.now() < entry.expires) {
      return entry.value;
    }
    // 如果已過期，可以順便清除它 (可選)
    if (entry) {
        this._cache.delete(key);
    }
    return null;
  },

  /**
   * 清除一筆指定的快取
   * @param {string} key - 快取的鍵
   */
  clear(key) {
    this._cache.delete(key);
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
/**
 * [V29.1 新增] 建立一個通用的、包含分頁功能的 Flex Carousel 訊息。
 * @param {object} options - 設定物件。
 * @param {string} options.altText - Flex Message 的替代文字。
 * @param {string} options.baseAction - Postback 的基本動作字串，例如 'action=view_history'。
 * @param {number} options.page - 當前頁碼。
 * @param {string} options.dataQuery - 要執行的 SQL 查詢，必須包含 LIMIT 和 OFFSET 的參數位置 (例如 $2, $3)。
 * @param {Array<any>} options.queryParams - SQL 查詢的參數陣列 (不含 LIMIT 和 OFFSET 的值)。
 * @param {function(object): object} options.mapRowToBubble - 一個將資料庫 row 轉換為 Flex Bubble 物件的函式。
 * @param {string} options.noDataMessage - 當第一頁沒有任何資料時顯示的文字訊息。
 * @param {string} [options.customParams=''] - (可選) 要附加到 postback data 的額外參數。
 * @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息。
 */
async function createPaginatedCarousel(options) {
  const {
    altText,
    baseAction,
    page,
    dataQuery,
    queryParams,
    mapRowToBubble,
    noDataMessage,
    customParams = ''
  } = options;
  const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;

  return withDatabaseClient(async (client) => {
    // 組合查詢參數，將分頁參數加在最後
    const finalQueryParams = [...queryParams, CONSTANTS.PAGINATION_SIZE + 1, offset];
    const res = await client.query(dataQuery, finalQueryParams);

    const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
    const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

    if (pageRows.length === 0 && page === 1) {
      return noDataMessage;
    }
    if (pageRows.length === 0) {
      return '沒有更多資料了。';
    }

    const bubbles = pageRows.map(mapRowToBubble);

    const paginationBubble = createPaginationBubble(baseAction, page, hasNextPage, customParams);
    if (paginationBubble) {
      bubbles.push(paginationBubble);
    }

    return {
      type: 'flex',
      altText: altText,
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
  });
}

/**
 * [V30 新增] 執行一個需要資料庫客戶端的操作，並自動管理連線的開啟與關閉。
 * @param {function(object): Promise<any>} callback - 要執行的函式，會接收一個 db client 作為參數。
 * @returns {Promise<any>} - 回傳 callback 函式的執行結果。
 */
async function withDatabaseClient(callback) {
  const client = await pgPool.connect();
  try {
    return await callback(client);
  } finally {
    if (client) client.release();
  }
}
/**
 * [V31.3 重構] 使用通用快取工具來讀取推播設定
 */
async function getNotificationStatus() {
    const cacheKey = 'notifications_enabled';
    const ttl = CONSTANTS.INTERVALS.NOTIFICATION_CACHE_DURATION_MS;
    // 步驟 1: 嘗試從快取中讀取
    const cachedStatus = simpleCache.get(cacheKey);
    if (cachedStatus !== null) {
        // 快取命中，直接回傳
        return cachedStatus;
    }

    // 步驟 2: 快取未命中，從資料庫讀取
    try {
        let isEnabled = true; // 預設值為 true，以防資料庫查詢失敗時卡住所有通知
        await withDatabaseClient(async (db) => {
            const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
            if (res.rows.length > 0) {
                isEnabled = res.rows[0].setting_value === 'true';
            }
        });
        // 步驟 3: 將從資料庫讀取到的新值寫入快取
        simpleCache.set(cacheKey, isEnabled, ttl);
        return isEnabled;
    } catch (err) {
        console.error('❌ 讀取推播設定失敗:', err);
        // 在發生錯誤時回傳一個安全的預設值
        return true;
    }
}

/**
 * [V24.0 新增] 將一個推播任務加入到資料庫佇列中
 * @param {string} recipientId - 收件人 User ID
 * @param {object|object[]} message - LINE 訊息物件或物件陣列
 * @param {Date} [sendAt=null] - 預計發送時間，若為 null 則立即發送
 */
async function enqueuePushTask(recipientId, message, sendAt = null) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  try {
    await withDatabaseClient(async (db) => {
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
    });
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  }
}
/**
 * [V31.1 新增] 將多個推播任務批次加入到資料庫佇列中
 * @param {Array<object>} tasks - 任務物件的陣列，每個物件應包含 { recipientId: string, message: object|object[] }
 */
async function enqueueBatchPushTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  // 與單一任務函式一樣，檢查系統推播設定
  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  // 只有在任務列表中包含系統管理員/老師時，才需要檢查推播開關
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return; // 如果過濾後沒有任務了，就直接返回
    }
  }

  try {
    const recipientIds = [];
    const messagePayloads = [];
    const sendTimestamps = [];
    const now = new Date().toISOString();
    tasksToEnqueue.forEach(task => {
      const messagePayload = Array.isArray(task.message) ? task.message : [task.message];
      const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
      if (validMessages.length > 0) {
        recipientIds.push(task.recipientId);
        messagePayloads.push(JSON.stringify(validMessages));
        sendTimestamps.push(now); // 所有批次任務使用相同的時間戳
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await withDatabaseClient(async (db) => {
      // 使用 unnest 進行高效的批次插入
      await db.query(
        `INSERT INTO tasks (recipient_id, message_payload, send_at)
         SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamp[])`,
        [recipientIds, messagePayloads, sendTimestamps]
      );
    });
  } catch (err) {
    console.error(`❌ enqueueBatchPushTasks 批次寫入任務失敗:`, err);
  }
}
/**
 /**
 * [V24.0] 取消超過 24 小時未付款的訂單
 * [V31.1] 優化為批次處理通知任務
 */
async function cancelExpiredPendingOrders() {
    try {
        await withDatabaseClient(async (client) => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * CONSTANTS.TIME.ONE_HOUR_IN_MS);
            const res = await client.query(
                "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
                [twentyFourHoursAgo]
            );

            if (res.rows.length > 0) {
                console.log(`🧹 已自動取消 ${res.rows.length} 筆逾時訂單。`);
                
                // 步驟 1: 使用 .map() 準備所有要發送的通知任務
                const notificationTasks = res.rows.map(order => {
                    const message = { 
                        type: 'text', 
                        text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` 
                    };
                    return {
                        recipientId: order.user_id,
                        message: message
                    };
                });
                
                // 步驟 2: 一次性將所有任務加入佇列
                await enqueueBatchPushTasks(notificationTasks).catch(e => {
                    console.error(`將批次逾時訂單取消通知加入佇列時失敗`);
                });
            }
        });
    } catch (err) {
        console.error("❌ 自動取消逾時訂單時發生錯誤:", err);
    }
}
 
/**
 * [V28.0 新增] 智慧回覆機制：取得使用者的待辦事項通知
 * @param {object} user - 使用者物件，包含 id 和 role
 * @returns {Promise<object>} - 一個包含待辦事項計數的物件
 */
async function getPendingNotificationsForUser(user) {
    const notifications = {};
    try {
        await withDatabaseClient(async (client) => {
            if (user.role === 'teacher') {
                const [newMessages, pendingPointOrders, pendingShopOrders] = await Promise.all([
                    client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'"),
                    client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'"),
                    client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
                ]);
                notifications.newMessages = parseInt(newMessages.rows[0].count, 10);
                notifications.pendingPointOrders = parseInt(pendingPointOrders.rows[0].count, 10);
                notifications.pendingShopOrders = parseInt(pendingShopOrders.rows[0].count, 10);
            } else if (user.role === 'admin') {
                const failedTasks = await client.query("SELECT COUNT(*) FROM failed_tasks");
                notifications.failedTasks = parseInt(failedTasks.rows[0].count, 10);
            } else if (user.role === 'student') {
                const unreadReplies = await client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [user.id]);
                notifications.unreadReplies = parseInt(unreadReplies.rows[0].count, 10);
            }
        });
    } catch (error) {
        console.error(`[getPendingNotifications] 查詢使用者 ${user.id} 的通知時發生錯誤:`, error);
    }
    return notifications;
}

// --- 資料庫輔助函式 (Database Helper Functions) ---

/**
 * [V33.0 新增] 執行一個資料庫查詢，並自動管理連線。
 * 此函式支援傳入一個已存在的 client (用於交易)，或自動建立新連線。
 * @param {function(object): Promise<any>} queryCallback - 要執行的查詢函式，會接收 db client 作為參數。
 * @param {object} [existingClient=null] - (可選) 一個已經存在的 pg client。
 * @returns {Promise<any>} - 回傳 queryCallback 的執行結果。
 */
async function executeDbQuery(queryCallback, existingClient = null) {
  // 如果沒有傳入現有的 client，則自己建立一個
  const client = existingClient || await pgPool.connect();
  try {
    // 執行傳入的查詢邏輯
    return await queryCallback(client);
  } finally {
    // 只有在 client 是這個函式自己建立的情況下，才釋放它
    if (!existingClient && client) {
      client.release();
    }
  }
}
async function generateUniqueCoursePrefix(dbClient) {
    return executeDbQuery(async (client) => {
        let prefix, isUnique = false;
        while (!isUnique) {
            const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            prefix = `${randomChar1}${randomChar2}`;
            const res = await client.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
            if (res.rows.length === 0) isUnique = true;
        }
        return prefix;
    }, dbClient);
}

async function getUser(userId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const userData = res.rows[0];
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        return userData;
    }, dbClient);
}

async function saveUser(user, dbClient) {
    return executeDbQuery(async (client) => {
        const historyJson = JSON.stringify(user.history || []);
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.picture_url || null, user.approved_by || null]
        );
    }, dbClient);
}

async function getCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        // [V42.1 修正] 確保回傳的課程物件包含 teacher_id
        return {
            id: row.id,
            title: row.title,
            time: row.time.toISOString(),
            capacity: row.capacity,
            points_cost: row.points_cost,
            students: row.students || [],
            waiting: row.waiting || [],
            teacher_id: row.teacher_id
        };
    }, dbClient);
}
async function saveCourse(course, dbClient) {
    return executeDbQuery(async (client) => {
        // [V35.0 修改] 新增 teacher_id 欄位
        await client.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, teacher_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) 
             DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7, teacher_id = $8`,
            [course.id, course.title, course.time, course.capacity, course.points_cost, course.students, course.waiting, course.teacher_id]
        );
    }, dbClient);
}

async function deleteCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
    }, dbClient);
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    return executeDbQuery(async (client) => {
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
    }, dbClient);
}

async function getProduct(productId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}
async function saveProduct(product, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, inventory = $5, status = $6 WHERE id = $7`,
            [product.name, product.description, product.price, product.image_url, product.inventory, product.status, product.id]
        );
    }, dbClient);
}

async function getProductOrder(orderUID, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM product_orders WHERE order_uid = $1', [orderUID]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}

async function saveProductOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE product_orders SET status = $1, updated_at = $2, teacher_notes = $3 WHERE id = $4`,
            [order.status, order.updated_at, order.teacher_notes, order.id]
        );
    }, dbClient);
}

async function saveOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
            [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp]
        );
    }, dbClient);
}

async function deleteOrder(orderId, dbClient) {
    return executeDbQuery(async (client) => {
      await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    }, dbClient);
}

async function cleanCoursesDB() {
    try {
        await executeDbQuery(async (client) => {
            const now = new Date();
            // 刪除一天前的課程
            const pastDate = new Date(now.getTime() - CONSTANTS.TIME.ONE_DAY_IN_MS);
            
            const result = await client.query(`DELETE FROM courses WHERE time < $1`, [pastDate]);
            
            if (result.rowCount > 0) {
              console.log(`🧹 定期清理：已成功移除 ${result.rowCount} 筆過期的課程。`);
            }
        });
    } catch (err) {
        console.error('❌ 定期清理過期課程時發生錯誤:', err);
    }
}

/**
 * [V27.6 新增] 共用的錯誤處理函式
 * @param {Error} error - 捕獲到的錯誤物件
 * @param {string} replyToken - 用於回覆的 token
 * @param {string} context - 錯誤發生的情境，例如 "查詢我的課程"
 */
async function handleError(error, replyToken, context = '未知操作') {
    console.error(`❌ 在執行 [${context}] 時發生錯誤:`, error.stack);
    try {
        if (replyToken) {
            await reply(replyToken, `抱歉，在執行 ${context} 時發生了預期外的錯誤，請稍後再試。`);
        }
    } catch (replyError) {
        console.error(`❌ 連錯誤回覆都失敗了:`, replyError.message);
    }
}
/**
 * [V31.2 新增] 將不同格式的內容轉換為 LINE 訊息物件陣列。
 * @param {string|object|Array<string|object>} content - 要發送的內容。
 * @returns {Array<object>} - 標準的 LINE 訊息物件陣列。
 */
function buildMessages(content) {
  const contentArray = Array.isArray(content) ? content : [content];
  
  return contentArray
    .filter(item => item !== null && item !== undefined) // 過濾掉無效內容
    .map(item => (typeof item === 'string' ? { type: 'text', text: item } : item));
}

/**
 * [V31.2 新增] 將 Quick Reply 選單附加到訊息陣列的最後一則訊息上。
 * @param {Array<object>} messages - 由 buildMessages 產生的訊息陣列。
 * @param {Array<object>|null} menu - Quick Reply 的項目陣列。
 * @returns {Array<object>} - 附加完 Quick Reply 的訊息陣列。
 */
function attachQuickReply(messages, menu) {
  if (!menu || !Array.isArray(menu) || menu.length === 0 || messages.length === 0) {
    return messages;
  }

  // 驗證並過濾有效的 Quick Reply 項目
  const validMenuItems = menu
    .slice(0, 13) // Quick Reply 最多支援 13 個項目
    .filter(item => item && item.type === 'action' && (item.action.type === 'message' || item.action.type === 'postback'));
  if (validMenuItems.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.quickReply) {
      lastMessage.quickReply = { items: [] };
    }
    lastMessage.quickReply.items.push(...validMenuItems);
  }

  return messages;
}
/**
 * [V31.2 重構] 透過組合輔助函式來回覆訊息，結構更清晰。
 */
async function reply(replyToken, content, menu = null) {
  // 步驟 1: 建立標準的訊息陣列
  let messages = buildMessages(content);
  // 步驟 2: 如果有選單，就附加 Quick Reply
  messages = attachQuickReply(messages, menu);
  // 如果最終沒有任何有效訊息，就直接返回，避免呼叫空的 API
  if (messages.length === 0) {
    console.log('[REPLY-DEBUG] 沒有有效的訊息可以發送，已取消操作。');
    return;
  }

  // 步驟 3: 執行 API 呼叫
  try {
    console.log(`[REPLY-DEBUG] 準備呼叫 client.replyMessage...`);
    const result = await client.replyMessage(replyToken, messages);
    console.log('[REPLY-DEBUG] client.replyMessage 呼叫已完成。');
    
    // API 錯誤的雙重檢查
    if (result && result.response && result.response.status >= 400) {
        console.error('‼️ API 呼叫回傳了非成功的狀態碼 ‼️', JSON.stringify(result.response.data, null, 2));
    }

  } catch (error) { 
      console.error('‼️ 在 reply 的 CATCH 中捕捉到 API 錯誤 ‼️');
      if (error.originalError && error.originalError.response && error.originalError.response.data) {
          console.error('【LINE API 回應的詳細錯誤】:', JSON.stringify(error.originalError.response.data, null, 2));
      } else {
          console.error('【捕獲到的基本錯誤訊息】:', error.message);
      }
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
/**
 * [V23.2 新增] 取得課程主標題，移除 "- 第 x 堂"
 * @param {string} fullTitle - 完整的課程標題
 * @returns {string} - 主標題
 */
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
        start: new Date(startDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString(),
        end: new Date(endDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString()
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
  if (!CONSTANTS.COMMANDS[upperCaseRole]) return null;
  const commandList = Object.values(CONSTANTS.COMMANDS[upperCaseRole]);
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
    const plansContent = CONSTANTS.PURCHASE_PLANS.flatMap((plan, index) => {
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
        if (index < CONSTANTS.PURCHASE_PLANS.length - 1) {
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

    const pendingOrder = await withDatabaseClient(async (client) => {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        return ordersRes.rows[0];
    });
    const bodyContents = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款待確認';
            cardColor = '#ff9e00';
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '❌ 訂單被退回';
            cardColor = '#d90429';
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
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
                        action: { type: 'postback', label: '➕ 購買點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.BUY_POINTS)}` }
                    },
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY)}` }
                    }
                ]
            }
        }
    };
}
/**
 * [V34.1 新增] 建立一個顯示老師個人資訊變更並請求確認的 Flex Message
 * @param {string} userId - 使用者的 ID
 * @param {object} newData - 一個包含待更新欄位和值的物件，例如 { name: '新名字' }
 */
async function buildProfileConfirmationMessage(userId, newData) {
    const fieldMap = { name: '姓名', bio: '簡介', image_url: '照片' };
    const updatedFields = Object.keys(newData).map(key => fieldMap[key] || key).join('、');

    const client = await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM teachers WHERE line_user_id = $1', [userId]);
        const currentProfile = res.rows[0] || { name: '新老師', bio: '尚未填寫簡介', image_url: null };
        const previewProfile = { ...currentProfile, ...newData };
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        
        return {
            type: 'flex',
            altText: `確認更新您的${updatedFields}`,
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `⚠️ 請確認更新內容`, weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#FFC107' },
                hero: { type: 'image', url: previewProfile.image_url || placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'md',
                    contents: [
                        { type: 'text', text: previewProfile.name, weight: 'bold', size: 'xl' },
                        { type: 'text', text: previewProfile.bio || '尚未填寫簡介', wrap: true, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: `✅ 確認更新${updatedFields}`, data: 'action=confirm_teacher_profile_update' } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            }
        };
    } finally {
        if (client) client.release();
    }
}

const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];
// --- 對話狀態管理 ---
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
const pendingTeacherProfileEdit = {};
// [V34.0 新增]
const pendingReportGeneration = {};
const pendingAnnouncementCreation = {};
const pendingAnnouncementDeletion = {};
const repliedTokens = new Set();
const pendingProductEdit = {};
const pendingInventoryAdjust = {};
const pendingManualAdjustSearch = {}; 
const pendingPointOrderSearch = {};
const pendingShopOrderSearch = {};
const userProfileCache = new Map();
const userLastInteraction = {}; // [V28.0 新增] 用於智慧回覆機制的 Session 追蹤
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
    pendingTeacherProfileEdit,
    pendingMessageSearchQuery,
    pendingManualAdjustSearch,
    pendingPointOrderSearch,
    pendingShopOrderSearch,
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
    return [{ type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }];
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
    }, CONSTANTS.INTERVALS.CONVERSATION_TIMEOUT_MS);
    conversationState[userId] = { ...conversationState[userId], timeoutId };
}
async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return { handled: false };
    let replyContent;

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
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

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數查詢」選單，點擊「❗ 匯款待處理」卡片中的按鈕來回報您的後五碼。\n\n⚠️提醒：為確保您的權益，請於24小時內完成匯款與回報，逾時訂單將會自動取消。`;

                const flexMenu = await buildPointsMenuFlex(userId);
                replyContent = [{ type: 'text', text: replyText }, flexMenu];

            } else {
                replyContent = '請點擊「✅ 確認購買」或「❌ 取消操作」。';
            }
            return { handled: true, reply: replyContent };
        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const wasSuccessful = await withDatabaseClient(async (client) => {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [order_id]);
                    if (orderRes.rows.length > 0) {
                        const order = orderRes.rows[0];
                        order.last_5_digits = text;
                        order.status = 'pending_confirmation';
                        order.timestamp = new Date().toISOString();
                        await saveOrder(order, client);
                        return true;
                    }
                    return false;
                });
                delete pendingPurchase[userId];
                if (wasSuccessful) {
                    const flexMenu = await buildPointsMenuFlex(userId);
                    replyContent = [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu];
                    
                    if (TEACHER_ID) {
                        const notifyMessage = { type: 'text', text: `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認點數訂單」審核。`};
                        await enqueuePushTask(TEACHER_ID, notifyMessage).catch(e => console.error(e));
                    }
                } else {
                    replyContent = '找不到您的訂單，請重新操作。';
                }
            } else {
                replyContent = {
                    type: 'text',
                    text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。',
                    quickReply: { items: getCancelMenu() }
                };
            }
            return { handled: true, reply: replyContent };
    }
    return { handled: false };
}

// --- Teacher Command Handlers (V34.0 Refactor) ---

async function showCourseManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '課程與師資管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '🗓️ 課程與師資管理', color: '#ffffff', weight: 'bold', size: 'lg'}], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'text', text: '課程功能', size: 'sm', color: '#888888', weight: 'bold' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 新增課程系列', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 課程狀態查詢', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 管理已開課程', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES)}` } },
                    { type: 'separator', margin: 'xl' },
                    { type: 'text', text: '師資功能', size: 'sm', color: '#888888', weight: 'bold', margin: 'lg' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📋 師資團隊', data: 'action=list_all_teachers&page=1' } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '👤 個人資訊', data: 'action=manage_personal_profile' } }
                ] 
            } 
        } 
    };
}
//  ####################################
// index.js - V35.0 (歷史查詢功能擴充)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto =require('crypto');
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
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;
const CONSTANTS = {
  TIME: {
    ONE_DAY_IN_MS: 86400000,
    EIGHT_HOURS_IN_MS: 28800000,
    ONE_HOUR_IN_MS: 3600000,
  },
  INTERVALS: {
    PING_INTERVAL_MS: 1000 * 60 * 5,
    CONVERSATION_TIMEOUT_MS: 1000 * 60 * 5,
    NOTIFICATION_CACHE_DURATION_MS: 1000 * 30,
    SESSION_TIMEOUT_MS: 1000 * 60 * 5, // [V28.0 新增] 對話階段超時時間 (5分鐘)
  },
  PAGINATION_SIZE: 9,
  PURCHASE_PLANS: [
    { points: 5, amount: 500, label: '5 點 (500元)' },
    { points: 10, amount: 1000, label: '10 點 (1000元)' },
    { points: 20, amount: 2000, label: '20 點 (2000元)' },
    { points: 30, amount: 3000, label: '30 點 (3000元)' },
    { points: 50, amount: 5000, label: '50 點 (5000元)' },
  ],
  BANK_INFO: {
    accountName: process.env.BANK_ACCOUNT_NAME,
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER,
  },
  COMMANDS: {
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
        POINT_ORDER_HISTORY: '@查詢點數訂單',
      STUDENT_MANAGEMENT: '@學員管理',
        SEARCH_STUDENT: '@查詢學員',
        VIEW_MESSAGES: '@查看未回覆留言',
        MESSAGE_SEARCH: '@查詢歷史留言',
      ANNOUNCEMENT_MANAGEMENT: '@公告管理',
        ADD_ANNOUNCEMENT: '@頒佈新公告',
        DELETE_ANNOUNCEMENT: '@刪除舊公告',
      SHOP_MANAGEMENT: '@商城管理',
        ADD_PRODUCT: '@上架新商品',
        VIEW_PRODUCTS: '@商品管理',
        MANAGE_AVAILABLE_PRODUCTS: '@管理販售中商品',
        MANAGE_UNAVAILABLE_PRODUCTS: '@管理已下架商品',
        SHOP_ORDER_MANAGEMENT: '@訂單管理',
        SHOP_ORDER_HISTORY: '@查詢商城訂單',
      REPORT: '@統計報表',
        COURSE_REPORT: '@課程報表',
        ORDER_REPORT: '@訂單報表',
        POINT_REPORT: '@點數報表',
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
      BOOK_COURSE: '@預約課程',
      MY_COURSES: '@我的課程',
      SHOP: '@活動商城',
      POINTS: '@點數查詢',
      LATEST_ANNOUNCEMENT: '@最新公告',
      CONTACT_US: '@聯絡我們',
      VIEW_SHOP_PRODUCTS: '@瀏覽商品',
      EXCHANGE_HISTORY: '@兌換紀錄',
      CHECK_POINTS: '@查看剩餘點數',
      BUY_POINTS: '@購買點數',
      PURCHASE_HISTORY: '@購點紀錄',
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
  }
};
// =======================================================
// [V31.3 新增] 通用快取工具
// =======================================================
const simpleCache = {
  _cache: new Map(),

  /**
   * 設定一筆快取資料
   * @param {string} key - 快取的鍵
   * @param {*} value - 要快取的值
   * @param {number} ttlMs - 快取的存活時間 (毫秒)
   */
  set(key, value, ttlMs) {
    const expires = Date.now() + ttlMs;
    this._cache.set(key, { value, expires });
  },

  /**
   * 讀取一筆快取資料
   * @param {string} key - 快取的鍵
   * @returns {*} - 如果快取存在且未過期，則回傳其值，否則回傳 null
   */
  get(key) {
    const entry = this._cache.get(key);
    // 檢查是否存在，且尚未過期
    if (entry && Date.now() < entry.expires) {
      return entry.value;
    }
    // 如果已過期，可以順便清除它 (可選)
    if (entry) {
        this._cache.delete(key);
    }
    return null;
  },

  /**
   * 清除一筆指定的快取
   * @param {string} key - 快取的鍵
   */
  clear(key) {
    this._cache.delete(key);
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
/**
 * [V29.1 新增] 建立一個通用的、包含分頁功能的 Flex Carousel 訊息。
 * @param {object} options - 設定物件。
 * @param {string} options.altText - Flex Message 的替代文字。
 * @param {string} options.baseAction - Postback 的基本動作字串，例如 'action=view_history'。
 * @param {number} options.page - 當前頁碼。
 * @param {string} options.dataQuery - 要執行的 SQL 查詢，必須包含 LIMIT 和 OFFSET 的參數位置 (例如 $2, $3)。
 * @param {Array<any>} options.queryParams - SQL 查詢的參數陣列 (不含 LIMIT 和 OFFSET 的值)。
 * @param {function(object): object} options.mapRowToBubble - 一個將資料庫 row 轉換為 Flex Bubble 物件的函式。
 * @param {string} options.noDataMessage - 當第一頁沒有任何資料時顯示的文字訊息。
 * @param {string} [options.customParams=''] - (可選) 要附加到 postback data 的額外參數。
 * @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息。
 */
async function createPaginatedCarousel(options) {
  const {
    altText,
    baseAction,
    page,
    dataQuery,
    queryParams,
    mapRowToBubble,
    noDataMessage,
    customParams = ''
  } = options;
  const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;

  return withDatabaseClient(async (client) => {
    // 組合查詢參數，將分頁參數加在最後
    const finalQueryParams = [...queryParams, CONSTANTS.PAGINATION_SIZE + 1, offset];
    const res = await client.query(dataQuery, finalQueryParams);

    const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
    const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

    if (pageRows.length === 0 && page === 1) {
      return noDataMessage;
    }
    if (pageRows.length === 0) {
      return '沒有更多資料了。';
    }

    const bubbles = pageRows.map(mapRowToBubble);

    const paginationBubble = createPaginationBubble(baseAction, page, hasNextPage, customParams);
    if (paginationBubble) {
      bubbles.push(paginationBubble);
    }

    return {
      type: 'flex',
      altText: altText,
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
  });
}

/**
 * [V30 新增] 執行一個需要資料庫客戶端的操作，並自動管理連線的開啟與關閉。
 * @param {function(object): Promise<any>} callback - 要執行的函式，會接收一個 db client 作為參數。
 * @returns {Promise<any>} - 回傳 callback 函式的執行結果。
 */
async function withDatabaseClient(callback) {
  const client = await pgPool.connect();
  try {
    return await callback(client);
  } finally {
    if (client) client.release();
  }
}
/**
 * [V31.3 重構] 使用通用快取工具來讀取推播設定
 */
async function getNotificationStatus() {
    const cacheKey = 'notifications_enabled';
    const ttl = CONSTANTS.INTERVALS.NOTIFICATION_CACHE_DURATION_MS;
    // 步驟 1: 嘗試從快取中讀取
    const cachedStatus = simpleCache.get(cacheKey);
    if (cachedStatus !== null) {
        // 快取命中，直接回傳
        return cachedStatus;
    }

    // 步驟 2: 快取未命中，從資料庫讀取
    try {
        let isEnabled = true; // 預設值為 true，以防資料庫查詢失敗時卡住所有通知
        await withDatabaseClient(async (db) => {
            const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
            if (res.rows.length > 0) {
                isEnabled = res.rows[0].setting_value === 'true';
            }
        });
        // 步驟 3: 將從資料庫讀取到的新值寫入快取
        simpleCache.set(cacheKey, isEnabled, ttl);
        return isEnabled;
    } catch (err) {
        console.error('❌ 讀取推播設定失敗:', err);
        // 在發生錯誤時回傳一個安全的預設值
        return true;
    }
}

/**
 * [V24.0 新增] 將一個推播任務加入到資料庫佇列中
 * @param {string} recipientId - 收件人 User ID
 * @param {object|object[]} message - LINE 訊息物件或物件陣列
 * @param {Date} [sendAt=null] - 預計發送時間，若為 null 則立即發送
 */
async function enqueuePushTask(recipientId, message, sendAt = null) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  try {
    await withDatabaseClient(async (db) => {
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
    });
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  }
}
/**
 * [V31.1 新增] 將多個推播任務批次加入到資料庫佇列中
 * @param {Array<object>} tasks - 任務物件的陣列，每個物件應包含 { recipientId: string, message: object|object[] }
 */
async function enqueueBatchPushTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  // 與單一任務函式一樣，檢查系統推播設定
  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  // 只有在任務列表中包含系統管理員/老師時，才需要檢查推播開關
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return; // 如果過濾後沒有任務了，就直接返回
    }
  }

  try {
    const recipientIds = [];
    const messagePayloads = [];
    const sendTimestamps = [];
    const now = new Date().toISOString();
    tasksToEnqueue.forEach(task => {
      const messagePayload = Array.isArray(task.message) ? task.message : [task.message];
      const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
      if (validMessages.length > 0) {
        recipientIds.push(task.recipientId);
        messagePayloads.push(JSON.stringify(validMessages));
        sendTimestamps.push(now); // 所有批次任務使用相同的時間戳
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await withDatabaseClient(async (db) => {
      // 使用 unnest 進行高效的批次插入
      await db.query(
        `INSERT INTO tasks (recipient_id, message_payload, send_at)
         SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamp[])`,
        [recipientIds, messagePayloads, sendTimestamps]
      );
    });
  } catch (err) {
    console.error(`❌ enqueueBatchPushTasks 批次寫入任務失敗:`, err);
  }
}
/**
 /**
 * [V24.0] 取消超過 24 小時未付款的訂單
 * [V31.1] 優化為批次處理通知任務
 */
async function cancelExpiredPendingOrders() {
    try {
        await withDatabaseClient(async (client) => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * CONSTANTS.TIME.ONE_HOUR_IN_MS);
            const res = await client.query(
                "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
                [twentyFourHoursAgo]
            );

            if (res.rows.length > 0) {
                console.log(`🧹 已自動取消 ${res.rows.length} 筆逾時訂單。`);
                
                // 步驟 1: 使用 .map() 準備所有要發送的通知任務
                const notificationTasks = res.rows.map(order => {
                    const message = { 
                        type: 'text', 
                        text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` 
                    };
                    return {
                        recipientId: order.user_id,
                        message: message
                    };
                });
                
                // 步驟 2: 一次性將所有任務加入佇列
                await enqueueBatchPushTasks(notificationTasks).catch(e => {
                    console.error(`將批次逾時訂單取消通知加入佇列時失敗`);
                });
            }
        });
    } catch (err) {
        console.error("❌ 自動取消逾時訂單時發生錯誤:", err);
    }
}
 
/**
 * [V28.0 新增] 智慧回覆機制：取得使用者的待辦事項通知
 * @param {object} user - 使用者物件，包含 id 和 role
 * @returns {Promise<object>} - 一個包含待辦事項計數的物件
 */
async function getPendingNotificationsForUser(user) {
    const notifications = {};
    try {
        await withDatabaseClient(async (client) => {
            if (user.role === 'teacher') {
                const [newMessages, pendingPointOrders, pendingShopOrders] = await Promise.all([
                    client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'"),
                    client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'"),
                    client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
                ]);
                notifications.newMessages = parseInt(newMessages.rows[0].count, 10);
                notifications.pendingPointOrders = parseInt(pendingPointOrders.rows[0].count, 10);
                notifications.pendingShopOrders = parseInt(pendingShopOrders.rows[0].count, 10);
            } else if (user.role === 'admin') {
                const failedTasks = await client.query("SELECT COUNT(*) FROM failed_tasks");
                notifications.failedTasks = parseInt(failedTasks.rows[0].count, 10);
            } else if (user.role === 'student') {
                const unreadReplies = await client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [user.id]);
                notifications.unreadReplies = parseInt(unreadReplies.rows[0].count, 10);
            }
        });
    } catch (error) {
        console.error(`[getPendingNotifications] 查詢使用者 ${user.id} 的通知時發生錯誤:`, error);
    }
    return notifications;
}

// --- 資料庫輔助函式 (Database Helper Functions) ---

/**
 * [V33.0 新增] 執行一個資料庫查詢，並自動管理連線。
 * 此函式支援傳入一個已存在的 client (用於交易)，或自動建立新連線。
 * @param {function(object): Promise<any>} queryCallback - 要執行的查詢函式，會接收 db client 作為參數。
 * @param {object} [existingClient=null] - (可選) 一個已經存在的 pg client。
 * @returns {Promise<any>} - 回傳 queryCallback 的執行結果。
 */
async function executeDbQuery(queryCallback, existingClient = null) {
  // 如果沒有傳入現有的 client，則自己建立一個
  const client = existingClient || await pgPool.connect();
  try {
    // 執行傳入的查詢邏輯
    return await queryCallback(client);
  } finally {
    // 只有在 client 是這個函式自己建立的情況下，才釋放它
    if (!existingClient && client) {
      client.release();
    }
  }
}
async function generateUniqueCoursePrefix(dbClient) {
    return executeDbQuery(async (client) => {
        let prefix, isUnique = false;
        while (!isUnique) {
            const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            prefix = `${randomChar1}${randomChar2}`;
            const res = await client.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
            if (res.rows.length === 0) isUnique = true;
        }
        return prefix;
    }, dbClient);
}

async function getUser(userId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const userData = res.rows[0];
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        return userData;
    }, dbClient);
}

async function saveUser(user, dbClient) {
    return executeDbQuery(async (client) => {
        const historyJson = JSON.stringify(user.history || []);
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.picture_url || null, user.approved_by || null]
        );
    }, dbClient);
}

async function getCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        // [V42.1 修正] 確保回傳的課程物件包含 teacher_id
        return {
            id: row.id,
            title: row.title,
            time: row.time.toISOString(),
            capacity: row.capacity,
            points_cost: row.points_cost,
            students: row.students || [],
            waiting: row.waiting || [],
            teacher_id: row.teacher_id
        };
    }, dbClient);
}
async function saveCourse(course, dbClient) {
    return executeDbQuery(async (client) => {
        // [V35.0 修改] 新增 teacher_id 欄位
        await client.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, teacher_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) 
             DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7, teacher_id = $8`,
            [course.id, course.title, course.time, course.capacity, course.points_cost, course.students, course.waiting, course.teacher_id]
        );
    }, dbClient);
}

async function deleteCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
    }, dbClient);
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    return executeDbQuery(async (client) => {
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
    }, dbClient);
}

async function getProduct(productId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}
async function saveProduct(product, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, inventory = $5, status = $6 WHERE id = $7`,
            [product.name, product.description, product.price, product.image_url, product.inventory, product.status, product.id]
        );
    }, dbClient);
}

async function getProductOrder(orderUID, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM product_orders WHERE order_uid = $1', [orderUID]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}

async function saveProductOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE product_orders SET status = $1, updated_at = $2, teacher_notes = $3 WHERE id = $4`,
            [order.status, order.updated_at, order.teacher_notes, order.id]
        );
    }, dbClient);
}

async function saveOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
            [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp]
        );
    }, dbClient);
}

async function deleteOrder(orderId, dbClient) {
    return executeDbQuery(async (client) => {
      await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    }, dbClient);
}

async function cleanCoursesDB() {
    try {
        await executeDbQuery(async (client) => {
            const now = new Date();
            // 刪除一天前的課程
            const pastDate = new Date(now.getTime() - CONSTANTS.TIME.ONE_DAY_IN_MS);
            
            const result = await client.query(`DELETE FROM courses WHERE time < $1`, [pastDate]);
            
            if (result.rowCount > 0) {
              console.log(`🧹 定期清理：已成功移除 ${result.rowCount} 筆過期的課程。`);
            }
        });
    } catch (err) {
        console.error('❌ 定期清理過期課程時發生錯誤:', err);
    }
}

/**
 * [V27.6 新增] 共用的錯誤處理函式
 * @param {Error} error - 捕獲到的錯誤物件
 * @param {string} replyToken - 用於回覆的 token
 * @param {string} context - 錯誤發生的情境，例如 "查詢我的課程"
 */
async function handleError(error, replyToken, context = '未知操作') {
    console.error(`❌ 在執行 [${context}] 時發生錯誤:`, error.stack);
    try {
        if (replyToken) {
            await reply(replyToken, `抱歉，在執行 ${context} 時發生了預期外的錯誤，請稍後再試。`);
        }
    } catch (replyError) {
        console.error(`❌ 連錯誤回覆都失敗了:`, replyError.message);
    }
}
/**
 * [V31.2 新增] 將不同格式的內容轉換為 LINE 訊息物件陣列。
 * @param {string|object|Array<string|object>} content - 要發送的內容。
 * @returns {Array<object>} - 標準的 LINE 訊息物件陣列。
 */
function buildMessages(content) {
  const contentArray = Array.isArray(content) ? content : [content];
  
  return contentArray
    .filter(item => item !== null && item !== undefined) // 過濾掉無效內容
    .map(item => (typeof item === 'string' ? { type: 'text', text: item } : item));
}

/**
 * [V31.2 新增] 將 Quick Reply 選單附加到訊息陣列的最後一則訊息上。
 * @param {Array<object>} messages - 由 buildMessages 產生的訊息陣列。
 * @param {Array<object>|null} menu - Quick Reply 的項目陣列。
 * @returns {Array<object>} - 附加完 Quick Reply 的訊息陣列。
 */
function attachQuickReply(messages, menu) {
  if (!menu || !Array.isArray(menu) || menu.length === 0 || messages.length === 0) {
    return messages;
  }

  // 驗證並過濾有效的 Quick Reply 項目
  const validMenuItems = menu
    .slice(0, 13) // Quick Reply 最多支援 13 個項目
    .filter(item => item && item.type === 'action' && (item.action.type === 'message' || item.action.type === 'postback'));
  if (validMenuItems.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.quickReply) {
      lastMessage.quickReply = { items: [] };
    }
    lastMessage.quickReply.items.push(...validMenuItems);
  }

  return messages;
}
/**
 * [V31.2 重構] 透過組合輔助函式來回覆訊息，結構更清晰。
 */
async function reply(replyToken, content, menu = null) {
  // 步驟 1: 建立標準的訊息陣列
  let messages = buildMessages(content);
  // 步驟 2: 如果有選單，就附加 Quick Reply
  messages = attachQuickReply(messages, menu);
  // 如果最終沒有任何有效訊息，就直接返回，避免呼叫空的 API
  if (messages.length === 0) {
    console.log('[REPLY-DEBUG] 沒有有效的訊息可以發送，已取消操作。');
    return;
  }

  // 步驟 3: 執行 API 呼叫
  try {
    console.log(`[REPLY-DEBUG] 準備呼叫 client.replyMessage...`);
    const result = await client.replyMessage(replyToken, messages);
    console.log('[REPLY-DEBUG] client.replyMessage 呼叫已完成。');
    
    // API 錯誤的雙重檢查
    if (result && result.response && result.response.status >= 400) {
        console.error('‼️ API 呼叫回傳了非成功的狀態碼 ‼️', JSON.stringify(result.response.data, null, 2));
    }

  } catch (error) { 
      console.error('‼️ 在 reply 的 CATCH 中捕捉到 API 錯誤 ‼️');
      if (error.originalError && error.originalError.response && error.originalError.response.data) {
          console.error('【LINE API 回應的詳細錯誤】:', JSON.stringify(error.originalError.response.data, null, 2));
      } else {
          console.error('【捕獲到的基本錯誤訊息】:', error.message);
      }
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
/**
 * [V23.2 新增] 取得課程主標題，移除 "- 第 x 堂"
 * @param {string} fullTitle - 完整的課程標題
 * @returns {string} - 主標題
 */
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
        start: new Date(startDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString(),
        end: new Date(endDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString()
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
  if (!CONSTANTS.COMMANDS[upperCaseRole]) return null;
  const commandList = Object.values(CONSTANTS.COMMANDS[upperCaseRole]);
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
    const plansContent = CONSTANTS.PURCHASE_PLANS.flatMap((plan, index) => {
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
        if (index < CONSTANTS.PURCHASE_PLANS.length - 1) {
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

    const pendingOrder = await withDatabaseClient(async (client) => {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        return ordersRes.rows[0];
    });
    const bodyContents = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款待確認';
            cardColor = '#ff9e00';
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '❌ 訂單被退回';
            cardColor = '#d90429';
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
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
                        action: { type: 'postback', label: '➕ 購買點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.BUY_POINTS)}` }
                    },
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY)}` }
                    }
                ]
            }
        }
    };
}
/**
 * [V34.1 新增] 建立一個顯示老師個人資訊變更並請求確認的 Flex Message
 * @param {string} userId - 使用者的 ID
 * @param {object} newData - 一個包含待更新欄位和值的物件，例如 { name: '新名字' }
 */
async function buildProfileConfirmationMessage(userId, newData) {
    const fieldMap = { name: '姓名', bio: '簡介', image_url: '照片' };
    const updatedFields = Object.keys(newData).map(key => fieldMap[key] || key).join('、');

    const client = await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM teachers WHERE line_user_id = $1', [userId]);
        const currentProfile = res.rows[0] || { name: '新老師', bio: '尚未填寫簡介', image_url: null };
        const previewProfile = { ...currentProfile, ...newData };
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        
        return {
            type: 'flex',
            altText: `確認更新您的${updatedFields}`,
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `⚠️ 請確認更新內容`, weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#FFC107' },
                hero: { type: 'image', url: previewProfile.image_url || placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'md',
                    contents: [
                        { type: 'text', text: previewProfile.name, weight: 'bold', size: 'xl' },
                        { type: 'text', text: previewProfile.bio || '尚未填寫簡介', wrap: true, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: `✅ 確認更新${updatedFields}`, data: 'action=confirm_teacher_profile_update' } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            }
        };
    } finally {
        if (client) client.release();
    }
}

const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];
// --- 對話狀態管理 ---
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
const pendingTeacherProfileEdit = {};
// [V34.0 新增]
const pendingReportGeneration = {};
const pendingAnnouncementCreation = {};
const pendingAnnouncementDeletion = {};
const repliedTokens = new Set();
const pendingProductEdit = {};
const pendingInventoryAdjust = {};
const pendingManualAdjustSearch = {}; 
const pendingPointOrderSearch = {};
const pendingShopOrderSearch = {};
const userProfileCache = new Map();
const userLastInteraction = {}; // [V28.0 新增] 用於智慧回覆機制的 Session 追蹤
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
    pendingTeacherProfileEdit,
    pendingMessageSearchQuery,
    pendingManualAdjustSearch,
    pendingPointOrderSearch,
    pendingShopOrderSearch,
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
    return [{ type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }];
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
    }, CONSTANTS.INTERVALS.CONVERSATION_TIMEOUT_MS);
    conversationState[userId] = { ...conversationState[userId], timeoutId };
}
async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return { handled: false };
    let replyContent;

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
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

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數查詢」選單，點擊「❗ 匯款待處理」卡片中的按鈕來回報您的後五碼。\n\n⚠️提醒：為確保您的權益，請於24小時內完成匯款與回報，逾時訂單將會自動取消。`;

                const flexMenu = await buildPointsMenuFlex(userId);
                replyContent = [{ type: 'text', text: replyText }, flexMenu];

            } else {
                replyContent = '請點擊「✅ 確認購買」或「❌ 取消操作」。';
            }
            return { handled: true, reply: replyContent };
        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const wasSuccessful = await withDatabaseClient(async (client) => {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [order_id]);
                    if (orderRes.rows.length > 0) {
                        const order = orderRes.rows[0];
                        order.last_5_digits = text;
                        order.status = 'pending_confirmation';
                        order.timestamp = new Date().toISOString();
                        await saveOrder(order, client);
                        return true;
                    }
                    return false;
                });
                delete pendingPurchase[userId];
                if (wasSuccessful) {
                    const flexMenu = await buildPointsMenuFlex(userId);
                    replyContent = [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu];
                    
                    if (TEACHER_ID) {
                        const notifyMessage = { type: 'text', text: `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認點數訂單」審核。`};
                        await enqueuePushTask(TEACHER_ID, notifyMessage).catch(e => console.error(e));
                    }
                } else {
                    replyContent = '找不到您的訂單，請重新操作。';
                }
            } else {
                replyContent = {
                    type: 'text',
                    text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。',
                    quickReply: { items: getCancelMenu() }
                };
            }
            return { handled: true, reply: replyContent };
    }
    return { handled: false };
}

// --- Teacher Command Handlers (V34.0 Refactor) ---

async function showCourseManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '課程與師資管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '🗓️ 課程與師資管理', color: '#ffffff', weight: 'bold', size: 'lg'}], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'text', text: '課程功能', size: 'sm', color: '#888888', weight: 'bold' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 新增課程系列', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 課程狀態查詢', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 管理已開課程', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES)}` } },
                    { type: 'separator', margin: 'xl' },
                    { type: 'text', text: '師資功能', size: 'sm', color: '#888888', weight: 'bold', margin: 'lg' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📋 師資團隊', data: 'action=list_all_teachers&page=1' } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '👤 個人資訊', data: 'action=manage_personal_profile' } }
                ] 
            } 
        } 
    };
}

async function startAddCourseSeries(event, user) {
    const userId = user.id;
    pendingCourseCreation[userId] = { step: 'await_title' };
    setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '新增課程逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showManageOpenCourses(event, user) {
    return showCourseSeries(1);
}

async function showCourseInquiry(event, user) {
    return showCourseRosterSummary(1);
}

async function showPointManagementMenu(event, user) {
    const pendingCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingOrdersLabel = '✅ 確認處理訂單';
    if (pendingCount > 0) { 
        pendingOrdersLabel = `✅ 確認處理訂單 (${pendingCount})`;
    }
    
    return { 
        type: 'flex', 
        altText: '點數管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '💎 點數管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingOrdersLabel, data: `action=view_pending_orders_page&page=1` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✍️ 手動調整點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢調整紀錄', data: `action=select_adjust_history_view_type` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_point_history_view_type` } }
                ] 
            } 
        } 
    };
}


async function showPendingPointOrders(event, user) {
    return showPendingOrders(1);
}

async function showStudentManagementMenu(event, user) {
    const unreadCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let unreadLabel = '💬 查看未回覆留言';
    if (unreadCount > 0) { 
        unreadLabel += ` (${unreadCount})`;
    }

    return { 
        type: 'flex', 
        altText: '學員管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '👤 學員管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 查詢學員', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: unreadLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史留言', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MESSAGE_SEARCH)}` } } 
                ] 
            } 
        } 
    };
}

async function startStudentSearch(event, user) {
    const userId = user.id;
    pendingStudentSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => { 
        if (pendingStudentSearchQuery[u]) { 
            delete pendingStudentSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢學員逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showUnreadTeacherMessages(event, user) {
    return showUnreadMessages(1);
}

async function startMessageSearch(event, user) {
    const userId = user.id;
    pendingMessageSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => { 
        if (pendingMessageSearchQuery[u]) { 
            delete pendingMessageSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢歷史留言逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢的學員姓名或留言關鍵字：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '公告管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📢 公告管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 頒佈新公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🗑️ 刪除舊公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT)}` } } 
                ] 
            } 
        } 
    };
}
async function startAddAnnouncement(event, user) {
    const userId = user.id;
    pendingAnnouncementCreation[userId] = { step: 'await_content' };
    setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '頒佈公告操作逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入要頒佈的公告內容：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementsForDeletionList(event, user) {
    return showAnnouncementsForDeletion(1);
}

async function showShopManagementMenu(event, user) {
    const pendingShopOrdersCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingShopOrdersLabel = '📋 查看待處理訂單';
    if (pendingShopOrdersCount > 0) { 
        pendingShopOrdersLabel += ` (${pendingShopOrdersCount})`;
    }

    return { 
        type: 'flex', 
        altText: '商城管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [ { type: 'text', text: '🛍️ 商城管理', weight: 'bold', size: 'lg', color: '#FFFFFF' } ], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 上架新商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🛒 管理販售中商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 管理已下架商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS)}` } }, 
                    { type: 'separator', margin: 'md'}, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingShopOrdersLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_shop_history_view_type` } }
                ] 
            } 
        } 
    };
}

async function startAddProduct(event, user) {
    const userId = user.id;
    pendingProductCreation[userId] = { step: 'await_name' };
    setupConversationTimeout(userId, pendingProductCreation, 'pendingProductCreation', u => { 
        const timeoutMessage = { type: 'text', text: '上架商品操作逾時，自動取消。' }; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新商品的名稱：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAvailableProductsList(event, user) {
    return showProductManagementList(1, 'available');
}

async function showUnavailableProductsList(event, user) {
    return showProductManagementList(1, 'unavailable');
}

async function showShopOrderManagement(event, user) {
    return showPendingShopOrders(1);
}
async function showReportMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '統計報表', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📊 統計報表', weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📈 課程報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💰 訂單報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💎 點數報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.POINT_REPORT)}` } } 
                ] 
            } 
        } 
    };
}

async function showTimePeriodMenuForReport(event, user) {
    const text = event.message.text.trim();
    const reportType = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? 'course' : 'order';
    const title = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? '課程報表' : '訂單報表';
    return { 
        type: 'flex', 
        altText: '選擇時間週期', 
        contents: { 
            type: 'bubble', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#52b69a' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'sm', 
                contents: [ 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本週', data: `action=generate_report&type=${reportType}&period=week` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本月', data: `action=generate_report&type=${reportType}&period=month` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本季', data: `action=generate_report&type=${reportType}&period=quarter` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '今年', data: `action=generate_report&type=${reportType}&period=year` } }, 
                ] 
            }, 
            footer: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '請選擇要查詢的時間區間', size: 'sm', color: '#AAAAAA', align: 'center'}] 
            } 
        } 
    };
}

async function generatePointReport(event, user) {
    const userId = user.id;
    const generateReportTask = async () => {
        return withDatabaseClient(async (client) => {
            const usersRes = await client.query(`SELECT name, points FROM users WHERE role = 'student' ORDER BY points DESC`); 
            const students = usersRes.rows;
            if (students.length === 0) { 
                return '目前沒有任何學員資料可供分析。'; 
            }
            const totalPoints = students.reduce((sum, s) => sum + s.points, 0); 
            const averagePoints = (totalPoints / students.length).toFixed(2);
            const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n'); 
            const zeroPointStudents = students.filter(s => s.points === 0).length;
            return `💎 全體學員點數報告 💎\n\n總學員數：${students.length} 人\n點數總計：${totalPoints} 點\n平均持有：${averagePoints} 點/人\n零點學員：${zeroPointStudents} 人\n\n👑 點數持有 Top 5：\n${top5}`;
        });
    };

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));
    try {
        const result = await Promise.race([generateReportTask(), timeoutPromise]);
        if (result === 'timeout') {
            (async () => {
                const reportText = await generateReportTask();
                await enqueuePushTask(userId, { type: 'text', text: reportText });
            })();
            return '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。';
        } else { 
            return result;
        }
    } catch (err) { 
        console.error('❌ 即時生成點數報表失敗:', err);
        return '❌ 產生報表時發生錯誤，請稍後再試。'; 
    }
}

async function startManualAdjust(event, user) {
    const userId = user.id;
    pendingManualAdjust[userId] = { step: 'await_student_search' };
    setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => { 
        const timeoutMessage = { type: 'text', text: '手動調整點數逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入您想調整點數的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}
// --- Teacher Command Map (V34.0 Refactor) ---

const teacherCommandMap = {
    [CONSTANTS.COMMANDS.TEACHER.COURSE_MANAGEMENT]: showCourseManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES]: startAddCourseSeries,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES]: showManageOpenCourses,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY]: showCourseInquiry,
    [CONSTANTS.COMMANDS.TEACHER.POINT_MANAGEMENT]: showPointManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_POINT_ORDERS]: showPendingPointOrders,
    [CONSTANTS.COMMANDS.TEACHER.STUDENT_MANAGEMENT]: showStudentManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT]: startStudentSearch,
    [CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES]: showUnreadTeacherMessages,
    [CONSTANTS.COMMANDS.TEACHER.MESSAGE_SEARCH]: startMessageSearch,
    [CONSTANTS.COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT]: showAnnouncementManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT]: startAddAnnouncement,
    [CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT]: showAnnouncementsForDeletionList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_MANAGEMENT]: showShopManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT]: startAddProduct,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS]: showAvailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS]: showUnavailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT]: showShopOrderManagement,
    [CONSTANTS.COMMANDS.TEACHER.REPORT]: showReportMenu,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.POINT_REPORT]: generatePointReport,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_ORDERS]: showPendingPointOrders, // Alias
    [CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS]: startManualAdjust,
};
function handleUnknownTeacherCommand(text) {
    let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'teacher');
        if (closestCommand) {
            teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
        } else {
            teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
        }
    }
    return teacherSuggestion;
}

// --- Main Command Handlers ---
async function getUserNames(userIds, dbClient) {
    if (!userIds || userIds.length === 0) {
        return new Map();
    }
    const usersRes = await dbClient.query("SELECT id, name FROM users WHERE id = ANY($1::text[])", [userIds]);
    return new Map(usersRes.rows.map(u => [u.id, u.name]));
}

async function showFailedTasks(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT * FROM failed_tasks ORDER BY failed_at DESC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );
        
        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTasks = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageTasks.length === 0 && page === 1) {
            return '✅ 太好了！目前沒有任何失敗的任務。';
        }
        if (pageTasks.length === 0) {
            return '沒有更多失敗的任務了。';
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
    });
}

async function showSystemStatus() {
  return withDatabaseClient(async (db) => {
    const [pendingRes, processingRes, failedRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'processing'"),
      db.query("SELECT COUNT(*) FROM failed_tasks")
    ]);

    const pendingCount = pendingRes.rows[0].count;
    const processingCount = processingRes.rows[0].count;
    const failedCount = failedRes.rows[0].count;

    const statusText = `
⚙️ 背景系統狀態 ⚙️

- 待處理任務: ${pendingCount} 個
- 正在處理中: ${processingCount} 個
- 失敗任務(DLQ): ${failedCount} 個

ℹ️ 「待處理任務」是系統即將要發送的排程訊息 (如課程提醒)。若「失敗任務」數量持續增加，請檢查 Worker 紀錄。
    `.trim();

    return statusText;
  });
}

async function showTeacherListForRemoval(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT id, name, picture_url FROM users WHERE role = 'teacher' ORDER BY name ASC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTeachers = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

   
        if (pageTeachers.length === 0 && page === 1) {
            return '目前沒有任何已授權的老師可供移除。';
        }
        if (pageTeachers.length === 0) {
            return '沒有更多老師了。';
        }

        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { type: 'image', url: t.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center',
                        contents: [
                            { type: 'text', text: t.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(t.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'primary',
                    color: '#DE5246',
                    height: 'sm',
                    action: { type: 'postback', label: '選擇此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }
                }]
            }
        }));
        const paginationBubble = createPaginationBubble('action=list_teachers_for_removal', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }

        return {
            type: 'flex',
            altText: '選擇要移除的老師',
            contents: { type: 'carousel', contents: teacherBubbles }
        };
    });
}
// ###################################
// index.js - V35.0 (歷史查詢功能擴充)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto =require('crypto');
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
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;
const CONSTANTS = {
  TIME: {
    ONE_DAY_IN_MS: 86400000,
    EIGHT_HOURS_IN_MS: 28800000,
    ONE_HOUR_IN_MS: 3600000,
  },
  INTERVALS: {
    PING_INTERVAL_MS: 1000 * 60 * 5,
    CONVERSATION_TIMEOUT_MS: 1000 * 60 * 5,
    NOTIFICATION_CACHE_DURATION_MS: 1000 * 30,
    SESSION_TIMEOUT_MS: 1000 * 60 * 5, // [V28.0 新增] 對話階段超時時間 (5分鐘)
  },
  PAGINATION_SIZE: 9,
  PURCHASE_PLANS: [
    { points: 5, amount: 500, label: '5 點 (500元)' },
    { points: 10, amount: 1000, label: '10 點 (1000元)' },
    { points: 20, amount: 2000, label: '20 點 (2000元)' },
    { points: 30, amount: 3000, label: '30 點 (3000元)' },
    { points: 50, amount: 5000, label: '50 點 (5000元)' },
  ],
  BANK_INFO: {
    accountName: process.env.BANK_ACCOUNT_NAME,
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER,
  },
  COMMANDS: {
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
        POINT_ORDER_HISTORY: '@查詢點數訂單',
      STUDENT_MANAGEMENT: '@學員管理',
        SEARCH_STUDENT: '@查詢學員',
        VIEW_MESSAGES: '@查看未回覆留言',
        MESSAGE_SEARCH: '@查詢歷史留言',
      ANNOUNCEMENT_MANAGEMENT: '@公告管理',
        ADD_ANNOUNCEMENT: '@頒佈新公告',
        DELETE_ANNOUNCEMENT: '@刪除舊公告',
      SHOP_MANAGEMENT: '@商城管理',
        ADD_PRODUCT: '@上架新商品',
        VIEW_PRODUCTS: '@商品管理',
        MANAGE_AVAILABLE_PRODUCTS: '@管理販售中商品',
        MANAGE_UNAVAILABLE_PRODUCTS: '@管理已下架商品',
        SHOP_ORDER_MANAGEMENT: '@訂單管理',
        SHOP_ORDER_HISTORY: '@查詢商城訂單',
      REPORT: '@統計報表',
        COURSE_REPORT: '@課程報表',
        ORDER_REPORT: '@訂單報表',
        POINT_REPORT: '@點數報表',
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
      BOOK_COURSE: '@預約課程',
      MY_COURSES: '@我的課程',
      SHOP: '@活動商城',
      POINTS: '@點數查詢',
      LATEST_ANNOUNCEMENT: '@最新公告',
      CONTACT_US: '@聯絡我們',
      VIEW_SHOP_PRODUCTS: '@瀏覽商品',
      EXCHANGE_HISTORY: '@兌換紀錄',
      CHECK_POINTS: '@查看剩餘點數',
      BUY_POINTS: '@購買點數',
      PURCHASE_HISTORY: '@購點紀錄',
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
  }
};
// =======================================================
// [V31.3 新增] 通用快取工具
// =======================================================
const simpleCache = {
  _cache: new Map(),

  /**
   * 設定一筆快取資料
   * @param {string} key - 快取的鍵
   * @param {*} value - 要快取的值
   * @param {number} ttlMs - 快取的存活時間 (毫秒)
   */
  set(key, value, ttlMs) {
    const expires = Date.now() + ttlMs;
    this._cache.set(key, { value, expires });
  },

  /**
   * 讀取一筆快取資料
   * @param {string} key - 快取的鍵
   * @returns {*} - 如果快取存在且未過期，則回傳其值，否則回傳 null
   */
  get(key) {
    const entry = this._cache.get(key);
    // 檢查是否存在，且尚未過期
    if (entry && Date.now() < entry.expires) {
      return entry.value;
    }
    // 如果已過期，可以順便清除它 (可選)
    if (entry) {
        this._cache.delete(key);
    }
    return null;
  },

  /**
   * 清除一筆指定的快取
   * @param {string} key - 快取的鍵
   */
  clear(key) {
    this._cache.delete(key);
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
/**
 * [V29.1 新增] 建立一個通用的、包含分頁功能的 Flex Carousel 訊息。
 * @param {object} options - 設定物件。
 * @param {string} options.altText - Flex Message 的替代文字。
 * @param {string} options.baseAction - Postback 的基本動作字串，例如 'action=view_history'。
 * @param {number} options.page - 當前頁碼。
 * @param {string} options.dataQuery - 要執行的 SQL 查詢，必須包含 LIMIT 和 OFFSET 的參數位置 (例如 $2, $3)。
 * @param {Array<any>} options.queryParams - SQL 查詢的參數陣列 (不含 LIMIT 和 OFFSET 的值)。
 * @param {function(object): object} options.mapRowToBubble - 一個將資料庫 row 轉換為 Flex Bubble 物件的函式。
 * @param {string} options.noDataMessage - 當第一頁沒有任何資料時顯示的文字訊息。
 * @param {string} [options.customParams=''] - (可選) 要附加到 postback data 的額外參數。
 * @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息。
 */
async function createPaginatedCarousel(options) {
  const {
    altText,
    baseAction,
    page,
    dataQuery,
    queryParams,
    mapRowToBubble,
    noDataMessage,
    customParams = ''
  } = options;
  const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;

  return withDatabaseClient(async (client) => {
    // 組合查詢參數，將分頁參數加在最後
    const finalQueryParams = [...queryParams, CONSTANTS.PAGINATION_SIZE + 1, offset];
    const res = await client.query(dataQuery, finalQueryParams);

    const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
    const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

    if (pageRows.length === 0 && page === 1) {
      return noDataMessage;
    }
    if (pageRows.length === 0) {
      return '沒有更多資料了。';
    }

    const bubbles = pageRows.map(mapRowToBubble);

    const paginationBubble = createPaginationBubble(baseAction, page, hasNextPage, customParams);
    if (paginationBubble) {
      bubbles.push(paginationBubble);
    }

    return {
      type: 'flex',
      altText: altText,
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
  });
}

/**
 * [V30 新增] 執行一個需要資料庫客戶端的操作，並自動管理連線的開啟與關閉。
 * @param {function(object): Promise<any>} callback - 要執行的函式，會接收一個 db client 作為參數。
 * @returns {Promise<any>} - 回傳 callback 函式的執行結果。
 */
async function withDatabaseClient(callback) {
  const client = await pgPool.connect();
  try {
    return await callback(client);
  } finally {
    if (client) client.release();
  }
}
/**
 * [V31.3 重構] 使用通用快取工具來讀取推播設定
 */
async function getNotificationStatus() {
    const cacheKey = 'notifications_enabled';
    const ttl = CONSTANTS.INTERVALS.NOTIFICATION_CACHE_DURATION_MS;
    // 步驟 1: 嘗試從快取中讀取
    const cachedStatus = simpleCache.get(cacheKey);
    if (cachedStatus !== null) {
        // 快取命中，直接回傳
        return cachedStatus;
    }

    // 步驟 2: 快取未命中，從資料庫讀取
    try {
        let isEnabled = true; // 預設值為 true，以防資料庫查詢失敗時卡住所有通知
        await withDatabaseClient(async (db) => {
            const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
            if (res.rows.length > 0) {
                isEnabled = res.rows[0].setting_value === 'true';
            }
        });
        // 步驟 3: 將從資料庫讀取到的新值寫入快取
        simpleCache.set(cacheKey, isEnabled, ttl);
        return isEnabled;
    } catch (err) {
        console.error('❌ 讀取推播設定失敗:', err);
        // 在發生錯誤時回傳一個安全的預設值
        return true;
    }
}

/**
 * [V24.0 新增] 將一個推播任務加入到資料庫佇列中
 * @param {string} recipientId - 收件人 User ID
 * @param {object|object[]} message - LINE 訊息物件或物件陣列
 * @param {Date} [sendAt=null] - 預計發送時間，若為 null 則立即發送
 */
async function enqueuePushTask(recipientId, message, sendAt = null) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  try {
    await withDatabaseClient(async (db) => {
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
    });
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  }
}
/**
 * [V31.1 新增] 將多個推播任務批次加入到資料庫佇列中
 * @param {Array<object>} tasks - 任務物件的陣列，每個物件應包含 { recipientId: string, message: object|object[] }
 */
async function enqueueBatchPushTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  // 與單一任務函式一樣，檢查系統推播設定
  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  // 只有在任務列表中包含系統管理員/老師時，才需要檢查推播開關
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return; // 如果過濾後沒有任務了，就直接返回
    }
  }

  try {
    const recipientIds = [];
    const messagePayloads = [];
    const sendTimestamps = [];
    const now = new Date().toISOString();
    tasksToEnqueue.forEach(task => {
      const messagePayload = Array.isArray(task.message) ? task.message : [task.message];
      const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
      if (validMessages.length > 0) {
        recipientIds.push(task.recipientId);
        messagePayloads.push(JSON.stringify(validMessages));
        sendTimestamps.push(now); // 所有批次任務使用相同的時間戳
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await withDatabaseClient(async (db) => {
      // 使用 unnest 進行高效的批次插入
      await db.query(
        `INSERT INTO tasks (recipient_id, message_payload, send_at)
         SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamp[])`,
        [recipientIds, messagePayloads, sendTimestamps]
      );
    });
  } catch (err) {
    console.error(`❌ enqueueBatchPushTasks 批次寫入任務失敗:`, err);
  }
}
/**
 /**
 * [V24.0] 取消超過 24 小時未付款的訂單
 * [V31.1] 優化為批次處理通知任務
 */
async function cancelExpiredPendingOrders() {
    try {
        await withDatabaseClient(async (client) => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * CONSTANTS.TIME.ONE_HOUR_IN_MS);
            const res = await client.query(
                "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
                [twentyFourHoursAgo]
            );

            if (res.rows.length > 0) {
                console.log(`🧹 已自動取消 ${res.rows.length} 筆逾時訂單。`);
                
                // 步驟 1: 使用 .map() 準備所有要發送的通知任務
                const notificationTasks = res.rows.map(order => {
                    const message = { 
                        type: 'text', 
                        text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` 
                    };
                    return {
                        recipientId: order.user_id,
                        message: message
                    };
                });
                
                // 步驟 2: 一次性將所有任務加入佇列
                await enqueueBatchPushTasks(notificationTasks).catch(e => {
                    console.error(`將批次逾時訂單取消通知加入佇列時失敗`);
                });
            }
        });
    } catch (err) {
        console.error("❌ 自動取消逾時訂單時發生錯誤:", err);
    }
}
 
/**
 * [V28.0 新增] 智慧回覆機制：取得使用者的待辦事項通知
 * @param {object} user - 使用者物件，包含 id 和 role
 * @returns {Promise<object>} - 一個包含待辦事項計數的物件
 */
async function getPendingNotificationsForUser(user) {
    const notifications = {};
    try {
        await withDatabaseClient(async (client) => {
            if (user.role === 'teacher') {
                const [newMessages, pendingPointOrders, pendingShopOrders] = await Promise.all([
                    client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'"),
                    client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'"),
                    client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
                ]);
                notifications.newMessages = parseInt(newMessages.rows[0].count, 10);
                notifications.pendingPointOrders = parseInt(pendingPointOrders.rows[0].count, 10);
                notifications.pendingShopOrders = parseInt(pendingShopOrders.rows[0].count, 10);
            } else if (user.role === 'admin') {
                const failedTasks = await client.query("SELECT COUNT(*) FROM failed_tasks");
                notifications.failedTasks = parseInt(failedTasks.rows[0].count, 10);
            } else if (user.role === 'student') {
                const unreadReplies = await client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [user.id]);
                notifications.unreadReplies = parseInt(unreadReplies.rows[0].count, 10);
            }
        });
    } catch (error) {
        console.error(`[getPendingNotifications] 查詢使用者 ${user.id} 的通知時發生錯誤:`, error);
    }
    return notifications;
}

// --- 資料庫輔助函式 (Database Helper Functions) ---

/**
 * [V33.0 新增] 執行一個資料庫查詢，並自動管理連線。
 * 此函式支援傳入一個已存在的 client (用於交易)，或自動建立新連線。
 * @param {function(object): Promise<any>} queryCallback - 要執行的查詢函式，會接收 db client 作為參數。
 * @param {object} [existingClient=null] - (可選) 一個已經存在的 pg client。
 * @returns {Promise<any>} - 回傳 queryCallback 的執行結果。
 */
async function executeDbQuery(queryCallback, existingClient = null) {
  // 如果沒有傳入現有的 client，則自己建立一個
  const client = existingClient || await pgPool.connect();
  try {
    // 執行傳入的查詢邏輯
    return await queryCallback(client);
  } finally {
    // 只有在 client 是這個函式自己建立的情況下，才釋放它
    if (!existingClient && client) {
      client.release();
    }
  }
}
async function generateUniqueCoursePrefix(dbClient) {
    return executeDbQuery(async (client) => {
        let prefix, isUnique = false;
        while (!isUnique) {
            const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            prefix = `${randomChar1}${randomChar2}`;
            const res = await client.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
            if (res.rows.length === 0) isUnique = true;
        }
        return prefix;
    }, dbClient);
}

async function getUser(userId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const userData = res.rows[0];
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        return userData;
    }, dbClient);
}

async function saveUser(user, dbClient) {
    return executeDbQuery(async (client) => {
        const historyJson = JSON.stringify(user.history || []);
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.picture_url || null, user.approved_by || null]
        );
    }, dbClient);
}

async function getCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        // [V42.1 修正] 確保回傳的課程物件包含 teacher_id
        return {
            id: row.id,
            title: row.title,
            time: row.time.toISOString(),
            capacity: row.capacity,
            points_cost: row.points_cost,
            students: row.students || [],
            waiting: row.waiting || [],
            teacher_id: row.teacher_id
        };
    }, dbClient);
}
async function saveCourse(course, dbClient) {
    return executeDbQuery(async (client) => {
        // [V35.0 修改] 新增 teacher_id 欄位
        await client.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, teacher_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) 
             DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7, teacher_id = $8`,
            [course.id, course.title, course.time, course.capacity, course.points_cost, course.students, course.waiting, course.teacher_id]
        );
    }, dbClient);
}

async function deleteCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
    }, dbClient);
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    return executeDbQuery(async (client) => {
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
    }, dbClient);
}

async function getProduct(productId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}
async function saveProduct(product, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, inventory = $5, status = $6 WHERE id = $7`,
            [product.name, product.description, product.price, product.image_url, product.inventory, product.status, product.id]
        );
    }, dbClient);
}

async function getProductOrder(orderUID, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM product_orders WHERE order_uid = $1', [orderUID]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}

async function saveProductOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE product_orders SET status = $1, updated_at = $2, teacher_notes = $3 WHERE id = $4`,
            [order.status, order.updated_at, order.teacher_notes, order.id]
        );
    }, dbClient);
}

async function saveOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
            [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp]
        );
    }, dbClient);
}

async function deleteOrder(orderId, dbClient) {
    return executeDbQuery(async (client) => {
      await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    }, dbClient);
}

async function cleanCoursesDB() {
    try {
        await executeDbQuery(async (client) => {
            const now = new Date();
            // 刪除一天前的課程
            const pastDate = new Date(now.getTime() - CONSTANTS.TIME.ONE_DAY_IN_MS);
            
            const result = await client.query(`DELETE FROM courses WHERE time < $1`, [pastDate]);
            
            if (result.rowCount > 0) {
              console.log(`🧹 定期清理：已成功移除 ${result.rowCount} 筆過期的課程。`);
            }
        });
    } catch (err) {
        console.error('❌ 定期清理過期課程時發生錯誤:', err);
    }
}

/**
 * [V27.6 新增] 共用的錯誤處理函式
 * @param {Error} error - 捕獲到的錯誤物件
 * @param {string} replyToken - 用於回覆的 token
 * @param {string} context - 錯誤發生的情境，例如 "查詢我的課程"
 */
async function handleError(error, replyToken, context = '未知操作') {
    console.error(`❌ 在執行 [${context}] 時發生錯誤:`, error.stack);
    try {
        if (replyToken) {
            await reply(replyToken, `抱歉，在執行 ${context} 時發生了預期外的錯誤，請稍後再試。`);
        }
    } catch (replyError) {
        console.error(`❌ 連錯誤回覆都失敗了:`, replyError.message);
    }
}
/**
 * [V31.2 新增] 將不同格式的內容轉換為 LINE 訊息物件陣列。
 * @param {string|object|Array<string|object>} content - 要發送的內容。
 * @returns {Array<object>} - 標準的 LINE 訊息物件陣列。
 */
function buildMessages(content) {
  const contentArray = Array.isArray(content) ? content : [content];
  
  return contentArray
    .filter(item => item !== null && item !== undefined) // 過濾掉無效內容
    .map(item => (typeof item === 'string' ? { type: 'text', text: item } : item));
}

/**
 * [V31.2 新增] 將 Quick Reply 選單附加到訊息陣列的最後一則訊息上。
 * @param {Array<object>} messages - 由 buildMessages 產生的訊息陣列。
 * @param {Array<object>|null} menu - Quick Reply 的項目陣列。
 * @returns {Array<object>} - 附加完 Quick Reply 的訊息陣列。
 */
function attachQuickReply(messages, menu) {
  if (!menu || !Array.isArray(menu) || menu.length === 0 || messages.length === 0) {
    return messages;
  }

  // 驗證並過濾有效的 Quick Reply 項目
  const validMenuItems = menu
    .slice(0, 13) // Quick Reply 最多支援 13 個項目
    .filter(item => item && item.type === 'action' && (item.action.type === 'message' || item.action.type === 'postback'));
  if (validMenuItems.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.quickReply) {
      lastMessage.quickReply = { items: [] };
    }
    lastMessage.quickReply.items.push(...validMenuItems);
  }

  return messages;
}
/**
 * [V31.2 重構] 透過組合輔助函式來回覆訊息，結構更清晰。
 */
async function reply(replyToken, content, menu = null) {
  // 步驟 1: 建立標準的訊息陣列
  let messages = buildMessages(content);
  // 步驟 2: 如果有選單，就附加 Quick Reply
  messages = attachQuickReply(messages, menu);
  // 如果最終沒有任何有效訊息，就直接返回，避免呼叫空的 API
  if (messages.length === 0) {
    console.log('[REPLY-DEBUG] 沒有有效的訊息可以發送，已取消操作。');
    return;
  }

  // 步驟 3: 執行 API 呼叫
  try {
    console.log(`[REPLY-DEBUG] 準備呼叫 client.replyMessage...`);
    const result = await client.replyMessage(replyToken, messages);
    console.log('[REPLY-DEBUG] client.replyMessage 呼叫已完成。');
    
    // API 錯誤的雙重檢查
    if (result && result.response && result.response.status >= 400) {
        console.error('‼️ API 呼叫回傳了非成功的狀態碼 ‼️', JSON.stringify(result.response.data, null, 2));
    }

  } catch (error) { 
      console.error('‼️ 在 reply 的 CATCH 中捕捉到 API 錯誤 ‼️');
      if (error.originalError && error.originalError.response && error.originalError.response.data) {
          console.error('【LINE API 回應的詳細錯誤】:', JSON.stringify(error.originalError.response.data, null, 2));
      } else {
          console.error('【捕獲到的基本錯誤訊息】:', error.message);
      }
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
/**
 * [V23.2 新增] 取得課程主標題，移除 "- 第 x 堂"
 * @param {string} fullTitle - 完整的課程標題
 * @returns {string} - 主標題
 */
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
        start: new Date(startDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString(),
        end: new Date(endDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString()
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
  if (!CONSTANTS.COMMANDS[upperCaseRole]) return null;
  const commandList = Object.values(CONSTANTS.COMMANDS[upperCaseRole]);
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
    const plansContent = CONSTANTS.PURCHASE_PLANS.flatMap((plan, index) => {
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
        if (index < CONSTANTS.PURCHASE_PLANS.length - 1) {
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

    const pendingOrder = await withDatabaseClient(async (client) => {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        return ordersRes.rows[0];
    });
    const bodyContents = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款待確認';
            cardColor = '#ff9e00';
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '❌ 訂單被退回';
            cardColor = '#d90429';
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
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
                        action: { type: 'postback', label: '➕ 購買點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.BUY_POINTS)}` }
                    },
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY)}` }
                    }
                ]
            }
        }
    };
}
/**
 * [V34.1 新增] 建立一個顯示老師個人資訊變更並請求確認的 Flex Message
 * @param {string} userId - 使用者的 ID
 * @param {object} newData - 一個包含待更新欄位和值的物件，例如 { name: '新名字' }
 */
async function buildProfileConfirmationMessage(userId, newData) {
    const fieldMap = { name: '姓名', bio: '簡介', image_url: '照片' };
    const updatedFields = Object.keys(newData).map(key => fieldMap[key] || key).join('、');

    const client = await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM teachers WHERE line_user_id = $1', [userId]);
        const currentProfile = res.rows[0] || { name: '新老師', bio: '尚未填寫簡介', image_url: null };
        const previewProfile = { ...currentProfile, ...newData };
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        
        return {
            type: 'flex',
            altText: `確認更新您的${updatedFields}`,
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `⚠️ 請確認更新內容`, weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#FFC107' },
                hero: { type: 'image', url: previewProfile.image_url || placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'md',
                    contents: [
                        { type: 'text', text: previewProfile.name, weight: 'bold', size: 'xl' },
                        { type: 'text', text: previewProfile.bio || '尚未填寫簡介', wrap: true, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: `✅ 確認更新${updatedFields}`, data: 'action=confirm_teacher_profile_update' } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            }
        };
    } finally {
        if (client) client.release();
    }
}

const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];
// --- 對話狀態管理 ---
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
const pendingTeacherProfileEdit = {};
// [V34.0 新增]
const pendingReportGeneration = {};
const pendingAnnouncementCreation = {};
const pendingAnnouncementDeletion = {};
const repliedTokens = new Set();
const pendingProductEdit = {};
const pendingInventoryAdjust = {};
const pendingManualAdjustSearch = {}; 
const pendingPointOrderSearch = {};
const pendingShopOrderSearch = {};
const userProfileCache = new Map();
const userLastInteraction = {}; // [V28.0 新增] 用於智慧回覆機制的 Session 追蹤
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
    pendingTeacherProfileEdit,
    pendingMessageSearchQuery,
    pendingManualAdjustSearch,
    pendingPointOrderSearch,
    pendingShopOrderSearch,
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
    return [{ type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }];
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
    }, CONSTANTS.INTERVALS.CONVERSATION_TIMEOUT_MS);
    conversationState[userId] = { ...conversationState[userId], timeoutId };
}
async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return { handled: false };
    let replyContent;

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
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

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數查詢」選單，點擊「❗ 匯款待處理」卡片中的按鈕來回報您的後五碼。\n\n⚠️提醒：為確保您的權益，請於24小時內完成匯款與回報，逾時訂單將會自動取消。`;

                const flexMenu = await buildPointsMenuFlex(userId);
                replyContent = [{ type: 'text', text: replyText }, flexMenu];

            } else {
                replyContent = '請點擊「✅ 確認購買」或「❌ 取消操作」。';
            }
            return { handled: true, reply: replyContent };
        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const wasSuccessful = await withDatabaseClient(async (client) => {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [order_id]);
                    if (orderRes.rows.length > 0) {
                        const order = orderRes.rows[0];
                        order.last_5_digits = text;
                        order.status = 'pending_confirmation';
                        order.timestamp = new Date().toISOString();
                        await saveOrder(order, client);
                        return true;
                    }
                    return false;
                });
                delete pendingPurchase[userId];
                if (wasSuccessful) {
                    const flexMenu = await buildPointsMenuFlex(userId);
                    replyContent = [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu];
                    
                    if (TEACHER_ID) {
                        const notifyMessage = { type: 'text', text: `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認點數訂單」審核。`};
                        await enqueuePushTask(TEACHER_ID, notifyMessage).catch(e => console.error(e));
                    }
                } else {
                    replyContent = '找不到您的訂單，請重新操作。';
                }
            } else {
                replyContent = {
                    type: 'text',
                    text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。',
                    quickReply: { items: getCancelMenu() }
                };
            }
            return { handled: true, reply: replyContent };
    }
    return { handled: false };
}

// --- Teacher Command Handlers (V34.0 Refactor) ---

async function showCourseManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '課程與師資管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '🗓️ 課程與師資管理', color: '#ffffff', weight: 'bold', size: 'lg'}], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'text', text: '課程功能', size: 'sm', color: '#888888', weight: 'bold' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 新增課程系列', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 課程狀態查詢', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 管理已開課程', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES)}` } },
                    { type: 'separator', margin: 'xl' },
                    { type: 'text', text: '師資功能', size: 'sm', color: '#888888', weight: 'bold', margin: 'lg' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📋 師資團隊', data: 'action=list_all_teachers&page=1' } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '👤 個人資訊', data: 'action=manage_personal_profile' } }
                ] 
            } 
        } 
    };
}

async function startAddCourseSeries(event, user) {
    const userId = user.id;
    pendingCourseCreation[userId] = { step: 'await_title' };
    setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '新增課程逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showManageOpenCourses(event, user) {
    return showCourseSeries(1);
}

async function showCourseInquiry(event, user) {
    return showCourseRosterSummary(1);
}

async function showPointManagementMenu(event, user) {
    const pendingCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingOrdersLabel = '✅ 確認處理訂單';
    if (pendingCount > 0) { 
        pendingOrdersLabel = `✅ 確認處理訂單 (${pendingCount})`;
    }
    
    return { 
        type: 'flex', 
        altText: '點數管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '💎 點數管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingOrdersLabel, data: `action=view_pending_orders_page&page=1` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✍️ 手動調整點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢調整紀錄', data: `action=select_adjust_history_view_type` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_point_history_view_type` } }
                ] 
            } 
        } 
    };
}


async function showPendingPointOrders(event, user) {
    return showPendingOrders(1);
}

async function showStudentManagementMenu(event, user) {
    const unreadCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let unreadLabel = '💬 查看未回覆留言';
    if (unreadCount > 0) { 
        unreadLabel += ` (${unreadCount})`;
    }

    return { 
        type: 'flex', 
        altText: '學員管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '👤 學員管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 查詢學員', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: unreadLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史留言', data: `action=select_message_history_view_type` } } 
                ] 
            } 
        } 
    };
}

async function startStudentSearch(event, user) {
    const userId = user.id;
    pendingStudentSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => { 
        if (pendingStudentSearchQuery[u]) { 
            delete pendingStudentSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢學員逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showUnreadTeacherMessages(event, user) {
    return showUnreadMessages(1);
}

async function startMessageSearch(event, user) {
    const userId = user.id;
    pendingMessageSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => { 
        if (pendingMessageSearchQuery[u]) { 
            delete pendingMessageSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢歷史留言逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢的學員姓名或留言關鍵字：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '公告管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📢 公告管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 頒佈新公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🗑️ 刪除舊公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT)}` } } 
                ] 
            } 
        } 
    };
}
async function startAddAnnouncement(event, user) {
    const userId = user.id;
    pendingAnnouncementCreation[userId] = { step: 'await_content' };
    setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '頒佈公告操作逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入要頒佈的公告內容：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementsForDeletionList(event, user) {
    return showAnnouncementsForDeletion(1);
}

async function showShopManagementMenu(event, user) {
    const pendingShopOrdersCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingShopOrdersLabel = '📋 查看待處理訂單';
    if (pendingShopOrdersCount > 0) { 
        pendingShopOrdersLabel += ` (${pendingShopOrdersCount})`;
    }

    return { 
        type: 'flex', 
        altText: '商城管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [ { type: 'text', text: '🛍️ 商城管理', weight: 'bold', size: 'lg', color: '#FFFFFF' } ], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 上架新商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🛒 管理販售中商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 管理已下架商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS)}` } }, 
                    { type: 'separator', margin: 'md'}, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingShopOrdersLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_shop_history_view_type` } }
                ] 
            } 
        } 
    };
}

async function startAddProduct(event, user) {
    const userId = user.id;
    pendingProductCreation[userId] = { step: 'await_name' };
    setupConversationTimeout(userId, pendingProductCreation, 'pendingProductCreation', u => { 
        const timeoutMessage = { type: 'text', text: '上架商品操作逾時，自動取消。' }; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新商品的名稱：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAvailableProductsList(event, user) {
    return showProductManagementList(1, 'available');
}

async function showUnavailableProductsList(event, user) {
    return showProductManagementList(1, 'unavailable');
}

async function showShopOrderManagement(event, user) {
    return showPendingShopOrders(1);
}
async function showReportMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '統計報表', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📊 統計報表', weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📈 課程報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💰 訂單報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💎 點數報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.POINT_REPORT)}` } } 
                ] 
            } 
        } 
    };
}

async function showTimePeriodMenuForReport(event, user) {
    const text = event.message.text.trim();
    const reportType = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? 'course' : 'order';
    const title = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? '課程報表' : '訂單報表';
    return { 
        type: 'flex', 
        altText: '選擇時間週期', 
        contents: { 
            type: 'bubble', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#52b69a' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'sm', 
                contents: [ 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本週', data: `action=generate_report&type=${reportType}&period=week` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本月', data: `action=generate_report&type=${reportType}&period=month` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本季', data: `action=generate_report&type=${reportType}&period=quarter` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '今年', data: `action=generate_report&type=${reportType}&period=year` } }, 
                ] 
            }, 
            footer: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '請選擇要查詢的時間區間', size: 'sm', color: '#AAAAAA', align: 'center'}] 
            } 
        } 
    };
}

async function generatePointReport(event, user) {
    const userId = user.id;
    const generateReportTask = async () => {
        return withDatabaseClient(async (client) => {
            const usersRes = await client.query(`SELECT name, points FROM users WHERE role = 'student' ORDER BY points DESC`); 
            const students = usersRes.rows;
            if (students.length === 0) { 
                return '目前沒有任何學員資料可供分析。'; 
            }
            const totalPoints = students.reduce((sum, s) => sum + s.points, 0); 
            const averagePoints = (totalPoints / students.length).toFixed(2);
            const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n'); 
            const zeroPointStudents = students.filter(s => s.points === 0).length;
            return `💎 全體學員點數報告 💎\n\n總學員數：${students.length} 人\n點數總計：${totalPoints} 點\n平均持有：${averagePoints} 點/人\n零點學員：${zeroPointStudents} 人\n\n👑 點數持有 Top 5：\n${top5}`;
        });
    };

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));
    try {
        const result = await Promise.race([generateReportTask(), timeoutPromise]);
        if (result === 'timeout') {
            (async () => {
                const reportText = await generateReportTask();
                await enqueuePushTask(userId, { type: 'text', text: reportText });
            })();
            return '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。';
        } else { 
            return result;
        }
    } catch (err) { 
        console.error('❌ 即時生成點數報表失敗:', err);
        return '❌ 產生報表時發生錯誤，請稍後再試。'; 
    }
}

async function startManualAdjust(event, user) {
    const userId = user.id;
    pendingManualAdjust[userId] = { step: 'await_student_search' };
    setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => { 
        const timeoutMessage = { type: 'text', text: '手動調整點數逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入您想調整點數的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}
// --- Teacher Command Map (V34.0 Refactor) ---

const teacherCommandMap = {
    [CONSTANTS.COMMANDS.TEACHER.COURSE_MANAGEMENT]: showCourseManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES]: startAddCourseSeries,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES]: showManageOpenCourses,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY]: showCourseInquiry,
    [CONSTANTS.COMMANDS.TEACHER.POINT_MANAGEMENT]: showPointManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_POINT_ORDERS]: showPendingPointOrders,
    [CONSTANTS.COMMANDS.TEACHER.STUDENT_MANAGEMENT]: showStudentManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT]: startStudentSearch,
    [CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES]: showUnreadTeacherMessages,
    [CONSTANTS.COMMANDS.TEACHER.MESSAGE_SEARCH]: startMessageSearch,
    [CONSTANTS.COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT]: showAnnouncementManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT]: startAddAnnouncement,
    [CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT]: showAnnouncementsForDeletionList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_MANAGEMENT]: showShopManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT]: startAddProduct,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS]: showAvailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS]: showUnavailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT]: showShopOrderManagement,
    [CONSTANTS.COMMANDS.TEACHER.REPORT]: showReportMenu,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.POINT_REPORT]: generatePointReport,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_ORDERS]: showPendingPointOrders, // Alias
    [CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS]: startManualAdjust,
};
function handleUnknownTeacherCommand(text) {
    let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'teacher');
        if (closestCommand) {
            teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
        } else {
            teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
        }
    }
    return teacherSuggestion;
}

// --- Main Command Handlers ---
async function getUserNames(userIds, dbClient) {
    if (!userIds || userIds.length === 0) {
        return new Map();
    }
    const usersRes = await dbClient.query("SELECT id, name FROM users WHERE id = ANY($1::text[])", [userIds]);
    return new Map(usersRes.rows.map(u => [u.id, u.name]));
}

async function showFailedTasks(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT * FROM failed_tasks ORDER BY failed_at DESC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );
        
        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTasks = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

 
        if (pageTasks.length === 0 && page === 1) {
            return '✅ 太好了！目前沒有任何失敗的任務。';
        }
        if (pageTasks.length === 0) {
            return '沒有更多失敗的任務了。';
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
    });
}

async function showSystemStatus() {
  return withDatabaseClient(async (db) => {
    const [pendingRes, processingRes, failedRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'processing'"),
      db.query("SELECT COUNT(*) FROM failed_tasks")
    ]);

    const pendingCount = pendingRes.rows[0].count;
    const processingCount = processingRes.rows[0].count;
    const failedCount = failedRes.rows[0].count;

    const statusText = `
⚙️ 背景系統狀態 ⚙️

- 待處理任務: ${pendingCount} 個
- 正在處理中: ${processingCount} 個
- 失敗任務(DLQ): ${failedCount} 個

ℹ️ 「待處理任務」是系統即將要發送的排程訊息 (如課程提醒)。若「失敗任務」數量持續增加，請檢查 Worker 紀錄。
    `.trim();

    return statusText;
  });
}

async function showTeacherListForRemoval(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT id, name, picture_url FROM users WHERE role = 'teacher' ORDER BY name ASC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTeachers = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

   
        if (pageTeachers.length === 0 && page === 1) {
            return '目前沒有任何已授權的老師可供移除。';
        }
        if (pageTeachers.length === 0) {
            return '沒有更多老師了。';
        }

        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { type: 'image', url: t.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center',
                        contents: [
                            { type: 'text', text: t.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(t.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'primary',
                    color: '#DE5246',
                    height: 'sm',
                    action: { type: 'postback', label: '選擇此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }
                }]
            }
        }));
        const paginationBubble = createPaginationBubble('action=list_teachers_for_removal', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }

        return {
            type: 'flex',
            altText: '選擇要移除的老師',
            contents: { type: 'carousel', contents: teacherBubbles }
        };
    });
}
// ###################################
// index.js - V35.0 (歷史查詢功能擴充)
require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const { Pool } = require('pg');
const crypto =require('crypto');
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
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;
const CONSTANTS = {
  TIME: {
    ONE_DAY_IN_MS: 86400000,
    EIGHT_HOURS_IN_MS: 28800000,
    ONE_HOUR_IN_MS: 3600000,
  },
  INTERVALS: {
    PING_INTERVAL_MS: 1000 * 60 * 5,
    CONVERSATION_TIMEOUT_MS: 1000 * 60 * 5,
    NOTIFICATION_CACHE_DURATION_MS: 1000 * 30,
    SESSION_TIMEOUT_MS: 1000 * 60 * 5, // [V28.0 新增] 對話階段超時時間 (5分鐘)
  },
  PAGINATION_SIZE: 9,
  PURCHASE_PLANS: [
    { points: 5, amount: 500, label: '5 點 (500元)' },
    { points: 10, amount: 1000, label: '10 點 (1000元)' },
    { points: 20, amount: 2000, label: '20 點 (2000元)' },
    { points: 30, amount: 3000, label: '30 點 (3000元)' },
    { points: 50, amount: 5000, label: '50 點 (5000元)' },
  ],
  BANK_INFO: {
    accountName: process.env.BANK_ACCOUNT_NAME,
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT_NUMBER,
  },
  COMMANDS: {
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
        POINT_ORDER_HISTORY: '@查詢點數訂單',
      STUDENT_MANAGEMENT: '@學員管理',
        SEARCH_STUDENT: '@查詢學員',
        VIEW_MESSAGES: '@查看未回覆留言',
        MESSAGE_SEARCH: '@查詢歷史留言',
      ANNOUNCEMENT_MANAGEMENT: '@公告管理',
        ADD_ANNOUNCEMENT: '@頒佈新公告',
        DELETE_ANNOUNCEMENT: '@刪除舊公告',
      SHOP_MANAGEMENT: '@商城管理',
        ADD_PRODUCT: '@上架新商品',
        VIEW_PRODUCTS: '@商品管理',
        MANAGE_AVAILABLE_PRODUCTS: '@管理販售中商品',
        MANAGE_UNAVAILABLE_PRODUCTS: '@管理已下架商品',
        SHOP_ORDER_MANAGEMENT: '@訂單管理',
        SHOP_ORDER_HISTORY: '@查詢商城訂單',
      REPORT: '@統計報表',
        COURSE_REPORT: '@課程報表',
        ORDER_REPORT: '@訂單報表',
        POINT_REPORT: '@點數報表',
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
      BOOK_COURSE: '@預約課程',
      MY_COURSES: '@我的課程',
      SHOP: '@活動商城',
      POINTS: '@點數查詢',
      LATEST_ANNOUNCEMENT: '@最新公告',
      CONTACT_US: '@聯絡我們',
      VIEW_SHOP_PRODUCTS: '@瀏覽商品',
      EXCHANGE_HISTORY: '@兌換紀錄',
      CHECK_POINTS: '@查看剩餘點數',
      BUY_POINTS: '@購買點數',
      PURCHASE_HISTORY: '@購點紀錄',
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
  }
};
// =======================================================
// [V31.3 新增] 通用快取工具
// =======================================================
const simpleCache = {
  _cache: new Map(),

  /**
   * 設定一筆快取資料
   * @param {string} key - 快取的鍵
   * @param {*} value - 要快取的值
   * @param {number} ttlMs - 快取的存活時間 (毫秒)
   */
  set(key, value, ttlMs) {
    const expires = Date.now() + ttlMs;
    this._cache.set(key, { value, expires });
  },

  /**
   * 讀取一筆快取資料
   * @param {string} key - 快取的鍵
   * @returns {*} - 如果快取存在且未過期，則回傳其值，否則回傳 null
   */
  get(key) {
    const entry = this._cache.get(key);
    // 檢查是否存在，且尚未過期
    if (entry && Date.now() < entry.expires) {
      return entry.value;
    }
    // 如果已過期，可以順便清除它 (可選)
    if (entry) {
        this._cache.delete(key);
    }
    return null;
  },

  /**
   * 清除一筆指定的快取
   * @param {string} key - 快取的鍵
   */
  clear(key) {
    this._cache.delete(key);
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
/**
 * [V29.1 新增] 建立一個通用的、包含分頁功能的 Flex Carousel 訊息。
 * @param {object} options - 設定物件。
 * @param {string} options.altText - Flex Message 的替代文字。
 * @param {string} options.baseAction - Postback 的基本動作字串，例如 'action=view_history'。
 * @param {number} options.page - 當前頁碼。
 * @param {string} options.dataQuery - 要執行的 SQL 查詢，必須包含 LIMIT 和 OFFSET 的參數位置 (例如 $2, $3)。
 * @param {Array<any>} options.queryParams - SQL 查詢的參數陣列 (不含 LIMIT 和 OFFSET 的值)。
 * @param {function(object): object} options.mapRowToBubble - 一個將資料庫 row 轉換為 Flex Bubble 物件的函式。
 * @param {string} options.noDataMessage - 當第一頁沒有任何資料時顯示的文字訊息。
 * @param {string} [options.customParams=''] - (可選) 要附加到 postback data 的額外參數。
 * @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息。
 */
async function createPaginatedCarousel(options) {
  const {
    altText,
    baseAction,
    page,
    dataQuery,
    queryParams,
    mapRowToBubble,
    noDataMessage,
    customParams = ''
  } = options;
  const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;

  return withDatabaseClient(async (client) => {
    // 組合查詢參數，將分頁參數加在最後
    const finalQueryParams = [...queryParams, CONSTANTS.PAGINATION_SIZE + 1, offset];
    const res = await client.query(dataQuery, finalQueryParams);

    const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
    const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

    if (pageRows.length === 0 && page === 1) {
      return noDataMessage;
    }
    if (pageRows.length === 0) {
      return '沒有更多資料了。';
    }

    const bubbles = pageRows.map(mapRowToBubble);

    const paginationBubble = createPaginationBubble(baseAction, page, hasNextPage, customParams);
    if (paginationBubble) {
      bubbles.push(paginationBubble);
    }

    return {
      type: 'flex',
      altText: altText,
      contents: {
        type: 'carousel',
        contents: bubbles
      }
    };
  });
}

/**
 * [V30 新增] 執行一個需要資料庫客戶端的操作，並自動管理連線的開啟與關閉。
 * @param {function(object): Promise<any>} callback - 要執行的函式，會接收一個 db client 作為參數。
 * @returns {Promise<any>} - 回傳 callback 函式的執行結果。
 */
async function withDatabaseClient(callback) {
  const client = await pgPool.connect();
  try {
    return await callback(client);
  } finally {
    if (client) client.release();
  }
}
/**
 * [V31.3 重構] 使用通用快取工具來讀取推播設定
 */
async function getNotificationStatus() {
    const cacheKey = 'notifications_enabled';
    const ttl = CONSTANTS.INTERVALS.NOTIFICATION_CACHE_DURATION_MS;
    // 步驟 1: 嘗試從快取中讀取
    const cachedStatus = simpleCache.get(cacheKey);
    if (cachedStatus !== null) {
        // 快取命中，直接回傳
        return cachedStatus;
    }

    // 步驟 2: 快取未命中，從資料庫讀取
    try {
        let isEnabled = true; // 預設值為 true，以防資料庫查詢失敗時卡住所有通知
        await withDatabaseClient(async (db) => {
            const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
            if (res.rows.length > 0) {
                isEnabled = res.rows[0].setting_value === 'true';
            }
        });
        // 步驟 3: 將從資料庫讀取到的新值寫入快取
        simpleCache.set(cacheKey, isEnabled, ttl);
        return isEnabled;
    } catch (err) {
        console.error('❌ 讀取推播設定失敗:', err);
        // 在發生錯誤時回傳一個安全的預設值
        return true;
    }
}

/**
 * [V24.0 新增] 將一個推播任務加入到資料庫佇列中
 * @param {string} recipientId - 收件人 User ID
 * @param {object|object[]} message - LINE 訊息物件或物件陣列
 * @param {Date} [sendAt=null] - 預計發送時間，若為 null 則立即發送
 */
async function enqueuePushTask(recipientId, message, sendAt = null) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  try {
    await withDatabaseClient(async (db) => {
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
    });
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  }
}
/**
 * [V31.1 新增] 將多個推播任務批次加入到資料庫佇列中
 * @param {Array<object>} tasks - 任務物件的陣列，每個物件應包含 { recipientId: string, message: object|object[] }
 */
async function enqueueBatchPushTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  // 與單一任務函式一樣，檢查系統推播設定
  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  // 只有在任務列表中包含系統管理員/老師時，才需要檢查推播開關
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return; // 如果過濾後沒有任務了，就直接返回
    }
  }

  try {
    const recipientIds = [];
    const messagePayloads = [];
    const sendTimestamps = [];
    const now = new Date().toISOString();
    tasksToEnqueue.forEach(task => {
      const messagePayload = Array.isArray(task.message) ? task.message : [task.message];
      const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
      if (validMessages.length > 0) {
        recipientIds.push(task.recipientId);
        messagePayloads.push(JSON.stringify(validMessages));
        sendTimestamps.push(now); // 所有批次任務使用相同的時間戳
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await withDatabaseClient(async (db) => {
      // 使用 unnest 進行高效的批次插入
      await db.query(
        `INSERT INTO tasks (recipient_id, message_payload, send_at)
         SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamp[])`,
        [recipientIds, messagePayloads, sendTimestamps]
      );
    });
  } catch (err) {
    console.error(`❌ enqueueBatchPushTasks 批次寫入任務失敗:`, err);
  }
}
/**
 /**
 * [V24.0] 取消超過 24 小時未付款的訂單
 * [V31.1] 優化為批次處理通知任務
 */
async function cancelExpiredPendingOrders() {
    try {
        await withDatabaseClient(async (client) => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * CONSTANTS.TIME.ONE_HOUR_IN_MS);
            const res = await client.query(
                "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
                [twentyFourHoursAgo]
            );

            if (res.rows.length > 0) {
                console.log(`🧹 已自動取消 ${res.rows.length} 筆逾時訂單。`);
                
                // 步驟 1: 使用 .map() 準備所有要發送的通知任務
                const notificationTasks = res.rows.map(order => {
                    const message = { 
                        type: 'text', 
                        text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` 
                    };
                    return {
                        recipientId: order.user_id,
                        message: message
                    };
                });
                
                // 步驟 2: 一次性將所有任務加入佇列
                await enqueueBatchPushTasks(notificationTasks).catch(e => {
                    console.error(`將批次逾時訂單取消通知加入佇列時失敗`);
                });
            }
        });
    } catch (err) {
        console.error("❌ 自動取消逾時訂單時發生錯誤:", err);
    }
}
 
/**
 * [V28.0 新增] 智慧回覆機制：取得使用者的待辦事項通知
 * @param {object} user - 使用者物件，包含 id 和 role
 * @returns {Promise<object>} - 一個包含待辦事項計數的物件
 */
async function getPendingNotificationsForUser(user) {
    const notifications = {};
    try {
        await withDatabaseClient(async (client) => {
            if (user.role === 'teacher') {
                const [newMessages, pendingPointOrders, pendingShopOrders] = await Promise.all([
                    client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'"),
                    client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'"),
                    client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
                ]);
                notifications.newMessages = parseInt(newMessages.rows[0].count, 10);
                notifications.pendingPointOrders = parseInt(pendingPointOrders.rows[0].count, 10);
                notifications.pendingShopOrders = parseInt(pendingShopOrders.rows[0].count, 10);
            } else if (user.role === 'admin') {
                const failedTasks = await client.query("SELECT COUNT(*) FROM failed_tasks");
                notifications.failedTasks = parseInt(failedTasks.rows[0].count, 10);
            } else if (user.role === 'student') {
                const unreadReplies = await client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [user.id]);
                notifications.unreadReplies = parseInt(unreadReplies.rows[0].count, 10);
            }
        });
    } catch (error) {
        console.error(`[getPendingNotifications] 查詢使用者 ${user.id} 的通知時發生錯誤:`, error);
    }
    return notifications;
}

// --- 資料庫輔助函式 (Database Helper Functions) ---

/**
 * [V33.0 新增] 執行一個資料庫查詢，並自動管理連線。
 * 此函式支援傳入一個已存在的 client (用於交易)，或自動建立新連線。
 * @param {function(object): Promise<any>} queryCallback - 要執行的查詢函式，會接收 db client 作為參數。
 * @param {object} [existingClient=null] - (可選) 一個已經存在的 pg client。
 * @returns {Promise<any>} - 回傳 queryCallback 的執行結果。
 */
async function executeDbQuery(queryCallback, existingClient = null) {
  // 如果沒有傳入現有的 client，則自己建立一個
  const client = existingClient || await pgPool.connect();
  try {
    // 執行傳入的查詢邏輯
    return await queryCallback(client);
  } finally {
    // 只有在 client 是這個函式自己建立的情況下，才釋放它
    if (!existingClient && client) {
      client.release();
    }
  }
}
async function generateUniqueCoursePrefix(dbClient) {
    return executeDbQuery(async (client) => {
        let prefix, isUnique = false;
        while (!isUnique) {
            const randomChar1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            const randomChar2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            prefix = `${randomChar1}${randomChar2}`;
            const res = await client.query('SELECT id FROM courses WHERE id LIKE $1', [`${prefix}%`]);
            if (res.rows.length === 0) isUnique = true;
        }
        return prefix;
    }, dbClient);
}

async function getUser(userId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (res.rows.length === 0) return null;
        const userData = res.rows[0];
        if (userData && typeof userData.history === 'string') {
            try { userData.history = JSON.parse(userData.history); } catch (e) { userData.history = []; }
        }
        return userData;
    }, dbClient);
}

async function saveUser(user, dbClient) {
    return executeDbQuery(async (client) => {
        const historyJson = JSON.stringify(user.history || []);
        await client.query(
            `INSERT INTO users (id, name, points, role, history, last_seen_announcement_id, picture_url, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5, last_seen_announcement_id = $6, picture_url = $7, approved_by = $8`,
            [user.id, user.name, user.points, user.role, historyJson, user.last_seen_announcement_id || 0, user.picture_url || null, user.approved_by || null]
        );
    }, dbClient);
}

async function getCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (res.rows.length === 0) return null;
        
        const row = res.rows[0];
        // [V42.1 修正] 確保回傳的課程物件包含 teacher_id
        return {
            id: row.id,
            title: row.title,
            time: row.time.toISOString(),
            capacity: row.capacity,
            points_cost: row.points_cost,
            students: row.students || [],
            waiting: row.waiting || [],
            teacher_id: row.teacher_id
        };
    }, dbClient);
}
async function saveCourse(course, dbClient) {
    return executeDbQuery(async (client) => {
        // [V35.0 修改] 新增 teacher_id 欄位
        await client.query(
            `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, teacher_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) 
             DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7, teacher_id = $8`,
            [course.id, course.title, course.time, course.capacity, course.points_cost, course.students, course.waiting, course.teacher_id]
        );
    }, dbClient);
}

async function deleteCourse(courseId, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
    }, dbClient);
}

async function deleteCoursesByPrefix(prefix, dbClient) {
    return executeDbQuery(async (client) => {
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
    }, dbClient);
}

async function getProduct(productId, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}
async function saveProduct(product, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE products SET name = $1, description = $2, price = $3, image_url = $4, inventory = $5, status = $6 WHERE id = $7`,
            [product.name, product.description, product.price, product.image_url, product.inventory, product.status, product.id]
        );
    }, dbClient);
}

async function getProductOrder(orderUID, dbClient) {
    return executeDbQuery(async (client) => {
        const res = await client.query('SELECT * FROM product_orders WHERE order_uid = $1', [orderUID]);
        return res.rows.length > 0 ? res.rows[0] : null;
    }, dbClient);
}

async function saveProductOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `UPDATE product_orders SET status = $1, updated_at = $2, teacher_notes = $3 WHERE id = $4`,
            [order.status, order.updated_at, order.teacher_notes, order.id]
        );
    }, dbClient);
}

async function saveOrder(order, dbClient) {
    return executeDbQuery(async (client) => {
        await client.query(
            `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8`,
            [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp]
        );
    }, dbClient);
}

async function deleteOrder(orderId, dbClient) {
    return executeDbQuery(async (client) => {
      await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    }, dbClient);
}

async function cleanCoursesDB() {
    try {
        await executeDbQuery(async (client) => {
            const now = new Date();
            // 刪除一天前的課程
            const pastDate = new Date(now.getTime() - CONSTANTS.TIME.ONE_DAY_IN_MS);
            
            const result = await client.query(`DELETE FROM courses WHERE time < $1`, [pastDate]);
            
            if (result.rowCount > 0) {
              console.log(`🧹 定期清理：已成功移除 ${result.rowCount} 筆過期的課程。`);
            }
        });
    } catch (err) {
        console.error('❌ 定期清理過期課程時發生錯誤:', err);
    }
}

/**
 * [V27.6 新增] 共用的錯誤處理函式
 * @param {Error} error - 捕獲到的錯誤物件
 * @param {string} replyToken - 用於回覆的 token
 * @param {string} context - 錯誤發生的情境，例如 "查詢我的課程"
 */
async function handleError(error, replyToken, context = '未知操作') {
    console.error(`❌ 在執行 [${context}] 時發生錯誤:`, error.stack);
    try {
        if (replyToken) {
            await reply(replyToken, `抱歉，在執行 ${context} 時發生了預期外的錯誤，請稍後再試。`);
        }
    } catch (replyError) {
        console.error(`❌ 連錯誤回覆都失敗了:`, replyError.message);
    }
}
/**
 * [V31.2 新增] 將不同格式的內容轉換為 LINE 訊息物件陣列。
 * @param {string|object|Array<string|object>} content - 要發送的內容。
 * @returns {Array<object>} - 標準的 LINE 訊息物件陣列。
 */
function buildMessages(content) {
  const contentArray = Array.isArray(content) ? content : [content];
  
  return contentArray
    .filter(item => item !== null && item !== undefined) // 過濾掉無效內容
    .map(item => (typeof item === 'string' ? { type: 'text', text: item } : item));
}

/**
 * [V31.2 新增] 將 Quick Reply 選單附加到訊息陣列的最後一則訊息上。
 * @param {Array<object>} messages - 由 buildMessages 產生的訊息陣列。
 * @param {Array<object>|null} menu - Quick Reply 的項目陣列。
 * @returns {Array<object>} - 附加完 Quick Reply 的訊息陣列。
 */
function attachQuickReply(messages, menu) {
  if (!menu || !Array.isArray(menu) || menu.length === 0 || messages.length === 0) {
    return messages;
  }

  // 驗證並過濾有效的 Quick Reply 項目
  const validMenuItems = menu
    .slice(0, 13) // Quick Reply 最多支援 13 個項目
    .filter(item => item && item.type === 'action' && (item.action.type === 'message' || item.action.type === 'postback'));
  if (validMenuItems.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.quickReply) {
      lastMessage.quickReply = { items: [] };
    }
    lastMessage.quickReply.items.push(...validMenuItems);
  }

  return messages;
}
/**
 * [V31.2 重構] 透過組合輔助函式來回覆訊息，結構更清晰。
 */
async function reply(replyToken, content, menu = null) {
  // 步驟 1: 建立標準的訊息陣列
  let messages = buildMessages(content);
  // 步驟 2: 如果有選單，就附加 Quick Reply
  messages = attachQuickReply(messages, menu);
  // 如果最終沒有任何有效訊息，就直接返回，避免呼叫空的 API
  if (messages.length === 0) {
    console.log('[REPLY-DEBUG] 沒有有效的訊息可以發送，已取消操作。');
    return;
  }

  // 步驟 3: 執行 API 呼叫
  try {
    console.log(`[REPLY-DEBUG] 準備呼叫 client.replyMessage...`);
    const result = await client.replyMessage(replyToken, messages);
    console.log('[REPLY-DEBUG] client.replyMessage 呼叫已完成。');
    
    // API 錯誤的雙重檢查
    if (result && result.response && result.response.status >= 400) {
        console.error('‼️ API 呼叫回傳了非成功的狀態碼 ‼️', JSON.stringify(result.response.data, null, 2));
    }

  } catch (error) { 
      console.error('‼️ 在 reply 的 CATCH 中捕捉到 API 錯誤 ‼️');
      if (error.originalError && error.originalError.response && error.originalError.response.data) {
          console.error('【LINE API 回應的詳細錯誤】:', JSON.stringify(error.originalError.response.data, null, 2));
      } else {
          console.error('【捕獲到的基本錯誤訊息】:', error.message);
      }
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
/**
 * [V23.2 新增] 取得課程主標題，移除 "- 第 x 堂"
 * @param {string} fullTitle - 完整的課程標題
 * @returns {string} - 主標題
 */
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
        start: new Date(startDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString(),
        end: new Date(endDate.getTime() - CONSTANTS.TIME.EIGHT_HOURS_IN_MS).toISOString()
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
  if (!CONSTANTS.COMMANDS[upperCaseRole]) return null;
  const commandList = Object.values(CONSTANTS.COMMANDS[upperCaseRole]);
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
    const plansContent = CONSTANTS.PURCHASE_PLANS.flatMap((plan, index) => {
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
        if (index < CONSTANTS.PURCHASE_PLANS.length - 1) {
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

    const pendingOrder = await withDatabaseClient(async (client) => {
        const ordersRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        return ordersRes.rows[0];
    });
    const bodyContents = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') {
            actionButtonLabel = '修改匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '🕒 匯款待確認';
            cardColor = '#ff9e00';
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            actionButtonLabel = '重新提交後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
            cardTitle = '❌ 訂單被退回';
            cardColor = '#d90429';
            statusText = '訂單被老師退回';
            additionalInfo = '請檢查金額或後五碼，並重新提交。';
        } else { // pending_payment
            actionButtonLabel = '輸入匯款後五碼';
            actionCmd = CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER;
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
                        action: { type: 'postback', label: '➕ 購買點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.BUY_POINTS)}` }
                    },
                    {
                        type: 'button', style: 'secondary', height: 'sm',
                        action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY)}` }
                    }
                ]
            }
        }
    };
}
/**
 * [V34.1 新增] 建立一個顯示老師個人資訊變更並請求確認的 Flex Message
 * @param {string} userId - 使用者的 ID
 * @param {object} newData - 一個包含待更新欄位和值的物件，例如 { name: '新名字' }
 */
async function buildProfileConfirmationMessage(userId, newData) {
    const fieldMap = { name: '姓名', bio: '簡介', image_url: '照片' };
    const updatedFields = Object.keys(newData).map(key => fieldMap[key] || key).join('、');

    const client = await pgPool.connect();
    try {
        const res = await client.query('SELECT * FROM teachers WHERE line_user_id = $1', [userId]);
        const currentProfile = res.rows[0] || { name: '新老師', bio: '尚未填寫簡介', image_url: null };
        const previewProfile = { ...currentProfile, ...newData };
        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        
        return {
            type: 'flex',
            altText: `確認更新您的${updatedFields}`,
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `⚠️ 請確認更新內容`, weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#FFC107' },
                hero: { type: 'image', url: previewProfile.image_url || placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'md',
                    contents: [
                        { type: 'text', text: previewProfile.name, weight: 'bold', size: 'xl' },
                        { type: 'text', text: previewProfile.bio || '尚未填寫簡介', wrap: true, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: `✅ 確認更新${updatedFields}`, data: 'action=confirm_teacher_profile_update' } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            }
        };
    } finally {
        if (client) client.release();
    }
}

const WEEKDAYS = [
    { label: '週日', value: 0 }, { label: '週一', value: 1 }, { label: '週二', value: 2 },
    { label: '週三', value: 3 }, { label: '週四', value: 4 }, { label: '週五', value: 5 },
    { label: '週六', value: 6 },
];
// --- 對話狀態管理 ---
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
const pendingTeacherProfileEdit = {};
// [V34.0 新增]
const pendingReportGeneration = {};
const pendingAnnouncementCreation = {};
const pendingAnnouncementDeletion = {};
const repliedTokens = new Set();
const pendingProductEdit = {};
const pendingInventoryAdjust = {};
const pendingManualAdjustSearch = {}; 
const pendingPointOrderSearch = {};
const pendingShopOrderSearch = {};
const userProfileCache = new Map();
const userLastInteraction = {}; // [V28.0 新增] 用於智慧回覆機制的 Session 追蹤
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
    pendingTeacherProfileEdit,
    pendingMessageSearchQuery,
    pendingManualAdjustSearch,
    pendingPointOrderSearch,
    pendingShopOrderSearch,
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
    return [{ type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }];
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
    }, CONSTANTS.INTERVALS.CONVERSATION_TIMEOUT_MS);
    conversationState[userId] = { ...conversationState[userId], timeoutId };
}
async function handlePurchaseFlow(event, userId) {
    const text = event.message.text ? event.message.text.trim() : '';
    const user = await getUser(userId);
    const purchaseState = pendingPurchase[userId];

    if (!purchaseState) return { handled: false };
    let replyContent;

    switch (purchaseState.step) {
        case 'confirm_purchase':
            if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
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

                const replyText = `感謝您的購買！訂單已成立 (ID: ${formatIdForDisplay(order_id)})。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請隨時回到「點數查詢」選單，點擊「❗ 匯款待處理」卡片中的按鈕來回報您的後五碼。\n\n⚠️提醒：為確保您的權益，請於24小時內完成匯款與回報，逾時訂單將會自動取消。`;

                const flexMenu = await buildPointsMenuFlex(userId);
                replyContent = [{ type: 'text', text: replyText }, flexMenu];

            } else {
                replyContent = '請點擊「✅ 確認購買」或「❌ 取消操作」。';
            }
            return { handled: true, reply: replyContent };
        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const wasSuccessful = await withDatabaseClient(async (client) => {
                    const orderRes = await client.query('SELECT * FROM orders WHERE order_id = $1', [order_id]);
                    if (orderRes.rows.length > 0) {
                        const order = orderRes.rows[0];
                        order.last_5_digits = text;
                        order.status = 'pending_confirmation';
                        order.timestamp = new Date().toISOString();
                        await saveOrder(order, client);
                        return true;
                    }
                    return false;
                });
                delete pendingPurchase[userId];
                if (wasSuccessful) {
                    const flexMenu = await buildPointsMenuFlex(userId);
                    replyContent = [{type: 'text', text: `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後點數將自動加入您的帳戶。`}, flexMenu];
                    
                    if (TEACHER_ID) {
                        const notifyMessage = { type: 'text', text: `🔔 購點審核通知\n學員 ${user.name} 已提交匯款資訊。\n訂單ID: ${order_id}\n後五碼: ${text}\n請至「點數管理」->「待確認點數訂單」審核。`};
                        await enqueuePushTask(TEACHER_ID, notifyMessage).catch(e => console.error(e));
                    }
                } else {
                    replyContent = '找不到您的訂單，請重新操作。';
                }
            } else {
                replyContent = {
                    type: 'text',
                    text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。',
                    quickReply: { items: getCancelMenu() }
                };
            }
            return { handled: true, reply: replyContent };
    }
    return { handled: false };
}

// --- Teacher Command Handlers (V34.0 Refactor) ---

async function showCourseManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '課程與師資管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '🗓️ 課程與師資管理', color: '#ffffff', weight: 'bold', size: 'lg'}], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'text', text: '課程功能', size: 'sm', color: '#888888', weight: 'bold' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 新增課程系列', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 課程狀態查詢', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 管理已開課程', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES)}` } },
                    { type: 'separator', margin: 'xl' },
                    { type: 'text', text: '師資功能', size: 'sm', color: '#888888', weight: 'bold', margin: 'lg' },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📋 師資團隊', data: 'action=list_all_teachers&page=1' } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '👤 個人資訊', data: 'action=manage_personal_profile' } }
                ] 
            } 
        } 
    };
}

async function startAddCourseSeries(event, user) {
    const userId = user.id;
    pendingCourseCreation[userId] = { step: 'await_title' };
    setupConversationTimeout(userId, pendingCourseCreation, 'pendingCourseCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '新增課程逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showManageOpenCourses(event, user) {
    return showCourseSeries(1);
}

async function showCourseInquiry(event, user) {
    return showCourseRosterSummary(1);
}

async function showPointManagementMenu(event, user) {
    const pendingCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingOrdersLabel = '✅ 確認處理訂單';
    if (pendingCount > 0) { 
        pendingOrdersLabel = `✅ 確認處理訂單 (${pendingCount})`;
    }
    
    return { 
        type: 'flex', 
        altText: '點數管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '💎 點數管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingOrdersLabel, data: `action=view_pending_orders_page&page=1` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✍️ 手動調整點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢調整紀錄', data: `action=select_adjust_history_view_type` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_point_history_view_type` } }
                ] 
            } 
        } 
    };
}


async function showPendingPointOrders(event, user) {
    return showPendingOrders(1);
}

async function showStudentManagementMenu(event, user) {
    const unreadCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let unreadLabel = '💬 查看未回覆留言';
    if (unreadCount > 0) { 
        unreadLabel += ` (${unreadCount})`;
    }

    return { 
        type: 'flex', 
        altText: '學員管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '👤 學員管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🔍 查詢學員', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: unreadLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史留言', data: `action=select_message_history_view_type` } } 
                ] 
            } 
        } 
    };
}

async function startStudentSearch(event, user) {
    const userId = user.id;
    pendingStudentSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => { 
        if (pendingStudentSearchQuery[u]) { 
            delete pendingStudentSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢學員逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showUnreadTeacherMessages(event, user) {
    return showUnreadMessages(1);
}

async function startMessageSearch(event, user) {
    const userId = user.id;
    pendingMessageSearchQuery[userId] = {};
    setupConversationTimeout(userId, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => { 
        if (pendingMessageSearchQuery[u]) { 
            delete pendingMessageSearchQuery[u]; 
            const timeoutMessage = { type: 'text', text: '查詢歷史留言逾時，自動取消。'}; 
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
        } 
    });
    return { 
        type: 'text', 
        text: '請輸入您想查詢歷史留言的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementManagementMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '公告管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📢 公告管理', color: '#ffffff', weight: 'bold', size: 'lg' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 頒佈新公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🗑️ 刪除舊公告', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT)}` } } 
                ] 
            } 
        } 
    };
}
async function startAddAnnouncement(event, user) {
    const userId = user.id;
    pendingAnnouncementCreation[userId] = { step: 'await_content' };
    setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
        const timeoutMessage = { type: 'text', text: '頒佈公告操作逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入要頒佈的公告內容：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAnnouncementsForDeletionList(event, user) {
    return showAnnouncementsForDeletion(1);
}

async function showShopManagementMenu(event, user) {
    const pendingShopOrdersCount = await withDatabaseClient(client => 
        client.query("SELECT COUNT(*) FROM product_orders WHERE status = 'pending'")
    ).then(res => parseInt(res.rows[0].count, 10));
    let pendingShopOrdersLabel = '📋 查看待處理訂單';
    if (pendingShopOrdersCount > 0) { 
        pendingShopOrdersLabel += ` (${pendingShopOrdersCount})`;
    }

    return { 
        type: 'flex', 
        altText: '商城管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [ { type: 'text', text: '🛍️ 商城管理', weight: 'bold', size: 'lg', color: '#FFFFFF' } ], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '➕ 上架新商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🛒 管理販售中商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 管理已下架商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS)}` } }, 
                    { type: 'separator', margin: 'md'}, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingShopOrdersLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢歷史訂單', data: `action=select_shop_history_view_type` } }
                ] 
            } 
        } 
    };
}

async function startAddProduct(event, user) {
    const userId = user.id;
    pendingProductCreation[userId] = { step: 'await_name' };
    setupConversationTimeout(userId, pendingProductCreation, 'pendingProductCreation', u => { 
        const timeoutMessage = { type: 'text', text: '上架商品操作逾時，自動取消。' }; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入新商品的名稱：', 
        quickReply: { items: getCancelMenu() } 
    };
}

async function showAvailableProductsList(event, user) {
    return showProductManagementList(1, 'available');
}

async function showUnavailableProductsList(event, user) {
    return showProductManagementList(1, 'unavailable');
}

async function showShopOrderManagement(event, user) {
    return showPendingShopOrders(1);
}
async function showReportMenu(event, user) {
    return { 
        type: 'flex', 
        altText: '統計報表', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '📊 統計報表', weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#343A40', 
                paddingTop: 'lg', 
                paddingBottom: 'lg' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📈 課程報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💰 訂單報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '💎 點數報表', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.POINT_REPORT)}` } } 
                ] 
            } 
        } 
    };
}

async function showTimePeriodMenuForReport(event, user) {
    const text = event.message.text.trim();
    const reportType = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? 'course' : 'order';
    const title = text === CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT ? '課程報表' : '訂單報表';
    return { 
        type: 'flex', 
        altText: '選擇時間週期', 
        contents: { 
            type: 'bubble', 
            header: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: `📊 ${title}`, weight: 'bold', size: 'lg', color: '#FFFFFF' }], 
                backgroundColor: '#52b69a' 
            }, 
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'sm', 
                contents: [ 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本週', data: `action=generate_report&type=${reportType}&period=week` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本月', data: `action=generate_report&type=${reportType}&period=month` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '本季', data: `action=generate_report&type=${reportType}&period=quarter` } }, 
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '今年', data: `action=generate_report&type=${reportType}&period=year` } }, 
                ] 
            }, 
            footer: { 
                type: 'box', 
                layout: 'vertical', 
                contents: [{ type: 'text', text: '請選擇要查詢的時間區間', size: 'sm', color: '#AAAAAA', align: 'center'}] 
            } 
        } 
    };
}

async function generatePointReport(event, user) {
    const userId = user.id;
    const generateReportTask = async () => {
        return withDatabaseClient(async (client) => {
            const usersRes = await client.query(`SELECT name, points FROM users WHERE role = 'student' ORDER BY points DESC`); 
            const students = usersRes.rows;
            if (students.length === 0) { 
                return '目前沒有任何學員資料可供分析。'; 
            }
            const totalPoints = students.reduce((sum, s) => sum + s.points, 0); 
            const averagePoints = (totalPoints / students.length).toFixed(2);
            const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n'); 
            const zeroPointStudents = students.filter(s => s.points === 0).length;
            return `💎 全體學員點數報告 💎\n\n總學員數：${students.length} 人\n點數總計：${totalPoints} 點\n平均持有：${averagePoints} 點/人\n零點學員：${zeroPointStudents} 人\n\n👑 點數持有 Top 5：\n${top5}`;
        });
    };

    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));
    try {
        const result = await Promise.race([generateReportTask(), timeoutPromise]);
        if (result === 'timeout') {
            (async () => {
                const reportText = await generateReportTask();
                await enqueuePushTask(userId, { type: 'text', text: reportText });
            })();
            return '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。';
        } else { 
            return result;
        }
    } catch (err) { 
        console.error('❌ 即時生成點數報表失敗:', err);
        return '❌ 產生報表時發生錯誤，請稍後再試。'; 
    }
}

async function startManualAdjust(event, user) {
    const userId = user.id;
    pendingManualAdjust[userId] = { step: 'await_student_search' };
    setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => { 
        const timeoutMessage = { type: 'text', text: '手動調整點數逾時，自動取消。'}; 
        enqueuePushTask(u, timeoutMessage).catch(e => console.error(e)); 
    });
    return { 
        type: 'text', 
        text: '請輸入您想調整點數的學員姓名或 User ID：', 
        quickReply: { items: getCancelMenu() } 
    };
}
// --- Teacher Command Map (V34.0 Refactor) ---

const teacherCommandMap = {
    [CONSTANTS.COMMANDS.TEACHER.COURSE_MANAGEMENT]: showCourseManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_COURSE_SERIES]: startAddCourseSeries,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_OPEN_COURSES]: showManageOpenCourses,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_INQUIRY]: showCourseInquiry,
    [CONSTANTS.COMMANDS.TEACHER.POINT_MANAGEMENT]: showPointManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_POINT_ORDERS]: showPendingPointOrders,
    [CONSTANTS.COMMANDS.TEACHER.STUDENT_MANAGEMENT]: showStudentManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.SEARCH_STUDENT]: startStudentSearch,
    [CONSTANTS.COMMANDS.TEACHER.VIEW_MESSAGES]: showUnreadTeacherMessages,
    [CONSTANTS.COMMANDS.TEACHER.MESSAGE_SEARCH]: startMessageSearch,
    [CONSTANTS.COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT]: showAnnouncementManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_ANNOUNCEMENT]: startAddAnnouncement,
    [CONSTANTS.COMMANDS.TEACHER.DELETE_ANNOUNCEMENT]: showAnnouncementsForDeletionList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_MANAGEMENT]: showShopManagementMenu,
    [CONSTANTS.COMMANDS.TEACHER.ADD_PRODUCT]: startAddProduct,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS]: showAvailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS]: showUnavailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT]: showShopOrderManagement,
    [CONSTANTS.COMMANDS.TEACHER.REPORT]: showReportMenu,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.POINT_REPORT]: generatePointReport,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_ORDERS]: showPendingPointOrders, // Alias
    [CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS]: startManualAdjust,
};
function handleUnknownTeacherCommand(text) {
    let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'teacher');
        if (closestCommand) {
            teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
        } else {
            teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
        }
    }
    return teacherSuggestion;
}

// --- Main Command Handlers ---
async function getUserNames(userIds, dbClient) {
    if (!userIds || userIds.length === 0) {
        return new Map();
    }
    const usersRes = await dbClient.query("SELECT id, name FROM users WHERE id = ANY($1::text[])", [userIds]);
    return new Map(usersRes.rows.map(u => [u.id, u.name]));
}

async function showFailedTasks(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT * FROM failed_tasks ORDER BY failed_at DESC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );
        
        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTasks = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

 
        if (pageTasks.length === 0 && page === 1) {
            return '✅ 太好了！目前沒有任何失敗的任務。';
        }
        if (pageTasks.length === 0) {
            return '沒有更多失敗的任務了。';
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
    });
}

async function showSystemStatus() {
  return withDatabaseClient(async (db) => {
    const [pendingRes, processingRes, failedRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM tasks WHERE status = 'processing'"),
      db.query("SELECT COUNT(*) FROM failed_tasks")
    ]);

    const pendingCount = pendingRes.rows[0].count;
    const processingCount = processingRes.rows[0].count;
    const failedCount = failedRes.rows[0].count;

    const statusText = `
⚙️ 背景系統狀態 ⚙️

- 待處理任務: ${pendingCount} 個
- 正在處理中: ${processingCount} 個
- 失敗任務(DLQ): ${failedCount} 個

ℹ️ 「待處理任務」是系統即將要發送的排程訊息 (如課程提醒)。若「失敗任務」數量持續增加，請檢查 Worker 紀錄。
    `.trim();

    return statusText;
  });
}

async function showTeacherListForRemoval(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return withDatabaseClient(async (client) => {
        const res = await client.query(
            "SELECT id, name, picture_url FROM users WHERE role = 'teacher' ORDER BY name ASC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageTeachers = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

   
        if (pageTeachers.length === 0 && page === 1) {
            return '目前沒有任何已授權的老師可供移除。';
        }
        if (pageTeachers.length === 0) {
            return '沒有更多老師了。';
        }

        const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { type: 'image', url: t.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center',
                        contents: [
                            { type: 'text', text: t.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(t.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'primary',
                    color: '#DE5246',
                    height: 'sm',
                    action: { type: 'postback', label: '選擇此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${encodeURIComponent(t.name)}` }
                }]
            }
        }));
        const paginationBubble = createPaginationBubble('action=list_teachers_for_removal', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }

        return {
            type: 'flex',
            altText: '選擇要移除的老師',
            contents: { type: 'carousel', contents: teacherBubbles }
        };
    });
}
