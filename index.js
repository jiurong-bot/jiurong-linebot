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

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 處理錯誤：', err)
      res.status(500).end()
    })
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const msg = event.message.text.trim()

  // 觸發「@預約」文字指令
  if (msg === '@預約') {
    const buttonsTemplate = {
      type: 'template',
      altText: '預約選單',
      template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://i.imgur.com/B6oQhxW.png', // 可替換為九容瑜伽 LOGO
        title: '九容瑜伽｜課程預約',
        text: '請選擇您要操作的項目：',
        actions: [
          {
            type: 'message',
            label: '預約課程',
            text: '我要預約'
          },
          {
            type: 'message',
            label: '取消預約',
            text: '我要取消'
          },
          {
            type: 'message',
            label: '查詢剩餘點數',
            text: '查詢點數'
          }
        ]
      }
    }

    return client.replyMessage(event.replyToken, buttonsTemplate)
  }

  // 一般回覆
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${msg}」`
  })
}

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
