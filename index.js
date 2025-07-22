// Add these at the top of your index.js if they are not already there
const express = require('express');
const bodyParser = require('body-parser');
const { Client, middleware } = require('@line/bot-sdk');
const { Pool } = require('pg');
const moment = require('moment-timezone'); // For time zone handling

// --- Constants (確保這些常量都已定義) ---
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const LINE_BOT_PUSH_API_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

const databaseConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Required for Render's PostgreSQL
    },
};

const COMMANDS = {
    TEACHER: {
        DASHBOARD: '@課程管理',
        ADD_COURSE: '@新增課程',
        LIST_COURSES: '@課程列表',
        CANCEL_COURSE: '@取消課程',
        STUDENT_LIST: '@學員列表',
        SWITCH_IDENTITY: '@切換身份',
        RESET_PASSWORD: '@重設密碼',
    },
    STUDENT: {
        DASHBOARD: '@學員專區',
        REGISTER_COURSE: '@報名課程',
        LIST_MY_COURSES: '@我的課程',
        CANCEL_REGISTRATION: '@取消報名',
        VIEW_POINTS: '@查看點數',
        BUY_POINTS: '@購買點數',
        SWITCH_IDENTITY: '@切換身份',
    },
    COMMON: {
        HOME: '@返回主選單',
        TEACHER_HOME: '@返回老師主選單', // 新增此常量
        STUDENT_HOME: '@返回學員主選單', // 新增此常量
    },
};

// --- Global State Variables (確保這些變數都已定義) ---
const userState = {
    currentAction: {}, // Stores the current action for a user (e.g., 'adding_course_name')
    courseData: {},    // Temporarily stores course data during the add course process
    isTeacher: {},     // Stores teacher status by userId
    isStudent: {},     // Stores student status by userId
    loggedIn: {},      // Stores login status by userId
    selectedCourseToCancel: {}, // Stores the course ID selected for cancellation
    selectedCourseToRegister: {}, // Stores the course ID selected for registration
    selectedCourseToCancelRegistration: {}, // Stores the course ID selected for cancelling student registration
};

let courseIdCounter = 0; // Will be initialized from DB

// --- Database Connection ---
const pool = new Pool(databaseConfig);

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(255) PRIMARY KEY,
                role VARCHAR(50) NOT NULL,
                password VARCHAR(255)
            );
        `);
        console.log('✅ 檢查並建立 users 表完成');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS courses (
                id SERIAL PRIMARY KEY,
                course_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                time TIME NOT NULL,
                max_capacity INTEGER NOT NULL,
                points_cost INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                is_cancelled BOOLEAN DEFAULT FALSE
            );
        `);
        console.log('✅ 檢查並建立 courses 表完成');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS registrations (
                id SERIAL PRIMARY KEY,
                course_id INTEGER REFERENCES courses(id),
                user_id VARCHAR(255) REFERENCES users(user_id),
                registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (course_id, user_id)
            );
        `);
        console.log('✅ 檢查並建立 registrations 表完成');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) REFERENCES users(user_id),
                points_amount INTEGER NOT NULL,
                order_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ 檢查並建立 orders 表完成');


        const result = await pool.query('SELECT MAX(id) FROM courses;');
        if (result.rows[0].max) {
            courseIdCounter = result.rows[0].max;
        }
        console.log(`ℹ️ 課程 ID 計數器初始化為: ${courseIdCounter}`);

        // 在所有表都建立完成後，再執行首次清理
        await cleanCoursesDB();
        console.log('✅ 首次資料庫清理完成。');

    } catch (err) {
        console.error('❌ 資料庫初始化失敗:', err);
        process.exit(1); // Exit if DB connection fails
    }
}

// --- LINE Bot SDK Client ---
const client = new Client(config);
const app = express();

app.use(bodyParser.json());
app.use(middleware(config));

// Function to send a push message
async function pushMessage(userId, messages) {
    try {
        await client.pushMessage(userId, messages);
    } catch (error) {
        console.error('❌ 推送訊息失敗:', error);
    }
}

// Function to send a reply message
async function replyMessage(replyToken, messages) {
    try {
        await client.replyMessage(replyToken, messages);
    } catch (error) {
        console.error('❌ 回覆訊息失敗:', error);
    }
}

// --- Helper Functions ---

// Generate Course ID
function generateCourseId(id) {
    return `C${String(id).padStart(3, '0')}`;
}

// Get user role
async function getUserRole(userId) {
    try {
        const result = await pool.query('SELECT role FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length > 0) {
            return result.rows[0].role;
        }
        return null;
    } catch (err) {
        console.error('❌ 獲取用戶角色失敗:', err);
        return null;
    }
}

// Check if user exists
async function userExists(userId) {
    const result = await pool.query('SELECT 1 FROM users WHERE user_id = $1', [userId]);
    return result.rows.length > 0;
}

// Register user
async function registerUser(userId, role, password = null) {
    try {
        await pool.query('INSERT INTO users (user_id, role, password) VALUES ($1, $2, $3)', [userId, role, password]);
        console.log(`用戶 ${userId} 註冊為 ${role} 成功`);
        return true;
    } catch (err) {
        console.error('❌ 註冊用戶失敗:', err);
        return false;
    }
}

// Clean up old courses
async function cleanCoursesDB() {
    try {
        const now = moment().tz('Asia/Taipei');
        // Delete courses that are in the past and have no registrations
        const deleteResult = await pool.query(`
            DELETE FROM courses
            WHERE date < $1::date OR (date = $1::date AND time <= $2::time)
            AND id NOT IN (SELECT course_id FROM registrations)
            RETURNING *;
        `, [now.format('YYYY-MM-DD'), now.format('HH:mm:ss')]);
        console.log(`✅ 已清理 ${deleteResult.rows.length} 筆過期且無人報名的課程。`);
    } catch (err) {
        console.error('❌ 清理過期課程失敗:', err);
    }
}

// --- LINE Message Templates ---

function createTeacherDashboard() {
    return {
        type: 'text',
        text: '請選擇課程管理功能：',
        quickReply: {
            items: [
                { type: 'action', action: { type: 'message', label: '新增課程', text: COMMANDS.TEACHER.ADD_COURSE } },
                { type: 'action', action: { type: 'message', label: '課程列表', text: COMMANDS.TEACHER.LIST_COURSES } },
                { type: 'action', action: { type: 'message', label: '取消課程', text: COMMANDS.TEACHER.CANCEL_COURSE } },
                { type: 'action', action: { type: 'message', label: '學員列表', text: COMMANDS.TEACHER.STUDENT_LIST } },
                { type: 'action', action: { type: 'message', label: '切換身份', text: COMMANDS.TEACHER.SWITCH_IDENTITY } },
                { type: 'action', action: { type: 'message', label: '重設密碼', text: COMMANDS.TEACHER.RESET_PASSWORD } },
            ],
        },
    };
}

function createStudentDashboard() {
    return {
        type: 'text',
        text: '請選擇學員專區功能：',
        quickReply: {
            items: [
                { type: 'action', action: { type: 'message', label: '報名課程', text: COMMANDS.STUDENT.REGISTER_COURSE } },
                { type: 'action', action: { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.LIST_MY_COURSES } },
                { type: 'action', action: { type: 'message', label: '取消報名', text: COMMANDS.STUDENT.CANCEL_REGISTRATION } },
                { type: 'action', action: { type: 'message', label: '查看點數', text: COMMANDS.STUDENT.VIEW_POINTS } },
                { type: 'action', action: { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.BUY_POINTS } },
                { type: 'action', action: { type: 'message', label: '切換身份', text: COMMANDS.STUDENT.SWITCH_IDENTITY } },
            ],
        },
    };
}

// --- Teacher Specific Handlers ---

async function listCourses(replyToken, type = 'all', userId = null) {
    try {
        const now = moment().tz('Asia/Taipei');
        let query = 'SELECT course_id, name, date, time, max_capacity, points_cost FROM courses WHERE is_cancelled = FALSE ';
        const params = [];

        if (type === 'upcoming') {
            query += 'AND (date > $1 OR (date = $1 AND time > $2)) ';
            params.push(now.format('YYYY-MM-DD'), now.format('HH:mm:ss'));
        }

        query += 'ORDER BY date ASC, time ASC;';

        const result = await pool.query(query, params);
        const courses = result.rows;

        if (courses.length === 0) {
            let message = '目前沒有任何課程。';
            if (type === 'upcoming') message = '目前沒有任何即將到來的課程。';
            await replyMessage(replyToken, [{ type: 'text', text: message }]);
            return;
        }

        const messages = [];
        let courseListText = '已建立課程列表:\n';

        for (const course of courses) {
            const courseDateTime = moment(`${course.date} ${course.time}`).tz('Asia/Taipei');
            const formattedDate = courseDateTime.format('MM-DD (ddd)'); // e.g., 07-23 (三)
            const formattedTime = courseDateTime.format('HH:mm'); // e.g., 23:00

            const registrationCountResult = await pool.query(
                'SELECT COUNT(*) FROM registrations WHERE course_id = (SELECT id FROM courses WHERE course_id = $1)',
                [course.course_id]
            );
            const registeredCount = registrationCountResult.rows[0].count;

            const remainingCapacity = course.max_capacity - registeredCount;
            const status = remainingCapacity <= 0 ? '已額滿' : `可報名 ${remainingCapacity}`;

            courseListText += `\nID ${course.course_id}\n📅 ${formattedDate} ${formattedTime} | ${course.name}\n💰 扣點: ${course.points_cost} 點 | 👥 上限 ${course.max_capacity}\n✅ 已報 ${registeredCount} | 🕒 候補 0`;
        }
        messages.push({ type: 'text', text: courseListText });
        await replyMessage(replyToken, messages);

    } catch (err) {
        console.error('❌ 查詢課程列表失敗:', err);
        await replyMessage(replyToken, [{ type: 'text', text: '查詢課程列表時發生錯誤。' }]);
    }
}

async function handleCancelCourse(replyToken, userId) {
    try {
        const now = moment().tz('Asia/Taipei');
        const result = await pool.query(
            'SELECT id, course_id, name, date, time FROM courses WHERE (date > $1 OR (date = $1 AND time > $2)) AND is_cancelled = FALSE ORDER BY date ASC, time ASC',
            [now.format('YYYY-MM-DD'), now.format('HH:mm:ss')]
        );
        const upcomingCourses = result.rows;

        if (upcomingCourses.length === 0) {
            await replyMessage(replyToken, [{ type: 'text', text: '目前沒有可以取消的課程。' }]);
            userState.currentAction[userId] = null; // Reset action
            return;
        }

        const quickReplyItems = upcomingCourses.map(course => {
            const courseDateTime = moment(`${course.date} ${course.time}`).tz('Asia/Taipei');
            const formattedDate = courseDateTime.format('MM-DD (ddd)');
            const formattedTime = courseDateTime.format('HH:mm');
            return {
                type: 'action',
                action: {
                    type: 'postback',
                    label: `${course.course_id} - ${formattedDate} ${formattedTime} ${course.name}`,
                    data: `action=cancel_course_select&courseId=${course.id}`, // Use course.id
                },
            };
        });

        await replyMessage(replyToken, [
            {
                type: 'text',
                text: '請選擇要取消的課程：',
                quickReply: {
                    items: quickReplyItems,
                },
            },
        ]);
        userState.currentAction[userId] = 'waiting_for_cancel_course_selection'; // Set state

    } catch (err) {
        console.error('❌ 處理取消課程功能時失敗:', err);
        await replyMessage(replyToken, [{ type: 'text', text: '載入取消課程選項時發生錯誤。' }]);
        userState.currentAction[userId] = null; // Reset action
    }
}

async function confirmCancelCourse(replyToken, userId, courseDbId) {
    try {
        const result = await pool.query('SELECT course_id, name, date, time FROM courses WHERE id = $1', [courseDbId]);
        if (result.rows.length === 0) {
            await replyMessage(replyToken, [{ type: 'text', text: '找不到該課程，可能已被取消或不存在。' }]);
            userState.currentAction[userId] = null;
            userState.selectedCourseToCancel[userId] = null;
            return;
        }
        const course = result.rows[0];
        const courseDateTime = moment(`${course.date} ${course.time}`).tz('Asia/Taipei');
        const formattedDate = courseDateTime.format('MM-DD (ddd)');
        const formattedTime = courseDateTime.format('HH:mm');

        userState.selectedCourseToCancel[userId] = courseDbId; // Store DB ID

        await replyMessage(replyToken, [
            {
                type: 'text',
                text: `確認要取消課程『${course.course_id} - ${formattedDate} ${formattedTime} ${course.name}』嗎？\n\n所有已報名的學員將會收到通知。`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '✅ 是，確認取消', data: 'action=confirm_cancel_course' } },
                        { type: 'action', action: { type: 'postback', label: '❌ 否，返回', data: 'action=cancel_operation' } },
                    ],
                },
            },
        ]);
        userState.currentAction[userId] = 'waiting_for_cancel_course_confirmation';
    } catch (err) {
        console.error('❌ 確認取消課程時失敗:', err);
        await replyMessage(replyToken, [{ type: 'text', text: '確認取消課程時發生錯誤。' }]);
        userState.currentAction[userId] = null;
        userState.selectedCourseToCancel[userId] = null;
    }
}

async function executeCancelCourse(replyToken, userId) {
    const courseDbId = userState.selectedCourseToCancel[userId];
    if (!courseDbId) {
        await replyMessage(replyToken, [{ type: 'text', text: '未選擇要取消的課程。' }]);
        userState.currentAction[userId] = null;
        return;
    }

    try {
        // Fetch course details before deleting for notification
        const courseResult = await pool.query('SELECT course_id, name, date, time FROM courses WHERE id = $1', [courseDbId]);
        if (courseResult.rows.length === 0) {
            await replyMessage(replyToken, [{ type: 'text', text: '找不到該課程，可能已被取消。' }]);
            userState.currentAction[userId] = null;
            userState.selectedCourseToCancel[userId] = null;
            return;
        }
        const course = courseResult.rows[0];
        const courseDateTime = moment(`${course.date} ${course.time}`).tz('Asia/Taipei');
        const formattedDate = courseDateTime.format('MM-DD (ddd)');
        const formattedTime = courseDateTime.format('HH:mm');

        // Get registered students before deleting registrations
        const registeredStudentsResult = await pool.query(
            'SELECT user_id FROM registrations WHERE course_id = $1',
            [courseDbId]
        );
        const registeredStudentIds = registeredStudentsResult.rows.map(row => row.user_id);

        // Delete registrations first
        await pool.query('DELETE FROM registrations WHERE course_id = $1', [courseDbId]);
        console.log(`已刪除課程 ${course.course_id} 的所有報名記錄。`);

        // Mark course as cancelled (instead of deleting to keep history)
        await pool.query('UPDATE courses SET is_cancelled = TRUE WHERE id = $1', [courseDbId]);
        console.log(`已將課程 ${course.course_id} 標記為已取消。`);

        await replyMessage(replyToken, [
            { type: 'text', text: `課程『${course.course_id} - ${course.name}』已取消。` },
            { type: 'text', text: '所有相關學員已收到通知。' }
        ]);

        // Notify registered students
        const notificationMessage = `您報名的課程『${course.course_id} - ${formattedDate} ${formattedTime} ${course.name}』已被老師取消，請注意。`;
        for (const studentId of registeredStudentIds) {
            if (studentId !== userId) { // Don't notify the teacher if they are also registered somehow
                await pushMessage(studentId, [{ type: 'text', text: notificationMessage }]);
            }
        }

    } catch (err) {
        console.error('❌ 執行取消課程時失敗:', err);
        await replyMessage(replyToken, [{ type: 'text', text: '執行取消課程時發生錯誤。' }]);
    } finally {
        userState.currentAction[userId] = null; // Reset action
        userState.selectedCourseToCancel[userId] = null; // Clear selected course
    }
}


// --- Main Event Handler ---
app.post('/webhook', middleware(config), async (req, res) => {
    const events = req.body.events;
    console.log('--- Received LINE Webhook Events ---'); // Added log
    console.log(JSON.stringify(events, null, 2)); // Added log to see raw events

    for (const event of events) {
        try {
            await handleEvent(event);
        } catch (err) {
            console.error('❌ 事件處理失敗:', err);
        }
    }
    res.sendStatus(200);
});

async function handleEvent(event) {
    // START ADDED LOGGING
    console.log('Received event:', JSON.stringify(event, null, 2)); // 打印原始事件對象

    const userId = event.source.userId;
    if (!userId) {
        console.error('❌ 無法獲取用戶ID，跳過此事件。');
        return;
    }
    console.log(`處理用戶 ${userId} 的事件.`); // Added log
    // END ADDED LOGGING

    const role = await getUserRole(userId);
    userState.isTeacher[userId] = (role === 'teacher');
    userState.isStudent[userId] = (role === 'student');
    userState.loggedIn[userId] = !!role;

    if (event.type === 'message') {
        const { replyToken } = event;
        const { type, text } = event.message;

        // START ADDED LOGGING
        console.log(`Message type: ${type}`); // Added log
        if (type === 'text') {
            console.log(`Received text: "${text}"`); // Added log
        }
        // END ADDED LOGGING

        if (type === 'text') {
            if (!userState.loggedIn[userId]) {
                // Not logged in, handle initial login/registration
                if (text === COMMANDS.TEACHER.SWITCH_IDENTITY || text === COMMANDS.STUDENT.SWITCH_IDENTITY) {
                    userState.currentAction[userId] = 'waiting_for_role_selection';
                    await replyMessage(replyToken, [{
                        type: 'text',
                        text: '請選擇您的身份：',
                        quickReply: {
                            items: [
                                { type: 'action', action: { type: 'postback', label: '老師', data: 'action=select_role&role=teacher' } },
                                { type: 'action', action: { type: 'postback', label: '學員', data: 'action=select_role&role=student' } },
                            ],
                        },
                    }]);
                } else {
                    await replyMessage(replyToken, [{ type: 'text', text: '您尚未登入。請輸入 `@切換身份` 來選擇您的身份。' }]);
                }
                return;
            }

            if (userState.isTeacher[userId]) {
                // START ADDED LOGGING
                console.log(`User ${userId} is a teacher. Current action: ${userState.currentAction[userId]}`); // Added log
                // END ADDED LOGGING
                await handleTeacherCommands(replyToken, text, userId);
            } else if (userState.isStudent[userId]) {
                // START ADDED LOGGING
                console.log(`User ${userId} is a student. Current action: ${userState.currentAction[userId]}`); // Added log
                // END ADDED LOGGING
                await handleStudentCommands(replyToken, text, userId);
            }
        }
    } else if (event.type === 'postback') {
        const { replyToken } = event;
        const { data } = event.postback;

        // START ADDED LOGGING
        console.log(`Received postback data: "${data}"`); // Added log
        // END ADDED LOGGING

        const params = new URLSearchParams(data);
        const action = params.get('action');

        if (action === 'select_role') {
            const role = params.get('role');
            if (role === 'teacher') {
                await replyMessage(replyToken, [{ type: 'text', text: '請輸入老師密碼登入。' }]);
                userState.currentAction[userId] = 'waiting_for_teacher_password';
            } else if (role === 'student') {
                if (!(await userExists(userId))) {
                    await registerUser(userId, 'student');
                    await replyMessage(replyToken, [{ type: 'text', text: '您已成功註冊為學員！' }]);
                } else {
                    await pool.query('UPDATE users SET role = $1 WHERE user_id = $2', ['student', userId]);
                    await replyMessage(replyToken, [{ type: 'text', text: '已切換為學員身份。' }]);
                }
                userState.isStudent[userId] = true;
                userState.isTeacher[userId] = false;
                userState.loggedIn[userId] = true;
                userState.currentAction[userId] = null;
                await replyMessage(replyToken, [createStudentDashboard()]); // Show student dashboard
            }
        } else if (userState.isTeacher[userId]) {
            // Teacher postback actions
            if (action === 'cancel_course_select') {
                const courseDbId = params.get('courseId');
                console.log(`Teacher selected course DB ID ${courseDbId} for cancellation.`); // Added log
                await confirmCancelCourse(replyToken, userId, courseDbId);
            } else if (action === 'confirm_cancel_course') {
                console.log(`Teacher confirmed cancellation for course DB ID ${userState.selectedCourseToCancel[userId]}.`); // Added log
                await executeCancelCourse(replyToken, userId);
            } else if (action === 'cancel_operation') {
                console.log('Teacher cancelled the current operation.'); // Added log
                userState.currentAction[userId] = null; // Reset action
                userState.selectedCourseToCancel[userId] = null;
                await replyMessage(replyToken, [
                    { type: 'text', text: '操作已取消。' },
                    createTeacherDashboard(),
                ]);
            }
            // Add other teacher postback actions here if any
        } else if (userState.isStudent[userId]) {
            // Student postback actions
            // Example:
            // if (action === 'register_course_select') { ... }
        }
    }
}


// --- Teacher Command Handler ---
async function handleTeacherCommands(replyToken, text, userId) {
    const currentAction = userState.currentAction[userId];
    console.log(`handleTeacherCommands: currentAction=${currentAction}, text="${text}"`); // Added log

    if (currentAction === 'waiting_for_teacher_password') {
        const teacherPassword = process.env.TEACHER_PASSWORD;
        if (text === teacherPassword) {
            if (!(await userExists(userId))) {
                await registerUser(userId, 'teacher', teacherPassword);
            } else {
                await pool.query('UPDATE users SET role = $1, password = $2 WHERE user_id = $3', ['teacher', teacherPassword, userId]);
            }
            userState.isTeacher[userId] = true;
            userState.isStudent[userId] = false;
            userState.loggedIn[userId] = true;
            userState.currentAction[userId] = null;
            await replyMessage(replyToken, [{ type: 'text', text: '老師登入成功。' }, createTeacherDashboard()]);
        } else {
            await replyMessage(replyToken, [{ type: 'text', text: '密碼錯誤，請重新輸入。' }]);
        }
        return;
    }

    // Handle commands based on current action or direct command
    switch (currentAction) {
        case 'waiting_for_course_name':
            userState.courseData[userId].name = text;
            userState.currentAction[userId] = 'waiting_for_course_date';
            await replyMessage(replyToken, [{ type: 'text', text: '請輸入課程日期 (YYYY-MM-DD)，例如：2025-07-25' }]);
            break;

        case 'waiting_for_course_date':
            // Basic date validation
            if (!moment(text, 'YYYY-MM-DD', true).isValid()) {
                await replyMessage(replyToken, [{ type: 'text', text: '日期格式不正確，請使用 YYYY-MM-DD 格式，例如：2025-07-25' }]);
                break;
            }
            userState.courseData[userId].date = text;
            userState.currentAction[userId] = 'waiting_for_course_time';
            await replyMessage(replyToken, [{ type: 'text', text: '請輸入課程時間 (HH:mm)，例如：19:00' }]);
            break;

        case 'waiting_for_course_time':
            // Basic time validation
            if (!moment(text, 'HH:mm', true).isValid()) {
                await replyMessage(replyToken, [{ type: 'text', text: '時間格式不正確，請使用 HH:mm 格式，例如：19:00' }]);
                break;
            }
            userState.courseData[userId].time = text;
            userState.currentAction[userId] = 'waiting_for_course_capacity';
            await replyMessage(replyToken, [{ type: 'text', text: '請輸入課程人數上限 (數字)。' }]);
            break;

        case 'waiting_for_course_capacity':
            const capacity = parseInt(text, 10);
            if (isNaN(capacity) || capacity <= 0) {
                await replyMessage(replyToken, [{ type: 'text', text: '人數上限必須是正整數。' }]);
                break;
            }
            userState.courseData[userId].max_capacity = capacity;
            userState.currentAction[userId] = 'waiting_for_course_points';
            await replyMessage(replyToken, [{ type: 'text', text: '請輸入課程所需扣除點數 (數字)。' }]);
            break;

        case 'waiting_for_course_points':
            const points = parseInt(text, 10);
            if (isNaN(points) || points <= 0) {
                await replyMessage(replyToken, [{ type: 'text', text: '扣除點數必須是正整數。' }]);
                break;
            }
            userState.courseData[userId].points_cost = points;
            userState.currentAction[userId] = 'waiting_for_course_confirmation'; // Set for confirmation
            const course = userState.courseData[userId];
            await replyMessage(replyToken, [{
                type: 'text',
                text: `請確認課程資訊：\n名稱: ${course.name}\n日期: ${course.date}\n時間: ${course.time}\n上限: ${course.max_capacity}\n點數: ${course.points_cost}\n\n是否確認新增？`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '確認新增課程', data: 'action=confirm_add_course' } },
                        { type: 'action', action: { type: 'postback', label: '取消新增', data: 'action=cancel_add_course' } },
                    ],
                },
            }]);
            break;

        // Direct commands
        case null: // No ongoing action, process direct commands
        case undefined:
            switch (text) {
                case COMMANDS.TEACHER.DASHBOARD:
                case COMMANDS.COMMON.TEACHER_HOME: // Allow both to bring to dashboard
                    await replyMessage(replyToken, [createTeacherDashboard()]);
                    break;
                case COMMANDS.TEACHER.ADD_COURSE:
                    userState.currentAction[userId] = 'waiting_for_course_name';
                    userState.courseData[userId] = {}; // Initialize course data for new course
                    await replyMessage(replyToken, [{ type: 'text', text: '請輸入課程名稱。' }]);
                    break;
                case COMMANDS.TEACHER.LIST_COURSES:
                    await listCourses(replyToken, 'all');
                    break;
                case COMMANDS.TEACHER.CANCEL_COURSE:
                    console.log(`Teacher ${userId} requested to cancel course. Calling handleCancelCourse.`); // Added log
                    await handleCancelCourse(replyToken, userId);
                    break;
                case COMMANDS.TEACHER.STUDENT_LIST:
                    // Implement student list logic
                    await replyMessage(replyToken, [{ type: 'text', text: '學員列表功能尚未實作。' }]);
                    break;
                case COMMANDS.TEACHER.SWITCH_IDENTITY:
                    userState.currentAction[userId] = 'waiting_for_role_selection'; // Re-enter role selection
                    await replyMessage(replyToken, [{
                        type: 'text',
                        text: '請選擇您的身份：',
                        quickReply: {
                            items: [
                                { type: 'action', action: { type: 'postback', label: '老師', data: 'action=select_role&role=teacher' } },
                                { type: 'action', action: { type: 'postback', label: '學員', data: 'action=select_role&role=student' } },
                            ],
                        },
                    }]);
                    break;
                case COMMANDS.TEACHER.RESET_PASSWORD:
                    // Implement reset password logic
                    await replyMessage(replyToken, [{ type: 'text', text: '重設密碼功能尚未實作。' }]);
                    break;
                default:
                    console.log(`Teacher ${userId} sent unrecognized command: "${text}"`); // Added log
                    await replyMessage(replyToken, [{ type: 'text', text: '指令無效，請使用下方老師選單或輸入正確指令。' }, createTeacherDashboard()]);
                    break;
            }
            break;
        default:
            console.log(`Teacher ${userId} sent text in an unhandled currentAction state: ${currentAction}, text: "${text}"`); // Added log
            await replyMessage(replyToken, [{ type: 'text', text: '請依照目前的提示操作，或輸入 `@返回老師主選單`。' }, createTeacherDashboard()]);
            break;
    }
}

// --- Student Specific Handlers (Placeholders for now) ---
async function handleStudentCommands(replyToken, text, userId) {
    const currentAction = userState.currentAction[userId];
    console.log(`handleStudentCommands: currentAction=${currentAction}, text="${text}"`); // Added log

    switch (currentAction) {
        // ... student-specific action handlers like 'waiting_for_registration_confirmation'
        case null: // No ongoing action, process direct commands
        case undefined:
            switch (text) {
                case COMMANDS.STUDENT.DASHBOARD:
                case COMMANDS.COMMON.STUDENT_HOME:
                    await replyMessage(replyToken, [createStudentDashboard()]);
                    break;
                case COMMANDS.STUDENT.REGISTER_COURSE:
                    await replyMessage(replyToken, [{ type: 'text', text: '報名課程功能尚未實作。' }]);
                    break;
                case COMMANDS.STUDENT.LIST_MY_COURSES:
                    await replyMessage(replyToken, [{ type: 'text', text: '我的課程功能尚未實作。' }]);
                    break;
                case COMMANDS.STUDENT.CANCEL_REGISTRATION:
                    await replyMessage(replyToken, [{ type: 'text', text: '取消報名功能尚未實作。' }]);
                    break;
                case COMMANDS.STUDENT.VIEW_POINTS:
                    await replyMessage(replyToken, [{ type: 'text', text: '查看點數功能尚未實作。' }]);
                    break;
                case COMMANDS.STUDENT.BUY_POINTS:
                    await replyMessage(replyToken, [{ type: 'text', text: '購買點數功能尚未實作。' }]);
                    break;
                case COMMANDS.STUDENT.SWITCH_IDENTITY:
                    userState.currentAction[userId] = 'waiting_for_role_selection';
                    await replyMessage(replyToken, [{
                        type: 'text',
                        text: '請選擇您的身份：',
                        quickReply: {
                            items: [
                                { type: 'action', action: { type: 'postback', label: '老師', data: 'action=select_role&role=teacher' } },
                                { type: 'action', action: { type: 'postback', label: '學員', data: 'action=select_role&role=student' } },
                            ],
                        },
                    }]);
                    break;
                default:
                    console.log(`Student ${userId} sent unrecognized command: "${text}"`); // Added log
                    await replyMessage(replyToken, [{ type: 'text', text: '指令無效，請使用下方學員選單或輸入正確指令。' }, createStudentDashboard()]);
                    break;
            }
            break;
        default:
            console.log(`Student ${userId} sent text in an unhandled currentAction state: ${currentAction}, text: "${text}"`); // Added log
            await replyMessage(replyToken, [{ type: 'text', text: '請依照目前的提示操作，或輸入 `@返回學員主選單`。' }, createStudentDashboard()]);
            break;
    }
}


// --- Server Start ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
    try {
        await pool.connect();
        console.log('✅ 成功連接到 PostgreSQL 資料庫');
        await initializeDatabase();

        // Keep-alive mechanism for Render free tier
        // This will ping the bot every 5 minutes to prevent it from spinning down due to inactivity.
        if (process.env.KEEP_ALIVE_URL) {
            console.log('Bot 版本: V4.0.0 (導入 PostgreSQL 資料庫)');
            console.log('啟用 Keep-alive 功能，將每 5 分鐘 Ping 自身。');
            setInterval(async () => {
                try {
                    const response = await fetch(process.env.KEEP_ALIVE_URL);
                    console.log(`Keep-alive response: ${response.status}`);
                } catch (error) {
                    console.error('Keep-alive ping failed:', error);
                }
            }, 5 * 60 * 1000); // Every 5 minutes
        }
    } catch (err) {
        console.error('❌ 啟動失敗或資料庫連接失敗:', err);
    }
});

// For Render's health check
app.get('/', (req, res) => {
    res.send('Bot is running!');
});
