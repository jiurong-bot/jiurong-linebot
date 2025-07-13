// 九容瑜伽 LINE Bot const line = require('@line/bot-sdk'); const express = require('express'); const fs = require('fs'); const path = require('path');

const CONFIG = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const DATA_FILE = 'data/users.json'; const COURSE_FILE = 'data/courses.json'; const PURCHASE_FILE = 'data/purchases.json'; const REPORT_DIR = 'data/reports';

const client = new line.Client(CONFIG); const app = express(); app.use(express.json());

function loadJSON(file) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {}; } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } function generateId() { return id_${Date.now()}_${Math.floor(Math.random() * 10000)}; }

const db = loadJSON(DATA_FILE); const courses = loadJSON(COURSE_FILE); const purchases = loadJSON(PURCHASE_FILE);

const studentMenu = { type: 'template', altText: '學員主選單', template: { type: 'buttons', title: '學員選單', text: '請選擇功能：', actions: [ { type: 'message', label: '查詢點數', text: '@點數查詢' }, { type: 'message', label: '查詢課程', text: '@課程查詢' }, { type: 'message', label: '我的課程', text: '@我的課程' }, { type: 'message', label: '預約課程', text: '@預約' }, ] } };

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text }); } function replyWithMenu(token, text, menu) { return client.replyMessage(token, [ { type: 'text', text }, menu ]); }

app.post('/webhook', (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { if (event.type !== 'message' || event.message.type !== 'text') return;

const msg = event.message.text.trim(); const userId = event.source.userId; if (!db[userId]) { db[userId] = { role: 'student', points: 0, history: [] }; writeJSON(DATA_FILE, db); } const user = db[userId];

if (user.role === 'student') { if (msg === '@點數查詢') { return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。, studentMenu); } if (msg === '@課程查詢') { const list = Object.entries(courses) .map(([id, c]) => ${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}) .join('\n'); return replyWithMenu(event.replyToken, list || '目前無開課紀錄', studentMenu); } if (msg === '@我的課程') { const my = user.history.map(h => ${h.courseId} - ${h.time}).join('\n') || '尚無預約紀錄'; return replyWithMenu(event.replyToken, my, studentMenu); } if (msg === '@取消課程') { const enrolled = Object.entries(courses).filter(([, c]) => c.students.includes(userId)); const list = enrolled.map(([id, c]) => ${id}: ${c.name} (${c.date})).join('\n') || '您尚未預約任何課程'; return replyWithMenu(event.replyToken, list ? 請輸入取消 課程ID，例如：取消 course_123\n\n${list} : list, studentMenu); } if (/^取消 course/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course || !course.students.includes(userId)) { return replyText(event.replyToken, '您尚未預約此課程'); } course.students = course.students.filter(id => id !== userId); user.points += 1; writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, '✅ 已取消課程並退還點數', studentMenu); } if (msg === '@預約') { const list = Object.entries(courses).map(([id, c]) => ${id}: ${c.name} (${c.date})).join('\n'); return replyWithMenu(event.replyToken, list ? 📚 可預約課程：\n${list}\n請輸入課程編號進行預約（例如：預約 course_001） : '目前無可預約課程。', studentMenu); } if (/^預約 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到該課程編號'); if (course.students.includes(userId)) return replyText(event.replyToken, '您已預約此課程'); if (user.points <= 0) return replyText(event.replyToken, '點數不足'); if (course.students.length < course.max) { course.students.push(userId); user.points -= 1; user.history.push({ courseId, time: new Date().toISOString() }); writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 預約成功，已扣除 1 點'); } return replyText(event.replyToken, '已額滿，無法預約'); } if (msg === '@購點') { const id = generateId(); purchases.push({ id, userId, time: new Date().toISOString(), status: 'pending' }); writeJSON(PURCHASE_FILE, purchases); return replyWithMenu(event.replyToken, 請完成轉帳並通知老師審核。\n\n訂單編號：${id}, studentMenu); } } return replyText(event.replyToken, '指令未辨識'); }

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });
