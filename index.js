const express = require('express');
const fs = require('fs');
const path = require('path');
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
const BACKUP_DIR = './backup';

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

// 初始化資料檔案與目錄
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

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

// 清理過期課程
function cleanCourses(courses) {
  const now = Date.now();
  for (const id in courses) {
    const c = courses[id];
    if (!c.name || !c.date || !c.students || !c.max) {
      delete courses[id];
      continue;
    }
    if (!Array.isArray(c.students)) c.students = [];
    if (!Array.isArray(c.waitlist)) c.waitlist = [];
    if (new Date(c.date).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}

// 備份資料
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`備份成功：${timestamp}`);
  } catch (err) {
    console.error('備份失敗:', err);
  }
}

// 建立 Quick Reply 訊息
function createQuickReplyMessage(text, menu) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: menu.map(i => ({
        type: 'action',
        action: i,
      })),
    },
  };
}

// 快速選單設定
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

// Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end();
  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = readJSON(DATA_FILE);
  let courses = readJSON(COURSE_FILE);
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

  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return client.replyMessage(event.replyToken, createQuickReplyMessage('請輸入老師密碼以切換身份', []));
    } else if (user.role === 'teacher') {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return client.replyMessage(event.replyToken, createQuickReplyMessage('已切換為學員身份', studentMenu));
    }
  }

  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return client.replyMessage(event.replyToken, createQuickReplyMessage('登入成功，已切換為老師身份', teacherMenu));
    } else {
      delete pendingTeacherLogin[userId];
      return client.replyMessage(event.replyToken, createQuickReplyMessage('密碼錯誤，請重新操作', studentMenu));
    }
  }

  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses);
  }
}

async function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@點數查詢') {
    return client.replyMessage(replyToken, createQuickReplyMessage(`您目前剩餘點數為：${user.points} 點。`, studentMenu));
  }

  if (msg === '@預約課程') {
    const allCourses = Object.entries(courses).filter(([_, c]) => c.name && c.date);
    if (allCourses.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('目前無相關課程。', studentMenu));
    }

    const quickItems = allCourses.map(([id, c]) => ({
      type: 'message',
      label: `${c.name} (${c.date})`,
      text: `預約 ${id}`
    }));

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲預約的課程：',
      quickReply: { items: quickItems }
    });
  }

  if (/^預約 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該課程編號', studentMenu));
    if (course.students.includes(userId)) return client.replyMessage(replyToken, createQuickReplyMessage('您已預約此課程', studentMenu));
    if (user.points <= 0) return client.replyMessage(replyToken, createQuickReplyMessage('點數不足', studentMenu));

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return client.replyMessage(replyToken, createQuickReplyMessage('✅ 預約成功，已扣除 1 點', studentMenu));
    } else {
      return client.replyMessage(replyToken, createQuickReplyMessage('課程已滿，無法預約', studentMenu));
    }
  }

  if (msg === '@課程查詢') {
    const allCourses =Object.entries(courses).filter(([_, c]) => c.name && c.date);
    if (allCourses.length === 0) {
      return client.replyMessage(event.replyToken, createQuickReplyMessage('目前無相關課程。', studentMenu));
    }
    let text = '目前課程列表：\n';
    allCourses.forEach(([id, c]) => {
      text += `${id}: ${c.name} (${c.date})  剩餘名額: ${c.max - c.students.length}\n`;
    });
    return client.replyMessage(event.replyToken, createQuickReplyMessage(text, studentMenu));
  }

  if (msg === '@取消課程') {
    // 找出該學生已預約的課程
    const userCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (userCourses.length === 0) {
      return client.replyMessage(event.replyToken, createQuickReplyMessage('您目前沒有預約任何課程。', studentMenu));
    }
    const quickItems = userCourses.map(([id, c]) => ({
      type: 'message',
      label: `${c.name} (${c.date})`,
      text: `取消 ${id}`,
    }));
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請選擇欲取消的課程：',
      quickReply: { items: quickItems }
    });
  }

  if (/^取消 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(event.replyToken, createQuickReplyMessage('找不到該課程編號', studentMenu));
    if (!course.students.includes(userId)) return client.replyMessage(event.replyToken, createQuickReplyMessage('您尚未預約此課程', studentMenu));

    course.students = course.students.filter(id => id !== userId);
    user.points += 1; // 取消退還點數
    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);
    return client.replyMessage(event.replyToken, createQuickReplyMessage('已取消課程，並退還 1 點。', studentMenu));
  }

  if (msg === '@我的課程') {
    const myCourses = Object.entries(courses).filter(([_, c]) => c.students.includes(userId));
    if (myCourses.length === 0) {
      return client.replyMessage(event.replyToken, createQuickReplyMessage('您尚未預約任何課程。', studentMenu));
    }
    let text = '您已預約的課程：\n';
    myCourses.forEach(([id, c]) => {
      text += `${c.name} (${c.date})\n`;
    });
    return client.replyMessage(event.replyToken, createQuickReplyMessage(text, studentMenu));
  }

  if (msg === '@購點') {
    return client.replyMessage(event.replyToken, createQuickReplyMessage('請聯絡老師進行點數購買。', studentMenu));
  }

  return client.replyMessage(event.replyToken, createQuickReplyMessage('無法識別指令，請選擇功能。', studentMenu));
}

async function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([_, c]) => c.date === today);
    if (todayCourses.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('今天無課程。', teacherMenu));
    }
    let text = '今日課程名單：\n';
    todayCourses.forEach(([id, c]) => {
      text += `課程：${c.name} 時間：${c.date}\n學員：\n`;
      c.students.forEach(sid => {
        const studentName = db[sid]?.name || sid;
        text += `- ${studentName}\n`;
      });
      text += '\n';
    });
    return client.replyMessage(replyToken, createQuickReplyMessage(text, teacherMenu));
  }

  if (msg === '@新增課程') {
    user.creatingCourse = true;
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage('請輸入新增課程資訊，格式：名稱|YYYY-MM-DD|最大人數', teacherMenu));
  }

  if (user.creatingCourse) {
    const parts = msg.split('|');
    if (parts.length !== 3) {
      return client.replyMessage(replyToken, createQuickReplyMessage('格式錯誤，請用 名稱|YYYY-MM-DD|最大人數', teacherMenu));
    }
    const [name, date, maxStr] = parts;
    const max = parseInt(maxStr, 10);
    if (!name || !date || isNaN(max) || max <= 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('資料不正確，請重新輸入。', teacherMenu));
    }
    const id = 'c' + Date.now();
    courses[id] = {
      name,
      date,
      max,
      students: [],
      waitlist: [],
    };
    user.creatingCourse = false;
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);

    // 列出所有課程
    let text = '新增成功，課程列表如下：\n';
    Object.entries(courses).forEach(([cid, c]) => {
      text += `${cid}: ${c.name} (${c.date})  最大人數: ${c.max}  已預約: ${c.students.length}\n`;
    });
    return client.replyMessage(replyToken, createQuickReplyMessage(text, teacherMenu));
  }

  if (msg === '@查學員') {
    // 老師查學員點數列表
    let text = '學員點數列表：\n';
    Object.entries(db).forEach(([uid, u]) => {
      if (u.role === 'student') text += `${u.name}: ${u.points} 點\n`;
    });
    return client.replyMessage(replyToken, createQuickReplyMessage(text, teacherMenu));
  }

  if (/^@加點 /.test(msg)) {
    const parts = msg.split(' ');
    if (parts.length !== 3) {
      return client.replyMessage(replyToken, createQuickReplyMessage('格式錯誤，範例：@加點 userId 數量', teacherMenu));
    }
    const [_, targetId, addStr] = parts;
    const addPoints = parseInt(addStr, 10);
    if (!db[targetId]) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該學員', teacherMenu));
    if (isNaN(addPoints) || addPoints <= 0) return client.replyMessage(replyToken, createQuickReplyMessage('點數數字錯誤', teacherMenu));
    db[targetId].points = (db[targetId].points || 0) + addPoints;
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage(`已加 ${addPoints} 點給 ${db[targetId].name}`, teacherMenu));
  }

  if (/^@扣點 /.test(msg)) {
    const parts = msg.split(' ');
    if (parts.length !== 3) {
      return client.replyMessage(replyToken, createQuickReplyMessage('格式錯誤，範例：@扣點 userId 數量', teacherMenu));
    }
    const [_, targetId, subStr] = parts;
    const subPoints = parseInt(subStr, 10);
    if (!db[targetId]) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該學員', teacherMenu));
    if (isNaN(subPoints) || subPoints <= 0) return client.replyMessage(replyToken, createQuickReplyMessage('點數數字錯誤', teacherMenu));
    db[targetId].points = Math.max(0, (db[targetId].points || 0) - subPoints);
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage(`已扣 ${subPoints} 點給 ${db[targetId].name}`, teacherMenu));
  }

  if (msg === '@取消課程') {
    const courseList = Object.entries(courses);
    if (courseList.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('目前無課程可取消。', teacherMenu));
    }
    const quickItems = courseList.map(([id, c]) => ({
      type: 'message',
      label: `${c.name} (${c.date})`,
      text: `刪除課程 ${id}`,
    }));
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲取消的課程：',
      quickReply: { items: quickItems }
    });
  }

  if (/^刪除課程 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    if (!courses[courseId]) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該課程', teacherMenu));
    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    return client.replyMessage(replyToken, createQuickReplyMessage('課程已刪除。', teacherMenu));
  }

  if (msg === '@統計報表') {
    // 簡單列出每課程人數
    let text = '課程統計報表：\n';
    Object.entries(courses).forEach(([id, c]) => {
      text += `${c.name} (${c.date}): 已預約 ${c.students.length} 人\n`;
    });
    return client.replyMessage(replyToken, createQuickReplyMessage(text, teacherMenu));
  }

  return client.replyMessage(replyToken, createQuickReplyMessage('無法識別指令，請選擇功能。', teacherMenu));
}

async function replyText(token, text) {
  return client.replyMessage(token, { type: 'text', text });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`九容瑜伽 LINE Bot 啟動，監聽端口 ${port}`);
  backupData();
});
