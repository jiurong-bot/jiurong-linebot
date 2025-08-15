// worker.js - V24.2 (智慧延遲重試)
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

const MAX_RETRIES = 3;
const WORKER_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_PUSH_MS = 500;
const RETRY_DELAY_MINUTES = 5; // [V24.2 新增] 每次重試延遲的基數分鐘

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

async function executePush(task) {
    try {
        await client.pushMessage(task.recipient_id, task.message_payload);
        await pgPool.query("UPDATE tasks SET status = 'sent', updated_at = NOW() WHERE id = $1", [task.id]);
        console.log(`✅ 任務 ${task.id} 已成功發送給 ${task.recipient_id}`);
    } catch (err) {
        console.error(`❌ 處理任務 ${task.id} 失敗:`, err.message, `(Recipient: ${task.recipient_id})`);
        
        if (task.retry_count < MAX_RETRIES) {
            // [V24.2 修改] 智慧延遲重試邏輯
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
            await pgPool.query(
              "UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
              [err.message, task.id]
            );
            console.error(`🚨 任務 ${task.id} 已達最大重試次數，標記為失敗。`);
        }
    }
}

async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動... V24.2');
  
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
        console.log(`📡 取得 ${tasks.length} 個任務，開始循序處理...`);
        for (const task of tasks) {
            await executePush(task);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PUSH_MS));
        }
    } else {
        await new Promise(resolve => setTimeout(resolve, WORKER_INTERVAL_MS));
    }
  }
}

main().catch(err => {
    console.error("背景工作程式發生未捕獲的致命錯誤:", err);
    process.exit(1);
});
