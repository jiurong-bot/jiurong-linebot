// db.js
const { Pool } = require('pg');

// 從環境變數中獲取 PostgreSQL 連接字串
const DATABASE_URL = process.env.DATABASE_URL;

const pgClient = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // For Render.com and similar environments
  }
});

// 建立資料表 (如果不存在)
async function initializeDatabase() {
  try {
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        points INTEGER DEFAULT 0,
        role VARCHAR(50) DEFAULT 'student', -- 'student' or 'teacher'
        history JSONB DEFAULT '[]' -- Array of objects for point/course history
      );
    `);
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        time TIMESTAMP WITH TIME ZONE NOT NULL,
        capacity INTEGER NOT NULL,
        points_cost INTEGER NOT NULL,
        students TEXT[] DEFAULT '{}', -- Array of user IDs
        waiting TEXT[] DEFAULT '{}' -- Array of user IDs for waiting list
      );
    `);
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_name VARCHAR(255),
        points INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending_payment', -- pending_payment, pending_confirmation, completed, cancelled
        last_five_digits VARCHAR(5) -- For bank transfer confirmation
      );
    `);
    console.log('✅ Database tables checked/created successfully.');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    process.exit(1); // Exit if database initialization fails
  }
}

initializeDatabase(); // 應用啟動時調用此函數

// --- 用戶 (User) 操作 ---
async function getUser(userId) {
  const res = await pgClient.query('SELECT * FROM users WHERE id = $1', [userId]);
  return res.rows[0];
}

async function saveUser(user) {
  const { id, name, points, role, history } = user;
  await pgClient.query(
    'INSERT INTO users (id, name, points, role, history) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = $2, points = $3, role = $4, history = $5',
    [id, name, points, role, JSON.stringify(history)]
  );
}

// --- 課程 (Course) 操作 ---
async function getAllCourses() {
  const res = await pgClient.query('SELECT * FROM courses');
  const courses = {};
  res.rows.forEach(row => {
    courses[row.id] = {
      id: row.id,
      title: row.title,
      time: row.time, // This will be a Date object
      capacity: row.capacity,
      pointsCost: row.points_cost,
      students: row.students, // Array of student IDs
      waiting: row.waiting, // Array of waiting student IDs
    };
  });
  return courses;
}

async function saveCourse(course) {
  const { id, title, time, capacity, pointsCost, students, waiting } = course;
  await pgClient.query(
    'INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET title = $2, time = $3, capacity = $4, points_cost = $5, students = $6, waiting = $7',
    [id, title, time, capacity, pointsCost, students, waiting]
  );
}

async function deleteCourse(courseId) {
  await pgClient.query('DELETE FROM courses WHERE id = $1', [courseId]);
}

// --- 訂單 (Order) 操作 ---
async function getAllOrders() {
    const res = await pgClient.query('SELECT * FROM orders');
    const orders = {};
    res.rows.forEach(row => {
        orders[row.order_id] = {
            orderId: row.order_id,
            userId: row.user_id,
            userName: row.user_name,
            points: row.points,
            amount: row.amount,
            timestamp: row.timestamp,
            status: row.status,
            lastFiveDigits: row.last_five_digits,
        };
    });
    return orders;
}

async function saveOrder(order) {
    const { orderId, userId, userName, points, amount, timestamp, status, lastFiveDigits } = order;
    await pgClient.query(
        'INSERT INTO orders (order_id, user_id, user_name, points, amount, timestamp, status, last_five_digits) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (order_id) DO UPDATE SET user_id = $2, user_name = $3, points = $4, amount = $5, timestamp = $6, status = $7, last_five_digits = $8',
        [orderId, userId, userName, points, amount, timestamp, status, lastFiveDigits]
    );
}

async function deleteOrder(orderId) {
    await pgClient.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
}


module.exports = {
  getUser,
  saveUser,
  getAllCourses,
  saveCourse,
  deleteCourse,
  getAllOrders,
  saveOrder,
  deleteOrder,
  pgClient // 導出 pgClient 讓 index.js 可以使用它來查詢所有用戶等
};
