require('dotenv').config(); // 確保載入環境變數

const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const client = new line.Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

async function setupRichMenus() {
  try {
    // 1. 建立學員 Rich Menu
    // 從 rich_menu 資料夾中讀取 JSON 檔案
    const studentRichMenuObject = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rich_menu', 'student_rich_menu.json'), 'utf8'));
    const studentRichMenuId = await client.createRichMenu(studentRichMenuObject);
    console.log('✅ 學員 Rich Menu 建立成功，ID:', studentRichMenuId);

    // 上傳學員 Rich Menu 圖片
    // 從 rich_menu 資料夾中讀取圖片檔案
    const studentImageStream = fs.createReadStream(path.resolve(__dirname, 'rich_menu', 'student_rich_menu.png'));
    await client.setRichMenuImage(studentRichMenuId, studentImageStream);
    console.log('✅ 學員 Rich Menu 圖片上傳成功。');

    // 2. 建立老師 Rich Menu
    // 從 rich_menu 資料夾中讀取 JSON 檔案
    const teacherRichMenuObject = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'rich_menu', 'teacher_rich_menu.json'), 'utf8'));
    const teacherRichMenuId = await client.createRichMenu(teacherRichMenuObject);
    console.log('✅ 老師 Rich Menu 建立成功，ID:', teacherRichMenuId);

    // 上傳老師 Rich Menu 圖片
    // 從 rich_menu 資料夾中讀取圖片檔案
    const teacherImageStream = fs.createReadStream(path.resolve(__dirname, 'rich_menu', 'teacher_rich_menu.png'));
    await client.setRichMenuImage(teacherRichMenuId, teacherImageStream);
    console.log('✅ 老師 Rich Menu 圖片上傳成功。');

    // 3. 設定預設 Rich Menu (可選，但建議讓學員 Rich Menu 為預設)
    // await client.setDefaultRichMenu(studentRichMenuId);
    // console.log('✅ 已設定學員 Rich Menu 為預設。');


    console.log('\n--- 請更新您的 .env 檔案 ---');
    console.log(`STUDENT_RICH_MENU_ID=${studentRichMenuId}`);
    console.log(`TEACHER_RICH_MENU_ID=${teacherRichMenuId}`);

  } catch (error) {
    console.error('❌ 建立或上傳 Rich Menu 失敗:', error.message);
    if (error.originalError && error.originalError.response) {
        // 輸出更詳細的 LINE API 錯誤訊息
        console.error('API 錯誤訊息:', JSON.stringify(error.originalError.response.data, null, 2));
    }
  }
}

setupRichMenus();
