// 引入必要模組與設定
const express = require('express');
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');
const axios = require('axios');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

const DATA_FILE = './data.json';
const COURSE_FILE = './courses.json';
const FIXED_COURSE_FILE = './fixed_courses.json'; // 固定課程檔案
const BACKUP_DIR = './backup';

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || ''; // 老師購點通知權杖

// 確認必要檔案與資料夾存在
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(FIXED_COURSE_FILE)) fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

// 讀取 JSON 檔案（空檔或錯誤回傳空物件）
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

// 備份資料（data.json, courses.json, fixed_courses.json）
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    fs.copyFileSync(FIXED_COURSE_FILE, path.join(BACKUP_DIR, `fixed_courses_backup_${timestamp}.json`));
    console.log(`✅ 資料備份成功：${timestamp}`);
  } catch (err) {
    console.error('❌ 備份失敗:', err);
  }
}

// 清理過期及資料不完整的課程
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
    // 課程日期早於現在一天前，刪除
    if (new Date(c.date).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}

// 清理過期固定課程（理論上固定課程不刪，僅格式檢查）
function cleanFixedCourses(fixedCourses) {
  for (const id in fixedCourses) {
    const c = fixedCourses[id];
    if (!c.name || !c.weekday || typeof c.time !== 'string' || !c.max) {
      delete fixedCourses[id];
    }
  }
  return fixedCourses;
}

// 格式化日期 yyyy-mm-dd hh:mm
function formatDate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  const hh = ('0' + d.getHours()).slice(-2);
  const mi = ('0' + d.getMinutes()).slice(-2);
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// 發送 LINE Notify 訊息給老師（購點、備份通知等）
async function sendLineNotify(message) {
  if (!LINE_NOTIFY_TOKEN) return;
  try {
    await axios.post('https://notify-api.line.me/api/notify', new URLSearchParams({ message }), {
      headers: {
        Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
  } catch (error) {
    console.error('LINE Notify 發送失敗:', error.message);
  }
}

// 建立 Quick Reply 訊息
function createQuickReplyMessage(text, menu = []) {
  return {
    type: 'text',
    text,
    quickReply: menu.length > 0 ? {
      items: menu.map(i => ({
        type: 'action',
        action: i
      }))
    } : undefined,
  };
}

// 學員快速選單
const studentMenu = [
  { type: 'message', label: '預約課程', text: '@預約課程' },
  { type: 'message', label: '查詢課程', text: '@課程查詢' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '查詢點數', text: '@點數查詢' },
  { type: 'message', label: '購買點數', text: '@購點' },
  { type: 'message', label: '我的課程', text: '@我的課程' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 老師快速選單
const teacherMenu = [
  { type: 'message', label: '今日名單', text: '@今日名單' },
  { type: 'message', label: '新增課程', text: '@新增課程' },
  { type: 'message', label: '固定課程管理', text: '@固定課程' },
  { type: 'message', label: '查詢學員', text: '@查學員' },
  { type: 'message', label: '加點', text: '@加點' },
  { type: 'message', label: '扣點', text: '@扣點' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '候補查詢', text: '@候補查詢' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '行銷推播', text: '@行銷推播' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

// 老師登入暫存狀態
const pendingTeacherLogin = {};

// Express Webhook 路由
app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end(); // 先回覆 200，避免 webhook timeout
  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
  }
});

// 健康檢查路由
app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

// 主事件處理函式
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = {};
  let courses = {};
  let fixedCourses = {};

  try {
    db = readJSON(DATA_FILE);
    courses = cleanCourses(readJSON(COURSE_FILE));
    fixedCourses = cleanFixedCourses(readJSON(FIXED_COURSE_FILE));
  } catch (e) {
    console.error('讀取資料錯誤:', e);
    return replyText(event.replyToken, '⚠️ 系統發生錯誤，請稍後再試');
  }

  // 新用戶預設資料
  if (!db[userId]) {
    try {
      const profile = await client.getProfile(userId);
      db[userId] = {
        name: profile.displayName || '未命名',
        role: 'student',
        points: 0,
        history: [],
        points_expiry: {}, // { courseId: expireDateISOString }
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
      return client.replyMessage(event.replyToken, createQuickReplyMessage('請輸入老師密碼以切換身份', []));
    }
    if (user.role === 'teacher') {
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

  // 根據身份分流處理
  if (user.role === 'student') {
    return handleStudentCommands(event, userId, msg, user, db, courses, fixedCourses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses, fixedCourses);
  } else {
    return client.replyMessage(event.replyToken, createQuickReplyMessage('請選擇身份', [
      { type: 'message', label: '學員', text: '@身份 學員' },
      { type: 'message', label: '老師', text: '@身份 老師' },
    ]));
  }
}

// 學員指令處理函式（新增固定課程參數）
async function handleStudentCommands(event, userId, msg, user, db, courses, fixedCourses) {
  const replyToken = event.replyToken;

  // 顯示點數
  if (msg === '@點數查詢') {
    return client.replyMessage(replyToken, createQuickReplyMessage(`您目前剩餘點數為：${user.points} 點。`, studentMenu));
  }

  // 顯示可預約課程（含固定課程＋臨時課程），使用 Quick Reply
  if (msg === '@預約課程') {
    const allCourses = [];

    // 臨時課程
    Object.entries(courses).forEach(([id, c]) => {
      if (c.name && c.date) allCourses.push({ id, name: c.name, date: c.date });
    });

    // 固定課程展開為未來四週課程，示意: 固定課程會展開成多個即將可預約的課程
    const upcomingFixed = expandFixedCourses(fixedCourses, 28); // 展開未來28天的固定課程
    upcomingFixed.forEach((c, idx) => {
      allCourses.push({ id: `fixed_${c.fixedId}_${c.date}`, name: c.name, date: c.date });
    });

    if (allCourses.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('目前無相關課程。', studentMenu));
    }

    const quickItems = allCourses.map(c => ({
      type: 'message',
      label: `${c.name} (${c.date.slice(0, 16)})`,
      text: `預約 ${c.id}`
    })).slice(0, 13); // LINE Quick Reply 上限 13 個

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇欲預約的課程：',
      quickReply: { items: quickItems }
    });
  }

  // 預約課程（包含固定課程ID解析）
  if (/^預約 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    let course = null;

    if (courseId.startsWith('fixed_')) {
      // 固定課程，動態生成臨時課程ID和結構
      const parts = courseId.split('_');
      const fixedId = parts[1];
      const dateStr = parts.slice(2).join('_');
      const fixedCourse = fixedCourses[fixedId];
      if (!fixedCourse) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該固定課程', studentMenu));
      course = {
        name: fixedCourse.name,
        date: dateStr.replace(/_/g, '-').replace('T', ' '),
        max: fixedCourse.max,
        students: [],
        waitlist: []
      };
      // 因為固定課程為動態生成，暫不儲存課程資料庫中，改為用暫存管理或直接以動態資料處理
      // 簡單起見，先提示「功能尚未完全支持此項目」
      return client.replyMessage(replyToken, createQuickReplyMessage('固定課程預約功能正在開發中，敬請期待。', studentMenu));
    } else {
      // 臨時課程
      const coursesData = cleanCourses(readJSON(COURSE_FILE));
      course = coursesData[courseId];
      if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該課程編號', studentMenu));
    }

    if (course.students && course.students.includes(userId)) return client.replyMessage(replyToken, createQuickReplyMessage('您已預約此課程', studentMenu));
    if (course.waitlist && course.waitlist.includes(userId)) return client.replyMessage(replyToken, createQuickReplyMessage('您已在候補名單中', studentMenu));
    if (user.points <= 0) return client.replyMessage(replyToken, createQuickReplyMessage('點數不足', studentMenu));

    // 預約流程（此處先支持臨時課程）
    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      user.points_expiry[courseId] = new Date(Date.now() + 30*24*60*60*1000).toISOString();
      const dbData = readJSON(DATA_FILE);
      const coursesData = readJSON(COURSE_FILE);
      dbData[userId] = user;
      coursesData[courseId] = course;
      writeJSON(DATA_FILE, dbData);
      writeJSON(COURSE_FILE, coursesData);
      return client.replyMessage(replyToken, createQuickReplyMessage('✅ 預約成功，已扣除 1 點', studentMenu));
    } else {
      course.waitlist.push(userId);
      const coursesData = readJSON(COURSE_FILE);
      coursesData[courseId] = course;
      writeJSON(COURSE_FILE, coursesData);
      return client.replyMessage(replyToken, createQuickReplyMessage(`目前已額滿，您已加入候補名單，順位：${course.waitlist.length}`, studentMenu));
    }
  }

  // 其餘學員指令繼續維持舊版邏輯 (略)
  // 你可根據需求調整或告知我繼續補齊
}

// 展開固定課程成未來幾天的課程陣列 (預設展開28天)
function expandFixedCourses(fixedCourses, days = 28) {
  const results = [];
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  for (const [fixedId, course] of Object.entries(fixedCourses)) {
    if (!course.name || !course.weekdays || !course.time || !course.max) continue;

    // course.weekdays 為陣列，如 [1,3,5] 表示週一、週三、週五
    // course.time 為 "19:00" 形式字串

    // 從今天起到 endDate，找出該週幾的日期
    for (let d = new Date(now); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (course.weekdays.includes(d.getDay())) {
        // 生成課程日期時間字串 yyyy-mm-dd hh:mm
        const yyyy = d.getFullYear();
        const mm = ('0' + (d.getMonth() + 1)).slice(-2);
        const dd = ('0' + d.getDate()).slice(-2);
        const dateStr = `${yyyy}-${mm}-${dd} ${course.time}`;
        results.push({ fixedId, name: course.name, date: dateStr, max: course.max });
      }
    }
  }

  return results;
}

// 固定課程資料範例（可讀取或寫入外部json檔）
const fixedCourses = {
  'fixed1': {
    name: '週一瑜伽',
    weekdays: [1], // 0=週日,1=週一,...6=週六
    time: '19:00',
    max: 8
  },
  'fixed2': {
    name: '週三伸展',
    weekdays: [3],
    time: '19:00',
    max: 10
  }
  // 可擴充更多固定課程
};

// 合併固定課程與一般課程
function getAllCourses(courses, fixedCourses) {
  // 展開固定課程為課程物件陣列
  const expandedFixed = expandFixedCourses(fixedCourses);

  // 轉換一般課程物件為陣列，並標註為一般課程
  const normalCourses = Object.entries(courses)
    .filter(([_, c]) => c.name && c.date)
    .map(([id, c]) => ({ id, ...c, type: 'normal' }));

  // 將展開的固定課程用固定ID＋日期組合成唯一ID
  const fixedCourseObjs = expandedFixed.map(fc => {
    const id = `fixed_${fc.fixedId}_${fc.date.replace(/[- :]/g, '')}`;
    return {
      id,
      name: fc.name,
      date: fc.date,
      max: fc.max,
      students: [],
      waitlist: [],
      type: 'fixed',
      fixedId: fc.fixedId,
    };
  });

  return normalCourses.concat(fixedCourseObjs);
}

// 更新固定課程報名資料：將原本儲存在 courses 裡的學生和候補資料，合併到展開後的固定課程對應ID
function syncFixedCourseEnrollment(allCourses, courses) {
  for (const course of allCourses) {
    if (course.type === 'fixed') {
      // 找固定課程原始設定學生與候補
      const fixedCourse = courses[course.id]; // 一般 courses 裡不會有 fixed id，可能是空的
      // 由於固定課程資料沒有在 courses 裡管理學生，需要自行設計儲存方案（建議另設 fixed_enrollments.json）
      // 這裡暫時空置，後續可擴充儲存及同步機制
    }
  }
}

// 固定課程報名管理（存放於 fixed_enrollments.json）
const FIXED_ENROLL_FILE = './fixed_enrollments.json';

// 讀取固定課程報名資料
function readFixedEnrollments() {
  try {
    const content = fs.readFileSync(FIXED_ENROLL_FILE, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

// 寫入固定課程報名資料
function writeFixedEnrollments(data) {
  fs.writeFileSync(FIXED_ENROLL_FILE, JSON.stringify(data, null, 2));
}

// 新增固定課程報名
function enrollFixedCourse(userId, fixedCourseId, date) {
  const enrollments = readFixedEnrollments();
  const key = `${fixedCourseId}_${date}`;
  if (!enrollments[key]) {
    enrollments[key] = { students: [], waitlist: [] };
  }
  if (!enrollments[key].students.includes(userId) && !enrollments[key].waitlist.includes(userId)) {
    enrollments[key].students.push(userId);
    writeFixedEnrollments(enrollments);
    return true;
  }
  return false;
}

// 取消固定課程報名
function cancelFixedEnrollment(userId, fixedCourseId, date) {
  const enrollments = readFixedEnrollments();
  const key = `${fixedCourseId}_${date}`;
  if (enrollments[key]) {
    const studentIdx = enrollments[key].students.indexOf(userId);
    if (studentIdx !== -1) {
      enrollments[key].students.splice(studentIdx, 1);
      writeFixedEnrollments(enrollments);
      return true;
    }
    const waitlistIdx = enrollments[key].waitlist.indexOf(userId);
    if (waitlistIdx !== -1) {
      enrollments[key].waitlist.splice(waitlistIdx, 1);
      writeFixedEnrollments(enrollments);
      return true;
    }
  }
  return false;
}

// 節氣與活動推播範例資料
const MARKETING_EVENTS = [
  { date: '2025-07-07', title: '小暑', message: '今日節氣：小暑，注意防暑降溫，保持身心舒暢！' },
  { date: '2025-07-15', title: '瑜伽工作坊', message: '本週瑜伽工作坊開放報名，歡迎大家踴躍參加！' },
  // 更多節氣或活動...
];

// 行銷推播主動通知給所有學員
async function sendMarketingBroadcast() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const event = MARKETING_EVENTS.find(e => e.date === todayStr);
  if (!event) return;

  const db = readJSON(DATA_FILE);
  const studentIds = Object.entries(db)
    .filter(([_, u]) => u.role === 'student')
    .map(([id]) => id);

  const messages = studentIds.map(uid => ({
    type: 'text',
    text: `📣 【${event.title}】\n${event.message}`
  }));

  // 批量推播（依限制分批推送，這裡簡化為一批）
  try {
    for (const msg of messages) {
      await client.pushMessage(msg.to, msg);
    }
    console.log(`已推播行銷活動：${event.title}`);
  } catch (err) {
    console.error('行銷推播錯誤:', err);
  }
}

// 每日定時檢查是否有行銷活動推播（例：每天 09:00）
function scheduleMarketingBroadcast() {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      sendMarketingBroadcast();
    }
  }, 60 * 1000); // 每分鐘檢查
}

// 啟動行銷推播排程
scheduleMarketingBroadcast();

// LINE 日期選擇器格式（Flex Message 範例）
function createDatePickerFlex(dateLabel, actionLabel, dataPrefix) {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: dateLabel,
          weight: "bold",
          size: "md",
          margin: "md"
        },
        {
          type: "button",
          style: "primary",
          action: {
            type: "datetimepicker",
            label: actionLabel,
            data: dataPrefix,
            mode: "date"
          },
          margin: "md"
        }
      ]
    }
  };
}

// 範例使用：老師新增固定課程時，讓老師點選日期
async function promptFixedCourseDateSelection(replyToken) {
  const flexMsg = {
    type: "flex",
    altText: "請選擇開始日期",
    contents: createDatePickerFlex("選擇固定課程開始日期", "選擇日期", "fixedCourseDate")
  };
  await client.replyMessage(replyToken, flexMsg);
}

// 固定課程資料結構範例
// fixedCourses = {
//   id: {
//     name: "伸展",
//     weekday: 1, // 0=週日，1=週一...6=週六
//     time: "19:00",
//     max: 8,
//   },
//   ...
// };

const FIXED_COURSE_FILE = './fixed_courses.json';

if (!fs.existsSync(FIXED_COURSE_FILE)) fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify({}, null, 2));

function readFixedCourses() {
  try {
    const content = fs.readFileSync(FIXED_COURSE_FILE, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch {
    return {};
  }
}

function writeFixedCourses(data) {
  fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify(data, null, 2));
}

// 將固定課程自動轉換為當日具體課程（生成當月及未來課程）
function generateCoursesFromFixed() {
  const fixedCourses = readFixedCourses();
  const courses = readJSON(COURSE_FILE);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0); // 兩個月後月底

  // 以固定課程為基礎，生成課程ID並填入 courses
  for (const [id, fc] of Object.entries(fixedCourses)) {
    // 從 startDate 到 endDate，每週檢查該 weekday 是否生成課程
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === fc.weekday) {
        // 格式化日期時間
        const dateStr = `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)} ${fc.time}`;
        // 課程ID = fixedCourseId + 日期
        const courseId = `${id}_${d.getFullYear()}${('0' + (d.getMonth() + 1)).slice(-2)}${('0' + d.getDate()).slice(-2)}`;

        if (!courses[courseId]) {
          courses[courseId] = {
            name: fc.name,
            date: dateStr,
            max: fc.max,
            students: [],
            waitlist: []
          };
        }
      }
    }
  }

  writeJSON(COURSE_FILE, courses);
}

// 新增固定課程 - 老師指令處理
async function handleAddFixedCourse(event, msg, fixedCourses) {
  const replyToken = event.replyToken;
  // 格式示例: @新增固定課程 伸展 1 19:00 8
  // 代表週一(1)19:00，名額8人
  const parts = msg.split(' ');
  if (parts.length < 5) {
    return client.replyMessage(replyToken, createQuickReplyMessage(
      '格式錯誤！\n範例：@新增固定課程 課名 星期(0-6) 時間(HH:mm) 名額\n例如：@新增固定課程 伸展 1 19:00 8',
      teacherMenu
    ));
  }
  const [_, __, name, weekdayStr, time, maxStr] = parts;
  const weekday = parseInt(weekdayStr);
  const max = parseInt(maxStr);

  if (isNaN(weekday) || weekday < 0 || weekday > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || isNaN(max) || max <= 0) {
    return client.replyMessage(replyToken, createQuickReplyMessage(
      '輸入資料格式錯誤！\n星期請輸入0~6，時間格式為HH:mm，名額須為正整數',
      teacherMenu
    ));
  }

  // 生成固定課程ID
  const fixedCoursesIds = Object.keys(fixedCourses);
  let newIdNum = 1;
  while (fixedCoursesIds.includes(`fixed_${newIdNum}`)) {
    newIdNum++;
  }
  const newId = `fixed_${newIdNum}`;

  fixedCourses[newId] = {
    name,
    weekday,
    time,
    max,
  };

  writeFixedCourses(fixedCourses);

  // 生成具體課程
  generateCoursesFromFixed();

  return client.replyMessage(replyToken, createQuickReplyMessage(`✅ 新增固定課程成功：${name} 週${weekday} ${time} 名額${max}`, teacherMenu));
}

// 讀取固定課程資料
function readFixedCourses() {
  try {
    if (!fs.existsSync(FIXED_COURSE_FILE)) {
      fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify({}, null, 2));
      return {};
    }
    const content = fs.readFileSync(FIXED_COURSE_FILE, 'utf8');
    return content ? JSON.parse(content) : {};
  } catch (err) {
    console.error('讀取固定課程資料錯誤:', err);
    return {};
  }
}

// 寫入固定課程資料
function writeFixedCourses(data) {
  try {
    fs.writeFileSync(FIXED_COURSE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('寫入固定課程資料錯誤:', err);
  }
}

// 根據固定課程自動生成當週具體課程（週期執行或手動觸發）
function generateCoursesFromFixed() {
  const fixedCourses = readFixedCourses();
  const courses = readJSON(COURSE_FILE);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // 計算本週週一日期 (週日為0, 週一為1...)
  const monday = new Date(now);
  const dayOfWeek = now.getDay();
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  monday.setDate(day + diff);

  // 生成本週7天內的課程
  for (const [fixedId, fixed] of Object.entries(fixedCourses)) {
    // 計算課程日期（本週固定的星期幾）
    const courseDate = new Date(monday);
    courseDate.setDate(monday.getDate() + fixed.weekday);
    const dateStr = `${courseDate.getFullYear()}-${('0' + (courseDate.getMonth() + 1)).slice(-2)}-${('0' + courseDate.getDate()).slice(-2)}`;

    // 課程日期時間合併
    const courseDateTime = `${dateStr} ${fixed.time}`;

    // 判斷是否已有此課程（同名且同時間）
    const exists = Object.values(courses).some(c => c.name === fixed.name && c.date === courseDateTime);
    if (!exists) {
      // 新增課程ID
      const courseId = `course_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      courses[courseId] = {
        name: fixed.name,
        date: courseDateTime,
        max: fixed.max,
        students: [],
        waitlist: [],
      };
    }
  }

  writeJSON(COURSE_FILE, courses);
}

// 行銷推播模組：節氣提醒與活動通知

// 節氣資料範例 (農曆節氣對應公曆日期，這裡簡化示範)
const solarTerms = [
  { name: '立春', month: 2, day: 4 },
  { name: '春分', month: 3, day: 20 },
  { name: '清明', month: 4, day: 5 },
  { name: '立夏', month: 5, day: 6 },
  { name: '夏至', month: 6, day: 21 },
  { name: '立秋', month: 8, day: 8 },
  { name: '秋分', month: 9, day: 23 },
  { name: '霜降', month: 10, day: 23 },
  { name: '立冬', month: 11, day: 7 },
  { name: '冬至', month: 12, day: 21 },
  { name: '小寒', month: 1, day: 6 },
  { name: '大寒', month: 1, day: 20 },
];

// 每日檢查是否有節氣推播
function checkSolarTermBroadcast() {
  const now = new Date();
  const month = now.getMonth() + 1; // JS月份0~11
  const day = now.getDate();

  const term = solarTerms.find(t => t.month === month && t.day === day);
  if (term) {
    const message = `🌿 今日節氣：【${term.name}】，九容瑜伽邀您感受自然節奏，調整身心。歡迎報名相關課程！`;
    broadcastToAllStudents(message);
  }
}

// 活動推播範例 (可擴充外部活動資料源)
const upcomingEvents = [
  { date: '2025-08-15', title: '瑜伽夏日工作坊' },
  { date: '2025-09-10', title: '秋季冥想課程開放報名' },
];

// 每日檢查活動推播（提前7天通知）
function checkEventBroadcast() {
  const now = new Date();
  upcomingEvents.forEach(event => {
    const eventDate = new Date(event.date);
    const diffDays = Math.floor((eventDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays === 7) {
      const message = `📣 活動提醒：${event.title} 即將於 ${event.date} 舉行，歡迎報名參加！`;
      broadcastToAllStudents(message);
    }
  });
}

// 廣播訊息給所有學員
function broadcastToAllStudents(message) {
  const db = readJSON(DATA_FILE);
  const studentIds = Object.entries(db)
    .filter(([_, u]) => u.role === 'student')
    .map(([id]) => id);

  studentIds.forEach(id => {
    client.pushMessage(id, {
      type: 'text',
      text: message,
    }).catch(console.error);
  });
}

// 新增對話事件處理：節氣與活動推播觸發指令

async function handleMarketingCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@節氣推播') {
    checkSolarTermBroadcast();
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '已手動觸發節氣推播通知給所有學員。',
    });
  }

  if (msg === '@活動推播') {
    checkEventBroadcast();
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '已手動觸發活動推播通知給所有學員。',
    });
  }

  return client.replyMessage(replyToken, {
    type: 'text',
    text: '請輸入正確的行銷推播指令，例如 @節氣推播 或 @活動推播。',
  });
}

// 在 handleEvent 中加入行銷推播指令攔截（老師身份可用）
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
        points_expiry: {},
      };
      writeJSON(DATA_FILE, db);
    } catch (e) {
      console.error('取得用戶資料失敗:', e);
      return replyText(event.replyToken, '⚠️ 無法取得您的資料，請稍後再試');
    }
  }

  const user = db[userId];

  // 身份切換與登入流程同前（略）

  if (msg.startsWith('@行銷')) {
    if (user.role !== 'teacher') {
      return client.replyMessage(event.replyToken, createQuickReplyMessage('只有老師能使用行銷推播功能。', []));
    }
    return handleMarketingCommands(event, userId, msg.replace('@行銷', '').trim(), user, db, courses);
  }

  // 其餘身份分流與指令處理同前（略）
}

// 節氣推播模組：檢查當日節氣，推播通知給所有學員
const solarTerms = {
  '2025-07-07': '小暑',
  '2025-07-22': '大暑',
  '2025-08-07': '立秋',
  '2025-08-23': '處暑',
  // 可持續擴充年度節氣日期
};

async function checkSolarTermBroadcast() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const term = solarTerms[todayStr];
  if (!term) return;

  const db = readJSON(DATA_FILE);
  const studentIds = Object.entries(db)
    .filter(([_, u]) => u.role === 'student')
    .map(([id]) => id);

  const message = `🌿 今日節氣「${term}」到來，九容瑜伽邀您一起調整身心，迎接自然節律。`;

  for (const userId of studentIds) {
    try {
      await client.pushMessage(userId, { type: 'text', text: message });
    } catch (err) {
      console.error(`節氣推播失敗，UserId: ${userId}`, err);
    }
  }
}

// 活動推播模組：管理活動通知，定期推播
const upcomingEvents = [
  { date: '2025-07-15', title: '夏日瑜伽工作坊' },
  { date: '2025-08-01', title: '八月新課程開放' },
  // 持續維護活動列表
];

async function checkEventBroadcast() {
  const today = new Date();
  const db = readJSON(DATA_FILE);
  const studentIds = Object.entries(db)
    .filter(([_, u]) => u.role === 'student')
    .map(([id]) => id);

  for (const event of upcomingEvents) {
    const eventDate = new Date(event.date);
    const diffDays = (eventDate - today) / (1000 * 3600 * 24);

    // 在活動前7天推播提醒
    if (diffDays >= 0 && diffDays < 7) {
      const message = `🎉 活動提醒：${event.title} 將於 ${event.date} 舉行，歡迎踴躍報名！`;
      for (const userId of studentIds) {
        try {
          await client.pushMessage(userId, { type: 'text', text: message });
        } catch (err) {
          console.error(`活動推播失敗，UserId: ${userId}`, err);
        }
      }
    }
  }
}

// 定時任務：每日定時檢查節氣及活動推播（00:05執行）
setInterval(() => {
  const now = new Date();
  const hhmm = `${now.getHours()}:${now.getMinutes()}`;

  if (hhmm === '0:5') {
    checkSolarTermBroadcast().catch(console.error);
    checkEventBroadcast().catch(console.error);
  }

  // 其他定時任務 (備份、提醒、月報) 可同時放此區
}, 60 * 1000); // 每分鐘檢查一次

// Express 啟動 (重複定義確保完整)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 九容瑜伽 LINE Bot V3.6 啟動成功（port ${PORT}）`);
});
