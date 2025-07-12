const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

// 設定 LINE Bot 配置
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

// Quick Reply 快速選單內容
const quickMenuItems = [
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
];

// Webhook 處理
app.post('/webhook', line.middleware(config), (req, res) => {
  if (!Array.isArray(req.body.events)) {
    return res.status(400).send('Invalid request');
  }

  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 處理事件
function handleEvent(event) {
  // 處理使用者加入好友時
  if (event.type === 'follow') {
    const welcomeText = '歡迎加入九容瑜伽 LINE！請從下方選單選擇您要的功能：';
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: welcomeText,
      quickReply: {
        items: quickMenuItems
      }
    });
  }

  // 處理文字訊息事件
  if (event.type === 'message' && event.message.type === 'text') {
    const msg = event.message.text.trim();
    let replyText = '請選擇操作項目：';

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
      quickReply: {
        items: quickMenuItems
      }
    });
  }

  // 非支援事件一律略過
  return Promise.resolve(null);
}

// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
