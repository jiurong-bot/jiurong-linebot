function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null)
  }

  const msg = event.message.text.trim()

  // 學員選單
  if (msg === '@選單') {
    const menu = `請選擇操作項目：
1️⃣ @預約
2️⃣ @查詢課程
3️⃣ @取消預約
4️⃣ @購買點數
5️⃣ @點數紀錄`
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: menu
    })
  }

  // 其他預設回應
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `你說的是：「${msg}」`
  })
}
