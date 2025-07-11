const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

// 確保環境變數存在
if (!process.env.CHANNEL_ACCESS_TOKEN || !process.env.CHANNEL_SECRET) {
  throw new Error('❌ 缺少 LINE 機器人設定，請確認 CHANNEL_ACCESS_TOKEN 與 CHANNEL_SECRET 已正確設置')
}

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const app = express()

// 加入 line middleware，讓 LINE 事件可被解析
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('❌ Webhook 處理錯誤：', err)
      res.status(500).end()
    })
})

// 處理事件
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  // 回傳用戶輸入內容
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${event.message.text}」`
  })
}

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
