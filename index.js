// index.js - V3.11.2 (修正版)
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const BACKUP_DIR = './backup';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

// 確保檔案與資料夾存在
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
// 讀取 JSON 檔案
function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

// 寫入 JSON 檔案
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 備份資料檔案
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('備份失敗:', err);
  }
}

// 快速回覆文字訊息
function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = {
      items: menu.map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

// 學員選單
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 老師選單
const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 暫存狀態物件
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
// 處理所有 LINE 事件的主函式
async function handleEvent(event) {
  if (event.type !== 'message' || !event.message.text) return;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;

  // 若使用者不存在資料庫，初始化
  if (!db[userId]) {
    db[userId] = {
      name: '',
      points: 0,
      role: 'student',
      history: [],
    };
  }

  // 更新使用者名稱（使用 LINE Profile 名稱，避免空白）
  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }

  writeJSON(DATA_FILE, db);

  // 簡易身份判斷：老師預設需輸入密碼才能切換，否則學生身份
  if (event.message.text === '@切換身份') {
    if (db[userId].role === 'teacher') {
      db[userId].role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '已切換為學員身份', studentMenu);
    } else {
      pendingTeacherLogin[userId] = true;
      return replyText(event.replyToken, '請輸入老師密碼登入');
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (event.message.text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '老師登入成功', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '密碼錯誤，登入失敗', studentMenu);
    }
  }

  // 根據身份執行對應指令
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
  }
}

// 清理過期課程
function cleanCourses(courses) {
  const now = Date.now();
  for (const id in courses) {
    const c = courses[id];
    if (!c.title || !c.time || !c.students || !c.capacity) {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waiting)) c.waiting = [];
    if (new Date(c.time).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}
// 學員功能指令處理
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
    const formUrl = 'https://forms.gle/your-form-url'; // 請替換成實際表單網址
    return replyText(replyToken, `請至下列表單填寫購點資訊：\n${formUrl}`, studentMenu);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', studentMenu);
}
// 老師功能指令處理
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
  return replyText(replyToken, '請輸入課程名稱：');
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

    // 退還點數給已預約學員並通知
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
}// 解析 raw body 用於 LINE webhook 驗證
app.use('/webhook', express.raw({ type: 'application/json' }));

// LINE webhook 主路由，包含簽章驗證與事件處理
app.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    const body = req.body;

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

// 根路徑簡單測試
app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 運行中');
});

// 每小時備份一次資料
setInterval(() => {
  backupData();
}, 3600 * 1000);

// 每 15 分鐘 ping 自己保持存活（需要自行設定環境變數 SELF_URL）
setInterval(() => {
  const url = process.env.SELF_URL;
  if (url) {
    require('node-fetch')(url).catch(() => {});
  }
}, 15 * 60 * 1000);

// 啟動 Express 伺服器
app.listen(PORT, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，埠號：${PORT}`);
});
