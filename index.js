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
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/d/e/your_form_id/viewform';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

// 儲存老師多階段狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};
const pendingCourseCancelSelect = {};  // 新增：課程取消選單化使用

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

function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = {
      items: menu.map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const teacherMenu = [
  { type: 'message', label: '課程名單', text: '@課程名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

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

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit',
  }).replace(/\//g, '-');
}

async function handleEvent(event) {
  if (event.type !== 'message' || !event.message.text) return;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }

  writeJSON(DATA_FILE, db);

  const text = event.message.text.trim();

  // 課程新增多步驟 (老師)
  if (pendingCourseCreation[userId]) {
    // --- 省略，請用之前版本新增課程多步驟程式碼 ---
    // 你有的流程可以保持不動，這段沒改
  }

  // 課程取消確認步驟 (老師)
  if (pendingCourseCancelConfirm[userId]) {
    const courseId = pendingCourseCancelConfirm[userId];
    const replyToken = event.replyToken;

    if (text === '是') {
      const courses = cleanCourses(readJSON(COURSE_FILE));
      const db = readJSON(DATA_FILE);
      const course = courses[courseId];
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return replyText(replyToken, '找不到該課程，取消失敗', teacherMenu);
      }
      // 退點
      course.students.forEach(stuId => {
        if (db[stuId]) {
          db[stuId].points++;
          db[stuId].history.push({ id: courseId, action: '課程取消退點', time: new Date().toISOString() });
        }
      });
      delete courses[courseId];
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, `課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);
    } else if (text === '否') {
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, '取消課程已取消', teacherMenu);
    } else {
      return replyText(replyToken, '請輸入「是」或「否」以確認是否取消課程');
    }
  }

  // 老師登入切換身份
  if (text === '@切換身份') {
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
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '老師登入成功', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '密碼錯誤，登入失敗', studentMenu);
    }
  }

  // 根據身份執行指令
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
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
          label: `${formatDateTime(c.time)} ${c.title}`,
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
    return replyText(replyToken, `✅ 已取消 ${count} 個候補課程`, studentMenu);
  }

  if (msg === '@我的課程') {
    const now = Date.now();
    const enrolled = Object.entries(courses).filter(([id, c]) => {
      return c.students.includes(userId) && new Date(c.time).getTime() > now;
    });
    if (enrolled.length === 0) {
      return replyText(event.replyToken, '你目前沒有預約任何課程', studentMenu);
    }
    let list = '你預約的課程：\n';
    enrolled.forEach(([id, c]) => {
      list += `${c.title} - ${formatDateTime(c.time)}\n`;
    });
    return replyText(event.replyToken, list, studentMenu);
  }

  if (msg === '@點數') {
    return replyText(event.replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  if (msg === '@購點') {
    return replyText(event.replyToken, `請點擊連結購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  return replyText(event.replyToken, '指令無效，請使用選單', studentMenu);
}

async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  // 課程取消選單化 - 入口
  if (msg === '@取消課程') {
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date());

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有可取消的課程', teacherMenu);
    }

    const quickItems = upcomingCourses.slice(0,13).map(([id, c]) => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title} (上限${c.capacity} 預約${c.students.length} 候補${c.waiting.length})`,
        text: `取消課程選擇 ${id}`,
      }
    }));

    pendingCourseCancelSelect[userId] = true;

    return replyText(replyToken, '請選擇欲取消的課程', quickItems);
  }

  // 老師點選課程選單後，進入確認流程
  if (pendingCourseCancelSelect[userId] && msg.startsWith('取消課程選擇 ')) {
    const courseId = msg.replace('取消課程選擇 ', '').trim();
    if (!courses[courseId]) {
      delete pendingCourseCancelSelect[userId];
      return replyText(replyToken, '找不到該課程，請重新操作', teacherMenu);
    }
    pendingCourseCancelConfirm[userId] = courseId;
    delete pendingCourseCancelSelect[userId];
    return replyText(replyToken, `請確認是否取消課程「${courses[courseId].title}」？\n輸入「是」確認，輸入「否」取消操作。`, teacherMenu);
  }

  // 其他老師指令保持不變
  if (msg === '@課程名單') {
    if (Object.keys(courses).length === 0) {
      return replyText(replyToken, '目前沒有任何課程', teacherMenu);
    }
    let list = '📋 已建立課程列表：\n';
    Object.entries(courses).forEach(([id, c]) => {
      list += `${new Date(c.time).getFullYear()}-${new Date(c.time).getMonth()+1}-${new Date(c.time).getDate()} ${c.title}／上限${c.capacity}／預約${c.students.length}／候補${c.waiting.length}\n`;
    });
    return replyText(replyToken, list, teacherMenu);
  }

  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱');
  }

  if (msg.startsWith('@取消課程 ')) {
    // 保留舊版以防需要
    const parts = msg.split(' ');
    if (parts.length < 2) {
      return replyText(replyToken, '請輸入欲取消的課程 ID，例如：@取消課程 course_1234567890', teacherMenu);
    }
    const courseId = parts[1];
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程 ID，請確認輸入正確', teacherMenu);
    }
    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(replyToken, `請確認是否取消課程「${courses[courseId].title}」？\n輸入「是」確認，輸入「否」取消操作。`, teacherMenu);
  }

  // TODO: 其他老師指令擴充...

  return replyText(replyToken, '指令無效，請使用選單', teacherMenu);
}

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
  setInterval(() => {
    console.log('Keep-alive ping');
    fetch(SELF_URL).catch(() => {});
  }, 1000 * 60 * 5);
});
