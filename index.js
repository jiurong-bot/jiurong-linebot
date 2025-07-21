// index.js - V3.13.4a (純原生JS日期函式，無dayjs依賴，可直接部署)
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

// 工具函式
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch {
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

// 快速選單
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

// 暫存狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

// 清理課程資料（移除過期或無效）
function cleanCourses(courses) {
  const now = Date.now();
  for (const id in courses) {
    const c = courses[id];
    if (!c.title || !c.time || !c.students || !c.capacity) {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waiting)) c.waiting = [];
    if (new Date(c.time).getTime() < now - 86400000) {
      delete courses[id]; // 過期一天自動刪除
    }
  }
  return courses;
}

// 課程時間格式化（轉台北時間並顯示）
function formatDateTime(dateStr) {
  try {
    // 轉成台北時區日期物件
    const options = {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const dtf = new Intl.DateTimeFormat('zh-TW', options);
    const parts = dtf.formatToParts(new Date(dateStr));
    // 重新組合字串
    const map = {};
    parts.forEach(({ type, value }) => {
      map[type] = value;
    });
    // 星期顯示為日、一、二、三、四、五、六
    const weekdayMap = { '周日': '日', '周一': '一', '周二': '二', '周三': '三', '周四': '四', '周五': '五', '周六': '六' };
    const weekday = weekdayMap[map.weekday] || map.weekday;

    return `${map.month}-${map.day}（${weekday}）${map.hour}:${map.minute}`;
  } catch {
    return dateStr;
  }
}

// 主事件處理
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
    console.error('取得用戶資料失敗', e);
  }

  writeJSON(DATA_FILE, db);

  const text = event.message.text.trim();

  // 多步驟新增課程流程
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
        const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
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
          const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
          const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
          const todayWeekday = today.getDay();
          const targetWeekday = weekdays.indexOf(stepData.data.weekday);

          let dayDiff = (targetWeekday - todayWeekday + 7) % 7;
          if (dayDiff === 0) dayDiff = 7;

          const targetDate = new Date(today);
          targetDate.setDate(today.getDate() + dayDiff);

          const [hour, min] = stepData.data.time.split(':').map(Number);
          targetDate.setHours(hour, min, 0, 0);

          const taipeiTimeStr = targetDate.toISOString();

          const newId = 'course_' + Date.now();
          const courses = readJSON(COURSE_FILE);
          courses[newId] = {
            title: stepData.data.title,
            time: taipeiTimeStr,
            capacity: stepData.data.capacity,
            students: [],
            waiting: [],
          };

          writeJSON(COURSE_FILE, courses);
          delete pendingCourseCreation[userId];

          return replyText(
            event.replyToken,
            `✅ 課程已新增：${stepData.data.title}\n時間：${formatDateTime(taipeiTimeStr)}\n人數上限：${stepData.data.capacity}`,
            teacherMenu
          );
        } else if (text === '取消新增課程') {
          delete pendingCourseCreation[userId];
          return replyText(event.replyToken, '❌ 已取消新增課程', teacherMenu);
        } else {
          return replyText(event.replyToken, '請點選「是」或「否」確認');
        }

      default:
        delete pendingCourseCreation[userId];
        return replyText(event.replyToken, '流程異常，已重置', teacherMenu);
    }
  }

  // 課程取消確認流程
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

      course.students.forEach(stuId => {
        if (db[stuId]) {
          db[stuId].points++;
          db[stuId].history.push({
            id: courseId,
            action: '課程取消退點',
            time: new Date().toISOString(),
          });
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

  // 身份切換（老師登入 / 學員）
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

// 根據身份導向
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
  }
}

// 學員功能處理
async function handleStudentCommands(event, user, db, courses) {
  const msg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // 預約課程流程
  if (msg === '@預約課程' || msg === '@預約') {
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${formatDateTime(c.time)} ${c.title}`,
          text: `我要預約 ${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }

    return replyText(replyToken, '請選擇課程：', upcoming);
  }

  // 預約指定課程
  if (msg.startsWith('我要預約')) {
    const id = msg.replace('我要預約', '').trim();
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在', studentMenu);

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

  // 取消已預約課程
// ====== 自動提醒功能（不使用 dayjs）======
function getDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTimeString(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getDateString(tomorrow);
}

function autoNotifyTomorrowCourses() {
  const data = readData();
  const targetDate = getTomorrowDateString();
  const targetCourses = data.courses.filter(c => c.date === targetDate);
  if (targetCourses.length === 0) return;

  targetCourses.forEach(course => {
    const msg = `📌 明日課程提醒：\n課程名稱：${course.title}\n時間：${course.time}\n地點：${course.location}`;
    (course.students || []).forEach(userId => {
      if (userId && userId.startsWith('U')) {
        pushText(userId, msg);
      }
    });
  });
}

// 每 30 分鐘檢查一次是否有明日課程要提醒
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 20 && now.getMinutes() < 30) {
    autoNotifyTomorrowCourses();
  }
}, 1000 * 60 * 30); // 每 30 分鐘

// ====== Server 啟動與 keep-alive ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(() => {
  if (SELF_URL) {
    fetch(SELF_URL).catch(() => {});
  }
}, 1000 * 60 * 5); // 每 5 分鐘 keep-alive
