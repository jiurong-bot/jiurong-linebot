// index.js - V4.2.1 a(修正因前次回覆不完整導致的語法錯誤，並整合 Flex Message 取消課程流程優化) 

// =====================================
//                 模組載入
// =====================================
const express = require('express');
const { Client } = require('pg');
const line = require('@line/bot-sdk');
require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch'); 

// =====================================
//               應用程式常數
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
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5; 

// 購點方案定義
const PURCHASE_PLANS = [
  { points: 5, amount: 500, label: '5 點 (500元)' },
  { points: 10, amount: 1000, label: '10 點 (1000元)' },
  { points: 20, amount: 2000, label: '20 點 (2000元)' },
  { points: 30, amount: 3000, label: '30 點 (3000元)' },
  { points: 50, amount: 5000, label: '50 點 (5000元)' },
]; 

// 銀行匯款資訊
const BANK_INFO = {
  accountName: '湯心怡',
  bankName: '中國信托（882）',
  accountNumber: '012540278393',
}; 

// 指令常數
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
    POINTS: '@點數',
    CHECK_POINTS: '@剩餘點數',
    BUY_POINTS: '@購買點數',
    PURCHASE_HISTORY: '@購買紀錄',
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
  }
}; 

// =====================================
//        資料庫初始化與工具函式
// =====================================
async function initializeDatabase() {
  try {
    await pgClient.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫'); 

    await pgClient.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255) NOT NULL, points INTEGER DEFAULT 0, role VARCHAR(50) DEFAULT 'student', history JSONB DEFAULT '[]')`);
    console.log('✅ 檢查並建立 users 表完成'); 

    await pgClient.query(`CREATE TABLE IF NOT EXISTS courses (id VARCHAR(255) PRIMARY KEY, title VARCHAR(255) NOT NULL, time TIMESTAMPTZ NOT NULL, capacity INTEGER NOT NULL, points_cost INTEGER NOT NULL, students TEXT[] DEFAULT '{}', waiting TEXT[] DEFAULT '{}')`);
    console.log('✅ 檢查並建立 courses 表完成'); 

    await pgClient.query(`CREATE TABLE IF NOT EXISTS orders (order_id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, user_name VARCHAR(255) NOT NULL, points INTEGER NOT NULL, amount INTEGER NOT NULL, last_5_digits VARCHAR(5), status VARCHAR(50) NOT NULL, timestamp TIMESTAMPTZ NOT NULL)`);
    console.log('✅ 檢查並建立 orders 表完成'); 

    const result = await pgClient.query("SELECT MAX(SUBSTRING(id FROM 2)::INTEGER) AS max_id FROM courses WHERE id LIKE 'C%'");
    let maxId = result.rows[0].max_id || 0;
    global.courseIdCounter = maxId + 1;
    console.log(`ℹ️ 課程 ID 計數器初始化為: ${global.courseIdCounter}`); 

    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。'); 

  } catch (err) {
    console.error('❌ 資料庫初始化失敗:', err.message);
  }
} 

initializeDatabase(); 

async function getUser(userId) {
  const res = await pgClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  const userData = res.rows[0];
  // 處理從資料庫讀取 JSONB 字段時，其內容可能為字串而非物件的情況
  if (userData && typeof userData.history === 'string') {
    try {
      userData.history = JSON.parse(userData.history);
    } catch (e) {
      console.error(`❌ 解析用戶 ${userId} 歷史記錄失敗:`, e.message);
      userData.history = []; // 設置為空數組以防止後續錯誤
    }
  } else if (!userData || !userData.history) { // 如果沒有 history 字段或為 null/undefined
    if (userData) {
      userData.history = []; // 初始化為空數組
    }
  }
  return userData;
}


async function saveUser(user) {
  const existingUser = await getUser(user.id);
  // 確保 history 是陣列，並轉換為 JSON 字串
  const historyJson = JSON.stringify(Array.isArray(user.history) ? user.history : []);
  if (existingUser) {
    await pgClient.query('UPDATE users SET name = $1, points = $2, role = $3, history = $4 WHERE id = $5', [user.name, user.points, user.role, historyJson, user.id]);
  } else {
    await pgClient.query('INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5)', [user.id, user.name, user.points, user.role, historyJson]);
  }
}


async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    courses[row.id] = { id: row.id, title: row.title, time: row.time.toISOString(), capacity: row.capacity, pointsCost: row.points_cost, students: row.students || [], waiting: row.waiting || [] };
  });
  return courses;
} 

async function saveCourse(course) {
  const existingCourse = await pgClient.query('SELECT id FROM courses WHERE id = $1', [course.id]);
  if (existingCourse.rows.length > 0) {
    await pgClient.query('UPDATE courses SET title = $1, time = $2, capacity = $3, points_cost = $4, students = $5, waiting = $6 WHERE id = $7', [course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting, course.id]);
  } else {
    await pgClient.query('INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7)', [course.id, course.title, course.time, course.capacity, course.pointsCost, course.students, course.waiting]);
  }
} 

async function deleteCourse(courseId) {
  await pgClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
} 

async function getAllOrders() {
  const res = await pgClient.query('SELECT * FROM orders');
  const orders = {};
  res.rows.forEach(row => {
    orders[row.order_id] = { orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, status: row.status, timestamp: row.timestamp.toISOString() };
  });
  return orders;
} 

async function saveOrder(order) {
  const existingOrder = await pgClient.query('SELECT order_id FROM orders WHERE order_id = $1', [order.orderId]);
  if (existingOrder.rows.length > 0) {
    await pgClient.query('UPDATE orders SET user_id = $1, user_name = $2, points = $3, amount = $4, last_5_digits = $5, status = $6, timestamp = $7 WHERE order_id = $8', [order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp, order.orderId]);
  } else {
    await pgClient.query('INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]);
  }
} 

async function deleteOrder(orderId) {
  await pgClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
} 

async function cleanCoursesDB() {
  const now = Date.now();
  await pgClient.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
  console.log('✅ 已清理過期課程。');
} 

async function reply(replyToken, content, menu = null) {
  let messages;
  if (Array.isArray(content)) {
    messages = content;
  } else if (typeof content === 'string') {
    messages = [{ type: 'text', text: content }];
  } else { // Assuming it's a Flex Message object
    messages = [content];
  } 

  // Quick Reply 只適用於 TextMessage
  if (menu && messages.length > 0 && messages[0].type === 'text') {
    messages[0].quickReply = { items: menu.slice(0, 13).map(i => ({ type: 'action', action: i })) };
  }
  return client.replyMessage(replyToken, messages);
} 

async function push(to, content) {
  const messages = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  return client.pushMessage(to, messages);
} 

function formatDateTime(isoString) {
    if (!isoString) return '無效時間';
    const date = new Date(isoString);
    // Use 'zh-TW' for Taiwan locale and 'Asia/Taipei' for timezone
    const formatter = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
    const parts = formatter.formatToParts(date);
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    let weekday = parts.find(p => p.type === 'weekday').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    // Normalize weekday string, e.g., "週三" instead of "星期三"
    if (weekday.startsWith('週')) {
        weekday = weekday.slice(-1);
    }
    return `${month}-${day}（${weekday}）${hour}:${minute}`;
} 

// =====================================
//               📋 快速選單定義
// =====================================
const studentMenu = [ { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE }, { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES }, { type: 'message', label: '點數功能', text: COMMANDS.STUDENT.POINTS }, { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE }, ];
const studentPointSubMenu = [ { type: 'message', label: '剩餘點數', text: COMMANDS.STUDENT.CHECK_POINTS }, { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS }, { type: 'message', label: '購點紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }, { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }, ];
const teacherCourseSubMenu = [ { type: 'message', label: '課程列表', text: COMMANDS.TEACHER.COURSE_LIST }, { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE }, { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE }, { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }, ];
const teacherPointSubMenu = [ { type: 'message', label: '待確認訂單', text: COMMANDS.TEACHER.PENDING_ORDERS }, { type: 'message', label: '手動加減點', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS }, { type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }, ];
const teacherMenu = [ { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }, { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }, { type: 'message', label: '查詢學員', text: COMMANDS.TEACHER.SEARCH_STUDENT }, { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT }, { type: 'message', label: '切換身份', text: COMMANDS.SWITCH_ROLE }, ]; 

// =====================================
//      📌 暫存狀態物件
// =====================================
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const sentReminders = {}; 

// =====================================
//          👨‍🏫 老師指令處理函式
// =====================================
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : ''; 

  const courses = await getAllCourses(); 

  if (text === COMMANDS.TEACHER.MAIN_MENU) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
  }
  // ✨ MODIFIED: Flex Message Integration - 課程管理主控台
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    const flexMessage = {
        type: 'flex',
        altText: '課程管理中心',
        contents: {
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: '🏢 課程管理中心', weight: 'bold', size: 'lg', color: '#2B7EAF', align: 'center' },
                    { type: 'separator', margin: 'md' },
                    { type: 'box', layout: 'vertical', margin: 'xxl', spacing: 'sm',
                        contents: [
                            { type: 'button', action: { type: 'message', label: '📅 課程列表', text: COMMANDS.TEACHER.COURSE_LIST }, style: 'primary', color: '#00B900' },
                            { type: 'button', action: { type: 'message', label: '➕ 新增課程', text: COMMANDS.TEACHER.ADD_COURSE }, style: 'primary', color: '#FF8C00' },
                            { type: 'button', action: { type: 'message', label: '❌ 取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE }, style: 'primary', color: '#de5246' }
                        ]
                    },
                    { type: 'button', action: { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU }, style: 'secondary', margin: 'md' }
                ]
            }
        }
    };
    return reply(replyToken, flexMessage);
  }
  // ✨ MODIFIED: Flex Message Integration - 點數管理主控台
  if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    const flexMessage = {
        type: 'flex',
        altText: '點數管理中心',
        contents: {
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: '💰 點數管理中心', weight: 'bold', size: 'lg', color: '#2B7EAF', align: 'center' },
                    { type: 'separator', margin: 'md' },
                    { type: 'box', layout: 'vertical', margin: 'xxl', spacing: 'sm',
                        contents: [
                            { type: 'button', action: { type: 'message', label: '📋 待確認訂單', text: COMMANDS.TEACHER.PENDING_ORDERS }, style: 'primary', color: '#FF8C00' },
                            { type: 'button', action: { type: 'message', label: '✍️ 手動調整點數', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS }, style: 'primary', color: '#00B900' }
                        ]
                    },
                    { type: 'button', action: { type: 'message', label: '返回老師主選單', text: COMMANDS.TEACHER.MAIN_MENU }, style: 'secondary', margin: 'md' }
                ]
            }
        }
    };
    return reply(replyToken, flexMessage);
  } 

  if (text === COMMANDS.TEACHER.ADD_COURSE) {
    pendingCourseCreation[userId] = { step: 1, data: {} };
    return reply(replyToken, '請輸入課程名稱：', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
  } 

  // --- 取消課程指令 (使用 Flex Message 的新設計) ---
  if (text === COMMANDS.TEACHER.CANCEL_COURSE) {
    const now = Date.now();
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有可取消的未來課程。', teacherCourseSubMenu);
    } 

    const courseBubbles = upcomingCourses.slice(0, 10).map(course => {
      return {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'text', text: '取消課程選項', color: '#ffffff', weight: 'bold', size: 'md' }],
          backgroundColor: '#ff6B6B', paddingAll: 'lg'
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          contents: [
            { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
            {
              type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
              contents: [
                {
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [
                    { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 },
                  ],
                },
                {
                  type: 'box', layout: 'baseline', spacing: 'sm',
                  contents: [
                    { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: `報名 ${course.students.length}/${course.capacity} (候補 ${course.waiting.length})`, wrap: true, color: '#666666', size: 'sm', flex: 5 },
                  ],
                },
              ],
            },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
          contents: [
            {
              type: 'button', style: 'primary', color: '#de5246', height: 'sm',
              action: {
                type: 'postback',
                label: '取消此課程',
                data: `action=cancel_course_confirm&courseId=${course.id}`,
                displayText: `準備取消課程：${course.title}`
              },
            },
          ],
        },
      };
    }); 

    const flexMessage = {
      type: 'flex',
      altText: '請選擇要取消的課程',
      contents: { type: 'carousel', contents: courseBubbles },
    }; 

    return reply(replyToken, [
        { type: 'text', text: '請滑動下方卡片，選擇您要取消的課程：' },
        flexMessage
    ]);
  } 

  if (text === COMMANDS.TEACHER.COURSE_LIST) {
    const now = Date.now();
    const upcomingCourses = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (upcomingCourses.length === 0) {
      return reply(replyToken, '目前沒有未來的課程。', teacherCourseSubMenu);
    } 

    let replyMessage = '📋 已建立課程列表：\n\n';
    upcomingCourses.forEach(c => {
      replyMessage += `🗓 ${formatDateTime(c.time)}｜${c.title}\n`;
      replyMessage += `💰 扣點：${c.pointsCost} 點｜👥 上限 ${c.capacity}\n`;
      replyMessage += `✅ 已報 ${c.students.length}｜🕓 候補 ${c.waiting.length}\n\n`;
    }); 

    return reply(replyToken, replyMessage.trim(), teacherCourseSubMenu);
  } 

  // ✨ MODIFIED: Flex Message Integration - 查詢學員
  if (text.startsWith(COMMANDS.TEACHER.SEARCH_STUDENT + ' ')) {
    const query = text.replace(COMMANDS.TEACHER.SEARCH_STUDENT + ' ', '').trim();
    if (!query) {
      return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }
    let foundUser = null;
    const userById = await getUser(query);
    if (userById && userById.role === 'student') {
        foundUser = userById;
    }
    if (!foundUser) {
        const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
        if (res.rows.length > 0) {
            // Prefer exact match if any
            foundUser = res.rows.find(u => u.name.toLowerCase() === query.toLowerCase()) || res.rows[0];
        }
    }
    if (!foundUser) {
      return reply(replyToken, `找不到學員「${query}」。`, teacherMenu);
    } 

    const historyItems = (foundUser.history || []).slice(-5).reverse().map(record => ({
        type: 'box', layout: 'horizontal',
        contents: [
            { type: 'text', text: record.action, size: 'sm', color: '#333333', flex: 3, wrap: true },
            { type: 'text', text: formatDateTime(record.time), size: 'sm', color: '#aaaaaa', flex: 2, align: 'end' }
        ]
    })); 

    const flexMessage = {
        type: 'flex',
        altText: `學員 ${foundUser.name} 資料`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: '👤 學員資料', weight: 'bold', size: 'md', color: '#ffffff' },
                    { type: 'text', text: foundUser.name, weight: 'bold', size: 'xl', color: '#ffffff', wrap: true }
                ],
                backgroundColor: '#2B7EAF', paddingAll: 'lg'
            },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'box', layout: 'baseline', spacing: 'sm',
                        contents: [
                            { type: 'text', text: 'LINE ID', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: foundUser.id.substring(0, 8) + '...', wrap: true, color: '#666666', size: 'sm', flex: 5 }
                        ]
                    },
                    { type: 'box', layout: 'baseline', spacing: 'sm',
                        contents: [
                            { type: 'text', text: '剩餘點數', color: '#aaaaaa', size: 'sm', flex: 2 },
                            { type: 'text', text: `${foundUser.points} 點`, wrap: true, color: '#666666', weight: 'bold', size: 'md', flex: 5 }
                        ]
                    },
                    { type: 'separator', margin: 'lg' },
                    { type: 'text', text: '近期活動紀錄：', weight: 'bold', size: 'sm', margin: 'md' },
                    ...(historyItems.length > 0 ? historyItems : [{ type: 'text', text: '無歷史記錄。', size: 'sm', color: '#666666' }])
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    { type: 'button', style: 'primary', height: 'sm',
                        action: {
                            type: 'message',
                            label: '手動調整此學員點數',
                            text: `${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS} ${foundUser.id}` // 帶入學員 ID 簡化操作
                        },
                        color: '#00B900'
                    }
                ]
            }
        }
    };
    return reply(replyToken, flexMessage);
  } 

  if (text === COMMANDS.TEACHER.REPORT) {
    const usersRes = await pgClient.query(`SELECT * FROM users WHERE role = 'student'`);
    const students = usersRes.rows;
    const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
    const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length; 

    const coursesRes = await pgClient.query(`SELECT * FROM courses`);
    const allCourses = coursesRes.rows;
    const totalCourses = allCourses.length;
    const now = Date.now();
    const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
    const completedCourses = totalCourses - upcomingCourses; 

    const ordersRes = await pgClient.query(`SELECT * FROM orders`);
    const allOrders = ordersRes.rows;
    const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
    const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
    const totalRevenue = allOrders
      .filter(o => o.status === 'completed')
      .reduce((sum, order) => sum + order.amount, 0); 

    let report = '📊 營運報告 📊\n\n';
    report += `👤 學員總數：${students.length} 人\n`;
    report += `🟢 活躍學員：${activeStudentsCount} 人\n`;
    report += `💎 所有學員總點數：${totalPoints} 點\n\n`;
    report += `🗓️ 課程統計：\n`;
    report += `  總課程數：${totalCourses} 堂\n`;
    report += `  進行中/未開課：${upcomingCourses} 堂\n`;
    report += `  已結束課程：${completedCourses} 堂\n\n`;
    report += `💰 購點訂單：\n`;
    report += `  待確認訂單：${pendingOrders} 筆\n`;
    report += `  已完成訂單：${completedOrdersCount} 筆\n`;
    report += `  總收入 (已完成訂單)：${totalRevenue} 元\n`; 

    return reply(replyToken, report.trim(), teacherMenu);
  }
  
  if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
    const pendingConfirmationOrders = ordersRes.rows.map(row => ({
      orderId: row.order_id, userId: row.user_id, userName: row.user_name,
      points: row.points, amount: row.amount, last5Digits: row.last_5_digits,
      timestamp: row.timestamp.toISOString()
    })); 

    if (pendingConfirmationOrders.length === 0) {
      return reply(replyToken, '目前沒有待確認的購點訂單。', teacherPointSubMenu);
    } 

    let replyMessage = '以下是待確認的購點訂單：\n\n';
    const displayOrders = pendingConfirmationOrders.slice(0, 6);
    displayOrders.forEach(order => {
      replyMessage += `--- 訂單 #${order.orderId} ---\n`;
      replyMessage += `學員名稱: ${order.userName}\n`;
      replyMessage += `學員ID: ${order.userId.substring(0, 8)}...\n`;
      replyMessage += `購買點數: ${order.points} 點\n`;
      replyMessage += `應付金額: $${order.amount}\n`;
      replyMessage += `匯款後五碼: ${order.last5Digits || 'N/A'}\n`;
      replyMessage += `提交時間: ${formatDateTime(order.timestamp)}\n\n`;
    }); 

    const quickReplyItems = displayOrders.flatMap(order => [
      { type: 'action', action: { type: 'postback', label: `✅ 確認#${order.orderId}`.slice(0, 20), data: `confirm_order_${order.orderId}`, displayText: `✅ 確認訂單 ${order.orderId} 入帳` } },
      { type: 'action', action: { type: 'postback', label: `❌ 取消#${order.orderId}`.slice(0, 20), data: `cancel_order_${order.orderId}`, displayText: `❌ 取消訂單 ${order.orderId}` } },
    ]);
    quickReplyItems.push({ type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT }); 

    return reply(replyToken, {
      type: 'text', text: replyMessage.trim(),
      quickReply: { items: quickReplyItems }
    });
  } 

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
    pendingManualAdjust[userId] = { step: 1 };
    return reply(replyToken, '請輸入學員 ID 或姓名，以及要調整的點數數量（正數加點，負數扣點），例如：\n王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。', [
      { type: 'message', label: '返回點數管理', text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST }
    ]);
  } 

  return reply(replyToken, '指令無效，請使用下方老師選單或輸入正確指令。', teacherMenu);
} 

// =====================================
//           👩‍🎓 學員指令處理函式
// =====================================
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : ''; 

  const user = await getUser(userId);
  const courses = await getAllCourses(); 

  if (text === COMMANDS.STUDENT.MAIN_MENU) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
  }
  if (text === COMMANDS.STUDENT.POINTS) {
    return reply(replyToken, '請選擇點數相關功能：', studentPointSubMenu);
  }
  if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    delete pendingPurchase[userId];
    return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
  } 

  // ✨ MODIFIED: Flex Message Integration - 點數總覽卡片
  if (text === COMMANDS.STUDENT.CHECK_POINTS) {
    const flexMessage = {
        type: 'flex',
        altText: '點數總覽',
        contents: {
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: '💎 您目前的點數', weight: 'bold', color: '#1DB446', size: 'lg' },
                    { type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', margin: 'md', align: 'center', color: '#000000' },
                    { type: 'separator', margin: 'xxl' },
                    { type: 'box', layout: 'vertical', margin: 'xxl', spacing: 'sm',
                        contents: [
                            { type: 'button', action: { type: 'message', label: '購買點數方案', text: COMMANDS.STUDENT.BUY_POINTS }, style: 'primary', color: '#2B7EAF' },
                            { type: 'button', action: { type: 'message', label: '近期交易紀錄', text: COMMANDS.STUDENT.PURCHASE_HISTORY }, style: 'secondary' }
                        ]
                    }
                ]
            }
        }
    };
    return reply(replyToken, flexMessage);
  } 

  // ✨ MODIFIED: Flex Message Integration - 購點方案輪播卡片
  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgClient.query(`SELECT * FROM ordersWHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation')`, [userId]);
    const pendingOrder = ordersRes.rows[0]; 

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      return reply(replyToken,
        `您有一筆待完成的購點訂單 (ID: ${pendingOrder.order_id})，請先完成匯款並至「購點紀錄」輸入後五碼，或選擇「❌ 取消購買」。`,
        [
          { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
          { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
        ]
      );
    } 

    pendingPurchase[userId] = { step: 'select_plan', data: {} };
    const planBubbles = PURCHASE_PLANS.map(plan => ({
        type: 'bubble',
        header: {
            type: 'box', layout: 'vertical',
            contents: [{ type: 'text', text: '🌟 購點方案', weight: 'bold', size: 'sm', color: '#ffffff' }],
            backgroundColor: '#FFC107', paddingAll: 'lg'
        },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
                { type: 'text', text: `${plan.points} 點`, weight: 'bold', size: 'xxl', align: 'center' },
                { type: 'text', text: `NT$ ${plan.amount}`, weight: 'bold', size: 'xl', align: 'center', color: '#666666' }
            ]
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
            contents: [
                { type: 'button', style: 'primary', height: 'sm',
                    action: { type: 'message', label: '選擇此方案', text: plan.label },
                    color: '#00B900'
                }
            ]
        }
    })); 

    const flexMessage = {
        type: 'flex',
        altText: '點數購買方案',
        contents: { type: 'carousel', contents: planBubbles }
    };
    
    return reply(replyToken, [
        { type: 'text', text: '請選擇要購買的點數方案：' },
        flexMessage,
        { type: 'text', text: '或點擊下方按鈕返回：', quickReply: { items: [{ type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }] }}
    ]);
  } 

  if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_payment'`, [userId]);
    const pendingOrder = ordersRes.rows[0]; 

    if (pendingOrder) {
      await deleteOrder(pendingOrder.order_id);
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消您的購點訂單。', studentMenu);
    }
    if (pendingPurchase[userId]) {
      delete pendingPurchase[userId];
    }
    return reply(replyToken, '目前沒有待取消的購點訂單。', studentMenu);
  } 

  // ✨ MODIFIED: Flex Message Integration - 近期交易紀錄
  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_payment'`, [userId]);
    const pendingOrder = ordersRes.rows[0]; 

    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      return reply(replyToken, `您的訂單 ${pendingOrder.order_id} 尚未確認匯款，請輸入您轉帳的銀行帳號後五碼以便核對：`, [
        { type: 'message', label: '取消輸入', text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 },
        { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }
      ]);
    } 

    // 將所有用戶歷史記錄轉換為 Flex Message 的內容
    const historyContents = (user.history || []).slice(-10).reverse().map(record => ({ // 顯示最新10筆
        type: 'box', layout: 'horizontal',
        contents: [
            { type: 'text', text: record.action, size: 'sm', color: '#333333', flex: 3, wrap: true },
            { type: 'text', text: formatDateTime(record.time), size: 'sm', color: '#aaaaaa', flex: 2, align: 'end' }
        ]
    })); 

    if (historyContents.length === 0) {
      return reply(replyToken, '你目前沒有點數相關記錄。', studentMenu);
    } 

    const flexMessage = {
        type: 'flex',
        altText: '近期點數交易紀錄',
        contents: {
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: '📊 近期點數交易紀錄', weight: 'bold', size: 'lg', color: '#2B7EAF' },
                    { type: 'separator', margin: 'md' },
                    { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
                        contents: historyContents.length > 0 ? historyContents : [{ type: 'text', text: '無歷史記錄。', size: 'sm', color: '#666666' }]
                    },
                    { type: 'separator', margin: 'md' },
                    { type: 'button', action: { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.RETURN_POINTS_MENU }, style: 'secondary', margin: 'md' }
                ]
            }
        }
    };
    return reply(replyToken, flexMessage);
  } 

  if (pendingPurchase[userId] && pendingPurchase[userId].step === 'input_last5') {
    const orderId = pendingPurchase[userId].data.orderId;
    const last5Digits = text.trim(); 

    if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    }
    if (text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      delete pendingPurchase[userId];
      return reply(replyToken, '已返回點數相關功能。', studentPointSubMenu);
    } 

    if (!/^\d{5}$/.test(last5Digits)) {
      return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
    } 

    const ordersRes = await pgClient.query(`SELECT * FROM orders WHERE order_id = $1 AND status = 'pending_payment'`, [orderId]);
    const order = ordersRes.rows[0]; 

    if (!order) {
      delete pendingPurchase[userId];
      return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。', studentMenu);
    } 

    order.last_5_digits = last5Digits;
    order.status = 'pending_confirmation';
    await saveOrder({
      orderId: order.order_id, userId: order.user_id, userName: order.user_name,
      points: order.points, amount: order.amount, last5Digits: order.last_5_digits,
      status: order.status, timestamp: order.timestamp.toISOString()
    });
    delete pendingPurchase[userId]; 

    await reply(replyToken, `已收到您的匯款帳號後五碼：${last5Digits}，感謝您的配合！我們將盡快為您核對並加點。`, studentMenu);
    if (TEACHER_ID) {
      await push(TEACHER_ID, `🔔 有新的購點訂單待確認！請輸入 ${COMMANDS.TEACHER.PENDING_ORDERS} 進入管理介面。`)
        .catch(e => console.error('❌ 通知老師新購點訂單失敗:', e.message));
    }
    return;
  } 

  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
    if (pendingPurchase[userId]?.step === 'input_last5') {
      delete pendingPurchase[userId];
      return reply(replyToken, '已取消輸入匯款帳號後五碼。', studentMenu);
    } else {
      return reply(replyToken, '目前沒有需要取消的輸入流程。', studentMenu);
    }
  } 

  // ✨ MODIFIED: Flex Message Integration - 預約課程輪播卡片
  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
    const upcoming = Object.values(courses)
      .filter(c => new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (upcoming.length === 0) {
      return reply(replyToken, '目前沒有可預約的課程。', studentMenu);
    } 

    const courseBubbles = upcoming.slice(0, 10).map(course => {
        const studentCount = course.students.length;
        const capacity = course.capacity;
        let statusText = '🟢 尚有名額';
        let statusColor = '#1DB446'; // Green
        let buttonText = '立即預約';
        let buttonColor = '#00B900'; // Green 

        if (studentCount >= capacity) {
            statusText = '🔴 已額滿';
            statusColor = '#E64F4F'; // Red
            buttonText = '加入候補';
            buttonColor = '#FF6B6B'; // Red
        } else if (capacity - studentCount <= 2) { // Example: 2 or fewer spots remaining
            statusText = '🟠 即將額滿';
            statusColor = '#FF8C00'; // Orange
            buttonColor = '#FFA500'; // Orange for button
        } 

        return {
            type: 'bubble',
            header: {
                type: 'box', layout: 'vertical',
                contents: [ { type: 'text', text: '瑜伽課程', weight: 'bold', size: 'sm', color: '#1DB446' } ],
                paddingBottom: 'none'
            },
            hero: {
                type: 'image', url: 'https://example.com/yoga_course_placeholder.jpg', // Placeholder image
                size: 'full', aspectRatio: '20:13', aspectMode: 'cover'
            },
            body: {
                type: 'box', layout: 'vertical',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '🗓️ 時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                                    { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }
                                ]
                            },
                            { type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '👨‍🏫 老師', color: '#aaaaaa', size: 'sm', flex: 2 },
                                    { type: 'text', 'text': 'N/A', 'wrap': true, 'color': '#666666', 'size': 'sm', 'flex': 5 }, // Add teacher if available
                                ]
                            },
                            { type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '💎 點數', color: '#aaaaaa', size: 'sm', flex: 2 },
                                    { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                                ]
                            },
                            { type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '狀態', color: '#aaaaaa', size: 'sm', flex: 2 },
                                    { type: 'text', text: statusText, wrap: true, color: statusColor, weight: 'bold', size: 'sm', flex: 5 }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    { type: 'button', style: 'primary', height: 'sm',
                        action: { type: 'message', label: buttonText, text: `我要預約 ${course.id}` },
                        color: buttonColor
                    }
                ]
            }
        };
    }); 

    const flexMessage = {
        type: 'flex',
        altText: '可預約課程列表',
        contents: { type: 'carousel', contents: courseBubbles }
    };
    
    return reply(replyToken, [
        { type: 'text', text: '以下是目前可以預約的課程，點擊即可預約或加入候補。\n\n💡 請注意：課程開始前 8 小時不可退課。' },
        flexMessage,
        { type: 'text', text: '或點擊下方按鈕返回：', quickReply: { items: [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }] }}
    ]);
  } 

  if (text.startsWith('我要預約 ')) {
    const courseId = text.replace('我要預約 ', '').trim();
    const course = courses[courseId];
    const now = Date.now(); 

    if (!course) {
      return reply(replyToken, '找不到該課程，或課程已不存在。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法預約。', studentMenu);
    }
    if (course.students.includes(userId)) {
      return reply(replyToken, '你已經預約此課程了。', studentMenu);
    }
    if (course.waiting.includes(userId)) {
      return reply(replyToken, '你已在該課程的候補名單中，請耐心等待。', studentMenu);
    }
    if (user.points < course.pointsCost) {
      return reply(replyToken, `你的點數不足，此課程需要 ${course.pointsCost} 點，你目前有 ${user.points} 點。請先購買點數。`, studentMenu);
    } 

    if (course.students.length < course.capacity) {
      course.students.push(userId);
      user.points -= course.pointsCost;
      if (!Array.isArray(user.history)) user.history = [];
      user.history.push({ id: courseId, action: `預約成功：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
      await saveCourse(course);
      await saveUser(user);
      return reply(replyToken, `已成功預約課程：「${course.title}」，扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
    } else {
      course.waiting.push(userId);
      if (!Array.isArray(user.history)) user.history = [];
      user.history.push({ id: courseId, action: `加入候補：${course.title}`, time: new Date().toISOString() });
      await saveCourse(course);
      await saveUser(user);
      return reply(replyToken, `該課程「${course.title}」已額滿，你已成功加入候補名單。若有空位將依序遞補並自動扣除 ${course.pointsCost} 點。\n\n💡 請注意：課程開始前 8 小時不可退課。`, studentMenu);
    }
  } 

  // ✨ MODIFIED: Flex Message Integration - 我的課程輪播卡片
  if (text === COMMANDS.STUDENT.MY_COURSES) {
    const now = Date.now();
    const enrolledCourses = Object.values(courses)
      .filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
    const waitingCourses = Object.values(courses)
      .filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (enrolledCourses.length === 0 && waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有預約或候補任何課程。', studentMenu);
    } 

    const myCourseBubbles = [
        ...enrolledCourses.map(course => ({
            type: 'bubble',
            header: {
                type: 'box', layout: 'vertical',
                contents: [{ type: 'text', text: '已預約課程', weight: 'bold', size: 'sm', color: '#ffffff' }],
                backgroundColor: '#2B7EAF', paddingAll: 'lg'
            },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                    { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                        contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: '🗓️ 時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                                    { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    { type: 'button', style: 'primary', height: 'sm',
                        action: { type: 'message', label: '取消預約', text: `我要取消預約 ${course.id}` },
                        color: '#de5246'
                    }
                ]
            }
        })),
        ...waitingCourses.map(course => {
            const waitingIndex = course.waiting.indexOf(userId) + 1;
            return {
                type: 'bubble',
                header: {
                    type: 'box', layout: 'vertical',
                    contents: [{ type: 'text', text: '候補中課程', weight: 'bold', size: 'sm', color: '#ffffff' }],
                    backgroundColor: '#FF8C00', paddingAll: 'lg'
                },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                            contents: [
                                { type: 'box', layout: 'baseline', spacing: 'sm',
                                    contents: [
                                        { type: 'text', text: '🗓️ 時間', color: '#aaaaaa', size: 'sm', flex: 2 },
                                        { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }
                                    ]
                                },
                                { type: 'box', layout: 'baseline', spacing: 'sm',
                                    contents: [
                                        { type: 'text', text: '⭐️ 順位', color: '#aaaaaa', size: 'sm', flex: 2 },
                                        { type: 'text', text: `第 ${waitingIndex} 位`, wrap: true, color: '#666666', size: 'sm', flex: 5 }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                    contents: [
                        { type: 'button', style: 'primary', height: 'sm',
                            action: { type: 'message', label: '取消候補', text: `我要取消候補 ${course.id}` },
                            color: '#de5246'
                        }
                    ]
                }
            };
        })
    ]; 

    const flexMessage = {
        type: 'flex',
        altText: '我的課程列表',
        contents: { type: 'carousel', contents: myCourseBubbles }
    }; 

    return reply(replyToken, [
        { type: 'text', text: '以下是您預約或候補的課程：' },
        flexMessage,
        { type: 'text', text: '或點擊下方按鈕返回：', quickReply: { items: [{ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }] }}
    ]);
  } 

  if (text === COMMANDS.STUDENT.CANCEL_BOOKING) {
    const now = Date.now();
    const enrolled = Object.values(courses).filter(c =>
      c.students.includes(userId) && new Date(c.time).getTime() > now
    ).sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (enrolled.length === 0) {
      return reply(replyToken, '你目前沒有可取消的預約課程。', studentMenu);
    } 

    const displayCourses = enrolled.slice(0, 12);
    const quickReplyItems = displayCourses.map(c => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title} (退${c.pointsCost}點)`.slice(0, 20),
        text: `我要取消預約 ${c.id}`,
      },
    }));
    quickReplyItems.push({ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }); 

    return reply(replyToken, {
      type: 'text',
      text: '請選擇要取消的預約課程：',
      quickReply: { items: quickReplyItems },
    });
  } 

  if (text.startsWith('我要取消預約 ')) {
    const id = text.replace('我要取消預約 ', '').trim();
    const course = courses[id];
    const now = Date.now(); 

    if (!course || !course.students.includes(userId)) {
      return reply(replyToken, '你沒有預約此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() - now < EIGHT_HOURS_IN_MS) {
      return reply(replyToken, `課程「${course.title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`, studentMenu);
    } 

    course.students = course.students.filter(sid => sid !== userId);
    user.points += course.pointsCost;
    if (!Array.isArray(user.history)) user.history = [];
    user.history.push({ id, action: `取消預約退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() }); 

    let replyMessage = `課程「${course.title}」已取消，已退還 ${course.pointsCost} 點。`; 

    if (course.waiting.length > 0 && course.students.length < course.capacity) {
      const nextWaitingUserId = course.waiting[0];
      const nextWaitingUser = await getUser(nextWaitingUserId); 

      if (nextWaitingUser && nextWaitingUser.points >= course.pointsCost) {
        course.waiting.shift();
        course.students.push(nextWaitingUserId);
        nextWaitingUser.points -= course.pointsCost;
        if (!Array.isArray(nextWaitingUser.history)) nextWaitingUser.history = [];
        nextWaitingUser.history.push({ id, action: `候補補上：${course.title} (扣 ${course.pointsCost} 點)`, time: new Date().toISOString() });
        await saveUser(nextWaitingUser);
        push(nextWaitingUserId, `你已從候補名單補上課程「${course.title}」！\n上課時間：${formatDateTime(course.time)}\n系統已自動扣除 ${course.pointsCost} 點。請確認你的「我的課程」。\n\n💡 請注意：課程開始前 8 小時不可退課。`)
            .catch(e => console.error(`❌ 通知候補者 ${nextWaitingUserId} 失敗:`, e.message));
        replyMessage += '\n有候補學生已遞補成功。';
      } else if (nextWaitingUser) {
        const studentName = nextWaitingUser.name || `未知學員(${nextWaitingUserId.substring(0, 4)}...)`;
        replyMessage += `\n候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已將其從候補名單移除。`;
        course.waiting.shift();
        if (TEACHER_ID) {
          push(TEACHER_ID, `課程「${course.title}」（${formatDateTime(course.time)}）有學生取消，但候補學生 ${studentName} 點數不足 (需要 ${course.pointsCost} 點)，未能遞補。已自動從候補名單移除該學生。`)
            .catch(e => console.error('❌ 通知老師失敗', e.message));
        }
      } else {
        course.waiting.shift();
        replyMessage += '\n候補名單中存在無效用戶，已移除。';
      }
    }
    await saveCourse(course);
    await saveUser(user);
    return reply(replyToken, replyMessage, studentMenu);
  } 

  if (text === COMMANDS.STUDENT.CANCEL_WAITING) {
    const now = Date.now();
    const waitingCourses = Object.values(courses)
      .filter(c => c.waiting?.includes(userId) && new Date(c.time).getTime() > now)
      .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime()); 

    if (waitingCourses.length === 0) {
      return reply(replyToken, '你目前沒有可取消的候補課程。', studentMenu);
    } 

    const displayCourses = waitingCourses.slice(0, 12);
    const quickReplyItems = displayCourses.map(c => ({
      type: 'action',
      action: {
        type: 'message',
        label: `${formatDateTime(c.time)} ${c.title}`.slice(0, 20),
        text: `我要取消候補 ${c.id}`,
      },
    }));
    quickReplyItems.push({ type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU }); 

    return reply(replyToken, {
      type: 'text',
      text: '請選擇要取消候補的課程：',
      quickReply: { items: quickReplyItems },
    });
  } 

  if (text.startsWith('我要取消候補 ')) {
    const id = text.replace('我要取消候補 ', '').trim();
    const course = courses[id];
    const now = Date.now(); 

    if (!course || !course.waiting?.includes(userId)) {
      return reply(replyToken, '你沒有候補此課程，無法取消。', studentMenu);
    }
    if (new Date(course.time).getTime() < now) {
      return reply(replyToken, '該課程已過期，無法取消候補。', studentMenu);
    }
    course.waiting = course.waiting.filter(x => x !== userId);
    if (!Array.isArray(user.history)) user.history = [];
    user.history.push({ id, action: `取消候補：${course.title}`, time: new Date().toISOString() });
    await saveCourse(course);
    await saveUser(user);
    return reply(replyToken, `已取消課程「${course.title}」的候補。`, studentMenu);
  } 

  return reply(replyToken, '指令無效，請使用下方選單或輸入正確指令。', studentMenu);
}


// =====================================
//      🎯 主事件處理函式
// =====================================
async function handleEvent(event) {
    const userId = event.source.userId;
    const replyToken = event.replyToken; 

    if (event.type !== 'message' && event.type !== 'postback' && event.type !== 'follow' && event.type !== 'unfollow') {
        console.log(`Ignored event type: ${event.type}`);
        return;
    }
  
    if (event.type === 'follow') {
        console.log(`New user followed bot: ${userId}`);
        try {
            let user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
            await saveUser(user);
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            await saveUser(user);
            await reply(replyToken, `哈囉 ${user.name}！歡迎來到九容瑜伽小助手！\n\n我是您的專屬瑜伽小助手，您可以透過下方的選單預約課程、查詢點數等。`, studentMenu);
        } catch (e) {
            console.error(`❌ 處理追蹤事件失敗 for ${userId}:`, e.message);
            await reply(replyToken, `哈囉！歡迎來到九容瑜伽小助手！`, studentMenu).catch(e => console.error(`❌ 追蹤事件預設回覆失敗:`, e.message));
        }
        return;
    } 

    if (event.type === 'unfollow') {
        console.log(`User unfollowed bot: ${userId}`);
        return;
    }
  
    let user = await getUser(userId);
    if (!user) {
        user = { id: userId, name: '匿名使用者', points: 0, role: 'student', history: [] };
        await saveUser(user);
    }
    if (user.name === '匿名使用者' || !user.name) {
        try {
            const profile = await client.getProfile(userId);
            user.name = profile.displayName || '匿名使用者';
            await saveUser(user);
        } catch (e) {
            console.error(`❌ 取得用戶資料失敗 for ${userId}:`, e.message);
        }
    } 

    // --- Postback 事件處理 ---
    if (event.type === 'postback') {
        const data = event.postback.data;
        const params = new URLSearchParams(data);
        const postbackAction = params.get('action'); 

        const currentUser = await getUser(userId);
        if (currentUser.role !== 'teacher') {
            return reply(replyToken, '您沒有權限執行此操作。');
        } 

        // --- 新的取消課程流程 ---
        if (postbackAction === 'cancel_course_confirm') {
            const courseId = params.get('courseId');
            const courses = await getAllCourses();
            const course = courses[courseId];
            if (!course) {
                return reply(replyToken, '找不到該課程，可能已被取消。', teacherCourseSubMenu);
            }
            return reply(replyToken, {
                type: 'text',
                text: `⚠️ 最終確認 ⚠️\n\n您確定要取消課程「${course.title}」嗎？\n\n此操作將會刪除課程、自動退點並通知所有相關學生，且無法復原！`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，確認取消', data: `action=cancel_course_execute&courseId=${courseId}`, displayText: `正在取消課程...` } },
                        { type: 'action', action: { type: 'postback', label: '❌ 否，返回', data: 'action=cancel_course_abort', displayText: '取消操作' } }
                    ]
                }
            });
        } 

        if (postbackAction === 'cancel_course_execute') {
            const courseId = params.get('courseId');
            const courses = await getAllCourses();
            const course = courses[courseId];
            if (!course) {
                return reply(replyToken, '找不到該課程，取消失敗。', teacherCourseSubMenu);
            }
            for (const stuId of course.students) {
                const studentUser = await getUser(stuId);
                if (studentUser) {
                    studentUser.points += course.pointsCost;
                    if (!Array.isArray(studentUser.history)) studentUser.history = [];
                    studentUser.history.push({ id: courseId, action: `課程取消退點：${course.title} (退 ${course.pointsCost} 點)`, time: new Date().toISOString() });
                    await saveUser(studentUser);
                    push(stuId, `【課程取消通知】\n您預約的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消，系統已自動退還 ${course.pointsCost} 點。`).catch(e => console.error(`❌ 通知學生 ${stuId} 課程取消失敗:`, e.message));
                }
            }
            for (const waitId of course.waiting) {
                const waitingUser = await getUser(waitId);
                if (waitingUser) {
                    if (!Array.isArray(waitingUser.history)) waitingUser.history = [];
                    waitingUser.history.push({ id: courseId, action: `候補課程取消：${course.title}`, time: new Date().toISOString() });
                    await saveUser(waitingUser);
                    push(waitId, `【候補取消通知】\n您候補的課程「${course.title}」（${formatDateTime(course.time)}）已被老師取消。`).catch(e => console.error(`❌ 通知候補者 ${waitId} 課程取消失敗:`, e.message));
                }
            }
            await deleteCourse(courseId);
            console.log(`✅ 課程 ${courseId} (${course.title}) 已成功取消。`);
            return reply(replyToken, `✅ 課程「${course.title}」已成功取消，並已通知所有相關學員。`, teacherCourseSubMenu);
        }
        
        if (postbackAction === 'cancel_course_abort') {
            return reply(replyToken, '操作已取消，返回課程管理選單。', teacherCourseSubMenu);
        }
        
        // --- 原有的購點確認流程 (保留) ---
        if (data.startsWith('confirm_order_') || data.startsWith('cancel_order_')) {
            const orderId = data.split('_')[2];
            const action = data.split('_')[0];
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
                if (!Array.isArray(studentUser.history)) studentUser.history = [];
                studentUser.history.push({ action: `購買點數成功：${order.points} 點`, time: new Date().toISOString(), orderId: orderId });
                order.status = 'completed';
                await saveUser(studentUser);
                await saveOrder(order);
                await reply(replyToken, `✅ 已為學員 ${order.userName} 加點 ${order.points} 點，訂單 ${orderId} 已完成。`, teacherPointSubMenu);
                await push(order.userId, `🎉 您購買的 ${order.points} 點已成功入帳！目前點數：${studentUser.points} 點。`).catch(e => console.error(`❌ 通知學員 ${order.userId} 購點成功失敗:`, e.message));
            } else if (action === 'cancel') {
                order.status = 'cancelled';
                await saveOrder(order);
                await reply(replyToken, `❌ 已取消訂單 ${order.orderId} 的購點確認。請手動與學員 ${order.userName} 聯繫。`, teacherPointSubMenu);
            }
        }
        return;
    } 

    if (event.type !== 'message' || event.message.type !== 'text') {
        return;
    }
    const text = event.message.text.trim(); 

    // --- 移除舊的取消課程確認邏輯 ---
    // (原先在此處的 if (global.confirmingCancelCourse...) 區塊已刪除)
    
    if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE && pendingCourseCreation[userId]) {
        delete pendingCourseCreation[userId];
        return reply(replyToken, '已取消新增課程流程並返回選單。', teacherCourseSubMenu);
    } 

    // 多步驟流程處理... (新增課程, 手動調點, 學生購點)
    if (pendingCourseCreation[userId]) {
        const stepData = pendingCourseCreation[userId];
        const weekdays = { '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6 };
        switch (stepData.step) {
            case 1:
                stepData.data.title = text;
                stepData.step = 2;
                const weekdayOptions = Object.keys(weekdays).map(day => ({ type: 'message', label: day, text: day }));
                weekdayOptions.push({ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE });
                return reply(replyToken, '請選擇課程日期（星期幾）：', weekdayOptions);
            case 2:
                if (!weekdays.hasOwnProperty(text)) {
                    return reply(replyToken, '請選擇正確的星期。');
                }
                stepData.data.weekday = text;
                stepData.step = 3;
                return reply(replyToken, '請輸入課程時間（24小時制，如 14:30）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 3:
                if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
                    return reply(replyToken, '時間格式錯誤，請輸入 24 小時制時間，例如 14:30');
                }
                stepData.data.time = text;
                stepData.step = 4;
                return reply(replyToken, '請輸入人員上限（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 4:
                const capacity = parseInt(text);
                if (isNaN(capacity) || capacity <= 0) {
                    return reply(replyToken, '人數上限必須是正整數。');
                }
                stepData.data.capacity = capacity;
                stepData.step = 5;
                return reply(replyToken, '請輸入課程所需扣除的點數（正整數）', [{ type: 'message', label: '取消新增課程', text: COMMANDS.STUDENT.CANCEL_ADD_COURSE }]);
            case 5:
                const pointsCost = parseInt(text);
                if (isNaN(pointsCost) || pointsCost <= 0) {
                    return reply(replyToken, '扣除點數必須是正整數。');
                }
                stepData.data.pointsCost = pointsCost;
                stepData.step = 6;
                return reply(replyToken, `請確認是否建立課程：\n課程名稱：${stepData.data.title}\n日期：${stepData.data.weekday}\n時間：${stepData.data.time}\n人數上限：${stepData.data.capacity}\n扣點數：${stepData.data.pointsCost} 點`, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE },
                    { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE },
                ]);
            case 6:
                if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
                    const targetWeekdayIndex = weekdays[stepData.data.weekday];
                    const [targetHour, targetMin] = stepData.data.time.split(':').map(Number);
                    const now = new Date();
                    const taipeiOffsetHours = 8;
                    let courseDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                    let dayDiff = (targetWeekdayIndex - courseDate.getUTCDay() + 7) % 7;
                    const currentHourTaipei = now.getHours();
                    const currentMinuteTaipei = now.getMinutes();
                    if (dayDiff === 0 && (currentHourTaipei > targetHour || (currentHourTaipei === targetHour && currentMinuteTaipei >= targetMin))) {
                        dayDiff = 7;
                    }
                    courseDate.setUTCDate(courseDate.getUTCDate() + dayDiff);
                    courseDate.setUTCHours(targetHour - taipeiOffsetHours, targetMin, 0, 0);
                    const isoTime = courseDate.toISOString();
                    const newId = `C${String(global.courseIdCounter++).padStart(3, '0')}`;
                    const newCourse = { id: newId, title: stepData.data.title, time: isoTime, capacity: stepData.data.capacity, pointsCost: stepData.data.pointsCost, students: [], waiting: [] };
                    await saveCourse(newCourse);
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, `課程已新增：${stepData.data.title}\n時間：${formatDateTime(isoTime)}`, teacherCourseSubMenu);
                } else if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
                    delete pendingCourseCreation[userId];
                    return reply(replyToken, '已取消新增課程。', teacherCourseSubMenu);
                } else {
                    return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_ADD_COURSE}」或「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」。`);
                }
        }
    } 

    if (pendingManualAdjust[userId]) {
        if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
            delete pendingManualAdjust[userId];
            return reply(replyToken, '已取消手動調整點數。', teacherPointSubMenu);
        }
        const parts = text.split(' ');
        if (parts.length !== 2) {
            return reply(replyToken, '指令格式錯誤。');
        }
        const targetIdentifier = parts[0];
        const amount = parseInt(parts[1]);
        if (isNaN(amount) || amount === 0) {
            return reply(replyToken, '點數數量必須是非零整數。');
        }
        let foundUser = await getUser(targetIdentifier);
        if (!foundUser) {
            const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
            if (res.rows.length > 0) {
                // Prefer exact match if any
                foundUser = res.rows.find(u => u.name.toLowerCase() === targetIdentifier.toLowerCase()) || res.rows[0];
            }
        }
        if (!foundUser) {
            delete pendingManualAdjust[userId];
            return reply(replyToken, `找不到學員：${targetIdentifier}。`, teacherPointSubMenu);
        }
        const operation = amount > 0 ? '加點' : '扣點';
        const absAmount = Math.abs(amount);
        if (operation === '扣點' && foundUser.points < absAmount) {
            delete pendingManualAdjust[userId];
            return reply(replyToken, `學員 ${foundUser.name} 點數不足。`, teacherPointSubMenu);
        }
        foundUser.points += amount;
        if (!Array.isArray(foundUser.history)) foundUser.history = [];
        foundUser.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
        await saveUser(foundUser);
        push(foundUser.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${foundUser.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
        delete pendingManualAdjust[userId];
        return reply(replyToken, `✅ 已成功為學員 ${foundUser.name} ${operation} ${absAmount} 點，目前點數：${foundUser.points} 點。`, teacherPointSubMenu);
    }
    
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
                    return reply(replyToken, '請從列表中選擇有效的點數方案。');
                }
                stepData.data = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
                stepData.step = 'confirm_purchase';
                return reply(replyToken, `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。請確認。`, [
                    { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS },
                    { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE },
                ]);
            case 'confirm_purchase':
                if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
                    const orderId = `O${Date.now()}`;
                    const newOrder = { ...stepData.data, orderId: orderId };
                    await saveOrder(newOrder);
                    delete pendingPurchase[userId];
                    return reply(replyToken, `✅ 已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n` + `戶名：${BANK_INFO.accountName}\n` + `銀行：${BANK_INFO.bankName}\n` + `帳號：${BANK_INFO.accountNumber}\n\n` + `完成轉帳後，請至「購點紀錄」輸入您的匯款帳號後五碼。\n\n` + `您的訂單編號為：${orderId}`, studentMenu);
                } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
                    delete pendingPurchase[userId];
                    return reply(replyToken, '已取消購買點數。', studentMenu);
                } else {
                    return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`);
                }
        }
    } 

    // 身份切換與登入
    if (text === COMMANDS.SWITCH_ROLE) {
        const currentUser = await getUser(userId);
        if (currentUser.role === 'teacher') {
            currentUser.role = 'student';
            await saveUser(currentUser);
            return reply(event.replyToken, '已切換為學員身份。', studentMenu);
        } else {
            pendingTeacherLogin[userId] = true;
            return reply(event.replyToken, '請輸入老師密碼登入。', [{ type: 'message', label: '取消登入', text: '@取消登入' }]);
        }
    }
    
    if (pendingTeacherLogin[userId]) {
        if (text === '@取消登入') {
             delete pendingTeacherLogin[userId];
             return reply(replyToken, '已取消老師登入。', studentMenu);
        }
        if (text === TEACHER_PASSWORD) {
            const currentUser = await getUser(userId);
            currentUser.role = 'teacher';
            await saveUser(currentUser);
            delete pendingTeacherLogin[userId];
            return reply(replyToken, '老師登入成功。', teacherMenu);
        } else {
            delete pendingTeacherLogin[userId];
            return reply(replyToken, '密碼錯誤，登入失敗。', studentMenu);
        }
    } 

    // 根據身份導向指令處理
    const finalUser = await getUser(userId);
    if (finalUser.role === 'teacher') {
        return handleTeacherCommands(event, userId);
    } else {
        return handleStudentCommands(event, userId);
    }
} 

// =====================================
//           自動提醒功能
// =====================================
async function checkAndSendReminders() {
    const now = Date.now();
    const courses = await getAllCourses();
    const usersRes = await pgClient.query('SELECT id, name FROM users');
    const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u])); 

    for (const id in courses) {
        const course = courses[id];
        const courseTime = new Date(course.time).getTime();
        const timeUntilCourse = courseTime - now;
        const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 確保在 1 小時內，且有足夠時間發送 

        if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
            console.log(`🔔 準備發送課程提醒：${course.title}`);
            for (const studentId of course.students) {
                const student = dbUsersMap.get(studentId);
                if (student) {
                    try {
                        await push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`);
                    } catch (e) {
                        console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message);
                    }
                }
            }
            sentReminders[id] = true;
        }
    }
    // 清理已發送提醒的過期課程
    for (const id in sentReminders) {
        const course = courses[id];
        // 如果課程不存在或課程時間已經遠超過去（超過一天），則從 sentReminders 中移除
        if (!course || (new Date(course.time).getTime() < (now - ONE_DAY_IN_MS))) {
            delete sentReminders[id];
        }
    }
} 

// =====================================
//           LINE Webhook 與伺服器啟動
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

  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS); 

  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
    setInterval(() => {
        fetch(SELF_URL)
            .then(res => console.log(`Keep-alive response from ${SELF_URL}: ${res.status}`))
            .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
    }, PING_INTERVAL_MS);
  } else {
    console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
