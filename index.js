// index.js - 九容瑜伽 LINE Bot 主程式 V3.13.4
// 完整版，含時區修正與完整學員與老師功能

const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
const fetch = require('node-fetch'); // keep-alive 用
require('dotenv').config();

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
const TAIPEI = 'Asia/Taipei';

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const BACKUP_DIR = './backup';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';

// 初始化檔案與資料夾
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// LINE Bot config
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 工具函式
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
    console.error('❌ 備份失敗:', err);
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

// 快速選單
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

// 暫存多步驟流程狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};
const pendingPointAdjust = {};
const pendingStudentQuery = {};
const pendingStudentReservationCancel = {};
const pendingPurchaseConfirm = {};

// 清理過期課程（超過一天前刪除）
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

// 時間格式化，含星期顯示
function formatDateTime(dateStr) {
  const dt = dayjs(dateStr).tz(TAIPEI);
  const mmdd = dt.format('MM-DD');
  const weekdayMap = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdayMap[dt.day()];
  const hhmm = dt.format('HH:mm');
  return `${mmdd}（${weekday}）${hhmm}`;
}

// 處理 webhook 事件
async function handleEvent(event) {
  if (event.type === 'postback') {
    if (event.postback.data.startsWith('cancel_course_')) {
      const courseId = event.postback.data.replace('cancel_course_', '');
      return handleCancelCourseConfirm(event, courseId);
    }
    return;
  }

  if (event.type !== 'message' || !event.message.text) return;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [], reservations: [] };
  }

  // 取得使用者名稱更新
  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }
  writeJSON(DATA_FILE, db);

  const text = event.message.text.trim();

  // 老師登入流程
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

  // 課程新增多步驟流程
  if (pendingCourseCreation[userId]) {
    return handleCourseCreationStep(event, userId, db, courses);
  }

  // 課程取消確認流程
  if (pendingCourseCancelConfirm[userId]) {
    return handleCancelCourseProcess(event, userId, db, courses);
  }

  // 學員取消預約多步驟流程
  if (pendingStudentReservationCancel[userId]) {
    return handleStudentReservationCancel(event, userId, db, courses);
  }

  // 老師點數加減多步驟流程
  if (pendingPointAdjust[userId]) {
    return handlePointAdjust(event, userId, db);
  }

  // 老師查詢學員多步驟流程
  if (pendingStudentQuery[userId]) {
    return handleStudentQuery(event, userId, db);
  }

  // 學員購買點數確認流程
  if (pendingPurchaseConfirm[userId]) {
    return handlePurchaseConfirm(event, userId);
  }

  // 身份切換指令
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

  // 根據身份進行指令處理
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, userId, db, courses);
  }
}

// ======================= 學員端功能 =============================
async function handleStudentCommands(event, userId, db, courses) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const user = db[userId];

  if (text === '@預約課程') {
    // 列出所有未來課程，並顯示剩餘名額
    const now = Date.now();
    let list = '📅 可預約課程：\n';
    let count = 0;
    for (const id in courses) {
      const c = courses[id];
      const courseTime = new Date(c.time).getTime();
      if (courseTime < now) continue;
      const remaining = c.capacity - c.students.length;
      list += `${count + 1}. ${c.title} ${formatDateTime(c.time)} 剩餘名額: ${remaining}\n`;
      count++;
    }
    if (count === 0) return replyText(replyToken, '目前無可預約的課程', studentMenu);
    list += '\n請輸入想預約的課程序號（例如：1）';
    // 暫存用戶選擇課程狀態
    pendingStudentReservationCancel[userId] = { stage: 'select_course', list: Object.keys(courses).filter(id => new Date(courses[id].time).getTime() > Date.now()) };
    return replyText(replyToken, list);
  }

  if (pendingStudentReservationCancel[userId] && pendingStudentReservationCancel[userId].stage === 'select_course') {
    const idx = parseInt(text, 10);
    const list = pendingStudentReservationCancel[userId].list;
    if (isNaN(idx) || idx < 1 || idx > list.length) {
      return replyText(event.replyToken, '輸入錯誤，請輸入正確的課程序號');
    }
    const courseId = list[idx - 1];
    const course = courses[courseId];
    if (!course) {
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, '課程不存在或已過期', studentMenu);
    }
    // 判斷是否已預約
    if (course.students.includes(userId)) {
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, '你已經預約過該課程', studentMenu);
    }
    // 判斷點數是否足夠
    if (user.points < 1) {
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, '點數不足，請先購買點數', studentMenu);
    }
    // 判斷是否有剩餘名額
    if (course.students.length < course.capacity) {
      // 直接預約成功，扣點
      course.students.push(userId);
      user.points--;
      user.history.push({ id: courseId, action: '預約成功', time: new Date().toISOString() });
      if (!user.reservations) user.reservations = [];
      user.reservations.push(courseId);
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, `✅ 預約成功：${course.title}，點數已扣1`, studentMenu);
    } else {
      // 加入候補名單
      if (!course.waiting) course.waiting = [];
      if (course.waiting.includes(userId)) {
        delete pendingStudentReservationCancel[userId];
        return replyText(event.replyToken, '你已在候補名單中，請等待', studentMenu);
      }
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, `名額已滿，已加入候補名單：${course.title}`, studentMenu);
    }
  }

  if (text === '@我的課程') {
    if (!user.reservations || user.reservations.length === 0) {
      return replyText(event.replyToken, '你目前沒有預約任何課程', studentMenu);
    }
    let msg = '你已預約的課程：\n';
    const now = Date.now();
    const validCourses = user.reservations.filter(id => courses[id] && new Date(courses[id].time).getTime() > now);
    if (validCourses.length === 0) {
      return replyText(event.replyToken, '你目前沒有未來的預約課程', studentMenu);
    }
    validCourses.forEach((id, i) => {
      const c = courses[id];
      msg += `${i + 1}. ${c.title} ${formatDateTime(c.time)}\n`;
    });
    msg += '\n如要取消預約，請輸入預約課程序號（例如：1）';
    pendingStudentReservationCancel[userId] = { stage: 'cancel_course', list: validCourses };
    return replyText(event.replyToken, msg);
  }

  if (pendingStudentReservationCancel[userId] && pendingStudentReservationCancel[userId].stage === 'cancel_course') {
    const idx = parseInt(text, 10);
    const list = pendingStudentReservationCancel[userId].list;
    if (isNaN(idx) || idx < 1 || idx > list.length) {
      return replyText(event.replyToken, '輸入錯誤，請輸入正確的預約課程序號');
    }
    const courseId = list[idx - 1];
    const course = courses[courseId];
    if (!course) {
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, '課程不存在或已過期', studentMenu);
    }
    if (!course.students.includes(userId)) {
      delete pendingStudentReservationCancel[userId];
      return replyText(event.replyToken, '你未預約此課程', studentMenu);
    }
    // 取消預約，退點
    course.students = course.students.filter(sid => sid !== userId);
    if (course.waiting && course.waiting.length > 0) {
      // 從候補名單補上第一位
      const nextStuId = course.waiting.shift();
      course.students.push(nextStuId);
      // 通知候補學生已被補上（可選擇透過推播）
      if (db[nextStuId]) {
        db[nextStuId].history.push({ id: courseId, action: '候補轉正', time: new Date().toISOString() });
        db[nextStuId].points--; // 扣點
      }
    }
    user.points++;
    user.history.push({ id: courseId, action: '取消預約退點', time: new Date().toISOString() });
    if (user.reservations) user.reservations = user.reservations.filter(id => id !== courseId);
    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);
    delete pendingStudentReservationCancel[userId];
    return replyText(event.replyToken, `✅ 已取消預約：${course.title}，點數已退還`, studentMenu);
  }

  if (text === '@點數') {
    return replyText(event.replyToken, `你目前有 ${user.points} 點`, studentMenu);
  }

  if (text === '@購點') {
    // 提供購買點數 Google 表單連結
    return replyText(event.replyToken, `請點擊以下連結購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  return replyText(event.replyToken, '指令不明確，請從選單操作', studentMenu);
}

// ======================= 老師端功能 =============================
async function handleTeacherCommands(event, userId, db, courses) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  if (text === '@課程名單') {
    // 列出未來課程與學生清單
    let msg = '📋 未來課程名單：\n';
    const now = Date.now();
    let count = 0;
    for (const id in courses) {
      const c = courses[id];
      if (new Date(c.time).getTime() < now) continue;
      count++;
      msg += `${count}. ${c.title} ${formatDateTime(c.time)}\n`;
      msg += `　人數：${c.students.length}/${c.capacity}\n`;
      if (c.students.length > 0) {
        msg += `　學員：\n`;
        c.students.forEach((sid, i) => {
          const sname = db[sid]?.name || sid;
          msg += `　　${i + 1}. ${sname}\n`;
        });
      }
      if (c.waiting && c.waiting.length > 0) {
        msg += `　候補名單：\n`;
        c.waiting.forEach((sid, i) => {
          const sname = db[sid]?.name || sid;
          msg += `　　${i + 1}. ${sname}\n`;
        });
      }
      msg += '\n';
    }
    if (count === 0) msg = '目前沒有未來課程';
    return replyText(replyToken, msg, teacherMenu);
  }

  if (text === '@新增課程') {
    pendingCourseCreation[userId] = { step: 1, newCourse: {} };
    return replyText(replyToken, '請輸入課程標題：');
  }

  if (pendingCourseCreation[userId]) {
    return handleCourseCreationStep(event, userId, db, courses);
  }

  if (text === '@取消課程') {
    // 列出可取消課程，並要求輸入編號
    const now = Date.now();
    const futureCourses = Object.entries(courses).filter(([id, c]) => new Date(c.time).getTime() > now);
    if (futureCourses.length === 0) {
      return replyText(replyToken, '沒有可取消的未來課程', teacherMenu);
    }
    let msg = '請輸入欲取消課程序號：\n';
    futureCourses.forEach(([id, c], i) => {
      msg += `${i + 1}. ${c.title} ${formatDateTime(c.time)}\n`;
    });
    pendingCourseCancelConfirm[userId] = { stage: 'select', courses: futureCourses };
    return replyText(replyToken, msg);
  }

  if (pendingCourseCancelConfirm[userId]) {
    return handleCancelCourseProcess(event, userId, db, courses);
  }

  if (text.startsWith('@加點 ')) {
    const parts = text.split(' ');
    if (parts.length < 3) {
      return replyText(replyToken, '格式錯誤，請輸入：@加點 userId 數量', teacherMenu);
    }
    const targetUserId = parts[1];
    const amount = parseInt(parts[2], 10);
    if (!db[targetUserId]) {
      return replyText(replyToken, '查無此學員', teacherMenu);
    }
    if (isNaN(amount)) {
      return replyText(replyToken, '點數數量錯誤', teacherMenu);
    }
    db[targetUserId].points = (db[targetUserId].points || 0) + amount;
    writeJSON(DATA_FILE, db);
    return replyText(replyToken, `成功為 ${db[targetUserId].name} ${amount > 0 ? '加' : '扣'}點 ${Math.abs(amount)} 點`, teacherMenu);
  }

  if (text === '@查學員') {
    pendingStudentQuery[userId] = true;
    return replyText(replyToken, '請輸入學員名稱或ID進行查詢：');
  }

  if (pendingStudentQuery[userId]) {
    const query = text.toLowerCase();
    const results = Object.entries(db).filter(([id, u]) => u.name.toLowerCase().includes(query) || id.includes(query));
    if (results.length === 0) {
      delete pendingStudentQuery[userId];
      return replyText(replyToken, '查無符合條件的學員', teacherMenu);
    }
    let msg = '查詢結果：\n';
    results.forEach(([id, u], i) => {
      msg += `${i + 1}. ${u.name} (ID:${id}) 點數:${u.points}\n`;
    });
    delete pendingStudentQuery[userId];
    return replyText(replyToken, msg, teacherMenu);
  }

  if (text === '@統計報表') {
    // 簡單報表：學員數、課程數、總點數等
    const totalStudents = Object.values(db).filter(u => u.role === 'student').length;
    const totalCourses = Object.keys(courses).length;
    const totalPoints = Object.values(db).reduce((acc, u) => acc + (u.points || 0), 0);
    const msg = `📊 統計報表\n學員數：${totalStudents}\n課程數：${totalCourses}\n總點數：${totalPoints}`;
    return replyText(replyToken, msg, teacherMenu);
  }

  return replyText(replyToken, '指令不明確，請從選單操作', teacherMenu);
}

// ======================= 老師新增課程多步驟 =============================
function handleCourseCreationStep(event, userId, db, courses) {
  const stepData = pendingCourseCreation[userId];
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  switch (stepData.step) {
    case 1:
      // 收到課程標題
      stepData.newCourse.title = text;
      stepData.step++;
      return replyText(replyToken, '請輸入課程時間（格式 YYYY-MM-DD HH:mm，台北時間）：');
    case 2:
      // 解析時間
      const dt = dayjs.tz(text, 'YYYY-MM-DD HH:mm', TAIPEI);
      if (!dt.isValid()) {
        return replyText(replyToken, '時間格式錯誤，請重新輸入（格式 YYYY-MM-DD HH:mm）：');
      }
      stepData.newCourse.time = dt.toISOString();
      stepData.step++;
      return replyText(replyToken, '請輸入課程容量（人數）：');
    case 3:
      const capacity = parseInt(text, 10);
      if (isNaN(capacity) || capacity < 1) {
        return replyText(replyToken, '容量格式錯誤，請輸入正確人數：');
      }
      stepData.newCourse.capacity = capacity;
      // 產生課程 ID
      const newId = 'c' + Date.now();
      courses[newId] = {
        title: stepData.newCourse.title,
        time: stepData.newCourse.time,
        capacity: stepData.newCourse.capacity,
        students: [],
        waiting: [],
      };
      writeJSON(COURSE_FILE, courses);
      delete pendingCourseCreation[userId];
      return replyText(replyToken, `✅ 課程新增成功：${stepData.newCourse.title} ${formatDateTime(stepData.newCourse.time)}`, teacherMenu);
    default:
      delete pendingCourseCreation[userId];
      return replyText(replyToken, '流程異常，已中止', teacherMenu);
  }
}

// ======================= 課程取消流程 =============================
function handleCancelCourseProcess(event, userId, db, courses) {
  const cancelData = pendingCourseCancelConfirm[userId];
  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  if (cancelData.stage === 'select') {
    const idx = parseInt(text, 10);
    if (isNaN(idx) || idx < 1 || idx > cancelData.courses.length) {
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, '輸入錯誤或取消，已終止', teacherMenu);
    }
    const [courseId, course] = cancelData.courses[idx - 1];
    cancelData.selectedCourseId = courseId;
    cancelData.stage = 'confirm';
    return replyText(replyToken, `確定要取消課程：${course.title} ${formatDateTime(course.time)}？\n輸入「是」確認，其他取消`);
  } else if (cancelData.stage === 'confirm') {
    if (text === '是') {
      const courseId = cancelData.selectedCourseId;
      const course = courses[courseId];
      if (!course) {
        delete pendingCourseCancelConfirm[userId];
        return replyText(event.replyToken, '課程不存在，取消失敗', teacherMenu);
      }
      // 退還學生點數
      const dbCopy = db;
      if (course.students.length > 0) {
        course.students.forEach(sid => {
          if (dbCopy[sid]) {
            dbCopy[sid].points = (dbCopy[sid].points || 0) + 1;
            dbCopy[sid].history.push({ id: courseId, action: '課程取消退點', time: new Date().toISOString() });
            if (dbCopy[sid].reservations) {
              dbCopy[sid].reservations = dbCopy[sid].reservations.filter(rid => rid !== courseId);
            }
          }
        });
      }
      // 移除課程
      delete courses[courseId];
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, dbCopy);
      delete pendingCourseCancelConfirm[userId];
      return replyText(event.replyToken, `✅ 課程已取消，所有學生點數已退還`, teacherMenu);
    } else {
      delete pendingCourseCancelConfirm[userId];
      return replyText(event.replyToken, '取消流程已終止', teacherMenu);
    }
  }
}

// ======================= 學員取消預約多步驟 =============================
function handleStudentReservationCancel(event, userId, db, courses) {
  // 由學員端 handleStudentCommands 處理，這裡可留空
  return;
}

// ======================= 老師點數加減多步驟 =============================
function handlePointAdjust(event, userId, db) {
  // 目前用單行 @加點 userId amount 指令處理，不使用多步驟
  return;
}

// ======================= 老師查詢學員多步驟 =============================
function handleStudentQuery(event, userId, db) {
  // 由 handleTeacherCommands 直接處理
  return;
}

// ======================= 學員購買點數確認流程 =============================
function handlePurchaseConfirm(event, userId) {
  // 目前改為連結至表單，無多步驟
  return;
}

// ======================= Express 路由與啟動 =============================
app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 正常運作中');
});

// LINE webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

// keep-alive，每15分鐘ping自己一次，避免Render或Heroku休眠
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log('keep-alive ping success'))
    .catch(e => console.error('keep-alive ping failed', e));
}, 15 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 已啟動，埠號：${PORT}`);
  backupData();
});
