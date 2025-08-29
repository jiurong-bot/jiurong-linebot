// worker.js - V34.1 (修正備份計時器邏輯)
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

// [新增] 資料庫備份相關常數
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 每 24 小時
const MAIL_TO = 'lunatang.yoga@gmail.com';
const MAIL_FROM = process.env.GMAIL_ACCOUNT;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

let isShuttingDown = false;
let lastHealthCheck = 0;
let lastBackup = 0; // [修改] 上次備份時間戳，初始值改為 0

/**
 * 執行一個指令，並以 Promise 的形式回傳結果
 * @param {string} command - 要執行的指令
 * @returns {Promise<string>} - 指令的標準輸出
 */
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

/**
 * [新增] 執行資料庫備份並透過 Email 寄送
 */
async function performDatabaseBackup() {
  console.log('📬 開始執行資料庫備份與郵寄任務...');
  if (!MAIL_FROM || !GMAIL_APP_PASSWORD || !DATABASE_URL) {
    console.error('❌ 備份錯誤：缺少必要的 Gmail 或資料庫環境變數。');
    return; // 中斷此次備份，但不影響 worker 運行
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
      auth: {
        user: MAIL_FROM,
        pass: GMAIL_APP_PASSWORD,
      },
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


// --- 以下為 worker.js 原有函式，無需修改 ---

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
  console.log('🚀 背景工作程式 (Worker) 已啟動... V34.1 (整合備份)');
  // [移除] 不在此處初始化 lastBackup，因為會導致重啟後計時器重設
  
  while (true) {
    if (isShuttingDown) {
        console.log('🛑 收到關閉信號，停止抓取新任務...');
        break;
    }

    // [修改] 在主迴圈中加入定時備份檢查
    if (Date.now() - lastBackup > BACKUP_INTERVAL_MS) {
        await performDatabaseBackup();
        lastBackup = Date.now(); // 更新最後備份時間
    }
    
    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
        await performHealthCheck();
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
