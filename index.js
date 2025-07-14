// V2.4.5 修正： // 1. webhook 處理改 async/await 並加入錯誤捕捉 // 2. handleStudentCommands / handleTeacherCommands 改為 async 並正確 return // 3. 加入 log 協助除錯

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { try { const content = fs.readFileSync(file, 'utf8'); return content ? JSON.parse(content) : {}; } catch { return {}; } }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'message', label: '預約課程', text: '@預約課程' }, { type: 'message', label: '查詢課程', text: '@課程查詢' }, { type: 'message', label: '取消課程', text: '@取消課程' }, { type: 'message', label: '查詢點數', text: '@點數查詢' }, { type: 'message', label: '購買點數', text: '@購點' }, { type: 'message', label: '我的課程', text: '@我的課程' }, { type: 'message', label: '切換身份', text: '@切換身份' }, ];

const teacherMenu = [ { type: 'message', label: '今日名單', text: '@今日名單' }, { type: 'message', label: '新增課程', text: '@新增課程' }, { type: 'message', label: '查詢學員', text: '@查學員' }, { type: 'message', label: '加點', text: '@加點' }, { type: 'message', label: '扣點', text: '@扣點' }, { type: 'message', label: '取消課程', text: '@取消課程' }, { type: 'message', label: '統計報表', text: '@統計報表' }, { type: 'message', label: '切換身份', text: '@切換身份' }, ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), async (req, res) => { res.status(200).end(); try { await Promise.all(req.body.events.map(event => handleEvent(event))); } catch (err) { console.error('Webhook 處理錯誤:', err); } });

app.get('/', (req, res) => { res.status(200).send('九容瑜伽 LINE Bot 正常運作中'); });

setInterval(() => { const url = process.env.KEEP_ALIVE_URL || 'https://your-render-app-url.onrender.com'; fetch(url).catch(err => console.error('Keep alive 失敗:', err)); }, 5 * 60 * 1000);

async function handleEvent(event) { if (event.type !== 'message' || event.message.type !== 'text') return; const userId = event.source.userId; const msg = event.message.text.trim(); console.log('收到訊息:', msg, '來自:', userId);

let db = {}, courses = {}; try { db = readJSON(DATA_FILE); courses = readJSON(COURSE_FILE); } catch (e) { console.error('讀取資料錯誤:', e); return replyText(event.replyToken, '⚠️ 系統發生錯誤，請稍後再試'); }

courses = cleanCourses(courses);

if (!db[userId]) { try { const profile = await client.getProfile(userId); db[userId] = { name: profile.displayName || '未命名', role: 'student', points: 0, history: [], }; writeJSON(DATA_FILE, db); } catch (e) { console.error('取得用戶資料失敗:', e); return replyText(event.replyToken, '⚠️ 無法取得您的資料，請稍後再試'); } }

const user = db[userId];

if (pendingTeacherLogin[userId]) { if (msg === TEACHER_PASSWORD) { user.role = 'teacher'; delete pendingTeacherLogin[userId]; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '✅ 登入成功，您已切換為老師身份。', teacherMenu); } else { delete pendingTeacherLogin[userId]; return replyWithMenu(event.replyToken, '❌ 密碼錯誤，已取消切換。', user.role === 'teacher' ? teacherMenu : studentMenu); } }

if (msg === '@我是老師') { pendingTeacherLogin[userId] = true; return replyWithMenu(event.replyToken, '請輸入老師密碼（四位數字）：', user.role === 'teacher' ? teacherMenu : studentMenu); }

if (msg === '@我是學員') { user.role = 'student'; writeJSON(DATA_FILE, db); return replyWithMenu(event.replyToken, '您現在是學員身份。', studentMenu); }

if (msg === '@切換身份') { return sendRoleSelection(event.replyToken); }

if (user.role === 'student') { return await handleStudentCommands(event, userId, msg, user, db, courses); } else if (user.role === 'teacher') { return await handleTeacherCommands(event, userId, msg, user, db, courses); } else { return sendRoleSelection(event.replyToken); } }

async function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return replyWithMenu(replyToken, `您目前剩餘點數為：${user.points} 點。`, studentMenu);
  }

  if (msg === '@課程查詢') {
    const bookedCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (bookedCourses.length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = bookedCourses.map(([_, c]) => `${c.name} (${c.date})`).join('\n');
    return replyWithMenu(replyToken, `📘 您已預約的課程：\n${list}`, studentMenu);
  }

  if (msg === '@預約課程') {
    const list = Object.entries(courses)
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');
    if (!list) return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
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
      user.points -= 1;
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
    const list = user.history.map(h => {
      const c = courses[h.courseId];
      return c
        ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
        : `❌ 已刪除課程 ${h.courseId}`;
    }).join('\n') || '尚無預約紀錄';
    return replyWithMenu(replyToken, list, studentMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到該課程', studentMenu);

    const idx = course.students.indexOf(userId);
    if (idx >= 0) {
      course.students.splice(idx, 1);
      user.points += 1;

      // 候補轉正
      if (course.waitlist.length > 0) {
        const nextId = course.waitlist.shift();
        course.students.push(nextId);
        if (db[nextId]) {
          db[nextId].points -= 1;
          db[nextId].history.push({ courseId, time: new Date().toISOString() });
          client.pushMessage(nextId, {
            type: 'text',
            text: `📢 您已從候補轉為正取：${course.name}（${course.date}）`
          }).catch(console.error);
        }
      }

      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyWithMenu(replyToken, '✅ 已取消並退回 1 點', studentMenu);
    } else {
      return replyWithMenu(replyToken, '您未預約此課程', studentMenu);
    }
  }

  if (msg === '@購點') {
    return replyWithMenu(replyToken, '💰 請填寫購點表單：https://yourform.url\n每點 NT$100', studentMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', studentMenu);
}

async function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses)
      .filter(([_, c]) => c.date.startsWith(today))
      .map(([id, c]) => {
        const names = c.students.map(uid => db[uid]?.name || uid.slice(-4)).join(', ') || '無';
        return `📌 ${c.name} (${c.date})\n👥 ${c.students.length}人：${names}`;
      }).join('\n\n') || '今天沒有課程';
    return replyWithMenu(replyToken, todayCourses, teacherMenu);
  }

  if (msg.startsWith('@新增課程')) {
    const parts = msg.split(' ');
    if (parts.length < 5) {
      return replyWithMenu(replyToken, '格式錯誤：@新增課程 課名 月/日 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu);
    }
    const name = parts[1];
    const dateStr = parts[2].includes('/') ? `${new Date().getFullYear()}-${parts[2].replace('/', '-')}` : parts[2];
    const datetime = `${dateStr} ${parts[3]}`;
    const max = parseInt(parts[4]);
    const id = `course_${Date.now()}`;
    courses[id] = { name, date: datetime, max, students: [], waitlist: [] };
    writeJSON(COURSE_FILE, courses);
    return replyWithMenu(replyToken, `✅ 已新增課程：${name} (${datetime})`, teacherMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到課程', teacherMenu);

    // 退還點數
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
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)}：${u.points} 點，預約 ${u.history.length} 堂`)
      .join('\n') || '尚無學員資料';
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
    return replyWithMenu(replyToken, `點數：${stu.points}\n預約紀錄：\n${record}`, teacherMenu);
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
      .map(([id, u]) => `📊 ${u.name || id.slice(-4)}：${u.history.length} 堂`)
      .join('\n') || '尚無資料';
    return replyWithMenu(replyToken, summary, teacherMenu);
  }

  if (msg.startsWith('@廣播 ')) {
    const text = msg.replace('@廣播 ', '');
    const targets = Object.entries(db).filter(([_, u]) => u.role === 'student');
    for (const [id] of targets) {
      client.pushMessage(id, {
        type: 'text',
        text: `📢 系統通知：${text}`
      }).catch(console.error);
    }
    return replyWithMenu(replyToken, `✅ 已廣播給 ${targets.length} 位學員`, teacherMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', teacherMenu);
}

function cleanCourses(courses) {
  for (const id in courses) {
    const c = courses[id];
    if (!c.name || !c.date || !c.students || !c.max) {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waitlist)) c.waitlist = [];
  }
  return courses;
}

function replyWithMenu(replyToken, text, menu) {
  return client.replyMessage(replyToken, [
    { type: 'text', text },
    {
      type: 'template',
      altText: '功能選單',
      template: {
        type: 'buttons',
        text: '請選擇功能',
        actions: menu,
      }
    }
  ]);
}

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
  });
}

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
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽埠號：${PORT}`);
});

// Keep-alive 機制（每 5 分鐘 ping 自己，防止 Render 等平台休眠）
setInterval(() => {
  const url = process.env.KEEP_ALIVE_URL || 'https://your-render-app-url.onrender.com';
  fetch(url).catch(err => console.error('⛔ Keep-alive 失敗:', err));
}, 5 * 60 * 1000);
