// index.js - 九容瑜伽 LINE Bot 主程式 V3.13.2
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
require('dotenv').config();
const fetch = require('node-fetch'); // render環境需

const app = express();
const PORT = process.env.PORT || 3000;
const SELF_URL = process.env.SELF_URL || '';

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const BACKUP_DIR = './backup';
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform';

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
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 備份失敗:', err);
  }
}

function formatToTaipeiISO(date) {
  // 取得台北時間 ISO 字串(YYYY-MM-DDTHH:mm:00)
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:00`;
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const mmdd = date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[date.getDay()];
  const hhmm = date.toLocaleTimeString('zh-TW', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${mmdd}（${weekday}）${hhmm}`;
}

function replyText(token, text, postbackMenu = null) {
  const msg = { type: 'text', text };
  if (postbackMenu) {
    msg.quickReply = {
      items: postbackMenu.map(i => ({
        type: 'action',
        action: i,
      })),
    };
  }
  return client.replyMessage(token, msg);
}

// 初始化資料檔與資料夾
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// 快速選單 postback 格式
const studentMenu = [
  { type: 'postback', label: '預約課程', data: '@預約課程' },
  { type: 'postback', label: '我的課程', data: '@我的課程' },
  { type: 'postback', label: '點數查詢', data: '@點數' },
  { type: 'postback', label: '購買點數', data: '@購點' },
  { type: 'postback', label: '切換身份', data: '@切換身份' },
];

const teacherMenu = [
  { type: 'postback', label: '課程名單', data: '@課程名單' },
  { type: 'postback', label: '新增課程', data: '@新增課程' },
  { type: 'postback', label: '取消課程', data: '@取消課程' },
  { type: 'postback', label: '加點/扣點', data: '@加點' }, // 待手動輸入
  { type: 'postback', label: '查學員', data: '@查學員' },
  { type: 'postback', label: '報表', data: '@統計報表' },
  { type: 'postback', label: '切換身份', data: '@切換身份' },
];

// 暫存狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

// 清理過期或無效課程
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

// 處理事件主函式
async function handleEvent(event) {
  if (event.type === 'postback') {
    return handlePostback(event);
  }
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

  // 處理老師登入流程
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

  // 根據身份分流
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses);
  } else {
    return handleStudentCommands(event, db[userId], db, courses);
  }
}

// Postback 處理
async function handlePostback(event) {
  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const data = event.postback.data;

  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  if (data.startsWith('@')) {
    // 學員/老師指令
    if (data === '@切換身份') {
      if (db[userId].role === 'teacher') {
        db[userId].role = 'student';
        writeJSON(DATA_FILE, db);
        return replyText(replyToken, '已切換為學員身份', studentMenu);
      } else {
        pendingTeacherLogin[userId] = true;
        return replyText(replyToken, '請輸入老師密碼登入');
      }
    }
    if (db[userId].role === 'teacher') {
      return handleTeacherCommands(event, userId, db, courses, data);
    } else {
      return handleStudentCommands(event, db[userId], db, courses, data);
    }
  }

  if (data.startsWith('cancel_course_')) {
    const courseId = data.replace('cancel_course_', '');
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程，可能已被取消', teacherMenu);
    }
    pendingCourseCancelConfirm[userId] = courseId;
    return replyText(
      replyToken,
      `⚠️ 確認要取消課程「${courses[courseId].title}」嗎？\n一旦取消將退還所有學生點數。`,
      [
        { type: 'postback', label: '✅ 是', data: 'confirm_cancel_yes' },
        { type: 'postback', label: '❌ 否', data: 'confirm_cancel_no' },
      ]
    );
  }

  if (data === 'confirm_cancel_yes') {
    const courseId = pendingCourseCancelConfirm[userId];
    const course = courses[courseId];
    if (!course) {
      delete pendingCourseCancelConfirm[userId];
      return replyText(replyToken, '找不到該課程，取消失敗', teacherMenu);
    }

    const db = readJSON(DATA_FILE);
    course.students.forEach(stuId => {
      if (db[stuId]) {
        db[stuId].points++;
        db[stuId].history.push({
          id: courseId,
          action: '課程取消退點',
          time: new Date().toISOString(),
        });
      }
    });
    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    delete pendingCourseCancelConfirm[userId];
    return replyText(replyToken, `✅ 課程「${course.title}」已取消，所有學生點數已退還。`, teacherMenu);
  }

  if (data === 'confirm_cancel_no') {
    delete pendingCourseCancelConfirm[userId];
    return replyText(replyToken, '取消課程操作已中止', teacherMenu);
  }

  if (data.startsWith('reserve_course_')) {
    const courseId = data.replace('reserve_course_', '');
    const course = courses[courseId];
    if (!course) return replyText(replyToken, '課程不存在', studentMenu);

    if (!course.students) course.students = [];
    if (!course.waiting) course.waiting = [];

    if (course.students.includes(userId)) {
      return replyText(replyToken, '你已經預約此課程', studentMenu);
    }

    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '你已在候補名單中，請耐心等待', studentMenu);
    }

    if (db[userId].points <= 0) {
      return replyText(replyToken, '點數不足，請先購買點數', studentMenu);
    }

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      db[userId].points--;
      db[userId].history.push({ id: courseId, action: '預約', time: new Date().toISOString() });
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, '✅ 已成功預約', studentMenu);
    } else {
      course.waiting.push(userId);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '課程額滿，已加入候補名單', studentMenu);
    }
  }

  if (data.startsWith('cancel_reserve_')) {
    const courseId = data.replace('cancel_reserve_', '');
    const course = courses[courseId];
    if (!course) return replyText(replyToken, '課程不存在', studentMenu);
    const db = readJSON(DATA_FILE);
    const userId = event.source.userId;

    let removedFromStudent = false;
    if (course.students.includes(userId)) {
      course.students = course.students.filter(id => id !== userId);
      db[userId].points++;
      removedFromStudent = true;
    }
    if (course.waiting.includes(userId)) {
      course.waiting = course.waiting.filter(id => id !== userId);
    }

    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);

    if (removedFromStudent) {
      // 候補自動轉正
      if (course.waiting.length > 0 && course.students.length < course.capacity) {
        const nextUserId = course.waiting.shift();
        course.students.push(nextUserId);

        if (db[nextUserId]) {
          db[nextUserId].points--;
          db[nextUserId].history.push({ id: courseId, action: '候補轉正', time: new Date().toISOString() });
          writeJSON(DATA_FILE, db);
        }

        writeJSON(COURSE_FILE, courses);
        // 可改成發訊息通知 nextUserId，這裡略
      }
    }
    return replyText(replyToken, '已取消預約', studentMenu);
  }

  // 如果未匹配以上，直接回覆文字
  return replyText(replyToken, '指令無效，請使用選單', db[userId].role === 'teacher' ? teacherMenu : studentMenu);
}

// 學員命令處理
async function handleStudentCommands(event, user, db, courses, postbackData = null) {
  const replyToken = event.replyToken;
  if (postbackData === '@預約課程') {
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `${formatDateTime(c.time)} ${c.title}`,
          data: `reserve_course_${id}`,
        },
      }));

    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu);
    }
    return replyText(replyToken, '請選擇課程：', upcoming);
  }

  if (postbackData === '@我的課程') {
    const now = Date.now();
    const enrolled = Object.entries(courses).filter(([id, c]) => c.students.includes(event.source.userId) && new Date(c.time).getTime() > now);

    if (enrolled.length === 0) {
      return replyText(replyToken, '你目前沒有預約任何課程', studentMenu);
    }
    let list = '你預約的課程：\n';
    enrolled.forEach(([id, c]) => {
      list += `${c.title} - ${formatDateTime(c.time)}\n`;
    });
    return replyText(replyToken, list.trim(), studentMenu);
  }

  if (postbackData === '@點數') {
    return replyText(replyToken, `你目前有 ${user.points
                                         return replyText(replyToken, `你目前有 ${user.points} 點數`, studentMenu);
  }

  if (postbackData === '@購點') {
    return replyText(replyToken, `請點擊連結購買點數：\n${PURCHASE_FORM_URL}`, studentMenu);
  }

  // 預設回覆
  return replyText(replyToken, '請使用選單進行操作', studentMenu);
}

// 老師命令處理
async function handleTeacherCommands(event, userId, db, courses, postbackData = null) {
  const replyToken = event.replyToken;

  if (postbackData === '@課程名單') {
    // 列出今日或未來課程與學生名單
    const now = Date.now();
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time).getTime() >= now)
      .sort((a, b) => new Date(a[1].time) - new Date(b[1].time));

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '沒有尚未開始的課程', teacherMenu);
    }

    let msg = '未來課程及學生名單：\n';
    upcomingCourses.forEach(([id, c]) => {
      msg += `\n${c.title} (${formatDateTime(c.time)})\n`;
      if (c.students.length === 0) {
        msg += ' - 無學生預約\n';
      } else {
        c.students.forEach((stuId, idx) => {
          const name = db[stuId]?.name || '匿名';
          msg += ` - ${idx + 1}. ${name}\n`;
        });
      }
    });
    return replyText(replyToken, msg, teacherMenu);
  }

  if (postbackData === '@新增課程') {
    // 啟動新增課程流程 (簡化示範)
    // 這裡可擴充為多步驟對話
    return replyText(replyToken, '請用格式：新增課程|課程名稱|YYYY-MM-DD HH:mm|人數上限', teacherMenu);
  }

  if (postbackData && postbackData.startsWith('新增課程|')) {
    const parts = postbackData.split('|');
    if (parts.length !== 4) {
      return replyText(replyToken, '格式錯誤，請確認格式：新增課程|課程名稱|YYYY-MM-DD HH:mm|人數上限', teacherMenu);
    }
    const [, title, datetime, capacityStr] = parts;
    const time = new Date(datetime);
    if (isNaN(time)) {
      return replyText(replyToken, '日期時間格式錯誤，請使用 YYYY-MM-DD HH:mm', teacherMenu);
    }
    const capacity = parseInt(capacityStr);
    if (isNaN(capacity) || capacity <= 0) {
      return replyText(replyToken, '人數上限必須為正整數', teacherMenu);
    }

    const id = `c${Date.now()}`;
    courses[id] = {
      title,
      time: time.toISOString(),
      capacity,
      students: [],
      waiting: [],
    };
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 課程已新增：${title}，時間：${formatDateTime(time.toISOString())}，人數上限：${capacity}`, teacherMenu);
  }

  if (postbackData === '@取消課程') {
    // 列出可取消課程
    const now = Date.now();
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time).getTime() >= now);

    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '沒有尚未開始的課程可取消', teacherMenu);
    }
    const buttons = upcomingCourses.map(([id, c]) => ({
      type: 'postback',
      label: `${formatDateTime(c.time)} ${c.title}`,
      data: `cancel_course_${id}`,
    }));
    return replyText(replyToken, '請選擇要取消的課程', buttons);
  }

  if (postbackData === '@加點') {
    return replyText(replyToken, '請輸入「加點|使用者ID|數量」或「扣點|使用者ID|數量」', teacherMenu);
  }

  if (postbackData && (postbackData.startsWith('加點|') || postbackData.startsWith('扣點|'))) {
    const parts = postbackData.split('|');
    if (parts.length !== 3) {
      return replyText(replyToken, '格式錯誤，請使用「加點|使用者ID|數量」或「扣點|使用者ID|數量」', teacherMenu);
    }
    const [action, targetId, amountStr] = parts;
    const amount = parseInt(amountStr);
    if (!db[targetId]) {
      return replyText(replyToken, '找不到該學員ID', teacherMenu);
    }
    if (isNaN(amount) || amount <= 0) {
      return replyText(replyToken, '點數數量需為正整數', teacherMenu);
    }
    if (action === '加點') {
      db[targetId].points += amount;
      db[targetId].history.push({ action: '老師加點', amount, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, `已加 ${amount} 點給 ${db[targetId].name}`, teacherMenu);
    } else if (action === '扣點') {
      if (db[targetId].points < amount) {
        return replyText(replyToken, '學員點數不足，無法扣點', teacherMenu);
      }
      db[targetId].points -= amount;
      db[targetId].history.push({ action: '老師扣點', amount, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      return replyText(replyToken, `已扣 ${amount} 點給 ${db[targetId].name}`, teacherMenu);
    } else {
      return replyText(replyToken, '未知操作', teacherMenu);
    }
  }

  if (postbackData === '@查學員') {
    return replyText(replyToken, '請輸入學員ID或名稱查詢', teacherMenu);
  }

  if (postbackData && postbackData.startsWith('查學員|')) {
    const keyword = postbackData.split('|')[1];
    const results = Object.entries(db).filter(([id, u]) => id.includes(keyword) || (u.name && u.name.includes(keyword)));
    if (results.length === 0) {
      return replyText(replyToken, '找不到符合條件的學員', teacherMenu);
    }
    let msg = '查詢結果：\n';
    results.forEach(([id, u]) => {
      msg += `ID: ${id}\n姓名: ${u.name}\n點數: ${u.points}\n\n`;
    });
    return replyText(replyToken, msg, teacherMenu);
  }

  if (postbackData === '@統計報表') {
    // 簡易報表：學員數與課程數
    const studentCount = Object.values(db).filter(u => u.role === 'student').length;
    const teacherCount = Object.values(db).filter(u => u.role === 'teacher').length;
    const courseCount = Object.keys(courses).length;

    const msg =
      `📊 統計報表\n` +
      `學員數：${studentCount}\n` +
      `老師數：${teacherCount}\n` +
      `課程數：${courseCount}`;

    return replyText(replyToken, msg, teacherMenu);
  }

  return replyText(replyToken, '請使用選單操作', teacherMenu);
}

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

app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 服務正常運作中');
});

// Keep-alive 自我 ping
setInterval(() => {
  if (SELF_URL) {
    fetch(SELF_URL)
      .then(() => console.log('Keep-alive ping 成功'))
      .catch(e => console.error('Keep-alive ping 失敗', e));
  }
}, 1000 * 60 * 10); // 10分鐘一次

app.listen(PORT, () => {
  console.log(`伺服器已啟動，監聽端口：${PORT}`);
  backupData();
});
