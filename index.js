const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const TEACHER_PASSWORD = '9527';

// 初始化資料庫檔案 if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); }

function readDB() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

function writeDB(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } } ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } } ];

const pendingTeacherLogin = {}; const pendingCourseCreation = {}; // 儲存老師新增課程的步驟

app.post('/webhook', line.middleware(config), (req, res) => { Promise .all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { const userId = event.source.userId; const today = new Date().toISOString().slice(0, 10);

if (event.type === 'follow') { return sendRoleSelection(event.replyToken); }

if (event.type !== 'message' || event.message.type !== 'text') { return Promise.resolve(null); }

const msg = event.message.text.trim(); let db = readDB(); if (!db[userId]) { db[userId] = { role: null, points: 10, history: [] }; writeDB(db); } const user = db[userId];

// 處理老師密碼登入 if (pendingTeacherLogin[userId]) { if (/^\d{4}$/.test(msg)) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; writeDB(db); delete pendingTeacherLogin[userId]; return replyWithMenu(event.replyToken, '✅ 驗證成功，您已進入老師模式：', teacherMenu); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次（四位數字）'); } } else { return replyText(event.replyToken, '請輸入四位數字密碼：'); } }

// 處理新增課程流程 if (pendingCourseCreation[userId]) { const step = pendingCourseCreation[userId].step; if (step === 'name') { pendingCourseCreation[userId].name = msg; pendingCourseCreation[userId].step = 'time'; return replyText(event.replyToken, '請輸入課程時間（格式：09:00）：'); } else if (step === 'time') { const name = pendingCourseCreation[userId].name; const time = msg; if (!db['課程']) db['課程'] = {}; if (!db['課程'][today]) db['課程'][today] = []; db['課程'][today].push({ id: c${Date.now()}, name, time, students: [] }); writeDB(db); delete pendingCourseCreation[userId]; return replyText(event.replyToken, ✅ 課程「${name}」已於 ${time} 建立成功！); } }

if (!user.role) { if (msg === '@我是學員') { user.role = 'student'; writeDB(db); return replyWithMenu(event.replyToken, '✅ 您已進入學員模式，請選擇功能：', studentMenu); } if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyText(event.replyToken, '請輸入老師密碼（四位數字）：'); } return sendRoleSelection(event.replyToken); }

if (user.role === 'student') { let reply = ''; if (msg === '@預約') reply = '請問您要預約哪一堂課？（功能建置中）'; else if (msg === '@課程查詢') reply = '目前開放的課程如下：（功能建置中）'; else if (msg === '@取消') reply = '請問您要取消哪一堂課？（功能建置中）'; else if (msg === '@點數查詢') reply = 您目前剩餘點數為：${user.points} 點。; else if (msg === '@購點') reply = '請填寫以下表單購點：\nhttps://yourform.url\n💰 每點 NT$100'; else reply = 您輸入的是：「${msg}」。此功能尚在建置中。; return replyWithMenu(event.replyToken, reply, studentMenu); }

if (user.role === 'teacher') { if (msg === '@今日名單') { const courses = db['課程']?.[today] || []; if (courses.length === 0) return replyText(event.replyToken, '今日尚無課程。'); let result = '📋 今日課程名單：\n'; courses.forEach(c => { result += \n🧘‍♀️ ${c.name}（${c.time}）\n學員人數：${c.students.length}; }); return replyText(event.replyToken, result); } if (msg === '@新增課程') { pendingCourseCreation[userId] = { step: 'name' }; return replyText(event.replyToken, '請輸入課程名稱：'); } return replyWithMenu(event.replyToken, 您輸入的是：「${msg}」。此功能尚未建置。, teacherMenu); }

return Promise.resolve(null); }

function replyText(replyToken, text) { return client.replyMessage(replyToken, { type: 'text', text }); }

function replyWithMenu(replyToken, text, menuItems) { return client.replyMessage(replyToken, { type: 'text', text, quickReply: { items: menuItems } }); }

function sendRoleSelection(replyToken) { return replyWithMenu(replyToken, '請選擇您的身份：', [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } } ]); }

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });
