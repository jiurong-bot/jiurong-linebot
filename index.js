const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const app = express()

// 處理 webhook 路徑
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('❌ Webhook 錯誤：', err)
      res.status(500).end()
    })
})

// 處理 LINE 傳入的事件
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const msg = event.message.text.trim();

  // 指令對應邏輯
  if (msg === '@課程查詢') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '這裡是課程查詢功能（範例內容）。'
    });
  }

  if (msg === '@預約') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請問您要預約哪一堂課？（此功能尚在建置中）'
    });
  }

  if (msg === '@取消') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請問您要取消哪一堂課？（此功能尚在建置中）'
    });
  }

  if (msg === '@點數查詢') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '目前剩餘點數為：10 點，有效期限至 2025/12/31。'
    });
  }

  if (msg === '@購點') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請點選以下表單進行購點：\nhttps://yourform.url\n\n💰 每點 NT$100，可用於預約課程。'
    });
  }

  // 預設回覆
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${msg}」`
  });
}

  // 預設回應
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${text}」`
  })
}

// 啟動伺服器
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
