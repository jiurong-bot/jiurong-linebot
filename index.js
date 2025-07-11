const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

// 設定 LINE Bot 配置（從環境變數讀取）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// 建立 LINE 客戶端
const client = new line.Client(config);

// 建立 Express 應用程式
const app = express();

// 使用 LINE middleware
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 處理 LINE Bot 收到的事件
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  // 根據關鍵字給出不同回應（可擴充）
  const userMessage = event.message.text.trim();

  if (userMessage === '@預約') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '預約功能即將上線，敬請期待 🙏'
    });
  }

  // 回傳收到的訊息
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${userMessage}」`
  });
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
