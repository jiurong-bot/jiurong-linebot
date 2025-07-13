// 九容瑜伽 LINE Bot index.js - 修正語法錯誤、可直接部署

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); const { v4: uuidv4 } = require('uuid'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const PURCHASE_FILE = './purchases.json';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(PURCHASE_FILE)) fs.writeFileSync(PURCHASE_FILE, JSON.stringify([], null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, ];

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { const userId = event.source.userId; if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);

const msg = event.message.text.trim(); const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE); const purchases = readJSON(PURCHASE_FILE);

if (!db[userId]) { db[userId] = { role: 'student', points: 5, history: [] }; writeJSON(DATA_FILE, db); }

const user = db[userId];

if (user.role === 'student') { if (msg === '@點數查詢') { return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。, studentMenu); }

if (msg === '@課程查詢') { const list = Object.entries(courses) .map(([id, c]) => `${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}`) .join('\n'); return replyWithMenu(event.replyToken, list || '目前無開課紀錄', studentMenu); } if (msg === '@我的課程') { const my = user.history.map(h => `${h.courseId} - ${h.time}`).join('\n') || '尚無預約紀錄'; return replyWithMenu(event.replyToken, my, studentMenu); } if (msg === '@取消課程') { const enrolled = Object.entries(courses).filter(([, c]) => c.students.includes(userId)); const list = enrolled.map(([id, c]) => `${id}: ${c.name} (${c.date})`).join('\n') || '您尚未預約任何課程'; return replyWithMenu(event.replyToken, list ? `請輸入取消 課程ID，例如：取消 course_123\n\n${list}` : list, studentMenu); } if (/^取消 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course || !course.students.includes(userId)) { return replyText(event.replyToken, '您尚未預約此課程'); } course.students = course.students.filter(id => id !== userId); user.points += 1; writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, '✅ 已取消課程並退還點數', studentMenu); } if (msg === '@預約') { const list = Object.entries(courses).map(([id, c]) => `${id}: ${c.name} (${c.date})`).join('\n'); return replyWithMenu(event.replyToken, list ? `📚 可預約課程：\n${list}\n請輸入課程編號進行預約（例如：預約 course_001）` : '目前無可預約課程。', studentMenu); } if (/^預約 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到該課程編號'); if (course.students.includes(userId)) return replyText(event.replyToken, '您已預約此課程'); if (user.points <= 0) return replyText(event.replyToken, '點數不足'); if (course.students.length < course.max) { course.students.push(userId); user.points -= 1; user.history.push({ courseId, time: new Date().toISOString() }); writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 預約成功，已扣除 1 點'); } return replyText(event.replyToken, '已額滿，無法預約'); } if (msg === '@購點') { const id = uuidv4(); purchases.push({ id, userId, time: new Date().toISOString(), status: 'pending' }); writeJSON(PURCHASE_FILE, purchases); return replyWithMenu(event.replyToken, `請完成轉帳並通知老師審核。\n\n訂單編號：${id}`, studentMenu); } 

}

return replyText(event.replyToken, '請使用選單操作或輸入有效指令。'); }

function replyText(replyToken, text) { return client.replyMessage(replyToken, { type: 'text', text }); }

function replyWithMenu(replyToken, text, menuItems) { return client.replyMessage(replyToken, { type: 'text', text, quickReply: { items: menuItems } }); }

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });
