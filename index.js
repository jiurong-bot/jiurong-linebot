// index.js - V7.5.5 (最終完整修正版)
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

async function 
handleStudentSearchInput(event) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const query = event.message.text.trim(); [cite: 5]
    
    await clearUserState(userId);
    const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
    [cite_start]const foundUsers = res.rows; [cite: 6]
    
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
                [cite_start]).catch(e => console.error(`背景更新用戶 ${dbUser.id} 資料失敗:`, e.message)); [cite: 8]
                return dbUser;
    
            } catch (e) {
                [cite_start]console.error(`查詢用戶 ${dbUser.id} 最新資料失敗:`, e.message); [cite: 9]
                return dbUser;
            }
        })
    );
    [cite_start]const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png'; [cite: 10]

    if (updatedUsersWithFreshProfiles.length === 1) {
        const foundUser = updatedUsersWithFreshProfiles[0];
        const historyRecords = (foundUser.history?.length > 0) 
            ?
            foundUser.history.slice(-5).reverse().map(record => ({
                type: 'text', text: `・${record.action || '未知操作'} (${formatDateTime(record.time)})`, size: 'sm', color: '#666666', wrap: true
            [cite_start]})) [cite: 12]
            : [{ type: 'text', text: '尚無歷史記錄', size: 'sm', color: '#999999' }];
        const singleResultFlex = {
            type: 'flex', altText: `學員 ${foundUser.name || [cite_start]' '} 的資訊`, [cite: 13, 14]
            contents: {
                type: 'bubble',
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
                    contents: [
     
                       {
                            [cite_start]type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', [cite: 15]
                            contents: [
                 
                               [cite_start]{ type: 'image', url: foundUser.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: '100px' }, [cite: 16, 17]
                                { type: 'text', text: foundUser.name || [cite_start]' ', weight: 'bold', size: 'xl', wrap: true } [cite: 18]
                            ]
                        },
                        { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'lg', contents: [
      
                           [cite_start]{ type: 'box', layout: 'baseline', spacing: 'sm', contents: [ [cite: 19]
                                { type: 'text', text: '剩餘點數', color: '#aaaaaa', size: 'sm', flex: 3 },
                           
                                 [cite_start]{ type: 'text', text: `${foundUser.points} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5, weight: 'bold' } [cite: 20]
                            ]},
                            { type: 'box', layout: 'baseline', spacing: 'sm', contents: [
               
                                 [cite_start]{ type: 'text', text: '學員 ID', color: '#aaaaaa', size: 'sm', flex: 3 }, [cite: 21]
                                { type: 'text', text: foundUser.id, wrap: true, color: '#666666', 
size: 'xxs', flex: 5 }
                          
                              [cite_start]]} [cite: 22]
                        ]},
                        { type: 'separator', margin: 'xxl' },
                        { type: 'text', text: '近期記錄 (最多5筆)', weight: 'bold', size: 'md', margin: 'lg' },
         
                       [cite_start]...historyRecords [cite: 23]
                    ]
                }
            }
        };
        [cite_start]return reply(replyToken, singleResultFlex); [cite: 24]
    } else {
        const userBubbles = updatedUsersWithFreshProfiles.map(u => ({
            type: 'bubble',
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                  
                   {
                        [cite_start]type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', [cite: 25]
                        contents: [
                            { type: 'image', url: u.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: 
[cite_start]'100px' }, [cite: 26]
                            { type: 'box', layout: 'vertical', contents: [
                                    { type: 'text', text: u.name || ' ', weight: 'bold', size: 'lg', wrap: true },
               
                                     [cite_start]{ type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666' } [cite: 27]
                                ]
                            }
        
                         [cite_start]] [cite: 28]
                    }
                ]
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm',
  
               [cite_start]contents: [{ [cite: 29]
                    type: 'button', style: 'primary', color: '#1A759F', height: 'sm',
                    action: {
                        type: 'postback', label: '查看詳細資訊', data: `action=show_student_detail&studentId=${u.id}`, displayText: `查看學員 ${u.name || [cite_start]' '} 的詳情` [cite: 30]
                    }
                }]
            }
        }));
        [cite_start]return reply(replyToken, [{ type: 'text', text: `找到 ${updatedUsersWithFreshProfiles.length} 位符合的學員：` }, { type: 'flex', altText: '請選擇學員', contents: { type: 'carousel', contents: userBubbles.slice(0, 10) } }]); [cite: 31]
    }
}

async function handleMessageSearchInput(event) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const query = event.message.text.trim(); [cite: 33]
    
    await clearUserState(userId);

    const messagesRes = await pgPool.query(
      "SELECT * FROM feedback_messages WHERE user_name LIKE $1 OR message LIKE $2 OR teacher_reply LIKE $3 ORDER BY timestamp DESC LIMIT 10", 
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );
    [cite_start]const foundMessages = messagesRes.rows; [cite: 34]

    if (foundMessages.length === 0) {
      return reply(replyToken, `找不到與「${query}」相關的留言紀錄。`);
    }

    const messageBubbles = foundMessages.map(msg => {
      const headerColor = msg.status === 'replied' ? '#1A759F' : (msg.status === 'read' ? '#52b69a' : '#6a7d8b');
      const replyContent = msg.teacher_reply ? [{ type: 'text', text: '老師回覆:', size: 'sm', color: '#aaaaaa', margin: 'md' }, { type: 'text', text: msg.teacher_reply, wrap: true }] : [];
      return {
        type: 'bubble',
        [cite_start]header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name || ' '} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: headerColor, paddingAll: 'lg' }, [cite: 36]
        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
            { type: 'text', text: msg.message, wrap: true },
            { type: 'separator', margin: 'md' },
            ...replyContent,
            { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa', margin: 
[cite_start]'md' } [cite: 37]
        ]},
        footer: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `狀態: ${msg.status === 'replied' ? '已回覆' : 
(msg.status === 'read' ? '已讀' : '新留言')[cite_start]}`, size: 'sm', color: '#aaaaaa', align: 'center' } [cite: 38]
        ]}
      };
    [cite_start]}); [cite: 39]

    return reply(replyToken, [{ type: 'text', text: '以下是與您搜尋相關的留言紀錄：' }, { type: 'flex', altText: '留言查詢結果', contents: { type: 'carousel', contents: messageBubbles } }]);
}

async function handleFeedbackInput(event) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const text = event.message.text.trim(); [cite: 41]
    
    if (text.toLowerCase() === '取消') {
        await clearUserState(userId);
        [cite_start]return reply(replyToken, '已取消留言。'); [cite: 42]
    }
    
    const user = await getUser(userId);
    const messageId = `MSG${Date.now()}`;
    await pgPool.query(
      'INSERT INTO feedback_messages (id, user_id, user_name, message, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [messageId, userId, user.name, text, 'new', new Date()]
    [cite_start]); [cite: 43]
    [cite_start]await clearUserState(userId); [cite: 44]
    
    if (TEACHER_ID) {
      push(TEACHER_ID, `🔔 您有來自「${user.name || '未命名用戶'}」的新留言！請至「學員管理」->「查看留言」處理。`).catch(e => console.error(e));
    }
    [cite_start]return reply(replyToken, '感謝您的留言，我們已收到您的訊息！'); [cite: 45]
}

async function handleReplyInput(event, userState) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const text = event.message.text.trim(); [cite: 46]
    const { msgId, targetUserId } = userState.state_data;
    if (text.toLowerCase() === '取消') {
      await clearUserState(userId);
      [cite_start]return reply(replyToken, '已取消回覆。'); [cite: 47]
    }
    
    [cite_start]push(targetUserId, `老師回覆您在「聯絡我們」的留言：\n\n${text}`).catch(e => console.error(e)); [cite: 48]
    [cite_start]await pgPool.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, msgId]); [cite: 49]
    
    await clearUserState(userId);
    [cite_start]return reply(replyToken, '已成功回覆學員。'); [cite: 50]
}
async function handlePurchaseFlow(event, userState) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const text = event.message.text.trim(); [cite: 51]
    const stateName = userState.state_name;
    const stateData = userState.state_data;
    [cite_start]if (stateName === 'awaiting_purchase_confirmation') { [cite: 52]
        if (text === COMMANDS.STUDENT.CONFIRM_BUY_POI
NTS) {
            const transactionClientConfirm = await pgPool.connect();
            [cite_start]try { [cite: 53]
              await transactionClientConfirm.query('BEGIN');
              [cite_start]const orderId = `O${Date.now()}`; [cite: 54]
              const newOrder = { ...stateData, orderId: orderId };
              await saveOrder(newOrder, transactionClientConfirm);
              await transactionClientConfirm.query('COMMIT');
              await clearUserState(userId);
              [cite_start]return reply(replyToken, `已為您建立訂單，請完成轉帳。\n\n戶名：${BANK_INFO.accountName}\n銀行：${BANK_INFO.bankName}\n帳號：${BANK_INFO.accountNumber}\n\n完成轉帳後，請至「點數管理」點擊訂單並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`); [cite: 55]
            } catch (err) { 
                await transactionClientConfirm.query('ROLLBACK');
                [cite_start]console.error('❌ 確認購買交易失敗:', err.message); [cite: 56]
                await clearUserState(userId);
                return reply(replyToken, '確認購買時發生錯誤，請稍後再試。'); 
            } finally { 
                [cite_start]transactionClientConfirm.release(); [cite: 57]
            }
        } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) { 
            await clearUserState(userId);
            [cite_start]return sendPointsMenu(replyToken, userId); [cite: 58]
        } else { 
            [cite_start]return reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); [cite: 59]
        }
    }

    if (stateName === 'awaiting_purchase_input') {
        if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) { 
            await clearUserState(userId);
            [cite_start]return sendPointsMenu(replyToken, userId); [cite: 60]
        }

        const { orderId } = stateData;
        [cite_start]const last5Digits = text; [cite: 61]
        if (!/^\d{5}$/.test(last5Digits)) { 
            return reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。');
        }

        [cite_start]const transactionClient = await pgPool.connect(); [cite: 62]
        [cite_start]try { [cite: 63]
            await transactionClient.query('BEGIN');
            [cite_start]const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]); [cite: 64]
            let orderInTransaction = orderInTransactionRes.rows[0];
            if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && 
[cite_start]orderInTransaction.status !== 'rejected')) { [cite: 65]
                await transactionClient.query('ROLLBACK');
                [cite_start]await clearUserState(userId); [cite: 66]
                return reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。'); 
            }
            
            orderInTransaction.last_5_digits = last5Digits;
            [cite_start]orderInTransaction.status = 'pending_confirmation'; [cite: 67]
            const user = await getUser(userId, transactionClient);
            const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: user.name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: 
orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
            [cite_start]await saveOrder(newOrderData, transactionClient); [cite: 68]
            await transactionClient.query('COMMIT');
            
            await clearUserState(userId);
            
            const successMessage = { type: 'text', text: `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。` };
            [cite_start]if (TEACHER_ID) { [cite: 69]
                push(TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName || ' '}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e 
=> console.error(`❌ 通知老師新訂單失敗:`, e.message));
            }
            [cite_start]await reply(replyToken, successMessage); [cite: 70]
            return sendPointsMenu(replyToken, userId);
        [cite_start]} catch (err) { [cite: 71]
            await transactionClient.query('ROLLBACK');
            console.error('❌ 提交後五碼交易失敗:', err.message);
            [cite_start]await clearUserState(userId); [cite: 72]
            await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。');
        } finally { 
            [cite_start]transactionClient.release(); [cite: 73]
        }
    }
}
async function handleBookingConfirmation(event, userState) {
    const { replyToken, source: { userId } } = event;
    [cite_start]const text = event.message.text.trim(); [cite: 74]
    const { courseId, actionType } = userState.state_data;
    
    const course = await getCourse(courseId);
    [cite_start]if (!course) { [cite: 75]
        await clearUserState(userId);
        return reply(replyToken, '操作失敗：課程不存在或已被取消。');
    }

    if (actionType === 'book' || actionType === 'wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_BOOKIN
G) {
            await clearUserState(userId);
            [cite_start]const transactionClient = await pgPool.connect(); [cite: 77]
            try {
                await transactionClient.query('BEGIN');
                [cite_start]const currentUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]; [cite: 78]
                [cite_start]const courseInTransaction = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0]; [cite: 79]
                [cite_start]if (!currentUser || !courseInTransaction) throw new Error('用戶或課程資料不存在。'); [cite: 80]
                if (currentUser.points < courseInTransaction.points_cost) throw new Error(`點數不足，此課程需要 ${courseInTransaction.points_cost} 點。`);
                [cite_start]if (courseInTransaction.students.includes(userId) || courseInTransaction.waiting.includes(userId)) throw new Error('您已預約或候補此課程。'); [cite: 81]
                if (new Date(courseInTransaction.time).getTime() < Date.now()) throw new Error('課程已過期。');
                [cite_start]const courseToSave = { id: courseInTransaction.id, title: courseInTransaction.title, time: courseInTransaction.time, capacity: courseInTransaction.capacity, students: courseInTransaction.students, waiting: courseInTransaction.waiting, pointsCost: courseInTransaction.points_cost }; [cite: 82]
                if (courseToSave.students.length 
[cite_start]< courseToSave.capacity) { [cite: 83]
                    courseToSave.students.push(userId);
                    [cite_start]currentUser.points -= courseToSave.pointsCost; [cite: 84]
                    if(!currentUser.history) currentUser.history = [];
                    currentUser.history.push({ id: courseId, action: `預約成功：${courseToSave.title} (扣 ${courseToSave.pointsCost} 點)`, time: new Date().toISOString() });
                    [cite_start]await saveUser(currentUser, transactionClient); [cite: 85]
                    await saveCourse(courseToSave, transactionClient); 
                    await transactionClient.query('COMMIT'); 
                    return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`);
                [cite_start]} else { [cite: 86]
                    courseToSave.waiting.push(userId);
                    [cite_start]if(!currentUser.history) currentUser.history = []; [cite: 87]
                    currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                    await saveCourse(courseToSave, transactionClient); 
                    await saveUser(currentUser, transactionClient);
                    [cite_start]await transactionClient.query('COMMIT'); [cite: 88]
                    return reply(replyToken, `課程已額滿，您已成功加入候補名單。`);
                }
            } catch (err) { 
                await 
transactionClient.query('ROLLBACK');
                [cite_start]console.error("❌ 預約課程交易失敗:", err.stack); [cite: 89]
                return reply(replyToken, `預約失敗：${err.message}`); 
            } finally { 
                [cite_start]transactionClient.release(); [cite: 90]
            }
        } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) { 
            await clearUserState(userId);
            [cite_start]return reply(replyToken, `已放棄預約課程「${course.title}」。`); [cite: 91]
        } else { 
            [cite_start]return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_BOOKING}」。`); [cite: 92]
        }
    }
    else if (actionType === 'cancel_book') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
            await clearUserState(userId);
            [cite_start]const transactionClient = await pgPool.connect(); [cite: 93]
            try {
                await transactionClient.query('BEGIN');
                [cite_start]const courseToCancel = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0]; [cite: 94]
                [cite_start]if (!courseToCancel || !courseToCancel.students.includes(userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未預約此課程或課程不存在。'); [cite: 95]
                }
                [cite_start]if (new Date(courseToCancel.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { await transactionClient.query('ROLLBACK'); [cite: 96]
                    return reply(replyToken, `課程「${courseToCancel.title}」即將開始（不足8小時），無法取消。`); [cite_start]} [cite: 97]
                
                const cancellingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                [cite_start]cancellingUser.points += courseToCancel.points_cost; [cite: 98]
                if(!cancellingUser.history) cancellingUser.history = [];
                cancellingUser.history.push({ id: courseId, action: `課程取消退點：${courseToCancel.title} (退 ${courseToCancel.points_cost} 點)`, time: 
new Date().toISOString() });
                [cite_start]await saveUser(cancellingUser, transactionClient); [cite: 99]
                
                courseToCancel.students = courseToCancel.students.filter(sid => sid !== userId);
                let replyMessage = `課程「${courseToCancel.title}」已取消，已退還 ${courseToCancel.points_cost} 點。`;
                [cite_start]if (courseToCancel.waiting.length > 0) { [cite: 100]
                    const nextWaitingUserId = courseToCancel.waiting.shift();
                    [cite_start]const nextWaitingUser = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [nextWaitingUserId])).rows[0]; [cite: 101]
                    if (nextWaitingUser && nextWaitingUser.points >= 
[cite_start]courseToCancel.points_cost) { [cite: 102]
                        courseToCancel.students.push(nextWaitingUserId);
                        [cite_start]nextWaitingUser.points -= courseToCancel.points_cost; [cite: 103]
                        if(!nextWaitingUser.history) nextWaitingUser.history = [];
                        nextWaitingUser.history.push({ id: courseId, action: `候補補上：${courseToCancel.title} (扣 ${courseToCancel.points_cost} 點)`, time: new Date().toISOString() });
                        [cite_start]await saveUser(nextWaitingUser, transactionClient); [cite: 104]
                        push(nextWaitingUserId, `您已從候補名單補上課程「${courseToCancel.title}」！系統已自動扣點。`).catch(e => 
console.error(e.message));
                        replyMessage += '\n有候補學生已遞補成功。';
                    [cite_start]} else if (nextWaitingUser) { [cite: 105]
                        replyMessage += `\n候補學生 ${nextWaitingUser.name || [cite_start]' '} 點數不足，未能遞補。`; [cite: 106]
                        if (TEACHER_ID) push(TEACHER_ID, `課程「${courseToCancel.title}」有學生取消，但候補者 ${nextWaitingUser.name || ' '} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                    }
                }
                [cite_start]await saveCourse({ ...courseToCancel, pointsCost: courseToCancel.points_cost }, transactionClient); [cite: 107]
                [cite_start]await transactionClient.query('COMMIT'); [cite: 108]
                return reply(replyToken, replyMessage.trim());
            } catch(err) { 
                await transactionClient.query('ROLLBACK');
                [cite_start]console.error("❌ 取消預約交易失敗:", err.stack); [cite: 109]
                return reply(replyToken, `取消失敗：${err.message}`); 
            } finally { 
                [cite_start]transactionClient.release(); [cite: 110]
            }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) { 
            await clearUserState(userId);
            [cite_start]return reply(replyToken, `已放棄取消課程「${course.title}」。`); [cite: 111]
        } else { 
            [cite_start]return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING}」。`); [cite: 112]
        }
    }
    else if (actionType === 'cancel_wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
            await clearUserState(userId);
            [cite_start]const transactionClient = await pgPool.connect(); [cite: 113]
            try {
                await transactionClient.query('BEGIN');
                [cite_start]const courseToCancelWaiting = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0]; [cite: 114]
                if (!courseToCancelWaiting || !courseToCancelWaiting.waiting?.includes(
[cite_start]userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未候補此課程或課程不存在。'); [cite: 115]
                }
                
                [cite_start]const userInTransaction = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0]; [cite: 116]
                [cite_start]courseToCancelWaiting.waiting = courseToCancelWaiting.waiting.filter(x => x !== userId); [cite: 117]
                if(!userInTransaction.history) userInTransaction.history = [];
                userInTransaction.history.push({ id: courseId, action: `取消候補：${courseToCancelWaiting.title}`, time: new Date().toISOString() });
                await saveCourse({ ...courseToCancelWaiting, pointsCost: 
[cite_start]courseToCancelWaiting.points_cost }, transactionClient); [cite: 118]
                await saveUser(userInTransaction, transactionClient); 
                await transactionClient.query('COMMIT'); 
                return reply(replyToken, `已取消課程「${courseToCancelWaiting.title}」的候補。`);
            [cite_start]} catch(err) { [cite: 119]
                await transactionClient.query('ROLLBACK');
                [cite_start]console.error("❌ 取消候補交易失敗:", err.stack); [cite: 120]
                return reply(replyToken, `取消失敗：${err.message}`); 
            } finally { 
                [cite_start]transactionClient.release(); [cite: 121]
            }
        } else if (text === 
COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { 
            await clearUserState(userId);
            [cite_start]return reply(replyToken, `已放棄取消課程「${course.title}」的候補。`); [cite: 122]
        } else { 
            [cite_start]return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_WAITING}」。`); [cite: 123]
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
[cite_start]'box', layout: 'vertical', contents: [{ type: 'text', text: content, wrap: true }] }, [cite: 124]
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: 
COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
     
           [cite_start]]} [cite: 125]
        }
    };
    [cite_start]return reply(replyToken, confirmMsg); [cite: 126]
}

async function handleAnnouncementCreation(event, userState) {
    const { replyToken, source: { userId }, message: { text } } = event;
    [cite_start]const step = userState.state_data.step; [cite: 127]
    
    if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        await clearUserState(userId);
        [cite_start]return reply(replyToken, '已取消發布公告。'); [cite: 128]
    }

    switch (step) {
        case 'await_content':
            await setUserState(userId, 'awaiting_announcement_creation', { step: 'await_confirmation', content: text });
            [cite_start]return sendAnnouncementConfirmation(replyToken, text); [cite: 129]
        case 'await_confirmation':
            if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
                const user = await getUser(userId);
                [cite_start]const { content } = userState.state_data; [cite: 130]
                const newAnnRes = await pgPool.query(
                    'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3) RETURNING *',
                    [content, userId, user.name]
                );
                [cite_start]const newAnn = newAnnRes.rows[0]; [cite: 131]
                await clearUserState(userId);
                await reply(replyToken, '✅ 公告已成功發布！正在推播給所有學員...');
                (async () [cite_start]=> { [cite: 132]
                    try {
                        const studentsRes = await pgPool.query("SELECT id FROM users WHERE role = 'student'");
                        const announcementMessage = {
              
                             [cite_start]type: 'flex', altText: '來自老師的最新公告', [cite: 133]
                            contents: {
                                type: 'bubble',
                     
                           [cite_start]header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [{ type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }] }, [cite: 134]
                                body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: content, wrap: true }] },
                    
                             [cite_start]footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `發布時間: ${formatDateTime(newAnn.created_at)}`, size: 'xs', color: '#aaaaaa', align: 'center' }] } [cite: 135]
                            }
                        };
                
                        [cite_start]for (const student of studentsRes.rows) { [cite: 136]
                           await push(student.id, announcementMessage);
                        [cite_start]} [cite: 137]
                        console.log(`📢 公告已成功推播給 ${studentsRes.rows.length} 位學員。`);
                    [cite_start]} catch (e) { [cite: 138]
                        console.error('❌ 推播公告失敗:', e);
                    [cite_start]} [cite: 139]
                })();
            [cite_start]} else { [cite: 140]
                await reply(replyToken, '請點擊下方按鈕來確認或取消。');
                [cite_start]return sendAnnouncementConfirmation(replyToken, userState.state_data.content); [cite: 141]
            }
            break;
    [cite_start]} [cite: 142]
}

async function handleCourseCreation(event, userState) {
    const { replyToken, source: { userId }, 
message: { text } } = event;
    [cite_start]let { step, ...courseData } = userState.state_data; [cite: 143]

    if (text === COMMANDS.STUDENT.CANCEL_ADD_COURSE) {
        await clearUserState(userId);
        [cite_start]return reply(replyToken, '已取消新增課程。'); [cite: 144]
    }
    
    if (text === COMMANDS.STUDENT.CONFIRM_ADD_COURSE) {
        if (step !== 7) { 
            await clearUserState(userId);
            [cite_start]return reply(replyToken, '無效操作，請重新從「新增課程」開始。'); [cite: 145]
        }
        const transactionClient = await 
pgPool.connect();
        [cite_start]try { [cite: 146]
            await transactionClient.query('BEGIN');
            const coursePrefix = await generateUniqueCoursePrefix(transactionClient);
            [cite_start]const coursesToAdd = courseData.calculatedTimes.map((time, index) => ({ id: `${coursePrefix}${String.fromCharCode(65 + index)}`, title: `${courseData.courseName} - 第 ${index + 1} 堂`, time: time, capacity: courseData.capacity, pointsCost: courseData.pointsCost, students: [], waiting: [] })); [cite: 147]
            [cite_start]for (const course of coursesToAdd) await saveCourse(course, transactionClient); [cite: 148]
            await transactionClient.query('COMMIT');
            await clearUserState(userId);
            return reply(replyToken, `課程系列「${courseData.courseName}」已成功新增！\n系列代碼：${coursePrefix}\n共新增 ${courseData.totalClasses} 堂課。`);
        [cite_start]} catch (err) { [cite: 149]
            await transactionClient.query('ROLLBACK');
            [cite_start]console.error('❌ 新增課程交易失敗:', err.stack); [cite: 150]
            await clearUserState(userId);
            return reply(replyToken, '新增課程時發生錯誤，請稍後再試。'); 
        } finally { 
            [cite_start]transactionClient.release(); [cite: 151]
        }
    }
    
    switch (step) {
        case 1: 
            if (!text) { return reply(replyToken, '課程名稱不能為空，請重新輸入。');
            [cite_start]} [cite: 152]
            await setUserState(userId, 'awaiting_course_creation', { step: 2, courseName: text });
            [cite_start]return reply(replyToken, '請輸入總堂數（例如：5，代表您想建立 5 堂課）：'); [cite: 153]
        
        case 2:
            const totalClasses = parseInt(text);
            [cite_start]if (isNaN(totalClasses) || totalClasses <= 0 || totalClasses > 99) { return reply(replyToken, '總堂數必須是 1 到 99 之間的整數，請重新輸入。'); [cite: 154]
            }
            [cite_start]courseData.totalClasses = totalClasses; [cite: 155]
            [cite_start]await setUserState(userId, 'awaiting_course_creation', { step: 3, ...courseData }); [cite: 156]
            const weekdayOptions = WEEKDAYS.map(day => ({ type: 'button', style: 'primary', height: 'sm', action: { type: 
'message', label: day.label, text: day.label } }));
            [cite_start]const weekdayFlex = { type: 'flex', altText: '選擇星期', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: '請選擇課程日期（星期幾）：', wrap: true }, ...weekdayOptions] } } }; [cite: 157]
            [cite_start]return reply(replyToken, weekdayFlex); [cite: 158]
            
        case 3:
            const selectedWeekday = WEEKDAYS.find(day => day.label === text);
            if (!selectedWeekday) { return reply(replyToken, '請從列表中選擇有效的星期幾。'); [cite_start]} [cite: 159]
            courseData.weekday = selectedWeekday.value;
            await setUserState(userId, 'awaiting_course_creation', { step: 4, 
[cite_start]...courseData }); [cite: 160]
            return reply(replyToken, '請輸入課程時間（格式為 HH:mm，例如：19:00）：');
        [cite_start]case 4: [cite: 161]
            if (!/^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/.test(text)) { return reply(replyToken, '課程時間格式不正確，請使用 HH:mm 格式，例如：19:00。');
            [cite_start]} [cite: 162]
            courseData.time = text;
            [cite_start]await setUserState(userId, 'awaiting_course_creation', { step: 5, ...courseData }); [cite: 163]
            return reply(replyToken, '請輸入人數上限（例如：10）：');
        [cite_start]case 5: [cite: 164]
            const capacity = parseInt(text);
            [cite_start]if (isNaN(capacity) || capacity <= 0) { return reply(replyToken, '人數上限必須是正整數，請重新輸入。'); [cite: 165]
            }
            [cite_start]courseData.capacity = capacity; [cite: 166]
            [cite_start]await setUserState(userId, 'awaiting_course_creation', { step: 6, ...courseData }); [cite: 167]
            return reply(replyToken, '請輸入課程所需扣除點數（例如：2）：');
        [cite_start]case 6: [cite: 168]
            const points = parseInt(text);
            [cite_start]if (isNaN(points) || points <= 0) { return reply(replyToken, '點數費用必須是正整數，請重新輸入。'); [cite: 169]
            }
            [cite_start]courseData.pointsCost = points; [cite: 170]
            
            const courseTimes = [];
            [cite_start]let currentDate = new Date(); [cite: 171]
            for (let i = 0; i < courseData.totalClasses; i++) {
                 if (i > 0) {
                     currentDate = new Date(courseTimes[i-1]);
                 [cite_start]} [cite: 172]
                let nextClassDate = getNextDate(courseData.weekday, courseData.time, currentDate);
                [cite_start]courseTimes.push(nextClassDate.toISOString()); [cite: 173]
                currentDate = new Date(nextClassDate.getTime() + ONE_DAY_IN_MS);
            }
            courseData.calculatedTimes = courseTimes;
            [cite_start]await setUserState(userId, 'awaiting_course_creation', { step: 7, ...courseData }); [cite: 174]

            const confirmMsgText = `請確認新增以下週期課程系列：\n課程名稱：${courseData.courseName}\n總堂數：${courseData.totalClasses} 堂\n每週：${WEEKDAYS.find(d => d.value === courseData.weekday)?.label} ${courseData.time}\n人數上限：${courseData.capacity} 人/堂\n點數費用：${courseData.pointsCost} 點/堂\n\n預計開課日期：\n${courseData.calculatedTimes.map(t => formatDateTime(t)).join('\n')}`;
            [cite_start]const confirmFlex = { type: 'flex', altText: '確認新增課程', contents: { type: 'bubble', [cite: 175]
                body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                    { type: 'text', text: confirmMsgText, wrap: true },
                    { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_ADD_COURSE, text: COMMANDS.STUDENT.CONFIRM_ADD_COURSE } },
   
                     [cite_start]{ type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_ADD_COURSE, text: COMMANDS.STUDENT.CANCEL_ADD_COURSE } } [cite: 176]
                ]}
            }};
            [cite_start]return reply(replyToken, confirmFlex); [cite: 177]
    }
}

async function handleManualAdjust(event, userState) {
    const { replyToken, source: { userId }, message: { text } } = event;
    [cite_start]let { step, ...stateData } = userState.state_data; [cite: 178]
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        await clearUserState(userId);
        [cite_start]return reply(replyToken, '已取消手動調整點數。'); [cite: 179]
    }

    switch(step) {
        case 'awaiting_student_info':
            const studentRes = await pgPool.query(`SELECT id, name, points, history FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
            [cite_start]const foundStudents = studentRes.rows; [cite: 180]

            if (foundStudents.length === 0) { 
                await clearUserState(userId);
                [cite_start]return reply(replyToken, `找不到符合學員「${text}」。`); [cite: 181]
            }
            else if (foundStudents.length === 1) {
                const selectedStudent = foundStudents[0];
                [cite_start]const newStateData = { step: 'awaiting_operation', targetUserId: selectedStudent.id, targetUserName: selectedStudent.name, currentPoints: selectedStudent.points }; [cite: 182]
                await setUserState(userId, 'awaiting_manual_adjust', newStateData);
                [cite_start]const operationFlex = { type: 'flex', altText: '選擇操作', contents: { type: 'bubble', [cite: 183]
                    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: `您選擇了學員：${selectedStudent.name || ' '}`, 
[cite_start]weight: 'bold', wrap: true }, [cite: 184]
                            { type: 'text', text: `目前點數：${selectedStudent.points} 點`, size: 'sm' },
                            { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } },
              
                               [cite_start]{ type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } }, [cite: 185]
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL
_ADJUST } }
                        ]}
    
                     [cite_start]}}; [cite: 186]
                return reply(replyToken, operationFlex);
            [cite_start]} else { [cite: 187]
                const studentSelectionBubbles = foundStudents.map(s => ({
                    type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'text', text: s.name || ' ', weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${s.id.substring(0, 8)}...`, size: 'sm', color: '#666666' }] },
                   
                     [cite_start]footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_manual_adjust_student&studentId=${s.id}` } }] } [cite: 188]
                }));
                [cite_start]return reply(replyToken, [{ type: 'text', text: '找到多位符合的學員，請點擊選擇：' }, { type: 'flex', altText: '找到多位符合的學員，請點擊選擇：', contents: { type: 'carousel', contents: studentSelectionBubbles.slice(0, 10) } }]); [cite: 189]
            }

        case 'awaiting_operation':
            if (text === COMMANDS.TEACHER.ADD_POINTS) { 
                await setUserState(userId, 'awaiting_manual_adjust', { ...stateData, step: 'awaiting_amount', operation: 'add' });
                [cite_start]return reply(replyToken, `請輸入要為 **${stateData.targetUserName || ' '}** 增加的點數數量 (例如：5)：`); [cite: 191]
            }
            else if (text === COMMANDS.TEACHER.DEDUCT_POINTS) { 
                await setUserState(userId, 'awaiting_manual_adjust', { ...stateData, step: 'awaiting_amount', operation: 'deduct' });
                [cite_start]return reply(replyToken, `請輸入要為 **${stateData.targetUserName || ' '}** 扣除的點數數量 (例如：10)：`); [cite: 192]
            }
            else { 
                [cite_start]return reply(replyToken, `請點擊「${COMMANDS.TEACHER.ADD_POINTS}」或「${COMMANDS.TEACHER.DEDUCT_POINTS}」。`); [cite: 193]
            }

        case 'awaiting_amount':
            const amount = parseInt(text);
            [cite_start]if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數數量必須是正整數。請重新輸入。'); [cite: 194]
            }
            
            [cite_start]const transactionClient = await pgPool.connect(); [cite: 195]
            [cite_start]try { [cite: 196]
                await transactionClient.query('BEGIN');
                [cite_start]const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [stateData.targetUserId]); [cite: 197]
                const userInTransaction = userInTransactionRes.rows[0];
                [cite_start]if (!userInTransaction) throw new Error('操作失敗，找不到學員資料。'); [cite: 198]
                
                let operationType;
                if (stateData.operation === 'add') { 
                    userInTransaction.points += amount;
                    [cite_start]operationType = '加點'; [cite: 199]
                } else { 
                    if (userInTransaction.points < amount) { 
                        await transactionClient.query('ROLLBACK');
                        [cite_start]await clearUserState(userId); [cite: 200]
                        return reply(replyToken, `學員 ${userInTransaction.name || ' '} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${amount} 點）。`);
                    [cite_start]} [cite: 201]
                    userInTransaction.points -= amount;
                    [cite_start]operationType = '扣點'; [cite: 202]
                }
                
                if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
                userInTransaction.history.push({ action: `老師手動${operationType} ${amount} 點`, time: new 
[cite_start]Date().toISOString(), by: userId }); [cite: 203]
                await saveUser(userInTransaction, transactionClient);
                await transactionClient.query('COMMIT');
                
                await clearUserState(userId);
                [cite_start]push(userInTransaction.id, `您的點數已由老師手動調整：${operationType}${amount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message)); [cite: 204]
                return reply(replyToken, `✅ 已確認為學員 **${userInTransaction.name || ' '}** ${operationType} ${amount} 點。目前點數：${userInTransaction.points} 點。`);
            [cite_start]} catch (err) { [cite: 205]
                await transactionClient.query('ROLLBACK');
                [cite_start]console.error('❌ 手動調整點數交易失敗:', err.message); [cite: 206]
                await clearUserState(userId);
                return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。');
            [cite_start]} finally { [cite: 207]
                [cite_start]transactionClient.release(); [cite: 208]
            }
    }
}
// --- 主要指令處理函式 (Stateless Command Handlers) ---

async function handleTeacherCommands(event) {
    const { replyToken, source: { userId }, message: { text } } = event;
    [cite_start]const now = Date.now(); [cite: 209]
    const user = await getUser(userId);
    if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
        const announcementMenu = {
            type: 'flex', altText: '公告管理選單',
            contents: { type: 'carousel', contents: [
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '新增公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 
[cite_start]'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '發布新消息給所有學員', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '新增公告', data: 'action=add_announcement_start' } }, [cite: 210]
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 
'text', text: '歷史公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查看或刪除過去的公告', size: 'md', color: '#AAAAAA', align: 'center', weight: 
[cite_start]'bold' }] }, action: { type: 'postback', label: '歷史公告', data: 'action=history_announcements_show' } } [cite: 211]
            ]}
        };
        [cite_start]return reply(replyToken, announcementMenu); [cite: 212]
    }

    if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
        const newMessagesCount = (await pgPool.query(`SELECT COUNT(*) FROM feedback_messages WHERE status = 'new'`)).rows[0].count;
        const studentManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員查詢', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或ID查詢學員資訊', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '學員查詢', data: 'action=start_student_search' } },
          { type: 'bubble', header: { type: 'box', layout: 'vertical', 
contents: [{ type: 'text', text: '查看留言', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: (newMessagesCount > 0 ? '#de5246' : '#6a7d8b'), paddingAll: 'lg' }, body: { type: 
[cite_start]'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${newMessagesCount} 則`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看所有新留言', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看留言', data: `action=run_command&text=${COMMANDS.TEACHER.VIEW_MESSAGES}` } }, [cite: 214]
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '留言查詢', color: 
'#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '依姓名或內容查詢歷史留言', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' 
[cite_start]}, action: { type: 'postback', label: '留言查詢', data: 'action=start_message_search' } } [cite: 215]
        ];
        [cite_start]return reply(replyToken, { type: 'flex', altText: '學員管理功能', contents: { type: 'carousel', contents: studentManagementBubbles } }); [cite: 216]
    }

    if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
        const messagesRes = await pgPool.query("SELECT * FROM feedback_messages WHERE status IN ('new', 'read') ORDER BY timestamp ASC LIMIT 10");
        [cite_start]if (messagesRes.rows.length === 0) { [cite: 218]
            return reply(replyToken, '太棒了，目前沒有新的學員留言！');
        }
        const messageBubbles = messagesRes.rows.map(msg => ({
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name || ' '} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: (msg.status === 'read' ? '#52b69a' : '#6a7d8b'), paddingAll: 'lg' },
            body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
         
               [cite_start]{ type: 'text', text: msg.message, wrap: true }, [cite: 220]
                { type: 'separator' },
                { type: 'text', text: `時間: ${formatDateTime(msg.timestamp)}`, size: 'xs', color: '#aaaaaa' }
            ]},
            footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        
                 { type: 'button', style: 'primary', 
[cite_start]color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 標為已讀', data: `action=mark_feedback_read&msgId=${msg.id}` } }, [cite: 221]
                { type: 'button', style: 'primary', color: '#1a759f', height: 'sm', action: { type: 'postback', label: '▶️ 回覆', data: `action=reply_feedback&msgId=${msg.id}&userId=${msg.user_id}` } }
            ]}
        }));
        [cite_start]return reply(replyToken, { type: 'flex', altText: '學員留言列表', contents: { type: 'carousel', contents: messageBubbles } }); [cite: 222]
    }

    if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
        const pendingOrdersCount = (await pgPool.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`)).rows[0].count;
        const pointManagementBubbles = [
          { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' }, { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '查看待確認訂單', data: `action=run_command&text=${COMMANDS.TEACHER.PENDING_ORDERS}` } },
          
          { type: 'bubble', header: { type: 'box', 
[cite_start]layout: 'vertical', contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }, action: { type: 'postback', label: '手動調整點數', data: `action=run_command&text=${COMMANDS.TEACHER.MANUAL_ADJUST_POINTS}` } } [cite: 225]
        ];
        [cite_start]return reply(replyToken, { type: 'flex', altText: '點數管理功能', contents: { type: 'carousel', contents: pointManagementBubbles } }); [cite: 226]
    }
    if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.CANCEL_COURSE || text === COMMANDS.TEACHER.COURSE_LIST || text === COMMANDS.TEACHER.ADD_COURSE) {
        const allCourses = Object.values(await getAllCourses());
        [cite_start]const courseGroups = {}; [cite: 228]
        for (const course of allCourses) {
            if (new Date(course.time).getTime() > now) {
                const prefix = course.id.substring(0, 2);
                [cite_start]if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) { [cite: 229]
                    courseGroups[prefix] = course;
                [cite_start]} [cite: 230]
            }
        }
        const courseBubbles = [];
        [cite_start]const sortedPrefixes = Object.keys(courseGroups).sort(); [cite: 231]
        for (const prefix of sortedPrefixes) {
            const earliestUpcomingCourse = courseGroups[prefix];
            [cite_start]const courseMainTitle = earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''); [cite: 232]
            courseBubbles.push({
                type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' },
                body: {
                    type: 'box', layout: 'vertical', spacing: 'md',
        
                     [cite_start]contents: [ [cite: 233]
                        { type: 'text', text: courseMainTitle, weight: 'bold', size: 'xl', wrap: true },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: 
[cite_start]'#666666', size: 'sm', flex: 5 }] }, [cite: 234]
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] },
                        { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: 
'費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, 
[cite_start]wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, [cite: 235]
                    ],
                },
                footer: {
                    type: 'box', layout: 'vertical', 
                    [cite_start]spacing: 'sm', flex: 0, [cite: 236]
                    contents: [
                        { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${prefix} 系列的單堂課程` } },
                        { type: 'button', style: 'secondary', color: 
[cite_start]'#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${prefix} 系列課程` } }, [cite: 237]
                    ],
                },
            });
        }
        [cite_start]const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } }; [cite: 238]
        [cite_start]courseBubbles.push(addCourseBubble); [cite: 239]
        let introText = (Object.keys(courseGroups).length === 0) 
? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
        [cite_start]return reply(replyToken, [{ type: 'text', text: introText }, { type: 'flex', altText: introText, contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]); [cite: 240]
    }

    if (text === COMMANDS.TEACHER.REPORT) {
        const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
        [cite_start]const students = usersRes.rows; [cite: 242]
        const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
        [cite_start]const activeStudentsCount = students.filter(s => s.history?.length > 0).length; [cite: 243]
        const coursesRes = await pgPool.query(`SELECT * FROM courses`);
        const allCourses = coursesRes.rows;
        [cite_start]const totalCourses = allCourses.length; [cite: 244]
        const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
        const completedCourses = totalCourses - upcomingCourses;
        [cite_start]const ordersRes = await pgPool.query(`SELECT * FROM orders`); [cite: 245]
        const allOrders = ordersRes.rows;
        const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
        [cite_start]const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length; [cite: 246]
        const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, 
order) => sum + order.amount, 0);
        [cite_start]let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`; [cite: 247]
        [cite_start]return reply(replyToken, report.trim()); [cite: 248]
    }

    if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
        reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));
        (async () [cite_start]=> { [cite: 249]
            try {
                const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
                const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
                if 
(pendingConfirmationOrders.length === 0) [cite_start]return push(userId, '目前沒有待確認的購點訂單。'); [cite: 250]
                const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ 
type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName || ' '}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 
'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', 
[cite_start]height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }})); [cite: 251, 252]
                [cite_start]await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } }); [cite: 253]
            [cite_start]} catch (err) { [cite: 254]
                console.error('❌ 查詢待確認訂單時發生錯誤:', err);
                [cite_start]await push(userId, '查詢訂單時發生錯誤，請稍後再試。'); [cite: 255]
            }
        })();
        return;
    }
  
    // Default fallback for teacher
    [cite_start]let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。'; [cite: 256]
    [cite_start]if (text.startsWith('@')) { [cite: 257]
        teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
    }
    [cite_start]return reply(replyToken, teacherSuggestion); [cite: 258]
}

async function handleStudentCommands(event) {
    const { replyToken, source: { userId }, message: { text } } = event;
    [cite_start]const user = await getUser(userId); [cite: 259]
    const now = Date.now();

    if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
        const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
        [cite_start]if (res.rows.length === 0) { [cite: 260]
            return reply(replyToken, '目前沒有任何公告。');
        }
        [cite_start]const announcement = res.rows[0]; [cite: 261]
        [cite_start]const announcementMessage = { [cite: 262]
            type: 'flex', altText: '最新公告',
            contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 
'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name || [cite_start]'老師'} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } [cite: 263]
        };
        [cite_start]return reply(replyToken, announcementMessage); [cite: 264]
    }

    if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
        return sendPointsMenu(replyToken, userId);
    }

    if (text === 
[cite_start]COMMANDS.STUDENT.BUY_POINTS) { [cite: 265]
        const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        [cite_start]if (ordersRes.rows.length > 0) { [cite: 266]
          return reply(replyToken, `您目前有一筆訂單 (ID: ${ordersRes.rows[0].order_id}) 尚未完成，請先至「點數管理」主頁完成或取消該筆訂單。`);
        }
        const flexMessage = buildBuyPointsFlex();
        [cite_start]return reply(replyToken, flexMessage); [cite: 267]
    }

    if (text === COMMANDS.STUDENT.CANCEL_PURCHAS
[cite_start]E) { [cite: 268]
        const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
        [cite_start]const pendingOrder = ordersRes.rows[0]; [cite: 269]
        if (pendingOrder) {
            if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。');
            [cite_start]} [cite: 270]
            else if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
                const transactionClientCancel = await pgPool.connect();
                [cite_start]try { [cite: 271]
                    await transactionClientCancel.query('BEGIN');
                    [cite_start]await deleteOrder(pendingOrder.order_id, transactionClientCancel); [cite: 272]
                    await transactionClientCancel.query('COMMIT'); 
                    await clearUserState(userId);
                    return reply(replyToken, '已取消您的購點訂單。');
                [cite_start]} [cite: 273]
                catch (err) { 
                    await transactionClientCancel.query('ROLLBACK');
                    [cite_start]console.error('❌ 取消購點訂單交易失敗:', err.message); [cite: 274]
                    return reply(replyToken, '取消訂單失敗，請稍後再試。'); 
                }
                finally { 
                    [cite_start]transactionClientCancel.release(); [cite: 275]
                }
            }
        }
        await clearUserState(userId);
        // Clear any lingering purchase state
        [cite_start]return reply(replyToken, '目前沒有待取消的購點訂單。'); [cite: 276]
    }

    if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
        [cite_start]if (!user.history?.length) { return reply(replyToken, '你目前沒有點數相關記錄。'); [cite: 278]
        }
        let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
        [cite_start]user.history.slice(-5).reverse().forEach(record => { historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`; }); [cite: 279]
        return reply(replyToken, historyMessage.trim());
    }

    if (text === COMMANDS.STUDENT.BOOK_COURSE) {
        const sevenDaysLater = now + (ONE_DAY_IN_MS * 7);
        [cite_start]const upcomingCourses = Object.values(await getAllCourses()) [cite: 281]

          .sort((cA, cB) => new Date(cA.time).getTime() - new 
Date(cB.time).getTime());
        [cite_start]if (upcomingCourses.length === 0) { [cite: 282]
          return reply(replyToken, '未來七天內沒有您可以預約的新課程。');
        }
    
        const courseItems = [];
        [cite_start]upcomingCourses.slice(0, 10).forEach((course, index) => { [cite: 284]
          const isFull = course.students.length >= course.capacity;
          
          courseItems.push({
            type: 'box', layout: 'vertical', margin: index > 0 ? 'lg' : 'none', spacing: 'sm',
            contents: [
              { type: 'text', text: course.title, weight: 'bold', size: 'md', 
               [cite_start]wrap: true }, [cite: 285]
              { type: 'text', text: `時間：${formatDateTime(course.time)}`, size: 'sm' 
},
              { type: 'text', text: `費用：${course.pointsCost} 點｜狀態：${isFull ? '已額滿' : `報名 ${course.students.length}/${course.capacity}`}`, size: 'sm', color: '#666666' },
              { type: 'button', action: { type: 'postback', label: isFull ? '加入候補' : '立即預約', data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`, displayText: `我想${isFull ? '候補' : '預約'}：${course.title}` }, style: isFull ? 'secondary' : 'primary', color: isFull 
               [cite_start]? undefined : '#1A759F', height: 'sm', margin: 'md' } [cite: 286]
            ]
          });
          [cite_start]if (index < upcomingCourses.slice(0, 10).length - 1) { [cite: 287]
            courseItems.push({ type: 'separator', margin: 'lg' });
          [cite_start]} [cite: 288]
        });
    
        const flexMessage = {
          type: 'flex', altText: '可預約課程列表',
          contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '預約課程', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#34a0a4' },
            body: { type: 'box', layout: 'vertical', contents: courseItems 
            [cite_start]}, [cite: 289]
            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '💡 課程開始前 8 小時不可退課', size: 'xs', align: 'center', color: '#AAAAAA' }] }
          }
        };
        [cite_start]return reply(replyToken, flexMessage); [cite: 290]
    }

    if (text === COMMANDS.STUDENT.MY_COURSES) {
        const courses = await getAllCourses();
        [cite_start]const enrolledCourses = Object.values(courses).filter(c => c.students.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time)); [cite: 291]
        [cite_start]const waitingCourses = Object.values(courses).filter(c => c.waiting.includes(userId) && new Date(c.time).getTime() > now).sort((a,b) => new Date(a.time) - new Date(b.time)); [cite: 292]
        [cite_start]if (enrolledCourses.length === 0 && waitingCourses.length === 0) { return reply(replyToken, '您目前沒有任何已預約或候補中的未來課程。'); [cite: 293]
        }
        const courseBubbles = [
            ...enrolledCourses.map(course => {
                const canCancel = new 
Date(course.time).getTime() - now > EIGHT_HOURS_IN_MS;
                return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '✅ 已預約', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', 
contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `已扣除 ${course.pointsCost} 點`, size: 'sm', color: '#666666' }] }, footer: canCancel ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '取消預約', data: `action=cancel_booking_confirm&courseId=${course.id}`, displayText: `準備取消預約：
[cite_start]${course.title}` } }] } : undefined }; [cite: 295]
            }),
            ...waitingCourses.map(course => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '⏳ 候補中', color: '#ffffff', weight: 'bold' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true }, { type: 'separator', margin: 'md'}, { type: 'text', text: `${formatDateTime(course.time)}`, size: 'md' }, { type: 'text', text: `目前候補第 ${course.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666' }] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 
[cite_start]'button', style: 'primary', color: '#8d99ae', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=cancel_waiting_confirm&courseId=${course.id}`, displayText: `準備取消候補：${course.title}` } }] } })) [cite: 297]
        ];
        [cite_start]return reply(replyToken, { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }); [cite: 298]
    }

    // Default fallback for student
    [cite_start]let studentSuggestion = '我不懂您的意思耶😕'; [cite: 299]
    [cite_start]if (text.startsWith('@')) { [cite: 300]
        studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用圖文選單操作。`;
    }
    [cite_start]return reply(replyToken, studentSuggestion); [cite: 301]
}

// --- Postback 處理函式 (V7.5.5 新增) ---
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
                            { type: 'text', text: `您確定要取消預約以下課程嗎？`, wrap: true },
                            { type: 'text', text: courseToCancelBook.title, weight: 'bold', size: 'lg', wrap: true },
                            { type: 'separator' },
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

// --- 主要事件處理器 (V7.5.5 核心修正) ---
async function handleEvent(event) {
    if (!['message', 'postback'].includes(event.type)) return;
    [cite_start]const { replyToken, source: { userId } } = event; [cite: 302]
    // 1. 取得使用者資料 (初次使用者會自動建立)
    [cite_start]let user = await getUser(userId); [cite: 303]
    [cite_start]if (!user) { [cite: 304]
        try {
            const profile = await client.getProfile(userId);
            [cite_start]user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: profile.pictureUrl }; [cite: 305]
            await saveUser(user);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, 
[cite_start]STUDENT_RICH_MENU_ID); [cite: 306]
        } catch (err) {
            console.error(`❌ 獲取新用戶 ${userId} 資料失敗:`, err.message);
            [cite_start]user = { id: userId, name: `新用戶`, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: null }; [cite: 307]
            await saveUser(user);
            [cite_start]if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(`❌ 備用連結學員 Rich Menu 失敗: ${e.message}`)); [cite: 308]
        }
    } else if (!user.picture_url || !user.name) { // 為舊用戶補充頭像或名稱
        try {
            const profile = await client.getProfile(userId);
            [cite_start]user.pictureUrl = profile.pictureUrl; [cite: 310]
            user.name = profile.displayName;
            await saveUser(user);
        [cite_start]} catch(e) { console.error(`❌ 為現有使用者 ${userId} 更新資料失敗:`, e.message); [cite: 311]
        }
    }
    
    // 2. 處理流程中斷指令 (來自 Rich Menu 的 Postback)
    [cite_start]const isPostbackCommand = event.type === 'postback' && new URLSearchParams(event.postback.data).get('action') === 'run_command'; [cite: 311]
    [cite_start]if (isPostbackCommand) { [cite: 312]
        const commandText = new URLSearchParams(event.postback.data).get('text');
        [cite_start]const topLevelCommands = [ [cite: 313]
            COMMANDS.STUDENT.POINTS, COMMANDS.STUDENT.BOOK_COURSE, COMMANDS.STUDENT.MY_COURSES, COMMANDS.STUDENT.LATEST_ANNOUNCEMENT,
            COMMANDS.TEACHER.COURSE_MANAGEMENT, COMMANDS.TEACHER.POINT_MANAGEMENT, COMMANDS.TEACHER.STUDENT_MANAGEMENT, COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT,
            COMMANDS.TEACHER.REPORT
        ];
        [cite_start]if (topLevelCommands.includes(commandText)) { [cite: 314]
            await clearUserState(userId);
        [cite_start]} [cite: 315]
    }

    // 3. 根據資料庫中的狀態，決定如何處理使用者輸入
    [cite_start]const userState = await getUserState(userId); [cite: 315]
    [cite_start]if (userState && event.type === 'message' && event.message.type === 'text') { [cite: 316]
        const stateName = userState.state_name;
        [cite_start]switch(stateName) { [cite: 317]
            case 'awaiting_student_search': return handleStudentSearchInput(event);
            [cite_start]case 'awaiting_message_search': return handleMessageSearchInput(event); [cite: 318]
            case 'awaiting_feedback': return handleFeedbackInput(event);
            case 'awaiting_reply': return handleReplyInput(event, userState);
            [cite_start]case 'awaiting_purchase_confirmation': [cite: 319]
            case 'awaiting_purchase_input': return handlePurchaseFlow(event, 
userState);
            [cite_start]case 'awaiting_booking_confirmation': return handleBookingConfirmation(event, userState); [cite: 320]
            case 'awaiting_course_creation': return handleCourseCreation(event, userState);
            case 'awaiting_manual_adjust': return handleManualAdjust(event, userState);
            case 'awaiting_announcement_creation': return handleAnnouncementCreation(event, userState);
            [cite_start]case 'awaiting_teacher_login': [cite: 321]
                 await clearUserState(userId);
                 [cite_start]const text = event.message.text.trim(); [cite: 322]
                 if (text === TEACHER_PASSWORD) {
                     user.role = 'teacher';
                     [cite_start]await saveUser(user); [cite: 323]
                     await reply(replyToken, '密碼正確，您已切換為老師身份。');
                     if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
                 [cite_start]} else { [cite: 324]
                     await reply(replyToken, '密碼錯誤。');
                 [cite_start]} [cite: 325]
                 return;
            [cite_start]default: [cite: 326]
                await clearUserState(userId);
        [cite_start]} [cite: 327]
    }
    
    // 4. 處理無狀態的文字指令
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        [cite_start]if (text === COMMANDS.SWITCH_ROLE) { [cite: 328]
            if (user.role === 'teacher') {
                user.role = 'student';
                [cite_start]await saveUser(user); [cite: 329]
                await reply(event.replyToken, '您已切換為學員身份。');
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            [cite_start]} else { [cite: 330]
                await setUserState(userId, 'awaiting_teacher_login');
                [cite_start]await reply(event.replyToken, '請輸入老師密碼：'); [cite: 331]
            }
            return;
        }

        [cite_start]if (user.role === 'teacher') { [cite: 332]
            return handleTeacherCommands(event);
        [cite_start]} else { [cite: 333]
            return handleStudentCommands(event);
        [cite_start]} [cite: 334]
    } 
    
    // 5. 處理 Postback 事件
    if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        [cite_start]const action = data.get('action'); [cite: 335]

        if (action === 'run_command') {
            const commandText = data.get('text');
            [cite_start]const simulatedEvent = { ...event, type: 'message', message: { type: 'text', text: commandText }}; [cite: 336]
            return handleEvent(simulatedEvent);
        }

        // --- Postback 處理 ---
        [cite_start]if (user.role === 'teacher') { [cite: 337]
            await handleTeacherPostbacks(event, action, data);
        [cite_start]} else { [cite: 338]
            await handleStudentPostbacks(event, action, data);
        [cite_start]} [cite: 339]
    }
}


// --- Express Server 設定 & 啟動 ---
app.use(express.json({
  verify: (req, res, buf) => { if (req.headers['x-line-signature']) req.rawBody = buf; }
}));
[cite_start]app.post('/webhook', (req, res) => { [cite: 340]
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
 
   [cite_start].then(() => res.status(200).send('OK')) [cite: 341]
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err);
      res.status(500).end();
    });
});
[cite_start]app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。')); [cite: 342]

app.listen(PORT, async () => {
  await initializeDatabase();
  const cleanupQuery = 'DELETE FROM user_states WHERE expires_at <= NOW()';
  await pgPool.query(cleanupQuery);
  await cleanCoursesDB();

  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7.5.5 (最終完整修正版)`);
  
  const PING_INTERVAL_MS = 1000 * 60 * 4;
  const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(() => pgPool.query(cleanupQuery), 1000 * 60 * 60);
  
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      [cite_start]console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`); [cite: 343]
      setInterval(keepAlive, PING_INTERVAL_MS);
      keepAlive();
  } else {
      console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
