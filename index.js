// index.js - V3.11.1
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

function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) msg.quickReply = { items: menu.map(i => ({ type: 'action', action: i })) };
  return client.replyMessage(token, msg);
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


function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));

  if (!db[userId]) {
    return client.getProfile(userId).then(profile => {
      db[userId] = {
        name: profile.displayName,
        role: 'student',
        points: 0,
        history: [],
      };
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '👋 歡迎使用九容瑜伽 LINE Bot！', studentMenu);
    });
  }

  const user = db[userId];

  if (pendingTeacherLogin[userId]) {
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '✅ 老師身份登入成功！', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '❌ 密碼錯誤，請重新切換身份。', studentMenu);
    }
  }

  if (pendingCourseCreation[userId]) {
    return handleCourseCreationFlow(event, user, db, courses);
  }

  if (msg === '@切換身份') {
    if (user.role === 'student') {
      pendingTeacherLogin[userId] = true;
      return replyText(replyToken, '請輸入老師密碼：', []);
    } else {
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '已切換為學員身份', studentMenu);
    }
  }

  if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, user, db, courses);
  }
}

async function handleCourseCreationFlow(event, user, db, courses) {
  const userId = event.source.userId;
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;
  const step = pendingCourseCreation[userId].step;
  const data = pendingCourseCreation[userId].data || {};

  switch (step) {
    case 1: // 課程名稱
      if (!msg) return replyText(replyToken, '請輸入課程名稱：', []);
      data.title = msg;
      pendingCourseCreation[userId] = { step: 2, data };
      return replyText(replyToken, '請選擇課程日期（禮拜幾）：', [
        { type: 'message', label: '星期一', text: '@日期 星期一' },
        { type: 'message', label: '星期二', text: '@日期 星期二' },
        { type: 'message', label: '星期三', text: '@日期 星期三' },
        { type: 'message', label: '星期四', text: '@日期 星期四' },
        { type: 'message', label: '星期五', text: '@日期 星期五' },
        { type: 'message', label: '星期六', text: '@日期 星期六' },
        { type: 'message', label: '星期日', text: '@日期 星期日' },
      ]);
    case 2: // 課程日期
      if (!msg.startsWith('@日期 ')) return replyText(replyToken, '請使用選單選擇課程日期：');
      data.weekday = msg.replace('@日期 ', '').trim();
      pendingCourseCreation[userId] = { step: 3, data };
      return replyText(replyToken, '請選擇課程時間（24小時制）：', [
        { type: 'message', label: '08:00', text: '@時間 08:00' },
        { type: 'message', label: '10:00', text: '@時間 10:00' },
        { type: 'message', label: '12:00', text: '@時間 12:00' },
        { type: 'message', label: '14:00', text: '@時間 14:00' },
        { type: 'message', label: '16:00', text: '@時間 16:00' },
        { type: 'message', label: '18:00', text: '@時間 18:00' },
        { type: 'message', label: '20:00', text: '@時間 20:00' },
      ]);
    case 3: // 課程時間
      if (!msg.startsWith('@時間 ')) return replyText(replyToken, '請使用選單選擇課程時間：');
      data.time = msg.replace('@時間 ', '').trim();
      pendingCourseCreation[userId] = { step: 4, data };
      return replyText(replyToken, '請輸入人員上限（數字）：');
    case 4: // 人員上限
      const capacity = parseInt(msg);
      if (isNaN(capacity) || capacity <= 0) return replyText(replyToken, '請輸入有效人員上限數字：');
      data.capacity = capacity;
      pendingCourseCreation[userId] = { step: 5, data };
      return replyText(replyToken, `請確認是否建立課程：\n名稱：${data.title}\n日期：${data.weekday}\n時間：${data.time}\n人數上限：${data.capacity}\n\n回覆「確認」建立，或「取消」放棄`);
    case 5: // 確認建立
      if (msg === '確認') {
        const weekdayMap = {
          '星期一': 1,
          '星期二': 2,
          '星期三': 3,
          '星期四': 4,
          '星期五': 5,
          '星期六': 6,
          '星期日': 0,
        };
        const now = new Date();
        const targetDay = weekdayMap[data.weekday];
        let daysAhead = targetDay - now.getDay();
        if (daysAhead <= 0) daysAhead += 7;
        const courseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
        const [hour, minute] = data.time.split(':');
        courseDate.setHours(parseInt(hour), parseInt(minute), 0, 0);

        const id = Date.now().toString();
        courses[id] = {
          id,
          title: data.title,
          time: courseDate.toISOString(),
          capacity: data.capacity,
          students: [],
          waiting: [],
          notified: false,
        };
        writeJSON(COURSE_FILE, courses);
        delete pendingCourseCreation[userId];
        return replyText(replyToken, `✅ 課程「${data.title}」已新增於 ${data.weekday} ${data.time}，人數上限 ${data.capacity}。`, teacherMenu);
      } else if (msg === '取消') {
        delete pendingCourseCreation[userId];
        return replyText(replyToken, '❌ 已取消新增課程流程。', teacherMenu);
      } else {
        return replyText(replyToken, '請回覆「確認」或「取消」。');
      }
    default:
      delete pendingCourseCreation[userId];
      return replyText(replyToken, '新增課程流程異常，已終止。', teacherMenu);
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
          label: `${c.time.slice(5,16)} ${c.title}`,
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
        return `${c.time.slice(5,16)}｜${c.title}｜${status}`;
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

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([id, c]) => c.time.startsWith(today));

    if (todayCourses.length === 0) return replyText(replyToken, '今天沒有課程', teacherMenu);

    const lines = todayCourses.map(([id, c]) => {
      const studentList = c.students?.map(uid => db[uid]?.name || uid).join(', ') || '無';
      return `${c.time.slice(5,16)}｜${c.title}\n學員：${studentList}`;
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
    return replyText(replyToken, `✅ 已${action}${amount}點給${db[targetId].name}`, teacherMenu);
  }

  if (msg === '@新增課程') {
    // 啟動新增課程流程
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱：', []);
  }

  if (msg === '@取消課程') {
    // 顯示可取消課程清單
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'message',
        action: {
          type: 'message',
          label: `${c.time.slice(5,16)} ${c.title}`,
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

    // 退還所有學生點數
    const dbCopy = db;
    for (const sid of course.students) {
      if (dbCopy[sid]) {
        dbCopy[sid].points = (dbCopy[sid].points || 0) + 1;
        dbCopy[sid].history.push({ id, action: '退點', time: new Date().toISOString() });
        client.pushMessage(sid, {
          type: 'text',
          text: `你的課程「${course.title}」因取消已退還1點數`,
        });
      }
    }
    delete courses[id];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, dbCopy);
    return replyText(replyToken, `✅ 課程「${course.title}」已取消並退點`, teacherMenu);
  }

  if (msg === '@查學員') {
    // 簡單回覆全部學員列表
    const studentList = Object.entries(db)
      .filter(([uid, u]) => u.role === 'student')
      .map(([uid, u]) => `${u.name}（點數：${u.points}）`);
    const text = studentList.length ? studentList.join('\n') : '沒有學員資料';
    return replyText(replyToken, text, teacherMenu);
  }

  if (msg === '@統計報表') {
    // 簡單回覆報表，示範用
    const totalStudents = Object.values(db).filter(u => u.role === 'student').length;
    const totalCourses = Object.keys(courses).length;
    return replyText(replyToken, `總學員數：${totalStudents}\n總課程數：${totalCourses}`, teacherMenu);
  }

  return replyText(replyToken, '請使用選單操作或輸入正確指令', teacherMenu);
}

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 運行中');
});

// 定時備份與自我 ping
setInterval(() => {
  backupData();
}, 3600000); // 每小時備份一次

setInterval(() => {
  const url = process.env.SELF_URL;
  if (!url) return;
  require('node-fetch')(url).catch(() => {});
}, 15 * 60 * 1000); // 每15分鐘ping一次

app.listen(PORT, () => {
  console.log(`伺服器啟動，監聽埠號 ${PORT}`);
});
