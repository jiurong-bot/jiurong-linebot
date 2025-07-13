// index.js - 九容瑜伽 LINE Bot 主程式 V1（setInterval 定時提醒） // 2025-07-13 更新

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

// 初始化資料檔案 if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 範例課程 7/15 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '加點', text: '@加點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程 course_001' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { const userId = event.source.userId; if (event.type !== 'message' || event.message.type !== 'text') return null;

const msg = event.message.text.trim(); const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE);

if (!db[userId]) { db[userId] = { role: null, points: 10, history: [] }; writeJSON(DATA_FILE, db); } const user = db[userId];

if (pendingTeacherLogin[userId]) { if (/^\d{4}$/.test(msg)) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; delete pendingTeacherLogin[userId]; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 老師模式登入成功。', teacherMenu); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次'); } } else { return replyText(event.replyToken, '請輸入四位數字密碼：'); } }

if (msg === '@我是學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 進入學員模式', studentMenu); } if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyText(event.replyToken, '請輸入老師密碼（四位數字）：'); } if (msg === '@切換身份') { return sendRoleSelection(event.replyToken); }

if (msg.startsWith('@廣播 ')) {
      const broadcast = msg.replace('@廣播 ', '');
      const studentIds = Object.entries(db)
        .filter(([_, u]) => u.role === 'student')
        .map(([id]) => id);

      for (const id of studentIds) {
        client.pushMessage(id, {
          type: 'text',
          text: `📢 系統通知：${broadcast}`,
        }).catch(console.error);
      }
      return replyText(event.replyToken, `✅ 已廣播訊息給 ${studentIds.length} 位學員`);
    }

    return replyWithMenu(event.replyToken, '請使用選單操作或正確指令。', teacherMenu);
  }

  return sendRoleSelection(event.replyToken);
}

// 回覆文字
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
  });
}

// 回覆 + 快速選單
function replyWithMenu(replyToken, text, menuItems) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    quickReply: { items: menuItems },
  });
}

// 身份選擇選單
function sendRoleSelection(replyToken) {
  return replyWithMenu(replyToken, '請選擇您的身份：', [
    {
      type: 'action',
      action: { type: 'message', label: '我是學員', text: '@我是學員' },
    },
    {
      type: 'action',
      action: { type: 'message', label: '我是老師', text: '@我是老師' },
    },
  ]);
}

// ✅ 課程提醒（每 10 分鐘執行一次）
setInterval(() => {
  const db = readJSON(DATA_FILE);
  const courses = readJSON(COURSE_FILE);
  const now = new Date();

  const upcomingCourses = Object.entries(courses).filter(([_, c]) => {
    const courseTime = new Date(c.date);
    const timeDiff = (courseTime - now) / 60000;
    return timeDiff > 0 && timeDiff <= 60; // 60 分鐘內即將開課
  });

  upcomingCourses.forEach(([id, c]) => {
    c.students.forEach(uid => {
      client.pushMessage(uid, {
        type: 'text',
        text: `⏰ 提醒您：課程「${c.name}」將於 ${c.date} 開始，請準時上課！`,
      }).catch(console.error);
    });
  });
}, 10 * 60 * 1000); // 每 10 分鐘檢查一次

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}`);
});

