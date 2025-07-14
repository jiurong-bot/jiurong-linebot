// index.js - 九容瑜伽 LINE Bot V2.4.3

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

// 讀取 JSON 檔案（空檔案或錯誤時回傳空物件）
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

// 預設學員選單
const studentMenu = [
  { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約課程' } },
  { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } },
  { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } },
  { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } },
  { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } },
  { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } },
];

// 預設老師選單
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

const pendingTeacherLogin = {}; // 用於老師登入流程暫存

// webhook route，LINE 事件處理
app.post('/webhook', line.middleware(config), (req, res) => {
  res.status(200).end(); // 先回應避免 LINE webhook timeout
  Promise.all(req.body.events.map(handleEvent)).catch(err => console.error('Webhook Error:', err));
});

// 健康檢查路由
app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

// Keep-alive 機制（每 5 分鐘 ping 自己）
setInterval(() => {
  fetch(process.env.KEEP_ALIVE_URL || 'https://your-render-app-url.onrender.com')
    .catch(err => console.error('Keep alive failed:', err));
}, 5 * 60 * 1000);

// 主事件處理函式
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = {};
  let courses = {};

  try {
    db = readJSON(DATA_FILE);
    courses = readJSON(COURSE_FILE);
  } catch (e) {
    console.error('讀取資料錯誤:', e);
    return replyText(event.replyToken, '⚠️ 系統發生錯誤，請稍後再試');
  }

  // 初次註冊使用者
  if (!db[userId]) {
    try {
      const profile = await client.getProfile(userId);
      db[userId] = {
        name: profile.displayName || '未命名',
        role: 'student',
        points: 0,
        history: [],
      };
      writeJSON(DATA_FILE, db);
    } catch (e) {
      console.error('取得用戶資料失敗:', e);
      return replyText(event.replyToken, '⚠️ 無法取得您的資料，請稍後再試');
    }
  }

  const user = db[userId];

  // 老師登入流程
  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return replyWithMenu(event.replyToken, '✅ 登入成功，您已切換為老師身份。', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyWithMenu(event.replyToken, '❌ 密碼錯誤，已取消切換。', user.role === 'teacher' ? teacherMenu : studentMenu);
    }
  }

  // 身份切換指令
  if (msg === '@我是老師') {
    pendingTeacherLogin[userId] = true;
    return replyWithMenu(event.replyToken, '請輸入老師密碼（四位數字）：', user.role === 'teacher' ? teacherMenu : studentMenu);
  }

  if (msg === '@我是學員') {
    user.role = 'student';
    writeJSON(DATA_FILE, db);
    return replyWithMenu(event.replyToken, '您現在是學員身份。', studentMenu);
  }

  if (msg === '@切換身份') {
    return sendRoleSelection(event.replyToken);
  }

  // 根據身份分流處理指令
  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses);
  } else {
    return sendRoleSelection(event.replyToken);
  }
}

function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return replyWithMenu(replyToken, `您目前剩餘點數為：${user.points} 點。`, studentMenu);
  }

  if (msg === '@課程查詢') {
    const bookedCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (bookedCourses.length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = bookedCourses
      .map(([_, c]) => `${c.name} (${c.date})`)
      .join('\n');
    return replyWithMenu(replyToken, `📘 您已預約的課程：\n${list}`, studentMenu);
  }

  if (msg === '@預約課程') {
    const allCourses = Object.entries(courses);
    if (allCourses.length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }

    const list = allCourses
      .filter(([_, c]) => c.name && c.date)
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');

    if (!list) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }

    return replyWithMenu(replyToken, `📚 可預約課程：\n${list}\n請輸入「預約 課程編號」`, studentMenu);
  }

  if (/^預約 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到該課程編號', studentMenu);
    if (course.students.includes(userId)) return replyWithMenu(replyToken, '您已預約此課程', studentMenu);
    if (user.points <= 0) return replyWithMenu(replyToken, '點數不足', studentMenu);

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points-= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyWithMenu(replyToken, '✅ 預約成功，已扣除 1 點', studentMenu);
    } else {
      if (!course.waitlist.includes(userId)) {
        course.waitlist.push(userId);
        writeJSON(COURSE_FILE, courses);
      }
      return replyWithMenu(replyToken, '目前已額滿，您已加入候補名單', studentMenu);
    }
  }

  if (msg === '@我的課程') {
    const my = user.history.map(h => {
      const c = courses[h.courseId];
      return c
        ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
        : `已刪除課程 ${h.courseId}`;
    }).join('\n') || '尚無預約紀錄';
    return replyWithMenu(replyToken, my, studentMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到該課程', studentMenu);

    const idx = course.students.indexOf(userId);
    if (idx >= 0) {
      course.students.splice(idx, 1);
      user.points += 1;

      // 候補轉正機制
      if (course.waitlist.length > 0) {
        const promotedUserId = course.waitlist.shift();
        course.students.push(promotedUserId);
        if (db[promotedUserId]) {
          db[promotedUserId].history.push({ courseId, time: new Date().toISOString() });
          db[promotedUserId].points -= 1;
          client.pushMessage(promotedUserId, {
            type: 'text',
            text: `✅ 您已從候補轉為正式學員：${course.name} (${course.date})`,
          }).catch(console.error);
        }
      }

      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyWithMenu(replyToken, '✅ 已取消預約並退回 1 點', studentMenu);
    } else {
      return replyWithMenu(replyToken, '您未預約此課程', studentMenu);
    }
  }

  if (msg === '@購點') {
    return replyWithMenu(replyToken, '請填寫購點表單：https://yourform.url\n💰 每點 NT$100', studentMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', studentMenu);
}

function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const list = Object.entries(courses)
      .filter(([_, c]) => c.date.startsWith(today))
      .map(([id, c]) => {
        const names = c.students.map(uid => db[uid]?.name || uid.slice(-4)).join(', ') || '無';
        return `📌 ${c.name} (${c.date})\n👥 報名：${c.students.length} 人\n🙋‍♀️ 學員：${names}`;
      })
      .join('\n\n') || '今天沒有課程';
    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (msg.startsWith('@新增課程')) {
    const parts = msg.split(' ');
    if (parts.length < 5) {
      return replyWithMenu(replyToken, '格式錯誤：@新增課程 課名 日期 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu);
    }
    const name = parts[1];
    const date = `${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}`;
    const max = parseInt(parts[4]);
    const id = `course_${Date.now()}`;
    courses[id] = { name, date, max, students: [], waitlist: [] };
    writeJSON(COURSE_FILE, courses);
    return replyWithMenu(replyToken, `✅ 已新增課程：${name}`, teacherMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到課程', teacherMenu);

    // 退還所有學生點數
    course.students.forEach(uid => {
      if (db[uid]) db[uid].points += 1;
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已取消課程 ${courseId} 並退回點數`, teacherMenu);
  }

  if (msg === '@查學員') {
    const list = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)} 點數：${u.points}｜預約：${u.history.length}`)
      .join('\n') || '沒有學員資料';
    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (/^@查學員 /.test(msg)) {
    const targetId = msg.split(' ')[1];
    const stu = db[targetId];
    if (!stu) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);
    const record = stu.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date})` : `❌ ${h.courseId}`;
    }).join('\n') || '無預約紀錄';
    return replyWithMenu(replyToken, `點數：${stu.points}\n紀錄：\n${record}`, teacherMenu);
  }

  if (/^@加點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);
    db[targetId].points += parseInt(amount);
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${targetId} 加點 ${amount}`, teacherMenu);
  }

  if (/^@扣點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);
    db[targetId].points -= parseInt(amount);
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${targetId} 扣點 ${amount}`, teacherMenu);
  }

  if (msg === '@統計報表') {
    const summary = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `學員 ${u.name || id.slice(-4)}：${u.history.length} 堂課`)
      .join('\n') || '尚無預約紀錄';
    return replyWithMenu(replyToken, summary, teacherMenu);
  }

  if (msg.startsWith('@廣播 ')) {
    const broadcast = msg.replace('@廣播 ', '');
    const studentIds = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id]) => id);
    studentIds.forEach(id => {
      client.pushMessage(id, {
        type: 'text',
        text: `📢 系統通知：${broadcast}`
      }).catch(console.error);
    });
    return replyWithMenu(replyToken, `✅ 已廣播訊息給 ${studentIds.length} 位學員`, teacherMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', teacherMenu);
}

// 課程資料清理函式：移除空的或結構不完整的課程
function cleanCourses(courses) {
  for (const id in courses) {
    const c = courses[id];
    if (!c.name || !c.date || !c.students || !c.max) {
      delete courses[id];
      continue;
    }
    // 確保 students 與 waitlist 是陣列
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waitlist)) c.waitlist = [];
  }
  return courses;
}

// 發送文字訊息
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

// 發送含選單的訊息
function replyWithMenu(replyToken, text, menu) {
  return client.replyMessage(replyToken, [
    { type: 'text',text,
    },
    {
      type: 'template',
      altText: '選單',
      template: {
        type: 'buttons',
        text: '請選擇功能',
        actions: menu,
      },
    },
  ]);
}

// 傳送身份選擇選單
function sendRoleSelection(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'template',
    altText: '請選擇身份',
    template: {
      type: 'buttons',
      text: '請選擇您的身份',
      actions: [
        { type: 'message', label: '我是學員', text: '@我是學員' },
        { type: 'message', label: '我是老師', text: '@我是老師' },
      ],
    },
  });
}

// 啟動 Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 已啟動，監聽埠號：${PORT}`);
});
