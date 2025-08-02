// index.js - V7.5 (資料庫狀態管理重構)
// * 將所有 pending 狀態移入資料庫，解決伺服器休眠失憶問題
// * 重構 handleEvent 流程，由狀態驅動
// * 拆分指令處理函式，提高可讀性
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const {
  config, client, pgPool, initializeDatabase,
  TEACHER_PASSWORD, STUDENT_RICH_MENU_ID, TEACHER_RICH_MENU_ID, SELF_URL,
  ONE_DAY_IN_MS, EIGHT_HOURS_IN_MS,
  PURCHASE_PLANS, BANK_INFO, COMMANDS, WEEKDAYS,
  generateUniqueCoursePrefix, getUser, saveUser,
  getAllCourses, getCourse, saveCourse, deleteCourse, deleteCoursesByPrefix,
  saveOrder, deleteOrder,
  setUserState, getUserState, clearUserState,
  reply, push, formatDateTime, getNextDate
} = require('./utils');

const { cleanCoursesDB, checkAndSendReminders, keepAlive } = require('./jobs.js');

const app = express();
const PORT = process.env.PORT || 3000;


// --- 狀態處理函式 (State Handlers) ---

async function handleStudentSearchInput(event) {
    const { replyToken, source: { userId } } = event;
    const query = event.message.text.trim();
    
    const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
    const foundUsers = res.rows;
    
    await clearUserState(userId);

    if (foundUsers.length === 0) {
        return reply(replyToken, `找不到學員「${query}」。`);
    }

    const updatedUsersWithFreshProfiles = await Promise.all(
        foundUsers.map(async (dbUser) => {
            try {
                const profile = await client.getProfile(dbUser.id);
                dbUser.picture_url = profile.pictureUrl;
                dbUser.name = profile.displayName;
                pgPool.query(
                    'UPDATE users SET name = $1, picture_url = $2 WHERE id = $3',
                    [profile.displayName, profile.pictureUrl, dbUser.id]
                ).catch(e => console.error(`背景更新用戶 ${dbUser.id} 資料失敗:`, e.message));
                return dbUser;
            } catch (e) {
                console.error(`查詢用戶 ${dbUser.id} 最新資料失敗:`, e.message);
                return dbUser;
            }
        })
    );

    const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';

    if (updatedUsersWithFreshProfiles.length === 1) {
        const foundUser = updatedUsersWithFreshProfiles[0];
        const historyRecords = (foundUser.history?.length > 0) 
            ? foundUser.history.slice(-5).reverse().map(record => ({
                type: 'text', text: `・${record.action || '未知操作'} (${formatDateTime(record.time)})`, size: 'sm', color: '#666666', wrap: true
            }))
            : [{ type: 'text', text: '尚無歷史記錄', size: 'sm', color: '#999999' }];
        
        const singleResultFlex = {
            type: 'flex', altText: `學員 ${foundUser.name || ' '} 的資訊`,
            contents: {
                type: 'bubble',
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        {
                            type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
                            contents: [
                                { type: 'image', url: foundUser.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: '100px' },
                                { type: 'text', text: foundUser.name || ' ', weight: 'bold', size: 'xl', wrap: true }
                            ]
                        },
                        { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg', contents: [
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                                { type: 'text', text: '剩餘點數', color: '#aaaaaa', size: 'sm', flex: 3 },
                                { type: 'text', text: `${foundUser.points} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5, weight: 'bold' }
                            ]},
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
                                { type: 'text', text: '學員 ID', color: '#aaaaaa', size: 'sm', flex: 3 },
                                { type: 'text', text: foundUser.id, wrap: true, color: '#666666', size: 'xxs', flex: 5 }
                            ]}
                        ]},
                        { type: 'separator', margin: 'xxl' },
                        { type: 'text', text: '近期記錄 (最多5筆)', weight: 'bold', size: 'md', margin: 'lg' },
                        ...historyRecords
                    ]
                }
            }
        };
        return reply(replyToken, singleResultFlex);
    } else {
        const userBubbles = updatedUsersWithFreshProfiles.map(u => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    {
                        type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
                        contents: [
                            { type: 'image', url: u.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: '100px' },
                            { type: 'box', layout: 'vertical', contents: [
                                    { type: 'text', text: u.name || ' ', weight: 'bold', size: 'lg', wrap: true },
                                    { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666' }
                                ]
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
                contents: [{
                    type: 'button', style: 'primary', color: '#1A759F', height: 'sm',
                    action: {
                        type: 'postback', label: '查看詳細資訊', data: `action=show_student_detail&studentId=${u.id}`, displayText: `查看學員 ${u.name || ' '} 的詳情`
                    }
                }]
            }
        }));
        return reply(replyToken, [{ type: 'text', text: `找到 ${updatedUsersWithFreshProfiles.length} 位符合的學員：` }, { type: 'flex', altText: '請選擇學員', contents: { type: 'carousel', contents: userBubbles.slice(0, 10) } }]);
    }
}

async function handleMessageSearchInput(event) {
    const { replyToken, source: { userId } } = event;
    const query = event.message.text.trim();
    
    await clearUserState(userId);

    const messagesRes = await pgPool.query(
      "SELECT * FROM feedback_messages WHERE user_name LIKE $1 OR message LIKE $2 OR teacher_reply LIKE $3 ORDER BY timestamp DESC LIMIT 10", 
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    const foundMessages = messagesRes.rows;

    if (foundMessages.length === 0) {
      return reply(replyToken, `找不到與「${query}」相關的留言紀錄。`);
    }

    const messageBubbles = foundMessages.map(msg => {
      const headerColor = msg.status === 'replied' ? '#1A759F' : (msg.status === 'read' ? '#52b69a' : '#6a7d8b');
      const replyContent = msg.teacher_reply ? [{ type: 'text', text: '老師回覆:', size: 'sm', color: '#aaaaaa', margin: 'md' }, { type: 'text', text: msg.teacher_reply, wrap: true }] : [];
      return {
        type: 'bubble',
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name || ' '} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: headerColor, paddingAll: 'lg' },
        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: msg.message, wrap: true },
            { type: 'separator', margin: 'md' },
            ...replyContent,
            { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 'md' }
        ]},
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `狀態: ${msg.status === 'replied' ? '已回覆' : (msg.status === 'read' ? '已讀' : '新留言')}`, size: 'sm', color: '#aaaaaa', align: 'center' }
        ]}
      };
    });

    return reply(replyToken, [{ type: 'text', text: '以下是與您搜尋相關的留言紀錄：' }, { type: 'flex', altText: '留言查詢結果', contents: { type: 'carousel', contents: messageBubbles } }]);
}

async function handleFeedbackInput(event) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();
    
    if (text.toLowerCase() === '取消') {
        await clearUserState(userId);
        return reply(replyToken, '已取消留言。');
    }
    
    const user = await getUser(userId);
    const messageId = `MSG${Date.now()}`;
    await pgPool.query(
      'INSERT INTO feedback_messages (id, user_id, user_name, message, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [messageId, userId, user.name, text, 'new', new Date()]
    );
    
    await clearUserState(userId);
    
    if (TEACHER_ID) {
      push(TEACHER_ID, `🔔 您有來自「${user.name || '未命名用戶'}」的新留言！請至「學員管理」->「查看留言」處理。`).catch(e => console.error(e));
    }
    return reply(replyToken, '感謝您的留言，我們已收到您的訊息！');
}

async function handleReplyInput(event, userState) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();
    const { msgId, targetUserId } = userState.state_data;

    if (text.toLowerCase() === '取消') {
      await clearUserState(userId);
      return reply(replyToken, '已取消回覆。');
    }
    
    push(targetUserId, `老師回覆您在「聯絡我們」的留言：\n\n${text}`).catch(e => console.error(e));
    await pgPool.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, msgId]);
    
    await clearUserState(userId);
    return reply(replyToken, '已成功回覆學員。');
}
async function handlePurchaseFlow(event, userState) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();
    const stateName = userState.state_name;
    const stateData = userState.state_data;

    // 處理確認購買的步驟
    if (stateName === 'awaiting_purchase_confirmation') {
        if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
            const transactionClientConfirm = await pgPool.connect();
            try {
              await transactionClientConfirm.query('BEGIN');
              const orderId = `O${Date.now()}`;
              const newOrder = { ...stateData, orderId: orderId };
              await saveOrder(newOrder, transactionClientConfirm);
              await transactionClientConfirm.query('COMMIT');
              await clearUserState(userId);
              return reply(replyToken, `已為您建立訂單，請完成轉帳。\n\n戶名：${BANK_INFO.accountName}\n銀行：${BANK_INFO.bankName}\n帳號：${BANK_INFO.accountNumber}\n\n完成轉帳後，請至「點數管理」點擊訂單並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`);
            } catch (err) { 
                await transactionClientConfirm.query('ROLLBACK'); 
                console.error('❌ 確認購買交易失敗:', err.message); 
                await clearUserState(userId);
                return reply(replyToken, '確認購買時發生錯誤，請稍後再試。'); 
            } finally { 
                transactionClientConfirm.release(); 
            }
        } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) { 
            await clearUserState(userId);
            return reply(replyToken, '已取消購買點數。'); 
        } else { 
            return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); 
        }
    }

    // 處理輸入後五碼的步驟
    if (stateName === 'awaiting_purchase_input') {
        if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) { 
            await clearUserState(userId); 
            return sendPointsMenu(replyToken, userId); 
        }

        const { orderId } = stateData;
        const last5Digits = text;
        if (!/^\d{5}$/.test(last5Digits)) { 
            return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。'); 
        }

        const transactionClient = await pgPool.connect();
        try {
            await transactionClient.query('BEGIN');
            const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
            let orderInTransaction = orderInTransactionRes.rows[0];
            if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) { 
                await transactionClient.query('ROLLBACK'); 
                await clearUserState(userId); 
                return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。'); 
            }
            
            orderInTransaction.last_5_digits = last5Digits;
            orderInTransaction.status = 'pending_confirmation';
            const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
            await saveOrder(newOrderData, transactionClient);
            await transactionClient.query('COMMIT');
            
            await clearUserState(userId);
            
            const successMessage = { type: 'text', text: `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。` };
            const pointsFlexMessage = await buildPointsMenuFlex(userId);
            
            if (TEACHER_ID) {
                push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName || ' '}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
            }
            await reply(replyToken, [successMessage, pointsFlexMessage]);
        } catch (err) {
            await transactionClient.query('ROLLBACK');
            console.error('❌ 提交後五碼交易失敗:', err.message);
            await clearUserState(userId);
            await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。');
        } finally { 
            transactionClient.release(); 
        }
    }
}

async function handleBookingConfirmation(event, userState) {
    // ... (此處貼上 V7.5 handleBookingConfirmation 完整邏輯)
}

async function handleCourseCreation(event, userState) {
    // ... (此處貼上 V7.5 handleCourseCreation 完整邏輯)
}

async function handleManualAdjust(event, userState) {
    // ... (此處貼上 V7.5 handleManualAdjust 完整邏輯)
}

async function handleAnnouncementCreation(event, userState) {
    // ... (此處貼上 V7.5 handleAnnouncementCreation 完整邏輯)
}

// --- 輔助函式 ---

function buildBuyPointsFlex() {
    // ... (此處貼上 V7.5 buildBuyPointsFlex 完整邏輯)
}

async function buildPointsMenuFlex(userId) {
    // ... (此處貼上 V7.5 buildPointsMenuFlex 完整邏輯)
}

async function sendPointsMenu(replyToken, userId) {
    const flexMessage = await buildPointsMenuFlex(userId);
    return reply(replyToken, flexMessage);
}
// --- 主要指令處理函式 ---

async function handleTeacherCommands(event) {
    const { replyToken, source: { userId }, message: { text } } = event;
    const now = Date.now();

    if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        const announcementMenu = {
            type: 'flex', altText: '公告管理選單',
            contents: { type: 'carousel', contents: [
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '新增公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '發布新消息給所有學員', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '新增公告', data: 'action=add_announcement_start' } },
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '歷史公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查看或刪除過去的公告', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '歷史公告', data: 'action=history_announcements_show' } }
            ]}
        };
        return reply(replyToken, announcementMenu);
    }

    if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const newMessagesCount = (await pgPool.query(`SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'`)).rows[0].count;
        const studentManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或ID查詢學員資訊', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '學員查詢', data: 'action=start_student_search' } },
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '查看留言', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: (newMessagesCount > 0 ? '#de5246' : '#6a7d8b'), paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${newMessagesCount} 則`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看所有新留言', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看留言', data: `action=run_command&text=${COMMANDS.TEACHER.VIEW_MESSAGES}` } },
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '留言查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或內容查詢歷史留言', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '留言查詢', data: 'action=start_message_search' } }
        ];
        return reply(replyToken, { type: 'flex', altText: '學員管理功能', contents: { type: 'carousel', contents: studentManagementBubbles } });
    }

    if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
        const messagesRes = await pgPool.query("SELECT * FROM feedback_messages WHERE status IN ('new', 'read') ORDER BY timestamp ASC LIMIT 10");
        if (messagesRes.rows.length === 0) {
            return reply(replyToken, '太棒了，目前沒有新的學員留言！');
        }
        const messageBubbles = messagesRes.rows.map(msg => ({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name || ' '} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: (msg.status === 'read' ? '#52b69a' : '#6a7d8b'), paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                { type: 'text', text: msg.message, wrap: true },
                { type: 'separator' },
                { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa' }
            ]},
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                { type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } },
                { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } }
            ]}
        }));
        return reply(replyToken, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } });
    }

    if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
        const pointManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看待確認訂單', data: `action=run_command&text=${COMMANDS.TEACHER.PENDING_ORDERS}` } },
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '手動調整點數', data: `action=run_command&text=${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS}` } }
        ];
        return reply(replyToken, { type: 'flex', altText: '點數管理功能', contents: { type: 'carousel', contents: pointManagementBubbles } });
    }

    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
        const allCourses = Object.values(await getAllCourses());
        const courseGroups = {};
        for (const course of allCourses) {
            if (new Date(course.time).getTime() > now) {
                const prefix = course.id.substring(0, 2);
                if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) {
                    courseGroups[prefix] = course;
                }
            }
        }
        const courseBubbles = [];
        const sortedPrefixes = Object.keys(courseGroups).sort();
        for (const prefix of sortedPrefixes) {
            const earliestUpcomingCourse = courseGroups[prefix];
            const courseMainTitle = earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''); 
            courseBubbles.push({
                type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: courseMainTitle, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                    ],
                },
                footer: {
                    type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                    contents: [
                        { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` } },
                        { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` } },
                    ],
                },
            });
        }
        const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
        courseBubbles.push(addCourseBubble);
        let introText = (Object.keys(courseGroups).length === 0) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
        return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
    }

    if (text === COMMANDS.TEACHER.REPORT) {
        const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
        const students = usersRes.rows;
        const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
        const activeStudentsCount = students.filter(s => s.history?.length > 0).length;
        const coursesRes = await pgPool.query(`SELECT * FROM courses`);
        const allCourses = coursesRes.rows;
        const totalCourses = allCourses.length;
        const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
        const completedCourses = totalCourses - upcomingCourses;
        const ordersRes = await pgPool.query(`SELECT * FROM orders`);
        const allOrders = ordersRes.rows;
        const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
        const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
        const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);
        let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
        return reply(replyToken, report.trim());
    }

    if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
        (async () => {
            try {
                const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
                const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
                if (pendingConfirmationOrders.length === 0) return push(userId, '目前沒有待確認的購點訂單。');
                const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName || ' '}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }}));
                await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
            } catch (err) {
                console.error('❌ 查詢待確認訂單時發生錯誤:', err);
                await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
            }
        })();
        return;
    }
  
    // Default fallback for teacher
    let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
    if (text.startsWith('@')) {
        teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
    }
    return reply(replyToken, teacherSuggestion);
}

async function handleStudentCommands(event) {
    const { replyToken, source: { userId }, message: { text } } = event;
    const user = await getUser(userId);
    const now = Date.now();

    if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
        const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
        if (res.rows.length === 0) {
            return reply(replyToken, '目前沒有任何公告。');
        }
        const announcement = res.rows[0];
        const announcementMessage = {
            type: 'flex', altText: '最新公告',
            contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name || '老師'} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} }
        };
        return reply(replyToken, announcementMessage);
    }

    if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
        return sendPointsMenu(replyToken, userId);
    }

    if (text === COMMANDS.STUDENT.BUY_POINTS) {
        const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        if (ordersRes.rows.length > 0) {
          return reply(replyToken, `您目前有一筆訂單 (ID: ${ordersRes.rows[0].order_id}) 尚未完成，請先至「點數管理」主頁完成或取消該筆訂單。`);
        }
        const flexMessage = buildBuyPointsFlex();
        return reply(replyToken, flexMessage);
    }

    if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
        const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = ordersRes.rows[0];
        if (pendingOrder) {
            if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。'); }
            else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
                const transactionClientCancel = await pgPool.connect();
                try { 
                    await transactionClientCancel.query('BEGIN'); 
                    await deleteOrder(pendingOrder.order_id, transactionClientCancel); 
                    await transactionClientCancel.query('COMMIT'); 
                    await clearUserState(userId);
                    return reply(replyToken, '已取消您的購點訂單。'); 
                }
                catch (err) { 
                    await transactionClientCancel.query('ROLLBACK'); 
                    console.error('❌ 取消購點訂單交易失敗:', err.message); 
                    return reply(replyToken, '取消訂單失敗，請稍後再試。'); 
                }
                finally { 
                    transactionClientCancel.release(); 
                }
            }
        }
        await clearUserState(userId); // Clear any lingering purchase state
        return reply(replyToken, '目前沒有待取消的購點訂單。');
    }

    if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
        if (!user.history?.length) { return reply(replyToken, '你目前沒有點數相關記錄。'); }
        let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
        user.history.slice(-5).reverse().forEach(record => { historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`; });
        return reply(replyToken, historyMessage.trim());
    }

    if (text === COMMANDS.STUDENT.BOOK_COURSE) {
        const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
        const upcomingCourses = Object.values(await getAllCourses())
          .filter(c => new Date(c.time).getTime() > now && new Date(c.time).getTime() <= sevenDaysLater && !c.students.includes(userId) && !c.waiting.includes(userId))
          .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());
    
        if (upcomingCourses.length === 0) {
          return reply(replyToken, '未來七天內沒有您可以預約的新課程。');
        }
    
        const courseItems = [];
        upcomingCourses.slice(0, 10).forEach((course, index) => {
          const isFull = course.students.length >= course.capacity;
          
          courseItems.push({
            type: 'box', layout: 'vertical', margin: index > 0 ? 'lg' : 'none', spacing: 'sm',
            contents: [
              { type: 'text', text: course.title, weight: 'bold', size: 'md', wrap: true },
              { type: 'text', text: `時間：${formatDateTime(course.time)}`, size: 'sm' },
              { type: 'text', text: `費用：${course.pointsCost} 點｜狀態：${isFull ? '已額滿' : `報名 ${course.students.length}/${course.capacity}`}`, size: 'sm', color: '#666666' },
              { type: 'button', action: { type: 'postback', label: isFull ? '加入候補' : '立即預約', data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`, displayText: `我想${isFull ? '候補' : '預約'}：${course.title}` }, style: isFull ? 'secondary' : 'primary', color: isFull ? undefined : '#1A759F', height: 'sm', margin: 'md' }
            ]
          });
          if (index < upcomingCourses.slice(0, 10).length - 1) {
            courseItems.push({ type: 'separator', margin: 'lg' });
          }
        });
    
        const flexMessage = {
          type: 'flex', altText: '可預約課程列表',
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '預約課程', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#34a0a4' },
            body: { type: 'box', layout: 'vertical', contents: courseItems },
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '💡 課程開始前 8 小時不可退課', size: 'xs', align: 'center', color: '#AAAAAA' }] }
          }
        };
        return reply(replyToken, flexMessage);
    }

    if (text === COMMANDS.STUDENT.MY_COURSES) {
        const courses = await getAllCourses();
        const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
        const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time));
        if (enrolledCourses.length === 0 && waitingCourses.length === 0) { return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。'); }
        const courseBubbles = [
            ...enrolledCourses.map(course => {
                const canCancel = new Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
                return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' }] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：${course.title}` } }] } : undefined };
            }),
            ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } }))
        ];
        return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } });
    }

    // Default fallback for student
    let studentSuggestion = '我不懂您的意思耶😕';
    if (text.startsWith('@')) {
        studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用圖文選單操作。`;
    }
    return reply(replyToken, studentSuggestion);
}
// --- 主要事件處理器 (V7.5 核心) ---
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const { replyToken, source: { userId } } = event;

    // 1. 取得使用者資料 (初次使用者會自動建立)
    let user = await getUser(userId);
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: profile.pictureUrl };
            await saveUser(user);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (err) {
            console.error(`❌ 獲取新用戶 ${userId} 資料失敗:`, err.message);
            user = { id: userId, name: `新用戶`, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: null };
            await saveUser(user);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(`❌ 備用連結學員 Rich Menu 失敗: ${e.message}`));
        }
    } else if (!user.picture_url) { // 為舊用戶補充頭像
        try {
            const profile = await client.getProfile(userId);
            if (profile.pictureUrl) {
                user.pictureUrl = profile.pictureUrl;
                await saveUser(user);
            }
        } catch(e) { console.error(`❌ 為現有使用者 ${userId} 更新頭像失敗:`, e.message); }
    }
    
    // 2. 處理流程中斷指令 (來自 Rich Menu 的 Postback)
    const isPostbackCommand = event.type === 'postback' && new URLSearchParams(event.postback.data).get('action') === 'run_command';
    if (isPostbackCommand) {
        const commandText = new URLSearchParams(event.postback.data).get('text');
        // 將 COMMANDS 物件內的所有指令值變成一個陣列來比對
        const topLevelCommands = Object.values(COMMANDS.STUDENT).concat(Object.values(COMMANDS.TEACHER));
        if (topLevelCommands.includes(commandText)) {
            await clearUserState(userId);
        }
    }

    // 3. 根據資料庫中的狀態，決定如何處理使用者輸入
    const userState = await getUserState(userId);

    if (userState && event.type === 'message' && event.message.type === 'text') {
        const stateName = userState.state_name;
        switch(stateName) {
            case 'awaiting_student_search':
                return handleStudentSearchInput(event);
            case 'awaiting_message_search':
                return handleMessageSearchInput(event);
            case 'awaiting_feedback':
                return handleFeedbackInput(event);
            case 'awaiting_reply':
                return handleReplyInput(event, userState);
            case 'awaiting_purchase_confirmation':
            case 'awaiting_purchase_input':
                return handlePurchaseFlow(event, userState);
            case 'awaiting_booking_confirmation':
                return handleBookingConfirmation(event, userState);
            case 'awaiting_course_creation':
                return handleCourseCreation(event, userState);
            case 'awaiting_manual_adjust':
                return handleManualAdjust(event, userState);
            case 'awaiting_announcement_creation':
                return handleAnnouncementCreation(event, userState);
            case 'awaiting_teacher_login':
                 await clearUserState(userId);
                 const text = event.message.text.trim();
                 if (text === TEACHER_PASSWORD) {
                     user.role = 'teacher'; 
                     await saveUser(user); 
                     await reply(replyToken, '密碼正確，您已切換為老師身份。');
                     if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
                 } else {
                     await reply(replyToken, '密碼錯誤。');
                 }
                 return;
            default:
                await clearUserState(userId); // 無效或未知的狀態，清除它
        }
    }
    
    // 4. 處理無狀態的文字指令
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        
        if (text === COMMANDS.SWITCH_ROLE) {
            if (user.role === 'teacher') {
                user.role = 'student'; 
                await saveUser(user); 
                await reply(event.replyToken, '您已切換為學員身份。');
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            } else { 
                await setUserState(userId, 'awaiting_teacher_login');
                await reply(event.replyToken, '請輸入老師密碼：'); 
            }
            return;
        }

        if (user.role === 'teacher') {
            return handleTeacherCommands(event);
        } else {
            return handleStudentCommands(event);
        }
    } 
    
    // 5. 處理 Postback 事件
    if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');

        if (action === 'run_command') {
            const commandText = data.get('text');
            const simulatedEvent = { ...event, type: 'message', message: { type: 'text', text: commandText }};
            return handleEvent(simulatedEvent);
        }
        
        // --- 設定狀態的 Postback ---
        if (action === 'start_student_search') {
            await setUserState(userId, 'awaiting_student_search');
            return reply(replyToken, '請輸入要查詢的學員姓名或 ID（支援模糊篩選）：');
        }
        if (action === 'start_message_search') {
            await setUserState(userId, 'awaiting_message_search');
            return reply(replyToken, '請輸入學員姓名或留言內容進行查詢（支援模糊篩選）：');
        }
        if (action === 'reply_feedback') {
            const msgId = data.get('msgId');
            const targetUserId = data.get('userId');
            await setUserState(userId, 'awaiting_reply', { msgId, targetUserId });
            return reply(replyToken, '請直接輸入您想回覆的內容（或輸入「取消」）：');
        }
        if (action === 'add_announcement_start') {
            await setUserState(userId, 'awaiting_announcement_creation', { step: 'await_content' });
            return reply(replyToken, '請輸入您要發布的公告內容：');
        }
        if (action === 'add_course_start') {
            await setUserState(userId, 'awaiting_course_creation', { step: 1 });
            return reply(replyToken, '請輸入課程名稱（例如：哈達瑜伽）：');
        }
        if (action === 'select_manual_adjust_student') {
            const studentId = data.get('studentId');
            const selectedStudent = await getUser(studentId);
            if (!selectedStudent) { return reply(replyToken, '選擇的學員不存在，請重新開始。'); }
            const stateData = { step: 'awaiting_operation', targetUserId: selectedStudent.id, targetUserName: selectedStudent.name, currentPoints: selectedStudent.points };
            await setUserState(userId, 'awaiting_manual_adjust', stateData);
            const operationFlex = { type: 'flex', altText: '選擇操作', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `您選擇了學員：${selectedStudent.name || ' '}`, weight: 'bold', wrap: true }, { type: 'text', text: `目前點數：${selectedStudent.points} 點`, size: 'sm' }, { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } }, { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } }, { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ]} } };
            return reply(replyToken, operationFlex);
        }
         // ... (其他學生和老師的 postback action)

        // --- 無狀態的 Postback (直接處理) ---
        if(action === 'mark_feedback_read') {
            const msgId = data.get('msgId');
            await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
            return reply(replyToken, '已將此留言標示為已讀。');
        }
        // ... 其他類似的無狀態 Postback
    }
}


// --- Express Server 設定 & 啟動 ---
app.use(express.json({
  verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; }
}));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (signature && config.channelSecret) {
    try {
      const hash = crypto.createHmac('sha266', config.channelSecret).update(req.rawBody).digest('base64');
      if (hash !== signature) {
        console.error('❌ LINE Webhook 簽名驗證失敗。');
        return res.status(401).send('Unauthorized');
      }
    } catch (error) {
      console.error('❌ LINE Webhook 簽名驗證時發生錯誤:', error);
      return res.status(400).send('Bad Request');
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
  await initializeDatabase();
  const cleanupQuery = 'DELETE FROM user_states WHERE expires_at <= NOW()';
  await pgPool.query(cleanupQuery); // 啟動時清理過期狀態
  await cleanCoursesDB();

  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7.5 (資料庫狀態管理重構)`);
  
  const PING_INTERVAL_MS = 1000 * 60 * 4; // 縮短為 4 分鐘
  const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => pgPool.query(cleanupQuery), 1000 * 60 * 60); // 每小時清理過期狀態
  
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
      setInterval(keepAlive, PING_INTERVAL_MS);
      keepAlive();
  } else {
      console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
