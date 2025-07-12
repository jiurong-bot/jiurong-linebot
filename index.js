const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

const studentMenuItems = [
  { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } },
  { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } },
  { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } },
  { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } },
  { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } }
];

const teacherMenuItems = [
  { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } },
  { type: 'action', action: { type: 'message', label: '新增課程', text: '@新增課程' } },
  { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } },
  { type: 'action', action: { type: 'message', label: '課程取消', text: '@取消課程' } },
  { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } }
];

// 用戶身份暫存
const userRoles = {};
const pendingTeacherLogin = {}; // 記錄等待輸入密碼的 userId
const TEACHER_PASSWORD = '9527';

// Webhook 路由
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!Array.isArray(req.body.events)) return res.status(400).send('Invalid request');
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 處理事件
function handleEvent(event) {
  const userId = event.source.userId;

  // 初次加入好友
  if (event.type === 'follow') {
    return sendRoleSelection(event.replyToken);
  }

  // 處理文字訊息
  if (event.type === 'message' && event.message.type === 'text') {
    const msg = event.message.text.trim();
    const role = userRoles[userId];

    // 是否在等待老師密碼
    if (pendingTeacherLogin[userId]) {
      // 僅接受四位數字密碼
      if (/^\d{4}$/.test(msg)) {
        if (msg === TEACHER_PASSWORD) {
          delete pendingTeacherLogin[userId];
          userRoles[userId] = 'teacher';
          return replyWithMenu(event.replyToken, '✅ 驗證成功！您已進入老師模式：', teacherMenuItems);
        } else {
          return replyText(event.replyToken, '❌ 密碼錯誤，請再試一次（請輸入四位數字）');
        }
      } else {
        return replyText(event.replyToken, '請輸入四位數字密碼');
      }
    }

    // 尚未設定角色
    if (!role) {
      if (msg === '@我是學員') {
        userRoles[userId] = 'student';
        return replyWithMenu(event.replyToken, '✅ 您已進入學員模式，請選擇功能：', studentMenuItems);
      } else if (msg === '@我是老師') {
        pendingTeacherLogin[userId] = true;
        return replyText(event.replyToken, '請輸入老師密碼（四位數字）：');
      } else {
        return sendRoleSelection(event.replyToken);
      }
    }

    // 學員功能處理
    if (role === 'student') {
      let reply = '請選擇操作項目：';
      if (msg === '@預約') reply = '請問您要預約哪一堂課？（功能建置中）';
      else if (msg === '@課程查詢') reply = '目前開放的課程如下：（功能建置中）';
      else if (msg === '@取消') reply = '請問您要取消哪一堂課？（功能建置中）';
      else if (msg === '@點數查詢') reply = '您目前剩餘點數為：10 點，有效期限至 2025/12/31。';
      else if (msg === '@購點') reply = '請填寫以下表單購點：\nhttps://yourform.url\n💰 每點 NT$100';
      return replyWithMenu(event.replyToken, reply, studentMenuItems);
    }

    // 老師功能處理
    if (role === 'teacher') {
      let reply = `您輸入的是：「${msg}」。\n此功能尚未建置。`;
      return replyWithMenu(event.replyToken, reply, teacherMenuItems);
    }
  }

  return Promise.resolve(null);
}

// 回傳身份選擇畫面
function sendRoleSelection(replyToken) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text: '請選擇您的身份：',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } },
        { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } }
      ]
    }
  });
}

// 回傳簡單文字
function replyText(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

// 回傳帶選單
function replyWithMenu(replyToken, text, menuItems) {
  return client.replyMessage(replyToken, {
    type: 'text',
    text,
    quickReply: { items: menuItems }
  });
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
