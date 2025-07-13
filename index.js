// 九容瑜伽 LINE Bot 主程式 V1（setInterval 版定時提醒） // 2025-07-13 更新 // 功能：學員/老師身份切換、課程查詢、預約、取消、點數管理、老師新增課程、課程取消退點、候補轉正、自動提醒、管理者廣播

const express = require('express'); const fs = require('fs'); const line = require('@line/bot-sdk'); require('dotenv').config();

const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET, };

const client = new line.Client(config); const app = express();

const DATA_FILE = './data.json'; const COURSE_FILE = './courses.json'; const TEACHER_PASSWORD = '9527';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2)); if (!fs.existsSync(COURSE_FILE)) fs.writeFileSync(COURSE_FILE, JSON.stringify({}, null, 2));

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); } function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// 快速選單定義略... // Webhook 與身份切換邏輯略... // 學員與老師的指令處理邏輯略...
// ⏰ 課程提醒（每 10 分鐘執行一次）
setInterval(() => {
  const db = readJSON(DATA_FILE);
  const courses = readJSON(COURSE_FILE);
  const now = new Date();
  const upcoming = Object.entries(courses).filter(([_, c]) => {
    const courseTime = new Date(c.date);
    const diff = (courseTime - now) / 60000;
    return diff > 0 && diff <= 60;
  });

  upcoming.forEach(([id, c]) => {
    c.students.forEach(uid => {
      client.pushMessage(uid, {
        type: 'text',
        text: `⏰ 課程提醒：「${c.name}」即將於 ${c.date} 開始，請準時上課！`
      }).catch(console.error);
    });
  });
}, 10 * 60 * 1000);

const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ 九容瑜伽 LINE Bot 已啟動，監聽在 port ${port}); });

