// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');
const { reply, push, formatDateTime, getNextOccurrence } = require('./utils'); // 確保路徑正確
const { getUser, saveUser, getAllCourses, saveCourse, deleteCourse, getAllOrders, saveOrder, deleteOrder, pgClient } = require('./db'); // 確保路徑正確
const COMMANDS = require('./commands'); // 確保路徑正確

require('dotenv').config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();

// Middleware for LINE webhook
app.post('/webhook', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.message);
      res.status(500).end();
    });
});

// 全域變數用於多步驟對話
global.pendingCourseCreation = {}; // 老師新增課程流程
global.confirmingCancelCourse = {}; // 老師取消課程確認流程
global.pendingTeacherLogin = {}; // 老師登入流程
global.pendingManualAdjust = {}; // 老師手動調整點數流程
global.pendingPurchase = {}; // 學員購點流程

// 假設的老師密碼 (請在 .env 中設定或更換為更安全的機制)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'your_teacher_password'; // 務必替換為實際密碼

// 點數購買方案
const PURCHASE_PLANS = [
    { label: '方案A：5點 / 500元', points: 5, amount: 500 },
    { label: '方案B：10點 / 900元', points: 10, amount: 900 },
    { label: '方案C：20點 / 1700元', points: 20, amount: 1700 },
];

// 銀行資訊 (請替換為您的實際資訊)
const BANK_INFO = {
    accountName: process.env.BANK_ACCOUNT_NAME || '王小明',
    bankName: process.env.BANK_NAME || '玉山銀行',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '808-1234567890123',
};


const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

// 初始化課程 ID 計數器
async function initializeCourseIdCounter() {
    try {
        const courses = await getAllCourses();
        let maxIdNum = 0;
        for (const id in courses) {
            if (id.startsWith('C')) {
                const num = parseInt(id.substring(1));
                if (!isNaN(num) && num > maxIdNum) {
                    maxIdNum = num;
                }
            }
        }
        global.courseIdCounter = maxIdNum + 1;
        console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`);
    } catch (error) {
        console.error('❌ 初始化課程 ID 計數器失敗:', error);
        global.courseIdCounter = 1; // 失敗時設置為預設值
    }
}
initializeCourseIdCounter(); // 啟動時呼叫

// --- 主要事件處理函式 ---
async function handleEvent(event) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  try { // <-- 在這裡加入 try 區塊

    // --- 用戶資料初始化與更新 ---
    let user = await getUser(userId);
    if (!user) {
      user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
      console.log(`ℹ️ 新用戶加入: ${userId}`);
      await saveUser(user);
    }

    // 嘗試獲取用戶的顯示名稱並更新 (只在用戶名為預設值時才更新)
    try {
      const profile = await client.getProfile(userId);
      if (!user.name || user.name === '匿名使用者') {
        user.name = profile.displayName || '匿名使用者';
        await saveUser(user);
      }
    } catch (e) {
      console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
      // 如果獲取失敗，確保用戶名至少是「匿名使用者」
      if (!user.name) {
          user.name = '匿名使用者';
          await saveUser(user);
      }
    }

    // --- Postback 事件處理 ---
    if (event.type === 'postback') {
      const data = event.postback.data;

      // 課程取消確認流程 (老師專用) - Postback觸發
      if (data.startsWith('cancel_course_confirm_')) {
        const currentUser = await getUser(userId);
        if (currentUser.role !== 'teacher') {
          return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
        }
        const courseId = data.replace('cancel_course_confirm_', '');
        const courses = await getAllCourses();
        const course = courses[courseId];
        if (!course || new Date(course.time) < new Date()) {
          return reply(replyToken, '找不到該課程，或課程已過期。', teacherCourseSubMenu);
        }
        global.confirmingCancelCourse = global.confirmingCancelCourse || {};
        global.confirmingCancelCourse[userId] = courseId;

        return reply(replyToken, `確認要取消課程「${course.title}」（${formatDateTime(course.time)}）嗎？\n一旦取消，已預約學生的點數將會退還，候補學生將收到取消通知。`, [
          { type: 'message', label: '✅ 是，確認取消', text: `確認取消課程 ${courseId}` },
          { type: 'message', label: '❌ 否，返回', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
        ]);
      }

      // 老師購點確認操作 (老師專用) - Postback觸發
      if (data.startsWith('confirm_order_') || data.startsWith('cancel_order_')) {
        const currentUser = await getUser(userId);
        if (currentUser.role !== 'teacher') {
          return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
        }
        const orderId = data.split('_')[2];
        const action = data.split('_')[0]; // 'confirm' or 'cancel'
        const orders = await getAllOrders();
        const order = orders[orderId];

        if (!order || order.status !== 'pending_confirmation') {
          return reply(replyToken, '找不到此筆待確認訂單或訂單狀態不正確。', teacherPointSubMenu);
        }
        const studentUser = await getUser(order.userId);
        if (!studentUser) {
          return reply(replyToken, `找不到購點學員 (ID: ${order.userId}) 的資料。`, teacherPointSubMenu);
        }

        if (action === 'confirm') {
          studentUser.points += order.points;
          if (!Array.isArray(studentUser.history)) {
            studentUser.history = [];
          }
          studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
          order.status = 'completed';
          await saveUser(studentUser);
          await saveOrder(order);
          await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, teacherPointSubMenu);
          // 通知學生點數已入帳
          await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。請查詢您的「剩餘點數」。`).catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));
        } else if (action === 'cancel') {
          order.status = 'cancelled';
          await saveOrder(order);
          await reply(replyToken, `❌ 已取消訂單 ${order.id} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, teacherPointSubMenu);
        }
        return;
      }
    }

    // 只處理文字訊息事件
    if (event.type !== 'message' || !event.message.text) return;

    const text = event.message.text.trim();

    // --- 多步驟新增課程流程處理 (老師專用) ---
    if (pendingCourseCreation[userId]) {
      const stepData = pendingCourseCreation[userId];
      const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };

      // 檢查是否為取消新增課程的指令
      if (text === COMMANDS.TEACHER.MAIN_MENU || text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
          delete pendingCourseCreation[userId];
          return reply(replyToken, '已取消新增課程流程並返回選單。', teacherCourseSubMenu);
      }

      switch (stepData.step) {
        case 1: // 輸入課程名稱
          stepData.data.title = text;
          stepData.step = 2;
          const weekdayOptions = Object.keys(weekdays).map(day => ({
            type: 'message', label: day, text: day
          }));
          weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
          return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
        case 2: // 選擇星期幾
          if (!weekdays.hasOwnProperty(text)) {
            const weekdayOptionsError = Object.keys(weekdays).map(day => ({
              type: 'message', label: day, text: day
            }));
            weekdayOptionsError.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
            return reply(replyToken, '請選擇正確的星期（例如：點擊「星期一」）：', weekdayOptionsError);
          }
          stepData.data.weekday = text;
          stepData.step = 3;
          return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        case 3: // 輸入課程時間
          if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
            return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
          }
          stepData.data.time = text;
          stepData.step = 4;
          return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        case 4: // 輸入人員上限
          const capacity = parseInt(text);
          if (isNaN(capacity) || capacity <= 0) {
            return reply(replyToken, '人數上限必須是正整數。', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
          }
          stepData.data.capacity = capacity;
          stepData.step = 5;
          return reply(replyToken, '請輸入課程所需扣除的點數（正整數，例如 1 或 2）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
        case 5: // 輸入課程所需點數
          const pointsCost = parseInt(text);
          if (isNaN(pointsCost) || pointsCost <= 0) {
            return reply(replyToken, '扣除點數必須是正整數。', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
          }
          stepData.data.pointsCost = pointsCost;
          stepData.step = 6;
          return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [
            { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
            { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
          ]);
        case 6: // 確認新增課程
          if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
            // 計算下一個最近的課程日期時間
            const targetWeekdayIndex = weekdays[stepData.data.weekday];
            const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);

            const now = new Date();
            // 由於部署環境可能使用 UTC，需調整為台灣時間 (UTC+8)
            const taipeiOffsetHours = 8;
            const taipeiOffsetMs = taipeiOffsetHours * 60 * 60 * 1000;
            
            // 獲取今天在 UTC 時間下的日期，然後轉換為台北時間的日期
            const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
            const todayWeekdayUTC = today.getUTCDay(); // 0 (星期日) - 6 (星期六)

            let dayDiff = (targetWeekdayIndex - todayWeekdayUTC + 7) % 7;
            
            // 檢查如果目標是今天，但時間已過，則將日期推遲到下週
            const currentTaipeiTime = new Date(now.getTime() + taipeiOffsetMs);
            const currentHourTaipei = currentTaipeiTime.getUTCHours();
            const currentMinuteTaipei = currentTaipeiTime.getUTCMinutes();

            if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
              dayDiff = 7; // 推遲到下週
            }

            const courseDateTaipei = new Date(today.getTime() + dayDiff * ONE_DAY_IN_MS);
            // 將時區調整回 UTC 儲存，以便跨時區一致性
            courseDateTaipei.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);
            const isoTime = courseDateTaipei.toISOString();

            // 生成新的課程 ID
            const newId = `C${String(global.courseIdCounter).padStart(3, '0')}`;
            global.courseIdCounter++;

            const newCourse = {
              id: newId,
              title: stepData.data.title,
              time: isoTime, // ISO 8601 格式的 UTC 時間
              capacity: stepData.data.capacity,
              pointsCost: stepData.data.pointsCost,
              students: [],
              waiting: [],
            };
            await saveCourse(newCourse);
            delete pendingCourseCreation[userId];
            return reply(replyToken, `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點\n課程 ID: ${newId}`, teacherCourseSubMenu);
          } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
            delete pendingCourseCreation[userId];
            return reply(replyToken, '已取消新增課程。', teacherCourseSubMenu);
          } else {
            return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」確認。`, [
              { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
              { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
            ]);
          }
        default:
          delete pendingCourseCreation[userId];
          return reply(replyToken, '流程異常，已重置。', teacherMenu);
      }
    }

    // --- 課程取消確認流程處理 (老師專用) - 文字訊息觸發 ---
    if (text.startsWith('確認取消課程 ')) {
      const currentUser = await getUser(userId);
      if (currentUser.role !== 'teacher') {
        return reply(replyToken, '您沒有權限執行此操作。', teacherMenu);
      }

      const courseId = text.replace('確認取消課程 ', '').trim();
      // 驗證 courseId 是否與之前確認流程中的一致
      if (!global.confirmingCancelCourse || global.confirmingCancelCourse[userId] !== courseId) {
        return reply(replyToken, '無效的取消確認，請重新操作。', teacherCourseSubMenu);
      }

      const courses = await getAllCourses();
      const course = courses[courseId];

      if (!course) {
        delete global.confirmingCancelCourse[userId]; // 清除狀態
        return reply(replyToken, '找不到該課程，取消失敗或已被刪除。', teacherCourseSubMenu);
      }

      // 退還已預約學生的點數並通知
      for (const stuId of course.students) {
        const studentUser = await getUser(stuId);
        if (studentUser) {
          studentUser.points += course.pointsCost;
          if (!Array.isArray(studentUser.history)) {
            studentUser.history = [];
          }
          studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
          await saveUser(studentUser);
          push(stuId, `您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，已退還 ${course.pointsCost} 點。請確認您的「剩餘點數」。`)
            .catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
        }
      }
      // 通知候補學生
      for (const waitId of course.waiting) {
        const waitingUser = await getUser(waitId);
        if (waitingUser) {
          if (!Array.isArray(waitingUser.history)) {
            waitingUser.history = [];
          }
          waitingUser.history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
          await saveUser(waitingUser);
          push(waitId, `您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`)
            .catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
        }
      }

      // 從資料庫中刪除課程
      await deleteCourse(courseId);
      delete global.confirmingCancelCourse[userId]; // 清除確認狀態

      return reply(replyToken, `課程「${course.title}」已取消，所有相關學員已收到通知。`, teacherCourseSubMenu);
    }

    // --- 處理老師取消確認的「❌ 否，返回」指令 ---
    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT && global.confirmingCancelCourse && global.confirmingCancelCourse[userId]) {
        delete global.confirmingCancelCourse[userId];
        return reply(replyToken, '已中止取消課程操作，並返回課程管理。', teacherCourseSubMenu);
    }


    // --- 🔐 老師手動調整點數流程處理 (老師專用) ---
    if (pendingManualAdjust[userId]) {
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          delete pendingManualAdjust[userId];
          return reply(replyToken, '已取消手動調整點數。', teacherPointSubMenu);
      }

      const parts = text.split(' ');
      if (parts.length !== 2) {
        return reply(replyToken, '指令格式錯誤，請輸入：[學員ID/姓名] [數量] (正數加點，負數扣點)', [
          { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
        ]);
      }

      const targetIdentifier = parts[0];
      const amount = parseInt(parts[1]);

      if (isNaN(amount) || amount === 0) {
        return reply(replyToken, '點數數量必須是非零整數。', [
          { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
        ]);
      }

      let foundUser = null;
      let foundUserId = null;

      // 嘗試透過 ID 查找
      foundUser = await getUser(targetIdentifier);
      if (foundUser && foundUser.role !== 'student') { // 確保是學生
          foundUser = null; // 如果找到但不是學生，則重置
      }

      // 如果未透過 ID 找到或找到但不是學生，則嘗試透過名稱模糊查詢
      if (!foundUser) {
          const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
          if (res.rows.length > 0) {
              // 假設只取第一個匹配的用戶，如果有多個同名學生需要更精確的選擇機制
              foundUser = res.rows[0];
              foundUserId = foundUser.id;
          }
      } else {
          foundUserId = foundUser.id; // 如果是透過ID找到的
      }


      if (!foundUser) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, `找不到學員：${targetIdentifier}。請確認學員 ID 或姓名是否正確。`, teacherPointSubMenu);
      }

      const operation = amount > 0 ? '加點' : '扣點';
      const absAmount = Math.abs(amount);
      let currentPoints = foundUser.points;
      let newPoints = currentPoints + amount;

      if (operation === '扣點' && currentPoints < absAmount) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, `學員 ${foundUser.name} 點數不足，無法扣除 ${absAmount} 點 (目前 ${currentPoints} 點)。`, teacherPointSubMenu);
      }

      foundUser.points = newPoints;
      if (!Array.isArray(foundUser.history)) {
        foundUser.history = [];
      }
      foundUser.history.push({
        action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId
      });
      await saveUser(foundUser);

      // 通知被調整點數的學員
      push(foundUserId, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${newPoints}點。`)
        .catch(e => console.error(`❌ 通知學員 ${foundUserId} 點數變動失敗:`, e.message));

      delete pendingManualAdjust[userId];
      return reply(replyToken, `✅ 已成功為學員 ${foundUser.name} ${operation} ${absAmount} 點，目前點數：${newPoints} 點。`, teacherPointSubMenu);
    }

    // --- 學生購點流程處理 (學員專用) ---
    if (pendingPurchase[userId]) {
      const stepData = pendingPurchase[userId];

      switch (stepData.step) {
        case 'select_plan':
          const selectedPlan = PURCHASE_PLANS.find(p => p.label === text);
          if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
              delete pendingPurchase[userId];
              return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
          }
          if (!selectedPlan) {
            return reply(replyToken, '請從列表中選擇有效的點數方案。', studentPointSubMenu);
          }
          stepData.data = {
            points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment'
          };
          stepData.step = 'confirm_purchase';
          return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
            { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
            { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
          ]);
        case 'confirm_purchase':
          if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
            const orderId = `O${Date.now()}`; // 簡單的訂單 ID
            const newOrder = { ...stepData.data, orderId: orderId };
            await saveOrder(newOrder); // 將訂單保存到資料庫
            delete pendingPurchase[userId]; // 清除狀態
            return reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳或匯款。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請再次進入「點數查詢」>「購點紀錄」並輸入您的匯款帳號後五碼以供核對。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
          } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
            delete pendingPurchase[userId];
            return reply(replyToken, '已取消購買點數。', studentMenu);
          } else {
            return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`, [
              { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
              { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
            ]);
          }
      }
    }


    // --- 🔁 身份切換指令處理 ---
    if (text === COMMANDS.SWITCH_ROLE) {
      const currentUser = await getUser(userId);
      if (currentUser.role === 'teacher') {
        // 從老師切換到學員
        currentUser.role = 'student';
        await saveUser(currentUser);
        return reply(event.replyToken, '已切換為學員身份。', studentMenu);
      } else {
        // 從學員切換到老師，進入密碼驗證流程
        pendingTeacherLogin[userId] = true;
        return reply(event.replyToken, '請輸入老師密碼登入。', [{ type: 'message', label: '取消登入', text: COMMANDS.SWITCH_ROLE }]);
      }
    }

    // --- 🔐 老師登入密碼驗證 ---
    if (pendingTeacherLogin[userId]) {
      if (text === COMMANDS.SWITCH_ROLE) { // 用戶選擇取消登入
        delete pendingTeacherLogin[userId];
        return reply(replyToken, '已取消老師登入。', studentMenu);
      }

      if (text === TEACHER_PASSWORD) {
        const currentUser = await getUser(userId);
        currentUser.role = 'teacher';
        await saveUser(currentUser);
        delete pendingTeacherLogin[userId]; // 登入成功後清除狀態
        return reply(replyToken, '老師登入成功。', teacherMenu);
      } else {
        delete pendingTeacherLogin[userId]; // 密碼錯誤後清除狀態
        return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
      }
    }

    // --- 🔀 根據用戶身份導向不同的指令處理函式 ---
    const currentUser = await getUser(userId);
    if (currentUser.role === 'teacher') {
      return handleTeacherCommands(event, userId);
    } else {
      return handleStudentCommands(event, userId);
    }
  } catch (error) { // <-- 在這裡加入 catch 區塊
    console.error(`❌ 處理 LINE 事件時發生錯誤 for user ${userId}:`, error);
    // 向用戶發送一個通用的錯誤訊息，避免「無動作」
    try {
      await reply(replyToken, '抱歉，處理您的請求時發生錯誤，請稍後再試。');
    } catch (replyError) {
      console.error(`❌ 發送錯誤訊息失敗 for user ${userId}:`, replyError.message);
    }
  }
}

// --- 老師指令處理函式 ---
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId); // 獲取最新用戶資料
  const courses = await getAllCourses(); // 獲取所有課程
  const orders = await getAllOrders(); // 獲取所有訂單

  // 老師主選單
  const teacherMenu = {
    type: 'quickReply',
    items: [
      { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
      { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
      { type: 'message', label: '學生列表', text: COMMANDS.TEACHER.LIST_STUDENTS },
      { type: 'message', label: '切換為學員', text: COMMANDS.SWITCH_ROLE },
    ],
  };

  // 老師課程管理子選單
  const teacherCourseSubMenu = {
    type: 'quickReply',
    items: [
      { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE },
      { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE },
      { type: 'message', label: '查看課程表', text: COMMANDS.TEACHER.VIEW_COURSES },
      { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU },
    ],
  };

  // 老師點數管理子選單
  const teacherPointSubMenu = {
    type: 'quickReply',
    items: [
      { type: 'message', label: '手動調整點數', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS },
      { type: 'message', label: '查看待確認購點', text: COMMANDS.TEACHER.VIEW_PENDING_PURCHASES },
      { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU },
    ],
  };


  // --- 返回主選單/子選單指令 ---
  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    return reply(replyToken, '請選擇課程管理功能：', teacherCourseSubMenu);
  }
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    return reply(replyToken, '請選擇點數管理功能：', teacherPointSubMenu);
  }

  // --- 新增課程指令 ---
  if (text === COMMANDS.TEACHER.ADD_COURSE) {
    global.pendingCourseCreation[userId] = { step: 1, data: {} };
    return reply(replyToken, '好的，我們來新增一堂課程。請先輸入課程名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
  }

  // --- 取消課程指令 (此處進行主要修改) ---
  if (text === COMMANDS.TEACHER.CANCEL_COURSE) {
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time) > new Date()) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有可取消的課程。', teacherCourseSubMenu);
    }

    const quickReplyItems = upcomingCourses.map(c => ({
      type: 'action',
      action: {
        type: 'postback', // 使用 postback 可以傳遞更多資料，而不顯示在聊天內容中
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20), // 限制標籤長度，避免超出 LINE 限制
        data: `cancel_course_confirm_${c.id}`, // 傳遞課程 ID，並加上 `_confirm_` 標識，用於區分確認流程
      },
    }));
    // 加入返回選項
    quickReplyItems.push({ type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT });

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇要取消的課程：',
      quickReply: { items: quickReplyItems.slice(0, 13) } // 最多顯示 13 個快速回覆按鈕
    });
  }

  // --- 查看課程表指令 (老師和學員共用，但老師看到更多資訊) ---
  if (text === COMMANDS.TEACHER.VIEW_COURSES) {
    const allCourses = Object.values(courses)
      .filter(c => new Date(c.time) > new Date()) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    if (allCourses.length === 0) {
      return reply(replyToken, '目前沒有已開放報名的課程。', teacherCourseSubMenu);
    }

    let message = '📅 未來課程列表：\n\n';
    allCourses.forEach(c => {
      const studentCount = c.students ? c.students.length : 0;
      const waitingCount = c.waiting ? c.waiting.length : 0;
      message += `ID: ${c.id}\n`;
      message += `課程: ${c.title}\n`;
      message += `時間: ${formatDateTime(c.time)}\n`;
      message += `名額: ${studentCount}/${c.capacity} (候補: ${waitingCount})\n`;
      message += `扣點: ${c.pointsCost} 點\n`;
      if (c.students && c.students.length > 0) {
        message += `已報名學生: ${c.students.map(sId => (user.nameMapping && user.nameMapping[sId]) ? user.nameMapping[sId] : sId).join(', ')}\n`;
      }
      if (c.waiting && c.waiting.length > 0) {
        message += `候補學生: ${c.waiting.map(wId => (user.nameMapping && user.nameMapping[wId]) ? user.nameMapping[wId] : wId).join(', ')}\n`;
      }
      message += '--------------------\n';
    });
    return reply(replyToken, message, teacherCourseSubMenu);
  }

  // --- 列出所有學員及點數指令 ---
  if (text === COMMANDS.TEACHER.LIST_STUDENTS) {
    const allUsers = await pgClient.query("SELECT id, name, points FROM users WHERE role = 'student' ORDER BY name ASC");
    if (allUsers.rows.length === 0) {
      return reply(replyToken, '目前沒有學生資料。', teacherMenu);
    }

    let message = '🧑‍🎓 所有學員列表及點數：\n\n';
    allUsers.rows.forEach(stu => {
      message += `姓名: ${stu.name || '匿名使用者'} (ID: ${stu.id})\n`;
      message += `點數: ${stu.points} 點\n`;
      message += '--------------------\n';
    });
    return reply(replyToken, message, teacherMenu);
  }

  // --- 手動調整點數指令 ---
  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    global.pendingManualAdjust[userId] = true;
    return reply(replyToken, '請輸入要調整點數的學員 ID 或姓名，以及調整的點數數量 (正數加點，負數扣點)。\n\n範例：\nU1234567890abcde 5 (為 U123... 加 5 點)\n王小明 -2 (為王小明扣 2 點)\n\n輸入 "返回點數管理" 取消操作。', [
        { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
    ]);
  }

  // --- 查看待確認購點指令 ---
  if (text === COMMANDS.TEACHER.VIEW_PENDING_PURCHASES) {
    const pendingOrders = Object.values(orders)
      .filter(o => o.status === 'pending_confirmation')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (pendingOrders.length === 0) {
      return reply(replyToken, '目前沒有待確認的購點訂單。', teacherPointSubMenu);
    }

    let message = '💰 待確認購點訂單列表：\n\n';
    const quickReplyItems = [];

    pendingOrders.forEach(o => {
      message += `訂單 ID: ${o.orderId}\n`;
      message += `學員: ${o.userName} (ID: ${o.userId})\n`;
      message += `購買點數: ${o.points} 點\n`;
      message += `金額: ${o.amount} 元\n`;
      message += `轉帳後五碼: ${o.lastFiveDigits || '未提供'}\n`;
      message += `提交時間: ${formatDateTime(o.timestamp)}\n`;
      message += '--------------------\n';

      quickReplyItems.push(
        { type: 'action', action: { type: 'postback', label: `✅ 確認訂單 ${o.orderId.slice(-4)}`, data: `confirm_order_${o.orderId}` } },
        { type: 'action', action: { type: 'postback', label: `❌ 取消訂單 ${o.orderId.slice(-4)}`, data: `cancel_order_${o.orderId}` } }
      );
    });

    quickReplyItems.push({ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT });

    return client.replyMessage(replyToken, {
      type: 'text',
      text: message + '\n請選擇操作：',
      quickReply: { items: quickReplyItems.slice(0, 13) }
    });
  }


  // --- 預設回覆 ---
  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
}


// --- 學員指令處理函式 ---
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const courses = await getAllCourses(); // 獲取所有課程
  const orders = await getAllOrders(); // 獲取所有訂單


  // 學員主選單
  const studentMenu = {
    type: 'quickReply',
    items: [
      { type: 'message', label: '課程報名', text: COMMANDS.STUDENT.VIEW_COURSES },
      { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
      { type: 'message', label: '點數查詢', text: COMMANDS.STUDENT.POINTS_MENU },
      { type: 'message', label: '切換為老師', text: COMMANDS.SWITCH_ROLE },
    ],
  };

  // 學員點數子選單
  const studentPointSubMenu = {
    type: 'quickReply',
    items: [
      { type: 'message', label: '剩餘點數', text: COMMANDS.STUDENT.VIEW_POINTS },
      { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS },
      { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.VIEW_PURCHASE_HISTORY },
      { type: 'message', label: '返回學員主選單', text: COMMANDS.STUDENT.MAIN_MENU },
    ],
  };

  // --- 返回主選單/子選單指令 ---
  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  if (text === COMMANDS.STUDENT.POINTS_MENU) {
    return reply(replyToken, '請選擇點數相關功能：', studentPointSubMenu);
  }

  // --- 查看課程表指令 (學員專用，顯示報名和候補按鈕) ---
  if (text === COMMANDS.STUDENT.VIEW_COURSES) {
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time) > new Date()) // 只顯示未來的課程
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); // 按時間排序

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有可報名的課程。', studentMenu);
    }

    let message = '📅 可報名課程列表：\n\n';
    const quickReplyItems = [];

    upcomingCourses.forEach(c => {
      const isEnrolled = c.students.includes(userId);
      const isWaiting = c.waiting.includes(userId);
      const studentCount = c.students ? c.students.length : 0;
      const remainingCapacity = c.capacity - studentCount;

      message += `ID: ${c.id}\n`;
      message += `課程: ${c.title}\n`;
      message += `時間: ${formatDateTime(c.time)}\n`;
      message += `名額: ${studentCount}/${c.capacity}\n`;
      message += `扣點: ${c.pointsCost} 點\n`;

      if (isEnrolled) {
        message += `狀態: ✅ 已報名\n`;
      } else if (isWaiting) {
        message += `狀態: ⏱️ 候補中 (${c.waiting.indexOf(userId) + 1} 順位)\n`;
      } else {
        if (remainingCapacity > 0) {
          message += `狀態: 可報名\n`;
          quickReplyItems.push({
            type: 'message',
            label: `報名 ${c.id} (${c.pointsCost}點)`,
            text: `報名 ${c.id}`,
          });
        } else {
          message += `狀態: 名額已滿\n`;
          quickReplyItems.push({
            type: 'message',
            label: `候補 ${c.id}`,
            text: `候補 ${c.id}`,
          });
        }
      }
      message += '--------------------\n';
    });

    quickReplyItems.push({ type: 'message', label: '返回學員主選單', text: COMMANDS.STUDENT.MAIN_MENU });

    return client.replyMessage(replyToken, {
      type: 'text',
      text: message + '\n請選擇課程操作：',
      quickReply: { items: quickReplyItems.slice(0, 13) }
    });
  }

  // --- 我的課程指令 ---
  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const myEnrolledCourses = Object.values(courses)
      .filter(c => c.students.includes(userId) && new Date(c.time) > new Date())
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    const myWaitingCourses = Object.values(courses)
      .filter(c => c.waiting.includes(userId) && new Date(c.time) > new Date())
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

    let message = '📚 我的課程列表：\n\n';
    const quickReplyItems = [];

    if (myEnrolledCourses.length > 0) {
      message += '✅ 已報名課程：\n';
      myEnrolledCourses.forEach(c => {
        message += `ID: ${c.id}\n`;
        message += `課程: ${c.title}\n`;
        message += `時間: ${formatDateTime(c.time)}\n`;
        message += `扣點: ${c.pointsCost} 點\n`;
        message += '--------------------\n';
        quickReplyItems.push({
          type: 'message',
          label: `取消報名 ${c.id}`,
          text: `取消報名 ${c.id}`,
        });
      });
    }

    if (myWaitingCourses.length > 0) {
      message += '\n⏱️ 候補中課程：\n';
      myWaitingCourses.forEach(c => {
        const waitingRank = c.waiting.indexOf(userId) + 1;
        message += `ID: ${c.id}\n`;
        message += `課程: ${c.title}\n`;
        message += `時間: ${formatDateTime(c.time)}\n`;
        message += `候補順位: ${waitingRank}\n`;
        message += '--------------------\n';
        quickReplyItems.push({
          type: 'message',
          label: `取消候補 ${c.id}`,
          text: `取消候補 ${c.id}`,
        });
      });
    }

    if (myEnrolledCourses.length === 0 && myWaitingCourses.length === 0) {
      message = '您目前沒有已報名或候補中的課程。';
    }

    quickReplyItems.push({ type: 'message', label: '返回學員主選單', text: COMMANDS.STUDENT.MAIN_MENU });

    return client.replyMessage(replyToken, {
      type: 'text',
      text: message + '\n請選擇操作：',
      quickReply: { items: quickReplyItems.slice(0, 13) }
    });
  }

  // --- 報名課程指令 ---
  if (text.startsWith('報名 ')) {
    const courseId = text.replace('報名 ', '').trim();
    const course = courses[courseId];

    if (!course || new Date(course.time) < new Date()) {
      return reply(replyToken, '課程不存在或已過期。', studentMenu);
    }
    if (course.students.includes(userId)) {
      return reply(replyToken, `您已經報名了「${course.title}」課程。`, studentMenu);
    }
    if (course.waiting.includes(userId)) {
      return reply(replyToken, `您已在「${course.title}」課程的候補名單中。`, studentMenu);
    }

    if (user.points < course.pointsCost) {
      return reply(replyToken, `您的點數不足（需要 ${course.pointsCost} 點，您目前有 ${user.points} 點）。`, studentPointSubMenu);
    }

    // 檢查名額
    if (course.students.length < course.capacity) {
      // 有名額，直接報名
      user.points -= course.pointsCost;
      course.students.push(userId);
      if (!Array.isArray(user.history)) {
        user.history = [];
      }
      user.history.push({ id: courseId, action: `報名課程：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });

      await saveUser(user);
      await saveCourse(course);

      return reply(replyToken, `🎉 成功報名「${course.title}」課程（${formatDateTime(course.time)}），已扣除 ${course.pointsCost} 點。您目前還有 ${user.points} 點。`, studentMenu);
    } else {
      // 名額已滿，加入候補
      course.waiting.push(userId);
      await saveCourse(course);
      return reply(replyToken, `「${course.title}」課程名額已滿，您已成功加入候補名單，目前順位：${course.waiting.length}。若有學員取消，將依序通知。`, studentMenu);
    }
  }

  // --- 取消報名指令 ---
  if (text.startsWith('取消報名 ')) {
    const courseId = text.replace('取消報名 ', '').trim();
    const course = courses[courseId];

    if (!course || new Date(course.time) < new Date()) {
      return reply(replyToken, '課程不存在或已過期。', studentMenu);
    }
    if (!course.students.includes(userId)) {
      return reply(replyToken, `您並未報名「${course.title}」課程。`, studentMenu);
    }

    // 從報名名單中移除
    course.students = course.students.filter(id => id !== userId);
    // 退還點數
    user.points += course.pointsCost;
    if (!Array.isArray(user.history)) {
      user.history = [];
    }
    user.history.push({ id: courseId, action: `取消報名：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });

    // 檢查候補名單，如果有候補學生，則自動遞補一位
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextStudentId = course.waiting.shift(); // 移除第一位候補學生
      const nextStudent = await getUser(nextStudentId);

      if (nextStudent) {
        if (nextStudent.points >= course.pointsCost) {
            // 候補學生點數足夠，自動報名
            nextStudent.points -= course.pointsCost;
            course.students.push(nextStudentId);
            if (!Array.isArray(nextStudent.history)) {
              nextStudent.history = [];
            }
            nextStudent.history.push({ id: courseId, action: `候補成功：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
            await saveUser(nextStudent);
            push(nextStudentId, `🎉 您候補的課程「${course.title}」（${formatDateTime(course.time)}）已有空位，已為您自動報名並扣除 ${course.pointsCost} 點。請確認「我的課程」。`)
                .catch(e => console.error(`❌ 通知候補成功學員 ${nextStudentId} 失敗:`, e.message));
        } else {
            // 候補學生點數不足，通知其點數不足，但不自動報名
            if (!Array.isArray(nextStudent.history)) {
                nextStudent.history = [];
            }
            nextStudent.history.push({ id: courseId, action: `候補失敗：點數不足 (${course.title})`, time: new Date().toISOString() });
            await saveUser(nextStudent); // 仍然保存更新後的歷史記錄
            push(nextStudentId, `⚠️ 您候補的課程「${course.title}」（${formatDateTime(course.time)}）已有空位，但您點數不足（需要 ${course.pointsCost} 點，您目前有 ${nextStudent.points} 點），未能自動報名。請及時充值。`)
                .catch(e => console.error(`❌ 通知候補失敗學員 ${nextStudentId} 失敗:`, e.message));
            // 點數不足的候補者不會被加入課程學生列表，會被移除，但不會有其他人遞補上來
        }
      }
    }

    await saveUser(user);
    await saveCourse(course);

    return reply(replyToken, `已成功取消報名「${course.title}」課程，已退還 ${course.pointsCost} 點。您目前還有 ${user.points} 點。`, studentMenu);
  }

  // --- 取消候補指令 ---
  if (text.startsWith('取消候補 ')) {
    const courseId = text.replace('取消候補 ', '').trim();
    const course = courses[courseId];

    if (!course || new Date(course.time) < new Date()) {
      return reply(replyToken, '課程不存在或已過期。', studentMenu);
    }
    if (!course.waiting.includes(userId)) {
      return reply(replyToken, `您並未候補「${course.title}」課程。`, studentMenu);
    }

    course.waiting = course.waiting.filter(id => id !== userId);
    if (!Array.isArray(user.history)) {
      user.history = [];
    }
    user.history.push({ id: courseId, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    await saveUser(user);
    await saveCourse(course);

    return reply(replyToken, `已成功取消候補「${course.title}」課程。`, studentMenu);
  }

  // --- 查詢剩餘點數指令 ---
  if (text === COMMANDS.STUDENT.VIEW_POINTS) {
    return reply(replyToken, `您目前有 ${user.points} 點。`, studentPointSubMenu);
  }

  // --- 購買點數指令 ---
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    global.pendingPurchase[userId] = { step: 'select_plan' };
    const quickReplyItems = PURCHASE_PLANS.map(plan => ({
      type: 'message', label: plan.label, text: plan.label
    }));
    quickReplyItems.push({ type: 'message', label: '返回點數相關功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU });

    return client.replyMessage(replyToken, {
      type: 'text',
      text: '請選擇您要購買的點數方案：',
      quickReply: { items: quickReplyItems }
    });
  }

  // --- 查詢購點紀錄指令 ---
  if (text === COMMANDS.STUDENT.VIEW_PURCHASE_HISTORY) {
    const myOrders = Object.values(orders)
      .filter(o => o.userId === userId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // 最新在前

    if (myOrders.length === 0) {
      return reply(replyToken, '您目前沒有購點紀錄。', studentPointSubMenu);
    }

    // 檢查是否有 pending_payment 狀態的訂單，要求輸入後五碼
    const pendingPaymentOrder = myOrders.find(o => o.status === 'pending_payment' && !o.lastFiveDigits);

    if (pendingPaymentOrder) {
        global.pendingPurchase[userId] = {
            step: 'input_last_five_digits',
            data: { orderId: pendingPaymentOrder.orderId }
        };
        return reply(replyToken, `您有一筆待完成的購點訂單 (ID: ${pendingPaymentOrder.orderId})，購買 ${pendingPaymentOrder.points} 點，金額 ${pendingPaymentOrder.amount} 元。\n\n請輸入您的匯款帳號後五碼，以便老師確認：`, [
            { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
        ]);
    }

    let message = '🧾 我的購點紀錄：\n\n';
    myOrders.forEach(o => {
      message += `訂單 ID: ${o.orderId}\n`;
      message += `點數: ${o.points} 點 / 金額: ${o.amount} 元\n`;
      message += `狀態: ${o.status === 'completed' ? '已完成 ✅' : (o.status === 'pending_confirmation' ? '待老師確認 ⏳' : (o.status === 'cancelled' ? '已取消 ❌' : '待付款 💰'))}\n`;
      if (o.lastFiveDigits) {
        message += `後五碼: ${o.lastFiveDigits}\n`;
      }
      message += `時間: ${formatDateTime(o.timestamp)}\n`;
      message += '--------------------\n';
    });
    return reply(replyToken, message, studentPointSubMenu);
  }

  // --- 處理購點紀錄中輸入後五碼 ---
  if (global.pendingPurchase[userId] && global.pendingPurchase[userId].step === 'input_last_five_digits') {
      if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
          delete global.pendingPurchase[userId];
          return reply(replyToken, '已取消輸入，返回點數相關功能。', studentPointSubMenu);
      }
      
      const lastFiveDigits = text.trim();
      if (!/^\d{5}$/.test(lastFiveDigits)) {
          return reply(replyToken, '請輸入正確的五位數字後五碼。', [
              { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
          ]);
      }

      const orderId = global.pendingPurchase[userId].data.orderId;
      const order = orders[orderId];

      if (!order || order.userId !== userId || order.status !== 'pending_payment') {
          delete global.pendingPurchase[userId];
          return reply(replyToken, '無效的訂單或訂單狀態不正確。', studentPointSubMenu);
      }

      order.lastFiveDigits = lastFiveDigits;
      order.status = 'pending_confirmation'; // 狀態變更為待老師確認
      await saveOrder(order);
      delete global.pendingPurchase[userId];

      // 通知老師有新的待確認訂單
      const teachers = await pgClient.query("SELECT id FROM users WHERE role = 'teacher'");
      for (const teacherRow of teachers.rows) {
          push(teacherRow.id, `🔔 有新的購點訂單待確認！學員 ${user.name} (ID: ${userId}) 購買 ${order.points} 點，已提供後五碼 ${lastFiveDigits}。請前往「點數管理」>「查看待確認購點」進行處理。`)
              .catch(e => console.error(`❌ 通知老師 ${teacherRow.id} 新訂單失敗:`, e.message));
      }

      return reply(replyToken, `您的匯款後五碼 ${lastFiveDigits} 已提交，訂單 ${orderId} 已變更為「待老師確認」狀態。老師確認後點數將自動入帳。`, studentPointSubMenu);
  }


  // --- 預設回覆 ---
  return reply(replyToken, '指令無效，請使用下方學員選單或輸入正確指令。', studentMenu);
}


// 連接到 PostgreSQL 並啟動伺服器
pgClient.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL');
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🚀 LINE Bot listening on port ${port}`);
    });
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.stack);
    process.exit(1); // Exit if DB connection fails
  });

