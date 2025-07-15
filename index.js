// ✅ V3.7：統一修正 quickReply 寫法 const express = require('express'); const fs = require('fs'); const path = require('path'); const line = require('@line/bot-sdk'); const axios = require('axios'); require('dotenv').config();

const app = express(); app.use('/webhook', express.raw({ type: '*/*' })); const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, }; const client = new line.Client(config);

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const BACKUP_DIR = './backup'; const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527'; const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || ''; const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}'); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}'); if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

function readJSON(file) { try { const content = fs.readFileSync(file, 'utf8'); return content ? JSON.parse(content) : {}; } catch { return {}; } }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function cleanCourses(courses) { const now = Date.now(); for (const id in courses) { const c = courses[id]; if (!c.title || !c.time || !c.students || !c.capacity) { delete courses[id]; continue; } if (!Array.isArray(c.students)) c.students = []; if (!Array.isArray(c.waiting)) c.waiting = []; if (new Date(c.time).getTime() < now - 86400000) { delete courses[id]; } } return courses; }

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

function promoteWaitlist(course, db) {
  while (course.students.length < course.capacity && course.waiting.length > 0) {
    const nextId = course.waiting.shift();
    if (!db[nextId] || db[nextId].points <= 0) continue;
    course.students.push(nextId);
    db[nextId].points--;
    db[nextId].history.push({
      id: course.id,
      action: '候補轉正',
      time: new Date().toISOString(),
    });
    client.pushMessage(nextId, {
      type: 'text',
      text: `🎉 你已從候補轉為課程「${course.title}」的正式學員！`,
    });
  }
}

function chunkArray(arr, size) { const result = []; for (let i = 0; i < arr.length; i += size) { result.push(arr.slice(i, i + size)); } return result; }

function replyText(token, text) { return client.replyMessage(token, { type: 'text', text }); }

const studentMenu = [ { type: 'message', label: '預約課程', text: '@預約課程' }, { type: 'message', label: '查詢課程', text: '@課程查詢' }, { type: 'message', label: '取消課程', text: '@取消課程' }, { type: 'message', label: '查詢點數', text: '@點數查詢' }, { type: 'message', label: '購買點數', text: '@購點' }, { type: 'message', label: '我的課程', text: '@我的課程' }, { type: 'message', label: '切換身份', text: '@切換身份' }, ];

const teacherMenu = [ { type: 'message', label: '今日名單', text: '@今日名單' }, { type: 'message', label: '新增課程', text: '@新增課程' }, { type: 'message', label: '查詢學員', text: '@查學員' }, { type: 'message', label: '加點', text: '@加點' }, { type: 'message', label: '扣點', text: '@扣點' }, { type: 'message', label: '取消課程', text: '@取消課程' }, { type: 'message', label: '統計報表', text: '@統計報表' }, { type: 'message', label: '切換身份', text: '@切換身份' }, ];

const pendingTeacherLogin = {};

function createQuickReplyMessage(text, menu) { return { type: 'text', text, quickReply: { items: menu.map(i => ({ type: 'action', action: i, })), }, }; }

app.post('/webhook', line.middleware(config), async (req, res) => { res.status(200).end(); try { await Promise.all(req.body.events.map(event => handleEvent(event))); } catch (err) { console.error('Webhook 錯誤:', err); } });

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

  // 身份切換
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '請輸入老師密碼：',
        quickReply: {
          items: studentMenu.map(i => ({ type: 'action', action: i })),
        },
      });
    } else {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '👩‍🎓 已切換為學員身份',
        quickReply: {
          items: studentMenu.map(i => ({ type: 'action', action: i })),
        },
      });
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '👨‍🏫 登入成功，已切換為老師身份',
        quickReply: {
          items: teacherMenu.map(i => ({ type: 'action', action: i })),
        },
      });
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '❌ 密碼錯誤，身份切換失敗');
    }
  }

  // 將事件導向對應角色指令處理
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
        action: { type: 'message', label: `${c.time} ${c.title}`, text: `我要預約 ${id}` }
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程');
    }

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇課程：',
      quickReply: { items: upcoming }
    });
  }

  if (msg.startsWith('我要預約')) {
    const id = msg.replace('我要預約', '').trim();
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在');

    if (!course.students) course.students = [];
    if (!course.waiting) course.waiting = [];

    if (course.students.includes(userId)) {
      return replyText(replyToken, '你已經預約此課程');
    }
    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '你已在候補名單中，請耐心等待');
    }

    if (user.points <= 0) {
      return replyText(replyToken, '點數不足，請先購買點數');
    }

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
      .filter(([id, c]) => c.students?.includes(userId) || c.waiting?.includes(userId))
      .map(([id, c]) => {
        const status = c.students?.includes(userId) ? '✅ 已預約' : '⏳ 候補中';
        return `${c.time}｜${c.title}｜${status}`;
      });
    const text = myCourses.length ? myCourses.join('\n') : '你目前沒有課程紀錄';
    return replyText(replyToken, text);
  }

  if (msg === '@購點') {
    const formUrl = 'https://forms.gle/your-form-url'; // 請替換成你的表單網址
    return replyText(replyToken, `請至下列表單填寫購點資訊：\n${formUrl}`);
  }

  return client.replyMessage(replyToken, {
    type: 'text',
    text: '請使用選單操作或輸入正確指令',
    quickReply: { items: studentMenu.map(i => ({ type: 'action', action: i })) },
  });
}

async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 今日名單
  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([id, c]) => c.time.startsWith(today));

    if (todayCourses.length === 0) return replyText(replyToken, '今天沒有課程');

    const lines = todayCourses.map(([id, c]) => {
      const studentList = c.students?.map(uid => db[uid]?.name || uid).join(', ') || '無';
      return `${c.time}｜${c.title}\n學員：${studentList}`;
    });

    return replyText(replyToken, lines.join('\n\n'));
  }

  // 加點/扣點
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

  // 查詢學員
  if (msg.startsWith('@查')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入學員ID，如：@查 U1234567890');
    const targetId = parts[1];
    const user = db[targetId];
    if (!user) return replyText(replyToken, '查無此人');
    const history = (user.history || []).map(h => `${h.time.split('T')[0]}｜${h.action} ${h.id}`).join('\n') || '無紀錄';
    return replyText(replyToken, `姓名：${user.name}\n點數：${user.points}\n紀錄：\n${history}`);
  }

  // 取消課程（退點 + 候補轉正）
  if (msg.startsWith('@取消')) {
    const parts = msg.split(' ');
    if (parts.length < 2) return replyText(replyToken, '請輸入課程ID，如：@取消 1625234567890');
    const id = parts[1];
    const course = courses[id];
    if (!course) return replyText(replyToken, '課程不存在');

    // 退還所有學生點數
    (course.students || []).forEach(uid => {
      if (db[uid]) {
        db[uid].points++;
        db[uid].history.push({ id, action: '課程取消退點', time: new Date().toISOString() });
      }
    });

    // 刪除課程
    delete courses[id];

    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);

    return replyText(replyToken, `✅ 課程已取消並退還 ${course.students.length} 筆點數`);
  }

  // 新增課程選單
  if (msg === '@新增課程') {
    const options = [
      { label: '週一 10:00 瑜伽', text: '@建立 週一 10:00 瑜伽' },
      { label: '週三 18:30 伸展', text: '@建立 週三 18:30 伸展' },
      { label: '週五 14:00 核心', text: '@建立 週五 14:00 核心' },
    ];

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇新增課程：',
      quickReply: { items: options.map(i => ({ type: 'action', action: { type: 'message', label: i.label, text: i.text } })) }
    });
  }

  // 建立課程
  if (msg.startsWith('@建立')) {
    const title = msg.replace('@建立', '').trim();
    if (!title) return replyText(replyToken, '請輸入課程名稱');
    const id = Date.now().toString();
    const datetime = new Date().toISOString().slice(0, 16).replace('T', ' ');
    courses[id] = { id, title, time: datetime, capacity: 5, students: [], waiting: [], notified: false };
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 課程「${title}」已新增。\n目前課程共 ${Object.keys(courses).length} 筆`);
  }

  // 管理員推播 (需設定環境變數 ADMIN_USER_ID)
  if (msg.startsWith('@廣播')) {
    const adminId = process.env.ADMIN_USER_ID || '';
    if (userId !== adminId) return replyText(replyToken, '只有管理員可以使用此功能');
    const broadcastMsg = msg.replace('@廣播', '').trim();
    if (!broadcastMsg) return replyText(replyToken, '請輸入要廣播的訊息');

    const dbAll = readJSON(DATA_FILE);
    const userIds = Object.keys(dbAll);

    // 分批廣播
    const batches = chunkArray(userIds, 50);
    for (const batch of batches) {
      await client.multicast(batch, { type: 'text', text: broadcastMsg });
    }

    return replyText(replyToken, `✅ 已廣播訊息給 ${userIds.length} 位用戶`);
  }

  return client.replyMessage(replyToken, {
    type: 'text',
    text: '老師請使用選單或正確指令',
    quickReply: { items: teacherMenu.map(i => ({ type: 'action', action: i })) },
  });
}

// 定時任務：課程提醒（每 10 分鐘檢查一次）
setInterval(async () => {
  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const now = Date.now();

  for (const [id, course] of Object.entries(courses)) {
    if (course.notified) continue;

    const courseTime = new Date(course.time).getTime();
    const diff = courseTime - now;

    // 課程前 30 分鐘發提醒
    if (diff > 0 && diff <= 30 * 60 * 1000) {
      // 通知所有學生（正式 + 候補已轉正的）
      for (const uid of course.students) {
        if (db[uid]) {
          try {
            await client.pushMessage(uid, {
              type: 'text',
              text: `⏰ 課程「${course.title}」將在 30 分鐘後開始，請準時參加！`,
            });
          } catch (err) {
            console.error(`推播錯誤: ${uid}`, err);
          }
        }
      }

      // 標記已提醒，避免重複推播
      course.notified = true;
    }
  }

  writeJSON(COURSE_FILE, courses);
}, 10 * 60 * 1000); // 每 10 分鐘

// HTTP 根路由，測試用
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 已啟動'));

// keep-alive：定時自我 ping，避免 Render 休眠
setInterval(() => {
  const keepAliveUrl = process.env.KEEP_ALIVE_URL || 'https://你的-render-app.onrender.com/';
  require('node-fetch')(keepAliveUrl).catch(() => {});
}, 5 * 60 * 1000); // 每 5 分鐘

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 運行中：port ${PORT}`);
});
