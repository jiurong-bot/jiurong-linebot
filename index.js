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
    return Promise.resolve(null)
  }

  const message = {
    type: 'text',
    text: `你說的是：「${event.message.text}」`
  }

  return client.replyMessage(event.replyToken, message)
}

// 啟動伺服器
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
