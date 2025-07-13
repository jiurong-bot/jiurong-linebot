// index.js const express = require('express'); const line = require('@line/bot-sdk'); const fs = require('fs'); const path = require('path');

const app = express(); app.use(express.json());

// === LINE config === const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, }; const client = new line.Client(config);

// === 檔案路徑 === const DATA_FILE = './data/users.json'; const COURSE_FILE = './data/courses.json'; const PURCHASE_FILE = './data/purchases.json';

// === 讀寫工具（自動建立資料夾與預設資料） === function loadJSON(file, defaultData = {}) { const dir = path.dirname(file); if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); } if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(defaultData, null, 2)); } return JSON.parse(fs.readFileSync(file)); }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function generateId() { return id_${Date.now()}_${Math.floor(Math.random() * 10000)}; }

// === 初始資料 === let db = loadJSON(DATA_FILE, {}); let courses = loadJSON(COURSE_FILE, {}); let purchases = loadJSON(PURCHASE_FILE, []);

// === 快速選單 === function getQuickReplyItems() { return { items: [ { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, ], }; }

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text, quickReply: getQuickReplyItems(), }); }

function replyWithMenu(token, text) { return client.replyMessage(token, [ { type: 'text', text, quickReply: getQuickReplyItems(), }, ]); }

// === 處理訊息 === app.post('/webhook', (req, res) => { Promise.all(req.body.events.map(handleEvent)).then((result) => res.json(result)); });

async function handleEvent(event) { if (event.type !== 'message' || event.message.type !== 'text') return null;

const msg = event.message.text.trim(); const userId = event.source.userId;

if (!db[userId]) { db[userId] = { role: 'student', points: 0, history: [] }; writeJSON(DATA_FILE, db); }

const user = db[userId];

// === 學員功能 === if (user.role === 'student') { if (msg === '@點數查詢') { return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。); }

if (msg === '@課程查詢') { const list = Object.entries(courses) .map(([id, c]) => `${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}`) .join('\n'); return replyWithMenu(event.replyToken, list || '目前無開課紀錄'); } if (msg === '@我的課程') { const my = user.history.map(h => `${h.courseId} - ${h.time}`).join('\n') || '尚無預約紀錄'; return replyWithMenu(event.replyToken, my); } if (msg === '@取消課程') { const enrolled = Object.entries(courses).filter(([, c]) => c.students.includes(userId)); const list = enrolled.map(([id, c]) => `${id}: ${c.name} (${c.date})`).join('\n') || '您尚未預約任何課程'; return replyWithMenu(event.replyToken, list ? `請輸入「取消 課程ID」，例如：取消 course_123\n\n${list}` : list); } if (/^取消 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course || !course.students.includes(userId)) { return replyText(event.replyToken, '您尚未預約此課程'); } course.students = course.students.filter(id => id !== userId); user.points += 1; writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, '✅ 已取消課程並退還點數'); } if (msg === '@預約') { const list = Object.entries(courses) .map(([id, c]) => `${id}: ${c.name} (${c.date})`) .join('\n'); return replyWithMenu(event.replyToken, list ? `📚 可預約課程：\n${list}\n請輸入課程編號進行預約（例如：預約 course_001）` : '目前無可預約課程。'); } if (/^預約 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到該課程編號'); if (course.students.includes(userId)) return replyText(event.replyToken, '您已預約此課程'); if (user.points <= 0) return replyText(event.replyToken, '點數不足'); if (course.students.length < course.max) { course.students.push(userId); user.points -= 1; user.history.push({ courseId, time: new Date().toISOString() }); writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 預約成功，已扣除 1 點'); } return replyText(event.replyToken, '已額滿，無法預約'); } if (msg === '@購點') { const id = generateId(); purchases.push({ id, userId, time: new Date().toISOString(), status: 'pending' }); writeJSON(PURCHASE_FILE, purchases); return replyWithMenu(event.replyToken, `請完成轉帳並通知老師審核。\n\n訂單編號：${id}`); } 

}

return replyText(event.replyToken, '請使用選單操作'); }

// === 啟動伺服器 === const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });

