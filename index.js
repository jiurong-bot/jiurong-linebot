// index.js - V3.13.1-postback 完整修正版 const express = require('express'); const fs = require('fs'); const path = require('path'); const line = require('@line/bot-sdk'); require('dotenv').config(); const fetch = require('node-fetch');

const app = express(); const PORT = process.env.PORT || 3000;

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const BACKUP_DIR = './backup'; const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527'; const PURCHASE_FORM_URL = process.env.PURCHASE_FORM_URL || 'https://docs.google.com/forms/your-form-id/viewform'; const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';

function formatToTaipeiISO(date) { const yyyy = date.getFullYear(); const MM = String(date.getMonth() + 1).padStart(2, '0'); const dd = String(date.getDate()).padStart(2, '0'); const hh = String(date.getHours()).padStart(2, '0'); const mm = String(date.getMinutes()).padStart(2, '0'); return ${yyyy}-${MM}-${dd}T${hh}:${mm}:00; }

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}'); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, '{}'); if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, }; const client = new line.Client(config);

function readJSON(file) { try { const content = fs.readFileSync(file, 'utf8'); return content ? JSON.parse(content) : {}; } catch { return {}; } } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function backupData() { const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); try { fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, data_backup_${timestamp}.json)); fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, courses_backup_${timestamp}.json)); console.log(✅ 資料備份成功：${timestamp}); } catch (err) { console.error('❌ 備份失敗:', err); } }

function formatDateTime(dateStr) { const date = new Date(dateStr); const mmdd = date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }).replace(///g, '-'); const weekdays = ['日', '一', '二', '三', '四', '五', '六']; const weekday = weekdays[date.getDay()]; const hhmm = date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }); return ${mmdd}（${weekday}）${hhmm}; }

function cleanCourses(courses) { const now = Date.now(); for (const id in courses) { const c = courses[id]; if (!c.title || !c.time || !c.students || !c.capacity) { delete courses[id]; continue; } if (!Array.isArray(c.students)) c.students = []; if (!Array.isArray(c.waiting)) c.waiting = []; if (new Date(c.time).getTime() < now - 86400000) { delete courses[id]; } } return courses; }

function studentMenu() { return [ { type: 'action', action: { type: 'postback', label: '預約課程', data: '@預約課程' } }, { type: 'action', action: { type: 'postback', label: '我的課程', data: '@我的課程' } }, { type: 'action', action: { type: 'postback', label: '點數查詢', data: '@點數' } }, { type: 'action', action: { type: 'postback', label: '購買點數', data: '@購點' } }, { type: 'action', action: { type: 'postback', label: '切換身份', data: '@切換身份' } }, ]; }

function teacherMenu() { return [ { type: 'action', action: { type: 'postback', label: '課程名單', data: '@課程名單' } }, { type: 'action', action: { type: 'postback', label: '新增課程', data: '@新增課程' } }, { type: 'action', action: { type: 'postback', label: '取消課程', data: '@取消課程' } }, { type: 'action', action: { type: 'postback', label: '加點/扣點', data: '@加點' } }, { type: 'action', action: { type: 'postback', label: '查學員', data: '@查學員' } }, { type: 'action', action: { type: 'postback', label: '報表', data: '@統計報表' } }, { type: 'action', action: { type: 'postback', label: '切換身份', data: '@切換身份' } }, ]; }

const pendingTeacherLogin = {}; const pendingCourseCreation = {}; const pendingCourseCancelConfirm = {};

// 清理過期課程（超過一天）
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

// 快速選單（postback 格式）
function studentMenu() {
  return [
    { type: 'action', action: { type: 'postback', label: '預約課程', data: '@預約課程' } },
    { type: 'action', action: { type: 'postback', label: '我的課程', data: '@我的課程' } },
    { type: 'action', action: { type: 'postback', label: '點數查詢', data: '@點數' } },
    { type: 'action', action: { type: 'postback', label: '購買點數', data: '@購點' } },
    { type: 'action', action: { type: 'postback', label: '切換身份', data: '@切換身份' } },
  ];
}

function teacherMenu() {
  return [
    { type: 'action', action: { type: 'postback', label: '課程名單', data: '@課程名單' } },
    { type: 'action', action: { type: 'postback', label: '新增課程', data: '@新增課程' } },
    { type: 'action', action: { type: 'postback', label: '取消課程', data: '@取消課程' } },
    { type: 'action', action: { type: 'postback', label: '加點/扣點', data: '@加點' } },
    { type: 'action', action: { type: 'postback', label: '查學員', data: '@查學員' } },
    { type: 'action', action: { type: 'postback', label: '報表', data: '@統計報表' } },
    { type: 'action', action: { type: 'postback', label: '切換身份', data: '@切換身份' } },
  ];
}

// 暫存狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingCourseCancelConfirm = {};

// 回覆簡訊文字與快速選單
function replyText(token, text, menu = null) {
  const msg = { type: 'text', text };
  if (menu) {
    msg.quickReply = { items: menu };
  }
  return client.replyMessage(token, msg);
}

// 主事件處理
async function handleEvent(event) {
  // 只處理 postback 與 message 事件
  if (event.type === 'postback') {
    const data = event.postback.data;

    // 取消課程 postback 格式 cancel_course_{id}
    if (data.startsWith('cancel_course_')) {
      const courseId = data.replace('cancel_course_', '');
      const courses = cleanCourses(readJSON(COURSE_FILE));
      const userId = event.source.userId;
      if (!courses[courseId]) {
        return replyText(event.replyToken, '找不到該課程，可能已被取消', teacherMenu());
      }
      pendingCourseCancelConfirm[userId] = courseId;
      return replyText(
        event.replyToken,
        `⚠️ 確認要取消課程「${courses[courseId].title}」嗎？\n一旦取消將退還所有學生點數。`,
        [
          { type: 'action', action: { type: 'postback', label: '✅ 是', data: 'confirm_cancel_yes' } },
          { type: 'action', action: { type: 'postback', label: '❌ 否', data: 'confirm_cancel_no' } },
        ]
      );
    }

    // 處理取消課程確認
    if (data === 'confirm_cancel_yes' || data === 'confirm_cancel_no') {
      const userId = event.source.userId;
      if (!pendingCourseCancelConfirm[userId]) {
        return replyText(event.replyToken, '目前沒有待取消的課程', teacherMenu());
      }
      if (data === 'confirm_cancel_yes') {
        return confirmCancelCourse(event, userId);
      } else {
        delete pendingCourseCancelConfirm[userId];
        return replyText(event.replyToken, '取消課程操作已中止', teacherMenu());
      }
    }

    // 身份切換 postback
    if (data === '@切換身份') {
      const userId = event.source.userId;
      const db = readJSON(DATA_FILE);
      if (!db[userId]) {
        db[userId] = { name: '', points: 0, role: 'student', history: [] };
      }
      if (db[userId].role === 'teacher') {
        db[userId].role = 'student';
        writeJSON(DATA_FILE, db);
        return replyText(event.replyToken, '已切換為學員身份', studentMenu());
      } else {
        pendingTeacherLogin[userId] = true;
        return replyText(event.replyToken, '請輸入老師密碼登入');
      }
    }

    // 老師新增課程流程觸發
    if (data === '@新增課程') {
      const userId = event.source.userId;
      pendingCourseCreation[userId] = { step: 1, data: {} };
      return replyText(event.replyToken, '請輸入課程名稱');
    }

    // 學員預約課程選擇 (postback 格式： book_course_{id} )
    if (data.startsWith('book_course_')) {
      return bookCourse(event, data.replace('book_course_', ''));
    }

    // 其他 postback 命令，轉為文字指令統一處理
    return handleText(event, data);
  }

  if (event.type === 'message' && event.message.type === 'text') {
    return handleText(event, event.message.text.trim());
  }

  // 其他事件不處理
  return Promise.resolve(null);
}

// 處理文字指令與多步驟
async function handleText(event, text) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  if (!db[userId]) {
    db[userId] = { name: '', points: 0, role: 'student', history: [] };
  }

  // 嘗試更新用戶名稱
  try {
    const profile = await client.getProfile(userId);
    db[userId].name = profile.displayName || db[userId].name || '匿名使用者';
  } catch (e) {
    console.error('取得用戶資料失敗', e);
  }
  writeJSON(DATA_FILE, db);

  // 處理老師登入密碼階段
  if (pendingTeacherLogin[userId]) {
    if (text === TEACHER_PASSWORD) {
      db[userId].role = 'teacher';
      writeJSON(DATA_FILE, db);
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '老師登入成功', teacherMenu());
    } else {
      delete pendingTeacherLogin[userId];
      return replyText(replyToken, '密碼錯誤，登入失敗', studentMenu());
    }
  }

  // 多步驟新增課程流程（老師身份）
  if (pendingCourseCreation[userId]) {
    const stepData = pendingCourseCreation[userId];

    switch (stepData.step) {
      case 1:
        stepData.data.title = text;
        stepData.step = 2;
        return replyText(replyToken, '請選擇課程日期（星期幾）:', [
          { type: 'action', action: { type: 'postback', label: '星期一', data: 'weekday_星期一' } },
          { type: 'action', action: { type: 'postback', label: '星期二', data: 'weekday_星期二' } },
          { type: 'action', action: { type: 'postback', label: '星期三', data: 'weekday_星期三' } },
          { type: 'action', action: { type: 'postback', label: '星期四', data: 'weekday_星期四' } },
          { type: 'action', action: { type: 'postback', label: '星期五', data: 'weekday_星期五' } },
          { type: 'action', action: { type: 'postback', label: '星期六', data: 'weekday_星期六' } },
          { type: 'action', action: { type: 'postback', label: '星期日', data: 'weekday_星期日' } },
        ]);
      case 2:
        if (!text.startsWith('weekday_')) {
          return replyText(replyToken, '請從快速選單中選擇正確的星期');
        }
        stepData.data.weekday = text.replace('weekday_', '');
        stepData.step = 3;
        return replyText(replyToken, '請輸入課程時間（24小時制，如 14:30）');
      case 3:
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
          return replyText(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
        }
        stepData.data.time = text;
        stepData.step = 4;
        return replyText(replyToken, '請輸入人員上限（正整數）');
      case 4:
        const capacity = parseInt(text);
        if (isNaN(capacity) || capacity <= 0) {
          return replyText(replyToken, '數量格式錯誤，請輸入正整數');
        }
        stepData.data.capacity = capacity;
        stepData.step = 5;
        return replyText(
          replyToken,
          `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}`,
          [
            { type: 'action', action: { type: 'postback', label: '✅ 是', data: 'confirm_create_course_yes' } },
            { type: 'action', action: { type: 'postback', label: '❌ 否', data: 'confirm_create_course_no' } },
          ]
        );
      default:
        delete pendingCourseCreation[userId];
        return replyText(replyToken, '流程異常，已重置', teacherMenu());
    }
  }

  // 處理建立課程確認與否
  if (text === 'confirm_create_course_yes' || text === 'confirm_create_course_no') {
    if (!pendingCourseCreation[userId]) {
      return replyText(replyToken, '目前沒有新增課程的進行中流程', teacherMenu());
    }
    if (text === 'confirm_create_course_yes') {
      // 繼續新增課程邏輯會在下一段給出
    } else {
      delete pendingCourseCreation[userId];
      return replyText(replyToken, '❌ 已取消新增課程', teacherMenu());
    }
  }

  // 老師或學生分流
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses, text);
  } else {
    return handleStudentCommands(event, userId, db, courses, text);
  }
}

if (text === 'confirm_create_course_yes') {
      const stepData = pendingCourseCreation[userId];
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const today = new Date();
      const todayWeekday = today.getDay();
      const targetWeekday = weekdays.indexOf(stepData.data.weekday);

      let dayDiff = (targetWeekday - todayWeekday + 7) % 7;
      if (dayDiff === 0) dayDiff = 7; // 預設新增下一週同一天

      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayDiff);

      const [hour, minute] = stepData.data.time.split(':').map(Number);
      targetDate.setHours(hour);
      targetDate.setMinutes(minute);
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);

      const taipeiTimeStr = formatToTaipeiISO(targetDate);
      const newId = 'course_' + Date.now();
      const courses = readJSON(COURSE_FILE);
      courses[newId] = {
        title: stepData.data.title,
        time: taipeiTimeStr,
        capacity: stepData.data.capacity,
        students: [],
        waiting: [],
      };

      writeJSON(COURSE_FILE, courses);
      delete pendingCourseCreation[userId];

      return replyText(
        replyToken,
        `✅ 課程已新增：${stepData.data.title}\n時間：${formatDateTime(taipeiTimeStr)}\n人數上限：${stepData.data.capacity}`,
        teacherMenu()
      );
    } else {
      delete pendingCourseCreation[userId];
      return replyText(replyToken, '❌ 已取消新增課程', teacherMenu());
    }
  }

  // 老師或學生功能分流
  if (db[userId].role === 'teacher') {
    return handleTeacherCommands(event, userId, db, courses, text);
  } else {
    return handleStudentCommands(event, userId, db, courses, text);
  }
}

// 學員功能處理
async function handleStudentCommands(event, userId, db, courses, text) {
  const replyToken = event.replyToken;
  const user = db[userId];

  if (text === '@預約課程' || text === '@預約') {
    const upcoming = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time) > new Date())
      .map(([id, c]) => ({
        type: 'action',
        action: { type: 'postback', label: `${formatDateTime(c.time)} ${c.title}`, data: `book_course_${id}` },
      }));
    if (upcoming.length === 0) {
      return replyText(replyToken, '目前沒有可預約的課程', studentMenu());
    }
    return replyText(replyToken, '請選擇課程：', upcoming);
  }

  if (text.startsWith('book_course_')) {
    // 預約課程
    return bookCourse(event, text.replace('book_course_', ''));
  }

  if (text === '@我的課程' || text === '@課程') {
    const now = Date.now();
    const myCourses = Object.entries(courses)
      .filter(([id, c]) => c.students.includes(userId) && new Date(c.time).getTime() > now)
      .map(([id, c]) => `- ${formatDateTime(c.time)} ${c.title}`);
    if (myCourses.length === 0) {
      return replyText(event.replyToken, '你尚未預約任何未來課程', studentMenu());
    }
    return replyText(event.replyToken, `你的預約課程：\n${myCourses.join('\n')}`, studentMenu());
  }

  if (text === '@點數') {
    return replyText(event.replyToken, `你的點數剩餘：${user.points} 點`, studentMenu());
  }

  if (text === '@購點') {
    return replyText(event.replyToken,
      `請點擊以下連結購買點數，完成轉帳後請填寫表單通知我們\n${PURCHASE_FORM_URL}`, studentMenu());
  }

  // 其他不認識指令
  return replyText(event.replyToken, '指令無效，請使用快速選單', studentMenu());
}

// 老師功能處理
async function handleTeacherCommands(event, userId, db, courses, text) {
  const replyToken = event.replyToken;

  if (text === '@課程名單') {
    const now = Date.now();
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time).getTime() > now)
      .map(([id, c]) => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `${formatDateTime(c.time)} ${c.title}`,
          data: `show_course_${id}`
        }
      }));
    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有未來課程', teacherMenu());
    }
    return replyText(replyToken, '請選擇要查看名單的課程', upcomingCourses);
  }

  if (text.startsWith('show_course_')) {
    const courseId = text.replace('show_course_', '');
    if (!courses[courseId]) {
      return replyText(replyToken, '找不到該課程', teacherMenu());
    }
    const c = courses[courseId];
    const studentNames = c.students.length > 0 ? c.students.map(id => db[id]?.name || id).join('\n') : '無';
    const waitNames = c.waiting.length > 0 ? c.waiting.map(id => db[id]?.name || id).join('\n') : '無';
    return replyText(replyToken,
      `課程：${c.title}\n時間：${formatDateTime(c.time)}\n\n已報名學生：\n${studentNames}\n\n候補學生：\n${waitNames}`,
      teacherMenu());
  }

  if (text === '@取消課程') {
    const now = Date.now();
    const upcomingCourses = Object.entries(courses)
      .filter(([id, c]) => new Date(c.time).getTime() > now)
      .map(([id, c]) => ({
        type: 'action',
        action: { type: 'postback', label: `${formatDateTime(c.time)} ${c.title}`, data: `cancel_course_${id}` }
      }));
    if (upcomingCourses.length === 0) {
      return replyText(replyToken, '目前沒有可取消的課程', teacherMenu());
    }
    return replyText(replyToken, '請選擇要取消的課程', upcomingCourses);
  }

  if (text === '@加點') {
    return replyText(replyToken,
      '請輸入格式：\n加點 userId 點數\n或\n扣點 userId 點數\n例如：加點 U1234567890 5',
      teacherMenu());
  }

  if (/^(加點|扣點) [a-zA-Z0-9_-]+ \d+$/.test(text)) {
    const [cmd, targetId, ptsStr] = text.split(' ');
    const pts = parseInt(ptsStr);
    if (!db[targetId]) {
      return replyText(replyToken, '查無該學員', teacherMenu());
    }
    if (cmd === '加點') {
      db[targetId].points = (db[targetId].points || 0) + pts;
    } else {
      db[targetId].points = Math.max((db[targetId].points || 0) - pts, 0);
    }
    writeJSON(DATA_FILE, db);
    return replyText(replyToken,
      `${cmd === '加點' ? '已加' : '已扣'}${pts}點給 ${db[targetId].name} (ID: ${targetId})`, teacherMenu());
  }

  if (text === '@查學員') {
    return replyText(replyToken,
      '請輸入學員 ID 查詢點數及課程紀錄，例如：查學員 U1234567890',
      teacherMenu());
  }

  if (text.startsWith('查學員 ')) {
    const targetId = text.replace('查學員 ', '').trim();
    if (!db[targetId]) {
      return replyText(replyToken, '查無該學員', teacherMenu());
    }
    const user = db[targetId];
    return replyText(replyToken,
      `學員：${user.name}\n點數：${user.points || 0}\n預約紀錄：\n${(user.history || []).join('\n') || '無'}`,
      teacherMenu());
  }

  if (text === '@統計報表') {
    let totalStudents = 0;
    for (const c of Object.values(courses)) {
      totalStudents += (c.students?.length || 0);
    }
    return replyText(replyToken,
      `目前共有課程：${Object.keys(courses).length} 堂\n總報名人數：${totalStudents} 人`,
      teacherMenu());
  }

  return replyText(replyToken, '指令無效，請使用快速選單', teacherMenu());
}

// 預約課程邏輯
async function bookCourse(event, courseId) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  if (!courses[courseId]) {
    return replyText(replyToken, '找不到該課程', studentMenu());
  }
  const course = courses[courseId];
  if (course.students.includes(userId)) {
    return replyText(replyToken, '你已經預約過此課程', studentMenu());
  }
  if (course.students.length < course.capacity) {
    if (!db[userId]) db[userId] = { name: '', points: 0, role: 'student', history: [] };
    if ((db[userId].points || 0) < 1) {
      return replyText(replyToken, '你的點數不足，請先購買點數', studentMenu());
    }
    course.students.push(userId);
    db[userId].points -= 1;
    db[userId].history = db[userId].history || [];
    db[userId].history.push(`預約課程：${course.title} ${formatDateTime(course.time)}`);
    writeJSON(DATA_FILE, db);
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, `✅ 預約成功：${course.title} ${formatDateTime(course.time)}`, studentMenu());
  } else {
    if (course.waiting.includes(userId)) {
      return replyText(replyToken, '你已在候補名單中，請耐心等候', studentMenu());
    }
    course.waiting.push(userId);
    writeJSON(COURSE_FILE, courses);
    return replyText(replyToken, '課程已滿，已加入候補名單', studentMenu());
  }
}

// 確認取消課程並退點
async function confirmCancelCourse(event, userId) {
  const replyToken = event.replyToken;
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const db = readJSON(DATA_FILE);

  const courseId = pendingCourseCancelConfirm[userId];
  if (!courseId || !courses[courseId]) {
    delete pendingCourseCancelConfirm[userId];
    return replyText(replyToken, '找不到該課程或已被取消', teacherMenu());
  }
  const c = courses[courseId];
  c.students.forEach(sid => {
    if (db[sid]) {
      db[sid].points = (db[sid].points || 0) + 1;
      db[sid].history = db[sid].history || [];
      db[sid].history.push(`課程取消退點：${c.title} ${formatDateTime(c.time)}`);
    }
  });
  delete courses[courseId];
  writeJSON(COURSE_FILE, courses);
  writeJSON(DATA_FILE, db);
  delete pendingCourseCancelConfirm[userId];
  return replyText(replyToken, `✅ 已取消課程「${c.title}」，並退還學生點數`, teacherMenu());
}

// Express 設定與 webhook
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 保持應用存活（避免 Render 自動休眠）
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  backupData();
  // 1 小時備份一次
  setInterval(backupData, 3600000);
});
