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
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    courses: {
      "101": { name: "瑜伽初階", cost: 3, capacity: 5, reserved: 0 },
      "102": { name: "瑜伽中階", cost: 5, capacity: 5, reserved: 0 },
      "103": { name: "瑜伽高階", cost: 7, capacity: 3, reserved: 0 }
    }
  }, null, 2));
}

function readDB() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

// 暫存登入狀態及預約流程
const pendingTeacherLogin = {};
const pendingBooking = {}; // userId => true if waiting to pick course for booking

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

  // 初始化用戶資料
  if (!db.users[userId]) {
    db.users[userId] = { role: null, points: 10, bookings: [] };
    writeDB(db);
  }

  const user = db.users[userId];

  // 老師登入流程
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

  // 處理學員預約流程
  if (user.role === 'student') {
    // 若在預約階段，處理課程選擇
    if (pendingBooking[userId]) {
      const courseId = msg;
      const course = db.courses[courseId];
      if (!course) {
        return replyText(event.replyToken, '❌ 無此課程編號，請重新輸入正確的課程編號。');
      }
      if (course.reserved >= course.capacity) {
        delete pendingBooking[userId];
        return replyText(event.replyToken, `抱歉，課程【${course.name}】已額滿，請選擇其他課程。`);
      }
      if (user.points < course.cost) {
        delete pendingBooking[userId];
        return replyText(event.replyToken, `您的點數不足，無法預約【${course.name}】，請先購買點數。`);
      }
      // 扣點、登記預約
      user.points -= course.cost;
      user.bookings.push({ courseId, courseName: course.name, date: new Date().toISOString() });
      course.reserved++;
      writeDB(db);
      delete pendingBooking[userId];
      return replyWithMenu(event.replyToken, `✅ 預約成功！您已預約【${course.name}】，已扣除 ${course.cost} 點。`, studentMenu);
    }

    // 常見指令
    if (msg === '@預約') {
      // 列出課程讓用戶選擇
      let listText = '請輸入欲預約的課程編號：\n';
      for (const [id, c] of Object.entries(db.courses)) {
        listText += `${id} - ${c.name} (需 ${c.cost} 點，剩餘名額 ${c.capacity - c.reserved})\n`;
      }
      pendingBooking[userId] = true;
      return replyText(event.replyToken, listText);
    }

    if (msg === '@課程查詢') {
      let listText = '目前開放的課程如下：\n';
      for (const [id, c] of Object.entries(db.courses)) {
        listText += `${id} - ${c.name} (需 ${c.cost} 點，剩餘名額 ${c.capacity - c.reserved})\n`;
      }
      return replyWithMenu(event.replyToken, listText, studentMenu);
    }

    if (msg === '@點數查詢') {
      return replyWithMenu(event.replyToken, `您目前剩餘點數為：${user.points} 點。`, studentMenu);
    }

    if (msg === '@購點') {
      return replyWithMenu(event.replyToken, '請填寫以下表單購點：\nhttps://yourform.url\n💰 每點 NT$100', studentMenu);
    }

    // 其他指令
    return replyWithMenu(event.replyToken, `您輸入的是：「${msg}」。此功能尚在建置中。`, studentMenu);
  }

  // 老師功能先暫時回覆尚未建置
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

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}`);
});
