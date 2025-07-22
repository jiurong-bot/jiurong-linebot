// utils.js
const { Client } = require('@line/bot-sdk');

// 確保 .env 檔案中的 LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET 已設定
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

/**
 * 回覆 LINE 訊息。
 * @param {string} replyToken LINE 的 replyToken
 * @param {string|object} messageContent 要回覆的文字訊息內容，或完整的訊息物件
 * @param {object} [quickReplyOptions] 快速回覆選項 (quickReply object)
 */
async function reply(replyToken, messageContent, quickReplyOptions = null) {
  let message;
  if (typeof messageContent === 'string') {
    message = { type: 'text', text: messageContent };
  } else {
    message = messageContent;
  }

  if (quickReplyOptions) {
    message.quickReply = quickReplyOptions;
  }

  try {
    await client.replyMessage(replyToken, message);
    // console.log('✅ Message replied successfully.');
  } catch (error) {
    console.error('❌ Failed to reply message:', error.message);
    if (error.response) {
      console.error('LINE API Response:', error.response.data);
    }
  }
}

/**
 * 主動推播 LINE 訊息。
 * @param {string} userId 目標用戶的 ID
 * @param {string|object} messageContent 要推播的文字訊息內容，或完整的訊息物件
 */
async function push(userId, messageContent) {
  let message;
  if (typeof messageContent === 'string') {
    message = { type: 'text', text: messageContent };
  } else {
    message = messageContent;
  }

  try {
    await client.pushMessage(userId, message);
    console.log(`✅ Message pushed successfully to ${userId}.`);
  } catch (error) {
    console.error(`❌ Failed to push message to ${userId}:`, error.message);
    if (error.response) {
      console.error('LINE API Response:', error.response.data);
    }
  }
}


/**
 * 格式化 ISO 8601 時間字串為可讀的台灣時間。
 * @param {string|Date} isoString ISO 8601 時間字串 或 Date 物件
 * @returns {string} 格式化的時間字串 (例如：2023/07/22 星期六 14:30)
 */
function formatDateTime(isoString) {
  const date = new Date(isoString);
  // 由於 Render 伺服器通常在 UTC，這裡手動調整為台灣時間 (UTC+8)
  const taipeiTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));

  const year = taipeiTime.getUTCFullYear();
  const month = (taipeiTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = taipeiTime.getUTCDate().toString().padStart(2, '0');
  const hours = taipeiTime.getUTCHours().toString().padStart(2, '0');
  const minutes = taipeiTime.getUTCMinutes().toString().padStart(2, '0');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[taipeiTime.getUTCDay()];

  return `${year}/${month}/${day} ${weekday} ${hours}:${minutes}`;
}


/**
 * 計算給定星期幾和時間的下一個發生日期。
 * 考慮台灣時區 (UTC+8)。
 * @param {number} targetWeekdayIndex 目標星期幾 (0=星期日, 1=星期一, ..., 6=星期六)
 * @param {number} targetHour 目標小時 (0-23)
 * @param {number} targetMin 目標分鐘 (0-59)
 * @returns {Date} 下一個發生日期時間的 Date 物件 (UTC時間，因為儲存建議為UTC)
 */
function getNextOccurrence(targetWeekdayIndex, targetHour, targetMin) {
    const now = new Date();
    const taipeiOffsetHours = 8;
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    // 獲取今天在 UTC 時間下的日期，然後轉換為台北時間的日期
    const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayWeekdayUTC = today.getUTCDay(); // 0 (星期日) - 6 (星期六)

    let dayDiff = (targetWeekdayIndex - todayWeekdayUTC + 7) % 7;
    
    // 檢查如果目標是今天，但時間已過，則將日期推遲到下週
    const currentTaipeiTime = new Date(now.getTime() + (taipeiOffsetHours * 60 * 60 * 1000));
    const currentHourTaipei = currentTaipeiTime.getUTCHours();
    const currentMinuteTaipei = currentTaipeiTime.getUTCMinutes();

    if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
        dayDiff = 7; // 推遲到下週
    }

    const courseDateTaipei = new Date(today.getTime() + dayDiff * ONE_DAY_IN_MS);
    // 將時區調整回 UTC 儲存，以便跨時區一致性
    courseDateTaipei.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);
    
    return courseDateTaipei; // 返回 UTC 時間的 Date 物件
}


module.exports = {
  reply,
  push,
  formatDateTime,
  getNextOccurrence,
};
