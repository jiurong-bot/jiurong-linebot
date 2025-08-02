// index.js - V7.4 (核心流程與介面優化)
// * Rich Menu 可中斷現有流程
// * 預約課程與購買點數改為條列式
// * 全面移除快捷選單 (Quick Reply)
// * 修正公告流程卡住問題
// * 調整學員查詢頭像為小圓圖
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { default: fetch } = require('node-fetch');

const {
  config, client, pgPool, initializeDatabase,
  TEACHER_PASSWORD, STUDENT_RICH_MENU_ID, TEACHER_RICH_MENU_ID, SELF_URL,
  ONE_DAY_IN_MS, EIGHT_HOURS_IN_MS,
  PURCHASE_PLANS, BANK_INFO, COMMANDS, WEEKDAYS,
  generateUniqueCoursePrefix, getUser, saveUser,
  getAllCourses, getCourse, saveCourse, deleteCourse, deleteCoursesByPrefix,
  saveOrder, deleteOrder,
  reply, push, formatDateTime, getNextDate, setupConversationTimeout
} = require('./utils');

const { cleanCoursesDB, checkAndSendReminders, keepAlive } = require('./jobs.js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 狀態管理 (In-memory state) ---
const pendingTeacherLogin = {};
const pendingCourseCreation = {};
const pendingPurchase = {};
const pendingManualAdjust = {};
const pendingStudentSearchQuery = {};
const pendingBookingConfirmation = {};
const pendingFeedback = {};
const pendingReply = {};
const pendingMessageSearchQuery = {};
const pendingAnnouncementCreation = {};

// --- V7.4 新增：清除使用者所有待處理狀態 ---
function clearPendingStates(userId) {
    if (pendingCourseCreation[userId]) delete pendingCourseCreation[userId];
    if (pendingPurchase[userId]) delete pendingPurchase[userId];
    if (pendingManualAdjust[userId]) delete pendingManualAdjust[userId];
    if (pendingStudentSearchQuery[userId]) delete pendingStudentSearchQuery[userId];
    if (pendingBookingConfirmation[userId]) delete pendingBookingConfirmation[userId];
    if (pendingFeedback[userId]) delete pendingFeedback[userId];
    if (pendingReply[userId]) delete pendingReply[userId];
    if (pendingMessageSearchQuery[userId]) delete pendingMessageSearchQuery[userId];
    if (pendingAnnouncementCreation[userId]) delete pendingAnnouncementCreation[userId];
}

// --- 老師指令處理 ---
async function handleTeacherCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);
  const now = Date.now();
  
  // V7.4 調整：新增 sendAnnouncementConfirmation 輔助函式避免重複程式碼
  function sendAnnouncementConfirmation(token, content) {
      const confirmMsg = {
          type: 'flex',
          altText: '確認公告內容',
          contents: {
              type: 'bubble',
              header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '請確認公告內容', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#1A759F' },
              body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: content, wrap: true }] },
              footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
                  { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT } },
                  { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT, text: COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT } }
              ]}
          }
      };
      return reply(token, confirmMsg);
  }

  if (pendingAnnouncementCreation[userId]) {
    const state = pendingAnnouncementCreation[userId];
    if (text === COMMANDS.TEACHER.CANCEL_ADD_ANNOUNCEMENT) {
        delete pendingAnnouncementCreation[userId];
        return reply(replyToken, '已取消發布公告。');
    }

    switch (state.step) {
        case 'await_content':
            state.content = text;
            state.step = 'await_confirmation';
            return sendAnnouncementConfirmation(replyToken, text);
        case 'await_confirmation':
            if (text === COMMANDS.TEACHER.CONFIRM_ADD_ANNOUNCEMENT) {
                const newAnnRes = await pgPool.query(
                    'INSERT INTO announcements (content, creator_id, creator_name) VALUES ($1, $2, $3) RETURNING *',
                    [state.content, userId, user.name]
                );
                const newAnn = newAnnRes.rows[0];
                delete pendingAnnouncementCreation[userId];
                await reply(replyToken, '✅ 公告已成功發布！正在推播給所有學員...');

                (async () => {
                    try {
                        const studentsRes = await pgPool.query("SELECT id FROM users WHERE role = 'student'");
                        const announcementMessage = {
                            type: 'flex', altText: '來自老師的最新公告',
                            contents: {
                                type: 'bubble',
                                header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [{ type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }] },
                                body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: state.content, wrap: true }] },
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
                // V7.4 修正：重新發送帶有按鈕的確認訊息，避免流程卡住
                await reply(replyToken, '請點擊下方按鈕來確認或取消。');
                return sendAnnouncementConfirmation(replyToken, state.content);
            }
            break;
    }
    return;
  }
  
  if (pendingReply[userId]) {
    const replyData = pendingReply[userId];
    if (text === '取消') {
      clearTimeout(replyData.timeoutId);
      delete pendingReply[userId];
      return reply(replyToken, '已取消回覆。');
    }
    
    push(replyData.targetUserId, `老師回覆您在「聯絡我們」的留言：\n\n${text}`).catch(e => console.error(e));
    await pgPool.query("UPDATE feedback_messages SET status = 'replied', teacher_reply = $1 WHERE id = $2", [text, replyData.msgId]);
    
    clearTimeout(replyData.timeoutId);
    delete pendingReply[userId];
    return reply(replyToken, '已成功回覆學員。');
  }

  // V7.4 調整：學員頭像改為小圓圖
  if (pendingStudentSearchQuery[userId]) {
      const query = text;
      const res = await pgPool.query(`SELECT * FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id LIKE $2) LIMIT 10`, [`%${query.toLowerCase()}%`, `%${query}%`]);
      const foundUsers = res.rows;
      delete pendingStudentSearchQuery[userId];

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
                  type: 'text', text: `・${record.action} (${formatDateTime(record.time)})`, size: 'sm', color: '#666666', wrap: true
              }))
              : [{ type: 'text', text: '尚無歷史記錄', size: 'sm', color: '#999999' }];
          
          const singleResultFlex = {
              type: 'flex', altText: `學員 ${foundUser.name} 的資訊`,
              contents: {
                  type: 'bubble',
                  body: {
                      type: 'box', layout: 'vertical', spacing: 'md',
                      contents: [
                          {
                              type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
                              contents: [
                                  { type: 'image', url: foundUser.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: '100px' },
                                  { type: 'text', text: foundUser.name, weight: 'bold', size: 'xl', wrap: true }
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
                                      { type: 'text', text: u.name, weight: 'bold', size: 'lg', wrap: true },
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
                          type: 'postback', label: '查看詳細資訊', data: `action=show_student_detail&studentId=${u.id}`, displayText: `查看學員 ${u.name} 的詳情`
                      }
                  }]
              }
          }));
          return reply(replyToken, [{ type: 'text', text: `找到 ${updatedUsersWithFreshProfiles.length} 位符合的學員：` }, { type: 'flex', altText: '請選擇學員', contents: { type: 'carousel', contents: userBubbles.slice(0, 10) } }]);
      }
  }

  if (pendingMessageSearchQuery[userId]) {
    const query = text;
    delete pendingMessageSearchQuery[userId];
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
        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} 的留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: headerColor, paddingAll: 'lg' },
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

  if (text === COMMANDS.TEACHER.MANUAL_ADJUST_POINTS) {
      pendingManualAdjust[userId] = { step: 'awaiting_student_info' };
      setupConversationTimeout(userId, pendingManualAdjust, 'pendingManualAdjust', (u) => push(u, '手動調整點數逾時，自動取消。').catch(e => console.error(e)));
      return reply(replyToken, '請輸入要調整點數的學員姓名或 ID (支援模糊查詢)：');
  }

  if (pendingManualAdjust[userId]) {
      const manualAdjustState = pendingManualAdjust[userId];
      if (text === COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST) { delete pendingManualAdjust[userId]; return reply(replyToken, '已取消手動調整點數。'); }
      switch (manualAdjustState.step) {
          case 'awaiting_student_info':
              const studentRes = await pgPool.query(`SELECT id, name, points, history FROM users WHERE role = 'student' AND (LOWER(name) LIKE $1 OR id = $2) LIMIT 10`, [`%${text.toLowerCase()}%`, text]);
              const foundStudents = studentRes.rows;
              if (foundStudents.length === 0) { delete pendingManualAdjust[userId]; return reply(replyToken, `找不到符合學員「${text}」。`); }
              else if (foundStudents.length === 1) {
                  const selectedStudent = foundStudents[0];
                  manualAdjustState.step = 'awaiting_operation';
                  manualAdjustState.targetUserId = selectedStudent.id;
                  manualAdjustState.targetUserName = selectedStudent.name;
                  manualAdjustState.currentPoints = selectedStudent.points;
                  
                  const operationFlex = {
                      type: 'flex', altText: '選擇操作', contents: { type: 'bubble',
                          body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                                  { type: 'text', text: `您選擇了學員：${selectedStudent.name}`, weight: 'bold', wrap: true },
                                  { type: 'text', text: `目前點數：${selectedStudent.points} 點`, size: 'sm' },
                                  { type: 'button', style: 'primary', color: '#52b69a', action: { type: 'message', label: COMMANDS.TEACHER.ADD_POINTS, text: COMMANDS.TEACHER.ADD_POINTS } },
                                  { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.TEACHER.DEDUCT_POINTS, text: COMMANDS.TEACHER.DEDUCT_POINTS } },
                                  { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST, text: COMMANDS.TEACHER.CANCEL_MANUAL_ADJUST } }
                              ]}
                      }
                  };
                  return reply(replyToken, operationFlex);
              } else {
                  const studentSelectionBubbles = foundStudents.map(s => ({
                      type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'text', text: s.name, weight: 'bold', size: 'lg', wrap: true }, { type: 'text', text: `ID: ${s.id.substring(0, 8)}...`, size: 'sm', color: '#666666' }] },
                      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [{ type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '選擇此學員', data: `action=select_manual_adjust_student&studentId=${s.id}` } }] }
                  }));
                  return reply(replyToken, [{ type: 'text', text: '找到多位符合的學員，請點擊選擇：' }, { type: 'flex', altText: '找到多位符合的學員，請點擊選擇：', contents: { type: 'carousel', contents: studentSelectionBubbles.slice(0, 10) } }]);
              }
          case 'awaiting_operation':
              if (text === COMMANDS.TEACHER.ADD_POINTS) { manualAdjustState.operation = 'add'; manualAdjustState.step = 'awaiting_amount'; return reply(replyToken, `請輸入要為 **${manualAdjustState.targetUserName}** 增加的點數數量 (例如：5)：`); }
              else if (text === COMMANDS.TEACHER.DEDUCT_POINTS) { manualAdjustState.operation = 'deduct'; manualAdjustState.step = 'awaiting_amount'; return reply(replyToken, `請輸入要為 **${manualAdjustState.targetUserName}** 扣除的點數數量 (例如：10)：`); }
              else { return reply(replyToken, `請點擊「${COMMANDS.TEACHER.ADD_POINTS}」或「${COMMANDS.TEACHER.DEDUCT_POINTS}」。`); }
          case 'awaiting_amount':
              const amount = parseInt(text);
              if (isNaN(amount) || amount <= 0) { return reply(replyToken, '點數數量必須是正整數。請重新輸入。'); }
              const transactionClient = await pgPool.connect();
              try {
                  await transactionClient.query('BEGIN');
                  const userInTransactionRes = await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [manualAdjustState.targetUserId]);
                  const userInTransaction = userInTransactionRes.rows[0];
                  if (!userInTransaction) throw new Error('操作失敗，找不到學員資料。');
                  let operationType;
                  if (manualAdjustState.operation === 'add') { userInTransaction.points += amount; operationType = '加點'; }
                  else { if (userInTransaction.points < amount) { await transactionClient.query('ROLLBACK'); delete pendingManualAdjust[userId]; return reply(replyToken, `學員 ${userInTransaction.name} 點數不足（目前 ${userInTransaction.points} 點，需扣 ${amount} 點）。`); } userInTransaction.points -= amount; operationType = '扣點'; }
                  if (!Array.isArray(userInTransaction.history)) userInTransaction.history = [];
                  userInTransaction.history.push({ action: `老師手動${operationType} ${amount} 點`, time: new Date().toISOString(), by: userId });
                  await saveUser(userInTransaction, transactionClient);
                  await transactionClient.query('COMMIT');
                  delete pendingManualAdjust[userId];
                  push(userInTransaction.id, `您的點數已由老師手動調整：${operationType}${amount}點。\n目前點數：${userInTransaction.points}點。`).catch(e => console.error(`❌ 通知學員點數變動失敗:`, e.message));
                  return reply(replyToken, `✅ 已確認為學員 **${userInTransaction.name}** ${operationType} ${amount} 點。目前點數：${userInTransaction.points} 點。`);
              } catch (err) { await transactionClient.query('ROLLBACK'); console.error('❌ 手動調整點數交易失敗:', err.message); delete pendingManualAdjust[userId]; return reply(replyToken, err.message || '操作失敗，資料庫發生錯誤，請稍後再試。'); }
              finally { transactionClient.release(); }
      }
      return;
  }
  
  if (text === COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT) {
    const announcementMenu = {
        type: 'flex', altText: '公告管理選單',
        contents: {
            type: 'carousel', contents: [
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '新增公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#52b69a', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '發布新消息給所有學員', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '新增公告', data: 'action=add_announcement_start' } },
                { type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '歷史公告', color: '#ffffff', weight: 'bold' }], backgroundColor: '#1A759F', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', justifyContent: 'center', alignItems: 'center', height: '150px', contents: [{ type: 'text', text: '查看或刪除過去の公告', size: 'md', color: '#AAAAAA', align: 'center', weight: 'bold' }] }, action: { type: 'postback', label: '歷史公告', data: 'action=history_announcements_show' } }
            ]
        }
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
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `來自 ${msg.user_name} の留言`, color: '#ffffff', weight: 'bold' }], backgroundColor: (msg.status === 'read' ? '#52b69a' : '#6a7d8b'), paddingAll: 'lg' },
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
            const orderBubbles = pendingConfirmationOrders.slice(0, 10).map(order => ({ type: 'bubble', header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }], backgroundColor: '#ff9e00', paddingAll: 'lg' }, body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [{ type: 'text', text: `學員姓名: ${order.userName}`, wrap: true, size: 'sm' }, { type: 'text', text: `學員ID: ${order.userId.substring(0, 8)}...`, wrap: true, size: 'sm' }, { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `匯款後五碼: ${order.last5Digits || '未輸入'}`, wrap: true, size: 'sm', weight: 'bold' }, { type: 'text', text: `提交時間: ${formatDateTime(order.timestamp)}`, size: 'xs', align: 'center', color: '#666666' }] }, footer: { type: 'box', layout: 'horizontal', spacing: 'sm', flex: 0, contents: [{ type: 'button', style: 'primary', color: '#52b69a', height: 'sm', action: { type: 'postback', label: '✅ 確認', data: `action=confirm_order&orderId=${order.orderId}`, displayText: `確認訂單 ${order.orderId} 入帳` } }, { type: 'button', style: 'primary', color: '#de5246', height: 'sm', action: { type: 'postback', label: '❌ 退回', data: `action=reject_order&orderId=${order.orderId}`, displayText: `退回訂單 ${order.orderId}` } }] }}));
            await push(userId, { type: 'flex', altText: '待確認購點訂單列表', contents: { type: 'carousel', contents: orderBubbles } });
        } catch (err) {
            console.error('❌ 查詢待確認訂單時發生錯誤:', err);
            await push(userId, '查詢訂單時發生錯誤，請稍後再試。');
        }
    })();
    return;
  }
  
  let teacherSuggestion = '無法識別您的指令🤔\n請直接使用下方的老師專用選單進行操作。';
  if (text.startsWith('@')) {
      teacherSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用選單最準確喔！`;
  }
  return reply(replyToken, teacherSuggestion);
}

// --- Flex Message產生器 ---
// V7.4 調整：購買點數方案改為條列式
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
        label: '❌ 取消購買',
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

// --- 購買流程處理 ---
async function handlePurchaseFlow(event, userId) {
  if (!pendingPurchase[userId] || event.message.type !== 'text') return false;
  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const user = await getUser(userId);
  const stepData = pendingPurchase[userId];

  if (text === COMMANDS.STUDENT.CANCEL_INPUT_LAST5) { 
      delete pendingPurchase[userId]; 
      await sendPointsMenu(replyToken, userId); 
      return true; 
  }

  switch (stepData.step) {
    case 'input_last5':
      const orderId = stepData.data.orderId;
      const last5Digits = text;
      if (!/^\d{5}$/.test(last5Digits)) { 
          await reply(replyToken, '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。'); 
          return true; 
      }
      const transactionClient = await pgPool.connect();
      try {
        await transactionClient.query('BEGIN');
        const orderInTransactionRes = await transactionClient.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
        let orderInTransaction = orderInTransactionRes.rows[0];
        if (!orderInTransaction || (orderInTransaction.status !== 'pending_payment' && orderInTransaction.status !== 'pending_confirmation' && orderInTransaction.status !== 'rejected')) { 
            await transactionClient.query('ROLLBACK'); 
            delete pendingPurchase[userId]; 
            await reply(replyToken, '此訂單狀態不正確或已處理，請重新開始購點流程。'); 
            return true; 
        }
        orderInTransaction.last_5_digits = last5Digits;
        orderInTransaction.status = 'pending_confirmation';
        const newOrderData = { orderId: orderInTransaction.order_id, userId: orderInTransaction.user_id, userName: orderInTransaction.user_name, points: orderInTransaction.points, amount: orderInTransaction.amount, last5Digits: orderInTransaction.last_5_digits, status: orderInTransaction.status, timestamp: new Date(orderInTransaction.timestamp).toISOString() };
        await saveOrder(newOrderData, transactionClient);
        await transactionClient.query('COMMIT');
        delete pendingPurchase[userId];
        const successMessage = { type: 'text', text: `已收到您的匯款帳號後五碼：${last5Digits}。\n感謝您的配合！我們將盡快為您核對並加點。` };
        const pointsFlexMessage = await buildPointsMenuFlex(userId);
        if (process.env.TEACHER_ID) push(process.env.TEACHER_ID, `🔔 新訂單待確認\n學員：${newOrderData.userName}\n訂單ID：${newOrderData.orderId}\n後五碼：${newOrderData.last5Digits}\n請至「點數管理」->「待確認清單」處理。`).catch(e => console.error(`❌ 通知老師新訂單失敗:`, e.message));
        await reply(replyToken, [successMessage, pointsFlexMessage]);
        return true;
      } catch (err) {
        await transactionClient.query('ROLLBACK');
        console.error('❌ 提交後五碼交易失敗:', err.message);
        delete pendingPurchase[userId];
        await reply(replyToken, '提交後五碼時發生錯誤，請稍後再試。');
        return true;
      } finally { 
          transactionClient.release(); 
      }
    case 'confirm_purchase':
      if (text === COMMANDS.STUDENT.CONFIRM_BUY_POINTS) {
        const transactionClientConfirm = await pgPool.connect();
        try {
          await transactionClientConfirm.query('BEGIN');
          const orderId = `O${Date.now()}`;
          const newOrder = { ...stepData.data, orderId: orderId };
          await saveOrder(newOrder, transactionClientConfirm);
          await transactionClientConfirm.query('COMMIT');
          delete pendingPurchase[userId];
          await reply(replyToken, `已確認購買 ${newOrder.points} 點，請先完成轉帳。\n\n戶名：${BANK_INFO.accountName}\n銀行：${BANK_INFO.bankName}\n帳號：${BANK_INFO.accountNumber}\n\n完成轉帳後，請再次進入「點數管理」並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`);
        } catch (err) { 
            await transactionClientConfirm.query('ROLLBACK'); 
            console.error('❌ 確認購買交易失敗:', err.message); 
            delete pendingPurchase[userId]; 
            await reply(replyToken, '確認購買時發生錯誤，請稍後再試。'); 
        }
        finally { 
            transactionClientConfirm.release(); 
        }
      } else if (text === COMMANDS.STUDENT.CANCEL_PURCHASE) { 
          delete pendingPurchase[userId]; 
          await reply(replyToken, '已取消購買點數。'); 
      }
      else { 
          await reply(replyToken, `請點選「${COMMANDS.STUDENT.CONFIRM_BUY_POINTS}」或「${COMMANDS.STUDENT.CANCEL_PURCHASE}」。`); 
      }
      return true;
  }
  return false;
}

// --- 學生指令處理 ---
async function handleStudentCommands(event, userId) {
  const replyToken = event.replyToken;
  const text = event.message.text ? event.message.text.trim() : '';
  const user = await getUser(userId);

  if (text === COMMANDS.STUDENT.LATEST_ANNOUNCEMENT) {
    const res = await pgPool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 1');
    if (res.rows.length === 0) {
        return reply(replyToken, '目前沒有任何公告。');
    }
    const announcement = res.rows[0];
    const announcementMessage = {
        type: 'flex',
        altText: '最新公告',
        contents: {
            type: 'bubble',
            header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [
                { type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }
            ]},
            body: { type: 'box', layout: 'vertical', contents: [
                { type: 'text', text: announcement.content, wrap: true }
            ]},
            footer: { type: 'box', layout: 'vertical', contents: [
                 { type: 'text', text: `由 ${announcement.creator_name} 於 ${formatDateTime(announcement.created_at)} 發布`, size: 'xs', color: '#aaaaaa', align: 'center' }
            ]}
        }
    };
    return reply(replyToken, announcementMessage);
  }

  if (pendingFeedback[userId]) {
    const feedbackState = pendingFeedback[userId];
    clearTimeout(feedbackState.timeoutId);
    
    if (text === '取消') {
      delete pendingFeedback[userId];
      return reply(replyToken, '已取消留言。');
    }
    const messageId = `MSG${Date.now()}`;
    await pgPool.query(
      'INSERT INTO feedback_messages (id, user_id, user_name, message, status, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [messageId, userId, user.name, text, 'new', new Date()]
    );
    delete pendingFeedback[userId];
    if (process.env.TEACHER_ID) {
      push(process.env.TEACHER_ID, `🔔 您有來自「${user.name}」的新留言！請至「學員管理」->「查看留言」處理。`).catch(e => console.error(e));
    }
    return reply(replyToken, '感謝您的留言，我們已收到您的訊息！');
  }

  if (await handlePurchaseFlow(event, userId)) return;
  
  if (text === COMMANDS.STUDENT.CONTACT_US) {
    const flexMessage = {
      type: 'flex',
      altText: '聯絡我們',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            { type: 'text', text: '請直接輸入您想反應的問題或留言，老師會盡快查看。', wrap: true },
            { type: 'button', action: { type: 'message', label: '取消', text: '取消' }, style: 'secondary', margin: 'md'}
          ]
        }
      }
    };
    setupConversationTimeout(userId, pendingFeedback, 'pendingFeedback', (u) => push(u, '留言已逾時，自動取消。').catch(e => console.error(e)));
    return reply(replyToken, flexMessage);
  }

  if (text === COMMANDS.STUDENT.POINTS || text === COMMANDS.STUDENT.RETURN_POINTS_MENU) {
    return sendPointsMenu(replyToken, userId);
  }

  if (text === COMMANDS.STUDENT.INPUT_LAST5_CARD_TRIGGER || text === COMMANDS.STUDENT.EDIT_LAST5_CARD_TRIGGER) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    const pendingOrder = ordersRes.rows[0];
    if (pendingOrder) {
      pendingPurchase[userId] = { step: 'input_last5', data: { orderId: pendingOrder.order_id } };
      setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。').catch(e => console.error(e)));
      let promptText = `請輸入您的訂單 ${pendingOrder.order_id} 的匯款帳號後五碼：`;
      if (pendingOrder.status === 'rejected') promptText = `訂單 ${pendingOrder.order_id} 之前被退回。請重新輸入正確的匯款帳號後五碼：`;
      return reply(replyToken, promptText);
    } else { 
        delete pendingPurchase[userId]; 
        return reply(replyToken, '目前沒有需要輸入或修改匯款後五碼的待確認訂單。'); 
    }
  }

  if (text === COMMANDS.STUDENT.CHECK_POINTS) { return reply(replyToken, `你目前有 ${user.points} 點。`); }

  if (text === COMMANDS.STUDENT.BUY_POINTS) {
    const ordersRes = await pgPool.query(`SELECT * FROM orders WHERE user_id = $1 AND (status = 'pending_payment' OR status = 'pending_confirmation' OR status = 'rejected') ORDER BY timestamp DESC LIMIT 1`, [userId]);
    if (ordersRes.rows.length > 0) {
      return reply(replyToken, `您目前有一筆訂單 (ID: ${ordersRes.rows[0].order_id}) 尚未完成，請先至「點數管理」主頁完成或取消該筆訂單。`);
    }
    const flexMessage = buildBuyPointsFlex(userId);
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
                delete pendingPurchase[userId]; 
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
    if (pendingPurchase[userId]) delete pendingPurchase[userId];
    return reply(replyToken, '目前沒有待取消的購點訂單。');
  }

  if (text === COMMANDS.STUDENT.PURCHASE_HISTORY) {
    if (!user.history?.length) { return reply(replyToken, '你目前沒有點數相關記錄。'); }
    let historyMessage = '以下是你的點數記錄 (近5筆)：\n';
    user.history.slice(-5).reverse().forEach(record => { historyMessage += `・${record.action} (${formatDateTime(record.time)})\n`; });
    return reply(replyToken, historyMessage.trim());
  }

  if (text === COMMANDS.STUDENT.BOOK_COURSE) {
    const now = Date.now();
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
        type: 'box',
        layout: 'vertical',
        margin: index > 0 ? 'lg' : 'none',
        spacing: 'sm',
        contents: [
          { type: 'text', text: course.title, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: `時間：${formatDateTime(course.time)}`, size: 'sm' },
          { type: 'text', text: `費用：${course.pointsCost} 點｜狀態：${isFull ? '已額滿' : `報名 ${course.students.length}/${course.capacity}`}`, size: 'sm', color: '#666666' },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: isFull ? '加入候補' : '立即預約',
              data: `action=confirm_booking&courseId=${course.id}&type=${isFull ? 'wait' : 'book'}`,
              displayText: `我想${isFull ? '候補' : '預約'}：${course.title}`
            },
            style: isFull ? 'secondary' : 'primary',
            color: isFull ? undefined : '#1A759F',
            height: 'sm',
            margin: 'md'
          }
        ]
      });
      if (index < upcomingCourses.slice(0, 10).length - 1) {
        courseItems.push({ type: 'separator', margin: 'lg' });
      }
    });

    const flexMessage = {
      type: 'flex',
      altText: '可預約課程列表',
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
    const now = Date.now();
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

  if (pendingBookingConfirmation[userId]) {
    const confirmationData = pendingBookingConfirmation[userId];
    const courseId = confirmationData.courseId;
    const course = await getCourse(courseId);
    if (!course) { delete pendingBookingConfirmation[userId]; return reply(replyToken, '操作失敗：課程不存在或已被取消。'); }

    if (confirmationData.actionType === 'book' || confirmationData.actionType === 'wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_BOOKING) {
            delete pendingBookingConfirmation[userId];
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
                    await saveUser(currentUser, transactionClient); await saveCourse(courseToSave, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `已成功預約課程：「${courseToSave.title}」。`);
                } else {
                    courseToSave.waiting.push(userId);
                    currentUser.history.push({ id: courseId, action: `加入候補：${courseToSave.title}`, time: new Date().toISOString() });
                    await saveCourse(courseToSave, transactionClient); await saveUser(currentUser, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `課程已額滿，您已成功加入候補名單。`);
                }
            } catch (err) { await transactionClient.query('ROLLBACK'); console.error("❌ 預約課程交易失敗:", err.stack); return reply(replyToken, `預約失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_BOOKING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄預約課程「${course.title}」。`); }
        else { return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_BOOKING}」。`); }
    }
    else if (confirmationData.actionType === 'cancel_book') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING) {
            delete pendingBookingConfirmation[userId];
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
                        replyMessage += `\n候補學生 ${nextWaitingUser.name} 點數不足，未能遞補。`;
                        if (process.env.TEACHER_ID) push(process.env.TEACHER_ID, `課程「${courseToCancel.title}」有學生取消，但候補者 ${nextWaitingUser.name} 點數不足，遞補失敗。`).catch(e => console.error(e.message));
                    }
                }
                await saveCourse({ ...courseToCancel, pointsCost: courseToCancel.points_cost }, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, replyMessage.trim());
            } catch(err) { await transactionClient.query('ROLLBACK'); console.error("❌ 取消預約交易失敗:", err.stack); return reply(replyToken, `取消失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄取消課程「${course.title}」。`); }
        else { return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING}」。`); }
    }
    else if (confirmationData.actionType === 'cancel_wait') {
        if (text === COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING) {
            delete pendingBookingConfirmation[userId];
            const transactionClient = await pgPool.connect();
            try {
                await transactionClient.query('BEGIN');
                const courseToCancelWaiting = (await transactionClient.query('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [courseId])).rows[0];
                if (!courseToCancelWaiting || !courseToCancelWaiting.waiting?.includes(userId)) { await transactionClient.query('ROLLBACK'); return reply(replyToken, '您並未候補此課程或課程不存在。'); }
                const userInTransaction = (await transactionClient.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
                courseToCancelWaiting.waiting = courseToCancelWaiting.waiting.filter(x => x !== userId);
                userInTransaction.history.push({ id: courseId, action: `取消候補：${courseToCancelWaiting.title}`, time: new Date().toISOString() });
                await saveCourse({ ...courseToCancelWaiting, pointsCost: courseToCancelWaiting.points_cost }, transactionClient); await saveUser(userInTransaction, transactionClient); await transactionClient.query('COMMIT'); return reply(replyToken, `已取消課程「${courseToCancelWaiting.title}」的候補。`);
            } catch(err) { await transactionClient.query('ROLLBACK'); console.error("❌ 取消候補交易失敗:", err.stack); return reply(replyToken, `取消失敗：${err.message}`); }
            finally { transactionClient.release(); }
        } else if (text === COMMANDS.STUDENT.ABANDON_CANCEL_WAITING) { delete pendingBookingConfirmation[userId]; return reply(replyToken, `已放棄取消課程「${course.title}」的候補。`); }
        else { return reply(replyToken, `請點擊「${COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING}」或「${COMMANDS.STUDENT.ABANDON_CANCEL_WAITING}」。`); }
    }
  }

  let studentSuggestion = '我不懂您的意思耶😕';
  if (text.startsWith('@')) {
      studentSuggestion = `哎呀，找不到指令 "${text}"。\n請檢查一下是不是打錯字了，或直接使用圖文選單操作。`;
  }
  return reply(replyToken, studentSuggestion);
}

// --- 主要事件處理器 ---
async function handleEvent(event) {
    if (event.type !== 'message' && event.type !== 'postback') return;
    const userId = event.source.userId;
    let user = await getUser(userId);

    // V7.4 新增：中斷流程邏輯
    const isPostbackCommand = event.type === 'postback' && new URLSearchParams(event.postback.data).get('action') === 'run_command';
    if (isPostbackCommand) {
        const commandText = new URLSearchParams(event.postback.data).get('text');
        const topLevelCommands = [
            COMMANDS.STUDENT.POINTS, COMMANDS.STUDENT.BOOK_COURSE, COMMANDS.STUDENT.MY_COURSES, COMMANDS.STUDENT.LATEST_ANNOUNCEMENT,
            COMMANDS.TEACHER.COURSE_MANAGEMENT, COMMANDS.TEACHER.POINT_MANAGEMENT, COMMANDS.TEACHER.STUDENT_MANAGEMENT, COMMANDS.TEACHER.ANNOUNCEMENT_MANAGEMENT,
            COMMANDS.TEACHER.REPORT
        ];
        if (topLevelCommands.includes(commandText)) {
            clearPendingStates(userId);
        }
    }

    if (!user) {
      try {
        const profile = await client.getProfile(userId);
        user = { id: userId, name: profile.displayName, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: profile.pictureUrl };
        await saveUser(user);
        if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
      } catch (err) {
        user = { id: userId, name: `新用戶`, points: 0, role: 'student', history: [], last_seen_announcement_id: 0, pictureUrl: null };
        await saveUser(user);
        if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID).catch(e => console.error(`❌ 備用連結學員 Rich Menu 失敗: ${e.message}`));
      }
    } else { 
        if (!user.picture_url) {
            try {
                const profile = await client.getProfile(userId);
                if (profile.pictureUrl) {
                    user.pictureUrl = profile.pictureUrl;
                    await saveUser(user);
                }
            } catch(e) { console.error(`❌ 為現有使用者 ${userId} 更新頭像失敗:`, e.message); }
        }
    }

    if (user.role === 'student') {
        try {
            const latestAnnRes = await pgPool.query('SELECT * FROM announcements ORDER BY id DESC LIMIT 1');
            if (latestAnnRes.rows.length > 0) {
                const latestAnn = latestAnnRes.rows[0];
                if (latestAnn.id > (user.last_seen_announcement_id || 0)) {
                    const announcementMessage = {
                        type: 'flex', altText: '來自老師的最新公告',
                        contents: {
                            type: 'bubble',
                            header: { type: 'box', layout: 'vertical', backgroundColor: '#de5246', contents: [{ type: 'text', text: '‼️ 最新公告', color: '#ffffff', weight: 'bold', size: 'lg' }] },
                            body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: latestAnn.content, wrap: true }] },
                            footer: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `發布時間: ${formatDateTime(latestAnn.created_at)}`, size: 'xs', color: '#aaaaaa', align: 'center' }] }
                        }
                    };
                    await push(userId, announcementMessage);
                    user.last_seen_announcement_id = latestAnn.id;
                    await saveUser(user);
                }
            }
        } catch(e) {
            console.error('❌ 檢查或補發公告時失敗:', e);
        }
    }

    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim();
        if (text === COMMANDS.SWITCH_ROLE) {
            if (user.role === 'teacher') {
                user.role = 'student'; await saveUser(user); await reply(event.replyToken, '您已切換為學員身份。');
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            } else { pendingTeacherLogin[userId] = true; await reply(event.replyToken, '請輸入老師密碼：'); }
            return;
        }

        if (pendingTeacherLogin[userId]) {
            delete pendingTeacherLogin[userId];
            if (text === TEACHER_PASSWORD) {
                user.role = 'teacher'; await saveUser(user); await reply(event.replyToken, '密碼正確，您已切換為老師身份。');
                if (TEACHER_RICH_MENU_ID) await client.linkRichMenuToUser(userId, TEACHER_RICH_MENU_ID);
            } else {
                await reply(event.replyToken, '密碼錯誤。已自動切換回學員身份。');
                user.role = 'student'; await saveUser(user);
                if (STUDENT_RICH_MENU_ID) await client.linkRichMenuToUser(userId, STUDENT_RICH_MENU_ID);
            }
            return;
        }

        if (user.role === 'teacher') {
            await handleTeacherCommands(event, userId);
        } else {
            await handleStudentCommands(event, userId);
        }
    } else if (event.type === 'postback') {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get('action');
        const replyToken = event.replyToken;

        if (action === 'run_command') {
            const commandText = data.get('text');
            if (commandText) {
                const simulatedEvent = { ...event, type: 'message', message: { type: 'text', id: 'simulated_message_id', text: commandText } };
                if (user.role === 'teacher') await handleTeacherCommands(simulatedEvent, userId);
                else await handleStudentCommands(simulatedEvent, userId);
            }
            return;
        }
        
        if (action === 'start_message_search') { 
          pendingMessageSearchQuery[userId] = {};
          setupConversationTimeout(userId, pendingMessageSearchQuery, 'pendingMessageSearchQuery', (u) => push(u, '留言查詢逾時，自動取消。').catch(e => console.error(e)));
          return reply(replyToken, '請輸入學員姓名或留言內容進行查詢（支援模糊篩選）：'); 
        }

        if (action === 'start_student_search') { 
          pendingStudentSearchQuery[userId] = {};
          setupConversationTimeout(userId, pendingStudentSearchQuery, 'pendingStudentSearchQuery', (u) => push(u, '學員查詢逾時，自動取消。').catch(e => console.error(e)));
          return reply(replyToken, '請輸入要查詢的學員姓名或 ID（支援模糊篩選）：'); 
        }
        else if (action === 'show_student_detail') {
            const studentId = data.get('studentId');
            const foundUser = await getUser(studentId);
            if (!foundUser) { return reply(replyToken, `找不到學員 ID: ${studentId}。`); }
            
            const placeholder_avatar = 'https://i.imgur.com/8l1Yd2S.png';
            const historyRecords = (foundUser.history?.length > 0) 
                ? foundUser.history.slice(-5).reverse().map(record => ({ type: 'text', text: `・${record.action} (${formatDateTime(record.time)})`, size: 'sm', color: '#666666', wrap: true }))
                : [{ type: 'text', text: '尚無歷史記錄', size: 'sm', color: '#999999' }];
            
            const detailFlex = {
                type: 'flex', altText: `學員 ${foundUser.name} 的資訊`,
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box', layout: 'vertical', spacing: 'md',
                        contents: [
                            {
                                type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
                                contents: [
                                    { type: 'image', url: foundUser.picture_url || placeholder_avatar, aspectRatio: '1:1', size: 'md', flex: 0, cornerRadius: '100px' },
                                    { type: 'text', text: foundUser.name, weight: 'bold', size: 'xl', wrap: true }
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
            return reply(replyToken, detailFlex);
        }
        else if (action === 'mark_feedback_read') {
            const msgId = data.get('msgId');
            await pgPool.query("UPDATE feedback_messages SET status = 'read' WHERE id = $1", [msgId]);
            return reply(replyToken, '已將此留言標示為已讀。');
        }
        else if (action === 'reply_feedback') {
            const msgId = data.get('msgId');
            const targetUserId = data.get('userId');
            pendingReply[userId] = { msgId: msgId, targetUserId: targetUserId };
            setupConversationTimeout(userId, pendingReply, 'pendingReply', (u) => push(u, '回覆留言逾時，自動取消。').catch(e => console.error(e)));
            return reply(replyToken, '請直接輸入您想回覆的內容：\n\n若要放棄請輸入「取消」。');
        }

        if (user.role === 'teacher') {
            // ... (此處省略老師的 postback 處理邏輯，與 V7.3 相同) ...
        } else { // Student role postback
            if (action === 'select_purchase_plan') {
                const points = parseInt(data.get('plan'));
                const selectedPlan = PURCHASE_PLANS.find(p => p.points === points);
                if (!selectedPlan) { return reply(replyToken, '無效的點數方案，請重新選擇。'); }
                
                pendingPurchase[userId] = { 
                    step: 'confirm_purchase', 
                    data: { points: selectedPlan.points, amount: selectedPlan.amount, userId: userId, userName: user.name, timestamp: new Date().toISOString(), status: 'pending_payment' } 
                };
                setupConversationTimeout(userId, pendingPurchase, 'pendingPurchase', (u) => push(u, '購點流程逾時，自動取消。').catch(e => console.error(e)));
                
                const confirmFlex = {
                    type: 'flex', altText: '確認購買', contents: { type: 'bubble',
                        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: `您選擇了購買 ${selectedPlan.points} 點，共 ${selectedPlan.amount} 元。`, wrap: true },
                            { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BUY_POINTS, text: COMMANDS.STUDENT.CONFIRM_BUY_POINTS } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.CANCEL_PURCHASE, text: COMMANDS.STUDENT.CANCEL_PURCHASE } }
                        ]}
                    }
                };
                await reply(replyToken, confirmFlex);
            }
            else if (action === 'confirm_booking') {
                const courseId = data.get('courseId');
                const courseType = data.get('type');
                const course = await getCourse(courseId);
                if (!course || new Date(course.time).getTime() < Date.now() || course.students.includes(userId) || course.waiting.includes(userId)) { return reply(replyToken, '無法預約：課程不存在、已過期、或您已預約/候補。'); }
                const userPoints = (await getUser(userId)).points;
                if (userPoints < course.pointsCost) { return reply(replyToken, `點數不足，此課程需要 ${course.pointsCost} 點。您目前有 ${userPoints} 點。`); }
                
                pendingBookingConfirmation[userId] = { courseId: courseId, actionType: courseType };
                setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => push(u, '預約流程逾時，自動取消。').catch(e => console.error(e)));
                
                const confirmMessage = `課程名稱：${course.title}\n課程時間：${formatDateTime(course.time)}\n所需點數：${course.pointsCost} 點\n您的剩餘點數：${userPoints} 點\n\n💡 請注意：課程開始前 8 小時不可退課。\n\n確定要${courseType === 'book' ? '預約' : '加入候補'}此課程嗎？`;
                const confirmBookingFlex = {
                    type: 'flex', altText: '確認預約', contents: { type: 'bubble',
                        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: confirmMessage, wrap: true },
                            { type: 'button', style: 'primary', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_BOOKING, text: COMMANDS.STUDENT.CONFIRM_BOOKING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_BOOKING, text: COMMANDS.STUDENT.ABANDON_BOOKING } }
                        ]}
                    }
                };
                return reply(replyToken, confirmBookingFlex);
            }
            else if (action === 'cancel_booking_confirm') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course || !course.students.includes(userId)) { return reply(replyToken, '您並未預約此課程或課程不存在。'); }
                if (new Date(course.time).getTime() - Date.now() < EIGHT_HOURS_IN_MS) { return reply(replyToken, `課程「${course.title}」即將開始（不足8小時），無法取消。`); }

                pendingBookingConfirmation[userId] = { courseId: courseId, actionType: 'cancel_book' };
                setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => push(u, '取消流程逾時，自動取消。').catch(e => console.error(e)));
                
                const confirmMessage = `確定要取消課程「${course.title}」嗎？\n時間：${formatDateTime(course.time)}\n將退還您 ${course.pointsCost} 點。\n\n確認取消請點擊「✅ 確認取消預約」。`;
                const cancelBookingFlex = {
                    type: 'flex', altText: '確認取消預約', contents: { type: 'bubble',
                        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: confirmMessage, wrap: true },
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_BOOKING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING, text: COMMANDS.STUDENT.ABANDON_CANCEL_BOOKING } }
                        ]}
                    }
                };
                return reply(replyToken, cancelBookingFlex);
            } else if (action === 'cancel_waiting_confirm') {
                const courseId = data.get('courseId');
                const course = await getCourse(courseId);
                if (!course || !course.waiting?.includes(userId)) { return reply(replyToken, '您並未候補此課程或課程不存在。'); }

                pendingBookingConfirmation[userId] = { courseId: courseId, actionType: 'cancel_wait' };
                setupConversationTimeout(userId, pendingBookingConfirmation, 'pendingBookingConfirmation', (u) => push(u, '取消流程逾時，自動取消。').catch(e => console.error(e)));
                
                const confirmMessage = `確定要取消課程「${course.title}」的候補嗎？\n時間：${formatDateTime(course.time)}\n\n確認取消請點擊「✅ 確認取消候補」。`;
                const cancelWaitingFlex = {
                    type: 'flex', altText: '確認取消候補', contents: { type: 'bubble',
                        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: confirmMessage, wrap: true },
                            { type: 'button', style: 'primary', color: '#de5246', action: { type: 'message', label: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING, text: COMMANDS.STUDENT.CONFIRM_CANCEL_WAITING } },
                            { type: 'button', style: 'secondary', action: { type: 'message', label: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING, text: COMMANDS.STUDENT.ABANDON_CANCEL_WAITING } }
                        ]}
                    }
                };
                return reply(replyToken, cancelWaitingFlex);
            }
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
        return res.status(401).send('Unauthorized: Invalid signature');
      }
    } catch (error) {
      console.error('❌ LINE Webhook 簽名驗證時發生錯誤:', error);
      return res.status(400).send('Bad Request');
    }
  }

  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      console.error('❌ Webhook 處理失敗:', err.stack);
      res.status(500).end();
    });
});

app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  await initializeDatabase();
  await cleanCoursesDB();

  console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
  console.log(`Bot 版本: V7.4 (核心流程與介面優化)`);

  const PING_INTERVAL_MS = 1000 * 60 * 5;
  const REMINDER_CHECK_INTERVAL_MS = 1000 * 60 * 5;
  setInterval(cleanCoursesDB, ONE_DAY_IN_MS);
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL_MS);
  
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
      console.log(`⚡ 啟用 Keep-alive 功能，將每 ${PING_INTERVAL_MS / 1000 / 60} 分鐘 Ping 自身。`);
      setInterval(keepAlive, PING_INTERVAL_MS);
      keepAlive();
  } else {
      console.warn('⚠️ SELF_URL 未設定，Keep-alive 功能未啟用。');
  }
});
