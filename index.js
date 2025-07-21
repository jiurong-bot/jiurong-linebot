// index.js - v3.13.4（無 dayjs 版本，完整可部署）

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

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 工具函式：讀寫 JSON
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

// 資料備份
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

// 快速回覆訊息
function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = {
      items: menu.map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

// 學員快速選單
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 老師快速選單
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

// 清理過期課程（刪除超過一天的課程）
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

// 格式化課程時間（台北時區，帶星期）
function formatDateTime(dateStr) {
  const taipeiDate = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

  const mmdd = taipeiDate.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-');

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[taipeiDate.getDay()];

  const hhmm = taipeiDate.toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${mmdd}（${weekday}）${hhmm}`;
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

  // 多步驟新增課程
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

          const taipeiTimeStr = targetDate.toISOString().replace('Z', '');

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

      // 退還所有學生點數
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

  // 預約課程
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
      user.history.push({
        courseId: id,
        action: '預約成功扣點',
        time: new Date().toISOString(),
      });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyText(
        event.replyToken,
        `✅ 預約成功：${course.title}\n時間：${formatDateTime(course.time)}\n剩餘點數：${user.points}`,
        studentMenu
      );
    } else {
      // 名額已滿，加入候補
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(
        event.replyToken,
        `⚠️ 課程已額滿，您已加入候補名單，若有名額釋出將會通知您`,
        studentMenu
      );
    }
  }

  // 我的課程查詢
  if (msg === '@我的課程') {
    const now = new Date();
    const booked = [];
    for (const [id, c] of Object.entries(courses)) {
      if (c.students && c.students.includes(userId) && new Date(c.time) > now) {
        booked.push(`- ${c.title} (${formatDateTime(c.time)})`);
      }
    }
    if (booked.length === 0) {
      return replyText(replyToken, '您目前沒有預約中的課程', studentMenu);
    }
    return replyText(replyToken, '您預約的課程：\n' + booked.join('\n'), studentMenu);
  }

  // 點數查詢
  if (msg === '@點數') {
    return replyText(replyToken, `您目前的點數為：${user.points} 點`, studentMenu);
  }

  // 購買點數指引
  if (msg === '@購點' || msg === '@購買點數') {
    return replyText(
      replyToken,
      `請點擊以下連結購買點數（轉帳後請填寫表單）：\n${PURCHASE_FORM_URL}`,
      studentMenu
    );
  }

  // 其他
  return replyText(replyToken, '請使用選單指令操作', studentMenu);
}

// 老師功能處理
async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 課程名單
  if (msg === '@課程名單') {
    const now = new Date();
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > now)
      .map(([id, c]) => {
        return `課程：${c.title}\n時間：${formatDateTime(c.time)}\n已報名：${c.students.length} / ${c.capacity}\n候補：${c.waiting.length}\n課程ID: ${id}`;
      });

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有即將舉行的課程', teacherMenu);
    }
    return replyText(replyToken, upcomingCourses.join('\n\n'), teacherMenu);
  }

  // 新增課程
  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱');
  }

  // 取消課程列表
  if (msg === '@取消課程') {
    const now = new Date();
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > now)
      .map(([id, c]) => ({
        type: 'postback',
        label: `${formatDateTime(c.time)} ${c.title}`,
        data: `cancel_course_${id}`,
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '沒有可取消的課程', teacherMenu);
    }

    // 用快速回覆回傳取消選單
    return replyText(
      replyToken,
      '請選擇欲取消的課程',
      upcoming.map(c => ({
        type: 'message',
        label: c.label,
        text: c.label,
      }))
    );
  }

  // 加點/扣點指令格式: @加點 userId 5 或 @扣點 userId 3
  if (msg.startsWith('@加點') || msg.startsWith('@扣點')) {
    const parts = msg.split(' ');
    if (parts.length !== 3) {
      return replyText(replyToken, '格式錯誤，請輸入「@加點 userId 數量」或「@扣點 userId 數量」', teacherMenu);
    }
    const action = parts[0];
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (isNaN(amount) || amount <= 0) {
      return replyText(replyToken, '數量必須為正整數', teacherMenu);
    }
    if (!db[targetId]) {
      return replyText(replyToken, '找不到指定學員', teacherMenu);
    }
    if (action === '@加點') {
      db[targetId].points += amount;
      db[targetId].history.push({ action: `老師加點 +${amount}`, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, `已為 ${db[targetId].name} 加 ${amount} 點，現有點數 ${db[targetId].points}`, teacherMenu);
    } else if (action === '@扣點') {
      if (db[targetId].points < amount) {
        return replyText(replyToken, `學員點數不足，無法扣除`, teacherMenu);
      }
      db[targetId].points -= amount;
      db[targetId].history.push({ action: `老師扣點 -${amount}`, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, `已為 ${db[targetId].name} 扣除 ${amount} 點，現有點數 ${db[targetId].points}`, teacherMenu);
    }
  }

  // 查詢學員
  if (msg.startsWith('@查學員')) {
    const parts = msg.split(' ');
    if (parts.length !== 2) {
      return replyText(replyToken, '請輸入「@查學員 userId」', teacherMenu);
    }
    const targetId = parts[1];
    if (!db[targetId]) {
      return replyText(replyToken, '找不到該學員資料', teacherMenu);
    }
    const info = db[targetId];
    let historyStr = '';
    if (info.history && info.history.length > 0) {
      historyStr = info.history
        .map(h => `${h.time.slice(0, 10)}：${h.action}`)
        .join('\n');
    } else {
      historyStr = '無歷史紀錄';
    }
    return replyText(
      replyToken,
      `學員名稱：${info.name}\n點數：${info.points}\n歷史紀錄：\n${historyStr}`,
      teacherMenu
    );
  }

  // 統計報表（簡單版，顯示所有學員點數總和）
  if (msg === '@統計報表') {
    const allPoints = Object.values(db).reduce((sum, u) => sum + (u.points || 0), 0);
    const totalUsers = Object.keys(db).length;
    return replyText(
      replyToken,
      `總學員數：${totalUsers}\n所有學員點數合計：${allPoints}`,
      teacherMenu
    );
  }

  // 其他指令，回老師選單
  return replyText(replyToken, '請使用選單指令操作', teacherMenu);
}

// Express 路由
app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 正常運作中');
});

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// Keep-alive 自我 Ping
setInterval(() => {
  if (SELF_URL) {
    require('node:http').get(SELF_URL).on('error', () => {});
  }
}, 1000 * 60 * 5); // 每 5 分鐘 ping 一次

// 定時備份，每天凌晨 3 點
function scheduleBackup() {
  const now = new Date();
  const millisTill3 =
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0) - now;
  const delay = millisTill3 > 0 ? millisTill3 : millisTill3 + 86400000;
  setTimeout(() => {
    backupData();
    setInterval(backupData, 86400000);
  }, delay);
}
scheduleBackup();

// 啟動
app.listen(PORT, () => {
  console.log(`⚡️ 九容瑜伽 LINE Bot 正在執行，埠號：${PORT}`);
});
