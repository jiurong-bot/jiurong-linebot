// ✅ 九容瑜伽 LINE Bot 主程式 V2.4.1 // 整合修正 @課程查詢 / @預約 空資料顯示問題

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '我的課程', text: '@我的課程' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '加點', text: '@加點' } }, { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } }, ];

const pendingTeacherLogin = {};

app.get('/', (req, res) => { res.send('九容瑜伽 LINE Bot 運作中。'); });

app.post('/webhook', line.middleware(config), (req, res) => { res.status(200).end(); Promise.all( req.body.events.map(async (event) => { try { await handleEvent(event); } catch (err) { console.error('處理事件錯誤:', err); } }) ).catch((err) => console.error('Webhook 錯誤:', err)); });

if (msg === '@課程查詢') {
    // 顯示所有課程列表，若無課程顯示提示
    const courseEntries = Object.entries(courses);
    if (courseEntries.length === 0) {
      return replyWithMenu(replyToken, '目前無相關課程。', studentMenu);
    }
    const list = courseEntries
      .map(([id, c]) => `${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}`)
      .join('\n');
    return replyWithMenu(replyToken, list, studentMenu);
  }

  if (msg === '@預約') {
    // 顯示可預約課程列表，若無課程顯示提示
    const courseEntries = Object.entries(courses);
    if (courseEntries.length === 0) {
      return replyWithMenu(replyToken, '目前無可預約課程。', studentMenu);
    }
    const list = courseEntries
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');
    return replyWithMenu(replyToken, `📚 可預約課程：\n${list}\n請輸入課程編號（如：預約 course_001）`, studentMenu);
  }

if (/^預約 course_/.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyText(replyToken, '找不到該課程編號');
    if (course.students.includes(userId)) return replyText(replyToken, '您已預約此課程');
    if (user.points <= 0) return replyText(replyToken, '點數不足');

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '✅ 預約成功，已扣除 1 點');
    } else {
      if (!course.waitlist.includes(userId)) {
        course.waitlist.push(userId);
        writeJSON(COURSE_FILE, courses);
      }
      return replyText(replyToken, '目前已額滿，您已加入候補名單');
    }
  }

  if (msg === '@我的課程') {
    const my = user.history.map(h => {
      const c = courses[h.courseId];
      return c
        ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
        : `已刪除課程 ${h.courseId}`;
    }).join('\n') || '尚無預約紀錄';
    return replyWithMenu(replyToken, my, studentMenu);
  }

// 新增處理：@預約課程，列出可預約課程或提示無相關資料
  if (msg === '@預約') {
    const courseEntries = Object.entries(courses);
    if (courseEntries.length === 0) {
      return replyWithMenu(replyToken, '目前無相關資料，請稍後關注老師新增課程。', studentMenu);
    }
    const list = courseEntries
      .map(([id, c]) => `${id}: ${c.name} (${c.date})`)
      .join('\n');
    return replyWithMenu(replyToken, `📚 可預約課程：\n${list}\n請輸入課程編號（如：預約 course_001）`, studentMenu);
  }

  // 新增處理：@課程查詢，列出所有課程或提示無相關資料
  if (msg === '@課程查詢') {
    const courseEntries = Object.entries(courses);
    if (courseEntries.length === 0) {
      return replyWithMenu(replyToken, '目前無相關資料，請稍後關注老師新增課程。', studentMenu);
    }
    const list = courseEntries
      .map(([id, c]) => `${id}: ${c.name} (${c.date}) 剩餘名額：${c.max - c.students.length}`)
      .join('\n');
    return replyWithMenu(replyToken, list, studentMenu);
  }

if (/^預約 course_/.test(msg)) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyText(replyToken, '找不到該課程編號');
    if (course.students.includes(userId)) return replyText(replyToken, '您已預約此課程');
    if (user.points <= 0) return replyText(replyToken, '點數不足');

    if (course.students.length < course.max) {
      course.students.push(userId);
      user.points -= 1;
      user.history.push({ courseId, time: new Date().toISOString() });
      writeJSON(DATA_FILE, db);
      writeJSON(COURSE_FILE, courses);
      return replyText(replyToken, '✅ 預約成功，已扣除 1 點');
    } else {
      if (!course.waitlist.includes(userId)) {
        course.waitlist.push(userId);
        writeJSON(COURSE_FILE, courses);
      }
      return replyText(replyToken, '目前已額滿，您已加入候補名單');
    }
  }

  if (msg === '@我的課程') {
    const myCourses = user.history.map(h => {
      const c = courses[h.courseId];
      return c
        ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
        : `已刪除課程 ${h.courseId}`;
    }).join('\n') || '目前無相關資料';
    return replyWithMenu(replyToken, myCourses, studentMenu);
  }

  if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyText(replyToken, '找不到該課程');

    const idx = course.students.indexOf(userId);
    if (idx >= 0) {
      course.students.splice(idx, 1);
      user.points += 1;

      // 候補轉正邏輯
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
      return replyText(replyToken, '✅ 已取消預約並退回 1 點');
    } else {
      return replyText(replyToken, '您未預約此課程');
    }
  }

if (msg === '@購點') {
    return replyWithMenu(replyToken, '請填寫購點表單：https://yourform.url\n💰 每點 NT$100', studentMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', studentMenu);
}

// 老師功能處理
function handleTeacherCommands(event, userId, msg, user, db, courses) {
  const replyToken = event.replyToken;

  if (msg === '@今日名單') {
    const today = new Date().toISOString().slice(0, 10);
    const todayCourses = Object.entries(courses)
      .filter(([_, c]) => c.date.startsWith(today));

    if (todayCourses.length === 0) {
      return replyWithMenu(replyToken, '今天沒有課程', teacherMenu);
    }

    const list = todayCourses
      .map(([id, c]) => {
        const names = c.students.map(uid => db[uid]?.name || uid.slice(-4)).join(', ') || '無';
        return `📌 ${c.name} (${c.date})\n👥 報名：${c.students.length} 人\n🙋‍♀️ 學員：${names}`;
      })
      .join('\n\n');
    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (msg.startsWith('@新增課程')) {
    const parts = msg.split(' ');
    if (parts.length < 5) {
      return replyWithMenu(replyToken, '格式錯誤：@新增課程 課名 日期 時間 名額\n範例：@新增課程 伸展 7/20 19:00 8', teacherMenu);
    }
    const name = parts[1];
    const date = `${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}`;
    const max = parseInt(parts[4]);
    const id = `course_${Date.now()}`;
    courses[id] = { name, date, max, students: [], waitlist: [] };
    writeJSON(COURSE_FILE, courses);
    return replyWithMenu(replyToken, `✅ 已新增課程：${name}`, teacherMenu);
  }

if (msg.startsWith('@取消課程')) {
    const courseId = msg.split(' ')[1];
    const course = courses[courseId];
    if (!course) return replyWithMenu(replyToken, '找不到課程', teacherMenu);

    course.students.forEach(uid => {
      if (db[uid]) db[uid].points += 1;
    });

    delete courses[courseId];
    writeJSON(COURSE_FILE, courses);
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已取消課程 ${courseId} 並退回點數`, teacherMenu);
  }

  if (msg === '@查學員') {
    const students = Object.entries(db)
      .filter(([_, u]) => u.role === 'student');

    if (students.length === 0) {
      return replyWithMenu(replyToken, '沒有學員資料', teacherMenu);
    }

    const list = students
      .map(([id, u]) => `🙋 ${u.name || id.slice(-4)} 點數：${u.points}｜預約：${u.history.length}`)
      .join('\n');
    return replyWithMenu(replyToken, list, teacherMenu);
  }

  if (/^@查學員 /.test(msg)) {
    const targetId = msg.split(' ')[1];
    const stu = db[targetId];
    if (!stu) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);

    const record = stu.history.map(h => {
      const c = courses[h.courseId];
      return c ? `${c.name} (${c.date})` : `❌ ${h.courseId}`;
    }).join('\n') || '無預約紀錄';

    return replyWithMenu(replyToken, `點數：${stu.points}\n紀錄：\n${record}`, teacherMenu);
  }

if (/^@加點 /.test(msg)) {
    const [_, targetId, amountStr] = msg.split(' ');
    const amount = parseInt(amountStr);
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);
    if (isNaN(amount) || amount <= 0) return replyWithMenu(replyToken, '加點數量必須是正整數', teacherMenu);

    db[targetId].points += amount;
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${db[targetId].name || targetId} 加點 ${amount}`, teacherMenu);
  }

  if (/^@扣點 /.test(msg)) {
    const [_, targetId, amountStr] = msg.split(' ');
    const amount = parseInt(amountStr);
    if (!db[targetId]) return replyWithMenu(replyToken, '找不到該學員', teacherMenu);
    if (isNaN(amount) || amount <= 0) return replyWithMenu(replyToken, '扣點數量必須是正整數', teacherMenu);

    db[targetId].points -= amount;
    if (db[targetId].points < 0) db[targetId].points = 0;
    writeJSON(DATA_FILE, db);
    return replyWithMenu(replyToken, `✅ 已為 ${db[targetId].name || targetId} 扣點 ${amount}`, teacherMenu);
  }

  if (msg === '@統計報表') {
    const students = Object.entries(db).filter(([_, u]) => u.role === 'student');
    if (students.length === 0) {
      return replyWithMenu(replyToken, '尚無學員預約紀錄', teacherMenu);
    }
    const summary = students
      .map(([id, u]) => `學員 ${u.name || id.slice(-4)}：${u.history.length} 堂課`)
      .join('\n');
    return replyWithMenu(replyToken, summary, teacherMenu);
  }

  if (msg.startsWith('@廣播 ')) {
    const broadcast = msg.replace('@廣播 ', '').trim();
    if (!broadcast) return replyWithMenu(replyToken, '請輸入要廣播的訊息', teacherMenu);

    const studentIds = Object.entries(db)
      .filter(([_, u]) => u.role === 'student')
      .map(([id]) => id);

    studentIds.forEach(id => {
      client.pushMessage(id, {
        type: 'text',
        text: `📢 系統通知：${broadcast}`,
      }).catch(console.error);
    });

    return replyWithMenu(replyToken, `✅ 已廣播訊息給 ${studentIds.length} 位學員`, teacherMenu);
  }

  return replyWithMenu(replyToken, '請使用選單操作或正確指令。', teacherMenu);
}

// ⏰ 課程提醒（每 10 分鐘檢查一次，提醒 60 分鐘內將開課的課程）
setInterval(() => {
  try {
    const db = readJSON(DATA_FILE);
    const courses = readJSON(COURSE_FILE);
    const now = new Date();

    const upcoming = Object.entries(courses).filter(([_, c]) => {
      const courseTime = new Date(c.date);
      const diff = (courseTime - now) / 60000; // 差距分鐘
      return diff > 0 && diff <= 60;
    });

    upcoming.forEach(([id, c]) => {
      c.students.forEach(uid => {
        client.pushMessage(uid, {
          type: 'text',
          text: `⏰ 課程提醒：「${c.name}」即將於 ${c.date} 開始，請準時上課！`
        }).catch(err => console.error('提醒推播失敗:', err.message));
      });
    });
  } catch (err) {
    console.error('定時提醒錯誤:', err);
  }
}, 10 * 60 * 1000); // 每 10 分鐘執行一次

// GET / 路由 - 簡易健康檢查
app.get('/', (req, res) => {
  res.send('九容瑜伽 LINE Bot 正常運作中');
});

// ⏰ Keep-alive 機制（每 5 分鐘自我 ping）
setInterval(() => {
  const http = require('http');
  const url = process.env.KEEP_ALIVE_URL; // 請在 .env 裡設定此網址為自己服務的 URL
  if (!url) return;
  http.get(url, res => {
    console.log(`Keep-alive ping: ${url} 狀態碼 ${res.statusCode}`);
  }).on('error', err => {
    console.error('Keep-alive ping 失敗:', err.message);
  });
}, 5 * 60 * 1000);

// 啟動 Express 伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}`);
});
