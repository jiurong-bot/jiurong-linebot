require('dotenv').config(); const express = require('express'); const line = require('@line/bot-sdk'); const fs = require('fs'); const path = require('path');

const app = express(); app.use(express.json());

// === LINE config === const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, }; const client = new line.Client(config);

// === 檔案路徑 === const DATA_FILE = './data/users.json'; const COURSE_FILE = './data/courses.json'; const PURCHASE_FILE = './data/purchases.json';

// === 工具函數 === function loadJSON(file, defaultData = {}) { const dir = path.dirname(file); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultData, null, 2)); return JSON.parse(fs.readFileSync(file)); }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function generateId() { return id_${Date.now()}_${Math.floor(Math.random() * 10000)}; }

// === 初始資料 === let db = loadJSON(DATA_FILE, {}); let courses = loadJSON(COURSE_FILE, {}); let purchases = loadJSON(PURCHASE_FILE, []);

// === 快速選單 === function getQuickReplyItems(role = 'student') { const items = [];

if (role === 'student') { items.push( { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '切換為老師', text: '@切換為老師' } } ); } else if (role === 'teacher') { items.push( { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '查學員', text: '@查學員 user_id' } }, { type: 'action', action: { type: 'message', label: '加點', text: '@加點 user_id 1' } }, { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點 user_id 1' } }, { type: 'action', action: { type: 'message', label: '切換為學員', text: '@切換為學員' } } ); }

return { items }; }

function replyText(token, text, role = 'student') { return client.replyMessage(token, { type: 'text', text, quickReply: getQuickReplyItems(role), }); }

function replyWithMenu(token, text, role = 'student') { return client.replyMessage(token, [ { type: 'text', text, quickReply: getQuickReplyItems(role) }, ]); }

// === Webhook 路由 === app.post('/webhook', (req, res) => { if (!req.body.events || !Array.isArray(req.body.events)) return res.status(400).end(); Promise.all(req.body.events.map(handleEvent)).then((result) => res.json(result)); });

// === 主處理函數 === async function handleEvent(event) { if (event.type !== 'message' || event.message.type !== 'text') return null;

const msg = event.message.text.trim(); const userId = event.source.userId;

if (!db[userId]) { let displayName = userId; try { const profile = await client.getProfile(userId); displayName = profile.displayName || userId; } catch (error) { console.error('無法取得用戶名稱:', error); } db[userId] = { role: 'student', points: 0, history: [], name: displayName }; writeJSON(DATA_FILE, db); }

const user = db[userId]; if (!Array.isArray(user.history)) user.history = [];

if (msg === '@切換為老師') { return replyText(event.replyToken, '請輸入密碼，例如：@老師密碼 1234', user.role); }

if (/^@老師密碼 /.test(msg)) { const inputPassword = msg.split(' ')[1]; if (inputPassword === process.env.TEACHER_PASSWORD) { user.role = 'teacher'; writeJSON(DATA_FILE, db); return replyText(event.replyToken, '✅ 已切換為老師身份', user.role); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次', user.role); } }

if (msg === '@切換為學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyText(event.replyToken, '✅ 已切換為學員身份', user.role); }

// 其他處理邏輯（省略） return replyText(event.replyToken, '請使用選單操作', user.role); }

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });
