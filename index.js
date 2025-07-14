// 1. 模組與環境設定
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const FIXED_COURSE_FILE = './fixed_courses.json';
const BACKUP_DIR = './backup';

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || '';

// 確保資料檔存在
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(FIXED_COURSE_FILE)) fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// 2. 工具函式：讀寫JSON、備份、日期格式化、LINE Notify
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
    fs.copyFileSync(FIXED_COURSE_FILE, path.join(BACKUP_DIR, `fixed_courses_backup_${timestamp}.json`));
    console.log(`備份成功：${timestamp}`);
  } catch (err) {
    console.error('備份失敗:', err);
  }
}

function formatDate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  const hh = ('0' + d.getHours()).slice(-2);
  const mi = ('0' + d.getMinutes()).slice(-2);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

async function sendLineNotify(message) {
  if (!LINE_NOTIFY_TOKEN) return;
  try {
    await axios.post('https://notify-api.line.me/api/notify', new URLSearchParams({ message }), {
      headers: {
        Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
  } catch (error) {
    console.error('LINE Notify 發送失敗:', error.message);
  }
}

// 3. 快速選單定義
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '查詢課程', text: '@課程查詢' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '查詢點數', text: '@點數查詢' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '查詢學員', text: '@查學員' },
  { type: 'message', label: '加點', text: '@加點' },
  { type: 'message', label: '扣點', text: '@扣點' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '固定課程管理', text: '@固定課程' },
  { type: 'message', label: '行銷推播', text: '@行銷推播' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 4. 快速回覆產生器
function createQuickReplyMessage(text, menu) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: menu.map(i => ({
        type: 'action',
        action: i,
      })),
    }
  };
}

// 5. 幫助清理過期或不合規課程資料
function cleanCourses(courses) {
  const now = Date.now();
  for (const id in courses) {
    const c = courses[id];
    if (!c.name || !c.date || !c.students || !c.max) {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waitlist)) c.waitlist = [];
    if (new Date(c.date).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}

// 6. Webhook 路由與事件處理
const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end();
  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
  }
});

app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = readJSON(DATA_FILE);
  let courses = cleanCourses(readJSON(COURSE_FILE));
  let fixedCourses = readJSON(FIXED_COURSE_FILE);

  if (!db[userId]) {
    try {
      const profile = await client.getProfile(userId);
      db[userId] = {
        name: profile.displayName || '未命名',
        role: 'student',
        points: 0,
        history: [],
        points_expiry: {},
      };
      writeJSON(DATA_FILE, db);
    } catch (e) {
      console.error('取得用戶資料失敗:', e);
      return replyText(event.replyToken, '⚠️ 無法取得您的資料，請稍後再試');
    }
  }

  const user = db[userId];

  // 身份切換：學員切老師要密碼驗證
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return client.replyMessage(event.replyToken, createQuickReplyMessage('請輸入老師密碼以切換身份', []));
    }
    if (user.role === 'teacher') {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return client.replyMessage(event.replyToken, createQuickReplyMessage('已切換為學員身份', studentMenu));
    }
  }

  // 處於等待老師密碼輸入狀態
  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return client.replyMessage(event.replyToken, createQuickReplyMessage('登入成功，已切換為老師身份', teacherMenu));
    } else {
      delete pendingTeacherLogin[userId];
      return client.replyMessage(event.replyToken, createQuickReplyMessage('密碼錯誤，請重新操作', studentMenu));
    }
  }

  // 根據身份分流指令處理
  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses, fixedCourses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses, fixedCourses);
  } else {
    return client.replyMessage(event.replyToken, createQuickReplyMessage('請選擇身份', [
      { type: 'message', label: '學員', text: '@身份 學員' },
      { type: 'message', label: '老師', text: '@身份 老師' },
    ]));
  }
}

// 7. 學員指令處理範例（點數查詢、預約課程等）
async function handleStudentCommands(event, userId, msg, user, db, courses, fixedCourses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return client.replyMessage(replyToken, createQuickReplyMessage(`您目前剩餘點數為：${user.points} 點。`, studentMenu));
  }

  if (msg === '@預約課程') {
    const allCourses = [
      ...Object.entries(courses).filter(([_, c]) => c.name && c.date),
      ...Object.entries(fixedCourses).map(([id, c]) => {
        // 這邊可加入固定課程計算邏輯(如下一週日期)
        return [id, c];
      }),
    ];

    if (allCourses.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('目前無可預約課程。', studentMenu));
    }

    const quickItems = allCourses.map(([id, c]) => ({
      type: 'message',
      label: `${c.name} (${c.date})`,
      text: `預約 ${id}`
    }));

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲預約的課程：',
      quickReply: { items: quickItems }
    });
  }

  // 更多學員指令，如取消、購點等，依需求實作
  return client.replyMessage(replyToken, createQuickReplyMessage('功能尚未完成，請稍後', studentMenu));
}

// 8. 老師指令處理範例（今日名單、加扣點、固定課程管理）
async function handleTeacherCommands(event, userId, msg, user, db, courses, fixedCourses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    // 這裡實作查詢當日課程與報名名單
    return client.replyMessage(replyToken, createQuickReplyMessage('今日名單功能尚未實作', teacherMenu));
  }

  if (msg === '@固定課程') {
    // 固定課程管理介面可實作（新增/編輯/刪除）
    return client.replyMessage(replyToken, createQuickReplyMessage('固定課程管理功能尚未實作', teacherMenu));
  }

  if (msg === '@行銷推播') {
    // 行銷推播模組，如節氣提醒、活動通知
    return client.replyMessage(replyToken, createQuickReplyMessage('行銷推播功能尚未實作', teacherMenu));
  }

  // 其他老師功能待實作
  return client.replyMessage(replyToken, createQuickReplyMessage('功能尚未完成，請稍後', teacherMenu));
}

// 9. 簡單文字回覆工具
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

// 10. 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 服務啟動，埠號: ${PORT}`);
});
