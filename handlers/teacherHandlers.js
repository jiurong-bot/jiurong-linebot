// handlers/teacherHandlers.js
const { COMMANDS, MESSAGES, BANK_INFO } = require('../config');
const { reply, push, formatDateTime } = require('../lineUtils');
const { pgClient, getUser, saveUser, getAllStudents, getCourse, getAllCourses, saveCourse, deleteCourse, getOrder, getAllOrders, saveOrder, deleteOrder } = require('../db');
const { teacherMenu } = require('../menus'); // 引入老師菜單

// 全局狀態變數，用於跨訊息的對話流程 (例如新增課程、手動調整點數)
// 更好的做法是將這些狀態儲存在用戶的 `user.state` 欄位中
// 但為了簡化和示範，這裡仍使用物件暫存，但請注意它們會在程式重啟後丟失
const pendingManualAdjust = {}; // { userId: { step: 1, targetUser: null } }
const pendingCourseAdd = {}; // { userId: { step: 1, courseData: {} } }
const pendingCourseCancel = {}; // { userId: { courseId: 'C123' } }


// 老師主選單
async function handleTeacherMainMenu(event, userId, replyToken) {
    return reply(replyToken, '已返回老師主選單。', teacherMenu);
}

// 處理點數管理菜單顯示
async function handleTeacherPointManagementDisplay(event, userId, replyToken) {
    try {
        const pendingOrdersCountRes = await pgClient.query(`SELECT COUNT(*) FROM orders WHERE status = 'pending_confirmation'`);
        const pendingOrdersCount = pendingOrdersCountRes.rows[0].count;

        const pointManagementBubbles = [
            {
                type: 'bubble',
                header: {
                  type: 'box', layout: 'vertical',
                  contents: [{ type: 'text', text: '待確認訂單', color: '#ffffff', weight: 'bold', size: 'md' }],
                  backgroundColor: '#52b69a', paddingAll: 'lg'
                },
                body: {
                  type: 'box', layout: 'vertical', spacing: 'md',
                  contents: [
                    { type: 'text', text: `${pendingOrdersCount} 筆`, weight: 'bold', size: 'xxl', align: 'center' },
                    { type: 'text', text: '點擊查看並處理', color: '#666666', size: 'sm', align: 'center' },
                  ],
                  justifyContent: 'center', alignItems: 'center', height: '150px'
                },
                action: {
                  type: 'message',
                  label: '查看待確認訂單',
                  text: COMMANDS.TEACHER.PENDING_ORDERS
                },
                styles: { body: { separator: false, separatorColor: '#EEEEEE' } }
            },
            {
                type: 'bubble',
                header: {
                  type: 'box', layout: 'vertical',
                  contents: [{ type: 'text', text: '手動調整點數', color: '#ffffff', weight: 'bold', size: 'md' }],
                  backgroundColor: '#52b69a', paddingAll: 'lg'
                },
                body: {
                  type: 'box', layout: 'vertical', paddingAll: 'xxl',
                  contents: [
                    { type: 'text', text: '增減學員點數', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
                  ],
                  justifyContent: 'center', alignItems: 'center', height: '150px'
                },
                action: {
                  type: 'message',
                  label: '手動調整點數',
                  text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS
                },
                styles: { body: { separator: false, separatorColor: '#EEEEEE' } }
            }
        ];

        const flexMessage = {
          type: 'flex',
          altText: '點數管理功能',
          contents: { type: 'carousel', contents: pointManagementBubbles },
        };

        const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];
        return reply(replyToken, flexMessage, menuOptions);
    } catch (err) {
        console.error('❌ 顯示點數管理菜單失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
    }
}

// 處理手動調整點數的狀態機 (從 text 接收輸入)
async function handleTeacherManualAdjustPointsInput(event, userId, replyToken, text) {
    if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, MESSAGES.COMMON.OPERATION_CANCELLED, teacherMenu);
    }

    const parts = text.split(' ');
    if (parts.length !== 2) {
        return reply(replyToken, MESSAGES.TEACHER.MANUAL_ADJUST_FORMAT_ERROR, teacherMenu);
    }
    const targetIdentifier = parts[0];
    const amount = parseInt(parts[1]);

    if (isNaN(amount) || amount === 0) {
        return reply(replyToken, MESSAGES.TEACHER.MANUAL_ADJUST_INVALID_POINTS, teacherMenu);
    }

    let foundUser = await getUser(targetIdentifier);
    if (!foundUser) {
        const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${targetIdentifier.toLowerCase()}%`]);
        if (res.rows.length > 0) foundUser = res.rows[0];
    }

    if (!foundUser) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, MESSAGES.TEACHER.MANUAL_ADJUST_STUDENT_NOT_FOUND(targetIdentifier), teacherMenu);
    }

    const operation = amount > 0 ? '加點' : '扣點';
    const absAmount = Math.abs(amount);

    if (operation === '扣點' && foundUser.points < absAmount) {
        delete pendingManualAdjust[userId];
        return reply(replyToken, MESSAGES.TEACHER.MANUAL_ADJUST_INSUFFICIENT_POINTS(foundUser.name), teacherMenu);
    }

    const client = await pgClient.connect(); // 獲取一個新的客戶端用於事務
    try {
        await client.query('BEGIN');
        const userInTransaction = await getUser(foundUser.id, client); // 從事務客戶端獲取用戶
        userInTransaction.points += amount;
        if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
        userInTransaction.history.push({ action: `老師手動${operation} ${absAmount} 點`, time: new Date().toISOString(), by: userId });
        await saveUser(userInTransaction, client); // 使用事務客戶端保存

        await client.query('COMMIT');

        push(userInTransaction.id, `您的點數已由老師手動調整：${operation}${absAmount}點。\n目前點數：${userInTransaction.points}點。`)
            .catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));

        delete pendingManualAdjust[userId];
        return reply(replyToken, `✅ 已成功為學員 ${userInTransaction.name} ${operation} ${absAmount} 點，目前點數：${userInTransaction.points} 點。`, teacherMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 手動調整點數交易失敗:', err.message);
        delete pendingManualAdjust[userId];
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, teacherMenu);
    } finally {
        client.release(); // 釋放客戶端連接
    }
}

// 處理課程管理顯示
async function handleTeacherCourseManagementDisplay(event, userId, replyToken) {
    try {
        const now = Date.now();
        const courses = await getAllCourses();
        const upcomingCourses = courses
          .filter(c => new Date(c.time).getTime() > now)
          .sort((cA, cB) => new Date(cA.time).getTime() - new Date(cB.time).getTime());

        const courseBubbles = upcomingCourses.slice(0, 9).map(course => {
          return {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical',
              contents: [{ type: 'text', text: '課程資訊', color: '#ffffff', weight: 'bold', size: 'md' }],
              backgroundColor: '#52b69a', paddingAll: 'lg'
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md',
              contents: [
                { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
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
            footer: {
              type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
              contents: [
                {
                  type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                  action: {
                    type: 'postback',
                    label: '取消此課程',
                    data: `${COMMANDS.TEACHER.ACTION_CANCEL_COURSE_CONFIRM}&courseId=${course.id}`,
                    displayText: `準備取消課程：${course.title}`
                  },
                },
              ],
            },
          };
        });

        const addCourseBubble = {
          type: 'bubble',
          body: {
            type: 'box', layout: 'vertical', paddingAll: 'xxl',
            contents: [
              {
                type: 'box', layout: 'vertical', contents: [
                  { type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' },
                  { type: 'text', text: '新增課程', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' },
                ],
                justifyContent: 'center', alignItems: 'center', height: '150px'
              },
            ],
          },
          action: {
            type: 'postback',
            label: '新增課程',
            data: COMMANDS.TEACHER.ACTION_ADD_COURSE_START
          },
          styles: { body: { separator: false, separatorColor: '#EEEEEE' } }
        };

        let introText = '課程管理面板';
        if (upcomingCourses.length === 0) {
            introText = '目前沒有任何未來課程，點擊「+」可新增。';
        }

        const flexMessage = {
          type: 'flex',
          altText: introText,
          contents: { type: 'carousel', contents: [...courseBubbles, addCourseBubble] },
        };

        const menuOptions = [{ type: 'message', label: '返回主選單', text: COMMANDS.TEACHER.MAIN_MENU }];
        return reply(replyToken, flexMessage, menuOptions);
    } catch (err) {
        console.error('❌ 顯示課程管理菜單失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
    }
}

// 處理新增課程流程 (Postback 觸發步驟 1)
async function handleAddCourseStart(event, userId, replyToken) {
    pendingCourseAdd[userId] = { step: 1, courseData: {} };
    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_PROMPT_1, [
        { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
    ]);
}

// 處理新增課程的文字輸入
async function handleAddCourseInput(event, userId, replyToken, text) {
    const currentState = pendingCourseAdd[userId];
    if (!currentState) {
        // 如果沒有狀態，可能是錯誤或舊的狀態，返回主選單
        return reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, teacherMenu);
    }

    // 允許在任何步驟取消
    if (text === COMMANDS.TEACHER.MAIN_MENU) {
        delete pendingCourseAdd[userId];
        return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_CANCELLED, teacherMenu);
    }

    try {
        switch (currentState.step) {
            case 1: // 輸入課程名稱
                currentState.courseData.title = text.trim();
                currentState.step = 2;
                return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_PROMPT_2, [
                    { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                ]);
            case 2: // 輸入課程時間
                const parsedTime = new Date(text.trim());
                if (isNaN(parsedTime.getTime())) {
                    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_INVALID_TIME, [
                        { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                    ]);
                }
                currentState.courseData.time = parsedTime.toISOString(); // 儲存 ISO 格式
                currentState.step = 3;
                return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_PROMPT_3, [
                    { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                ]);
            case 3: // 輸入課程所需點數
                const points = parseInt(text.trim());
                if (isNaN(points) || points <= 0) {
                    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_INVALID_POINTS_CAPACITY, [
                        { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                    ]);
                }
                currentState.courseData.pointsCost = points;
                currentState.step = 4;
                return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_PROMPT_4, [
                    { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                ]);
            case 4: // 輸入課程容量
                const capacity = parseInt(text.trim());
                if (isNaN(capacity) || capacity <= 0) {
                    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_INVALID_POINTS_CAPACITY, [
                        { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                    ]);
                }
                currentState.courseData.capacity = capacity;
                currentState.step = 5; // 最後確認步驟
                return reply(replyToken,
                    MESSAGES.TEACHER.ADD_COURSE_CONFIRM(
                        currentState.courseData.title,
                        formatDateTime(currentState.courseData.time),
                        currentState.courseData.pointsCost,
                        currentState.courseData.capacity
                    ),
                    [
                        { type: 'message', label: '確認新增', text: COMMANDS.TEACHER.ACTION_ADD_COURSE_CONFIRM },
                        { type: 'message', label: '取消新增', text: COMMANDS.TEACHER.MAIN_MENU }
                    ]
                );
            case 5: // 確認新增
                if (text.toLowerCase() === '確認新增' || text.toLowerCase() === COMMANDS.TEACHER.ACTION_ADD_COURSE_CONFIRM) {
                    const newCourse = {
                        id: `C${global.courseIdCounter++}`, // 使用全局計數器
                        title: currentState.courseData.title,
                        time: currentState.courseData.time,
                        pointsCost: currentState.courseData.pointsCost,
                        capacity: currentState.courseData.capacity,
                        students: [],
                        waiting: []
                    };
                    await saveCourse(newCourse);
                    delete pendingCourseAdd[userId];
                    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_SUCCESS(newCourse.title), teacherMenu);
                } else {
                    delete pendingCourseAdd[userId];
                    return reply(replyToken, MESSAGES.TEACHER.ADD_COURSE_CANCELLED, teacherMenu);
                }
            default:
                delete pendingCourseAdd[userId];
                return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
        }
    } catch (err) {
        console.error('❌ 新增課程流程錯誤:', err);
        delete pendingCourseAdd[userId];
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
    }
}

// 處理取消課程確認 (Postback 觸發)
async function handleCancelCourseConfirm(event, userId, replyToken, courseId) {
    const course = await getCourse(courseId);
    if (!course) {
        return reply(replyToken, MESSAGES.TEACHER.COURSE_NOT_FOUND, teacherMenu);
    }
    pendingCourseCancel[userId] = { courseId: courseId };
    return reply(replyToken, MESSAGES.TEACHER.COURSE_CANCEL_CONFIRM(course.title), [
        { type: 'postback', label: '確定取消', data: `action=cancel_course_execute&courseId=${courseId}`, displayText: '確定取消此課程' },
        { type: 'message', label: '返回課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT }
    ]);
}

// 處理執行取消課程 (Postback 觸發)
async function handleCancelCourseExecute(event, userId, replyToken, courseId) {
    if (!pendingCourseCancel[userId] || pendingCourseCancel[userId].courseId !== courseId) {
        return reply(replyToken, MESSAGES.COMMON.INVALID_COMMAND, teacherMenu);
    }

    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const course = await getCourse(courseId, client);
        if (!course) {
            await client.query('ROLLBACK');
            delete pendingCourseCancel[userId];
            return reply(replyToken, MESSAGES.TEACHER.COURSE_NOT_FOUND, teacherMenu);
        }

        // 退還所有已報名學員的點數並通知
        for (const studentId of course.students) {
            const student = await getUser(studentId, client);
            if (student) {
                student.points += course.pointsCost;
                student.history.push({ action: `課程「${course.title}」取消，退還 ${course.pointsCost} 點`, time: new Date().toISOString(), by: 'System' });
                await saveUser(student, client);
                push(student.id, `您已報名的課程「${course.title}」已被老師取消，${course.pointsCost} 點已退還至您的帳戶。目前點數：${student.points}點。`)
                    .catch(e => console.error(`❌ 通知學員取消課程退點失敗:`, e.message));
            }
        }
        // 通知所有候補學員
        for (const studentId of course.waiting) {
            push(studentId, `您候補的課程「${course.title}」已被老師取消。`)
                .catch(e => console.error(`❌ 通知候補學員取消課程失敗:`, e.message));
        }

        await deleteCourse(courseId, client);
        await client.query('COMMIT');

        delete pendingCourseCancel[userId];
        return reply(replyToken, MESSAGES.TEACHER.COURSE_CANCEL_SUCCESS(course.title), teacherMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 取消課程交易失敗:', err.message);
        delete pendingCourseCancel[userId];
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, teacherMenu);
    } finally {
        client.release();
    }
}


// 處理查詢學員
async function handleTeacherSearchStudent(event, userId, replyToken, query) {
    if (!query) {
        return reply(replyToken, '請輸入要查詢的學員名稱或 ID。', teacherMenu);
    }
    let foundUser = null;
    try {
        const userById = await getUser(query);
        if (userById && userById.role === 'student') {
            foundUser = userById;
        }
        if (!foundUser) {
            const res = await pgClient.query(`SELECT * FROM users WHERE role = 'student' AND LOWER(name) LIKE $1`, [`%${query.toLowerCase()}%`]);
            if (res.rows.length > 0) {
                foundUser = res.rows[0];
            }
        }
        if (!foundUser) {
            return reply(replyToken, MESSAGES.TEACHER.MANUAL_ADJUST_STUDENT_NOT_FOUND(query), teacherMenu);
        }

        let studentInfo = `👤 學員姓名：${foundUser.name}\n`;
        studentInfo += `🆔 學員 ID：${foundUser.id}\n`;
        studentInfo += `💎 剩餘點數：${foundUser.points} 點\n`;
        studentInfo += `📜 歷史記錄 (近5筆)：\n`;
        if (foundUser.history && foundUser.history.length > 0) {
            foundUser.history.slice(-5).reverse().forEach(record => {
                studentInfo += `・${record.action} (${formatDateTime(record.time)})\n`;
            });
        } else {
            studentInfo += `無歷史記錄。\n`;
        }
        return reply(replyToken, studentInfo.trim(), teacherMenu);
    } catch (err) {
        console.error('❌ 查詢學員失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
    }
}

// 處理統計報表
async function handleTeacherReport(event, userId, replyToken) {
    try {
        const students = await getAllStudents();
        const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
        const activeStudentsCount = students.filter(s => s.history && s.history.length > 0).length;

        const allCourses = await getAllCourses();
        const totalCourses = allCourses.length;
        const now = Date.now();
        const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > now).length;
        const completedCourses = totalCourses - upcomingCourses;

        const allOrders = await getAllOrders();
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
        report += `  總課程數：${totalCourses} 堂\n`;
        report += `  進行中/未開課：${upcomingCourses} 堂\n`;
        report += `  已結束課程：${completedCourses} 堂\n\n`;
        report += `💰 購點訂單：\n`;
        report += `  待確認訂單：${pendingOrders} 筆\n`;
        report += `  已完成訂單：${completedOrdersCount} 筆\n`;
        report += `  總收入 (已完成訂單)：${totalRevenue} 元\n`;

        return reply(replyToken, report.trim(), teacherMenu);
    } catch (err) {
        console.error('❌ 生成營運報告失敗:', err);
        return reply(replyToken, MESSAGES.COMMON.SYSTEM_ERROR, teacherMenu);
    }
}

// 處理待確認訂單列表
async function handleTeacherPendingOrders(event, userId, replyToken) {
    // 立即回覆，避免 Line 平台超時
    reply(replyToken, '正在查詢待確認訂單，請稍候...').catch(e => console.error(e));

    (async () => {
        try {
            const pendingConfirmationOrders = await pgClient.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);

            if (pendingConfirmationOrders.rows.length === 0) {
                return push(userId, MESSAGES.TEACHER.PENDING_ORDERS_EMPTY);
            }

            const orderBubbles = pendingConfirmationOrders.rows.slice(0, 10).map(order => {
                return {
                    type: 'bubble',
                    header: {
                        type: 'box', layout: 'vertical',
                        contents: [{ type: 'text', text: `訂單 #${order.order_id}`, color: '#ffffff', weight: 'bold', size: 'md' }],
                        backgroundColor: '#ff9e00',
                        paddingAll: 'lg'
                    },
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            { type: 'text', text: `學員姓名: ${order.user_name}`, wrap: true, size: 'sm' },
                            { type: 'text', text: `學員ID: ${order.user_id.substring(0, 8)}...`, wrap: true, size: 'sm' },
                            { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `匯款後五碼: ${order.last_5_digits || 'N/A'}`, wrap: true, size: 'sm', weight: 'bold' },
                            { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp.toISOString())}`, wrap: true, size: 'sm', color: '#666666' }
                        ],
                    },
                    footer: {
                        type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0,
                        contents: [
                            {
                                type: 'button', style: 'primary', color: '#52b69a', height: 'sm',
                                action: {
                                    type: 'postback',
                                    label: '✅ 確認',
                                    data: `${COMMANDS.TEACHER.ACTION_CONFIRM_ORDER}&orderId=${order.order_id}`,
                                    displayText: `確認訂單 ${order.order_id} 入帳`
                                },
                            },
                            {
                                type: 'button', style: 'primary', color: '#de5246', height: 'sm',
                                action: {
                                    type: 'postback',
                                    label: '❌ 退回',
                                    data: `${COMMANDS.TEACHER.ACTION_REJECT_ORDER}&orderId=${order.order_id}`,
                                    displayText: `退回訂單 ${order.order_id}`
                                },
                            },
                        ],
                    },
                };
            });

            const flexMessage = {
                type: 'flex',
                altText: '待確認購點訂單列表',
                contents: { type: 'carousel', contents: orderBubbles }
            };

            await push(userId, flexMessage);
        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            await push(userId, MESSAGES.COMMON.SYSTEM_ERROR);
        }
    })();
}

// 處理確認訂單 (Postback 觸發)
async function handleConfirmOrder(event, userId, replyToken, orderId) {
    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const order = await getOrder(orderId, client);
        if (!order || order.status !== 'pending_confirmation') {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.TEACHER.ORDER_NOT_FOUND_OR_INVALID, teacherMenu);
        }

        const student = await getUser(order.user_id, client);
        if (!student) {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.TEACHER.STUDENT_NOT_FOUND_FOR_ORDER(order.user_id), teacherMenu);
        }

        student.points += order.points;
        student.history.push({ action: `購點訂單 #${order.order_id} 完成，增加 ${order.points} 點`, time: new Date().toISOString(), by: '老師確認' });
        await saveUser(student, client);

        order.status = 'completed';
        order.timestamp = new Date(); // 更新為確認時間
        await saveOrder(order, client);

        await client.query('COMMIT');

        push(student.id, `✅ 您的購點訂單 #${order.order_id} 已由老師確認入帳，${order.points} 點已加入您的帳戶！目前點數：${student.points} 點。`)
            .catch(e => console.error(`❌ 通知學員購點完成失敗:`, e.message));

        return reply(replyToken, `✅ 已成功確認訂單 #${order.order_id}，學員 ${student.name} 已增加 ${order.points} 點。`, teacherMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 確認訂單交易失敗:', err.message);
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, teacherMenu);
    } finally {
        client.release();
    }
}

// 處理退回訂單 (Postback 觸發)
async function handleRejectOrder(event, userId, replyToken, orderId) {
    const client = await pgClient.connect();
    try {
        await client.query('BEGIN');
        const order = await getOrder(orderId, client);
        if (!order || order.status !== 'pending_confirmation') {
            await client.query('ROLLBACK');
            return reply(replyToken, MESSAGES.TEACHER.ORDER_NOT_FOUND_OR_INVALID, teacherMenu);
        }

        order.status = 'rejected';
        order.timestamp = new Date(); // 更新為退回時間
        await saveOrder(order, client);

        await client.query('COMMIT');

        push(order.user_id, `❌ 您的購點訂單 #${order.order_id} 已被老師退回，請確認您的匯款資訊或聯絡老師。`)
            .catch(e => console.error(`❌ 通知學員訂單退回失敗:`, e.message));

        return reply(replyToken, `✅ 已成功退回訂單 #${order.order_id}。`, teacherMenu);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 退回訂單交易失敗:', err.message);
        return reply(replyToken, MESSAGES.COMMON.TRANSACTION_FAILED, teacherMenu);
    } finally {
        client.release();
    }
}


module.exports = {
    pendingManualAdjust, // 導出狀態變數以便於主程式判斷
    pendingCourseAdd,
    pendingCourseCancel,
    handleTeacherMainMenu,
    handleTeacherPointManagementDisplay,
    handleTeacherManualAdjustPointsInput,
    handleTeacherCourseManagementDisplay,
    handleTeacherSearchStudent,
    handleTeacherReport,
    handleTeacherPendingOrders,
    handleConfirmOrder,
    handleRejectOrder,
    handleAddCourseStart,
    handleAddCourseInput,
    handleCancelCourseConfirm,
    handleCancelCourseExecute,
};
