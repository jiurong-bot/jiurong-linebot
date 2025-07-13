// 九容瑜伽 LINE Bot 主程式 V1（setInterval 版定時提醒） // 2025-07-13 更新 // 功能：學員/老師身份切換、課程查詢、預約、取消、點數管理、 // 老師新增課程、課程取消退點、候補轉正、自動提醒、管理者廣播

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const studentMenu = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const teacherMenu = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程 範例課程 7/15 19:00 10' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '加點', text: '@加點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '扣點', text: '@扣點 學員ID 數量' } }, { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程 course_001' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }, { type: 'action', action: { type: 'message', label: '切換身份', text: '@切換身份' } } ];

const pendingTeacherLogin = {};

app.post('/webhook', line.middleware(config), (req, res) => { Promise.all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook error:', err); res.status(500).end(); }); });

if (msg === '@我的課程') {
      const my = user.history
        .map(h => {
          const c = courses[h.courseId];
          return c
            ? `${c.name} (${c.date}) 預約時間：${new Date(h.time).toLocaleString()}`
            : `已刪除課程 ${h.courseId}`;
        })
        .join('\n') || '尚無預約紀錄';
      return replyWithMenu(event.replyToken, my, studentMenu);
    }

    return replyWithMenu(event.replyToken, '請使用選單操作或正確指令。', studentMenu);
  }

  // 老師功能區
  if (user.role === 'teacher') {
    if (msg === '@今日名單') {
      const today = new Date().toISOString().slice(0, 10);
      const todayList = Object.entries(courses)
        .filter(([id, c]) => c.date.startsWith(today))
        .map(
          ([id, c]) =>
            `📌 ${c.name} (${c.date})\n報名：${c.students.length}人\n候補：${c.waitlist.length}人`
        )
        .join('\n\n') || '今天沒有課程';
      return replyWithMenu(event.replyToken, todayList, teacherMenu);
    }

    if (msg.startsWith('@新增課程')) {
      const parts = msg.split(' ');
      if (parts.length < 5)
        return replyText(event.replyToken, '格式錯誤，請輸入：@新增課程 課程名 日期 時間 人數上限');
      const name = parts[1];
      const date = `${new Date().getFullYear()}-${parts[2].replace('/', '-')} ${parts[3]}`;
      const max = parseInt(parts[4]);
      const id = `course_${Date.now()}`;
      courses[id] = { name, date, max, students: [], waitlist: [] };
      writeJSON(COURSE_FILE, courses);
      return replyWithMenu(event.replyToken, `✅ 已新增課程：${name}`, teacherMenu);
    }

    if (msg.startsWith('@取消課程')) {
      const courseId = msg.split(' ')[1];
      const course = courses[courseId];
      if (!course) return replyText(event.replyToken, '找不到課程');
      // 自動退還所有學生點數
      course.students.forEach(uid => {
        if (db[uid]) db[uid].points += 1;
      });
      delete courses[courseId];
      writeJSON(COURSE_FILE, courses);
      writeJSON(DATA_FILE, db);
      return replyWithMenu(event.replyToken, `✅ 已取消課程 ${courseId} 並退還點數`, teacherMenu);
    }

    if (msg === '@查學員') {
      const list = Object.entries(db)
        .filter(([id, u]) => u.role === 'student')
        .map(([id, u]) => `🙋 ${id.slice(-4)} 點數：${u.points}｜預約數：${u.history.length}`)
        .join('\n') || '沒有學員資料';
      return replyWithMenu(event.replyToken, list, teacherMenu);
    }

    if (/^@查學員 /.test(msg)) {
      const targetId = msg.split(' ')[1];
      const stu = db[targetId];
      if (!stu) return replyText(event.replyToken, '找不到該學員');
      const record = stu.history.map(h => {
        const c = courses[h.courseId];
        return c ? `${c.name} (${c.date})` : `❌ ${h.courseId}`;
      }).join('\n') || '無預約紀錄';
      return replyText(event.replyToken, `點數：${stu.points}\n紀錄：\n${record}`);
    }

    if (/^@加點 /.test(msg)) {
      const [_, targetId, amount] = msg.split(' ');
      if (!db[targetId]) return replyText(event.replyToken, '找不到該學員');
      db[targetId].points += parseInt(amount);
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, `✅ 已為 ${targetId} 加點 ${amount}`);
    }

    if (/^@扣點 /.test(msg)) {
      const [_, targetId, amount] = msg.split(' ');
      if (!db[targetId]) return replyText(event.replyToken, '找不到該學員');
      db[targetId].points -= parseInt(amount);
      writeJSON(DATA_FILE, db);
      return replyText(event.replyToken, `✅ 已為 ${targetId} 扣點 ${amount}`);
    }

    if (msg === '@統計報表') {
      const summary = Object.entries(db)
        .filter(([id, u]) => u.role === 'student')
        .map(([id, u]) => `學員 ${id.slice(-4)}：${u.history.length} 堂課`)
        .join('\n') || '尚無預約紀錄';
      return replyWithMenu(event.replyToken, summary, teacherMenu);
    }

    if (msg.startsWith('@廣播 ')) {
      const broadcast = msg.replace('@廣播 ', '');
      const studentIds = Object.entries(db).filter(([_, u]) => u.role === 'student').map(([id]) => id);
      for (const id of studentIds) {
        client.pushMessage(id, { type: 'text', text: `📢 系統通知：${broadcast}` }).catch(console.error);
      }
      return replyText(event.replyToken, `✅ 已廣播訊息給 ${studentIds.length} 位學員`);
    }

    return replyWithMenu(event.replyToken, '請使用選單操作或正確指令。', teacherMenu);
  }

  return sendRoleSelection(event.replyToken);
}

// 回覆文字
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

// 回覆 + 快速選單
function replyWithMenu(replyToken, text, menuItems) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    quickReply: { items: menuItems },
  });
}

// 身份選擇選單
function sendRoleSelection(replyToken) {
  return replyWithMenu(replyToken, '請選擇您的身份：', [
    { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } },
    { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } },
  ]);
}

// ✅ 課程提醒（每 10 分鐘執行一次）
setInterval(() => {
  const db = readJSON(DATA_FILE);
  const courses = readJSON(COURSE_FILE);
  const now = new Date();

  const upcoming = Object.entries(courses).filter(([_, c]) => {
    const courseTime = new Date(c.date);
    const diff = (courseTime - now) / 60000; // 分鐘差
    return diff > 0 && diff <= 60; // 60 分鐘內即將開課
  });

  upcoming.forEach(([id, c]) => {
    c.students.forEach(uid => {
      client.pushMessage(uid, {
        type: 'text',
        text: `⏰ 課程提醒：「${c.name}」即將於 ${c.date} 開始，請準時上課！`
      }).catch(console.error);
    });
  });
}, 10 * 60 * 1000); // 每 10 分鐘執行一次

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}`);
});
