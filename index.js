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

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function replyText(token, text, quickReply = null) {
  const msg = { type: 'text', text };
  if (quickReply) msg.quickReply = quickReply;
  return client.replyMessage(token, msg);
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

const pendingTeacherLogin = {};
const courseCreationProgress = {};  // { userId: { step: 0-4, data: {...} } };

function createQuickReplyMessage(text, menu) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: menu.map(i => ({ type: 'action', action: i })),
    },
  };
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

  // 如果用戶正在新增課程中，走新增課程流程
  if (user.role === 'teacher' && courseCreationProgress[userId]) {
    return handleCourseCreationFlow(event, userId, db, courses);
  }

  // 身份切換指令
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return replyText(replyToken, '請輸入老師密碼：', {
        items: studentMenu.map(i => ({ type: 'action', action: i })),
      });
    } else {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '👩‍🎓 已切換為學員身份', {
        items: studentMenu.map(i => ({ type: 'action', action: i })),
      });
    }
  }

  // 老師密碼驗證
  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '👨‍🏫 登入成功，已切換為老師身份', {
        items: teacherMenu.map(i => ({ type: 'action', action: i })),
      });
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '❌ 密碼錯誤，身份切換失敗');
    }
  }

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
      .filter(([_, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'message',
          label: `${c.time} ${c.title}`,
          text: `我要預約 ${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程');
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
    if (!course) return replyText(replyToken, '查無該課程');

    if (!course.students) course.students = [];
    if (!course.waiting) course.waiting = [];

    if (course.students.includes(userId)) return replyText(replyToken, '你已經預約此課程');
    if (course.waiting.includes(userId)) return replyText(replyToken, '你已在候補名單中，請耐心等待');
    if (user.points <= 0) return replyText(replyToken, '點數不足，請先購買點數');

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      user.points--;
      user.history.push({ id, action: '預約', time: new Date().toISOString() });
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '✅ 已成功預約');
    } else {
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '課程額滿，已加入候補名單');
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
    return replyText(replyToken, `✅ 已取消 ${count} 筆候補`);
  }

  if (msg === '@點數' || msg === '@點數查詢') {
    return replyText(replyToken, `你目前有 ${user.points} 點`);
  }

  if (msg === '@我的課程') {
    const myCourses = Object.entries(courses)
      .filter(([_, c]) => c.students?.includes(userId) || c.waiting?.includes(userId))
      .map(([_, c]) => {
        const status = c.students?.includes(userId) ? '✅ 已預約' : '⏳ 候補中';
        return `${c.time}｜${c.title}｜${status}`;
      });
    const text = myCourses.length ? myCourses.join('\n') : '你目前沒有課程紀錄';
    return replyText(replyToken, text);
  }

  if (msg === '@購點') {
    const formUrl = 'https://forms.gle/your-form-url'; // 請替換為實際購點表單
    return replyText(replyToken, `請至下列表單填寫購點資訊：\n${formUrl}`);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', {
    items: studentMenu.map(i => ({ type: 'action', action: i })),
  });
}

async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([_, c]) => c.time.startsWith(today));

    if (todayCourses.length === 0) return replyText(replyToken, '今天沒有課程');

    const lines = todayCourses.map(([_, c]) => {
      const studentList = c.students?.map(uid => db[uid]?.name || uid).join(', ') || '無';
      return `${c.time}｜${c.title}\n學員：${studentList}`;
    });

    return replyText(replyToken, lines.join('\n\n'));
  }

  if (msg.startsWith('@加點') || msg.startsWith('@扣點')) {
    const parts = msg.split(' ');
    if (parts.length < 3) return replyText(replyToken, '格式錯誤，請使用 @加點|@扣點 [學員ID] [數量]');
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyText(replyToken, '找不到此學員');
    if (isNaN(amount) || amount <= 0) return replyText(replyToken, '數量需為正整數');

    if (msg.startsWith('@加點')) {
      db[targetId].points += amount;
    } else {
      db[targetId].points = Math.max(0, db[targetId].points - amount);
    }

    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `✅ 已${msg.startsWith('@加點') ? '加' : '扣'}點 ${amount} 點，剩餘 ${db[targetId].points} 點`);
  }

  if (msg.startsWith('@查')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入學員ID，如：@查 U1234567890');
    const targetId = parts[1];
    const user = db[targetId];
    if (!user) return replyText(replyToken, '查無相關資料');
    const history = (user.history || []).map(h => `${h.time.split('T')[0]}｜${h.action} ${h.id}`).join('\n') || '無紀錄';
    return replyText(replyToken, `姓名：${user.name}\n點數：${user.points}\n紀錄：\n${history}`);
  }

  if (msg.startsWith('@取消')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入課程ID，如：@取消 1625234567890');
    const id = parts[1];
    const course = courses[id];
    if (!course) return replyText(replyToken, '查無相關資料');

    (course.students || []).forEach(uid => {
      if (db[uid]) {
        db[uid].points++;
        db[uid].history.push({ id, action: '課程取消退點', time: new Date().toISOString() });
      }
    });

    delete courses[id];
    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);

    return replyText(replyToken, `✅ 課程已取消並退還 ${course.students.length} 筆點數`);
  }

  if (msg === '@新增課程') {
    courseCreationProgress[userId] = { step: 0, data: {} };
    return replyText(replyToken, '請輸入課程名稱：');
  }

  return replyText(replyToken, '老師請使用選單或正確指令', {
    items: teacherMenu.map(i => ({ type: 'action', action: i })),
  });
}

async function handleCourseCreationFlow(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  const progress = courseCreationProgress[userId];
  if (!progress) return;

  switch (progress.step) {
    case 0:
      // 課程名稱
      if (!msg) return replyText(replyToken, '課程名稱不能空白，請重新輸入：');
      progress.data.title = msg;
      progress.step++;
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '請選擇課程日期：', {
        items: [
          { type: 'action', action: { type: 'message', label: '週一', text: '@日期 週一' } },
          { type: 'action', action: { type: 'message', label: '週二', text: '@日期 週二' } },
          { type: 'action', action: { type: 'message', label: '週三', text: '@日期 週三' } },
          { type: 'action', action: { type: 'message', label: '週四', text: '@日期 週四' } },
          { type: 'action', action: { type: 'message', label: '週五', text: '@日期 週五' } },
          { type: 'action', action: { type: 'message', label: '週六', text: '@日期 週六' } },
          { type: 'action', action: { type: 'message', label: '週日', text: '@日期 週日' } },
        ],
      });

    case 1:
      // 課程日期
      if (!msg.startsWith('@日期 ')) return replyText(replyToken, '請使用選單選擇日期');
      progress.data.weekday = msg.replace('@日期 ', '').trim();
      progress.step++;
      // 時間選擇 0~23
      const timeOptions = [];
      for (let h = 0; h < 24; h++) {
        const label = `${h.toString().padStart(2, '0')}:00`;
        timeOptions.push({
          type: 'action',
          action: { type: 'message', label, text: `@時間 ${label}` },
        });
      }
      return replyText(replyToken, '請選擇課程時間（24小時制）：', { items: timeOptions });

    case 2:
      // 課程時間
      if (!msg.startsWith('@時間 ')) return replyText(replyToken, '請使用選單選擇時間');
      progress.data.time = msg.replace('@時間 ', '').trim();
      progress.step++;
      return replyText(replyToken, '請輸入人員上限（數字）：');

    case 3:
      // 人員上限
      const capacity = parseInt(msg);
      if (isNaN(capacity) || capacity <= 0) {
        return replyText(replyToken, '人員上限需為正整數，請重新輸入：');
      }
      progress.data.capacity = capacity;
      progress.step++;
      return replyText(replyToken,
        `請確認是否建立課程：\n` +
        `名稱：${progress.data.title}\n` +
        `日期：${progress.data.weekday}\n` +
        `時間：${progress.data.time}\n` +
        `人數上限：${progress.data.capacity}\n\n` +
        `回覆「確認」建立，或「取消」放棄。`
      );

    case 4:
      if (msg === '確認') {
        // 生成課程ID
        const newId = Date.now().toString();
        // 將 weekday + time 轉換成日期字串（此處簡化為當周對應日期）
        const weekdayMap = { '週一':1, '週二':2, '週三':3, '週四':4, '週五':5, '週六':6, '週日':0 };
        const now = new Date();
        const targetWeekday = weekdayMap[progress.data.weekday];
        if (targetWeekday === undefined) {
          delete courseCreationProgress[userId];
          return replyText(replyToken, '日期有誤，請重新新增課程。');
        }
        const diff = (targetWeekday + 7 - now.getDay()) % 7;
        const courseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
        // 把時間字串 "HH:00" 轉成小時
        const hour = parseInt(progress.data.time.split(':')[0]);
        courseDate.setHours(hour, 0, 0, 0);

        courses[newId] = {
          title: progress.data.title,
          time: courseDate.toISOString().slice(0,16).replace('T', ' '),
          capacity: progress.data.capacity,
          students: [],
          waiting: [],
        };
        writeJSON(COURSE_FILE, courses);
        delete courseCreationProgress[userId];
        return replyText(replyToken, `✅ 課程已建立：${progress.data.title}，時間：${courses[newId].time}，人數上限：${progress.data.capacity}`);
      } else if (msg === '取消') {
        delete courseCreationProgress[userId];
        return replyText(replyToken, '課程建立已取消。');
      } else {
        return replyText(replyToken, '請回覆「確認」或「取消」');
      }

    default:
      delete courseCreationProgress[userId];
      return replyText(replyToken, '課程建立流程異常，已取消。');
  }
}

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 服務中');
});

app.listen(PORT, () => {
  console.log(`🚀 九容瑜伽 LINE Bot 正在執行，port：${PORT}`);
  setInterval(backupData, 1000 * 60 * 60 * 6); // 每6小時備份一次
});
