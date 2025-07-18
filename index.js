// index.js - 九容瑜伽 LINE Bot 主程式 V3.13
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.SELF_URL || '';

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(config);

// 資料檔案與備份
const DATA_FILE = 'data.json';
const BACKUP_DIR = 'backup';
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// 讀取與儲存資料
let data = loadData();

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { users: {}, courses: {}, broadcasts: [] };
  }
}
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `backup_${timestamp}.json`));
}

// 使用者資料
function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = { points: 0, history: [] };
  }
  return data.users[userId];
}

// 建立課程、刪除課程、自動候補轉正
function removeCourse(courseId) {
  const course = data.courses[courseId];
  if (!course) return;
  // 退還點數
  [...course.students, ...course.waiting].forEach(uid => {
    const user = getUser(uid);
    user.points += 1;
    user.history.push({ type: '退還', course: course.title, time: Date.now() });
  });
  delete data.courses[courseId];
  saveData();
}

function promoteWaitingList(course) {
  while (course.students.length < course.capacity && course.waiting.length > 0) {
    const next = course.waiting.shift();
    course.students.push(next);
    const user = getUser(next);
    user.history.push({ type: '候補轉正', course: course.title, time: Date.now() });

    client.pushMessage(next, {
      type: 'text',
      text: `🎉 你已轉正預約課程：${course.title}`
    });
  }
  saveData();
}

// 廣播功能
function broadcastMessage(text) {
  const userIds = Object.keys(data.users);
  const messages = [{ type: 'text', text }];
  const chunks = [];

  while (userIds.length) {
    chunks.push(userIds.splice(0, 150));
  }
  chunks.forEach(chunk => {
    client.multicast(chunk, messages).catch(err => console.error('廣播失敗:', err));
  });
}

// 預約提醒（每 30 分鐘檢查一次）
setInterval(() => {
  const now = Date.now();
  for (const id in data.courses) {
    const course = data.courses[id];
    const courseTime = new Date(course.time).getTime();
    if (courseTime - now < 3600000 && !course.reminded) {
      const text = `📢 提醒：你預約的課程「${course.title}」即將在 1 小時內開始`;
      course.students.forEach(uid => {
        client.pushMessage(uid, { type: 'text', text });
      });
      course.reminded = true;
    }
  }
  saveData();
}, 30 * 60 * 1000);

// 自我 keep-alive
setInterval(() => {
  if (SELF_URL) {
    fetch(SELF_URL).catch(err => console.log('Keep-alive 失敗:', err));
  }
}, 5 * 60 * 1000);

// Webhook 路由
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then(() => res.end());
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text;
    const userId = event.source.userId;

    if (text === '取消課程') {
      const items = Object.entries(data.courses).map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `${formatDateTime(c.time)} ${c.title}`,
          data: `取消:${id}`
        }
      }));
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '請選擇要取消的課程：',
        quickReply: { items }
      });
    }

    if (text.startsWith('廣播:')) {
      const msg = text.replace('廣播:', '').trim();
      broadcastMessage(`📢 九容公告：${msg}`);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✅ 廣播已發送'
      });
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請輸入功能指令，如：取消課程、廣播:訊息'
    });
  }

  if (event.type === 'postback') {
    const dataStr = event.postback.data;
    const userId = event.source.userId;

    if (dataStr.startsWith('取消:')) {
      const courseId = dataStr.replace('取消:', '');
      const course = data.courses[courseId];
      if (!course) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '找不到課程'
        });
      }
      removeCourse(courseId);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `✅ 課程「${course.title}」已取消，所有學員已退還點數。`
      });
    }
  }
}

// 時間格式化
function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

// 根路由（確認 Render 運行用）
app.get('/', (req, res) => {
  res.send('Jiurong Yoga LINE Bot V3.13 運作中');
});

app.listen(PORT, () => {
  console.log(`伺服器啟動於 http://localhost:${PORT}`);
});
