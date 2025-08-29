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
            return; // 沒有過
