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

  const msg = event.message.text.trim()

  // 指令回覆處理
  if (msg === '@預約') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請問您要預約哪一堂課？（此功能尚在建置中）'
    })
  }

  if (msg === '@課程查詢') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '目前開放的課程如下：（此功能尚在建置中）'
    })
  }

  if (msg === '@取消') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請問您要取消哪一堂課？（此功能尚在建置中）'
    })
  }

  if (msg === '@點數查詢' || msg === '@點數') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '您目前剩餘點數為：10 點，有效期限至 2025/12/31。'
    })
  }

  if (msg === '@購點') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請點選以下表單進行購點：\nhttps://yourform.url\n\n💰 每點 NT$100，可用於預約課程。'
    })
  }

  // 預設回覆：快速選單
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
    }
  })
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
