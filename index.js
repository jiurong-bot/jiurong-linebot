// index.js - V3.14.0 (新增預約課程與我的課程功能) - 優化版

// --- 模組載入 ---
const express = require('express'); // Express 框架，用於建立網頁伺服器
const fs = require('fs');         // Node.js 檔案系統模組，用於讀寫檔案
const path = require('path');       // Node.js 路徑模組，用於處理檔案路徑
const line = require('@line/bot-sdk'); // LINE Bot SDK，用於與 LINE 平台互動
require('dotenv').config();       // 載入 .env 檔案中的環境變數，確保敏感資訊不外洩

// --- 應用程式常數定義 ---
const app = express();
const PORT = process.env.PORT || 3000; // 伺服器監聽埠號，優先使用環境變數 PORT，否則預設 3000

// 資料檔案路徑
const DATA_FILE = './data.json';     // 用戶資料檔案：儲存用戶點數、角色、歷史記錄等
const COURSE_FILE = './courses.json'; // 課程資料檔案：儲存課程資訊、預約名單、候補名單
const BACKUP_DIR = './backup';       // 備份檔案存放目錄

// 設定與密碼 (從環境變數讀取，未設定則使用預設值)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527'; // 老師登入密碼
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform'; // 購買點數表單連結
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/'; // Bot 自身的部署網址，用於 Keep-alive
const TEACHER_ID = process.env.TEACHER_ID; // 老師的 LINE User ID，用於發送通知 (可選，但建議設定)

// 時間相關常數
const ONE_DAY_IN_MS = 86400000; // 一天的毫秒數 (24 * 60 * 60 * 1000)
const PING_INTERVAL_MS = 1000 * 60 * 5; // Keep-alive 服務的間隔，5 分鐘
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 資料備份間隔，24 小時

// --- 資料檔案與備份目錄初始化 ---
// 檢查並建立必要的資料檔案和備份目錄，確保應用程式啟動時環境就緒
if (!fs.existsSync(DATA_FILE)) {
  console.log(`ℹ️ 建立新的資料檔案: ${DATA_FILE}`);
  fs.writeFileSync(DATA_FILE, '{}', 'utf8'); // 指定 utf8 編碼
}
if (!fs.existsSync(COURSE_FILE)) {
  console.log(`ℹ️ 建立新的課程檔案: ${COURSE_FILE}`);
  fs.writeFileSync(COURSE_FILE, '{}', 'utf8');
}
if (!fs.existsSync(BACKUP_DIR)) {
  console.log(`ℹ️ 建立備份目錄: ${BACKUP_DIR}`);
  fs.mkdirSync(BACKUP_DIR);
}

// --- LINE Bot SDK 設定 ---
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config); // 建立 LINE Bot 客戶端實例，用於與 LINE 平台通訊

// --- 🛠️ 工具函式 ---
/**
 * 讀取 JSON 檔案內容並解析。
 * @param {string} file - 檔案路徑。
 * @returns {object} 解析後的 JSON 物件，如果檔案不存在或解析失敗則返回空物件。
 */
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // 如果檔案內容為空字串，則解析為空物件，避免 JSON.parse 錯誤
    return content ? JSON.parse(content) : {};
  } catch (error) {
    console.error(`❌ 讀取 JSON 檔案失敗: ${file}`, error.message);
    // 如果檔案不存在，則嘗試建立一個空 JSON
    if (error.code === 'ENOENT') {
      console.log(`ℹ️ 檔案不存在，將建立空檔案: ${file}`);
      fs.writeFileSync(file, '{}', 'utf8');
      return {};
    }
    return {}; // 發生其他錯誤時返回空物件
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
    console.error(`❌ 寫入 JSON 檔案失敗: ${file}`, error.message);
  }
}

/**
 * 備份資料檔案。
 * 將 `data.json` 和 `courses.json` 複製到備份目錄，並加上時間戳以區分。
 */
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 產生時間戳 (e.g., 2023-10-27T10-30-00-000Z)
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 資料備份失敗:', err.message);
  }
}

/**
 * 回覆 LINE 訊息。
 * @param {string} token - 回覆 Token。
 * @param {string} text - 要回覆的文字訊息。
 * @param {Array<Object>} [menu=null] - 快速回覆選單項目。
 * @returns {Promise<any>} LINE Bot SDK 的回覆訊息 Promise。
 */
function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    // 限制快速選單項目最多 13 個 (LINE API 限制)
    msg.quickReply = {
      items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

/**
 * 推送 LINE 訊息 (非回覆)。
 * 用於主動向用戶發送通知，例如課程取消通知、候補成功通知等。
 * @param {string} to - 目標用戶 ID。
 * @param {string} text - 要推送的文字訊息。
 * @returns {Promise<any>} LINE Bot SDK 的推送訊息 Promise。
 */
function pushText(to, text) {
  return client.pushMessage(to, { type: 'text', text });
}

/**
 * 清理課程資料。
 * 移除過期（超過課程時間點一天）或無效結構的課程，並確保 students 和 waiting 陣列存在。
 * @param {object} courses - 課程資料物件。
 * @returns {object} 清理後的課程資料物件。
 */
function cleanCourses(courses) {
  const now = Date.now(); // 當前時間戳
  const cleanedCourses = {}; // 用於存放清理後的課程

  for (const id in courses) {
    const c = courses[id];
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
  return cleanedCourses;
}

/**
 * 格式化 ISO 時間字串為台灣當地時間顯示格式。
 * @param {string} isoString - ISO 格式的日期時間字串 (e.g., "2023-10-27T02:30:00.000Z")。
 * @returns {string} 格式化後的日期時間字串 (e.g., "10-27 (五) 10:30")。
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


// --- 📋 快速選單定義 ---
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '課程名單', text: '@課程名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' }, // 提示指令格式
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// --- 📌 暫存狀態物件 (用於多步驟對話流程) ---
const pendingTeacherLogin = {};        // 儲存等待老師密碼輸入的用戶 ID
const pendingCourseCreation = {};      // 儲存新增課程流程的狀態和資料
const pendingCourseCancelConfirm = {}; // 儲存等待課程取消確認的用戶 ID 和課程 ID

// --- 🎯 主事件處理函式 (處理所有 LINE 傳入的訊息和事件) ---
async function handleEvent(event) {
  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE)); // 每次處理前都清理一次課程

  const userId = event.source.userId;

  // 如果是新用戶，則在資料庫中建立其條目
  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
    console.log(`ℹ️ 新用戶加入: ${userId}`);
  }

  // 嘗試獲取用戶的顯示名稱 (用於紀錄和顯示)
  try {
    const profile = await client.getProfile(userId);
    // 更新用戶名稱，如果已有名稱則保留，避免覆蓋手動設定的名稱 (除非是匿名)
    if (!db[userId].name || db[userId].name === '匿名使用者') {
      db[userId].name = profile.displayName || '匿名使用者';
    }
  } catch (e) {
    console.error('❌ 取得用戶資料失敗:', e.message);
    // 即使失敗也應繼續，使用已有的或預設名稱
    if (!db[userId].name) {
      db[userId].name = '匿名使用者';
    }
  }
  writeJSON(DATA_FILE, db); // 更新用戶資料到檔案

  // 處理 Postback 事件 (例如來自快速選單或按鈕的資料回傳)
  // Postback 事件通常用於內部邏輯處理，不直接顯示給用戶
  if (event.type === 'postback' && event.postback.data.startsWith('cancel_course_')) {
    const courseId = event.postback.data.replace('cancel_course_', '');

    // 檢查用戶是否為老師身份才能執行取消
    if (db[userId].role !== 'teacher') {
        return replyText(event.replyToken, '您沒有權限執行此操作。');
    }

    if (!courses[courseId]) {
      return replyText(event.replyToken, '找不到該課程，可能已被取消或過期。', teacherMenu);
    }
    if (new Date(courses[courseId].time) < new Date()) {
        return replyText(event.replyToken, '該課程已過期，無法取消。', teacherMenu);
    }

    // 進入取消課程確認流程
    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(
      event.replyToken,
      `⚠️ 確認要取消課程「**${courses[courseId].title}**」嗎？\n一旦取消將退還所有學生點數。`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]
    );
  }

  // 只處理文字訊息事件
  if (event.type !== 'message' || !event.message.text) return;

  const text = event.message.text.trim(); // 獲取用戶發送的訊息文字

  // --- 🔹 多步驟新增課程流程處理 ---
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];
    const replyToken = event.replyToken;

    switch (stepData.step) {
      case 1: // 接收課程名稱
        stepData.data.title = text;
        stepData.step = 2;
        return replyText(replyToken, '請選擇課程日期（星期幾）：', [
          { type: 'message', label: '星期一', text: '星期一' },
          { type: 'message', label: '星期二', text: '星期二' },
          { type: 'message', label: '星期三', text: '星期三' },
          { type: 'message', label: '星期四', text: '星期四' },
          { type: 'message', label: '星期五', text: '星期五' },
          { type: 'message', label: '星期六', text: '星期六' },
          { type: 'message', label: '星期日', text: '星期日' },
        ]);

      case 2: // 接收課程星期
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        if (!weekdays.includes(text)) {
          return replyText(replyToken, '請輸入正確的星期（例如：星期一）');
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return replyText(replyToken, '請輸入課程時間（24小時制，如 **14:30**）');

      case 3: // 接收課程時間
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) { // 正則表達式驗證 24 小時制時間格式
          return replyText(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 **14:30**');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return replyText(replyToken, '請輸入人員上限（正整數）');

      case 4: // 接收課程人數上限
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return replyText(replyToken, '人數上限必須是正整數。');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        // 確認訊息
        return replyText(
          replyToken,
          `請確認是否建立課程：\n**課程名稱**：${stepData.data.title}\n**日期**：${stepData.data.weekday}\n**時間**：${stepData.data.time}\n**人數上限**：${stepData.data.capacity}`,
          [
            { type: 'message', label: '✅ 是', text: '確認新增課程' },
            { type: 'message', label: '❌ 否', text: '取消新增課程' },
          ]
        );

      case 5: // 確認新增或取消
        if (text === '確認新增課程') {
          const weekdaysMapping = {
            '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3,
            '星期四': 4, '星期五': 5, '星期六': 6
          };

          const targetWeekdayIndex = weekdaysMapping[stepData.data.weekday]; // 目標是台北的星期幾 (0-6)
          const [targetHour, targetMin] = stepData.data.time.split(':').map(Number); // 目標是台北的小時和分鐘

          // --- 關鍵時區處理邏輯：確保課程時間正確儲存為 UTC ---
          const now = new Date();
          const currentTaipeiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
          const todayWeekdayTaipei = currentTaipeiTime.getDay(); // 取得今天是台北的星期幾 (0=週日, 6=週六)

          let dayDiff = (targetWeekdayIndex - todayWeekdayTaipei + 7) % 7; // 計算相差天數

          // 判斷如果目標是"今天"，但台北時間已過，則順延一週
          if (dayDiff === 0) {
              const currentHourTaipei = currentTaipeiTime.getHours();
              const currentMinuteTaipei = currentTaipeiTime.getMinutes();
              if (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin)) {
                  dayDiff = 7; // 目標時間已過，設定為下週
              }
          }

          // 創建一個基於當前時間的 Date 物件，並調整到目標日期和台北時間
          const courseDateTaipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
          courseDateTaipei.setDate(courseDateTaipei.getDate() + dayDiff);
          courseDateTaipei.setHours(targetHour, targetMin, 0, 0);

          // 將這個台北時間轉換為 UTC 的 ISO 字串儲存
          const isoTime = courseDateTaipei.toISOString();
          // --- 時區處理結束 ---

          // 產生課程 ID (使用時間戳確保唯一性)
          const newId = 'course_' + Date.now();
          const coursesData = readJSON(COURSE_FILE); // 重新讀取，避免舊的快取
          coursesData[newId] = {
            title: stepData.data.title,
            time: isoTime, // 儲存為 ISO UTC 時間
            capacity: stepData.data.capacity,
            students: [], // 初始化預約學生列表
            waiting: [],  // 初始化候補學生列表
          };

          writeJSON(COURSE_FILE, coursesData); // 寫入課程資料
          delete pendingCourseCreation[userId]; // 清除暫存狀態

          // 顯示時，formatDateTime 會自動將 isoTime 轉回正確的台北時間
          return replyText(
            event.replyToken,
            `✅ 課程已新增：**${stepData.data.title}**\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}`,
            teacherMenu
          );

        } else if (text === '取消新增課程') {
          delete pendingCourseCreation[userId];
          return replyText(event.replyToken, '❌ 已取消新增課程。', teacherMenu);
        } else {
          return replyText(replyToken, '請點選「✅ 是」或「❌ 否」確認。');
        }

      default: // 未知的步驟，重置流程
        delete pendingCourseCreation[userId];
        return replyText(replyToken, '流程異常，已重置。', teacherMenu);
    }
  }

  // --- ✅ 課程取消確認流程處理 ---
  if (pendingCourseCancelConfirm[userId]) {
    const courseId = pendingCourseCancelConfirm[userId];
    const replyToken = event.replyToken;

    // 重新讀取課程資料，確保是最新的
    const coursesData = readJSON(COURSE_FILE);
    const course = coursesData[courseId];

    if (text === '✅ 是') {
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return replyText(replyToken, '找不到該課程，取消失敗或已被刪除。', teacherMenu);
      }

      const dbData = readJSON(DATA_FILE); // 重新讀取用戶資料以進行點數退還

      // 退還所有已預約學生的點數並通知
      course.students.forEach(stuId => {
        if (dbData[stuId]) {
          dbData[stuId].points++; // 退還 1 點
          dbData[stuId].history.push({
            id: courseId,
            action: `課程取消退點：${course.title}`,
            time: new Date().toISOString(),
          });
          // 通知學生課程已取消並退點
          pushText(stuId, `⚠️ 您預約的課程「**${course.title}**」（${formatDateTime(course.time)}）已被老師取消，已退還 1 點。請確認您的「我的點數」。`)
            .catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
        }
      });

      // 清理候補名單中的用戶歷史記錄（可選，但保持一致性）
      course.waiting.forEach(waitId => {
        if (dbData[waitId]) {
            dbData[waitId].history.push({
                id: courseId,
                action: `候補課程取消：${course.title}`,
                time: new Date().toISOString(),
            });
            // 通知候補者課程已取消
            pushText(waitId, `⚠️ 您候補的課程「**${course.title}**」（${formatDateTime(course.time)}）已被老師取消。`)
                .catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
        }
      });

      delete coursesData[courseId]; // 從課程列表中移除該課程
      writeJSON(COURSE_FILE, coursesData);
      writeJSON(DATA_FILE, dbData); // 更新用戶資料
      delete pendingCourseCancelConfirm[userId]; // 清除暫存狀態
      return replyText(replyToken, `✅ 課程「**${course.title}**」已取消，所有學生點數已退還。`, teacherMenu);
    }

    if (text === '❌ 否') {
      delete pendingCourseCancelConfirm[userId]; // 清除暫存狀態
      return replyText(replyToken, '取消課程操作已中止。', teacherMenu);
    }

    // 提示用戶選擇
    return replyText(replyToken, '請選擇是否取消課程：', [
      { type: 'message', label: '✅ 是', text: '✅ 是' },
      { type: 'message', label: '❌ 否', text: '❌ 否' },
    ]);
  }

  // --- 🔁 身份切換指令處理 ---
  if (text === '@切換身份') {
    if (db[userId].role === 'teacher') {
      db[userId].role = 'student'; // 老師切換為學員
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '已切換為學員身份。', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true; // 進入老師登入流程
      return replyText(event.replyToken, '請輸入老師密碼登入。');
    }
  }

  // --- 🔐 老師登入密碼驗證 ---
  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher'; // 驗證成功，設定為老師角色
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId]; // 清除暫存狀態
      return replyText(event.replyToken, '老師登入成功。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId]; // 清除暫存狀態
      return replyText(event.replyToken, '密碼錯誤，登入失敗。', studentMenu);
    }
  }

  // --- 🔀 根據用戶身份導向不同的指令處理函式 ---
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
  }
}

// ====================== 👩‍🎓 學員功能處理 ===========================
async function handleStudentCommands(event, user, db, courses) {
  const msg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // --- 📅 預約課程功能 ---
  if (msg === '@預約課程' || msg === '@預約') {
    // 篩選未來的課程，並按時間排序
    const upcoming = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date())
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程。', studentMenu);
    }

    // 構建課程列表的快速回覆項目
    const quickReplyItems = upcoming.map(([id, c]) => {
      // 構建按鈕的顯示文字，確保日期時間優先顯示，然後是課程名稱，並截斷到 20 字
      const labelText = `${formatDateTime(c.time)} ${c.title}`;
      return {
        type: 'action',
        action: {
          type: 'message',
          label: labelText.slice(0, 20), // 限制 label 長度 (LINE 最多 20 字)
          text: `我要預約 ${id}`, // 實際發送的指令，包含課程 ID
        },
      };
    });

    // 在回覆中增加一個引導語
    const introText = '以下是目前可以預約的課程，點擊即可預約並扣除 1 點。';

    // 使用 client.replyMessage 發送包含文字和 QuickReply 的訊息
    return client.replyMessage(replyToken, {
      type: 'text',
      text: introText,
      quickReply: {
        items: quickReplyItems,
      },
    });
  }

  // --- ✅ 執行預約課程 (接收來自選單的 `我要預約 [ID]` 指令) ---
  if (msg.startsWith('我要預約 ')) {
    const courseId = msg.replace('我要預約 ', '').trim();
    const course = courses[courseId];

    if (!course) {
      return replyText(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    }

    if (new Date(course.time) < new Date()) {
      return replyText(replyToken, '該課程已過期，無法預約。', studentMenu);
    }

    // 再次確保 students 和 waiting 陣列存在
    if (!Array.isArray(course.students)) course.students = [];
    if (!Array.isArray(course.waiting)) course.waiting = [];

    if (course.students.includes(userId)) {
      return replyText(replyToken, '你已經預約此課程了。', studentMenu);
    }

    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    }

    if (user.points <= 0) {
      return replyText(replyToken, '你的點數不足，請先購買點數。', studentMenu);
    }

    if (course.students.length < course.capacity) {
      // 課程有空位，直接預約
      course.students.push(userId);
      user.points--; // 扣除點數
      user.history.push({ id: courseId, action: `預約成功：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, `✅ 已成功預約課程：「**${course.title}**」。`, studentMenu);
    } else {
      // 課程額滿，加入候補名單
      course.waiting.push(userId);
      user.history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() }); // 記錄操作歷史
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db); // 雖然候補不扣點，但也更新 db 確保 history 寫入
      return replyText(replyToken, `該課程「**${course.title}**」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣點。`, studentMenu);
    }
  }

  // --- 📖 我的課程功能 ---
  if (msg === '@我的課程') {
    const now = Date.now();
    // 篩選學生已預約且尚未過期的課程
    const enrolledCourses = Object.entries(courses)
      .filter(([, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    // 篩選學生候補中且尚未過期的課程
    const waitingCourses = Object.entries(courses)
      .filter(([, c]) => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    let replyMessage = '';

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return replyText(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
    }

    if (enrolledCourses.length > 0) {
      replyMessage += '✅ **你已預約的課程：**\n';
      enrolledCourses.forEach(([, c]) => {
        replyMessage += `・**${c.title}** - ${formatDateTime(c.time)}\n`;
      });
      replyMessage += '\n'; // 預約課程和候補課程之間留一個空行
    }

    if (waitingCourses.length > 0) {
      replyMessage += '⏳ **你候補中的課程：**\n';
      waitingCourses.forEach(([, c]) => {
        const waitingIndex = c.waiting.indexOf(userId) + 1; // 候補順位 (從 1 開始)
        replyMessage += `・**${c.title}** - ${formatDateTime(c.time)} (目前候補第 **${waitingIndex}** 位)\n`;
      });
    }

    return replyText(replyToken, replyMessage.trim(), studentMenu);
  }

  // --- ❌ 取消已預約課程（含自動候補轉正） ---
  if (msg === '@取消預約') {
    // 只列出未來的、已預約的課程
    const enrolled = Object.entries(courses).filter(([id, c]) =>
      c.students.includes(userId) && new Date(c.time) > new Date()
    ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (enrolled.length === 0) {
      return replyText(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
    }

    return replyText(replyToken, '請選擇要取消的預約課程：', enrolled.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消 ${id}`, // 回傳指令包含課程 ID
      },
    })));
  }

  // --- 執行取消預約 (由快速選單觸發) ---
  if (msg.startsWith('我要取消 ')) {
    const id = msg.replace('我要取消 ', '').trim();
    const course = courses[id];
    if (!course || !course.students.includes(userId)) {
      return replyText(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    // 檢查課程是否已過期
    if (new Date(course.time) < new Date()) {
      return replyText(replyToken, '該課程已過期，無法取消。', studentMenu);
    }

    // 從課程中移除學生
    course.students = course.students.filter(sid => sid !== userId);
    user.points++; // 退還點數
    user.history.push({ id, action: `取消預約退點：${course.title}`, time: new Date().toISOString() });

    let replyMessage = `✅ 課程「**${course.title}**」已取消，已退還 1 點。`;

    // 🔁 嘗試從候補名單補上 (如果有人取消預約，則嘗試將候補者轉正)
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting.shift(); // 移除第一個候補者
      if (db[nextWaitingUserId] && db[nextWaitingUserId].points > 0) {
        course.students.push(nextWaitingUserId); // 候補者轉正
        db[nextWaitingUserId].points--; // 扣除候補者的點數
        db[nextWaitingUserId].history.push({ id, action: `候補補上：${course.title}`, time: new Date().toISOString() }); // 記錄歷史

        // 通知候補者已補上課程
        pushText(nextWaitingUserId,
          `🎉 你已從候補名單補上課程「**${course.title}**」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 1 點。請確認你的「我的課程」。`
        ).catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));

        replyMessage += '\n有候補學生已遞補成功。';
      } else if (db[nextWaitingUserId]) {
        // 如果候補者點數不足
        const studentName = db[nextWaitingUserId].name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 **${studentName}** 點數不足，未能遞補。已從候補名單移除。`;
        console.log(`⚠️ 候補學生 ${studentName} (ID: ${nextWaitingUserId}) 點數不足，未能遞補。`);
        // 可以考慮通知老師此情況
        if (TEACHER_ID) {
          pushText(TEACHER_ID,
            `⚠️ 課程「**${course.title}**」（${formatDateTime(course.time)}）有學生取消，但候補學生 **${studentName}** 點數不足，未能遞補。`
          ).catch(e => console.error('❌ 通知老師失敗', e.message));
        } else {
          console.warn('⚠️ TEACHER_ID 未設定，無法通知老師點數不足的候補情況。');
        }
      }
    } else if (course.waiting.length > 0 && course.students.length >= course.capacity) {
        replyMessage += '\n課程空出一位，但候補名單已滿，或仍需等待候補。';
    }


    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, replyMessage, studentMenu);
  }

  // --- ❌ 取消候補 ---
  if (msg === '@取消候補') {
    // 篩選未來的、已在候補名單中的課程
    const waitingCourses = Object.entries(courses).filter(([, c]) =>
      c.waiting?.includes(userId) && new Date(c.time) > new Date()
    ).sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (waitingCourses.length === 0) {
      return replyText(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
    }

    // 提供選單讓使用者選擇取消哪個候補
    return replyText(replyToken, '請選擇要取消候補的課程：', waitingCourses.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消候補 ${id}`,
      },
    })));
  }

  // --- 執行取消候補 (由快速選單觸發) ---
  if (msg.startsWith('我要取消候補 ')) {
    const id = msg.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    if (!course || !course.waiting?.includes(userId)) {
      return replyText(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time) < new Date()) { // 檢查課程是否已過期
      return replyText(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId); // 從候補名單中移除
    user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db); // 更新用戶歷史
    return replyText(replyToken, `✅ 已取消課程「**${course.title}**」的候補。`, studentMenu);
  }

  // --- 💎 查詢點數 ---
  if (msg === '@點數') {
    return replyText(replyToken, `你目前有 **${user.points}** 點。`, studentMenu);
  }

  // --- 💰 購買點數 ---
  if (msg === '@購點') {
    return replyText(replyToken, `請點擊連結前往購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  // --- 預設回覆，提示用戶使用選單 ---
  return replyText(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}

// ====================== 👨‍🏫 老師功能處理 ===========================
async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // --- 📋 查詢課程名單 ---
  if (msg === '@課程名單') {
    if (Object.keys(courses).length === 0) {
      return replyText(replyToken, '目前沒有任何課程。', teacherMenu);
    }

    let list = '📋 **已建立課程列表：**\n\n';
    // 按照時間排序課程，讓老師更容易查看未來的課程
    const sortedCourses = Object.entries(courses).sort(([, cA], [, cB]) => {
      return new Date(cA.time).getTime() - new Date(cB.time).getTime();
    });

    sortedCourses.forEach(([courseId, c]) => {
      list += `🗓 **${formatDateTime(c.time)}**｜**${c.title}**\n`;
      list += `👥 上限 ${c.capacity}｜✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n`;
      list += `課程 ID: \`${courseId}\`\n\n`; // 顯示課程 ID 方便取消或管理
    });

    return replyText(replyToken, list.trim(), teacherMenu);
  }

  // --- ➕ 新增課程 ---
  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} }; // 初始化新增課程流程狀態
    return replyText(replyToken, '請輸入課程名稱。');
  }

  // --- ❌ 取消課程 (提供選單模式) ---
  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([, c]) => new Date(c.time) > new Date()) // 只列出未來的課程
      .sort(([, cA], [, cB]) => new Date(cA.time).getTime() - new Date(cB.time).getTime()) // 按時間排序
      .map(([id, c]) => ({
        id,
        label: `${formatDateTime(c.time)} ${c.title}`,
      }));

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有可取消的課程。', teacherMenu);
    }

    // 使用 Quick Reply 顯示課程列表供選擇
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲取消的課程：',
      quickReply: {
        items: upcomingCourses.map(c => ({
          type: 'action',
          action: {
            type: 'postback', // 使用 postback 傳回 ID，不直接顯示給用戶
            label: c.label.slice(0, 20), // LINE Quick Reply label 最多 20 字
            data: `cancel_course_${c.id}`, // Postback 資料包含課程 ID
          },
        })),
      },
    });
  }

  // --- 🧾 手動輸入取消課程 ID (備用模式) ---
  if (msg.startsWith('@取消課程 ')) { // 注意指令後有空格
    const parts = msg.split(' ');
    const courseId = parts[1];
    if (!courseId) {
      return replyText(replyToken, '請輸入要取消的課程 ID，例如：`@取消課程 course_123456789`', teacherMenu);
    }
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程 ID，請確認是否已被刪除或已過期。', teacherMenu);
    }
    if (new Date(courses[courseId].time) < new Date()) {
      return replyText(replyToken, '該課程已過期，無法取消。', teacherMenu);
    }

    pendingCourseCancelConfirm[userId] = courseId; // 進入取消課程確認流程
    return replyText(replyToken,
      `⚠️ 確認取消課程「**${courses[courseId].title}**」嗎？`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]);
  }

  // --- ✨ 加點/扣點功能 ---
  if (msg.startsWith('@加點 ') || msg.startsWith('@扣點 ')) {
    const parts = msg.split(' ');
    if (parts.length !== 3) {
      return replyText(replyToken, '指令格式錯誤，請使用：`@加點 [userId] [數量]` 或 `@扣點 [userId] [數量]`', teacherMenu);
    }
    const targetUserId = parts[1];
    const amount = parseInt(parts[2]);

    if (!db[targetUserId]) {
      return replyText(replyToken, `找不到學員 ID: **${targetUserId}**。請確認 ID 是否正確。`, teacherMenu);
    }
    if (isNaN(amount) || amount <= 0) { // 數量必須是正整數
      return replyText(replyToken, '點數數量必須是正整數。', teacherMenu);
    }

    const operation = msg.startsWith('@加點') ? '加點' : '扣點';
    let currentPoints = db[targetUserId].points;
    let newPoints = currentPoints;

    if (operation === '加點') {
      newPoints += amount;
      db[targetUserId].history.push({ action: `老師加點 ${amount} 點`, time: new Date().toISOString(), by: userId });
    } else { // 扣點
      if (currentPoints < amount) {
        return replyText(replyToken, `學員 **${db[targetUserId].name}** 點數不足，無法扣除 **${amount}** 點 (目前 **${currentPoints}** 點)。`, teacherMenu);
      }
      newPoints -= amount;
      db[targetUserId].history.push({ action: `老師扣點 ${amount} 點`, time: new Date().toISOString(), by: userId });
    }
    db[targetUserId].points = newPoints;
    writeJSON(DATA_FILE, db);

    // 通知學員點數變動
    pushText(targetUserId,
      `您的點數已由老師調整：${operation}**${amount}**點。\n目前點數：**${newPoints}**點。`
    ).catch(e => console.error(`❌ 通知學員 ${targetUserId} 點數變動失敗:`, e.message));

    return replyText(replyToken, `✅ 已成功為學員 **${db[targetUserId].name}** ${operation} **${amount}** 點，目前點數：**${newPoints}** 點。`, teacherMenu);
  }

  // --- ✨ 查詢學員功能（改為：若無查詢字串則列出所有學員）---
  if (msg.startsWith('@查學員')) {
    const parts = msg.split(' ');
    const query = parts[1]; // 可以是 userId 或部分名稱

    let foundUsers = [];
    // 如果沒有提供查詢字串 (只有 `@查學員`)，則列出所有學生（非老師角色）
    if (!query) {
      for (const id in db) {
        if (db[id].role === 'student') { // 只列出角色為 'student' 的用戶
          foundUsers.push({ id, ...db[id] });
        }
      }
      // 依姓名排序
      foundUsers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      if (foundUsers.length === 0) {
        return replyText(replyToken, '目前沒有任何已註冊的學員。', teacherMenu);
      }

      let reply = `📋 **所有學員列表** 📋\n\n`;
      foundUsers.forEach(user => {
        reply += `**姓名**：${user.name || '匿名使用者'}\n`;
        reply += `**ID**：\`${user.id.substring(0, 8)}...\`\n`; // 截斷 ID 顯示，保護隱私
        reply += `**點數**：${user.points}\n`;
        reply += `\n`; // 每位學員間隔空行
      });
      return replyText(replyToken, reply.trim(), teacherMenu);

    } else { // 如果有提供查詢字串 (例如 `@查學員 Uxxxx` 或 `@查學員 小明`)，則進行搜尋
      for (const id in db) {
        const user = db[id];
        // 搜尋匹配完整 ID 或名稱中的部分關鍵字
        if (id === query || (user.name && user.name.includes(query))) {
          foundUsers.push({ id, ...user });
        }
      }

      if (foundUsers.length === 0) {
        return replyText(replyToken, `找不到符合「**${query}**」的學員。`, teacherMenu);
      }

      let reply = `找到以下學員：\n\n`;
      foundUsers.forEach(user => {
        reply += `**姓名**：${user.name || '匿名使用者'}\n`;
        reply += `**ID**：\`${user.id}\`\n`; // 搜尋結果顯示完整 ID
        reply += `**點數**：${user.points}\n`;
        reply += `**身份**：${user.role === 'teacher' ? '老師' : '學員'}\n`;
        if (user.history && user.history.length > 0) {
          reply += `**近期操作**：\n`;
          // 顯示最近的 3 筆操作記錄
          user.history.slice(-3).forEach(h => {
            reply += `  - ${h.action} (${formatDateTime(h.time)})\n`;
          });
        }
        reply += '\n'; // 每位學員間隔空行
      });
      return replyText(replyToken, reply.trim(), teacherMenu);
    }
  }

  // --- ✨ 統計報表功能 (簡單版) ---
  if (msg === '@統計報表') {
    let totalPoints = 0;
    let totalStudents = 0;
    let totalTeachers = 0; // 更正變數名稱為複數
    let activeStudents = 0;
    let coursesCount = Object.keys(courses).length;
    let enrolledStudentsCount = 0; // 預約人數
    let waitingStudentsCount = 0; // 候補人數

    // 遍歷所有用戶統計數據
    for (const userId in db) {
      const user = db[userId];
      if (user.role === 'student') {
        totalStudents++;
        totalPoints += user.points;
        if (user.points > 0) {
          activeStudents++; // 點數大於 0 視為活躍學員
        }
      } else if (user.role === 'teacher') {
        totalTeachers++;
      }
    }

    // 遍歷所有課程統計預約和候補人數
    for (const courseId in courses) {
      const course = courses[courseId];
      enrolledStudentsCount += course.students.length;
      waitingStudentsCount += course.waiting.length;
    }


    let report = `📊 **系統統計報表** 📊\n\n`;
    report += `👤 總學員數：**${totalStudents}**\n`;
    report += `👨‍🏫 總老師數：**${totalTeachers}**\n`;
    report += `💎 學員總點數：**${totalPoints}**\n`;
    report += `✨ 活躍學員數（有點數）：**${activeStudents}**\n`;
    report += `📚 課程總數：**${coursesCount}**\n`;
    report += `👥 預約總人次：**${enrolledStudentsCount}**\n`;
    report += `🕒 候補總人次：**${waitingStudentsCount}**\n\n`;

    return replyText(replyToken, report, teacherMenu);
  }

  // --- 預設回覆，提示老師使用選單 ---
  return replyText(replyToken, '指令無效，請使用選單或輸入正確指令。', teacherMenu);
}

// ====================== LINE Webhook 與伺服器啟動 ===========================

// 設定 Webhook 路由，接收來自 LINE 的訊息
app.post('/webhook', line.middleware(config), (req, res) => {
  // 遍歷所有事件並調用 handleEvent 處理
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK')) // 處理成功，返回 200 OK
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.message);
      res.status(500).end(); // 處理失敗，返回 500 Internal Server Error
    });
});

// 🩺 健康檢查路由，用於檢查 Bot 服務是否正常運行
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 🚀 啟動伺服器與 Keep-alive 機制
app.listen(PORT, () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V3.14.0 (優化版)`);

  // 應用程式啟動時執行一次資料備份
  backupData();
  // 設定定時備份任務
  setInterval(backupData, BACKUP_INTERVAL_MS); // 每 24 小時備份一次

  // Keep-alive pinging to prevent dyno sleep on Free Tier hosting (e.g., Heroku, Render)
  // 如果 SELF_URL 環境變數已設定且不是預設值，則啟用 Keep-alive
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    setInterval(() => {
      console.log('⏳ 執行 Keep-alive Ping...');
      fetch(SELF_URL)
        .then(res => console.log(`Keep-alive response: ${res.status}`))
        .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
    }, PING_INTERVAL_MS);
  } else {
    console.warn('⚠️ SELF_URL 未設定或使用預設值，Keep-alive 功能可能無法防止服務休眠。請在 .env 檔案中設定您的部署網址。');
  }
});
