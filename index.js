const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)
const app = express()

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 發生錯誤：', err)
      res.status(500).end()
    })
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const messageText = event.message.text.trim()

  // 學員主選單觸發關鍵字
  if (messageText === '@選單' || messageText === '選單') {
    const replyText =
      '📋 九容瑜伽選單：\n' +
      '1️⃣ @預約課程\n' +
      '2️⃣ @查看預約\n' +
      '3️⃣ @購買點數\n' +
      '4️⃣ @我的點數\n' +
      '5️⃣ @聯絡老師'

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText
    })
  }

  // 若為關鍵字預約
  if (messageText === '@預約課程') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請選擇您要預約的課程：\n🧘‍♀️ 週一晚間瑜伽\n🧘‍♀️ 週三早晨伸展\n🧘‍♀️ 週六核心強化\n（未來將提供按鈕功能）'
    })
  }

  // 其他一般文字回覆
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${messageText}」`
  })
}
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`)
})
