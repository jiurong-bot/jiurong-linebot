const express = require('express');
const line = require('@line/bot-sdk');
require('dotenv').config();

// 設定 LINE Bot 配置（從環境變數讀取）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// 建立 LINE 客戶端
const client = new line.Client(config);

// 建立 Express 應用程式
const app = express();

// 使用 LINE middleware
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 處理 LINE Bot 收到的事件
// 學員文字選單回應
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const msg = event.message.text.trim()

  let replyText = ''
  switch (msg) {
    case '@預約':
      replyText = '請選擇要預約的課程時間：\n1. 週一 19:00\n2. 週三 10:00\n3. 週六 14:00\n請回覆課程代碼（如：1）完成預約。'
      break
    case '@取消':
      replyText = '請回覆欲取消的課程時間（如：週一 19:00），系統將協助您處理取消與退點。'
      break
    case '@點數查詢':
      replyText = '您目前剩餘 10 點。\n如需購買請輸入 @購點。'
      break
    case '@購點':
      replyText = '請點擊以下表單填寫購點資訊：\nhttps://forms.gle/your-form-link'
      break
    default:
      replyText = `你說的是：「${msg}」`
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText
  })
}
// 啟動伺服器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINE Bot 已啟動，監聽在 port ${port}`);
});
