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
      console.error('Webhook 錯誤：', err)
      res.status(500).end()
    })
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const msg = event.message.text.trim()

  // 指令：@選單
  if (msg === '@選單') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請選擇您要操作的選單：',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '我是學員',
              text: '@學員選單'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '我是老師',
              text: '@老師選單'
            }
          }
        ]
      }
    })
  }

  // 學員選單
  if (msg === '@學員選單') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '學員功能請選擇：',
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
              label: '取消課程',
              text: '@取消'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '購買點數',
              text: '@購買點數'
            }
          }
        ]
      }
    })
  }

  // 老師選單
  if (msg === '@老師選單') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '老師功能請選擇：',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'message',
              label: '今日名單',
              text: '@今日名單'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '點數管理',
              text: '@點數管理'
            }
          },
          {
            type: 'action',
            action: {
              type: 'message',
              label: '課程取消',
              text: '@老師取消'
            }
          }
        ]
      }
    })
  }

  // fallback 預設回覆
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${msg}」`
  })
}

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
