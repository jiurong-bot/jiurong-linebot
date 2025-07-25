// index.js (主程式)

// =====================================
//                 模組載入
// =====================================
// 從 infraModule 導入基礎設施相關的依賴和初始化函數
const infraModule = require('./infraModule');
const { pgClient, lineClient, constants, reply, push } = infraModule; // 直接從 infraModule 解構出所需的方法和常數

// 其他主程式專屬的模組
// const someUtility = require('./utils/someUtility');


// =====================================
//               應用程式常數
// =====================================
const PORT = process.env.PORT || 3000; // 伺服器埠號

// 設定與密碼 (業務邏輯相關設定)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const TEACHER_ID = process.env.TEACHER_ID; // 老師 ID (Line User ID)

// 時間相關常數 (部分從 infraModule 導入，部分是業務邏輯專屬)
const ONE_DAY_IN_MS = constants.ONE_DAY_IN_MS;   // 從 infraModule 導入
const ONE_HOUR_IN_MS = constants.ONE_HOUR_IN_MS; // 從 infraModule 導入
const EIGHT_HOURS_IN_MS = 28800000; // 8 小時，用於某些業務邏輯判斷，保留在主程式

// 購點方案定義 (業務邏輯)
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
];

// 銀行匯款資訊 (業務邏輯)
const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
};

// 指令常數 (業務邏輯)
const COMMANDS = {
  SWITCH_ROLE: '@切換身份',
  TEACHER: {
    MAIN_MENU: '@返回老師主選單',
    COURSE_MANAGEMENT: '@課程管理',
    POINT_MANAGEMENT: '@點數管理',
    ADD_COURSE: '@新增課程',
    CANCEL_COURSE: '@取消課程',
    COURSE_LIST: '@課程列表',
    SEARCH_STUDENT: '@查學員',
    REPORT: '@統計報表',
    PENDING_ORDERS: '@待確認清單',
    MANUAL_ADJUST_POINTS: '@手動調整點數',
    CANCEL_MANUAL_ADJUST: '@返回點數管理',
  },
  STUDENT: {
    MAIN_MENU: '@返回學員主選單',
    POINTS: '@點數功能',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購點紀錄',
    CANCEL_PURCHASE: '❌ 取消購買',
    CANCEL_INPUT_LAST5: '❌ 取消輸入後五碼',
    BOOK_COURSE: '@預約課程',
    MY_COURSES: '@我的課程',
    CANCEL_BOOKING: '@取消預約',
    CANCEL_WAITING: '@取消候補',
    CONFIRM_ADD_COURSE: '確認新增課程',
    CANCEL_ADD_COURSE: '取消新增課程',
    RETURN_POINTS_MENU: '返回點數功能',
    CONFIRM_BUY_POINTS: '✅ 確認購買',
    INPUT_LAST5_CARD_TRIGGER: '@輸入匯款後五碼',
    EDIT_LAST5_CARD_TRIGGER: '@修改匯款後五碼',
  }
};

// =====================================
//        資料庫互動函式 (業務邏輯層)
// =====================================
// 這些函數直接操作資料庫，所以會使用從 infraModule 導出的 pgClient。
// 注意：如果涉及到複雜的事務，需要將 pgClient 實例傳入這些函數。
// 為了簡潔，這裡直接使用 pgClient。

/**
 * 獲取用戶資料
 * @param {string} userId - 用戶的 LINE ID
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 * @returns {Promise<Object|null>} 用戶物件或 null
 */
async function getUser(userId, dbClient = pgClient) {
  try {
    const result = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error(`❌ 獲取用戶 ${userId} 失敗:`, err.message);
    return null;
  }
}

/**
 * 保存用戶資料
 * @param {Object} user - 用戶物件
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 */
async function saveUser(user, dbClient = pgClient) {
  try {
    const { id, name, points, role, history } = user;
    await dbClient.query(
      'INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5',
      [id, name, points, role, JSON.stringify(history)]
    );
  } catch (err) {
    console.error(`❌ 保存用戶 ${user.id} 失敗:`, err.message);
  }
}

/**
 * 獲取所有課程資料
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 * @returns {Promise<Object>} 課程物件的映射 (id -> course)
 */
async function getAllCourses(dbClient = pgClient) {
  try {
    const result = await dbClient.query('SELECT * FROM courses ORDER BY time ASC');
    const courses = {};
    result.rows.forEach(row => {
      courses[row.id] = {
        id: row.id,
        title: row.title,
        time: row.time.toISOString(), // 轉換為 ISO 格式字串
        capacity: row.capacity,
        points_cost: row.points_cost,
        students: row.students,
        waiting: row.waiting,
      };
    });
    return courses;
  } catch (err) {
    console.error('❌ 獲取所有課程失敗:', err.message);
    return {};
  }
}

/**
 * 保存課程資料 (新增或更新)
 * @param {Object} course - 課程物件
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 */
async function saveCourse(course, dbClient = pgClient) {
  try {
    const { id, title, time, capacity, points_cost, students, waiting } = course;
    await dbClient.query(
      'INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7',
      [id, title, new Date(time), capacity, points_cost, students, waiting]
    );
  } catch (err) {
    console.error(`❌ 保存課程 ${course.id} 失敗:`, err.message);
  }
}

/**
 * 刪除課程
 * @param {string} courseId - 課程 ID
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 */
async function deleteCourse(courseId, dbClient = pgClient) {
  try {
    await dbClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
  } catch (err) {
    console.error(`❌ 刪除課程 ${courseId} 失敗:`, err.message);
  }
}

/**
 * 獲取所有訂單資料
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 * @returns {Promise<Array>} 訂單物件陣列
 */
async function getAllOrders(dbClient = pgClient) {
  try {
    const result = await dbClient.query('SELECT * FROM orders ORDER BY timestamp DESC');
    return result.rows.map(row => ({
      order_id: row.order_id,
      user_id: row.user_id,
      user_name: row.user_name,
      points: row.points,
      amount: row.amount,
      last_5_digits: row.last_5_digits,
      status: row.status,
      timestamp: row.timestamp.toISOString(),
    }));
  } catch (err) {
    console.error('❌ 獲取所有訂單失敗:', err.message);
    return [];
  }
}

/**
 * 保存訂單資料 (新增或更新)
 * @param {Object} order - 訂單物件
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 */
async function saveOrder(order, dbClient = pgClient) {
  try {
    const { order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp } = order;
    // 再次檢查 order_id 是否為空，以避免資料庫約束錯誤
    if (!order_id) {
        throw new Error('嘗試保存訂單時 order_id 為空值。');
    }
    await dbClient.query(
      'INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8',
      [order_id, user_id, user_name, points, amount, last_5_digits, status, new Date(timestamp)]
    );
  } catch (err) {
    console.error(`❌ 保存訂單 ${order.order_id || '未知ID'} 失敗:`, err.message);
    throw err; // 拋出錯誤以便上層調用者處理事務回滾
  }
}

/**
 * 刪除訂單
 * @param {string} orderId - 訂單 ID
 * @param {Object} dbClient - 資料庫客戶端實例，預設為 pgClient
 */
async function deleteOrder(orderId, dbClient = pgClient) {
  try {
    await dbClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
  } catch (err) {
    console.error(`❌ 刪除訂單 ${orderId} 失敗:`, err.message);
  }
}

// =====================================
//           🔧 共用工具函式 (業務邏輯層)
// =====================================

/**
 * 格式化日期時間為指定格式
 * @param {string} isoString - ISO 格式的日期時間字串
 * @returns {string} 格式化後的日期時間字串 (例如: 07-25（五）13:30)
 */
function formatDateTime(isoString) {
  if (!isoString) return '無效時間';
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
  const parts = formatter.formatToParts(date);
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  let weekday = parts.find(p => p.type === 'weekday').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  // 處理台灣地區週數顯示問題，例如：將「星期五」轉換為「五」
  if (weekday.startsWith('週')) {
    weekday = weekday.slice(-1);
  }
  return `${month}-${day}（${weekday}）${hour}:${minute}`;
}

/**
 * 生成唯一的訂單 ID
 * @returns {string} 訂單 ID
 */
function generateOrderId() {
  return `O${Date.now()}`;
}

/**
 * 檢查是否為 Line 的 Flex Message
 * @param {Object} message - 訊息物件
 * @returns {boolean}
 */
function isFlexMessage(message) {
  return message && message.type === 'flex';
}


// =====================================
//           📋 快速選單定義 (業務邏輯)
// =====================================

// 學員主選單
const studentMenu = [
  { type: 'message', label: '我的點數', text: COMMANDS.STUDENT.CHECK_POINTS },
  { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
  { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
  { type: 'message', label: '點數功能', text: COMMANDS.STUDENT.POINTS },
];

// 學員點數功能子選單
const studentPointSubMenu = [
  { type: 'message', label: '查看點數', text: COMMANDS.STUDENT.CHECK_POINTS },
  { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS },
  { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY },
  { type: 'message', label: '主選單', text: COMMANDS.STUDENT.MAIN_MENU },
];

// 老師主選單
const teacherMenu = [
  { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
  { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
  { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
];

// 老師課程管理選單
const teacherCourseManagementMenu = [
  { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE },
  { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE },
  { type: 'message', label: '課程列表', text: COMMANDS.TEACHER.COURSE_LIST },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];

// 老師點數管理選單
const teacherPointManagementMenu = [
  { type: 'message', label: '待確認清單', text: COMMANDS.TEACHER.PENDING_ORDERS },
  { type: 'message', label: '手動調整點數', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS },
  { type: 'message', label: '查學員', text: COMMANDS.TEACHER.SEARCH_STUDENT },
  { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU },
];


// =====================================
//      📌 暫存狀態物件 (業務邏輯)
// =====================================
// 用於儲存用戶在多步驟互動中的臨時狀態
const pendingTeacherLogin = {};
const pendingCourseCreation = {}; // { userId: { title, time, capacity, points_cost } }
const pendingPurchase = {};       // { userId: { plan, orderId, amount, last5 } }
const pendingManualAdjust = {};   // { userId: { targetUserId, targetUserName, points, action } }
const pendingCancelBooking = {};  // { userId: courseId }
const pendingCancelWaiting = {};  // { userId: courseId }
const pendingCancelCourse = {};   // { userId: courseId }


// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
async function handleTeacherCommands(event, user) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const messageText = event.message.text.trim();

  // 老師主選單
  if (messageText === COMMANDS.TEACHER.MAIN_MENU) {
    // 清除所有相關暫存狀態
    delete pendingTeacherLogin[userId];
    delete pendingCourseCreation[userId];
    delete pendingPurchase[userId];
    delete pendingManualAdjust[userId];
    delete pendingCancelBooking[userId];
    delete pendingCancelWaiting[userId];
    delete pendingCancelCourse[userId];

    await reply(replyToken, '已返回老師主選單。', teacherMenu);
    return true;
  }

  // 課程管理
  if (messageText === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    await reply(replyToken, '進入課程管理。', teacherCourseManagementMenu);
    return true;
  }

  // 點數管理
  if (messageText === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    await reply(replyToken, '進入點數管理。', teacherPointManagementMenu);
    return true;
  }

  // 新增課程 - 觸發
  if (messageText === COMMANDS.TEACHER.ADD_COURSE) {
    pendingCourseCreation[userId] = {}; // 初始化狀態
    await reply(replyToken, '請輸入課程名稱，例如：瑜伽入門');
    return true;
  }

  // 新增課程 - 輸入名稱
  if (pendingCourseCreation[userId] && !pendingCourseCreation[userId].title) {
    pendingCourseCreation[userId].title = messageText;
    await reply(replyToken, `課程名稱已設定為「${messageText}」。\n請輸入課程時間，例如：2025/07/25 10:00 (台灣時間)`);
    return true;
  }

  // 新增課程 - 輸入時間 (這裡需要加入日期時間解析和驗證)
  if (pendingCourseCreation[userId] && pendingCourseCreation[userId].title && !pendingCourseCreation[userId].time) {
    const rawTime = messageText;
    try {
      const parsedDate = new Date(rawTime);
      if (isNaN(parsedDate.getTime())) {
        await reply(replyToken, '日期時間格式不正確，請重新輸入，例如：2025/07/25 10:00');
        return true;
      }
      if (parsedDate.getTime() < Date.now()) {
        await reply(replyToken, '課程時間不能設定在過去，請重新輸入。');
        return true;
      }

      pendingCourseCreation[userId].time = parsedDate.toISOString(); // 儲存為 ISO 格式

      await reply(replyToken, `課程時間已設定為「${formatDateTime(parsedDate.toISOString())}」。\n請輸入課程容量 (數字)，例如：10`);
      return true;
    } catch (e) {
      await reply(replyToken, '日期時間格式不正確，請重新輸入，例如：2025/07/25 10:00');
      return true;
    }
  }

  // 新增課程 - 輸入容量
  if (pendingCourseCreation[userId] && pendingCourseCreation[userId].time && !pendingCourseCreation[userId].capacity) {
    const capacity = parseInt(messageText);
    if (isNaN(capacity) || capacity <= 0) {
      await reply(replyToken, '容量必須是正整數，請重新輸入。');
      return true;
    }
    pendingCourseCreation[userId].capacity = capacity;
    await reply(replyToken, `課程容量已設定為 ${capacity} 人。\n請輸入課程所需點數 (數字)，例如：1`);
    return true;
  }

  // 新增課程 - 輸入點數費用 & 確認
  if (pendingCourseCreation[userId] && pendingCourseCreation[userId].capacity && !pendingCourseCreation[userId].points_cost) {
    const points_cost = parseInt(messageText);
    if (isNaN(points_cost) || points_cost <= 0) {
      await reply(replyToken, '點數費用必須是正整數，請重新輸入。');
      return true;
    }
    pendingCourseCreation[userId].points_cost = points_cost;

    const courseData = pendingCourseCreation[userId];
    const confirmMessage = `請確認以下課程資訊：\n` +
                           `名稱：${courseData.title}\n` +
                           `時間：${formatDateTime(courseData.time)}\n` +
                           `容量：${courseData.capacity} 人\n` +
                           `費用：${courseData.points_cost} 點\n\n` +
                           `確認新增嗎？`;
    await reply(replyToken, confirmMessage, [
      { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_COURSE, text: COMMANDS.TEACHER.CONFIRM_ADD_COURSE },
      { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_COURSE, text: COMMANDS.TEACHER.CANCEL_ADD_COURSE },
    ]);
    return true;
  }

  // 新增課程 - 確認/取消
  if (messageText === COMMANDS.TEACHER.CONFIRM_ADD_COURSE && pendingCourseCreation[userId]) {
    const courseData = pendingCourseCreation[userId];
    const courseId = `C${global.courseIdCounter++}`; // 使用全局計數器
    const newCourse = {
      id: courseId,
      title: courseData.title,
      time: courseData.time,
      capacity: courseData.capacity,
      points_cost: courseData.points_cost,
      students: [],
      waiting: [],
    };
    await saveCourse(newCourse);
    delete pendingCourseCreation[userId];
    await reply(replyToken, `✅ 課程「${newCourse.title}」已成功新增！\nID: ${newCourse.id}`, teacherCourseManagementMenu);
    return true;
  }
  if (messageText === COMMANDS.TEACHER.CANCEL_ADD_COURSE && pendingCourseCreation[userId]) {
    delete pendingCourseCreation[userId];
    await reply(replyToken, '已取消新增課程。', teacherCourseManagementMenu);
    return true;
  }

  // 取消課程 - 觸發
  if (messageText === COMMANDS.TEACHER.CANCEL_COURSE) {
    const courses = await getAllCourses();
    const futureCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > Date.now());

    if (futureCourses.length === 0) {
      await reply(replyToken, '目前沒有可取消的未來課程。', teacherCourseManagementMenu);
      return true;
    }

    let courseListMsg = '請選擇要取消的課程：\n';
    const actions = futureCourses.map(course => {
      courseListMsg += `\nID: ${course.id}\n課程: ${course.title}\n時間: ${formatDateTime(course.time)}\n`;
      return {
        type: 'postback',
        label: `取消 ${course.title} (${formatDateTime(course.time)})`,
        data: `action=cancel_course&courseId=${course.id}`,
        displayText: `取消課程 ${course.id}`
      };
    });

    // 將選項分批發送，避免超過 Line 訊息限制
    const chunks = [];
    for (let i = 0; i < actions.length; i += 10) { // 每條訊息最多 10 個按鈕 (postback action)
      chunks.push(actions.slice(i, i + 10));
    }

    if (chunks.length > 0) {
      // 發送課程列表的文字訊息
      await reply(replyToken, courseListMsg);

      // 逐批發送 Flex Message，每個 Flex Message 包含 1-10 個按鈕
      for (const chunk of chunks) {
        const flexMessage = {
          type: 'flex',
          altText: '選擇要取消的課程',
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: chunk.map(action => ({
                type: 'button',
                action: action,
                style: 'secondary',
                height: 'sm'
              }))
            }
          }
        };
        await push(userId, flexMessage); // 使用 push 因為 replyToken 只能用一次
      }
    } else {
      await reply(replyToken, courseListMsg); // 如果沒有課程列表，只發送文字
    }

    await push(userId, { type: 'text', text: '或輸入 @返回老師主選單 取消操作。', quickReply: { items: teacherMenu.map(i => ({ type: 'action', action: i })) } });
    return true;
  }

  // 取消課程 - 處理 Postback
  if (event.type === 'postback' && event.postback.data.startsWith('action=cancel_course')) {
    const courseId = new URLSearchParams(event.postback.data).get('courseId');
    const courses = await getAllCourses();
    const courseToCancel = courses[courseId];

    if (!courseToCancel) {
      await reply(replyToken, '該課程不存在或已取消。', teacherCourseManagementMenu);
      return true;
    }

    pendingCancelCourse[userId] = courseId;
    await reply(replyToken, `確定要取消課程「${courseToCancel.title} (${formatDateTime(courseToCancel.time)})」嗎？這將通知所有已預約和候補學員。\n請輸入「確認取消」以完成。`, [
      { type: 'message', label: '確認取消', text: '確認取消' },
      { type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
    ]);
    return true;
  }

  // 取消課程 - 確認文字
  if (messageText === '確認取消' && pendingCancelCourse[userId]) {
    const courseId = pendingCancelCourse[userId];
    const courses = await getAllCourses();
    const courseToCancel = courses[courseId];

    if (!courseToCancel) {
      await reply(replyToken, '該課程不存在或已取消。', teacherCourseManagementMenu);
      delete pendingCancelCourse[userId];
      return true;
    }

    // 通知所有學員
    const notifications = [];
    for (const studentId of [...courseToCancel.students, ...courseToCancel.waiting]) {
      if (studentId !== userId) { // 避免通知老師自己
        notifications.push(push(studentId, `❌ 您預約/候補的課程「${courseToCancel.title} (${formatDateTime(courseToCancel.time)})」已被老師取消。請查看最新課程列表。`));
      }
    }
    await Promise.all(notifications);
    await deleteCourse(courseId);
    delete pendingCancelCourse[userId];
    await reply(replyToken, `✅ 課程「${courseToCancel.title}」已成功取消，並已通知相關學員。`, teacherCourseManagementMenu);
    return true;
  }

  // 課程列表
  if (messageText === COMMANDS.TEACHER.COURSE_LIST) {
    const courses = await getAllCourses();
    const futureCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > Date.now());

    if (futureCourses.length === 0) {
      await reply(replyToken, '目前沒有未來課程。', teacherCourseManagementMenu);
      return true;
    }

    let courseListMsg = '🗓️ 未來課程列表：\n\n';
    futureCourses.forEach(course => {
      const studentsCount = course.students ? course.students.length : 0;
      const waitingCount = course.waiting ? course.waiting.length : 0;
      courseListMsg += `ID: ${course.id}\n` +
                       `名稱: ${course.title}\n` +
                       `時間: ${formatDateTime(course.time)}\n` +
                       `人數: ${studentsCount}/${course.capacity} (候補: ${waitingCount})\n` +
                       `費用: ${course.points_cost} 點\n\n`;
    });
    await reply(replyToken, courseListMsg, teacherCourseManagementMenu);
    return true;
  }

  // 查學員 (依據姓名或ID)
  if (messageText === COMMANDS.TEACHER.SEARCH_STUDENT) {
    await reply(replyToken, '請輸入要查詢學員的 Line 名稱或 ID。');
    pendingManualAdjust[userId] = { action: 'searchUser' }; // 使用 manual adjust 的狀態來暫存查詢意圖
    return true;
  }

  // 處理學員查詢結果 (接續上一步)
  if (pendingManualAdjust[userId] && pendingManualAdjust[userId].action === 'searchUser') {
    const query = messageText.toLowerCase();
    const usersResult = await pgClient.query('SELECT id, name, points, role FROM users');
    const allUsers = usersResult.rows;

    const matchedUsers = allUsers.filter(user =>
      user.id.toLowerCase().includes(query) || user.name.toLowerCase().includes(query)
    );

    if (matchedUsers.length === 0) {
      await reply(replyToken, '沒有找到符合的學員。請再次輸入，或輸入 @返回點數管理 取消。');
      return true;
    }

    let responseMsg = `找到 ${matchedUsers.length} 位符合的學員：\n\n`;
    const actions = [];
    matchedUsers.slice(0, 10).forEach(user => { // 最多顯示 10 個
      responseMsg += `名稱: ${user.name}\nID: ${user.id}\n點數: ${user.points} 點\n身份: ${user.role}\n\n`;
      actions.push({
        type: 'postback',
        label: `選取 ${user.name}`,
        data: `action=select_user_for_adjust&targetId=${user.id}&targetName=${user.name}`,
        displayText: `選擇了 ${user.name}`
      });
    });

    if (actions.length > 0) {
      const flexMessage = {
        type: 'flex',
        altText: '選擇學員',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: actions.map(action => ({
              type: 'button',
              action: action,
              style: 'primary',
              height: 'sm'
            }))
          }
        }
      };
      await reply(replyToken, responseMsg); // 先發送文字列表
      await push(userId, flexMessage); // 再發送選取按鈕
    } else {
      await reply(replyToken, responseMsg);
    }
    delete pendingManualAdjust[userId]; // 清除查詢狀態，等待選擇操作
    return true;
  }

  // 待確認清單 (訂單管理)
  if (messageText === COMMANDS.TEACHER.PENDING_ORDERS) {
    const orders = await getAllOrders();
    const pendingOrders = orders.filter(order => order.status === 'pending');

    if (pendingOrders.length === 0) {
      await reply(replyToken, '目前沒有待確認的購點訂單。', teacherPointManagementMenu);
      return true;
    }

    let responseMsg = '待確認購點清單：\n\n';
    const flexMessages = [];

    for (const order of pendingOrders) {
      responseMsg += `訂單 ID: ${order.order_id}\n` +
                     `用戶: ${order.user_name} (${order.user_id})\n` +
                     `金額: ${order.amount} 元\n` +
                     `點數: ${order.points} 點\n` +
                     `後五碼: ${order.last_5_digits || '未提供'}\n` +
                     `時間: ${formatDateTime(order.timestamp)}\n\n`;

      flexMessages.push({
        type: 'flex',
        altText: `訂單 ${order.order_id}`,
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: `訂單 ID: ${order.order_id}`, weight: 'bold' },
              { type: 'text', text: `用戶: ${order.user_name}` },
              { type: 'text', text: `金額: ${order.amount} 元 / 點數: ${order.points} 點` },
              { type: 'text', text: `後五碼: ${order.last_5_digits || '未提供'}` },
              { type: 'text', text: `時間: ${formatDateTime(order.timestamp)}` },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: `確認撥點給 ${order.user_name}`,
                  data: `action=confirm_order&orderId=${order.order_id}&userId=${order.user_id}&points=${order.points}`,
                  displayText: `確認訂單 ${order.order_id}`
                },
                style: 'primary',
                margin: 'md'
              },
              {
                type: 'button',
                action: {
                  type: 'postback',
                  label: `取消訂單 ${order.order_id}`,
                  data: `action=cancel_order&orderId=${order.order_id}`,
                  displayText: `取消訂單 ${order.order_id}`
                },
                style: 'secondary'
              }
            ]
          }
        }
      });
    }

    await reply(replyToken, responseMsg); // 先發送文字總覽
    for (const flexMsg of flexMessages) {
      await push(userId, flexMsg); // 逐一發送 Flex Message
    }
    await push(userId, {
        type: 'text',
        text: '請點擊上方按鈕執行操作。',
        quickReply: { items: teacherPointManagementMenu.map(i => ({ type: 'action', action: i })) })
    });
    return true;
  }

  // 處理確認訂單 Postback
  if (event.type === 'postback' && event.postback.data.startsWith('action=confirm_order')) {
    const params = new URLSearchParams(event.postback.data);
    const orderId = params.get('orderId'); // 確保這裡能正確獲取到值
    console.log(`DEBUG: 處理確認訂單 - 收到 orderId: ${orderId}`); //

    if (!orderId) { // 新增檢查，防止 orderId 為 null
        console.error('❌ 錯誤：確認訂單時 orderId 為空。Postback data:', event.postback.data); //
        await reply(replyToken, '❌ 訂單 ID 遺失，無法確認訂單。請通知開發者。', teacherPointManagementMenu); //
        return true;
    }

    const targetUserId = params.get('userId');
    const points = parseInt(params.get('points'));

    const order = (await getAllOrders()).find(o => o.order_id === orderId);
    if (!order || order.status !== 'pending') {
      await reply(replyToken, '該訂單不存在或已被處理。', teacherPointManagementMenu);
      return true;
    }
    
    // 再次確認 order 對象中的 order_id 屬性是存在的，理論上 Postback 傳來的 orderId 應該與查詢到的 order 匹配
    // 這個額外的賦值可以作為一個防禦性編程，確保 `saveOrder` 收到正確的 ID
    order.order_id = orderId; 

    const targetUser = await getUser(targetUserId);
    if (!targetUser) {
      await reply(replyToken, `找不到用戶 ${targetUserId}。請手動處理。`, teacherPointManagementMenu);
      return true;
    }

    targetUser.points += points;
    order.status = 'completed'; // 更新訂單狀態

    await pgClient.query('BEGIN'); // 開始事務
    try {
      await saveUser(targetUser, pgClient);
      await saveOrder(order, pgClient); // 這裡的 order 應該包含正確的 order_id
      await pgClient.query('COMMIT'); // 提交事務

      await reply(replyToken, `✅ 訂單 ${orderId} 已確認，已為學員 ${targetUser.name} 增加 ${points} 點。`, teacherPointManagementMenu);
      // 通知學員
      await push(targetUserId, `💰 您的購點訂單 ${orderId} 已確認，已增加 ${points} 點。目前點數：${targetUser.points} 點。`);
    } catch (e) {
      await pgClient.query('ROLLBACK'); // 回滾事務
      console.error(`❌ 確認訂單 ${orderId} 失敗:`, e.message);
      await reply(replyToken, `❌ 確認訂單失敗，系統發生錯誤，請稍後再試。`, teacherPointManagementMenu); //
    }
    return true;
  }

  // 處理取消訂單 Postback
  if (event.type === 'postback' && event.postback.data.startsWith('action=cancel_order')) {
    const params = new URLSearchParams(event.postback.data);
    const orderId = params.get('orderId');

    const order = (await getAllOrders()).find(o => o.order_id === orderId);
    if (!order) {
      await reply(replyToken, '該訂單不存在或已被處理。', teacherPointManagementMenu);
      return true;
    }

    await deleteOrder(orderId);
    await reply(replyToken, `✅ 訂單 ${orderId} 已取消。`, teacherPointManagementMenu);
    // 通知學員訂單被取消
    await push(order.user_id, `❌ 您的購點訂單 ${order.order_id} 因故被老師取消。如有疑問請聯繫老師。`);
    return true;
  }

  // 手動調整點數 - 觸發
  if (messageText === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    await reply(replyToken, '請輸入要調整點數的學員的 Line 名稱或 ID。');
    pendingManualAdjust[userId] = { action: 'start' }; // 設置狀態為等待輸入學員
    return true;
  }

  // 手動調整點數 - 選擇學員 (Postback)
  if (event.type === 'postback' && event.postback.data.startsWith('action=select_user_for_adjust')) {
    const params = new URLSearchParams(event.postback.data);
    const targetUserId = params.get('targetId');
    const targetUserName = params.get('targetName');

    // 重新獲取用戶資訊，確保是最新的
    const targetUser = await getUser(targetUserId);
    if (!targetUser) {
      await reply(replyToken, '找不到該學員。', teacherPointManagementMenu);
      return true;
    }

    pendingManualAdjust[userId] = {
      action: 'selectedUser',
      targetUserId: targetUser.id,
      targetUserName: targetUser.name,
    };
    await reply(replyToken, `已選取學員：${targetUser.name} (ID: ${targetUser.id})，目前點數：${targetUser.points} 點。\n請輸入要調整的點數數量 (正數為增加，負數為減少)，例如：10 或 -5`);
    return true;
  }

  // 手動調整點數 - 輸入點數
  if (pendingManualAdjust[userId] && pendingManualAdjust[userId].action === 'selectedUser') {
    const pointsToAdjust = parseInt(messageText);
    if (isNaN(pointsToAdjust) || pointsToAdjust === 0) {
      await reply(replyToken, '請輸入有效的點數數量 (非零整數)，例如：10 或 -5。');
      return true;
    }

    pendingManualAdjust[userId].points = pointsToAdjust;

    await reply(replyToken, `確認為學員 ${pendingManualAdjust[userId].targetUserName} ${pointsToAdjust > 0 ? '增加' : '減少'} ${Math.abs(pointsToAdjust)} 點嗎？\n請輸入「確認調整」以完成。`, [
      { type: 'message', label: '確認調整', text: '確認調整' },
      { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
    ]);
    pendingManualAdjust[userId].action = 'confirmAdjust';
    return true;
  }

  // 手動調整點數 - 確認調整
  if (messageText === '確認調整' && pendingManualAdjust[userId] && pendingManualAdjust[userId].action === 'confirmAdjust') {
    const { targetUserId, targetUserName, points } = pendingManualAdjust[userId];
    const targetUser = await getUser(targetUserId);

    if (!targetUser) {
      await reply(replyToken, '找不到該學員。', teacherPointManagementMenu);
      delete pendingManualAdjust[userId];
      return true;
    }

    targetUser.points += points;
    await saveUser(targetUser); // 直接保存
    await reply(replyToken, `✅ 已為學員 ${targetUserName} ${points > 0 ? '增加' : '減少'} ${Math.abs(points)} 點。\n目前點數：${targetUser.points} 點。`, teacherPointManagementMenu);
    // 通知學員點數變動
    await push(targetUserId, `💰 您的點數已被老師手動調整 ${points} 點。目前點數：${targetUser.points} 點。`);
    delete pendingManualAdjust[userId];
    return true;
  }

  // 手動調整點數 - 取消調整
  if (messageText === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
    delete pendingManualAdjust[userId];
    await reply(replyToken, '已取消手動調整點數。', teacherPointManagementMenu);
    return true;
  }

  // 統計報表 (簡化為文字輸出)
  if (messageText === COMMANDS.TEACHER.REPORT) {
    const courses = await getAllCourses();
    const allUsers = (await pgClient.query('SELECT id, name, points FROM users')).rows;
    const orders = await getAllOrders();

    let reportMsg = '📊 統計報表：\n\n';

    // 課程概況
    reportMsg += '=== 課程概況 ===\n';
    const totalCourses = Object.keys(courses).length;
    const activeCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > Date.now()).length;
    reportMsg += `總課程數: ${totalCourses}\n`;
    reportMsg += `未開始課程數: ${activeCourses}\n\n`;

    // 用戶點數分佈
    reportMsg += '=== 學員點數概況 ===\n';
    const totalPoints = allUsers.reduce((sum, user) => sum + user.points, 0);
    const avgPoints = allUsers.length > 0 ? (totalPoints / allUsers.length).toFixed(2) : 0;
    const usersWithPoints = allUsers.filter(u => u.points > 0).length;
    reportMsg += `總學員數: ${allUsers.length}\n`;
    reportMsg += `擁有點數學員數: ${usersWithPoints}\n`;
    reportMsg += `總點數: ${totalPoints} 點\n`;
    reportMsg += `平均點數: ${avgPoints} 點/學員\n\n`;

    // 訂單概況
    reportMsg += '=== 購點訂單概況 ===\n';
    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const totalRevenue = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.amount, 0);
    reportMsg += `總訂單數: ${totalOrders}\n`;
    reportMsg += `已完成訂單數: ${completedOrders}\n`;
    reportMsg += `待確認訂單數: ${pendingOrders}\n`;
    reportMsg += `總收入 (已完成): ${totalRevenue} 元\n\n`;

    await reply(replyToken, reportMsg, teacherMenu);
    return true;
  }

  return false; // 如果沒有處理任何老師指令，返回 false
}

// =====================================
//        🔄 購點流程處理函式
// =====================================
async function handlePurchaseFlow(event, user) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const messageText = event.message.text.trim();

  // 購買點數 - 觸發
  if (messageText === COMMANDS.STUDENT.BUY_POINTS) {
    const buttons = PURCHASE_PLANS.map(plan => ({
      type: 'message',
      label: plan.label,
      text: `購買 ${plan.points} 點`
    }));

    await reply(replyToken, {
      type: 'text',
      text: '請選擇您要購買的點數方案：',
      quickReply: { items: buttons.map(b => ({ type: 'action', action: b })) }
    }, studentPointSubMenu);
    return true;
  }

  // 購買點數 - 選擇方案
  const buyMatch = messageText.match(/^購買 (\d+) 點$/);
  if (buyMatch) {
    const points = parseInt(buyMatch[1]);
    const plan = PURCHASE_PLANS.find(p => p.points === points);

    if (plan) {
      pendingPurchase[userId] = {
        plan: plan,
        orderId: generateOrderId(), // 生成訂單 ID
        amount: plan.amount,
        last5: null, // 暫存後五碼
      };

      await reply(replyToken, `您選擇了購買 ${plan.label}。\n請將 ${plan.amount} 元匯款至以下帳戶：\n` +
                                `銀行名稱: ${BANK_INFO.bankName}\n` +
                                `帳號: ${BANK_INFO.accountNumber}\n` +
                                `戶名: ${BANK_INFO.accountName}\n\n` +
                                `匯款完成後，請點擊下方按鈕或輸入「@輸入匯款後五碼」填寫您的匯款帳號後五碼，以便老師為您撥點。\n` +
                                `(點數將在老師確認後入帳)`, [
        { type: 'message', label: COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER, text: COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER },
        { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
      ], studentPointSubMenu);
      return true;
    }
  }

  // 輸入匯款後五碼 - 觸發
  if (messageText === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || messageText === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    if (pendingPurchase[userId] && pendingPurchase[userId].plan) {
      pendingPurchase[userId].action = 'inputLast5'; // 設置狀態
      await reply(replyToken, `請輸入您的匯款帳號後五碼：`, [
        { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }
      ]);
    } else {
      await reply(replyToken, '您目前沒有待確認的購點訂單，請先選擇購點方案。', studentPointSubMenu);
    }
    return true;
  }

  // 輸入匯款後五碼 - 接收後五碼
  if (pendingPurchase[userId] && pendingPurchase[userId].action === 'inputLast5') {
    const last5Digits = messageText.trim();
    if (!/^\d{5}$/.test(last5Digits)) {
      await reply(replyToken, '後五碼格式不正確，請輸入 5 位數字。', [
        { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 }
      ]);
      return true;
    }
    pendingPurchase[userId].last5 = last5Digits;
    pendingPurchase[userId].action = 'confirmPurchase'; // 進入確認狀態

    const purchase = pendingPurchase[userId];
    const confirmMsg = `您將購買 ${purchase.plan.points} 點 ( ${purchase.plan.amount} 元)。\n` +
                       `匯款帳號後五碼：${purchase.last5}\n\n` +
                       `確認提交訂單嗎？`;
    await reply(replyToken, confirmMsg, [
      { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
      { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
    ]);
    return true;
  }

  // 取消輸入後五碼
  if (messageText === COMMANDS.STUDENT.CANCEL_INPUT_LAST5 && pendingPurchase[userId]) {
    delete pendingPurchase[userId].action; // 清除輸入後五碼的狀態
    await reply(replyToken, '已取消輸入後五碼。您仍然可以稍後再次輸入。\n請點選下方「@輸入匯款後五碼」以重新輸入。', [
        { type: 'message', label: COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER, text: COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER },
        { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
    ]);
    return true;
  }

  // 確認購買
  if (messageText === COMMANDS.STUDENT.CONFIRM_BUY_POINTS && pendingPurchase[userId] && pendingPurchase[userId].action === 'confirmPurchase') {
    const purchase = pendingPurchase[userId];
    const newOrder = {
      order_id: purchase.orderId,
      user_id: userId,
      user_name: user.name,
      points: purchase.plan.points,
      amount: purchase.plan.amount,
      last_5_digits: purchase.last5,
      status: 'pending', // 待確認狀態
      timestamp: new Date().toISOString(),
    };

    await saveOrder(newOrder);
    delete pendingPurchase[userId]; // 清除暫存狀態

    await reply(replyToken, `✅ 您的購點訂單已提交！訂單號碼：${newOrder.order_id}\n` +
                              `我們已收到您的匯款後五碼，老師將盡快為您確認並撥點。`, studentPointSubMenu);

    // 通知老師有新訂單
    if (TEACHER_ID) {
      await push(TEACHER_ID, `💰 有新的購點訂單待確認！\n` +
                               `用戶：${user.name} (${userId})\n` +
                               `購買：${newOrder.points} 點 / ${newOrder.amount} 元\n` +
                               `後五碼：${newOrder.last_5_digits || '未提供'}\n` +
                               `時間：${formatDateTime(newOrder.timestamp)}\n` +
                               `請前往「@待確認清單」處理。`);
    }
    return true;
  }

  // 取消購買
  if (messageText === COMMANDS.STUDENT.CANCEL_PURCHASE && pendingPurchase[userId]) {
    delete pendingPurchase[userId];
    await reply(replyToken, '已取消購點流程。', studentPointSubMenu);
    return true;
  }

  return false; // 如果沒有處理任何購點流程指令，返回 false
}

// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, user) {
  const userId = event.source.userId;
  const replyToken = event.replyToken;
  const messageText = event.message.text.trim();

  // 返回學員主選單
  if (messageText === COMMANDS.STUDENT.MAIN_MENU) {
    // 清除所有相關暫存狀態
    delete pendingPurchase[userId];
    delete pendingCancelBooking[userId];
    delete pendingCancelWaiting[userId];
    await reply(replyToken, '已返回學員主選單。', studentMenu);
    return true;
  }

  // 點數功能選單
  if (messageText === COMMANDS.STUDENT.POINTS || messageText === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    await reply(replyToken, '進入點數功能。', studentPointSubMenu);
    return true;
  }

  // 查看剩餘點數
  if (messageText === COMMANDS.STUDENT.CHECK_POINTS) {
    const updatedUser = await getUser(userId); // 獲取最新點數
    await reply(replyToken, `您目前剩餘 ${updatedUser.points} 點。`, studentPointSubMenu);
    return true;
  }

  // 購點紀錄
  if (messageText === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    const orders = await getAllOrders();
    const userOrders = orders.filter(order => order.user_id === userId);

    if (userOrders.length === 0) {
      await reply(replyToken, '您目前沒有購點紀錄。', studentPointSubMenu);
      return true;
    }

    let historyMsg = '您的購點紀錄：\n\n';
    userOrders.forEach(order => {
      historyMsg += `訂單 ID: ${order.order_id}\n` +
                    `購買點數: ${order.points} 點\n` +
                    `金額: ${order.amount} 元\n` +
                    `後五碼: ${order.last_5_digits || '未提供'}\n` +
                    `狀態: ${order.status === 'completed' ? '已完成' : '待確認'}\n` +
                    `時間: ${formatDateTime(order.timestamp)}\n\n`;
    });
    await reply(replyToken, historyMsg, studentPointSubMenu);
    return true;
  }

  // 預約課程
  if (messageText === COMMANDS.STUDENT.BOOK_COURSE) {
    const courses = await getAllCourses();
    const futureCourses = Object.values(courses).filter(c => new Date(c.time).getTime() > Date.now() + ONE_HOUR_IN_MS); // 顯示至少 1 小時後的課程

    if (futureCourses.length === 0) {
      await reply(replyToken, '目前沒有可預約的未來課程。', studentMenu);
      return true;
    }

    let courseListMsg = '🗓️ 可預約課程列表：\n\n';
    const actions = [];
    futureCourses.forEach(course => {
      const isBooked = course.students.includes(userId);
      const isWaiting = course.waiting.includes(userId);
      const isFull = course.students.length >= course.capacity;

      let statusText = '';
      let buttonLabel = '';
      let buttonData = '';
      let buttonType = 'postback'; // 預設為 postback

      if (isBooked) {
        statusText = '已預約';
        buttonLabel = '您已預約'; // 不提供按鈕或禁用
        buttonData = 'action=none';
        buttonType = 'message'; // 為了顯示按鈕但不觸發動作，設為message
      } else if (isFull && !isWaiting) {
        statusText = '已額滿，可候補';
        buttonLabel = `候補 ${course.title}`;
        buttonData = `action=waitlist_course&courseId=${course.id}`;
      } else if (isWaiting) {
        statusText = '已候補';
        buttonLabel = '您已候補'; // 不提供按鈕或禁用
        buttonData = 'action=none';
        buttonType = 'message'; // 為了顯示按鈕但不觸發動作，設為message
      } else {
        statusText = '可預約';
        buttonLabel = `預約 ${course.title}`;
        buttonData = `action=book_course&courseId=${course.id}`;
      }

      courseListMsg += `ID: ${course.id}\n` +
                       `名稱: ${course.title}\n` +
                       `時間: ${formatDateTime(course.time)}\n` +
                       `人數: ${course.students.length}/${course.capacity} (候補: ${course.waiting.length})\n` +
                       `費用: ${course.points_cost} 點\n` +
                       `狀態: ${statusText}\n\n`;

      // 只有當按鈕會觸發實際動作時才加入 actions 陣列
      if (buttonData !== 'action=none') { 
        actions.push({
          type: buttonType, // 使用實際的按鈕類型
          label: buttonLabel,
          data: buttonData,
          displayText: `${buttonLabel} (${course.id})`
        });
      }
    });

    await reply(replyToken, courseListMsg); // 先發送文字列表

    // 由於 Line Flex Message 按鈕數量有限，可以考慮分批發送或簡化
    if (actions.length > 0) {
      const chunks = [];
      for (let i = 0; i < actions.length; i += 10) {
        chunks.push(actions.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const flexMessage = {
          type: 'flex',
          altText: '預約/候補課程',
          contents: {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: chunk.map(action => ({
                type: 'button',
                action: action,
                style: 'primary',
                height: 'sm'
              }))
            }
          }
        };
        await push(userId, flexMessage);
      }
    }
    await push(userId, {
        type: 'text',
        text: '請點擊上方按鈕進行預約或候補。',
        quickReply: { items: studentMenu.map(i => ({ type: 'action', action: i })) }
    });
    return true;
  }

  // 處理預約/候補課程 Postback
  if (event.type === 'postback' && (event.postback.data.startsWith('action=book_course') || event.postback.data.startsWith('action=waitlist_course'))) {
    const params = new URLSearchParams(event.postback.data);
    const courseId = params.get('courseId');
    const actionType = params.get('action'); // 'book_course' or 'waitlist_course'

    const courses = await getAllCourses();
    const course = courses[courseId];
    if (!course) {
      await reply(replyToken, '該課程不存在或已結束。', studentMenu);
      return true;
    }

    // 檢查課程是否已過期
    if (new Date(course.time).getTime() < Date.now() + ONE_HOUR_IN_MS) {
      await reply(replyToken, '該課程即將開始或已結束，無法預約/候補。', studentMenu);
      return true;
    }

    const isBooked = course.students.includes(userId);
    const isWaiting = course.waiting.includes(userId);

    if (isBooked) {
      await reply(replyToken, `您已成功預約課程「${course.title}」。`, studentMenu);
      return true;
    }
    if (isWaiting) {
      await reply(replyToken, `您已在課程「${course.title}」的候補名單中。`, studentMenu);
      return true;
    }

    const user = await getUser(userId);
    if (user.points < course.points_cost) {
      await reply(replyToken, `您的點數不足 (${user.points} 點)，預約此課程需要 ${course.points_cost} 點。請先購買點數。`, studentPointSubMenu);
      return true;
    }

    if (actionType === 'book_course') {
      if (course.students.length < course.capacity) {
        // 直接預約
        course.students.push(userId);
        user.points -= course.points_cost;
        user.history.push({ type: 'booked', courseId: course.id, courseTitle: course.title, points_cost: course.points_cost, timestamp: new Date().toISOString() });

        await pgClient.query('BEGIN'); // 開始事務
        try {
          await saveUser(user, pgClient);
          await saveCourse(course, pgClient);
          await pgClient.query('COMMIT'); // 提交事務

          await reply(replyToken, `✅ 成功預約課程「${course.title} (${formatDateTime(course.time)})」！已扣除 ${course.points_cost} 點，您目前剩餘 ${user.points} 點。`, studentMenu);
          // 通知老師有新預約
          if (TEACHER_ID) {
            await push(TEACHER_ID, `🔔 新預約：學員 ${user.name} 預約了「${course.title} (${formatDateTime(course.time)})」。`);
          }
        } catch (e) {
          await pgClient.query('ROLLBACK'); // 回滾事務
          console.error(`❌ 預約課程 ${courseId} 失敗:`, e.message);
          await reply(replyToken, `❌ 預約失敗，請稍後再試。錯誤: ${e.message}`, studentMenu);
        }
      } else {
        await reply(replyToken, `課程「${course.title}」已額滿，請選擇候補。`, studentMenu);
      }
    } else if (actionType === 'waitlist_course') {
      // 候補
      course.waiting.push(userId); // 加入候補
      await saveCourse(course);
      await reply(replyToken, `✅ 成功加入課程「${course.title} (${formatDateTime(course.time)})」的候補名單。若有空位將自動通知您。`, studentMenu);
      // 通知老師有新候補
      if (TEACHER_ID) {
        await push(TEACHER_ID, `🔔 新候補：學員 ${user.name} 候補了「${course.title} (${formatDateTime(course.time)})」。`);
      }
    }
    return true;
  }

  // 我的課程 (已預約和已候補)
  if (messageText === COMMANDS.STUDENT.MY_COURSES) {
    const courses = await getAllCourses();
    const userBookedCourses = [];
    const userWaitingCourses = [];

    // 過濾出用戶已預約或已候補的未開始課程
    for (const id in courses) {
      const course = courses[id];
      if (new Date(course.time).getTime() > Date.now()) { // 僅顯示未開始的課程
        if (course.students.includes(userId)) {
          userBookedCourses.push(course);
        } else if (course.waiting.includes(userId)) {
          userWaitingCourses.push(course);
        }
      }
    }

    let responseMsg = '📝 我的課程：\n\n';
    let hasCourses = false;

    if (userBookedCourses.length > 0) {
      responseMsg += '=== 已預約課程 ===\n';
      userBookedCourses.sort((a, b) => new Date(a.time) - new Date(b.time)); // 按時間排序
      userBookedCourses.forEach(course => {
        responseMsg += `ID: ${course.id}\n` +
                       `名稱: ${course.title}\n` +
                       `時間: ${formatDateTime(course.time)}\n` +
                       `費用: ${course.points_cost} 點\n\n`;
      });
      hasCourses = true;
    }

    if (userWaitingCourses.length > 0) {
      responseMsg += '=== 已候補課程 ===\n';
      userWaitingCourses.sort((a, b) => new Date(a.time) - new Date(b.time)); // 按時間排序
      userWaitingCourses.forEach(course => {
        responseMsg += `ID: ${course.id}\n` +
                       `名稱: ${course.title}\n` +
                       `時間: ${formatDateTime(course.time)}\n` +
                       `費用: ${course.points_cost} 點\n\n`;
      });
      hasCourses = true;
    }

    if (!hasCourses) {
      responseMsg += '您目前沒有已預約或已候補的未來課程。';
    }

    await reply(replyToken, responseMsg, studentMenu);
    return true;
  }

  // 取消預約 (觸發)
  if (messageText === COMMANDS.STUDENT.CANCEL_BOOKING) {
    const courses = await getAllCourses();
    const userBookedCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > Date.now());

    if (userBookedCourses.length === 0) {
      await reply(replyToken, '您目前沒有可取消預約的課程。', studentMenu);
      return true;
    }

    let courseListMsg = '請選擇要取消預約的課程：\n';
    const actions = userBookedCourses.map(course => {
      courseListMsg += `\nID: ${course.id}\n課程: ${course.title}\n時間: ${formatDateTime(course.time)}\n`;
      return {
        type: 'postback',
        label: `取消預約 ${course.title}`,
        data: `action=cancel_booking&courseId=${course.id}`,
        displayText: `取消預約課程 ${course.id}`
      };
    });

    if (actions.length > 0) {
      await reply(replyToken, courseListMsg);
      const flexMessage = {
        type: 'flex',
        altText: '選擇要取消預約的課程',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: actions.map(action => ({
              type: 'button',
              action: action,
              style: 'secondary',
              height: 'sm'
            }))
          }
        }
      };
      await push(userId, flexMessage);
    } else {
      await reply(replyToken, courseListMsg);
    }
    await push(userId, {
        type: 'text',
        text: '或輸入 @返回學員主選單 取消操作。',
        quickReply: { items: studentMenu.map(i => ({ type: 'action', action: i })) }
    });
    return true;
  }

  // 取消預約 (處理 Postback)
  if (event.type === 'postback' && event.postback.data.startsWith('action=cancel_booking')) {
    const courseId = new URLSearchParams(event.postback.data).get('courseId');
    const courses = await getAllCourses();
    const course = courses[courseId];

    if (!course || !course.students.includes(userId)) {
      await reply(replyToken, '該課程不存在或您未預約此課程。', studentMenu);
      return true;
    }
    // 檢查是否太晚取消 (例如，課程開始前 8 小時內不能取消)
    const currentTime = Date.now();
    const courseStartTime = new Date(course.time).getTime();
    if (courseStartTime - currentTime < EIGHT_HOURS_IN_MS) {
        await reply(replyToken, `課程「${course.title}」將在 8 小時內開始，無法取消預約。若有特殊情況請聯繫老師。`, studentMenu);
        return true;
    }

    pendingCancelBooking[userId] = courseId; // 暫存要取消的課程ID

    await reply(replyToken, `確定要取消預約課程「${course.title} (${formatDateTime(course.time)})」嗎？\n點數將會退還。請輸入「確認取消預約」以完成。`, [
      { type: 'message', label: '確認取消預約', text: '確認取消預約' },
      { type: 'message', label: COMMANDS.STUDENT.MAIN_MENU, text: COMMANDS.STUDENT.MAIN_MENU }
    ]);
    return true;
  }

  // 取消預約 (確認文字)
  if (messageText === '確認取消預約' && pendingCancelBooking[userId]) {
    const courseId = pendingCancelBooking[userId];
    const courses = await getAllCourses();
    const course = courses[courseId];

    if (!course || !course.students.includes(userId)) {
      await reply(replyToken, '該課程不存在或您未預約此課程。', studentMenu);
      delete pendingCancelBooking[userId];
      return true;
    }

    const user = await getUser(userId);
    const pointsReturned = course.points_cost;

    // 從預約名單中移除
    course.students = course.students.filter(id => id !== userId);
    user.points += pointsReturned; // 退還點數
    user.history.push({ type: 'cancelled_booking', courseId: course.id, courseTitle: course.title, points_returned: pointsReturned, timestamp: new Date().toISOString() });


    // 處理候補學員
    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      // 有空位且有候補學員，將第一位候補學員轉為正式學員
      const nextStudentId = course.waiting.shift(); // 移除第一位候補
      course.students.push(nextStudentId); // 加入正式學員

      const nextStudent = await getUser(nextStudentId);
      if (nextStudent && nextStudent.points >= course.points_cost) {
        nextStudent.points -= course.points_cost; // 扣除點數
        nextStudent.history.push({ type: 'auto_booked_from_waiting', courseId: course.id, courseTitle: course.title, points_cost: course.points_cost, timestamp: new Date().toISOString() });
        await saveUser(nextStudent);
        await push(nextStudentId, `🔔 好消息！您候補的課程「${course.title} (${formatDateTime(course.time)})」已有空位，已為您自動預約並扣除 ${course.points_cost} 點。您目前剩餘 ${nextStudent.points} 點。`);
        // 通知老師
        if (TEACHER_ID) {
            await push(TEACHER_ID, `🔔 候補轉正：學員 ${nextStudent.name} 已由候補轉為正式學員，課程「${course.title} (${formatDateTime(course.time)})」。`);
        }
      } else if (nextStudent) {
        // 候補學員點數不足，發送通知但不安排預約
        await push(nextStudentId, `⚠️ 您候補的課程「${course.title} (${formatDateTime(course.time)})」已有空位，但您的點數不足 (${nextStudent.points} 點，需 ${course.points_cost} 點)，無法為您自動預約。請先購買點數。`);
        // 將其重新加回候補隊伍末端，或直接移除，這裡選擇重新加回末端，但移除其優先順序
        course.waiting.push(nextStudentId); // 重新加入隊伍末端
      }
    }

    await pgClient.query('BEGIN'); // 開始事務
    try {
      await saveUser(user, pgClient);
      await saveCourse(course, pgClient);
      await pgClient.query('COMMIT'); // 提交事務

      delete pendingCancelBooking[userId];
      await reply(replyToken, `✅ 成功取消課程「${course.title} (${formatDateTime(course.time)})」的預約，已退還 ${pointsReturned} 點。您目前剩餘 ${user.points} 點。`, studentMenu);
      // 通知老師
      if (TEACHER_ID) {
          await push(TEACHER_ID, `🔔 取消預約：學員 ${user.name} 取消了課程「${course.title} (${formatDateTime(course.time)})」。`);
      }
    } catch (e) {
      await pgClient.query('ROLLBACK');
      console.error(`❌ 取消預約失敗:`, e.message);
      await reply(replyToken, `❌ 取消預約失敗，請稍後再試。錯誤: ${e.message}`, studentMenu);
    }
    return true;
  }

  // 取消候補 (觸發)
  if (messageText === COMMANDS.STUDENT.CANCEL_WAITING) {
    const courses = await getAllCourses();
    const userWaitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > Date.now());

    if (userWaitingCourses.length === 0) {
      await reply(replyToken, '您目前沒有可取消候補的課程。', studentMenu);
      return true;
    }

    let courseListMsg = '請選擇要取消候補的課程：\n';
    const actions = userWaitingCourses.map(course => {
      courseListMsg += `\nID: ${course.id}\n課程: ${course.title}\n時間: ${formatDateTime(course.time)}\n`;
      return {
        type: 'postback',
        label: `取消候補 ${course.title}`,
        data: `action=cancel_waiting&courseId=${course.id}`,
        displayText: `取消候補課程 ${course.id}`
      };
    });

    if (actions.length > 0) {
      await reply(replyToken, courseListMsg);
      const flexMessage = {
        type: 'flex',
        altText: '選擇要取消候補的課程',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: actions.map(action => ({
              type: 'button',
              action: action,
              style: 'secondary',
              height: 'sm'
            }))
          }
        }
      };
      await push(userId, flexMessage);
    } else {
      await reply(replyToken, courseListMsg);
    }
    await push(userId, {
        type: 'text',
        text: '或輸入 @返回學員主選單 取消操作。',
        quickReply: { items: studentMenu.map(i => ({ type: 'action', action: i })) }
    });
    return true;
  }

  // 取消候補 (處理 Postback)
  if (event.type === 'postback' && event.postback.data.startsWith('action=cancel_waiting')) {
    const courseId = new URLSearchParams(event.postback.data).get('courseId');
    const courses = await getAllCourses();
    const course = courses[courseId];

    if (!course || !course.waiting.includes(userId)) {
      await reply(replyToken, '該課程不存在或您未候補此課程。', studentMenu);
      return true;
    }

    pendingCancelWaiting[userId] = courseId; // 暫存要取消的課程ID

    await reply(replyToken, `確定要取消候補課程「${course.title} (${formatDateTime(course.time)})」嗎？`, [
      { type: 'message', label: '確認取消候補', text: '確認取消候補' },
      { type: 'message', label: COMMANDS.STUDENT.MAIN_MENU, text: COMMANDS.STUDENT.MAIN_MENU }
    ]);
    return true;
  }

  // 取消候補 (確認文字)
  if (messageText === '確認取消候補' && pendingCancelWaiting[userId]) {
    const courseId = pendingCancelWaiting[userId];
    const courses = await getAllCourses();
    const course = courses[courseId];

    if (!course || !course.waiting.includes(userId)) {
      await reply(replyToken, '該課程不存在或您未候補此課程。', studentMenu);
      delete pendingCancelWaiting[userId];
      return true;
    }

    // 從候補名單中移除
    course.waiting = course.waiting.filter(id => id !== userId);

    await saveCourse(course); // 直接保存
    delete pendingCancelWaiting[userId];

    await reply(replyToken, `✅ 成功取消課程「${course.title} (${formatDateTime(course.time)})」的候補。`, studentMenu);
    // 通知老師
    if (TEACHER_ID) {
        await push(TEACHER_ID, `🔔 取消候補：學員 ${user.name} 取消了課程「${course.title} (${formatDateTime(course.time)})」的候補。`);
    }
    return true;
  }

  return false; // 如果沒有處理任何學員指令，返回 false
}


// =====================================
//      🎯 主事件處理函式 (Line Webhook Entry Point)
// =====================================
async function handleEvent(event) {
  if (event.type !== 'message' && event.type !== 'postback') {
    return; // 僅處理訊息和 Postback 事件
  }

  const userId = event.source.userId;
  const replyToken = event.replyToken;
  let messageText = '';
  if (event.type === 'message' && event.message.type === 'text') {
    messageText = event.message.text.trim();
  }

  // 獲取或創建用戶
  let user = await getUser(userId);
  if (!user) {
    const profile = await lineClient.getProfile(userId);
    user = {
      id: userId,
      name: profile.displayName || '新用戶',
      points: 0,
      role: 'student', // 預設為學員身份
      history: []
    };
    await saveUser(user);
    await reply(replyToken, `歡迎您，${user.name}！您已註冊為學員。`, studentMenu);
    return;
  }

  // 檢查是否是切換身份指令
  if (messageText === COMMANDS.SWITCH_ROLE) {
    // 只有老師可以切換身份
    if (userId === TEACHER_ID) {
      user.role = user.role === 'teacher' ? 'student' : 'teacher';
      await saveUser(user);
      const roleText = user.role === 'teacher' ? '老師' : '學員';
      const menu = user.role === 'teacher' ? teacherMenu : studentMenu;
      await reply(replyToken, `已成功切換到 ${roleText} 身份。`, menu);
    } else {
      await reply(replyToken, '您沒有權限切換身份。', studentMenu);
    }
    return;
  }

  // 處理老師登入 (首次老師進入，需要輸入密碼)
  if (userId === TEACHER_ID && user.role !== 'teacher' && !pendingTeacherLogin[userId] && messageText !== COMMANDS.SWITCH_ROLE) {
      pendingTeacherLogin[userId] = true;
      await reply(replyToken, '您是老師嗎？請輸入老師密碼。');
      return;
  }
  if (pendingTeacherLogin[userId]) {
      if (messageText === TEACHER_PASSWORD) {
          user.role = 'teacher';
          await saveUser(user);
          delete pendingTeacherLogin[userId];
          await reply(replyToken, '✅ 老師身份驗證成功！已切換到老師模式。', teacherMenu);
      } else {
          await reply(replyToken, '❌ 老師密碼錯誤，請重新輸入。');
      }
      return;
  }

  // 根據用戶身份處理指令
  if (user.role === 'teacher') {
    const handledByTeacher = await handleTeacherCommands(event, user);
    if (handledByTeacher) {
      return; // 老師指令已處理
    }
  }

  // 購點流程獨立處理，因為學員和老師都可能用到 (例如老師幫學員手動調整點數後，學員仍需知道購點流程)
  const handledByPurchase = await handlePurchaseFlow(event, user);
  if (handledByPurchase) {
    return; // 購點流程已處理
  }

  // 最後處理學員指令 (如果不是老師，也不是購點流程)
  const handledByStudent = await handleStudentCommands(event, user);
  if (handledByStudent) {
    return; // 學員指令已處理
  }

  // 如果以上指令都未匹配到，給予預設回覆
  if (event.type === 'message' && event.message.type === 'text') {
      let defaultMenu = studentMenu; // 預設學員菜單
      if (userId === TEACHER_ID && user.role === 'teacher') {
          defaultMenu = teacherMenu; // 如果是老師身份，顯示老師菜單
      }
      await reply(replyToken, '抱歉，我不明白您的指令。請使用下方選單或輸入正確指令。', defaultMenu);
  }
}

// =====================================
//           伺服器啟動
// =====================================
// 將 handleEvent 函數以及資料庫互動函數傳遞給 infraModule 進行初始化
// infraModule 的 init 函數現在需要這些函數來執行其內部邏輯 (例如定時提醒)
infraModule.init(PORT, handleEvent, getAllCourses, getUser);
