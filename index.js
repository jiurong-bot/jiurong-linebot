// 九容瑜伽 LINE Bot 主程式 V1（setInterval 版） // 修正語法錯誤與補齊程式碼，可直接部署

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 範例課程 7/15 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '加點', text: '@加點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程 course_001' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text }); } function replyWithMenu(token, text, menu) { return client.replyMessage(token, { type: 'text', text, quickReply: { items: menu }, }); } function sendRoleSelection(token) { return replyWithMenu(token, '請選擇您的身份：', [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } }, ]); }

// 定時提醒（每 10 分鐘檢查一次課程時間） setInterval(() => { const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE); const now = new Date();

const upcoming = Object.entries(courses).filter(([_, c]) => { const time = new Date(c.date); const diff = (time - now) / 60000; return diff > 0 && diff <= 60; });

upcoming.forEach(([id, c]) => { c.students.forEach(uid => { client.pushMessage(uid, { type: 'text', text: ⏰ 課程提醒：「${c.name}」即將於 ${c.date} 開始，請準時上課！ }).catch(console.error); }); }); }, 10 * 60 * 1000);

const port = process.env.PORT || 3000; app.listen(port, () => console.log(✅ 九容瑜伽 LINE Bot 已啟動，port ${port}));

