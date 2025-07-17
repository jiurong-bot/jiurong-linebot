// index.js - V3.13.1（整合課程取消、退點、候補轉正、廣播與提醒功能）
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
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '8888';
const ADMIN_USER_IDS = ['你的LINE_USER_ID']; // 管理者推播用

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
  fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
  if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
  return {
    users: JSON.parse(fs.readFileSync(DATA_FILE)),
    courses: JSON.parse(fs.readFileSync(COURSE_FILE))
  };
}

function saveData(users, courses) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(COURSE_FILE, JSON.stringify(courses, null, 2));
}

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
app.use(express.json());

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運行中'));

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then(() => res.end());
});

function replyToken(event, msg) {
  return client.replyMessage(event.replyToken, { type: 'text', text: msg });
}

// 格式化台北時間 ISO 字串
function formatToTaipeiISO(date) {
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:00`;
}

// 格式化顯示課程時間（mm-dd 星期 hh:mm）
function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const mmdd = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[date.getDay()];
  const hhmm = date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
  return `${mmdd}（${weekday}）${hhmm}`;
}

// 清理過期或無效課程
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
      delete courses[id]; // 過期一天刪除
    }
  }
  return courses;
}

const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' }
];

const teacherMenu = [
  { type: 'message', label: '課程名單', text: '@課程名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' }
];

// 暫存狀態物件
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

async function handleEvent(event) {
  if (event.type !== 'message' || !event.message.text) return;

  const { users, courses } = loadData();
  cleanCourses(courses);

  const userId = event.source.userId;
  if (!users[userId]) {
    users[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  // 老師身份自動判定（預設在 TEACHER_PASSWORD 驗證成功後設定）
  if (users[userId].role !== 'teacher' && pendingTeacherLogin[userId] !== true) {
    // 可在此判斷特定條件自動切換老師身份（留空或後續擴充）
  }

  // 取得使用者名稱
  try {
    const profile = await client.getProfile(userId);
    users[userId].name = profile.displayName || users[userId].name || '匿名';
  } catch {}

  const text = event.message.text.trim();

  // 處理多步驟新增課程流程（略，將於下一段提供）

  // 課程取消確認（略，將於下一段提供）

  // 身份切換邏輯
  if (text === '@切換身份') {
    if (users[userId].role === 'teacher') {
      users[userId].role = 'student';
      saveData(users, courses);
      return replyToken(event, '已切換為學員身份，請使用選單。');
    } else {
      pendingTeacherLogin[userId] = true;
      return replyToken(event, '請輸入老師密碼登入');
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      users[userId].role = 'teacher';
      saveData(users, courses);
      delete pendingTeacherLogin[userId];
      return replyToken(event, '老師登入成功，請使用選單。');
    } else {
      delete pendingTeacherLogin[userId];
      return replyToken(event, '密碼錯誤，登入失敗');
    }
  }

  // 根據身份路由處理
  if (users[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, users, courses);
  } else {
    return handleStudentCommands(event, userId, users, courses);
  }
}

async function handleCourseCreation(event, userId, users, courses) {
  const stepData = pendingCourseCreation[userId];
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  switch (stepData.step) {
    case 1:
      stepData.data.title = text;
      stepData.step = 2;
      return replyText(replyToken, '請選擇課程日期（星期幾）:', [
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
        const today = new Date();
        const todayWeekday = today.getDay();
        const targetWeekday = weekdays.indexOf(stepData.data.weekday);

        let dayDiff = (targetWeekday - todayWeekday + 7) % 7;
        if (dayDiff === 0) dayDiff = 7; // 下一週同一天

        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + dayDiff);

        const [hour, minute] = stepData.data.time.split(':').map(Number);
        targetDate.setHours(hour, minute, 0, 0);

        const taipeiTimeStr = formatToTaipeiISO(targetDate);
        const newId = 'course_' + Date.now();

        courses[newId] = {
          title: stepData.data.title,
          time: taipeiTimeStr,
          capacity: stepData.data.capacity,
          students: [],
          waiting: []
        };

        writeJSON(COURSE_FILE, courses);
        writeJSON(DATA_FILE, users);
        delete pendingCourseCreation[userId];

        return replyText(replyToken,
          `✅ 課程已新增：${stepData.data.title}\n時間：${formatDateTime(taipeiTimeStr)}\n人數上限：${stepData.data.capacity}`,
          teacherMenu
        );
      } else if (text === '取消新增課程') {
        delete pendingCourseCreation[userId];
        return replyText(replyToken, '❌ 已取消新增課程', teacherMenu);
      } else {
        return replyText(replyToken, '請點選「是」或「否」確認');
      }

    default:
      delete pendingCourseCreation[userId];
      return replyText(replyToken, '流程異常，已重置', teacherMenu);
  }
}

async function handleCourseCancelConfirm(event, userId, users, courses) {
  const replyToken = event.replyToken;
  const courseId = pendingCourseCancelConfirm[userId];
  const text = event.message.text.trim();

  if (text === '✅ 是') {
    const course = courses[courseId];
    if (!course) {
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, '找不到該課程，取消失敗', teacherMenu);
    }

    // 退點給所有已報名學生
    course.students.forEach(stuId => {
      if (users[stuId]) {
        users[stuId].points++;
        users[stuId].history.push({
          id: courseId,
          action: '課程取消退點',
          time: new Date().toISOString()
        });
      }
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, users);
    delete pendingCourseCancelConfirm[userId];

    return replyText(replyToken, `✅ 課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);

  } else if (text === '❌ 否') {
    delete pendingCourseCancelConfirm[userId];
    return replyText(replyToken, '取消課程操作已中止', teacherMenu);
  } else {
    return replyText(replyToken, '請選擇是否取消課程：', [
      { type: 'message', label: '✅ 是', text: '✅ 是' },
      { type: 'message', label: '❌ 否', text: '❌ 否' }
    ]);
  }
}

async function handleStudentCommands(event, userId, users, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;
  const user = users[userId];

  // 預約課程列表
  if (msg === '@預約課程' || msg === '@預約') {
    const upcoming = Object.entries(courses)
      .filter(([_, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${formatDateTime(c.time)} ${c.title}`,
          text: `我要預約 ${id}`
        }
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
      writeJSON(DATA_FILE, users);
      return replyText(replyToken, '✅ 已成功預約', studentMenu);
    } else {
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '課程額滿，已加入候補名單', studentMenu);
    }
  }

  // 取消候補
  if (msg === '@取消候補') {
    let count = 0;
    for (const id in courses) {
      const c = courses[id];
      if (c.waiting?.includes(userId)) {
        c.waiting = c.waiting.filter(x => x !== userId);
        count++;
      }
    }
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 已取消 ${count} 個候補課程`, studentMenu);
  }

  // 查詢我的課程
  if (msg === '@我的課程') {
    const now = Date.now();
    const enrolled = Object.entries(courses).filter(([_, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now);

    if (enrolled.length === 0) {
      return replyText(replyToken, '你目前沒有預約任何課程', studentMenu);
    }

    let list = '你預約的課程：\n';
    enrolled.forEach(([_, c]) => {
      list += `${c.title} - ${formatDateTime(c.time)}\n`;
    });

    return replyText(replyToken, list.trim(), studentMenu);
  }

  // 查詢點數
  if (msg === '@點數') {
    return replyText(replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  // 購買點數連結
  if (msg === '@購點') {
    return replyText(replyToken, `請點擊連結購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  return replyText(replyToken, '指令無效，請使用選單', studentMenu);
}

async function handleTeacherCommands(event, userId, users, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 查詢課程名單
  if (msg === '@課程名單') {
    if (Object.keys(courses).length === 0) {
      return replyText(replyToken, '目前沒有任何課程', teacherMenu);
    }

    let list = '📋 已建立課程列表：\n\n';
    Object.entries(courses).forEach(([id, c]) => {
      list += `🗓 ${formatDateTime(c.time)}｜${c.title}\n`;
      list += `👥 上限 ${c.capacity}｜✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n\n`;
    });

    return replyText(replyToken, list.trim(), teacherMenu);
  }

  // 新增課程
  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱');
  }

  // 取消課程（選擇課程）
  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([_, c]) => new Date(c.time) > new Date())
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
            label: c.label.slice(0, 20),
            data: `cancel_course_${c.id}`,
          },
        })),
      },
    });
  }

  // 手動輸入取消課程 ID
  if (msg.startsWith('取消課程')) {
    const parts = msg.split(' ');
    const courseId = parts[1];
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程 ID，請確認是否已被刪除', teacherMenu);
    }

    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(replyToken,
      `⚠️ 確認取消課程「${courses[courseId].title}」嗎？`,
      [
        { type: 'message', label: '✅ 是', text: '✅ 是' },
        { type: 'message', label: '❌ 否', text: '❌ 否' },
      ]);
  }

  // 未匹配指令回覆
  return replyText(replyToken, '指令無效，請使用選單', teacherMenu);
}

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
    db[userId] = { name: '', points: 0, role: TEACHER_IDS.includes(userId) ? 'teacher' : 'student', history: [] };
  } else {
    // 每次重新判定老師身份
    if (TEACHER_IDS.includes(userId)) {
      db[userId].role = 'teacher';
    }
  }

  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }

  writeJSON(DATA_FILE, db);

  const text = event.message.text.trim();

  // 新增課程多步驟流程
  if (pendingCourseCreation[userId]) {
    return handleCourseCreation(event, userId, db, courses);
  }

  // 課程取消確認流程
  if (pendingCourseCancelConfirm[userId]) {
    return handleCourseCancelConfirm(event, userId, db, courses);
  }

  // 身份切換指令
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

  // 老師登入密碼驗證
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

  // 根據身份呼叫對應指令處理
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, userId, db, courses);
  }
}

const express = require('express');
const fetch = require('node-fetch'); // 如未安裝請執行 npm install node-fetch

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 健康檢查路由
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

// 啟動伺服器並啟用 Keep-alive
app.listen(PORT, () => {
  console.log(`✅ Server running at port ${PORT}`);
  setInterval(() => {
    console.log('⏳ Keep-alive ping...');
    fetch(SELF_URL).catch(() => {});
  }, 1000 * 60 * 5); // 每 5 分鐘 ping 一次
});
