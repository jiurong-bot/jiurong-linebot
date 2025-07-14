// index.js - V2.4.2 修正版（完整）

const express = require('express');
const fs = require('fs');
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const studentMenu = [
  { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約課程' } },
  { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } },
  { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } },
  { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } },
  { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } },
  { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } },
];

const teacherMenu = [
  { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } },
  { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程' } },
  { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } },
  { type: 'action', action: { type: 'message', label: '加點', text: '@加點' } },
  { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } },
  { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } },
  { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } },
];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => {
  res.status(200).end();
  Promise.all(req.body.events.map(handleEvent)).catch(err => console.error('Webhook Error:', err));
});

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 正常運作中');
});

setInterval(() => {
  fetch('https://your-render-app-url.onrender.com').catch(err => console.error('Keep alive failed:', err));
}, 5 * 60 * 1000);

// 接下來會接續補上：handleEvent、handleStudentCommands、handleTeacherCommands 等主邏輯...
// 處理每個事件
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = {};
  let courses = {};

  try {
    db = readJSON(DATA_FILE);
  } catch (e) {
    console.error('讀取資料錯誤（db）:', e);
    return replyText(event.replyToken, '⚠️ 使用者資料異常，請稍後再試');
  }

  try {
    courses = readJSON(COURSE_FILE);
  } catch (e) {
    console.error('讀取資料錯誤（courses）:', e);
    courses = {}; // 讀取失敗改為空物件處理
  }

  // 初次使用註冊
  if (!db[userId]) {
    try {
      const profile = await client.getProfile(userId);
      db[userId] = {
        name: profile.displayName || '訪客',
        role: 'student',
        points: 0,
        history: []
      };
      writeJSON(DATA_FILE, db);
    } catch (e) {
      console.error('取得 LINE 使用者資料失敗:', e);
      return replyText(event.replyToken, '⚠️ 無法取得使用者資料');
    }
  }

  const user = db[userId];

  // 老師登入驗證中
  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return replyWithMenu(event.replyToken, '✅ 登入成功，您已切換為老師身份。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyWithMenu(event.replyToken, '❌ 密碼錯誤，取消登入。', studentMenu);
    }
  }

  // 身份切換指令
  if (msg === '@我是老師') {
    pendingTeacherLogin[userId] = true;
    return replyText(event.replyToken, '請輸入老師密碼：');
  }

  if (msg === '@我是學員') {
    user.role = 'student';
    writeJSON(DATA_FILE, db);
    return replyWithMenu(event.replyToken, '✅ 您已切換為學員身份。', studentMenu);
  }

  if (msg === '@切換身份') {
    return sendRoleSelection(event.replyToken);
  }

  // 根據角色導入指令邏輯
  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses);
  } else {
    return sendRoleSelection(event.replyToken);
  }
}

// 學員功能處理
async function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return replyWithMenu(replyToken, `您目前剩餘點數：${user.points} 點。`, studentMenu);
  }

  if (msg === '@課程查詢') {
    // 找出學員有預約的課程
    if (!courses || Object.keys(courses).length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const bookedCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (bookedCourses.length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = bookedCourses
      .map(([id, c]) => `${c.name} (${c.date})`)
      .join('\n');
    return replyWithMenu(replyToken, `📘 您已預約的課程：\n${list}`, studentMenu);
  }

  if (msg === '@預約課程') {
    if (!courses || Object.keys(courses).length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = Object.entries(courses)
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');
    return replyWithMenu(replyToken, `📚 可預約課程：\n${list}\n請輸入「預約 課程編號」`, studentMenu);
  }

  if (/^預約\s+/.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到該課程編號。', studentMenu);
    if (course.students.includes(userId)) return replyWithMenu(replyToken, '您已預約此課程。', studentMenu);
    if (user.points <= 0) return replyWithMenu(replyToken, '點數不足。', studentMenu);

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyWithMenu(replyToken, '✅ 預約成功，已扣除 1 點。', studentMenu);
    } else {
      if (!course.waitlist.includes(userId)) {
        course.waitlist.push(userId);
        writeJSON(COURSE_FILE, courses);
      }
      return replyWithMenu(replyToken, '目前已額滿，您已加入候補名單。', studentMenu);
    }
  }

  if (msg === '@我的課程') {
    if (!user.history || user.history.length === 0) {
      return replyWithMenu(replyToken, '尚無預約紀錄。', studentMenu);
    }
    const myCourses = user.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}` : `已刪除課程 ${h.courseId}`;
    }).join('\n');
    return replyWithMenu(replyToken, myCourses, studentMenu);
  }

  if (/^@取消課程\s+/.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到該課程。', studentMenu);

    const idx = course.students.indexOf(userId);
    if (idx >= 0) {
      course.students.splice(idx, 1);
      user.points += 1;

      // 候補轉正
      if (course.waitlist.length > 0) {
        const promotedUserId = course.waitlist.shift();
        course.students.push(promotedUserId);
        if (db[promotedUserId]) {
          db[promotedUserId].history.push({ courseId, time: new Date().toISOString() });
          db[promotedUserId].points -= 1;
          client.pushMessage(promotedUserId, {
            type: 'text',
            text: `✅ 您已從候補轉為正式學員：${course.name} (${course.date})`
          }).catch(console.error);
        }
      }

      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyWithMenu(replyToken, '✅ 已取消預約並退回 1 點。', studentMenu);
    } else {
      return replyWithMenu(replyToken, '您未預約此課程。', studentMenu);
    }
  }

  if (msg === '@購點') {
    return replyWithMenu(replyToken, '請填寫購點表單：https://yourform.url\n💰 每點 NT$100', studentMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', studentMenu);
}

// 老師功能處理
async function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const todayDate = new Date().toISOString().slice(0, 10);
    if (!courses || Object.keys(courses).length === 0) {
      return replyWithMenu(replyToken, '今天沒有課程。', teacherMenu);
    }
    const todayCourses = Object.entries(courses)
      .filter(([_, c]) => c.date.startsWith(todayDate));
    if (todayCourses.length === 0) {
      return replyWithMenu(replyToken, '今天沒有課程。', teacherMenu);
    }

    const list = todayCourses
      .map(([id, c]) => {
        const names = c.students.map(uid => db[uid]?.name || uid.slice(-4)).join(', ') || '無';
        return `📌 ${c.name} (${c.date})\n👥 報名：${c.students.length} 人\n🙋‍♀️ 學員：${names}`;
      }).join('\n\n');

    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (msg.startsWith('@新增課程')) {
    const parts = msg.trim().split(/\s+/);
    if (parts.length < 5) {
      return replyWithMenu(replyToken, '格式錯誤：@新增課程 課名 日期 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu);
    }
    const name = parts[1];
    const dateStr = parts[2].replace('/', '-');
    const timeStr = parts[3];
    const max = parseInt(parts[4]);
    if (isNaN(max) || max <= 0) {
      return replyWithMenu(replyToken, '名額需為正整數。', teacherMenu);
    }
    const year = new Date().getFullYear();
    const date = `${year}-${dateStr} ${timeStr}`;
    const id = `course_${Date.now()}`;

    if (!courses) courses = {};

    courses[id] = {
      name,
      date,
      max,
      students: [],
      waitlist: [],
    };
    writeJSON(COURSE_FILE, courses);
    return replyWithMenu(replyToken, `✅ 已新增課程：${name} (${date})`, teacherMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const parts = msg.trim().split(/\s+/);
    if (parts.length < 2) return replyWithMenu(replyToken, '請提供課程編號。', teacherMenu);
    const courseId = parts[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到課程。', teacherMenu);

    // 退還所有學員點數
    course.students.forEach(uid => {
      if (db[uid]) db[uid].points += 1;
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已取消課程 ${courseId} 並退還點數。`, teacherMenu);
  }

  if (msg === '@查學員') {
    const students = Object.entries(db)
      .filter(([_, u]) => u.role === 'student');
    if (students.length === 0) {
      return replyWithMenu(replyToken, '沒有學員資料。', teacherMenu);
    }
    const list = students
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)} 點數：${u.points}｜預約：${u.history.length}`)
      .join('\n');
    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (/^@查學員\s+/.test(msg)) {
    const targetId = msg.split(' ')[1];
    const stu = db[targetId];
    if (!stu) return replyWithMenu(replyToken, '找不到該學員。', teacherMenu);
    const record = stu.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date})` : `❌ 已刪除課程 ${h.courseId}`;
    }).join('\n') || '無預約紀錄。';
    return replyWithMenu(replyToken, `點數：${stu.points}\n紀錄：\n${record}`, teacherMenu);
  }

  if (/^@加點\s+/.test(msg)) {
    const parts = msg.trim().split(/\s+/);
    if (parts.length < 3) return replyWithMenu(replyToken, '格式錯誤，請輸入：@加點 學員ID 點數', teacherMenu);
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員。', teacherMenu);
    if (isNaN(amount)) return replyWithMenu(replyToken, '點數需為數字。', teacherMenu);
    db[targetId].points += amount;
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${targetId} 加點 ${amount}。`, teacherMenu);
  }

  if (/^@扣點\s+/.test(msg)) {
    const parts = msg.trim().split(/\s+/);
    if (parts.length < 3) return replyWithMenu(replyToken, '格式錯誤，請輸入：@扣點 學員ID 點數', teacherMenu);
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員。', teacherMenu);
    if (isNaN(amount)) return replyWithMenu(replyToken, '點數需為數字。', teacherMenu);
    db[targetId].points -= amount;
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${targetId} 扣點 ${amount}。`, teacherMenu);
  }

  if (msg === '@統計報表') {
    const students = Object.entries(db).filter(([_, u]) => u.role === 'student');
    if (students.length === 0) {
      return replyWithMenu(replyToken, '尚無預約紀錄。', teacherMenu);
    }
    const summary = students
      .map(([id, u]) => `學員 ${u.name || id.slice(-4)}：${u.history.length} 堂課`)
      .join('\n');
    return replyWithMenu(replyToken, summary, teacherMenu);
  }

  if (msg.startsWith('@廣播 ')) {
    const broadcastText = msg.replace('@廣播 ', '');
    const studentIds = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id]) => id);

    studentIds.forEach(id => {
      client.pushMessage(id, {
        type: 'text',
        text: `📢 系統通知：${broadcastText}`
      }).catch(console.error);
    });

    return replyWithMenu(replyToken, `✅ 已廣播訊息給 ${studentIds.length} 位學員。`, teacherMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', teacherMenu);
}

// ⏰ 課程提醒（每 10 分鐘檢查一次，提醒 60 分鐘內將開課的課程）
setInterval(() => {
  try {
    const db = readJSON(DATA_FILE);
    const courses = readJSON(COURSE_FILE);
    const now = new Date();

    const upcoming = Object.entries(courses).filter(([_, c]) => {
      const courseTime = new Date(c.date);
      const diff = (courseTime - now) / 60000; // 分鐘差
      return diff > 0 && diff <= 60;
    });

    upcoming.forEach(([id, c]) => {
      c.students.forEach(uid => {
        client.pushMessage(uid, {
          type: 'text',
          text: `⏰ 課程提醒：「${c.name}」即將於 ${c.date} 開始，請準時上課！`
        }).catch(err => console.error('提醒推播失敗:', err.message));
      });
    });
  } catch (err) {
    console.error('定時提醒錯誤:', err);
  }
}, 10 * 60 * 1000); // 每 10 分鐘執行一次

// 回覆文字訊息並附選單
function replyWithMenu(replyToken, text, menu) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    quickReply: {
      items: menu
    }
  });
}

// 傳送身份選擇選單
function sendRoleSelection(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: '請選擇您的身份：',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '我是老師',
            text: '@我是老師'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '我是學員',
            text: '@我是學員'
          }
        }
      ]
    }
  });
}

// 讀取 JSON 檔案
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const data = fs.readFileSync(file, 'utf8');
    if (!data) return {};
    return JSON.parse(data);
  } catch (e) {
    console.error(`讀取檔案 ${file} 錯誤：`, e);
    return {};
  }
}

// 寫入 JSON 檔案
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`寫入檔案 ${file} 錯誤：`, e);
  }
}

// Express 健康檢查路由
app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

// 啟動 Express 伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽 port ${port}`);
});
