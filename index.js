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

async function handleFeedbackInput(event) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();
    
    if (text === '取消') {
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

async function handlePurchaseInput(event, userState) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();

    if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) { 
        await clearUserState(userId); 
        return sendPointsMenu(replyToken, userId); 
    }

    const { orderId } = userState.state_data;
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
async function handleBookingConfirmation(event, userState) {
    const { replyToken, source: { userId } } = event;
    const text = event.message.text.trim();
    const { courseId, actionType } = userState.state_data;
    
    const course = await getCourse(courseId);
    if (!course) { 
        await clearUserState(userId);
        return reply(replyToken, '操作失敗：課程不存在或已被取消。'); 
    }

    if (actionType === 'book' || actionType === 'wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
            await clearUserState(userId);
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!currentUser || !courseInTransaction) throw new Error('用戶或課程資料不存在。');
                if (currentUser.points < courseInTransaction.points_cost) throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。`);
                if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) throw new Error('您已預約或候補此課程。');
                if (new Date(courseInTransaction.time).getTime() < Date.now()) throw new Error('課程已過期。');
                
                const courseToSave = { id: courseInTransaction.id, title: courseInTransaction.title, time: courseInTransaction.time, capacity: courseInTransaction.capacity, students: courseInTransaction.students, waiting: courseInTransaction.waiting, pointsCost: courseInTransaction.points_cost };
                if (courseToSave.students.length < courseToSave.capacity) {
                    courseToSave.students.push(userId);
                    currentUser.points -= courseToSave.pointsCost;
                    currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                    await saveUser(currentUser, transactionClient); 
                    await saveCourse(courseToSave, transactionClient); 
                    await transactionClient.query('COMMIT'); 
                    return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`);
                } else {
                    courseToSave.waiting.push(userId);
                    currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                    await saveCourse(courseToSave, transactionClient); 
                    await saveUser(currentUser, transactionClient); 
                    await transactionClient.query('COMMIT'); 
                    return reply(replyToken, `課程已額滿，您已成功加入候補名單。`);
                }
            } catch (err) { 
                await transactionClient.query('ROLLBACK'); 
                console.error("❌ 預約課程交易失敗:", err.stack); 
                return reply(replyToken, `預約失敗：${err.message}`); 
            } finally { 
                transactionClient.release(); 
            }
        } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) { 
            await clearUserState(userId);
            return reply(replyToken, `已放棄預約課程「${course.title}」。`); 
        } else { 
            return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_BOOKING}」。`); 
        }
    }
    else if (actionType === 'cancel_book') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
            await clearUserState(userId);
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const courseToCancel = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!courseToCancel || !courseToCancel.students.includes(userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未預約此課程或課程不存在。'); }
                if (new Date(courseToCancel.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { await transactionClient.query('ROLLBACK'); return reply(replyToken, `課程「${courseToCancel.title}」即將開始（不足8小時），無法取消。`); }
                
                const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                cancellingUser.points += courseToCancel.points_cost;
                cancellingUser.history.push({ id: courseId, action: `課程取消退點：${courseToCancel.title} (退 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                await saveUser(cancellingUser, transactionClient);
                
                courseToCancel.students = courseToCancel.students.filter(sid => sid !== userId);
                let replyMessage = `課程「${courseToCancel.title}」已取消，已退還 ${courseToCancel.points_cost} 點。`;
                
                if (courseToCancel.waiting.length > 0) {
                    const nextWaitingUserId = courseToCancel.waiting.shift();
                    const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0];
                    if (nextWaitingUser && nextWaitingUser.points >= courseToCancel.points_cost) {
                        courseToCancel.students.push(nextWaitingUserId);
                        nextWaitingUser.points -= courseToCancel.points_cost;
                        nextWaitingUser.history.push({ id: courseId, action: `候補補上：${courseToCancel.title} (扣 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                        await saveUser(nextWaitingUser, transactionClient);
                        push(nextWaitingUserId, `您已從候補名單補上課程「${courseToCancel.title}」！系統已自動扣點。`).catch(e => console.error(e.message));
                        replyMessage += '\n有候補學生已遞補成功。';
                    } else if (nextWaitingUser) {
                        replyMessage += `\n候補學生 ${nextWaitingUser.name || ' '} 點數不足，未能遞補。`;
                        if (TEACHER_ID) push(TEACHER_ID, `課程「${courseToCancel.title}」有學生取消，但候補者 ${nextWaitingUser.name || ' '} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                    }
                }
                await saveCourse({ ...courseToCancel, pointsCost: courseToCancel.points_cost }, transactionClient); 
                await transactionClient.query('COMMIT'); 
                return reply(replyToken, replyMessage.trim());
            } catch(err) { 
                await transactionClient.query('ROLLBACK'); 
                console.error("❌ 取消預約交易失敗:", err.stack); 
                return reply(replyToken, `取消失敗：${err.message}`); 
            } finally { 
                transactionClient.release(); 
            }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) { 
            await clearUserState(userId);
            return reply(replyToken, `已放棄取消課程「${course.title}」。`); 
        } else { 
            return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING}」。`); 
        }
    }
    else if (actionType === 'cancel_wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
            await clearUserState(userId);
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const courseToCancelWaiting = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!courseToCancelWaiting || !courseToCancelWaiting.waiting?.includes(userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未候補此課程或課程不存在。'); }
                
                const userInTransaction = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                courseToCancelWaiting.waiting = courseToCancelWaiting.waiting.filter(x => x !== userId);
                userInTransaction.history.push({ id: courseId, action: `取消候補：${courseToCancelWaiting.title}`, time: new Date().toISOString() });
                
                await saveCourse({ ...courseToCancelWaiting, pointsCost: courseToCancelWaiting.points_cost }, transactionClient); 
                await saveUser(userInTransaction, transactionClient); 
                await transactionClient.query('COMMIT'); 
                return reply(replyToken, `已取消課程「${courseToCancelWaiting.title}」的候補。`);
            } catch(err) { 
                await transactionClient.query('ROLLBACK'); 
                console.error("❌ 取消候補交易失敗:", err.stack); 
                return reply(replyToken, `取消失敗：${err.message}`); 
            } finally { 
                transactionClient.release(); 
            }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { 
            await clearUserState(userId);
            return reply(replyToken, `已放棄取消課程「${course.title}」的候補。`); 
        } else { 
            return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_WAITING}」。`); 
        }
    }
}

// --- 輔助函式 ---

function buildBuyPointsFlex(userId) {
    const planButtons = PURCHASE_PLANS.map(plan => ({
      type: 'button',
      action: {
        type: 'postback',
        label: `${plan.label}`,
        data: `action=select_purchase_plan&plan=${plan.points}`,
        displayText: `我選擇購買 ${plan.points} 點方案`
      },
      style: 'primary',
      height: 'sm',
      margin: 'md'
    }));

    planButtons.push({
      type: 'button',
      action: {
        type: 'message',
        label: '❌ 取消',
        text: COMMANDS.STUDENT.CANCEL_PURCHASE
      },
      style: 'secondary',
      height: 'sm',
      margin: 'lg'
    });

    return {
        type: 'flex',
        altText: '請選擇要購買的點數方案',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '購買點數', weight: 'bold', color: '#FFFFFF' }],
                backgroundColor: '#34a0a4'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: planButtons
            }
        }
    };
}

async function buildPointsMenuFlex(userId) {
    const user = await getUser(userId);
    if (!user) return { type: 'text', text: '無法獲取您的使用者資料。' };
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    const pointBubbles = [];

    if (pendingOrder) {
        let actionButtonLabel, cardTitle, cardColor, statusText, actionCmd, additionalInfo = '';
        if (pendingOrder.status === 'pending_confirmation') { actionButtonLabel = '修改匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '🕒 匯款已提交，等待確認'; cardColor = '#ff9e00'; statusText = '已提交五碼，等待老師確認'; }
        else if (pendingOrder.status === 'rejected') { actionButtonLabel = '重新提交匯款後五碼'; actionCmd = COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER; cardTitle = '❌ 訂單被退回！'; cardColor = '#d90429'; statusText = '訂單被老師退回'; additionalInfo = '請檢查匯款金額或後五碼，並重新提交。'; }
        else { actionButtonLabel = '輸入匯款後五碼'; actionCmd = COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER; cardTitle = '❗ 匯款待確認'; cardColor = '#f28482'; statusText = '待付款'; }
        pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: cardTitle, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: cardColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `訂單 ID: ${pendingOrder.order_id}`, weight: 'bold', size: 'md', align: 'center' }, { type: 'text', text: `購買 ${pendingOrder.points} 點 / ${pendingOrder.amount} 元`, size: 'sm', align: 'center' }, { type: 'text', text: `狀態: ${statusText}`, size: 'sm', align: 'center' }, { type: 'text', text: `後五碼: ${pendingOrder.last_5_digits || '未輸入'}`, size: 'sm', align: 'center' }, ...(additionalInfo ? [{ type: 'text', text: additionalInfo, size: 'xs', align: 'center', color: '#B00020', wrap: true }] : []), { type: 'text', text: `提交時間: ${formatDateTime(pendingOrder.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', color: '#de5246', action: { type: 'postback', label: actionButtonLabel, data: `action=run_command&text=${actionCmd}` } }, { type: 'button', style: 'secondary', height: 'sm', color: '#8d99ae', action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE } }] } });
    }

    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '剩餘點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#76c893', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: `${user.points} 點`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: `上次查詢: ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`, color: '#666666', size: 'xs', align: 'center' }] }, action: { type: 'postback', label: '重新整理', data: `action=run_command&text=${COMMANDS.STUDENT.POINTS}` } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購買點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#34a0a4', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '點此選購點數方案', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購買點數', data: `action=run_command&text=${COMMANDS.STUDENT.BUY_POINTS}` } });
    pointBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '購點紀錄', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查詢購買狀態與歷史', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '購點紀錄', data: `action=run_command&text=${COMMANDS.STUDENT.PURCHASE_HISTORY}` } });

    return { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: pointBubbles } };
}

async function sendPointsMenu(replyToken, userId) {
    const flexMessage = await buildPointsMenuFlex(userId);
    return reply(replyToken, flexMessage);
}
// --- 主要事件處理器 (V7.5 核心) ---
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const userId = event.source.userId;

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
        const topLevelCommands = [
            COMMANDS.STUDENT.POINTS, COMMANDS.STUDENT.BOOK_COURSE, COMMANDS.STUDENT.MY_COURSES, COMMANDS.STUDENT.LATEST_ANNOUNCEMENT,
            COMMANDS.TEACHER.COURSE_MANAGEMENT, COMMANDS.TEACHER.POINT_MANAGEMENT, COMMANDS.TEACHER.STUDENT_MANAGEMENT, COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT,
            COMMANDS.TEACHER.REPORT
        ];
        if (topLevelCommands.includes(commandText)) {
            await clearUserState(userId);
        }
    }

    // 3. 根據資料庫中的狀態，決定如何處理使用者輸入
    const userState = await getUserState(userId);

    // 處理有狀態的文字輸入
    if (userState && event.type === 'message' && event.message.type === 'text') {
        const stateName = userState.state_name;
        switch(stateName) {
            case 'awaiting_student_search':
                return handleStudentSearchInput(event);
            case 'awaiting_feedback':
                return handleFeedbackInput(event);
            case 'awaiting_purchase_input':
                return handlePurchaseInput(event, userState);
            case 'awaiting_booking_confirmation':
                return handleBookingConfirmation(event, userState);
            // ... 可在此處加入更多老師狀態的處理函式
            default:
                await clearUserState(userId); // 無效或未知的狀態，清除它
        }
    }
    
    // 處理無狀態的文字指令
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

        if (userState?.state_name === 'awaiting_teacher_login') {
            await clearUserState(userId);
            if (text === TEACHER_PASSWORD) {
                user.role = 'teacher'; 
                await saveUser(user); 
                await reply(event.replyToken, '密碼正確，您已切換為老師身份。');
                if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
            } else {
                await reply(event.replyToken, '密碼錯誤。');
            }
            return;
        }

        // 根據身分，將無狀態指令交給對應的處理器
        if (user.role === 'teacher') {
            return handleTeacherCommands(event);
        } else {
            return handleStudentCommands(event);
        }
    } 
    
    // 處理 Postback 事件
    if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');

        // 將 Postback 轉換為文字指令，重新進入 handleEvent 流程
        if (action === 'run_command') {
            const commandText = data.get('text');
            const simulatedEvent = { ...event, type: 'message', message: { type: 'text', text: commandText }};
            return handleEvent(simulatedEvent);
        }
        
        // 設定狀態的 Postback
        if (action === 'start_student_search') {
            await setUserState(userId, 'awaiting_student_search');
            return reply(event.replyToken, '請輸入要查詢的學員姓名或 ID（支援模糊篩選）：');
        }

        if (action === 'select_purchase_plan') {
            const points = parseInt(data.get('plan'), 10);
            const selectedPlan = PURCHASE_PLANS.find(p => p.points === points);
            if (!selectedPlan) { return reply(event.replyToken, '無效的點數方案，請重新選擇。'); }
            
            const stateData = { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' };
            await setUserState(userId, 'awaiting_purchase_confirmation', stateData);
            
            const confirmFlex = {
                type: 'flex', altText: '確認購買', contents: { type: 'bubble',
                    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                        { type: 'text', text: `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。`, wrap: true },
                        { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
                    ]}
                }
            };
            return reply(event.replyToken, confirmFlex);
        }

        if (action === 'confirm_booking') {
            const courseId = data.get('courseId');
            const courseType = data.get('type');
            const course = await getCourse(courseId);
            if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) { 
                return reply(event.replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。'); 
            }
            if (user.points < course.pointsCost) { 
                return reply(event.replyToken, `點數不足，此課程需要 ${course.pointsCost} 點。您目前有 ${user.points} 點。`); 
            }
            
            await setUserState(userId, 'awaiting_booking_confirmation', { courseId, actionType: courseType });
            
            const confirmMessage = `課程名稱：${course.title}\n課程時間：${formatDateTime(course.time)}\n所需點數：${course.pointsCost} 點\n您的剩餘點數：${user.points} 點\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n確定要${courseType === 'book' ? '預約' : '加入候補'}此課程嗎？`;
            const confirmBookingFlex = {
                type: 'flex', altText: '確認預約', contents: { type: 'bubble',
                    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                        { type: 'text', text: confirmMessage, wrap: true },
                        { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING } }
                    ]}
                }
            };
            return reply(event.replyToken, confirmBookingFlex);
        }

        if (action === 'cancel_booking_confirm' || action === 'cancel_waiting_confirm') {
            const courseId = data.get('courseId');
            const course = await getCourse(courseId);
            if (!course) { return reply(event.replyToken, '課程不存在。'); }
            
            const isBooking = action === 'cancel_booking_confirm';
            if (isBooking && !course.students.includes(userId)) { return reply(event.replyToken, '您並未預約此課程。'); }
            if (!isBooking && !course.waiting.includes(userId)) { return reply(event.replyToken, '您並未候補此課程。'); }
            if (isBooking && new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { return reply(event.replyToken, `課程「${course.title}」即將開始（不足8小時），無法取消。`); }

            const actionType = isBooking ? 'cancel_book' : 'cancel_wait';
            await setUserState(userId, 'awaiting_booking_confirmation', { courseId, actionType });

            const confirmMessage = isBooking 
                ? `確定要取消課程「${course.title}」嗎？\n時間：${formatDateTime(course.time)}\n將退還您 ${course.pointsCost} 點。`
                : `確定要取消課程「${course.title}」的候補嗎？\n時間：${formatDateTime(course.time)}`;
            
            const confirmButtonLabel = isBooking ? COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING : COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING;
            const abandonButtonLabel = isBooking ? COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING : COMMANDS.STUDENT.ABANDON_CANCEL_WAITING;

            const flexMessage = {
                type: 'flex', altText: '確認取消', contents: { type: 'bubble',
                    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                        { type: 'text', text: confirmMessage, wrap: true },
                        { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: confirmButtonLabel, text: confirmButtonLabel } },
                        { type: 'button', style: 'secondary', action: { type: 'message', label: abandonButtonLabel, text: abandonButtonLabel } }
                    ]}
                }
            };
            return reply(event.replyToken, flexMessage);
        }

        // ... 可在此處加入其他老師的 Postback 處理 (如確認訂單等)
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
      const hash = crypto.createHmac('sha256', config.channelSecret).update(req.rawBody).digest('base64');
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
  await cleanCoursesDB();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7.5 (資料庫狀態管理重構)`);
  
  const PING_INTERVAL_MS = 1000 * 60 * 4; // 縮短為 4 分鐘以盡量保持喚醒
  const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
      setInterval(keepAlive, PING_INTERVAL_MS);
      keepAlive(); // 啟動時先 ping 一次
  } else {
      console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
