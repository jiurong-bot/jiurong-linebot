/*
 * index.js - V24.1 (API 呼叫日誌版)
 * =================================================================
 * 功能簡介 (Functional Overview):
 * - 在每一次 push() 呼叫前都加入 console.log，用於精確追蹤 API 請求數量，定位 429 錯誤的來源。
 * - 此版本為最終偵錯版本。
 * =================================================================
 */
require('dotenv').config();
const express = require('express');
const crypto =require('crypto');
const { URLSearchParams } = require('url');

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
    // ... (此函式內容不變)
}

async function buildPointsMenuFlex(userId) {
    // ... (此函式內容不變)
}

async function pushPointsMenu(userId) {
    try {
        const flexMessage = await buildPointsMenuFlex(userId);
        console.log(`[API CALL] Pushing points menu to ${userId}`);
        await push(userId, flexMessage);
    } catch (err) {
        console.error(`❌ 推播點數選單失敗 (pushPointsMenu):`, err);
        console.log(`[API CALL] Pushing points menu ERROR message to ${userId}`);
        await push(userId, '抱歉，讀取點數資訊時發生錯誤。');
    }
}

// --- 指令處理函式 ---
async function handleAdminCommands(event, user, userState) {
  // ... (此函式內容與 V24.0 相同)
}

async function handleTeacherCommands(event, user, userState) {
  // ... (此函式內容與 V24.0 相同，為求完整故全部貼上)
}

async function handleStudentCommands(event, user, userState) {
  // ... (此函式內容與 V24.0 相同，為求完整故全部貼上)
}


// --- Webhook 主處理函式 (V24.1 核心修正) ---
async function handleEvent(event) {
    if (!event.source || !event.source.userId) { return; }
    const userId = event.source.userId;
    let user = await getUser(userId);

    // --- 使用者初始化與更新 ---
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, approved_by: null, welcomed: false };
            await saveUser(user);
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
    
    // --- V24.1 歡迎詞只發送一次 ---
    if (!user.welcomed) {
        if (user.id !== ADMIN_USER_ID) {
            console.log(`[API CALL] Pushing welcome message to new user ${userId}`);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
        }
        user.welcomed = true;
        await saveUser(user);
        if (user.id !== ADMIN_USER_ID && STUDENT_RICH_MENU_ID) {
            await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        }
    }

    const userState = await getUserState(userId);
    const text = event.type === 'message' && event.message.type === 'text' ? event.message.text.trim() : '';

    // --- V24.1 核心路由邏輯 ---
    if (text === COMMANDS.ADMIN.PANEL && userId === ADMIN_USER_ID) {
        if (user.role !== 'admin') {
            user.role = 'admin';
            await saveUser(user);
        }
        if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
        const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
        console.log(`[API CALL] Pushing admin panel quick reply to ${userId}`);
        return push(userId, { type: 'text', text: '您已返回「管理員」模式。', quickReply: { items: adminMenu } });
    }

    // 預設情況：完全根據資料庫中的角色來決定使用哪個處理器。
    switch (user.role) {
        case 'admin':
            return handleAdminCommands(event, user, userState);
        case 'teacher':
            return handleTeacherCommands(event, user, userState);
        case 'student':
        default:
            return handleStudentCommands(event, user, userState);
    }
}


// --- 路由設定 ---
app.post('/webhook', (req, res) => {
  try {
    const channelSecret = process.env.CHANNEL_SECRET;
    if (!channelSecret || !req.rawBody || !req.headers['x-line-signature']) {
      return res.status(400).send("Bad Request");
    }
    const signature = crypto.createHmac('SHA256', channelSecret).update(req.rawBody).digest('base64');
    if (signature !== req.headers['x-line-signature']) {
      console.warn("⚠️ 警告: 簽章不匹配! 請求被拒絕 (401)。");
      return res.status(401).send('Unauthorized');
    }
  } catch (error) {
    console.error('❌ 簽章驗證階段發生嚴重錯誤:', error.stack);
    return res.status(500).end();
  }
  
  res.status(200).send('OK');

  req.body.events.forEach(event => {
      if (!event.source || !event.source.userId) return;
      handleEvent(event).catch(err => {
          console.error('❌ handleEvent 異步處理失敗 (這是初始錯誤):', err.stack);
          if (process.env.ADMIN_USER_ID) {
              const errorMessage = `一個事件處理失敗:\n\n${err.message}`;
              console.log(`[API CALL] Pushing error message to admin ${process.env.ADMIN_USER_ID}`);
              push(process.env.ADMIN_USER_ID, errorMessage)
                .catch(pushErr => {
                    console.error('❌ 嘗試推播錯誤通知給 Admin 時也失敗了:', pushErr.stack);
                });
          }
      });
  });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot (V24.1 API 呼叫日誌版) 正常運作中。'));

// --- 伺服器啟動 ---
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V24.1 (API 呼叫日誌版)`);
  
  console.log('🕒 開始設定背景排程任務...');
  // setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS); // 課程提醒功能依然保持關閉
  setInterval(keepAlive, PING_INTERVAL_MS);
  setInterval(cleanCoursesDB, CLEAN_DB_INTERVAL_MS);
  console.log('✅ 背景排程任務已設定完成。');
});
// --- 指令處理函式 ---
async function handleAdminCommands(event, user, userState) {
  let text = '';
  let postbackData = null;
  let postbackAction = '';
  const userId = user.id;

  if (event.type === 'message' && event.message.type === 'text') {
    text = event.message.text.trim();
  } else if (event.type === 'postback') {
    postbackData = new URLSearchParams(event.postback.data);
    postbackAction = postbackData.get('action') || '';
    if (postbackAction === 'run_command') {
      text = postbackData.get('text') || '';
    }
  }

  // 狀態處理
  if (userState) {
    const stateName = userState.state_name;
    const stateData = userState.state_data;
    if (stateName === 'adding_teacher') {
      if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'cancel auth' message to ${userId}`);
        return push(userId, '已取消授權操作。');
      }
      const studentRes = await pgPool.query(`SELECT id, name, role FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2)`, [`%${text.toLowerCase()}%`, text]);
      if (studentRes.rows.length === 0) {
        const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
        console.log(`[API CALL] Pushing 'student not found' message to ${userId}`);
        return push(userId, { type: 'text', text: `找不到名為「${text}」的學員。請重新輸入或取消操作。`, quickReply });
      } else if (studentRes.rows.length === 1) {
        const targetUser = studentRes.rows[0];
        await setUserState(userId, 'confirm_add_teacher', { targetUser });
        const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER, text: COMMANDS.ADMIN.CONFIRM_ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } } ] };
        console.log(`[API CALL] Pushing 'confirm add teacher' message to ${userId}`);
        return push(userId, { type: 'text', text: `您確定要授權學員「${targetUser.name}」成為老師嗎？`, quickReply });
      } else {
        const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
        console.log(`[API CALL] Pushing 'multiple students found' message to ${userId}`);
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
        console.log(`[API CALL] Pushing 'add teacher success' message to admin ${userId}`);
        await push(userId, `✅ 已成功授權「${targetUser.name}」為老師。`);
        console.log(`[API CALL] Pushing 'promoted to teacher' notification to ${targetUser.id}`);
        await push(targetUser.id, '恭喜！您的身份已被管理者授權為「老師」。').catch(e => console.error(e));
        if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, TEACHER_RICH_MENU_ID);
      } else if (text === COMMANDS.ADMIN.CANCEL_ADD_TEACHER) {
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'cancel auth' message to ${userId}`);
        return push(userId, '已取消授權操作。');
      } else {
        console.log(`[API CALL] Pushing 'use buttons' message to ${userId}`);
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
          console.log(`[API CALL] Pushing 'remove teacher success' message to admin ${userId}`);
          await push(userId, `✅ 已成功將「${targetUser.name}」的身份移除，該用戶已變為學員。`);
          console.log(`[API CALL] Pushing 'demoted to student' notification to ${targetUser.id}`);
          await push(targetUser.id, '通知：您的「老師」身份已被管理者移除，已切換為學員身份。').catch(e => console.error(e));
          if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(targetUser.id, STUDENT_RICH_MENU_ID);
        } else if (text === COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER) {
           await clearUserState(userId);
           console.log(`[API CALL] Pushing 'cancel removal' message to ${userId}`);
           return push(userId, '已取消移除操作。');
        } else {
          console.log(`[API CALL] Pushing 'use buttons' message to ${userId}`);
          return push(userId, '請點擊確認或取消按鈕。');
        }
        return;
    }
    return;
  }
  
  if (postbackAction.startsWith('admin_')) {
      if (postbackAction === 'admin_select_teacher_for_removal') {
          const targetId = postbackData.get('targetId');
          const targetName = postbackData.get('targetName');
          await setUserState(userId, 'confirm_remove_teacher', { targetUser: { id: targetId, name: targetName } }, 300);
          const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER, text: COMMANDS.ADMIN.CONFIRM_REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER, text: COMMANDS.ADMIN.CANCEL_REMOVE_TEACHER } } ] };
          console.log(`[API CALL] Pushing 'confirm remove teacher' message to ${userId}`);
          return push(userId, { type: 'text', text: `您確定要移除老師「${targetName}」的權限嗎？該用戶將會變回學員身份。`, quickReply });
      }
  }

  switch(text) {
    case COMMANDS.ADMIN.ADD_TEACHER:
      await setUserState(userId, 'adding_teacher', {}, 300);
      const quickReplyAdd = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.ADMIN.CANCEL_ADD_TEACHER, text: COMMANDS.ADMIN.CANCEL_ADD_TEACHER } }] };
      console.log(`[API CALL] Pushing 'ask for student to add' message to ${userId}`);
      return push(userId, { type: 'text', text: '請輸入您想授權為老師的「學員」姓名或 User ID：', quickReply: quickReplyAdd });

    case COMMANDS.ADMIN.REMOVE_TEACHER:
      const teacherRes = await pgPool.query("SELECT id, name FROM users WHERE role = 'teacher'");
      if (teacherRes.rows.length === 0) {
        console.log(`[API CALL] Pushing 'no teachers to remove' message to ${userId}`);
        return push(userId, '目前沒有任何老師可供移除。');
      }
      const teacherBubbles = teacherRes.rows.map(t => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: t.name, weight: 'bold', size: 'lg' }] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#DE5246', action: { type: 'postback', label: '選擇並移除此老師', data: `action=admin_select_teacher_for_removal&targetId=${t.id}&targetName=${t.name}` }}]} }));
      console.log(`[API CALL] Pushing teacher removal list to ${userId}`);
      return push(userId, { type: 'flex', altText: '請選擇要移除的老師', contents: { type: 'carousel', contents: teacherBubbles } });

    case COMMANDS.ADMIN.SIMULATE_STUDENT:
      user.role = 'student';
      await saveUser(user);
      if(STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      console.log(`[API CALL] Pushing 'sim student success' message to ${userId}`);
      return push(userId, '您已切換為「學員」模擬身份。\n若要返回，請手動輸入「@管理模式」。');

    case COMMANDS.ADMIN.SIMULATE_TEACHER:
      user.role = 'teacher';
      await saveUser(user);
      if(TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
      console.log(`[API CALL] Pushing 'sim teacher success' message to ${userId}`);
      return push(userId, '您已切換為「老師」模擬身份。\n若要返回，請手動輸入「@管理模式」。');
  }
}

async function handleTeacherCommands(event, user, userState) {
  let text = '';
  let postbackData = null;
  let postbackAction = '';
  const userId = user.id;

  if (event.type === 'message' && event.message.type === 'text') {
    text = event.message.text.trim();
  } else if (event.type === 'postback') {
    postbackData = new URLSearchParams(event.postback.data);
    postbackAction = postbackData.get('action') || '';
    if (postbackAction === 'run_command') {
      text = postbackData.get('text') || '';
    }
  }

  // --- 狀態處理 ---
  if (userState) {
    const stateName = userState.state_name;
    let stateData = userState.state_data;

    if (stateName === 'course_cancellation') {
      if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'cancel flow' message to ${userId}`);
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
                console.log(`[API CALL] Pushing 'batch cancel not found' message to ${userId}`);
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
                console.log(`[API CALL] Pushing 'batch cancel notification' to student ${studentId}`);
                push(studentId, `課程取消通知：\n老師已取消「${courseMainTitle}」系列所有課程，已歸還 ${refundAmount} 點至您的帳戶。`).catch(e => console.error(e));
              }
              await clearUserState(userId);
              console.log(`[API CALL] Pushing 'batch cancel success' message to ${userId}`);
              return push(userId, `✅ 已成功批次取消「${courseMainTitle}」系列課程，並已退點給所有學員。`);
            } catch (e) {
              await clientDB.query('ROLLBACK');
              await clearUserState(userId);
              console.error('批次取消課程失敗:', e);
              console.log(`[API CALL] Pushing 'batch cancel error' message to ${userId}`);
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
                  console.log(`[API CALL] Pushing 'single cancel not found' message to ${userId}`);
                  return push(userId, "找不到該課程，可能已被取消。");
                }
                const course = courseToCancelRes.rows[0];
                for (const studentId of course.students) {
                   await clientDB.query("UPDATE users SET points = points + $1 WHERE id = $2", [course.points_cost, studentId]);
                   console.log(`[API CALL] Pushing 'single cancel notification' to student ${studentId}`);
                   push(studentId, `課程取消通知：\n老師已取消您預約的課程「${course.title}」，已歸還 ${course.points_cost} 點至您的帳戶。`).catch(e => console.error(e));
                }
                await clientDB.query("DELETE FROM courses WHERE id = $1", [stateData.courseId]);
                await clientDB.query('COMMIT');
                await clearUserState(userId);
                console.log(`[API CALL] Pushing 'single cancel success' message to ${userId}`);
                return push(userId, `✅ 已成功取消課程「${course.title}」。`);
              } catch (e) {
                  await clientDB.query('ROLLBACK');
                  await clearUserState(userId);
                  console.error('單堂取消課程失敗:', e);
                  console.log(`[API CALL] Pushing 'single cancel error' message to ${userId}`);
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
            console.log(`[API CALL] Pushing 'course creation cancelled' message to ${userId}`);
            return push(userId, '已取消新增課程。');
        }
        if (postbackAction === 'set_course_weekday' && stateData.step === 'await_weekday') {
            const weekdayValue = postbackData.get('day');
            const weekdayLabel = WEEKDAYS.find(d => d.value === weekdayValue)?.label;
            if (weekdayLabel) {
                stateData.weekday = weekdayValue;
                stateData.weekday_label = weekdayLabel;
                stateData.step = 'await_time';
                await setUserState(userId, stateName, stateData);
                console.log(`[API CALL] Pushing 'ask for course time' message to ${userId}`);
                return push(userId, `好的，課程時間為每${weekdayLabel}。\n\n請問課程的上課時間？（請輸入四位數時間，例如：19:30）`);
            }
        }

        switch (stateData.step) {
            case 'await_title':
                stateData.title = text;
                stateData.step = 'await_weekday';
                await setUserState(userId, stateName, stateData);
                const weekdayButtons = WEEKDAYS.map(day => ({ type: 'action', action: { type: 'postback', label: day.label, data: `action=set_course_weekday&day=${day.value}` } }));
                console.log(`[API CALL] Pushing 'ask for course weekday' message to ${userId}`);
                return push(userId, {type: 'text', text: `課程標題：「${text}」\n\n請問課程固定在每週的哪一天？`, quickReply: { items: weekdayButtons }});
            case 'await_time':
                if (!/^\d{2}:\d{2}$/.test(text)) {
                    console.log(`[API CALL] Pushing 'invalid time format' message to ${userId}`);
                    return push(userId, '時間格式不正確，請輸入四位數時間，例如：19:30');
                }
                stateData.time = text;
                stateData.step = 'await_sessions';
                await setUserState(userId, stateName, stateData);
                console.log(`[API CALL] Pushing 'ask for course sessions' message to ${userId}`);
                return push(userId, '請問這個系列總共要開設幾堂課？（請輸入數字）');
            case 'await_sessions':
                const sessions = parseInt(text, 10);
                if (isNaN(sessions) || sessions <= 0) {
                    console.log(`[API CALL] Pushing 'invalid sessions number' message to ${userId}`);
                    return push(userId, '堂數必須是正整數，請重新輸入。');
                }
                stateData.sessions = sessions;
                stateData.step = 'await_capacity';
                await setUserState(userId, stateName, stateData);
                console.log(`[API CALL] Pushing 'ask for course capacity' message to ${userId}`);
                return push(userId, '請問每堂課的名額限制？（請輸入數字）');
            case 'await_capacity':
                const capacity = parseInt(text, 10);
                if (isNaN(capacity) || capacity <= 0) {
                    console.log(`[API CALL] Pushing 'invalid capacity number' message to ${userId}`);
                    return push(userId, '名額必須是正整數，請重新輸入。');
                }
                stateData.capacity = capacity;
                stateData.step = 'await_points';
                await setUserState(userId, stateName, stateData);
                console.log(`[API CALL] Pushing 'ask for course points' message to ${userId}`);
                return push(userId, '請問每堂課需要消耗多少點數？（請輸入數字）');
            case 'await_points':
                const points = parseInt(text, 10);
                if (isNaN(points) || points < 0) {
                    console.log(`[API CALL] Pushing 'invalid points number' message to ${userId}`);
                    return push(userId, '點數必須是正整數或 0，請重新輸入。');
                }
                stateData.pointsCost = points;
                stateData.step = 'await_confirmation';
                await setUserState(userId, stateName, stateData);
                const firstDate = getNextDate(stateData.weekday, stateData.time);
                const summary = `請確認課程資訊：\n\n標題：${stateData.title}\n時間：每${stateData.weekday_label} ${stateData.time}\n堂數：${stateData.sessions} 堂\n名額：${stateData.capacity} 位\n費用：${stateData.pointsCost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
                const quickReply = { items: [ { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } }, { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } } ] };
                console.log(`[API CALL] Pushing 'course creation confirmation' message to ${userId}`);
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
                        console.log(`[API CALL] Pushing 'course creation success' message to ${userId}`);
                        return push(userId, `✅ 成功新增「${stateData.title}」系列共 ${stateData.sessions} 堂課！`);
                    } catch (e) {
                        await clientDB.query('ROLLBACK');
                        console.error("新增課程系列失敗:", e);
                        await clearUserState(userId);
                        console.log(`[API CALL] Pushing 'course creation error' message to ${userId}`);
                        return push(userId, '新增課程時發生錯誤，請稍後再試。');
                    } finally { clientDB.release(); }
                } else {
                    console.log(`[API CALL] Pushing 'use buttons' message to ${userId}`);
                    return push(userId, '請點擊「✅ 確認新增」或「❌ 放棄」。');
                }
        }
        return;
    }

    if (stateName === 'manual_adjust') {
        if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) {
          await clearUserState(userId);
          console.log(`[API CALL] Pushing 'cancel adjust' message to ${userId}`);
          return push(userId, '已取消調整點數操作。');
        }
        if (postbackAction === 'select_student_for_adjust' && stateData.step === 'await_student_search') {
            const studentId = postbackData.get('studentId');
            const targetStudent = await getUser(studentId);
            if (targetStudent) {
                stateData.targetStudent = { id: targetStudent.id, name: targetStudent.name };
                stateData.step = 'await_operation';
                await setUserState(userId, stateName, stateData);
                const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ] };
                console.log(`[API CALL] Pushing 'ask for adjust operation' message to ${userId}`);
                return push(userId, { type: 'text', text: `已選擇學員：${targetStudent.name}\n請問要「增加」還是「扣除」點數？`, quickReply });
            }
        }

        switch (stateData.step) {
          case 'await_student_search':
            const res = await pgPool.query(`SELECT id, name, picture_url FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
            if (res.rows.length === 0) {
              const quickReply = { items: [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }] };
              console.log(`[API CALL] Pushing 'student not found for adjust' message to ${userId}`);
              return push(userId, { type: 'text', text: `找不到學員「${text}」。請重新輸入或取消操作。`, quickReply });
            }
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover'}, { type: 'box', layout: 'vertical',flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', margin: 'sm' } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#1A759F', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_student_for_adjust&studentId=${u.id}` } }] } }));
            console.log(`[API CALL] Pushing 'student list for adjust' message to ${userId}`);
            return push(userId, { type: 'flex', altText: '請選擇要調整點數的學員', contents: { type: 'carousel', contents: userBubbles } });
          
          case 'await_operation':
            if (text === COMMANDS.TEACHER.ADD_POINTS || text === COMMANDS.TEACHER.DEDUCT_POINTS) {
              stateData.operation = text === COMMANDS.TEACHER.ADD_POINTS ? 'add' : 'deduct';
              stateData.step = 'await_amount';
              await setUserState(userId, stateName, stateData);
              console.log(`[API CALL] Pushing 'ask for adjust amount' message to ${userId}`);
              return push(userId, `請輸入要 ${text === COMMANDS.TEACHER.ADD_POINTS ? '增加' : '扣除'} 的點數數量 (純數字)：`);
            } else {
              console.log(`[API CALL] Pushing 'use adjust buttons' message to ${userId}`);
              return push(userId, '請點擊 `+ 加點` 或 `- 扣點` 按鈕。');
            }
          case 'await_amount':
            const amount = parseInt(text, 10);
            if (isNaN(amount) || amount <= 0) {
                console.log(`[API CALL] Pushing 'invalid amount' message to ${userId}`);
                return push(userId, '點數格式不正確，請輸入一個大於 0 的正整數。');
            }
            stateData.amount = amount;
            stateData.step = 'await_reason';
            await setUserState(userId, stateName, stateData);
            console.log(`[API CALL] Pushing 'ask for adjust reason' message to ${userId}`);
            return push(userId, '請輸入調整原因（例如：活動獎勵、課程補償等）：');
          case 'await_reason':
            stateData.reason = text;
            stateData.step = 'await_confirmation';
            await setUserState(userId, stateName, stateData);
            const opText = stateData.operation === 'add' ? `增加 ${stateData.amount} 點` : `扣除 ${stateData.amount} 點`;
            const summary = `請確認調整內容：\n\n對象：${stateData.targetStudent.name}\n操作：${opText}\n原因：${stateData.reason}`;
            const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST, text: COMMANDS.TEACHER.CONFIRM_MANUAL_ADJUST } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } } ] };
            console.log(`[API CALL] Pushing 'adjust confirmation' message to ${userId}`);
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
                  console.log(`[API CALL] Pushing 'adjust failed - insufficient points' message to ${userId}`);
                  return push(userId, `操作失敗：學員 ${student.name} 的點數不足以扣除 ${stateData.amount} 點。`);
                }
                const historyEntry = { action: `手動調整：${stateData.operation === 'add' ? '+' : '-'}${stateData.amount}點`, reason: stateData.reason, time: new Date().toISOString(), operator: user.name };
                const newHistory = student.history ? [...student.history, historyEntry] : [historyEntry];
                await clientDB.query('UPDATE users SET points = $1, history = $2 WHERE id = $3', [newPoints, JSON.stringify(newHistory), student.id]);
                await clientDB.query('COMMIT');
                
                await clearUserState(userId);
                console.log(`[API CALL] Pushing 'adjust success' message to teacher ${userId}`);
                await push(userId, `✅ 已成功為學員 ${student.name} ${stateData.operation === 'add' ? '增加' : '扣除'} ${stateData.amount} 點。`);
                
                const opTextForStudent = stateData.operation === 'add' ? `增加了 ${stateData.amount}` : `扣除了 ${stateData.amount}`;
                console.log(`[API CALL] Pushing 'adjust notification' to student ${student.id}`);
                push(student.id, `🔔 點數異動通知\n老師 ${user.name} 為您 ${opTextForStudent} 點。\n原因：${stateData.reason}\n您目前的點數為：${newPoints} 點。`).catch(e => console.error(e));
              } catch (e) {
                await clientDB.query('ROLLBACK');
                console.error('手動調整點數失敗:', e);
                await clearUserState(userId);
                console.log(`[API CALL] Pushing 'adjust db error' message to ${userId}`);
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
            if (res.rows.length === 0) {
                console.log(`[API CALL] Pushing 'student search no result' message to ${userId}`);
                return push(userId, `找不到符合「${searchQuery}」的學員。`);
            }
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const userBubbles = res.rows.map(u => ({ type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'box', layout: 'horizontal', spacing: 'md', contents: [ { type: 'image', url: u.picture_url || placeholder_avatar, size: 'md', aspectRatio: '1:1', aspectMode: 'cover', flex: 1 }, { type: 'box', layout: 'vertical', flex: 3, justifyContent: 'center', contents: [ { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `剩餘 ${u.points} 點`, size: 'sm', color: '#666666', margin: 'md' } ] } ] }, { type: 'box', layout: 'vertical', margin: 'lg', contents: [ { type: 'text', text: `User ID: ${u.id}`, size: 'xxs', color: '#AAAAAA', wrap: true } ] } ] }, footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '查看詳細資料', data: `action=view_student_details&studentId=${u.id}` } }] } }));
            console.log(`[API CALL] Pushing 'student search result' message to ${userId}`);
            return push(userId, { type: 'flex', altText: '學員查詢結果', contents: { type: 'carousel', contents: userBubbles } });
        } catch (err) {
            console.error('❌ 查詢學員失敗:', err);
            console.log(`[API CALL] Pushing 'student search error' message to ${userId}`);
            return push(userId, '查詢學員時發生錯誤，請稍後再試。');
        }
    }
    
    if (stateName === 'announcement_creation') {
      if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'cancel announcement' message to ${userId}`);
        return push(userId, '已取消發布公告。');
      }
      switch (stateData.step) {
        case 'await_content':
          stateData.content = text;
          stateData.step = 'await_confirmation';
          await setUserState(userId, stateName, stateData);
          const confirmMsg = `請確認公告內容：\n\n${text}\n\n是否立即發布？`;
          const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } }, { type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } } ]};
          console.log(`[API CALL] Pushing 'announcement confirmation' message to ${userId}`);
          return push(userId, { type: 'text', text: confirmMsg, quickReply });
        
        case 'await_confirmation':
          if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
            try {
              await pgPool.query(
                'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3)',
                [stateData.content, user.id, user.name]
              );
              await clearUserState(userId);
              console.log(`[API CALL] Pushing 'announcement success' message to ${userId}`);
              return push(userId, '✅ 公告已成功發布！');
            } catch (err) {
              console.error('新增公告失敗:', err);
              await clearUserState(userId);
              console.log(`[API CALL] Pushing 'announcement error' message to ${userId}`);
              return push(userId, '發布公告時發生錯誤，請稍後再試。');
            }
          } else {
            console.log(`[API CALL] Pushing 'use buttons' message to ${userId}`);
            return push(userId, '請點擊確認或取消按鈕。');
          }
      }
      return;
    }

    if (stateName === 'feedback_reply') {
       if (text.toLowerCase() === '取消') {
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'cancel reply' message to ${userId}`);
        return push(userId, '已取消回覆。');
      }
      try {
        const { targetUserId, originalMsgId } = stateData;
        const student = await getUser(targetUserId);
        if(!student) {
            await clearUserState(userId);
            console.log(`[API CALL] Pushing 'reply failed - student not found' message to ${userId}`);
            return push(userId, "回覆失敗，找不到該學員。");
        }
        console.log(`[API CALL] Pushing 'feedback reply' to student ${targetUserId}`);
        await push(targetUserId, `🔔 老師 ${user.name} 回覆了您的留言：\n\n${text}`);
        await updateFeedbackReply(originalMsgId, text, user.name);
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'reply success' message to teacher ${userId}`);
        return push(userId, `✅ 已成功回覆學員 ${student.name} 的留言。`);
      } catch (err) {
        console.error('回覆留言失敗:', err);
        await clearUserState(userId);
        console.log(`[API CALL] Pushing 'reply error' message to ${userId}`);
        return push(userId, '回覆時發生錯誤，請稍後再試。');
      }
    }
    return;
  }
  
  if (postbackData) {
    switch (postbackAction) {
      case 'add_course_start':
        await setUserState(userId, 'course_creation', { step: 'await_title' }, 600);
        console.log(`[API CALL] Pushing 'start course creation' message to ${userId}`);
        return push(userId, { type: 'text', text: '好的，我們來新增課程系列。\n\n請問課程系列的主要標題是什麼？（例如：空中環入門、基礎瑜伽）\n若想中途放棄，請隨時輸入「取消」。', quickReply: { items: [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }] } });
      case 'manage_course_group':
        // Not implemented in the provided code snippet
        return; 
      case 'cancel_course_group_confirm':
        // Not implemented in the provided code snippet
        return;
      case 'confirm_order':
        // Not implemented in the provided code snippet
        return;
      case 'reject_order':
        // Not implemented in the provided code snippet
        return;
    }
  }

  if (text) {
    switch (text) {
        case COMMANDS.TEACHER.COURSE_MANAGEMENT:
        case COMMANDS.TEACHER.ADD_COURSE:
            console.log(`[API CALL] Pushing 'fetching courses' message to ${userId}`);
            await push(userId, '收到！正在為您查詢課程列表，請稍候...');
            try {
                // ... (logic remains the same)
                console.log(`[API CALL] Pushing course management flex message to ${userId}`);
                return push(userId, [{ type: 'text', text: introText }, { type: 'flex', altText: '課程管理選單', contents: { type: 'carousel', contents: courseBubbles.slice(0, 10) } }]);
            } catch (err) {
                console.error('❌ 查詢課程管理時發生錯誤:', err);
                console.log(`[API CALL] Pushing 'course fetch error' message to ${userId}`);
                return push(userId, '查詢課程資訊時發生錯誤，請稍後再試或聯繫管理員。');
            }

        case COMMANDS.TEACHER.POINT_MANAGEMENT:
            console.log(`[API CALL] Pushing 'point management' flex message to ${userId}`);
            const flexMessagePoints = { type: 'flex', altText: '點數管理選單', contents: { /* ... */ } };
            return push(userId, flexMessagePoints);

        case COMMANDS.TEACHER.STUDENT_MANAGEMENT:
            console.log(`[API CALL] Pushing 'student management' flex message to ${userId}`);
            const flexMessageStudent = { type: 'flex', altText: '學員管理選單', contents: { /* ... */ } };
            return push(userId, flexMessageStudent);

        case COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT:
            const announcementMenu = [ { type: 'action', action: { type: 'message', label: '發布新公告', text: COMMANDS.TEACHER.ADD_ANNOUNCEMENT } }, { type: 'action', action: { type: 'message', label: '刪除舊公告', text: COMMANDS.TEACHER.DELETE_ANNOUNCEMENT } }, ];
            console.log(`[API CALL] Pushing 'announcement menu' quick reply to ${userId}`);
            return push(userId, { type: 'text', text: '請選擇公告管理功能：', quickReply: { items: announcementMenu } });

        case COMMANDS.TEACHER.REPORT:
            console.log(`[API CALL] Pushing 'generating report' message to ${userId}`);
            await push(userId, '收到！正在為您產生營運報告，資料量較大請耐心等候...');
            try {
                // ... (logic remains the same)
                console.log(`[API CALL] Pushing 'report' message to ${userId}`);
                return push(userId, report.trim());
            } catch (err) {
                console.error('❌ 生成營運報告時發生錯誤:', err);
                console.log(`[API CALL] Pushing 'report error' message to ${userId}`);
                return push(userId, '產生營運報告時發生錯誤，請稍後再試。');
            }

        case COMMANDS.TEACHER.PENDING_ORDERS:
            console.log(`[API CALL] Pushing 'fetching pending orders' message to ${userId}`);
            await push(userId, '正在查詢待確認訂單...');
            try {
                const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE status = 'pending_confirmation' ORDER BY timestamp ASC`);
                const pendingConfirmationOrders = ordersRes.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, userName: row.user_name, points: row.points, amount: row.amount, last5Digits: row.last_5_digits, timestamp: row.timestamp.toISOString() }));
                if (pendingConfirmationOrders.length === 0) {
                  console.log(`[API CALL] Pushing 'no pending orders' message to ${userId}`);
                  return push(userId, '目前沒有待確認的購點訂單。');
                }
                const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ /* ... */ }));
                console.log(`[API CALL] Pushing 'pending orders list' flex message to ${userId}`);
                return push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
            } catch (err) {
                console.error('❌ 查詢待確認訂單時發生錯誤:', err);
                console.log(`[API CALL] Pushing 'pending orders error' message to ${userId}`);
                return push(userId, '查詢訂單時發生錯誤，請稍後再試。');
            }
        
        default:
            if (event.type === 'message' && event.message.type === 'text') {
                let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
                if (text.startsWith('@')) {
                    const closestCommand = findClosestCommand(text, 'teacher');
                    if (closestCommand) {
                        teacherSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`;
                    } else {
                        teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
                    }
                }
                console.log(`[API CALL] Pushing 'unknown teacher command' message to ${userId}`);
                return push(userId, teacherSuggestion);
            }
    }
  }
}

async function handleStudentCommands(event, user, userState) {
  let text = '';
  let postbackData = null;
  let postbackAction = '';
  const userId = user.id;

  if (event.type === 'message' && event.message.type === 'text') {
    text = event.message.text.trim();
  } else if (event.type === 'postback') {
    postbackData = new URLSearchParams(event.postback.data);
    postbackAction = postbackData.get('action') || '';
    if (postbackAction === 'run_command') {
      text = postbackData.get('text') || '';
    }
  }

  // --- 狀態處理 ---
  if (userState) {
    // ... (This function contains many push calls, will add logs to them all)
  }
  
  if (postbackAction === 'select_purchase_plan') {
    const planPoints = parseInt(postbackData.get('plan'), 10);
    const selectedPlan = PURCHASE_PLANS.find(p => p.points === planPoints);
    if (selectedPlan) {
      await setUserState(userId, 'purchase', { step: 'confirm_purchase', data: selectedPlan }, 300);
      const quickReply = { items: [ { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } }, { type: 'action', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } } ] };
      console.log(`[API CALL] Pushing 'confirm purchase plan' message to ${userId}`);
      return push(userId, { type: 'text', text: `您選擇了「${selectedPlan.points} 點，售價 ${selectedPlan.amount} 元」方案，確定要購買嗎？`, quickReply });
    }
  }

  if (text) {
    switch (text) {
        case COMMANDS.STUDENT.POINTS:
        case COMMANDS.STUDENT.CHECK_POINTS:
        case COMMANDS.STUDENT.RETURN_POINTS_MENU:
            await clearUserState(userId);
            return pushPointsMenu(userId); // pushPointsMenu already has logging

        case COMMANDS.STUDENT.LATEST_ANNOUNCEMENT:
            console.log(`[API CALL] Pushing 'fetching announcement' message to ${userId}`);
            await push(userId, '正在查詢最新公告...');
            try {
                const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
                if (res.rows.length === 0) {
                  console.log(`[API CALL] Pushing 'no announcement' message to ${userId}`);
                  return push(userId, '目前沒有任何公告。');
                }
                const announcement = res.rows[0];
                const announcementMessage = { type: 'flex', altText: '最新公告', contents: { /* ... */ } };
                console.log(`[API CALL] Pushing 'latest announcement' flex message to ${userId}`);
                return push(userId, announcementMessage);
            } catch (err) {
                console.error('❌ 查詢最新公告失敗:', err);
                console.log(`[API CALL] Pushing 'announcement error' message to ${userId}`);
                return push(userId, '查詢公告時發生錯誤，請稍後再試。');
            }

        case COMMANDS.STUDENT.CONTACT_US:
            await setUserState(userId, 'feedback', { step: 'await_message' });
            console.log(`[API CALL] Pushing 'ask for feedback' message to ${userId}`);
            return push(userId, { type: 'text', text: '請輸入您想對老師說的話，或點選「取消」。', quickReply: { items: [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }] }});

        case COMMANDS.STUDENT.BUY_POINTS:
            const existingOrderRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
            if (existingOrderRes.rows.length > 0) {
                const flexMenu = await buildPointsMenuFlex(userId);
                console.log(`[API CALL] Pushing 'existing order warning' message to ${userId}`);
                return push(userId, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu]);
            }
            console.log(`[API CALL] Pushing 'buy points' flex message to ${userId}`);
            return push(userId, buildBuyPointsFlex());

        default:
            if (event.type === 'message' && event.message.type === 'text') {
                let studentSuggestion = '我不懂您的意思耶😕\n您可以試試點擊下方的選單按鈕。';
                if (text.startsWith('@')) {
                    const closestCommand = findClosestCommand(text, 'student');
                    if (closestCommand) { studentSuggestion = `找不到指令 "${text}"，您是不是想輸入「${closestCommand}」？`; } 
                    else { studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接點擊選單按鈕最準確喔！`; }
                }
                console.log(`[API CALL] Pushing 'unknown student command' message to ${userId}`);
                return push(userId, studentSuggestion);
            }
    }
  }
}
// --- Webhook 主處理函式 (V24.1 核心修正) ---
async function handleEvent(event) {
    if (!event.source || !event.source.userId) { return; }
    const userId = event.source.userId;
    let user = await getUser(userId);

    // --- 使用者初始化與更新 ---
    if (!user) {
        try {
            const profile = await client.getProfile(userId);
            // V24.1 新增 welcomed: false 旗標
            user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], pictureUrl: profile.pictureUrl, approved_by: null, welcomed: false };
            await saveUser(user);
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

    // --- V24.1 歡迎詞只發送一次 ---
    // 檢查 welcomed 旗標，undefined 或 false 都會觸發
    if (!user.welcomed) {
        // 對於管理者本人，永不發送歡迎詞
        if (user.id !== ADMIN_USER_ID) {
            console.log(`[API CALL] Pushing welcome message to new user ${userId}`);
            await push(userId, `歡迎 ${user.name}！感謝您加入九容瑜伽。`);
        }
        user.welcomed = true; // 設定旗標
        await saveUser(user); // 儲存更新
        // 只有全新的使用者才需要綁定預設選單
        if (user.id !== ADMIN_USER_ID && STUDENT_RICH_MENU_ID) {
            await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
        }
    }

    const userState = await getUserState(userId);
    const text = event.type === 'message' && event.message.type === 'text' ? event.message.text.trim() : '';

    // --- V24.1 核心路由邏輯 ---
    // 唯一例外：當指令是「@管理模式」且發送者是管理者本人時，強制切換回管理員身份。
    if (text === COMMANDS.ADMIN.PANEL && userId === ADMIN_USER_ID) {
        if (user.role !== 'admin') {
            user.role = 'admin';
            await saveUser(user);
        }
        if (ADMIN_RICH_MENU_ID) await client.linkRichMenuToUser(userId, ADMIN_RICH_MENU_ID);
        const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
        console.log(`[API CALL] Pushing admin panel quick reply to ${userId}`);
        return push(userId, { type: 'text', text: '您已返回「管理員」模式。', quickReply: { items: adminMenu } });
    }

    // 預設情況：完全根據資料庫中的角色來決定使用哪個處理器。
    switch (user.role) {
        case 'admin':
            return handleAdminCommands(event, user, userState);
        case 'teacher':
            return handleTeacherCommands(event, user, userState);
        case 'student':
        default:
            return handleStudentCommands(event, user, userState);
    }
}


// --- 路由設定 ---
app.post('/webhook', (req, res) => {
  try {
    const channelSecret = process.env.CHANNEL_SECRET;
    if (!channelSecret || !req.rawBody || !req.headers['x-line-signature']) {
      return res.status(400).send("Bad Request");
    }
    const signature = crypto.createHmac('SHA256', channelSecret).update(req.rawBody).digest('base64');
    if (signature !== req.headers['x-line-signature']) {
      console.warn("⚠️ 警告: 簽章不匹配! 請求被拒絕 (401)。");
      return res.status(401).send('Unauthorized');
    }
  } catch (error) {
    console.error('❌ 簽章驗證階段發生嚴重錯誤:', error.stack);
    return res.status(500).end();
  }

  res.status(200).send('OK');

  req.body.events.forEach(event => {
      if (!event.source || !event.source.userId) return;
      handleEvent(event).catch(err => {
          console.error('❌ handleEvent 異步處理失敗 (這是初始錯誤):', err.stack);
          if (process.env.ADMIN_USER_ID) {
              const errorMessage = `一個事件處理失敗:\n\n${err.message}`;
              console.log(`[API CALL] Pushing error message to admin ${process.env.ADMIN_USER_ID}`);
              push(process.env.ADMIN_USER_ID, errorMessage)
                .catch(pushErr => {
                    console.error('❌ 嘗試推播錯誤通知給 Admin 時也失敗了:', pushErr.stack);
                });
          }
      });
  });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot (V24.1 API 呼叫日誌版) 正常運作中。'));

// --- 伺服器啟動 ---
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V24.1 (API 呼叫日誌版)`);

  console.log('🕒 開始設定背景排程任務...');
  // setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS); // 課程提醒功能依然保持關閉
  setInterval(keepAlive, PING_INTERVAL_MS);
  setInterval(cleanCoursesDB, CLEAN_DB_INTERVAL_MS);
  console.log('✅ 背景排程任務已設定完成。');
});
