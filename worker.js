// worker.js - V5.1 (邏輯修正與一致性同步)
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
  ssl: { rejectUnauthorized: false },
  max: parseInt(process.env.DB_POOL_SIZE) || 20
});

// --- 常數設定 ---
const MAX_RETRIES = 3;
const WORKER_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_PUSH_MS = 500;
const RETRY_DELAY_MINUTES = 5;
const HEALTH_CHECK_INTERVAL_MS = 1000 * 60 * 5;
const STUCK_TASK_TIMEOUT_MINUTES = 10;
const BACKUP_INTERVAL_MS = 1000 * 60 * 60 * 24 * 7;
const POINTS_REPORT_INTERVAL_MS = 1000 * 60 * 60 * 24;
const WAITLIST_CHECK_INTERVAL_MS = 1000 * 60;
const DATA_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24;
const FAILED_TASK_RETENTION_DAYS = 180;
const WAITLIST_NOTIFICATION_RETENTION_DAYS = 90;
const ERROR_LOG_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24;
const ERROR_LOG_RETENTION_DAYS = 90;
const FAILED_TASK_SPIKE_THRESHOLD = 10;
const FAILED_TASK_SPIKE_WINDOW_HOURS = 1;
const ERROR_LOG_SPIKE_THRESHOLD = 5;
const ERROR_LOG_SPIKE_WINDOW_HOURS = 1;
const ALERT_COOLDOWN_MS = 1000 * 60 * 60 * 6;
const CANCEL_ORDERS_INTERVAL_MS = 1000 * 60 * 60;
const COURSE_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 6;

const MAIL_TO = 'lunatang.yoga@gmail.com';
const MAIL_FROM = process.env.GMAIL_ACCOUNT;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const TEACHER_ID = process.env.TEACHER_ID;

// --- 狀態變數 ---
let isShuttingDown = false;
let lastHealthCheck = 0;
let lastBackup = 0;
let lastWaitlistCheck = 0;
let lastDataCleanup = 0; 
let lastErrorLogCleanup = 0;
let lastCombinedPointsReport = 0;
let isAlertCooldown = false;
let lastOrderCancel = 0;
let lastCourseCleanup = 0;

// =======================================================
// [程式夥伴新增] 從 index.js 複製過來的通用函式庫，確保邏輯一致
// =======================================================
const simpleCache = {
  _cleanupTimer: null,
  _cache: new Map(),
  set(key, value, ttlMs) {
    const expires = Date.now() + ttlMs;
    this._cache.set(key, { value, expires });
  },
  get(key) {
    const entry = this._cache.get(key);
    if (entry && Date.now() < entry.expires) {
      return entry.value;
    }
    if (entry) {
        this._cache.delete(key);
    }
    return null;
  },
  startCleanup(intervalMs = 60000) {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this._cache.entries()) {
        if (entry.expires < now) {
          this._cache.delete(key);
        }
      }
    }, intervalMs);
  },
  stopCleanup() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
  },
  clear(key) {
    this._cache.delete(key);
  }
};

async function getGlobalNotificationSettings() {
    const cacheKey = 'global_notification_settings';
    const cachedSettings = simpleCache.get(cacheKey);
    if (cachedSettings) {
        return cachedSettings;
    }
    const settings = {
        admin_notifications_enabled: true,
        teacher_notifications_enabled: true,
        student_notifications_enabled: true,
        admin_failed_task_alert_enabled: true,
        teacher_class_reminder_24hr: true,
        teacher_new_order: true,
        teacher_new_message: true,
        student_class_reminder_1hr: true,
        student_order_result: true,
        student_message_reply: true,
        student_welcome_message: true,
        student_new_announcement: true
    };
    const allSettingKeys = [
        'admin_notifications_enabled', 'teacher_notifications_enabled', 'student_notifications_enabled',
        'admin_failed_task_alert_enabled',
        'teacher_class_reminder_24hr_enabled', 'teacher_new_order_enabled', 'teacher_new_message_enabled',
        'student_class_reminder_1hr_enabled', 'student_order_result_enabled', 'student_message_reply_enabled',
        'student_welcome_message_enabled', 'student_new_announcement_enabled'
    ];
    await executeDbQuery(async (db) => {
        const res = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ANY($1::text[])", [allSettingKeys]);
        const dbSettings = new Map(res.rows.map(row => [row.setting_key, row.setting_value === 'true']));
        settings.admin_notifications_enabled = dbSettings.get('admin_notifications_enabled') ?? true;
        settings.teacher_notifications_enabled = dbSettings.get('teacher_notifications_enabled') ?? true;
        settings.student_notifications_enabled = dbSettings.get('student_notifications_enabled') ?? true;
        settings.admin_failed_task_alert_enabled = dbSettings.get('admin_failed_task_alert_enabled') ?? true;
        settings.teacher_class_reminder_24hr = dbSettings.get('teacher_class_reminder_24hr_enabled') ?? true;
        settings.teacher_new_order = dbSettings.get('teacher_new_order_enabled') ?? true;
        settings.teacher_new_message = dbSettings.get('teacher_new_message_enabled') ?? true;
        settings.student_class_reminder_1hr = dbSettings.get('student_class_reminder_1hr_enabled') ?? true;
        settings.student_order_result = dbSettings.get('student_order_result_enabled') ?? true;
        settings.student_message_reply = dbSettings.get('student_message_reply_enabled') ?? true;
        settings.student_welcome_message = dbSettings.get('student_welcome_message_enabled') ?? true;
        settings.student_new_announcement = dbSettings.get('student_new_announcement_enabled') ?? true;
    });
    simpleCache.set(cacheKey, settings, 60000);
    return settings;
}
// =======================================================
// END 複製過來的函式庫
// =======================================================


// =======================================================
// 輔助函式
// =======================================================
async function executeDbQuery(queryCallback) {
  const client = await pgPool.connect();
  try {
    return await queryCallback(client);
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function getNotificationStatus() {
    let isEnabled = true; // 預設為 true，以防資料庫查詢失敗時卡住所有通知
    try {
        await executeDbQuery(async (db) => {
            const res = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'notifications_enabled'");
            if (res.rows.length > 0) {
                isEnabled = res.rows[0].setting_value === 'true';
            }
        });
    } catch (err) {
        console.error('❌ Worker 讀取推播設定失敗:', err);
    }
    return isEnabled;
}

// [程式夥伴新增] 從 index.js 複製過來的完整版 enqueuePushTask
async function enqueuePushTask(recipientId, message, { sendAt = null, settingKey = null } = {}) {
  const isSystemRecipient = [TEACHER_ID, ADMIN_USER_ID].includes(recipientId);
  if (isSystemRecipient) {
      const notificationsEnabled = await getNotificationStatus();
      if (!notificationsEnabled) {
          console.log(`[DEV MODE] 系統推播功能已關閉，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  } 
  else if (settingKey) {
      const settings = await getGlobalNotificationSettings();
      if (!settings[settingKey]) {
          console.log(`[Push Blocked] 因使用者設定 (${settingKey})，已阻擋傳送給 ${recipientId} 的通知。`);
          return;
      }
  }
  
  try {
    await executeDbQuery(async (db) => {
        const messagePayload = Array.isArray(message) ? message : [message];
        const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
        if (validMessages.length === 0) {
            console.error(`[enqueuePushTask] 嘗試為 ${recipientId} 加入無效的訊息 payload`, message);
            return;
        }

        const sendTimestamp = sendAt instanceof Date ? sendAt.toISOString() : new Date().toISOString();

        const dupCheck = await db.query(
          `SELECT 1 FROM tasks WHERE recipient_id=$1 AND message_payload=$2 AND send_at=$3 LIMIT 1`,
          [recipientId, JSON.stringify(validMessages), sendTimestamp]
        );
        if (dupCheck.rows.length > 0) {
          console.log(`[enqueuePushTask] 偵測到重複任務，已跳過 ${recipientId}`);
          return;
        }

        await db.query(
          `INSERT INTO tasks (recipient_id, message_payload, send_at) VALUES ($1, $2, $3)`,
          [recipientId, JSON.stringify(validMessages), sendTimestamp]
        );
    });
  } catch (err) {
    console.error(`❌ enqueuePushTask 寫入任務失敗 for ${recipientId}:`, err);
  }
}

// [程式夥伴修正] 從 index.js 複製過來的完整版 enqueueBatchPushTasks
async function enqueueBatchPushTasks(tasks, { settingKey = null } = {}) {
  if (!tasks || tasks.length === 0) {
    return;
  }

  if (settingKey) {
    const settings = await getGlobalNotificationSettings();
    if (!settings[settingKey]) {
        console.log(`[Push Blocked] 因使用者設定 (${settingKey})，已阻擋此批次通知。`);
        return;
    }
  }

  const systemRecipients = [TEACHER_ID, ADMIN_USER_ID];
  let tasksToEnqueue = tasks;
  if (tasks.some(t => systemRecipients.includes(t.recipientId))) {
    const notificationsEnabled = await getNotificationStatus();
    if (!notificationsEnabled) {
      console.log(`[DEV MODE] 系統推播功能已關閉，已過濾掉傳送給老師/管理員的批次通知。`);
      tasksToEnqueue = tasks.filter(t => !systemRecipients.includes(t.recipientId));
      if (tasksToEnqueue.length === 0) return;
    }
  }

  try {
    const recipientIds = [];
    const messagePayloads = [];
    const sendTimestamps = [];
    const now = new Date().toISOString();
    
    tasksToEnqueue.forEach(task => {
      const messagePayload = Array.isArray(task.message) ? task.message : [task.message];
      const validMessages = messagePayload.filter(m => typeof m === 'object' && m !== null && m.type);
      if (validMessages.length > 0) {
        recipientIds.push(task.recipientId);
        messagePayloads.push(JSON.stringify(validMessages));
        sendTimestamps.push(now);
      } else {
        console.error(`[enqueueBatchPushTasks] 嘗試為 ${task.recipientId} 加入無效的訊息 payload`, task.message);
      }
    });

    if (recipientIds.length === 0) return;

    await executeDbQuery(async (db) => {
      await db.query(
        `INSERT INTO tasks (recipient_id, message_payload, send_at)
         SELECT * FROM unnest($1::text[], $2::jsonb[], $3::timestamp[])`,
        [recipientIds, messagePayloads, sendTimestamps]
      );
    });
  } catch (err) {
    console.error(`❌ enqueueBatchPushTasks 批次寫入任務失敗:`, err);
  }
}


// =======================================================
// 定期任務
// =======================================================
async function cancelExpiredPendingOrders() {
    try {
        await executeDbQuery(async (client) => {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000); // 24 hours
            const res = await client.query(
                "DELETE FROM orders WHERE status = 'pending_payment' AND timestamp < $1 RETURNING user_id, order_id, user_name",
                [twentyFourHoursAgo]
            );

            if (res.rows.length > 0) {
                console.log(`🧹 [Worker] 已自動取消 ${res.rows.length} 筆逾時訂單。`);
                const notificationTasks = res.rows.map(order => ({
                    recipientId: order.user_id,
                    message: { 
                        type: 'text', 
                        text: `訂單取消通知：\n您的訂單 (ID: ...${order.order_id.slice(-6)}) 因超過24小時未完成付款，系統已自動為您取消。\n如有需要請重新購買，謝謝。` 
                    }
                }));
                // [程式夥伴修正] 加上 settingKey，確保尊重用戶設定
                await enqueueBatchPushTasks(notificationTasks, { settingKey: 'student_order_result' });
            }
        });
    } catch (err) {
        console.error("❌ [Worker] 自動取消逾時訂單時發生錯誤:", err);
    }
}

async function cleanCoursesDB() {
    try {
        await executeDbQuery(async (client) => {
            const oneDayAgo = new Date(Date.now() - 86400000); // 1 day
            const result = await client.query(`DELETE FROM courses WHERE time < $1`, [oneDayAgo]);
            if (result.rowCount > 0) {
              console.log(`🧹 [Worker] 定期清理：已成功移除 ${result.rowCount} 筆過期的課程。`);
            }
        });
    } catch (err) {
        console.error('❌ [Worker] 定期清理過期課程時發生錯誤:', err);
    }
}

async function performDailyPointsCombinedReport() {
    console.log('📊 開始執行每日學員點數合併報表任務...');
    if (!MAIL_FROM || !GMAIL_APP_PASSWORD) {
        console.error('❌ 報表錯誤：缺少必要的 Gmail 環境變數。');
        return;
    }

    try {
        const students = await executeDbQuery(async (db) => 
            db.query(`
                SELECT id, name, points 
                FROM users 
                WHERE role = 'student' 
                ORDER BY points DESC
            `)
        ).then(res => res.rows);
        
        if (students.length === 0) {
            console.log('📊 目前沒有任何學員資料可供製表。');
            return;
        }

        const totalPoints = students.reduce((sum, s) => sum + s.points, 0);
        const averagePoints = (totalPoints / students.length).toFixed(1);
        const top5 = students.slice(0, 5).map(s => `  - ${s.name}: ${s.points} 點`).join('\n');
        const zeroPointStudents = students.filter(s => s.points === 0).length;
        const reportDate = new Date();
        const reportDateStr = reportDate.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        let reportText = '您好，\n\n這是截至 ' + reportDateStr + ' 的學員點數每日彙總報表。\n\n';
        reportText += '--- 統計摘要 ---\n';
        reportText += '- 總學員數：' + students.length + ' 人\n';
        reportText += '- 點數總流通量：' + totalPoints + ' 點\n';
        reportText += '- 平均持有：' + averagePoints + ' 點/人\n';
        reportText += '- 零點數學員：' + zeroPointStudents + ' 人\n\n';
        reportText += '--- 點數持有 Top 5 ---\n' + top5 + '\n\n';
        reportText += '詳細的全體學員點數清單，請見附件 CSV 檔案。\n\n';
        reportText += '此為系統自動發送，請勿直接回覆。';
        
        students.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        let csvContent = "\uFEFF" + "姓名,剩餘點數,UserID\n";
        students.forEach(student => {
            const studentName = `"${student.name.replace(/"/g, '""')}"`; 
            csvContent += `${studentName},${student.points},${student.id}\n`;
        });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: MAIL_FROM, pass: GMAIL_APP_PASSWORD },
        });
        
        const dateForFilename = reportDate.toISOString().split('T')[0];
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
    }
}

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
async function processExpiredWaitlistInvites() {
    try {
        await executeDbQuery(async (db) => {
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

            const courseIds = Array.from(coursesToProcess.keys());
            if (courseIds.length === 0) {
                await db.query('COMMIT');
                return;
            }

            const coursesRes = await db.query(
             "SELECT * FROM courses WHERE id = ANY($1::text[]) FOR UPDATE SKIP LOCKED",
             [courseIds]
            );
            
            const courseMap = new Map(coursesRes.rows.map(c => [c.id, c]));
            
            for (const courseId of courseIds) {
                const course = courseMap.get(courseId);
                if (!course) continue;

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
                    
                    const invitationMessage = createWaitlistInvitationFlexMessage(course);
                    
                    // [程式夥伴修正] 改為呼叫 enqueuePushTask，確保訊息進入佇列並檢查推播設定
                    await enqueuePushTask(nextUserId, invitationMessage, { settingKey: 'student_new_announcement' });
                    console.log(`[Waitlist] 已為課程 ${courseId} 將新的候補邀請任務加入佇列 (發送給 ${nextUserId})`);
                }
            }

            await db.query('COMMIT');
        });
    } catch (error) {
        if (error.code !== 'ECONNRESET') {
             console.error('❌ 處理過期候補邀請時發生嚴重錯誤:', error);
        }
    }
}

function createWaitlistInvitationFlexMessage(course) {
  const mainTitle = course.title.replace(/ - 第 \d+ 堂$/, '');
  return {
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
        { type: 'button', style: 'secondary', action: { type: 'postback', label: '😭 放棄', data: `action=waitlist_forfeit&course_id=${course.id}` } },
        { type: 'button', style: 'primary', color: '#28a745', action: { type: 'postback', label: '✅ 確認', data: `action=waitlist_confirm&course_id=${course.id}` } }
      ]}
    }
  };
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
    try {
        await executeDbQuery(async (db) => {
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
        });
    } catch (error) {
        console.error('❌ 資料清理時發生錯誤:', error);
    }
}

async function performErrorLogCleanup() {
    console.log('🧹 開始執行錯誤日誌清理任務...');
    try {
        const result = await executeDbQuery(db => 
            db.query(
                `DELETE FROM error_logs 
                 WHERE created_at < NOW() - INTERVAL '${ERROR_LOG_RETENTION_DAYS} days'`
            )
        );
        if (result.rowCount > 0) {
            console.log(`🧹 已成功清理 ${result.rowCount} 筆舊的錯誤日誌。`);
        }
    } catch (error) {
        console.error('❌ 清理錯誤日誌時發生錯誤:', error);
    }
}

// =======================================================
// 核心任務處理邏輯
// =======================================================
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
    try {
        await executeDbQuery(async (db) => {
            await db.query('BEGIN');
            await db.query(
                `INSERT INTO failed_tasks (original_task_id, recipient_id, message_payload, last_error, failed_at) VALUES ($1, $2, $3, $4, NOW())`,
                [task.id, task.recipient_id, task.message_payload, errorMessage]
            );
            await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
            await db.query('COMMIT');
            console.error(`🚨 任務 ${task.id} 已達最大重試次數，移至 Dead Letter Queue。`);
        });
    } catch (e) {
        await executeDbQuery(db => db.query('ROLLBACK'));
        console.error(`❌ 移轉任務 ${task.id} 至 DLQ 失敗:`, e);
        await executeDbQuery(db => db.query(
            "UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2",
            [`DLQ_MOVE_FAILED: ${e.message}`, task.id]
        ));
    }
}

async function performHealthCheck() {
    console.log('🩺 執行健康檢查...');
    try {
        await executeDbQuery(async (db) => {
            const stuckTasksRes = await db.query(
                `UPDATE tasks SET status = 'pending', updated_at = NOW(), last_error = 'Reset by health check' WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '${STUCK_TASK_TIMEOUT_MINUTES} minutes' RETURNING id`
            );
            if (stuckTasksRes.rows.length > 0) {
                const stuckIds = stuckTasksRes.rows.map(r => r.id).join(', ');
                console.warn(`⚠️ 健康檢查：發現並重設了 ${stuckTasksRes.rows.length} 個卡住的任務: ${stuckIds}`);
            }
            
            const healthStatsRes = await db.query(`
                SELECT
                    (SELECT COUNT(*) FROM tasks WHERE status = 'pending' AND send_at <= NOW()) AS backlog_count,
                    (SELECT COUNT(*) FROM failed_tasks WHERE failed_at > NOW() - INTERVAL '${FAILED_TASK_SPIKE_WINDOW_HOURS} hours') AS spike_count,
                    (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '${ERROR_LOG_SPIKE_WINDOW_HOURS} hours') AS error_log_spike_count
            `);
            const stats = healthStatsRes.rows[0];
            const backlogCount = parseInt(stats.backlog_count, 10);
            const spikeCount = parseInt(stats.spike_count, 10);
            const errorLogSpikeCount = parseInt(stats.error_log_spike_count, 10);
            
            if (backlogCount > BATCH_SIZE * 5) {
                 console.warn(`[HEALTH_CHECK_ALERT] 佇列嚴重積壓！目前有 ${backlogCount} 個待辦任務。`);
            }
            
            if (!isAlertCooldown) {
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
                else if (errorLogSpikeCount >= ERROR_LOG_SPIKE_THRESHOLD) {
                    console.warn(`🚨🚨🚨 偵測到一般錯誤日誌暴增！過去 ${ERROR_LOG_SPIKE_WINDOW_HOURS} 小時內有 ${errorLogSpikeCount} 筆錯誤。`);
                    await sendSystemAlertEmail(
                        '系統錯誤日誌數量異常',
                        `系統偵測到在過去 ${ERROR_LOG_SPIKE_WINDOW_HOURS} 小時內，應用程式本身記錄了 ${errorLogSpikeCount} 筆錯誤，已超過 ${ERROR_LOG_SPIKE_THRESHOLD} 筆的警戒值。\n\n這可能表示系統有潛在的不穩定問題，請至管理模式的「查看錯誤日誌」了解詳細原因。`
                    );
                    isAlertCooldown = true;
                    setTimeout(() => {
                        isAlertCooldown = false;
                        console.log('ℹ️ 智慧警報冷卻時間結束，恢復偵測。');
                    }, ALERT_COOLDOWN_MS);
                }
            }
        });
    } catch (e) {
        console.error('❌ 健康檢查時發生錯誤:', e);
    } finally {
        lastHealthCheck = Date.now();
    }
}

// =======================================================
// 主程式迴圈
// =======================================================
async function main() {
  console.log('🚀 背景工作程式 (Worker) 已啟動... V5.1 (邏輯修正與一致性同步)');
  
  // [程式夥伴新增] 啟用快取自動清理
  simpleCache.startCleanup();

  while (true) {
    if (isShuttingDown) {
        console.log('🛑 收到關閉信號，停止抓取新任務...');
        break;
    }

    const now = Date.now();

    if (now - lastWaitlistCheck > WAITLIST_CHECK_INTERVAL_MS) {
        await processExpiredWaitlistInvites();
        lastWaitlistCheck = now;
    }
    
    if (now - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
        await performHealthCheck();
    }
    
    if (now - lastOrderCancel > CANCEL_ORDERS_INTERVAL_MS) {
        await cancelExpiredPendingOrders();
        lastOrderCancel = now;
    }

    if (now - lastCourseCleanup > COURSE_CLEANUP_INTERVAL_MS) {
        await cleanCoursesDB();
        lastCourseCleanup = now;
    }

    if (now - lastDataCleanup > DATA_CLEANUP_INTERVAL_MS) {
        await performDataCleanup();
        lastDataCleanup = now;
    }
    
    if (now - lastErrorLogCleanup > ERROR_LOG_CLEANUP_INTERVAL_MS) {
        await performErrorLogCleanup();
        lastErrorLogCleanup = now;
    }

    if (now - lastCombinedPointsReport > POINTS_REPORT_INTERVAL_MS) {
        await performDailyPointsCombinedReport();
        lastCombinedPointsReport = now;
    }

    if (now - lastBackup > BACKUP_INTERVAL_MS) {
        await performDatabaseBackup();
        lastBackup = now;
    }
      
    let tasks = [];
    try {
      tasks = await executeDbQuery(fetchPendingTasks);
    } catch (e) {
      console.error('從資料庫獲取任務時發生嚴重錯誤:', e);
    }

    if (tasks.length > 0) {
        console.log(`📡 取得 ${tasks.length} 個任務，開始批次處理...`);
        const successfulTaskIds = [];
        const failedTasksToUpdate = [];
        const tasksToMoveToDLQ = [];
        
        const pushPromises = tasks.map(async (task) => {
            if (isShuttingDown) return;
            try {
                await client.pushMessage(task.recipient_id, task.message_payload);
                successfulTaskIds.push(task.id);
            } catch (err) {
                console.error(`❌ 處理任務 ${task.id} API 發送失敗:`, err.message, `(Recipient: ${task.recipient_id})`);
                if (task.retry_count < MAX_RETRIES) {
                    failedTasksToUpdate.push({ id: task.id, message: err.message, retry_count: task.retry_count });
                } else {
                    tasksToMoveToDLQ.push({ task: task, message: err.message });
                }
            }
        });
        
        await Promise.all(pushPromises);
        
        if (isShuttingDown) {
            console.log('🛑 收到關閉信號，已停止後續的資料庫更新。');
            break; 
        }
        
        try {
            await executeDbQuery(async (db) => {
                if (successfulTaskIds.length > 0) {
                    await db.query("UPDATE tasks SET status = 'sent', updated_at = NOW() WHERE id = ANY($1::int[])", [successfulTaskIds]);
                    console.log(`🗂️ 已批次更新 ${successfulTaskIds.length} 筆成功任務的狀態。`);
                }

                for (const failed of failedTasksToUpdate) {
                    const nextRetryMinutes = RETRY_DELAY_MINUTES * (failed.retry_count + 1);
                    await db.query(
                      `UPDATE tasks SET status = 'pending', retry_count = retry_count + 1, last_error = $1, updated_at = NOW(), send_at = NOW() + INTERVAL '${nextRetryMinutes} minutes' WHERE id = $2`,
                       [failed.message, failed.id]
                    );
                    console.log(`🕒 任務 ${failed.id} 將在 ${nextRetryMinutes} 分鐘後重試。`);
                }

                for (const toDLQ of tasksToMoveToDLQ) {
                    await moveTaskToDLQ(toDLQ.task, toDLQ.message);
                }
            });
        } catch(dbError) {
            console.error('❌ 批次更新任務狀態時發生資料庫錯誤:', dbError);
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
    
    // [程式夥伴新增] 關閉快取清理器
    simpleCache.stopCleanup();

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

