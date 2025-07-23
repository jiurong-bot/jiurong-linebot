// index.js - V4.2.1 a(修正因前次回覆不完整導致的語法錯誤，並整合 Flex Message 取消課程流程優化)

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Client } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

// =====================================
//               應用程式常數
// =====================================
const app = express();
const PORT = process.env.PORT || 3000;

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// 資料庫連接設定
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 設定與密碼
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '9527';
const SELF_URL = process.env.SELF_URL || 'https://你的部署網址/';
const TEACHER_ID = process.env.TEACHER_ID;

// 時間相關常數
const ONE_DAY_IN_MS = 86400000;
const EIGHT_HOURS_IN_MS = 28800000;
const ONE_HOUR_IN_MS = 3600000;
const PING_INTERVAL_MS = ONE_DAY_IN_MS; // 定時 ping 自己以保持服務活躍
const REMINDER_CHECK_INTERVAL_MS = ONE_HOUR_IN_MS; // 每小時檢查一次提醒

// 點數購買方案
const PURCHASE_PLANS = [
  { points: 10, amount: 1000 },
  { points: 20, amount: 1800 },
  { points: 50, amount: 4000 },
];

// 銀行資訊
const BANK_INFO = {
  name: '玉山銀行',
  account: '0000-000-0000000000',
  branch: '龍潭分行',
  accountName: '九容瑜伽'
};

// 全域指令
const COMMANDS = {
  // 學生指令
  STUDENT_POINTS_MENU: '@點數',
  STUDENT_CHECK_POINTS: '@剩餘點數',
  STUDENT_BUY_POINTS: '@購買點數',
  STUDENT_PURCHASE_HISTORY: '@購買紀錄',
  STUDENT_BOOK_COURSE: '@預約課程',
  STUDENT_MY_COURSES: '@我的課程',
  STUDENT_CANCEL_BOOKING_PREFIX: '取消預約_',
  STUDENT_CANCEL_WAITING_PREFIX: '取消候補_',
  STUDENT_SUBMIT_BANK_INFO_PREFIX: '已匯款_',
  STUDENT_CANCEL_PURCHASE: '❌ 取消購買',

  // 老師指令
  TEACHER_LOGIN: '@登入',
  TEACHER_LOGOUT: '@登出',
  TEACHER_COURSE_MANAGEMENT: '@課程管理', // 修改為直接顯示列表
  TEACHER_ADD_COURSE: '@新增課程',
  TEACHER_CANCEL_COURSE_PREFIX: '刪除課程_', // 新增前綴，直接刪除
  TEACHER_POINT_MANAGEMENT: '@點數管理',
  TEACHER_CHECK_STUDENT: '@查學員',
  TEACHER_REPORT: '@統計報表',
  TEACHER_PENDING_ORDERS: '@待確認清單',
  TEACHER_CONFIRM_ORDER_PREFIX: '確認_',
  TEACHER_REJECT_ORDER_PREFIX: '駁回_',
  TEACHER_MANUAL_ADJUST_POINTS: '@手動調整點數',
  TEACHER_MANUAL_ADJUST_POINTS_PREFIX: '手動調整_', // 格式：手動調整_使用者ID_點數變動值
  TEACHER_MANUAL_ADJUST_POINTS_COMPLETE: '完成手動調整',
};

// 狀態管理物件
const pendingTeacherLogin = {};
const pendingCourseCreation = {}; // { userId: { step: 1, data: {} } }
const pendingPurchase = {}; // { userId: { order_id: 'xxxx', points: 10, amount: 1000, plan: '...', status: 'pending_payment' } }
const pendingManualAdjust = {}; // { userId: { step: 1, targetUserId: null, points: null } }
const sentReminders = {}; // { courseId: { studentId: true } } 記錄已發送提醒的課程和學生

// =====================================
//             資料庫操作函式
// =====================================

async function ensureTablesExist() {
  try {
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        points INTEGER DEFAULT 0,
        role VARCHAR(50) DEFAULT 'student',
        history JSONB DEFAULT '[]'::jsonb
      );
    `);
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        time TIMESTAMP WITH TIME ZONE NOT NULL,
        capacity INTEGER NOT NULL,
        points_cost INTEGER NOT NULL,
        students JSONB DEFAULT '[]'::jsonb,
        waiting JSONB DEFAULT '[]'::jsonb
      );
    `);
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        points INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        last_5_digits VARCHAR(5) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'pending_payment',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ 資料表檢查完畢，必要時已建立。');
  } catch (error) {
    console.error('❌ 確保資料表存在時發生錯誤:', error);
  }
}

async function getUser(userId) {
  const res = await pgClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  return res.rows[0];
}

async function saveUser(user) {
  const { id, name, points, role, history } = user;
  const res = await pgClient.query(
    'INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, points = EXCLUDED.points, role = EXCLUDED.role, history = EXCLUDED.history RETURNING *',
    [id, name, points, role, JSON.stringify(history)]
  );
  return res.rows[0];
}

async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses ORDER BY time ASC');
  return res.rows;
}

async function getCourseById(courseId) {
  const res = await pgClient.query('SELECT * FROM courses WHERE id = $1', [courseId]);
  return res.rows[0];
}

async function saveCourse(course) {
  const { id, title, time, capacity, points_cost, students, waiting } = course;
  const res = await pgClient.query(
    'INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, time = EXCLUDED.time, capacity = EXCLUDED.capacity, points_cost = EXCLUDED.points_cost, students = EXCLUDED.students, waiting = EXCLUDED.waiting RETURNING *',
    [id, title, time, capacity, points_cost, JSON.stringify(students), JSON.stringify(waiting)]
  );
  return res.rows[0];
}

async function deleteCourse(courseId) {
  try {
    const res = await pgClient.query('DELETE FROM courses WHERE id = $1 RETURNING *', [courseId]);
    return res.rows.length > 0;
  } catch (error) {
    console.error(`❌ 刪除課程 ${courseId} 時發生錯誤:`, error);
    return false;
  }
}

async function getAllOrders() {
  const res = await pgClient.query('SELECT * FROM orders ORDER BY timestamp DESC');
  return res.rows;
}

async function getOrderById(orderId) {
  const res = await pgClient.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  return res.rows[0];
}

async function saveOrder(order) {
  const { order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp } = order;
  const res = await pgClient.query(
    'INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (order_id) DO UPDATE SET last_5_digits = EXCLUDED.last_5_digits, status = EXCLUDED.status RETURNING *',
    [order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp]
  );
  return res.rows[0];
}

async function deleteOrder(orderId) {
  try {
    const res = await pgClient.query('DELETE FROM orders WHERE order_id = $1 RETURNING *', [orderId]);
    return res.rows.length > 0;
  } catch (error) {
    console.error(`❌ 刪除訂單 ${orderId} 時發生錯誤:`, error);
    return false;
  }
}

async function cleanCoursesDB() {
  const now = new Date();
  // 找出所有時間已過的課程
  const res = await pgClient.query('SELECT id, students, waiting FROM courses WHERE time < $1', [now]);
  const expiredCourses = res.rows;

  for (const course of expiredCourses) {
    // 檢查是否有學生或候補者，如果沒有，就直接刪除
    if (course.students.length === 0 && course.waiting.length === 0) {
      await deleteCourse(course.id);
      console.log(`🧹 已清理過期且無人報名/候補的課程: ${course.id}`);
    } else {
      // 如果有學生或候補者，則只將其標記為已結束或其他狀態 (此處為直接刪除)
      // 在實際應用中，可能會保留已結束課程的記錄，但不再顯示
      // 為了簡化，這裡仍然直接刪除
      await deleteCourse(course.id);
      console.log(`🧹 已清理過期課程: ${course.id} (含學生/候補者記錄，已移除)`);
    }
  }
}


// =====================================
//             輔助函式
// =====================================

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const options = {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'Asia/Taipei'
  };
  return new Intl.DateTimeFormat('zh-TW', options).format(date);
}

function generateRandomId(prefix = '') {
  return prefix + Math.random().toString(36).substr(2, 9);
}

// 建立課程 Flex Message 氣泡
function createCourseBubble(course) {
  const dateTime = formatDateTime(course.time);
  const studentCount = course.students ? course.students.length : 0;
  const waitingCount = course.waiting ? course.waiting.length : 0;
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `課程：${course.title}`,
          weight: 'bold',
          size: 'md',
          wrap: true,
        },
        {
          type: 'text',
          text: `時間：${dateTime}`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
          wrap: true,
        },
        {
          type: 'text',
          text: `費用：${course.points_cost} 點`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `報名人數：${studentCount}/${course.capacity}`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `候補人數：${waitingCount}`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          action: {
            type: 'message',
            label: '刪除課程',
            text: `${COMMANDS.TEACHER_CANCEL_COURSE_PREFIX}${course.id}`,
          },
        },
      ],
    },
  };
}

// 建立新增課程 Flex Message 氣泡 (固定在最右邊)
function createAddCourseBubble() {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'icon',
          url: 'https://scdn.line-apps.com/n/channel_icon/1647466547/icon_green.png', // Line官方提供的綠色加號圖標
          size: 'xxl',
          align: 'center',
          margin: 'xl',
        },
        {
          type: 'text',
          text: '新增課程',
          weight: 'bold',
          size: 'xl',
          align: 'center',
          margin: 'lg',
          color: '#2b7f38', // 綠色文字
        },
      ],
      action: {
        type: 'message',
        label: '新增課程',
        text: COMMANDS.TEACHER_ADD_COURSE,
      },
    },
    styles: {
      body: {
        backgroundColor: '#e6ffe6', // 淺綠色背景
      },
    },
  };
}


// =====================================
//             LINE Bot 事件處理
// =====================================

async function reply(replyToken, content, menu = null) {
  let messages = Array.isArray(content) ? content : [content];

  // 如果有快速回覆選單，只對第一個訊息附加
  if (menu && messages.length > 0) {
    messages[0].quickReply = {
      items: menu.map(item => ({
        type: 'action',
        action: {
          type: 'message',
          label: item.label,
          text: item.text,
        },
      })),
    };
  }
  return client.replyMessage(replyToken, messages);
}

async function push(to, content) {
  return client.pushMessage(to, content);
}


// 處理老師指令
async function handleTeacherCommands(replyToken, userId, text) {
  const user = await getUser(userId);
  if (!user || user.role !== 'teacher') {
    await reply(replyToken, '您沒有權限執行此操作。');
    return;
  }

  // 檢查是否正在進行多步驟流程
  if (pendingCourseCreation[userId]) {
    return handleCourseCreationFlow(replyToken, userId, text);
  }
  if (pendingManualAdjust[userId]) {
    return handleManualAdjustFlow(replyToken, userId, text);
  }

  // 處理手動調整點數的完成指令
  if (text === COMMANDS.TEACHER_MANUAL_ADJUST_POINTS_COMPLETE) {
    delete pendingManualAdjust[userId];
    await reply(replyToken, '✅ 手動調整點數流程已完成。');
    return;
  }

  switch (text) {
    case COMMANDS.TEACHER_COURSE_MANAGEMENT:
      const allCourses = await getAllCourses();
      const now = new Date();
      // 過濾出時間在現在之後的課程
      const futureCourses = allCourses.filter(course => new Date(course.time) > now);

      const courseBubbles = futureCourses.map(course => createCourseBubble(course));
      const addCourseBubble = createAddCourseBubble();

      const carouselContents = [...courseBubbles, addCourseBubble];

      if (carouselContents.length === 0) {
        // 如果沒有課程，顯示一個只有新增課程的氣泡
        await reply(replyToken, {
          type: 'flex',
          altText: '課程列表與管理',
          contents: {
            type: 'carousel',
            contents: [createAddCourseBubble()],
          },
        });
      } else {
        await reply(replyToken, {
          type: 'flex',
          altText: '課程列表與管理',
          contents: {
            type: 'carousel',
            contents: carouselContents,
          },
        });
      }
      break;

    case COMMANDS.TEACHER_ADD_COURSE:
      pendingCourseCreation[userId] = { step: 1, data: {} };
      await reply(replyToken, '請輸入課程名稱（例如：哈達瑜伽）：');
      break;

    case COMMANDS.TEACHER_POINT_MANAGEMENT:
      await reply(replyToken, {
        type: 'flex',
        altText: '點數管理',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '點數管理',
                weight: 'bold',
                size: 'xl',
              },
              {
                type: 'button',
                style: 'link',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '待確認訂單',
                  text: COMMANDS.TEACHER_PENDING_ORDERS,
                },
              },
              {
                type: 'button',
                style: 'link',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '手動調整點數',
                  text: COMMANDS.TEACHER_MANUAL_ADJUST_POINTS,
                },
              },
            ],
          },
        },
      });
      break;

    case COMMANDS.TEACHER_PENDING_ORDERS:
      const pendingOrders = await getAllOrders();
      const unconfirmedOrders = pendingOrders.filter(order => order.status === 'pending_payment');

      if (unconfirmedOrders.length === 0) {
        await reply(replyToken, '目前沒有待確認的點數訂單。');
        return;
      }

      const orderMessages = unconfirmedOrders.map(order => ({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: `訂單ID: ${order.order_id}`, weight: 'bold' },
            { type: 'text', text: `學員: ${order.user_name} (ID: ${order.user_id})` },
            { type: 'text', text: `購買點數: ${order.points} 點` },
            { type: 'text', text: `金額: $${order.amount}` },
            { type: 'text', text: `匯款後五碼: ${order.last_5_digits || '未提供'}` },
            { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}` },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'message',
                label: '確認入帳',
                text: `${COMMANDS.TEACHER_CONFIRM_ORDER_PREFIX}${order.order_id}`,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'message',
                label: '駁回訂單',
                text: `${COMMANDS.TEACHER_REJECT_ORDER_PREFIX}${order.order_id}`,
              },
            },
          ],
        },
      }));

      await reply(replyToken, {
        type: 'flex',
        altText: '待確認點數訂單',
        contents: {
          type: 'carousel',
          contents: orderMessages,
        },
      });
      break;

    case COMMANDS.TEACHER_MANUAL_ADJUST_POINTS:
      pendingManualAdjust[userId] = { step: 1 };
      await reply(replyToken, '請輸入要調整點數的學員 ID 或名稱。');
      break;

    case COMMANDS.TEACHER_REPORT:
      const allUsers = await pgClient.query('SELECT id, name, points FROM users WHERE role = $1', ['student']);
      const studentCount = allUsers.rows.length;
      const totalPoints = allUsers.rows.reduce((sum, user) => sum + user.points, 0);

      const allRegisteredCourses = await getAllCourses();
      const totalCapacity = allRegisteredCourses.reduce((sum, course) => sum + course.capacity, 0);
      const totalBookedStudents = allRegisteredCourses.reduce((sum, course) => sum + (course.students ? course.students.length : 0), 0);

      const completedOrders = await pgClient.query('SELECT SUM(amount) AS total_income FROM orders WHERE status = $1', ['completed']);
      const totalIncome = completedOrders.rows[0].total_income || 0;

      const reportMessage = `
      【九容瑜伽營運報表】
      🧘‍ 學員總數：${studentCount} 人
      💰 學員總點數：${totalPoints} 點

      🗓️ 課程總覽：
      已安排課程數：${allRegisteredCourses.length} 堂
      總容納人數：${totalCapacity} 人
      總預約人數：${totalBookedStudents} 人

      💸 財務總覽：
      已確認總收入：$${totalIncome}
      `;
      await reply(replyToken, reportMessage);
      break;

    case COMMANDS.TEACHER_CHECK_STUDENT:
      await reply(replyToken, '請輸入學員的 LINE ID 或名稱以查詢。格式：@查學員 [ID或姓名]');
      break;

    default:
      if (text.startsWith(COMMANDS.TEACHER_CHECK_STUDENT + ' ')) {
        const query = text.substring((COMMANDS.TEACHER_CHECK_STUDENT + ' ').length).trim();
        if (!query) {
          await reply(replyToken, '請提供有效的學員 ID 或名稱。');
          return;
        }
        let targetUser = await getUser(query); // 嘗試以 ID 查詢
        if (!targetUser) {
          const res = await pgClient.query('SELECT * FROM users WHERE name ILIKE $1 AND role = $2', [`%${query}%`, 'student']);
          if (res.rows.length > 0) {
            if (res.rows.length === 1) {
              targetUser = res.rows[0];
            } else {
              // 如果找到多個，要求更精確的輸入
              const names = res.rows.map(u => u.name).join('、');
              await reply(replyToken, `找到多個符合的學員（${names}），請提供更精確的 ID 或全名。`);
              return;
            }
          }
        }

        if (targetUser) {
          const historyText = targetUser.history.map(item => `- ${formatDateTime(item.timestamp)}: ${item.description}`).join('\n');
          const studentBubble = {
            type: 'bubble',
            body: {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'text', text: '學員資料', weight: 'bold', size: 'xl' },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: `姓名: ${targetUser.name}` },
                { type: 'text', text: `ID: ${targetUser.id}` },
                { type: 'text', text: `點數: ${targetUser.points} 點` },
                { type: 'separator', margin: 'md' },
                { type: 'text', text: '近期活動記錄:', weight: 'bold' },
                { type: 'text', text: historyText || '無記錄', size: 'sm', wrap: true },
              ],
            },
          };
          await reply(replyToken, { type: 'flex', altText: `${targetUser.name} 的資料`, contents: studentBubble });
        } else {
          await reply(replyToken, '找不到該學員。');
        }
      } else if (text.startsWith(COMMANDS.TEACHER_CONFIRM_ORDER_PREFIX)) {
        const orderId = text.substring(COMMANDS.TEACHER_CONFIRM_ORDER_PREFIX.length);
        const order = await getOrderById(orderId);
        if (order && order.status === 'pending_payment') {
          order.status = 'completed';
          await saveOrder(order);

          const userToUpdate = await getUser(order.user_id);
          if (userToUpdate) {
            userToUpdate.points += order.points;
            userToUpdate.history.push({
              timestamp: new Date().toISOString(),
              description: `購買點數 ${order.points} 點 (訂單ID: ${order.order_id})`
            });
            await saveUser(userToUpdate);
            await reply(replyToken, `✅ 訂單 ${orderId} 已確認入帳，並已為學員 ${userToUpdate.name} 增加 ${order.points} 點。`);
            await push(order.user_id, `✅ 您的點數訂單 ${order.order_id} (購買 ${order.points} 點) 已由老師確認入帳。目前點數: ${userToUpdate.points}。`);
          } else {
            await reply(replyToken, `✅ 訂單 ${orderId} 已確認，但找不到學員資料。請手動處理學員點數。`);
          }
        } else {
          await reply(replyToken, `❌ 訂單 ${orderId} 無法確認或已處理。`);
        }
      } else if (text.startsWith(COMMANDS.TEACHER_REJECT_ORDER_PREFIX)) {
        const orderId = text.substring(COMMANDS.TEACHER_REJECT_ORDER_PREFIX.length);
        const order = await getOrderById(orderId);
        if (order && order.status === 'pending_payment') {
          order.status = 'rejected';
          await saveOrder(order);
          await reply(replyToken, `✅ 訂單 ${orderId} 已駁回。`);
          await push(order.user_id, `❌ 您的點數訂單 ${order.order_id} (購買 ${order.points} 點) 已被老師駁回。如有疑問請聯絡老師。`);
        } else {
          await reply(replyToken, `❌ 訂單 ${orderId} 無法駁回或已處理。`);
        }
      } else if (text.startsWith(COMMANDS.TEACHER_CANCEL_COURSE_PREFIX)) {
        const courseIdToCancel = text.substring(COMMANDS.TEACHER_CANCEL_COURSE_PREFIX.length);
        const deleted = await deleteCourse(courseIdToCancel);
        if (deleted) {
          await reply(replyToken, `✅ 課程 ${courseIdToCancel} 已成功刪除。`);
        } else {
          await reply(replyToken, `❌ 刪除課程 ${courseIdToCancel} 失敗，可能課程不存在或已結束。`);
        }
      } else {
        await reply(replyToken, '老師您好，我無法理解您的指令。請使用預設指令或選單。');
      }
      break;
  }
}

// 處理學生指令
async function handleStudentCommands(replyToken, userId, text) {
  const user = await getUser(userId);
  if (!user || user.role !== 'student') {
    await reply(replyToken, '您沒有權限執行此操作。');
    return;
  }

  // 檢查是否有待處理的購點流程
  if (pendingPurchase[userId]) {
    const currentOrder = pendingPurchase[userId];
    if (text === COMMANDS.STUDENT_CANCEL_PURCHASE) {
      // 學員取消購點流程
      await deleteOrder(currentOrder.order_id);
      delete pendingPurchase[userId];
      await reply(replyToken, '✅ 點數購買流程已取消。');
      return;
    } else if (text.startsWith(COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX)) {
      const last5Digits = text.substring(COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX.length).trim();
      if (last5Digits.length === 5 && /^\d+$/.test(last5Digits)) {
        currentOrder.last_5_digits = last5Digits;
        currentOrder.status = 'pending_confirmation';
        await saveOrder(currentOrder);
        delete pendingPurchase[userId];
        await reply(replyToken, '✅ 匯款資訊已提交，老師將盡快為您確認。', [
          { label: COMMANDS.STUDENT_CHECK_POINTS, text: COMMANDS.STUDENT_CHECK_POINTS },
          { label: COMMANDS.STUDENT_PURCHASE_HISTORY, text: COMMANDS.STUDENT_PURCHASE_HISTORY },
        ]);
        await push(TEACHER_ID, `🔔 新的點數訂單通知：學員 ${user.name} (ID: ${user.id}) 購買了 ${currentOrder.points} 點 (金額 $${currentOrder.amount})，匯款後五碼: ${last5Digits}。請前往後台確認。`);
      } else {
        await reply(replyToken, '❌ 匯款後五碼格式不正確，請輸入五位數字。');
      }
      return;
    }
  }

  switch (text) {
    case COMMANDS.STUDENT_POINTS_MENU:
      await reply(replyToken, '請選擇點數相關功能：', [
        { label: COMMANDS.STUDENT_CHECK_POINTS, text: COMMANDS.STUDENT_CHECK_POINTS },
        { label: COMMANDS.STUDENT_BUY_POINTS, text: COMMANDS.STUDENT_BUY_POINTS },
        { label: COMMANDS.STUDENT_PURCHASE_HISTORY, text: COMMANDS.STUDENT_PURCHASE_HISTORY },
      ]);
      break;

    case COMMANDS.STUDENT_CHECK_POINTS:
      const currentUser = await getUser(userId);
      const pointsBubble = {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: '您的點數餘額', weight: 'bold', size: 'xl' },
            { type: 'text', text: `${currentUser.points} 點`, size: 'xxl', align: 'center', margin: 'lg', weight: 'bold', color: '#008c4e' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'message',
                label: '購買點數方案',
                text: COMMANDS.STUDENT_BUY_POINTS,
              },
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'message',
                label: '近期交易紀錄',
                text: COMMANDS.STUDENT_PURCHASE_HISTORY,
              },
            },
          ],
        },
      };
      await reply(replyToken, { type: 'flex', altText: '您的點數餘額', contents: pointsBubble });
      break;

    case COMMANDS.STUDENT_BUY_POINTS:
      const existingPendingOrder = (await getAllOrders()).find(o => o.user_id === userId && o.status === 'pending_payment');
      if (existingPendingOrder) {
        await reply(replyToken, `您有一筆待處理的點數訂單 (${existingPendingOrder.points} 點，金額 $${existingPendingOrder.amount})。請完成匯款並輸入後五碼：\n${BANK_INFO.name} (${BANK_INFO.branch}) 帳號：${BANK_INFO.account} 戶名：${BANK_INFO.accountName}\n\n格式：${COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX}[後五碼]\n例如：${COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX}12345`, [
          { label: COMMANDS.STUDENT_CANCEL_PURCHASE, text: COMMANDS.STUDENT_CANCEL_PURCHASE },
        ]);
        pendingPurchase[userId] = existingPendingOrder; // 恢復此訂單的狀態
        return;
      }

      const purchaseBubbles = PURCHASE_PLANS.map(plan => ({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: `${plan.points} 點方案`, weight: 'bold', size: 'xl' },
            { type: 'text', text: `價格: $${plan.amount}`, size: 'lg', align: 'center', margin: 'md' },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'message',
                label: `購買 ${plan.points} 點`,
                text: `購買方案_${plan.points}_${plan.amount}`, // 內部指令
              },
            },
          ],
        },
      }));

      await reply(replyToken, {
        type: 'flex',
        altText: '選擇點數方案',
        contents: {
          type: 'carousel',
          contents: purchaseBubbles,
        },
      });
      break;

    case COMMANDS.STUDENT_PURCHASE_HISTORY:
      const userOrders = (await getAllOrders()).filter(order => order.user_id === userId);
      if (userOrders.length === 0) {
        await reply(replyToken, '您目前沒有點數購買記錄。');
        return;
      }

      const historyBubbles = userOrders.map(order => ({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: `訂單ID: ${order.order_id}`, weight: 'bold', size: 'md' },
            { type: 'text', text: `點數: ${order.points} 點`, size: 'sm' },
            { type: 'text', text: `金額: $${order.amount}`, size: 'sm' },
            { type: 'text', text: `狀態: ${order.status}`, size: 'sm', color: order.status === 'completed' ? '#008c4e' : '#FF6600' },
            { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'sm' },
            order.last_5_digits ? { type: 'text', text: `匯款後五碼: ${order.last_5_digits}`, size: 'sm' } : null,
          ].filter(Boolean), // 移除null元素
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            order.status === 'pending_payment' ? {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'message',
                label: '我已匯款 (請輸入後五碼)',
                text: `${COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX}`,
              },
            } : null,
            order.status === 'pending_payment' ? {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'message',
                label: '取消此訂單',
                text: COMMANDS.STUDENT_CANCEL_PURCHASE, // 重新使用取消購點指令
              },
            } : null,
          ].filter(Boolean),
        },
      }));

      await reply(replyToken, {
        type: 'flex',
        altText: '您的點數購買記錄',
        contents: {
          type: 'carousel',
          contents: historyBubbles,
        },
      });
      break;

    case COMMANDS.STUDENT_BOOK_COURSE:
      const availableCourses = (await getAllCourses()).filter(course => {
        const courseTime = new Date(course.time);
        return courseTime > new Date() && course.students.length < course.capacity;
      });

      if (availableCourses.length === 0) {
        await reply(replyToken, '目前沒有可預約的課程。');
        return;
      }

      const courseOptions = availableCourses.map(course => ({
        label: `${course.title} (${formatDateTime(course.time)}) - ${course.points_cost} 點`,
        text: `預約_${course.id}`
      }));

      await reply(replyToken, '請選擇要預約的課程：', courseOptions);
      break;

    case COMMANDS.STUDENT_MY_COURSES:
      const userBookings = (await getAllCourses()).filter(course =>
        course.students.includes(userId) || course.waiting.includes(userId)
      );

      if (userBookings.length === 0) {
        await reply(replyToken, '您目前沒有預約或候補的課程。');
        return;
      }

      const bookingMessages = userBookings.map(course => {
        const isStudent = course.students.includes(userId);
        const isWaiting = course.waiting.includes(userId);
        const status = isStudent ? '已報名' : (isWaiting ? '候補中' : '');
        const actionLabel = isStudent ? '取消預約' : '取消候補';
        const actionText = isStudent ? `${COMMANDS.STUDENT_CANCEL_BOOKING_PREFIX}${course.id}` : `${COMMANDS.STUDENT_CANCEL_WAITING_PREFIX}${course.id}`;

        return {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: `課程：${course.title}`, weight: 'bold' },
              { type: 'text', text: `時間：${formatDateTime(course.time)}` },
              { type: 'text', text: `狀態：${status}`, color: isStudent ? '#008c4e' : '#FF6600' },
            ],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'message',
                  label: actionLabel,
                  text: actionText,
                },
              },
            ],
          },
        };
      });

      await reply(replyToken, {
        type: 'flex',
        altText: '您的課程',
        contents: {
          type: 'carousel',
          contents: bookingMessages,
        },
      });
      break;


    default:
      if (text.startsWith('購買方案_')) {
        const parts = text.split('_');
        if (parts.length === 3) {
          const points = parseInt(parts[1]);
          const amount = parseInt(parts[2]);
          const orderId = generateRandomId('ORD');
          const timestamp = new Date().toISOString();

          // 創建待處理訂單
          const newOrder = {
            order_id: orderId,
            user_id: userId,
            user_name: user.name,
            points,
            amount,
            status: 'pending_payment',
            timestamp,
            last_5_digits: null // 預設為 null
          };
          await saveOrder(newOrder);
          pendingPurchase[userId] = newOrder;

          await reply(replyToken, `您已選擇購買 ${points} 點，金額為 $${amount}。請將款項匯至以下帳戶，並回覆匯款帳號後五碼：\n\n銀行：${BANK_INFO.name}\n分行：${BANK_INFO.branch}\n帳號：${BANK_INFO.account}\n戶名：${BANK_INFO.accountName}\n\n格式：${COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX}[後五碼]\n例如：${COMMANDS.STUDENT_SUBMIT_BANK_INFO_PREFIX}12345`, [
            { label: COMMANDS.STUDENT_CANCEL_PURCHASE, text: COMMANDS.STUDENT_CANCEL_PURCHASE },
          ]);
        } else {
          await reply(replyToken, '❌ 購買方案指令格式錯誤。');
        }
      } else if (text.startsWith('預約_')) {
        const courseId = text.substring('預約_'.length);
        const course = await getCourseById(courseId);
        const currentUser = await getUser(userId);

        if (!course) {
          await reply(replyToken, '❌ 課程不存在。');
          return;
        }
        if (new Date(course.time) < new Date()) {
          await reply(replyToken, '❌ 該課程已結束，無法預約。');
          return;
        }
        if (currentUser.points < course.points_cost) {
          await reply(replyToken, `❌ 您的點數不足。此課程需要 ${course.points_cost} 點，您目前有 ${currentUser.points} 點。`);
          return;
        }
        if (course.students.includes(userId)) {
          await reply(replyToken, '您已報名此課程。');
          return;
        }
        if (course.waiting.includes(userId)) {
          await reply(replyToken, '您已候補此課程。');
          return;
        }

        if (course.students.length < course.capacity) {
          // 直接報名
          course.students.push(userId);
          currentUser.points -= course.points_cost;
          currentUser.history.push({
            timestamp: new Date().toISOString(),
            description: `報名課程《${course.title}》(${formatDateTime(course.time)}) 扣除 ${course.points_cost} 點`
          });
          await saveCourse(course);
          await saveUser(currentUser);
          await reply(replyToken, `✅ 恭喜您成功報名《${course.title}》！您的剩餘點數：${currentUser.points} 點。`, [
            { label: COMMANDS.STUDENT_MY_COURSES, text: COMMANDS.STUDENT_MY_COURSES },
          ]);
        } else {
          // 加入候補
          course.waiting.push(userId);
          await saveCourse(course);
          await reply(replyToken, `✅《${course.title}》已額滿，您已成功加入候補名單。若有空位將會通知您。`, [
            { label: COMMANDS.STUDENT_MY_COURSES, text: COMMANDS.STUDENT_MY_COURSES },
          ]);
        }
      } else if (text.startsWith(COMMANDS.STUDENT_CANCEL_BOOKING_PREFIX)) {
        const courseId = text.substring(COMMANDS.STUDENT_CANCEL_BOOKING_PREFIX.length);
        const course = await getCourseById(courseId);
        const currentUser = await getUser(userId);

        if (!course) {
          await reply(replyToken, '❌ 課程不存在。');
          return;
        }
        if (!course.students.includes(userId)) {
          await reply(replyToken, '您沒有報名此課程。');
          return;
        }

        course.students = course.students.filter(id => id !== userId);
        currentUser.points += course.points_cost;
        currentUser.history.push({
          timestamp: new Date().toISOString(),
          description: `取消報名課程《${course.title}》(${formatDateTime(course.time)}) 退回 ${course.points_cost} 點`
        });

        // 處理候補名單
        if (course.waiting.length > 0) {
          const nextWaitingStudentId = course.waiting.shift(); // 移除第一個候補者
          course.students.push(nextWaitingStudentId); // 將其加入學生名單

          // 通知候補成功的學生
          await push(nextWaitingStudentId, `🔔 好消息！《${course.title}》(${formatDateTime(course.time)}) 有空位了，您已成功從候補轉為報名。請準時上課！`);
          // 通知被取消的學生
          await reply(replyToken, `✅ 已取消《${course.title}》的報名。已退回 ${course.points_cost} 點。`);
          // 更新資料庫
          await saveCourse(course);
          await saveUser(currentUser);
        } else {
          await saveCourse(course);
          await saveUser(currentUser);
          await reply(replyToken, `✅ 已取消《${course.title}》的報名。已退回 ${course.points_cost} 點。`);
        }
      } else if (text.startsWith(COMMANDS.STUDENT_CANCEL_WAITING_PREFIX)) {
        const courseId = text.substring(COMMANDS.STUDENT_CANCEL_WAITING_PREFIX.length);
        const course = await getCourseById(courseId);
        const currentUser = await getUser(userId);

        if (!course) {
          await reply(replyToken, '❌ 課程不存在。');
          return;
        }
        if (!course.waiting.includes(userId)) {
          await reply(replyToken, '您沒有候補此課程。');
          return;
        }

        course.waiting = course.waiting.filter(id => id !== userId);
        await saveCourse(course);
        await reply(replyToken, `✅ 已取消《${course.title}》的候補。`);
      }
      else {
        await reply(replyToken, '學員您好，我無法理解您的指令。請使用預設指令或選單。');
      }
      break;
  }
}

// 處理課程創建流程
async function handleCourseCreationFlow(replyToken, userId, text) {
  const flow = pendingCourseCreation[userId];
  if (!flow) return;

  switch (flow.step) {
    case 1: // 課程名稱
      flow.data.title = text;
      flow.step = 2;
      await reply(replyToken, '請輸入課程時間（例如：2025/07/25 19:00）：');
      break;
    case 2: // 課程時間
      try {
        const date = new Date(text);
        if (isNaN(date.getTime())) {
          throw new Error('Invalid date');
        }
        flow.data.time = date.toISOString();
        flow.step = 3;
        await reply(replyToken, '請輸入課程容量（例如：10）：');
      } catch (e) {
        await reply(replyToken, '❌ 時間格式不正確，請重新輸入（例如：2025/07/25 19:00）：');
      }
      break;
    case 3: // 課程容量
      const capacity = parseInt(text);
      if (isNaN(capacity) || capacity <= 0) {
        await reply(replyToken, '❌ 容量必須是正整數，請重新輸入：');
        return;
      }
      flow.data.capacity = capacity;
      flow.step = 4;
      await reply(replyToken, '請輸入課程所需點數（例如：1）：');
      break;
    case 4: // 課程點數
      const points_cost = parseInt(text);
      if (isNaN(points_cost) || points_cost <= 0) {
        await reply(replyToken, '❌ 點數必須是正整數，請重新輸入：');
        return;
      }
      flow.data.points_cost = points_cost;
      flow.data.id = generateRandomId('C'); // 自動生成課程ID
      flow.data.students = [];
      flow.data.waiting = [];
      await saveCourse(flow.data);
      delete pendingCourseCreation[userId];
      await reply(replyToken, `✅ 課程《${flow.data.title}》已成功新增！\n時間：${formatDateTime(flow.data.time)}\n容量：${flow.data.capacity} 人\n費用：${flow.data.points_cost} 點`);
      break;
  }
}

// 處理手動調整點數流程
async function handleManualAdjustFlow(replyToken, userId, text) {
  const flow = pendingManualAdjust[userId];
  if (!flow) return;

  switch (flow.step) {
    case 1: // 輸入學員ID或名稱
      let targetUser = await getUser(text); // 嘗試以 ID 查詢
      if (!targetUser) {
        const res = await pgClient.query('SELECT * FROM users WHERE name ILIKE $1 AND role = $2', [`%${text}%`, 'student']);
        if (res.rows.length > 0) {
          if (res.rows.length === 1) {
            targetUser = res.rows[0];
          } else {
            const names = res.rows.map(u => u.name).join('、');
            await reply(replyToken, `找到多個符合的學員（${names}），請提供更精確的 ID 或全名。`);
            return;
          }
        }
      }

      if (targetUser) {
        flow.data = { targetUserId: targetUser.id, targetUserName: targetUser.name, currentPoints: targetUser.points };
        flow.step = 2;
        await reply(replyToken, `您正在為學員 ${targetUser.name} (目前點數: ${targetUser.points}) 調整點數。請輸入調整的點數（正數為增加，負數為減少）。\n\n例如：增加 5 點輸入 "5"；減少 3 點輸入 "-3"。`);
      } else {
        await reply(replyToken, '❌ 找不到該學員。請重新輸入學員 ID 或名稱。');
      }
      break;
    case 2: // 輸入點數變動值
      const pointsChange = parseInt(text);
      if (isNaN(pointsChange)) {
        await reply(replyToken, '❌ 請輸入有效的數字。');
        return;
      }

      const userToAdjust = await getUser(flow.data.targetUserId);
      if (userToAdjust) {
        userToAdjust.points += pointsChange;
        userToAdjust.history.push({
          timestamp: new Date().toISOString(),
          description: `老師手動調整點數 ${pointsChange} 點`
        });
        await saveUser(userToAdjust);
        await reply(replyToken, `✅ 已為學員 ${userToAdjust.name} (ID: ${userToAdjust.id}) 調整點數 ${pointsChange} 點。目前點數: ${userToAdjust.points}。`);
        await push(userToAdjust.id, `🔔 您的點數已被老師手動調整 ${pointsChange} 點。目前點數: ${userToAdjust.points}。`);
        delete pendingManualAdjust[userId]; // 流程完成
        await reply(replyToken, '手動調整已完成。');
      } else {
        await reply(replyToken, '❌ 無法找到目標學員，請重新開始調整流程。');
        delete pendingManualAdjust[userId];
      }
      break;
  }
}

// LINE Webhook 事件處理器
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const { replyToken } = event;
  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // 確保用戶存在於資料庫，如果不存在則創建為學生
  let user = await getUser(userId);
  if (!user) {
    const profile = await client.getProfile(userId);
    user = {
      id: userId,
      name: profile.displayName,
      points: 0,
      role: 'student',
      history: []
    };
    await saveUser(user);
    console.log(`✨ 新用戶加入: ${user.name} (${user.id})`);
  }

  // 處理老師登入/登出
  if (userMessage === COMMANDS.TEACHER_LOGIN) {
    if (user.role === 'teacher') {
      await reply(replyToken, '您已經是老師了。');
    } else {
      pendingTeacherLogin[userId] = true;
      await reply(replyToken, '請輸入老師密碼。');
    }
    return;
  } else if (pendingTeacherLogin[userId]) {
    delete pendingTeacherLogin[userId]; // 清除登入狀態
    if (userMessage === TEACHER_PASSWORD) {
      user.role = 'teacher';
      await saveUser(user);
      await reply(replyToken, '✅ 登入成功！您現在是老師了。');
      if (TEACHER_ID && TEACHER_ID !== userId) {
        // 如果 TEACHER_ID 設定且與當前登入者不同，將其也設定為老師
        const mainTeacher = await getUser(TEACHER_ID);
        if (mainTeacher && mainTeacher.role !== 'teacher') {
          mainTeacher.role = 'teacher';
          await saveUser(mainTeacher);
          console.log(`🔔 主教師ID (${TEACHER_ID}) 已設定為老師。`);
        }
      }
    } else {
      await reply(replyToken, '❌ 密碼錯誤，登入失敗。');
    }
    return;
  } else if (userMessage === COMMANDS.TEACHER_LOGOUT) {
    if (user.role === 'student') {
      await reply(replyToken, '您不是老師。');
    } else {
      user.role = 'student';
      await saveUser(user);
      await reply(replyToken, '✅ 登出成功！您現在是學生了。');
    }
    return;
  }


  if (user.role === 'teacher') {
    return handleTeacherCommands(replyToken, userId, userMessage);
  } else { // student
    return handleStudentCommands(replyToken, userId, userMessage);
  }
}


// =====================================
//                 伺服器設定
// =====================================
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.headers['x-line-signature']) {
      req.rawBody = buf;
    }
  }
}));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const channelSecret = config.channelSecret;
  if (signature && channelSecret) {
    const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');
    if (hash !== signature) {
      console.error('❌ LINE Webhook 簽名驗證失敗。');
      return res.status(401).send('Unauthorized: Invalid signature');
    }
  }

  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V4.2.1`);

  await pgClient.connect();
  await ensureTablesExist();

  // 每24小時清理一次過期課程
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  // 每小時檢查並發送課程提醒
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);

  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    // 啟用自我 ping 機制，防止部署在免費平台因不活躍而休眠
    setInterval(async () => {
      try {
        await fetch(SELF_URL);
        console.log('🔗 已對自身 URL 執行 ping 以保持活躍。');
      } catch (error) {
        console.error('❌ 自我 ping 失敗:', error);
      }
    }, PING_INTERVAL_MS);
  }
});


// 檢查並發送課程提醒
async function checkAndSendReminders() {
  const allCourses = await getAllCourses();
  const now = new Date();

  for (const course of allCourses) {
    const courseTime = new Date(course.time);
    const timeUntilCourse = courseTime.getTime() - now.getTime(); // 距離課程開始的毫秒數

    // 在課程開始前約 8 小時發送提醒
    // (8小時 ~ 8小時又1小時之間發送，避免重複發送)
    if (timeUntilCourse > EIGHT_HOURS_IN_MS && timeUntilCourse <= EIGHT_HOURS_IN_MS + ONE_HOUR_IN_MS) {
      for (const studentId of course.students) {
        // 確保每個學生只收到一次該課程的提醒
        if (!sentReminders[course.id] || !sentReminders[course.id][studentId]) {
          const student = await getUser(studentId);
          if (student) {
            await push(student.id, `🧘‍ 提醒您！您預約的《${course.title}》將在 ${formatDateTime(course.time)} 開始。請準時上課！`);
            sentReminders[course.id] = sentReminders[course.id] || {};
            sentReminders[course.id][studentId] = true;
            console.log(`✅ 已向 ${student.name} 發送課程提醒: ${course.title}`);
          }
        }
      }
    }
  }
}
