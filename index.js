// index.js - V7.5.9 (修正函式內換行錯誤)
// * 補全所有遺漏的 Postback 及狀態處理邏輯
// * 確保所有功能恢復正常
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
    
    await clearUserState(userId);
    const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
    const foundUsers = res.rows; 
    
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
            ?
            foundUser.history.slice(-5).reverse().map(record => ({
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
                                { type: 'text', text: foundUser.id, wrap: true, color: '#666666', 
size: 'xxs', flex: 5 }
                          
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
                            { type: 'image', url: u.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: 
'100px' }, 
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
            { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 
'md' } 
        ]},
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `狀態: ${msg.status === 'replied' ? '已回覆' : 
(msg.status === 'read' ? '已讀' : '新留言')}`, size: 'sm', color: '#aaaaaa', align: 'center' } 
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
            return sendPointsMenu(replyToken, userId); 
        } else { 
            return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); 
        }
    }

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
            if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && 
orderInTransaction.status !== 'rejected')) { 
                await transactionClient.query('ROLLBACK');
                await clearUserState(userId); 
                return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。'); 
            }
            
            orderInTransaction.last_5_digits = last5Digits;
            orderInTransaction.status = 'pending_confirmation'; 
            const user = await getUser(userId, transactionClient);
            const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: user.name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: 
orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
            await saveOrder(newOrderData, transactionClient); 
            await transactionClient.query('COMMIT');
            
            await clearUserState(userId);
            
            const successMessage = { type: 'text', text: `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。` };
            if (TEACHER_ID) { 
                push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName || ' '}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
            }
            await reply(replyToken, successMessage); 
            return sendPointsMenu(replyToken, userId);
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
                if (courseToSave.students.length 
< courseToSave.capacity) { 
                    courseToSave.students.push(userId);
                    currentUser.points -= courseToSave.pointsCost; 
                    if(!currentUser.history) currentUser.history = [];
                    currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                    await saveUser(currentUser, transactionClient); 
                    await saveCourse(courseToSave, transactionClient); 
                    await transactionClient.query('COMMIT'); 
                    return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`);
                } else { 
                    courseToSave.waiting.push(userId);
                    if(!currentUser.history) currentUser.history = []; 
                    currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                    await saveCourse(courseToSave, transactionClient); 
                    await saveUser(currentUser, transactionClient);
                    await transactionClient.query('COMMIT'); 
                    return reply(replyToken, `課程已額滿，您已成功加入候補名單。`);
                }
            } catch (err) { 
                await 
transactionClient.query('ROLLBACK');
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
                if (!courseToCancel || !courseToCancel.students.includes(userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未預約此課程或課程不存在。'); 
                }
                if (new Date(courseToCancel.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { await transactionClient.query('ROLLBACK'); 
                    return reply(replyToken, `課程「${courseToCancel.title}」即將開始（不足8小時），無法取消。`); } 
                
                const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                cancellingUser.points += courseToCancel.points_cost; 
                if(!cancellingUser.history) cancellingUser.history = [];
                cancellingUser.history.push({ id: courseId, action: `課程取消退點：${courseToCancel.title} (退 ${courseToCancel.points_cost} 點)`, time: 
new Date().toISOString() });
                await saveUser(cancellingUser, transactionClient); 
                
                courseToCancel.students = courseToCancel.students.filter(sid => sid !== userId);
                let replyMessage = `課程「${courseToCancel.title}」已取消，已退還 ${courseToCancel.points_cost} 點。`;
                if (courseToCancel.waiting.length > 0) { 
                    const nextWaitingUserId = courseToCancel.waiting.shift();
                    const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0]; 
                    if (nextWaitingUser && nextWaitingUser.points >= 
courseToCancel.points_cost) { 
                        courseToCancel.students.push(nextWaitingUserId);
                        nextWaitingUser.points -= courseToCancel.points_cost; 
                        if(!nextWaitingUser.history) nextWaitingUser.history = [];
                        nextWaitingUser.history.push({ id: courseId, action: `候補補上：${courseToCancel.title} (扣 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                        await saveUser(nextWaitingUser, transactionClient); 
                        push(nextWaitingUserId, `您已從候補名單補上課程「${courseToCancel.title}」！系統已自動扣點。`).catch(e => 
console.error(e.message));
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
                if (!courseToCancelWaiting || !courseToCancelWaiting.waiting?.includes(
userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未候補此課程或課程不存在。'); 
                }
                
                const userInTransaction = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]; 
                courseToCancelWaiting.waiting = courseToCancelWaiting.waiting.filter(x => x !== userId); 
                if(!userInTransaction.history) userInTransaction.history = [];
                userInTransaction.history.push({ id: courseId, action: `取消候補：${courseToCancelWaiting.title}`, time: new Date().toISOString() });
                await saveCourse({ ...courseToCancelWaiting, pointsCost: 
courseToCancelWaiting.points_cost }, transactionClient); 
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
        } else if (text === 
COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { 
            await clearUserState(userId);
            return reply(replyToken, `已放棄取消課程「${course.title}」的候補。`); 
        } else { 
            return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_WAITING}」。`); 
        }
    }
}
function sendAnnouncementConfirmation(replyToken, content) {
    const confirmMsg = {
        type: 'flex',
        altText: '確認公告內容',
        contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請確認公告內容', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F' },
            body: { type: 
'box', layout: 'vertical', contents: [{ type: 'text', text: content, wrap: true }] }, 
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: 
COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
     
           ]} 
        }
    };
    return reply(replyToken, confirmMsg); 
}

async function handleAnnouncementCreation(event, userState) {
    const { replyToken, source: { userId }, message: { text } } = event;
    const step = userState.state_data.step; 
    
    if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        await clearUserState(userId);
        return reply(replyToken, '已取消發布公告。'); 
    }

    switch (step) {
        case 'await_content':
            await setUserState(userId, 'awaiting_announcement_creation', { step: 'await_confirmation', content: text });
            return sendAnnouncementConfirmation(replyToken, text); 
        case 'await_confirmation':
            if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
                const user = await getUser(userId);
                const { content } = userState.state_data; 
                const newAnnRes = await pgPool.query(
                    'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3) RETURNING *',
                    [content, userId, user.name]
                );
                const newAnn = newAnnRes.rows[0]; 
                await clearUserState(userId);
                await reply(replyToken, '✅ 公告已成功發布！正在推播給所有學員...');
                (async () => { 
                    try {
                        const studentsRes = await pgPool.query("SELECT id FROM users WHERE role = 'student'");
                        const announcementMessage = {
              
                             type: 'flex', altText: '來自老師的最新公告', 
                            contents: {
                                type: 'bubble',
                     
                           header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [{ type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }] }, 
                                body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: content, wrap: true }] },
                    
                             footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `發布時間: ${formatDateTime(newAnn.created_at)}`, size: 'xs', color: '#aaaaaa', align: 'center' }] } 
                            }
                        };
                
                        for (const student of studentsRes.rows) { 
                           await push(student.id, announcementMessage);
                        } 
                        console.log(`📢 公告已成功推播給 ${studentsRes.rows.length} 位學員。`);
                    } catch (e) { 
                        console.error('❌ 推播公告失敗:', e);
                    } 
                })();
            } else { 
                await reply(replyToken, '請點擊下方按鈕來確認或取消。');
                return sendAnnouncementConfirmation(replyToken, userState.state_data.content); 
            }
            break;
    } 
}

async function handleCourseCreation(event, userState) {
    const { replyToken, source: { userId }, 
message: { text } } = event;
    let { step, ...courseData } = userState.state_data; 

    if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
        await clearUserState(userId);
        return reply(replyToken, '已取消新增課程。'); 
    }
    
    if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
        if (step !== 7) { 
            await clearUserState(userId);
            return reply(replyToken, '無效操作，請重新從「新增課程」開始。'); 
        }
        const transactionClient = await 
pgPool.connect();
        try { 
            await transactionClient.query('BEGIN');
            const coursePrefix = await generateUniqueCoursePrefix(transactionClient);
            const coursesToAdd = courseData.calculatedTimes.map((time, index) => ({ id: `${coursePrefix}${String.fromCharCode(65 + index)}`, title: `${courseData.courseName} - 第 ${index + 1} 堂`, time: time, capacity: courseData.capacity, pointsCost: courseData.pointsCost, students: [], waiting: [] })); 
            for (const course of coursesToAdd) await saveCourse(course, transactionClient); 
            await transactionClient.query('COMMIT');
            await clearUserState(userId);
            return reply(replyToken, `課程系列「${courseData.courseName}」已成功新增！\n系列代碼：${coursePrefix}\n共新增 ${courseData.totalClasses} 堂課。`);
        } catch (err) { 
            await transactionClient.query('ROLLBACK');
            console.error('❌ 新增課程交易失敗:', err.stack); 
            await clearUserState(userId);
            return reply(replyToken, '新增課程時發生錯誤，請稍後再試。'); 
        } finally { 
            transactionClient.release(); 
        }
    }
    
    switch (step) {
        case 1: 
            if (!text) { return reply(replyToken, '課程名稱不能為空，請重新輸入。');
            } 
            await setUserState(userId, 'awaiting_course_creation', { step: 2, courseName: text });
            return reply(replyToken, '請輸入總堂數（例如：5，代表您想建立 5 堂課）：'); 
        
        case 2:
            const totalClasses = parseInt(text);
            if (isNaN(totalClasses) || totalClasses <= 0 || totalClasses > 99) { return reply(replyToken, '總堂數必須是 1 到 99 之間的整數，請重新輸入。'); 
            }
            courseData.totalClasses = totalClasses; 
            await setUserState(userId, 'awaiting_course_creation', { step: 3, ...courseData }); 
            const weekdayOptions = WEEKDAYS.map(day => ({ type: 'button', style: 'primary', height: 'sm', action: { type: 
'message', label: day.label, text: day.label } }));
            const weekdayFlex = { type: 'flex', altText: '選擇星期', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: '請選擇課程日期（星期幾）：', wrap: true }, ...weekdayOptions] } } }; 
            return reply(replyToken, weekdayFlex); 
            
        case 3:
            const selectedWeekday = WEEKDAYS.find(day => day.label === text);
            if (!selectedWeekday) { return reply(replyToken, '請從列表中選擇有效的星期幾。'); } 
            courseData.weekday = selectedWeekday.value;
            await setUserState(userId, 'awaiting_course_creation', { step: 4, 
...courseData }); 
            return reply(replyToken, '請輸入課程時間（格式為 HH:mm，例如：19:00）：');
        case 4: 
            if (!/^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(text)) { return reply(replyToken, '課程時間格式不正確，請使用 HH:mm 格式，例如：19:00。');
            } 
            courseData.time = text;
            await setUserState(userId, 'awaiting_course_creation', { step: 5, ...courseData }); 
            return reply(replyToken, '請輸入人數上限（例如：10）：');
        case 5: 
            const capacity = parseInt(text);
            if (isNaN(capacity) || capacity <= 0) { return reply(replyToken, '人數上限必須是正整數，請重新輸入。'); 
            }
            courseData.capacity = capacity; 
            await setUserState(userId, 'awaiting_course_creation', { step: 6, ...courseData }); 
            return reply(replyToken, '請輸入課程所需扣除點數（例如：2）：');
        case 6: 
            const points = parseInt(text);
            if (isNaN(points) || points <= 0) { return reply(replyToken, '點數費用必須是正整數，請重新輸入。'); 
            }
            courseData.pointsCost = points; 
            
            const courseTimes = [];
            let currentDate = new Date(); 
            for (let i = 0; i < courseData.totalClasses; i++) {
                 if (i > 0) {
                     currentDate = new Date(courseTimes[i-1]);
                 } 
                let nextClassDate = getNextDate(courseData.weekday, courseData.time, currentDate);
                courseTimes.push(nextClassDate.toISOString()); 
                currentDate = new Date(nextClassDate.getTime() + ONE_DAY_IN_MS);
            }
            courseData.calculatedTimes = courseTimes;
            await setUserState(userId, 'awaiting_course_creation', { step: 7, ...courseData }); 

            const confirmMsgText = `請確認新增以下週期課程系列：\n課程名稱：${courseData.courseName}\n總堂數：${courseData.totalClasses} 堂\n每週：${WEEKDAYS.find(d => d.value === courseData.weekday)?.label} ${courseData.time}\n人數上限：${courseData.capacity} 人/堂\n點數費用：${courseData.pointsCost} 點/堂\n\n預計開課日期：\n${courseData.calculatedTimes.map(t => formatDateTime(t)).join('\n')}`;
            const confirmFlex = { type: 'flex', altText: '確認新增課程', contents: { type: 'bubble', 
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                    { type: 'text', text: confirmMsgText, wrap: true },
                    { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE } },
   
                     { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE } } 
                ]}
            }};
            return reply(replyToken, confirmFlex); 
    }
}

async function handleManualAdjust(event, userState) {
    const { replyToken, source: { userId }, message: { text } } = event;
    let { step, ...stateData } = userState.state_data; 
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        await clearUserState(userId);
        return reply(replyToken, '已取消手動調整點數。'); 
    }

    switch(step) {
        case 'awaiting_student_info':
            const studentRes = await pgPool.query(`SELECT id, name, points, history FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
            const foundStudents = studentRes.rows; 

            if (foundStudents.length === 0) { 
                await clearUserState(userId);
                return reply(replyToken, `找不到符合學員「${text}」。`); 
            }
            else if (foundStudents.length === 1) {
                const selectedStudent = foundStudents[0];
                const newStateData = { step: 'awaiting_operation', targetUserId: selectedStudent.id, targetUserName: selectedStudent.name, currentPoints: selectedStudent.points }; 
                await setUserState(userId, 'awaiting_manual_adjust', newStateData);
                const operationFlex = { type: 'flex', altText: '選擇操作', contents: { type: 'bubble', 
                    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: `您選擇了學員：${selectedStudent.name || ' '}`, 
weight: 'bold', wrap: true }, 
                            { type: 'text', text: `目前點數：${selectedStudent.points} 點`, size: 'sm' },
                            { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } },
              
                               { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } }, 
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }
                        ]}
    
                     }}; 
                return reply(replyToken, operationFlex);
            } else { 
                const studentSelectionBubbles = foundStudents.map(s => ({
                    type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'text', text: s.name || ' ', weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${s.id.substring(0, 8)}...`, size: 'sm', color: '#666666' }] },
                   
                     footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_manual_adjust_student&studentId=${s.id}` } }] } 
                }));
                return reply(replyToken, [{ type: 'text', text: '找到多位符合的學員，請點擊選擇：' }, { type: 'flex', altText: '找到多位符合的學員，請點擊選擇：', contents: { type: 'carousel', contents: studentSelectionBubbles.slice(0, 10) } }]); 
            }

        case 'awaiting_operation':
            if (text === COMMANDS.TEACHER.ADD_POINTS) { 
                await setUserState(userId, 'awaiting_manual_adjust', { ...stateData, step: 'awaiting_amount', operation: 'add' });
                return reply(replyToken, `請輸入要為 **${stateData.targetUserName || ' '}** 增加的點數數量 (例如：5)：`); 
            }
            else if (text === COMMANDS.TEACHER.DEDUCT_POINTS) { 
                await setUserState(userId, 'awaiting_manual_adjust', { ...stateData, step: 'awaiting_amount', operation: 'deduct' });
                return reply(replyToken, `請輸入要為 **${stateData.targetUserName || ' '}** 扣除的點數數量 (例如：10)：`); 
            }
            else { 
                return reply(replyToken, `請點擊「${COMMANDS.TEACHER.ADD_POINTS}」或「${COMMANDS.TEACHER.DEDUCT_POINTS}」。`); 
            }

        case 'awaiting_amount':
            const amount = parseInt(text);
            if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數數量必須是正整數。請重新輸入。'); 
            }
            
            const transactionClient = await pgPool.connect(); 
            try { 
                await transactionClient.query('BEGIN');
                const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [stateData.targetUserId]); 
                const userInTransaction = userInTransactionRes.rows[0];
                if (!userInTransaction) throw new Error('操作失敗，找不到學員資料。'); 
                
                let operationType;
                if (stateData.operation === 'add') { 
                    userInTransaction.points += amount;
                    operationType = '加點'; 
                } else { 
                    if (userInTransaction.points < amount) { 
                        await transactionClient.query('ROLLBACK');
                        await clearUserState(userId); 
                        return reply(replyToken, `學員 ${userInTransaction.name || ' '} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${amount} 點）。`);
                    } 
                    userInTransaction.points -= amount;
                    operationType = '扣點'; 
                }
                
                if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
                userInTransaction.history.push({ action: `老師手動${operationType} ${amount} 點`, time: new 
Date().toISOString(), by: userId }); 
                await saveUser(userInTransaction, transactionClient);
                await transactionClient.query('COMMIT');
                
                await clearUserState(userId);
                push(userInTransaction.id, `您的點數已由老師手動調整：${operationType}${amount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message)); 
                return reply(replyToken, `✅ 已確認為學員 **${userInTransaction.name || ' '}** ${operationType} ${amount} 點。目前點數：${userInTransaction.points} 點。`);
            } catch (err) { 
                await transactionClient.query('ROLLBACK');
                console.error('❌ 手動調整點數交易失敗:', err.message); 
                await clearUserState(userId);
                return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。');
            } finally { 
                transactionClient.release(); 
            }
    }
}
// --- 主要指令處理函式 (Stateless Command Handlers) ---

async function handleTeacherCommands(event) {
    const { replyToken, source: { userId }, message: { text } } = event;
    const now = Date.now(); 
    const user = await getUser(userId);
    if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        const announcementMenu = {
            type: 'flex', altText: '公告管理選單',
            contents: { type: 'carousel', contents: [
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '新增公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 
'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '發布新消息給所有學員', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '新增公告', data: 'action=add_announcement_start' } }, 
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 
'text', text: '歷史公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查看或刪除過去的公告', size: 'md', color: '#AAAAAA', align: 'center', weight: 
'bold' }] }, action: { type: 'postback', label: '歷史公告', data: 'action=history_announcements_show' } } 
            ]}
        };
        return reply(replyToken, announcementMenu); 
    }

    if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const newMessagesCount = (await pgPool.query(`SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'`)).rows[0].count;
        const studentManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或ID查詢學員資訊', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '學員查詢', data: 'action=start_student_search' } },
          { type: 'bubble', header: { type: 'box', layout: 'vertical', 
contents: [{ type: 'text', text: '查看留言', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: (newMessagesCount > 0 ? '#de5246' : '#6a7d8b'), paddingAll: 'lg' }, body: { type: 
'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${newMessagesCount} 則`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看所有新留言', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看留言', data: `action=run_command&text=${COMMANDS.TEACHER.VIEW_MESSAGES}` } }, 
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '留言查詢', color: 
'#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或內容查詢歷史留言', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' 
}, action: { type: 'postback', label: '留言查詢', data: 'action=start_message_search' } } 
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
        
                 { type: 'button', style: 'primary', 
color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }, 
                { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } }
            ]}
        }));
        return reply(replyToken, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } }); 
    }

    if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
        const pointManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看待確認訂單', data: `action=run_command&text=${COMMANDS.TEACHER.PENDING_ORDERS}` } },
          
          { type: 'bubble', header: { type: 'box', 
layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '手動調整點數', data: `action=run_command&text=${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS}` } } 
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
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: 
'#666666', size: 'sm', flex: 5 }] }, 
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: 
'費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, 
wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, 
                    ],
                },
                footer: {
                    type: 'box', layout: 'vertical', 
                    spacing: 'sm', flex: 0, 
                    contents: [
                        { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` } },
                        { type: 'button', style: 'secondary', color: 
'#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` } }, 
                    ],
                },
            });
        }
        const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } }; 
        courseBubbles.push(addCourseBubble); 
        let introText = (Object.keys(courseGroups).length === 0) 
? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
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
        const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, 
order) => sum + order.amount, 0);
        let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`; 
        return reply(replyToken, report.trim()); 
    }

    if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
        (async () => { 
            try {
                const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
                const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
                if 
(pendingConfirmationOrders.length === 0) return push(userId, '目前沒有待確認的購點訂單。'); 
                const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ 
type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName || ' '}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 
'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', 
height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }})); 
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
            contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 
'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name || '老師'} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } 
        };
        return reply(replyToken, announcementMessage); 
    }

    if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
        return sendPointsMenu(replyToken, userId);
    }

    if (text === 
COMMANDS.STUDENT.BUY_POINTS) { 
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
            if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。');
            } 
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
        await clearUserState(userId);
        // Clear any lingering purchase state
        return reply(replyToken, '目前沒有待取消的購點訂單。'); 
    }

    if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
        if (!user.history?.length) { return reply(replyToken, '你目前沒有點數相關記錄。'); 
        }
        let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
        user.history.slice(-5).reverse().forEach(record => { historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`; }); 
        return reply(replyToken, historyMessage.trim());
    }

    if (text === COMMANDS.STUDENT.BOOK_COURSE) {
        const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
        const upcomingCourses = Object.values(await getAllCourses()) 

          .sort((cA, cB) => new Date(cA.time).getTime() - new 
Date(cB.time).getTime());
        if (upcomingCourses.length === 0) { 
          return reply(replyToken, '未來七天內沒有您可以預約的新課程。');
        }
    
        const courseItems = [];
        upcomingCourses.slice(0, 10).forEach((course, index) => { 
          const isFull = course.students.length >= course.capacity;
          
          courseItems.push({
            type: 'box', layout: 'vertical', margin: index > 0 ? 'lg' : 'none', spacing: 'sm',
            contents: [
              { type: 'text', text: course.title, weight: 'bold', size: 'md', 
               wrap: true }, 
              { type: 'text', text: `時間：${formatDateTime(course.time)}`, size: 'sm' 
},
              { type: 'text', text: `費用：${course.pointsCost} 點｜狀態：${isFull ? '已額滿' : `報名 ${course.students.length}/${course.capacity}`}`, size: 'sm', color: '#666666' },
              { type: 'button', action: { type: 'postback', label: isFull ? '加入候補' : '立即預約', data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`, displayText: `我想${isFull ? '候補' : '預約'}：${course.title}` }, style: isFull ? 'secondary' : 'primary', color: isFull 
? undefined : '#1A759F', height: 'sm', margin: 'md' } 
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
            body: { type: 'box', layout: 'vertical', contents: courseItems 
            }, 
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '💡 課程開始前 8 小時不可退課', size: 'xs', align: 'center', color: '#AAAAAA' }] }
          }
        };
        return reply(replyToken, flexMessage); 
    }

    if (text === COMMANDS.STUDENT.MY_COURSES) {
        const courses = await getAllCourses();
        const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time)); 
        const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time)); 
        if (enrolledCourses.length === 0 && waitingCourses.length === 0) { return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。'); 
        }
        const courseBubbles = [
            ...enrolledCourses.map(course => {
                const canCancel = new 
Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
                return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', 
contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' }] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：
${course.title}` } }] } : undefined }; 
            }),
            ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 
'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } })) 
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

// --- Postback 處理函式 (V7.5.9 新增) ---
async function handleTeacherPostbacks(event, action, data) {
    const { replyToken, source: { userId } } = event;

    switch (action) {
        // --- 公告管理 ---
        case 'add_announcement_start':
            await setUserState(userId, 'awaiting_announcement_creation', { step: 'await_content' });
            return reply(replyToken, '請輸入您要發布的公告內容，或輸入「取消」以離開。');

        case 'history_announcements_show':
            const announcementsRes = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 10');
            if (announcementsRes.rows.length === 0) {
                return reply(replyToken, '目前沒有任何歷史公告。');
            }
            const announcementBubbles = announcementsRes.rows.map(ann => ({
                type: 'bubble',
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: ann.content, wrap: true },
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: `發布於 ${formatDateTime(ann.created_at)}`, size: 'xs', color: '#aaaaaa' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical',
                    contents: [{
                        type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                        action: { type: 'postback', label: '刪除此公告', data: `action=delete_announcement_confirm&annId=${ann.id}`, displayText: `我確定要刪除此公告` }
                    }]
                }
            }));
            return reply(replyToken, { type: 'flex', altText: '歷史公告列表', contents: { type: 'carousel', contents: announcementBubbles } });

        case 'delete_announcement_confirm':
            const annIdToDel = data.get('annId');
            return reply(replyToken, {
                type: 'flex', altText: '確認刪除公告',
                contents: {
                    type: 'bubble', body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [{ type: 'text', text: '您確定要刪除這則公告嗎？此操作無法復原。', wrap: true }]
                    },
                    footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'postback', label: '確定刪除', data: `action=delete_announcement_execute&annId=${annIdToDel}` } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: '取消', text: '取消' } }
                        ]
                    }
                }
            });

        case 'delete_announcement_execute':
            const annIdToDelete = data.get('annId');
            await pgPool.query('DELETE FROM announcements WHERE id = $1', [annIdToDelete]);
            return reply(replyToken, '已成功刪除該則公告。');

        // --- 學員管理 ---
        case 'start_student_search':
            await setUserState(userId, 'awaiting_student_search');
            return reply(replyToken, '請輸入您想查詢的學員姓名或完整ID：');
            
        case 'show_student_detail':
            const studentId = data.get('studentId');
            const simulatedEvent = { ...event, type: 'message', message: { type: 'text', text: studentId }};
            await setUserState(userId, 'awaiting_student_search');
            return handleStudentSearchInput(simulatedEvent);
            
        case 'start_message_search':
            await setUserState(userId, 'awaiting_message_search');
            return reply(replyToken, '請輸入您想查詢的留言關鍵字 (姓名/內容)：');

        case 'mark_feedback_read':
            const msgIdRead = data.get('msgId');
            await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgIdRead]);
            await reply(replyToken, '已將此留言標為已讀。');
            // Re-fetch and show the remaining messages
            const simulatedViewEvent = { ...event, type: 'message', message: { type: 'text', text: COMMANDS.TEACHER.VIEW_MESSAGES } };
            return handleTeacherCommands(simulatedViewEvent);
            
        case 'reply_feedback':
            const msgIdReply = data.get('msgId');
            const targetUserId = data.get('userId');
            await setUserState(userId, 'awaiting_reply', { msgId: msgIdReply, targetUserId: targetUserId });
            return reply(replyToken, '請直接輸入您要回覆的內容：\n(輸入「取消」可放棄回覆)');

        // --- 點數管理 ---
        case 'confirm_order':
            const orderIdConfirm = data.get('orderId');
            const transactionClientConfirm = await pgPool.connect();
            try {
                await transactionClientConfirm.query('BEGIN');
                const orderRes = await transactionClientConfirm.query("SELECT * FROM orders WHERE order_id = $1 AND status = 'pending_confirmation' FOR UPDATE", [orderIdConfirm]);
                if (orderRes.rows.length === 0) throw new Error('訂單不存在或狀態已變更。');
                
                const order = orderRes.rows[0];
                const userRes = await transactionClientConfirm.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [order.user_id]);
                const userToCredit = userRes.rows[0];

                userToCredit.points += order.points;
                if (!userToCredit.history) userToCredit.history = [];
                userToCredit.history.push({ action: `儲值 ${order.points} 點 (訂單 ${order.order_id})`, time: new Date().toISOString() });
                
                await saveUser(userToCredit, transactionClientConfirm);
                await transactionClientConfirm.query("UPDATE orders SET status = 'completed' WHERE order_id = $1", [orderIdConfirm]);
                await transactionClientConfirm.query('COMMIT');
                
                await push(order.user_id, `您的訂單 (ID: ${order.order_id}) 已確認，已為您儲值 ${order.points} 點！\n您目前的點數為 ${userToCredit.points} 點。`);
                return reply(replyToken, `已確認訂單 ${order.order_id} 並為學員 ${userToCredit.name} 加上 ${order.points} 點。`);
            } catch (err) {
                await transactionClientConfirm.query('ROLLBACK');
                console.error(`❌ 確認訂單 ${orderIdConfirm} 失敗:`, err);
                return reply(replyToken, `處理訂單時發生錯誤：${err.message}`);
            } finally {
                transactionClientConfirm.release();
            }

        case 'reject_order':
            const orderIdReject = data.get('orderId');
            // Here you could also set a state to ask for rejection reason
            await pgPool.query("UPDATE orders SET status = 'rejected' WHERE order_id = $1", [orderIdReject]);
            const orderRes = await pgPool.query('SELECT user_id FROM orders WHERE order_id = $1', [orderIdReject]);
            if (orderRes.rows.length > 0) {
                await push(orderRes.rows[0].user_id, `很抱歉，您的訂單 (ID: ${orderIdReject}) 已被老師退回。\n可能是因為資訊有誤或查無款項，請至「點數管理」取消訂單後再重新操作，或直接與老師聯繫。`);
            }
            return reply(replyToken, `已退回訂單 ${orderIdReject}。`);

        case 'select_manual_adjust_student':
            const studentIdAdjust = data.get('studentId');
            const simulatedAdjustEvent = { ...event, type: 'message', message: { type: 'text', text: studentIdAdjust }};
            return handleManualAdjust(simulatedAdjustEvent, { state_data: { step: 'awaiting_student_info' }});
            
        // --- 課程管理 ---
        case 'add_course_start':
            await setUserState(userId, 'awaiting_course_creation', { step: 1 });
            return reply(replyToken, `即將開始新增課程系列。\n請輸入課程系列名稱（例如：基礎流動瑜珈、空中環），或輸入「${COMMANDS.STUDENT.CANCEL_ADD_COURSE}」取消。`);

        case 'manage_course_group':
            const prefix = data.get('prefix');
            const coursesInGroup = (await pgPool.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT 10", [`${prefix}%`])).rows;
            
            if (coursesInGroup.length === 0) return reply(replyToken, `系列 ${prefix} 已無任何未來的課程可供操作。`);

            const singleCourseBubbles = coursesInGroup.map(c => ({
                type: 'bubble',
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
                        { type: 'text', text: c.title, weight: 'bold', wrap: true },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm' },
                        { type: 'text', text: `已報名: ${c.students.length} / ${c.capacity} | 候補: ${c.waiting.length}`, size: 'sm', color: '#666666' }
                    ]
                },
                footer: {
                    type: 'box', layout: 'vertical',
                    contents: [{
                        type: 'button', style: 'secondary', color: '#de5246', height: 'sm',
                        action: { type: 'postback', label: '取消此堂課', data: `action=cancel_single_course_confirm&courseId=${c.id}`, displayText: `我想取消單堂課：${c.title}` }
                    }]
                }
            }));
            return reply(replyToken, { type: 'flex', altText: '請選擇要取消的單堂課程', contents: { type: 'carousel', contents: singleCourseBubbles }});

        case 'cancel_single_course_confirm':
            const courseIdToCancel = data.get('courseId');
            const courseToCancel = await getCourse(courseIdToCancel);
            if (!courseToCancel) return reply(replyToken, '找不到此課程或已被取消。');
            
            return reply(replyToken, {
                type: 'flex', altText: '確認取消單堂課',
                contents: {
                    type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '❗️ 確認取消單堂課', weight: 'bold', color: '#ffffff' }], backgroundColor: '#de5246' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `您確定要取消以下課程嗎？\n\n${courseToCancel.title}\n${formatDateTime(courseToCancel.time)}`, wrap: true },
                            { type: 'text', text: `將會退還點數給 ${courseToCancel.students.length} 位已報名學員，並通知候補學員。此操作無法復原。`, wrap: true, size: 'sm', color: '#666666' }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'postback', label: '確定取消', data: `action=cancel_single_course_execute&courseId=${courseIdToCancel}` } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: '暫不取消', text: '暫不取消' } }
                        ]
                    }
                }
            });
            
        case 'cancel_single_course_execute':
        case 'cancel_course_group_execute':
            const courseIdSingle = data.get('courseId');
            const prefixGroup = data.get('prefix');
            const isBatch = action === 'cancel_course_group_execute';
            
            await reply(replyToken, isBatch ? `正在批次處理中，請稍候...` : '正在處理中，請稍候...');

            const transactionClientCancel = await pgPool.connect();
            try {
                await transactionClientCancel.query('BEGIN');
                const coursesToCancelRes = await transactionClientCancel.query(
                    isBatch ? `SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE` : `SELECT * FROM courses WHERE id = $1 AND time > NOW() FOR UPDATE`,
                    isBatch ? [`${prefixGroup}%`] : [courseIdSingle]
                );
                const coursesToCancel = coursesToCancelRes.rows;
                if (coursesToCancel.length === 0) throw new Error('找不到任何可取消的課程。');
                
                let totalRefundedPoints = 0;
                let totalAffectedStudents = 0;
                let notifiedStudents = new Set();
                
                for (const course of coursesToCancel) {
                    const allParticipants = [...course.students, ...course.waiting];
                    for (const studentId of allParticipants) {
                        if (notifiedStudents.has(studentId)) continue;
                        
                        const studentToRefundRes = await transactionClientCancel.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [studentId]);
                        const studentToRefund = studentToRefundRes.rows[0];
                        if (!studentToRefund) continue;
                        
                        let historyAction = '';
                        if (course.students.includes(studentId)) {
                             studentToRefund.points += course.points_cost;
                             totalRefundedPoints += course.points_cost;
                             historyAction = `老師取消課程退點: ${course.title} (退 ${course.points_cost} 點)`;
                        } else {
                             historyAction = `老師取消課程通知: ${course.title} (您在候補名單中)`;
                        }

                        if (!studentToRefund.history) studentToRefund.history = [];
                        studentToRefund.history.push({ action: historyAction, time: new Date().toISOString() });
                        await saveUser(studentToRefund, transactionClientCancel);
                        notifiedStudents.add(studentId);
                        totalAffectedStudents++;
                    }
                    await deleteCourse(course.id, transactionClientCancel);
                }

                await transactionClientCancel.query('COMMIT');
                
                // 非同步推播通知
                (async () => {
                   for (const studentId of notifiedStudents) {
                      await push(studentId, isBatch ? `老師已取消「${coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '')}」系列的所有課程，相關點數已退還。` : `老師已取消課程「${coursesToCancel[0].title}」，相關點數已退還。`);
                   }
                })();
                
                const successMsg = isBatch
                    ? `✅ 成功批次取消 ${coursesToCancel.length} 堂「${coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '')}」系列課程。\n共影響 ${totalAffectedStudents} 位學員，退還 ${totalRefundedPoints} 點。`
                    : `✅ 成功取消課程「${coursesToCancel[0].title}」。\n共影響 ${totalAffectedStudents} 位學員，退還 ${totalRefundedPoints} 點。`;
                return push(userId, successMsg);

            } catch (err) {
                await transactionClientCancel.query('ROLLBACK');
                console.error(`❌ 取消課程失敗 (${action}):`, err);
                return push(userId, `處理失敗：${err.message}`);
            } finally {
                transactionClientCancel.release();
            }

        case 'cancel_course_group_confirm':
            const prefixToCancel = data.get('prefix');
            const courseCountRes = await pgPool.query("SELECT COUNT(*) FROM courses WHERE id LIKE $1 AND time > NOW()", [`${prefixToCancel}%`]);
            const courseCount = courseCountRes.rows[0].count;
            if (courseCount == 0) return reply(replyToken, `系列 ${prefixToCancel} 已無任何未來的課程可供取消。`);

            return reply(replyToken, {
                type: 'flex', altText: '確認批次取消課程',
                contents: {
                    type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '❗️ 確認批次取消', weight: 'bold', color: '#ffffff' }], backgroundColor: '#de5246' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `您確定要取消系列代碼為【${prefixToCancel}】的所有 ${courseCount} 堂未來課程嗎？`, wrap: true, weight: 'bold' },
                            { type: 'text', text: `系統將會自動退還點數給所有已報名的學員。此操作無法復原。`, wrap: true, size: 'sm', color: '#666666' }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'postback', label: '確定批次取消', data: `action=cancel_course_group_execute&prefix=${prefixToCancel}` } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: '取消', text: '取消' } }
                        ]
                    }
                }
            });
    }
}

async function handleStudentPostbacks(event, action, data) {
    const { replyToken, source: { userId } } = event;

    switch (action) {
        // --- 購點流程 ---
        case 'buy_points_plan':
            const plan = PURCHASE_PLANS.find(p => p.id === data.get('planId'));
            if (!plan) return reply(replyToken, '無效的購買選項。');
            
            await setUserState(userId, 'awaiting_purchase_confirmation', { userId, points: plan.points, amount: plan.amount, status: 'pending_payment' });
            
            const confirmMsg = {
                type: 'flex', altText: '確認購買點數',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '確認購買資訊', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `您選擇了方案：`, size: 'sm' },
                            { type: 'text', text: `${plan.points} 點 - ${plan.amount} 元`, weight: 'bold', size: 'xl', align: 'center' },
                            { type: 'separator' },
                            { type: 'text', text: `請點擊「確認購買」以產生訂單，或點擊「取消」返回。`, wrap: true, size: 'sm' }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                            { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
                        ]
                    }
                }
            };
            return reply(replyToken, confirmMsg);

        case 'input_last_5_for_order':
            const orderId = data.get('orderId');
            if (!orderId) return reply(replyToken, '訂單資訊錯誤。');
            await setUserState(userId, 'awaiting_purchase_input', { orderId });
            return reply(replyToken, `請輸入您用於訂單 ${orderId} 的匯款帳號後五碼，或輸入「${COMMANDS.STUDENT.CANCEL_INPUT_LAST5}」返回。`);
        
        // --- 課程預約/取消 ---
        case 'confirm_booking':
            const courseId = data.get('courseId');
            const type = data.get('type'); // 'book' or 'wait'
            const course = await getCourse(courseId);
            if (!course) return reply(replyToken, '課程不存在或已被取消。');
            if (new Date(course.time).getTime() < Date.now()) return reply(replyToken, '此課程已過期，無法操作。');
            
            await setUserState(userId, 'awaiting_booking_confirmation', { courseId, actionType: type });
            const isBooking = type === 'book';
            
            const flexConfirm = {
                type: 'flex', altText: isBooking ? '確認預約課程' : '確認加入候補',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: isBooking ? '確認預約' : '確認候補', weight: 'bold', color: '#ffffff' }], backgroundColor: '#34a0a4' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: course.title, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'text', text: formatDateTime(course.time), size: 'sm' },
                            { type: 'separator' },
                            { type: 'text', text: isBooking ? `此課程將扣除您 ${course.pointsCost} 點，確定要預約嗎？` : '此課程目前已額滿，您要加入候補名單嗎？有名額釋出時，若您點數足夠將會為您自動遞補並扣點。', wrap: true }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING } }
                        ]
                    }
                }
            };
            return reply(replyToken, flexConfirm);

        case 'cancel_booking_confirm':
            const courseIdCancel = data.get('courseId');
            const courseToCancelBook = await getCourse(courseIdCancel);
            if (!courseToCancelBook) return reply(replyToken, '課程不存在或已被取消。');

            await setUserState(userId, 'awaiting_booking_confirmation', { courseId: courseIdCancel, actionType: 'cancel_book' });
            
            const flexCancelBook = {
                type: 'flex', altText: '確認取消預約',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '確認取消預約', weight: 'bold', color: '#ffffff' }], backgroundColor: '#de5246' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `您確定要取消預約以下課程嗎？\n\n${courseToCancelBook.title}\n${formatDateTime(courseToCancelBook.time)}`, wrap: true },
                            { type: 'text', text: `取消後將會退還 ${courseToCancelBook.points_cost} 點。`, size: 'sm', color: '#666666', wrap: true }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING, text: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING } }
                        ]
                    }
                }
            };
            return reply(replyToken, flexCancelBook);

        case 'cancel_waiting_confirm':
            const courseIdWait = data.get('courseId');
            const courseToCancelWait = await getCourse(courseIdWait);
            if (!courseToCancelWait) return reply(replyToken, '課程不存在或已被取消。');

            await setUserState(userId, 'awaiting_booking_confirmation', { courseId: courseIdWait, actionType: 'cancel_wait' });
            
            const flexCancelWait = {
                type: 'flex', altText: '確認取消候補',
                contents: {
                    type: 'bubble',
                    header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '確認取消候補', weight: 'bold', color: '#ffffff' }], backgroundColor: '#8d99ae' },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `您確定要取消候補以下課程嗎？`, wrap: true },
                            { type: 'text', text: courseToCancelWait.title, weight: 'bold', size: 'lg', wrap: true }
                        ]
                    },
                    footer: {
                        type: 'box', layout: 'vertical', spacing: 'sm',
                        contents: [
                            { type: 'button', style: 'primary', color: '#8d99ae', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING, text: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING } }
                        ]
                    }
                }
            };
            return reply(replyToken, flexCancelWait);
    }
}

// --- 主要事件處理器 (V7.5.9 核心修正) ---
async function handleEvent(event) {
    if (!['message', 'postback'].includes(event.type)) return;
    const { replyToken, source: { userId } } = event; 
    // 1. 取得使用者資料 (初次使用者會自動建立)
    let user = await getUser(userId); 
    if (!user) { 
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: profile.pictureUrl }; 
            await saveUser(user);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, 
STUDENT_RICH_MENU_ID); 
        } catch (err) {
            console.error(`❌ 獲取新用戶 ${userId} 資料失敗:`, err.message);
            user = { id: userId, name: `新用戶`, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: null }; 
            await saveUser(user);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(`❌ 備用連結學員 Rich Menu 失敗: ${e.message}`)); 
        }
    } else if (!user.picture_url || !user.name) { // 為舊用戶補充頭像或名稱
        try {
            const profile = await client.getProfile(userId);
            user.pictureUrl = profile.pictureUrl; 
            user.name = profile.displayName;
            await saveUser(user);
        } catch(e) { console.error(`❌ 為現有使用者 ${userId} 更新資料失敗:`, e.message); 
        }
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
    if (userState && event.type === 'message' && event.message.type === 'text') { 
        const stateName = userState.state_name;
        switch(stateName) { 
            case 'awaiting_student_search': return handleStudentSearchInput(event);
            case 'awaiting_message_search': return handleMessageSearchInput(event); 
            case 'awaiting_feedback': return handleFeedbackInput(event);
            case 'awaiting_reply': return handleReplyInput(event, userState);
            case 'awaiting_purchase_confirmation': 
            case 'awaiting_purchase_input': return handlePurchaseFlow(event, 
userState);
            case 'awaiting_booking_confirmation': return handleBookingConfirmation(event, userState); 
            case 'awaiting_course_creation': return handleCourseCreation(event, userState);
            case 'awaiting_manual_adjust': return handleManualAdjust(event, userState);
            case 'awaiting_announcement_creation': return handleAnnouncementCreation(event, userState);
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
                await clearUserState(userId);
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

        // --- Postback 處理 ---
        if (user.role === 'teacher') { 
            await handleTeacherPostbacks(event, action, data);
        } else { 
            await handleStudentPostbacks(event, action, data);
        } 
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
  const cleanupQuery = 'DELETE FROM user_states WHERE expires_at <= NOW()';
  await pgPool.query(cleanupQuery);
  await cleanCoursesDB();

  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7.5.9 (修正函式內換行錯誤)`);
  
  const PING_INTERVAL_MS = 1000 * 60 * 4;
  const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => pgPool.query(cleanupQuery), 1000 * 60 * 60);
  
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`); 
      setInterval(keepAlive, PING_INTERVAL_MS);
      keepAlive();
  } else {
      console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
