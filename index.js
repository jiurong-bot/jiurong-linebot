// index.js - V3.16.6 (程式碼優化與詳細功能備註)

// =====================================
//                 模組載入
// =====================================
const express = require('express');         // Express 框架，用於建立網頁伺服器
const fs = require('fs');                   // Node.js 檔案系統模組，用於讀寫檔案
const path = require('path');               // Node.js 路徑模組，用於處理檔案路徑
const line = require('@line/bot-sdk');       // LINE Bot SDK，用於與 LINE 平台互動
require('dotenv').config();                 // 載入 .env 檔案中的環境變數，確保敏感資訊不外洩

// =====================================
//               應用程式常數
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;      // 伺服器監聽埠號，優先使用環境變數 PORT，否則預設 3000

// 從環境變數讀取 LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 創建 LINE Bot 客戶端實例
const client = new line.Client(config);

// 資料檔案路徑
const DATA_FILE = './data.json';             // 用戶資料檔案：儲存用戶點數、角色、歷史記錄等
const COURSE_FILE = './courses.json';         // 課程資料檔案：儲存課程資訊、預約名單、候補名單
const ORDER_FILE = './orders.json';           // 購點訂單資料檔案
const BACKUP_DIR = './backup';               // 備份檔案存放目錄

// 設定與密碼 (從環境變數讀取，未設定則使用預設值)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527'; // 老師登入密碼
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/'; // Bot 自身的部署網址，用於 Keep-alive
const TEACHER_ID = process.env.TEACHER_ID;   // 老師的 LINE User ID，用於發送通知 (可選，但建議設定)

// 時間相關常數
const ONE_DAY_IN_MS = 86400000;              // 一天的毫秒數 (24 * 60 * 60 * 1000)
const PING_INTERVAL_MS = 1000 * 60 * 5;      // Keep-alive 服務的間隔，5 分鐘
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 資料備份間隔，24 小時

// 購點方案定義
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// 銀行匯款資訊 (可根據您的實際資訊修改)
const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
};

// 指令常數 (避免硬編碼字串)
const COMMANDS = {
  SWITCH_ROLE: '@切換身份',
  TEACHER: {
    MAIN_MENU: '@返回老師主選單',
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程名單',
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '@返回點數管理',
  },
  STUDENT: {
    MAIN_MENU: '@返回學員主選單',
    POINTS: '@點數',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購買紀錄',
    CANCEL_PURCHASE: '❌ 取消購買',
    CANCEL_INPUT_LAST5: '❌ 取消輸入後五碼',
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
    CONFIRM_YES: '✅ 是',
    CONFIRM_NO: '❌ 否',
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    RETURN_POINTS_MENU: '返回點數功能', // 購點流程中的返回
  }
};


// =====================================
//        資料檔案與備份目錄初始化
// =====================================
/**
 * 檢查並建立必要的資料檔案和備份目錄，確保應用程式啟動時環境就緒。
 */
function initializeDataFiles() {
  const filesToInitialize = [
    { file: DATA_FILE, defaultContent: '{}' },
    { file: ORDER_FILE, defaultContent: '{}' }
  ];

  filesToInitialize.forEach(({ file, defaultContent }) => {
    if (!fs.existsSync(file)) {
      console.log(`ℹ️ 建立新的資料檔案: ${file}`);
      fs.writeFileSync(file, defaultContent, 'utf8');
    }
  });

  // 課程檔案需要特殊處理 courseIdCounter
  if (!fs.existsSync(COURSE_FILE)) {
    console.log(`ℹ️ 建立新的課程檔案: ${COURSE_FILE}`);
    fs.writeFileSync(COURSE_FILE, JSON.stringify({ courses: {}, courseIdCounter: 1 }, null, 2), 'utf8');
  } else {
    // 如果檔案存在，讀取後檢查 courseIdCounter
    const coursesData = readJSON(COURSE_FILE);
    if (!coursesData.courseIdCounter) {
      coursesData.courseIdCounter = 1;
      writeJSON(COURSE_FILE, coursesData);
      console.log(`ℹ️ 為現有課程檔案添加 courseIdCounter。`);
    }
  }

  // 備份目錄
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log(`ℹ️ 建立備份目錄: ${BACKUP_DIR}`);
    fs.mkdirSync(BACKUP_DIR);
  }
}
initializeDataFiles(); // 應用程式啟動時呼叫初始化

// =====================================
//              🛠️ 工具函式
// =====================================

/**
 * 讀取 JSON 檔案內容並解析。
 * @param {string} file - 檔案路徑。
 * @returns {object} 解析後的 JSON 物件，如果檔案不存在或解析失敗則返回空物件。
 */
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch (error) {
    console.error(`❌ 讀取 JSON 檔案失敗: ${file}, 錯誤:`, error.message);
    if (error.code === 'ENOENT') {
      console.log(`ℹ️ 檔案不存在，將傳回空物件: ${file}`);
    }
    return {};
  }
}

/**
 * 將資料寫入 JSON 檔案。
 * @param {string} file - 檔案路徑。
 * @param {object} data - 要寫入的資料物件。
 */
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); // 以 2 個空格縮排格式化 JSON，並指定 utf8 編碼
  } catch (error) {
    console.error(`❌ 寫入 JSON 檔案失敗: ${file}, 錯誤:`, error.message);
  }
}

/**
 * 備份資料檔案。
 * 將 `data.json`, `courses.json` 和 `orders.json` 複製到備份目錄，並加上時間戳以區分。
 */
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 產生時間戳 (e.g., 2023-10-27T10-30-00-000Z)
  const filesToBackup = [DATA_FILE, COURSE_FILE, ORDER_FILE];
  let backupSuccess = true;

  filesToBackup.forEach(file => {
    try {
      const fileName = path.basename(file, '.json');
      fs.copyFileSync(file, path.join(BACKUP_DIR, `${fileName}_backup_${timestamp}.json`));
    } catch (err) {
      console.error(`❌ 備份檔案失敗 ${file}:`, err.message);
      backupSuccess = false;
    }
  });

  if (backupSuccess) {
    console.log(`✅ 資料備份成功：${timestamp}`);
  } else {
    console.error('❌ 部分資料備份失敗。');
  }
}

/**
 * 回覆 LINE 訊息。
 * @param {string} replyToken - 回覆 Token。
 * @param {string|Object|Array<Object>} content - 要回覆的文字訊息、Flex Message 物件或多個訊息物件。
 * @param {Array<Object>} [menu=null] - 快速回覆選單項目。
 * @returns {Promise<any>} LINE Bot SDK 的回覆訊息 Promise。
 */
function reply(replyToken, content, menu = null) {
  let messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];

  // 只對第一個文字訊息添加 quickReply
  if (menu && messages.length > 0 && messages[0].type === 'text') {
    messages[0].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
  }
  return client.replyMessage(replyToken, messages);
}

/**
 * 推送 LINE 訊息 (非回覆)。
 * 用於主動向用戶發送通知，例如課程取消通知、候補成功通知、購點通知等。
 * @param {string} to - 目標用戶 ID。
 * @param {string|Object|Array<Object>} content - 要推送的文字訊息、Flex Message 物件或多個訊息物件。
 * @returns {Promise<any>} LINE Bot SDK 的推送訊息 Promise。
 */
function push(to, content) {
  const messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  return client.pushMessage(to, messages);
}

/**
 * 清理課程資料。
 * 移除過期（超過課程時間點一天）的課程，並確保 students 和 waiting 陣列存在。
 * @param {object} coursesData - 課程資料物件，包含 courses 和 courseIdCounter。
 * @returns {object} 清理後的課程資料物件。
 */
function cleanCourses(coursesData) {
  const now = Date.now(); // 當前時間戳
  const cleanedCourses = {}; // 用於存放清理後的課程

  if (!coursesData || !coursesData.courses) {
    console.warn('⚠️ 課程資料結構異常，將初始化空課程。');
    return { courses: {}, courseIdCounter: coursesData?.courseIdCounter || 1 };
  }

  for (const id in coursesData.courses) {
    const c = coursesData.courses[id];
    // 檢查基本結構完整性
    if (!c || !c.title || !c.time || typeof c.capacity === 'undefined') {
      console.warn(`⚠️ 發現無效課程資料，已移除 ID: ${id}`, c);
      continue; // 跳過此課程
    }

    // 確保 students 和 waiting 是陣列，若無則初始化為空陣列
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waiting)) c.waiting = [];

    // 檢查課程是否過期一天。
    // 課程時間點過期「之後」的 ONE_DAY_IN_MS (24小時) 才進行清理，
    // 這表示課程結束後會保留約 24 小時，方便老師查看當天或前一天的名單。
    if (new Date(c.time).getTime() < now - ONE_DAY_IN_MS) {
      console.log(`🗑️ 課程已過期並移除: ${c.title} (${formatDateTime(c.time)})`);
      continue; // 跳過此課程
    }
    cleanedCourses[id] = c; // 將有效且未過期的課程加入清理後的物件
  }
  return { courses: cleanedCourses, courseIdCounter: coursesData.courseIdCounter || 1 };
}

/**
 * 格式化 ISO 時間字串為台灣當地時間顯示格式。
 * @param {string} isoString - ISO 格式的日期時間字串 (e.g., "2023-10-27T02:30:00.000Z").
 * @returns {string} 格式化後的日期時間字串 (e.g., "10-27 (五) 10:30").
 */
function formatDateTime(isoString) {
  if (!isoString) return '無效時間';
  const date = new Date(isoString); // 解析 ISO 字串，這被視為 UTC 時間點

  // 使用 Intl.DateTimeFormat 進行格式化，指定 'Asia/Taipei' 時區
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short', // 'short' 會輸出 '週一', '週二'
    hour: '2-digit',
    minute: '2-digit',
    hour12: false, // 24 小時制
    timeZone: 'Asia/Taipei' // 指定台北時間
  });

  const formattedParts = formatter.formatToParts(date);
  const month = formattedParts.find(p => p.type === 'month').value;
  const day = formattedParts.find(p => p.type === 'day').value;
  let weekday = formattedParts.find(p => p.type === 'weekday').value;
  const hour = formattedParts.find(p => p.type === 'hour').value;
  const minute = formattedParts.find(p => p.type === 'minute').value;

  // 將 '週一' 等轉換為 '一'，更簡潔
  if (weekday.startsWith('週')) {
    weekday = weekday.slice(-1);
  }

  return `${month}-${day}（${weekday}）${hour}:${minute}`;
}


// =====================================
//               📋 快速選單定義
// =====================================
const studentMenu = [
  { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
  { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
  { type: 'message', label: '點數查詢', text: COMMANDS.STUDENT.POINTS },
  { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE },
];

const studentPointSubMenu = [
  { type: 'message', label: '剩餘點數', text: COMMANDS.STUDENT.CHECK_POINTS },
  { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS },
  { type: 'message', label: '購買紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY },
  { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU },
];

const teacherCourseSubMenu = [
  { type: 'message', label: '課程名單', text: COMMANDS.TEACHER.COURSE_LIST },
  { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE },
  { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];

const teacherPointSubMenu = [
  { type: 'message', label: '待確認清單', text: COMMANDS.TEACHER.PENDING_ORDERS },
  { type: 'message', label: '手動調整', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];

const teacherMenu = [
  { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
  { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
  { type: 'message', label: '查學員', text: COMMANDS.TEACHER.SEARCH_STUDENT },
  { type: 'message', label: '報表', text: COMMANDS.TEACHER.REPORT },
  { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE },
];


// =====================================
//      📌 暫存狀態物件 (用於多步驟對話流程)
// =====================================
const pendingTeacherLogin = {};        // 儲存等待老師密碼輸入的用戶 ID
const pendingCourseCreation = {};      // 儲存新增課程流程的狀態和資料
const pendingCourseCancelConfirm = {}; // 儲存等待課程取消確認的用戶 ID 和課程 ID
const pendingPurchase = {};            // 儲存學員購點流程的狀態和資料
const pendingManualAdjust = {};        // 儲存老師手動調整點數流程的狀態


// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
/**
 * 處理老師身份下的所有指令。
 * @param {object} event - LINE 事件物件。
 * @param {string} userId - 用戶 ID。
 * @param {object} db - 用戶資料庫。
 * @param {object} coursesData - 課程資料物件 (包含 courses 和 courseIdCounter)。
 * @param {object} orders - 訂單資料庫。
 */
async function handleTeacherCommands(event, userId, db, coursesData, orders) {
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const courses = coursesData.courses; // 方便訪問課程列表

  // --- 返回主選單/子選單指令處理 ---
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    return reply(replyToken, '請選擇課程管理功能：', teacherCourseSubMenu);
  }
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    return reply(replyToken, '請選擇點數管理功能：', teacherPointSubMenu);
  }

  // --- 新增課程指令 ---
  if (text === COMMANDS.TEACHER.ADD_COURSE) {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return reply(replyToken, '請輸入課程名稱：');
  }

  // --- 取消課程指令 ---
  if (text === COMMANDS.TEACHER.CANCEL_COURSE) {
    const upcomingCourses = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date())
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有可取消的課程。', teacherCourseSubMenu);
    }

    return reply(replyToken, '請選擇要取消的課程：', upcomingCourses.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'postback',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        data: `cancel_course_${id}`, // 將課程 ID 帶入 postback data
      },
    })));
  }

  // --- 課程名單 (老師查看) ---
  if (text === COMMANDS.TEACHER.COURSE_LIST) {
    const now = Date.now();
    const upcomingCourses = Object.entries(courses)
      .filter(([, c]) => new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有未來的課程。', teacherCourseSubMenu);
    }

    let message = '近期課程名單：\n';
    upcomingCourses.forEach(([id, c]) => {
      message += `\n課程 ID: ${id}\n`;
      message += `標題: ${c.title}\n`;
      message += `時間: ${formatDateTime(c.time)}\n`;
      message += `容量: ${c.students.length}/${c.capacity}\n`;
      if (c.students.length > 0) {
        message += `預約學生 (${c.students.length}人):\n`;
        c.students.forEach((sId, index) => {
          message += `  ${index + 1}. ${db[sId] ? db[sId].name : '未知使用者'} (ID: ${sId.substring(0, 4)}...)\n`;
        });
      } else {
        message += `預約學生: 無\n`;
      }
      if (c.waiting.length > 0) {
        message += `候補學生 (${c.waiting.length}人):\n`;
        c.waiting.forEach((wId, index) => {
          message += `  ${index + 1}. ${db[wId] ? db[wId].name : '未知使用者'} (ID: ${wId.substring(0, 4)}...)\n`;
        });
      } else {
        message += `候補學生: 無\n`;
      }
    });
    return reply(replyToken, message.trim(), teacherCourseSubMenu);
  }

  // --- 查詢學員指令 (@查學員) ---
  if (text.startsWith(COMMANDS.TEACHER.SEARCH_STUDENT + ' ')) {
    const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT + ' ', '').trim();
    if (!query) {
      return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }

    let foundUser = null;
    let foundUserId = null;

    // 嘗試透過完整 ID 查找
    if (db[query] && db[query].role === 'student') {
      foundUser = db[query];
      foundUserId = query;
    } else {
      // 嘗試透過名稱部分匹配查找
      for (const id in db) {
        const userEntry = db[id];
        if (userEntry.role === 'student' && userEntry.name && userEntry.name.toLowerCase().includes(query.toLowerCase())) {
          foundUser = userEntry;
          foundUserId = id;
          break; // 找到第一個匹配就退出
        }
      }
    }

    if (!foundUser) {
      return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
    }

    let studentInfo = `學員姓名：${foundUser.name}\n`;
    studentInfo += `學員 ID：${foundUserId}\n`; // 顯示完整的 ID
    studentInfo += `剩餘點數：${foundUser.points} 點\n`;
    studentInfo += `歷史記錄 (近5筆)：\n`;
    if (foundUser.history && foundUser.history.length > 0) {
      foundUser.history.slice(-5).reverse().forEach(record => {
        studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
      });
    } else {
      studentInfo += `無歷史記錄。\n`;
    }
    return reply(replyToken, studentInfo, teacherMenu);
  }

  // --- 統計報表 (@統計報表) ---
  if (text === COMMANDS.TEACHER.REPORT) {
    const students = Object.values(db).filter(user => user.role === 'student');
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length;

    const totalCourses = Object.keys(courses).length;
    const upcomingCourses = Object.values(courses).filter(c => new Date(c.time) > new Date()).length;
    const completedCourses = totalCourses - upcomingCourses;

    const pendingOrders = Object.values(orders).filter(o => o.status === 'pending_confirmation').length;
    const completedOrders = Object.values(orders).filter(o => o.status === 'completed').length;
    const totalRevenue = Object.values(orders)
      .filter(o => o.status === 'completed')
      .reduce((sum, order) => sum + order.amount, 0);

    let report = '📊 營運報告 📊\n\n';
    report += `👤 學員總數：${students.length} 人\n`;
    report += `🟢 活躍學員：${activeStudentsCount} 人\n`;
    report += `💎 所有學員總點數：${totalPoints} 點\n\n`;
    report += `🗓️ 課程統計：\n`;
    report += `  總課程數：${totalCourses} 堂\n`;
    report += `  進行中/未開課：${upcomingCourses} 堂\n`;
    report += `  已結束課程：${completedCourses} 堂\n\n`;
    report += `💰 購點訂單：\n`;
    report += `  待確認訂單：${pendingOrders} 筆\n`;
    report += `  已完成訂單：${completedOrders} 筆\n`;
    report += `  總收入 (已完成訂單)：${totalRevenue} 元\n`;

    return reply(replyToken, report, teacherMenu);
  }

  // --- 待確認清單 (購點) (@待確認清單) ---
  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    const pendingConfirmationOrders = Object.values(orders)
      .filter(order => order.status === 'pending_confirmation')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (pendingConfirmationOrders.length === 0) {
      return reply(replyToken, '目前沒有待確認的購點訂單。', teacherPointSubMenu);
    }

    let messages = [{ type: 'text', text: '以下是待確認的購點訂單：' }];
    pendingConfirmationOrders.forEach(order => {
      messages.push({
        type: 'flex',
        altText: `訂單 ${order.orderId} - ${order.userName} 購買 ${order.points} 點`,
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: `購點訂單 #${order.orderId}`, weight: 'bold', size: 'md' },
              { type: 'separator', margin: 'md' },
              {
                type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: [
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '學員名稱:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: order.userName, flex: 7, size: 'sm', wrap: true }] },
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '學員ID:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: order.userId.substring(0, 8) + '...', flex: 7, size: 'sm' }] },
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '購買點數:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: `${order.points} 點`, flex: 7, size: 'sm' }] },
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '應付金額:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: `$${order.amount}`, flex: 7, size: 'sm' }] },
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '匯款後五碼:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: order.last5Digits || 'N/A', flex: 7, size: 'sm', weight: 'bold', color: '#EE3333' }] },
                  { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: '提交時間:', flex: 3, size: 'sm', color: '#555555' }, { type: 'text', text: formatDateTime(order.timestamp), flex: 7, size: 'sm' }] },
                ],
              },
            ],
          },
          footer: {
            type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
              { type: 'button', action: { type: 'postback', label: '✅ 確認入帳', data: `confirm_order_${order.orderId}`, displayText: `✅ 確認訂單 ${order.orderId} 入帳` }, style: 'primary', color: '#34A853' },
              { type: 'button', action: { type: 'postback', label: '❌ 取消訂單', data: `cancel_order_${order.orderId}`, displayText: `❌ 取消訂單 ${order.orderId}` }, style: 'secondary', color: '#EA4335' },
            ],
          },
        },
      });
    });
    return client.replyMessage(replyToken, messages);
  }

  // --- 手動調整點數 (@手動調整點數) ---
  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust[userId] = { step: 1 };
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。', teacherPointSubMenu);
  }

  // --- 預設回覆 ---
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}

// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
/**
 * 處理學員身份下的所有指令。
 * @param {object} event - LINE 事件物件。
 * @param {string} userId - 用戶 ID。
 * @param {object} db - 用戶資料庫。
 * @param {object} coursesData - 課程資料物件 (包含 courses 和 courseIdCounter)。
 * @param {object} orders - 訂單資料庫。
 */
async function handleStudentCommands(event, userId, db, coursesData, orders) {
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = db[userId];
  const courses = coursesData.courses; // 方便訪問課程列表

  // --- 返回主選單/子選單指令處理 ---
  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  if (text === COMMANDS.STUDENT.POINTS) {
    return reply(replyToken, '請選擇點數相關功能：', studentPointSubMenu);
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    delete pendingPurchase[userId]; // 清除購點流程狀態
    return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
  }


  // --- 查詢剩餘點數 (@剩餘點數) ---
  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    return reply(replyToken, `你目前有 ${user.points} 點。`, studentMenu);
  }

  // --- 購買點數流程 (@購買點數) ---
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );

    if (pendingOrder) {
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.orderId})，請先完成匯款並至「購買紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
        [{ type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }]
      );
    }

    pendingPurchase[userId] = { step: 'select_plan', data: {} };
    const planOptions = PURCHASE_PLANS.map(plan => ({
      type: 'message', label: plan.label, text: plan.label
    }));
    planOptions.push({ type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });
    return reply(replyToken, '請選擇要購買的點數方案：', planOptions);
  }

  // --- 取消購買點數 (學員主動發送) ---
  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );
    if (pendingOrder) {
      delete orders[pendingOrder.orderId];
      writeJSON(ORDER_FILE, orders);
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消您的購點訂單。', studentMenu);
    }
    if (pendingPurchase[userId]) {
      delete pendingPurchase[userId];
    }
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  }

  // --- 購買紀錄功能 (@購買紀錄) ---
  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    const pendingOrder = Object.values(orders).find(order =>
      order.userId === userId && order.status === 'pending_payment'
    );

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.orderId } };
      return reply(replyToken, `您的訂單 ${pendingOrder.orderId} 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }
      ]);
    }

    if (!user.history || user.history.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    }

    let historyMessage = '以下是你的點數記錄：\n';
    user.history.slice(-5).reverse().forEach(record => {
      historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`;
    });
    return reply(replyToken, historyMessage.trim(), studentMenu);
  }

  // --- 處理學員輸入匯款後五碼 (在 @購買紀錄 流程中) ---
  if (pendingPurchase[userId] && pendingPurchase[userId].step === 'input_last5') {
    const orderId = pendingPurchase[userId].data.orderId;
    const last5Digits = text.trim();

    if (!/^\d{5}$/.test(last5Digits)) {
      return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
    }

    const order = orders[orderId];
    if (!order || order.status !== 'pending_payment') {
      delete pendingPurchase[userId];
      return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
    }

    order.last5Digits = last5Digits;
    order.status = 'pending_confirmation';
    writeJSON(ORDER_FILE, orders);
    delete pendingPurchase[userId];

    await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);
    if (TEACHER_ID) {
      await push(TEACHER_ID, `🔔 有新的購點訂單待確認！請輸入 ${COMMANDS.TEACHER.PENDING_ORDERS} 進入管理介面。`)
        .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
    } else {
      console.warn('⚠️ TEACHER_ID 未設定，無法通知老師新的購點訂單。');
    }
    return;
  }

  // --- 處理取消輸入後五碼的訊息 ---
  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
    if (pendingPurchase[userId]?.step === 'input_last5') {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    } else {
      return reply(replyToken, '目前沒有需要取消的輸入流程。', studentMenu);
    }
  }

  // --- 預約課程功能 (@預約課程) ---
  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const upcoming = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date())
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcoming.length === 0) {
      return reply(replyToken, '目前沒有可預約的課程。', studentMenu);
    }

    const quickReplyItems = upcoming.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要預約 ${id}`,
      },
    }));

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '以下是目前可以預約的課程，點擊即可預約並扣除 1 點。',
      quickReply: { items: quickReplyItems },
    });
  }

  // --- ✅ 執行預約課程 (接收來自選單的 `我要預約 [ID]` 指令) ---
  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    const course = courses[courseId];

    if (!course) {
      return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    }
    if (new Date(course.time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
    }
    if (course.students.includes(userId)) {
      return reply(replyToken, '你已經預約此課程了。', studentMenu);
    }
    if (course.waiting.includes(userId)) {
      return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    }
    if (user.points <= 0) {
      return reply(replyToken, '你的點數不足，請先購買點數。', studentMenu);
    }

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      user.points--;
      user.history.push({ id: courseId, action: `預約成功：${course.title}`, time: new Date().toISOString() });
      writeJSON(COURSE_FILE, coursesData); // 傳入 coursesData 整個物件
      writeJSON(DATA_FILE, db);
      return reply(replyToken, `已成功預約課程：「${course.title}」。`, studentMenu);
    } else {
      course.waiting.push(userId);
      user.history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() });
      writeJSON(COURSE_FILE, coursesData); // 傳入 coursesData 整個物件
      writeJSON(DATA_FILE, db);
      return reply(replyToken, `該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣點。`, studentMenu);
    }
  }

  // --- 📖 我的課程功能 (@我的課程) ---
  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.entries(courses)
      .filter(([, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    const waitingCourses = Object.entries(courses)
      .filter(([, c]) => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    let replyMessage = '';

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
    }

    if (enrolledCourses.length > 0) {
      replyMessage += '✅ 你已預約的課程：\n';
      enrolledCourses.forEach(([, c]) => {
        replyMessage += `・${c.title} - ${formatDateTime(c.time)}\n`;
      });
      replyMessage += '\n';
    }

    if (waitingCourses.length > 0) {
      replyMessage += '⏳ 你候補中的課程：\n';
      waitingCourses.forEach(([, c]) => {
        const waitingIndex = c.waiting.indexOf(userId) + 1;
        replyMessage += `・${c.title} - ${formatDateTime(c.time)} (目前候補第 ${waitingIndex} 位)\n`;
      });
    }

    return reply(replyToken, replyMessage.trim(), studentMenu);
  }

  // --- ❌ 取消已預約課程（含自動候補轉正） (@取消預約) ---
  if (text === COMMANDS.STUDENT.CANCEL_BOOKING) {
    const enrolled = Object.entries(courses).filter(([, c]) =>
      c.students.includes(userId) && new Date(c.time) > new Date()
    ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (enrolled.length === 0) {
      return reply(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
    }

    return reply(replyToken, '請選擇要取消的預約課程：', enrolled.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消預約 ${id}`,
      },
    })));
  }

  // --- 執行取消預約 (由快速選單觸發) ---
  if (text.startsWith('我要取消預約 ')) {
    const id = text.replace('我要取消預約 ', '').trim();
    const course = courses[id];
    if (!course || !course.students.includes(userId)) {
      return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    }

    course.students = course.students.filter(sid => sid !== userId);
    user.points++;
    user.history.push({ id, action: `取消預約退點：${course.title}`, time: new Date().toISOString() });

    let replyMessage = `課程「${course.title}」已取消，已退還 1 點。`;

    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting[0];
      if (db[nextWaitingUserId] && db[nextWaitingUserId].points > 0) {
        course.waiting.shift();
        course.students.push(nextWaitingUserId);
        db[nextWaitingUserId].points--;
        db[nextWaitingUserId].history.push({ id, action: `候補補上：${course.title}`, time: new Date().toISOString() });

        push(nextWaitingUserId,
          `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 1 點。請確認你的「我的課程」。`
        ).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));

        replyMessage += '\n有候補學生已遞補成功。';
      } else if (db[nextWaitingUserId]) {
        const studentName = db[nextWaitingUserId].name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 ${studentName} 點數不足，未能遞補。已將其從候補名單移除。`;
        course.waiting.shift();
        console.log(`⚠️ 候補學生 ${studentName} (ID: ${nextWaitingUserId}) 點數不足，未能遞補，已從候補名單移除。`);
        if (TEACHER_ID) {
          push(TEACHER_ID,
            `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足，未能遞補。已自動從候補名單移除該學生。`
          ).catch(e => console.error('❌ 通知老師失敗', e.message));
        }
      } else {
        course.waiting.shift();
        replyMessage += '\n候補名單中存在無效用戶，已移除。';
      }
    } else if (course.waiting.length > 0 && course.students.length >= course.capacity) {
      replyMessage += '\n課程空出一位，但候補名單仍需等待。';
    }

    writeJSON(COURSE_FILE, coursesData); // 傳入 coursesData 整個物件
    writeJSON(DATA_FILE, db);
    return reply(replyToken, replyMessage, studentMenu);
  }

  // --- ❌ 取消候補 (@取消候補) ---
  if (text === COMMANDS.STUDENT.CANCEL_WAITING) {
    const waitingCourses = Object.entries(courses)
      .filter(([, c]) => c.waiting?.includes(userId) && new Date(c.time) > new Date())
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
    }

    return reply(replyToken, '請選擇要取消候補的課程：', waitingCourses.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消候補 ${id}`,
      },
    })));
  }

  // --- 執行取消候補 (由快速選單觸發) ---
  if (text.startsWith('我要取消候補 ')) {
    const id = text.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time) < new Date()) {
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId);
    user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    writeJSON(COURSE_FILE, coursesData); // 傳入 coursesData 整個物件
    writeJSON(DATA_FILE, db);
    return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
  }

  // --- 預設回覆，提示用戶使用選單 ---
  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}


// =====================================
//      🎯 主事件處理函式 (處理所有 LINE 傳入的訊息和事件)
// =====================================
async function handleEvent(event) {
  let db = readJSON(DATA_FILE);
  let coursesData = cleanCourses(readJSON(COURSE_FILE));
  let orders = readJSON(ORDER_FILE);

  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // --- 用戶資料初始化與更新 ---
  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
    console.log(`ℹ️ 新用戶加入: ${userId}`);
  }

  try {
    const profile = await client.getProfile(userId);
    if (!db[userId].name || db[userId].name === '匿名使用者') {
      db[userId].name = profile.displayName || '匿名使用者';
    }
  } catch (e) {
    console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
    if (!db[userId].name) {
      db[userId].name = '匿名使用者';
    }
  }
  writeJSON(DATA_FILE, db);

  // --- Postback 事件處理 ---
  if (event.type === 'postback') {
    const data = event.postback.data;

    // 課程取消確認流程 (老師專用)
    if (data.startsWith('cancel_course_')) {
      if (db[userId].role !== 'teacher') {
        return reply(replyToken, '您沒有權限執行此操作。');
      }
      const courseId = data.replace('cancel_course_', '');
      const course = coursesData.courses[courseId];
      if (!course || new Date(course.time) < new Date()) {
        return reply(replyToken, '找不到該課程，或課程已過期。', teacherCourseSubMenu);
      }
      pendingCourseCancelConfirm[userId] = courseId;
      return reply(replyToken, `確認要取消課程「${course.title}」嗎？\n一旦取消將退還所有學生點數。`, [
        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_YES, text: COMMANDS.STUDENT.CONFIRM_YES },
        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_NO, text: COMMANDS.STUDENT.CONFIRM_NO },
      ]);
    }

    // 老師購點確認操作 (老師專用)
    if (data.startsWith('confirm_order_') || data.startsWith('cancel_order_')) {
      if (db[userId].role !== 'teacher') {
        return reply(replyToken, '您沒有權限執行此操作。');
      }
      const orderId = data.split('_')[2];
      const action = data.split('_')[0];
      const order = orders[orderId];

      if (!order || order.status !== 'pending_confirmation') {
        return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', teacherPointSubMenu);
      }
      const studentUser = db[order.userId];
      if (!studentUser) {
        return reply(replyToken, `找不到購點學員 (ID: ${order.userId}) 的資料。`, teacherPointSubMenu);
      }

      if (action === 'confirm') {
        studentUser.points += order.points;
        studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
        order.status = 'completed';
        writeJSON(DATA_FILE, db);
        writeJSON(ORDER_FILE, orders);
        await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, teacherPointSubMenu);
        await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。請查詢您的「剩餘點數」。`).catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));
      } else if (action === 'cancel') {
        order.status = 'cancelled';
        writeJSON(ORDER_FILE, orders);
        await reply(replyToken, `❌ 已取消訂單 ${orderId} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, teacherPointSubMenu);
      }
      return;
    }
  }

  // 只處理文字訊息事件
  if (event.type !== 'message' || !event.message.text) return;

  const text = event.message.text.trim();

  // --- 多步驟新增課程流程處理 (老師專用) ---
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];
    const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };

    // 取消指令統一處理
    if (text === COMMANDS.TEACHER.MAIN_MENU || text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
        delete pendingCourseCreation[userId];
        return reply(replyToken, '已取消新增課程流程並返回選單。', teacherCourseSubMenu);
    }

    switch (stepData.step) {
      case 1: // 接收課程名稱
        stepData.data.title = text;
        stepData.step = 2;
        return reply(replyToken, '請選擇課程日期（星期幾）：', Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day })));
      case 2: // 接收課程星期
        if (!weekdays.hasOwnProperty(text)) {
          return reply(replyToken, '請輸入正確的星期（例如：星期一）');
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）');
      case 3: // 接收課程時間
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
          return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return reply(replyToken, '請輸入人員上限（正整數）');
      case 4: // 接收課程人數上限
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return reply(replyToken, '人數上限必須是正整數。');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
        ]);
      case 5: // 確認新增或取消
        if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
          const targetWeekdayIndex = weekdays[stepData.data.weekday];
          const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);

          const now = new Date();
          const taipeiOffsetHours = 8;
          const taipeiOffsetMs = taipeiOffsetHours * 60 * 60 * 1000;
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const todayWeekdayUTC = today.getUTCDay();

          let dayDiff = (targetWeekdayIndex - todayWeekdayUTC + 7) % 7;
          const currentTaipeiTime = new Date(now.getTime() + taipeiOffsetMs);
          const currentHourTaipei = currentTaipeiTime.getUTCHours();
          const currentMinuteTaipei = currentTaipeiTime.getUTCMinutes();

          if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
            dayDiff = 7;
          }

          const courseDateTaipei = new Date(today.getTime() + dayDiff * ONE_DAY_IN_MS);
          courseDateTaipei.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);
          const isoTime = courseDateTaipei.toISOString();

          const newId = `C${String(coursesData.courseIdCounter).padStart(3, '0')}`;
          coursesData.courseIdCounter++;

          coursesData.courses[newId] = {
            title: stepData.data.title, time: isoTime, capacity: stepData.data.capacity, students: [], waiting: [],
          };
          writeJSON(COURSE_FILE, coursesData);
          delete pendingCourseCreation[userId];
          return reply(replyToken, `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}\n課程 ID: ${newId}`, teacherCourseSubMenu);
        } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
          delete pendingCourseCreation[userId];
          return reply(replyToken, '已取消新增課程。', teacherCourseSubMenu);
        } else {
          return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」確認。`);
        }
      default:
        delete pendingCourseCreation[userId];
        return reply(replyToken, '流程異常，已重置。', teacherMenu);
    }
  }

  // --- ✅ 課程取消確認流程處理 (老師專用) ---
  if (pendingCourseCancelConfirm[userId]) {
    const courseId = pendingCourseCancelConfirm[userId];
    let coursesDataConfirm = readJSON(COURSE_FILE);
    const course = coursesDataConfirm.courses[courseId];

    if (text === COMMANDS.STUDENT.CONFIRM_YES) {
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return reply(replyToken, '找不到該課程，取消失敗或已被刪除。', teacherCourseSubMenu);
      }
      const dbData = readJSON(DATA_FILE);
      course.students.forEach(stuId => {
        if (dbData[stuId]) {
          dbData[stuId].points++;
          dbData[stuId].history.push({ id: courseId, action: `課程取消退點：${course.title}`, time: new Date().toISOString() });
          push(stuId, `您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，已退還 1 點。請確認您的「剩餘點數」。`)
            .catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
        }
      });
      course.waiting.forEach(waitId => {
        if (dbData[waitId]) {
          dbData[waitId].history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
          push(waitId, `您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`)
            .catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
        }
      });
      delete coursesDataConfirm.courses[courseId];
      writeJSON(COURSE_FILE, coursesDataConfirm);
      writeJSON(DATA_FILE, dbData);
      delete pendingCourseCancelConfirm[userId];
      return reply(replyToken, `課程「${course.title}」已取消，所有學生點數已退還。`, teacherCourseSubMenu);
    } else if (text === COMMANDS.STUDENT.CONFIRM_NO) {
      delete pendingCourseCancelConfirm[userId];
      return reply(replyToken, '取消課程操作已中止。', teacherCourseSubMenu);
    } else {
      return reply(replyToken, `請選擇是否取消課程：\n「${COMMANDS.STUDENT.CONFIRM_YES}」或「${COMMANDS.STUDENT.CONFIRM_NO}」。`, [
        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_YES, text: COMMANDS.STUDENT.CONFIRM_YES },
        { type: 'message', label: COMMANDS.STUDENT.CONFIRM_NO, text: COMMANDS.STUDENT.CONFIRM_NO },
      ]);
    }
  }

  // --- 🔐 老師手動調整點數流程處理 (老師專用) ---
  if (pendingManualAdjust[userId]) {
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, '已取消手動調整點數。', teacherPointSubMenu);
    }

    const parts = text.split(' ');
    if (parts.length !== 2) {
      return reply(replyToken, '指令格式錯誤，請輸入：[學員ID/姓名] [數量] (正數加點，負數扣點)', teacherPointSubMenu);
    }

    const targetIdentifier = parts[0];
    const amount = parseInt(parts[1]);

    if (isNaN(amount) || amount === 0) {
      return reply(replyToken, '點數數量必須是非零整數。', teacherPointSubMenu);
    }

    let foundUserId = null;
    let foundUserName = null;

    if (db[targetIdentifier] && db[targetIdentifier].role === 'student') {
      foundUserId = targetIdentifier;
      foundUserName = db[targetIdentifier].name;
    } else {
      for (const id in db) {
        const user = db[id];
        if (user.role === 'student' && user.name && user.name.toLowerCase().includes(targetIdentifier.toLowerCase())) {
          foundUserId = id;
          foundUserName = user.name;
          break;
        }
      }
    }

    if (!foundUserId) {
      delete pendingManualAdjust[userId];
      return reply(replyToken, `找不到學員：${targetIdentifier}。請確認學員 ID 或姓名是否正確。`, teacherPointSubMenu);
    }

    const operation = amount > 0 ? '加點' : '扣點';
    const absAmount = Math.abs(amount);
    let currentPoints = db[foundUserId].points;
    let newPoints = currentPoints + amount;

    if (operation === '扣點' && currentPoints < absAmount) {
      delete pendingManualAdjust[userId];
      return reply(replyToken, `學員 ${foundUserName} 點數不足，無法扣除 ${absAmount} 點 (目前 ${currentPoints} 點)。`, teacherPointSubMenu);
    }

    db[foundUserId].points = newPoints;
    db[foundUserId].history.push({
      action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId
    });
    writeJSON(DATA_FILE, db);

    push(foundUserId, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${newPoints}點。`)
      .catch(e => console.error(`❌ 通知學員 ${foundUserId} 點數變動失敗:`, e.message));

    delete pendingManualAdjust[userId];
    return reply(replyToken, `✅ 已成功為學員 ${foundUserName} ${operation} ${absAmount} 點，目前點數：${newPoints} 點。`, teacherPointSubMenu);
  }

  // --- 學生購點流程處理 (學員專用) ---
  if (pendingPurchase[userId]) {
    const stepData = pendingPurchase[userId];

    switch (stepData.step) {
      case 'select_plan':
        const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
        if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
            delete pendingPurchase[userId];
            return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
        }
        if (!selectedPlan) {
          return reply(replyToken, '請從列表中選擇有效的點數方案。', studentPointSubMenu);
        }
        stepData.data = {
          points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: db[userId].name, timestamp: new Date().toISOString(), status: 'pending_payment'
        };
        stepData.step = 'confirm_purchase';
        return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
          { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS || '✅ 確認購買', text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS || '✅ 確認購買' },
          { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
        ]);
      case 'confirm_purchase':
        if (text === (COMMANDS.STUDENT.CONFIRM_BUY_POINTS || '✅ 確認購買')) {
          const orderId = `O${Date.now()}`;
          stepData.data.orderId = orderId;
          orders[orderId] = stepData.data;
          writeJSON(ORDER_FILE, orders);
          delete pendingPurchase[userId];
          return reply(replyToken, `✅ 已確認購買 ${stepData.data.points} 點，請先完成轉帳或匯款。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數查詢」>「購買紀錄」並輸入您的匯款帳號後五碼以供核對。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
        } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
          delete pendingPurchase[userId];
          return reply(replyToken, '已取消購買點數。', studentMenu);
        } else {
          return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS || '✅ 確認購買'}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`, studentMenu);
        }
    }
  }


  // --- 🔁 身份切換指令處理 ---
  if (text === COMMANDS.SWITCH_ROLE) {
    if (db[userId].role === 'teacher') {
      db[userId].role = 'student';
      writeJSON(DATA_FILE, db);
      return reply(event.replyToken, '已切換為學員身份。', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true;
      return reply(event.replyToken, '請輸入老師密碼登入。');
    }
  }

  // --- 🔐 老師登入密碼驗證 ---
  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return reply(replyToken, '老師登入成功。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
    }
  }

  // --- 🔀 根據用戶身份導向不同的指令處理函式 ---
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, coursesData, orders);
  } else {
    return handleStudentCommands(event, userId, db, coursesData, orders);
  }
}

// =====================================
//           LINE Webhook 與伺服器啟動
// =====================================

// 設定 Webhook 路由，接收來自 LINE 的訊息
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.message);
      res.status(500).end();
    });
});

// 健康檢查路由，用於檢查 Bot 服務是否正常運行
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 啟動伺服器與 Keep-alive 機制
app.listen(PORT, () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V3.16.6 (程式碼優化與詳細功能備註)`);

  // 應用程式啟動時執行一次資料備份
  backupData();
  // 設定定時備份任務
  setInterval(backupData, BACKUP_INTERVAL_MS); // 每 24 小時備份一次

  // Keep-alive pinging to prevent dyno sleep on Free Tier hosting
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    setInterval(() => {
        fetch(SELF_URL)
            .then(res => console.log(`Keep-alive response: ${res.status}`))
            .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
    }, PING_INTERVAL_MS);
  } else {
    console.warn('⚠️ SELF_URL 未設定或使用預設值，Keep-alive 功能可能無法防止服務休眠。請在 .env 檔案中設定您的部署網址。');
  }
});
