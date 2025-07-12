// 九容瑜伽 LINE Bot 完整功能（含學員三項與老師三項功能） const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 課程名 7/20 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員 course_001' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程 course_001' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { const userId = event.source.userId; if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null); const msg = event.message.text.trim();

const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE);

if (!db[userId]) { db[userId] = { role: null, points: 10, history: [] }; writeJSON(DATA_FILE, db); }

const user = db[userId];

if (pendingTeacherLogin[userId]) { if (/^\d{4}$/.test(msg)) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; delete pendingTeacherLogin[userId]; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 老師模式登入成功。', teacherMenu); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次'); } } else { return replyText(event.replyToken, '請輸入四位數字密碼：'); } }

if (msg === '@我是學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 進入學員模式', studentMenu); } if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyText(event.replyToken, '請輸入老師密碼（四位數字）：'); } if (msg === '@切換身份') { return sendRoleSelection(event.replyToken); }

if (user.role === 'student') { if (msg === '@點數查詢') { return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。, studentMenu); } if (msg === '@課程查詢') { const list = Object.entries(courses) .map(([id, c]) => ${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}) .join('\n'); return replyWithMenu(event.replyToken, list || '目前無開課紀錄', studentMenu); } if (msg === '@預約') { const list = Object.entries(courses) .map(([id, c]) => ${id}: ${c.name} (${c.date})) .join('\n'); return replyWithMenu(event.replyToken, list ? 📚 可預約課程：\n${list}\n請輸入課程編號進行預約（例如：預約 course_001） : '目前無可預約課程。', studentMenu); } if (/^預約 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到該課程編號'); if (course.students.includes(userId)) return replyText(event.replyToken, '您已預約此課程'); if (user.points <= 0) return replyText(event.replyToken, '點數不足');

if (course.students.length < course.max) { course.students.push(userId); user.points -= 1; user.history.push({ courseId, time: new Date().toISOString() }); writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 預約成功，已扣除 1 點'); } else { if (!course.waitlist.includes(userId)) course.waitlist.push(userId); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '目前已額滿，您已加入候補名單'); } } if (msg === '@取消') { const joined = Object.entries(courses).filter(([id, c]) => c.students.includes(userId)); if (joined.length === 0) return replyText(event.replyToken, '您沒有已預約的課程'); const list = joined.map(([id, c]) => `${id}: ${c.name} (${c.date})`).join('\n'); return replyText(event.replyToken, `請輸入要取消的課程編號（例如：取消 course_001）\n${list}`); } if (/^取消 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course || !course.students.includes(userId)) return replyText(event.replyToken, '您尚未預約此課程'); course.students = course.students.filter(id => id !== userId); user.points += 1; writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 已取消課程並退回 1 點'); } if (msg === '@購點') { return replyText(event.replyToken, '請填寫以下表單購點：\nhttps://yourform.url\n💰 每點 NT$100'); } 

}

if (user.role === 'teacher') { if (msg === '@今日名單') { const today = new Date().toISOString().slice(0, 10); const todayList = Object.entries(courses) .filter(([id, c]) => c.date.startsWith(today)) .map(([id, c]) => 📌 ${c.name} (${c.date})\n報名：${c.students.length}人\n候補：${c.waitlist.length}人) .join('\n\n') || '今天沒有課程'; return replyWithMenu(event.replyToken, todayList, teacherMenu); } if (msg.startsWith('@新增課程')) { const parts = msg.split(' '); if (parts.length < 5) return replyText(event.replyToken, '格式錯誤，請輸入：@新增課程 課程名 日期 時間 人數上限'); const name = parts[1]; const date = ${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}; const max = parseInt(parts[4]); const id = course_${Date.now()}; courses[id] = { name, date, max, students: [], waitlist: [] }; writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, ✅ 已新增課程：${name}, teacherMenu); } if (msg.startsWith('@查學員')) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '課程不存在'); const list = course.students.map((id, i) => ${i + 1}. ${id}).join('\n') || '尚無學員'; return replyText(event.replyToken, 👥 ${course.name} 報名名單：\n${list}); } if (msg.startsWith('@取消課程')) { const courseId = msg.split(' ')[1]; if (!courses[courseId]) return replyText(event.replyToken, '課程不存在'); delete courses[courseId]; writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 已取消課程'); } if (msg === '@統計報表') { const report = Object.values(db).filter(u => u.role === 'student') .map(u => ID: ${u.points} 點, 預約數：${u.history.length}) .join('\n') || '尚無學員資料'; return replyText(event.replyToken, 📊 學員統計報表：\n${report}); } }

return replyText(event.replyToken, '請使用選單或正確指令。'); }

function replyText(replyToken, text) { return client.replyMessage(replyToken, { type: 'text', text }); }

function replyWithMenu(replyToken, text, menuItems) { return client.replyMessage(replyToken, { type: 'text', text, quickReply: { items: menuItems } }); }

function sendRoleSelection(replyToken) { return replyWithMenu(replyToken, '請選擇您的身份：', [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } } ]); }

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });

