// index.js - V3.11.1 (Webhook 修正版) const express = require('express'); const fs = require('fs'); const path = require('path'); const line = require('@line/bot-sdk'); require('dotenv').config();

const app = express(); const PORT = process.env.PORT || 3000;

// 正確處理 LINE Webhook app.post('/webhook', express.raw({ type: '/' }), (req, res) => { try { const signature = req.headers['x-line-signature']; const body = req.body; line.middleware(config)(req, res, () => {}); // for verify const events = JSON.parse(body.toString()).events; Promise.all(events.map(handleEvent)).then(() => res.status(200).end()); } catch (err) { console.error('Webhook error:', err); res.status(200).end(); // 即使錯誤也回傳 200 } });

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, }; const client = new line.Client(config);

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const BACKUP_DIR = './backup'; const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}'); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}'); if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function readJSON(file) { try { const content = fs.readFileSync(file, 'utf8'); return content ? JSON.parse(content) : {}; } catch { return {}; } }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function replyText(token, text, menu = null) { const msg = { type: 'text', text }; if (menu) msg.quickReply = { items: menu.map(i => ({ type: 'action', action: i })) }; return client.replyMessage(token, msg); }

function cleanCourses(courses) { const now = Date.now(); for (const id in courses) { const c = courses[id]; if (!c.title || !c.time || !c.students || !c.capacity) { delete courses[id]; continue; } if (!Array.isArray(c.students)) c.students = []; if (!Array.isArray(c.waiting)) c.waiting = []; if (new Date(c.time).getTime() < now - 86400000) { delete courses[id]; } } return courses; }

function backupData() { const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); try { fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, data_backup_${timestamp}.json)); fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, courses_backup_${timestamp}.json)); console.log(✅ 資料備份成功：${timestamp}); } catch (err) { console.error('備份失敗:', err); } }

function chunkArray(arr, size) { const result = []; for (let i = 0; i < arr.length; i += size) { result.push(arr.slice(i, i + size)); } return result; }

const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數查詢' },
  { type: 'message', label: '取消候補', text: '@取消候補' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '加扣點數', text: '@加點 userId 數量' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '查詢學員', text: '@查學員' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 登記暫存狀態的物件
const pendingTeacherLogin = {};
const pendingCourseCreation = {};

// webhook 事件處理
app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 學員功能處理（已包含預約、查詢、取消候補、購點等）
async function handleStudentCommands(event, user, db, courses) {
  const msg = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (msg === '@預約課程' || msg === '@預約') {
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${c.time.slice(5, 16)} ${c.title}`,
          text: `我要預約 ${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }

    return replyText(replyToken, '請選擇課程：', upcoming);
  }

  if (msg.startsWith('我要預約')) {
    const id = msg.replace('我要預約', '').trim();
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在', studentMenu);

    if (!course.students) course.students = [];
    if (!course.waiting) course.waiting = [];

    if (course.students.includes(userId)) return replyText(replyToken, '你已經預約此課程', studentMenu);
    if (course.waiting.includes(userId)) return replyText(replyToken, '你已在候補名單中，請耐心等待', studentMenu);
    if (user.points <= 0) return replyText(replyToken, '點數不足，請先購買點數', studentMenu);

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      user.points--;
      user.history.push({ id, action: '預約', time: new Date().toISOString() });
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '✅ 已成功預約', studentMenu);
    } else {
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '課程額滿，已加入候補名單', studentMenu);
    }
  }

  if (msg === '@取消候補') {
    let count = 0;
    for (const id in courses) {
      const c = courses[id];
      if (c.waiting?.includes(userId)) {
        c.waiting = c.waiting.filter(x => x !== userId);
        count++;
      }
    }
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 已取消 ${count} 筆候補`, studentMenu);
  }

  if (msg === '@點數' || msg === '@點數查詢') {
    return replyText(replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  if (msg === '@我的課程') {
    const myCourses = Object.entries(courses)
      .filter(([id, c]) => c.students?.includes(userId) || c.waiting?.includes(userId))
      .map(([id, c]) => {
        const status = c.students?.includes(userId) ? '✅ 已預約' : '⏳ 候補中';
        return `${c.time.slice(5, 16)}｜${c.title}｜${status}`;
      });
    const text = myCourses.length ? myCourses.join('\n') : '你目前沒有課程紀錄';
    return replyText(replyToken, text, studentMenu);
  }

  if (msg === '@購點') {
    const formUrl = 'https://forms.gle/your-form-url'; // 替換為實際購點表單網址
    return replyText(replyToken, `請至下列表單填寫購點資訊：\n${formUrl}`, studentMenu);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', studentMenu);
}

// 老師功能處理（查詢今日名單、加扣點、取消課程、查詢學員等）
async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([id, c]) => c.time.startsWith(today));

    if (todayCourses.length === 0) return replyText(replyToken, '今天沒有課程', teacherMenu);

    const lines = todayCourses.map(([id, c]) => {
      const studentList = c.students?.map(uid => db[uid]?.name || uid).join(', ') || '無';
      return `${c.time.slice(5, 16)}｜${c.title}\n學員：${studentList}`;
    });

    return replyText(replyToken, lines.join('\n\n'), teacherMenu);
  }

  if (msg.startsWith('@加點') || msg.startsWith('@扣點')) {
    const parts = msg.split(' ');
    if (parts.length !== 3) return replyText(replyToken, '指令格式錯誤，範例：@加點 userId 數量', teacherMenu);

    const action = parts[0].slice(1); // 加點 或 扣點
    const targetId = parts[1];
    const amount = parseInt(parts[2]);

    if (!db[targetId]) return replyText(replyToken, '查無該學員資料', teacherMenu);
    if (isNaN(amount) || amount <= 0) return replyText(replyToken, '請輸入正確點數數字', teacherMenu);

    if (action === '加點') {
      db[targetId].points = (db[targetId].points || 0) + amount;
    } else if (action === '扣點') {
      db[targetId].points = Math.max((db[targetId].points || 0) - amount, 0);
    }

    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `✅ 已${action}${amount}點給 ${db[targetId].name}`, teacherMenu);
  }

  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱：', []);
  }

  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'message',
        action: {
          type: 'message',
          label: `${c.time.slice(5, 16)} ${c.title}`,
          text: `取消課程 ${id}`,
        },
      }));

    if (upcomingCourses.length === 0) return replyText(replyToken, '沒有可取消的課程', teacherMenu);

    return replyText(replyToken, '請選擇要取消的課程：', upcomingCourses);
  }

  if (msg.startsWith('取消課程 ')) {
    const id = msg.replace('取消課程 ', '').trim();
    const course = courses[id];
    if (!course) return replyText(replyToken, '查無該課程', teacherMenu);

    for (const sid of course.students) {
      if (db[sid]) {
        db[sid].points = (db[sid].points || 0) + 1;
        db[sid].history.push({ id, action: '退點', time: new Date().toISOString() });
        client.pushMessage(sid, {
          type: 'text',
          text: `你的課程「${course.title}」已取消並退還1點數`,
        });
      }
    }

    delete courses[id];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `✅ 課程「${course.title}」已取消並退點`, teacherMenu);
  }

  if (msg === '@查學員') {
    const studentList = Object.entries(db)
      .filter(([uid, u]) => u.role === 'student')
      .map(([uid, u]) => `${u.name}（點數：${u.points}）`);
    const text = studentList.length ? studentList.join('\n') : '沒有學員資料';
    return replyText(replyToken, text, teacherMenu);
  }

  if (msg === '@統計報表') {
    const totalStudents = Object.values(db).filter(u => u.role === 'student').length;
    const totalCourses = Object.keys(courses).length;
    return replyText(replyToken, `總學員數：${totalStudents}\n總課程數：${totalCourses}`, teacherMenu);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', teacherMenu);
}

// 自訂選單（範例，可依需求擴充）
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 暫存登入與課程流程資料
const pendingTeacherLogin = {};
const pendingCourseCreation = {};

// LINE Webhook 處理，加入錯誤捕捉避免 500
app.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    const body = req.body;

    const events = line.middleware(config)(req, res, () => {});
    if (!line.validateSignature(body, config.channelSecret, signature)) {
      return res.status(401).send('Invalid signature');
    }

    const parsedBody = JSON.parse(body.toString());
    const promises = parsedBody.events.map(event => handleEvent(event));
    Promise.all(promises)
      .then(() => res.status(200).end())
      .catch(err => {
        console.error('❌ 處理事件失敗：', err);
        res.status(500).end();
      });
  } catch (e) {
    console.error('❌ Webhook 錯誤：', e);
    res.status(500).send('Webhook error');
  }
});

// 根路徑測試
app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 運行中');
});

// 每小時備份一次
setInterval(() => {
  backupData();
}, 3600 * 1000);

// 每 15 分鐘 keep-alive ping 自己
setInterval(() => {
  const url = process.env.SELF_URL;
  if (url) {
    require('node-fetch')(url).catch(() => {});
  }
}, 15 * 60 * 1000);

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，埠號：${PORT}`);
});

