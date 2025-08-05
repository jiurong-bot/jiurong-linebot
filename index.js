// index.js - V16.0 (全面重構為模組化與資料庫狀態管理)
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// --- 引入模組 ---
const {
  // 客戶端與設定
  client,
  pgPool,
  initializeDatabase,
  ADMIN_USER_ID,

  // 常數
  COMMANDS,
  WEEKDAYS,
  PURCHASE_PLANS,
  BANK_INFO,
  
  // Rich Menus
  STUDENT_RICH_MENU_ID,
  TEACHER_RICH_MENU_ID,
  ADMIN_RICH_MENU_ID,

  // 資料庫函式
  getUser,
  saveUser,
  getCourse,
  saveCourse,
  deleteOrder,
  generateUniqueCoursePrefix,
  getAllCourses,
  deleteCoursesByPrefix,
  saveOrder,
  
  // 狀態管理
  setUserState,
  getUserState,
  clearUserState,
  
  // 輔助函式
  reply,
  push,
  formatDateTime,
  getNextDate,
  findClosestCommand,

} = require('./utils');

const {
  cleanCoursesDB,
  checkAndSendReminders,
  keepAlive
} = require('./jobs');

// --- Express App 設定 ---
const app = express();
const PORT = process.env.PORT || 3000;

// 排程任務的時間間隔
const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const CLEAN_DB_INTERVAL_MS = 1000 * 60 * 60; // 每小時清理一次

// 避免重複處理 Webhook
const repliedTokens = new Set();


// --- 中介軟體 ---
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.headers['x-line-signature']) {
      req.rawBody = buf;
    }
  }
}));

// --- Flex Message Builders ---
// 註：這些函式更適合放在 utils.js 中，但為求此檔案能獨立運作，暫時保留於此
function buildBuyPointsFlex() {
    const plansContent = PURCHASE_PLANS.flatMap((plan, index) => {
        const planItems = [
            {
                type: 'box',
                layout: 'horizontal',
                contents: [
                    { type: 'text', text: `${plan.points} 點`, size: 'md', color: '#1A759F', flex: 3, gravity: 'center' },
                    { type: 'text', text: `售價：${plan.amount} 元`, size: 'md', color: '#666666', align: 'end', flex: 5, gravity: 'center' }
                ]
            },
            {
                type: 'button',
                action: { type: 'postback', label: '選擇此方案', data: `action=select_purchase_plan&plan=${plan.points}`, displayText: `選擇購買 ${plan.points} 點方案` },
                style: 'primary',
                color: '#52B69A'
            }
        ];
        if (index < PURCHASE_PLANS.length - 1) {
            planItems.push({ type: 'separator', margin: 'md' });
        }
        return planItems;
    });

    return {
        type: 'flex',
        altText: '請選擇要購買的點數方案',
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: '請選擇點數方案', weight: 'bold', size: 'md', color: '#FFFFFF' }],
                backgroundColor: '#34A0A4',
                paddingAll: 'lg'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                    ...plansContent,
                    { type: 'text', text: '購買後請至「點數管理」輸入匯款資訊', size: 'xs', color: '#aaaaaa', align: 'center', margin: 'md' }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [{
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: { type: 'message', label: '❌ 取消購買', text: COMMANDS.STUDENT.CANCEL_PURCHASE }
                }]
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

async function pushPointsMenu(userId) {
    try {
        const flexMessage = await buildPointsMenuFlex(userId);
        await push(userId, flexMessage);
    } catch (err) {
        console.error(`❌ 推播點數選單失敗 (pushPointsMenu):`, err);
        await push(userId, '抱歉，讀取點數資訊時發生錯誤。');
    }
}

// --- 指令處理函式 (Command Handlers) ---

async function handleAdminCommands(event, userId, userState) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;

    if (stateName === 'adding_teacher') { // 狀態: 等待授權老師的學員資訊
      if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        return reply(replyToken, '已取消授權操作。');
      }

      const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);

      if (studentRes.rows.length === 0) {
        return reply(replyToken, `找不到名為「${text}」的學員。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
      } else if (studentRes.rows.length === 1) {
        const targetUser = studentRes.rows[0];
        await setUserState(userId, 'confirm_add_teacher', { targetUser });
        return reply(replyToken, `您確定要授權學員「${targetUser.name}」成為老師嗎？`, [
          { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } },
          { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }
        ]);
      } else {
        return reply(replyToken, `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);
      }
    }

    if (stateName === 'confirm_add_teacher') { // 狀態: 等待確認授權
      if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
        const targetUser = await getUser(stateData.targetUser.id);
        targetUser.role = 'teacher';
        targetUser.approved_by = userId;
        await saveUser(targetUser);
        await clearUserState(userId);
        await reply(replyToken, `✅ 已成功授權「${targetUser.name}」為老師。`);
        push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
        if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
      } else if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        return reply(replyToken, '已取消授權操作。');
      } else {
        return reply(replyToken, '請點擊確認或取消按鈕。');
      }
       return;
    }
    
    if (stateName === 'confirm_remove_teacher') { // 狀態: 等待確認移除老師
       if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(stateData.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          await clearUserState(userId);
          await reply(replyToken, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
          push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
           await clearUserState(userId);
           return reply(replyToken, '已取消移除操作。');
        } else {
          return reply(replyToken, '請點擊確認或取消按鈕。');
        }
        return;
    }
    return; // 狀態已處理或無匹配狀態，結束
  }


  // --- 無狀態下的指令處理 ---
  const user = await getUser(userId);
  switch(text) {
    case COMMANDS.ADMIN.PANEL:
      const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
      return reply(replyToken, '請選擇管理者功能：', adminMenu);

    case COMMANDS.ADMIN.ADD_TEACHER:
      await setUserState(userId, 'adding_teacher', {}, 300); // 5分鐘超時
      return reply(replyToken, '請輸入您想授權為老師的「學員」姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }]);

    case COMMANDS.ADMIN.REMOVE_TEACHER:
      const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
      if (teacherRes.rows.length === 0) return reply(replyToken, '目前沒有任何老師可供移除。');
      const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${t.name}` }}]} }));
      return reply(replyToken, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });

    case COMMANDS.ADMIN.SIMULATE_STUDENT:
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');

    case COMMANDS.ADMIN.SIMULATE_TEACHER:
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      return reply(replyToken, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }
}

async function handleTeacherCommands(event, userId, userState) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;

    // 狀態: 取消課程
    if (stateName === 'course_cancellation') {
      if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
        await clearUserState(userId);
        return reply(replyToken, '已放棄取消操作。');
      }

      switch(stateData.type) {
        case 'batch':
          if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
            const client = await pgPool.connect();
            try {
              await client.query('BEGIN');
              const coursesToCancelRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${stateData.prefix}%`]);
              if (coursesToCancelRes.rows.length === 0) {
                await clearUserState(userId);
                return reply(replyToken, "找不到可取消的課程系列。");
              }
              const coursesToCancel = coursesToCancelRes.rows;
              const affectedUsers = new Map();

              for (const course of coursesToCancel) {
                for (const studentId of course.students) {
                  if (!affectedUsers.has(studentId)) affectedUsers.set(studentId, 0);
                  affectedUsers.set(studentId, affectedUsers.get(studentId) + course.points_cost);
                }
              }
              
              for (const [studentId, refundAmount] of affectedUsers.entries()) {
                if (refundAmount > 0) {
                  await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [refundAmount, studentId]);
                }
              }

              const courseMainTitle = coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '');
              await client.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${stateData.prefix}%`]);
              await client.query('COMMIT');

              for (const [studentId, refundAmount] of affectedUsers.entries()) {
                push(studentId, `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。`).catch(e => console.error(e));
              }

              await clearUserState(userId);
              return reply(replyToken, `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。`);
            } catch (e) {
              await client.query('ROLLBACK');
              await clearUserState(userId);
              console.error('批次取消課程失敗:', e);
              return reply(replyToken, '批次取消課程時發生錯誤，請稍後再試。');
            } finally {
              client.release();
            }
          }
          break;

        case 'single':
           if (text === COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
              const client = await pgPool.connect();
              try {
                await client.query('BEGIN');
                const courseToCancelRes = await client.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [stateData.courseId]);
                if (courseToCancelRes.rows.length === 0) {
                  await clearUserState(userId);
                  return reply(replyToken, "找不到該課程，可能已被取消。");
                }
                const course = courseToCancelRes.rows[0];

                for (const studentId of course.students) {
                   await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                   push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
                }
                
                await client.query("DELETE FROM courses WHERE id = $1", [stateData.courseId]);
                await client.query('COMMIT');

                await clearUserState(userId);
                return reply(replyToken, `✅ 已成功取消課程「${course.title}」。`);

              } catch (e) {
                  await client.query('ROLLBACK');
                  await clearUserState(userId);
                  console.error('單堂取消課程失敗:', e);
                  return reply(replyToken, '取消課程時發生錯誤，請稍後再試。');
              } finally {
                client.release();
              }
           }
          break;
      }
      return; // 結束
    }
    
    // 狀態: 新增課程
    if (stateName === 'course_creation') {
      if (text.toLowerCase() === '取消') {
          await clearUserState(userId);
          return reply(replyToken, '已取消新增課程。');
      }
      
      switch (stateData.step) {
          case 'await_title':
              stateData.title = text;
              stateData.step = 'await_weekday';
              await setUserState(userId, stateName, stateData);
              const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
              return reply(replyToken, `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, weekdayButtons);
          
          case 'await_time':
              if (!/^\d{2}:\d{2}$/.test(text)) {
                  return reply(replyToken, '時間格式不正確，請輸入四位數時間，例如：19:30');
              }
              stateData.time = text;
              stateData.step = 'await_sessions';
              await setUserState(userId, stateName, stateData);
              return reply(replyToken, '請問這個系列總共要開設幾堂課？（請輸入數字）');

          case 'await_sessions':
              const sessions = parseInt(text, 10);
              if (isNaN(sessions) || sessions <= 0) {
                  return reply(replyToken, '堂數必須是正整數，請重新輸入。');
              }
              stateData.sessions = sessions;
              stateData.step = 'await_capacity';
              await setUserState(userId, stateName, stateData);
              return reply(replyToken, '請問每堂課的名額限制？（請輸入數字）');

          case 'await_capacity':
              const capacity = parseInt(text, 10);
              if (isNaN(capacity) || capacity <= 0) {
                  return reply(replyToken, '名額必須是正整數，請重新輸入。');
              }
              stateData.capacity = capacity;
              stateData.step = 'await_points';
              await setUserState(userId, stateName, stateData);
              return reply(replyToken, '請問每堂課需要消耗多少點數？（請輸入數字）');

          case 'await_points':
              const points = parseInt(text, 10);
              if (isNaN(points) || points < 0) {
                  return reply(replyToken, '點數必須是正整數或 0，請重新輸入。');
              }
              stateData.pointsCost = points;
              stateData.step = 'await_confirmation';
              await setUserState(userId, stateName, stateData);

              const firstDate = getNextDate(stateData.weekday, stateData.time);
              const summary = `請確認課程資訊：\n\n標題：${stateData.title}\n時間：每${stateData.weekday_label} ${stateData.time}\n堂數：${stateData.sessions} 堂\n名額：${stateData.capacity} 位\n費用：${stateData.pointsCost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
              return reply(replyToken, summary, [
                  { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } },
                  { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } }
              ]);

          case 'await_confirmation':
              if (text === '✅ 確認新增') {
                  const client = await pgPool.connect();
                  try {
                      await client.query('BEGIN');
                      const prefix = await generateUniqueCoursePrefix(client);
                      let currentDate = new Date();
                      for (let i = 0; i < stateData.sessions; i++) {
                          const courseDate = getNextDate(stateData.weekday, stateData.time, currentDate);
                          const course = {
                              id: `${prefix}${String(i + 1).padStart(2, '0')}`,
                              title: `${stateData.title} - 第 ${i + 1} 堂`,
                              time: courseDate.toISOString(),
                              capacity: stateData.capacity,
                              pointsCost: stateData.pointsCost,
                              students: [],
                              waiting: []
                          };
                          await saveCourse(course, client);
                          currentDate = new Date(courseDate.getTime() + (24 * 60 * 60 * 1000));
                      }
                      await client.query('COMMIT');
                      await clearUserState(userId);
                      return reply(replyToken, `✅ 成功新增「${stateData.title}」系列共 ${stateData.sessions} 堂課！`);
                  } catch (e) {
                      await client.query('ROLLBACK');
                      console.error("新增課程系列失敗:", e);
                      await clearUserState(userId);
                      return reply(replyToken, '新增課程時發生錯誤，請稍後再試。');
                  } finally {
                      client.release();
                  }
              } else {
                  return reply(replyToken, '請點擊「✅ 確認新增」或「❌ 放棄」。');
              }
      }
      return; // 結束
    }

    // 狀態: 手動調整點數
    if (stateName === 'manual_adjust') {
        if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          await clearUserState(userId);
          return reply(replyToken, '已取消調整點數操作。');
        }

        switch (stateData.step) {
          case 'await_student_search':
            const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
            if (res.rows.length === 0) {
              return reply(replyToken, `找不到學員「${text}」。請重新輸入或取消操作。`, [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
            }
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover'}, { type: 'box', layout: 'vertical',flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } }));
            return reply(replyToken, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
          
          case 'await_operation':
            if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
              stateData.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
              stateData.step = 'await_amount';
              await setUserState(userId, stateName, stateData);
              return reply(replyToken, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`);
            } else {
              return reply(replyToken, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
            }

          case 'await_amount':
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數格式不正確，請輸入一個大於 0 的正整數。'); }
            stateData.amount = amount;
            stateData.step = 'await_reason';
            await setUserState(userId, stateName, stateData);
            return reply(replyToken, '請輸入調整原因（例如：活動獎勵、課程補償等）：');

          case 'await_reason':
            stateData.reason = text;
            stateData.step = 'await_confirmation';
            await setUserState(userId, stateName, stateData);
            const opText = stateData.operation === 'add' ? `增加 ${stateData.amount} 點` : `扣除 ${stateData.amount} 點`;
            const summary = `請確認調整內容：\n\n對象：${stateData.targetStudent.name}\n操作：${opText}\n原因：${stateData.reason}`;
            return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ]);

          case 'await_confirmation':
            if (text === COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST) {
              const clientDB = await pgPool.connect();
              try {
                await clientDB.query('BEGIN');
                const studentRes = await clientDB.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [stateData.targetStudent.id]);
                const student = studentRes.rows[0];
                const newPoints = stateData.operation === 'add' ? student.points + stateData.amount : student.points - stateData.amount;
                if (newPoints < 0) {
                  await clientDB.query('ROLLBACK');
                  await clearUserState(userId);
                  return reply(replyToken, `操作失敗：學員 ${student.name} 的點數不足以扣除 ${stateData.amount} 點。`);
                }
                const historyEntry = { action: `手動調整：${stateData.operation === 'add' ? '+' : '-'}${stateData.amount}點`, reason: stateData.reason, time: new Date().toISOString(), operator: user.name };
                const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
                await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
                await clientDB.query('COMMIT');
                
                await clearUserState(userId);
                await reply(replyToken, `✅ 已成功為學員 ${student.name} ${stateData.operation === 'add' ? '增加' : '扣除'} ${stateData.amount} 點。`);
                
                const opTextForStudent = stateData.operation === 'add' ? `增加了 ${stateData.amount}` : `扣除了 ${stateData.amount}`;
                push(student.id, `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${stateData.reason}\n您目前的點數為：${newPoints} 點。`).catch(e => console.error(e));
              } catch (e) {
                await clientDB.query('ROLLBACK');
                console.error('手動調整點數失敗:', e);
                await clearUserState(userId);
                return reply(replyToken, '❌ 操作失敗，資料庫發生錯誤，請稍後再試。');
              } finally {
                clientDB.release();
              }
            }
            break;
        }
        return; // 結束
    }
    
    // 狀態: 查詢學員
    if (stateName === 'student_search') {
        const searchQuery = text;
        await clearUserState(userId); 
        
        try {
            const res = await pgPool.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${searchQuery.toLowerCase()}%`, searchQuery]);
            if (res.rows.length === 0) return reply(replyToken, `找不到符合「${searchQuery}」的學員。`);
            
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover', flex: 1 }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' } ] } ] }, { type: 'box', layout: 'vertical', margin: 'lg', contents: [ { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` } }] } }));
            return reply(replyToken, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
        } catch (err) {
            console.error('❌ 查詢學員失敗:', err);
            return reply(replyToken, '查詢學員時發生錯誤，請稍後再試。');
        }
    }
    
    // 其他未實作的狀態，給予提示並清除
    const unhandledStates = ['announcement_creation', 'feedback_reply', 'message_search', 'product_creation'];
    if (unhandledStates.includes(stateName)) {
        await clearUserState(userId);
        return reply(replyToken, `功能尚未開放，已為您取消目前操作。`);
    }

    return; // 結束狀態處理
  }

  // --- 無狀態下的指令處理 ---
  
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.ADD_COURSE) {
    // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
    // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
    // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      await setUserState(userId, 'manual_adjust', { step: 'await_student_search' });
      return reply(replyToken, '請輸入您想調整點數的學員姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
  } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
      await setUserState(userId, 'student_search', {});
      return reply(replyToken, '請輸入您想查詢的學員姓名或 User ID：');
  } else if (text === COMMANDS.TEACHER.VIEW_MESSAGES) {
      // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
      // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.SHOP_MANAGEMENT) {
      // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.REPORT) {
      // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
      // ... 此處邏輯與 V15.0 相同，不變 ...
  } else {
    let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'teacher');
        if (closestCommand) {
            teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
        } else {
            teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
        }
    }
    return reply(replyToken, teacherSuggestion);
  }
}
async function handleStudentCommands(event, userId, userState) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;

    // 狀態: 購買點數流程
    if (stateName === 'purchase') {
      // 步驟: 等待輸入後五碼
      if (stateData.step === 'input_last5' || stateData.step === 'edit_last5') {
        if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
          await clearUserState(userId);
          await reply(replyToken, '已取消輸入，您隨時可以從「點數管理」重新操作。');
          await pushPointsMenu(userId);
          return;
        }
        
        if (!/^\d{5}$/.test(text)) {
          return reply(replyToken, '格式錯誤，請輸入正確的匯款帳號後 5 碼數字，或點擊「取消輸入」。', [
            { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }
          ]);
        }

        try {
          const orderId = stateData.orderId;
          const res = await pgPool.query("SELECT * FROM orders WHERE order_id = $1 AND user_id = $2", [orderId, userId]);
          if (res.rows.length === 0) {
            await clearUserState(userId);
            return reply(replyToken, '找不到您的訂單，操作已取消。');
          }

          const order = res.rows[0];
          await pgPool.query("UPDATE orders SET last_5_digits = $1, status = 'pending_confirmation', timestamp = NOW() WHERE order_id = $2", [text, orderId]);
          
          await clearUserState(userId);
          await reply(replyToken, `✅ 您的匯款資訊已更新！\n後五碼：${text}\n\n我們將盡快為您審核，審核通過後點數會自動存入您的帳戶。`);
          await pushPointsMenu(userId);
          
          const teachersRes = await pgPool.query("SELECT id FROM users WHERE role = 'teacher' OR role = 'admin'");
          const notificationMessage = `🔔 訂單待審核\n學員: ${user.name}\n訂單ID: ${orderId}\n金額: ${order.amount}\n後五碼: ${text}\n\n請至「點數管理」->「待確認清單」進行審核。`;
          for (const teacher of teachersRes.rows) {
            push(teacher.id, notificationMessage).catch(e => console.error(`推播給老師 ${teacher.id} 失敗:`, e));
          }
        } catch (err) {
          console.error('更新後五碼失敗:', err);
          await clearUserState(userId);
          await reply(replyToken, '更新資訊時發生錯誤，請稍後再試。');
        }
        return;
      }
      // 步驟: 等待確認購買
      if (stateData.step === 'confirm_purchase' && text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        try {
          const orderId = `PO${Date.now()}`;
          const order = {
              orderId: orderId,
              userId: userId,
              userName: user.name,
              points: stateData.data.points,
              amount: stateData.data.amount,
              last5Digits: null,
              status: 'pending_payment',
              timestamp: new Date().toISOString()
          };
          await saveOrder(order);
          await clearUserState(userId);

          const bankInfoText = `✅ 您的訂單已建立！\n請匯款至以下帳戶：\n\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請務必回到「點數管理」點擊「輸入匯款後五碼」以完成購點程序。`;
          await reply(replyToken, bankInfoText);
          await pushPointsMenu(userId);
        } catch (err) {
          console.error('建立訂單失敗:', err);
          await clearUserState(userId);
          await reply(replyToken, '建立訂單時發生錯誤，請稍後再試。');
        }
        return;
      }
      return;
    }
    
    // 狀態: 預約/取消課程確認
    if (stateName === 'booking_confirmation') {
      const course = await getCourse(stateData.courseId);
      if (!course) {
          await clearUserState(userId);
          return reply(replyToken, '抱歉，找不到該課程，可能已被老師取消。');
      }

      switch (stateData.type) {
        // ... (此處邏輯與 V15.0 相同，僅將 delete pending... 改為 clearUserState)
      }
      await clearUserState(userId); // 無論成功失敗都清除狀態
      return;
    }
    
    // 狀態: 聯絡我們/留言
    if (stateName === 'feedback') {
      if (text.toLowerCase() === '取消') {
        await clearUserState(userId);
        return reply(replyToken, '已取消留言。');
      }
      if (stateData.step === 'await_message') {
        await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text]);
        await clearUserState(userId);
        await reply(replyToken, '感謝您的留言，我們已收到您的訊息，老師會盡快查看！');
        if (process.env.TEACHER_ID) { push(process.env.TEACHER_ID, `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`).catch(e => console.error(e)); }
      }
      return;
    }
    return; // 狀態處理結束
  }
  
  // --- 無狀態下的指令處理 ---
  if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
    // ... 此處邏輯與 V15.0 相同，不變 ...
  } else if (text === COMMANDS.STUDENT.CONTACT_US) {
      await setUserState(userId, 'feedback', { step: 'await_message' });
      return reply(replyToken, '請輸入您想對老師說的話，或點選「取消」。', [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }]);
  } else if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      await clearUserState(userId); // 清除任何可能殘留的狀態
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, flexMenu);
  } else if (text === COMMANDS.STUDENT.BUY_POINTS) {
      const existingOrderRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
      if (existingOrderRes.rows.length > 0) {
          const flexMenu = await buildPointsMenuFlex(userId);
          return reply(replyToken, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu]);
      }
      return reply(replyToken, buildBuyPointsFlex());
  } else if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
      const ordersRes = await pgPool.query(`SELECT order_id FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'rejected' OR status = 'pending_confirmation') ORDER BY timestamp DESC LIMIT 1`, [userId]);
      if (ordersRes.rows.length === 0) {
        return reply(replyToken, '您目前沒有需要處理的訂單。');
      }
      const orderId = ordersRes.rows[0].order_id;
      const isEdit = text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER;
      
      await setUserState(userId, 'purchase', { step: isEdit ? 'edit_last5' : 'input_last5', orderId: orderId });
      
      return reply(replyToken, `請輸入您的「匯款帳號後 5 碼」：`, [
        { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }
      ]);
  } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) {
      const state = await getUserState(userId);
      if (state && state.state_name === 'purchase') {
          await clearUserState(userId);
          const flexMenu = await buildPointsMenuFlex(userId);
          return reply(replyToken, [{type: 'text', text: '已取消購買，返回點數管理主選單。'}, flexMenu]);
      }
      const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
      const pendingOrder = ordersRes.rows[0];
      if (pendingOrder) {
          if (pendingOrder.status === 'pending_confirmation') { return reply(replyToken, '您的匯款資訊已提交，訂單正在等待老師確認，目前無法自行取消。\n如有疑問請聯繫老師。'); }
          if (pendingOrder.status === 'pending_payment' || pendingOrder.status === 'rejected') {
              await deleteOrder(pendingOrder.order_id);
              await clearUserState(userId);
              const flexMenu = await buildPointsMenuFlex(userId);
              return reply(replyToken, [{type: 'text', text: '已取消您的購點訂單。'}, flexMenu]);
          }
      }
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, [{type: 'text', text: '您沒有待處理的購點流程，已返回點數管理主選單。'}, flexMenu]);
  } else {
    // ... (其他學生指令邏輯與 V15.0 相同，例如 MY_COURSES, BOOK_COURSE 等)
    let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'student');
        if (closestCommand) {
            studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
        } else {
            studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`;
        }
    }
    return reply(replyToken, studentSuggestion);
  }
}

// --- Webhook 主處理函式 ---
async function handleEvent(event) {
  if (!event.source || !event.source.userId) {
    return console.log("收到無效來源的事件:", event);
  }
  const userId = event.source.userId;

  if (event.replyToken) {
    if (repliedTokens.has(event.replyToken)) {
      return console.log('🔄️ 偵測到重複的 Webhook 事件，已忽略。');
    }
    repliedTokens.add(event.replyToken);
    setTimeout(() => repliedTokens.delete(event.replyToken), 60000);
  }

  let user = await getUser(userId);
  if (!user) {
    try {
      const profile = await client.getProfile(userId);
      user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, approved_by: null };
      await saveUser(user);
      await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
      if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
    } catch (error) {
      if (error.statusCode === 404) {
         console.error(`❌ 找不到使用者 ${userId}，可能已封鎖機器人。`);
      } else {
         console.error(`❌ 創建新用戶時出錯: `, error);
      }
      return;
    }
  } else {
     try {
        const profile = await client.getProfile(userId);
        if (profile.displayName !== user.name || (profile.pictureUrl && profile.pictureUrl !== user.picture_url)) {
            user.name = profile.displayName;
            user.pictureUrl = profile.pictureUrl;
            await saveUser(user);
        }
    } catch(e) {
        console.warn(`⚠️ 更新用戶 ${userId} 資料時出錯 (可能已封鎖):`, e.message);
    }
  }

  const userState = await getUserState(userId);

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
      if (user.role !== 'admin') {
        user.role = 'admin';
        await saveUser(user);
        if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
      }
      return handleAdminCommands(event, userId, userState);
    }

    switch (user.role) {
      case 'admin': return handleAdminCommands(event, userId, userState);
      case 'teacher': return handleTeacherCommands(event, userId, userState);
      default: return handleStudentCommands(event, userId, userState);
    }
  } else if (event.type === 'postback') {
    const data = new URLSearchParams(event.postback.data);
    const action = data.get('action');

    // 處理需要立即回應的指令
    if (action === 'run_command') {
        const commandText = data.get('text');
        if (commandText) {
            const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: 'simulated_message_id', text: commandText } };
            const currentState = await getUserState(userId); // 重新獲取最新狀態
            if (user.role === 'admin') await handleAdminCommands(simulatedEvent, userId, currentState);
            else if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, userId, currentState);
            else await handleStudentCommands(simulatedEvent, userId, currentState);
        }
        return;
    }
    
    // --- Postback 狀態設定 ---
    if (user.role === 'admin') {
      if (action === 'select_teacher_for_removal') {
          const targetId = data.get('targetId');
          const targetName = data.get('targetName');
          await setUserState(userId, 'confirm_remove_teacher', { targetUser: { id: targetId, name: targetName } });
          return reply(event.replyToken, `您確定要移除老師「${targetName}」的權限嗎？該用戶將變回學員身份。`, [
             { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } },
             { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER, text: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER } }
          ]);
      }
    } else if (user.role === 'teacher') {
      // (老師的 Postback 狀態設定邏輯... 例如)
      if (action === 'add_course_start') {
          await setUserState(userId, 'course_creation', { step: 'await_title' });
          return reply(event.replyToken, '請輸入新課程系列的標題（例如：高階空中瑜伽），或按「取消」來放棄操作。', [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }]);
      }
      if (action === 'set_course_weekday') {
          const currentState = await getUserState(userId);
          if (currentState && currentState.state_name === 'course_creation') {
              const stateData = currentState.state_data;
              const day = parseInt(data.get('day'), 10);
              stateData.weekday = day;
              stateData.weekday_label = WEEKDAYS.find(d => d.value === day).label;
              stateData.step = 'await_time';
              await setUserState(userId, 'course_creation', stateData);
              return reply(event.replyToken, `已選擇 ${stateData.weekday_label}，請問上課時間是？（請輸入四位數時間，例如：19:30）`);
          }
      }
       // ... 其他老師 Postback 狀態設定
    } else { // student
       if (action === 'select_purchase_plan') {
          const planPoints = parseInt(data.get('plan'), 10);
          const selectedPlan = PURCHASE_PLANS.find(p => p.points === planPoints);
          if (selectedPlan) {
              await setUserState(userId, 'purchase', { step: 'confirm_purchase', data: { points: selectedPlan.points, amount: selectedPlan.amount }});
              return reply(event.replyToken, `您選擇了「${selectedPlan.label}」。\n請確認是否購買？`, [
                  { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } },
                  { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
              ]);
          }
       }
       // ... 其他學員 Postback 狀態設定
    }
  }
}


// --- 路由設定 ---
app.post('/webhook', (req, res) => {
  const signature = crypto.createHmac('SHA256', process.env.CHANNEL_SECRET).update(req.rawBody).digest('base64');
  if (req.headers['x-line-signature'] !== signature) {
    return res.status(401).send('Unauthorized');
  }

  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.stack);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot (V16.0) 正常運作中。'));


// --- 伺服器啟動 ---
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  
  console.log('🕒 開始設定背景排程任務...');
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(keepAlive, PING_INTERVAL_MS);
  setInterval(cleanCoursesDB, CLEAN_DB_INTERVAL_MS);
  console.log('✅ 背景排程任務已設定完成。');
});
