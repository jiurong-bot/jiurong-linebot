require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const axios = require('axios');
const { WebClient } = require('@slack/web-api');
const moment = require('moment-timezone'); // 引入 moment-timezone

const { Configuration, OpenAIApi } = require("openai");

// OpenAI 配置
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Slack 配置
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

// LINE Bot 配置
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 定義指令
const COMMANDS = {
    MAIN_MENU: '主選單',
    STUDENT: {
        HELP: '🆘學生幫助',
        RESERVATION: '📚我要預約',
        MY_RESERVATION: '🗓️我的預約',
        CANCEL_RESERVATION: '🚫取消預約',
        CHECK_POINTS: '💰查詢點數',
    },
    TEACHER: {
        COURSE_MANAGEMENT: '@課程管理', // 將其作為內部指令標識
        ADD_COURSE: '➕新增課程',
        COURSE_LIST: '📜課程列表',
        CANCEL_COURSE: '✖️取消課程',
    },
    ADMIN: {
        MANAGE_POINTS: '點數管理',
        ADD_POINTS: '➕新增點數',
        DEDUCT_POINTS: '➖扣除點數',
        VIEW_ALL_USERS: '👥查看所有用戶',
    },
    GLOBAL: {
        VIEW_PROFILE: '個人資料',
        BIND_SLACK: '綁定Slack',
        UNBIND_SLACK: '解除綁定Slack',
    }
};

// 狀態管理 (簡易範例，實際應用應使用資料庫)
const userStates = {}; // 儲存用戶狀態和資料
const courseSchedules = {}; // 儲存課程排程，key為courseId
const userPoints = {}; // 儲存用戶點數
const slackUsers = {}; // 儲存Slack用戶綁定資訊 { lineUserId: slackUserId }

// 儲存老師正在新增的課程資訊
const teacherAddingCourse = {}; // { lineUserId: { stage: 'waitingTitle', data: {} } }

// 儲存用戶正在預約的課程ID
const userReservingCourse = {}; // { lineUserId: courseId }

// 儲存正在取消預約的課程ID
const userCancelingReservation = {}; // { lineUserId: reservationId }

// 儲存正在取消課程的課程ID
const teacherCancelingCourse = {}; // { lineUserId: courseId }

// 儲存正在取消課程系列的prefix
const teacherCancelingCourseGroup = {}; // { lineUserId: prefix }

// 儲存管理員正在操作的點數用戶
const adminManagingPoints = {}; // { adminLineUserId: { stage: 'waitingUserId', action: 'add'/'deduct', userId: '' } }

// 儲存所有課程的資訊
const allCourses = {}; // { courseId: { title, time, pointsCost, teacherId, maxCapacity, students: [] } }

// 儲存所有用戶資訊 (模擬資料庫)
const allUsers = {}; // { lineUserId: { name, role, lineDisplayName, slackUserId, points } }

// ===== 輔助函數 =====

// 格式化日期時間
function formatDateTime(isoString) {
    return moment(isoString).tz('Asia/Taipei').format('YYYY年MM月DD日 HH:mm');
}

// 格式化日期
function formatDate(isoString) {
    return moment(isoString).tz('Asia/Taipei').format('YYYY年MM月DD日');
}

// 格式化時間
function formatTime(isoString) {
    return moment(isoString).tz('Asia/Taipei').format('HH:mm');
}

// 生成隨機ID
function generateId(prefix = '') {
    return prefix + Math.random().toString(36).substr(2, 9);
}

// 獲取用戶角色
async function getUserRole(userId) {
    if (allUsers[userId] && allUsers[userId].role) {
        return allUsers[userId].role;
    }
    // 預設為學生
    return 'student';
}

// 獲取用戶Line顯示名稱
async function getLineDisplayName(userId) {
    if (allUsers[userId] && allUsers[userId].lineDisplayName) {
        return allUsers[userId].lineDisplayName;
    }
    try {
        const profile = await client.getProfile(userId);
        allUsers[userId] = { ...allUsers[userId], lineDisplayName: profile.displayName };
        return profile.displayName;
    } catch (error) {
        console.error('Error getting profile:', error);
        return '未知用戶';
    }
}

// 初始化用戶 (如果不存在)
async function initializeUser(userId) {
    if (!allUsers[userId]) {
        const profile = await client.getProfile(userId);
        allUsers[userId] = {
            name: profile.displayName,
            lineDisplayName: profile.displayName,
            role: 'student', // 預設為學生
            points: 100, // 初始點數
            slackUserId: null,
            lineUserId: userId,
        };
        console.log(`Initialized new user: ${allUsers[userId].name} (${userId})`);
    }
}

// 獲取所有課程
async function getAllCourses() {
    return allCourses;
}

// 獲取用戶預約
async function getUserReservations(userId) {
    const reservations = [];
    for (const courseId in allCourses) {
        const course = allCourses[courseId];
        if (course.students.includes(userId)) {
            reservations.push({
                courseId: courseId,
                title: course.title,
                time: course.time,
                teacherId: course.teacherId,
                reservationId: `${courseId}-${userId}`, // 簡易生成預約ID
            });
        }
    }
    return reservations;
}

// 將 Flex Message 回傳
async function reply(replyToken, messages, quickReplyItems = []) {
    const replyMessages = Array.isArray(messages) ? messages : [messages];

    if (quickReplyItems.length > 0) {
        replyMessages[replyMessages.length - 1].quickReply = {
            items: quickReplyItems.map(item => ({
                type: 'action',
                action: item,
            })),
        };
    }

    return client.replyMessage(replyToken, replyMessages);
}

// 傳送訊息給特定用戶
async function pushMessage(userId, messages) {
    const pushMessages = Array.isArray(messages) ? messages : [messages];
    return client.pushMessage(userId, pushMessages);
}

// ==== Rich Menu 相關 ====
// 這裡定義 Rich Menu 的結構和操作，確保課程管理是 Postback
async function createRichMenu() {
    const richMenuObject = {
        size: { width: 2500, height: 1686 },
        mode: 'richmenu',
        areas: [
            // 學生主選單
            {
                bounds: { x: 0, y: 0, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.STUDENT.RESERVATION, text: COMMANDS.STUDENT.RESERVATION }
            },
            {
                bounds: { x: 833, y: 0, width: 834, height: 843 },
                action: { type: 'message', label: COMMANDS.STUDENT.MY_RESERVATION, text: COMMANDS.STUDENT.MY_RESERVATION }
            },
            {
                bounds: { x: 1667, y: 0, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_RESERVATION, text: COMMANDS.STUDENT.CANCEL_RESERVATION }
            },
            {
                bounds: { x: 0, y: 843, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.STUDENT.CHECK_POINTS, text: COMMANDS.STUDENT.CHECK_POINTS }
            },
            {
                bounds: { x: 833, y: 843, width: 834, height: 843 },
                action: { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE }
            },
            {
                bounds: { x: 1667, y: 843, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.STUDENT.HELP, text: COMMANDS.STUDENT.HELP }
            },
            // 老師主選單 (隱藏，通常在程式碼中動態切換)
            // {
            //     bounds: { x: 0, y: 0, width: 1250, height: 843 },
            //     action: { type: 'postback', label: '課程管理', data: `action=run_command&text=${COMMANDS.TEACHER.COURSE_MANAGEMENT}` } // Postback 方式
            // },
            // {
            //     bounds: { x: 1250, y: 0, width: 1250, height: 843 },
            //     action: { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE }
            // }
        ]
    };

    try {
        const richMenuId = await client.createRichMenu(richMenuObject);
        console.log('Rich Menu created:', richMenuId);
        // 設定預設 Rich Menu
        // await client.setDefaultRichMenu(richMenuId); // 這裡通常會為不同角色設定不同的預設菜單

        // 上傳圖片，然後綁定
        // const imagePath = path.resolve(__dirname, 'rich_menu_image.png'); // 確保有這張圖片
        // await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));

        return richMenuId;
    } catch (error) {
        console.error('Error creating rich menu:', error);
    }
}

// 根據用戶角色設定 Rich Menu
async function setRichMenuForUser(userId, role) {
    let richMenuId;

    const studentRichMenuId = process.env.RICH_MENU_STUDENT_ID || await createRichMenu(); // 假設學生菜單已創建並存為環境變數
    const teacherRichMenuId = process.env.RICH_MENU_TEACHER_ID || await createTeacherRichMenu(); // 假設老師菜單已創建
    const adminRichMenuId = process.env.RICH_MENU_ADMIN_ID || await createAdminRichMenu(); // 假設管理員菜單已創建

    if (role === 'teacher') {
        richMenuId = teacherRichMenuId;
    } else if (role === 'admin') {
        richMenuId = adminRichMenuId;
    } else { // 預設為學生
        richMenuId = studentRichMenuId;
    }

    if (richMenuId) {
        await client.linkRichMenuToUser(userId, richMenuId);
        console.log(`Linked Rich Menu ${richMenuId} to user ${userId} with role ${role}`);
    } else {
        console.warn(`No Rich Menu ID found for role: ${role}`);
    }
}

// 創建老師的 Rich Menu
async function createTeacherRichMenu() {
    const richMenuObject = {
        size: { width: 2500, height: 1686 },
        mode: 'richmenu',
        areas: [
            {
                bounds: { x: 0, y: 0, width: 1250, height: 843 },
                action: { type: 'postback', label: '課程管理', data: `action=run_command&text=${COMMANDS.TEACHER.COURSE_MANAGEMENT}` } // Postback 方式
            },
            {
                bounds: { x: 1250, y: 0, width: 1250, height: 843 },
                action: { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE }
            }
        ]
    };
    try {
        const richMenuId = await client.createRichMenu(richMenuObject);
        console.log('Teacher Rich Menu created:', richMenuId);
        // 上傳圖片 (這裡需要你手動上傳對應的圖片)
        return richMenuId;
    } catch (error) {
        console.error('Error creating teacher rich menu:', error);
    }
}

// 創建管理員的 Rich Menu
async function createAdminRichMenu() {
    const richMenuObject = {
        size: { width: 2500, height: 1686 },
        mode: 'richmenu',
        areas: [
            {
                bounds: { x: 0, y: 0, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.ADMIN.MANAGE_POINTS, text: COMMANDS.ADMIN.MANAGE_POINTS }
            },
            {
                bounds: { x: 833, y: 0, width: 834, height: 843 },
                action: { type: 'message', label: COMMANDS.ADMIN.VIEW_ALL_USERS, text: COMMANDS.ADMIN.VIEW_ALL_USERS }
            },
            {
                bounds: { x: 1667, y: 0, width: 833, height: 843 },
                action: { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE }
            }
        ]
    };
    try {
        const richMenuId = await client.createRichMenu(richMenuObject);
        console.log('Admin Rich Menu created:', richMenuId);
        // 上傳圖片 (這裡需要你手動上傳對應的圖片)
        return richMenuId;
    } catch (error) {
        console.error('Error creating admin rich menu:', error);
    }
}


// ===== 快速回覆選單定義 =====
const mainMenuBtn = { type: 'message', label: COMMANDS.MAIN_MENU, text: COMMANDS.MAIN_MENU };

const studentMenu = [
    { type: 'message', label: COMMANDS.STUDENT.RESERVATION, text: COMMANDS.STUDENT.RESERVATION },
    { type: 'message', label: COMMANDS.STUDENT.MY_RESERVATION, text: COMMANDS.STUDENT.MY_RESERVATION },
    { type: 'message', label: COMMANDS.STUDENT.CANCEL_RESERVATION, text: COMMANDS.STUDENT.CANCEL_RESERVATION },
    { type: 'message', label: COMMANDS.STUDENT.CHECK_POINTS, text: COMMANDS.STUDENT.CHECK_POINTS },
    { type: 'message', label: COMMANDS.STUDENT.HELP, text: COMMANDS.STUDENT.HELP },
    { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE },
];

const teacherMenu = [
    { type: 'postback', label: '課程管理', data: `action=run_command&text=${COMMANDS.TEACHER.COURSE_MANAGEMENT}` }, // Postback 方式
    { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE },
];

const adminMenu = [
    { type: 'message', label: COMMANDS.ADMIN.MANAGE_POINTS, text: COMMANDS.ADMIN.MANAGE_POINTS },
    { type: 'message', label: COMMANDS.ADMIN.VIEW_ALL_USERS, text: COMMANDS.ADMIN.VIEW_ALL_USERS },
    { type: 'message', label: COMMANDS.GLOBAL.VIEW_PROFILE, text: COMMANDS.GLOBAL.VIEW_PROFILE },
];

// ===== 事件處理函數 =====

async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') {
        return Promise.resolve(null);
    }

    const userId = event.source.userId;
    await initializeUser(userId); // 確保用戶已初始化

    const role = await getUserRole(userId);
    const userDisplayName = await getLineDisplayName(userId);

    console.log(`User ${userDisplayName} (${userId}) as ${role} sent:`, event.type === 'message' ? event.message.text : event.postback.data);

    let text;
    if (event.type === 'message') {
        text = event.message.text;
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');

        if (action === 'run_command') {
            text = data.get('text'); // 從 postback data 中獲取指令文字
        } else if (action === 'cancel_reservation') {
            const reservationId = data.get('reservationId');
            return handleCancelReservationConfirmation(event.replyToken, userId, reservationId);
        } else if (action === 'confirm_cancel_reservation') {
            const reservationId = data.get('reservationId');
            return handleCancelReservation(event.replyToken, userId, reservationId);
        } else if (action === 'add_course_start') {
            return handleAddCourseStart(event.replyToken, userId);
        } else if (action === 'manage_course_group') {
            const prefix = data.get('prefix');
            return handleManageCourseGroup(event.replyToken, userId, prefix);
        } else if (action === 'cancel_specific_course') {
            const courseId = data.get('courseId');
            return handleCancelSpecificCourse(event.replyToken, userId, courseId);
        } else if (action === 'cancel_course_group_confirm') {
            const prefix = data.get('prefix');
            return handleCancelCourseGroupConfirmation(event.replyToken, userId, prefix);
        } else if (action === 'confirm_cancel_course_group') {
            const prefix = data.get('prefix');
            return handleCancelCourseGroup(event.replyToken, userId, prefix);
        } else if (action === 'view_course_details') {
            const courseId = data.get('courseId');
            return handleViewCourseDetails(event.replyToken, userId, courseId);
        } else if (action === 'reserve_course') {
            const courseId = data.get('courseId');
            return handleReserveCourseConfirmation(event.replyToken, userId, courseId);
        } else if (action === 'confirm_reserve_course') {
            const courseId = data.get('courseId');
            return handleReserveCourse(event.replyToken, userId, courseId);
        } else if (action === 'set_user_role') {
            const targetUserId = data.get('targetUserId');
            const newRole = data.get('role');
            return handleSetUserRole(event.replyToken, userId, targetUserId, newRole);
        } else {
            // 其他 postback 動作的處理，可能需要設置用戶狀態
            console.log(`Unhandled postback action: ${action}`);
            return Promise.resolve(null);
        }
    }

    // 根據用戶角色處理指令
    if (role === 'student') {
        return handleStudentCommands(event.replyToken, userId, text);
    } else if (role === 'teacher') {
        return handleTeacherCommands(event.replyToken, userId, text);
    } else if (role === 'admin') {
        return handleAdminCommands(event.replyToken, userId, text);
    } else {
        return reply(event.replyToken, { type: 'text', text: '您的身份未被識別，請聯繫管理員。' });
    }
}

// ===== 學生指令處理 =====
async function handleStudentCommands(replyToken, userId, text) {
    const user = allUsers[userId];

    if (text === COMMANDS.MAIN_MENU) {
        userStates[userId] = null; // 清除狀態
        return reply(replyToken, { type: 'text', text: '回到主選單。' }, studentMenu);
    }

    if (userStates[userId] && userStates[userId].stage) {
        const state = userStates[userId];
        if (state.stage === 'waiting_reservation_confirmation') {
            const courseId = userReservingCourse[userId];
            if (text === '確認') {
                return handleReserveCourse(replyToken, userId, courseId);
            } else if (text === '取消') {
                userReservingCourse[userId] = null;
                userStates[userId] = null;
                return reply(replyToken, { type: 'text', text: '已取消預約操作。' }, studentMenu);
            }
        } else if (state.stage === 'waiting_cancel_reservation_confirmation') {
            const reservationId = userCancelingReservation[userId];
            if (text === '確認') {
                return handleCancelReservation(replyToken, userId, reservationId);
            } else if (text === '取消') {
                userCancelingReservation[userId] = null;
                userStates[userId] = null;
                return reply(replyToken, { type: 'text', text: '已取消取消預約操作。' }, studentMenu);
            }
        }
    }

    // 清除預約相關的暫存狀態
    userReservingCourse[userId] = null;
    userCancelingReservation[userId] = null;

    switch (text) {
        case COMMANDS.STUDENT.HELP:
            return reply(replyToken, { type: 'text', text: '學生幫助：您可以預約課程、查詢預約、取消預約和查看點數。' }, studentMenu);

        case COMMANDS.STUDENT.RESERVATION:
            return displayAvailableCourses(replyToken, userId);

        case COMMANDS.STUDENT.MY_RESERVATION:
            return displayUserReservations(replyToken, userId);

        case COMMANDS.STUDENT.CANCEL_RESERVATION:
            return displayReservationsForCancellation(replyToken, userId);

        case COMMANDS.STUDENT.CHECK_POINTS:
            return reply(replyToken, { type: 'text', text: `您目前的點數為：${user.points || 0} 點。` }, studentMenu);

        case COMMANDS.GLOBAL.VIEW_PROFILE:
            return displayUserProfile(replyToken, userId);

        case COMMANDS.GLOBAL.BIND_SLACK:
            if (user.slackUserId) {
                return reply(replyToken, { type: 'text', text: `您已綁定 Slack，您的 Slack ID 為：${user.slackUserId}` }, studentMenu);
            } else {
                userStates[userId] = { stage: 'waiting_slack_id' };
                return reply(replyToken, { type: 'text', text: '請提供您的 Slack ID 以便綁定。' });
            }

        case COMMANDS.GLOBAL.UNBIND_SLACK:
            if (user.slackUserId) {
                const slackUserId = user.slackUserId;
                user.slackUserId = null;
                delete slackUsers[userId];
                return reply(replyToken, { type: 'text', text: `已解除與 Slack ID: ${slackUserId} 的綁定。` }, studentMenu);
            } else {
                return reply(replyToken, { type: 'text', text: '您尚未綁定任何 Slack 帳號。' }, studentMenu);
            }

        default:
            // 讓 GPT-3 處理未知訊息
            return handleGPT3Query(replyToken, userId, text, role);
    }
}

// 顯示可用課程
async function displayAvailableCourses(replyToken, userId) {
    const all = await getAllCourses();
    const now = Date.now();
    const availableCourses = Object.values(all).filter(course =>
        new Date(course.time).getTime() > now && course.students.length < course.maxCapacity && !course.students.includes(userId)
    ).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (availableCourses.length === 0) {
        return reply(replyToken, { type: 'text', text: '目前沒有可預約的課程。' }, studentMenu);
    }

    const courseBubbles = availableCourses.map(course => ({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: course.title, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '名額', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.students.length}/${course.maxCapacity}`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
            ],
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
            contents: [
                { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '預約此課程', data: `action=reserve_course&courseId=${course.id}`, displayText: `預約 ${course.title}` }, },
                { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳情', data: `action=view_course_details&courseId=${course.id}` }, },
            ],
        },
    }));

    const flexMessage = {
        type: 'flex',
        altText: '可預約課程',
        contents: {
            type: 'carousel',
            contents: courseBubbles.slice(0, 10), // 最多顯示10個
        },
    };

    return reply(replyToken, [{ type: 'text', text: '以下是目前可預約的課程：' }, flexMessage], studentMenu);
}

// 處理預約課程確認 (Postback)
async function handleReserveCourseConfirmation(replyToken, userId, courseId) {
    const course = allCourses[courseId];
    if (!course) {
        return reply(replyToken, { type: 'text', text: '課程不存在。' }, studentMenu);
    }

    const user = allUsers[userId];
    if (user.points < course.pointsCost) {
        return reply(replyToken, { type: 'text', text: `您的點數不足，此課程需要 ${course.pointsCost} 點，您目前有 ${user.points} 點。` }, studentMenu);
    }
    if (new Date(course.time).getTime() < Date.now()) {
        return reply(replyToken, { type: 'text', text: '此課程已過期，無法預約。' }, studentMenu);
    }
    if (course.students.includes(userId)) {
        return reply(replyToken, { type: 'text', text: '您已預約過此課程。' }, studentMenu);
    }
    if (course.students.length >= course.maxCapacity) {
        return reply(replyToken, { type: 'text', text: '此課程已額滿。' }, studentMenu);
    }

    userReservingCourse[userId] = courseId;
    userStates[userId] = { stage: 'waiting_reservation_confirmation' };

    return reply(replyToken, {
        type: 'text',
        text: `您確定要預約「${course.title}」嗎？\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost} 點`,
        quickReply: {
            items: [
                { type: 'action', action: { type: 'postback', label: '確認預約', data: `action=confirm_reserve_course&courseId=${courseId}`, displayText: '確認預約' } },
                { type: 'action', action: { type: 'message', label: '取消', text: '取消' } },
            ]
        }
    }, []); // 這裡不給通用菜單，強制用戶選擇
}

// 處理預約課程 (Postback)
async function handleReserveCourse(replyToken, userId, courseId) {
    const course = allCourses[courseId];
    const user = allUsers[userId];

    if (!course || !user) {
        return reply(replyToken, { type: 'text', text: '預約失敗，請重試。' }, studentMenu);
    }

    if (user.points < course.pointsCost) {
        return reply(replyToken, { type: 'text', text: `您的點數不足，此課程需要 ${course.pointsCost} 點，您目前有 ${user.points} 點。` }, studentMenu);
    }
    if (new Date(course.time).getTime() < Date.now()) {
        return reply(replyToken, { type: 'text', text: '此課程已過期，無法預約。' }, studentMenu);
    }
    if (course.students.includes(userId)) {
        return reply(replyToken, { type: 'text', text: '您已預約過此課程。' }, studentMenu);
    }
    if (course.students.length >= course.maxCapacity) {
        return reply(replyToken, { type: 'text', text: '此課程已額滿。' }, studentMenu);
    }

    user.points -= course.pointsCost;
    course.students.push(userId);

    userReservingCourse[userId] = null;
    userStates[userId] = null;

    // 通知老師有學生預約
    if (course.teacherId && allUsers[course.teacherId] && allUsers[course.teacherId].slackUserId) {
        const teacherSlackId = allUsers[course.teacherId].slackUserId;
        await sendSlackMessage(teacherSlackId, `學生 ${user.lineDisplayName} 已預約您的課程：「${course.title}」，時間：${formatDateTime(course.time)}。目前 ${course.students.length}/${course.maxCapacity}。`);
    }

    return reply(replyToken, { type: 'text', text: `已成功預約「${course.title}」！您的點數餘額為：${user.points} 點。` }, studentMenu);
}

// 查看課程詳情
async function handleViewCourseDetails(replyToken, userId, courseId) {
    const course = allCourses[courseId];
    if (!course) {
        return reply(replyToken, { type: 'text', text: '課程不存在。' }, studentMenu);
    }

    const studentNames = await Promise.all(course.students.map(async (sid) => await getLineDisplayName(sid)));

    const detailText = `課程名稱：${course.title}\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost} 點\n最大容量：${course.maxCapacity} 人\n已預約人數：${course.students.length} 人\n已預約學生：${studentNames.length > 0 ? studentNames.join(', ') : '無'}`;

    return reply(replyToken, { type: 'text', text: detailText }, studentMenu);
}

// 顯示用戶的預約
async function displayUserReservations(replyToken, userId) {
    const reservations = await getUserReservations(userId);
    const now = Date.now();
    const upcomingReservations = reservations.filter(res => new Date(res.time).getTime() > now)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (upcomingReservations.length === 0) {
        return reply(replyToken, { type: 'text', text: '您目前沒有任何即將到來的預約。' }, studentMenu);
    }

    const reservationBubbles = upcomingReservations.map(res => ({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: res.title, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(res.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
            ],
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
            contents: [
                { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_reservation&reservationId=${res.reservationId}`, displayText: `取消預約 ${res.title}` }, },
            ],
        },
    }));

    const flexMessage = {
        type: 'flex',
        altText: '我的預約',
        contents: {
            type: 'carousel',
            contents: reservationBubbles.slice(0, 10),
        },
    };

    return reply(replyToken, [{ type: 'text', text: '您即將到來的預約：' }, flexMessage], studentMenu);
}

// 顯示可供取消的預約
async function displayReservationsForCancellation(replyToken, userId) {
    const reservations = await getUserReservations(userId);
    const now = Date.now();
    const upcomingReservations = reservations.filter(res => new Date(res.time).getTime() > now)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (upcomingReservations.length === 0) {
        return reply(replyToken, { type: 'text', text: '您目前沒有可取消的預約。' }, studentMenu);
    }

    const reservationBubbles = upcomingReservations.map(res => ({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: res.title, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#FF6347', paddingAll: 'lg' }, // 用不同顏色標示取消
        body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(res.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
            ],
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
            contents: [
                { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '確認取消', data: `action=cancel_reservation&reservationId=${res.reservationId}`, displayText: `確認取消 ${res.title}` }, },
            ],
        },
    }));

    const flexMessage = {
        type: 'flex',
        altText: '選擇要取消的預約',
        contents: {
            type: 'carousel',
            contents: reservationBubbles.slice(0, 10),
        },
    };

    return reply(replyToken, [{ type: 'text', text: '請選擇您要取消的預約：' }, flexMessage], studentMenu);
}

// 處理取消預約確認 (Postback)
async function handleCancelReservationConfirmation(replyToken, userId, reservationId) {
    const [courseId, resUserId] = reservationId.split('-');
    const course = allCourses[courseId];

    if (!course || resUserId !== userId) {
        return reply(replyToken, { type: 'text', text: '無效的預約。' }, studentMenu);
    }

    if (!course.students.includes(userId)) {
        return reply(replyToken, { type: 'text', text: '您沒有預約此課程。' }, studentMenu);
    }
    if (new Date(course.time).getTime() < Date.now()) {
        return reply(replyToken, { type: 'text', text: '此課程已過期，無法取消。' }, studentMenu);
    }

    userCancelingReservation[userId] = reservationId;
    userStates[userId] = { stage: 'waiting_cancel_reservation_confirmation' };

    return reply(replyToken, {
        type: 'text',
        text: `您確定要取消「${course.title}」的預約嗎？\n時間：${formatDateTime(course.time)}\n取消預約將不會退還點數。`,
        quickReply: {
            items: [
                { type: 'action', action: { type: 'postback', label: '確認取消', data: `action=confirm_cancel_reservation&reservationId=${reservationId}`, displayText: '確認取消' } },
                { type: 'action', action: { type: 'message', label: '返回', text: '取消' } },
            ]
        }
    }, []);
}

// 處理取消預約 (Postback)
async function handleCancelReservation(replyToken, userId, reservationId) {
    const [courseId, resUserId] = reservationId.split('-');
    const course = allCourses[courseId];
    const user = allUsers[userId];

    if (!course || resUserId !== userId || !user) {
        return reply(replyToken, { type: 'text', text: '取消失敗，請重試。' }, studentMenu);
    }

    const studentIndex = course.students.indexOf(userId);
    if (studentIndex > -1) {
        course.students.splice(studentIndex, 1);
        // 取消預約不退還點數

        userCancelingReservation[userId] = null;
        userStates[userId] = null;

        // 通知老師
        if (course.teacherId && allUsers[course.teacherId] && allUsers[course.teacherId].slackUserId) {
            const teacherSlackId = allUsers[course.teacherId].slackUserId;
            await sendSlackMessage(teacherSlackId, `學生 ${user.lineDisplayName} 已取消預約您的課程：「${course.title}」，時間：${formatDateTime(course.time)}。目前 ${course.students.length}/${course.maxCapacity}。`);
        }

        return reply(replyToken, { type: 'text', text: `已成功取消「${course.title}」的預約。` }, studentMenu);
    } else {
        return reply(replyToken, { type: 'text', text: '您沒有預約此課程。' }, studentMenu);
    }
}


// ===== 老師指令處理 =====
async function handleTeacherCommands(replyToken, userId, text) {
    const user = allUsers[userId];

    if (text === COMMANDS.MAIN_MENU) {
        userStates[userId] = null;
        teacherAddingCourse[userId] = null;
        teacherCancelingCourse[userId] = null;
        teacherCancelingCourseGroup[userId] = null;
        return reply(replyToken, { type: 'text', text: '回到主選單。' }, teacherMenu);
    }

    if (userStates[userId] && userStates[userId].stage) {
        const state = userStates[userId];
        switch (state.stage) {
            case 'waitingTitle':
                teacherAddingCourse[userId].data.title = text;
                userStates[userId].stage = 'waitingTime';
                return reply(replyToken, { type: 'text', text: '請輸入課程時間 (格式：YYYY-MM-DD HH:mm，例如：2025-07-30 14:00)' });
            case 'waitingTime':
                const time = moment.tz(text, 'YYYY-MM-DD HH:mm', 'Asia/Taipei');
                if (!time.isValid() || time.toDate().getTime() < Date.now()) {
                    return reply(replyToken, { type: 'text', text: '時間格式不正確或已過去，請重新輸入有效的時間 (格式：YYYY-MM-DD HH:mm)。' });
                }
                teacherAddingCourse[userId].data.time = time.toISOString();
                userStates[userId].stage = 'waitingPointsCost';
                return reply(replyToken, { type: 'text', text: '請輸入課程所需點數。' });
            case 'waitingPointsCost':
                const pointsCost = parseInt(text, 10);
                if (isNaN(pointsCost) || pointsCost <= 0) {
                    return reply(replyToken, { type: 'text', text: '點數必須是正整數，請重新輸入。' });
                }
                teacherAddingCourse[userId].data.pointsCost = pointsCost;
                userStates[userId].stage = 'waitingMaxCapacity';
                return reply(replyToken, { type: 'text', text: '請輸入課程最大容量。' });
            case 'waitingMaxCapacity':
                const maxCapacity = parseInt(text, 10);
                if (isNaN(maxCapacity) || maxCapacity <= 0) {
                    return reply(replyToken, { type: 'text', text: '最大容量必須是正整數，請重新輸入。' });
                }
                teacherAddingCourse[userId].data.maxCapacity = maxCapacity;
                return handleAddCourse(replyToken, userId); // 完成所有資訊，呼叫新增課程
            case 'waiting_cancel_course_confirmation':
                const courseIdToCancel = teacherCancelingCourse[userId];
                if (text === '確認取消') {
                    return handleCancelSpecificCourse(replyToken, userId, courseIdToCancel);
                } else if (text === '取消') {
                    teacherCancelingCourse[userId] = null;
                    userStates[userId] = null;
                    return reply(replyToken, { type: 'text', text: '已取消課程取消操作。' }, teacherMenu);
                }
            case 'waiting_cancel_course_group_confirmation':
                const prefixToCancel = teacherCancelingCourseGroup[userId];
                if (text === '確認批次取消') {
                    return handleCancelCourseGroup(replyToken, userId, prefixToCancel);
                } else if (text === '取消') {
                    teacherCancelingCourseGroup[userId] = null;
                    userStates[userId] = null;
                    return reply(replyToken, { type: 'text', text: '已取消批次取消課程操作。' }, teacherMenu);
                }
        }
    }

    // 清除老師相關的暫存狀態
    teacherAddingCourse[userId] = null;
    teacherCancelingCourse[userId] = null;
    teacherCancelingCourseGroup[userId] = null;


    switch (text) {
        case COMMANDS.TEACHER.COURSE_MANAGEMENT: // 透過 Postback 觸發此文字指令
        case COMMANDS.TEACHER.COURSE_LIST:
        case COMMANDS.TEACHER.CANCEL_COURSE:
        case COMMANDS.TEACHER.ADD_COURSE: // 新增課程的進入點也走這裡
            const now = Date.now();
            const all = await getAllCourses();
            const teacherCourses = Object.values(all).filter(course => course.teacherId === userId);

            // 根據課程系列分組，並找到每個系列最近的一堂課
            const courseGroups = {};
            for (const course of teacherCourses) {
                if (new Date(course.time).getTime() > now) {
                    const prefix = course.id.substring(0, 2); // 假設課程ID前兩位是系列標識
                    if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) {
                        courseGroups[prefix] = course;
                    }
                }
            }

            const courseBubbles = [];
            const sortedPrefixes = Object.keys(courseGroups).sort(); // 按系列代碼排序
            for (const prefix of sortedPrefixes) {
                const earliestUpcomingCourse = courseGroups[prefix];
                courseBubbles.push({
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''), weight: 'bold', size: 'xl', wrap: true }, // 顯示系列名稱
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                        ],
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                        contents: [
                            { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` }, },
                            { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` }, },
                        ],
                    },
                });
            }

            // 新增課程的泡泡
            const addCourseBubble = {
                type: 'bubble',
                body: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'xxl',
                    contents: [
                        {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' },
                                { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
                            ],
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '150px'
                        },
                    ],
                },
                action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' }
            };
            courseBubbles.push(addCourseBubble);

            let introText = '課程管理面板';
            if (Object.keys(courseGroups).length === 0) {
                introText = '目前沒有任何進行中的課程系列，點擊「+」可新增。';
            } else {
                introText = '以下為各課程系列的管理選項：';
            }

            const flexMessage = {
                type: 'flex',
                altText: introText,
                contents: {
                    type: 'carousel',
                    contents: courseBubbles.slice(0, 10), // 最多顯示10個
                },
            };
            return reply(replyToken, [{ type: 'text', text: introText }, flexMessage], [mainMenuBtn]);

        case COMMANDS.GLOBAL.VIEW_PROFILE:
            return displayUserProfile(replyToken, userId);

        case COMMANDS.GLOBAL.BIND_SLACK:
            if (user.slackUserId) {
                return reply(replyToken, { type: 'text', text: `您已綁定 Slack，您的 Slack ID 為：${user.slackUserId}` }, teacherMenu);
            } else {
                userStates[userId] = { stage: 'waiting_slack_id' };
                return reply(replyToken, { type: 'text', text: '請提供您的 Slack ID 以便綁定。' });
            }

        case COMMANDS.GLOBAL.UNBIND_SLACK:
            if (user.slackUserId) {
                const slackUserId = user.slackUserId;
                user.slackUserId = null;
                delete slackUsers[userId];
                return reply(replyToken, { type: 'text', text: `已解除與 Slack ID: ${slackUserId} 的綁定。` }, teacherMenu);
            } else {
                return reply(replyToken, { type: 'text', text: '您尚未綁定任何 Slack 帳號。' }, teacherMenu);
            }

        default:
            return handleGPT3Query(replyToken, userId, text, role);
    }
}

// 處理新增課程開始 (Postback)
async function handleAddCourseStart(replyToken, userId) {
    teacherAddingCourse[userId] = { stage: 'waitingTitle', data: { teacherId: userId } };
    userStates[userId] = { stage: 'waitingTitle' }; // 設定通用狀態
    return reply(replyToken, { type: 'text', text: '請輸入課程名稱 (例如：Python基礎班 - 第 1 堂)。' });
}

// 實際新增課程
async function handleAddCourse(replyToken, userId) {
    const courseData = teacherAddingCourse[userId].data;
    const courseId = generateId(courseData.title.substring(0, 2)); // 簡易ID生成
    allCourses[courseId] = {
        id: courseId,
        title: courseData.title,
        time: courseData.time,
        pointsCost: courseData.pointsCost,
        maxCapacity: courseData.maxCapacity,
        teacherId: userId,
        students: [],
    };
    teacherAddingCourse[userId] = null; // 清除狀態
    userStates[userId] = null; // 清除通用狀態

    const course = allCourses[courseId];
    const teacherName = await getLineDisplayName(userId);

    // 發送通知到 Slack
    if (userStates[userId] && allUsers[userId].slackUserId) {
        await sendSlackMessage(allUsers[userId].slackUserId, `您已新增課程：「${course.title}」，時間：${formatDateTime(course.time)}。`);
    }

    return reply(replyToken, { type: 'text', text: `課程「${course.title}」已成功新增！\n時間：${formatDateTime(course.time)}\n費用：${course.pointsCost} 點\n最大容量：${course.maxCapacity} 人` }, teacherMenu);
}

// 處理管理課程系列 (顯示該系列所有課程供單次取消)
async function handleManageCourseGroup(replyToken, userId, prefix) {
    const now = Date.now();
    const coursesInGroup = Object.values(allCourses).filter(course =>
        course.teacherId === userId && course.id.startsWith(prefix) && new Date(course.time).getTime() > now
    ).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (coursesInGroup.length === 0) {
        return reply(replyToken, { type: 'text', text: `系列代碼 ${prefix} 目前沒有即將到來的課程。` }, teacherMenu);
    }

    const courseBubbles = coursesInGroup.map(course => ({
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: course.title, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#FF6347', paddingAll: 'lg' },
        body: {
            type: 'box', layout: 'vertical', spacing: 'md',
            contents: [
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '時間', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(course.time), wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
                { type: 'box', layout: 'baseline', spacing: 'sm', contents: [ { type: 'text', text: '預約', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${course.students.length}/${course.maxCapacity}`, wrap: true, color: '#666666', size: 'sm', flex: 5 } ] },
            ],
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
            contents: [
                { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '取消此單堂', data: `action=cancel_specific_course&courseId=${course.id}`, displayText: `取消 ${course.title}` }, },
            ],
        },
    }));

    const flexMessage = {
        type: 'flex',
        altText: `管理課程系列 ${prefix}`,
        contents: {
            type: 'carousel',
            contents: courseBubbles.slice(0, 10),
        },
    };

    return reply(replyToken, [{ type: 'text', text: `請選擇要單獨取消的 ${prefix} 系列課程：` }, flexMessage], teacherMenu);
}

// 處理取消特定單堂課程 (Postback)
async function handleCancelSpecificCourse(replyToken, userId, courseId) {
    const course = allCourses[courseId];
    if (!course || course.teacherId !== userId) {
        return reply(replyToken, { type: 'text', text: '無效的課程ID或您無權操作。' }, teacherMenu);
    }
    if (new Date(course.time).getTime() < Date.now()) {
        return reply(replyToken, { type: 'text', text: '此課程已過期，無法取消。' }, teacherMenu);
    }

    // 退還學生點數並通知
    for (const studentId of course.students) {
        const student = allUsers[studentId];
        if (student) {
            student.points += course.pointsCost;
            await pushMessage(studentId, { type: 'text', text: `您預約的課程「${course.title}」已由老師取消，已退還您 ${course.pointsCost} 點。您目前點數為：${student.points} 點。` });
        }
    }

    delete allCourses[courseId]; // 從課程列表中移除

    // 清除狀態
    teacherCancelingCourse[userId] = null;
    userStates[userId] = null;

    return reply(replyToken, { type: 'text', text: `課程「${course.title}」已成功取消，並已退還學生點數。` }, teacherMenu);
}

// 處理批次取消課程系列確認 (Postback)
async function handleCancelCourseGroupConfirmation(replyToken, userId, prefix) {
    const now = Date.now();
    const coursesToCancel = Object.values(allCourses).filter(course =>
        course.teacherId === userId && course.id.startsWith(prefix) && new Date(course.time).getTime() > now
    );

    if (coursesToCancel.length === 0) {
        return reply(replyToken, { type: 'text', text: `系列代碼 ${prefix} 目前沒有即將到來的課程可供批次取消。` }, teacherMenu);
    }

    const titles = coursesToCancel.map(c => c.title).join('、');
    const count = coursesToCancel.length;

    teacherCancelingCourseGroup[userId] = prefix;
    userStates[userId] = { stage: 'waiting_cancel_course_group_confirmation' };

    return reply(replyToken, {
        type: 'text',
        text: `您確定要批次取消系列代碼為 ${prefix} 的所有 ${count} 堂課程嗎？\n這些課程包括：${titles}\n所有已預約學生的點數將會退還。`,
        quickReply: {
            items: [
                { type: 'action', action: { type: 'postback', label: '確認批次取消', data: `action=confirm_cancel_course_group&prefix=${prefix}`, displayText: '確認批次取消' } },
                { type: 'action', action: { type: 'message', label: '取消', text: '取消' } },
            ]
        }
    }, []);
}

// 處理批次取消課程系列 (Postback)
async function handleCancelCourseGroup(replyToken, userId, prefix) {
    const now = Date.now();
    const coursesToCancel = Object.values(allCourses).filter(course =>
        course.teacherId === userId && course.id.startsWith(prefix) && new Date(course.time).getTime() > now
    );

    if (coursesToCancel.length === 0) {
        return reply(replyToken, { type: 'text', text: `系列代碼 ${prefix} 沒有即將到來的課程可供取消。` }, teacherMenu);
    }

    let cancelledCount = 0;
    for (const course of coursesToCancel) {
        // 退還學生點數並通知
        for (const studentId of course.students) {
            const student = allUsers[studentId];
            if (student) {
                student.points += course.pointsCost;
                await pushMessage(studentId, { type: 'text', text: `您預約的課程「${course.title}」已由老師批次取消，已退還您 ${course.pointsCost} 點。您目前點數為：${student.points} 點。` });
            }
        }
        delete allCourses[course.id]; // 從課程列表中移除
        cancelledCount++;
    }

    // 清除狀態
    teacherCancelingCourseGroup[userId] = null;
    userStates[userId] = null;

    return reply(replyToken, { type: 'text', text: `已成功批次取消 ${cancelledCount} 堂 ${prefix} 系列的課程，並已退還學生點數。` }, teacherMenu);
}

// ===== 管理員指令處理 =====
async function handleAdminCommands(replyToken, userId, text) {
    const user = allUsers[userId];

    if (text === COMMANDS.MAIN_MENU) {
        userStates[userId] = null;
        adminManagingPoints[userId] = null;
        return reply(replyToken, { type: 'text', text: '回到主選單。' }, adminMenu);
    }

    if (userStates[userId] && userStates[userId].stage) {
        const state = userStates[userId];
        if (state.stage === 'waitingUserId' && (state.action === 'add' || state.action === 'deduct')) {
            const targetUserId = text;
            if (!allUsers[targetUserId]) {
                return reply(replyToken, { type: 'text', text: '無效的用戶ID，請重新輸入。' });
            }
            adminManagingPoints[userId].userId = targetUserId;
            userStates[userId].stage = 'waitingPointsAmount';
            return reply(replyToken, { type: 'text', text: `請輸入要${state.action === 'add' ? '新增' : '扣除'}的點數數量給 ${allUsers[targetUserId].lineDisplayName} (${targetUserId})。` });
        } else if (state.stage === 'waitingPointsAmount' && (state.action === 'add' || state.action === 'deduct')) {
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount <= 0) {
                return reply(replyToken, { type: 'text', text: '點數必須是正整數，請重新輸入。' });
            }
            const targetUserId = adminManagingPoints[userId].userId;
            const targetUser = allUsers[targetUserId];

            if (state.action === 'add') {
                targetUser.points += amount;
                await pushMessage(targetUserId, { type: 'text', text: `您的點數已新增 ${amount} 點。目前點數：${targetUser.points} 點。` });
                reply(replyToken, { type: 'text', text: `已成功為 ${targetUser.lineDisplayName} (${targetUserId}) 新增 ${amount} 點。目前點數：${targetUser.points} 點。` }, adminMenu);
            } else { // deduct
                if (targetUser.points < amount) {
                    return reply(replyToken, { type: 'text', text: `該用戶點數不足，無法扣除 ${amount} 點。目前點數：${targetUser.points} 點。` });
                }
                targetUser.points -= amount;
                await pushMessage(targetUserId, { type: 'text', text: `您的點數已扣除 ${amount} 點。目前點數：${targetUser.points} 點。` });
                reply(replyToken, { type: 'text', text: `已成功為 ${targetUser.lineDisplayName} (${targetUserId}) 扣除 ${amount} 點。目前點數：${targetUser.points} 點。` }, adminMenu);
            }
            adminManagingPoints[userId] = null;
            userStates[userId] = null;
            return;
        } else if (state.stage === 'waiting_target_user_for_role_change') {
            const targetUserId = text;
            if (!allUsers[targetUserId]) {
                return reply(replyToken, { type: 'text', text: '無效的用戶ID，請重新輸入。' });
            }
            adminManagingPoints[userId].targetUserId = targetUserId; // 暫存目標用戶ID
            userStates[userId].stage = 'waiting_new_role';
            return reply(replyToken, {
                type: 'text',
                text: `請選擇 ${allUsers[targetUserId].lineDisplayName} (${targetUserId}) 的新角色：`,
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'postback', label: '學生', data: `action=set_user_role&targetUserId=${targetUserId}&role=student`, displayText: '設為學生' } },
                        { type: 'action', action: { type: 'postback', label: '老師', data: `action=set_user_role&targetUserId=${targetUserId}&role=teacher`, displayText: '設為老師' } },
                        { type: 'action', action: { type: 'postback', label: '管理員', data: `action=set_user_role&targetUserId=${targetUserId}&role=admin`, displayText: '設為管理員' } },
                    ]
                }
            });
        }
    }

    // 清除管理員相關的暫存狀態
    adminManagingPoints[userId] = null;

    switch (text) {
        case COMMANDS.ADMIN.MANAGE_POINTS:
            return reply(replyToken, { type: 'text', text: '請選擇點數管理操作：' }, [
                { type: 'message', label: COMMANDS.ADMIN.ADD_POINTS, text: COMMANDS.ADMIN.ADD_POINTS },
                { type: 'message', label: COMMANDS.ADMIN.DEDUCT_POINTS, text: COMMANDS.ADMIN.DEDUCT_POINTS },
                mainMenuBtn,
            ]);

        case COMMANDS.ADMIN.ADD_POINTS:
            adminManagingPoints[userId] = { stage: 'waitingUserId', action: 'add' };
            userStates[userId] = { stage: 'waitingUserId', action: 'add' };
            return reply(replyToken, { type: 'text', text: '請輸入要新增點數的用戶 Line ID。' });

        case COMMANDS.ADMIN.DEDUCT_POINTS:
            adminManagingPoints[userId] = { stage: 'waitingUserId', action: 'deduct' };
            userStates[userId] = { stage: 'waitingUserId', action: 'deduct' };
            return reply(replyToken, { type: 'text', text: '請輸入要扣除點數的用戶 Line ID。' });

        case COMMANDS.ADMIN.VIEW_ALL_USERS:
            let userListText = '所有用戶列表：\n';
            for (const uid in allUsers) {
                const u = allUsers[uid];
                userListText += `- ${u.lineDisplayName} (${u.lineUserId})\n  角色: ${u.role}, 點數: ${u.points}\n`;
            }

            // 提供變更角色的選項
            return reply(replyToken, {
                type: 'text',
                text: userListText + '\n請輸入用戶 Line ID 以變更其角色，或從主選單選擇其他操作。'
            }, [
                { type: 'message', label: '變更用戶角色', text: '變更用戶角色' }, // 新增一個指令
                mainMenuBtn
            ]);

        case '變更用戶角色': // 新增的指令
            userStates[userId] = { stage: 'waiting_target_user_for_role_change' };
            return reply(replyToken, { type: 'text', text: '請輸入要變更角色的用戶 Line ID。' });

        case COMMANDS.GLOBAL.VIEW_PROFILE:
            return displayUserProfile(replyToken, userId);

        case COMMANDS.GLOBAL.BIND_SLACK:
            if (user.slackUserId) {
                return reply(replyToken, { type: 'text', text: `您已綁定 Slack，您的 Slack ID 為：${user.slackUserId}` }, adminMenu);
            } else {
                userStates[userId] = { stage: 'waiting_slack_id' };
                return reply(replyToken, { type: 'text', text: '請提供您的 Slack ID 以便綁定。' });
            }

        case COMMANDS.GLOBAL.UNBIND_SLACK:
            if (user.slackUserId) {
                const slackUserId = user.slackUserId;
                user.slackUserId = null;
                delete slackUsers[userId];
                return reply(replyToken, { type: 'text', text: `已解除與 Slack ID: ${slackUserId} 的綁定。` }, adminMenu);
            } else {
                return reply(replyToken, { type: 'text', text: '您尚未綁定任何 Slack 帳號。' }, adminMenu);
            }

        default:
            return handleGPT3Query(replyToken, userId, text, role);
    }
}

// 處理設定用戶角色 (Postback)
async function handleSetUserRole(replyToken, adminUserId, targetUserId, newRole) {
    if (!allUsers[targetUserId]) {
        userStates[adminUserId] = null;
        return reply(replyToken, { type: 'text', text: '無效的目標用戶ID。' }, adminMenu);
    }

    const oldRole = allUsers[targetUserId].role;
    allUsers[targetUserId].role = newRole;

    // 清除相關狀態
    userStates[adminUserId] = null;
    adminManagingPoints[adminUserId] = null;

    // 更新目標用戶的 Rich Menu
    await setRichMenuForUser(targetUserId, newRole);

    // 通知管理員
    await reply(replyToken, { type: 'text', text: `已成功將用戶 ${allUsers[targetUserId].lineDisplayName} (${targetUserId}) 的角色從「${oldRole}」變更為「${newRole}」。` }, adminMenu);

    // 通知被變更角色的用戶
    await pushMessage(targetUserId, { type: 'text', text: `您的帳號角色已被管理員變更為「${newRole}」。` });
}

// ===== 通用功能處理 =====
async function displayUserProfile(replyToken, userId) {
    const user = allUsers[userId];
    const roleMap = {
        'student': '學生',
        'teacher': '老師',
        'admin': '管理員'
    };
    const profileText = `您的個人資料：\n名稱：${user.lineDisplayName}\n角色：${roleMap[user.role]}\nLINE ID：${user.lineUserId}\n點數：${user.points}\nSlack ID：${user.slackUserId || '未綁定'}`;
    return reply(replyToken, { type: 'text', text: profileText }, getQuickReplyMenu(user.role));
}

// 根據角色返回對應的快速回覆選單
function getQuickReplyMenu(role) {
    if (role === 'student') return studentMenu;
    if (role === 'teacher') return teacherMenu;
    if (role === 'admin') return adminMenu;
    return [mainMenuBtn]; // 預設主選單
}

// 處理 GPT-3 查詢
async function handleGPT3Query(replyToken, userId, text, role) {
    let promptPrefix = '';
    if (role === 'student') {
        promptPrefix = '作為一個學生助教機器人，請回答以下問題：';
    } else if (role === 'teacher') {
        promptPrefix = '作為一個老師助教機器人，請回答以下問題：';
    } else if (role === 'admin') {
        promptPrefix = '作為一個管理員助教機器人，請回答以下問題：';
    }

    try {
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: `${promptPrefix}\n\n${text}` }],
            max_tokens: 150,
            temperature: 0.7,
        });
        const gptResponse = completion.data.choices[0].message.content.trim();
        return reply(replyToken, { type: 'text', text: gptResponse }, getQuickReplyMenu(role));
    } catch (error) {
        console.error('Error with OpenAI API:', error);
        return reply(replyToken, { type: 'text', text: '抱歉，我現在無法回答您的問題。' }, getQuickReplyMenu(role));
    }
}

// 發送 Slack 訊息
async function sendSlackMessage(slackUserId, message) {
    try {
        await slackClient.chat.postMessage({
            channel: slackUserId, // 如果是DMs，直接用UserId
            text: message,
        });
        console.log(`Slack message sent to ${slackUserId}: ${message}`);
    } catch (error) {
        console.error('Error sending Slack message:', error);
        // 如果發送失敗，嘗試發送到預設頻道
        if (SLACK_CHANNEL_ID) {
            try {
                await slackClient.chat.postMessage({
                    channel: SLACK_CHANNEL_ID,
                    text: `無法發送訊息給用戶 ${slackUserId}。訊息內容：${message}`,
                });
            } catch (fallbackError) {
                console.error('Error sending fallback Slack message:', fallbackError);
            }
        }
    }
}

// ===== Webhook 處理 =====
app.post('/webhook', line.middleware(config), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// ===== 初始化數據 (模擬) =====
async function initializeMockData() {
    // 預設一個老師和一個管理員，方便測試
    const teacherId = 'Uxxxxxxxxxxxxxxxxx1'; // 請替換為你自己的 LINE User ID
    const adminId = 'Uxxxxxxxxxxxxxxxxx2'; // 請替換為你自己的 LINE User ID
    const studentId = 'Uxxxxxxxxxxxxxxxxx3'; // 請替換為你自己的 LINE User ID

    // 模擬初始化用戶，這裡可以從資料庫載入
    allUsers[teacherId] = { lineUserId: teacherId, name: '模擬老師', lineDisplayName: '模擬老師', role: 'teacher', points: 0, slackUserId: '你的SlackID' }; // 填寫你的Slack ID
    allUsers[adminId] = { lineUserId: adminId, name: '模擬管理員', lineDisplayName: '模擬管理員', role: 'admin', points: 0, slackUserId: '你的SlackID' }; // 填寫你的Slack ID
    allUsers[studentId] = { lineUserId: studentId, name: '模擬學生', lineDisplayName: '模擬學生', role: 'student', points: 200, slackUserId: null };
    allUsers['Uxxxxxxxxxxxxxxxxx4'] = { lineUserId: 'Uxxxxxxxxxxxxxxxxx4', name: '測試學生2', lineDisplayName: '測試學生2', role: 'student', points: 50, slackUserId: null };

    console.log('Mock users initialized.');

    // 模擬一些課程資料
    const now = moment().tz('Asia/Taipei');
    const tomorrow = now.clone().add(1, 'day');
    const nextWeek = now.clone().add(7, 'days');

    const course1Id = generateId('P1');
    allCourses[course1Id] = {
        id: course1Id,
        title: 'Python基礎班 - 第 1 堂',
        time: tomorrow.set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toISOString(),
        pointsCost: 50,
        maxCapacity: 10,
        teacherId: teacherId,
        students: [studentId], // 模擬已預約
    };

    const course2Id = generateId('P1');
    allCourses[course2Id] = {
        id: course2Id,
        title: 'Python基礎班 - 第 2 堂',
        time: tomorrow.clone().add(1, 'hour').set({ hour: 11, minute: 0, second: 0, millisecond: 0 }).toISOString(),
        pointsCost: 50,
        maxCapacity: 10,
        teacherId: teacherId,
        students: [],
    };

    const course3Id = generateId('J1');
    allCourses[course3Id] = {
        id: course3Id,
        title: 'Java進階應用',
        time: nextWeek.set({ hour: 15, minute: 30, second: 0, millisecond: 0 }).toISOString(),
        pointsCost: 80,
        maxCapacity: 5,
        teacherId: teacherId,
        students: ['Uxxxxxxxxxxxxxxxxx4'],
    };

    const course4Id = generateId('D1');
    allCourses[course4Id] = {
        id: course4Id,
        title: '數據分析入門',
        time: now.clone().add(2, 'days').set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toISOString(),
        pointsCost: 60,
        maxCapacity: 8,
        teacherId: teacherId,
        students: [],
    };

    console.log('Mock courses initialized.');

    // 初始化 Rich Menu
    await createRichMenu();
    await createTeacherRichMenu();
    await createAdminRichMenu();

    // 綁定預設 Rich Menu 給模擬用戶
    await setRichMenuForUser(teacherId, 'teacher');
    await setRichMenuForUser(adminId, 'admin');
    await setRichMenuForUser(studentId, 'student');
    await setRichMenuForUser('Uxxxxxxxxxxxxxxxxx4', 'student');
}


// 啟動伺服器並初始化模擬數據
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Bot Version: 1.1'); // 更新版次
    await initializeMockData();
});
