const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const app = express()
app.use(express.json())

// Webhook 路由
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 處理錯誤：', err)
      res.status(500).end()
    })
})

// 指令處理
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const userMessage = event.message.text.trim()

  switch (userMessage) {
    case '@預約':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '以下是目前可預約的課程：\n\n1️⃣ 週一 10:00 瑜伽伸展\n2️⃣ 週三 18:00 陰瑜伽\n3️⃣ 週五 09:30 核心瑜伽\n\n請輸入課程編號完成預約，例如：「預約 1」'
      })

    case '@查詢點數':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '您目前剩餘點數：8 點。\n（此為測試資料，稍後會串接 Firebase）'
      })

    case '@購買點數':
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '您可透過下列表單購買點數：\nhttps://your-form-link.com'
      })

    default:
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `您輸入的是：「${userMessage}」\n請輸入 @預約、@查詢點數 或 @購買點數 來使用功能`
      })
  }
}

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
