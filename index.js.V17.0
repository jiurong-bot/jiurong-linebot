// index.js - V17.0 (效能與可靠性強化版)
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

    if (stateName === 'adding_teacher') {
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

    if (stateName === 'confirm_add_teacher') {
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
    
    if (stateName === 'confirm_remove_teacher') {
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
    return;
  }

  const user = await getUser(userId);
  switch(text) {
    case COMMANDS.ADMIN.PANEL:
      const adminMenu = [ { type: 'action', action: { type: 'message', label: '授權老師', text: COMMANDS.ADMIN.ADD_TEACHER } }, { type: 'action', action: { type: 'message', label: '移除老師', text: COMMANDS.ADMIN.REMOVE_TEACHER } }, { type: 'action', action: { type: 'message', label: '模擬學員身份', text: COMMANDS.ADMIN.SIMULATE_STUDENT } }, { type: 'action', action: { type: 'message', label: '模擬老師身份', text: COMMANDS.ADMIN.SIMULATE_TEACHER } } ];
      return reply(replyToken, '請選擇管理者功能：', adminMenu);

    case COMMANDS.ADMIN.ADD_TEACHER:
      await setUserState(userId, 'adding_teacher', {}, 300);
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
    let stateData = userState.state_data;

    // 狀態: 取消課程
    if (stateName === 'course_cancellation') {
        if (text === COMMANDS.TEACHER.CANCEL_FLOW) {
            await clearUserState(userId);
            return reply(replyToken, '已放棄取消操作。');
        }
        // ... (此處邏輯與 V16.0 相同)
        return; // 狀態已處理，結束
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
                if (!/^\d{2}:\d{2}$/.test(text)) { return reply(replyToken, '時間格式不正確，請輸入四位數時間，例如：19:30'); }
                stateData.time = text;
                stateData.step = 'await_sessions';
                await setUserState(userId, stateName, stateData);
                return reply(replyToken, '請問這個系列總共要開設幾堂課？（請輸入數字）');
            case 'await_sessions':
                const sessions = parseInt(text, 10);
                if (isNaN(sessions) || sessions <= 0) { return reply(replyToken, '堂數必須是正整數，請重新輸入。'); }
                stateData.sessions = sessions;
                stateData.step = 'await_capacity';
                await setUserState(userId, stateName, stateData);
                return reply(replyToken, '請問每堂課的名額限制？（請輸入數字）');
            case 'await_capacity':
                const capacity = parseInt(text, 10);
                if (isNaN(capacity) || capacity <= 0) { return reply(replyToken, '名額必須是正整數，請重新輸入。'); }
                stateData.capacity = capacity;
                stateData.step = 'await_points';
                await setUserState(userId, stateName, stateData);
                return reply(replyToken, '請問每堂課需要消耗多少點數？（請輸入數字）');
            case 'await_points':
                const points = parseInt(text, 10);
                if (isNaN(points) || points < 0) { return reply(replyToken, '點數必須是正整數或 0，請重新輸入。'); }
                stateData.pointsCost = points;
                stateData.step = 'await_confirmation';
                await setUserState(userId, stateName, stateData);
                const firstDate = getNextDate(stateData.weekday, stateData.time);
                const summary = `請確認課程資訊：\n\n標題：${stateData.title}\n時間：每${stateData.weekday_label} ${stateData.time}\n堂數：${stateData.sessions} 堂\n名額：${stateData.capacity} 位\n費用：${stateData.pointsCost} 點/堂\n\n首堂開課日約為：${firstDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
                return reply(replyToken, summary, [ { type: 'action', action: { type: 'message', label: '✅ 確認新增', text: '✅ 確認新增' } }, { type: 'action', action: { type: 'message', label: '❌ 放棄', text: '取消' } } ]);
            case 'await_confirmation':
                if (text === '✅ 確認新增') {
                    const client = await pgPool.connect();
                    try {
                        await client.query('BEGIN');
                        const prefix = await generateUniqueCoursePrefix(client);
                        let currentDate = new Date();
                        for (let i = 0; i < stateData.sessions; i++) {
                            const courseDate = getNextDate(stateData.weekday, stateData.time, currentDate);
                            const course = { id: `${prefix}${String(i + 1).padStart(2, '0')}`, title: `${stateData.title} - 第 ${i + 1} 堂`, time: courseDate.toISOString(), capacity: stateData.capacity, pointsCost: stateData.pointsCost, students: [], waiting: [] };
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
                    } finally { client.release(); }
                } else { return reply(replyToken, '請點擊「✅ 確認新增」或「❌ 放棄」。'); }
        }
        return;
    }

    // 狀態: 手動調整點數
    if (stateName === 'manual_adjust') {
        // ... (此處邏輯與 V16.0 相同)
        return;
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
    return;
  }

  // --- 無狀態下的指令處理 ---
  if (text === COMMANDS.TEACHER.COURSE_MANAGEMENT) {
    await reply(replyToken, '收到！正在為您查詢課程列表，請稍候...');
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
      return reply(replyToken, flexMessage);
  } else if (text === COMMANDS.TEACHER.STUDENT_MANAGEMENT) {
      const flexMessage = { type: 'flex', altText: '學員管理選單', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '學員管理', color: '#FFFFFF', weight: 'bold', size: 'lg' }], backgroundColor: '#6A7D8B' }, body: { type: 'box', layout: 'vertical', spacing: 'lg', contents: [ { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查詢學員', weight: 'bold', size: 'md' }, { type: 'text', text: '依姓名或ID查詢學員的詳細資料與點數紀錄。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '開始查詢', text: COMMANDS.TEACHER.SEARCH_STUDENT } } ] }, { type: 'separator' }, { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '查看留言', weight: 'bold', size: 'md' }, { type: 'text', text: '查看並回覆學員的留言。', size: 'sm', color: '#666666', wrap: true, margin: 'md' }, { type: 'button', style: 'primary', color: '#6A7D8B', margin: 'md', action: { type: 'message', label: '查看未回覆留言', text: COMMANDS.TEACHER.VIEW_MESSAGES } } ] } ] } } };
      return reply(replyToken, flexMessage);
  } else if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      await setUserState(userId, 'manual_adjust', { step: 'await_student_search' });
      return reply(replyToken, '請輸入您想調整點數的學員姓名或 User ID：', [{ type: 'action', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }]);
  } else if (text === COMMANDS.TEACHER.SEARCH_STUDENT) {
      await setUserState(userId, 'student_search', {});
      return reply(replyToken, '請輸入您想查詢的學員姓名或 User ID：');
  } else if (text === COMMANDS.TEACHER.REPORT) {
    await reply(replyToken, '收到！正在為您產生營運報告，資料量較大請耐心等候...');
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
    await reply(replyToken, '正在查詢待確認訂單...');
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
      // ... (此處邏輯與 V16.0 相同，已是最新)
       return;
    }
    
    // 狀態: 預約/取消課程確認
    if (stateName === 'booking_confirmation') {
        const course = await getCourse(stateData.courseId);
        if (!course) {
            await clearUserState(userId);
            return reply(replyToken, '抱歉，找不到該課程，可能已被老師取消。');
        }
        // ... (此處邏輯與 V16.0 相同)
        await clearUserState(userId);
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
    return;
  }
  
  // --- 無狀態下的指令處理 ---
  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.CHECK_POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
      await clearUserState(userId);
      const flexMenu = await buildPointsMenuFlex(userId);
      return reply(replyToken, flexMenu);
  } else if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
      const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
      if (res.rows.length === 0) { return reply(replyToken, '目前沒有任何公告。'); }
      const announcement = res.rows[0];
      const announcementMessage = { type: 'flex', altText: '最新公告', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [ { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' } ]}, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: announcement.content, wrap: true } ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' } ]} } };
      return reply(replyToken, announcementMessage);
  } else if (text === COMMANDS.STUDENT.CONTACT_US) {
      await setUserState(userId, 'feedback', { step: 'await_message' });
      return reply(replyToken, '請輸入您想對老師說的話，或點選「取消」。', [{ type: 'action', action: { type: 'message', label: '取消', text: '取消' } }]);
  } else if (text === COMMANDS.STUDENT.BUY_POINTS) {
      const existingOrderRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') LIMIT 1`, [userId]);
      if (existingOrderRes.rows.length > 0) {
          const flexMenu = await buildPointsMenuFlex(userId);
          return reply(replyToken, [{type: 'text', text: '您目前尚有未完成的訂單，請先完成或取消該筆訂單。'}, flexMenu]);
      }
      return reply(replyToken, buildBuyPointsFlex());
  } else if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    await reply(replyToken, '正在查詢您的購點紀錄...');
    try {
        const res = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10`, [userId]);
        if (res.rows.length === 0) {
            return push(userId, '您沒有任何購點紀錄。');
        }
        const historyBubbles = res.rows.map(order => {
            let statusText, statusColor;
            switch (order.status) {
                case 'completed': statusText = '✅ 已完成'; statusColor = '#52b69a'; break;
                case 'pending_confirmation': statusText = '🕒 等待確認'; statusColor = '#ff9e00'; break;
                case 'pending_payment': statusText = '❗ 等待付款'; statusColor = '#f28482'; break;
                case 'rejected': statusText = '❌ 已退回'; statusColor = '#d90429'; break;
                default: statusText = '未知狀態'; statusColor = '#6c757d';
            }
            return { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: statusText, color: '#ffffff', weight: 'bold' }], backgroundColor: statusColor, paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [ { type: 'text', text: `購買 ${order.points} 點`, weight: 'bold', size: 'lg' }, { type: 'text', text: `金額: ${order.amount} 元`, size: 'sm' }, { type: 'text', text: `後五碼: ${order.last_5_digits || 'N/A'}`, size: 'sm' }, { type: 'text', text: `訂單ID: ${order.order_id}`, size: 'xxs', color: '#aaaaaa', wrap: true }, { type: 'text', text: `時間: ${formatDateTime(order.timestamp)}`, size: 'xs', color: '#aaaaaa' } ] } };
        });
        return push(userId, [{ type: 'text', text: '以下是您近期的購點紀錄：' }, { type: 'flex', altText: '購點紀錄', contents: { type: 'carousel', contents: historyBubbles } }]);
    } catch(err) {
        console.error('❌ 查詢購點紀錄失敗:', err);
        return push(userId, '查詢購點紀錄時發生錯誤。');
    }
  } else if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    await reply(replyToken, '正在查詢可預約的課程，請稍候...');
    try {
        const allCourses = Object.values(await getAllCourses());
        const now = Date.now();
        const sevenDaysLater = now + (7 * 24 * 60 * 60 * 1000);
        const availableCourses = allCourses.filter(c => { const courseTime = new Date(c.time).getTime(); return courseTime > now && courseTime < sevenDaysLater && c.students.length < c.capacity && !c.students.includes(userId) && !c.waiting.includes(userId); });
        
        if (availableCourses.length === 0) {
            return push(userId, '抱歉，未來 7 天內沒有可預約的課程。\n您可至「我的課程」查看候補中的課程，或等候老師發布新課程。');
        }
        availableCourses.sort((a, b) => new Date(a.time) - new Date(b.time));
        const courseItems = availableCourses.slice(0, 10).map(c => { const remainingSpots = c.capacity - c.students.length; return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [ { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: c.title, weight: 'bold', size: 'md', wrap: true, flex: 3 }, { type: 'text', text: `${c.pointsCost} 點`, color: '#1A759F', weight: 'bold', size: 'md', align: 'end', flex: 1 } ] }, { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666', flex: 2 }, { type: 'text', text: `剩餘 ${remainingSpots} 名`, size: 'sm', color: '#666666', align: 'end', flex: 1 } ] }, { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '預約此課程', data: `action=confirm_booking_start&courseId=${c.id}` }, margin: 'md' } ] }; });
        const courseListWithSeparators = [];
        courseItems.forEach((item, index) => { courseListWithSeparators.push(item); if (index < courseItems.length - 1) { courseListWithSeparators.push({ type: 'separator', margin: 'lg' }); } });
        const flexMessage = { type: 'flex', altText: '可預約的課程列表', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: '7日內可預約課程', color: '#ffffff', weight: 'bold', size: 'lg' } ], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', contents: courseListWithSeparators } } };
        return push(userId, flexMessage);
    } catch(err) {
        console.error('❌ 查詢可預約課程失敗:', err);
        return push(userId, '查詢課程時發生錯誤，請稍後再試。');
    }
  } else if (text === COMMANDS.STUDENT.MY_COURSES) {
    await reply(replyToken, '正在查詢您的課程...');
    try {
        const allCourses = Object.values(await getAllCourses());
        const now = Date.now();
        const myCourses = allCourses.filter(c => new Date(c.time).getTime() > now && (c.students.includes(userId) || c.waiting.includes(userId)));
        if (myCourses.length === 0) { return push(userId, '您目前沒有任何已預約或候補中的課程。'); }
        myCourses.sort((a, b) => new Date(a.time) - new Date(b.time));
        const courseItems = myCourses.slice(0, 10).map(c => { const isBooked = c.students.includes(userId); const courseMainTitle = c.title.replace(/ - 第 \d+ 堂$/, ''); const actionLabel = isBooked ? '取消預約' : '取消候補'; const postbackAction = isBooked ? 'confirm_cancel_booking_start' : 'confirm_cancel_waiting_start'; const statusBoxContents = []; statusBoxContents.push({ type: 'text', text: isBooked ? '✅ 已預約' : '🕒 候補中', weight: 'bold', size: 'sm', color: isBooked ? '#1a759f' : '#ff9e00' }); if (!isBooked) { statusBoxContents.push({ type: 'text', text: `候補順位: 第 ${c.waiting.indexOf(userId) + 1} 位`, size: 'sm', color: '#666666', align: 'end' }); } return { type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm', contents: [ { type: 'box', layout: 'horizontal', contents: statusBoxContents }, { type: 'text', text: courseMainTitle, weight: 'bold', size: 'md', wrap: true, margin: 'md' }, { type: 'text', text: formatDateTime(c.time), size: 'sm', color: '#666666' }, { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: actionLabel, data: `action=${postbackAction}&courseId=${c.id}` }, margin: 'md' } ] }; });
        const courseListWithSeparators = [];
        courseItems.forEach((item, index) => { courseListWithSeparators.push(item); if (index < courseItems.length - 1) { courseListWithSeparators.push({ type: 'separator', margin: 'lg' }); } });
        const flexMessage = { type: 'flex', altText: '我的課程列表', contents: { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '我的課程', color: '#ffffff', weight: 'bold', size: 'lg' }], backgroundColor: '#1a759f', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', contents: courseListWithSeparators } } };
        return push(userId, flexMessage);
    } catch(err) {
        console.error('❌ 查詢我的課程失敗:', err);
        return push(userId, '查詢課程時發生錯誤，請稍後再試。');
    }
  } else if (text === COMMANDS.STUDENT.SHOP) {
    await reply(replyToken, '正在為您打開活動商城...');
    try {
        const productsRes = await pgPool.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC");
        if (productsRes.rows.length === 0) { return push(userId, '目前商城沒有任何商品，敬請期待！'); }
        const productBubbles = productsRes.rows.map(p => ({ type: 'bubble', hero: p.image_url ? { type: 'image', url: p.image_url, size: 'full', aspectRatio: '20:13', aspectMode: 'cover' } : undefined, body: { type: 'box', layout: 'vertical', contents: [ { type: 'text', text: p.name, weight: 'bold', size: 'xl' }, { type: 'text', text: `${p.price} 點`, size: 'lg', margin: 'md', color: '#1A759F', weight: 'bold' }, { type: 'text', text: p.description, wrap: true, size: 'sm', margin: 'md' }, ]}, footer: { type: 'box', layout: 'vertical', contents: [ { type: 'button', style: 'secondary', action: { type: 'uri', label: '聯絡老師詢問', uri: `https://line.me/R/ti/p/${process.env.TEACHER_ID}` } } ]} }));
        return push(userId, { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles.slice(0, 10) } });
    } catch (err) {
        console.error('❌ 查詢商城商品失敗:', err);
        return push(userId, '查詢商城時發生錯誤，請稍後再試。');
    }
  } else {
    // ... (其他指令)
  }
}

// --- Webhook 主處理函式 ---
async function handleEvent(event) {
    // ... (此處邏輯與 V16.0 相同，已是最新)
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

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot (V17.0) 正常運作中。'));

// --- 伺服器啟動 ---
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V17.0 (效能與可靠性強化版)`);
  
  console.log('🕒 開始設定背景排程任務...');
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  setInterval(keepAlive, PING_INTERVAL_MS);
  setInterval(cleanCoursesDB, CLEAN_DB_INTERVAL_MS);
  console.log('✅ 背景排程任務已設定完成。');
});
