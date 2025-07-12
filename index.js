const express = require('express');
const fs = require('fs');
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const TEACHER_PASSWORD = '9527';

// 初始化資料檔案
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const studentMenu = [
  { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } },
  { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } },
  { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } },
  { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } },
  { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }
];

const teacherMenu = [
  { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } },
  { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 範例課程 7/15 19:00 10' } },
  { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }
];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  const userId = event.source.userId;
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const msg = event.message.text.trim();
  const db = readJSON(DATA_FILE);
  const courses = readJSON(COURSE_FILE);

  if (!db[userId]) {
    db[userId] = { role: null, points: 10, history: [] };
    writeJSON(DATA_FILE, db);
  }

  const user = db[userId];

  // 登入流程
  if (pendingTeacherLogin[userId]) {
    if (/^\d{4}$/.test(msg)) {
      if (msg === TEACHER_PASSWORD) {
        user.role = 'teacher';
        delete pendingTeacherLogin[userId];
        writeJSON(DATA_FILE, db);
        return replyWithMenu(event.replyToken, '✅ 老師模式登入成功。', teacherMenu);
      } else {
        return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次');
      }
    } else {
      return replyText(event.replyToken, '請輸入四位數字密碼：');
    }
  }

  // 身份切換
  if (msg === '@我是學員') {
    user.role = 'student';
    writeJSON(DATA_FILE, db);
    return replyWithMenu(event.replyToken, '✅ 進入學員模式', studentMenu);
  }
  if (msg === '@我是老師') {
    pendingTeacherLogin[userId] = true;
    return replyText(event.replyToken, '請輸入老師密碼（四位數字）：');
  }
  if (msg === '@切換身份') {
    return sendRoleSelection(event.replyToken);
  }

  // 學員功能
  if (user.role === 'student') {
    if (msg === '@課程查詢') {
      const list = Object.entries(courses)
        .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
        .join('\n');
      const reply = list ? `📚 可預約課程：\n${list}` : '目前無課程可查詢。';
      return replyWithMenu(event.replyToken, reply, studentMenu);
    }

    if (msg === '@取消') {
      const bookings = user.history.map(h => h.courseId);
      const list = bookings
        .map(id => `${id}: ${courses[id]?.name || '(已刪除)'}`)
        .join('\n');
      const reply = bookings.length
        ? `🗓️ 您的預約課程：\n${list}\n請輸入「取消 course_XXX」進行取消`
        : '您尚未預約任何課程。';
      return replyWithMenu(event.replyToken, reply, studentMenu);
    }

    if (/^取消 course_/.test(msg)) {
      const courseId = msg.split(' ')[1];
      const course = courses[courseId];
      if (!course) return replyText(event.replyToken, '找不到該課程編號');

      const index = course.students.indexOf(userId);
      if (index !== -1) {
        course.students.splice(index, 1);
        user.points += 1;
        user.history = user.history.filter(h => h.courseId !== courseId);
        if (course.waitlist.length > 0) {
          const next = course.waitlist.shift();
          course.students.push(next);
          db[next].history.push({ courseId, time: new Date().toISOString() });
          db[next].points -= 1;
        }
        writeJSON(DATA_FILE, db);
        writeJSON(COURSE_FILE, courses);
        return replyText(event.replyToken, '✅ 已取消預約並退回 1 點。');
      } else {
        return replyText(event.replyToken, '您尚未預約此課程。');
      }
    }

    if (msg === '@購點') {
      return replyWithMenu(event.replyToken, `📌 購買點數請填表單：
https://yourform.url
💰 每點 NT$100`, studentMenu);
    }

    return replyWithMenu(event.replyToken, `請使用功能選單操作。`, studentMenu);
  }

  // 老師功能（略）

  return replyText(event.replyToken, '請使用選單操作。');
}

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

function replyWithMenu(replyToken, text, menuItems) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    quickReply: { items: menuItems }
  });
}

function sendRoleSelection(replyToken) {
  return replyWithMenu(replyToken, '請選擇您的身份：', [
    { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } },
    { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } }
  ]);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}`);
});
