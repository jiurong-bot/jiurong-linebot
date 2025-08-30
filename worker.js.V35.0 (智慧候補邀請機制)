// worker.js - V35.0 (智慧候補邀請機制)
require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const line = require('@line/bot-sdk');
const { Pool } = require('pg');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};
const client = new line.Client(config);

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 常數設定 ---
const MAX_RETRIES = 3;
const WORKER_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_PUSH_MS = 500;
const RETRY_DELAY_MINUTES = 5;

// 健康檢查相關常數
const HEALTH_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 每 5 分鐘
const STUCK_TASK_TIMEOUT_MINUTES = 10;

// 資料庫備份相關常數
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 每 24 小時
const MAIL_TO = 'lunatang.yoga@gmail.com';
const MAIL_FROM = process.env.GMAIL_ACCOUNT;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// [新增] 智慧候補相關常數
const WAITLIST_CHECK_INTERVAL_MS = 1000 * 60; // 每 1 分鐘檢查一次候補邀請

let isShuttingDown = false;
let lastHealthCheck = 0;
let lastBackup = 0;
let lastWaitlistCheck = 0; // [新增] 上次檢查候補邀請的時間戳

// =======================================================
// [新增] V38.5 - 智慧候補邀請處理函式
// =======================================================
/**
 * 處理過期的候補邀請，並觸發對下一位學員的邀請
 */
async function processExpiredWaitlistInvites() {
    const db = await pgPool.connect();
    try {
        await db.query('BEGIN');

        // 步驟 1: 找出所有已過期且仍在等待中的邀請
        const expiredInvitesRes = await db.query(
            `UPDATE waitlist_notifications 
             SET status = 'expired' 
             WHERE status = 'pending' AND expires_at < NOW() 
             RETURNING id, course_id, user_id`
        );

        if (expiredInvitesRes.rows.length === 0) {
            await db.query('COMMIT');
            return; // 沒有過期的邀請，直接結束
        }

        console.log(`[Waitlist] 處理了 ${expiredInvitesRes.rows.length} 筆過期的候補邀請。`);

        // 步驟 2: 針對每一個過期邀請的課程，嘗試邀請下一位候補者
        // 使用 Map 來避免重複處理同一個課程
        const coursesToProcess = new Map();
        for (const invite of expiredInvitesRes.rows) {
            coursesToProcess.set(invite.course_id, invite.course_id);
        }

        for (const courseId of coursesToProcess.keys()) {
            const courseRes = await db.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [courseId]);
            if (courseRes.rows.length === 0) continue; // 課程不存在，跳過

            const course = courseRes.rows[0];
            const hasSpot = (course.students || []).length < course.capacity;
            const hasWaiting = (course.waiting || []).length > 0;

            if (hasSpot && hasWaiting) {
                const nextUserId = course.waiting[0];
                const newWaitingList = course.waiting.slice(1);

                // 更新課程的候補名單 (移除已被邀請的人)
                await db.query("UPDATE courses SET waiting = $1 WHERE id = $2", [newWaitingList, courseId]);

                // 為下一位學員建立新的邀請
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
                await db.query(
                    `INSERT INTO waitlist_notifications (course_id, user_id, status, expires_at) VALUES ($1, $2, 'pending', $3)`,
                    [courseId, nextUserId, expiresAt]
                );

                // 準備並發送邀請訊息
                const mainTitle = course.title.replace(/ - 第 \d+ 堂$/, '');
                const invitationMessage = {
                    type: 'flex',
                    altText: '候補課程邀請',
                    contents: {
                        type: 'bubble',
                        header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '🔔 候補邀請', weight: 'bold', color: '#FFFFFF' }], backgroundColor: '#ff9e00' },
                        body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
                            { type: 'text', text: `您好！您候補的課程「${mainTitle}」現在有名額了！`, wrap: true },
                            { type: 'text', text: '請在 15 分鐘內確認是否要預約，逾時將自動放棄資格喔。', size: 'sm', color: '#666666', wrap: true }
                        ]},
                        footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
                            { type: 'button', style: 'secondary', action: { type: 'postback', label: '😭 放棄', data: `action=waitlist_forfeit&course_id=${courseId}` } },
                            { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: '✅ 確認預約', data: `action=waitlist_confirm&course_id=${courseId}` } }
                        ]}
                    }
                };
                
                // 使用 await 等待 enqueuePushTask 完成
                const lineClient = new line.Client(config);
                await lineClient.pushMessage(nextUserId, invitationMessage);
                console.log(`[Waitlist] 已為課程 ${courseId} 發送新的候補邀請給 ${nextUserId}`);
            }
        }

        await db.query('COMMIT');
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('❌ 處理過期候補邀請時發生嚴重錯誤:', error);
    } finally {
        db.release();
    }
}


// --- 以下為 worker.js 原有函式，無需修改 ---
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`執行指令時發生錯誤: ${stderr}`);
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

async function performDatabaseBackup() {
  console.log('📬 開始執行資料庫備份與郵寄任務...');
  if (!MAIL_FROM || !GMAIL_APP_PASSWORD || !DATABASE_URL) {
    console.error('❌ 備份錯誤：缺少必要的 Gmail 或資料庫環境變數。');
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `jiurong_yoga_backup_${timestamp}.sql`;
  const backupFilePath = path.join(__dirname, backupFileName);
  try {
    console.log(`正在將資料庫備份至 ${backupFileName}...`);
    const pgDumpCommand = `pg_dump "${DATABASE_URL}" > "${backupFilePath}"`;
    await executeCommand(pgDumpCommand);
    console.log('✅ 資料庫備份成功！');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: MAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });
    const mailOptions = {
      from: `"九容瑜伽自動備份" <${MAIL_FROM}>`,
      to: MAIL_TO,
      subject: `[自動備份] 九容瑜伽資料庫備份 ${new Date().toLocaleDateString('zh-TW')}`,
      text: `您好，\n\n附件是 ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 的資料庫備份。\n\n此為系統自動發送，請勿直接回覆。`,
      attachments: [{ filename: backupFileName, path: backupFilePath }],
    };
    console.log(`正在將備份檔案寄送至 ${MAIL_TO}...`);
    await transporter.sendMail(mailOptions);
    console.log('✅ 備份郵件已成功寄出！');
  } catch (error) {
    console.error('❌ 在備份或郵寄過程中發生嚴重錯誤:', error);
  } finally {
    if (fs.existsSync(backupFilePath)) {
      console.log(`正在清理備份檔案 ${backupFileName}...`);
      fs.unlinkSync(backupFilePath);
      console.log('🧹 備份暫存檔已清理完畢。');
    }
  }
}

async function fetchPendingTasks(db) {
    const res = await db.query(
      `SELECT id FROM tasks WHERE status = 'pending' AND send_at <= NOW() ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );
    if (res.rows.length === 0) return [];
    const taskIds = res.rows.map(r => r.id);
    const tasksRes = await db.query(
        `UPDATE tasks SET status = 'processing', updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING *`,
        [taskIds]
    );
    return tasksRes.rows;
}

async function moveTaskToDLQ(task, errorMessage) {
    const db = await pgPool.connect();
    try {
        await db.query('BEGIN');
        await db.query(
            `INSERT INTO failed_tasks (original_task_id, recipient_id, message_payload, last_error, failed_at) VALUES ($1, $2, $3, $4, NOW())`,
            [task.id, task.recipient_id, task.message_payload, errorMessage]
        );
        await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
        await db.query('COMMIT');
        console.error(`🚨 任務 ${task.id} 已達最大重試次數，移至 Dead Letter Queue。`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error(`❌ 移轉任務 ${task.id} 至 DLQ 失敗:`, e);
        await pgPool.query(
            "UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
            [`DLQ_MOVE_FAILED: ${e.message}`, task.id]
        );
    } finally {
        db.release();
    }
}

async function executePush(task) {
    try {
        await client.pushMessage(task.recipient_id, task.message_payload);
        await pgPool.query("UPDATE tasks SET status = 'sent', updated_at = NOW() WHERE id = $1", [task.id]);
        console.log(`✅ 任務 ${task.id} 已成功發送給 ${task.recipient_id}`);
    } catch (err) {
        console.error(`❌ 處理任務 ${task.id} 失敗:`, err.message, `(Recipient: ${task.recipient_id})`);
        if (task.retry_count < MAX_RETRIES) {
            const nextRetryMinutes = RETRY_DELAY_MINUTES * (task.retry_count + 1);
            await pgPool.query(
              `UPDATE tasks SET status = 'pending', retry_count = retry_count + 1, last_error = $1, updated_at = NOW(), send_at = NOW() + INTERVAL '${nextRetryMinutes} minutes' WHERE id = $2`,
              [err.message, task.id]
            );
            console.log(`🕒 任務 ${task.id} 將在 ${nextRetryMinutes} 分鐘後重試。`);
        } else {
            await moveTaskToDLQ(task, err.message);
        }
    }
}

async function performHealthCheck() {
    console.log('🩺 執行健康檢查...');
    const db = await pgPool.connect();
    try {
        const stuckTasksRes = await db.query(
            `UPDATE tasks SET status = 'pending', updated_at = NOW(), last_error = 'Reset by health check' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '${STUCK_TASK_TIMEOUT_MINUTES} minutes' RETURNING id`
        );
        if (stuckTasksRes.rows.length > 0) {
            const stuckIds = stuckTasksRes.rows.map(r => r.id).join(', ');
            console.warn(`⚠️ 健康檢查：發現並重設了 ${stuckTasksRes.rows.length} 個卡住的任務: ${stuckIds}`);
        }
        const backlogRes = await db.query(
            `SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND send_at <= NOW()`
        );
        const backlogCount = parseInt(backlogRes.rows[0].count, 10);
        if (backlogCount > BATCH_SIZE * 5) {
             console.warn(`[HEALTH_CHECK_ALERT] 佇列嚴重積壓！目前有 ${backlogCount} 個待辦任務。`);
        }
    } catch (e) {
        console.error('❌ 健康檢查時發生錯誤:', e);
    } finally {
        db.release();
        lastHealthCheck = Date.now();
    }
}

async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動... V35.0 (智慧候補)');
  
  while (true) {
    if (isShuttingDown) {
        console.log('🛑 收到關閉信號，停止抓取新任務...');
        break;
    }

    const now = Date.now();

    // [修改] 在主迴圈中加入所有定時檢查
    if (now - lastBackup > BACKUP_INTERVAL_MS) {
        await performDatabaseBackup();
        lastBackup = now;
    }
    
    if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
        await performHealthCheck();
        // lastHealthCheck 在函式內部更新
    }
    
    // [新增] 定時檢查候補邀請
    if (now - lastWaitlistCheck > WAITLIST_CHECK_INTERVAL_MS) {
        await processExpiredWaitlistInvites();
        lastWaitlistCheck = now;
    }
      
    const db = await pgPool.connect();
    let tasks = [];
    try {
      tasks = await fetchPendingTasks(db);
    } catch (e) {
      console.error('從資料庫獲取任務時發生嚴重錯誤:', e);
    } finally {
      db.release();
    }

    if (tasks.length > 0) {
        console.log(`📡 取得 ${tasks.length} 個任務，開始循序處理...`);
        for (const task of tasks) {
            if (isShuttingDown) {
                console.log(`🛑 在處理批次任務時收到關閉信號，將 ${task.id} 設回 pending 後退出。`);
                await pgPool.query("UPDATE tasks SET status = 'pending' WHERE id = $1", [task.id]);
                break;
            }
            await executePush(task);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PUSH_MS));
        }
    } else {
        await new Promise(resolve => setTimeout(resolve, WORKER_INTERVAL_MS));
    }
  }
}

async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n gracefully shutting down... 請稍候...');
    setTimeout(async () => {
        await pgPool.end();
        console.log('PostgreSQL pool has been closed.');
        process.exit(0);
    }, WORKER_INTERVAL_MS + 1000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

main().catch(err => {
    console.error("背景工作程式發生未捕獲的致命錯誤:", err);
    pgPool.end().then(() => process.exit(1));
});

