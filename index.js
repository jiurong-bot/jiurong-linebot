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
const FIXED_COURSE_FILE = './fixed_courses.json'; // 新增固定課程檔案
const BACKUP_DIR = './backup';

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN || ''; // LINE Notify 權杖，老師接收購點通知

// 檢查必要資料夾與檔案是否存在
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

// 備份資料檔案（data.json, courses.json, fixed_courses.json）
function backupData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data_backup_${timestamp}.json`));
    fs.copyFileSync(COURSE_FILE, path.join(BACKUP_DIR, `courses_backup_${timestamp}.json`));
    fs.copyFileSync(FIXED_COURSE_FILE, path.join(BACKUP_DIR, `fixed_courses_backup_${timestamp}.json`));
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
  { type: 'message', label: '固定課程管理', text: '@固定課程管理' }, // 新增固定課程管理快捷鍵
  { type: 'message', label: '統計報表', text: '@統計報表' },
  { type: 'message', label: '切換身份', text: '@切換身份' },
];

const pendingTeacherLogin = {}; // 老師登入暫存狀態

// 固定課程管理相關函式

function readFixedCourses() {
  return readJSON(FIXED_COURSE_FILE);
}

function writeFixedCourses(data) {
  writeJSON(FIXED_COURSE_FILE, data);
}

// 產生固定課程 quick reply 選單 (列出所有固定課程 + 新增選項)
function fixedCoursesQuickReply(fixedCourses) {
  const items = Object.entries(fixedCourses).map(([id, fc]) => ({
    type: 'message',
    label: `刪除：${fc.name} (${fc.weekday} ${fc.time})`,
    text: `刪除固定課程 ${id}`
  }));
  // 加一個新增固定課程選項
  items.unshift({
    type: 'message',
    label: '新增固定課程',
    text: '@新增固定課程'
  });
  // 加返回老師主選單
  items.push({
    type: 'message',
    label: '返回主選單',
    text: '@切換身份'
  });
  return items;
}

// 星期數字轉名稱
const weekdayMap = ['日', '一', '二', '三', '四', '五', '六'];
function weekdayToName(num) {
  return weekdayMap[num] || '';
}

// Webhook 路由
app.post('/webhook', line.middleware(config), async (req, res) => {
  res.status(200).end(); // 先回覆 200 避免 webhook timeout
  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
  } catch (err) {
    console.error('Webhook 處理錯誤:', err);
  }
});

app.get('/', (req, res) => {
  res.status(200).send('九容瑜伽 LINE Bot 正常運作中');
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const msg = event.message.text.trim();

  let db = {};
  let courses = {};
  let fixedCourses = {};

  try {
    db = readJSON(DATA_FILE);
    courses = readJSON(COURSE_FILE);
    fixedCourses = readFixedCourses();
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

  // 身份切換和登入流程
  if (msg === '@切換身份') {
    if (user.role === 'student') {
      // 學生想切換到老師，要求輸入密碼
      pendingTeacherLogin[userId] = true;
      return replyText(event.replyToken, '請輸入老師密碼以切換身份');
    } else {
      // 老師切回學生
      user.role = 'student';
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '已切換回學員身份', createQuickReplyMessage('請選擇功能', studentMenu));
    }
  }

  if (pendingTeacherLogin[userId]) {
    // 老師登入密碼驗證
    if (msg === TEACHER_PASSWORD) {
      user.role = 'teacher';
      delete pendingTeacherLogin[userId];
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '登入成功，已切換為老師身份', createQuickReplyMessage('請選擇功能', teacherMenu));
    } else {
      return replyText(event.replyToken, '密碼錯誤，請重新輸入或輸入 @取消 取消切換');
    }
  }

  // 老師取消登入切換
  if (pendingTeacherLogin[userId] && msg === '@取消') {
    delete pendingTeacherLogin[userId];
    return replyText(event.replyToken, '已取消切換身份', createQuickReplyMessage('請選擇功能', studentMenu));
  }

  // 根據身份分支處理命令
  if (user.role === 'student') {
    // 學生指令範例（可擴充）
    switch (msg) {
      case '@預約課程':
        // 預約課程流程...
        return replyText(event.replyToken, '請輸入欲預約的課程日期與時間');
      case '@課程查詢':
        // 查詢課程...
        return replyText(event.replyToken, '目前可預約課程列表：\n（示範）');
      case '@點數查詢':
        return replyText(event.replyToken, `您目前有 ${user.points} 點`);
      case '@購點':
        return replyText(event.replyToken, '請至購點連結完成匯款，匯款後填寫表單以便加點');
      default:
        return replyText(event.replyToken, '請使用快速選單選擇功能', createQuickReplyMessage('請選擇功能', studentMenu));
    }
  } else if (user.role === 'teacher') {
    // 老師指令處理
    if (msg === '@固定課程管理') {
      // 顯示固定課程管理選單
      const items = fixedCoursesQuickReply(fixedCourses);
      return replyText(event.replyToken, '請選擇固定課程管理操作', createQuickReplyMessage('固定課程管理選單', items));
    }

    // 新增固定課程指令啟動
    if (msg === '@新增固定課程') {
      user.addingFixedCourse = true;
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, '請依格式輸入固定課程（格式：名稱, 星期(0-6), 時間(HH:mm)，例如：瑜伽入門, 2, 19:00）');
    }

    // 處理新增固定課程輸入
    if (user.addingFixedCourse) {
      const parts = msg.split(',').map(s => s.trim());
      if (parts.length === 3) {
        const [name, weekdayStr, time] = parts;
        const weekday = parseInt(weekdayStr, 10);
        if (!name || isNaN(weekday) || weekday < 0 || weekday > 6 || !time.match(/^\d{2}:\d{2}$/)) {
          return replyText(event.replyToken, '格式錯誤，請重新輸入符合「名稱, 星期(0-6), 時間(HH:mm)」的固定課程');
        }
        // 新增固定課程
        const id = `fc_${Date.now()}`;
        fixedCourses[id] = { name, weekday: weekdayToName(weekday), weekdayNum: weekday, time };
        writeFixedCourses(fixedCourses);
        delete user.addingFixedCourse;
        writeJSON(DATA_FILE, db);
        return replyText(event.replyToken, `已新增固定課程：${name}，週${weekdayToName(weekday)} ${time}`, createQuickReplyMessage('固定課程管理', fixedCoursesQuickReply(fixedCourses)));
      } else {
        return replyText(event.replyToken, '格式錯誤，請依格式輸入：名稱, 星期(0-6), 時間(HH:mm)');
      }
    }

    // 刪除固定課程指令範例：刪除固定課程 fc_123456789
    if (msg.startsWith('刪除固定課程 ')) {
      const id = msg.replace('刪除固定課程 ', '').trim();
      if (fixedCourses[id]) {
        const cname = fixedCourses[id].name;
        delete fixedCourses[id];
        writeFixedCourses(fixedCourses);
        return replyText(event.replyToken, `已刪除固定課程：${cname}`, createQuickReplyMessage('固定課程管理', fixedCoursesQuickReply(fixedCourses)));
      } else {
        return replyText(event.replyToken, '找不到指定的固定課程ID');
      }
    }

    // 其他老師指令
    switch (msg) {
      case '@今日名單':
        // 顯示今日課程名單（略）
        return replyText(event.replyToken, '今日課程名單功能尚未實作');
      case '@新增課程':
        // 新增課程流程（略）
        return replyText(event.replyToken, '新增課程功能尚未實作');
      case '@查學員':
        return replyText(event.replyToken, '查詢學員功能尚未實作');
      case '@加點':
      case '@扣點':
        return replyText(event.replyToken, '點數加減功能尚未實作');
      case '@取消課程':
        return replyText(event.replyToken, '取消課程功能尚未實作');
      case '@統計報表':
        return replyText(event.replyToken, '統計報表功能尚未實作');
      default:
        return replyText(event.replyToken, '請使用快速選單選擇功能', createQuickReplyMessage('請選擇功能', teacherMenu));
    }
  }
  // 未知身份預設回覆
  return replyText(event.replyToken, '發生錯誤，請稍後再試');
}

// 簡化回覆函式
function replyText(token, text, message = null) {
  if (message) {
    // 回覆 text + quick reply
    return client.replyMessage(token, message);
  }
  return client.replyMessage(token, {
    type: 'text',
    text,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`九容瑜伽 LINE Bot 已啟動，埠號: ${PORT}`);
});
