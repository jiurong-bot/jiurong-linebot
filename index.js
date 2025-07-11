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

  const text = event.message.text.trim()

  if (text === '@預約') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請選擇課程日期：\n1️⃣ 星期一瑜伽\n2️⃣ 星期三冥想\n3️⃣ 星期五伸展\n\n請輸入「@1」、「@2」、「@3」進行預約。'
    })
  } else if (text === '@1') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '您已成功預約「星期一瑜伽」課程，感謝！🧘‍♀️'
    })
  } else if (text === '@2') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '您已成功預約「星期三冥想」課程，感謝！🧘‍♂️'
    })
  } else if (text === '@3') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '您已成功預約「星期五伸展」課程，感謝！🧘‍♀️'
    })
  }

  // 預設回應
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${text}」`
  })
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
