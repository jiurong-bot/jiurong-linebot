// handlers/studentHandlers.js
const { COMMANDS, MESSAGES, BANK_INFO, POINTS_PACKAGES } = require('../config');
const { reply, push, formatDateTime } = require('../lineUtils');
const { pgClient, getUser, saveUser, getCourse, getAllCourses, saveCourse, getOrder, getAllOrders, saveOrder, deleteOrder } = require('../db');
const { studentMenu, pointFunctionsMenu, getPurchasePointsFlexMessage, getPendingPurchaseFlexMessage } = require('../menus');

const pendingPurchase = {}; // { userId: { step: 1, orderData: { orderId, points, amount } } }
const pendingLast5Input = {}; // { userId: { orderId: 'O123' } }
const pendingCancelBooking = {}; // { userId: { courseId: 'C123' } }


// 學員主選單
async function handleStudentMainMenu(event, userId, replyToken) {
    return reply(replyToken, '已返回學員主選單。', studentMenu);
}

// 處理預約課程顯示
async function handleStudentBookCourseDisplay(event, userId, replyToken) {
    try {
        const user = await getUser(userId);
        if (!user) {
            return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
        }

        const now = Date.now();
        const courses = await getAllCourses();
        const availableCourses = courses
            .filter(c => new Date(c.time).getTime() > now && !c.students.includes(userId) && !c.waiting.includes(userId))
            .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

        if (availableCourses.length === 0) {
            return reply(replyToken, MESSAGES.STUDENT.NO_NEW_COURSES, studentMenu);
        }

        const courseBubbles = availableCourses.slice(0, 9).map(course => {
            return {
                type: 'bubble',
                header: {
                  type: 'box', layout: 'vertical',
                  contents: [{ type: 'text', text: course.title, color: '#ffffff', weight: 'bold', size: 'md' }],
                  backgroundColor: '#52b69a', paddingAll: 'lg'
                },
                body: {
                  type: 'box', layout: 'vertical', spacing: 'md',
                  contents: [
                    { type: 'text', text: `時間: ${formatDateTime(course.time)}`, wrap: true, size: 'sm' },
                    { type: 'text', text: `所需點數: ${course.pointsCost} 點`, wrap: true, size: 'sm', weight: 'bold' },
                    { type: 'text', text: `剩餘名額: ${course.capacity - course.students.length} / ${course.capacity}`, wrap: true, size: 'sm' },
                    { type: 'text', text: `候補人數: ${course.waiting.length}`, wrap: true, size: 'sm' },
                  ],
                },
                footer: {
                  type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                  contents: [
                    {
                      type: 'button', style: 'primary', color: '#ff9e00', height: 'sm',
                      action: {
                        type: 'postback',
                        label: '預約此課程',
                        data: `${COMMANDS.STUDENT.ACTION_BOOK_COURSE_CONFIRM}&courseId=${course.id}`,
                        displayText: `預約課程：${course.title}`
                      },
                    },
                  ],
                },
            };
        });

        const flexMessage = {
            type: 'flex',
            altText: '可預約課程列表',
            contents: { type: 'carousel', contents: courseBubbles },
        };

        return reply(replyToken, flexMessage, studentMenu);
    } catch (err) {
        console.error('❌ 顯示可預約課程失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理預約課程動作 (Postback 觸發)
async function handleStudentBookCourse(event, userId, replyToken, courseId) {
    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const user = await getUser(userId, client);
        const course = await getCourse(courseId, client);

        if (!user || !course) {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.STUDENT.COURSE_NOT_FOUND, studentMenu);
        }

        if (new Date(course.time).getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.STUDENT.COURSE_EXPIRED, studentMenu);
        }

        if (course.students.includes(userId) || course.waiting.includes(userId)) {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.STUDENT.COURSE_ALREADY_BOOKED, studentMenu);
        }

        if (course.students.length < course.capacity) {
            // 直接報名
            if (user.points < course.pointsCost) {
                await client.query('ROLLBACK');
                return reply(replyToken, MESSAGES.STUDENT.POINTS_NOT_ENOUGH(course.pointsCost, user.points), studentMenu);
            }
            user.points -= course.pointsCost;
            course.students.push(userId);
            user.history.push({ action: `預約課程「${course.title}」，扣除 ${course.pointsCost} 點`, time: new Date().toISOString() });
            await saveUser(user, client);
            await saveCourse(course, client);
            await client.query('COMMIT');
            return reply(replyToken, `✅ 成功預約課程「${course.title}」！已扣除 ${course.pointsCost} 點，您目前有 ${user.points} 點。`, studentMenu);
        } else {
            // 候補
            if (course.waiting.includes(userId)) {
                await client.query('ROLLBACK');
                return reply(replyToken, MESSAGES.STUDENT.COURSE_ALREADY_WAITING, studentMenu);
            }
            course.waiting.push(userId);
            await saveCourse(course, client);
            await client.query('COMMIT');
            return reply(replyToken, `您已加入課程「${course.title}」的候補名單。有空位會通知您。`, studentMenu);
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 預約課程交易失敗:', err.message);
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, studentMenu);
    } finally {
        client.release();
    }
}

// 處理我的課程顯示
async function handleStudentMyCoursesDisplay(event, userId, replyToken) {
    try {
        const user = await getUser(userId);
        if (!user) {
            return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
        }

        const now = Date.now();
        const allCourses = await getAllCourses();
        const myCourses = allCourses
            .filter(c => (c.students.includes(userId) || c.waiting.includes(userId)) && new Date(c.time).getTime() > now)
            .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

        if (myCourses.length === 0) {
            return reply(replyToken, MESSAGES.STUDENT.NO_MY_COURSES, studentMenu);
        }

        const courseBubbles = myCourses.slice(0, 10).map(course => {
            const isBooked = course.students.includes(userId);
            const statusText = isBooked ? `已預約 (已扣 ${course.pointsCost} 點)` : `候補中 (目前順位: ${course.waiting.indexOf(userId) + 1})`;

            return {
                type: 'bubble',
                header: {
                  type: 'box', layout: 'vertical',
                  contents: [{ type: 'text', text: course.title, color: '#ffffff', weight: 'bold', size: 'md' }],
                  backgroundColor: isBooked ? '#52b69a' : '#ff9e00', paddingAll: 'lg'
                },
                body: {
                  type: 'box', layout: 'vertical', spacing: 'md',
                  contents: [
                    { type: 'text', text: `時間: ${formatDateTime(course.time)}`, wrap: true, size: 'sm' },
                    { type: 'text', text: `狀態: ${statusText}`, wrap: true, size: 'sm', weight: 'bold' },
                    { type: 'text', text: `報名人數: ${course.students.length}/${course.capacity} (候補: ${course.waiting.length})`, wrap: true, size: 'sm' },
                  ],
                },
                footer: {
                  type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                  contents: [
                    {
                      type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                      action: {
                        type: 'postback',
                        label: '取消預約/候補',
                        data: `${COMMANDS.STUDENT.ACTION_CANCEL_BOOKING_CONFIRM}&courseId=${course.id}`,
                        displayText: `取消課程：${course.title}`
                      },
                    },
                  ],
                },
            };
        });

        const flexMessage = {
            type: 'flex',
            altText: '我的課程列表',
            contents: { type: 'carousel', contents: courseBubbles },
        };

        return reply(replyToken, flexMessage, studentMenu);
    } catch (err) {
        console.error('❌ 顯示我的課程失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理取消課程確認 (Postback 觸發)
async function handleStudentCancelBookingConfirm(event, userId, replyToken, courseId) {
    const course = await getCourse(courseId);
    if (!course) {
        return reply(replyToken, MESSAGES.STUDENT.COURSE_NOT_FOUND, studentMenu);
    }
    const isBooked = course.students.includes(userId);
    const cancelType = isBooked ? '預約' : '候補';

    pendingCancelBooking[userId] = { courseId: courseId };
    return reply(replyToken, `確定要取消課程「${course.title}」的${cancelType}嗎？${isBooked ? '將退還點數。' : ''}`, [
        { type: 'postback', label: '確定取消', data: `action=cancel_booking_execute&courseId=${courseId}`, displayText: '確定取消' },
        { type: 'message', label: '返回我的課程', text: COMMANDS.STUDENT.MY_COURSES }
    ]);
}

// 處理執行取消課程 (Postback 觸發)
async function handleStudentCancelBookingExecute(event, userId, replyToken, courseId) {
    if (!pendingCancelBooking[userId] || pendingCancelBooking[userId].courseId !== courseId) {
        return reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, studentMenu);
    }

    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const user = await getUser(userId, client);
        const course = await getCourse(courseId, client);

        if (!user || !course) {
            await client.query('ROLLBACK');
            delete pendingCancelBooking[userId];
            return reply(replyToken, MESSAGES.STUDENT.COURSE_NOT_FOUND, studentMenu);
        }

        // 判斷是否距離上課時間不足 8 小時
        const eightHoursBeforeCourse = new Date(new Date(course.time).getTime() - 8 * 60 * 60 * 1000);
        if (new Date() > eightHoursBeforeCourse) {
            await client.query('ROLLBACK');
            delete pendingCancelBooking[userId];
            return reply(replyToken, MESSAGES.STUDENT.CANCEL_BOOKING_TOO_LATE(course.title), studentMenu);
        }

        const isBooked = course.students.includes(userId);
        const isWaiting = course.waiting.includes(userId);

        if (!isBooked && !isWaiting) {
            await client.query('ROLLBACK');
            delete pendingCancelBooking[userId];
            return reply(replyToken, `您沒有預約或候補此課程。`, studentMenu);
        }

        let refundPoints = 0;
        let message = '';

        if (isBooked) {
            // 已預約，退點
            user.points += course.pointsCost;
            user.history.push({ action: `取消課程「${course.title}」預約，退還 ${course.pointsCost} 點`, time: new Date().toISOString() });
            course.students = course.students.filter(id => id !== userId);
            refundPoints = course.pointsCost;
            message = `✅ 成功取消課程「${course.title}」預約，已退還 ${refundPoints} 點，您目前有 ${user.points} 點。`;

            // 如果有候補學員，將第一位候補學員轉為正式學員
            if (course.waiting.length > 0) {
                const nextStudentId = course.waiting.shift(); // 移除第一個候補學員
                const nextStudent = await getUser(nextStudentId, client);
                if (nextStudent) {
                    // 檢查候補學員點數是否足夠
                    if (nextStudent.points >= course.pointsCost) {
                        nextStudent.points -= course.pointsCost;
                        course.students.push(nextStudentId); // 加入正式學員
                        nextStudent.history.push({ action: `候補課程「${course.title}」轉為正式報名，扣除 ${course.pointsCost} 點`, time: new Date().toISOString() });
                        await saveUser(nextStudent, client);
                        push(nextStudent.id, `恭喜！您候補的課程「${course.title}」已有空位，已為您自動報名並扣除 ${course.pointsCost} 點。您目前有 ${nextStudent.points} 點。`)
                            .catch(e => console.error(`❌ 通知候補轉正失敗:`, e.message));
                    } else {
                        // 點數不足，通知他並讓他留在候補隊列或移除
                        push(nextStudent.id, `您候補的課程「${course.title}」已有空位，但您的點數不足 (${nextStudent.points} 點，需要 ${course.pointsCost} 點) 無法自動報名。請盡快購點。`).catch(e => console.error(e));
                        // 這裡可以選擇將他留在候補隊列，或者將其移除並發送消息，讓其重新候補。為了避免死循環，這裡讓他重新排隊
                        course.waiting.push(nextStudentId); // 重新放回候補隊列尾部
                    }
                }
            }
        } else if (isWaiting) {
            // 候補，直接移除
            course.waiting = course.waiting.filter(id => id !== userId);
            message = `✅ 成功取消課程「${course.title}」候補。`;
        }

        await saveUser(user, client); // 保存用戶變更（點數）
        await saveCourse(course, client); // 保存課程變更（學生/候補列表）
        await client.query('COMMIT');

        delete pendingCancelBooking[userId];
        return reply(replyToken, message, studentMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 取消課程預約/候補交易失敗:', err.message);
        delete pendingCancelBooking[userId];
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, studentMenu);
    } finally {
        client.release();
    }
}

// 處理點數功能菜單顯示
async function handleStudentPointFunctionsDisplay(event, userId, replyToken) {
    try {
        const user = await getUser(userId);
        if (!user) {
            return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
        }

        // 檢查是否有待確認訂單
        const pendingOrderRes = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_confirmation' ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = pendingOrderRes.rows[0];

        if (pendingOrder) {
            // 如果有待確認訂單，顯示提示輸入後五碼的 Flex Message
            const flexMessage = getPendingPurchaseFlexMessage({
                orderId: pendingOrder.order_id,
                points: pendingOrder.points,
                amount: pendingOrder.amount,
                last5Digits: pendingOrder.last_5_digits
            });
            return reply(replyToken, flexMessage, [
                { type: 'message', label: '取消此訂單', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
                { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU },
            ]);
        } else {
            // 沒有待確認訂單，顯示正常點數功能菜單
            return reply(replyToken, `您的點數：${user.points} 點。`, pointFunctionsMenu);
        }
    } catch (err) {
        console.error('❌ 顯示點數功能失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理購買點數顯示 (Flex Message)
async function handleStudentPurchasePointsDisplay(event, userId, replyToken) {
    try {
        // 檢查是否有尚未完成的購點訂單
        const pendingOrder = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_confirmation' LIMIT 1`, [userId]);
        if (pendingOrder.rows.length > 0) {
            return reply(replyToken, MESSAGES.STUDENT.PURCHASE_PENDING_EXISTS, pointFunctionsMenu);
        }
        return reply(replyToken, getPurchasePointsFlexMessage(), pointFunctionsMenu);
    } catch (err) {
        console.error('❌ 顯示購點方案失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理確認購買 (Postback 觸發)
async function handleStudentConfirmPurchase(event, userId, replyToken, points, amount) {
    const user = await getUser(userId);
    if (!user) {
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }

    // 再次檢查是否有尚未完成的購點訂單，避免重複創建
    const existingPendingOrder = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_confirmation' LIMIT 1`, [userId]);
    if (existingPendingOrder.rows.length > 0) {
        return reply(replyToken, MESSAGES.STUDENT.PURCHASE_PENDING_EXISTS, pointFunctionsMenu);
    }

    const orderId = `O${Date.now()}`; // 簡單生成訂單 ID
    const newOrder = {
        orderId: orderId,
        userId: userId,
        userName: user.name,
        points: parseInt(points),
        amount: parseInt(amount),
        last5Digits: null,
        status: 'pending_confirmation',
        timestamp: new Date()
    };
    await saveOrder(newOrder);

    // 設置狀態機，等待輸入後五碼
    pendingLast5Input[userId] = { orderId: orderId };

    return reply(replyToken, MESSAGES.STUDENT.PURCHASE_COMPLETE_PROMPT(orderId, BANK_INFO), [
        { type: 'message', label: '返回點數功能', text: COMMANDS.STUDENT.BACK_TO_POINT_FUNCTIONS }
    ]);
}

// 處理用戶輸入匯款後五碼
async function handleStudentInputLast5Digits(event, userId, replyToken, last5Digits) {
    const pendingState = pendingLast5Input[userId];
    if (!pendingState || !pendingState.orderId) {
        // 沒有待處理的購點流程，或狀態不正確
        return reply(replyToken, MESSAGES.STUDENT.NO_PENDING_ORDER_FOR_LAST5_INPUT, pointFunctionsMenu);
    }

    if (!/^\d{5}$/.test(last5Digits)) {
        return reply(replyToken, MESSAGES.STUDENT.PURCHASE_LAST5_INVALID); // 不回覆菜單，讓用戶重新輸入
    }

    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const order = await getOrder(pendingState.orderId, client);
        if (!order || order.status !== 'pending_confirmation') {
            await client.query('ROLLBACK');
            delete pendingLast5Input[userId];
            return reply(replyToken, MESSAGES.STUDENT.PURCHASE_ORDER_INVALID, pointFunctionsMenu);
        }

        order.last_5_digits = last5Digits;
        await saveOrder(order, client);
        await client.query('COMMIT');

        // 通知老師有新訂單待確認
        // (這需要老師的 Line User ID，需要預先設定或從資料庫讀取)
        const teacherUser = await pgClient.query(`SELECT id FROM users WHERE role = 'teacher' LIMIT 1`);
        if (teacherUser.rows.length > 0) {
            const teacherId = teacherUser.rows[0].id;
            push(teacherId, `🔔 新的購點訂單待確認：學員 ${order.user_name} 購買 ${order.points} 點，匯款後五碼 ${last5Digits}。請前往「待確認訂單」處理。`)
                .catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
        }

        delete pendingLast5Input[userId];
        return reply(replyToken, `✅ 您的匯款後五碼 ${last5Digits} 已提交成功！請等待老師審核。`, pointFunctionsMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 提交後五碼失敗:', err.message);
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, pointFunctionsMenu);
    } finally {
        client.release();
    }
}

// 處理查詢點數
async function handleStudentCheckPoints(event, userId, replyToken) {
    try {
        const user = await getUser(userId);
        if (!user) {
            return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
        }
        return reply(replyToken, `您目前有 ${user.points} 點。`, pointFunctionsMenu);
    } catch (err) {
        console.error('❌ 查詢點數失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理購點歷史
async function handleStudentPurchaseHistory(event, userId, replyToken) {
    try {
        const orders = await pgClient.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10`, [userId]);
        const purchaseHistory = orders.rows;

        if (purchaseHistory.length === 0) {
            return reply(replyToken, MESSAGES.STUDENT.PURCHASE_HISTORY_EMPTY, pointFunctionsMenu);
        }

        const historyMessages = purchaseHistory.map(order => {
            let statusText = '';
            let statusEmoji = '';
            switch (order.status) {
                case 'pending_confirmation':
                    statusText = '待確認';
                    statusEmoji = '⏳';
                    break;
                case 'completed':
                    statusText = '已完成';
                    statusEmoji = '✅';
                    break;
                case 'cancelled':
                    statusText = '已取消';
                    statusEmoji = '🚫';
                    break;
                case 'rejected':
                    statusText = '已退回';
                    statusEmoji = '❌';
                    break;
                default:
                    statusText = '未知狀態';
            }
            return `${statusEmoji} 訂單 #${order.order_id} - 購買 ${order.points} 點，金額 $${order.amount} (${statusText}) - ${formatDateTime(order.timestamp.toISOString())}`;
        });

        return reply(replyToken, `您的購點歷史：\n${historyMessages.join('\n')}`, pointFunctionsMenu);
    } catch (err) {
        console.error('❌ 查詢購點歷史失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, studentMenu);
    }
}

// 處理取消購點
async function handleStudentCancelPurchase(event, userId, replyToken) {
    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const pendingOrderRes = await client.query(`SELECT * FROM orders WHERE user_id = $1 AND status = 'pending_confirmation' ORDER BY timestamp DESC LIMIT 1`, [userId]);
        const pendingOrder = pendingOrderRes.rows[0];

        if (!pendingOrder) {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.STUDENT.CANCEL_PURCHASE_NO_PENDING, pointFunctionsMenu);
        }

        pendingOrder.status = 'cancelled';
        await saveOrder(pendingOrder, client);
        await client.query('COMMIT');

        delete pendingLast5Input[userId]; // 清除可能存在的後五碼輸入狀態

        // 通知老師訂單已取消
        const teacherUser = await pgClient.query(`SELECT id FROM users WHERE role = 'teacher' LIMIT 1`);
        if (teacherUser.rows.length > 0) {
            const teacherId = teacherUser.rows[0].id;
            push(teacherId, `🔔 購點訂單 #${pendingOrder.order_id} (學員 ${pendingOrder.user_name}) 已被學員取消。`)
                .catch(e => console.error(`❌ 通知老師訂單取消失敗:`, e.message));
        }

        return reply(replyToken, `✅ 購點訂單 #${pendingOrder.order_id} 已成功取消。`, pointFunctionsMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 取消購點失敗:', err.message);
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, pointFunctionsMenu);
    } finally {
        client.release();
    }
}


module.exports = {
    pendingPurchase, // 導出狀態變數以便於主程式判斷
    pendingLast5Input,
    pendingCancelBooking,
    handleStudentMainMenu,
    handleStudentBookCourseDisplay,
    handleStudentBookCourse,
    handleStudentMyCoursesDisplay,
    handleStudentCancelBookingConfirm,
    handleStudentCancelBookingExecute,
    handleStudentPointFunctionsDisplay,
    handleStudentPurchasePointsDisplay,
    handleStudentConfirmPurchase,
    handleStudentInputLast5Digits,
    handleStudentCheckPoints,
    handleStudentPurchaseHistory,
    handleStudentCancelPurchase,
};
