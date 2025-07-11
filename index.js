const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

// 設定 LINE 機器人連線資訊
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

// 建立 LINE 客戶端（放在前面，否則會報錯）
const client = new line.Client(config)

const app = express()
app.use(express.json())

// 處理 webhook 路徑
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err)
      res.status(500).end()
    })
})

// 處理傳入事件
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  // 回覆使用者訊息
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${event.message.text}」`
  })
}

// 啟動伺服器
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
