// index.js - 九容瑜伽 LINE Bot 完整可部署版本 v3.14.2

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
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform';
const SELF_URL = process.env.SELF_URL || ''; // 你的服務網址，供keep-alive使用

// 初始化檔案與資料夾
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 讀寫 JSON
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

function saveData(db) {
  writeJSON(DATA_FILE, db);
}
function loadData() {
  return readJSON(DATA_FILE);
}
function saveCourses(courses) {
  writeJSON(COURSE_FILE, courses);
}
function loadCourses() {
  const raw = readJSON(COURSE_FILE);
  // 結構調整，從物件轉陣列並加上 id
  return Object.entries(raw).map(([id, c]) => ({
    id,
    title: c.title,
    time: c.time,
    capacity: c.capacity,
    users: c.users || [],
    waiting: c.waiting || [],
  }));
}
function saveCoursesFromArray(courses) {
  const obj = {};
  courses.forEach(c => {
    obj[c.id] = {
      title: c.title,
      time: c.time,
      capacity: c.capacity,
      users: c.users,
      waiting: c.waiting,
    };
  });
  writeJSON(COURSE_FILE, obj);
}

// 資料備份
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 備份失敗:', err);
  }
}

// 格式化時間 (台北時區 + 星期)
function formatDateTime(dateStr) {
  const taipeiDate = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const mmdd = taipeiDate.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[taipeiDate.getDay()];
  const hhmm = taipeiDate.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
  return `${mmdd}（${weekday}）${hhmm}`;
}

// 快速回覆
function replyText(token, text, quickReplyItems = null) {
  const msg = { type: 'text', text };
  if (quickReplyItems && quickReplyItems.length > 0) {
    msg.quickReply = { items: quickReplyItems };
  }
  return client.replyMessage(token, msg);
}

// 快速選單定義
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
  { type: 'message', label: '查學員', text: '@查學員 userId' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 暫存狀態
const pendingTeacherLogin = new Set();
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

// 計算下一個指定星期幾和時間 (回傳 Date 物件)
function getNextWeekdayDate(targetWeekday, timeStr) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const [hour, minute] = timeStr.split(':').map(Number);
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  const dayDiff = (targetWeekday + 7 - now.getDay()) % 7;
  if (dayDiff === 0) {
    return candidate > now ? candidate : new Date(candidate.getTime() + 7 * 86400000);
  }
  return new Date(candidate.getTime() + dayDiff * 86400000);
}

// 清除過期課程 (刪除超過一天的)
function cleanCourses(courses) {
  const now = Date.now();
  return courses.filter(c => {
    const t = new Date(c.time).getTime();
    return t > now - 86400000;
  });
}

// 核心事件處理
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const db = loadData();
  const rawCourses = loadCourses();
  const courses = cleanCourses(rawCourses);

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  // 更新用戶名稱
  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名';
  } catch {}

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const user = db[userId];

  // 身份切換 / 老師登入流程
  if (pendingTeacherLogin.has(userId)) {
    if (text === TEACHER_PASSWORD) {
      user.role = 'teacher';
      saveData(db);
      pendingTeacherLogin.delete(userId);
      return replyText(replyToken, '老師登入成功', teacherMenu);
    } else {
      pendingTeacherLogin.delete(userId);
      return replyText(replyToken, '密碼錯誤，登入失敗', studentMenu);
    }
  }
  if (text === '@切換身份') {
    if (user.role === 'teacher') {
      user.role = 'student';
      saveData(db);
      return replyText(replyToken, '已切換為學員身份', studentMenu);
    } else {
      pendingTeacherLogin.add(userId);
      return replyText(replyToken, '請輸入老師密碼登入');
    }
  }

  // 老師流程：新增課程
  if (user.role === 'teacher' && pendingCourseCreation[userId]) {
    return handleCourseCreation(event, pendingCourseCreation, courses, db);
  }

  // 老師流程：課程取消確認
  if (user.role === 'teacher' && pendingCourseCancelConfirm[userId]) {
    return handleCourseCancelConfirm(event, pendingCourseCancelConfirm, courses, db);
  }

  // 依身份分流處理指令
  if (user.role === 'teacher') {
    return handleTeacherCommands(event, courses, db);
  } else {
    return handleStudentCommands(event, courses, db);
  }
}

// 新增課程多步驟
async function handleCourseCreation(event, pending, courses, db) {
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  const stepData = pending[userId];
  if (!stepData) {
    delete pending[userId];
    return replyText(replyToken, '流程異常，已重置', teacherMenu);
  }

  switch (stepData.step) {
    case 1:
      stepData.title = text;
      stepData.step = 2;
      return replyText(replyToken, '請輸入課程日期（星期一～星期日）');
    case 2:
      {
        const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
        if (!weekdays.includes(text)) {
          return replyText(replyToken, '請輸入正確的星期名稱，如「星期一」');
        }
        stepData.weekday = text;
        stepData.step = 3;
        return replyText(replyToken, '請輸入課程時間（24小時制，如 14:30）');
      }
    case 3:
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
        return replyText(replyToken, '時間格式錯誤，請輸入24小時制時間，如14:30');
      }
      stepData.time = text;
      stepData.step = 4;
      return replyText(replyToken, '請輸入人數上限（正整數）');
    case 4:
      {
        const cap = parseInt(text);
        if (isNaN(cap) || cap <= 0) {
          return replyText(replyToken, '請輸入正整數的人數上限');
        }
        stepData.capacity = cap;
        stepData.step = 5;
        return replyText(replyToken,
          `請確認課程資料：\n名稱：${stepData.title}\n日期：${stepData.weekday}\n時間：${stepData.time}\n人數上限：${stepData.capacity}`,
          [
            { type: 'message', label: '✅ 是', text: '確認新增課程' },
            { type: 'message', label: '❌ 否', text: '取消新增課程' },
          ]);
      }
    case 5:
      if (text === '確認新增課程') {
        const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
        const dayIndex = weekdays.indexOf(stepData.weekday);
        const nextDate = getNextWeekdayDate(dayIndex, stepData.time);
        const id = 'course_' + Date.now();

        courses.push({
          id,
          title: stepData.title,
          time: nextDate.toISOString(),
          capacity: stepData.capacity,
          users: [],
          waiting: [],
        });

        saveCoursesFromArray(courses);
        delete pending[userId];

        return replyText(replyToken,
          `✅ 課程新增成功！\n${stepData.title}\n${formatDateTime(nextDate.toISOString())}\n人數上限：${stepData.capacity}`,
          teacherMenu);
      } else if (text === '取消新增課程') {
        delete pending[userId];
        return replyText(replyToken, '❌ 已取消新增課程', teacherMenu);
      } else {
        return replyText(replyToken, '請點選「是」或「否」確認');
      }
    default:
      delete pending[userId];
      return replyText(event.replyToken, '流程異常，已重置', teacherMenu);
  }
}

// 老師課程取消確認多步驟
async function handleCourseCancelConfirm(event, pendingCancel, courses, db) {
  const userId = event.source.userId;
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  const targetCourseId = pendingCancel[userId];
  if (!targetCourseId) {
    delete pendingCancel[userId];
    return replyText(replyToken, '無待取消課程資料，已重置', teacherMenu);
  }

  if (text === '確認取消課程') {
    // 找課程
    const idx = courses.findIndex(c => c.id === targetCourseId);
    if (idx < 0) {
      delete pendingCancel[userId];
      return replyText(replyToken, '找不到指定課程，已重置', teacherMenu);
    }

    const course = courses[idx];
    // 退還點數給所有已報名學員
    const dbCopy = {...db};
    course.users.forEach(uid => {
      if (dbCopy[uid]) {
        dbCopy[uid].points += 1; // 假設每堂課扣1點
        dbCopy[uid].history.push(`課程取消退還點數: ${course.title} ${formatDateTime(course.time)}`);
      }
    });

    courses.splice(idx,1);
    saveCoursesFromArray(courses);
    writeJSON(DATA_FILE, dbCopy);

    delete pendingCancel[userId];
    return replyText(replyToken, `✅ 已取消課程「${course.title}」並退還報名點數。`, teacherMenu);
  } else if (text === '取消操作') {
    delete pendingCancel[userId];
    return replyText(replyToken, '取消操作，返回老師選單', teacherMenu);
  } else {
    return replyText(replyToken,
      `您確定要取消課程嗎？\n請輸入「確認取消課程」或「取消操作」`,
      [
        { type: 'message', label: '確認取消課程', text: '確認取消課程' },
        { type: 'message', label: '取消操作', text: '取消操作' },
      ]);
  }
}

// 老師指令處理
async function handleTeacherCommands(event, courses, db) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  if (text === '@課程名單') {
    if (courses.length === 0) {
      return replyText(replyToken, '目前沒有課程。', teacherMenu);
    }
    let msg = '📋 課程列表：\n';
    courses.forEach(c => {
      msg += `${formatDateTime(c.time)} ${c.title}\n已報名: ${c.users.length}/${c.capacity}\n候補: ${c.waiting.length}\n\n`;
    });
    return replyText(replyToken, msg, teacherMenu);
  }

  if (text.startsWith('@新增課程')) {
    pendingCourseCreation[userId] = { step: 1 };
    return replyText(replyToken, '請輸入課程名稱');
  }

  if (text.startsWith('@取消課程')) {
    if (courses.length === 0) return replyText(replyToken, '目前沒有課程可取消', teacherMenu);

    let quickItems = courses.map(c => ({
      type: 'message',
      label: `${formatDateTime(c.time)} ${c.title}`,
      text: `取消課程:${c.id}`,
    }));
    quickItems.push({ type: 'message', label: '取消', text: '取消操作' });

    return replyText(replyToken, '請選擇要取消的課程或輸入「取消操作」', quickItems);
  }

  if (text.startsWith('取消課程:')) {
    const courseId = text.split(':')[1];
    if (!courses.find(c => c.id === courseId)) {
      return replyText(replyToken, '找不到該課程ID，請重新選擇', teacherMenu);
    }
    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(replyToken,
      `你選擇取消課程ID: ${courseId}，請輸入「確認取消課程」以確認，或輸入「取消操作」放棄。`);
  }

  if (text.startsWith('@加點')) {
    // 格式: @加點 userId 數量
    const parts = text.split(' ');
    if (parts.length !== 3) return replyText(replyToken, '格式錯誤，請輸入：@加點 userId 數量', teacherMenu);
    const targetId = parts[1];
    const amount = parseInt(parts[2]);
    if (!db[targetId]) return replyText(replyToken, '查無該學員ID', teacherMenu);
    if (isNaN(amount)) return replyText(replyToken, '點數數量需為數字', teacherMenu);
    db[targetId].points += amount;
    db[targetId].history.push(`老師加點/扣點: ${amount > 0 ? '+' : ''}${amount}`);
    saveData(db);
    return replyText(replyToken, `已調整 ${db[targetId].name} 的點數，現有點數：${db[targetId].points}`, teacherMenu);
  }

  if (text.startsWith('@查學員')) {
    const parts = text.split(' ');
    if (parts.length !== 2) return replyText(replyToken, '格式錯誤，請輸入：@查學員 userId', teacherMenu);
    const targetId = parts[1];
    if (!db[targetId]) return replyText(replyToken, '查無該學員ID', teacherMenu);
    const user = db[targetId];
    let msg = `學員資料：\n名稱：${user.name}\n點數：${user.points}\n歷史紀錄：\n`;
    msg += user.history.slice(-10).join('\n') || '(無)';
    return replyText(replyToken, msg, teacherMenu);
  }

  if (text === '@統計報表') {
    // 簡單示範：學員總數與點數總和
    const userCount = Object.keys(db).length;
    const totalPoints = Object.values(db).reduce((acc, u) => acc + (u.points || 0), 0);
    let msg = `📊 統計報表：\n學員數：${userCount}\n點數總和：${totalPoints}\n課程數：${courses.length}`;
    return replyText(replyToken, msg, teacherMenu);
  }

  return replyText(replyToken, '老師選單指令請輸入正確指令或選單操作', teacherMenu);
}

// 學員指令處理
async function handleStudentCommands(event, courses, db) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const user = db[userId];

  if (text === '@點數') {
    return replyText(replyToken, `您目前有 ${user.points} 點`, studentMenu);
  }

  if (text === '@購點') {
    return replyText(replyToken,
      `請透過以下表單購買點數，匯款後請填寫資料以便審核\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  if (text === '@預約課程') {
    if (courses.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }
    // 顯示可預約課程清單（含人數與候補）
    const quickItems = courses.map(c => ({
      type: 'postback',
      label: `${formatDateTime(c.time)} ${c.title} (${c.users.length}/${c.capacity})`,
      data: `book_course:${c.id}`,
    }));
    return replyText(replyToken, '請選擇要預約的課程', quickItems);
  }

  if (text === '@我的課程') {
    const booked = courses.filter(c => c.users.includes(userId));
    if (booked.length === 0) {
      return replyText(replyToken, '您尚未預約任何課程', studentMenu);
    }
    let msg = '您的預約課程：\n';
    booked.forEach(c => {
      msg += `${formatDateTime(c.time)} ${c.title}\n`;
    });
    return replyText(replyToken, msg, studentMenu);
  }

  // 處理預約按鈕（postback）需在 webhook event 中另外攔截

  return replyText(replyToken, '請使用選單操作或輸入正確指令', studentMenu);
}

// 處理 postback 事件（預約、取消等）
async function handlePostback(event) {
  const userId = event.source.userId;
  const data = event.postback.data;
  const db = loadData();
  const courses = cleanCourses(loadCourses());
  const replyToken = event.replyToken;

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }
  const user = db[userId];

  if (data.startsWith('book_course:')) {
    const courseId = data.split(':')[1];
    const course = courses.find(c => c.id === courseId);
    if (!course) {
      return replyText(replyToken, '找不到該課程，請重新選擇');
    }
    // 是否已預約
    if (course.users.includes(userId)) {
      return replyText(replyToken, '您已預約此課程');
    }
    // 是否候補中
    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '您已在候補名單中');
    }
    // 檢查點數
    if (user.points < 1) {
      return replyText(replyToken, '您的點數不足，請先購買點數');
    }
    if (course.users.length < course.capacity) {
      course.users.push(userId);
      user.points -= 1;
      user.history.push(`預約課程：${course.title} ${formatDateTime(course.time)}`);
      saveCoursesFromArray(courses);
      saveData(db);
      return replyText(replyToken, `✅ 預約成功：${course.title}\n${formatDateTime(course.time)}`);
    } else {
      // 加入候補
      course.waiting.push(userId);
      user.history.push(`候補課程：${course.title} ${formatDateTime(course.time)}`);
      saveCoursesFromArray(courses);
      saveData(db);
      return replyText(replyToken, `課程已滿，您已加入候補名單：${course.title}`);
    }
  }

  // 可擴充其他 postback

  return replyText(replyToken, '未知操作');
}

// Express 路由
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        await handleEvent(event);
      } else if (event.type === 'postback') {
        await handlePostback(event);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 正常運行');
});

// Keep-alive，每15分鐘ping自己一次（如有 SELF_URL）
if (SELF_URL) {
  const fetch = (...args) => import('node-fetch').then(({default:fetch}) => fetch(...args));
  setInterval(() => {
    fetch(SELF_URL).then(() => console.log('✅ Keep-alive ping')).catch(() => console.log('❌ Keep-alive failed'));
  }, 15 * 60 * 1000);
}

// 每天午夜備份資料
function scheduleDailyBackup() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const delay = nextMidnight - now;
  setTimeout(() => {
    backupData();
    setInterval(backupData, 24 * 60 * 60 * 1000);
  }, delay);
}
scheduleDailyBackup();

app.listen(PORT, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 伺服器啟動，埠號 ${PORT}`);
});
