// 九容瑜伽 LINE Bot - 完整版 index.js（含主動推播、購點、課前提醒與報表備份）

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); const cron = require('node-cron'); const { v4: uuidv4 } = require('uuid'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };

const client = new line.Client(config); const app = express(); app.use(express.json());

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const PURCHASE_FILE = './purchases.json'; const REPORT_FOLDER = './reports'; const TEACHER_ID = process.env.TEACHER_LINE_ID; const TEACHER_PASSWORD = '9527';

// 初始化資料 if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}'); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}'); if (!fs.existsSync(PURCHASE_FILE)) fs.writeFileSync(PURCHASE_FILE, '[]'); if (!fs.existsSync(REPORT_FOLDER)) fs.mkdirSync(REPORT_FOLDER);

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 課名 7/15 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程 課程ID' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '加減點', text: '@加點 USER_ID 5' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { if (event.type !== 'message' || event.message.type !== 'text') return null; const userId = event.source.userId; const msg = event.message.text.trim(); const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE); const purchases = readJSON(PURCHASE_FILE);

if (!db[userId]) { db[userId] = { role: null, points: 10, history: [], expires: null }; writeJSON(DATA_FILE, db); } const user = db[userId];

if (pendingTeacherLogin[userId]) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; delete pendingTeacherLogin[userId]; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 老師模式登入成功。', teacherMenu); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次'); } }

if (msg === '@我是學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 進入學員模式', studentMenu); } if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyText(event.replyToken, '請輸入老師密碼（四位數字）：'); } if (msg === '@切換身份') { return sendRoleSelection(event.replyToken); }

if (user.role === 'student') { if (msg === '@點數查詢') { return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。, studentMenu); } if (msg === '@購點') { const purchaseId = uuidv4(); purchases.push({ id: purchaseId, userId, time: new Date().toISOString(), status: 'pending' }); writeJSON(PURCHASE_FILE, purchases); return replyWithMenu(event.replyToken, `請完成轉帳並通知老師審核。

轉帳帳號：822-012540278393 匯款後請提供末五碼。

我們將儘快審核，代碼：${purchaseId}, studentMenu); } if (msg === '@我的課程') { const history = user.history.map(h => 📌 ${h.courseId} - ${h.time}`).join('\n') || '目前無紀錄'; return replyWithMenu(event.replyToken, history, studentMenu); } }

if (user.role === 'teacher') { if (msg === '@統計報表') { const date = new Date().toISOString().slice(0, 7); const path = ${REPORT_FOLDER}/report-${date}.json; if (fs.existsSync(path)) { return replyText(event.replyToken, 📊 報表下載：${process.env.BASE_URL}/reports/report-${date}.json); } else { return replyText(event.replyToken, '尚未產生本月報表'); } } }

return replyText(event.replyToken, '請使用功能選單操作。'); }

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text }); }

function replyWithMenu(token, text, items) { return client.replyMessage(token, { type: 'text', text, quickReply: { items } }); }

function sendRoleSelection(token) { return replyWithMenu(token, '請選擇身份：', [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } } ]); }

// 課前兩小時提醒（每 15 分鐘檢查） cron.schedule('*/15 * * * *', () => { const courses = readJSON(COURSE_FILE); const db = readJSON(DATA_FILE); const now = new Date();

for (const [id, course] of Object.entries(courses)) { const courseTime = new Date(course.date); const diff = (courseTime - now) / (1000 * 60); // 分鐘 if (diff > 119 && diff < 121 && !course.notified) { course.notified = true; for (const uid of course.students) { client.pushMessage(uid, { type: 'text', text: ⏰ 您預約的課程「${course.name}」將於 2 小時後開始，請準時到場。 }); } } } writeJSON(COURSE_FILE, courses); });

// 每月報表自動備份 cron.schedule('0 0 1 * *', () => { const db = readJSON(DATA_FILE); const now = new Date(); const report = { generated: now.toISOString(), users: db }; const filename = ${REPORT_FOLDER}/report-${now.toISOString().slice(0, 7)}.json; writeJSON(filename, report); client.pushMessage(TEACHER_ID, { type: 'text', text: 📊 ${now.getMonth()} 月報表已產出，可至以下網址下載：\n${process.env.BASE_URL}/reports/${filename.split('/').pop()} }); });

const port = process.env.PORT || 3000; app.use('/reports', express.static(REPORT_FOLDER)); app.listen(port, () => console.log(✅ LINE Bot 已啟動於 port ${port}));

