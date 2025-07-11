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
    return Promise.resolve(null)
  }

  // 回覆訊息 + 快速選單
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: '請選擇操作項目：',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '預約課程',
            text: '@預約'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '購買點數',
            text: '@購點'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '查詢點數',
            text: '@點數'
          }
        }
      ]
    }
  })
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
