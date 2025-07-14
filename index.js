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

app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end();

  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
  }
});

app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

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

  courses = cleanCourses(courses);

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

// 身份切換與登入流程
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return replyQuickReply(event.replyToken, '請輸入老師密碼以切換身份', []);
    }
    if (user.role === 'teacher') {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return replyQuickReply(event.replyToken, '已切換為學員身份', studentMenu);
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return replyQuickReply(event.replyToken, '登入成功，已切換為老師身份', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyQuickReply(event.replyToken, '密碼錯誤，請重新操作', studentMenu);
    }
  }

  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses);
  } else {
    return replyQuickReply(event.replyToken, '請選擇您的身份：', studentMenu);
  }
}

function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return replyQuickReply(replyToken, `您目前剩餘點數為：${user.points} 點。`, studentMenu);
  }

  if (msg === '@課程查詢') {
    const bookedCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (bookedCourses.length === 0) {
      return replyQuickReply(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = bookedCourses
      .map(([_, c]) => `${c.name} (${c.date})`)
      .join('\n');
    return replyQuickReply(replyToken, `📘 您已預約的課程：\n${list}`, studentMenu);
  }

  if (msg === '@預約課程') {
    const allCourses = Object.entries(courses);
    if (allCourses.length === 0) {
      return replyQuickReply(replyToken, '目前無相關課程。', studentMenu);
    }

    const actions = allCourses.slice(0, 12).map(([id, c]) => ({
      type: 'message',
      label: c.name.length > 10 ? c.name.slice(0, 10) : c.name,
      text: `預約 ${id}`
    }));

    return replyQuickReply(replyToken, '請點選要預約的課程：', actions);
  }

  if (/^預約 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyQuickReply(replyToken, '找不到該課程編號', studentMenu);
    if (course.students.includes(userId)) return replyQuickReply(replyToken, '您已預約此課程', studentMenu);
    if (course.waitlist.includes(userId)) return replyQuickReply(replyToken, '您已在候補名單中', studentMenu);
    if (user.points <= 0) return replyQuickReply(replyToken, '點數不足', studentMenu);

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyQuickReply(replyToken, '✅ 預約成功，已扣除 1 點', studentMenu);
    } else {
      course.waitlist.push(userId);
      writeJSON(COURSE_FILE, courses);
      const position = course.waitlist.indexOf(userId) + 1;
      return replyQuickReply(replyToken, `⚠️ 名額已滿，您已加入候補名單\n目前順位：${position}，如有空位將自動轉正。`, studentMenu);
    }
  }

  if (msg === '@我的課程') {
    const my = user.history.map(h => {
      const c = courses[h.courseId];
      return c
        ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
        : `已刪除課程 ${h.courseId}`;
    }).join('\n') || '尚無預約紀錄';
    return replyQuickReply(replyToken, my, studentMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyQuickReply(replyToken, '找不到該課程', studentMenu);

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
      return replyQuickReply(replyToken, '✅ 已取消預約並退回 1 點', studentMenu);
    }

    const waitIdx = course.waitlist.indexOf(userId);
    if (waitIdx >= 0) {
      course.waitlist.splice(waitIdx, 1);
      writeJSON(COURSE_FILE, courses);
      return replyQuickReply(replyToken, '✅ 已取消候補名單', studentMenu);
    }

    return replyQuickReply(replyToken, '您未預約或候補此課程', studentMenu);
  }

  if (msg === '@購點') {
    return replyQuickReply(replyToken,
      '請填寫購點表單：https://yourform.url\n銀行：中國信托（822）\n帳號：012540278393\n轉帳末五碼請填寫表單\n💰 方案：5點500元、10點1000元、50點5000元',
      studentMenu
    );
  }

  return replyQuickReply(replyToken, '請使用選單操作或正確指令。', studentMenu);
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
    return replyQuickReply(replyToken, list, teacherMenu);
  }

  if (msg.startsWith('@新增課程')) {
    const parts = msg.split(' ');
    if (parts.length < 5) {
      return replyQuickReply(replyToken, '格式：@新增課程 課名 日期 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu);
    }
    const name = parts[1];
    const date = `${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}`;
    const max = parseInt(parts[4]);
    const id = `course_${Date.now()}`;
    courses[id] = { name, date, max, students: [], waitlist: [] };
    writeJSON(COURSE_FILE, courses);
    return replyQuickReply(replyToken, `✅ 已新增課程：${name}`, teacherMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyQuickReply(replyToken, '找不到課程', teacherMenu);

    course.students.forEach(uid => {
      if (db[uid]) db[uid].points += 1;
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyQuickReply(replyToken, `✅ 已取消課程 ${courseId} 並退回點數`, teacherMenu);
  }

  if (msg === '@查學員') {
    const list = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)} 點數：${u.points}｜預約：${u.history.length}`)
      .join('\n') || '沒有學員資料';
    return replyQuickReply(replyToken, list, teacherMenu);
  }

  if (/^@查學員 /.test(msg)) {
    const targetId = msg.split(' ')[1];
    const stu = db[targetId];
    if (!stu) return replyQuickReply(replyToken, '找不到該學員', teacherMenu);
    const record = stu.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date})` : `❌ ${h.courseId}`;
    }).join('\n') || '無預約紀錄';
    return replyQuickReply(replyToken, `點數：${stu.points}\n紀錄：\n${record}`, teacherMenu);
  }

  if (/^@加點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return replyQuickReply(replyToken, '找不到該學員', teacherMenu);
    db[targetId].points += parseInt(amount);
    writeJSON(DATA_FILE, db);
    return replyQuickReply(replyToken, `✅ 已為 ${targetId} 加點 ${amount}`, teacherMenu);
  }

  if (/^@扣點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return replyQuickReply(replyToken, '找不到該學員', teacherMenu);
    db[targetId].points -= parseInt(amount);
    writeJSON(DATA_FILE, db);
    return replyQuickReply(replyToken, `✅ 已為 ${targetId} 扣點 ${amount}`, teacherMenu);
  }

  if (msg === '@統計報表') {
    const summary = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `學員 ${u.name || id.slice(-4)}：${u.history.length} 堂課`)
      .join('\n') || '尚無預約紀錄';
    return replyQuickReply(replyToken, summary, teacherMenu);
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
    return replyQuickReply(replyToken, '✅ 已發送廣播訊息', teacherMenu);
  }

  return replyQuickReply(replyToken, '請使用選單操作或正確指令。', teacherMenu);
}

function replyText(replyToken, text) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
  });
}

function replyQuickReply(replyToken, text, items) {
  const quickReply = items.length > 0 ? {
    quickReply: {
      items: items.map(i => ({
        type: 'action',
        action: i,
      })),
    }
  } : {};
  
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    ...quickReply,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 啟動，監聽埠號：${PORT}`);
});

// Keep-alive 簡易自我 ping，避免空閒斷線
setInterval(() => {
  require('http').get(`http://localhost:${PORT}/`);
}, 4 * 60 * 1000); // 每4分鐘 ping 一次
