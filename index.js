// 九容瑜伽 LINE Bot 主程式 V1.1.0

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 課名 7/15 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查詢學員' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程 course_001' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

async function handleEvent(event) { const userId = event.source.userId; if (event.type !== 'message' || event.message.type !== 'text') return;

const msg = event.message.text.trim(); const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE);

if (!db[userId]) { db[userId] = { role: null, points: 10, history: [] }; writeJSON(DATA_FILE, db); }

const user = db[userId];

if (pendingTeacherLogin[userId]) { if (/^\d{4}$/.test(msg)) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; delete pendingTeacherLogin[userId]; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 老師模式登入成功。', teacherMenu); } else { return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次'); } } else { return replyText(event.replyToken, '請輸入四位數字密碼：'); } }

if (msg === '@我是學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 進入學員模式', studentMenu); } if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyText(event.replyToken, '請輸入老師密碼（四位數字）：'); } if (msg === '@切換身份') return sendRoleSelection(event.replyToken);

// 學員功能 if (user.role === 'student') { if (msg === '@點數查詢') return replyWithMenu(event.replyToken, 您目前剩餘點數為：${user.points} 點。, studentMenu);

if (msg === '@課程查詢') { const list = Object.entries(courses).map(([id, c]) => `${id}: ${c.name} (${c.date}) 剩餘：${c.max - c.students.length}`).join('\n'); return replyWithMenu(event.replyToken, list || '目前無開課紀錄', studentMenu); } if (msg === '@預約') { const list = Object.entries(courses).map(([id, c]) => `${id}: ${c.name} (${c.date})`).join('\n'); return replyWithMenu(event.replyToken, list ? `📚 可預約課程：\n${list}\n請輸入：預約 course_編號` : '目前無可預約課程', studentMenu); } if (/^預約 course_/.test(msg)) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到課程編號'); if (course.students.includes(userId)) return replyText(event.replyToken, '您已預約此課程'); if (user.points <= 0) return replyText(event.replyToken, '點數不足'); if (course.students.length < course.max) { course.students.push(userId); user.points -= 1; user.history.push({ courseId, time: new Date().toISOString() }); writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 預約成功，已扣 1 點'); } else { if (!course.waitlist.includes(userId)) course.waitlist.push(userId); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '課程已額滿，已加入候補名單'); } } if (msg === '@我的課程') { const myCourses = Object.entries(courses).filter(([id, c]) => c.students.includes(userId)).map(([id, c]) => `${c.name} (${c.date})`).join('\n'); return replyWithMenu(event.replyToken, myCourses || '尚無預約課程', studentMenu); } if (msg === '@購點') { return replyText(event.replyToken, '請填寫以下表單購點：\nhttps://yourform.url\n每點 NT$100'); } if (msg.startsWith('@取消課程')) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到課程'); const idx = course.students.indexOf(userId); if (idx >= 0) { course.students.splice(idx, 1); user.points += 1; if (course.waitlist.length > 0) { const next = course.waitlist.shift(); course.students.push(next); } writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyText(event.replyToken, '✅ 已取消預約，點數退回'); } else { return replyText(event.replyToken, '您未預約此課程'); } } return replyWithMenu(event.replyToken, '請使用選單操作或正確指令。', studentMenu); 

}

// 老師功能 if (user.role === 'teacher') { if (msg === '@今日名單') { const today = new Date().toISOString().slice(0, 10); const list = Object.entries(courses).filter(([, c]) => c.date.startsWith(today)).map(([, c]) => ${c.name} (${c.date})\n報名：${c.students.length}人\n候補：${c.waitlist.length}人).join('\n\n') || '今天沒有課程'; return replyWithMenu(event.replyToken, list, teacherMenu); }

if (msg.startsWith('@新增課程')) { const parts = msg.split(' '); if (parts.length < 5) return replyText(event.replyToken, '格式錯誤，請輸入：@新增課程 名稱 日期 時間 名額'); const name = parts[1]; const date = `${new Date().getFullYear()}-${parts[2]} ${parts[3]}`; const max = parseInt(parts[4]); const id = `course_${Date.now()}`; courses[id] = { name, date, max, students: [], waitlist: [] }; writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, `✅ 課程已新增：${name}`, teacherMenu); } if (msg.startsWith('@取消課程')) { const courseId = msg.split(' ')[1]; const course = courses[courseId]; if (!course) return replyText(event.replyToken, '找不到課程'); course.students.forEach(uid => { if (db[uid]) db[uid].points += 1; }); delete courses[courseId]; writeJSON(DATA_FILE, db); writeJSON(COURSE_FILE, courses); return replyWithMenu(event.replyToken, `✅ 已取消課程並退點`, teacherMenu); } if (msg === '@查詢學員') { const list = Object.entries(db).filter(([_, u]) => u.role === 'student').map(([id, u]) => `🙋 ${id.slice(-4)}：${u.points} 點`).join('\n') || '沒有學員'; return replyWithMenu(event.replyToken, list, teacherMenu); } if (msg.startsWith('@查學員')) { const id = msg.split(' ')[1]; if (!db[id]) return replyText(event.replyToken, '找不到該學員'); const u = db[id]; const log = u.history.map(h => `✅ ${h.courseId} - ${h.time}`).join('\n'); return replyWithMenu(event.replyToken, `學員 ${id}\n點數：${u.points}\n紀錄：\n${log}`, teacherMenu); } if (msg.startsWith('@加點') || msg.startsWith('@扣點')) { const parts = msg.split(' '); const id = parts[1]; const delta = parseInt(parts[2]); if (!db[id]) return replyText(event.replyToken, '找不到該學員'); db[id].points += msg.startsWith('@加點') ? delta : -delta; writeJSON(DATA_FILE, db); return replyText(event.replyToken, `✅ 已${msg.startsWith('@加點') ? '加' : '扣'}點 ${delta} 給 ${id}`); } if (msg.startsWith('@廣播')) { const text = msg.replace('@廣播', '').trim(); Object.keys(db).forEach(uid => { if (db[uid].role === 'student') client.pushMessage(uid, { type: 'text', text }); }); return replyText(event.replyToken, '✅ 廣播已送出'); } if (msg === '@統計報表') { const summary = Object.entries(db).filter(([_, u]) => u.role === 'student').map(([id, u]) => `${id.slice(-4)}：共預約 ${u.history.length} 堂`).join('\n'); return replyWithMenu(event.replyToken, summary || '尚無紀錄', teacherMenu); } return replyWithMenu(event.replyToken, '請使用選單操作或正確指令。', teacherMenu); 

}

return sendRoleSelection(event.replyToken); }

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text }); } function replyWithMenu(token, text, menu) { return client.replyMessage(token, { type: 'text', text, quickReply: { items: menu } }); } function sendRoleSelection(token) { return replyWithMenu(token, '請選擇您的身份：', [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } }, ]); }

// ⏰ V1.1.0 新增：每 10 分鐘檢查即將上課提醒 setInterval(() => { const db = readJSON(DATA_FILE); const courses = readJSON(COURSE_FILE); const now = new Date();

for (const [id, course] of Object.entries(courses)) { if (course.notified) continue; const courseTime = new Date(course.date); const diffMin = (courseTime - now) / 1000 / 60;

if (diffMin > 0 && diffMin < 60) { course.students.forEach(uid => { client.pushMessage(uid, { type: 'text', text: `⏰ 您預約的課程「${course.name}」將於 ${course.date} 開始，請準時參加。` }); }); course.notified = true; } 

}

writeJSON(COURSE_FILE, courses); }, 10 * 60 * 1000);

const port = process.env.PORT || 3000; app.listen(port, () => console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}));

