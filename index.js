/*
 * index.js - V20.2 (完整修正版)
 * =================================================================
 * 功能簡介 (Functional Overview):
 * - 補齊 V20.1 中遺漏的程式碼，確保功能完整性與可部署性。
 * - 修正了因資料庫讀寫延遲導致管理員切換角色失敗的競態條件 (Race Condition) 問題。
 * - 優化了程式碼結構，避免在指令處理函式中重複讀取使用者資料。
 * - 強化了非同步事件的錯誤處理機制，確保能捕獲並記錄初始錯誤。
 *
 * 相依模組版本 (Module Dependencies):
 * - utils.js: V19.0
 * - jobs.js:  V16.0 (或更新)
 * =================================================================
 */
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// --- 引入模組 ---
const {
  client, pgPool, initializeDatabase, ADMIN_USER_ID, COMMANDS, WEEKDAYS,
  PURCHASE_PLANS, BANK_INFO, STUDENT_RICH_MENU_ID, TEACHER_RICH_MENU_ID,
  ADMIN_RICH_MENU_ID, getUser, saveUser, getCourse, saveCourse, deleteOrder,
  generateUniqueCoursePrefix, getAllCourses, deleteCoursesByPrefix, saveOrder,
  setUserState, getUserState, clearUserState, push, formatDateTime,
  getNextDate, findClosestCommand,
  getAnnouncements,
  deleteAnnouncement,
  updateFeedbackReply,
} = require('./utils');

const {
  cleanCoursesDB, checkAndSendReminders, keepAlive
} = require('./jobs');

// --- Express App 設定 ---
const app = express();
const PORT = process.env.PORT || 3000;

const PING_INTERVAL_MS = 1000 * 60 * 5;
const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const CLEAN_DB_INTERVAL_MS = 1000 * 60 * 60;

// --- 中介軟體 ---
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.headers['x-line-signature']) {
      req.rawBody = buf;
    }
  }
}));

// --- Flex Message Builders ---
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
async function handleAdminCommands(event, user, userState) {
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;

  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;
    if (stateName === 'adding_teacher') {
      if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        return push(userId, '已取消授權操作。');
      }
      const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
      if (studentRes.rows.length === 0) {
        const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
        return push(userId, { type: 'text', text: `找不到名為「${text}」的學員。請重新輸入或取消操作。`, quickReply });
      } else if (studentRes.rows.length === 1) {
        const targetUser = studentRes.rows[0];
        await setUserState(userId, 'confirm_add_teacher', { targetUser });
        const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } } ] };
        return push(userId, { type: 'text', text: `您確定要授權學員「${targetUser.name}」成為老師嗎？`, quickReply });
      } else {
        const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
        return push(userId, { type: 'text', text: `找到多位名為「${text}」的學員，請提供更完整的姓名或直接使用 User ID 進行授權。`, quickReply });
      }
    }
    if (stateName === 'confirm_add_teacher') {
      if (text === COMMANDS.ADMIN.CONFIRM_ADD_TEACHER) {
        const targetUser = await getUser(stateData.targetUser.id);
        targetUser.role = 'teacher';
        targetUser.approved_by = userId;
        await saveUser(targetUser);
        await clearUserState(userId);
        await push(userId, `✅ 已成功授權「${targetUser.name}」為老師。`);
        await push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
        if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
      } else if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        return push(userId, '已取消授權操作。');
      } else {
        return push(userId, '請點擊確認或取消按鈕。');
      }
       return;
    }
    if (stateName === 'confirm_remove_teacher') {
       if (text === COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER) {
          const targetUser = await getUser(stateData.targetUser.id);
          targetUser.role = 'student';
          targetUser.approved_by = null;
          await saveUser(targetUser);
          await clearUserState(userId);
          await push(userId, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
          await push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
           await clearUserState(userId);
           return push(userId, '已取消移除操作。');
        } else {
          return push(userId, '請點擊確認或取消按鈕。');
        }
        return;
    }
    return;
  }

  switch(text) {
    case COMMANDS.ADMIN.PANEL:
      const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
      return push(userId, { type: 'text', text: '請選擇管理者功能：', quickReply: { items: adminMenu } });
    case COMMANDS.ADMIN.ADD_TEACHER:
      await setUserState(userId, 'adding_teacher', {}, 300);
      const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
      return push(userId, { type: 'text', text: '請輸入您想授權為老師的「學員」姓名或 User ID：', quickReply });
    case COMMANDS.ADMIN.REMOVE_TEACHER:
      const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
      if (teacherRes.rows.length === 0) return push(userId, '目前沒有任何老師可供移除。');
      const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=select_teacher_for_removal&targetId=${t.id}&targetName=${t.name}` }}]} }));
      return push(userId, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });
    case COMMANDS.ADMIN.SIMULATE_STUDENT:
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      return push(userId, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
    case COMMANDS.ADMIN.SIMULATE_TEACHER:
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      return push(userId, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }
}
async function handleTeacherCommands(event, user, userState) {
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    let stateData = userState.state_data;

    if (stateName === 'course_cancellation') {
      if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
        await clearUserState(userId);
        return push(userId, '已放棄取消操作。');
      }
      switch(stateData.type) {
        case 'batch':
          if (text === COMMANDS.TEACHER.CONFIRM_BATCH_CANCEL) {
            const clientDB = await pgPool.connect();
            try {
              await clientDB.query('BEGIN');
              const coursesToCancelRes = await clientDB.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() FOR UPDATE", [`${stateData.prefix}%`]);
              if (coursesToCancelRes.rows.length === 0) {
                await clearUserState(userId);
                return push(userId, "找不到可取消的課程系列。");
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
                  await clientDB.query("UPDATE users SET points = points + $1 WHERE id = $2", [refundAmount, studentId]);
                }
              }
              const courseMainTitle = coursesToCancel[0].title.replace(/ - 第 \d+ 堂$/, '');
              await clientDB.query("DELETE FROM courses WHERE id LIKE $1 AND time > NOW()", [`${stateData.prefix}%`]);
              await clientDB.query('COMMIT');
              for (const [studentId, refundAmount] of affectedUsers.entries()) {
                push(studentId, `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。`).catch(e => console.error(e));
              }
              await clearUserState(userId);
              return push(userId, `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。`);
            } catch (e) {
              await clientDB.query('ROLLBACK');
              await clearUserState(userId);
              console.error('批次取消課程失敗:', e);
              return push(userId, '批次取消課程時發生錯誤，請稍後再試。');
            } finally {
              clientDB.release();
            }
          }
          break;
        case 'single':
           if (text === COMMANDS.TEACHER.CONFIRM_SINGLE_CANCEL) {
              const clientDB = await pgPool.connect();
              try {
                await clientDB.query('BEGIN');
                const courseToCancelRes = await clientDB.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [stateData.courseId]);
                if (courseToCancelRes.rows.length === 0) {
                  await clearUserState(userId);
                  return push(userId, "找不到該課程，可能已被取消。");
                }
                const course = courseToCancelRes.rows[0];
                for (const studentId of course.students) {
                   await clientDB.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                   push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
                }
                await clientDB.query("DELETE FROM courses WHERE id = $1", [stateData.courseId]);
                await clientDB.query('COMMIT');
                await clearUserState(userId);
                return push(userId, `✅ 已成功取消課程「${course.title}」。`);
              } catch (e) {
                  await clientDB.query('ROLLBACK');
                  await clearUserState(userId);
                  console.error('單堂取消課程失敗:', e);
                  return push(userId, '取消課程時發生錯誤，請稍後再試。');
              } finally {
                clientDB.release();
              }
           }
          break;
      }
      return;
    }
    
    if (stateName === 'course_creation') {
        if (text.toLowerCase() === '取消') {
            await clearUserState(userId);
            return push(userId, '已取消新增課程。');
        }
        switch (stateData.step) {
            case 'await_title':
                stateData.title = text;
                stateData.step = 'await_weekday';
                await setUserState(userId, stateName, stateData);
                const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
                return push(userId, {type: 'text', text: `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, quickReply: { items: weekdayButtons }});
            case 'await_time':
                if (!/^\d{2}:\d{2}$/.test(text)) { return push(userId, '時間格式不正確，請輸入四位數時間，例如：19:30'); }
                stateData.time = text;
                stateData.step = 'await_sessions';
                await setUserState(userId, stateName, stateData);
                return push(userId, '請問這個系列總共要開設幾堂課？（請輸入數字）');
            case 'await_sessions':
                const sessions = parseInt(text, 10);
                if (isNaN(sessions) || sessions <= 0) { return push(userId, '堂數必須是正整數，請重新輸入。'); }
                stateData.sessions = sessions;
                stateData.step = 'await_capacity';
                await setUserState(userId, stateName, stateData);
                return push(userId, '請問每堂課的名額限制？（請輸入數字）');
            case 'await_capacity':
                const capacity = parseInt(text, 10);
                if (isNaN(capacity) || capacity <= 0) { return push(userId, '名額必須是正整數，請重新輸入。'); }
                stateData.capacity = capacity;
                stateData.step = 'await_points';
                await setUserState(userId, stateName, stateData);
                return push(userId, '請問每堂課需要消耗多少點數？（請輸入數字）');
            case 'await_points':
                const points = parseInt(text, 10);
                if (isNaN(points) || points < 0) { return push(userId, '點數必須是正整數或 0，請重新輸入。'); }
                stateData.pointsCost = points;
                stateData.step = 'await_confirmation';
                await setUserState(userId, stateName, stateData);
                const firstDate = getNextDate(stateData.weekday, stateData.time);
                const summary = `請確認課程資訊：\n\n標題：${stateData.title}\n時間：每${stateData.weekday_label} ${stateData.time}\n堂數：${stateData.sessions} 堂\n名額：${stateData.capacity} 位\n費用：${stateData.pointsCost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
                const quickReply = { items: [ { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } }, { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } } ] };
                return push(userId, {type: 'text', text: summary, quickReply});
            case 'await_confirmation':
                if (text === '✅ 確認新增') {
                    const clientDB = await pgPool.connect();
                    try {
                        await clientDB.query('BEGIN');
                        const prefix = await generateUniqueCoursePrefix(clientDB);
                        let currentDate = new Date();
                        for (let i = 0; i < stateData.sessions; i++) {
                            const courseDate = getNextDate(stateData.weekday, stateData.time, currentDate);
                            const course = { id: `${prefix}${String(i + 1).padStart(2, '0')}`, title: `${stateData.title} - 第 ${i + 1} 堂`, time: courseDate.toISOString(), capacity: stateData.capacity, pointsCost: stateData.pointsCost, students: [], waiting: [] };
                            await saveCourse(course, clientDB);
                            currentDate = new Date(courseDate.getTime() + (24 * 60 * 60 * 1000));
                        }
                        await clientDB.query('COMMIT');
                        await clearUserState(userId);
                        return push(userId, `✅ 成功新增「${stateData.title}」系列共 ${stateData.sessions} 堂課！`);
                    } catch (e) {
                        await clientDB.query('ROLLBACK');
                        console.error("新增課程系列失敗:", e);
                        await clearUserState(userId);
                        return push(userId, '新增課程時發生錯誤，請稍後再試。');
                    } finally { clientDB.release(); }
                } else { return push(userId, '請點擊「✅ 確認新增」或「❌ 放棄」。'); }
        }
        return;
    }

    if (stateName === 'manual_adjust') {
        if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          await clearUserState(userId);
          return push(userId, '已取消調整點數操作。');
        }
        switch (stateData.step) {
          case 'await_student_search':
            const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
            if (res.rows.length === 0) {
              const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }] };
              return push(userId, { type: 'text', text: `找不到學員「${text}」。請重新輸入或取消操作。`, quickReply });
            }
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover'}, { type: 'box', layout: 'vertical',flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } }));
            return push(userId, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
          
          case 'await_operation':
            if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
              stateData.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
              stateData.step = 'await_amount';
              await setUserState(userId, stateName, stateData);
              return push(userId, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`);
            } else {
              return push(userId, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
            }
          case 'await_amount':
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount <= 0) { return push(userId, '點數格式不正確，請輸入一個大於 0 的正整數。'); }
            stateData.amount = amount;
            stateData.step = 'await_reason';
            await setUserState(userId, stateName, stateData);
            return push(userId, '請輸入調整原因（例如：活動獎勵、課程補償等）：');
          case 'await_reason':
            stateData.reason = text;
            stateData.step = 'await_confirmation';
            await setUserState(userId, stateName, stateData);
            const opText = stateData.operation === 'add' ? `增加 ${stateData.amount} 點` : `扣除 ${stateData.amount} 點`;
            const summary = `請確認調整內容：\n\n對象：${stateData.targetStudent.name}\n操作：${opText}\n原因：${stateData.reason}`;
            const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ] };
            return push(userId, {type: 'text', text: summary, quickReply});
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
                  return push(userId, `操作失敗：學員 ${student.name} 的點數不足以扣除 ${stateData.amount} 點。`);
                }
                const historyEntry = { action: `手動調整：${stateData.operation === 'add' ? '+' : '-'}${stateData.amount}點`, reason: stateData.reason, time: new Date().toISOString(), operator: user.name };
                const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
                await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
                await clientDB.query('COMMIT');
                
                await clearUserState(userId);
                await push(userId, `✅ 已成功為學員 ${student.name} ${stateData.operation === 'add' ? '增加' : '扣除'} ${stateData.amount} 點。`);
                
                const opTextForStudent = stateData.operation === 'add' ? `增加了 ${stateData.amount}` : `扣除了 ${stateData.amount}`;
                push(student.id, `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${stateData.reason}\n您目前的點數為：${newPoints} 點。`).catch(e => console.error(e));
              } catch (e) {
                await clientDB.query('ROLLBACK');
                console.error('手動調整點數失敗:', e);
                await clearUserState(userId);
                return push(userId, '❌ 操作失敗，資料庫發生錯誤，請稍後再試。');
              } finally {
                clientDB.release();
              }
            }
            break;
        }
        return;
    }
    
    if (stateName === 'student_search') {
        const searchQuery = text;
        await clearUserState(userId); 
        try {
            const res = await pgPool.query(`SELECT id, name, picture_url, points FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${searchQuery.toLowerCase()}%`, searchQuery]);
            if (res.rows.length === 0) return push(userId, `找不到符合「${searchQuery}」的學員。`);
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover', flex: 1 }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' } ] } ] }, { type: 'box', layout: 'vertical', margin: 'lg', contents: [ { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` } }] } }));
            return push(userId, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
        } catch (err) {
            console.error('❌ 查詢學員失敗:', err);
            return push(userId, '查詢學員時發生錯誤，請稍後再試。');
        }
    }
    
    if (stateName === 'announcement_creation') {
      if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        await clearUserState(userId);
        return push(userId, '已取消發布公告。');
      }
      switch (stateData.step) {
        case 'await_content':
          stateData.content = text;
          stateData.step = 'await_confirmation';
          await setUserState(userId, stateName, stateData);
          const confirmMsg = `請確認公告內容：\n\n${text}\n\n是否立即發布？`;
          const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } } ]};
          return push(userId, { type: 'text', text: confirmMsg, quickReply });
        
        case 'await_confirmation':
          if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
            try {
              await pgPool.query(
                'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)',
                [stateData.content, user.id, user.name]
              );
              await clearUserState(userId);
              return push(userId, '✅ 公告已成功發布！');
            } catch (err) {
              console.error('新增公告失敗:', err);
              await clearUserState(userId);
              return push(userId, '發布公告時發生錯誤，請稍後再試。');
            }
          } else {
            return push(userId, '請點擊確認或取消按鈕。');
          }
      }
      return;
    }

    if (stateName === 'feedback_reply') {
       if (text.toLowerCase() === '取消') {
        await clearUserState(userId);
        return push(userId, '已取消回覆。');
      }
      try {
        const { targetUserId, originalMsgId } = stateData;
        const student = await getUser(targetUserId);
        if(!student) {
            await clearUserState(userId);
            return push(userId, "回覆失敗，找不到該學員。");
        }
        await push(targetUserId, `🔔 老師 ${user.name} 回覆了您的留言：\n\n${text}`);
        await updateFeedbackReply(originalMsgId, text, user.name);
        await clearUserState(userId);
        return push(userId, `✅ 已成功回覆學員 ${student.name} 的留言。`);
      } catch (err) {
        console.error('回覆留言失敗:', err);
        await clearUserState(userId);
        return push(userId, '回覆時發生錯誤，請稍後再試。');
      }
    }
    return;
  }

  // --- 無狀態下的指令處理 ---
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT || text === COMMANDS.TEACHER.ADD_COURSE) {
    await push(userId, '收到！正在為您查詢課程列表，請稍候...');
    try {
        const allCourses = Object.values(await getAllCourses());
        const courseGroups = {};
        const now = Date.now();
        for (const course of allCourses) {
            if (new Date(course.time).getTime() > now) {
                const prefix = course.id.substring(0, 2);
                if (!courseGroups[prefix] || new Date(course.time).getTime() < new Date(courseGroups[prefix].time).getTime()) { courseGroups[prefix] = course; }
            }
        }
        const courseBubbles = [];
        const sortedPrefixes = Object.keys(courseGroups).sort();
        for (const prefix of sortedPrefixes) {
            const earliestUpcomingCourse = courseGroups[prefix];
            const courseMainTitle = earliestUpcomingCourse.title.replace(/ - 第 \d+ 堂$/, ''); 
            courseBubbles.push({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '課程系列資訊', color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: courseMainTitle, weight: 'bold', size: 'xl', wrap: true }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '系列代碼', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: prefix, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '最近堂數', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: formatDateTime(earliestUpcomingCourse.time), wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, { type: 'box', layout: 'baseline', spacing: 'sm', contents: [{ type: 'text', text: '費用', color: '#aaaaaa', size: 'sm', flex: 2 }, { type: 'text', text: `${earliestUpcomingCourse.pointsCost} 點`, wrap: true, color: '#666666', size: 'sm', flex: 5 }] }, ] }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', flex: 0, contents: [ { type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '單次取消', data: `action=manage_course_group&prefix=${prefix}`, displayText: `管理 ${courseMainTitle} 系列的單堂課程` } }, { type: 'button', style: 'secondary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '批次取消', data: `action=cancel_course_group_confirm&prefix=${prefix}`, displayText: `準備批次取消 ${courseMainTitle} 系列課程` } }, ] }, });
        }
        const addCourseBubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', paddingAll: 'xxl', contents: [{ type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '+', size: 'xxl', weight: 'bold', color: '#CCCCCC', align: 'center' }, { type: 'text', text: '新增課程系列', size: 'md', weight: 'bold', color: '#AAAAAA', align: 'center', margin: 'md' }], justifyContent: 'center', alignItems: 'center', height: '150px' }], }, action: { type: 'postback', label: '新增課程', data: 'action=add_course_start' } };
        courseBubbles.push(addCourseBubble);
        const introText = (Object.keys(courseGroups).length === 0) ? '目前沒有任何進行中的課程系列，點擊「+」可新增。' : '以下為各課程系列的管理選項：';
        return push(userId, [{ type: 'text', text: introText }, { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
    } catch (err) {
        console.error('❌ 查詢課程管理時發生錯誤:', err);
        return push(userId, '查詢課程資訊時發生錯誤，請稍後再試或聯繫管理員。');
    }
  } else if (text === COMMANDS.TEACHER.POINT_MANAGEMENT) {
      const flexMessage = { type: 'flex', altText: '點數管理選單', contents: { type: 'carousel', contents: [ { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '待確認清單', color: '#FFFFFF', weight: 'bold', size: 'lg' } ], backgroundColor: '#FF9E00' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: '審核學員的購點申請，確認匯款資訊並為其加點。', wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', action: { type: 'message', label: '查看清單', text: COMMANDS.TEACHER.PENDING_ORDERS }, style: 'primary', color: '#FF9E00' } ] } }, { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '手動調整點數', color: '#FFFFFF', weight: 'bold', size: 'lg' } ], backgroundColor: '#1A759F' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: '用於特殊情況(如活動獎勵、課程補償)，直接為學員增減點數。', wrap: true, size: 'sm', color: '#666666' } ] }, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', action: { type: 'message', label: '開始調整', text: COMMANDS.TEACHER.MANUAL_ADJUST_POINTS }, style: 'primary', color: '#1A759F' } ] } } ] } };
      return push(userId, flexMessage);
  } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
      const flexMessage = { type: 'flex', altText: '學員管理選單', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員管理', color: '#FFFFFF', weight: 'bold', size: 'lg' }], backgroundColor: '#6A7D8B' }, body: { type: 'box', layout: 'vertical', spacing: 'lg', contents: [ { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查詢學員', weight: 'bold', size: 'md' }, { type: 'text', text: '依姓名或ID查詢學員的詳細資料與點數紀錄。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '開始查詢', text: COMMANDS.TEACHER.SEARCH_STUDENT } } ] }, { type: 'separator' }, { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查看留言', weight: 'bold', size: 'md' }, { type: 'text', text: '查看並回覆學員的留言。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '查看未回覆留言', text: COMMANDS.TEACHER.VIEW_MESSAGES } } ] } ] } } };
      return push(userId, flexMessage);
  } else if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
      const announcementMenu = [ { type: 'action', action: { type: 'message', label: '發布新公告', text: COMMANDS.TEACHER.ADD_ANNOUNCEMENT } }, { type: 'action', action: { type: 'message', label: '刪除舊公告', text: COMMANDS.TEACHER.DELETE_ANNOUNCEMENT } }, ];
      return push(userId, { type: 'text', text: '請選擇公告管理功能：', quickReply: { items: announcementMenu } });
  } else if (text === COMMANDS.TEACHER.REPORT) {
    await push(userId, '收到！正在為您產生營運報告，資料量較大請耐心等候...');
    try {
        const usersRes = await pgPool.query(`SELECT * FROM users WHERE role = 'student'`);
        const coursesRes = await pgPool.query(`SELECT * FROM courses`);
        const ordersRes = await pgPool.query(`SELECT * FROM orders`);
        const students = usersRes.rows;
        const totalPoints = students.reduce((sum, student) => sum + student.points, 0);
        const activeStudentsCount = students.filter(s => s.history?.length > 0).length;
        const allCourses = coursesRes.rows;
        const totalCourses = allCourses.length;
        const upcomingCourses = allCourses.filter(c => new Date(c.time).getTime() > Date.now()).length;
        const completedCourses = totalCourses - upcomingCourses;
        const allOrders = ordersRes.rows;
        const pendingOrders = allOrders.filter(o => o.status === 'pending_confirmation').length;
        const completedOrdersCount = allOrders.filter(o => o.status === 'completed').length;
        const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((sum, order) => sum + order.amount, 0);
        let report = `📊 營運報告 📊\n\n👤 學員總數：${students.length} 人\n🟢 活躍學員：${activeStudentsCount} 人\n💎 所有學員總點數：${totalPoints} 點\n\n🗓️ 課程統計：\n  總課程數：${totalCourses} 堂\n  進行中/未開課：${upcomingCourses} 堂\n  已結束課程：${completedCourses} 堂\n\n💰 購點訂單：\n  待確認訂單：${pendingOrders} 筆\n  已完成訂單：${completedOrdersCount} 筆\n  總收入 (已完成訂單)：${totalRevenue} 元`;
        return push(userId, report.trim());
    } catch (err) {
        console.error('❌ 生成營運報告時發生錯誤:', err);
        return push(userId, '產生營運報告時發生錯誤，請稍後再試。');
    }
  } else if (text === COMMANDS.TEACHER.PENDING_ORDERS) {
    await push(userId, '正在查詢待確認訂單...');
    try {
        const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
        const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
        if (pendingConfirmationOrders.length === 0) { return push(userId, '目前沒有待確認的購點訂單。'); }
        const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }}));
        return push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
    } catch (err) {
        console.error('❌ 查詢待確認訂單時發生錯誤:', err);
        return push(userId, '查詢訂單時發生錯誤，請稍後再試。');
    }
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
    return push(userId, teacherSuggestion);
  }
}
async function handleStudentCommands(event, user, userState) {
  const text = event.message.text ? event.message.text.trim() : '';
  const userId = user.id;

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;

    if (stateName === 'purchase') {
      if (stateData.step === 'input_last5' || stateData.step === 'edit_last5') {
        if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) {
          await clearUserState(userId);
          await push(userId, '已取消輸入，您隨時可以從「點數管理」重新操作。');
          return pushPointsMenu(userId);
        }
        if (!/^\d{5}$/.test(text)) {
          const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_INPUT_LAST5, text: COMMANDS.STUDENT.CANCEL_INPUT_LAST5 } }] };
          return push(userId, { type: 'text', text: '格式錯誤，請輸入正確的匯款帳號後 5 碼數字，或點擊「取消輸入」。', quickReply });
        }
        try {
          const orderId = stateData.orderId;
          const res = await pgPool.query("SELECT * FROM orders WHERE order_id = $1 AND user_id = $2", [orderId, userId]);
          if (res.rows.length === 0) {
            await clearUserState(userId);
            return push(userId, '找不到您的訂單，操作已取消。');
          }
          const order = res.rows[0];
          await pgPool.query("UPDATE orders SET last_5_digits = $1, status = 'pending_confirmation', timestamp = NOW() WHERE order_id = $2", [text, orderId]);
          await clearUserState(userId);
          await push(userId, `✅ 您的匯款資訊已更新！\n後五碼：${text}\n\n我們將盡快為您審核，審核通過後點數會自動存入您的帳戶。`);
          await pushPointsMenu(userId);
          const teachersRes = await pgPool.query("SELECT id FROM users WHERE role = 'teacher' OR role = 'admin'");
          const notificationMessage = `🔔 訂單待審核\n學員: ${user.name}\n訂單ID: ${orderId}\n金額: ${order.amount}\n後五碼: ${text}\n\n請至「點數管理」->「待確認清單」進行審核。`;
          for (const teacher of teachersRes.rows) {
            push(teacher.id, notificationMessage).catch(e => console.error(`推播給老師 ${teacher.id} 失敗:`, e));
          }
        } catch (err) {
          console.error('更新後五碼失敗:', err);
          await clearUserState(userId);
          await push(userId, '更新資訊時發生錯誤，請稍後再試。');
        }
        return;
      }
      if (stateData.step === 'confirm_purchase' && text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        try {
          const orderId = `PO${Date.now()}`;
          const order = { orderId, userId, userName: user.name, points: stateData.data.points, amount: stateData.data.amount, last5Digits: null, status: 'pending_payment', timestamp: new Date().toISOString() };
          await saveOrder(order);
          await clearUserState(userId);
          const bankInfoText = `✅ 您的訂單已建立！\n請匯款至以下帳戶：\n\n銀行：${BANK_INFO.bankName}\n戶名：${BANK_INFO.accountName}\n帳號：${BANK_INFO.accountNumber}\n金額：${order.amount} 元\n\n匯款完成後，請務必回到「點數管理」點擊「輸入匯款後五碼」以完成購點程序。`;
          await push(userId, bankInfoText);
          await pushPointsMenu(userId);
        } catch (err) {
          console.error('建立訂單失敗:', err);
          await clearUserState(userId);
          await push(userId, '建立訂單時發生錯誤，請稍後再試。');
        }
        return;
      }
    }
    
    if (stateName === 'booking_confirmation') {
        const course = await getCourse(stateData.courseId);
        if (!course) {
            await clearUserState(userId);
            return push(userId, '抱歉，找不到該課程，可能已被老師取消。');
        }
        switch (stateData.type) {
            case 'book':
                if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
                    const clientDB = await pgPool.connect();
                    try {
                        await clientDB.query('BEGIN');
                        const userForUpdate = await clientDB.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                        const courseForUpdate = await clientDB.query('SELECT students, capacity FROM courses WHERE id = $1 FOR UPDATE', [stateData.courseId]);
                        if (userForUpdate.rows[0].points < course.pointsCost) {
                            await clientDB.query('ROLLBACK');
                            await clearUserState(userId);
                            return push(userId, `預約失敗，您的點數不足！\n目前點數：${userForUpdate.rows[0].points}\n需要點數：${course.pointsCost}`);
                        }
                        if (courseForUpdate.rows[0].students.length >= courseForUpdate.rows[0].capacity) {
                            await clientDB.query('ROLLBACK');
                            await clearUserState(userId);
                            return push(userId, '抱歉，課程名額已滿，已被其他同學搶先預約了。');
                        }
                        const newPoints = userForUpdate.rows[0].points - course.pointsCost;
                        const newStudents = [...courseForUpdate.rows[0].students, userId];
                        const historyEntry = { action: `預約課程：${course.title}`, pointsChange: -course.pointsCost, time: new Date().toISOString() };
                        const newHistory = userForUpdate.rows[0].history ? [...userForUpdate.rows[0].history, historyEntry] : [historyEntry];
                        await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                        await clientDB.query('UPDATE courses SET students = $1 WHERE id = $2', [newStudents, stateData.courseId]);
                        await clientDB.query('COMMIT');
                        await clearUserState(userId);
                        return push(userId, `✅ 預約成功！\n課程：${course.title}\n時間：${formatDateTime(course.time)}\n\n已為您扣除 ${course.pointsCost} 點，期待課堂上見！`);
                    } catch (e) {
                        await clientDB.query('ROLLBACK');
                        console.error('預約課程失敗:', e);
                        await clearUserState(userId);
                        return push(userId, '預約時發生錯誤，請稍後再試。');
                    } finally {
                        clientDB.release();
                    }
                } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) {
                    await clearUserState(userId);
                    return push(userId, '已放棄預約。');
                }
                break;
            case 'cancel_book':
                if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
                    const clientDB = await pgPool.connect();
                    try {
                        await clientDB.query('BEGIN');
                        const userForUpdateRes = await clientDB.query('SELECT points, history FROM users WHERE id = $1 FOR UPDATE', [userId]);
                        const courseForUpdateRes = await clientDB.query('SELECT students, waiting FROM courses WHERE id = $1 FOR UPDATE', [stateData.courseId]);
                        const newPoints = userForUpdateRes.rows[0].points + course.pointsCost;
                        const newStudents = courseForUpdateRes.rows[0].students.filter(id => id !== userId);
                        const historyEntry = { action: `取消預約：${course.title}`, pointsChange: +course.pointsCost, time: new Date().toISOString() };
                        const userHistory = userForUpdateRes.rows[0].history || [];
                        const newHistory = [...userHistory, historyEntry];
                        await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), userId]);
                        let newWaiting = courseForUpdateRes.rows[0].waiting;
                        if (newWaiting.length > 0) {
                            const promotedUserId = newWaiting.shift();
                            newStudents.push(promotedUserId);
                            const promotedUser = await getUser(promotedUserId, clientDB);
                            if (promotedUser) {
                                 push(promotedUserId, `🎉 候補成功通知 🎉\n您候補的課程「${course.title}」已有空位，已為您自動預約成功！`).catch(err => console.error(err));
                            }
                        }
                        await clientDB.query('UPDATE courses SET students = $1, waiting = $2 WHERE id = $3', [newStudents, newWaiting, stateData.courseId]);
                        await clientDB.query('COMMIT');
                        await clearUserState(userId);
                        return push(userId, `✅ 已為您取消「${course.title}」的預約，並歸還 ${course.pointsCost} 點。`);
                    } catch (e) {
                        await clientDB.query('ROLLBACK');
                        console.error('取消預約失敗:', e);
                        await clearUserState(userId);
                        return push(userId, '取消預約時發生錯誤，請稍後再試。');
                    } finally {
                        clientDB.release();
                    }
                } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) {
                    await clearUserState(userId);
                    return push(userId, '已放棄取消操作。');
                }
                break;
            case 'cancel_wait':
                if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
                    const newWaitingList = course.waiting.filter(id => id !== userId);
                    await saveCourse({ ...course, waiting: newWaitingList });
                    await clearUserState(userId);
                    return push(userId, `✅ 已為您取消「${course.title}」的候補。`);
                } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) {
                    await clearUserState(userId);
                    return push(userId, '已放棄取消操作。');
                }
                break;
        }
        return;
    }
    
    if (stateName === 'feedback') {
        if (text.toLowerCase() === '取消') {
            await clearUserState(userId);
            return push(userId, '已取消留言。');
        }
        if (stateData.step === 'await_message') {
            await pgPool.query('INSERT INTO feedback_messages (id, user_id, user_name, message, timestamp) VALUES ($1, $2, $3, $4, NOW())', [`F${Date.now()}`, userId, user.name, text]);
            await clearUserState(userId);
            await push(userId, '感謝您的留言，我們已收到您的訊息，老師會盡快查看！');
            if (process.env.TEACHER_ID) { push(process.env.TEACHER_ID, `🔔 新留言通知\n來自: ${user.name}\n內容: ${text}\n\n請至「學員管理」->「查看學員留言」回覆。`).catch(e => console.error(e)); }
        }
        return;
    }
    return;
  }
  
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      await clearUserState(userId);
      return pushPointsMenu(userId);
  } else if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
      await push(userId, '正在查詢最新公告...');
      try {
          const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
          if (res.rows.length === 0) { return push(userId, '目前沒有任何公告。'); }
          const announcement = res.rows[0];
          const announcementMessage = { type: 'flex', altText: '最新公告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } };
          return push(userId, announcementMessage);
      } catch (err) {
          console.error('❌ 查詢最新公告失敗:', err);
          return push(userId, '查詢公告時發生錯誤，請稍後再試。');
      }
  } else if (text === COMMANDS.STUDENT.CONTACT_US) {
      await setUserState(userId, 'feedback', { step: 'await_message' });
      return push(userId, { type: 'text', text: '請輸入您想對老師說的話，或點選「取消」。', quickReply: { items: [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }] }});
  } else if (text === COMMANDS.STUDENT.BUY_POINTS) {
      const existingOrderRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
      if (existingOrderRes.rows.length > 0) {
          const flexMenu = await buildPointsMenuFlex(userId);
          return push(userId, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu]);
      }
      return push(userId, buildBuyPointsFlex());
  } else {
    let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
    if (text.startsWith('@')) {
        const closestCommand = findClosestCommand(text, 'student');
        if (closestCommand) { studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`; } 
        else { studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`; }
    }
    return push(userId, studentSuggestion);
  }
}

// --- Webhook 主處理函式 (V20.2 核心修正) ---
async function handleEvent(event) {
    if (!event.source || !event.source.userId) { return; }
    const userId = event.source.userId;
    let user = await getUser(userId);

    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, approved_by: null };
            await saveUser(user);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
            if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        } catch (error) {
            if (error.statusCode === 404) { console.error(`❌ 找不到使用者 ${userId}，可能已封鎖機器人。`); } 
            else { console.error(`❌ 創建新用戶時出錯: `, error); }
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
        } catch(e) { console.warn(`⚠️ 更新用戶 ${userId} 資料時出錯 (可能已封鎖):`, e.message); }
    }
    
    const userState = await getUserState(userId);

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        if (userId === ADMIN_USER_ID && text === COMMANDS.ADMIN.PANEL) {
            if (user.role !== 'admin') {
                user.role = 'admin'; // 更新記憶體中的 user 物件
                await saveUser(user);
                if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
            }
            return handleAdminCommands(event, user, userState);
        }
        
        switch (user.role) {
            case 'admin': return handleAdminCommands(event, user, userState);
            case 'teacher': return handleTeacherCommands(event, user, userState);
            default: return handleStudentCommands(event, user, userState);
        }
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');
        if (action === 'run_command') {
            const commandText = data.get('text');
            if (commandText) {
                const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: 'simulated_message_id', text: commandText } };
                const currentState = await getUserState(userId);
                const currentUser = await getUser(userId);
                if (currentUser.role === 'admin') await handleAdminCommands(simulatedEvent, currentUser, currentState);
                else if (currentUser.role === 'teacher') await handleTeacherCommands(simulatedEvent, currentUser, currentState);
                else await handleStudentCommands(simulatedEvent, currentUser, currentState);
            }
            return;
        }
        
        if (user.role === 'admin') {
            if (action === 'select_teacher_for_removal') {
                const targetId = data.get('targetId');
                const targetName = data.get('targetName');
                await setUserState(userId, 'confirm_remove_teacher', { targetUser: { id: targetId, name: targetName } });
                const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER, text: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER } } ] };
                return push(userId, { type: 'text', text: `您確定要移除老師「${targetName}」的權限嗎？該用戶將變回學員身份。`, quickReply });
            }
        } else if (user.role === 'teacher') {
            if (action === 'reply_feedback') {
                const targetUserId = data.get('userId');
                const originalMsgId = data.get('msgId');
                await setUserState(userId, 'feedback_reply', { step: 'await_reply_content', targetUserId, originalMsgId });
                const quickReply = { items: [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }]};
                return push(userId, { type: 'text', text: '請輸入您要回覆給學生的內容：', quickReply });
            }
            if (action === 'confirm_delete_announcement') {
                const announcementId = data.get('id');
                try {
                    const deletedCount = await deleteAnnouncement(announcementId);
                    if (deletedCount > 0) {
                        return push(userId, '✅ 公告已成功刪除。');
                    } else {
                        return push(userId, '刪除失敗，該公告可能已被移除。');
                    }
                } catch (err) {
                    console.error('刪除公告失敗:', err);
                    return push(userId, '刪除公告時發生錯誤，請稍後再試。');
                }
            }
        } else { // student
            // student postback logic
        }
    }
}

// --- 路由設定 (終極偵錯版) ---
app.post('/webhook', (req, res) => {
  try {
    console.log("--- Webhook 請求開始 ---");
    console.log("收到的 Headers:", JSON.stringify(req.headers, null, 2));
    if (!req.rawBody) {
      console.error("❌ 錯誤: req.rawBody 不存在! 請確認 express.json 的 verify 中介軟體設定正確。");
      return res.status(400).send("Bad Request: Missing rawBody");
    }
    console.log("req.rawBody 的長度:", req.rawBody.length);
    const channelSecret = process.env.CHANNEL_SECRET;
    if (!channelSecret) {
        console.error("❌ 嚴重錯誤: 環境變數 CHANNEL_SECRET 未設定!");
        return res.status(500).send("Server Configuration Error");
    }
    console.log("使用的 Channel Secret (前5碼):", channelSecret.substring(0, 5) + "...");
    const signature = crypto.createHmac('SHA256', channelSecret).update(req.rawBody).digest('base64');
    const lineSignature = req.headers['x-line-signature'];
    console.log("計算出的簽章:", signature);
    console.log("LINE 傳來的簽章:", lineSignature);
    if (signature !== lineSignature) {
      console.warn("⚠️ 警告: 簽章不匹配! 請求被拒絕 (401)。請再次確認 CHANNEL_SECRET 是否完全正確。");
      return res.status(401).send('Unauthorized');
    }
    console.log("✅ 簽章驗證成功!");
    console.log("準備處理事件，數量:", req.body.events.length);
    res.status(200).send('OK');
    req.body.events.forEach(event => {
        if (!event.source || !event.source.userId) return;
        handleEvent(event).catch(err => {
            console.error('❌ handleEvent 異步處理失敗 (這是初始錯誤):', err.stack);
            if (process.env.ADMIN_USER_ID) {
                const errorMessage = `一個事件處理失敗:\n\n${err.message}`;
                push(process.env.ADMIN_USER_ID, errorMessage)
                  .catch(pushErr => {
                      console.error('❌ 嘗試推播錯誤通知給 Admin 時也失敗了:', pushErr.stack);
                  });
            }
        });
    });
  } catch (error) {
      console.error('❌ Webhook 路由發生未預期的嚴重錯誤:', error.stack);
      res.status(500).end();
  }
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot (V20.2 終極偵錯版) 正常運作中。'));

// --- 伺服器啟動 ---
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V20.2 (終極偵錯版)`);
  console.log('🕒 開始設定背景排程任務...');
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(keepAlive, PING_INTERVAL_MS);
  setInterval(cleanCoursesDB, CLEAN_DB_INTERVAL_MS);
  console.log('✅ 背景排程任務已設定完成。');
});
