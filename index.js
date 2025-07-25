// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const { client } = require('./lineUtils'); // 引入 Line Client
const { connectDb, getUser, saveUser, pgClient } = require('./db'); // 引入資料庫連接和操作
const { COMMANDS, MESSAGES } = require('./config'); // 引入常數
const { studentMenu, teacherMenu } = require('./menus'); // 引入菜單

// 引入處理器
const teacherHandlers = require('./handlers/teacherHandlers');
const studentHandlers = require('./handlers/studentHandlers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON request bodies
app.use(bodyParser.json());

// Line webhook endpoint
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleTextMessage(event);
    } else if (event.type === 'postback') {
      await handlePostbackEvent(event);
    } else if (event.type === 'follow' || event.type === 'join') {
      await handleNewUserEvent(event);
    }
  }
  res.sendStatus(200);
});

async function handleTextMessage(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  let user;
  try {
    user = await getUser(userId);
    if (!user) {
      // 新用戶，給予初始身份選擇菜單 (如果需要)
      // 這裡簡單設定為學生
      user = { id: userId, name: await getLineProfileName(userId), role: 'student', points: 0, state: {}, history: [] };
      await saveUser(user);
      return studentHandlers.handleStudentMainMenu(event, userId, replyToken); // 導向學生主選單
    }
  } catch (err) {
    console.error(`❌ 獲取或創建用戶失敗 (${userId}):`, err.message);
    return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR);
  }

  // 檢查是否在某個狀態機中
  if (teacherHandlers.pendingManualAdjust[userId]) {
      return teacherHandlers.handleTeacherManualAdjustPointsInput(event, userId, replyToken, text);
  }
  if (teacherHandlers.pendingCourseAdd[userId]) {
      return teacherHandlers.handleAddCourseInput(event, userId, replyToken, text);
  }
  if (studentHandlers.pendingLast5Input[userId]) {
      return studentHandlers.handleStudentInputLast5Digits(event, userId, replyToken, text);
  }

  // 根據用戶角色分派指令
  if (user.role === 'teacher') {
    await handleTeacherCommands(event, userId, text, replyToken);
  } else if (user.role === 'student') {
    await handleStudentCommands(event, userId, text, replyToken);
  } else {
    // 未知角色或新用戶
    await reply(replyToken, MESSAGES.COMMON.PERMISSION_DENIED, studentMenu);
  }
}

async function handlePostbackEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const data = event.postback.data || '';

  let user;
  try {
    user = await getUser(userId);
    if (!user) {
        // 通常 postback 不會是新用戶，但以防萬一
        user = { id: userId, name: await getLineProfileName(userId), role: 'student', points: 0, state: {}, history: [] };
        await saveUser(user);
        return studentHandlers.handleStudentMainMenu(event, userId, replyToken);
    }
  } catch (err) {
    console.error(`❌ 獲取或創建用戶失敗 (${userId}):`, err.message);
    return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR);
  }

  // 解析 postback data
  const params = new URLSearchParams(data);
  const action = params.get('action');

  if (user.role === 'teacher') {
    switch (action) {
      case COMMANDS.TEACHER.ACTION_ADD_COURSE_START:
        await teacherHandlers.handleAddCourseStart(event, userId, replyToken);
        break;
      case COMMANDS.TEACHER.ACTION_CANCEL_COURSE_CONFIRM:
        await teacherHandlers.handleCancelCourseConfirm(event, userId, replyToken, params.get('courseId'));
        break;
      case 'cancel_course_execute': // 這是確認取消後執行的動作
        await teacherHandlers.handleCancelCourseExecute(event, userId, replyToken, params.get('courseId'));
        break;
      case COMMANDS.TEACHER.ACTION_CONFIRM_ORDER:
        await teacherHandlers.handleConfirmOrder(event, userId, replyToken, params.get('orderId'));
        break;
      case COMMANDS.TEACHER.ACTION_REJECT_ORDER:
        await teacherHandlers.handleRejectOrder(event, userId, replyToken, params.get('orderId'));
        break;
      default:
        console.warn(`WARN: 老師收到未處理的 Postback Action: ${action}`);
        await reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, teacherMenu);
    }
  } else if (user.role === 'student') {
    switch (action) {
      case COMMANDS.STUDENT.ACTION_BOOK_COURSE_CONFIRM:
        await studentHandlers.handleStudentBookCourse(event, userId, replyToken, params.get('courseId'));
        break;
      case COMMANDS.STUDENT.ACTION_CANCEL_BOOKING_CONFIRM:
        await studentHandlers.handleStudentCancelBookingConfirm(event, userId, replyToken, params.get('courseId'));
        break;
      case 'cancel_booking_execute': // 這是確認取消後執行的動作
        await studentHandlers.handleStudentCancelBookingExecute(event, userId, replyToken, params.get('courseId'));
        break;
      case COMMANDS.STUDENT.ACTION_CONFIRM_PURCHASE:
        await studentHandlers.handleStudentConfirmPurchase(event, userId, replyToken, params.get('points'), params.get('amount'));
        break;
      default:
        console.warn(`WARN: 學員收到未處理的 Postback Action: ${action}`);
        await reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, studentMenu);
    }
  }
}

async function handleNewUserEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  try {
    let user = await getUser(userId);
    if (!user) {
      // 獲取用戶資料
      const profile = await client.getProfile(userId);
      user = { id: userId, name: profile.displayName, role: 'student', points: 0, state: {}, history: [] };
      await saveUser(user);
      console.log(`✅ 新用戶加入: ${profile.displayName} (${userId})`);
      await reply(replyToken, `哈囉 ${profile.displayName}！歡迎使用本系統，您目前是學員身分。`, studentMenu);
    } else {
      console.log(`ℹ️ 已有用戶重新加入/追蹤: ${user.name} (${userId})`);
      if (user.role === 'student') {
        await reply(replyToken, `歡迎回來，${user.name}！`, studentMenu);
      } else if (user.role === 'teacher') {
        await reply(replyToken, `歡迎回來，老師！`, teacherMenu);
      }
    }
  } catch (err) {
    console.error(`❌ 處理新用戶事件失敗 (${userId}):`, err.message);
    await reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR);
  }
}

async function getLineProfileName(userId) {
  try {
    const profile = await client.getProfile(userId);
    return profile.displayName;
  } catch (err) {
    console.error(`❌ 無法獲取用戶名稱 ${userId}:`, err.message);
    return '新用戶'; // 返回一個預設名稱
  }
}


// --- 核心指令分派邏輯 ---
async function handleTeacherCommands(event, userId, text, replyToken) {
    switch (text) {
        case COMMANDS.TEACHER.MAIN_MENU:
            await teacherHandlers.handleTeacherMainMenu(event, userId, replyToken);
            break;
        case COMMANDS.TEACHER.POINT_MANAGEMENT:
            await teacherHandlers.handleTeacherPointManagementDisplay(event, userId, replyToken);
            break;
        case COMMANDS.TEACHER.COURSE_MANAGEMENT:
        case COMMANDS.TEACHER.CANCEL_COURSE: // 這些指令都導向課程管理顯示
        case COMMANDS.TEACHER.COURSE_LIST:
        case COMMANDS.TEACHER.ADD_COURSE: // 如果直接打字新增，也導向顯示
            await teacherHandlers.handleTeacherCourseManagementDisplay(event, userId, replyToken);
            break;
        case COMMANDS.TEACHER.REPORT:
            await teacherHandlers.handleTeacherReport(event, userId, replyToken);
            break;
        case COMMANDS.TEACHER.PENDING_ORDERS:
            await teacherHandlers.handleTeacherPendingOrders(event, userId, replyToken);
            break;
        case COMMANDS.TEACHER.MANUAL_ADJUST_POINTS:
            teacherHandlers.pendingManualAdjust[userId] = { step: 1 }; // 設定狀態機開始
            await reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。', [
                { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
            ]);
            break;
        default:
            if (text.startsWith(COMMANDS.TEACHER.SEARCH_STUDENT)) {
                const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT, '').trim();
                await teacherHandlers.handleTeacherSearchStudent(event, userId, replyToken, query);
            } else {
                await reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, teacherMenu);
            }
            break;
    }
}

async function handleStudentCommands(event, userId, text, replyToken) {
    switch (text) {
        case COMMANDS.STUDENT.MAIN_MENU:
            await studentHandlers.handleStudentMainMenu(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.BOOK_COURSE:
            await studentHandlers.handleStudentBookCourseDisplay(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.MY_COURSES:
            await studentHandlers.handleStudentMyCoursesDisplay(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.POINT_FUNCTIONS:
        case COMMANDS.STUDENT.BACK_TO_POINT_FUNCTIONS: // 允許從這裡進入點數功能，並檢查待確認訂單
            await studentHandlers.handleStudentPointFunctionsDisplay(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.PURCHASE_POINTS:
            await studentHandlers.handleStudentPurchasePointsDisplay(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.CHECK_POINTS:
            await studentHandlers.handleStudentCheckPoints(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.PURCHASE_HISTORY:
            await studentHandlers.handleStudentPurchaseHistory(event, userId, replyToken);
            break;
        case COMMANDS.STUDENT.CANCEL_PURCHASE:
            await studentHandlers.handleStudentCancelPurchase(event, userId, replyToken);
            break;
        default:
            await reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, studentMenu);
            break;
    }
}

// 啟動伺服器並連接資料庫
async function startServer() {
  await connectDb(); // 先連接資料庫
  app.listen(PORT, () => {
    console.log(`⚡️ Bot server is running on port ${PORT}`);
  });
}

startServer();
