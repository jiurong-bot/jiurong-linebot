// db.js
const { Client } = require('pg');
require('dotenv').config(); // 確保可以讀取 .env 中的 DATABASE_URL

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function connectDb() {
  try {
    await pgClient.connect();
    console.log('✅ 成功連接到 PostgreSQL 資料庫');
    // 確保表結構存在 (如果不存在則創建)
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        points INTEGER DEFAULT 0,
        state JSONB DEFAULT '{}',
        history JSONB DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        time TIMESTAMP WITH TIME ZONE NOT NULL,
        points_cost INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        students JSONB DEFAULT '[]',
        waiting JSONB DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        points INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        last_5_digits VARCHAR(5),
        status VARCHAR(50) NOT NULL, -- pending_confirmation, completed, cancelled, rejected
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ 資料庫表結構檢查或創建完成。');

    // 初始化 courseIdCounter
    const result = await pgClient.query("SELECT MAX(SUBSTRING(id FROM 2)::INTEGER) AS max_id FROM courses WHERE id LIKE 'C%'");
    global.courseIdCounter = (result.rows[0].max_id || 0) + 1;
    console.log(`ℹ️ 課程 ID 計數器初始化為: C${global.courseIdCounter}`);

    // 清理過期課程 (可以在這裡觸發一次)
    await cleanCoursesDB();
    console.log('✅ 首次資料庫清理完成。');

  } catch (err) {
    console.error('❌ 資料庫連接或初始化失敗:', err.message);
    process.exit(1); // 初始化失敗應終止應用
  }
}

// 輔助函式：執行查詢並處理 JSONB
async function query(text, params) {
  try {
    return await pgClient.query(text, params);
  } catch (error) {
    console.error(`❌ 資料庫查詢錯誤: "${text}" with params [${params}]`, error.message);
    throw error; // 重新拋出，讓上層邏輯決定如何處理
  }
}

// 用戶相關操作
async function getUser(userId, client = pgClient) {
  const res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (res.rows.length > 0) {
    const user = res.rows[0];
    // 解析 JSONB 欄位
    user.state = user.state || {};
    user.history = user.history || [];
    return user;
  }
  return null;
}

async function saveUser(user, client = pgClient) {
  // 確保 JSONB 欄位是有效的 JSON 字符串
  const stateJson = JSON.stringify(user.state || {});
  const historyJson = JSON.stringify(user.history || []);
  await client.query(
    'INSERT INTO users (id, name, role, points, state, history) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = $2, role = $3, points = $4, state = $5, history = $6',
    [user.id, user.name, user.role, user.points, stateJson, historyJson]
  );
}

async function getAllStudents() {
  const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student'`);
  return res.rows.map(user => {
    user.state = user.state || {};
    user.history = user.history || [];
    return user;
  });
}

// 課程相關操作
async function getCourse(courseId, client = pgClient) {
  const res = await client.query('SELECT * FROM courses WHERE id = $1', [courseId]);
  if (res.rows.length > 0) {
    const course = res.rows[0];
    course.students = course.students || [];
    course.waiting = course.waiting || [];
    return course;
  }
  return null;
}

async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses ORDER BY time ASC');
  return res.rows.map(course => {
    course.students = course.students || [];
    course.waiting = course.waiting || [];
    return course;
  });
}

async function saveCourse(course, client = pgClient) {
  const studentsJson = JSON.stringify(course.students || []);
  const waitingJson = JSON.stringify(course.waiting || []);
  await client.query(
    'INSERT INTO courses (id, title, time, points_cost, capacity, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, points_cost = $4, capacity = $5, students = $6, waiting = $7',
    [course.id, course.title, course.time, course.pointsCost, course.capacity, studentsJson, waitingJson]
  );
}

async function deleteCourse(courseId, client = pgClient) {
  await client.query('DELETE FROM courses WHERE id = $1', [courseId]);
}

async function cleanCoursesDB() {
  // 找出所有已過期的課程 ID
  const now = new Date();
  const res = await pgClient.query('SELECT id FROM courses WHERE time < $1', [now]);
  const expiredCourseIds = res.rows.map(row => row.id);

  if (expiredCourseIds.length > 0) {
      console.log(`ℹ️ 正在清理過期課程：${expiredCourseIds.join(', ')}`);
      await pgClient.query('DELETE FROM courses WHERE id = ANY($1::varchar[])', [expiredCourseIds]);
      console.log(`✅ 已清理 ${expiredCourseIds.length} 門過期課程。`);
  }
}

// 訂單相關操作
async function getOrder(orderId, client = pgClient) {
  const res = await client.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  return res.rows.length > 0 ? res.rows[0] : null;
}

async function getAllOrders() {
  const res = await pgClient.query('SELECT * FROM orders ORDER BY timestamp DESC');
  return res.rows;
}

async function saveOrder(order, client = pgClient) {
  await client.query(
    'INSERT INTO orders (order_id, user_id, user_name, points, amount, last_5_digits, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, last_5_digits = $6, status = $7, timestamp = $8',
    [order.orderId, order.userId, order.userName, order.points, order.amount, order.last5Digits, order.status, order.timestamp]
  );
}

async function deleteOrder(orderId, client = pgClient) {
  await client.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}


module.exports = {
  pgClient, // 導出 pgClient 實例，以便於外部管理事務
  connectDb,
  query,
  getUser,
  saveUser,
  getAllStudents,
  getCourse,
  getAllCourses,
  saveCourse,
  deleteCourse,
  cleanCoursesDB,
  getOrder,
  getAllOrders,
  saveOrder,
  deleteOrder,
};
