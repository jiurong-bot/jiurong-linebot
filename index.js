// index.js - V43.3 (錯誤訊息通知)
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
const TEACHER_ID = process.env.TEACHER_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const STUDENT_RICH_MENU_ID = process.env.STUDENT_RICH_MENU_ID;
const TEACHER_RICH_MENU_ID = process.env.TEACHER_RICH_MENU_ID;
const ADMIN_RICH_MENU_ID = process.env.ADMIN_RICH_MENU_ID;
const CONSTANTS = {
  TIME: {
    ONE_DAY_IN_MS: 86400000,
    EIGHT_HOURS_IN_MS: 28800000,
    TWO_HOURS_IN_MS: 7200000,
    ONE_HOUR_IN_MS: 3600000,
  },
  IMAGES: { 
    PLACEHOLDER_AVATAR_USER: 'https://i.imgur.com/8l1Yd2S.png',
    PLACEHOLDER_AVATAR_COURSE: 'https://i.imgur.com/s43t5tQ.jpeg'
  },
  INTERVALS: {
    PING_INTERVAL_MS: 1000 * 60 * 5,
    CONVERSATION_TIMEOUT_MS: 1000 * 60 * 5,
    NOTIFICATION_CACHE_DURATION_MS: 1000 * 30,
    SESSION_TIMEOUT_MS: 1000 * 60 * 5, // [V28.0 新增] 對話階段超時時間 (5分鐘)
  },
  PAGINATION_SIZE: 9,
  PURCHASE_PLANS: [
    { points: 10, amount: 1000, label: '10 點 (1000元)' },
    { points: 20, amount: 2000, label: '20 點 (2000元)' },
    { points: 30, amount: 3000, label: '30 點 (3000元)' },
    { points: 50, amount: 5000, label: '50 點 (5000元)' },
    { points: 110, amount: 10000, label: '110 點 (10000元）' }, // 優惠方案
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
      TOGGLE_NOTIFICATIONS: '@切換推播',
      VIEW_ERROR_LOGS:'@查看錯誤日誌',
      FORCE_UPDATE_RICH_MENU: '@強制更新圖文選單' // 新增強制更新圖文選單的指令
      },
    TEACHER: {
      COURSE_MANAGEMENT: '@課程管理',
        ADD_COURSE_SERIES: '@新增課程系列',
        MANAGE_OPEN_COURSES: '@管理已開課程',
        COURSE_INQUIRY: '@課程查詢',
      POINT_MANAGEMENT: '@點數管理',
        PENDING_POINT_ORDERS: '@待確認點數訂單',
        MANUAL_ADJUST_POINTS: '@手動調整點數',
        VIEW_PURCHASE_HISTORY: '@查詢購點紀錄',
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
        MANAGE_SOLD_OUT_PRODUCTS: '@管理零庫存商品',
        MANAGE_PREORDER_PRODUCTS: '@管理預購中商品',
        MANAGE_FULFILLMENT: '@待出貨預購管理',
        SHOP_ORDER_MANAGEMENT: '@訂單管理',
        VIEW_SHOP_EXCHANGE_HISTORY: '@查詢購買紀錄',
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
      EXCHANGE_HISTORY: '@購買紀錄',
      CHECK_POINTS: '@查看剩餘點數',
      BUY_POINTS: '@購買點數',
      PURCHASE_HISTORY: '@購點紀錄',
      ADD_NEW_MESSAGE: '@新增一則留言',
      CANCEL_BOOKING: '@取消預約',
      CANCEL_WAITING: '@取消候補',
      CONFIRM_ADD_COURSE: '✅ 確認新增',
      CANCEL_ADD_COURSE: '❌ 取消新增',
      RETURN_POINTS_MENU: '返回點數管理',
      CONFIRM_BUY_POINTS: '✅ 確認購買',
      INPUT_LAST5_CARD_TRIGGER: '@輸入匯款後五碼',
      EDIT_LAST5_CARD_TRIGGER: '@修改匯款後五碼',
      CONFIRM_BOOKING: '✅ 確認預約',
      CONFIRM_CANCEL_BOOKING: '✅ 確認取消',
      CONFIRM_CANCEL_WAITING: '✅ 確認取消',
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


  return executeDbQuery(async (client) => {
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

 /* [V31.3 重構] 使用通用快取工具來讀取推播設定
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
        let isEnabled = true;
        // 預設值為 true，以防資料庫查詢失敗時卡住所有通知
        await executeDbQuery(async (db) => {
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
// [程式夥伴修改] V42.11 - 升級 enqueuePushTask 函式，整合開關邏輯
/**
 * [V24.0 新增] 將一個推播任務加入到資料庫佇列中
 * @param {string} recipientId - 收件人 User ID
 * @param {object|object[]} message - LINE 訊息物件或物件陣列
 * @param {object} [options={}] - (可選) 其他選項
 * @param {Date} [options.sendAt=null] - 預計發送時間
 * @param {string} [options.settingKey=null] - (學員專用) 要檢查的細項推播設定鍵
 */
async function enqueuePushTask(recipientId, message, { sendAt = null, settingKey = null } = {}) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);

  // 1. 檢查系統總開關 (僅對老師/管理員有效)
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  } 
  // 2. 檢查學員的細項開關 (如果 settingKey 有被提供)
  else if (settingKey) {
      const settings = await getGlobalNotificationSettings();
      // 如果找不到設定鍵或設定值為 false，就直接返回
      if (!settings[settingKey]) {
          console.log(`[Push Blocked] 因使用者設定 (${settingKey})，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  // 3. 如果通過所有檢查，就將任務加入資料庫
  try {
    await executeDbQuery(async (db) => {
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
// [程式夥伴修改] V42.11 - 升級 enqueueBatchPushTasks 函式，整合開關邏輯
/**
 * [V31.1 新增] 將多個推播任務批次加入到資料庫佇列中
 * @param {Array<object>} tasks - 任務物件的陣列，每個物件應包含 { recipientId: string, message: object|object[] }
 * @param {object} [options={}] - (可選) 其他選項
 * @param {string} [options.settingKey=null] - (學員專用) 要檢查的細項推播設定鍵
 */
async function enqueueBatchPushTasks(tasks, { settingKey = null } = {}) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  // 1. 檢查學員的細項開關 (如果 settingKey 有被提供)
  if (settingKey) {
    const settings = await getGlobalNotificationSettings();
    if (!settings[settingKey]) {
        console.log(`[Push Blocked] 因使用者設定 (${settingKey})，已阻擋此批次通知。`);
        return;
    }
  }

  // 2. 檢查系統總開關 (過濾掉老師/管理員的部分)
  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return;
    }
  }

  // 3. 如果通過所有檢查，就將任務加入資料庫
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
        sendTimestamps.push(now);
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await executeDbQuery(async (db) => {
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
 * [V35.3 新增] 查詢所有老師並發送通知給他們
 * @param {object|object[]} message - 要發送的 LINE 訊息物件或陣列
 */
async function notifyAllTeachers(message) {
  try {
    const teachers = await executeDbQuery(async (db) => {
      const res = await db.query("SELECT id FROM users WHERE role = 'teacher'");
      return res.rows;
    });


    if (teachers.length === 0) {
      console.log('[Notify] 找不到任何老師可以發送通知。');
      return;
    }


    const notificationTasks = teachers.map(teacher => ({
      recipientId: teacher.id,
      message: message
    }));


    await enqueueBatchPushTasks(notificationTasks);
    console.log(`[Notify] 已成功將通知任務加入佇列，準備發送給 ${teachers.length} 位老師。`);


  } catch (err) {
    console.error('❌ notifyAllTeachers 函式執行失敗:', err);
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
        await executeDbQuery(async (client) => {
      if (user.role === 'teacher') {
    // 1. 將三個計數查詢合併為一個，課程查詢維持不變
    const [statsRes, upcomingCoursesRes] = await Promise.all([
        client.query(`
            SELECT
                (SELECT COUNT(*) FROM feedback_messages WHERE status = 'new') AS new_messages_count,
                (SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation') AS pending_point_orders_count,
                (SELECT COUNT(*) FROM product_orders WHERE status IN ('pending_payment', 'pending_confirmation')) AS pending_shop_orders_count
        `),
        client.query(`
            SELECT title, time 
            FROM courses 
            WHERE time BETWEEN NOW() AND NOW() + interval '24 hours' 
            ORDER BY time ASC
        `)
    ]);

    // 2. 接收合併後的結果，它會在 statsRes.rows[0] 中
    const stats = statsRes.rows[0];

    // 3. 從新的結果物件中，透過我們設定的「別名」來取出計數
    notifications.newMessages = parseInt(stats.new_messages_count, 10);
    notifications.pendingPointOrders = parseInt(stats.pending_point_orders_count, 10);
    notifications.pendingShopOrders = parseInt(stats.pending_shop_orders_count, 10);
    notifications.upcomingCourses = upcomingCoursesRes.rows;
        
            } else if (user.role === 'admin') {
                const failedTasks = await client.query("SELECT COUNT(*) FROM failed_tasks");
                notifications.failedTasks = parseInt(failedTasks.rows[0].count, 10);

            } else if (user.role === 'student') {
                const [unreadReplies, newAnnouncements, upcomingCoursesRes] = await Promise.all([
                    client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [user.id]),
                    client.query("SELECT COUNT(*) FROM announcements WHERE id > $1", [user.last_seen_announcement_id || 0]),
                    client.query(`
                        SELECT title, time 
                        FROM courses 
                        WHERE students @> ARRAY[$1]::text[] 
                        AND time BETWEEN NOW() AND NOW() + interval '24 hours' 
                        ORDER BY time ASC
                    `, [user.id])
                ]);
                notifications.unreadReplies = parseInt(unreadReplies.rows[0].count, 10);
                notifications.newAnnouncements = parseInt(newAnnouncements.rows[0].count, 10);
                notifications.upcomingCourses = upcomingCoursesRes.rows;
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
/**
 * [程式夥伴新增] 檢查並更新使用者的 LINE Profile 資訊 (名稱和頭像)。
 * 只有在資料有變動，或距離上次快取超過特定時間時，才會實際執行更新。
 * @param {string} userId - 要檢查的使用者 ID。
 * @param {object} [currentUser=null] - (可選) 已從資料庫取出的使用者物件，避免重複查詢。
 * @returns {Promise<object>} - 回傳最新狀態的使用者物件。
 */
async function updateUserProfileIfNeeded(userId, currentUser = null) {
  // 步驟 1: 如果沒有傳入使用者物件，就從資料庫查詢一次。
  const user = currentUser || await getUser(userId);
  // 如果根本找不到使用者 (例如，在 follow 事件中)，就先不處理。
  if (!user) {
    console.log(`[Profile Update] 在 updateUserProfileIfNeeded 中找不到使用者 ${userId}，跳過更新。`);
    return null;
  }

  // 步驟 2: 檢查快取，如果短時間內已更新過，就直接返回，避免頻繁呼叫 API。
  const cachedData = userProfileCache.get(userId);
  const now = Date.now();
  // 10 分鐘的快取時間
  if (cachedData && (now - cachedData.timestamp < 10 * 60 * 1000)) {
    return user;
  }

  // 步驟 3: 呼叫 LINE API 並進行比對與更新。
  try {
    const profile = await client.getProfile(userId);
    const nameChanged = profile.displayName !== user.name;
    const pictureChanged = profile.pictureUrl && profile.pictureUrl !== user.picture_url;

    if (nameChanged || pictureChanged) {
      user.name = profile.displayName;
      user.picture_url = profile.pictureUrl;
      await saveUser(user); // 使用現有的 saveUser 函式儲存
      console.log(`[Profile Update] 已成功更新使用者 ${userId} 的個人資料。`);
    }

    // 更新快取時間戳
    userProfileCache.set(userId, { timestamp: now });
    return user; // 回傳更新後的 user 物件

  } catch (err) {
    console.error(`[Profile Update] 更新使用者 ${userId} 的資料時發生錯誤:`, err.message);
    return user; // 即使 API 呼叫失敗，也回傳原本的使用者物件，確保程式流程不中斷。
  }
}

/**
 * [新增] 檢查學員是否已有待處理的點數訂單
 * @param {string} userId - 要檢查的學員 User ID
 * @returns {Promise<boolean>} - 如果有待處理訂單則回傳 true，否則回傳 false
 */
async function hasPendingPointOrder(userId) {
    const res = await executeDbQuery(client =>
        client.query(
            `SELECT 1 FROM orders 
             WHERE user_id = $1 AND status IN ('pending_payment', 'pending_confirmation', 'rejected') 
             LIMIT 1`,
            [userId]
        )
    );
    return res.rows.length > 0;
}
/**
 * [程式夥伴新增] 檢查學員是否已有待處理的「商品」訂單
 * @param {string} userId - 要檢查的學員 User ID
 * @returns {Promise<boolean>} - 如果有待處理訂單則回傳 true，否則回傳 false
 */
async function hasPendingProductOrder(userId) {
    const res = await executeDbQuery(client =>
        client.query(
            `SELECT 1 FROM product_orders 
             WHERE user_id = $1 AND status IN ('pending_payment', 'pending_confirmation') 
             LIMIT 1`,
            [userId]
        )
    );
    return res.rows.length > 0;
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
             ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7, teacher_id = $8`,
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
/**
 * [V39.5 新增] 將詳細的錯誤資訊記錄到資料庫中。
 * @param {Error} error - 捕獲到的錯誤物件。
 * @param {string} [userId=null] - 發生錯誤時操作的使用者 ID。
 * @param {string} [context=''] - 錯誤發生的情境。
 * @returns {Promise<string|null>} - 回傳產生的唯一錯誤代碼，如果記錄失敗則回傳 null。
 */
async function logErrorToDb(error, userId = null, context = '') {
    // 產生一個基於時間戳的唯一錯誤代碼，例如：E-1724987654321
    const errorCode = `E-${Date.now()}`;
    try {
        await executeDbQuery(async (db) => {
            await db.query(
                `INSERT INTO error_logs (error_code, user_id, context, error_message, error_stack)
                 VALUES ($1, $2, $3, $4, $5)`,
                [errorCode, userId, context, error.message, error.stack]
            );
        });
        console.log(`[Error Logging] 已成功將錯誤 ${errorCode} 記錄至資料庫。`);
        return errorCode;
    } catch (dbError) {
        console.error(`❌ FATAL: 連錯誤日誌都寫入失敗!`, dbError);
        console.error('原始錯誤:', error);
        return null; // 回傳 null 表示寫入日誌失敗
    }
}
/**
 * [V39.5 重構] 統一的錯誤處理函式，整合資料庫記錄與使用者回覆。
 * @param {Error} error - 捕獲到的錯誤物件。
 * @param {string} replyToken - 用於回覆的 token。
 * @param {string} context - 錯誤發生的情境。
 * @param {string} [userId=null] - 發生錯誤時操作的使用者 ID。
 */
async function handleError(error, replyToken, context = '未知操作', userId = null) {
    console.error(`❌ 在執行 [${context}] 時為使用者 ${userId || 'N/A'} 發生錯誤:`, error.stack);

    // 步驟 1: 將錯誤記錄到資料庫並取得錯誤代碼
    const errorCode = await logErrorToDb(error, userId, context);

    // 步驟 2: 準備回覆給使用者的訊息
    let userMessage = `抱歉，系統發生了一點問題，請稍後再試。`;
    if (errorCode) {
        // 如果成功記錄錯誤，附上錯誤代碼
        userMessage = `抱歉，系統發生了一點問題，我們已記錄下來並會盡快修復！\n(錯誤代碼: ${errorCode})`;
    }

    // 步驟 3: 嘗試回覆給使用者
    try {
        if (replyToken) {
            await reply(replyToken, userMessage);
        }
    } catch (replyError) {
        console.error(`❌ 連錯誤回覆都失敗了 (ErrorCode: ${errorCode || 'N/A'}):`, replyError.message);
    }
}
/**
 * [程式夥伴新增] 批次更新所有使用者的圖文選單。
 * 此函式會在背景執行，避免 webhook 逾時。
 * @param {string} adminUserId - 觸發此操作的管理員 User ID，用於接收完成通知。
 */
function batchUpdateRichMenus(adminUserId) {
  console.log(`[Rich Menu] 由管理者 ${adminUserId} 觸發全用戶圖文選單更新...`);

  // 使用 IIFE (立即調用函式表達式) 讓這個任務在背景執行
  (async () => {
    let studentCount = 0;
    let teacherCount = 0;
    let adminCount = 0;
    let errorCount = 0;

    try {
      // 1. 從資料庫撈出所有使用者的 ID 和角色
      const users = await executeDbQuery(async (db) => {
        const res = await db.query("SELECT id, role FROM users");
        return res.rows;
      });

      if (users.length === 0) {
        await enqueuePushTask(adminUserId, { type: 'text', text: 'ℹ️ 圖文選單更新：資料庫中沒有任何使用者。' });
        return;
      }

      // 2. 準備所有要執行的 API 呼叫
      const updatePromises = users.map(user => {
        let targetMenuId = null;
        switch (user.role) {
          case 'student':
            targetMenuId = STUDENT_RICH_MENU_ID;
            studentCount++;
            break;
          case 'teacher':
            targetMenuId = TEACHER_RICH_MENU_ID;
            teacherCount++;
            break;
          case 'admin':
            targetMenuId = ADMIN_RICH_MENU_ID;
            adminCount++;
            break;
        }

        if (targetMenuId) {
          // 傳回一個 Promise
          return client.linkRichMenuToUser(user.id, targetMenuId)
            .catch(err => {
              console.error(`[Rich Menu] 為使用者 ${user.id} 更新選單失敗:`, err.originalError?.response?.data || err.message);
              errorCount++;
            });
        }
        return Promise.resolve(); // 對於沒有對應選單的角色，直接完成
      });

      // 3. 平行執行所有 API 呼叫
      await Promise.all(updatePromises);

      // 4. 任務完成後，發送報告給管理者
      const summary = `✅ 圖文選單批次更新完成！\n\n` +
                      `- 學員選單: ${studentCount} 人\n` +
                      `- 老師選單: ${teacherCount} 人\n` +
                      `- 管理員選單: ${adminCount} 人\n` +
                      `--------------------\n` +
                      `- 總計: ${users.length} 人\n` +
                      (errorCount > 0 ? `- 失敗: ${errorCount} 人 (請檢查後台日誌)` : '');

      await enqueuePushTask(adminUserId, { type: 'text', text: summary });

    } catch (err) {
      console.error('❌ 執行批次更新圖文選單時發生嚴重錯誤:', err);
      await enqueuePushTask(adminUserId, { type: 'text', text: `❌ 更新圖文選單時發生嚴重錯誤，請檢查後台日誌。` });
    }
  })();
}

/**
 * [V42.2 新增] 建立一個標準的候補邀請 Flex Message
 * @param {object} course - 課程物件，至少需要包含 id 和 title
 * @returns {object} - LINE Flex Message 物件
 */
function createWaitlistInvitationFlexMessage(course) {
  const mainTitle = getCourseMainTitle(course.title);
  return {
    type: 'flex',
    altText: '候補課程邀請',
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🔔 候補邀請', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#ff9e00' },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        { type: 'text', text: `您好！您候補的課程「${mainTitle}」現在有名額了！`, wrap: true },
        { type: 'text', text: '請在 15 分鐘內確認是否要預約，逾時將自動放棄資格喔。', size: 'sm', color: '#666666', wrap: true }
      ]},
      footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        { type: 'button', style: 'secondary', action: { type: 'postback', label: '😭 放棄', data: `action=waitlist_forfeit&course_id=${course.id}` } },
        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: '✅ 確認', data: `action=waitlist_confirm&course_id=${course.id}` } }
      ]}
    }
  };
}
/**
 * [V42.2 新增] 處理並通知候補名單中的下一位學員
 * @param {object} client - 資料庫連線 client
 * @param {string} courseId - 發生變動的課程 ID
 */
async function promoteNextOnWaitlist(client, courseId) {
  const courseRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [courseId]);
  if (courseRes.rows.length === 0) return; // 找不到課程就直接結束

  const course = courseRes.rows[0];
  const waiting = course.waiting || [];
  const students = course.students || [];

  // 當「名額未滿」且「還有人在候補」時，才需要遞補
  if (students.length < course.capacity && waiting.length > 0) {
    const isWithinTwoHours = new Date(course.time).getTime() - Date.now() < CONSTANTS.TIME.TWO_HOURS_IN_MS;
    const promotedUserId = waiting.shift(); // 取出第一位候補者

    if (isWithinTwoHours) {
      // 新邏輯：發送限時邀請
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 分鐘後過期
      await client.query(
        `INSERT INTO waitlist_notifications (course_id, user_id, status, expires_at) VALUES ($1, $2, 'pending', $3)`,
        [course.id, promotedUserId, expiresAt]
      );
      // 使用新的輔助函式來建立訊息
      const invitationMessage = createWaitlistInvitationFlexMessage(course);
      await enqueuePushTask(promotedUserId, invitationMessage, { settingKey: 'student_new_announcement' });
    } else {
      // 舊邏輯：直接遞補
      students.push(promotedUserId);
      const notifyMessage = { type: 'text', text: `🎉 候補成功通知 🎉\n您候補的課程「${getCourseMainTitle(course.title)}」已有空位，已為您自動預約成功！`};
      await enqueuePushTask(promotedUserId, notifyMessage, { settingKey: 'student_new_announcement' });
    }

    // 無論是哪種邏輯，最後都要更新課程的候補名單
    await client.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [students, waiting, course.id]);
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
    // [新增] 印出完整的訊息內容，方便除錯
    console.log('[REPLY-PAYLOAD]', JSON.stringify(messages, null, 2));
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
/**
 * [新增] 建立一個標準化的 Flex Message 標頭
 * @param {string} title - 標頭要顯示的文字
 * @param {string} [backgroundColor='#343A40'] - 標頭的背景顏色 (可選)
 * @returns {object} - Flex Message 的 header 物件
 */
function createStandardHeader(title, backgroundColor = '#343A40') {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [{ 
      type: 'text', 
      text: title, 
      color: '#ffffff', 
      weight: 'bold', 
      size: 'lg' 
    }],
    backgroundColor: backgroundColor,
    paddingTop: 'lg',
    paddingBottom: 'lg'
  };
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
 * [新增] 僅格式化日期，不包含時間
 * @param {string} isoString - ISO 格式的時間字串
 * @returns {string} - 回傳格式為 MM-DD (週X)
 */
function formatDateOnly(isoString) {
    if (!isoString) return '無效日期';
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat('zh-TW', { 
        month: '2-digit', 
        day: '2-digit', 
        weekday: 'short', 
        timeZone: 'Asia/Taipei' 
    });
    const parts = formatter.formatToParts(date);
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    let weekday = parts.find(p => p.type === 'weekday').value;
    if (weekday.startsWith('週')) weekday = weekday.slice(-1);
    return `${month}-${day}（${weekday}）`;
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
            const dayOfWeek = now.getDay();
            // Sunday - 0, Monday - 1, ...
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            // Adjust to make Monday the first day
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
  for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j;
  }
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
// [程式夥伴修改] V42.4b - 修正重複訂單問題
async function buildPointsMenuFlex(userId) {
    const user = await getUser(userId);
    if (!user) return { type: 'text', text: '無法獲取您的使用者資料。' };

    // [修正] 擴大查詢範圍，納入所有待處理狀態，並只取最新一筆
    const pendingOrderRes = await executeDbQuery(client =>
        client.query(
            "SELECT * FROM orders WHERE user_id = $1 AND status IN ('pending_payment', 'pending_confirmation', 'rejected') ORDER BY timestamp DESC LIMIT 1",
            [userId]
        )
    );
    const pendingOrder = pendingOrderRes.rows.length > 0 ? pendingOrderRes.rows[0] : null;

    const bodyContents = [];

    // 如果找到任何待處理的訂單，就建立一個詳細的提示卡
    if (pendingOrder) {
        // --- [整合] 從 showPurchaseHistory 借用並簡化邏輯，以顯示更詳細的狀態 ---
        let actionButton = null;
        let cardColor, statusText, additionalInfo = '';
        const isTransfer = pendingOrder.payment_method === 'transfer';

        // 根據訂單狀態決定顯示的文字和按鈕
        if (pendingOrder.status === 'pending_confirmation') {
            // 如果是轉帳訂單，提供「修改後五碼」的選項
            if (isTransfer) { 
                actionButton = {
                    type: 'button', style: 'primary', height: 'sm', color: '#ff9e00', margin: 'md',
                    action: { type: 'postback', label: '修改匯款後五碼', displayText: '我要修改匯款後五碼', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER)}` }
                };
            }
            cardColor = '#ff9e00'; 
            statusText = '已提交，等待老師確認';
        } else if (pendingOrder.status === 'rejected') {
            if (isTransfer) {
                actionButton = {
                    type: 'button', style: 'primary', height: 'sm', color: '#d90429', margin: 'md',
                    action: { type: 'postback', label: '重新提交後五碼', displayText: '我要重新提交後五碼', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER)}` }
                };
            }
            cardColor = '#d90429'; 
            statusText = '訂單被老師退回'; 
            additionalInfo = '請檢查金額或後五碼是否有誤。';
        } else { // status === 'pending_payment'
            if (isTransfer) {
                actionButton = {
                    type: 'button', style: 'primary', height: 'sm', color: '#DE5246', margin: 'md',
                    action: { type: 'postback', label: '點此輸入匯款後五碼', displayText: '我要輸入匯款後五碼', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER)}` }
                };
            }
            cardColor = '#f28482'; 
            statusText = '待付款';
        }

        // 為所有待處理訂單都加入「取消訂單」按鈕
        const cancelButton = {
            type: 'button', style: 'link', height: 'sm', margin: 'sm', color: '#999999',
            action: { type: 'postback', label: '取消此訂單', data: `action=cancel_pending_order_start&order_id=${pendingOrder.order_id}` }
        };
        
        bodyContents.push({
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FFF1F0', cornerRadius: 'md', spacing: 'sm',
            contents: [
                { type: 'text', text: `❗️ 您有一筆訂單 - ${statusText}`, weight: 'bold', color: cardColor, size: 'md', align: 'center', wrap: true },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `${pendingOrder.points} 點 / ${pendingOrder.amount} 元 (${isTransfer ? '轉帳' : '現金'})`, align: 'center', size: 'sm', margin: 'md', wrap: true },
                ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', color: '#B00020', wrap: true, align: 'center', margin: 'sm' }] : []),
                ...(actionButton ? [actionButton] : []), // 只在有動作時顯示主要按鈕
                cancelButton // 總是顯示取消按鈕
            ]
        });
        bodyContents.push({ type: 'separator', margin: 'lg' });
    }
    
    // 原有的點數餘額顯示 (這部分維持不變)
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
            header: createStandardHeader('💎 點數查詢'),
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
 * [程式夥伴新增] 建立商城主選單，動態顯示待處理的商品訂單
 * @param {string} userId 
 * @returns {Promise<object>}
 */
async function buildShopMenuFlex(userId) {
    const pendingOrderRes = await executeDbQuery(client =>
        client.query(
            "SELECT * FROM product_orders WHERE user_id = $1 AND status IN ('pending_payment', 'pending_confirmation') ORDER BY created_at DESC LIMIT 1",
            [userId]
        )
    );
    const pendingOrder = pendingOrderRes.rows.length > 0 ? pendingOrderRes.rows[0] : null;

    const bodyContents = [];

    // 如果有待處理的商品訂單，就顯示提示卡
    if (pendingOrder) {
        let actionButton = null;
        let statusText, statusColor;
        const isTransfer = pendingOrder.payment_method === 'transfer';

        if (pendingOrder.status === 'pending_payment' && isTransfer) {
            statusText = '❗ 待回報匯款';
            statusColor = '#f28482';
            actionButton = {
                type: 'button', style: 'primary', height: 'sm', color: statusColor, margin: 'md',
                action: { type: 'postback', label: '輸入匯款後五碼', data: `action=report_shop_last5&orderUID=${pendingOrder.order_uid}` }
            };
        } else if (pendingOrder.status === 'pending_payment' && !isTransfer) {
            statusText = '🤝 待現金付款';
            statusColor = '#1A759F';
        } else { // pending_confirmation
            statusText = '🕒 款項確認中';
            statusColor = '#ff9e00';
        }

        const cancelButton = {
            type: 'button', style: 'link', height: 'sm', margin: 'sm', color: '#999999',
            action: { type: 'postback', label: '取消此訂單', data: `action=cancel_pending_product_order_start&orderUID=${pendingOrder.order_uid}` }
        };

        bodyContents.push({
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#F0FFF3', cornerRadius: 'md', spacing: 'sm',
            contents: [
                { type: 'text', text: `您有一筆商品訂單 - ${statusText}`, weight: 'bold', color: statusColor, size: 'md', align: 'center', wrap: true },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `${pendingOrder.product_name}\n金額：${pendingOrder.amount} 元`, align: 'center', size: 'sm', margin: 'md', wrap: true },
                ...(actionButton ? [actionButton] : []),
                cancelButton
            ]
        });
        bodyContents.push({ type: 'separator', margin: 'lg' });
    }

    // 商城主要按鈕
    bodyContents.push(
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🛒 瀏覽商品', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.VIEW_SHOP_PRODUCTS)}` } },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 我的購買紀錄', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.EXCHANGE_HISTORY)}` } }
    );

    return {
        type: 'flex', altText: '活動商城',
        contents: {
            type: 'bubble', size: 'giga',
            header: createStandardHeader('🛍️ 活動商城', '#34A0A4'),
            body: {
                type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                contents: bodyContents
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
        
        return {
            type: 'flex',
            altText: `確認更新您的${updatedFields}`,
            contents: {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `⚠️ 請確認更新內容`, weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#FFC107' },
                hero: { type: 'image', url: previewProfile.image_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
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
const userProfileCache = new Map();
const userLastInteraction = {}; // [V28.0 新增] 用於智慧回覆機制的 Session 追蹤
const pendingShopPayment = {}; // [V35.5 新增] 處理商城現金支付的對話狀態
// [新增] 查詢歷史紀錄的對話狀態
const pendingPurchaseHistorySearch = {};
const pendingExchangeHistorySearch = {};
const pendingMessageHistorySearch = {};
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
    pendingShopPayment, // [V35.5 新增]
    pendingPurchaseHistorySearch,
    pendingExchangeHistorySearch,
    pendingMessageHistorySearch,
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
        case 'input_last5':
        case 'edit_last5':
            if (/^\d{5}$/.test(text)) {
                const order_id = purchaseState.data.order_id;
                const wasSuccessful = await executeDbQuery(async (client) => {
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
                        await notifyAllTeachers(notifyMessage);
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
            header:createStandardHeader('🗓️ 課程與師資管理'),
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
    const pendingCount = await executeDbQuery(client => 
        client.query("SELECT COUNT(*) FROM orders WHERE status IN ('pending_confirmation', 'pending_payment')")
    ).then(res => parseInt(res.rows[0].count, 10));

    // 準備帶有計數的按鈕標籤文字
    let pendingPointOrdersLabel = '✅ 待確認點數訂單';
    if (pendingCount > 0) { 
        pendingPointOrdersLabel = `✅ 待確認點數訂單 (${pendingCount})`;
    }
    
    return { 
        type: 'flex', 
        altText: '點數管理', 
        contents: { 
            type: 'bubble', 
            size: 'giga', 
            header:createStandardHeader('💎 點數管理'),
            body: { 
                type: 'box', 
                layout: 'vertical', 
                spacing: 'md', 
                paddingAll: 'lg', 
                contents: [ 
                    // [V35.6 修正] 在按鈕 label 中使用動態變數
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingPointOrdersLabel, data: `action=view_pending_orders_page&page=1` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✍️ 手動調整點數', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢購點紀錄', data: `action=select_purchase_history_view_type` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '⚙️ 查詢手動紀錄', data: `action=select_adjust_history_view_type` } } 
                ] 
            } 
        } 
    };
}


async function showPendingPointOrders(event, user) {
    return showPendingOrders(1);
}


async function showStudentManagementMenu(event, user) {
    const unreadCount = await executeDbQuery(client => 
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
            header: createStandardHeader('📢 公告管理'),
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
    // [優化] 將 4 個產品相關的計數查詢合併為 1 個，以提升效能
    const productCounts = await executeDbQuery(client =>
        client.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'preorder') AS preorder_count,
                COUNT(*) FILTER (WHERE inventory <= 0 AND status = 'available') AS sold_out_count,
                COUNT(*) FILTER (WHERE status = 'available') AS available_count,
                COUNT(*) FILTER (WHERE status = 'unavailable') AS unavailable_count
            FROM products
        `)
    ).then(res => ({
        preorderCount: parseInt(res.rows[0].preorder_count, 10),
        soldOutCount: parseInt(res.rows[0].sold_out_count, 10),
        availableCount: parseInt(res.rows[0].available_count, 10),
        unavailableCount: parseInt(res.rows[0].unavailable_count, 10)
    }));

    // 查詢待處理的「商品訂單」數量
    const pendingShopOrdersCount = await executeDbQuery(client => 
        client.query("SELECT COUNT(*) FROM product_orders WHERE status IN ('pending_payment', 'pending_confirmation')")
    ).then(res => parseInt(res.rows[0].count, 10));

    // 查詢有多少商品系列已停止預購，但「待通知出貨」
    const fulfillmentCount = await executeDbQuery(client =>
        client.query(`
            SELECT COUNT(DISTINCT p.id) 
            FROM products p 
            JOIN product_preorders pp ON p.id = pp.product_id 
            WHERE p.status = 'unavailable' AND pp.status = 'active'
        `)
    ).then(res => parseInt(res.rows[0].count, 10));

    // --- 動態產生所有按鈕的標籤 ---
    
    // [新] 管理販售中商品
    let availableLabel = '🛒 管理販售中商品';
    if (productCounts.availableCount > 0) {
        availableLabel += ` (${productCounts.availableCount})`;
    }

    // [新] 管理已下架商品
    let unavailableLabel = '📦 管理已下架商品';
    if (productCounts.unavailableCount > 0) {
        unavailableLabel += ` (${productCounts.unavailableCount})`;
    }
    
    let preorderLabel = '🚀 管理預購中商品';
    if (productCounts.preorderCount > 0) {
        preorderLabel += ` (${productCounts.preorderCount})`;
    }

    let fulfillmentLabel = '🚚 待出貨預購管理';
    if (fulfillmentCount > 0) {
        fulfillmentLabel += ` (${fulfillmentCount})`;
    }

    let soldOutLabel = '📦 管理零庫存商品';
    if (productCounts.soldOutCount > 0) {
        soldOutLabel += ` (${productCounts.soldOutCount})`;
    }

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
                    // [修改] 使用動態標籤
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: availableLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS)}` } }, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: preorderLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_PREORDER_PRODUCTS)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: fulfillmentLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_FULFILLMENT)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: soldOutLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_SOLD_OUT_PRODUCTS)}` } },
                    // [修改] 使用動態標籤
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: unavailableLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS)}` } }, 
                    { type: 'separator', margin: 'md'}, 
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: pendingShopOrdersLabel, data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT)}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📜 查詢購買紀錄', data: `action=select_exchange_history_view_type` } } 
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
            header: createStandardHeader('📊 統計報表'),
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
        return executeDbQuery(async (client) => {
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
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_SOLD_OUT_PRODUCTS]: (event, user) => showSoldOutProducts(1),
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_PREORDER_PRODUCTS]: (event, user) => showPreorderProducts(1),
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_FULFILLMENT]: (event, user) => showFulfillmentList(1),
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_AVAILABLE_PRODUCTS]: showAvailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.MANAGE_UNAVAILABLE_PRODUCTS]: showUnavailableProductsList,
    [CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT]: showShopOrderManagement,
    [CONSTANTS.COMMANDS.TEACHER.REPORT]: showReportMenu,
    [CONSTANTS.COMMANDS.TEACHER.COURSE_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.ORDER_REPORT]: showTimePeriodMenuForReport,
    [CONSTANTS.COMMANDS.TEACHER.POINT_REPORT]: generatePointReport,
    [CONSTANTS.COMMANDS.TEACHER.PENDING_ORDERS]: showPendingPointOrders, 
    [CONSTANTS.COMMANDS.TEACHER.MANUAL_ADJUST_POINTS]: startManualAdjust,
    [CONSTANTS.COMMANDS.TEACHER.VIEW_PURCHASE_HISTORY]: showPurchaseHistoryList,
    [CONSTANTS.COMMANDS.TEACHER.VIEW_SHOP_EXCHANGE_HISTORY]: showExchangeHistoryList,
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
    return executeDbQuery(async (client) => {
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
// [程式夥伴修改] V42.12 - 新增分類總開關
/**
 * [V39.0 修改] 取得所有全局通知設定
 * @returns {Promise<object>} 一個包含所有通知設定狀態的物件
 */
async function getGlobalNotificationSettings() {
    // 預設所有通知都是開啟的
    const settings = {
        // [新增] 分類總開關
        admin_notifications_enabled: true,
        teacher_notifications_enabled: true,
        student_notifications_enabled: true,

        // [新增] 管理員細項開關
        admin_failed_task_alert_enabled: true,
        
        // 老師細項開關
        teacher_class_reminder_24hr: true,
        teacher_new_order: true,
        teacher_new_message: true,

        // 學員細項開關
        student_class_reminder_1hr: true,
        student_order_result: true,
        student_message_reply: true,
        student_welcome_message: true,
        student_new_announcement: true
    };

    // 所有要去資料庫查詢的 key
    const allSettingKeys = [
        'admin_notifications_enabled', 'teacher_notifications_enabled', 'student_notifications_enabled',
        'admin_failed_task_alert_enabled',
        'teacher_class_reminder_24hr_enabled', 'teacher_new_order_enabled', 'teacher_new_message_enabled',
        'student_class_reminder_1hr_enabled', 'student_order_result_enabled', 'student_message_reply_enabled',
        'student_welcome_message_enabled', 'student_new_announcement_enabled'
    ];

    await executeDbQuery(async (db) => {
        const res = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1::text[])", [allSettingKeys]);
        
        const dbSettings = new Map(res.rows.map(row => [row.setting_key, row.setting_value === 'true']));

        // 用資料庫的值更新預設設定
        settings.admin_notifications_enabled = dbSettings.get('admin_notifications_enabled') ?? true;
        settings.teacher_notifications_enabled = dbSettings.get('teacher_notifications_enabled') ?? true;
        settings.student_notifications_enabled = dbSettings.get('student_notifications_enabled') ?? true;
        
        settings.admin_failed_task_alert_enabled = dbSettings.get('admin_failed_task_alert_enabled') ?? true;

        settings.teacher_class_reminder_24hr = dbSettings.get('teacher_class_reminder_24hr_enabled') ?? true;
        settings.teacher_new_order = dbSettings.get('teacher_new_order_enabled') ?? true;
        settings.teacher_new_message = dbSettings.get('teacher_new_message_enabled') ?? true;

        settings.student_class_reminder_1hr = dbSettings.get('student_class_reminder_1hr_enabled') ?? true;
        settings.student_order_result = dbSettings.get('student_order_result_enabled') ?? true;
        settings.student_message_reply = dbSettings.get('student_message_reply_enabled') ?? true;
        settings.student_welcome_message = dbSettings.get('student_welcome_message_enabled') ?? true;
        settings.student_new_announcement = dbSettings.get('student_new_announcement_enabled') ?? true;
    });

    return settings;
}
/**
 * [程式夥伴修正] V42.20 - 建立「通知細項設定」子選單 (修正版，改為穩定的單欄佈局)
 * @returns {Promise<object>} Flex Message 物件
 */
async function buildNotificationSettingsFlex() {
    const settings = await getGlobalNotificationSettings();

    // 輔助函式，用於建立一個開關按鈕
    const createToggleButton = (label, key, isEnabled, isFullWidth = false) => ({
        type: 'button',
        style: isEnabled ? 'primary' : 'secondary',
        color: isEnabled ? '#28a745' : '#6c757d',
        height: 'sm',
        action: {
            type: 'postback',
            label: `${label}: ${isEnabled ? '開' : '關'}`,
            data: `action=toggle_global_setting&key=${key}&value=${isEnabled}`
        },
        ...(isFullWidth ? {} : { flex: 1 }) // 如果不是全寬，才需要 flex
    });

    const bodyContents = [];

    // --- 分類總開關 (三欄式) ---
    bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
            createToggleButton('管理員', 'admin_notifications_enabled', settings.admin_notifications_enabled),
            createToggleButton('老師', 'teacher_notifications_enabled', settings.teacher_notifications_enabled),
            createToggleButton('學員', 'student_notifications_enabled', settings.student_notifications_enabled),
        ]
    });

    // --- 管理員細項 ---
    if (settings.admin_notifications_enabled) {
        bodyContents.push({ type: 'separator', margin: 'xl' }, { type: 'text', text: '管理員通知細項', weight: 'bold', margin: 'md' });
        bodyContents.push(createToggleButton('失敗任務提醒', 'admin_failed_task_alert_enabled', settings.admin_failed_task_alert_enabled, true));
    }

    // --- 老師細項 ---
    if (settings.teacher_notifications_enabled) {
        bodyContents.push({ type: 'separator', margin: 'xl' }, { type: 'text', text: '老師通知細項', weight: 'bold', margin: 'md' });
        bodyContents.push(createToggleButton('24H課程提醒', 'teacher_class_reminder_24hr_enabled', settings.teacher_class_reminder_24hr, true));
        bodyContents.push(createToggleButton('新訂單通知', 'teacher_new_order_enabled', settings.teacher_new_order, true));
        bodyContents.push(createToggleButton('新留言通知', 'teacher_new_message_enabled', settings.teacher_new_message, true));
    }

    // --- 學員細項 ---
    if (settings.student_notifications_enabled) {
        bodyContents.push({ type: 'separator', margin: 'xl' }, { type: 'text', text: '學員通知細項', weight: 'bold', margin: 'md' });
        bodyContents.push(createToggleButton('1H上課提醒', 'student_class_reminder_1hr_enabled', settings.student_class_reminder_1hr, true));
        bodyContents.push(createToggleButton('訂單結果通知', 'student_order_result_enabled', settings.student_order_result, true));
        bodyContents.push(createToggleButton('老師回覆通知', 'student_message_reply_enabled', settings.student_message_reply, true));
        bodyContents.push(createToggleButton('新好友歡迎', 'student_welcome_message_enabled', settings.student_welcome_message, true));
        bodyContents.push(createToggleButton('新公告提醒', 'student_new_announcement_enabled', settings.student_new_announcement, true));
    }

    return {
        type: 'flex',
        altText: '通知細項設定',
        contents: {
            type: 'bubble',
            size: 'giga',
            header: createStandardHeader('⚙️ 通知細項設定'),
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'lg',
                spacing: 'sm', // 縮小間距讓版面更緊湊
                contents: bodyContents
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'link',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: '⬅️ 返回主選單',
                        data: 'action=view_admin_panel'
                    }
                }]
            }
        }
    };
}

/**
 * [程式夥伴新增] V42.19 - 建立「常用管理功能」子選單
 * @returns {Promise<object>} Flex Message 物件
 */
async function buildManagementFunctionsFlex() {
    // 輔助函式，建立一個功能按鈕
    const createMenuButton = (label, command) => ({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: {
            type: 'postback',
            label: label,
            data: `action=run_command&text=${encodeURIComponent(command)}`
        },
        flex: 1
    });

    // 將按鈕排列成兩欄的網格
    const buttons = [
        createMenuButton('系統狀態', CONSTANTS.COMMANDS.ADMIN.SYSTEM_STATUS),
        createMenuButton('失敗任務管理', CONSTANTS.COMMANDS.ADMIN.FAILED_TASK_MANAGEMENT),
        createMenuButton('查看錯誤日誌', CONSTANTS.COMMANDS.ADMIN.VIEW_ERROR_LOGS),
        createMenuButton('更新圖文選單', CONSTANTS.COMMANDS.ADMIN.FORCE_UPDATE_RICH_MENU),
        createMenuButton('授權老師', CONSTANTS.COMMANDS.ADMIN.ADD_TEACHER),
        createMenuButton('移除老師', CONSTANTS.COMMANDS.ADMIN.REMOVE_TEACHER),
        createMenuButton('模擬學員身份', CONSTANTS.COMMANDS.ADMIN.SIMULATE_STUDENT),
        createMenuButton('模擬老師身份', CONSTANTS.COMMANDS.ADMIN.SIMULATE_TEACHER),
    ];

    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) {
        const rowButtons = [buttons[i]];
        if (buttons[i + 1]) {
            rowButtons.push(buttons[i + 1]);
        } else {
            rowButtons.push({ type: 'box', flex: 1, contents: [] });
        }
        rows.push({
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: rowButtons,
            margin: 'md'
        });
    }

    return {
        type: 'flex',
        altText: '常用管理功能',
        contents: {
            type: 'bubble',
            size: 'giga',
            header: createStandardHeader('🛠️ 常用管理功能'),
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'lg',
                spacing: 'sm',
                contents: rows
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'link',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: '⬅️ 返回主選單',
                        data: 'action=view_admin_panel'
                    }
                }]
            }
        }
    };
}
// [程式夥伴修改] V42.19 - 重新設計管理者面板為多層次選單
async function buildAdminPanelFlex() {
    const isMasterEnabled = await getNotificationStatus();
    const bodyContents = [];

    // 1. 系統總開關
    bodyContents.push({
        type: 'button',
        action: {
            type: 'postback',
            label: isMasterEnabled ? '所有通知：🟢 開啟中' : '所有通知：🔴 已關閉',
            displayText: `正在切換所有通知為「${isMasterEnabled ? '關閉' : '開啟'}」`,
            data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.ADMIN.TOGGLE_NOTIFICATIONS)}`
        },
        style: isMasterEnabled ? 'primary' : 'secondary',
        color: isMasterEnabled ? '#28a745' : '#dc3545',
    });

    bodyContents.push({ type: 'separator', margin: 'xl' });

    // 2. 根據總開關狀態，決定是否顯示通知設定入口
    if (isMasterEnabled) {
        bodyContents.push({
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
                type: 'postback',
                label: '⚙️ 通知細項設定',
                data: 'action=view_notification_settings'
            }
        });
    } else {
        bodyContents.push({
            type: 'text',
            text: '總開關已關閉，所有通知細項設定已隱藏。',
            align: 'center',
            size: 'sm',
            color: '#888888',
            margin: 'md',
            wrap: true
        });
    }

    // 3. 常用管理功能入口 (永遠顯示)
    bodyContents.push({
        type: 'button',
        style: 'secondary',
        height: 'sm',
        action: {
            type: 'postback',
            label: '🛠️ 常用管理功能',
            data: 'action=view_management_functions'
        }
    });

    // 4. 組裝成最後的 Flex Message
    return {
        type: 'flex',
        altText: '管理者控制面板',
        contents: {
            type: 'bubble',
            size: 'giga',
            header: createStandardHeader('⚙️ 管理者控制面板'),
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'lg',
                spacing: 'md',
                contents: bodyContents
            }
        }
    };
}

async function showSystemStatus() {
  return executeDbQuery(async (db) => {
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

/**
 * [V39.5 新增] 顯示系統錯誤日誌列表。
 * @param {number} page - 當前頁碼。
 * @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息。
 */
async function showErrorLogs(page) {
    // 內部函式：定義如何將一筆資料庫的 row 轉換成一個 Flex Bubble
    const mapRowToBubble = (log) => {
        const errorMessage = log.error_message || '沒有錯誤訊息。';
        const user = log.user_id ? `${log.user_id.substring(0, 15)}...` : 'N/A';
        
        return {
            type: 'bubble',
            size: 'giga',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: `🚨 錯誤代碼`, weight: 'bold', color: '#FFFFFF' },
                           { type: 'text', text: `${log.error_code}`, color: '#FFFFFF', size: 'sm' }],
                backgroundColor: '#d9534f',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                            { type: 'text', text: '發生時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: formatDateTime(log.created_at), color: '#666666', size: 'sm', flex: 5, wrap: true }
                        ]
                    },
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                            { type: 'text', text: '使用者ID', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: user, color: '#666666', size: 'sm', flex: 5, wrap: true }
                        ]
                    },
                    {
                        type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                            { type: 'text', text: '發生情境', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: log.context, color: '#666666', size: 'sm', flex: 5, wrap: true }
                        ]
                    },
                    {
                        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                            { type: 'text', text: '錯誤訊息', color: '#aaaaaa', size: 'sm' },
                            { type: 'text', text: errorMessage.substring(0, 100), color: '#666666', size: 'sm', wrap: true, margin: 'md' }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '🗑️ 刪除此紀錄',
                            data: `action=delete_error_log&id=${log.id}`
                        }
                    }
                ]
            }
        };
    };

    // 使用我們通用的分頁輪播產生器來建立訊息
    return createPaginatedCarousel({
        altText: '系統錯誤日誌',
        baseAction: 'action=view_error_logs',
        page: page,
        dataQuery: "SELECT * FROM error_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        queryParams: [],
        mapRowToBubble: mapRowToBubble,
        noDataMessage: '✅ 太好了！目前沒有任何錯誤日誌。'
    });
}

async function showTeacherListForRemoval(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
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

        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { type: 'image', url: t.picture_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
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
// [程式夥伴修改] V40.10.4 - 調整購點紀錄中「待處理訂單」的顯示順序
async function showPurchaseHistory(userId, page) { // page 參數暫時保留
    return executeDbQuery(async (client) => {
        const res = await client.query(
            `SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 20`,
            [userId]
        );

        if (res.rows.length === 0) {
             return '您沒有任何購點紀錄。';
        }

        const pendingPointOrders = [];
        const historyPointOrders = [];

        res.rows.forEach(order => {
            if (['pending_payment', 'pending_confirmation', 'rejected'].includes(order.status)) {
                pendingPointOrders.push(order);
            } else {
                historyPointOrders.push(order);
            }
        });

        const bodyContents = [];
        const separator = { type: 'separator', margin: 'md' };

        if (pendingPointOrders.length > 0) {
            bodyContents.push({ type: 'text', text: '待處理訂單', weight: 'bold', size: 'lg', margin: 'md', color: '#1A759F' });
            pendingPointOrders.forEach(order => {
                let actionButtonLabel, cardColor, statusText, actionCmd, additionalInfo = '';
                // [新增] 建立一個 cancelButton 變數
                let cancelButton = null;

                if (order.status === 'pending_confirmation') {
                    actionButtonLabel = '修改匯款後五碼'; actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardColor = '#ff9e00'; statusText = '已提交，等待老師確認';
                } else if (order.status === 'rejected') {
                    actionButtonLabel = '重新提交後五碼'; actionCmd = CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardColor = '#d90429'; statusText = '訂單被老師退回'; additionalInfo = '請檢查金額或後五碼，並重新提交。';
                } else { // pending_payment
                    // [修改] 如果是待付款(轉帳)，顯示輸入按鈕
                    if (order.payment_method === 'transfer') {
                        actionButtonLabel = '輸入匯款後五碼'; actionCmd = CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER; 
                    }
                    cardColor = '#f28482'; statusText = '待付款';
                    // [新增] 只要是待付款狀態，就顯示取消按鈕
                    cancelButton = {
                        type: 'button', style: 'link', height: 'sm', margin: 'md', color: '#DE5246',
                        action: { type: 'postback', label: '取消此訂單', data: `action=cancel_pending_order_start&order_id=${order.order_id}` }
                    };
                }

                // [修改] 組合主要的動作按鈕
                const mainActionButton = actionCmd ? {
                    type: 'button', style: 'primary', height: 'sm', margin: 'md', color: cardColor,
                    action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${encodeURIComponent(actionCmd)}` }
                } : null;

                bodyContents.push({
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                        { type: 'text', text: `${order.points} 點 / ${order.amount} 元`, weight: 'bold', wrap: true },
                        { type: 'text', text: `狀態: ${statusText}`, size: 'sm', color: cardColor, weight: 'bold' },
                        { type: 'text', text: `(${order.payment_method === 'transfer' ? '轉帳' : '現金'})`, size: 'xs', color: '#AAAAAA' },
                        { type: 'text', text: formatDateTime(order.timestamp), size: 'sm', color: '#AAAAAA' },
                        ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', color: '#B00020', wrap: true, margin: 'sm' }] : []),
                        // [修改] 只有在 mainActionButton 存在時才顯示
                        ...(mainActionButton ? [mainActionButton] : []),
                        // [修改] 只有在 cancelButton 存在時才顯示
                        ...(cancelButton ? [cancelButton] : [])
                    ]
                });
                bodyContents.push(separator);
            });
        }

        if (historyPointOrders.length > 0) {
            if (pendingPointOrders.length > 0) {
                bodyContents.push({ type: 'separator', margin: 'xxl' });
            }
            bodyContents.push({ type: 'text', text: '歷史紀錄', weight: 'bold', size: 'lg', margin: 'xl', color: '#6c757d' });
            historyPointOrders.forEach(order => {
                let typeText, pointsText, pointsColor;
                let reasonComponent = [];

                if (order.amount === 0) {
                    if (order.points > 0) { typeText = '✨ 手動加點'; pointsText = `+${order.points}`; pointsColor = '#1A759F'; } 
                    else { typeText = '⚠️ 手動扣點'; pointsText = `${order.points}`; pointsColor = '#D9534F'; }
                    
                    if (order.notes) {
                        reasonComponent.push({
                            type: 'text', text: `原因：${order.notes}`, size: 'xs', color: '#666666', wrap: true, margin: 'sm'
                        });
                    }
                } else {
                    typeText = '✅ 購點成功'; pointsText = `+${order.points}`; pointsColor = '#28A745';
                }

                bodyContents.push({
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'lg',
                    contents: [
                        {
                            type: 'box', layout: 'vertical', flex: 3, spacing: 'sm',
                            contents: [
                                { type: 'text', text: typeText, weight: 'bold', size: 'sm' },
                                ...reasonComponent,
                                { type: 'text', text: formatDateTime(order.timestamp), size: 'xxs', color: '#AAAAAA' }
                            ]
                        },
                        { type: 'text', text: `${pointsText} 點`, gravity: 'center', align: 'end', flex: 2, weight: 'bold', size: 'sm', color: pointsColor }
                    ]
                });
                bodyContents.push(separator);
            });
        }
        
        if (bodyContents.length > 0 && bodyContents[bodyContents.length - 1].type === 'separator') {
            bodyContents.pop();
        }

        return {
            type: 'flex',
            altText: '購點紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: createStandardHeader('📜 查詢購點紀錄'),
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                    contents: bodyContents.length > 0 ? bodyContents : [{type: 'text', text: '目前沒有任何紀錄。', align: 'center'}]
                }
            }
        };
    });
}

// [新增] 處理顯示購買歷史的功能
async function showExchangeHistoryList(event, user) {
    return {
        type: 'flex',
        altText: '選擇查詢方式',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '📜 查詢購買紀錄', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
                backgroundColor: '#52b69a'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '顯示全部紀錄', data: `action=view_all_exchange_history_as_teacher&page=1` } },
                    { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '搜尋特定學員', data: `action=start_exchange_history_search` } }
                ]
            }
        }
    };
}
// 處理老師查詢購點歷史的初始選單
async function showPurchaseHistoryList(event, user) {
  return {
    type: 'flex',
    altText: '選擇查詢方式',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '📜 查詢購點紀錄', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
        backgroundColor: '#52b69a'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '顯示全部紀錄', data: `action=view_all_purchase_history_as_teacher&page=1` } },
          { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '搜尋特定學員', data: `action=start_purchase_history_search` } }
        ]
      }
    }
  };
}

/**
 * [優化建議] 處理搜尋學員並顯示結果的通用流程
 * @param {string} searchQuery - 使用者輸入的搜尋關鍵字
 * @param {object} pendingState - 要清除的對話狀態物件 (例如 pendingPurchaseHistorySearch)
 * @param {string} userId - 當前操作的老師 User ID
 * @param {function(Array<object>): Promise<object>} showSelectionFunction - 找到學員後，要用來顯示選項畫面的函式
 * @returns {Promise<object|string>} Flex Message 或提示文字
 */
async function handleStudentSearchFlow(searchQuery, pendingState, userId, showSelectionFunction) {
    // 1. 清除對話狀態，避免重複觸發
    delete pendingState[userId];

    // 2. 執行資料庫查詢
    const res = await executeDbQuery(client =>
        client.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${searchQuery.toLowerCase()}%`, searchQuery])
    );

    // 3. 如果找不到結果，回傳提示訊息
    if (res.rows.length === 0) {
        return { type: 'text', text: `找不到學員「${searchQuery}」。請重新操作。` };
    }
    
    // 4. 呼叫指定的函式來顯示結果輪播
    return showSelectionFunction(res.rows);
}

async function handleTeacherCommands(event, userId) {
  const text = event.message.text ? event.message.text.trim().normalize() : '';
  const user = await getUser(userId);
  // 優先處理有延續性的對話 (Pending States)
  if (pendingProductCreation[userId]) {
    const state = pendingProductCreation[userId];
    let proceed = true;
    let errorMessage = '';
    switch (state.step) {
        case 'await_name': state.name = text;
        state.step = 'await_description'; return { type: 'text', text: '請輸入商品描述 (可換行)，或輸入「無」：', quickReply: { items: getCancelMenu() } };
        case 'await_description': state.description = text === '無' ? null : text; state.step = 'await_price';
            return { type: 'text', text: '請輸入商品售價 (元，純數字)：', quickReply: { items: getCancelMenu() } };
        case 'await_price':
            const price = parseInt(text, 10);
            if (isNaN(price) || price < 0) { proceed = false; errorMessage = '價格格式不正確，請輸入一個非負整數。';
            } 
            else { state.price = price;
            state.step = 'await_inventory'; return { type: 'text', text: '請輸入商品初始庫存 (純數字)：', quickReply: { items: getCancelMenu() } };
            }
            break;
        case 'await_inventory':
            const inventory = parseInt(text, 10);
            if (isNaN(inventory) || inventory < 0) { proceed = false; errorMessage = '庫存格式不正確，請輸入一個非負整數。';
            } 
            else { state.inventory = inventory;
            state.isPreorder = (inventory === 0); // 如果庫存為 0，就給一個 true 的標記
            state.step = 'await_image_url'; return { type: 'text', text: '請直接上傳一張商品圖片，或輸入「無」：', quickReply: { items: getCancelMenu() } };
            }
            break;
            case 'await_image_url':
    let imageUrl = null;
    if (event.message.type === 'text' && event.message.text.trim().toLowerCase() === '無') {
        imageUrl = null;
    }
    else if (event.message.type === 'image') {
        try {
            const imageResponse = await axios.get(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { 'Authorization': `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` }, responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data, 'binary');
            const uploadResponse = await imagekit.upload({ file: imageBuffer, fileName: `product_${Date.now()}.jpg`, useUniqueFileName: true, folder: "yoga_products" });
            imageUrl = uploadResponse.url;
        } catch (err) {
            console.error("❌ 圖片上傳至 ImageKit.io 失敗:", err);
            // [修改] 直接回傳友善的重試訊息，而不是中斷流程
            return {
                type: 'text',
                text: '圖片上傳失敗，請您再試一次，或輸入「無」暫不設定商品圖片。',
                quickReply: { items: getCancelMenu() }
            };
        }
    } else {
         // 格式錯誤，也要求重試
         return { type: 'text', text: '格式錯誤，請直接上傳一張商品圖片，或輸入「無」。', quickReply: { items: getCancelMenu() } };
    }

    // 只有在上傳成功或輸入「無」時，才會繼續往下執行
    state.image_url = imageUrl;
    state.step = 'await_confirmation';
    const summaryText = `請確認商品資訊：\n\n` +
                      `名稱：${state.name}\n` +
                      `描述：${state.description || '無'}\n` +
                      `價格：${state.price} 元\n` +
                      `庫存：${state.inventory}\n` +
                      `狀態：${state.isPreorder ? '開放預購' : '直接上架'}\n` +
                      `圖片：${state.image_url || '無'}\n\n` +
                      `確認無誤後請點擊「✅ 確認上架」。`;
    return {
        type: 'text',
        text: summaryText,
        quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 確認上架', data: 'action=confirm_add_product' } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ]}
    };
            summaryText = `請確認商品資訊：\n\n` +
                              `名稱：${state.name}\n` +
                              `描述：${state.description || '無'}\n` +
                              `價格：${state.price} 元\n` +
                              `庫存：${state.inventory}\n` +
                              `狀態：${state.isPreorder ? '開放預購' : '直接上架'}\n` + // 根據標記顯示不同狀態
                              `圖片：${state.image_url || '無'}\n\n` +
                              `確認無誤後請點擊「✅ 確認上架」。`;
            return {
                type: 'text',
                text: summaryText,
                quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 確認上架', data: 'action=confirm_add_product' } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ]}
            };
    }
    if (!proceed && state.step !== 'await_image_url') { return { type: 'text', text: errorMessage, quickReply: { items: getCancelMenu() } };
    }
  } else if (pendingProductEdit[userId]) {
    const state = pendingProductEdit[userId];
    const product = state.product;
    const field = state.field;
    let newValue = text; let isValid = true; let errorMessage = '';
    if (field === 'price' || field === 'inventory') {
        const numValue = parseInt(text, 10);
        if (isNaN(numValue) || numValue < 0) { isValid = false; errorMessage = '請輸入一個非負整數。'; } else { newValue = numValue;
        }
    } else if (field === 'description' && text.toLowerCase() === '無') { newValue = null;
    } else if (field === 'image_url') {
        if (text.toLowerCase() === '無') { newValue = null;
        } 
        else if (!text.startsWith('https://') || !text.match(/\.(jpeg|jpg|gif|png)$/i)) { isValid = false;
        errorMessage = '圖片網址格式不正確，必須是 https 開頭的圖片連結。'; }
    }
    if (!isValid) { return { type: 'text', text: errorMessage, quickReply: { items: getCancelMenu() } };
    }
    product[field] = newValue; await saveProduct(product); delete pendingProductEdit[userId];
    const fieldMap = { name: '名稱', description: '描述', price: '價格', image_url: '圖片網址', inventory: '庫存' };
    return `✅ 已成功將商品「${product.name}」的「${fieldMap[field]}」更新為「${newValue === null ? '無' : newValue}」。`;
  } else if (pendingInventoryAdjust[userId]) {
    const state = pendingInventoryAdjust[userId];
    const product = state.product; const numValue = parseInt(text, 10);
    if(isNaN(numValue)) { return { type: 'text', text: '格式錯誤，請輸入一個整數 (正數為增加，負數為減少)。', quickReply: { items: getCancelMenu() } };
    }
    const newInventory = product.inventory + numValue;
    if(newInventory < 0) { return { type: 'text', text: `庫存調整失敗，調整後庫存 (${newInventory}) 不可小於 0。`, quickReply: { items: getCancelMenu() } };
    }
    product.inventory = newInventory; await saveProduct(product); delete pendingInventoryAdjust[userId];
    return `✅ 已成功調整商品「${product.name}」的庫存。\n原庫存: ${state.originalInventory}\n調整量: ${numValue > 0 ? '+' : ''}${numValue}\n新庫存: ${newInventory}`;
  } else if (pendingAnnouncementCreation[userId]) {
    const state = pendingAnnouncementCreation[userId];
    switch (state.step) {
      case 'await_content':
        state.content = text;
        state.step = 'await_confirmation';
        const confirmMsg = { type: 'flex', altText: '確認公告內容', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'lg', contents: [ { type: 'text', text: '請確認公告內容', weight: 'bold', size: 'lg' }, { type: 'separator' }, { type: 'text', text: state.content, wrap: true } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: CONSTANTS.COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } }, { type: 'button', style: 'secondary', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ] } } };
        return confirmMsg;
      case 'await_confirmation':
        if (text === CONSTANTS.COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
          await executeDbQuery(client => 
            client.query( "INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)", [state.content, userId, user.name])
          );
          delete pendingAnnouncementCreation[userId];
          return '✅ 公告已成功頒佈！學員可在「最新公告」中查看。';
        } else { return '請點擊「確認頒佈」或「取消操作」。';
        }
    }
  } else if (pendingAnnouncementDeletion[userId]) {
    const state = pendingAnnouncementDeletion[userId];
    if (text === CONSTANTS.COMMANDS.TEACHER.CONFIRM_DELETE_ANNOUNCEMENT) {
        await executeDbQuery(client => client.query("DELETE FROM announcements WHERE id = $1", [state.ann_id]));
        delete pendingAnnouncementDeletion[userId];
        return '✅ 公告已成功刪除。';
    } else { return '請點擊「確認刪除」或「取消操作」。';
    }
  } else if (pendingCourseCancellation[userId]) {
    const state = pendingCourseCancellation[userId];
    switch(state.type) {
      case 'batch':
        if (text === CONSTANTS.COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
          const backgroundState = { ...state };
          delete pendingCourseCancellation[userId];
          try {
            (async () => {
              await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const coursesToCancelRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${backgroundState.prefix}%`]);
                    if (coursesToCancelRes.rows.length === 0) { 
                        const errMsg = { type: 'text', text: `❌ 批次取消失敗：找不到可取消的「${backgroundState.prefix}」系列課程。`}; 
                        await enqueuePushTask(userId, errMsg); 
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
                    const courseMainTitle = getCourseMainTitle(coursesToCancel[0].title);
                    await client.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${backgroundState.prefix}%`]);
                    const batchTasks = Array.from(affectedUsers.entries()).map(([studentId, refundAmount]) => ({
                        recipientId: studentId,
                        message: { type: 'text', text: `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。` }
                    }));
                    if (batchTasks.length > 0) {
                        await enqueueBatchPushTasks(batchTasks, { settingKey: 'student_new_announcement' });
                    }
                    await client.query('COMMIT');
                    const teacherMsg = { type: 'text', text: `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。` }; 
                    await enqueuePushTask(userId, teacherMsg);
                } catch (e) { 
                    await client.query('ROLLBACK');
                    console.error('[批次取消] 背景任務執行失敗:', e); 
                    const errorMsg = { type: 'text', text: `❌ 批次取消課程時發生嚴重錯誤，操作已復原。請聯繫管理員。\n錯誤: ${e.message}` }; 
                    await enqueuePushTask(userId, errorMsg);
                }
              });
            })();
             return '✅ 指令已收到，正在為您批次取消課程。\n完成後將會另行通知，請稍候...';
          } catch (error) { 
              console.error('❌ 啟動批次取消時發生錯誤:', error);
              return '啟動批次取消任務失敗，請稍後再試。';
          }
        }
        break;
      case 'single':
         if (text === CONSTANTS.COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
            return executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                  const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [state.course_id]);
    
                  if (courseToCancelRes.rows.length === 0) { delete pendingCourseCancellation[userId]; return "找不到該課程，可能已被取消。"; }
                  const course = courseToCancelRes.rows[0];
                  const studentIdsToNotify = [...course.students];
                  for (const studentId of studentIdsToNotify) { 
                     await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]); 
                  }
                  
                  // ====================== [程式夥伴新增] ======================
                  // 在刪除課程前，先刪除可能已存在的老師提醒任務
                  const reminderTextPattern = `%${getCourseMainTitle(course.title)}%`;
                  await client.query(
                      `DELETE FROM tasks 
                       WHERE recipient_id = $1 
                       AND status = 'pending' 
                       AND message_payload::text LIKE $2`,
                      [course.teacher_id, reminderTextPattern]
                  );
                  // ==========================================================

                  await client.query("DELETE FROM courses WHERE id = $1", [state.course_id]); 
                  delete pendingCourseCancellation[userId];
          
                  if (studentIdsToNotify.length > 0) {
                      const batchTasks = studentIdsToNotify.map(studentId => ({
                          recipientId: studentId,
                          message: { type: 'text', text: `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。` }
                      }));
                      await enqueueBatchPushTasks(batchTasks, { settingKey: 'student_new_announcement' });
                  }
                  await client.query('COMMIT');
                  return `✅ 已成功取消課程「${course.title}」。`;
                } catch (e) { 
                  await client.query('ROLLBACK');
                  delete pendingCourseCancellation[userId]; 
                  console.error('單堂取消課程失敗:', e); 
                  return '取消課程時發生錯誤，請稍後再試。';
                }
            });
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
            return { type: 'text', text: `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, quickReply: { items: weekdayButtons } };

        // [新增] 步驟 await_start_time
        case 'await_start_time': 
            if (!/^\d{2}:\d{2}$/.test(text)) { 
                return { type: 'text', text: '時間格式不正確，請輸入四位數時間，例如：19:30', quickReply: { items: getCancelMenu() } };
            } 
            state.start_time = text; // 存入 start_time
            state.step = 'await_end_time'; // 下一步是結束時間
            return { type: 'text', text: `好的，開始時間是 ${text}。\n\n那『結束』時間是幾點呢？（例如：20:30）`, quickReply: { items: getCancelMenu() } };

        // [新增] 步驟 await_end_time
        case 'await_end_time': 
            if (!/^\d{2}:\d{2}$/.test(text)) { 
                return { type: 'text', text: '時間格式不正確，請輸入四位數時間，例如：20:30', quickReply: { items: getCancelMenu() } };
            }

            // [新增] 驗證結束時間是否晚於開始時間
            const [startHour, startMinute] = state.start_time.split(':').map(Number);
            const totalStartMinutes = startHour * 60 + startMinute;
            const [endHour, endMinute] = text.split(':').map(Number);
            const totalEndMinutes = endHour * 60 + endMinute;

            if (totalEndMinutes <= totalStartMinutes) {
                return {
                    type: 'text',
                    text: `❌ 結束時間（${text}）必須晚於開始時間（${state.start_time}）。\n請重新輸入正確的結束時間：`,
                    quickReply: { items: getCancelMenu() }
                };
            }
            
            // 驗證通過
            state.end_time = text;
            state.step = 'await_sessions';
            return { type: 'text', text: '請問這個系列總共要開設幾堂課？（請輸入數字）', quickReply: { items: getCancelMenu() } };

        case 'await_sessions': 
            const sessions = parseInt(text, 10);
            if (isNaN(sessions) || sessions <= 0) { return { type: 'text', text: '堂數必須是正整數，請重新輸入。', quickReply: { items: getCancelMenu() } };
            } 
            state.sessions = sessions; 
            state.step = 'await_capacity';
            return { type: 'text', text: '請問每堂課的名額限制？（請輸入數字）', quickReply: { items: getCancelMenu() } };

        case 'await_capacity': 
            const capacity = parseInt(text, 10);
            if (isNaN(capacity) || capacity <= 0) { return { type: 'text', text: '名額必須是正整數，請重新輸入。', quickReply: { items: getCancelMenu() } };
            } 
            state.capacity = capacity; 
            state.step = 'await_points';
            return { type: 'text', text: '請問每堂課需要消耗多少點數？（請輸入數字）', quickReply: { items: getCancelMenu() } };

        case 'await_points':
            const points = parseInt(text, 10);
            if (isNaN(points) || points < 0) { return { type: 'text', text: '點數必須是正整數或 0，請重新輸入。', quickReply: { items: getCancelMenu() } };
            }
            state.points_cost = points; 
            state.step = 'await_teacher';
            return buildTeacherSelectionCarousel();

        case 'await_confirmation':
            if (text === '✅ 確認新增') {
                const teacherId = userId;
                const courseState = { ...pendingCourseCreation[userId] };
                delete pendingCourseCreation[userId];

                return executeDbQuery(async (client) => {
                    await client.query('BEGIN');
                    try {
                        const prefix = await generateUniqueCoursePrefix(client);
                        let currentDate = new Date();
                        for (let i = 0; i < courseState.sessions; i++) {
                            // 注意：這裡我們使用 start_time 來計算課程的實際日期時間
                            const courseDate = getNextDate(courseState.weekday, courseState.start_time, currentDate);
                            const course = {
                                id: `${prefix}${String(i + 1).padStart(2, '0')}`,
                                // [修改] 標題可以加上時間方便辨識
                                title: `${courseState.title} (${courseState.start_time}-${courseState.end_time})`,
                                time: courseDate.toISOString(),
                                capacity: courseState.capacity,
                                points_cost: courseState.points_cost,
                                students: [],
                                waiting: [],
                                teacher_id: courseState.teacher_id
                            };
                            await saveCourse(course, client);
                            currentDate = new Date(courseDate.getTime() + CONSTANTS.TIME.ONE_DAY_IN_MS);
                        }
                        await client.query('COMMIT');

                        const mainTitle = getCourseMainTitle(courseState.title);
                        const prefilledContent = `✨ 新課程上架！\n\n「${mainTitle}」系列現已開放預約，歡迎至「預約課程」頁面查看詳情！`;
                        pendingAnnouncementCreation[teacherId] = {
                            step: 'await_final_confirmation',
                            content: prefilledContent
                        };
                        setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
                            enqueuePushTask(u, { type: 'text', text: '頒佈公告操作逾時，自動取消。'});
                        });

                        const finalFlexMessage = {
                            type: 'flex',
                            altText: '發佈系列課程公告？',
                            contents: {
                                type: 'bubble',
                                header: {
                                    type: 'box',
                                    layout: 'vertical',
                                    contents: [{ type: 'text', text: '📢 發佈系列課程公告', weight: 'bold', color: '#FFFFFF' }],
                                    backgroundColor: '#52B69A',
                                    paddingAll: 'lg'
                                },
                                body: {
                                    type: 'box',
                                    layout: 'vertical',
                                    spacing: 'md',
                                    contents: [
                                        { type: 'text', text: prefilledContent, wrap: true }
                                    ]
                                }
                            },
                            quickReply: {
                                items: [
                                    {
                                        type: 'action',
                                        action: {
                                            type: 'postback',
                                            label: '✅ 直接發佈',
                                            data: 'action=publish_prefilled_announcement'
                                        }
                                    },
                                    { type: 'action', action: { type: 'postback', label: '❌ 暫不發佈', data: 'action=cancel_announcement' } }
                                ]
                            }
                        };
                        return finalFlexMessage;

                    } catch (e) {
                        await client.query('ROLLBACK');
                        console.error("新增課程系列失敗", e);
                        return '新增課程時發生錯誤，請稍後再試。';
                    }
                });
            } else {
                return '請點擊「✅ 確認新增」或「❌ 取消操作」。';
            }
    }
  } else if (pendingManualAdjust[userId]) {
    const state = pendingManualAdjust[userId];
    switch (state.step) {
    case 'await_student_search': { 
        const showSelectionFunction = (users) => {
            return buildUserSelectionCarousel(
                users,
                '請選擇要調整點數的學員',
                'action=select_student_for_adjust&studentId=${userId}', // 按鈕的 Postback 動作
                '選擇此學員' // 按鈕上的文字
            );
        };
        return handleStudentSearchFlow(text, pendingManualAdjust, userId, showSelectionFunction);
    }
      case 'await_operation':
        if (text === CONSTANTS.COMMANDS.TEACHER.ADD_POINTS || text === CONSTANTS.COMMANDS.TEACHER.DEDUCT_POINTS) { state.operation = text === CONSTANTS.COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct'; state.step = 'await_amount'; return { type: 'text', text: `請輸入要 ${text === CONSTANTS.COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`, quickReply: { items: getCancelMenu() } };
        } 
        else { return '請點擊 `+ 加點` 或 `- 扣點` 按鈕。';
        }
      case 'await_amount': const amount = parseInt(text, 10);
        if (isNaN(amount) || amount <= 0) { return { type: 'text', text: '點數格式不正確，請輸入一個大於 0 的正整數。', quickReply: { items: getCancelMenu() } };
        } state.amount = amount; state.step = 'await_reason'; return { type: 'text', text: '請輸入調整原因（例如：活動獎勵、課程補償等）：', quickReply: { items: getCancelMenu() } };
      case 'await_reason': state.reason = text; state.step = 'await_confirmation'; const opText = state.operation === 'add' ? `增加 ${state.amount} 點` : `扣除 ${state.amount} 點`; const summary = `請確認調整內容：\n\n對象：${state.targetStudent.name}\n操作：${opText}\n原因：${state.reason}`;
        return { type: 'text', text: summary, quickReply: { items: [ { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: CONSTANTS.COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ] }};
      case 'await_confirmation':
        if (text === CONSTANTS.COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST) {
          return executeDbQuery(async (clientDB) => {
            await clientDB.query('BEGIN');
            try {
                const studentRes = await clientDB.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [state.targetStudent.id]);
                const student = studentRes.rows[0];
                const newPoints = state.operation === 'add' ? student.points + state.amount : student.points - state.amount;
                if (newPoints < 0) {
                    await clientDB.query('ROLLBACK');
                    delete pendingManualAdjust[userId];
                    return `操作失敗：學員 ${student.name} 的點數不足以扣除 ${state.amount} 點。`;
                }
                const historyEntry = { action: `手動調整：${state.operation === 'add' ? '+' : '-'}${state.amount}點`, reason: state.reason, time: new Date().toISOString(), operator: user.name };
                const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
                await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
                // 在 orders 資料表中也新增一筆紀錄
                const orderId = `MA-${Date.now()}`;
                // MA for Manual Adjust
                const pointsChange = state.operation === 'add' ? state.amount : -state.amount;
                // [修改] 使用新的 type 和 notes 欄位來記錄手動調整
const orderType = state.operation === 'add' ? 'manual_add' : 'manual_deduct';
const reasonForOrder = state.reason; // 老師輸入的調整原因

await clientDB.query(
    `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp, type, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
        orderId,
        student.id,
        student.name,
        pointsChange,
        0, // amount
        null, // last_5_digits 設為 null，因為這不是一筆轉帳
        'completed', // status
        new Date().toISOString(), // timestamp
        orderType, // 新增的 type 欄位
        reasonForOrder // 新增的 notes 欄位
    ]
);

                const opTextForStudent = state.operation === 'add' ? `增加了 ${state.amount}` : `扣除了 ${state.amount}`;
                const notifyMessage = { type: 'text', text: `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${state.reason}\n您目前的點數為：${newPoints} 點。` };
                await enqueuePushTask(student.id, notifyMessage, { settingKey: 'student_order_result' });
                await clientDB.query('COMMIT');
                delete pendingManualAdjust[userId];
                return `✅ 已成功為學員 ${student.name} ${state.operation === 'add' ? '增加' : '扣除'} ${state.amount} 點。`;
            } catch (e) {
                await clientDB.query('ROLLBACK');
                console.error('手動調整點數失敗:', e);
                delete pendingManualAdjust[userId];
                return '❌ 操作失敗，資料庫發生錯誤，請稍後再試。';
            }
          });
        }
        break;
    }
} else if (pendingManualAdjustSearch[userId]) {
    // 建立一個函式，告訴 handleStudentSearchFlow 找到學員後該做什麼
    const showSelectionFunction = (users) => {
        return buildUserSelectionCarousel(
            users,
            '請選擇要查詢手動調整紀錄的學員',
            'action=view_manual_adjust_history&user_id=${userId}&page=1', // 按鈕的 Postback 動作
            '查看此學員紀錄' // 按鈕上的文字
        );
    };

    // 直接呼叫通用的流程函式
    return handleStudentSearchFlow(text, pendingManualAdjustSearch, userId, showSelectionFunction);
}

  // 使用新函式來簡化查詢流程
  else if (pendingPurchaseHistorySearch[userId]) {
    return handleStudentSearchFlow(text, pendingPurchaseHistorySearch, userId, showStudentSelectionForPurchaseHistory);
  }
  else if (pendingExchangeHistorySearch[userId]) {
    return handleStudentSearchFlow(text, pendingExchangeHistorySearch, userId, showStudentSelectionForExchangeHistory);
  }
  else if (pendingMessageHistorySearch[userId]) {
    return handleStudentSearchFlow(text, pendingMessageHistorySearch, userId, showStudentSelectionForMessageHistory);
  }
  else if (pendingStudentSearchQuery[userId]) {
    const searchQuery = text;
    delete pendingStudentSearchQuery[userId];
    return showStudentSearchResults(searchQuery, 1);
  } else if (pendingReply[userId]) {
    const state = pendingReply[userId];
    try {
      await executeDbQuery(client => 
        client.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1, is_student_read = false WHERE id = $2", [text, state.msgId])
      );
      const studentId = state.studentId;
      const originalMessage = state.originalMessage;
      delete pendingReply[userId];
      const notifyMessage = { type: 'text', text: `老師回覆了您的留言：\n\n【您的留言】\n${originalMessage}\n\n【老師的回覆】\n${text}`};
      await enqueuePushTask(studentId, notifyMessage, { settingKey: 'student_message_reply' });
      return '✅ 已成功回覆學員的留言。';
    } catch (err) {
      delete pendingReply[userId];
      throw err;
    }
  }else if (pendingMessageSearchQuery[userId]) {
    const searchQuery = text;
    delete pendingMessageSearchQuery[userId];
    return showHistoricalMessages(searchQuery, 1);
  } else if (pendingTeacherProfileEdit[userId]) {
    const state = pendingTeacherProfileEdit[userId];
    const step = state.step;
    if (state.type === 'create') {
        switch (step) {
            case 'await_name':
                state.profileData.name = text;
                state.step = 'await_bio';
                setupConversationTimeout(userId, pendingTeacherProfileEdit, 'pendingTeacherProfileEdit', (u) => { enqueuePushTask(u, { type: 'text', text: '建立檔案操作逾時，自動取消。' }); });
                return { type: 'text', text: '姓名已收到！\n接下來，請輸入您的個人簡介（例如您的教學風格、專業認證等），或輸入「無」表示留空：', quickReply: { items: getCancelMenu() } };
            case 'await_bio':
                state.profileData.bio = text.trim().toLowerCase() === '無' ? null : text;
                state.step = 'await_image';
                setupConversationTimeout(userId, pendingTeacherProfileEdit, 'pendingTeacherProfileEdit', (u) => { enqueuePushTask(u, { type: 'text', text: '建立檔案操作逾時，自動取消。' }); });
                return { type: 'text', text: '簡介已收到！\n最後，請直接上傳一張您想顯示的個人照片，或輸入「無」使用預設頭像：', quickReply: { items: getCancelMenu() } };
            case 'await_image':
    let imageUrl = null;
    if (event.message.type === 'image') {
        try {
            const imageResponse = await axios.get(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { 'Authorization': `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` }, responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageResponse.data, 'binary');
            const uploadResponse = await imagekit.upload({ file: imageBuffer, fileName: `teacher_${userId}.jpg`, useUniqueFileName: true, folder: "yoga_teachers" });
            imageUrl = uploadResponse.url;
        } catch (err) {
            console.error('上傳老師照片至 ImageKit 失敗', err);
            // [修改] 改為回傳友善的重試訊息，並保留對話狀態
            return {
                type: 'text',
                text: '圖片上傳失敗，請您再試一次，或輸入「無」使用預設頭像。',
                quickReply: { items: getCancelMenu() }
            };
        }
    } else if (event.message.type === 'text' && text.trim().toLowerCase() !== '無') {
        return { type: 'text', text: '格式錯誤，請直接上傳一張照片，或輸入「無」。', quickReply: { items: getCancelMenu() } };
    }
    state.profileData.image_url = imageUrl;
    state.step = 'await_confirmation';
    state.newData = state.profileData;
    return buildProfileConfirmationMessage(userId, state.newData);
        }
    } 
    else if (state.type === 'edit') {
        const field = step.replace('await_', '');
        let value;
        if (field === 'image_url') {
            if (event.message.type !== 'image') {
                return { type: 'text', text: '格式錯誤，請直接上傳一張照片。', quickReply: { items: getCancelMenu() } };
            }
            try {
                const imageResponse = await axios.get(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, { headers: { 'Authorization': `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` }, responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(imageResponse.data, 'binary');
                const uploadResponse = await imagekit.upload({ file: imageBuffer, fileName: `teacher_${userId}.jpg`, useUniqueFileName: true, folder: "yoga_teachers" });
                value = uploadResponse.url;
            } catch (err) {
                console.error('更新老師照片至 ImageKit 失敗', err);
                // [修改] 改為回傳友善的重試訊息
                return {
                    type: 'text',
                    text: '圖片上傳失敗，請您再試一次。',
                    quickReply: { items: getCancelMenu() }
                };
            }
        } else {
            value = text;
        }
        state.newData = { [field]: value };
        state.step = 'await_confirmation';
        return buildProfileConfirmationMessage(userId, state.newData);
    }
  }


  // === Refactored Command Handling ===
  const commandFunction = teacherCommandMap[text];
  if (commandFunction) {
    return commandFunction(event, user);
  } else {
    return handleUnknownTeacherCommand(text);
  }
}
async function handleAdminCommands(event, userId) {
  // [V38.6 修正] 增加對全形 @ 符號的處理，提升指令辨識的彈性
  const rawText = event.message.text ?
event.message.text.trim() : '';
  const text = rawText.replace(/＠/g, '@').normalize(); // 將全形＠自動換成半形@

  const user = await getUser(userId);
if (pendingTeacherAddition[userId]) {
    const state = pendingTeacherAddition[userId];
switch (state.step) {
      case 'await_student_info':
        const studentSearchRes = await executeDbQuery(client => 
            client.query(`SELECT id, name, role, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 25`, [`%${text.toLowerCase()}%`, text])
        );
if (studentSearchRes.rows.length === 0) {
          return { type: 'text', text: `找不到與「${text}」相關的學員。請重新輸入或取消操作。`, quickReply: { items: getCancelMenu() } };
}

const userBubbles = studentSearchRes.rows.map(s => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
 
                   {
                        type: 'image',
                        url: s.picture_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER,
                        size: 'md',
    
                    aspectRatio: '1:1',
                        aspectMode: 'cover'
                    },
                    {
              
          type: 'box',
                        layout: 'vertical',
                        flex: 3,
                        justifyContent: 'center',
              
          contents: [
                            { type: 'text', text: s.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(s.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
        
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
                    color: '#52B69A',
         
           height: 'sm',
                    action: {
                        type: 'postback',
                        label: '選擇此學員',
                 
       data: `action=select_student_for_auth&targetId=${s.id}&targetName=${encodeURIComponent(s.name)}`
                    }
                }]
            }
        }));
delete pendingTeacherAddition[userId];

        return {
            type: 'flex',
            altText: '請選擇要授權的學員',
            contents: {
                type: 'carousel',
                contents: userBubbles
            }
        };
      case 'await_confirmation':
        if (text === CONSTANTS.COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
targetUser.role = 'teacher';
          targetUser.approved_by = userId;
          await saveUser(targetUser);

          // [修正] 確保這段新增老師個人資訊的 SQL 語法正確無誤
          await executeDbQuery(async (client) => {
            const existingTeacher = await client.query(
              'SELECT line_user_id FROM teachers WHERE line_user_id = $1',
              [targetUser.id]
            );

            if (existingTeacher.rows.length > 0) {
              // 如果老師資料已存在，則更新姓名以防使用者變更 LINE 名稱
              await client.query(
                'UPDATE teachers SET name = $1, updated_at = NOW() WHERE line_user_id = $2',
                [targetUser.name, targetUser.id]
              );
            } else {
              // 如果不存在，則新增一筆新的老師個人資訊
              await client.query(
                'INSERT INTO teachers (line_user_id, name, bio) VALUES ($1, $2, $3)',
                [targetUser.id, targetUser.name, '這位老師尚未留下簡介。']
              );
            }
          });
          
delete pendingTeacherAddition[userId];
          
          const notifyMessage = { type: 'text', text: '恭喜！您的身份已被管理者授權為「老師」。'};
          await enqueuePushTask(targetUser.id, notifyMessage).catch(e => console.error(e));
          if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
return `✅ 已成功授權「${targetUser.name}」為老師。`;
        } else {
          return '請點擊確認或取消按鈕。';
}
    }
  } else if (pendingTeacherRemoval[userId]) {
    const state = pendingTeacherRemoval[userId];
switch (state.step) {
      case 'await_confirmation':
        if (text === CONSTANTS.COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(state.targetUser.id);
targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          delete pendingTeacherRemoval[userId];
          
          const notifyMessage = { type: 'text', text: '通知：您的「老師」身份已被管理者移除，已切換為學員身份。'};
await enqueuePushTask(targetUser.id, notifyMessage).catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
          return `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`;
} else {
          return '請點擊確認或取消按鈕。';
}
    }
  } else {
    if (text === CONSTANTS.COMMANDS.ADMIN.PANEL) {
      return buildAdminPanelFlex();
}
    else if (text === CONSTANTS.COMMANDS.ADMIN.SYSTEM_STATUS) {
      return showSystemStatus();
}   
    else if (text === CONSTANTS.COMMANDS.ADMIN.FAILED_TASK_MANAGEMENT) {
      return showFailedTasks(1);
} 
    else if (text === CONSTANTS.COMMANDS.ADMIN.VIEW_ERROR_LOGS) {
      return showErrorLogs(1);
}
    else if (text === CONSTANTS.COMMANDS.ADMIN.TOGGLE_NOTIFICATIONS) {
        const currentStatus = await getNotificationStatus();
const newStatus = !currentStatus;
        await executeDbQuery(async (db) => {
            await db.query(
                `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('notifications_enabled', $1, NOW())
                 ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = NOW()`,
                [newStatus.toString()]
          
  );
        });
        simpleCache.clear('notifications_enabled');
        const statusText = newStatus ? '【開啟】' : '【關閉】';
return buildAdminPanelFlex();
    } 
    else if (text === CONSTANTS.COMMANDS.ADMIN.ADD_TEACHER) {
      pendingTeacherAddition[userId] = { step: 'await_student_info' };
setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', (u) => {
          const timeoutMessage = { type: 'text', text: '授權老師操作逾時，自動取消。'};
          enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
      });
return { type: 'text', text: '請輸入您想授權為老師的「學員」姓名或 User ID：', quickReply: { items: getCancelMenu() } };
} else if (text === CONSTANTS.COMMANDS.ADMIN.REMOVE_TEACHER) {
        return showTeacherListForRemoval(1);
} else if (text === CONSTANTS.COMMANDS.ADMIN.SIMULATE_STUDENT) {
      user.role = 'student';
      await saveUser(user);
if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      return '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。';
    } else if (text === CONSTANTS.COMMANDS.ADMIN.SIMULATE_TEACHER) {
      user.role = 'teacher';
await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      return '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。';
    }
  // [程式夥伴新增] 在這裡加上新的指令處理
    else if (text === CONSTANTS.COMMANDS.ADMIN.FORCE_UPDATE_RICH_MENU) {
      // 呼叫我們的新函式，並把管理者自己的 ID 傳入，以便接收完成通知
      batchUpdateRichMenus(userId);
      // 立刻回覆管理者，讓他知道系統已經開始處理
      return '✅ 指令已收到！\n系統正在背景為所有使用者更新圖文選單，完成後將會傳送報告給您。';
    }
  }
}

async function handleStudentCommands(event, userId) {
  const text = event.message.text ?
event.message.text.trim().normalize() : '';
    const user = await getUser(userId);


    // [V35.5 新增] 處理商品訂單的後五碼回報
    if (pendingShopPayment[userId]) {
        const state = pendingShopPayment[userId];
        if (!/^\d{5}$/.test(text)) {
            return {
                type: 'text',
                text: '格式錯誤，請輸入5位數字的匯款帳號後五碼。',
                quickReply: { items: getCancelMenu() }
            };
        }


        const wasSuccessful = await executeDbQuery(async (client) => {
            const res = await client.query(
                "UPDATE product_orders SET last_5_digits = $1, status = 'pending_confirmation', updated_at = NOW() WHERE order_uid = $2 AND user_id = $3 AND status = 'pending_payment' RETURNING product_name",
                [text, state.orderUID, userId]
            );
            return res.rowCount > 0 ? res.rows[0].product_name : null;
        });


        delete pendingShopPayment[userId];


        if (wasSuccessful) {
            const productName = wasSuccessful;
            const notifyMessage = { type: 'text', text: `🔔 付款回報通知\n學員 ${user.name} 已回報「${productName}」訂單的匯款資訊。\n後五碼: ${text}\n請至「訂單管理」審核。`};
            await notifyAllTeachers(notifyMessage);
            return `感謝您！已收到您的匯款後五碼「${text}」。\n我們將盡快為您審核，審核通過後您會收到通知。`;
        } else {
            return '找不到您的待付款訂單，或訂單狀態已變更，請重新操作。';
        }
    }
    
    const purchaseFlowResult = await handlePurchaseFlow(event, userId);
  
  if (purchaseFlowResult.handled) {
      return purchaseFlowResult.reply;
  }


  if (pendingBookingConfirmation[userId]) {
    const state = pendingBookingConfirmation[userId];
    const course = await getCourse(state.course_id);
    if (!course && state.type !== 'product_purchase') {
        delete pendingBookingConfirmation[userId];
        return '抱歉，找不到該課程，可能已被老師取消。';
    }


    switch (state.type) {
        case 'cancel_book':
        if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
        
        const courseForCheck = await getCourse(state.course_id);
        if (!courseForCheck) {
            delete pendingBookingConfirmation[userId];
            return '取消失敗，找不到此課程。';
        }

        if (new Date(courseForCheck.time).getTime() - Date.now() < CONSTANTS.TIME.EIGHT_HOURS_IN_MS) {
            delete pendingBookingConfirmation[userId];
            return `抱歉，課程即將在 8 小時內開始，現在已無法取消預約。`;
        }
        
        return executeDbQuery(async (client) => {
            await client.query('BEGIN');
            try {
                const userForUpdateRes = await client.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                const courseForUpdateRes = await client.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [state.course_id]);
                
                const currentCourse = courseForUpdateRes.rows[0];
                const newStudents = [...currentCourse.students];
                
                const indexToRemove = newStudents.indexOf(userId);

                if (indexToRemove === -1) { 
                    await client.query('ROLLBACK');
                    delete pendingBookingConfirmation[userId]; 
                    return '您尚未預約此課程。'; 
                }
                newStudents.splice(indexToRemove, 1);

                const newPoints = userForUpdateRes.rows[0].points + currentCourse.points_cost;
                const historyEntry = { action: `取消預約 (1位)：${getCourseMainTitle(currentCourse.title)}`, pointsChange: +currentCourse.points_cost, time: new Date().toISOString() };
                const userHistory = userForUpdateRes.rows[0].history || [];
                const newHistory = [...userHistory, historyEntry];
                await client.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                await client.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, state.course_id]);

                // ====================== [程式夥伴修正] ======================
                // 在這裡加入刪除提醒任務的邏輯
                // 我們透過使用者 ID 和訊息內容中的課程標題來鎖定要刪除的任務
                const reminderTextPattern = `%${getCourseMainTitle(currentCourse.title)}%`;
                await client.query(
                    `DELETE FROM tasks 
                     WHERE recipient_id = $1 
                     AND status = 'pending' 
                     AND message_payload::text LIKE $2`,
                    [userId, reminderTextPattern]
                );
                // ==========================================================

                await promoteNextOnWaitlist(client, state.course_id);
                await client.query('COMMIT');
                delete pendingBookingConfirmation[userId];

                let replyMsg = `✅ 已為您取消 1 位「${getCourseMainTitle(currentCourse.title)}」的預約，並歸還 ${currentCourse.points_cost} 點。`;
                return replyMsg;
            } catch (e) {
                await client.query('ROLLBACK');
                console.error('取消預約失敗:', e); 
                delete pendingBookingConfirmation[userId];
                return '取消預約時發生錯誤，請稍後再試。';
            }
        });
    } else if (text === CONSTANTS.COMMANDS.GENERAL.CANCEL) {
        delete pendingBookingConfirmation[userId];
        return '已放棄取消操作。';
    }
    break;

        case 'cancel_wait':
            if (text === CONSTANTS.COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
                const newWaitingList = course.waiting.filter(id => id !== userId);
                await saveCourse({ ...course, waiting: newWaitingList });
                delete pendingBookingConfirmation[userId];
                return `✅ 已為您取消「${course.title}」的候補。`;
            } else if (text === CONSTANTS.COMMANDS.GENERAL.CANCEL) {
                delete pendingBookingConfirmation[userId];
                return '已放棄取消操作。';
            }
            break;
        case 'product_purchase':
             if (text === CONSTANTS.COMMANDS.GENERAL.CANCEL) {
                delete pendingBookingConfirmation[userId];
                return '已取消購買。';
            }
            break;
    }
  } else if (pendingFeedback[userId]) {
    const feedbackState = pendingFeedback[userId];
    if (feedbackState.step === 'await_message') {
      await executeDbQuery(client => 
        client.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text])
      );
      delete pendingFeedback[userId];
      if (TEACHER_ID) { 
          const notifyMessage = { type: 'text', text: `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`};
          await notifyAllTeachers(notifyMessage);
      }
      return '感謝您的留言，我們已收到您的訊息，老師會盡快查看！';
    }
  } else {
    // --- 處理一般指令 ---
    if (text === CONSTANTS.COMMANDS.STUDENT.BOOK_COURSE) {
        return showAvailableCourses(userId, new URLSearchParams());
    } else if (text === CONSTANTS.COMMANDS.STUDENT.MY_COURSES) {
        return showMyCourses(userId, 1);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
        return executeDbQuery(async (client) => {
            const res = await client.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 6');
            
            if (res.rows.length === 0) { 
                return '目前沒有任何公告。'; 
            }
            
            // 更新學員的 last_seen_announcement_id
            const latestAnnId = res.rows[0].id;
            if (user.last_seen_announcement_id !== latestAnnId) {
                user.last_seen_announcement_id = latestAnnId;
                await saveUser(user, client);
            }
            
            const announcementBubbles = res.rows.map(announcement => ({
                type: 'bubble',
                size: 'giga',
                header: { 
                    type: 'box', 
                    layout: 'vertical', 
                    backgroundColor: '#de5246', 
                    contents: [ 
                        { type: 'text', text: '📢 近期公告', color: '#ffffff', weight: 'bold', size: 'lg' } 
                    ]
                }, 
                body: { 
                    type: 'box', 
                    layout: 'vertical', 
                    paddingAll: 'lg',
                    spacing: 'md',
                    contents: [ 
                        { type: 'text', text: announcement.content, wrap: true } 
                    ]
                }, 
                footer: { 
                    type: 'box', 
                    layout: 'vertical', 
                    contents: [ 
                        { 
                            type: 'text', 
                            text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發佈`, 
                            size: 'xs', 
                            color: '#aaaaaa', 
                            align: 'center' 
                        } 
                    ]
                } 
            }));

            return {
                type: 'flex',
                altText: '近期公告列表',
                contents: {
                    type: 'carousel',
                    contents: announcementBubbles
                }
            };
        });       
    } else if (text === CONSTANTS.COMMANDS.STUDENT.ADD_NEW_MESSAGE) {
        pendingFeedback[userId] = { step: 'await_message' };
        setupConversationTimeout(userId, pendingFeedback, 'pendingFeedback', (u) => {
            const timeoutMessage = { type: 'text', text: '留言逾時，自動取消。'};
            enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
        });
        return { type: 'text', text: '請輸入您想對老師說的話，或點選「取消」。', quickReply: { items: getCancelMenu() } };
    } else if (text === CONSTANTS.COMMANDS.STUDENT.CONTACT_US) {
      const unreadCount = await executeDbQuery(client => 
        client.query("SELECT COUNT(*) FROM feedback_messages WHERE user_id = $1 AND status = 'replied' AND is_student_read = false", [userId])
      ).then(res => parseInt(res.rows[0].count, 10));
      let historyLabel = '📜 查詢歷史留言';
      if (unreadCount > 0) {
        historyLabel += ` (${unreadCount})`;
      }
      
      return {
        type: 'flex', altText: '聯絡我們',
        contents: {
          type: 'bubble', size: 'giga',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '📞 聯絡我們', color: '#ffffff', weight: 'bold', size: 'lg'}], backgroundColor: '#34A0A4', paddingTop: 'lg', paddingBottom: 'lg' },
          body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
              contents: [
                  { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📝 新增留言', data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.ADD_NEW_MESSAGE)}` } },
                  { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: historyLabel, data: `action=view_my_messages&page=1` } }
              ]
          }
        }
      };
    } else if (text === CONSTANTS.COMMANDS.STUDENT.POINTS || text === CONSTANTS.COMMANDS.STUDENT.CHECK_POINTS) {
        if (pendingPurchase[userId]?.step !== 'input_last5' && pendingPurchase[userId]?.step !== 'edit_last5') delete pendingPurchase[userId];
        delete pendingBookingConfirmation[userId];
        return buildPointsMenuFlex(userId);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.BUY_POINTS) {
        // [修改] 在顯示購買方案前，先檢查是否有待處理訂單
        const hasPending = await hasPendingPointOrder(userId);
        if (hasPending) {
            return '您目前尚有一筆訂單待處理。\n請至「點數查詢」>「查詢購點紀錄」完成該筆訂單，或等待老師審核。';
        }
        return buildBuyPointsFlex();
    } else if (text === CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY) {
        return showPurchaseHistory(userId, 1);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.SHOP) {
        return buildShopMenuFlex(userId);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.VIEW_SHOP_PRODUCTS) {
        return showShopProducts(1);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.EXCHANGE_HISTORY) {
        return showStudentExchangeHistory(userId, 1);
    } else if (text === CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
        const orderId = await executeDbQuery(async (client) => {
            const statusFilter = text === CONSTANTS.COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER ? "'pending_confirmation', 'rejected'" : "'pending_payment'";
            const orderRes = await client.query(`SELECT order_id FROM orders WHERE user_id = $1 AND status IN (${statusFilter}) ORDER BY timestamp DESC LIMIT 1`, [userId]);
            return orderRes.rows.length > 0 ? orderRes.rows[0].order_id : null;
        });


        if (orderId) {
            const step = text === CONSTANTS.COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER ? 'input_last5' : 'edit_last5';
            pendingPurchase[userId] = { step: step, data: { order_id: orderId } };
            setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => {
                const timeoutMessage = { type: 'text', text: '輸入後五碼逾時，自動取消。'};
                enqueuePushTask(u, timeoutMessage).catch(e => console.error(e));
            });
            return { type: 'text', text: '請輸入您的匯款帳號後五碼 (5位數字)：', quickReply: { items: getCancelMenu() } };
        } else {
            return '您目前沒有需要執行此操作的訂單。';
        }
    } else {
      let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
      if (text.startsWith('@')) {
          const closestCommand = findClosestCommand(text, 'student');
          if (closestCommand) {
              studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
          } else {
              studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`;
          }
      }
      return studentSuggestion;
    }
  }
}


async function showStudentSearchResults(query, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(
            `SELECT id, name, picture_url FROM users 
             WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) 
             ORDER BY name ASC LIMIT $3 OFFSET $4`,
            [`%${query.toLowerCase()}%`, query, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );


        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageUsers = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageUsers.length === 0 && page === 1) {
            return `找不到與「${query}」相關的學員。`;
        }
        if (pageUsers.length === 0) {
            return '沒有更多搜尋結果了。';
        }

        const userBubbles = pageUsers.map(u => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { type: 'image', url: u.picture_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, size: 'md', aspectRatio: '1:1', aspectMode: 'cover' },
                    { 
                        type: 'box', 
                        layout: 'vertical', 
                        flex: 3, 
                        justifyContent: 'center', 
                        contents: [
                            { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(u.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm', wrap: true }
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
                    color: '#1A759F',
                    height: 'sm',
                    action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` }
                }]
            }
        }));
        const paginationBubble = createPaginationBubble('action=student_search_results', page, hasNextPage, `&query=${encodeURIComponent(query)}`);
        if (paginationBubble) {
            userBubbles.push(paginationBubble);
        }


        return { type: 'flex', altText: `學員搜尋結果：${query}`, contents: { type: 'carousel', contents: userBubbles } };
    });
}
/**
 * [V39.6 新增] 建立一個通用的學員選擇輪播訊息。
 * @param {Array<object>} users - 從資料庫查詢到的使用者物件陣列。
 * @param {string} altText - Flex Message 的替代文字。
 * @param {string} postbackActionTemplate - Postback data 的模板，例如 'action=view_history&user_id=${userId}'。
 * @param {string} buttonLabel - 按鈕上顯示的文字，例如 '查看此學員紀錄'。
 * @returns {object} - 可直接回覆的 Flex Message 物件。
 */
function buildUserSelectionCarousel(users, altText, postbackActionTemplate, buttonLabel) {
    const userBubbles = users.map(u => {
        // 將模板中的 ${userId} 替換為實際的 user id
        const postbackData = postbackActionTemplate.replace('${userId}', u.id);
        
        return {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                contents: [
                    { 
                        type: 'image', 
                        url: u.picture_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, 
                        size: 'md', 
                        aspectRatio: '1:1', 
                        aspectMode: 'cover' 
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 3,
                        justifyContent: 'center',
                        contents: [
                            { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: `ID: ${formatIdForDisplay(u.id)}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' }
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
                    color: '#1A759F',
                    height: 'sm',
                    action: { 
                        type: 'postback', 
                        label: buttonLabel, 
                        data: postbackData 
                    }
                }]
            }
        };
    });

    return {
        type: 'flex',
        altText: altText,
        contents: { type: 'carousel', contents: userBubbles }
    };
}

// [V39.6 重構]
async function showStudentSelectionForPurchaseHistory(users) {
    return buildUserSelectionCarousel(
        users,
        `請選擇要查詢購點紀錄的學員`,
        'action=view_purchase_history_as_teacher&user_id=${userId}&page=1',
        '查看此學員紀錄'
    );
}

// [V39.6 重構]
async function showStudentSelectionForExchangeHistory(users) {
    return buildUserSelectionCarousel(
        users,
        `請選擇要查詢購買紀錄的學員`,
        'action=view_exchange_history_as_teacher&user_id=${userId}&page=1',
        '查看此學員紀錄'
    );
}

// [V39.6 重構]
async function showStudentSelectionForMessageHistory(users) {
    return buildUserSelectionCarousel(
        users,
        `請選擇要查詢留言的學員`,
        'action=view_historical_messages_as_teacher&user_id=${userId}&page=1',
        '查看此學員留言'
    );
}


async function showAllTeachersList(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        console.log('[DEBUG] 準備查詢所有老師...');
        const res = await client.query(
            "SELECT id, name, bio, image_url FROM teachers ORDER BY name ASC"
        );
        
        console.log(`[DEBUG] 資料庫回傳了 ${res.rows.length} 筆老師資料。`);
        if (res.rows.length > 0) {
            res.rows.forEach(row => console.log(`[DEBUG] 找到老師: ${row.name} (ID: ${row.id})`));
        }


        const allTeachers = res.rows;
        const hasNextPage = allTeachers.length > offset + CONSTANTS.PAGINATION_SIZE;
        const pageTeachers = allTeachers.slice(offset, offset + CONSTANTS.PAGINATION_SIZE);


        if (pageTeachers.length === 0 && page === 1) {
            return '目前尚未建立任何老師的公開資訊檔案。';
        }
        if (pageTeachers.length === 0) {
            return '沒有更多老師的資訊了。';
        }

        const teacherBubbles = pageTeachers.map(t => ({
            type: 'bubble',
            hero: { type: 'image', url: t.image_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
            body: {
                type: 'box', layout: 'vertical', paddingAll: 'lg',
                contents: [
                    { type: 'text', text: t.name, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'text', text: t.bio || '這位老師尚未留下簡介。', wrap: true, size: 'sm', color: '#666666', margin: 'md' },
                ],
            },
        }));
        const paginationBubble = createPaginationBubble('action=list_all_teachers', page, hasNextPage);
        if (paginationBubble) {
            teacherBubbles.push(paginationBubble);
        }


        return { 
            type: 'flex', 
            altText: '師資列表', 
            contents: { type: 'carousel', contents: teacherBubbles } 
        };
    });
}
async function buildTeacherSelectionCarousel() {
    return executeDbQuery(async (client) => {
        const res = await client.query("SELECT id, name, image_url FROM teachers ORDER BY name ASC");
        if (res.rows.length === 0) {
            return { type: 'text', text: '錯誤：系統中沒有任何師資檔案，請先至「個人資訊」建立至少一位老師的檔案。' };
        }

        const teacherBubbles = res.rows.map(t => ({
            type: 'bubble',
            hero: {
                type: 'image',
                url: t.image_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER,
                size: 'full',
                aspectRatio: '1:1',
                aspectMode: 'cover',
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: t.name, weight: 'bold', size: 'lg', align: 'center' }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [{
                    type: 'button',
                    style: 'primary',
                    height: 'sm',
                    action: {
                        type: 'postback',
                        label: '選擇此老師',
                        data: `action=select_teacher_for_course&teacher_id=${t.id}`
                    }
                }]
            }
        }));
        return {
            type: 'flex',
            altText: '請選擇授課老師',
            contents: { type: 'carousel', contents: teacherBubbles }
        };
    });
}
async function showManualAdjustHistory(page, userId = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        let query = "SELECT * FROM orders WHERE amount = 0";
        const queryParams = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND user_id = $${paramIndex++}`;
            queryParams.push(userId);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);
        
        const res = await client.query(query, queryParams);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageRows.length === 0) {
            if (page > 1) return '沒有更多紀錄了。';
            
            const emptyMsg = userId ? '這位學員沒有任何手動調整紀錄。' : '目前沒有任何手動調整紀錄。';
            return {
                type: 'flex',
                altText: '手動調整紀錄',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: emptyMsg, align: 'center', wrap: true }
                        ]
                    }
                }
            };
        }
        
        const headerText = userId ? `${pageRows[0].user_name} 的調整紀錄` : '手動調整紀錄';

        const listItems = pageRows.map(record => {
            const isAddition = record.points > 0;
            const pointsText = isAddition ? `+${record.points}` : `${record.points}`;
            const pointsColor = isAddition ? '#1A759F' : '#D9534F';

            return {
                type: 'box',
                layout: 'horizontal',
                paddingAll: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 3,
                        spacing: 'sm', // 增加一點間距
                        contents: [
                            { type: 'text', text: record.user_name, weight: 'bold', size: 'sm' },
                            // [新增] 顯示調整原因的 Text 元件
                            { type: 'text', text: `原因：${record.notes || '未填寫'}`, size: 'xs', color: '#666666', wrap: true },
                            { type: 'text', text: formatDateTime(record.timestamp), size: 'xxs', color: '#AAAAAA' }
                        ]
                    },
                    {
                        type: 'text', text: `${pointsText} 點`, gravity: 'center', align: 'end',
                        flex: 2, weight: 'bold', size: 'sm', color: pointsColor
                    }
                ]
            };
        });
        
        const customParams = userId ? `&user_id=${userId}` : '';
        const paginationBubble = createPaginationBubble('action=view_manual_adjust_history', page, hasNextPage, customParams);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        
        return {
            type: 'flex',
            altText: '手動調整紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: createStandardHeader(headerText),
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'none',
                    contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item])
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: footerContents
                }
            }
        };
    });
}

async function showPurchaseHistoryAsTeacher(page, userId = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        let query = `SELECT * FROM orders WHERE amount > 0 AND status = 'completed'`;
        const queryParams = [];
        let paramIndex = 1;

        if (userId) {
            query += ` AND user_id = $${paramIndex++}`;
            queryParams.push(userId);
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);
        
        const res = await client.query(query, queryParams);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageRows.length === 0) {
            if (page > 1) return '沒有更多紀錄了。';

            // [最終修正] 當第一頁沒有資料時，回傳一個包含搜尋按鈕的 Flex Message
            const emptyMsg = userId ? '這位學員沒有任何購點紀錄。' : '目前沒有任何學員的購點紀錄。';
             return {
                type: 'flex',
                altText: '購點紀錄',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: emptyMsg, align: 'center', wrap: true }
                        ]
                    }
                }
            };
        }
        
        const headerText = userId ? `${pageRows[0].user_name} 的購點紀錄` : '所有學員購點紀錄';

        const listItems = pageRows.map(order => ({
            type: 'box',
            layout: 'horizontal',
            paddingAll: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 3,
                    contents: [
                        { type: 'text', text: order.user_name, weight: 'bold', size: 'sm' },
                        { type: 'text', text: `購點：${order.points} 點`, size: 'sm' },
                        { type: 'text', text: formatDateTime(order.timestamp), size: 'xxs', color: '#AAAAAA' }
                    ]
                },
                {
                    type: 'text', text: `$${order.amount}`, gravity: 'center', align: 'end',
                    flex: 2, weight: 'bold', size: 'md', color: '#28A745',
                }
            ]
        }));
        
        const customParams = userId ? `&user_id=${userId}` : '';
        const paginationBubble = createPaginationBubble('action=view_purchase_history_as_teacher', page, hasNextPage, customParams);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        
        return {
            type: 'flex',
            altText: headerText,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: createStandardHeader(headerText),
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'none',
                    contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item])
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: footerContents
                }
            }
        };
    });
}
async function showExchangeHistoryAsTeacher(page, userId = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        let query = `SELECT * FROM product_orders`;
        const queryParams = [];
        let paramIndex = 1;

        if (userId) {
            query += ` WHERE user_id = $${paramIndex++}`;
            queryParams.push(userId);
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);
        
        const res = await client.query(query, queryParams);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageRows.length === 0) {
            if (page > 1) return '沒有更多紀錄了。';
            
            // [最終修正] 當第一頁沒有資料時，回傳一個包含搜尋按鈕的 Flex Message
            const emptyMsg = userId ? '這位學員沒有任何購買紀錄。' : '目前沒有任何學員的購買紀錄。';
            return {
                type: 'flex',
                altText: '購買紀錄',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: emptyMsg, align: 'center', wrap: true }
                        ]
                    }
                }
            };
        }

        const headerText = userId ? `${pageRows[0].user_name} 的購買紀錄` : '所有學員購買紀錄';

        const statusMap = {
            'completed': { text: '✅ 已完成', color: '#52b69a' },
            'pending_payment': { text: '❗ 待付款', color: '#f28482' },
            'pending_confirmation': { text: '🕒 款項確認中', color: '#ff9e00' },
            'cancelled': { text: '❌ 已取消', color: '#d90429' }
        };
        
        const listItems = pageRows.map(order => {
            const statusInfo = statusMap[order.status] || { text: order.status, color: '#6c757d' };
            const titleText = userId ? order.product_name : `${order.user_name} 購買了 ${order.product_name}`;

            return {
                type: 'box',
                layout: 'horizontal',
                paddingAll: 'md',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 3,
                        contents: [
                            { type: 'text', text: titleText, weight: 'bold', size: 'sm', wrap: true },
                            { type: 'text', text: statusInfo.text, size: 'xs', color: statusInfo.color, weight: 'bold' },
                            { type: 'text', text: formatDateTime(order.created_at), size: 'xxs', color: '#AAAAAA' }
                        ]
                    },
                    {
                        type: 'text', text: `$${order.amount} 元`, gravity: 'center', align: 'end',
                        flex: 2, weight: 'bold', size: 'sm', color: '#28A745',
                    }
                ]
            };
        });
        
        const customParams = userId ? `&user_id=${userId}` : '';
        const paginationBubble = createPaginationBubble('action=view_exchange_history_as_teacher', page, hasNextPage, customParams);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        
        return {
            type: 'flex',
            altText: headerText,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: createStandardHeader(headerText),
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'none',
                    contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item])
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: footerContents
                }
            }
        };
    });
}
async function showHistoricalMessagesAsTeacher(page, userId = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        let query = `SELECT * FROM feedback_messages`;
        const queryParams = [];
        let paramIndex = 1;

        if (userId) {
            query += ` WHERE user_id = $${paramIndex++}`;
            queryParams.push(userId);
        }
        
        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);
        
        const res = await client.query(query, queryParams);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageMessages.length === 0) {
            if (page > 1) return '沒有更多紀錄了。';

            // [最終修正] 當第一頁沒有資料時，回傳一個包含搜尋按鈕的 Flex Message
            const emptyMsg = userId ? '這位學員沒有任何留言紀錄。' : '目前沒有任何學員的留言紀錄。';
            return {
                type: 'flex',
                altText: '歷史留言',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: emptyMsg, align: 'center', wrap: true }
                        ]
                    }
                }
            };
        }

        const headerText = userId ? `${pageMessages[0].user_name} 的歷史留言` : '所有學員歷史留言';

        const statusMap = {
            new: { text: '🟡 新留言', color: '#ffb703' },
            read: { text: '⚪️ 已讀', color: '#adb5bd' },
            replied: { text: '🟢 已回覆', color: '#2a9d8f' },
        };
        
        const listItems = pageMessages.map(msg => {
            const statusInfo = statusMap[msg.status] || { text: msg.status, color: '#6c757d' };
            const replyContent = msg.teacher_reply 
                ? [{ type: 'separator' }, { type: 'text', text: `回覆：${msg.teacher_reply}`, wrap: true, size: 'xs', color: '#495057' }]
                : [];

            return {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                spacing: 'sm',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: msg.user_name, weight: 'bold', size: 'sm', flex: 3 },
                            { type: 'text', text: statusInfo.text, size: 'xs', color: statusInfo.color, align: 'end', flex: 2 }
                        ]
                    },
                    { type: 'text', text: `留言：${msg.message}`, wrap: true, size: 'sm' },
                    ...replyContent,
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xxs', color: '#AAAAAA', margin: 'md' }
                ]
            };
        });
        
        const customParams = userId ? `&user_id=${userId}` : '';
        const paginationBubble = createPaginationBubble('action=view_historical_messages_as_teacher', page, hasNextPage, customParams);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        
        return {
            type: 'flex',
            altText: headerText,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: createStandardHeader(headerText),
                body: { 
                    type: 'box', 
                    layout: 'vertical', 
                    paddingAll: 'none', 
                    contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) 
                },
                footer: { 
                    type: 'box', 
                    layout: 'vertical', 
                    contents: footerContents 
                }
            }
        };
    });
}

async function showUnreadMessages(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query("SELECT * FROM feedback_messages WHERE status = 'new' ORDER BY timestamp ASC LIMIT $1 OFFSET $2", [CONSTANTS.PAGINATION_SIZE + 1, offset]);
        
        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageMessages.length === 0 && page === 1) {
            return '太棒了！目前沒有未回覆的學員留言。';
        }
        if (pageMessages.length === 0) {
            return '沒有更多未回覆的留言了。';
        }


        const messageBubbles = pageMessages.map(msg => ({
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: msg.user_name, weight: 'bold', size: 'lg', wrap: true },
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xs', color: '#AAAAAA' },
                    { type: 'separator', margin: 'lg' },
                    { type: 'text', text: msg.message, wrap: true, margin: 'lg', size: 'md' }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '💬 回覆此留言', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } },
                    { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '標示為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }
                ]
            }
        }));
        const paginationBubble = createPaginationBubble('action=view_unread_messages', page, hasNextPage);
        if (paginationBubble) {
            messageBubbles.push(paginationBubble);
        }


        return { type: 'flex', altText: '未回覆的學員留言', contents: { type: 'carousel', contents: messageBubbles } };
    });
}
async function showPendingShopOrders(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        // [V35.5 修改] 查詢所有未完成的訂單
        const res = await client.query(
            "SELECT * FROM product_orders WHERE status IN ('pending_payment', 'pending_confirmation') ORDER BY created_at ASC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );


        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageOrders.length === 0 && page === 1) {
            return '目前沒有待處理的商品訂單。';
        }
        if (pageOrders.length === 0) {
            return '沒有更多待處理的訂單了。';
        }


        const listItems = pageOrders.map(order => {
            const bodyContents = [
                { type: 'text', text: order.product_name, weight: 'bold', size: 'md', wrap: true },
                { type: 'text', text: `購買者: ${order.user_name}`, size: 'sm' },
                { type: 'text', text: `金額: ${order.amount} 元`, size: 'sm', color: '#666666' },
                { type: 'text', text: formatDateTime(order.created_at), size: 'xxs', color: '#AAAAAA' },
                { type: 'separator', margin: 'md' }
            ];
            
            let footerContents = [];


            if (order.status === 'pending_payment' && order.payment_method === 'cash') {
                bodyContents.push({ type: 'text', text: '付款方式：現金面交', margin: 'md', size: 'sm', weight: 'bold', color: '#1A759F' });
                footerContents.push({ type: 'button', style: 'primary', color: '#28a745', height: 'sm', action: { type: 'postback', label: '✅ 確認收款', data: `action=confirm_shop_order&orderUID=${order.order_uid}` } });
                footerContents.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '取消訂單', data: `action=cancel_shop_order_start&orderUID=${order.order_uid}` } });
            } else if (order.status === 'pending_confirmation' && order.payment_method === 'transfer') {
                bodyContents.push({ type: 'text', text: '付款方式：轉帳', margin: 'md', size: 'sm', color: '#34A0A4' });
                bodyContents.push({ type: 'text', text: `後五碼: ${order.last_5_digits}`, size: 'lg', weight: 'bold', margin: 'sm' });
                footerContents.push({ type: 'button', style: 'primary', color: '#28a745', height: 'sm', action: { type: 'postback', label: '核准', data: `action=confirm_shop_order&orderUID=${order.order_uid}` } });
                footerContents.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '退回', data: `action=reject_shop_order&orderUID=${order.order_uid}` } });
            } else {
                 bodyContents.push({ type: 'text', text: '狀態：等待學員付款中...', margin: 'md', size: 'sm', color: '#6c757d' });
            }
            
            return {
                type: 'bubble',
                size: 'giga',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'lg',
                    spacing: 'sm',
                    contents: bodyContents
                },
                ...(footerContents.length > 0 && {
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: footerContents
                    }
                })
            };
        });


        const paginationBubble = createPaginationBubble('action=view_pending_shop_orders', page, hasNextPage);
        if (paginationBubble) {
            listItems.push(paginationBubble);
        }
        
        return {
            type: 'flex',
            altText: '待處理的商品訂單',
            contents: {
                type: 'carousel',
                contents: listItems
            }
        };
    });
}


async function showAnnouncementsForDeletion(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(
            "SELECT * FROM announcements ORDER BY created_at DESC LIMIT $1 OFFSET $2",
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );


        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageAnnouncements = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageAnnouncements.length === 0 && page === 1) {
            return '目前沒有任何可刪除的公告。';
        }
        if (pageAnnouncements.length === 0) {
            return '沒有更多公告了。';
        }


        const listItems = pageAnnouncements.map(ann => ({
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            paddingAll: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
                    contents: [
                        { type: 'text', text: ann.content, wrap: true, size: 'sm' },
                        { type: 'text', text: `由 ${ann.creator_name} 於 ${formatDateTime(ann.created_at)} 發佈`, size: 'xxs', color: '#AAAAAA', margin: 'lg', wrap: true }
                    ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    justifyContent: 'center',
                    contents: [
                         { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '刪除', data: `action=select_announcement_for_deletion&ann_id=${ann.id}` } }
                    ]
                }
            ]
        }));
        const paginationBubble = createPaginationBubble('action=view_announcements_for_deletion', page, hasNextPage);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        return {
            type: 'flex',
            altText: '選擇要刪除的公告',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '刪除舊公告', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
    });
}
async function showCourseSeries(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(
            `SELECT DISTINCT ON (LEFT(id, 2)) id, title
             FROM courses
             WHERE time > NOW()
             ORDER BY LEFT(id, 2), time ASC
             LIMIT $1 OFFSET $2`,
            [CONSTANTS.PAGINATION_SIZE + 1, offset]
        );


        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageSeries = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageSeries.length === 0 && page === 1) {
            return '目前沒有任何已開設且未來的課程系列可供管理。';
        }
        if (pageSeries.length === 0) {
            return '沒有更多課程系列了。';
        }


        const seriesBubbles = pageSeries.map(series => {
            const prefix = series.id.substring(0, 2);
            const mainTitle = getCourseMainTitle(series.title);


            return {
                type: 'bubble',
                header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: mainTitle, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true } ], backgroundColor: '#343A40', paddingAll: 'lg' },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    paddingAll: 'lg',
                    contents: [
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '🗓️ 單堂管理與取消', data: `action=manage_course_group&prefix=${prefix}&page=1` } },
                        { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '🗑️ 批次取消全系列', data: `action=cancel_course_group_confirm&prefix=${prefix}` } }
                    ]
                }
            };
        });


        const paginationBubble = createPaginationBubble('action=view_course_series', page, hasNextPage);
        if (paginationBubble) {
            seriesBubbles.push(paginationBubble);
        }


        return {
            type: 'flex',
            altText: '管理已開課程',
            contents: {
                type: 'carousel',
                contents: seriesBubbles
            }
        };
    });
}
// [程式夥伴二次修正] V40.10.2 - 處理 last_5_digits 為 null 的情況
async function showPendingOrders(page) {
    const mapOrderToBubble = (order) => {
        const bodyContents = [
            { type: 'text', text: order.user_name, weight: 'bold', size: 'xl' },
            { type: 'text', text: `${order.points} 點 / ${order.amount} 元`, size: 'md' },
            { type: 'separator', margin: 'lg' }
        ];
        const footerContents = [];
        let footerLayout = 'vertical'; 

        if (order.payment_method === 'cash') {
            bodyContents.push({
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                    { type: 'text', text: '付款方式：🤝 現金面交', weight: 'bold', color: '#1A759F'},
                    { type: 'text', text: `建立時間: ${formatDateTime(order.timestamp)}`, size: 'sm', color: '#666666'}
                ]
            });
            footerContents.push({
                type: 'button', style: 'primary', color: '#28a745',
                action: { type: 'postback', label: '✅ 確認收款並加點', data: `action=confirm_order&order_id=${order.order_id}` }
            });
        } else { 
            footerLayout = 'horizontal'; 
            bodyContents.push({
                type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                contents: [
                    // ====================== [修改開始] ======================
                    // 檢查 order.last_5_digits 是否為 null，如果是，就顯示 '尚未提供'
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '後五碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { 
                        type: 'text', text: order.last_5_digits || '尚未提供', color: '#666666', size: 'sm', flex: 5, wrap: true } ] },
                    // ====================== [修改結束] ======================
                    { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '回報時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(order.timestamp), color: '#666666', size: 'sm', flex: 5, wrap: true } ] }
                ]
            });
            footerContents.push(
                { type: 'button', style: 'primary', color: '#dc3545', flex: 1, action: { type: 'postback', label: '退回', data: `action=reject_order&order_id=${order.order_id}` } },
                { type: 'button', style: 'primary', color: '#28a745', flex: 1, action: { type: 'postback', label: '核准', data: `action=confirm_order&order_id=${order.order_id}` } }
            );
        }
        
        return {
            type: 'bubble',
            body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
            footer: { type: 'box', layout: footerLayout, spacing: 'sm', contents: footerContents }
        };
    };

    return createPaginatedCarousel({
        altText: '待確認點數訂單',
        baseAction: 'action=view_pending_orders',
        page: page,
        dataQuery: "SELECT * FROM orders WHERE status IN ('pending_confirmation', 'pending_payment') ORDER BY timestamp ASC LIMIT $1 OFFSET $2",
        queryParams: [],
        mapRowToBubble: mapOrderToBubble,
        noDataMessage: '目前沒有待您確認的點數訂單。'
    });
}

/**
* [V36.7 FINAL-FIX-15] 顯示可預約課程，放大課程名稱字體
* @param {string} userId - 使用者 ID
* @param {URLSearchParams} [postbackData=new URLSearchParams()] - 從 postback 事件來的數據，用於處理「顯示更多」
* @returns {Promise<object|string>} - Flex Message 物件或無資料時的文字訊息
*/
async function showAvailableCourses(userId, postbackData = new URLSearchParams()) {
   return executeDbQuery(async (client) => {
       const coursesRes = await client.query(
           `SELECT
               c.*,
               t.name AS teacher_name,
               t.image_url AS teacher_image_url,
               t.bio AS teacher_bio
            FROM courses c
            LEFT JOIN teachers t ON c.teacher_id = t.id
            WHERE c.time > NOW()
            ORDER BY c.time ASC`
       );

       if (coursesRes.rows.length === 0) {
           return '太棒了！目前沒有任何未來的課程。';
       }

       const courseSeries = {};
       coursesRes.rows.forEach(course => {
           const prefix = course.id.substring(0, 2);
           if (!courseSeries[prefix]) {
                const timeRegex = /\s\((\d{2}:\d{2}-\d{2}:\d{2})\)$/;
                const match = course.title.match(timeRegex);
                let timeRange = '';
                let mainTitle = getCourseMainTitle(course.title); 

                if (match) {
                    timeRange = match[1];
                    mainTitle = course.title.replace(timeRegex, '').trim();
                }

                courseSeries[prefix] = {
                   prefix: prefix,
                   mainTitle: mainTitle,
                   timeRange: timeRange,
                   teacherName: course.teacher_name || '待定',
                   teacherBio: course.teacher_bio,
                   teacherImageUrl: course.teacher_image_url,
                   pointsCost: course.points_cost,
                   capacity: course.capacity,
                   sessions: []
               };
           }
           courseSeries[prefix].sessions.push(course);
       });
       
       const showMorePrefix = postbackData.get('show_more');
       const seriesPage = parseInt(postbackData.get('series_page') || '1', 10);
      
       let allSeries = Object.values(courseSeries);
       if (showMorePrefix) {
           const activeSeriesIndex = allSeries.findIndex(s => s.prefix === showMorePrefix);
           if (activeSeriesIndex > 0) {
               const [activeSeries] = allSeries.splice(activeSeriesIndex, 1);
               allSeries.unshift(activeSeries);
           }
       }

       const seriesBubbles = allSeries.map(series => {
           let currentPage = (series.prefix === showMorePrefix) ? seriesPage : 1;
           const SESSIONS_PER_PAGE = 6;
           const offset = (currentPage - 1) * SESSIONS_PER_PAGE;
           const sessionsToShow = series.sessions.slice(offset, offset + SESSIONS_PER_PAGE);
           const hasMoreSessions = series.sessions.length > offset + SESSIONS_PER_PAGE;
           
           const createSessionButton = (session) => {
               if (!session) {
                   return {
                       type: 'box',
                       layout: 'vertical',
                       spacing: 'xs',
                       flex: 1,
                       contents: [
                           {
                               type: 'button',
                               action: { type: 'postback', label: ' ', data: 'action=do_nothing' },
                               height: 'sm',
                               style: 'secondary',
                               color: '#F0F0F0'
                           },
                           {
                               type: 'text',
                               text: '-',
                               size: 'xs',
                               color: '#F0F0F0',
                               align: 'end',
                               margin: 'xs'
                           }
                       ]
                   };
               }
               const remainingSpots = session.capacity - (session.students || []).length;
               const isFull = remainingSpots <= 0;
               const waitingCount = (session.waiting || []).length;
               let buttonActionData, subText, subTextColor, buttonColor, buttonStyle;
               if (!isFull) {
                   buttonActionData = `action=select_booking_spots&course_id=${session.id}`;
                   subText = `剩餘 ${remainingSpots} 位`;
                   subTextColor = '#666666';
                   buttonStyle = 'secondary';
                   buttonColor = undefined;
               } else {
                   buttonActionData = `action=confirm_join_waiting_list_start&course_id=${session.id}`;
                   const nextPosition = waitingCount + 1;
                   subText = `候補第 ${nextPosition} 位`;
                   subTextColor = '#DE5246';
                   buttonStyle = 'secondary';
                   buttonColor = '#808080';
               }
               return { 
                   type: 'box', 
                   layout: 'vertical', 
                   contents: [
                       { type: 'button', action: { type: 'postback', label: formatDateOnly(session.time), data: buttonActionData }, height: 'sm', style: buttonStyle, color: buttonColor },
                       { type: 'text', text: subText, size: 'xs', color: subTextColor, align: 'end', margin: 'xs' }
                   ], 
                   spacing: 'xs',
                   flex: 1
               };
           };

           const sessionButtonRows = [];
           for (let i = 0; i < SESSIONS_PER_PAGE; i += 2) {
               const leftSession = sessionsToShow[i];
               const rightSession = sessionsToShow[i + 1];
               sessionButtonRows.push({
                   type: 'box',
                   layout: 'horizontal',
                   spacing: 'md',
                   margin: sessionButtonRows.length > 0 ? 'sm' : 'none',
                   contents: [
                       createSessionButton(leftSession),
                       createSessionButton(rightSession)
                   ]
               });
           }

           const hasPreviousSessions = currentPage > 1;
           const pageButtons = [];
           if (hasPreviousSessions) {
               const prevSeriesPage = currentPage - 1;
               pageButtons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '⬅️ 上一頁', data: `action=view_available_courses&show_more=${series.prefix}&series_page=${prevSeriesPage}` }});
           }
           if (hasMoreSessions) {
               const nextSeriesPage = currentPage + 1;
               pageButtons.push({ type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '下一頁 ➡️', data: `action=view_available_courses&show_more=${series.prefix}&series_page=${nextSeriesPage}` }});
           }
           
           const footerContents = [...sessionButtonRows];
           footerContents.push({ type: 'separator', margin: 'md' });
           
           let paginationComponent;
           if (pageButtons.length > 0) {
               paginationComponent = {
                   type: 'box',
                   layout: 'horizontal',
                   contents: pageButtons,
                   margin: 'md'
               };
           } else {
               paginationComponent = {
                   type: 'box',
                   layout: 'vertical',
                   justifyContent: 'center',
                   margin: 'md',
                   spacing: 'none',
                   contents: [
                       {
                           type: 'text',
                           text: '-',
                           color: '#FFFFFF',
                           size: 'sm',
                           align: 'center'
                       },
                       {
                           type: 'text',
                           text: '-',
                           color: '#FFFFFF',
                           size: 'sm',
                           align: 'center'
                       }
                   ]
               };
           }
           footerContents.push(paginationComponent);

           return {
               type: 'bubble',
               size: 'giga',
               body: {
                    type: 'box',
                    layout: 'horizontal', 
                    paddingAll: 'lg',
                    spacing: 'lg',
                    alignItems: 'flex-end',
                    contents: [
                        {
                            type: 'box', 
                            layout: 'vertical',
                            flex: 2, 
                            contents: [
                                {
                                    type: 'image',
                                    url: series.teacherImageUrl || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_COURSE,
                                    aspectRatio: '1:1',
                                    aspectMode: 'cover',
                                    size: 'full'
                                }
                            ]
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'sm',
                            flex: 4, 
                            justifyContent: 'flex-start',
                            contents: [
                                // ====================== [修改] ======================
                                { type: 'text', text: series.mainTitle, weight: 'bold', size: 'xl', wrap: true },
                                // =======================================================
                                { type: 'text', text: `授課老師：${series.teacherName}`, size: 'sm' },
                                { type: 'text', text: (series.teacherBio || '').substring(0, 28) + '...', size: 'xs', color: '#888888', wrap: true, margin: 'xs' },
                                { type: 'separator', margin: 'md'},
                                {
                                    type: 'box',
                                    layout: 'vertical',
                                    margin: 'md',
                                    spacing: 'sm',
                                    contents: [
                                        ...(series.timeRange ? [{
                                            type: 'text',
                                            text: `時間：${series.timeRange}`,
                                            size: 'sm',
                                            color: '#666666'
                                        }] : []),
                                        {
                                            type: 'box',
                                            layout: 'horizontal',
                                            contents: [
                                                { type: 'text', text: `費用：${series.pointsCost} 點`, size: 'sm', color: '#666666' },
                                                { type: 'text', text: `總名額：${series.capacity} 位`, size: 'sm', color: '#666666', align: 'end' }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
               footer: {
                   type: 'box',
                   layout: 'vertical',
                   spacing: 'none',
                   paddingAll: 'md',
                   contents: footerContents
               }
           };
       });
       
       const headerText = '🗓️ 預約課程總覽';
       const flexMessage = { type: 'flex', altText: headerText, contents: { type: 'carousel', contents: seriesBubbles } };
       if (!postbackData.has('show_more')) {
           return [{ type: 'text', text: `你好！${headerText}如下，請左右滑動查看：` }, flexMessage];
       }
       return flexMessage;
   });
}

async function showMyCourses(userId, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(
            `SELECT
                c.*,
                t.name AS teacher_name,
                t.image_url AS teacher_image_url
             FROM courses c
             LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE (
                c.students @> ARRAY[$1]::text[] OR c.waiting @> ARRAY[$1]::text[]
             ) AND c.time > NOW()
             ORDER BY c.time ASC`,
            [userId]
        );

        const allCourseCardsData = res.rows.flatMap(c => {
            const cards = [];
            const spotsBookedByUser = (c.students || []).filter(id => id === userId).length;
            const isUserOnWaitingList = (c.waiting || []).includes(userId);

            if (spotsBookedByUser > 0) cards.push({ course: c, type: 'booked', spots: spotsBookedByUser });
            if (isUserOnWaitingList) cards.push({ course: c, type: 'waiting' });
            return cards;
        });

        if (allCourseCardsData.length === 0 && page === 1) {
            return '您目前沒有任何已預約或候補中的課程。';
        }
        
        const hasNextPage = allCourseCardsData.length > offset + CONSTANTS.PAGINATION_SIZE;
        const pageCardsData = allCourseCardsData.slice(offset, offset + CONSTANTS.PAGINATION_SIZE);
        
        if (pageCardsData.length === 0) {
            return '沒有更多課程了。';
        }

        const courseBubbles = pageCardsData.map(cardData => {
            const c = cardData.course;
            const statusComponents = [];
            const footerButtons = [];

            if (cardData.type === 'booked') {
                statusComponents.push({ type: 'text', text: `✅ 您已預約 ${cardData.spots} 位`, color: '#28a745', size: 'sm', weight: 'bold' });

                const eightHoursInMillis = CONSTANTS.TIME.EIGHT_HOURS_IN_MS;
                const canCancel = new Date(c.time).getTime() - Date.now() > eightHoursInMillis;

                if (canCancel) {
                    footerButtons.push({ 
                        type: 'button', style: 'primary', color: '#DE5246', height: 'sm', 
                        action: { type: 'postback', label: `取消 ${cardData.spots > 1 ? '1位 ' : ''}預約`, data: `action=confirm_cancel_booking_start&course_id=${c.id}` } 
                    });
                } else {
                    footerButtons.push({
                        type: 'button', style: 'secondary', color: '#AAAAAA', height: 'sm',
                        action: { type: 'postback', label: '🚫 無法取消 (8小時內)', data: 'action=do_nothing' }
                    });
                }
            }
            if (cardData.type === 'waiting') {
                const waitingPosition = (c.waiting || []).indexOf(userId) + 1;
                statusComponents.push({ type: 'text', text: `🕒 候補第 ${waitingPosition} 位`, color: '#FFA500', size: 'sm', weight: 'bold' });
                footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=confirm_cancel_waiting_start&course_id=${c.id}` } });
            }

            // [V38.4 修改] 調整 Flex Message 結構
            return {
                type: 'bubble',
                size: 'giga',
                body: {
                    type: 'box',
                    layout: 'horizontal',
                    paddingAll: 'lg',
                    spacing: 'lg',
                    contents: [
                        {
                            type: 'image',
                            url: c.teacher_image_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_COURSE,
                            aspectRatio: '1:1',
                            aspectMode: 'cover',
                            size: 'md',
                            flex: 2
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'sm',
                            flex: 4,
                            contents: [
                                { type: 'text', text: getCourseMainTitle(c.title), weight: 'bold', size: 'lg', wrap: true },
                                { type: 'text', text: formatDateOnly(c.time), size: 'sm' },
                                { type: 'text', text: `授課老師：${c.teacher_name || '待定'}`, size: 'xs', color: '#888888' },
                                { type: 'separator', margin: 'md' },
                                ...statusComponents
                            ]
                        }
                    ]
                },
                ...(footerButtons.length > 0 && {
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        paddingAll: 'md',
                        contents: footerButtons
                    }
                })
            };
        });

        const paginationBubble = createPaginationBubble('action=view_my_courses', page, hasNextPage);
        if (paginationBubble) {
            courseBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles } };
    });
}

async function showMyMessages(userId, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(
            // ====================== [修改] ======================
            `SELECT * FROM feedback_messages WHERE user_id = $1 ORDER BY timestamp ASC LIMIT $2 OFFSET $3`,
            // =======================================================
            [userId, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;
    
        if (pageMessages.length > 0) {
            await client.query(
                "UPDATE feedback_messages SET is_student_read = true WHERE user_id = $1 AND status = 'replied' AND is_student_read = false",
                [userId]
            );
        }
  
    
        if (pageMessages.length === 0 && page === 1) {
            return '您目前沒有任何留言紀錄。';
        }
        if (pageMessages.length === 0) {
            return '沒有更多留言紀錄了。';
        }


        const statusMap = {
            new: { text: '🟡 等待回覆', color: '#ffb703' },
            read: { text: '⚪️ 老師已讀', color: '#adb5bd' },
            replied: { text: '🟢 老師已回覆', color: '#2a9d8f' },
        };
        const listItems = pageMessages.map(msg => {
            const statusInfo = statusMap[msg.status] || { text: msg.status, color: '#6c757d' };
            const replyContent = msg.teacher_reply
                ? [{ type: 'separator', margin: 'sm' }, { type: 'text', text: `老師回覆：${msg.teacher_reply}`, wrap: true, size: 'xs', color: '#495057' }]
                : [];


            return {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                spacing: 'sm',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: '我的留言', weight: 'bold', size: 'sm', flex: 3 },
                            { type: 'text', text: statusInfo.text, size: 'xs', color: statusInfo.color, align: 'end', flex: 2 }
                        ]
                    },
                    { type: 'text', text: msg.message, wrap: true, size: 'sm' },
                    ...replyContent,
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xxs', color: '#AAAAAA', margin: 'md' }
                ]
            };
        });
        const paginationBubble = createPaginationBubble('action=view_my_messages', page, hasNextPage);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        return {
            type: 'flex',
            altText: '您的歷史留言紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '我的留言紀錄', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
    });
}

async function showSingleCoursesForCancellation(prefix, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const coursesRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT $2 OFFSET $3", [`${prefix}%`, CONSTANTS.PAGINATION_SIZE + 1, offset]);


        const hasNextPage = coursesRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : coursesRes.rows;


        if (pageCourses.length === 0 && page === 1) {
           return "此系列沒有可取消的未來課程。";
        }
        if (pageCourses.length === 0) {
            return '沒有更多課程了。';
        }


        const listItems = pageCourses.map(c => ({
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            paddingAll: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
                    contents: [
                        { type: 'text', text: c.title, wrap: true, weight: 'bold', size: 'sm' },
                        { type: 'text', text: formatDateOnly(c.time), size: 'sm', margin: 'md'}
                    ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 2,
                    justifyContent: 'center',
                    contents: [
                        { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂', data: `action=confirm_single_course_cancel&course_id=${c.id}` } }
                    ]
                }
            ]
        }));
        const paginationBubble = createPaginationBubble('action=manage_course_group', page, hasNextPage, `&prefix=${prefix}`);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
        return {
            type: 'flex',
            altText: '請選擇要單次取消的課程',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '單堂課程管理', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
    });
}
// =======================================================
// [V39.10 預購功能整合] 顯示可預約/預購商品
// =======================================================
// [新增] 產生單一商品 Bubble 的輔助函式
function createSingleProductBubble(p) {
    // ---- 按鈕外觀邏輯 ----
    const isSoldOut = p.inventory <= 0 && p.status !== 'preorder';
    const isPreorder = p.status === 'preorder';

    let buttonLabel = '我要購買';
    let buttonActionData = `action=select_product_quantity&product_id=${p.id}`;
    let buttonStyle = 'primary';
    let buttonColor = '#52B69A'; // 預設為綠色

    if (isSoldOut) {
        buttonLabel = '已售完';
        buttonActionData = 'action=do_nothing';
        buttonStyle = 'secondary';
        buttonColor = '#AAAAAA';
    } else if (isPreorder) {
        buttonLabel = '我要預購';
        buttonActionData = `action=select_preorder_quantity&product_id=${p.id}`;
        buttonColor = '#FF9E00'; // 預購按鈕為橘色
    }

    const buttonAction = { type: 'postback', label: buttonLabel, data: buttonActionData };
    // ---- 按鈕邏輯結束 ----

    return {
        type: 'bubble',
        size: 'kilo', // [修改] 在此處指定卡片大小
        hero: (p.image_url && p.image_url.startsWith('https')) ? {
            type: 'image', url: p.image_url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover'
        } : undefined,
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: p.name, weight: 'bold', size: 'xl' },
                {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'md',
                    contents: [
                        { type: 'text', text: `${p.price} 元`, size: 'lg', color: '#1A759F', weight: 'bold', flex: 2 },
                        { type: 'text', text: isPreorder ? '開放預購中' : `庫存: ${p.inventory}`, size: 'sm', color: isPreorder ? '#FF9E00' : '#666666', align: 'end', flex: 1, gravity: 'bottom' }
                    ]
                },
                { type: 'text', text: p.description || ' ', wrap: true, size: 'sm', margin: 'md', color: '#666666' },
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            contents: [{
                type: 'button',
                style: buttonStyle,
                action: buttonAction,
                color: buttonColor,
            }]
        }
    };
}

// [修改] V39.10 預購功能整合，並新增商品堆疊功能
async function showShopProducts(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const productsRes = await client.query("SELECT * FROM products WHERE status IN ('available', 'preorder') ORDER BY name ASC, created_at DESC");

        if (productsRes.rows.length === 0 && page === 1) {
            return '目前商城沒有任何商品，敬請期待！';
        }

        const productGroups = {};
        productsRes.rows.forEach(p => {
            if (!productGroups[p.name]) {
                productGroups[p.name] = [];
            }
            productGroups[p.name].push(p);
        });

        const allItems = Object.values(productGroups);
        
        const hasNextPage = allItems.length > offset + CONSTANTS.PAGINATION_SIZE;
        const pageItems = hasNextPage ? allItems.slice(offset, CONSTANTS.PAGINATION_SIZE) : allItems.slice(offset);

        if (pageItems.length === 0) {
            return '沒有更多商品了。';
        }
        
        const productBubbles = pageItems.map(group => {
            if (group.length === 1) {
                return createSingleProductBubble(group[0]);
            } else {
                const representativeProduct = group[0];
                return {
                    type: 'bubble',
                    size: 'kilo', // [修改] 在此處指定卡片大小
                    hero: (representativeProduct.image_url && representativeProduct.image_url.startsWith('https')) ? {
                        type: 'image', url: representativeProduct.image_url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover'
                    } : undefined,
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: representativeProduct.name, weight: 'bold', size: 'xl' },
                            { type: 'text', text: `共 ${group.length} 種選項可選`, size: 'sm', color: '#666666', margin: 'md' },
                            { type: 'text', text: representativeProduct.description || ' ', wrap: true, size: 'sm', margin: 'md', color: '#666666' },
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{
                            type: 'button',
                            style: 'primary',
                            color: '#1A759F',
                            action: {
                                type: 'postback',
                                label: '查看所有選項',
                                data: `action=view_product_group&name=${encodeURIComponent(representativeProduct.name)}`
                            }
                        }]
                    }
                };
            }
        });

        const paginationBubble = createPaginationBubble('action=view_shop_products', page, hasNextPage);
        if (paginationBubble) {
            productBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles } };
    });
}

async function showProductManagementList(page = 1, filter = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        let baseQuery = "SELECT * FROM products";
        const queryParams = [];
        let paramIndex = 1;

        if (filter) {
            baseQuery += ` WHERE status = $${paramIndex++}`;
            queryParams.push(filter);
        }

        baseQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);

        const productsRes = await client.query(baseQuery, queryParams);

        const hasNextPage = productsRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            const emptyMessage = filter === 'available'
                ? '目前沒有任何販售中的商品。'
                : (filter === 'unavailable' ? '目前沒有任何已下架的商品。' : '目前沒有任何商品可管理。');
            return emptyMessage;
        }
        if (pageProducts.length === 0) {
            return '沒有更多商品了。';
        }

        const productBubbles = pageProducts.map(p => {
            const footerButtons = [
                { type: 'button', style: 'primary', height: 'sm', color: '#52B69A', action: { type: 'postback', label: '✏️ 編輯資訊', data: `action=manage_product&product_id=${p.id}` } },
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 調整庫存', data: `action=adjust_inventory_start&product_id=${p.id}` } }
            ];

            // 判斷要顯示「下架/上架」還是「刪除」按鈕
            if (filter === 'unavailable') {
                // 如果是已下架商品，顯示「重新上架」和「刪除商品」
                footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '重新上架', data: `action=toggle_product_status&product_id=${p.id}` } });
                footerButtons.push({ type: 'button', style: 'primary', height: 'sm', color: '#DE5246', action: { type: 'postback', label: '🗑️ 刪除商品', data: `action=delete_product_start&product_id=${p.id}` } });
            } else {
                // 否則 (販售中商品)，顯示「下架商品」
                footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', color: '#D9534F', action: { type: 'postback', label: '下架商品', data: `action=toggle_product_status&product_id=${p.id}` } });
            }

            return {
                type: 'bubble',
                hero: (p.image_url && p.image_url.startsWith('https')) ? {
                    type: 'image',
                    url: p.image_url,
                    size: 'full',
                    aspectRatio: '1:1',
                    aspectMode: 'cover',
                } : undefined,
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: p.name, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'text', text: p.description || '無描述', wrap: true, size: 'sm', color: '#666666', margin: 'md' },
                        { type: 'separator', margin: 'lg' },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            margin: 'md',
                            contents: [
                                { type: 'text', text: `價格: ${p.price} 元`, size: 'md' },
                                { type: 'text', text: `庫存: ${p.inventory}`, size: 'md', align: 'end' }
                            ]
                        }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    contents: footerButtons
                }
            };
        });

        const paginationBubble = createPaginationBubble(
            'action=view_products',
            page,
            hasNextPage,
            filter ? `&filter=${filter}` : ''
        );
        if (paginationBubble) {
            productBubbles.push(paginationBubble);
        }

        return { type: 'flex', altText: '商品管理列表', contents: { type: 'carousel', contents: productBubbles } };
    });
}
// =======================================================
// [新增] 顯示零庫存商品，供老師決定下架或開放預購
// =======================================================
async function showSoldOutProducts(page) {
    // 定義如何將一筆資料庫的 row 轉換成一個 Flex Bubble
    const mapRowToBubble = (product) => {
        return {
            type: 'bubble',
            hero: (product.image_url && product.image_url.startsWith('https')) ? {
                type: 'image',
                url: product.image_url,
                size: 'full',
                aspectRatio: '1:1',
                aspectMode: 'cover',
            } : undefined,
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    { type: 'text', text: product.name, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'text', text: product.description || '無描述', wrap: true, size: 'sm', color: '#666666', margin: 'md' },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'md',
                        contents: [
                            { type: 'text', text: `價格: ${product.price} 元`, size: 'md' },
                            { type: 'text', text: `庫存: 0`, size: 'md', align: 'end', color: '#DE5246' }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#FF9E00', // 橘色代表預購
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '🚀 開放預購',
                            data: `action=enable_preorder_start&product_id=${product.id}`
                        }
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '直接下架',
                            data: `action=disable_product_start&product_id=${product.id}`
                        }
                    }
                ]
            }
        };
    };

    // 使用我們通用的分頁輪播產生器來建立訊息
    return createPaginatedCarousel({
        altText: '零庫存商品管理',
        baseAction: 'action=view_sold_out_products',
        page: page,
        // 查詢條件：庫存為0，且狀態仍為 'available' 的商品
        dataQuery: "SELECT * FROM products WHERE inventory <= 0 AND status = 'available' ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        queryParams: [],
        mapRowToBubble: mapRowToBubble,
        noDataMessage: '太好了！目前沒有任何已售完的商品需要處理。'
    });
}
// =======================================================
// [新增] 顯示預購中的商品管理介面
// =======================================================
async function showPreorderProducts(page) {
    const mapRowToBubble = async (product) => {
        // 取得此商品的預購總數
        const preorderStats = await executeDbQuery(client =>
            client.query("SELECT COUNT(*), SUM(quantity) as total_quantity FROM product_preorders WHERE product_id = $1 AND status = 'active'", [product.id])
        ).then(res => ({
            count: parseInt(res.rows[0].count, 10) || 0,
            total_quantity: parseInt(res.rows[0].total_quantity, 10) || 0
        }));

        return {
            type: 'bubble',
            hero: (product.image_url && product.image_url.startsWith('https')) ? {
                type: 'image', url: product.image_url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover'
            } : undefined,
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: product.name, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'separator', margin: 'lg' },
                    {
                        type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                        contents: [
                            { type: 'text', text: `預購人數：${preorderStats.count} 人`, size: 'sm' },
                            { type: 'text', text: `預購總數：${preorderStats.total_quantity} 個`, size: 'sm' }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [
                    {
                        type: 'button', style: 'primary', height: 'sm',
                        action: { type: 'postback', label: '📋 查看預購清單', data: `action=view_preorder_list&product_id=${product.id}` }
                    },
                    {
                        type: 'button', style: 'secondary', color: '#DE5246', height: 'sm',
                        action: { type: 'postback', label: '停止預購並下架', data: `action=stop_preorder_start&product_id=${product.id}` }
                    }
                ]
            }
        };
    };

    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query("SELECT * FROM products WHERE status = 'preorder' ORDER BY created_at DESC LIMIT $1 OFFSET $2", [CONSTANTS.PAGINATION_SIZE + 1, offset]);
        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageRows.length === 0 && page === 1) {
            return '目前沒有任何商品正在預購中。';
        }
        if (pageRows.length === 0) {
            return '沒有更多預購中的商品了。';
        }

        const bubbles = await Promise.all(pageRows.map(mapRowToBubble));
        const paginationBubble = createPaginationBubble('action=view_preorder_products', page, hasNextPage);
        if (paginationBubble) {
            bubbles.push(paginationBubble);
        }

        return {
            type: 'flex',
            altText: '預購中商品管理',
            contents: { type: 'carousel', contents: bubbles }
        };
    });
}
// =======================================================
// [新增] 顯示待出貨的預購商品列表
// =======================================================
async function showFulfillmentList(page) {
    const mapRowToBubble = async (product) => {
        const rosterRes = await executeDbQuery(client =>
            client.query("SELECT user_name, quantity FROM product_preorders WHERE product_id = $1 AND status = 'active' ORDER BY created_at ASC", [product.id])
        );
        const rosterItems = rosterRes.rows.map(r => `• ${r.user_name} (x${r.quantity})`).join('\n');

        return {
            type: 'bubble',
            size: 'giga',
            header: {
                type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#1A759F',
                contents: [
                    { type: 'text', text: product.name, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true },
                    { type: 'text', text: '待通知出貨', size: 'sm', color: '#FFFFFF' }
                ]
            },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
                contents: [
                    { type: 'text', text: '最終預購名單：', weight: 'bold' },
                    { type: 'text', text: rosterItems.length > 0 ? rosterItems : '無', wrap: true, size: 'sm' }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [
                    {
                        type: 'button', style: 'primary', color: '#28A745', height: 'sm',
                        action: { type: 'postback', label: '🚚 商品已到貨 (通知付款)', data: `action=notify_product_arrival_start&product_id=${product.id}` }
                    },
                    {
                        type: 'button',
                        style: 'secondary',
                        color: '#DE5246', // 使用紅色系以示警示
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '❗ 商品缺貨 (取消預購)',
                            data: `action=cancel_preorder_start&product_id=${product.id}`
                        }
                    }
                ]
            }
        };
    };

    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const res = await client.query(`
            SELECT p.* FROM products p
            WHERE p.status = 'unavailable' 
            AND EXISTS (
                SELECT 1 FROM product_preorders pp 
                WHERE pp.product_id = p.id AND pp.status = 'active'
            )
            ORDER BY p.created_at DESC LIMIT $1 OFFSET $2
        `, [CONSTANTS.PAGINATION_SIZE + 1, offset]);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageRows = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageRows.length === 0 && page === 1) {
            return '目前沒有待處理的已到貨預購商品。';
        }
        if (pageRows.length === 0) {
            return '沒有更多待處理的預購商品了。';
        }

        const bubbles = await Promise.all(pageRows.map(mapRowToBubble));
        const paginationBubble = createPaginationBubble('action=view_fulfillment_list', page, hasNextPage);
        if (paginationBubble) {
            bubbles.push(paginationBubble);
        }

        return {
            type: 'flex',
            altText: '待出貨預購管理',
            contents: { type: 'carousel', contents: bubbles }
        };
    });
}

// =======================================================
// [新增] 顯示單一商品的預購名單
// =======================================================
async function showPreorderRoster(productId) {
    return executeDbQuery(async (client) => {
        const productRes = await client.query("SELECT name FROM products WHERE id = $1", [productId]);
        if (productRes.rows.length === 0) return '找不到該商品。';
        const productName = productRes.rows[0].name;

        const rosterRes = await client.query("SELECT user_name, quantity FROM product_preorders WHERE product_id = $1 AND status = 'active' ORDER BY created_at ASC", [productId]);

        const bodyContents = [];
        if (rosterRes.rows.length === 0) {
            bodyContents.push({ type: 'text', text: '目前尚無學員預購', align: 'center', color: '#888888' });
        } else {
            const listItems = rosterRes.rows.map(row => ({
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                contents: [
                    { type: 'text', text: row.user_name, flex: 3 },
                    { type: 'text', text: `數量：${row.quantity}`, align: 'end', flex: 2 }
                ]
            }));
            bodyContents.push(...listItems);
        }

        return {
            type: 'flex',
            altText: `${productName} 的預購名單`,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: {
                    type: 'box', layout: 'vertical',
                    contents: [
                        { type: 'text', text: '預購名單', color: '#FFFFFF', size: 'lg', weight: 'bold' },
                        { type: 'text', text: productName, color: '#FFFFFF', wrap: true, size: 'sm' }
                    ],
                    backgroundColor: '#343A40', paddingAll: 'lg'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    paddingAll: 'lg',
                    contents: bodyContents
                }
            }
        };
    });
}

// =======================================================
// 程式碼修改：V35.5 (商品現金購 - Part 2)
// =======================================================
// [V35.6 優化] 將購買紀錄改為條列式，並區分待處理與歷史訂單
async function showStudentExchangeHistory(userId, page = 1) { // page 參數暫時保留，但不再使用
    return executeDbQuery(async (client) => {
        // 抓取最近 20 筆訂單以避免訊息過長
        const res = await client.query(`SELECT * FROM product_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]);


        if (res.rows.length === 0) {
            return '您沒有任何商品購買紀錄。';
        }


        // 步驟 1: 將訂單分組
        const pendingOrders = [];
        const historyOrders = [];


        res.rows.forEach(order => {
            if (['pending_payment', 'pending_confirmation'].includes(order.status)) {
                pendingOrders.push(order);
            } else {
                historyOrders.push(order);
            }
        });


        const bodyContents = [];
        const separator = { type: 'separator', margin: 'md' };
        
      // 步驟 2: 產生「歷史訂單」列表
        if (historyOrders.length > 0) {
            bodyContents.push({ type: 'text', text: '歷史訂單', weight: 'bold', size: 'lg', margin: 'xl', color: '#6c757d' });


            historyOrders.forEach(order => {
                let statusText, statusColor;
                if (order.status === 'completed') {
                    statusText = '✅ 已完成';
                    statusColor = '#28a745';
                } else { // cancelled
                    statusText = '❌ 已取消';
                    statusColor = '#dc3545';
                }


                bodyContents.push({
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                        { type: 'text', text: order.product_name, weight: 'bold', wrap: true, color: '#888888' },
                        { type: 'text', text: `金額：${order.amount} 元`, size: 'sm', color: '#888888' },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                { type: 'text', text: statusText, size: 'sm', color: statusColor },
                                { type: 'text', text: formatDateTime(order.created_at), size: 'sm', color: '#AAAAAA', align: 'end' }
                            ]
                        }
                    ]
                });
                bodyContents.push(separator);
            });
        }
         // 步驟 3: 產生「待處理訂單」列表
        if (pendingOrders.length > 0) {
            bodyContents.push({ type: 'text', text: '待處理訂單', weight: 'bold', size: 'lg', margin: 'md', color: '#1A759F' });
            
            pendingOrders.forEach(order => {
                let statusText, statusColor, actionButton;
                if (order.status === 'pending_payment' && order.payment_method === 'transfer') {
                    statusText = '❗ 待回報匯款';
                    statusColor = '#f28482';
                    actionButton = {
                        type: 'button',
                        style: 'primary',
                        height: 'sm',
                        color: '#f28482',
                        action: { type: 'postback', label: '輸入匯款後五碼', data: `action=report_shop_last5&orderUID=${order.order_uid}` },
                        margin: 'md'
                    };
                } else if (order.status === 'pending_payment' && order.payment_method === 'cash') {
                    statusText = '🤝 待現金付款';
                    statusColor = '#1A759F';
                } else { // pending_confirmation
                    statusText = '🕒 款項確認中';
                    statusColor = '#ff9e00';
                }


                bodyContents.push({
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                        { type: 'text', text: order.product_name, weight: 'bold', wrap: true },
                        { type: 'text', text: `金額：${order.amount} 元`, size: 'sm' },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                { type: 'text', text: statusText, size: 'sm', color: statusColor, weight: 'bold' },
                                { type: 'text', text: formatDateTime(order.created_at), size: 'sm', color: '#AAAAAA', align: 'end' }
                            ]
                        },
                        ...(actionButton ? [actionButton] : []) // 如果有按鈕，就加進來
                    ]
                });
                bodyContents.push(separator);
            });
        }
      
        // 移除最後一個多餘的分隔線
        if (bodyContents.length > 0 && bodyContents[bodyContents.length - 1].type === 'separator') {
            bodyContents.pop();
        }


        return {
            type: 'flex',
            altText: '我的購買紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [{ type: 'text', text: '📜 我的購買紀錄', weight: 'bold', size: 'xl', color: '#FFFFFF' }],
                    backgroundColor: '#343A40',
                    paddingAll: 'lg'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'md',
                    paddingAll: 'lg',
                    contents: bodyContents.length > 0 ? bodyContents : [{type: 'text', text: '目前沒有任何紀錄。', align: 'center'}]
                }
            }
        };
    });
}


async function showCourseRosterSummary(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
    return executeDbQuery(async (client) => {
        const sevenDaysLater = new Date(Date.now() + 7 * CONSTANTS.TIME.ONE_DAY_IN_MS);
        const res = await client.query(
            `SELECT id, title, time,
                    COALESCE(array_length(students, 1), 0) as student_count,
                    COALESCE(array_length(waiting, 1), 0) as waiting_count
             FROM courses
             WHERE time > NOW() AND time < $1
             ORDER BY time ASC LIMIT $2 OFFSET $3`,
            [sevenDaysLater, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );


        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageCourses = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;


        if (pageCourses.length === 0 && page === 1) {
            return '未來 7 天內沒有任何課程。';
        }
        if (pageCourses.length === 0) {
            return '沒有更多課程了。';
        }


        const listItems = pageCourses.map(c => ({
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            paddingAll: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
                    contents: [
                        { type: 'text', text: c.title, weight: 'bold', size: 'sm', wrap: true },
                        { type: 'text', text: formatDateOnly(c.time), size: 'xs', color: '#666666' },
                        { type: 'text', text: `預約: ${c.student_count} 人 / 候補: ${c.waiting_count} 人`, size: 'xs', margin: 'sm' }
                    ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 2,
                    justifyContent: 'center',
                    contents: [
                        { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '看名單', data: `action=view_course_roster_details&course_id=${c.id}` } }
                    ]
                }
            ]
        }));
        
        const paginationBubble = createPaginationBubble('action=view_course_roster_summary', page, hasNextPage);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];


        return {
            type: 'flex',
            altText: '課程狀態查詢',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '7日內課程狀態查詢', weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
    });
}




async function showCourseRosterDetails(courseId) {
    return executeDbQuery(async (client) => {
        const courseRes = await client.query("SELECT title, time, students, waiting FROM courses WHERE id = $1", [courseId]);
        if (courseRes.rows.length === 0) {
            return '找不到該課程的資料。';
        }
        const course = courseRes.rows[0];
        const studentIds = course.students || [];
        const waitingIds = course.waiting || [];
        const allUserIds = [...studentIds, ...waitingIds];


        let users = [];
        if (allUserIds.length > 0) {
            const usersRes = await client.query("SELECT id, name, picture_url FROM users WHERE id = ANY($1::text[])", [allUserIds]);
            users = usersRes.rows;
        }


        const userMap = new Map(users.map(u => [u.id, u]));
        const createStudentListComponent = (ids, title) => {
            const studentCounts = ids.reduce((acc, id) => {
                acc[id] = (acc[id] || 0) + 1;
                return acc;
            }, {});
            
            const uniqueIds = Object.keys(studentCounts);


            const studentBoxes = [];
            if (uniqueIds.length > 0) {
                uniqueIds.forEach(id => {
                    const user = userMap.get(id);
                    const count = studentCounts[id];
                    const displayName = user?.name || '未知用戶';
                    const displayText = count > 1 ? `${displayName} (x${count})` : displayName;


                    studentBoxes.push({
                        type: 'box',
                        layout: 'vertical',
                        alignItems: 'center',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'image',
                                url: user?.picture_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER,
                                aspectRatio: '1:1',
                                size: 'md',
                                flex: 0
                            },
                            {
                                type: 'text',
                                text: displayText,
                                wrap: true,
                                size: 'sm',
                                align: 'center'
                            }
                        ]
                    });
                });
            }


            const listContents = [
                { type: 'text', text: title, weight: 'bold', color: '#1A759F', margin: 'lg', size: 'md', align: 'center' },
            ];
            if (studentBoxes.length === 0) {
                listContents.push({ type: 'text', text: '無', margin: 'md', size: 'sm', color: '#999999', align: 'center' });
            } else {
                const rows = [];
                for (let i = 0; i < studentBoxes.length; i += 4) {
                    rows.push({
                        type: 'box',
                        layout: 'horizontal',
                        spacing: 'md',
                        margin: 'lg',
                        contents: studentBoxes.slice(i, i + 4)
                    });
                }
                listContents.push(...rows);
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
                type: 'bubble',
                size: 'giga',
                header: {
                    type: 'box', layout: 'vertical', paddingAll: 'lg',
                    contents: [
                        { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'text', text: formatDateTime(course.time), size: 'sm', color: '#666666', margin: 'md' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'md',
                    contents: bodyContents
                }
            }
        };
    });
}
async function showStudentDetails(studentId) {
    return executeDbQuery(async (client) => {
        const userRes = await client.query('SELECT name, picture_url, points FROM users WHERE id = $1', [studentId]);
        if (userRes.rows.length === 0) {
            return '找不到該學員的資料。';
        }
        const student = userRes.rows[0];

        const coursesRes = await client.query(
            `SELECT title, time FROM courses WHERE $1 = ANY(students) AND time > NOW() ORDER BY time ASC LIMIT 3`,
            [studentId]
        );

        // [修改] 查詢 orders 時選取所有欄位 (*)，以便取得 amount 和 notes
        const ordersRes = await client.query(
            `SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 3`,
            [studentId]
        );

        const createListItem = (text, size = 'sm', color = '#666666') => ({ type: 'text', text, size, color, wrap: true, margin: 'sm' });

        const coursesContents = [];
        if (coursesRes.rows.length > 0) {
            coursesRes.rows.forEach(course => {
                coursesContents.push(createListItem(`- ${getCourseMainTitle(course.title)} (${formatDateTime(course.time)})`));
            });
        } else {
            coursesContents.push(createListItem('無', 'sm', '#aaaaaa'));
        }
        
        const statusMap = { 'completed': '✅', 'pending_confirmation': '🕒', 'pending_payment': '❗', 'rejected': '❌' };
        const ordersContents = [];
        if (ordersRes.rows.length > 0) {
            // [修改] 更新訂單顯示邏輯，加入對手動調整原因的判斷
            ordersRes.rows.forEach(order => {
                if (order.amount === 0) { // 如果是手動調整
                    const typeText = order.points > 0 ? '✨ 手動加點' : '⚠️ 手動扣點';
                    ordersContents.push(createListItem(`${typeText} ${order.points}點 (${formatDateTime(order.timestamp)})`));
                    // 如果有原因，就在下一行顯示
                    if (order.notes) {
                        ordersContents.push(createListItem(`└ 原因：${order.notes}`, 'xs', '#888888'));
                    }
                } else { // 如果是一般訂單
                    const statusIcon = statusMap[order.status] || '❓';
                    ordersContents.push(createListItem(`${statusIcon} ${order.points}點 (${formatDateTime(order.timestamp)})`));
                }
            });
        } else {
            ordersContents.push(createListItem('無', 'sm', '#aaaaaa'));
        }

        return {
            type: 'flex',
            altText: `學員 ${student.name} 的詳細資料`,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'lg',
                    backgroundColor: '#343A40',
                    contents: [
                        { type: 'text', text: student.name, weight: 'bold', size: 'xl', color: '#FFFFFF', align: 'center' },
                        {
                            type: 'box', layout: 'baseline', margin: 'md', justifyContent: 'center',
                            contents: [
                                { type: 'text', text: '剩餘點數', size: 'sm', color: '#FFFFFF' },
                                { type: 'text', text: `${student.points}`, weight: 'bold', size: 'xxl', color: '#52B69A', margin: 'sm' },
                                { type: 'text', text: '點', size: 'sm', color: '#FFFFFF' }
                            ]
                        }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingTop: 'lg',
                    spacing: 'xl',
                    contents: [
                        {
                            type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                            contents: [
                                { type: 'text', text: '📅 近期預約課程', weight: 'bold', size: 'md', color: '#333333' },
                                ...coursesContents
                            ]
                        },
                        { type: 'separator', margin: 'xl' },
                        {
                            type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                            contents: [
                                { type: 'text', text: '💰 近期購點紀錄', weight: 'bold', size: 'md', color: '#333333' },
                                ...ordersContents
                            ]
                        }
                    ]
                }
            }
        };
    });
}

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));


app.listen(PORT, async () => {
  try {
    checkEnvironmentVariables();
    console.log('✅ 資料庫結構已由 Build Command 處理。');


    console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
    console.log(`Bot 版本 V43.2 (合併查詢)`);

   } catch (error) {
    console.error('❌ 應用程式啟動失敗:', error);
    process.exit(1);
  }
});
// =======================================================
// [優化建議] Postback 子處理函式區塊
// =======================================================
/**
 * 處理所有「瀏覽分頁」相關的 Postback
 */
async function handleViewActions(action, data, user) {
    const page = parseInt(data.get('page') || '1', 10);
    const userId = user.id;

    switch (action) {
        case 'view_product_group': {
            const productName = decodeURIComponent(data.get('name'));
            if (!productName) {
                return '操作失敗，缺少商品名稱。';
            }

            const products = await executeDbQuery(client =>
                client.query("SELECT * FROM products WHERE name = $1 AND status IN ('available', 'preorder') ORDER BY created_at DESC", [productName])
            ).then(res => res.rows);

            if (products.length === 0) {
                return '抱歉，找不到這個系列的商品。';
            }

            const groupBubbles = products.map(p => createSingleProductBubble(p));

            const backButtonBubble = {
                type: 'bubble',
                size: 'kilo', // [修改] 在此處指定卡片大小
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'md',
                    justifyContent: 'center',
                    contents: [{
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: {
                            type: 'postback',
                            label: '⬅️ 返回商品總覽',
                            data: `action=run_command&text=${encodeURIComponent(CONSTANTS.COMMANDS.STUDENT.VIEW_SHOP_PRODUCTS)}`,
                            displayText: '返回商品總覽'
                        }
                    }]
                }
            };
            groupBubbles.push(backButtonBubble);

            return {
                type: 'flex',
                altText: `查看 ${productName} 系列商品`,
                contents: {
                    type: 'carousel',
                    contents: groupBubbles
                }
            };
        }
        
        case 'view_sold_out_products':
            return showSoldOutProducts(page);
        case 'view_preorder_products':
            return showPreorderProducts(page);
        case 'view_fulfillment_list':
            return showFulfillmentList(page);
        case 'view_error_logs':
            return showErrorLogs(page);
        case 'view_course_series':
            return showCourseSeries(page);
        case 'view_course_roster_summary':
            return showCourseRosterSummary(page);
        case 'view_course_roster_details':
            return showCourseRosterDetails(data.get('course_id'));
        case 'view_student_details':
            return showStudentDetails(data.get('studentId'));
        case 'list_teachers_for_removal':
            return showTeacherListForRemoval(page);
        case 'view_pending_orders':
        case 'view_pending_orders_page':
            return showPendingOrders(page);
        case 'student_search_results':
            return showStudentSearchResults(decodeURIComponent(data.get('query') || ''), page);
        case 'view_unread_messages':
            return showUnreadMessages(page);
        case 'view_announcements_for_deletion':
            return showAnnouncementsForDeletion(page);
        case 'view_purchase_history':
            return showPurchaseHistory(userId, page);
        case 'view_available_courses':
            return showAvailableCourses(userId, data);
        case 'view_my_courses':
            return showMyCourses(userId, page);
        case 'view_shop_products':
            return showShopProducts(page);
        case 'view_my_messages':
            return showMyMessages(userId, page);
        case 'view_products':
            return showProductManagementList(page, data.get('filter'));
        case 'view_pending_shop_orders':
            return showPendingShopOrders(page);
        case 'view_exchange_history':
            return showStudentExchangeHistory(userId, page);
        case 'view_historical_messages':
            return showHistoricalMessages(decodeURIComponent(data.get('query') || ''), page);
        case 'view_failed_tasks':
            return showFailedTasks(page);
        case 'manage_course_group':
            return showSingleCoursesForCancellation(data.get('prefix'), page);
        case 'view_manual_adjust_history':
            return showManualAdjustHistory(page, data.get('user_id'));
        case 'view_all_purchase_history_as_teacher':
            return showPurchaseHistoryAsTeacher(page);
        case 'view_purchase_history_as_teacher':
            return showPurchaseHistoryAsTeacher(page, data.get('user_id'));
        case 'view_all_exchange_history_as_teacher':
            return showExchangeHistoryAsTeacher(page);
        case 'view_exchange_history_as_teacher':
            return showExchangeHistoryAsTeacher(page, data.get('user_id'));
        case 'view_all_historical_messages_as_teacher':
            return showHistoricalMessagesAsTeacher(page);
        case 'view_historical_messages_as_teacher':
            return showHistoricalMessagesAsTeacher(page, data.get('user_id'));
        case 'list_all_teachers':
            return showAllTeachersList(page);
    }
    return null;
}

/**
 * 處理「管理員專用」的指令
 */
async function handleAdminActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        case 'view_admin_panel':
            return buildAdminPanelFlex();
        case 'view_notification_settings':
            return buildNotificationSettingsFlex();
        case 'view_management_functions':
            return buildManagementFunctionsFlex();
        case 'toggle_global_setting': {
            const key = data.get('key');
            const currentValue = data.get('value') === 'true';
            const newValue = !currentValue;

            await executeDbQuery(async (db) => {
                await db.query(
                    `INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, NOW())
                     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
                    [key, newValue.toString()]
                );
            });
            
            simpleCache.clear(key);
            return buildNotificationSettingsFlex();
        }
        case 'delete_error_log': {
            const logId = data.get('id');
            if (!logId) return '操作失敗，缺少日誌 ID。';
            const result = await executeDbQuery(client =>
                client.query('DELETE FROM error_logs WHERE id = $1', [logId])
            );
            return result.rowCount > 0
                ? `✅ 已成功刪除錯誤日誌 #${logId}。`
                : '找不到該筆錯誤日誌，可能已被刪除。';
        }
        case 'select_student_for_auth': {
            const targetId = data.get('targetId');
            const targetName = decodeURIComponent(data.get('targetName'));
            if (!targetId || !targetName) return '操作失敗，缺少目標學員資訊。';
            pendingTeacherAddition[userId] = { step: 'await_confirmation', targetUser: { id: targetId, name: targetName } };
            setupConversationTimeout(userId, pendingTeacherAddition, 'pendingTeacherAddition', u => { enqueuePushTask(u, { type: 'text', text: '授權老師操作逾時。' }).catch(e => console.error(e)); });
            return { type: 'text', text: `您確定要授權學員「${targetName}」成為老師嗎？`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: CONSTANTS.COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ]}};
        }
        case 'select_teacher_for_removal': {
            const targetId = data.get('targetId');
            const targetName = decodeURIComponent(data.get('targetName'));
            if (!targetId || !targetName) return '操作失敗，缺少目標老師資訊。';
            pendingTeacherRemoval[userId] = { step: 'await_confirmation', targetUser: { id: targetId, name: targetName } };
            setupConversationTimeout(userId, pendingTeacherRemoval, 'pendingTeacherRemoval', u => enqueuePushTask(u, { type: 'text', text: '移除老師操作逾時。' }));
            return { type: 'text', text: `您確定要移除老師「${targetName}」的權限嗎？\n該用戶將會變回學員身份。`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: CONSTANTS.COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ] } };
        }
        case 'retry_failed_task':
        case 'delete_failed_task': {
            const failedTaskId = data.get('id');
            if (action === 'retry_failed_task') {
                return executeDbQuery(async (db) => {
                    await db.query('BEGIN');
                    try {
                        const failedTaskRes = await db.query('SELECT * FROM failed_tasks WHERE id = $1 FOR UPDATE', [failedTaskId]);
                        if (failedTaskRes.rows.length === 0) { await db.query('ROLLBACK'); return '找不到該失敗任務，可能已被處理。'; }
                        const taskToRetry = failedTaskRes.rows[0];
                        await db.query(`INSERT INTO tasks (recipient_id, message_payload, status, retry_count, last_error) VALUES ($1, $2, 'pending', 0, 'Retried from DLQ')`, [taskToRetry.recipient_id, taskToRetry.message_payload]);
                        await db.query('DELETE FROM failed_tasks WHERE id = $1', [failedTaskId]);
                        await db.query('COMMIT');
                        return `✅ 已將任務 #${failedTaskId} 重新加入佇列等待發送。`;
                    } catch (err) {
                        await db.query('ROLLBACK');
                        console.error(`❌ 重試失敗任務 ${failedTaskId} 失敗:`, err);
                        return '處理任務時發生錯誤，操作已取消。';
                    }
                });
            } else { // delete_failed_task
                const result = await executeDbQuery(client => client.query('DELETE FROM failed_tasks WHERE id = $1', [failedTaskId]) );
                return result.rowCount > 0 ? `✅ 已成功刪除失敗任務 #${failedTaskId}。` : '找不到該失敗任務，可能已被刪除。';
            }
        }
    }
    return null;
}
/**
 * 處理「老師」相關的操作 (包含個人資訊設定、手動調點、啟動查詢流程等)
 */
async function handleTeacherActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        case 'manage_personal_profile': {
            return executeDbQuery(async (client) => {
                const res = await client.query('SELECT * FROM teachers WHERE line_user_id = $1', [userId]);
                if (res.rows.length > 0) {
                    const profile = res.rows[0];
                    return {
                        type: 'flex', altText: '我的個人資訊',
                        contents: {
                            type: 'bubble',
                            hero: { type: 'image', url: profile.image_url || CONSTANTS.IMAGES.PLACEHOLDER_AVATAR_USER, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                            body: { type: 'box', layout: 'vertical', paddingAll: 'lg', spacing: 'md', contents: [ { type: 'text', text: profile.name, weight: 'bold', size: 'xl' }, { type: 'text', text: profile.bio || '尚未填寫簡介', wrap: true, size: 'sm', color: '#666666' } ] },
                            footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'lg', contents: [ { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✏️ 編輯姓名', data: `action=edit_teacher_profile_field&field=name` } }, { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✏️ 編輯簡介', data: `action=edit_teacher_profile_field&field=bio` } }, { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📷 更換照片', data: `action=edit_teacher_profile_field&field=image_url` } }, ] }
                        }
                    };
                } else {
                    return { type: 'text', text: '您好！您尚未建立您的公開師資檔案。\n建立檔案後，您的資訊將會顯示在「師資查詢」列表中。', quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '➕ 開始建立檔案', data: 'action=create_teacher_profile_start' } }] } };
                }
            });
        }
        case 'create_teacher_profile_start': {
            pendingTeacherProfileEdit[userId] = { type: 'create', step: 'await_name', profileData: {} };
            setupConversationTimeout(userId, pendingTeacherProfileEdit, 'pendingTeacherProfile-Edit', (u) => {
                enqueuePushTask(u, { type: 'text', text: '建立檔案操作逾時，自動取消。' });
            });
            return { type: 'text', text: '好的，我們開始建立您的師資檔案。\n\n首先，請輸入您希望顯示的姓名或暱稱：', quickReply: { items: getCancelMenu() } };
        }
        case 'edit_teacher_profile_field': {
            const field = data.get('field');
            const fieldMap = { name: '姓名/暱稱', bio: '個人簡介', image_url: '新的照片' };
            const promptMap = { name: '請輸入您想更新的姓名或暱稱：', bio: '請輸入您想更新的個人簡介 (可換行)：', image_url: '請直接上傳一張您想更換的個人照片：' };
            pendingTeacherProfileEdit[userId] = { type: 'edit', step: `await_${field}` };
            setupConversationTimeout(userId, pendingTeacherProfileEdit, 'pendingTeacherProfileEdit', (u) => {
                enqueuePushTask(u, { type: 'text', text: `編輯${fieldMap[field]}操作逾時，自動取消。` });
            });
            return { type: 'text', text: promptMap[field], quickReply: { items: getCancelMenu() } };
        }
        case 'confirm_teacher_profile_update': {
            const state = pendingTeacherProfileEdit[userId];
            if (!state || state.step !== 'await_confirmation' || !state.newData) { return '確認操作已逾時或無效，請重新操作。';
            }
            const newData = state.newData;
            const isCreating = state.type === 'create';
            delete pendingTeacherProfileEdit[userId];
            
            await executeDbQuery(async (client) => {
                if (isCreating) {
                    await client.query( `INSERT INTO teachers (line_user_id, name, bio, image_url) VALUES ($1, $2, $3, $4) ON CONFLICT (line_user_id) DO UPDATE SET name = EXCLUDED.name, bio = EXCLUDED.bio, image_url = EXCLUDED.image_url, updated_at = NOW()`, [userId, newData.name, newData.bio, newData.image_url] );
                } else {
                    const fields = Object.keys(newData);
                    const setClauses = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
                    const values = Object.values(newData);
                    await client.query( `UPDATE teachers SET ${setClauses}, updated_at = NOW() WHERE line_user_id = $${fields.length + 1}`, [...values, userId] );
                }
            });
            const successMessage = isCreating ? '✅ 恭喜！您的師資檔案已成功建立！' : '✅ 您的個人檔案已成功更新！';
            return successMessage;
        }
        case 'select_student_for_adjust': {
            const studentId = data.get('studentId');
            const student = await getUser(studentId);
            if (!student) return '找不到該學員的資料。';
            pendingManualAdjust[userId] = { step: 'await_operation', targetStudent: { id: student.id, name: student.name } };
            setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => enqueuePushTask(u, { type: 'text', text: '手動調整點數逾時，自動取消。' }));
            return { type: 'text', text: `已選擇學員：「${student.name}」。\n請問您要為他加點或扣點？`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.ADD_POINTS, text: CONSTANTS.COMMANDS.TEACHER.ADD_POINTS } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.DEDUCT_POINTS, text: CONSTANTS.COMMANDS.TEACHER.DEDUCT_POINTS } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ] } };
        }
        case 'select_announcement_for_deletion': {
            const ann_id = data.get('ann_id');
            const annRes = await executeDbQuery(client => client.query("SELECT content FROM announcements WHERE id = $1", [ann_id]) );
            if(annRes.rows.length === 0) return '找不到該公告。';
            pendingAnnouncementDeletion[userId] = { ann_id };
            setupConversationTimeout(userId, pendingAnnouncementDeletion, 'pendingAnnouncementDeletion', u => enqueuePushTask(u, { type: 'text', text: '刪除公告操作逾時。' }));
            return { type: 'text', text: `您確定要刪除以下公告嗎？\n\n「${annRes.rows[0].content.substring(0, 100)}...」`, quickReply: { items: [{type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.CONFIRM_DELETE_ANNOUNCEMENT, text: CONSTANTS.COMMANDS.TEACHER.CONFIRM_DELETE_ANNOUNCEMENT}}, {type: 'action', action: {type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL }}]}};
        }
        case 'select_purchase_history_view_type': {
            return {
                type: 'text',
                text: '請問您要查詢所有學員的購點紀錄，還是特定學員？',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '📜 顯示全部紀錄', data: 'action=view_all_purchase_history_as_teacher&page=1' } },
                        { type: 'action', action: { type: 'postback', label: '🔍 搜尋特定學員', data: 'action=start_purchase_history_search' } }
                    ]
                }
            };
        }
        case 'select_exchange_history_view_type': {
            return {
                type: 'text',
                text: '請問您要查詢所有學員的購買紀錄，還是特定學員？',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '📜 顯示全部紀錄', data: 'action=view_all_exchange_history_as_teacher&page=1' } },
                        { type: 'action', action: { type: 'postback', label: '🔍 搜尋特定學員', data: 'action=start_exchange_history_search' } }
                    ]
                }
            };
        }
        case 'select_message_history_view_type': {
            return {
                type: 'text',
                text: '請問您要查詢所有學員的留言，還是特定學員？',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '📜 顯示全部留言', data: 'action=view_all_historical_messages_as_teacher&page=1' } },
                        { type: 'action', action: { type: 'postback', label: '🔍 搜尋特定學員', data: 'action=start_message_history_search' } }
                    ]
                }
            };
        }
        case 'select_adjust_history_view_type': {
            return {
                type: 'text',
                text: '請問您要查詢所有學員的紀錄，還是特定學員？',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '📜 顯示全部紀錄', data: 'action=view_manual_adjust_history&page=1' } },
                        { type: 'action', action: { type: 'postback', label: '🔍 搜尋特定學員', data: 'action=start_manual_adjust_history_search' } }
                    ]
                }
            };
        }
        case 'start_manual_adjust_history_search': {
            pendingManualAdjustSearch[userId] = { step: 'await_student_name' };
            setupConversationTimeout(userId, pendingManualAdjustSearch, 'pendingManualAdjustSearch', (u) => {
                enqueuePushTask(u, { type: 'text', text: '搜尋操作已逾時，自動取消。' });
            });
            return {
                type: 'text',
                text: '請輸入您想查詢的學員姓名：',
                quickReply: { items: getCancelMenu() }
            };
        }
        case 'start_purchase_history_search': {
            pendingPurchaseHistorySearch[userId] = { step: 'await_student_name' };
            setupConversationTimeout(userId, pendingPurchaseHistorySearch, 'pendingPurchaseHistorySearch', u => enqueuePushTask(u, { type: 'text', text: '搜尋購點紀錄操作逾時，自動取消。' }));
            return {
                type: 'text',
                text: '請輸入您想查詢購點紀錄的學員姓名或 User ID：',
                quickReply: { items: getCancelMenu() }
            };
        }
        case 'start_exchange_history_search': {
            pendingExchangeHistorySearch[userId] = { step: 'await_student_name' };
            setupConversationTimeout(userId, pendingExchangeHistorySearch, 'pendingExchangeHistorySearch', u => enqueuePushTask(u, { type: 'text', text: '搜尋購買紀錄操作逾時，自動取消。' }));
            return {
                type: 'text',
                text: '請輸入您想查詢購買紀錄的學員姓名或 User ID：',
                quickReply: { items: getCancelMenu() }
            };
        }
        case 'start_message_history_search': {
            pendingMessageHistorySearch[userId] = { step: 'await_student_name' };
            setupConversationTimeout(userId, pendingMessageHistorySearch, 'pendingMessageHistorySearch', u => enqueuePushTask(u, { type: 'text', text: '搜尋歷史留言操作逾時，自動取消。' }));
            return {
                type: 'text',
                text: '請輸入您想查詢歷史留言的學員姓名或 User ID：',
                quickReply: { items: getCancelMenu() }
            };
        }
    }
    return null;
}
/**
 * 處理所有與「課程」相關的操作
 */
async function handleCourseActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        case 'set_course_weekday': {
            const state = pendingCourseCreation[userId];
            if (!state || state.step !== 'await_weekday') return '新增課程流程已逾時或中斷。';
            state.weekday = parseInt(data.get('day'), 10);
            state.weekday_label = WEEKDAYS.find(d => d.value === state.weekday).label;
            state.step = 'await_start_time';
            return {
                type: 'text',
                text: `好的，課程固定在每${state.weekday_label}。\n\n請問『開始』時間是幾點？（請輸入四位數時間，例如：19:30）`,
                quickReply: { items: getCancelMenu() }
            };
        }
        case 'select_teacher_for_course': {
            const state = pendingCourseCreation[userId];
            const teacher_id = parseInt(data.get('teacher_id'), 10);
            if (!state || state.step !== 'await_teacher' || !teacher_id) {
                return '操作已逾時或無效，請重新新增課程。';
            }
            state.teacher_id = teacher_id;
            state.step = 'await_confirmation';
            const teacher = await executeDbQuery(client =>
                client.query('SELECT name FROM teachers WHERE id = $1', [teacher_id])
            ).then(res => res.rows[0]);
            state.teacher_name = teacher?.name || '未知老師';

            const firstDate = getNextDate(state.weekday, state.start_time);
            const summary = `請確認課程資訊：\n\n` +
                `標題：${state.title}\n` +
                `老師：${state.teacher_name}\n` +
                `時間：每${state.weekday_label} ${state.start_time} - ${state.end_time}\n` +
                `堂數：${state.sessions} 堂\n` +
                `名額：${state.capacity} 位\n` +
                `費用：${state.points_cost} 點/堂\n\n` +
                `首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
            return {
                type: 'text',
                text: summary,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } },
                        { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            };
        }
        case 'publish_prefilled_announcement': {
            const state = pendingAnnouncementCreation[userId];
            if (!state || !state.content) return '操作已逾時或無效，請重新操作。';
            
            const contentToPublish = state.content;
            delete pendingAnnouncementCreation[userId];
            await executeDbQuery(client => 
                client.query( "INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)", [contentToPublish, userId, user.name])
            );
            return '✅ 公告已成功頒佈！學員可在「最新公告」中查看。';
        }
        case 'edit_prefilled_announcement': {
            const state = pendingAnnouncementCreation[userId];
            if (!state) return '操作已逾時或無效，請重新操作。';
            state.step = 'await_content';
            return { 
                type: 'text', 
                text: '請輸入您修改後的完整公告內容：',
                quickReply: { items: getCancelMenu() } 
            };
        }
        case 'cancel_announcement': {
            if (pendingAnnouncementCreation[userId]) {
                delete pendingAnnouncementCreation[userId];
            }
            return '好的，暫不發佈。';
        }
        case 'cancel_course_group_confirm': {
            const prefix = data.get('prefix');
            const courseTitle = await executeDbQuery(client => client.query("SELECT title FROM courses WHERE id LIKE $1 LIMIT 1", [`${prefix}%`])).then(res => res.rows[0]?.title);
            if (!courseTitle) return '找不到此課程系列。';
            const mainTitle = getCourseMainTitle(courseTitle);
            pendingCourseCancellation[userId] = { type: 'batch', prefix };
            setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', u => enqueuePushTask(u, { type: 'text', text: '取消課程操作逾時。' }));
            return { type: 'text', text: `⚠️ 警告：您確定要批次取消「${mainTitle}」系列的所有未來課程嗎？\n此操作將會退還點數給所有已預約的學員，且無法復原。`, quickReply: { items: [{type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL, text: CONSTANTS.COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL}}, {type: 'action', action: {type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL }}]}};
        }
        case 'confirm_single_course_cancel': {
            const courseId = data.get('course_id');
            const course = await getCourse(courseId);
            if (!course) return '找不到此課程。';
            pendingCourseCancellation[userId] = { type: 'single', course_id: courseId };
            setupConversationTimeout(userId, pendingCourseCancellation, 'pendingCourseCancellation', u => enqueuePushTask(u, { type: 'text', text: '取消課程操作逾時。' }));
            return { type: 'text', text: `您確定要取消單堂課程「${course.title}」嗎？\n此操作將退還點數給已預約的學員。`, quickReply: { items: [{type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL, text: CONSTANTS.COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL}}, {type: 'action', action: {type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL }}]}};
        }
        case 'select_booking_spots': {
            const course_id = data.get('course_id');
            const course = await getCourse(course_id);
            if (!course) return '抱歉，找不到該課程。';
            const remainingSpots = course.capacity - course.students.length;
            if (remainingSpots <= 0) return '抱歉，此課程名額已滿。';
            const maxSpots = Math.min(5, remainingSpots);
            const buttons = Array.from({ length: maxSpots }, (_, i) => ({ type: 'button', style: 'secondary', height: 'sm', margin: 'sm', action: { type: 'postback', label: `${i + 1} 位 (共 ${course.points_cost * (i + 1)} 點)`, data: `action=start_booking_confirmation&course_id=${course.id}&spots=${i + 1}` } }));
            return { type: 'flex', altText: '請選擇預約人數', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '選擇預約人數', weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#52b69a' }, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: course.title, wrap: true, weight: 'bold', size: 'md' }, { type: 'text', text: `剩餘名額：${remainingSpots} 位`, size: 'sm', color: '#666666', margin: 'md' }, { type: 'separator', margin: 'lg' } ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons } } };
        }
        case 'start_booking_confirmation': {
            const course_id = data.get('course_id');
            const spotsToBook = parseInt(data.get('spots'), 10);
            const course = await getCourse(course_id);
            if (!course) return '抱歉，找不到該課程。';
            const totalCost = course.points_cost * spotsToBook;
            const remainingSpots = course.capacity - course.students.length;
            if (spotsToBook > remainingSpots) return `抱歉，課程名額不足！\n目前僅剩 ${remainingSpots} 位。`;
            if (user.points < totalCost) return `抱歉，您的點數不足！\n預約 ${spotsToBook} 位需 ${totalCost} 點，您目前有 ${user.points} 點。`;
            pendingBookingConfirmation[userId] = { type: 'confirm_book', course_id: course.id, spots: spotsToBook };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => {
                enqueuePushTask(u, { type: 'text', text: '預約操作已逾時，自動取消。' });
            });
            const message = `請確認預約資訊：\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n預約：${spotsToBook} 位\n花費：${totalCost} 點\n\n您目前的點數為：${user.points} 點`;
            return { type: 'text', text: message, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 確認預約', data: `action=execute_booking&course_id=${course.id}&spots=${spotsToBook}` } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ]}};
        }
        case 'execute_booking': {
            const course_id = data.get('course_id');
            const spotsToBook = parseInt(data.get('spots'), 10);
            const result = await executeDbQuery(async (clientDB) => {
                await clientDB.query('BEGIN');
                try {
                    const userForUpdate = await clientDB.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                    const courseForUpdate = await clientDB.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [course_id]);
                    const course = courseForUpdate.rows[0];
                    const student = userForUpdate.rows[0];
                    if (!course) { await clientDB.query('ROLLBACK'); return '抱歉，找不到該課程，可能已被老師取消。'; }
                    const remainingSpots = course.capacity - course.students.length;
                    if (spotsToBook > remainingSpots) { await clientDB.query('ROLLBACK'); return `預約失敗，課程名額不足！\n目前剩餘 ${remainingSpots} 位，您想預約 ${spotsToBook} 位。`; }
                    const totalCost = course.points_cost * spotsToBook;
                    if (student.points < totalCost) { await clientDB.query('ROLLBACK');
                        return `預約失敗，您的點數不足！\n需要點數：${totalCost}\n您目前有：${student.points}`; }
                    
                    const newStudents = [...course.students, ...Array(spotsToBook).fill(userId)];
                    const historyEntry = { action: `預約課程 (共${spotsToBook}位)：${course.title}`, pointsChange: -totalCost, time: new Date().toISOString() };
                    const newHistory = student.history ?
                        [...student.history, historyEntry] : [historyEntry];
                    await clientDB.query('UPDATE users SET points = points - $1, history = $2 WHERE id = $3', [totalCost, JSON.stringify(newHistory), userId]);
                    await clientDB.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, course_id]);
                    const reminderTime = new Date(new Date(course.time).getTime() - CONSTANTS.TIME.ONE_HOUR_IN_MS);
                    if (reminderTime > new Date()) {
                        const reminderMessage = { type: 'text', text: `🔔 課程提醒 🔔\n您預約的課程「${course.title}」即將在約一小時後開始，請準備好上課囉！` };
                        await enqueuePushTask(userId, reminderMessage, { sendAt: reminderTime, settingKey: 'student_class_reminder_1hr' });
                 }
                    await clientDB.query('COMMIT');
                    return `✅ 成功為您預約 ${spotsToBook} 個名額！\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n已為您扣除 ${totalCost} 點，期待課堂上見！`;
                } catch (e) {
                    await clientDB.query('ROLLBACK');
                    console.error('多人預約課程失敗:', e); 
                    return '預約時發生錯誤，請稍後再試。';
                }
            });
            delete pendingBookingConfirmation[userId];
            return result;
        }
        case 'confirm_cancel_booking_start':
        case 'confirm_cancel_waiting_start': {
            const course_id = data.get('course_id');
            const course = await getCourse(course_id);
            if (!course) return '找不到該課程，可能已被老師取消或已結束。';
            const isBooking = action === 'confirm_cancel_booking_start';
            pendingBookingConfirmation[userId] = { type: isBooking ? 'cancel_book' : 'cancel_wait', course_id: course_id };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => enqueuePushTask(u, { type: 'text', text: '取消操作已逾時，自動放棄。' }));
            const actionText = isBooking ? '取消預約' : '取消候補';
            const confirmCommand = isBooking ? CONSTANTS.COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING : CONSTANTS.COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING;
            return { type: 'text', text: `您確定要「${actionText}」以下課程嗎？\n\n課程：${course.title}\n時間：${formatDateTime(course.time)}`, quickReply: { items: [ { type: 'action', action: { type: 'message', label: `✅ 確認${actionText}`, text: confirmCommand } }, { type: 'action', action: { type: 'message', label: CONSTANTS.COMMANDS.GENERAL.CANCEL, text: CONSTANTS.COMMANDS.GENERAL.CANCEL } } ] } };
        }
        case 'confirm_join_waiting_list_start': {
            const course_id = data.get('course_id');
            const course = await getCourse(course_id);
            if (!course) return '抱歉，找不到該課程，可能已被老師取消。';
            
            pendingBookingConfirmation[userId] = { type: 'confirm_wait', course_id: course_id };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => {
                enqueuePushTask(u, { type: 'text', text: '加入候補操作已逾時，自動取消。' });
            });
            const message = `您確定要加入以下課程的候補名單嗎？\n\n課程：${getCourseMainTitle(course.title)}\n時間：${formatDateTime(course.time)}\n\n候補不需支付點數，當有名額釋出時，系統將會發送通知給您。`;
            
            return {
                type: 'text',
                text: message,
                quickReply: {
                    items: [
                         { type: 'action', action: { type: 'postback', label: '✅ 確認加入候補', data: `action=execute_join_waiting_list&course_id=${course.id}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 取消操作', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            };
        }
        case 'execute_join_waiting_list': {
            const course_id = data.get('course_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const courseRes = await client.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [course_id]);
                    if (courseRes.rows.length === 0) { await client.query('ROLLBACK'); return '抱歉，找不到該課程，可能已被老師取消。'; }
                    const course = courseRes.rows[0];
                    if ((course.students?.length || 0) < course.capacity) { await client.query('ROLLBACK'); return '好消息！這堂課剛好有名額釋出了，請回到列表直接點擊「預約課程」按鈕。'; }
                    if (course.waiting?.includes(userId)) { await client.query('ROLLBACK'); return '您已在候補名單中，請耐心等候通知。'; }

                     const newWaitingList = [...(course.waiting || []), userId];
                    await client.query('UPDATE courses SET waiting = $1 WHERE id = $2', [newWaitingList, course_id]);
                    await client.query('COMMIT');
                    return `✅ 已成功將您加入「${getCourseMainTitle(course.title)}」的候補名單！\n當有名額釋出時，系統將會發送通知給您。`;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`加入候補失敗 courseId: ${course_id}`, err);
                    return '加入候補時發生錯誤，請稍後再試。';
                }
            });
            delete pendingBookingConfirmation[userId];
            return result;
        }
        case 'waitlist_confirm': {
            const course_id = data.get('course_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const inviteRes = await client.query(
                         `SELECT * FROM waitlist_notifications 
                         WHERE course_id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > NOW() 
                         FOR UPDATE`,
                         [course_id, userId]
                    );

                    if (inviteRes.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return '抱歉，您的候補邀請已失效或已被處理。';
                    }

                    const userRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
                    const courseRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [course_id]);
                    const user = userRes.rows[0];
                    const course = courseRes.rows[0];
                    if (!course) { await client.query('ROLLBACK'); return '抱歉，找不到此課程。'; }
                    if (user.points < course.points_cost) { await client.query('ROLLBACK');
                        return `點數不足！預約此課程需要 ${course.points_cost} 點，您目前有 ${user.points} 點。`; }
                    if (course.students.length >= course.capacity) {
                        await client.query('ROLLBACK');
                        return '抱歉，您慢了一步，課程名額剛好被補滿了。';
                    }

                    await client.query("UPDATE waitlist_notifications SET status = 'confirmed' WHERE id = $1", [inviteRes.rows[0].id]);
                    const newStudents = [...course.students, userId];
                    const newPoints = user.points - course.points_cost;
                    await client.query("UPDATE users SET points = $1 WHERE id = $2", [newPoints, userId]);
                    await client.query("UPDATE courses SET students = $1 WHERE id = $2", [newStudents, course_id]);
                    
                    await client.query('COMMIT');
                    return `✅ 候補成功！已為您預約課程「${getCourseMainTitle(course.title)}」，並扣除 ${course.points_cost} 點。`;
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('[Waitlist Confirm] 候補確認失敗:', err);
                    return '系統忙碌中，候補確認失敗，請稍後再試。';
                }
            });
            return result;
        }
        case 'waitlist_forfeit': {
            const course_id = data.get('course_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const updateRes = await client.query(
                         `UPDATE waitlist_notifications SET status = 'forfeited' 
                         WHERE course_id = $1 AND user_id = $2 AND status = 'pending'
                         RETURNING id`,
                         [course_id, userId]
                    );
                    
                    if (updateRes.rowCount === 0) {
                         await client.query('ROLLBACK');
                        return '您的候補邀請已失效。';
                    }

                    const courseRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [course_id]);
            
if (updateRes.rowCount === 0) {
    await client.query('ROLLBACK');
    return '您的候補邀請已失效。';
}

// [V42.2 重構] 呼叫集中的遞補函式
await promoteNextOnWaitlist(client, course_id);
await client.query('COMMIT');

                    return '好的，已為您放棄此次候補資格。';
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('[Waitlist Forfeit] 候補放棄失敗:', err);
                    return '系統忙碌中，操作失敗，請稍後再試。';
                }
            });
             const forfeitMessage = {
                type: 'text',
                text: '好的，已為您放棄此次候補資格。'
             };
            await enqueuePushTask(userId, forfeitMessage, { settingKey: 'student_new_announcement' });
            return;
        }
    }
    return null;
}
/** 
 * 處理所有與「商品」相關的操作
 */
async function handleProductActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        // [移除] 'view_product_group' 的 case 已被移至 handleViewActions

        case 'view_preorder_list': {
            const productId = data.get('product_id');
            return showPreorderRoster(productId);
        }
        case 'stop_preorder_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';

            const preorderCount = await executeDbQuery(client => 
                client.query("SELECT COUNT(*) FROM product_preorders WHERE product_id = $1 AND status = 'active'", [productId])
            ).then(res => parseInt(res.rows[0].count, 10) || 0);
            let messageText = `您確定要停止「${product.name}」的預購並將其下架嗎？\n\n此操作將無法再接受新的預購。`;
            if (preorderCount > 0) {
                messageText += `\n目前共有 ${preorderCount} 位學員正在等候。`;
            }

            return {
                type: 'text',
                text: messageText,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 確認', data: `action=execute_stop_preorder&product_id=${productId}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            };
        }
        case 'execute_stop_preorder': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const productRes = await client.query("SELECT name, status FROM products WHERE id = $1 FOR UPDATE", [productId]);
                    if (productRes.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return { status: 'error', message: '❌ 操作失敗，找不到該商品。' };
                    }
                    const product = productRes.rows[0];
                    if (product.status === 'unavailable') {
                        await client.query('ROLLBACK'); 
                        return { status: 'processed' }; 
                    }
                    if (product.status !== 'preorder') {
                        await client.query('ROLLBACK');
                        return { status: 'error', message: '❌ 操作失敗，該商品不是預購狀態。' };
                    }
                    await client.query("UPDATE products SET status = 'unavailable' WHERE id = $1", [productId]);
                    await client.query('COMMIT');
                    return { status: 'success', productName: product.name };
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error("停止預購失敗:", err);
                    return { status: 'error', message: '❌ 操作失敗，資料庫發生錯誤。' };
                }
            });
            if (result.status === 'success') {
                return `✅ 已成功停止「${result.productName}」的預購並將商品下架。\n\n商品到貨後，請至「待出貨管理」頁面通知學員。`;
            } else if (result.status === 'error') {
                return result.message;
            }
            return null;
        }
        case 'cancel_preorder_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到商品。';
            
            const count = await executeDbQuery(client => 
                client.query("SELECT COUNT(*) FROM product_preorders WHERE product_id = $1 AND status = 'active'", [productId])
            ).then(res => parseInt(res.rows[0].count, 10));
            if (count === 0) {
                return `「${product.name}」沒有需要取消的預購。`;
            }

            return {
                type: 'text',
                text: `⚠️ 您確定要因為缺貨而取消 ${count} 位學員的「${product.name}」預購嗎？\n\n系統將會發送通知告知學員，此操作無法復原。`,
                quickReply: { items: [
                    { type: 'action', action: { type: 'postback', label: '✅ 確認', data: `action=execute_cancel_preorder&product_id=${productId}` } },
                    { type: 'action', action: { type: 'message', label: '返回', text: CONSTANTS.COMMANDS.TEACHER.MANAGE_FULFILLMENT } }
                ]}
            };
        }
        case 'execute_cancel_preorder': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const productRes = await client.query('SELECT name FROM products WHERE id = $1', [productId]);
                    if (productRes.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return { status: 'error', message: '找不到對應的商品。' };
                    }
                    const product = productRes.rows[0];

                    const preorders = (await client.query("SELECT * FROM product_preorders WHERE product_id = $1 AND status = 'active' FOR UPDATE", [productId])).rows;
                    if (preorders.length === 0) {
                        await client.query('ROLLBACK');
                        return { status: 'processed' };
                    }

                    const notificationTasks = preorders.map(preorder => ({
                        recipientId: preorder.user_id,
                        message: { type: 'text', text: `❗️ 預購取消通知\n很抱歉，由於廠商供貨問題，您預購的商品「${product.name}」無法到貨，本次預購已為您取消。造成不便，敬請見諒。` }
                    }));
                    await client.query("UPDATE product_preorders SET status = 'canceled' WHERE product_id = $1 AND status = 'active'", [productId]);
                    await client.query('COMMIT');
                    return { success: true, tasks: notificationTasks, count: preorders.length, productName: product.name };
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('執行取消預購時失敗:', err);
                    return { status: 'error', message: `處理失敗：${err.message}` };
                }
            });
            if (result.success) {
                if (result.tasks.length > 0) {
             await enqueueBatchPushTasks(result.tasks, { settingKey: 'student_order_result' });
                }
                return `✅ 成功！已為「${result.productName}」取消 ${result.count} 筆預購，並已發送通知。`;
            } else if (result.status === 'error') {
                return `❌ 操作失敗，資料庫發生錯誤，請稍後再試。`;
            }
            return null;
        }
        case 'enable_preorder_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';
            return {
                type: 'text',
                text: `您確定要為「${product.name}」開啟預購功能嗎？\n\n開啟後，學員將可以在商品頁看到並預購此商品。`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 確認', data: `action=execute_enable_preorder&product_id=${productId}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            };
        }
        case 'execute_enable_preorder': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(client =>
                client.query("UPDATE products SET status = 'preorder' WHERE id = $1 AND inventory <= 0 RETURNING name", [productId])
            );
            if (result.rowCount > 0) {
                const productName = result.rows[0].name;
                return `✅ 已成功將「${productName}」轉為預購模式。`;
            }
            return '❌ 操作失敗，找不到該商品或商品仍有庫存。';
        }
        case 'disable_product_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';
            return {
                type: 'text',
                text: `您確定要將「${product.name}」直接下架嗎？\n\n下架後，商品將會移至「管理已下架商品」區。`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 確認', data: `action=execute_disable_product&product_id=${productId}` } },
                        { type: 'action', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                    ]
                }
            };
        }
        case 'execute_disable_product': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(client =>
                client.query("UPDATE products SET status = 'unavailable' WHERE id = $1 RETURNING name", [productId])
            );
            if (result.rowCount > 0) {
                const productName = result.rows[0].name;
                return `✅ 已成功將「${productName}」下架。`;
            }
            return '❌ 操作失敗，找不到該商品。';
        }
        case 'select_preorder_quantity': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product || product.status !== 'preorder') {
                return '抱歉，此商品目前未開放預購。';
            }
            const maxQuantity = 5;
            const quantityButtons = Array.from({ length: maxQuantity }, (_, i) => {
                const quantity = i + 1;
                return {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    margin: 'sm',
                    action: {
                        type: 'postback',
                        label: `${quantity} 個`,
                        data: `action=confirm_product_preorder_start&product_id=${product.id}&qty=${quantity}`
                    }
                };
            });
            return {
                type: 'flex',
                altText: '請選擇預購數量',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: '請選擇預購數量', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
                        backgroundColor: '#FF9E00'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: product.name, wrap: true, weight: 'bold', size: 'md' },
                            { type: 'text', text: `單價：${product.price} 元 (到貨後付款)`, size: 'sm', color: '#666666', margin: 'md' },
                            { type: 'separator', margin: 'lg' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: quantityButtons
                    }
                }
            };
        }
        case 'confirm_product_preorder_start': {
            const productId = data.get('product_id');
            const quantity = parseInt(data.get('qty') || '1', 10);
            const product = await getProduct(productId);
            if (!product) {
                return '抱歉，找不到該商品。';
            }
            pendingBookingConfirmation[userId] = { type: 'preorder_confirmation' };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => {
                enqueuePushTask(u, { type: 'text', text: '預購確認操作已逾時，自動取消。' });
            });
            const message = `您確定要預購以下商品嗎？\n\n「${product.name}」x ${quantity} 個\n\n(商品到貨後將會通知您付款)`;
            return {
                type: 'text',
                text: message,
                quickReply: {
                    items: [
                        {
                            type: 'action',
                            action: {
                                type: 'postback',
                                label: '✅ 確認',
                                data: `action=execute_product_preorder&product_id=${product.id}&qty=${quantity}`
                            }
                        },
                        {
                            type: 'action',
                            action: {
                                type: 'message',
                                label: '❌ 取消',
                                text: CONSTANTS.COMMANDS.GENERAL.CANCEL
                            }
                        }
                    ]
                }
            };
        }
        case 'execute_product_preorder': {
            const productId = data.get('product_id');
            const quantity = parseInt(data.get('qty') || '1', 10);
            const result = await executeDbQuery(async (client) => {
                const productRes = await client.query("SELECT name, status FROM products WHERE id = $1", [productId]);
                if (productRes.rows.length === 0 || productRes.rows[0].status !== 'preorder') {
                    return { success: false, message: '預購失敗，此商品目前未開放預購。' };
                }
                const product = productRes.rows[0];
                const existingPreorder = await client.query(
                    "SELECT id FROM product_preorders WHERE user_id = $1 AND product_id = $2 AND status = 'active'",
                    [userId, productId]
                );
                if (existingPreorder.rows.length > 0) {
                    return { success: false, message: '您已預購過此商品，請耐心等候到貨通知。' };
                }
                const preorder_uid = `PRE-${Date.now()}-${userId.slice(-4)}`;
                await client.query(
                    `INSERT INTO product_preorders (preorder_uid, product_id, user_id, user_name, quantity, status)
                     VALUES ($1, $2, $3, $4, $5, 'active')`,
                    [preorder_uid, productId, userId, user.name, quantity]
                );
                return { success: true, productName: product.name, quantity: quantity };
            });
            if (result.success) {
                return `✅ 預購成功！\n\n您已成功預購「${result.productName}」共 ${result.quantity} 個。\n商品到貨後，系統將會發送訊息通知您付款。`;
            } else {
                return result.message;
            }
        }
        case 'confirm_add_product': {
            const state = pendingProductCreation[userId];
            if (!state || state.step !== 'await_confirmation') return '上架流程已逾時或中斷，請重新操作。';
            
            const productStatus = state.isPreorder ? 'preorder' : 'available';
            const newProduct = await executeDbQuery(client => 
                client.query(
                    `INSERT INTO products (name, description, price, inventory, image_url, status, creator_id, creator_name) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name`,
                    [state.name, state.description, state.price, state.inventory, state.image_url, productStatus, userId, user.name]
                )
            ).then(res => res.rows[0]);
            delete pendingProductCreation[userId];

            if (!newProduct) {
                return '❌ 商品上架失敗，請稍後再試。';
            }

            const prefilledContent = `🛍️ 商城新品上架！\n\n「${newProduct.name}」現正熱賣中，快來逛逛吧！`;
            pendingAnnouncementCreation[userId] = {
                step: 'await_final_confirmation',
                content: prefilledContent
            };
            setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
                enqueuePushTask(u, { type: 'text', text: '頒佈公告操作逾時，自動取消。'});
            });
            return {
                type: 'flex',
                altText: '發佈新品公告？',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: '📢 發佈新品上架公告', weight: 'bold', color: '#FFFFFF' }],
                        backgroundColor: '#52B69A',
                        paddingAll: 'lg'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: prefilledContent, wrap: true }]
                    }
                },
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 直接發佈', data: 'action=publish_prefilled_announcement' } },
                         { type: 'action', action: { type: 'postback', label: '❌ 暫不發佈', data: 'action=cancel_announcement' } }
                    ]
                }
            };
        }
        case 'manage_product': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';
            const flexMessage = { type: 'flex', altText: '編輯商品資訊', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `編輯：${product.name}`, weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#52B69A' }, body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [ { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '✏️ 編輯名稱', data: `action=edit_product_field&product_id=${productId}&field=name` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '✏️ 編輯描述', data: `action=edit_product_field&product_id=${productId}&field=description` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '✏️ 編輯價格', data: `action=edit_product_field&product_id=${productId}&field=price` } }, { type: 'button', style: 'link', height: 'sm', action: { type: 'postback', label: '✏️ 編輯圖片網址', data: `action=edit_product_field&product_id=${productId}&field=image_url` } } ]}}};
            return flexMessage;
        }
        case 'edit_product_field': {
            const productId = data.get('product_id');
            const field = data.get('field');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';
            pendingProductEdit[userId] = { product, field };
            setupConversationTimeout(userId, pendingProductEdit, 'pendingProductEdit', u => enqueuePushTask(u, { type: 'text', text: '編輯商品操作逾時，自動取消。' }));
            const fieldMap = { name: '名稱', description: '描述', price: '價格 (元)', image_url: '圖片網址' };
            return { type: 'text', text: `請輸入新的「${fieldMap[field]}」：\n(目前為：${product[field] || '無'})`, quickReply: { items: getCancelMenu() } };
        }
        case 'adjust_inventory_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到該商品。';
            pendingInventoryAdjust[userId] = { product, originalInventory: product.inventory };
            setupConversationTimeout(userId, pendingInventoryAdjust, 'pendingInventoryAdjust', u => enqueuePushTask(u, { type: 'text', text: '調整庫存操作逾時，自動取消。' }));
            return { type: 'text', text: `正在調整「${product.name}」的庫存 (目前為 ${product.inventory})。\n請輸入要調整的數量 (正數為增加，負數為減少)：`, quickReply: { items: getCancelMenu() } };
        }
        case 'toggle_product_status': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const productRes = await client.query('SELECT status, name FROM products WHERE id = $1 FOR UPDATE', [productId]);
                    if (productRes.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return { success: false, message: '找不到該商品。' };
                    }
                    const product = productRes.rows[0];
                    const newStatus = product.status === 'available' ? 'unavailable' : 'available';
                    await client.query('UPDATE products SET status = $1 WHERE id = $2', [newStatus, productId]);
                    await client.query('COMMIT');
                    
                    if (newStatus === 'available') {
                        const prefilledContent = `🔥 熱銷補貨到！\n\n「${product.name}」再度上架，上次沒買到的朋友別再錯過囉！`;
                        pendingAnnouncementCreation[userId] = {
                            step: 'await_final_confirmation',
                            content: prefilledContent
                        };
                        setupConversationTimeout(userId, pendingAnnouncementCreation, 'pendingAnnouncementCreation', (u) => { 
                           enqueuePushTask(u, { type: 'text', text: '頒佈公告操作逾時，自動取消。'});
                        });
                        return { success: true, product: product, shouldAnnounce: true, announcementContent: prefilledContent };
                    }
                    
                    return { success: true, product: product, shouldAnnounce: false };
                } catch(e) {
                    await client.query('ROLLBACK');
                    console.error("切換商品狀態失敗:", e);
                    return { success: false, message: '操作失敗，請稍後再試。' };
                }
            });
            if (!result.success) {
                return result.message;
            }

            if (result.shouldAnnounce) {
                return {
                    type: 'flex',
                    altText: '發佈補貨公告？',
                    contents: {
                        type: 'bubble',
                        header: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [{ type: 'text', text: '📢 發佈補貨公告', weight: 'bold', color: '#FFFFFF' }],
                            backgroundColor: '#52B69A',
                            paddingAll: 'lg'
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [{ type: 'text', text: result.announcementContent, wrap: true }]
                        }
                    },
                    quickReply: {
                        items: [
                            { type: 'action', action: { type: 'postback', label: '✅ 直接發佈', data: 'action=publish_prefilled_announcement' } },
                             { type: 'action', action: { type: 'postback', label: '❌ 暫不發佈', data: 'action=cancel_announcement' } }
                        ]
                    }
                };
            } else {
                return `✅ 已成功將商品「${result.product.name}」設定為「下架」狀態。`;
            }
        }
        case 'select_product_quantity': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product || product.status !== 'available' || product.inventory <= 0) {
                return '抱歉，此商品目前無法購買。';
            }
            const maxQuantity = Math.min(5, product.inventory);
            const quantityButtons = Array.from({ length: maxQuantity }, (_, i) => {
                const quantity = i + 1;
                const totalAmount = product.price * quantity;
                return {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    margin: 'sm',
                    action: {
                        type: 'postback',
                        label: `${quantity} 個 (共 ${totalAmount} 元)`,
                        data: `action=confirm_product_purchase&product_id=${product.id}&qty=${quantity}`
                    }
                };
            });
            return {
                type: 'flex',
                altText: '請選擇購買數量',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: '請選擇購買數量', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
                        backgroundColor: '#52B69A'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: product.name, wrap: true, weight: 'bold', size: 'md' },
                            { type: 'text', text: `單價：${product.price} 元`, size: 'sm', color: '#666666', margin: 'md' },
                            { type: 'text', text: `剩餘庫存：${product.inventory} 個`, size: 'sm', color: '#666666' },
                            { type: 'separator', margin: 'lg' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: quantityButtons
                    }
                }
            };
        }
        case 'confirm_product_purchase': {
            const productId = data.get('product_id');
            const quantity = parseInt(data.get('qty') || '1', 10);
            const product = await getProduct(productId);
            if (!product || product.status !== 'available') return '找不到此商品，或商品已下架。';
            if (product.inventory < quantity) return `抱歉，此商品庫存不足！\n您想購買 ${quantity} 個，但僅剩 ${product.inventory} 個。`;
            const totalAmount = product.price * quantity;
            pendingBookingConfirmation[userId] = { type: 'product_purchase', productId: productId, quantity: quantity };
            setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => {
                enqueuePushTask(u, { type: 'text', text: '商品購買操作已逾時，自動取消。' });
            });
            const flexMessage = {
                type: 'flex',
                altText: '請選擇付款方式',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [{ type: 'text', text: '請確認訂單並選擇付款方式', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }],
                        backgroundColor: '#52B69A'
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'md',
                        contents: [
                            { type: 'text', text: product.name, weight: 'bold', size: 'md', wrap: true },
                            { type: 'text', text: `單價：${product.price} 元`, size: 'sm' },
                            { type: 'text', text: `數量：${quantity} 個`, size: 'sm' },
                            { type: 'separator', margin: 'sm' },
                            { type: 'text', text: `總金額：${totalAmount} 元`, size: 'lg', weight: 'bold', margin: 'sm' }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#34A0A4',
                                action: {
                                    type: 'postback',
                                    label: '🏦 轉帳付款',
                                    data: `action=execute_product_purchase&product_id=${product.id}&method=transfer&qty=${quantity}`
                                }
                            },
                            {
                                type: 'button',
                                style: 'primary',
                                color: '#1A759F',
                                action: {
                                    type: 'postback',
                                    label: '🤝 現金面交',
                                    data: `action=execute_product_purchase&product_id=${product.id}&method=cash&qty=${quantity}`
                                }
                            },
                            {
                                type: 'button',
                                style: 'secondary',
                                height: 'sm',
                                margin: 'md',
                                action: {
                                    type: 'message',
                                    label: '取消',
                                    text: CONSTANTS.COMMANDS.GENERAL.CANCEL
                                }
                            }
                        ]
                    }
                }
            };
            return flexMessage;
        }
        // [新增] 刪除商品相關的 case
        case 'delete_product_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) {
                return '找不到該商品，可能已被刪除。';
            }
            return {
                type: 'text',
                text: `⚠️ 您確定要「永久刪除」商品「${product.name}」嗎？\n\n此操作無法復原，但不會影響到與此商品相關的歷史訂單紀錄。`,
                quickReply: {
                    items: [
                        {
                            type: 'action',
                            action: {
                                type: 'postback',
                                label: '✅ 確認刪除',
                                data: `action=delete_product_execute&product_id=${product.id}`
                            }
                        },
                        {
                            type: 'action',
                            action: {
                                type: 'message',
                                label: '❌ 取消',
                                text: CONSTANTS.COMMANDS.GENERAL.CANCEL
                            }
                        }
                    ]
                }
            };
        }
        case 'delete_product_execute': {
            const productId = data.get('product_id');
            if (!productId) {
                return '操作失敗，缺少商品 ID。';
            }
            const result = await executeDbQuery(client => 
                client.query("DELETE FROM products WHERE id = $1 RETURNING name", [productId])
            );
            if (result.rowCount > 0) {
                const productName = result.rows[0].name;
                return `✅ 已成功刪除商品「${productName}」。`;
            } else {
                return '找不到該商品，可能已被其他管理員刪除。';
            }
        }
    }
    return null;
}


/**
 * 處理所有與「訂單」相關的操作
 */
async function handleOrderActions(action, data, user) {
    const userId = user.id;
    switch (action) {
                 case 'cancel_pending_product_order_start': {
            const orderUID = data.get('orderUID');
            if (!orderUID) return '操作失敗，缺少訂單資訊。';

            return {
                type: 'text',
                text: '您確定要取消這筆商品訂單嗎？此操作無法復原。',
                quickReply: {
                    items: [
                        {
                            type: 'action',
                            action: { type: 'postback', label: '✅ 確認取消', data: `action=cancel_pending_product_order_execute&orderUID=${orderUID}` }
                        },
                        {
                            type: 'action',
                            action: { type: 'message', label: '返回商城', text: CONSTANTS.COMMANDS.STUDENT.SHOP }
                        }
                    ]
                }
            };
        }
        case 'cancel_pending_product_order_execute': {
            const orderUID = data.get('orderUID');
            if (!orderUID) return '操作失敗，缺少訂單資訊。';

            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const orderRes = await client.query("SELECT * FROM product_orders WHERE order_uid = $1 AND status IN ('pending_payment', 'pending_confirmation') FOR UPDATE", [orderUID]);
                    if (orderRes.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return { success: false, message: '找不到可取消的訂單，或訂單已被處理。' };
                    }
                    const order = orderRes.rows[0];

                    // 將庫存加回去
                    await client.query("UPDATE products SET inventory = inventory + $1 WHERE id = $2", [order.quantity, order.product_id]);
                    // 刪除訂單
                    await client.query("DELETE FROM product_orders WHERE order_uid = $1", [orderUID]);

                    await client.query('COMMIT');
                    return { success: true };
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('取消商品訂單失敗:', err);
                    return { success: false, message: '取消訂單時發生錯誤，請稍後再試。' };
                }
            });

            if (result.success) {
                return '✅ 已成功為您取消訂單，商品庫存已歸還。';
            } else {
                return result.message;
            }
        }

        // [新增] 處理學員取消待付款訂單的邏輯
        case 'cancel_pending_order_start': {
            const order_id = data.get('order_id');
            if (!order_id) return '操作失敗，缺少訂單資訊。';

            return {
                type: 'text',
                text: '您確定要取消這筆待付款訂單嗎？此操作無法復原。',
                quickReply: {
                    items: [
                        {
                            type: 'action',
                            action: { type: 'postback', label: '✅ 確認取消', data: `action=cancel_pending_order_execute&order_id=${order_id}` }
                        },
                        {
                            type: 'action',
                            action: { type: 'message', label: '返回', text: CONSTANTS.COMMANDS.STUDENT.PURCHASE_HISTORY }
                        }
                    ]
                }
            };
        }
        case 'cancel_pending_order_execute': {
            const order_id = data.get('order_id');
            if (!order_id) return '操作失敗，缺少訂單資訊。';

            const result = await deleteOrder(order_id);
            return '✅ 已成功為您取消訂單。';
        }
        case 'notify_product_arrival_start': {
            const productId = data.get('product_id');
            const product = await getProduct(productId);
            if (!product) return '找不到商品。';
            
            const count = await executeDbQuery(client => 
                client.query("SELECT COUNT(*) FROM product_preorders WHERE product_id = $1 AND status = 'active'", [productId])
            ).then(res => parseInt(res.rows[0].count, 10));
            if (count === 0) {
                return `「${product.name}」沒有需要通知的預購者。您可以直接封存此紀錄。`;
            }

            return {
                type: 'text',
                text: `您確定要通知 ${count} 位學員「${product.name}」已到貨嗎？\n\n系統將會為他們建立待付款訂單，並發送通知。`,
                quickReply: { items: [
                    { type: 'action', action: { type: 'postback', label: '✅ 確認', data: `action=execute_notify_product_arrival&product_id=${productId}` } },
                    { type: 'action', action: { type: 'message', label: '❌ 取消', text: CONSTANTS.COMMANDS.GENERAL.CANCEL } }
                ]}
            };
        }
        case 'execute_notify_product_arrival': {
            const productId = data.get('product_id');
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const productRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
                    if (productRes.rows.length === 0) throw new Error('找不到商品');
                    const product = productRes.rows[0];

                    const preorders = (await client.query("SELECT * FROM product_preorders WHERE product_id = $1 AND status = 'active' FOR UPDATE", [productId])).rows;
                    if (preorders.length === 0) throw new Error('找不到有效的預購紀錄');

                    const notificationTasks = [];
                    for (const preorder of preorders) {
                        const totalAmount = product.price * preorder.quantity;
                        const orderUID = `PROD-${Date.now()}-${preorder.user_id.slice(-4)}`;
                        
                        await client.query(
                            `INSERT INTO product_orders (order_uid, user_id, user_name, product_id, product_name, points_spent, amount, status, payment_method)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_payment', 'transfer')`,
                            [orderUID, preorder.user_id, preorder.user_name, product.id, `${product.name} x${preorder.quantity}`, 0, totalAmount]
                        );
                        
                        notificationTasks.push({
                            recipientId: preorder.user_id,
                            message: { type: 'text', text: `🔔 商品到貨通知！\n您預購的「${product.name}」已經到貨囉！系統已為您建立訂單，請至「商城」->「我的購買紀錄」完成付款。` }
                        });
                    }

                    await client.query("UPDATE product_preorders SET status = 'notified' WHERE product_id = $1 AND status = 'active'", [productId]);
                    await client.query('COMMIT');
                    return { success: true, tasks: notificationTasks, count: preorders.length };
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('執行到貨通知時失敗:', err);
                    return { success: false, message: `處理失敗：${err.message}` };
                }
            });
            if (result.success) {
                if (result.tasks.length > 0) {
                    await enqueueBatchPushTasks(result.tasks, { settingKey: 'student_order_result' });
                }
                return `✅ 成功！已為 ${result.count} 位學員建立訂單並發送付款通知。`;
            } else {
                return `❌ 操作失敗，資料庫發生錯誤，請稍後再試。`;
            }
        }
        case 'select_purchase_plan': {
            const points = parseInt(data.get('plan'), 10);
            const plan = CONSTANTS.PURCHASE_PLANS.find(p => p.points === points);
            if (!plan) return '找不到您選擇的購買方案。';
            return {
                type: 'flex',
                altText: '請選擇付款方式',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box', layout: 'vertical',
                        contents: [{ type: 'text', text: '確認訂單並選擇付款方式', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }],
                        backgroundColor: '#52B69A'
                    },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `方案：${plan.label}`, weight: 'bold', size: 'md' },
                            { type: 'text', text: `金額：${plan.amount} 元`, size: 'lg', weight: 'bold', margin: 'sm' }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm',
                        contents: [
                            {
                                type: 'button', style: 'primary', color: '#34A0A4',
                                action: {
                                    type: 'postback',
                                    label: '🏦 轉帳付款',
                                    data: `action=execute_point_purchase&plan=${plan.points}&method=transfer`
                                }
                            },
                            {
                                type: 'button', style: 'primary', color: '#1A759F',
                                action: {
                                    type: 'postback',
                                    label: '🤝 現金面交',
                                    data: `action=execute_point_purchase&plan=${plan.points}&method=cash`
                                }
                            },
                            {
                                type: 'button', style: 'secondary', height: 'sm', margin: 'md',
                                action: {
                                    type: 'message',
                                    label: '取消',
                                    text: CONSTANTS.COMMANDS.GENERAL.CANCEL
                                }
                            }
                        ]
                    }
                }
            };
        }
        case 'execute_point_purchase': {
                    // [程式夥伴修正] V42.4c - 在建立訂單前，再次進行嚴格的檢查
        const hasPending = await hasPendingPointOrder(userId);
        if (hasPending) {
            return '您目前已有一筆訂單正在處理中，無法建立新訂單。\n\n請先至「點數查詢」主畫面，查看並完成或取消目前的訂單。';
        }
            const points = parseInt(data.get('plan'), 10);
            const paymentMethod = data.get('method');
            const plan = CONSTANTS.PURCHASE_PLANS.find(p => p.points === points);

            if (!plan) return '方案選擇無效，請重新操作。';
            const order_id = `PO${Date.now()}`;
            const order = {
                order_id: order_id,
                user_id: userId,
                user_name: user.name,
                points: plan.points,
                amount: plan.amount,
                last_5_digits: null,
                status: 'pending_payment',
                timestamp: new Date().toISOString(),
                payment_method: paymentMethod
            };
            await executeDbQuery(async (client) => {
                await client.query(
                    `INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp, payment_method) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (order_id) DO UPDATE SET 
                     user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8, payment_method = $9`,
                    [order.order_id, order.user_id, order.user_name, order.points, order.amount, order.last_5_digits, order.status, order.timestamp, order.payment_method]
                );
            });
            if (paymentMethod === 'transfer') {
                const replyText = `感謝您的購買！訂單已成立。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${plan.amount} 元\n\n匯款完成後，請至「點數查詢」回報後五碼。`;
                return replyText;
            } else { // cash
                const replyText = `✅ 訂單已成立！\n您選擇了現金支付「${plan.label}」，總金額 ${plan.amount} 元。\n請直接與老師聯繫並完成支付，支付完成後老師會為您手動加點。`;
                const notifyMessage = { type: 'text', text: `🔔 點數訂單通知\n學員 ${user.name} 建立了一筆「現金」購點訂單。\n方案：${plan.label}\n金額：${plan.amount} 元\n請至「待確認訂單」查看並準備收款。`};
                await notifyAllTeachers(notifyMessage);
                return replyText;
            }
        }
        case 'confirm_order': {
            const order_id = data.get('order_id');
            return executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const orderRes = await client.query("SELECT * FROM orders WHERE order_id = $1 FOR UPDATE", [order_id]);
                    if (orderRes.rows.length === 0) { await client.query('ROLLBACK'); return '找不到此訂單，可能已被其他老師處理。'; }
                    const order = orderRes.rows[0];
                    if (!['pending_confirmation', 'pending_payment'].includes(order.status)) { await client.query('ROLLBACK'); 
                    return `此訂單狀態為「${order.status}」，無法執行此操作。`; }
                    await client.query("UPDATE orders SET status = 'completed' WHERE order_id = $1", [order_id]);
                    const userRes = await client.query("SELECT points FROM users WHERE id = $1 FOR UPDATE", [order.user_id]);
                    const newPoints = userRes.rows[0].points + order.points;
                    await client.query("UPDATE users SET points = $1 WHERE id = $2", [newPoints, order.user_id]);
                    const notifyMessage = { type: 'text', text: `✅ 您的點數購買已核准！\n\n已為您帳戶加入 ${order.points} 點，您目前的總點數為 ${newPoints} 點。` };
                    await enqueuePushTask(order.user_id, notifyMessage, { settingKey: 'student_order_result' });
                    await client.query('COMMIT');
                    return `✅ 已核准 ${order.user_name} 的訂單，並已通知對方。`;
                } catch (err) { await client.query('ROLLBACK'); console.error('❌ 核准訂單時發生錯誤:', err); return '處理訂單時發生錯誤，操作已取消。';
                }
            });
        }
        case 'reject_order': {
            const order_id = data.get('order_id');
            return executeDbQuery(async (client) => {
                const orderRes = await client.query("SELECT * FROM orders WHERE order_id = $1", [order_id]);
                if (orderRes.rows.length === 0) return '找不到此訂單，可能已被其他老師處理。';
                const order = orderRes.rows[0];
                if (order.status !== 'pending_confirmation') return `此訂單狀態為「${order.status}」，無法退回。`;
                await client.query("UPDATE orders SET status = 'rejected' WHERE order_id = $1", [order_id]);
                const notifyMessage = { type: 'text', text: `❗️ 您的點數購買申請被退回。\n\n請檢查您的匯款金額或後五碼是否有誤，並至「點數查詢」選單中重新提交資訊。如有疑問請聯絡我們，謝謝。` };
                await enqueuePushTask(order.user_id, notifyMessage).catch(e => console.error(e));
                return `✅ 已退回 ${order.user_name} 的訂單，並已通知對方。`;
            });
        }
        case 'execute_product_purchase': {
            // [程式夥伴修正] 改用更嚴格的全域商品訂單檢查，確保任何商品都只能有一筆待處理訂單
            const hasPending = await hasPendingProductOrder(userId);
            if (hasPending) {
                return '您已有一筆商品訂單待處理，無法建立新訂單。\n\n請先至「商城」>「我的購買紀錄」完成或取消該筆訂單。';
            }
            const productId = data.get('product_id');
            const paymentMethod = data.get('method');
            const quantity = parseInt(data.get('qty') || '1', 10);
            const result = await executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const productRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
                    const studentRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [user.id]);
                    
                    const product = productRes.rows[0];
                    const student = studentRes.rows[0];

                    if (!product || product.status !== 'available') {
                        await client.query('ROLLBACK');
                        return { success: false, message: '購買失敗，找不到此商品或已下架。' };
                    }
                    if (product.inventory < quantity) {
                        await client.query('ROLLBACK');
                        return { success: false, message: `抱歉，您慢了一步！商品庫存僅剩 ${product.inventory} 個。` };
                    }
                    
                    const totalAmount = product.price * quantity;
                    await client.query('UPDATE products SET inventory = inventory - $1 WHERE id = $2', [quantity, productId]);
                    
                    const orderUID = `PROD-${Date.now()}-${userId.slice(-4)}`;
                    await client.query(
                        `INSERT INTO product_orders (
                            order_uid, user_id, user_name, product_id, product_name, 
                            points_spent, status, amount, payment_method
                        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment', $7, $8)`,
                        [
                            orderUID, userId, student.name, productId, `${product.name} x${quantity}`,
                            0, totalAmount, paymentMethod
                        ]
                    );
                    const notifyMessage = { type: 'text', text: `🔔 商城新訂單通知\n學員 ${student.name} 購買了「${product.name} x${quantity}」。\n總金額：${totalAmount} 元\n付款方式：${paymentMethod === 'transfer' ? '轉帳' : '現金'}\n請至「訂單管理」查看。` };
                    await notifyAllTeachers(notifyMessage);
                    await client.query('COMMIT');
                    
                    if (paymentMethod === 'transfer') {
                        const replyText = `感謝您的購買！訂單已成立。\n\n請匯款至以下帳戶：\n銀行：${CONSTANTS.BANK_INFO.bankName}\n戶名：${CONSTANTS.BANK_INFO.accountName}\n帳號：${CONSTANTS.BANK_INFO.accountNumber}\n金額：${totalAmount} 元\n\n匯款完成後，請至「活動商城」回報後五碼。`;
                        return { success: true, message: replyText };
                    } else {
                        const replyText = `✅ 訂單已成立！\n您購買了「${product.name} x${quantity}」，總金額 ${totalAmount} 元。\n您選擇了現金付款，請直接與老師聯繫並完成支付。`;
                        return { success: true, message: replyText };
                    }
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error('❌ 商品購買執行失敗:', err);
                    return { success: false, message: '抱歉，購買過程中發生錯誤，您的訂單未成立，請稍後再試。' };
                }
            });
            delete pendingBookingConfirmation[userId];
            return result.message;
        }
        case 'confirm_shop_order': {
            return executeDbQuery(async (client) => {
                const orderRes = await client.query("SELECT * FROM product_orders WHERE order_uid = $1", [data.get('orderUID')]);
                if (orderRes.rows.length === 0) return '找不到該筆訂單，可能已被處理。';
                const order = orderRes.rows[0];

                if (!['pending_payment', 'pending_confirmation'].includes(order.status)) {
                    return `此訂單狀態為「${order.status}」，無法再次確認。`;
                }
                
                await client.query("UPDATE product_orders SET status = 'completed', updated_at = NOW() WHERE order_uid = $1", [data.get('orderUID')]);
                const notifyMessage = { type: 'text', text: `🛍️ 訂單更新通知\n您購買的「${order.product_name}」訂單已確認收款！\n後續請與我們聯繫領取商品，謝謝。` };
                await enqueuePushTask(order.user_id, notifyMessage).catch(e => console.error(e));
          
                return `✅ 已成功確認訂單 (ID: ...${data.get('orderUID').slice(-6)})。\n系統已發送通知給學員 ${order.user_name}。`;
            });
        }
        case 'cancel_shop_order_start': {
            const orderUID = data.get('orderUID');
            const order = await getProductOrder(orderUID);
            if (!order) return '找不到該訂單。';
            return { type: 'text', text: `您確定要取消學員 ${order.user_name} 的訂單「${order.product_name}」嗎？\n\n⚠️ 此操作會將商品庫存加回系統，且無法復原。`, quickReply: { items: [ { type: 'action', action: { type: 'postback', label: '✅ 確認取消', data: `action=cancel_shop_order_execute&orderUID=${orderUID}` } }, { type: 'action', action: { type: 'message', label: '返回', text: CONSTANTS.COMMANDS.TEACHER.SHOP_ORDER_MANAGEMENT } } ] } };
        }
        case 'reject_shop_order': {
            const orderUID = data.get('orderUID');
            return executeDbQuery(async (client) => {
                const res = await client.query(
                    "UPDATE product_orders SET status = 'pending_payment', last_5_digits = NULL, updated_at = NOW() WHERE order_uid = $1 AND status = 'pending_confirmation' RETURNING user_id, user_name, product_name",
                    [orderUID]
                );
                if (res.rowCount > 0) {
                    const order = res.rows[0];
                    const notifyMessage = { type: 'text', text: `❗️ 訂單退回通知\n您購買「${order.product_name}」的回報資訊已被退回。\n請檢查後五碼或金額是否有誤，並重新回報。` };
                     await enqueuePushTask(order.user_id, notifyMessage, { settingKey: 'student_order_result' });
                    return `✅ 已退回學員 ${order.user_name} 的訂單，並通知對方重新提交資訊。`;
                }
                return '找不到該筆待確認訂單，或已被處理。';
            });
        }
        case 'cancel_shop_order_execute': {
            const orderUID = data.get('orderUID');
            return executeDbQuery(async (client) => {
                await client.query('BEGIN');
                try {
                    const orderRes = await client.query("SELECT * FROM product_orders WHERE order_uid = $1 FOR UPDATE", [orderUID]);
                    if (orderRes.rows.length === 0) { await client.query('ROLLBACK'); return '找不到該訂單，可能已被處理。'; }
                    const order = orderRes.rows[0];
                    if (order.status !== 'pending') { await client.query('ROLLBACK'); return `此訂單狀態為「${order.status}」，無法取消。`; }
                    await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [order.points_spent, order.user_id]);
                    await client.query("UPDATE products SET inventory = inventory + 1 WHERE id = $1", [order.product_id]);
                    await client.query("UPDATE product_orders SET status = 'cancelled', updated_at = NOW() WHERE order_uid = $1", [orderUID]);
                    const notifyMessage = { type: 'text', text: `❗️ 訂單取消通知\n您購買的「${order.product_name}」訂單已被老師取消。\n已將花費的 ${order.points_spent} 點歸還至您的帳戶。` };
                     await enqueuePushTask(order.user_id, notifyMessage, { settingKey: 'student_order_result' });
                    await client.query('COMMIT');
                    return `✅ 已成功取消訂單 (ID: ...${orderUID.slice(-6)}) 並歸還點數及庫存。`;
                } catch (err) { await client.query('ROLLBACK'); console.error('❌ 取消商城訂單失敗:', err);
                    return '取消訂單時發生錯誤，操作已復原。'; }
            });
        }
        case 'report_shop_last5': {
            const orderUID = data.get('orderUID');
            if (!orderUID) return '操作無效，缺少訂單資訊。';
            pendingShopPayment[userId] = { orderUID };
            setupConversationTimeout(userId, pendingShopPayment, 'pendingShopPayment', (u) => {
                enqueuePushTask(u, { type: 'text', text: '輸入後五碼操作已逾時，自動取消。' });
            });
            return {
                type: 'text',
                text: '請輸入您的匯款帳號後五碼 (5位數字)：',
                quickReply: { items: getCancelMenu() }
            };
        }
    }
    return null;
}
/**
 * 處理與「學員留言」相關的操作
 */
async function handleFeedbackActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        case 'mark_feedback_read': {
            const msgId = data.get('msgId');
            if (!msgId) return '操作失敗，缺少訊息 ID。';
            await executeDbQuery(client => client.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1 AND status = 'new'", [msgId]) );
            return '✅ 已將此留言標示為已讀。';
        }
        case 'reply_feedback': {
            const msgId = data.get('msgId');
            const studentId = data.get('userId');
            if (!msgId || !studentId) return '操作失敗，缺少必要資訊。';
            const msgRes = await executeDbQuery(client => client.query("SELECT message FROM feedback_messages WHERE id = $1", [msgId]) );
            if (msgRes.rows.length === 0) return '找不到這則留言，可能已被其他老師處理。';
            const originalMessage = msgRes.rows[0].message;
            pendingReply[userId] = { msgId, studentId, originalMessage };
            setupConversationTimeout(userId, pendingReply, 'pendingReply', (u) => enqueuePushTask(u, { type: 'text', text: '回覆留言操作逾時，自動取消。' }));
            return { type: 'text', text: `正在回覆學員的留言：\n「${originalMessage.substring(0, 80)}...」\n\n請直接輸入您要回覆的內容：`, quickReply: { items: getCancelMenu() } };
        }
    }
    return null;
}
/**
 * 處理「統計報表」相關的操作
 */
async function handleReportActions(action, data, user) {
    const userId = user.id;
    switch (action) {
        case 'generate_report': {
            const reportType = data.get('type');
            const period = data.get('period');
            const periodMap = { week: '本週', month: '本月', quarter: '本季', year: '今年' };
            const periodText = periodMap[period] || period;
            const generateReportTask = async () => {
                const { start, end } = getDateRange(period);
                return executeDbQuery(async (client) => {
                    if (reportType === 'course') {
                        const res = await client.query("SELECT capacity, students FROM courses WHERE time BETWEEN $1 AND $2", [start, end]);
                        if (res.rows.length === 0) return `📊 ${periodText}課程報表 📊\n\n此期間內沒有任何課程。`;
                        let totalStudents = 0, totalCapacity = 0;
                        res.rows.forEach(c => { totalCapacity += c.capacity; totalStudents += (c.students || []).length; });
                        const attendanceRate = totalCapacity > 0 ? (totalStudents / totalCapacity * 100).toFixed(1) : 0;
                        return `📊 ${periodText} 課程報表 📊\n\n- 課程總數：${res.rows.length} 堂\n- 總計名額：${totalCapacity} 人\n- 預約人次：${totalStudents} 人\n- **整體出席率：${attendanceRate}%**`.trim();
                    } else if (reportType === 'order') {
                        const pointsOrderRes = await client.query("SELECT COUNT(*), SUM(amount) FROM orders WHERE status = 'completed' AND amount > 0 AND timestamp BETWEEN $1 AND $2", [start, end]);
                        const productOrderRes = await client.query("SELECT COUNT(*), SUM(amount) FROM product_orders WHERE status = 'completed' AND created_at BETWEEN $1 AND $2", [start, end]);
                        const pointsOrderCount = parseInt(pointsOrderRes.rows[0].count, 10) || 0;
                        const pointsOrderSum = parseInt(pointsOrderRes.rows[0].sum, 10) || 0;
                        const productOrderCount = parseInt(productOrderRes.rows[0].count, 10) || 0;
                        const productOrderSum = parseInt(productOrderRes.rows[0].sum, 10) || 0;
                        const totalCount = pointsOrderCount + productOrderCount;
                        const totalSum = pointsOrderSum + productOrderSum;
                        return `💰 ${periodText} 營收總報表 💰\n\n- 點數銷售：${pointsOrderSum} 元 (${pointsOrderCount} 筆)\n- 商品銷售：${productOrderSum} 元 (${productOrderCount} 筆)\n--------------------\n- **總計收入：${totalSum} 元**\n- **總計訂單：${totalCount} 筆**`.trim();
                    }
                });
            };
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), 8000));
            try {
                const result = await Promise.race([generateReportTask(), timeoutPromise]);
                if (result === 'timeout') {
                    (async () => {
                        try {
                            const reportText = await generateReportTask();
                            await enqueuePushTask(userId, { type: 'text', text: reportText });
                        } catch (bgErr) {
                            console.error('❌ 背景生成報表失敗:', bgErr);
                            await enqueuePushTask(userId, { type: 'text', text: `抱歉，產生 ${periodText} 報表時發生錯誤。` });
                        }
                    })();
                    return '📊 報表生成中，資料量較大，請稍候... 完成後將會推播通知您。';
                } else { return result; }
            } catch (err) { console.error(`❌ 即時生成 ${reportType} 報表失敗:`, err);
                return `❌ 產生 ${periodText} 報表時發生錯誤，請稍後再試。`; }
        }
    }
    return null;
}
// [最終修正版] 修正了 actionRouter 中關鍵字過於寬鬆導致的路由衝突問題
async function handlePostback(event, user) {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');

    // 特殊的「元指令」優先處理
    if (action === 'run_command') {
        const commandText = decodeURIComponent(data.get('text'));
        if (!commandText) return null;
        const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: `simulated_${Date.now()}`, text: commandText } };
        if (user.role === 'admin') return handleAdminCommands(simulatedEvent, user.id);
        if (user.role === 'teacher') return handleTeacherCommands(simulatedEvent, user.id);
        return handleStudentCommands(simulatedEvent, user.id);
    }

    if (action === 'do_nothing') {
        return null;
    }

    // [最終修正] 調整了關鍵字，使其更精確，並優化了路由順序
    const actionRouter = [
        { keywords: ['view_admin_panel', 'view_notification_settings', 'view_management_functions','toggle_global_setting', 'delete_error_log', 'select_student_for_auth', 'select_teacher_for_removal', 'retry_failed_task', 'delete_failed_task'], handler: handleAdminActions },
        { keywords: ['manage_personal_profile', 'create_teacher_profile_start', 'edit_teacher_profile_field', 'confirm_teacher_profile_update', 'select_student_for_adjust', 'select_announcement_for_deletion', 'select_purchase_history_view_type', 'select_exchange_history_view_type', 'select_message_history_view_type', 'select_adjust_history_view_type', 'start_manual_adjust_history_search', 'start_purchase_history_search', 'start_exchange_history_search', 'start_message_history_search'], handler: handleTeacherActions },
        { keywords: ['set_course_weekday', 'select_teacher_for_course', 'publish_prefilled_announcement', 'edit_prefilled_announcement', 'cancel_announcement', 'cancel_course_group_confirm', 'confirm_single_course_cancel', 'select_booking_spots', 'start_booking_confirmation', 'execute_booking', 'confirm_cancel_booking_start', 'confirm_cancel_waiting_start', 'confirm_join_waiting_list_start', 'execute_join_waiting_list', 'waitlist_confirm', 'waitlist_forfeit'], handler: handleCourseActions },
        { keywords: ['view_preorder_list', 'stop_preorder_start', 'execute_stop_preorder', 'cancel_preorder_start', 'execute_cancel_preorder', 'enable_preorder_start', 'execute_enable_preorder', 'disable_product_start', 'execute_disable_product', 'select_preorder_quantity', 'confirm_product_preorder_start', 'execute_product_preorder', 'confirm_add_product', 'manage_product', 'edit_product_field', 'adjust_inventory_start', 'toggle_product_status', 'select_product_quantity', 'confirm_product_purchase', 'delete_product_start', 'delete_product_execute'], handler: handleProductActions },
        { keywords: ['cancel_pending_product_order_start', 'cancel_pending_product_order_execute','cancel_pending_order_start','cancel_pending_order_execute','notify_product_arrival_start', 'execute_notify_product_arrival', 'select_purchase_plan', 'execute_point_purchase', 'confirm_order', 'reject_order', 'execute_product_purchase', 'confirm_shop_order', 'cancel_shop_order_start', 'reject_shop_order', 'cancel_shop_order_execute', 'report_shop_last5'], handler: handleOrderActions },
        { keywords: ['mark_feedback_read', 'reply_feedback'], handler: handleFeedbackActions },
        { keywords: ['generate_report'], handler: handleReportActions },
        // [最終修正] 將最通用的 ViewActions 放在最後，作為「萬用接球手」
        { keywords: ['view_', 'list_', 'manage_course_group', 'student_search_results'], handler: handleViewActions },
    ];
    
    // 使用精確匹配優先，然後才用關鍵字匹配
    for (const route of actionRouter) {
        if (route.keywords.some(keyword => action === keyword || action.startsWith(keyword))) {
             if (route.keywords.some(keyword => action.includes(keyword))) {
                return route.handler(action, data, user);
            }
        }
    }

    // 如果上面都沒有匹配，再執行一次寬鬆的 includes 匹配，確保向下相容
    for (const route of actionRouter) {
        if (route.keywords.some(keyword => action.includes(keyword))) {
            return route.handler(action, data, user);
        }
    }
    
    console.log(`[INFO] 未處理的 Postback Action: ${action}`);
    return null;
}

async function handleEvent(event) {
    if (event.type === 'unfollow' || event.type === 'leave') {
        console.log(`用戶 ${event.source.userId} 已封鎖或離開`);
        return;
    }
    if (!event.replyToken && event.type !== 'follow') {
        return;
    }
    if (event.type === 'follow') {
    try {
        const userId = event.source.userId;
        const existingUser = await getUser(userId);

        if (existingUser) {
            // ----- 這是重新加入的使用者 -----
            console.log(`[Follow Event] 舊使用者 ${userId} 重新加入。`);

            // 歡迎他們回來，並更新他們可能已變更的 LINE 名稱或頭像
            const updatedUser = await updateUserProfileIfNeeded(userId, existingUser);
            const welcomeMessage = { type: 'text', text: `歡迎回來，${updatedUser.name}！` };
            await enqueuePushTask(userId, welcomeMessage, { settingKey: 'student_welcome_message' });

            // 確保他們有正確的選單
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);

        } else {
            // ----- 這是真正的新使用者 -----
            console.log(`[Follow Event] 新使用者 ${userId} 加入。`);
            const profile = await client.getProfile(userId);
            const newUser = { 
                id: userId, 
                name: profile.displayName, 
                points: 0, 
                role: 'student', 
                history: [], 
                picture_url: profile.pictureUrl 
            };
            await saveUser(newUser);
            userProfileCache.set(userId, { timestamp: Date.now(), name: profile.displayName, pictureUrl: profile.pictureUrl });

            const welcomeMessage = { type: 'text', text: `歡迎 ${newUser.name}！感謝您加入九容瑜伽。` };
            await enqueuePushTask(userId, welcomeMessage, { settingKey: 'student_welcome_message' });
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        }
    } catch (error) {
        console.error(`[Follow Event] 處理用戶 ${event.source.userId} 加入時出錯:`, error.message);
    }
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
    let user = await getUser(userId);
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], picture_url: profile.pictureUrl };
            await saveUser(user);
            userProfileCache.set(userId, { timestamp: Date.now(), name: profile.displayName, pictureUrl: profile.pictureUrl });
            const welcomeMessage = { type: 'text', text: `歡迎 ${user.name}！感謝您加入九容瑜伽。`};
            await enqueuePushTask(userId, welcomeMessage, { settingKey: 'student_welcome_message' });
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (error) { console.error(`創建新用戶時出錯: `, error); return; }
    } else {
    // 直接呼叫新函式來處理個人資料的檢查與更新
    // 函式內部會處理快取和 API 呼叫，並回傳最新的 user 物件
    user = await updateUserProfileIfNeeded(userId, user);
    }
    const now = Date.now();
    const lastInteraction = userLastInteraction[userId] || 0;
    const isNewSession = (now - lastInteraction) > CONSTANTS.INTERVALS.SESSION_TIMEOUT_MS;
    userLastInteraction[userId] = now;
    
    let notificationMessages = [];
    if (isNewSession) {
        const notifications = await getPendingNotificationsForUser(user);
        const settings = await getGlobalNotificationSettings(); // 取得最新的八項設定

        // 老師的提醒
        if (user.role === 'teacher' || user.role === 'admin') {
            if (settings.teacher_new_message && notifications.newMessages > 0) {
                notificationMessages.push({ type: 'text', text: `🔔 老師提醒：您有 ${notifications.newMessages} 則新留言待回覆喔！`});
            }
            if (settings.teacher_new_order && notifications.pendingPointOrders > 0) {
                notificationMessages.push({ type: 'text', text: `🔔 老師提醒：您有 ${notifications.pendingPointOrders} 筆點數訂單待審核。`});
            }
            if (settings.teacher_new_order && notifications.pendingShopOrders > 0) {
                notificationMessages.push({ type: 'text', text: `🔔 老師提醒：您有 ${notifications.pendingShopOrders} 筆商城訂單待處理。`});
            }
            if (settings.teacher_class_reminder_24hr && notifications.upcomingCourses && notifications.upcomingCourses.length > 0) {
                const courseCount = notifications.upcomingCourses.length;
                let reminderText = '🔔 課程提醒：\n未來 24 小時內有以下課程即將開始：\n';
                const coursesToShow = notifications.upcomingCourses.slice(0, 3);
                coursesToShow.forEach(course => {
                    reminderText += `\n• ${getCourseMainTitle(course.title)} (${formatDateTime(course.time)})`;
                });
                if (courseCount > 3) {
                    reminderText += `\n\n...還有 ${courseCount - 3} 堂課，請至「課程管理」查詢。`;
                }
                notificationMessages.push({ type: 'text', text: reminderText });
            }
        }
        
        // 管理員的提醒 (綁定在老師系統通知開關上)
        if (user.role === 'admin' && settings.admin_notifications_enabled && settings.admin_failed_task_alert_enabled && notifications.failedTasks > 0) {
          notificationMessages.push({ type: 'text', text: `🚨 管理員注意：系統中有 ${notifications.failedTasks} 個失敗任務，請至管理模式查看。`});
        }

        // 學員的提醒
        if (user.role === 'student') {
            if (settings.student_message_reply && notifications.unreadReplies > 0) {
                notificationMessages.push({ type: 'text', text: `🔔 學員提醒：您有 ${notifications.unreadReplies} 則老師的新回覆，請至「聯絡我們」查看！`});
            }
            if (settings.student_new_announcement && notifications.newAnnouncements > 0) {
                notificationMessages.push({ type: 'text', text: `✨ 您有 ${notifications.newAnnouncements} 則新公告，請至「最新公告」查看！`});
            }
        }
    }

    let mainReplyContent;
    let contextForError = '處理使用者指令';


    try {
        const text = (event.type === 'message' && event.message.type === 'text') ? event.message.text.trim() : '';


        let shouldClear = true;
        if (event.type === 'postback') {
            const postbackData = new URLSearchParams(event.postback.data);
            const action = postbackData.get('action');
            const continuationActions = [ 'set_course_weekday', 'select_teacher_for_course', 'confirm_add_product', 'edit_product_field', 'start_booking_confirmation', 'execute_booking',
                                          'execute_product_purchase',  'confirm_teacher_profile_update', 'start_purchase_history_search', 'start_exchange_history_search', 'start_message_history_search',
                                          'select_student_for_purchase_history', 'select_student_for_exchange_history', 'select_student_for_message_history','publish_prefilled_announcement','edit_prefilled_announcement'];
            if (continuationActions.includes(action)) {
                shouldClear = false;
            }
        }


        if (shouldClear && (text && text.startsWith('@') || event.type === 'postback')) {
            const wasCleared = clearPendingConversations(userId);
            if (wasCleared) console.log(`使用者 ${userId} 的待辦任務已由新操作自動取消。`);
        }
        
        if (text === CONSTANTS.COMMANDS.GENERAL.CANCEL) {
            const wasCleared = clearPendingConversations(userId);
            mainReplyContent = wasCleared ? '已取消先前的操作。' : '目前沒有可取消的操作。';
        } 
        else if (userId === ADMIN_USER_ID && text === CONSTANTS.COMMANDS.ADMIN.PANEL) {
            contextForError = '進入管理模式';
            if (user.role !== 'admin') {
                user.role = 'admin';
                await saveUser(user);
            }
            mainReplyContent = await handleAdminCommands(event, userId);
        }
        else if (event.type === 'message') {
            contextForError = `處理訊息: ${text}`;
            switch(user.role) {
                case 'admin': mainReplyContent = await handleAdminCommands(event, userId); break;
                case 'teacher': mainReplyContent = await handleTeacherCommands(event, userId); break;
                default: mainReplyContent = await handleStudentCommands(event, userId); break;
            }
        } 
        else if (event.type === 'postback') {
            const action = new URLSearchParams(event.postback.data).get('action');
            contextForError = `處理 Postback: ${action}`;
            mainReplyContent = await handlePostback(event, user);
        }
    } catch(err) {
        await handleError(err, event.replyToken, contextForError, userId);
        return;
    }
    
    const finalMessages = [...notificationMessages];
    if (mainReplyContent) {
        const contentArray = Array.isArray(mainReplyContent) ? mainReplyContent : [mainReplyContent];
        finalMessages.push(...contentArray);
    }


    if (finalMessages.length > 0) {
        const formattedMessages = finalMessages
            .filter(Boolean)
            .map(m => (typeof m === 'string' ? { type: 'text', text: m } : m));
        if (formattedMessages.length > 0) {
            try {
                 await reply(event.replyToken, formattedMessages);
            } catch (e) {
                console.error(`[FATAL] 在 handleEvent 中捕捉到 reply 函式的嚴重錯誤 for ${userId}:`, e);
            }
        }
    }

  }
