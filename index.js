const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use('/webhook', express.raw({ type: '*/*' }));

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const BACKUP_DIR = './backup';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function readJSON(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

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

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '查詢課程', text: '@課程查詢' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '查詢點數', text: '@點數查詢' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '查詢學員', text: '@查學員' },
  { type: 'message', label: '加點', text: '@加點' },
  { type: 'message', label: '扣點', text: '@扣點' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 用於記錄老師登入待輸入密碼狀態
const pendingTeacherLogin = {};

// 用於多步驟新增課程資料暫存，格式： { userId: { step: number, data: {...} } }
const addingCourseSessions = {};
function createQuickReplyMessage(text, menu) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: menu.map(i => ({ type: 'action', action: i })),
    },
  };
}

function replyText(token, text, menu = null) {
  if (menu) {
    return client.replyMessage(token, createQuickReplyMessage(text, menu));
  }
  return client.replyMessage(token, { type: 'text', text });
}

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

app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end();
  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook 錯誤:', err);
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));

  // 初始化新用戶
  if (!db[userId]) {
    const profile = await client.getProfile(userId);
    db[userId] = {
      name: profile.displayName,
      role: 'student',
      points: 0,
      history: [],
    };
    writeJSON(DATA_FILE, db);
  }

  const user = db[userId];

  // --- 新增課程多步驟引導 ---
  if (addingCourseSessions[userId]) {
    return await handleAddCourseSteps(event, user, db, courses);
  }

  // 切換身份流程
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      // 啟動老師密碼輸入流程
      pendingTeacherLogin[userId] = true;
      return replyText(replyToken, '請輸入老師密碼：', studentMenu);
    } else {
      // 從老師切回學生
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '👩‍🎓 已切換為學員身份', studentMenu);
    }
  }

  // 老師密碼驗證
  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '👨‍🏫 登入成功，已切換為老師身份', teacherMenu);
    } else {
      return replyText(replyToken, '❌ 密碼錯誤，請重新輸入老師密碼：', studentMenu);
    }
  }

  // 根據身份執行對應指令
  if (user.role === 'student') {
    return handleStudentCommands(event, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  }
}

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
          label: `${c.time} ${c.title}`,
          text: `我要預約 ${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇課程：',
      quickReply: { items: upcoming },
    });
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
        return `${c.time}｜${c.title}｜${status}`;
      });
    const text = myCourses.length ? myCourses.join('\n') : '你目前沒有課程紀錄';
    return replyText(replyToken, text, studentMenu);
  }

  if (msg === '@購點') {
    const formUrl = 'https://forms.gle/your-form-url'; // 請替換為實際購點表單
    return replyText(replyToken, `請至下列表單填寫購點資訊：\n${formUrl}`, studentMenu);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', studentMenu);
}

async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 今日名單
  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([id, c]) => c.time.startsWith(today));

    if (todayCourses.length === 0) return replyText(replyToken, '今天沒有課程', teacherMenu);

    const lines = todayCourses.map(([id, c]) => {
      const studentList = c.students?.map(uid => db[uid]?.name || uid).join(', ') || '無';
      return `${c.time}｜${c.title}\n學員：${studentList}`;
    });

    return replyText(replyToken, lines.join('\n\n'), teacherMenu);
  }

  // 新增課程觸發多步驟
  if (msg === '@新增課程') {
    addingCourseSessions[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱', teacherMenu);
  }

  // 加點 / 扣點
  if (msg.startsWith('@加點') || msg.startsWith('@扣點')) {
    const parts = msg.split(' ');
    if (parts.length < 3) return replyText(replyToken, '格式錯誤，請使用 @加點|@扣點 [學員ID] [數量]', teacherMenu);
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyText(replyToken, '找不到此學員', teacherMenu);
    if (isNaN(amount) || amount <= 0) return replyText(replyToken, '數量需為正整數', teacherMenu);

    if (msg.startsWith('@加點')) {
      db[targetId].points += amount;
    } else {
      db[targetId].points = Math.max(0, db[targetId].points - amount);
    }

    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `✅ 已${msg.startsWith('@加點') ? '加' : '扣'}點 ${amount} 點，剩餘 ${db[targetId].points} 點`, teacherMenu);
  }

  // 查學員
  if (msg.startsWith('@查')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入學員ID，如：@查 U1234567890', teacherMenu);
    const targetId = parts[1];
    const user = db[targetId];
    if (!user) return replyText(replyToken, '查無此人', teacherMenu);
    const history = (user.history || []).map(h => `${h.time.split('T')[0]}｜${h.action} ${h.id}`).join('\n') || '無紀錄';
    return replyText(replyToken, `姓名：${user.name}\n點數：${user.points}\n紀錄：\n${history}`, teacherMenu);
  }

  // 取消課程（退點＋刪除課程）
  if (msg.startsWith('@取消')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入課程ID，如：@取消 1625234567890', teacherMenu);
    const id = parts[1];
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在', teacherMenu);

    (course.students || []).forEach(uid => {
      if (db[uid]) {
        db[uid].points++;
        db[uid].history.push({ id, action: '課程取消退點', time: new Date().toISOString() });
      }
    });

    delete courses[id];
    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);

    return replyText(replyToken, `✅ 課程已取消並退還 ${course.students.length} 筆點數`, teacherMenu);
  }

  // 統計報表 - 這邊可補充實作

  // 預設回覆
  return replyText(replyToken, '老師請使用選單或正確指令', teacherMenu);
}

// 新增課程多步驟處理函式
async function handleAddCourseSteps(event, user, db, courses) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const msg = event.message.text.trim();

  let session = addingCourseSessions[userId];
  if (!session) return;

  switch (session.step) {
    case 1: // 收課程名稱
      session.data.title = msg;
      session.step = 2;
      return replyText(replyToken, '請輸入課程時間（格式：YYYY-MM-DD HH:mm，如 2025-07-15 14:30）', teacherMenu);

    case 2: // 收課程時間
      // 簡單驗證格式
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(msg)) {
        return replyText(replyToken, '時間格式錯誤，請使用 YYYY-MM-DD HH:mm 格式重新輸入', teacherMenu);
      }
      session.data.time = msg;
      session.step = 3;
      return replyText(replyToken, '請輸入課程容量（數字）', teacherMenu);

    case 3: // 收容量
      const capacity = parseInt(msg);
      if (isNaN(capacity) || capacity <= 0) {
        return replyText(replyToken, '容量須為大於 0 的整數，請重新輸入', teacherMenu);
      }
      session.data.capacity = capacity;
      session.step= 4;
      const c = session.data;
      return replyText(replyToken,
        `請確認新增課程資訊：\n課程名稱：${c.title}\n時間：${c.time}\n容量：${c.capacity}\n\n回覆「確認」以新增，或回覆「取消」放棄。`,
        teacherMenu
      );

    case 4:
      if (msg === '確認') {
        // 新增課程
        const newId = Date.now().toString();
        courses[newId] = {
          title: session.data.title,
          time: session.data.time,
          capacity: session.data.capacity,
          students: [],
          waiting: [],
        };
        writeJSON(COURSE_FILE, courses);
        delete addingCourseSessions[userId];
        return replyText(replyToken, `✅ 課程新增成功！課程ID：${newId}`, teacherMenu);
      } else if (msg === '取消') {
        delete addingCourseSessions[userId];
        return replyText(replyToken, '❌ 新增課程已取消', teacherMenu);
      } else {
        return replyText(replyToken, '請回覆「確認」或「取消」', teacherMenu);
      }

    default:
      delete addingCourseSessions[userId];
      return replyText(replyToken, '新增課程流程中斷，請重新開始', teacherMenu);
  }
}

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 運行中');
});

app.listen(PORT, () => {
  console.log(`LINE Bot 伺服器已啟動，port: ${PORT}`);
  backupData();
});
