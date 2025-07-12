const express = require('express'); const line = require('@line/bot-sdk'); require('dotenv').config();

// LINE Bot 配置 const config = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };

const client = new line.Client(config); const app = express();

// 暫存身份資料（正式可改為資料庫） const userRoles = {}; // userId -> 'student' 或 'teacher' const TEACHER_PASSWORD = '9527';

// 學員快速選單 const studentMenuItems = [ { type: 'action', action: { type: 'message', label: '預約課程', text: '@預約' } }, { type: 'action', action: { type: 'message', label: '查詢課程', text: '@課程查詢' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消' } }, { type: 'action', action: { type: 'message', label: '查詢點數', text: '@點數查詢' } }, { type: 'action', action: { type: 'message', label: '購買點數', text: '@購點' } } ];

// 老師快速選單（可視需求自訂） const teacherMenuItems = [ { type: 'action', action: { type: 'message', label: '今日名單', text: '@今日名單' } }, { type: 'action', action: { type: 'message', label: '到課點名', text: '@點名' } }, { type: 'action', action: { type: 'message', label: '取消課程', text: '@取消課程' } }, { type: 'action', action: { type: 'message', label: '查詢學員', text: '@查學員' } }, { type: 'action', action: { type: 'message', label: '統計報表', text: '@統計報表' } } ];

// 處理 webhook app.post('/webhook', line.middleware(config), (req, res) => { if (!Array.isArray(req.body.events)) { return res.status(400).send('Invalid request'); } Promise .all(req.body.events.map(handleEvent)) .then(result => res.json(result)) .catch(err => { console.error('Webhook 錯誤：', err); res.status(500).end(); }); });

function handleEvent(event) { const userId = event.source.userId;

// 加入好友歡迎訊息（帶快速選單） if (event.type === 'follow') { const welcome = { type: 'text', text: '歡迎加入九容瑜伽 LINE！請選擇您的身分：', quickReply: { items: [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } } ] } }; return client.replyMessage(event.replyToken, welcome); }

// 處理文字訊息 if (event.type === 'message' && event.message.type === 'text') { const msg = event.message.text.trim();

// 身分選擇 if (msg === '@我是學員') { userRoles[userId] = 'student'; return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 您已進入學員模式，請選擇功能：', quickReply: { items: studentMenuItems } }); } if (msg === '@我是老師') { return client.replyMessage(event.replyToken, { type: 'text', text: '請輸入老師密碼，例如：\n@老師密碼 9527', quickReply: { items: studentMenuItems } }); } // 老師密碼驗證 if (msg.startsWith('@老師密碼')) { const input = msg.split(' ')[1]; if (input === TEACHER_PASSWORD) { userRoles[userId] = 'teacher'; return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 您已進入老師模式，請輸入功能指令，例如：\n@今日名單、@點名... 等', quickReply: { items: teacherMenuItems } }); } else { return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 密碼錯誤，請再確認', quickReply: { items: studentMenuItems } }); } } // 學員功能處理 if (userRoles[userId] === 'student') { let replyText = '請選擇操作項目：'; if (msg === '@預約') replyText = '請問您要預約哪一堂課？（尚在建置中）'; else if (msg === '@課程查詢') replyText = '目前開放的課程如下：（尚在建置中）'; else if (msg === '@取消') replyText = '請問您要取消哪一堂課？（尚在建置中）'; else if (msg === '@點數查詢' || msg === '@點數') replyText = '您剩餘點數為 10 點，有效至 2025/12/31。'; else if (msg === '@購點') replyText = '請點選表單進行購點：\nhttps://yourform.url\n\n💰 每點 NT$100'; return client.replyMessage(event.replyToken, { type: 'text', text: replyText, quickReply: { items: studentMenuItems } }); } // 老師功能處理（功能尚未建置） if (userRoles[userId] === 'teacher') { return client.replyMessage(event.replyToken, { type: 'text', text: `您輸入的是：${msg}\n該功能尚未建置，敬請期待`, quickReply: { items: teacherMenuItems } }); } // 預設回應（尚未設定身分） return client.replyMessage(event.replyToken, { type: 'text', text: '請先選擇您的身分（@我是學員 / @我是老師）', quickReply: { items: [ { type: 'action', action: { type: 'message', label: '我是學員', text: '@我是學員' } }, { type: 'action', action: { type: 'message', label: '我是老師', text: '@我是老師' } } ] } }); 

}

return Promise.resolve(null); }

// 啟動伺服器 const port = process.env.PORT || 3000; app.listen(port, () => { console.log(✅ LINE Bot 已啟動，監聽在 port ${port}); });
