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
const BACKUP_DIR = './backup';

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || ''; // LINE Notify 權杖，老師接收購點通知

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));
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

// 清理過期與結構不完整的課程
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
    // 若課程日期早於現在，刪除
    if (new Date(c.date).getTime() < now - 86400000) {
      delete courses[id];
    }
  }
  return courses;
}

// 備份資料檔案（data.json, courses.json）
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

// 發送 LINE Notify 訊息給老師
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
  { type: 'message', label: '查詢學員', text: '@查學員' },
  { type: 'message', label: '加點', text: '@加點' },
  { type: 'message', label: '扣點', text: '@扣點' },
  { type: 'message', label: '取消課程', text: '@取消課程' },
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const pendingTeacherLogin = {}; // 老師登入暫存狀態

// Helper: 產生 quick reply 選單訊息
function createQuickReplyMessage(text, menu) {
  return {
    type: 'text',
    text,
    quickReply: {
      items: menu.map(i => ({
        type: 'action',
        action: i,
      })),
    }
  };
}

// Webhook 路由，處理 LINE 事件
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
        points_expiry: {}, // { courseId: expireDateISOString }
      };
      writeJSON(DATA_FILE, db);
    } catch (e) {
      console.error('取得用戶資料失敗:', e);
      return replyText(event.replyToken, '⚠️ 無法取得您的資料，請稍後再試');
    }
  }

  const user = db[userId];

  // 身份切換和登入流程
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
    return handleStudentCommands(event, userId, msg, user, db, courses);
  } else if (user.role === 'teacher') {
    return handleTeacherCommands(event, userId, msg, user, db, courses);
  } else {
    return client.replyMessage(event.replyToken, createQuickReplyMessage('請選擇身份', [
      { type: 'message', label: '學員', text: '@身份 學員' },
      { type: 'message', label: '老師', text: '@身份 老師' },
    ]));
  }
}

async function handleStudentCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  // 顯示點數
  if (msg === '@點數查詢') {
    return client.replyMessage(replyToken, createQuickReplyMessage(`您目前剩餘點數為：${user.points} 點。`, studentMenu));
  }

  // 顯示可預約課程，改用 Quick Reply 按鈕顯示課程
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

  // 預約課程，含候補順位顯示
  if (/^預約 /.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該課程編號', studentMenu));
    if (course.students.includes(userId)) return client.replyMessage(replyToken, createQuickReplyMessage('您已預約此課程', studentMenu));
    if (course.waitlist.includes(userId)) return client.replyMessage(replyToken, createQuickReplyMessage('您已在候補名單中', studentMenu));
    if (user.points <= 0) return client.replyMessage(replyToken, createQuickReplyMessage('點數不足', studentMenu));

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      user.points_expiry[courseId] = new Date(Date.now() + 30*24*60*60*1000).toISOString(); // 點數30天後到期
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return client.replyMessage(replyToken, createQuickReplyMessage('✅ 預約成功，已扣除 1 點', studentMenu));
    } else {
      course.waitlist.push(userId);
      writeJSON(COURSE_FILE, courses);
      return client.replyMessage(replyToken, createQuickReplyMessage(`目前已額滿，您已加入候補名單，順位：${course.waitlist.length}`, studentMenu));
    }
  }

  // 顯示我的課程，含候補順位及一鍵取消候補
  if (msg === '@我的課程') {
    const booked = [];
    const waitlisted = [];

    for (const [cid, course] of Object.entries(courses)) {
      if (course.students.includes(userId)) {
        booked.push(`${course.name} (${course.date})`);
      }
      if (course.waitlist.includes(userId)) {
        const pos = course.waitlist.indexOf(userId) + 1;
        waitlisted.push(`${course.name} (${course.date}) 候補順位：${pos}`);
      }
    }

    let text = '';
    if (booked.length > 0) text += `✅ 已預約課程：\n${booked.join('\n')}\n\n`;
    if (waitlisted.length > 0) {
      text += `⏳ 候補中課程：\n${waitlisted.join('\n')}\n\n`;
      text += '您可以輸入「取消候補 課程編號」來取消候補';
    }
    if (!text) text = '尚無預約或候補課程';

    return client.replyMessage(replyToken, createQuickReplyMessage(text, studentMenu));
  }

  // 取消預約或候補（含候補取消）
  if (/^(取消課程|取消候補) /.test(msg)) {
    const parts = msg.split(' ');
    if (parts.length < 2) {
      return client.replyMessage(replyToken, createQuickReplyMessage('請輸入正確格式，例如：「取消課程 course_xxx」或「取消候補 course_xxx」', studentMenu));
    }
    const courseId = parts[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該課程', studentMenu));

    if (parts[0] === '取消課程') {
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
        return client.replyMessage(replyToken, createQuickReplyMessage('✅ 已取消預約並退回 1 點', studentMenu));
      } else {
        return client.replyMessage(replyToken, createQuickReplyMessage('您未預約此課程', studentMenu));
      }
    } else if (parts[0] === '取消候補') {
      const waitIdx = course.waitlist.indexOf(userId);
      if (waitIdx >= 0) {
        course.waitlist.splice(waitIdx, 1);
        writeJSON(COURSE_FILE, courses);
        return client.replyMessage(replyToken, createQuickReplyMessage('✅ 已取消候補名單', studentMenu));
      } else {
        return client.replyMessage(replyToken, createQuickReplyMessage('您未候補此課程', studentMenu));
      }
    }
  }

  // 查詢課程（列表顯示）
  if (msg === '@課程查詢') {
    const allCourses = Object.entries(courses).filter(([_, c]) => c.name && c.date);
    if (allCourses.length === 0) {
      return client.replyMessage(replyToken, createQuickReplyMessage('目前無相關課程。', studentMenu));
    }

    const list = allCourses
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');

    return client.replyMessage(replyToken, createQuickReplyMessage(`📚 目前課程清單：\n${list}`, studentMenu));
  }

  // 購點說明
  if (msg === '@購點') {
    // 用 LINE Notify 通知老師（可自行設定通知機制）
    notifyTeacherPurchase(user.name, userId);

    return client.replyMessage(replyToken, createQuickReplyMessage(
      '請填寫購點表單：https://yourform.url\n銀行：中國信托（882）\n帳號：012540278393\n轉帳後五碼請填寫表單\n💰 點數方案：5點（500元）、10點（1000元）、50點（5000元）',
      studentMenu
    ));
  }

  return client.replyMessage(replyToken, createQuickReplyMessage('請使用選單操作或正確指令。', studentMenu));
}

function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  // 今日課程名單（含學生姓名）
  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const list = Object.entries(courses)
      .filter(([_, c]) => c.date.startsWith(today))
      .map(([id, c]) => {
        const names = c.students.map(uid => db[uid]?.name || uid.slice(-4)).join(', ') || '無';
        return `📌 ${c.name} (${c.date})\n👥 報名：${c.students.length} 人\n🙋‍♀️ 學員：${names}`;
      })
      .join('\n\n') || '今天沒有課程';
    return client.replyMessage(replyToken, createQuickReplyMessage(list, teacherMenu));
  }

  // 新增課程
  if (msg.startsWith('@新增課程')) {
    const parts = msg.split(' ');
    if (parts.length < 5) {
      return client.replyMessage(replyToken, createQuickReplyMessage('格式：@新增課程 課名 日期 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu));
    }
    const name = parts[1];
    const date = `${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}`;
    const max = parseInt(parts[4]);
    const id = `course_${Date.now()}`;
    courses[id] = { name, date, max, students: [], waitlist: [] };
    writeJSON(COURSE_FILE, courses);
    return client.replyMessage(replyToken, createQuickReplyMessage(`✅ 已新增課程：${name}`, teacherMenu));
  }

  // 取消課程（退還點數並處理候補）
  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到課程', teacherMenu));

    course.students.forEach(uid => {
      if (db[uid]) db[uid].points += 1;
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage(`✅ 已取消課程 ${courseId} 並退回點數`, teacherMenu));
  }

  // 查詢學員清單（快速列表）
  if (msg === '@查學員') {
    const list = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)} 點數：${u.points}｜預約：${u.history.length}`)
      .join('\n') || '沒有學員資料';
    return client.replyMessage(replyToken, createQuickReplyMessage(list, teacherMenu));
  }

  // 單一學員查詢
  if (/^@查學員 /.test(msg)) {
    const targetId = msg.split(' ')[1];
    const stu = db[targetId];
    if (!stu) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該學員', teacherMenu));
    const record = stu.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date})` : `❌ ${h.courseId}`;
    }).join('\n') || '無預約紀錄';
    return client.replyMessage(replyToken, createQuickReplyMessage(`點數：${stu.points}\n紀錄：\n${record}`, teacherMenu));
  }

  // 加點
  if (/^@加點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該學員', teacherMenu));
    db[targetId].points += parseInt(amount);
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage(`✅ 已為 ${targetId} 加點 ${amount}`, teacherMenu));
  }

  // 扣點
  if (/^@扣點 /.test(msg)) {
    const [_, targetId, amount] = msg.split(' ');
    if (!db[targetId]) return client.replyMessage(replyToken, createQuickReplyMessage('找不到該學員', teacherMenu));
    db[targetId].points -= parseInt(amount);
    writeJSON(DATA_FILE, db);
    return client.replyMessage(replyToken, createQuickReplyMessage(`✅ 已為 ${targetId} 扣點 ${amount}`, teacherMenu));
  }

  // 候補名單查詢
  if (msg.startsWith('@候補查詢')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return client.replyMessage(replyToken, createQuickReplyMessage('找不到課程', teacherMenu));
    const names = course.waitlist.map(uid => db[uid]?.name || uid.slice(-4));
    const list = names.length > 0 ? names.map((n, i) => `${i + 1}. ${n}`).join('\n') : '無候補';
    return client.replyMessage(replyToken, createQuickReplyMessage(`📋 候補名單（${course.name}）：\n${list}`, teacherMenu));
  }

  // 統計報表
  if (msg === '@統計報表') {
    const summary = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id, u]) => `學員 ${u.name || id.slice(-4)}：${u.history.length} 堂課`)
      .join('\n') || '尚無預約紀錄';
    return client.replyMessage(replyToken, createQuickReplyMessage(summary, teacherMenu));
  }

  // 廣播訊息
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
    return client.replyMessage(replyToken, createQuickReplyMessage('✅ 已發送廣播訊息', teacherMenu));
  }

  return client.replyMessage(replyToken, createQuickReplyMessage('請使用選單操作或正確指令。', teacherMenu));
}

// 建立 Quick Reply 訊息
function createQuickReplyMessage(text, items = []) {
  const quickReply = items.length > 0 ? {
    quickReply: {
      items: items.map(action => ({
        type: 'action',
        action
      }))
    }
  } : {};
  return {
    type: 'text',
    text,
    ...quickReply
  };
}

// LINE Notify 通知老師（購點或備份等用途）
async function notifyTeacherPurchase(message) {
  const token = process.env.NOTIFY_TOKEN;
  if (!token) return;
  const axios = require('axios');
  try {
    await axios.post('https://notify-api.line.me/api/notify', `message=${encodeURIComponent(message)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      }
    });
  } catch (e) {
    console.error('通知老師失敗：', e.message);
  }
}

// 每日備份 JSON 檔案
function autoBackup() {
  const date = new Date().toISOString().split('T')[0];
  fs.copyFileSync(DATA_FILE, `./backup/data_${date}.json`);
  fs.copyFileSync(COURSE_FILE, `./backup/courses_${date}.json`);
  notifyTeacherPurchase(`📦 已自動備份資料 (${date})`);
}

// 每日提醒學員即將上課
function remindUpcomingCourses() {
  const now = new Date();
  const db = readJSON(DATA_FILE);
  const courses = cleanCourses(readJSON(COURSE_FILE));
  const upcoming = Object.entries(courses).filter(([_, c]) => {
    const diff = new Date(c.date) - now;
    return diff > 0 && diff < 24 * 60 * 60 * 1000; // 24 小時內
  });

  upcoming.forEach(([id, c]) => {
    c.students.forEach(uid => {
      client.pushMessage(uid, {
        type: 'text',
        text: `📅 提醒您：明日課程《${c.name}》 (${c.date})，請準時出席！`
      }).catch(console.error);
    });
  });
}

// 每月初自動推送統計報表
function sendMonthlyReport() {
  const db = readJSON(DATA_FILE);
  const lines = Object.entries(db)
    .filter(([_, u]) => u.role === 'student')
    .map(([id, u]) => `${u.name || id.slice(-4)}：${u.history.length} 堂課，點數 ${u.points} 點`)
    .join('\n');
  notifyTeacherPurchase(`📊 每月學員報表：\n${lines}`);
}

// 定期任務：每日備份＋提醒（每天00:30執行）、每月1日報表（00:10執行）
setInterval(() => {
  const now = new Date();
  const hhmm = `${now.getHours()}:${now.getMinutes()}`;
  if (hhmm === '0:30') {
    autoBackup();
    remindUpcomingCourses();
  }
  if (hhmm === '0:10' && now.getDate() === 1) {
    sendMonthlyReport();
  }
}, 60 * 1000); // 每分鐘檢查一次

// Express 啟動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 啟動成功（port ${PORT}）`);
});

// Keep-alive 機制，避免平台自動休眠（例如 Render）
setInterval(() => {
  require('http').get(`http://localhost:${PORT}/`);
}, 4 * 60 * 1000); // 每 4 分鐘自我 ping 一次
