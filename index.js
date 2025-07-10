const express = require('express')
const line = require('@line/bot-sdk')
require('dotenv').config()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const app = express()
app.use(express.json())
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => 
      res.status(200).end())
})

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${event.message.text}」`
  })
}

const client = new line.Client(config)
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`LINE Bot is running on port ${port}`)
})
