const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

// 快速選單
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

// 暫存身份記憶
const userRoles = {};
const TEACHER_PASSWORD = '9527';

// Webhook
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

  // 使用者加入
  if (event.type === 'follow') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '歡迎加入九容瑜伽 LINE！請選擇您的身份：',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } },
          { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } }
        ]
      }
    });
  }

  // 處理訊息
  if (event.type === 'message' && event.message.type === 'text') {
    const msg = event.message.text.trim();
    let replyText = '';
    let menu = studentMenuItems;

    // 身份選擇
    if (msg === '@我是學員') {
      userRoles[userId] = 'student';
      replyText = '✅ 您已進入學員模式，請選擇功能：';
    } else if (msg === '@我是老師') {
      replyText = '請輸入@老師密碼（四位數字）';
    } else if (msg.startsWith('@老師密碼')) {
      const inputPwd = msg.split(' ')[1];
      if (inputPwd === TEACHER_PASSWORD) {
        userRoles[userId] = 'teacher';
        replyText = '✅ 驗證成功！您已進入老師模式，請選擇功能：';
        menu = teacherMenuItems;
      } else {
        replyText = '❌ 密碼錯誤，請再試一次';
      }
    } else {
      // 已登入者功能回應
      const role = userRoles[userId] || 'student';
      menu = role === 'teacher' ? teacherMenuItems : studentMenuItems;

      if (role === 'student') {
        if (msg === '@預約') replyText = '請問您要預約哪一堂課？（此功能尚在建置中）';
        else if (msg === '@課程查詢') replyText = '目前開放的課程如下：（此功能尚在建置中）';
        else if (msg === '@取消') replyText = '請問您要取消哪一堂課？（此功能尚在建置中）';
        else if (msg === '@點數查詢' || msg === '@點數') replyText = '您目前剩餘點數為：10 點，有效期限至 2025/12/31。';
        else if (msg === '@購點') replyText = '請點選以下表單進行購點：\nhttps://yourform.url\n\n💰 每點 NT$100，可用於預約課程。';
        else replyText = '請選擇操作項目。';
      } else if (role === 'teacher') {
        // 老師功能尚未實作
        replyText = `您輸入的是：${msg}。\n該功能尚未建置。`;
      }
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
      quickReply: { items: menu }
    });
  }

  return Promise.resolve(null);
}

// 啟動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
