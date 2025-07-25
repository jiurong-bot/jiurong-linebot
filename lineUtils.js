// lineUtils.js
const { Client } = require('@line/bot-sdk');
const { studentMenu, teacherMenu } = require('./menus'); // 引入菜單

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new Client(config);

// 格式化日期時間
function formatDateTime(isoString) {
  const date = new Date(isoString);
  const options = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Taipei' // 設定時區為台北
  };
  return date.toLocaleString('zh-TW', options).replace(/\//g, '-');
}


async function reply(replyToken, content, quickReplyOptions = null) {
  let messages = [];
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else if (typeof content === 'object' && content !== null) {
    messages = [content];
  } else {
    console.error(`WARN: reply 函式收到不明內容，將發送預設錯誤訊息。`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }

  // 添加 quickReply
  if (quickReplyOptions && Array.isArray(quickReplyOptions) && quickReplyOptions.length > 0) {
    messages[0].quickReply = {
      items: quickReplyOptions.slice(0, 13).map(i => ({ type: 'action', action: i }))
    };
  }

  try {
    await client.replyMessage(replyToken, messages);
    console.log(`DEBUG: reply - 成功回應訊息: ${JSON.stringify(messages).substring(0, 100)}...`);
  } catch (error) {
    if (error.originalError && error.originalError.response) {
      console.error(`❌ reply 函式發送失敗:`,
                    `狀態碼: ${error.originalError.response.status},`,
                    `訊息: ${error.originalError.response.statusText},`);
      if (error.originalError.response.data) {
        console.error(`響應數據:`, error.originalError.response.data);
      }
    } else {
      console.error(`❌ reply 函式發送失敗:`, error.message);
    }
  }
}

async function push(to, content) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else if (typeof content === 'object' && content !== null && content.type) {
    messages = [content];
  } else {
    console.error(`WARN: push 函式收到不明內容，將發送預設錯誤訊息。`, content);
    messages = [{ type: 'text', text: '系統發生錯誤，無法顯示完整資訊。' }];
  }

  try {
    await client.pushMessage(to, messages);
    console.log(`DEBUG: push - 成功推播訊息給 ${to}`);
  } catch (error) {
    if (error.originalError && error.originalError.response) {
        console.error(`❌ push 函式發送失敗給 ${to}:`,
                      `狀態碼: ${error.originalError.response.status},`,
                      `訊息: ${error.originalError.response.statusText},`);
        if (error.originalError.response.data) {
            console.error(`響應數據:`, error.originalError.response.data);
        }
    } else {
        console.error(`❌ push 函式發送失敗給 ${to}:`, error.message);
    }
  }
}

module.exports = {
  reply,
  push,
  formatDateTime,
  client // 導出 client 以便於 webhook 驗證
};
