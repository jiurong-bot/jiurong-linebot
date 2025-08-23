// worker.js - V25.1 (DLQ、Graceful Shutdown 與健康檢查)
require('dotenv').config();
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
const WORKER_INTERVAL_MS = 2000;       // 佇列為空時的輪詢間隔
const BATCH_SIZE = 10;                 // 每次處理的任務數量
const DELAY_BETWEEN_PUSH_MS = 500;     // 每次發送之間的延遲，避免觸發 LINE API 速率限制
const RETRY_DELAY_MINUTES = 5;         // 每次重試延遲的基數分鐘

// [V25.0 新增] 健康檢查相關常數
const HEALTH_CHECK_INTERVAL_MS = 1000 * 60 * 5; // 每 5 分鐘執行一次健康檢查
const STUCK_TASK_TIMEOUT_MINUTES = 10;          // 任務處理超過 10 分鐘視為卡住

let isShuttingDown = false; // [V25.0 新增] 用於優雅關閉的旗標
let lastHealthCheck = 0;    // [V25.0 新增] 上次健康檢查的時間戳

/**
 * 從資料庫抓取一批待處理的任務，並使用 FOR UPDATE SKIP LOCKED確保並行安全
 * @param {import('pg').PoolClient} db - 資料庫客戶端
 * @returns {Promise<Array<object>>} - 任務物件陣列
 */
async function fetchPendingTasks(db) {
    const res = await db.query(
      `SELECT id FROM tasks 
       WHERE status = 'pending' AND send_at <= NOW() 
       ORDER BY created_at ASC 
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
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

/**
 * [V25.0 修正] 將徹底失敗的任務移至 Dead Letter Queue (failed_tasks)
 * @param {object} task - 失敗的任務
 * @param {string} errorMessage - 錯誤訊息
 */
async function moveTaskToDLQ(task, errorMessage) {
    const db = await pgPool.connect();
    try {
        await db.query('BEGIN');
        // [修正] 使用正確的欄位寫入 failed_tasks，並將原任務ID存入 original_task_id
        await db.query(
            `INSERT INTO failed_tasks (original_task_id, recipient_id, message_payload, last_error, failed_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [task.id, task.recipient_id, task.message_payload, errorMessage]
        );
        // 從主任務表刪除
        await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
        await db.query('COMMIT');
        console.error(`🚨 任務 ${task.id} 已達最大重試次數，移至 Dead Letter Queue。`);
    } catch (e) {
        await db.query('ROLLBACK');
        console.error(`❌ 移轉任務 ${task.id} 至 DLQ 失敗:`, e);
        // 如果連 DLQ 都失敗，僅更新原任務狀態作為備案
        await pgPool.query(
            "UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
            [`DLQ_MOVE_FAILED: ${e.message}`, task.id]
        );
    } finally {
        db.release();
    }
}

/**
 * 執行單一任務的推播，包含重試與失敗處理邏輯
 * @param {object} task - 任務物件
 */
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
              `UPDATE tasks 
               SET status = 'pending', 
                   retry_count = retry_count + 1, 
                   last_error = $1, 
                   updated_at = NOW(),
                   send_at = NOW() + INTERVAL '${nextRetryMinutes} minutes'
               WHERE id = $2`,
              [err.message, task.id]
            );
            console.log(`🕒 任務 ${task.id} 將在 ${nextRetryMinutes} 分鐘後重試。`);
        } else {
            // [V25.0 修改] 改為呼叫 moveTaskToDLQ
            await moveTaskToDLQ(task, err.message);
        }
    }
}

/**
 * [V25.0 新增] 健康檢查函式
 * 1. 尋找並重設卡住的任務
 * 2. 檢查佇列積壓情況
 */
async function performHealthCheck() {
    console.log('🩺 執行健康檢查...');
    const db = await pgPool.connect();
    try {
        // 1. 重設卡住的任務
        const stuckTasksRes = await db.query(
            `UPDATE tasks 
             SET status = 'pending', updated_at = NOW(), last_error = 'Reset by health check'
             WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '${STUCK_TASK_TIMEOUT_MINUTES} minutes'
             RETURNING id`
        );
        if (stuckTasksRes.rows.length > 0) {
            const stuckIds = stuckTasksRes.rows.map(r => r.id).join(', ');
            console.warn(`⚠️ 健康檢查：發現並重設了 ${stuckTasksRes.rows.length} 個卡住的任務: ${stuckIds}`);
        }

        // 2. 檢查佇列積壓情況
        const backlogRes = await db.query(
            `SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND send_at <= NOW()`
        );
        const backlogCount = parseInt(backlogRes.rows[0].count, 10);
        if (backlogCount > BATCH_SIZE * 5) { // 積壓超過 5 個批次的量
             console.warn(`[HEALTH_CHECK_ALERT] 佇列嚴重積壓！目前有 ${backlogCount} 個待辦任務。`);
        }

    } catch (e) {
        console.error('❌ 健康檢查時發生錯誤:', e);
    } finally {
        db.release();
        lastHealthCheck = Date.now();
    }
}


/**
 * 主執行函式
 */
async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動... V25.0');
  
  while (true) {
    // [V25.0 新增] 優雅關閉檢查
    if (isShuttingDown) {
        console.log('🛑 收到關閉信號，停止抓取新任務...');
        break;
    }

    // [V25.0 新增] 定期健康檢查
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
            // 如果在處理批次任務中收到關閉信號，則完成當前任務後就應停止
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

/**
 * [V25.0 新增] 優雅關閉處理器
 */
async function gracefulShutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n gracefully shutting down... 請稍候...');
    
    // 等待一小段時間讓主迴圈偵測到旗標並停止
    setTimeout(async () => {
        await pgPool.end();
        console.log('PostgreSQL pool has been closed.');
        process.exit(0);
    }, WORKER_INTERVAL_MS + 1000); // 等待時間比主迴圈的 sleep 時間稍長
}

process.on('SIGINT', gracefulShutdown);  // 監聽 Ctrl+C
process.on('SIGTERM', gracefulShutdown); // 監聽 kill 指令

main().catch(err => {
    console.error("背景工作程式發生未捕獲的致命錯誤:", err);
    pgPool.end().then(() => process.exit(1));
});
