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
const TEACHER_PASSWORD = '9527';

// 初始化資料庫檔案
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 課程列表（可自由擴充）
const courses = [
  { id: 'C001', name: '瑜伽初級班', cost: 3 },
  { id: 'C002', name: '瑜伽中級班', cost: 3 },
  { id: 'C003', name: '瑜伽高級班', cost: 3 }
];

// 快速選單
const studentMenu = [
  { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } },
  { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } },
  { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } },
  { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }
];

const teacherMenu = [
  { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } },
  { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程' } },
  { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } },
  { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程' } },
  { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }
];

// 暫存老師登入狀態
const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook error:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  const userId = event.source.userId;

  if (event.type === 'follow') {
    return sendRoleSelection(event.replyToken);
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const msg = event.message.text.trim();
  let db = readDB();

  // 初始化使用者資料
  if (!db[userId]) {
    db[userId] = { role: null, points: 10, history: [] };
    writeDB(db);
  }

  const user = db[userId];

  // 老師登入密碼流程
  if (pendingTeacherLogin[userId]) {
    if (/^\d{4}$/.test(msg)) {
      if (msg === TEACHER_PASSWORD) {
        user.role = 'teacher';
        writeDB(db);
        delete pendingTeacherLogin[userId];
        return replyWithMenu(event.replyToken, '✅ 驗證成功，您已進入老師模式：', teacherMenu);
      } else {
        return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次（四位數字）');
      }
    } else {
      return replyText(event.replyToken, '請輸入四位數字密碼：');
    }
  }

  // 尚未設定身份
  if (!user.role) {
    if (msg === '@我是學員') {
      user.role = 'student';
      writeDB(db);
      return replyWithMenu(event.replyToken, '✅ 您已進入學員模式，請選擇功能：', studentMenu);
    }
    if (msg === '@我是老師') {
      pendingTeacherLogin[userId] = true;
      return replyText(event.replyToken, '請輸入老師密碼（四位數字）：');
    }
    return sendRoleSelection(event.replyToken);
  }

  // 學員功能
  if (user.role === 'student') {
    if (msg === '@預約') {
      let courseList = '目前可預約的課程：\n';
      courses.forEach(c => {
        courseList += `${c.id} - ${c.name} (費用: ${c.cost} 點)\n`;
      });
      courseList += '\n請輸入欲預約的課程編號，例如：C001';
      return replyWithMenu(event.replyToken, courseList, studentMenu);
    }
    // 學員輸入課程編號預約
    else if (courses.some(c => c.id === msg)) {
      const course = courses.find(c => c.id === msg);
      if (user.points >= course.cost) {
        user.points -= course.cost;
        user.history.push({ type: '預約', courseId: course.id, courseName: course.name, date: new Date().toISOString() });
        writeDB(db);
        return replyWithMenu(event.replyToken, `✅ 預約成功！您已預約「${course.name}」，並扣除 ${course.cost} 點。剩餘點數：${user.points} 點。`, studentMenu);
      } else {
        return replyWithMenu(event.replyToken, `❌ 點數不足，預約失敗。您目前剩餘點數：${user.points} 點。`, studentMenu);
      }
    }
    else if (msg === '@點數查詢' || msg === '@點數') {
      return replyWithMenu(event.replyToken, `您目前剩餘點數為：${user.points} 點。`, studentMenu);
    }
    else {
      return replyWithMenu(event.replyToken, `您輸入的是：「${msg}」。此功能尚在建置中。`, studentMenu);
    }
  }

  // 老師功能
  if (user.role === 'teacher') {
    return replyWithMenu(event.replyToken, `您輸入的是：「${msg}」。此功能尚未建置。`, teacherMenu);
  }

  return Promise.resolve(null);
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
