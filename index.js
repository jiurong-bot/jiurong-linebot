const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

// 設定 LINE Bot 配置
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// 建立 LINE 客戶端
const client = new line.Client(config);

// 建立 Express 應用程式
const app = express();

// middleware 設定
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 建立 Quick Reply 快速選單內容
const quickMenu = {
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
        label: '查詢課程',
        text: '@課程查詢'
      }
    },
    {
      type: 'action',
      action: {
        type: 'message',
        label: '取消課程',
        text: '@取消'
      }
    },
    {
      type: 'action',
      action: {
        type: 'message',
        label: '查詢點數',
        text: '@點數查詢'
      }
    },
    {
      type: 'action',
      action: {
        type: 'message',
        label: '購買點數',
        text: '@購點'
      }
    }
  ]
};

// 處理事件
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const msg = event.message.text.trim();

  let replyText = '請選擇操作項目：'; // 預設訊息

  // 指令處理
  if (msg === '@預約') {
    replyText = '請問您要預約哪一堂課？（此功能尚在建置中）';
  } else if (msg === '@課程查詢') {
    replyText = '目前開放的課程如下：（此功能尚在建置中）';
  } else if (msg === '@取消') {
    replyText = '請問您要取消哪一堂課？（此功能尚在建置中）';
  } else if (msg === '@點數查詢' || msg === '@點數') {
    replyText = '您目前剩餘點數為：10 點，有效期限至 2025/12/31。';
  } else if (msg === '@購點') {
    replyText = '請點選以下表單進行購點：\nhttps://yourform.url\n\n💰 每點 NT$100，可用於預約課程。';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
    quickReply: quickMenu
  });
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
