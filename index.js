// index.js - V3.11.3（改用 Node.js 18+ 內建 fetch）
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

// 確保檔案與資料夾存在
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

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

// 備份資料檔案
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

// 快速回覆文字訊息
function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = {
      items: menu.map(i => ({ type: 'action', action: i })),
    };
  }
  return client.replyMessage(token, msg);
}

// 學員選單
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '點數查詢', text: '@點數' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 老師選單
const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '加點/扣點', text: '@加點 userId 數量' },
  { type: 'message', label: '查學員', text: '@查學員' },
  { type: 'message', label: '報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 暫存狀態物件
const pendingTeacherLogin = {};
const pendingCourseCreation = {};

// 清理過期課程
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

// 處理所有 LINE 事件的主函式
async function handleEvent(event) {
  if (event.type !== 'message' || !event.message.text) return;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;

  // 若使用者不存在資料庫，初始化
  if (!db[userId]) {
    db[userId] = {
      name: '',
      points: 0,
      role: 'student',
      history: [],
    };
  }

  // 更新使用者名稱（使用 LINE Profile 名稱，避免空白）
  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }

  writeJSON(DATA_FILE, db);

  // 優先判斷新增課程多步驟流程
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];
    const replyToken = event.replyToken;
    const text = event.message.text.trim();

    switch (stepData.step) {
      case 1: // 課程名稱
        stepData.data.title = text;
        stepData.step = 2;
        return replyText(replyToken, '請選擇課程日期（星期幾）：', [
          { type: 'message', label: '星期一', text: '星期一' },
          { type: 'message', label: '星期二', text: '星期二' },
          { type: 'message', label: '星期三', text: '星期三' },
          { type: 'message', label: '星期四', text: '星期四' },
          { type: 'message', label: '星期五', text: '星期五' },
          { type: 'message', label: '星期六', text: '星期六' },
          { type: 'message', label: '星期日', text: '星期日' },
        ]);
      case 2: // 課程日期（星期幾）
        const weekdays = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
        if (!weekdays.includes(text)) {
          return replyText(replyToken, '請輸入正確的星期（例如：星期一）');
        }
        stepData.data.weekday = text;
        stepData.step = 3;
        return replyText(replyToken, '請輸入課程時間（24小時制，如 14:30）');
      case 3: // 課程時間
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
          return replyText(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return replyText(replyToken, '請輸入人員上限（正整數）');
      case 4: // 人員上限
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return replyText(replyToken, '容量格式錯誤，請輸入正整數');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;

        return replyText(replyToken,
          `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}`,
          [
            { type: 'message', label: '是', text: '確認新增課程' },
            { type: 'message', label: '否', text: '取消新增課程' },
          ]);
      case 5: // 確認建立或取消
        if (text === '確認新增課程') {
          // 建立課程
          const today = new Date();
          const dayOfWeek = today.getDay();
          const weekdayMap = {
            '星期日': 0,
            '星期一': 1,
            '星期二': 2,
            '星期三': 3,
            '星期四': 4,
            '星期五': 5,
            '星期六': 6,
          };
          const targetDay = weekdayMap[stepData.data.weekday];
          let dayDiff = targetDay - dayOfWeek;
          if (dayDiff < 0) dayDiff += 7;
          const targetDate = new Date(today);
          targetDate.setDate(today.getDate() + dayDiff);
          const [hour, min] = stepData.data.time.split(':').map(Number);
          targetDate.setHours(hour, min, 0, 0);

          const newId = 'course_' + Date.now();
          courses[newId] = {
            title: stepData.data.title,
            time: targetDate.toISOString(),
            capacity: stepData.data.capacity,
            students: [],
            waiting: [],
          };

          writeJSON(COURSE_FILE, courses);
          delete pendingCourseCreation[userId];

          return replyText(event.replyToken,
            `✅ 課程已新增：${stepData.data.title}\n時間：${targetDate.toISOString()}\n容量：${stepData.data.capacity}`,
            teacherMenu);
        } else if (text === '取消新增課程') {
          delete pendingCourseCreation[userId];
          return replyText(event.replyToken, '❌ 已取消新增課程', teacherMenu);
        } else {
          return replyText(event.replyToken, '請點選「是」或「否」確認');
        }
      default:
        delete pendingCourseCreation[userId];
        return replyText(event.replyToken, '流程異常，已重置', teacherMenu);
    }
  }

  // 簡易身份判斷：老師預設需輸入密碼才能切換，否則學生身份
  if (event.message.text === '@切換身份') {
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
    if (event.message.text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '老師登入成功', teacherMenu);
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(event.replyToken, '密碼錯誤，登入失敗', studentMenu);
    }
  }

  // 根據身份執行對應指令
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
  }
}

// 學員功能指令處理
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
          label: `${c.time.slice(5, 16)} ${c.title}`,
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
    return replyText(replyToken, `✅ 已取消 ${count} 等候候補的課程`, studentMenu);
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
      list += `${c.title} - ${c.time.slice(0, 16)}\n`;
    });
    return replyText(event.replyToken, list, studentMenu);
  }

  if (msg === '@點數') {
    return replyText(event.replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  if (msg === '@購點') {
    // 回傳購點表單連結（可替換成你的購點表單網址）
    const formUrl = 'https://docs.google.com/forms/d/e/your_form_id/viewform';
    return replyText(event.replyToken, `請點擊連結購買點數：\n${formUrl}`, studentMenu);
  }

  return replyText(event.replyToken, '指令無效，請使用選單', studentMenu);
}

// 老師功能指令處理
async function handleTeacherCommands(event, userId, db, courses) {
  const msg = event.message.text.trim();
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses).filter(([id, c]) => c.time.startsWith(todayStr));
    if (todayCourses.length === 0) {
      return replyText(replyToken, '今日沒有課程', teacherMenu);
    }
    let list = '今日課程及學生名單：\n';
    todayCourses.forEach(([id, c]) => {
      list += `${c.title} (${c.time.slice(11,16)})\n`;
      if (c.students.length === 0) list += '  無學生預約\n';
      else {
        c.students.forEach((stuId, i) => {
          const name = db[stuId]?.name || '匿名';
          list += `  ${i + 1}. ${name}\n`;
        });
      }
      if (c.waiting.length > 0) {
        list += '  候補名單:\n';
        c.waiting.forEach((stuId, i) => {
          const name = db[stuId]?.name || '匿名';
          list += `    ${i + 1}. ${name}\n`;
        });
      }
    });
    return replyText(replyToken, list, teacherMenu);
  }

  if (msg === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return replyText(replyToken, '請輸入課程名稱');
  }

  if (msg === '@取消課程') {
    // 老師取消課程，可進一步實作
    return replyText(replyToken, '請輸入欲取消的課程 ID，例如：取消 course_1234567890');
  }

  if (msg.startsWith('取消 ')) {
    const id = msg.replace('取消 ', '').trim();
    const course = courses[id];
    if (!course) {
      return replyText(replyToken, '找不到該課程', teacherMenu);
    }
    // 退還學生點數
    course.students.forEach(stuId => {
      if (db[stuId]) {
        db[stuId].points++;
        db[stuId].history.push({ id, action: '課程取消退點', time: new Date().toISOString() });
      }
    });
    delete courses[id];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);
  }

  if (msg.startsWith('@加點')) {
    // 格式：@加點 userId 數量（數量可正負）
    const parts = msg.split(' ');
    if (parts.length !== 3) return replyText(replyToken, '格式錯誤，請使用：@加點 userId 數量', teacherMenu);
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyText(replyToken, '找不到該學員', teacherMenu);
    if (isNaN(amount)) return replyText(replyToken, '點數數量錯誤', teacherMenu);
    db[targetId].points = (db[targetId].points || 0) + amount;
    db[targetId].history.push({ action: amount > 0 ? '加點' : '扣點', amount, time: new Date().toISOString() });
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `學員 ${db[targetId].name} 的點數已調整為 ${db[targetId].points} 點。`, teacherMenu);
  }

  if (msg === '@查學員') {
    return replyText(replyToken, '請輸入學員ID查詢，例如：查學員 U1234567890');
  }

  if (msg.startsWith('查學員 ')) {
    const targetId = msg.replace('查學員 ', '').trim();
    const target = db[targetId];
    if (!target) return replyText(replyToken, '找不到該學員', teacherMenu);
    let info = `學員：${target.name}\n點數：${target.points}\n預約紀錄：\n`;
    target.history.slice(-10).forEach(h => {
      info += `${h.time} - ${h.action}${h.amount ? ' ' + h.amount : ''}\n`;
    });
    return replyText(replyToken, info, teacherMenu);
  }

  if (msg === '@統計報表') {
    // 簡易報表：課程數量、總預約數、學生人數
    const courseCount = Object.keys(courses).length;
    let totalReservations = 0;
    const studentSet = new Set();
    Object.values(courses).forEach(c => {
      totalReservations += c.students.length;
      c.students.forEach(s => studentSet.add(s));
    });
    const report = `報表統計：\n課程數量：${courseCount}\n總預約數：${totalReservations}\n預約學生數：${studentSet.size}`;
    return replyText(replyToken, report, teacherMenu);
  }

  if (msg === '@切換身份') {
    db[userId].role = 'student';
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, '已切換為學員身份', studentMenu);
  }

  return replyText(replyToken, '指令無效，請使用選單', teacherMenu);
}

// Express 路由設定
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch(err => {
      console.error(err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 運行中');
});

// 定時備份和保活
setInterval(() => {
  backupData();
  // 這裡使用 fetch 進行自我 ping 保活（改用內建 fetch）
  fetch(`https://你的部署網址/`)
    .then(() => console.log('自我保活成功'))
    .catch(e => console.error('保活失敗', e));
}, 1000 * 60 * 15); // 每15分鐘一次

app.listen(PORT, () => {
  console.log(`🚀 伺服器已啟動，埠號: ${PORT}`);
});
