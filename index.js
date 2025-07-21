// index.js - V3.12.2d（修正語法及課程時間時區錯誤）
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const BACKUP_DIR = './backup';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID; // 確保你有設定這個環境變數，用於通知老師

// 初始化資料檔與資料夾
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 🛠️ 工具函式
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch (error) { // 捕獲並記錄錯誤
    console.error(`❌ 讀取 JSON 檔案失敗: ${file}`, error);
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 備份失敗:', err);
  }
}

function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = {
      items: menu.map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

// 📋 快速選單
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
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 📌 暫存狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

// 🧹 清理課程資料（移除過期或無效）
function cleanCourses(courses) {
  const now = Date.now();
  for (const id in courses) {
    const c = courses[id];
    // 檢查基本結構完整性，並初始化 students 和 waiting 陣列
    if (!c || !c.title || !c.time || typeof c.capacity === 'undefined') {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waiting)) c.waiting = [];

    // 過期一天自動刪除（使用 Date 物件比較時，會自動處理時區轉換）
    if (new Date(c.time).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}

// ⏰ 課程時間格式化（轉台北時間並顯示）
function formatDateTime(isoString) {
    if (!isoString) return '無效時間';
    const date = new Date(isoString); // 解析 ISO 字串，這會被視為 UTC 時間點

    const formatter = new Intl.DateTimeFormat('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Taipei' // 指定台北時間，會將解析後的 UTC 時間點轉換為台北時間
    });

    const formattedParts = formatter.formatToParts(date);
    const month = formattedParts.find(p => p.type === 'month').value;
    const day = formattedParts.find(p => p.type === 'day').value;
    const weekday = formattedParts.find(p => p.type === 'weekday').value;
    const hour = formattedParts.find(p => p.type === 'hour').value;
    const minute = formattedParts.find(p => p.type === 'minute').value;

    const displayWeekday = weekday.length > 0 && weekday.startsWith('週') ? weekday.slice(-1) : weekday;

    return `${month}-${day}（${displayWeekday}）${hour}:${minute}`;
}


// 🎯 主事件處理
async function handleEvent(event) {
  if (event.type === 'postback' && event.postback.data.startsWith('cancel_course_')) {
    const courseId = event.postback.data.replace('cancel_course_', '');
    const courses = cleanCourses(readJSON(COURSE_FILE));
    const userId = event.source.userId;

    if (!courses[courseId]) {
      return replyText(event.replyToken, '找不到該課程，可能已被取消', teacherMenu);
    }

    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(
      event.replyToken,
      `⚠️ 確認要取消課程「${courses[courseId].title}」嗎？\n一旦取消將退還所有學生點數。`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]
    );
  }

  if (event.type !== 'message' || !event.message.text) return;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('❌ 取得用戶資料失敗:', e);
  }

  writeJSON(DATA_FILE, db);

  const text = event.message.text.trim();

  // 🔹 多步驟新增課程流程
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];
    const replyToken = event.replyToken;

    switch (stepData.step) {
      case 1:
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

      case 2:
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']; // 星期日為索引 0
        if (!weekdays.includes(text)) {
          return replyText(replyToken, '請輸入正確的星期（例如：星期一）');
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return replyText(replyToken, '請輸入課程時間（24小時制，如 14:30）');

      case 3:
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
          return replyText(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return replyText(replyToken, '請輸入人員上限（正整數）');

      case 4:
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return replyText(replyToken, '數量格式錯誤，請輸入正整數');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        return replyText(
          replyToken,
          `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}`,
          [
            { type: 'message', label: '✅ 是', text: '確認新增課程' },
            { type: 'message', label: '❌ 否', text: '取消新增課程' },
          ]
        );

      case 5:
        if (text === '確認新增課程') {
          const weekdaysMapping = {
            '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3,
            '星期四': 4, '星期五': 5, '星期六': 6
          };

          const targetWeekdayIndex = weekdaysMapping[stepData.data.weekday]; // 目標是台北的星期幾
          const [targetHour, targetMin] = stepData.data.time.split(':').map(Number); // 目標是台北的時間

          // --- 修正後的時區處理邏輯 ---
          // 1. 所有計算都基於 UTC 進行
          const now = new Date();
          const todayWeekdayUTC = now.getUTCDay(); // 取得今天是 UTC 的星期幾

          // 2. 計算台北目標時間對應的 UTC 時間
          // 台北時間 (UTC+8) 比 UTC 快 8 小時，所以 UTC 小時 = 台北小時 - 8
          const targetHourUTC = targetHour - 8;

          // 3. 計算日期差異 (dayDiff)，基準是 UTC 的星期幾
          let dayDiff = (targetWeekdayIndex - todayWeekdayUTC + 7) % 7;

          // 4. 判斷如果目標是"今天"，但時間已過，則順延一週 (用 UTC 時間判斷)
          if (dayDiff === 0) {
            // 取得目前 UTC 的小時和分鐘
            const currentHourUTC = now.getUTCHours();
            const currentMinuteUTC = now.getUTCMinutes();
            if (currentHourUTC > targetHourUTC || (currentHourUTC === targetHourUTC && currentMinuteUTC >= targetMin)) {
              dayDiff = 7; // 目標時間已過，設定為下週
            }
          }
          
          // 5. 建立一個新的 Date 物件，並設定正確的 UTC 日期與時間
          const courseDate = new Date();
          courseDate.setUTCDate(courseDate.getUTCDate() + dayDiff);
          courseDate.setUTCHours(targetHourUTC, targetMin, 0, 0);

          // 6. 將這個正確的 UTC 時間點轉換為 ISO 字串儲存
          const isoTime = courseDate.toISOString();
          // --- 修正結束 ---

          // 產生課程 ID 及存檔
          const newId = 'course_' + Date.now();
          const courses = readJSON(COURSE_FILE);
          courses[newId] = {
            title: stepData.data.title,
            time: isoTime, // 儲存為 ISO UTC 時間
            capacity: stepData.data.capacity,
            students: [],
            waiting: [],
          };

          writeJSON(COURSE_FILE, courses);
          delete pendingCourseCreation[userId];

          // 顯示時，formatDateTime 會自動將 isoTime 轉回正確的台北時間
          return replyText(
            event.replyToken,
            `✅ 課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}`,
            teacherMenu
          );

        } else if (text === '取消新增課程') {
          delete pendingCourseCreation[userId];
          return replyText(event.replyToken, '❌ 已取消新增課程', teacherMenu);
        } else {
          return replyText(replyToken, '請點選「是」或「否」確認');
        }

      default:
        delete pendingCourseCreation[userId];
        return replyText(replyToken, '流程異常，已重置', teacherMenu);
    }
  }

  // ✅ 課程取消確認流程
  if (pendingCourseCancelConfirm[userId]) {
    const courseId = pendingCourseCancelConfirm[userId];
    const replyToken = event.replyToken;

    if (text === '✅ 是') {
      const db = readJSON(DATA_FILE);
      const courses = readJSON(COURSE_FILE);
      const course = courses[courseId];
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return replyText(replyToken, '找不到該課程，取消失敗', teacherMenu);
      }

      // 退還已預約學生的點數
      course.students.forEach(stuId => {
        if (db[stuId]) {
          db[stuId].points++;
          db[stuId].history.push({
            id: courseId,
            action: '課程取消退點',
            time: new Date().toISOString(),
          });
          // 通知學生課程已取消並退點
          client.pushMessage(stuId, {
            type: 'text',
            text: `⚠️ 您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，已退還 1 點。`
          }).catch(e => console.error(`通知學生 ${stuId} 失敗:`, e));
        }
      });

      delete courses[courseId];
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, `✅ 課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);
    }

    if (text === '❌ 否') {
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, '取消課程操作已中止', teacherMenu);
    }

    return replyText(replyToken, '請選擇是否取消課程：', [
      { type: 'message', label: '✅ 是', text: '✅ 是' },
      { type: 'message', label: '❌ 否', text: '❌ 否' },
    ]);
  }

  // 🔁 身份切換（老師登入 / 學員）
  if (text === '@切換身份') {
    if (db[userId].role === 'teacher') {
      db[userId].role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '已切換為學員身份', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true;
      return replyText(event.replyToken, '請輸入老師密碼登入');
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '老師登入成功', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '密碼錯誤，登入失敗', studentMenu);
    }
  }

  // 🔀 根據身份導向
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

  // 📅 預約課程流程
  if (msg === '@預約課程' || msg === '@預約') {
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date()) // 篩選未來的課程
      .sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)) // 按時間排序
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20), // 限制 label 長度
          text: `我要預約 ${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }

    return replyText(replyToken, '請選擇課程：', upcoming);
  }

  // ✅ 預約指定課程
  if (msg.startsWith('我要預約')) {
    const id = msg.replace('我要預約', '').trim();
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在', studentMenu);

    if (new Date(course.time) < new Date()) { // 檢查課程是否已過期
        return replyText(replyToken, '該課程已過期，無法預約', studentMenu);
    }

    if (!course.students) course.students = [];
    if (!course.waiting) course.waiting = [];

    if (course.students.includes(userId)) {
      return replyText(replyToken, '你已經預約此課程', studentMenu);
    }

    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '你已在候補名單中，請耐心等待', studentMenu);
    }

    if (user.points <= 0) {
      return replyText(replyToken, '點數不足，請先購買點數', studentMenu);
    }

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      user.points--;
      user.history.push({ id, action: '預約', time: new Date().toISOString() });
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '✅ 已成功預約', studentMenu);
    } else {
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '課程額滿，已加入候補名單', studentMenu);
    }
  }

  // ❌ 取消已預約課程（含自動候補轉正）
  if (msg === '@取消預約') {
    // 只列出未來的已預約課程
    const enrolled = Object.entries(courses).filter(([id, c]) =>
      c.students.includes(userId) && new Date(c.time) > new Date()
    ).sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)); // 按時間排序
    if (enrolled.length === 0) {
      return replyText(replyToken, '你目前沒有可取消的預約課程', studentMenu);
    }

    return replyText(replyToken, '請選擇要取消的課程：', enrolled.map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20), // 限制 label 長度
        text: `我要取消 ${id}`,
      },
    })));
  }

  if (msg.startsWith('我要取消')) {
    const id = msg.replace('我要取消', '').trim();
    const course = courses[id];
    if (!course || !course.students.includes(userId)) {
      return replyText(replyToken, '你沒有預約此課程，無法取消', studentMenu);
    }
    // 檢查課程是否已過期
    if (new Date(course.time) < new Date()) {
      return replyText(replyToken, '該課程已過期，無法取消', studentMenu);
    }

    // 從課程中移除學生
    course.students = course.students.filter(sid => sid !== userId);
    user.points++; // 退還點數
    user.history.push({ id, action: '取消預約退點', time: new Date().toISOString() });

    let replyMessage = `✅ 課程「${course.title}」已取消，已退還 1 點`;

    // 🔁 嘗試從候補名單補上
    if (course.waiting.length > 0) {
      const nextUserId = course.waiting.shift(); // 移除第一個候補者
      if (db[nextUserId] && db[nextUserId].points > 0) {
        course.students.push(nextUserId);
        db[nextUserId].points--;
        db[nextUserId].history.push({ id, action: '候補補上', time: new Date().toISOString() });

        // 通知候補者
        client.pushMessage(nextUserId, {
          type: 'text',
          text: `🎉 你已從候補名單補上課程「${course.title}」\n上課時間：${formatDateTime(course.time)}\n系統已自動扣 1 點。請確認你的「我的課程」。`
        }).catch(e => console.error(`通知候補者 ${nextUserId} 失敗:`, e));

        replyMessage += '\n候補學生已遞補。';
      } else if (db[nextUserId]) {
          // 如果候補者點數不足，發通知給老師，並將該候補者從名單中移除
          replyMessage += `\n候補學生 ${db[nextUserId].name} (ID: ${nextUserId.substring(0, 4)}...) 點數不足，未能遞補。已從候補名單移除。`;
          // 可以考慮通知老師
          if (TEACHER_ID) {
            client.pushMessage(TEACHER_ID, {
                type: 'text',
                text: `⚠️ 課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${db[nextUserId].name} (ID: ${nextUserId.substring(0, 4)}...) 點數不足，未能遞補。`
            }).catch(e => console.error('通知老師失敗', e));
          } else {
              console.warn('⚠️ TEACHER_ID 未設定，無法通知老師。');
          }
      }
    }

    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, replyMessage, studentMenu);
  }

  // ❌ 取消候補
  if (msg === '@取消候補') {
    const waitingCourses = Object.entries(courses).filter(([id, c]) =>
        c.waiting?.includes(userId) && new Date(c.time) > new Date() // 篩選未來的候補課程
    ).sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)); // 按時間排序
    if (waitingCourses.length === 0) {
        return replyText(replyToken, '你目前沒有可取消的候補課程', studentMenu);
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

  if (msg.startsWith('我要取消候補')) {
    const id = msg.replace('我要取消候補', '').trim();
    const course = courses[id];
    if (!course || !course.waiting?.includes(userId)) {
        return replyText(replyToken, '你沒有候補此課程，無法取消', studentMenu);
    }
    if (new Date(course.time) < new Date()) { // 檢查課程是否已過期
        return replyText(replyToken, '該課程已過期，無法取消候補', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId);
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 已取消課程「${course.title}」的候補`, studentMenu);
  }

  // 📖 查詢我的課程
  if (msg === '@我的課程') {
    const now = Date.now();
    const enrolled = Object.entries(courses).filter(([id, c]) => {
      return c.students.includes(userId) && new Date(c.time).getTime() > now;
    }).sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)); // 按時間排序

    // 取得候補中的課程
    const waitingList = Object.entries(courses).filter(([id, c]) => {
        return c.waiting?.includes(userId) && new Date(c.time).getTime() > now;
    }).sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)); // 按時間排序

    let list = '';
    if (enrolled.length === 0 && waitingList.length === 0) {
      return replyText(replyToken, '你目前沒有預約或候補任何課程', studentMenu);
    }

    if (enrolled.length > 0) {
      list += '✅ 你預約的課程：\n';
      enrolled.forEach(([id, c]) => {
        list += `・${c.title} - ${formatDateTime(c.time)}\n`;
      });
    }

    if (waitingList.length > 0) {
      if (list !== '') list += '\n'; // 如果前面有預約課程，加個換行
      list += '⏳ 你候補中的課程：\n';
      waitingList.forEach(([id, c]) => {
        const waitingIndex = c.waiting.indexOf(userId) + 1; // 候補順位
        list += `・${c.title} - ${formatDateTime(c.time)} (目前候補第 ${waitingIndex} 位)\n`;
      });
    }

    return replyText(replyToken, list.trim(), studentMenu);
  }

  // 💎 查詢點數
  if (msg === '@點數') {
    return replyText(replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  // 💰 購買點數
  if (msg === '@購點') {
    return replyText(replyToken, `請點擊連結購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  return replyText(replyToken, '指令無效，請使用選單', studentMenu);
}

// ====================== 👨‍🏫 老師功能處理 ===========================
async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 📋 查詢課程名單
  if (msg === '@課程名單') {
    if (Object.keys(courses).length === 0) {
      return replyText(replyToken, '目前沒有任何課程', teacherMenu);
    }

    let list = '📋 已建立課程列表：\n\n';
    // 按照時間排序課程，讓老師更容易查看
    const sortedCourses = Object.entries(courses).sort(([idA, cA], [idB, cB]) => {
        return new Date(cA.time).getTime() - new Date(cB.time).getTime();
    });

    sortedCourses.forEach(([id, c]) => {
      // 顯示預約和候補學員的名字 (此處不顯示，僅保留計數)
      // const studentNames = c.students.length > 0
      //   ? c.students.map(sid => db[sid]?.name || `未知學員(${sid.substring(0, 4)}...)`).join(', ')
      //   : '無';
      // const waitingNames = c.waiting.length > 0
      //   ? c.waiting.map(sid => db[sid]?.name || `未知學員(${sid.substring(0, 4)}...)`).join(', ')
      //   : '無';

      // list += `ID: ${id}\n`; // 方便老師手動操作 (已移除)
      list += `🗓 ${formatDateTime(c.time)}｜${c.title}\n`;
      list += `👥 上限 ${c.capacity}｜✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n`;
      // list += `  已預約：${studentNames}\n`; // 已移除
      // list += `  候補中：${waitingNames}\n\n`; // 已移除
      list += `\n`; // 添加空行以分隔不同課程
    });

    return replyText(replyToken, list.trim(), teacherMenu);
  }

  // ➕ 新增課程
  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱');
  }

  // ❌ 取消課程
  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date()) // 只列出未來的課程
      .sort(([, cA], [, cB]) => new Date(cA.time) - new Date(cB.time)) // 按時間排序
      .map(([id, c]) => ({
        id,
        label: `${formatDateTime(c.time)} ${c.title}`,
      }));

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有可取消的課程', teacherMenu);
    }

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲取消的課程：',
      quickReply: {
        items: upcomingCourses.map(c => ({
          type: 'action',
          action: {
            type: 'postback',
            label: c.label.slice(0, 20), // LINE Quick Reply label 最多 20 字
            data: `cancel_course_${c.id}`,
          },
        })),
      },
    });
  }

  // 🧾 手動輸入取消課程 ID
  if (msg.startsWith('取消課程')) {
    const parts = msg.split(' ');
    const courseId = parts[1];
    if (!courseId) {
        return replyText(replyToken, '請輸入要取消的課程 ID，例如：取消課程 course_123456789', teacherMenu);
    }
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程 ID，請確認是否已被刪除', teacherMenu);
    }
    if (new Date(courses[courseId].time) < new Date()) {
        return replyText(replyToken, '該課程已過期，無法取消', teacherMenu);
    }

    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(replyToken,
      `⚠️ 確認取消課程「${courses[courseId].title}」嗎？`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]);
  }

  // ✨ 新增點數/扣點功能骨架
  if (msg.startsWith('@加點') || msg.startsWith('@扣點')) {
      const parts = msg.split(' ');
      if (parts.length !== 3) {
          return replyText(replyToken, '指令格式錯誤，請使用：@加點 [userId] [數量] 或 @扣點 [userId] [數量]', teacherMenu);
      }
      const targetUserId = parts[1];
      const amount = parseInt(parts[2]);

      if (!db[targetUserId]) {
          return replyText(replyToken, `找不到學員 ID: ${targetUserId}`, teacherMenu);
      }
      if (isNaN(amount) || amount === 0) {
          return replyText(replyToken, '點數數量必須是有效的數字（非零）', teacherMenu);
      }

      const operation = msg.startsWith('@加點') ? '加點' : '扣點';
      let currentPoints = db[targetUserId].points;
      let newPoints = currentPoints;

      if (operation === '加點') {
          newPoints += amount;
          db[targetUserId].history.push({ action: `老師加點 ${amount} 點`, time: new Date().toISOString(), by: userId });
      } else { // 扣點
          if (currentPoints < amount) {
              return replyText(replyToken, `學員 ${db[targetUserId].name} 點數不足，無法扣除 ${amount} 點 (目前 ${currentPoints} 點)`, teacherMenu);
          }
          newPoints -= amount;
          db[targetUserId].history.push({ action: `老師扣點 ${amount} 點`, time: new Date().toISOString(), by: userId });
      }
      db[targetUserId].points = newPoints;
      writeJSON(DATA_FILE, db);

      // 通知學員點數變動
      client.pushMessage(targetUserId, {
          type: 'text',
          text: `您的點數已由老師調整：${operation}${amount}點。\n目前點數：${newPoints}點。`
      }).catch(e => console.error(`通知學員 ${targetUserId} 點數變動失敗:`, e));

      return replyText(replyToken, `✅ 已成功為學員 ${db[targetUserId].name} ${operation} ${amount} 點，目前點數：${newPoints} 點`, teacherMenu);
  }

  // ✨ 查詢學員功能骨架
  if (msg.startsWith('@查學員')) {
      const parts = msg.split(' ');
      const query = parts[1]; // 可以是 userId 或部分名稱

      if (!query) {
          return replyText(replyToken, '請輸入要查詢的學員 ID 或部分名稱，例如：@查學員 Uxxxxxxx 或 @查學員 小明', teacherMenu);
      }

      let foundUsers = [];
      for (const id in db) {
          const user = db[id];
          if (id === query || (user.name && user.name.includes(query))) {
              foundUsers.push({ id, ...user });
          }
      }

      if (foundUsers.length === 0) {
          return replyText(replyToken, `找不到符合「${query}」的學員。`, teacherMenu);
      }

      let reply = `找到以下學員：\n\n`;
      foundUsers.forEach(user => {
          reply += `姓名：${user.name}\n`;
          reply += `ID：${user.id}\n`;
          reply += `點數：${user.points}\n`;
          reply += `身份：${user.role === 'teacher' ? '老師' : '學員'}\n`;
          if (user.history && user.history.length > 0) {
              reply += `近期操作：\n`;
              // 顯示最近的3筆操作
              user.history.slice(-3).forEach(h => {
                  reply += `  - ${h.action} (${formatDateTime(h.time)})\n`;
              });
          }
          reply += '\n';
      });

      return replyText(replyToken, reply.trim(), teacherMenu);
  }

  // ✨ 統計報表功能骨架 (簡單版)
  if (msg === '@統計報表') {
    let totalPoints = 0;
    let totalStudents = 0;
    let totalTeacher = 0;
    let activeStudents = 0;
    let coursesCount = Object.keys(courses).length;

    for (const userId in db) {
      const user = db[userId];
      if (user.role === 'student') {
        totalStudents++;
        totalPoints += user.points;
        if (user.points > 0) {
            activeStudents++;
        }
      } else if (user.role === 'teacher') {
          totalTeacher++;
      }
    }

    let report = `📊 **系統統計報表** 📊\n\n`;
    report += `👤 總學員數：${totalStudents}\n`;
    report += `👨‍🏫 總老師數：${totalTeacher}\n`;
    report += `💎 學員總點數：${totalPoints}\n`;
    report += `✨ 活躍學員數（有點數）：${activeStudents}\n`;
    report += `📚 課程總數：${coursesCount}\n\n`;

    // 可以進一步加入課程預約率、候補成功率等統計
    return replyText(replyToken, report, teacherMenu);
  }


  return replyText(replyToken, '指令無效，請使用選單', teacherMenu);
}

// ====================== LINE Webhook 與伺服器啟動 ===========================

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err);
      res.status(500).end();
    });
});

// 🩺 健康檢查
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 🚀 啟動伺服器與 keep-alive
app.listen(PORT, () => {
  console.log(`✅ Server running at port ${PORT}`);
  // 啟動時執行一次備份
  backupData();
  // 定時備份
  setInterval(backupData, 1000 * 60 * 60 * 24); // 每 24 小時備份一次

  // Keep-alive ping to prevent dyno sleep on platforms like Heroku
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      setInterval(() => {
        console.log('⏳ Keep-alive ping...');
        fetch(SELF_URL).catch((err) => console.error('Keep-alive ping 失敗:', err));
      }, 1000 * 60 * 5); // 每 5 分鐘 ping 一次
  } else {
      console.warn('⚠️ SELF_URL 未設定或使用預設值，Keep-alive 功能可能無效。');
  }
});
