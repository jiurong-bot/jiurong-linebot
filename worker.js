// worker.js - V38.1 (詳單改為CSV附件)
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
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7; // 每 7 天 (一週)
// 每日合併報表相關常數
const POINTS_REPORT_INTERVAL_MS = 1000 * 60 * 60 * 24; // 每 24 小時
const MAIL_TO = 'lunatang.yoga@gmail.com';
const MAIL_FROM = process.env.GMAIL_ACCOUNT;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// 智慧候補相關常數
const WAITLIST_CHECK_INTERVAL_MS = 1000 * 60; // 每 1 分鐘檢查一次候補邀請

// 資料清理相關常數
const DATA_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 每 24 小時執行一次清理
const FAILED_TASK_RETENTION_DAYS = 180; // 保留 180 天的失敗任務紀錄
const WAITLIST_NOTIFICATION_RETENTION_DAYS = 90; // 保留 90 天的已處理候補邀請紀錄

// 智慧警報相關常數
const FAILED_TASK_SPIKE_THRESHOLD = 10; // 1小時內失敗任務超過 10 筆就觸發警報
const FAILED_TASK_SPIKE_WINDOW_HOURS = 1; // 檢查的時間範圍 (小時)
const ALERT_COOLDOWN_MS = 1000 * 60 * 60 * 6; // 警報冷卻時間 (6小時)，避免短時間內重複發送

let isShuttingDown = false;
let lastHealthCheck = 0;
let lastBackup = 0;
let lastWaitlistCheck = 0;
let lastDataCleanup = 0; 
let lastCombinedPointsReport = 0;
let isAlertCooldown = false; 

// =======================================================
// [修改] 每日學員點數合併報表 (詳單改為CSV附件)
// =======================================================
async function performDailyPointsCombinedReport() {
    console.log('📊 開始執行每日學員點數合併報表任務...');
    if (!MAIL_FROM || !GMAIL_APP_PASSWORD) {
        console.error('❌ 報表錯誤：缺少必要的 Gmail 環境變數。');
        return;
    }

    const db = await pgPool.connect();
    try {
        // 1. 一次性抓取所有學員資料，包含ID方便未來對照
        const usersRes = await db.query(`
            SELECT id, name, points 
            FROM users 
            WHERE role = 'student' 
            ORDER BY points DESC
        `);
        const students = usersRes.rows;

        if (students.length === 0) {
            console.log('📊 目前沒有任何學員資料可供製表。');
            return;
        }

        // 2. 產生統計摘要
        const totalPoints = students.reduce((sum, s) => sum + s.points, 0);
        const averagePoints = (totalPoints / students.length).toFixed(1);
        const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n');
        const zeroPointStudents = students.filter(s => s.points === 0).length;

        const reportDate = new Date();
        const reportDateStr = reportDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        // 3. 組合 Email 內文
        let reportText = `您好，\n\n這是截至 ${reportDateStr} 的學員點數每日彙總報表。\n\n`;
        reportText += `--- 統計摘要 ---\n`;
        reportText += `- 總學員數：${students.length} 人\n`;
        reportText += `- 點數總流通量：${totalPoints} 點\n`;
        reportText += `- 平均持有：${averagePoints} 點/人\n`;
        reportText += `- 零點數學員：${zeroPointStudents} 人\n\n`;
        reportText += `--- 點數持有 Top 5 ---\n${top5}\n\n`;
        reportText += `詳細的全體學員點數清單，請見附件 CSV 檔案。\n\n`;
        reportText += `此為系統自動發送，請勿直接回覆。`;

        // 4. 產生 CSV 內容
        // 為了詳單的可讀性，按姓名重新排序
        students.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        let csvContent = "姓名,剩餘點數,UserID\n"; // CSV 標頭
        students.forEach(student => {
            // 處理可能包含逗號的姓名
            const studentName = `"${student.name.replace(/"/g, '""')}"`; 
            csvContent += `${studentName},${student.points},${student.id}\n`;
        });

        // 5. 設定郵件內容並寄出
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: MAIL_FROM, pass: GMAIL_APP_PASSWORD },
        });
        
        const dateForFilename = reportDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const mailOptions = {
            from: `"九容瑜伽自動報表" <${MAIL_FROM}>`,
            to: MAIL_TO,
            subject: `[自動日報] 學員點數彙總報表 ${reportDateStr}`,
            text: reportText,
            attachments: [
                {
                    filename: `student_points_report_${dateForFilename}.csv`,
                    content: csvContent,
                    contentType: 'text/csv; charset=utf-8',
                }
            ]
        };

        console.log(`正在將點數合併報表及CSV附件寄送至 ${MAIL_TO}...`);
        await transporter.sendMail(mailOptions);
        console.log('✅ 每日學員點數合併報表已成功寄出！');

    } catch (error) {
        console.error('❌ 在產生點數合併報表過程中發生嚴重錯誤:', error);
    } finally {
        db.release();
    }
}


// =======================================================
// 系統警報郵件通用函式
// =======================================================
async function sendSystemAlertEmail(subject, body) {
    if (!MAIL_FROM || !GMAIL_APP_PASSWORD) {
        console.error('❌ 警報郵件發送失敗：缺少必要的 Gmail 環境變數。');
        return;
    }
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: MAIL_FROM, pass: GMAIL_APP_PASSWORD },
        });

        const mailOptions = {
            from: `"九容瑜伽系統警報" <${MAIL_FROM}>`,
            to: MAIL_TO,
            subject: `[緊急警報] ${subject}`,
            text: `系統發生緊急狀況，請盡速確認：\n\n${body}\n\n此為系統自動發送。`,
        };
        await transporter.sendMail(mailOptions);
        console.log(`🚨 已成功發送系統警報郵件至 ${MAIL_TO}`);
    } catch (error) {
        console.error('❌ 發送警報郵件時發生嚴重錯誤:', error);
    }
}


// =======================================================
// V38.5 - 智慧候補邀請處理函式
// =======================================================
async function processExpiredWaitlistInvites() {
    const db = await pgPool.connect();
    try {
        await db.query('BEGIN');
        const expiredInvitesRes = await db.query(
            `UPDATE waitlist_notifications 
             SET status = 'expired' 
             WHERE status = 'pending' AND expires_at < NOW() 
             RETURNING id, course_id, user_id`
        );
        if (expiredInvitesRes.rows.length === 0) {
            await db.query('COMMIT');
            return;
        }

        console.log(`[Waitlist] 處理了 ${expiredInvitesRes.rows.length} 筆過期的候補邀請。`);
        const coursesToProcess = new Map();
        for (const invite of expiredInvitesRes.rows) {
            coursesToProcess.set(invite.course_id, invite.course_id);
        }

        for (const courseId of coursesToProcess.keys()) {
            const courseRes = await db.query("SELECT * FROM courses WHERE id = $1 FOR UPDATE", [courseId]);
            if (courseRes.rows.length === 0) continue; 

            const course = courseRes.rows[0];
            const hasSpot = (course.students || []).length < course.capacity;
            const hasWaiting = (course.waiting || []).length > 0;
            if (hasSpot && hasWaiting) {
                const nextUserId = course.waiting[0];
                const newWaitingList = course.waiting.slice(1);

                await db.query("UPDATE courses SET waiting = $1 WHERE id = $2", [newWaitingList, courseId]);
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000); 
                await db.query(
                    `INSERT INTO waitlist_notifications (course_id, user_id, status, expires_at) VALUES ($1, $2, 'pending', $3)`,
                    [courseId, nextUserId, expiresAt]
                );
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

async function performDataCleanup() {
    console.log('🧹 開始執行定期資料清理任務...');
    const db = await pgPool.connect();
    try {
        const waitlistRes = await db.query(
            `DELETE FROM waitlist_notifications 
             WHERE created_at < NOW() - INTERVAL '${WAITLIST_NOTIFICATION_RETENTION_DAYS} days' 
             AND status IN ('expired', 'confirmed', 'forfeited')`
        );
        if (waitlistRes.rowCount > 0) {
            console.log(`🧹 已成功清理 ${waitlistRes.rowCount} 筆舊的候補邀請紀錄。`);
        }

        const failedTaskRes = await db.query(
            `DELETE FROM failed_tasks 
             WHERE failed_at < NOW() - INTERVAL '${FAILED_TASK_RETENTION_DAYS} days'`
        );
        if (failedTaskRes.rowCount > 0) {
            console.log(`🧹 已成功清理 ${failedTaskRes.rowCount} 筆舊的失敗任務紀錄。`);
        }
    } catch (error) {
        console.error('❌ 資料清理時發生錯誤:', error);
    } finally {
        db.release();
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
        console.error(`❌ 處理任務 ${task.id} 失败:`, err.message, `(Recipient: ${task.recipient_id})`);
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

        if (!isAlertCooldown) {
            const spikeRes = await db.query(
                `SELECT COUNT(*) FROM failed_tasks WHERE failed_at > NOW() - INTERVAL '${FAILED_TASK_SPIKE_WINDOW_HOURS} hours'`
            );
            const spikeCount = parseInt(spikeRes.rows[0].count, 10);

            if (spikeCount >= FAILED_TASK_SPIKE_THRESHOLD) {
                console.warn(`🚨🚨🚨 偵測到失敗任務暴增！過去 ${FAILED_TASK_SPIKE_WINDOW_HOURS} 小時內有 ${spikeCount} 筆失敗任務。`);
                await sendSystemAlertEmail(
                    '失敗任務數量異常',
                    `系統偵測到在過去 ${FAILED_TASK_SPIKE_WINDOW_HOURS} 小時內，累積了 ${spikeCount} 筆失敗的推播任務，已超過 ${FAILED_TASK_SPIKE_THRESHOLD} 筆的警戒值。\n\n請登入後台檢查 Worker 紀錄檔及「失敗任務管理」以了解詳細原因。`
                );
                
                isAlertCooldown = true;
                setTimeout(() => {
                    isAlertCooldown = false;
                    console.log('ℹ️ 智慧警報冷卻時間結束，恢復偵測。');
                }, ALERT_COOLDOWN_MS);
            }
        }

    } catch (e) {
        console.error('❌ 健康檢查時發生錯誤:', e);
    } finally {
        db.release();
        lastHealthCheck = Date.now();
    }
}

async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動... V38.1 (詳單改為CSV附件)');
  while (true) {
    if (isShuttingDown) {
        console.log('🛑 收到關閉信號，停止抓取新任務...');
        break;
    }

    const now = Date.now();

    if (now - lastBackup > BACKUP_INTERVAL_MS) {
        await performDatabaseBackup();
        lastBackup = now;
    }
    
    if (now - lastCombinedPointsReport > POINTS_REPORT_INTERVAL_MS) {
        await performDailyPointsCombinedReport();
        lastCombinedPointsReport = now;
    }

    if (now - lastDataCleanup > DATA_CLEANUP_INTERVAL_MS) {
        await performDataCleanup();
        lastDataCleanup = now;
    }
    
    if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
        await performHealthCheck();
    }
    
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
