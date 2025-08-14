// worker.js
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

const MAX_RETRIES = 3; // 每個任務的最大重試次數
const WORKER_INTERVAL_MS = 2000; // 佇列輪詢間隔 (2秒)
const BATCH_SIZE = 10; // 每次從資料庫撈取的任務數量

/**
 * 從資料庫中取得一批待處理的任務
 * @param {object} db - 資料庫連線客戶端
 * @returns {Promise<Array>} - 任務物件的陣列
 */
async function fetchPendingTasks(db) {
    // 使用 FOR UPDATE SKIP LOCKED 確保多個 Worker 實例不會取得同一個任務
    // 這樣可以安全地水平擴展 Worker 數量
    const res = await db.query(
      `SELECT id FROM tasks 
       WHERE status = 'pending' AND send_at <= NOW() 
       ORDER BY created_at ASC 
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );
    
    if (res.rows.length === 0) {
        return [];
    }

    const taskIds = res.rows.map(r => r.id);

    // 將任務標記為 'processing'，並取得完整的任務內容
    const tasksRes = await db.query(
        `UPDATE tasks SET status = 'processing', updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING *`,
        [taskIds]
    );

    return tasksRes.rows;
}

/**
 * 執行單一的推播任務
 * @param {object} task - 從資料庫取得的任務物件
 */
async function executePush(task) {
    try {
        await client.pushMessage(task.recipient_id, task.message_payload);
        // 更新為成功狀態
        await pgPool.query("UPDATE tasks SET status = 'sent', updated_at = NOW() WHERE id = $1", [task.id]);
        console.log(`✅ 任務 ${task.id} 已成功發送給 ${task.recipient_id}`);
    } catch (err) {
        console.error(`❌ 處理任務 ${task.id} 失敗:`, err.message, `(Recipient: ${task.recipient_id})`);
        
        // 處理失敗與重試邏輯
        if (task.retry_count < MAX_RETRIES) {
            // 增加重試次數，狀態改回 pending，等待下次輪詢
            await pgPool.query(
              "UPDATE tasks SET status = 'pending', retry_count = retry_count + 1, last_error = $1, updated_at = NOW() WHERE id = $2",
              [err.message, task.id]
            );
        } else {
            // 到達最大重試次數，標記為 failed
            await pgPool.query(
              "UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
              [err.message, task.id]
            );
            console.error(`🚨 任務 ${task.id} 已達最大重試次數，標記為失敗。`);
        }
    }
}


/**
 * 主執行迴圈
 */
async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動...');
  
  while (true) {
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
        console.log(`📡 取得 ${tasks.length} 個任務，開始處理...`);
        // 平行處理這一批次的任務
        await Promise.all(tasks.map(task => executePush(task)));
    } else {
        // 如果佇列為空，則稍作等待，避免頻繁空查詢資料庫
        await new Promise(resolve => setTimeout(resolve, WORKER_INTERVAL_MS));
    }
  }
}

main().catch(err => {
    console.error("背景工作程式發生未捕獲的致命錯誤:", err);
    process.exit(1);
});
