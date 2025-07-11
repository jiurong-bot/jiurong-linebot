const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
const client = new line.Client(config)
const app = express()

app.use(express.json())

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error(err)
      res.status(500).end()
    })
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

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
            label: '查詢點數',
            text: '@查詢點數'
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

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
