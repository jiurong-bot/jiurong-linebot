// update_courses_cron.js

const { Client } = require('pg'); // 引入 PostgreSQL 客戶端
const { addWeeks, format, isBefore, parseISO, startOfDay } = require('date-fns'); // 引入 date-fns 相關函式
const { zhTW } = require('date-fns/locale'); // 引入繁體中文語系包

// 從環境變數獲取資料庫連線資訊
// Render 會自動將您在服務中設定的環境變數注入
const DB_CONFIG = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } // 如果您的 Render 資料庫需要 SSL
};

// ===========================================
// 主要更新邏輯
// ===========================================
async function updateWeeklyCourses() {
    const pgClient = new Client(DB_CONFIG);

    try {
        await pgClient.connect(); // 連接資料庫
        console.log('資料庫連接成功，開始檢查並更新週期性課程...');

        // 1. 查詢所有「已過期」且符合特定條件的週期性課程
        // 這裡的邏輯需要您根據實際的「週期性課程」設計來調整。
        // 假設我們尋找那些「上課時間已過」，並且是「某個週期性模板」的課程。
        // 更完善的做法是：從 `recurring_course_templates` 讀取模板，然後根據模板生成或更新 `courses`。
        // 但為了簡化，先假設 `courses` 表裡有一個 `is_recurring` 標誌或 `template_id` 欄位。

        // 這裡我們假設查找所有過去的，且有 `template_id` 的課程，並將其更新到下週
        // 注意：這是一個簡化邏輯。更推薦的做是「從模板生成新的課程」而非「更新舊課程」。
        // 因為更新舊課程會導致歷史記錄錯亂。
        // 【最佳實踐】: 這個腳本應該是「**根據 `recurring_course_templates` 表，生成未來 N 週的課程實例**」
        // 而不是更新舊的單次課程。

        // 以下是【生成未來課程實例】的邏輯草稿：
        const today = startOfDay(new Date()); // 今天開始的時間

        // 獲取所有週期性課程模板
        const { rows: templates } = await pgClient.query(
            `SELECT template_id, title, weekday, start_time, capacity, points_cost, end_date, creator_id
             FROM recurring_course_templates
             WHERE end_date >= $1;`,
            [today.toISOString()] // 確保只查詢未結束的模板
        );

        for (const template of templates) {
            const { template_id, title, weekday, start_time, capacity, points_cost, end_date, creator_id } = template;
            console.log(`處理週期性模板: ${title} (Template ID: ${template_id})`);

            // 假設我們要生成未來 8 週的課程
            for (let i = 0; i < 8; i++) {
                // 計算下一週的具體日期
                // 注意：這裡需要根據模板的 weekday 和 start_time 來精確計算
                // 這個邏輯會比單純的 addWeeks 複雜一些，需要考慮到是哪個星期幾
                
                // 找到最近的那個目標星期幾的日期
                let targetDate = new Date(); // 從今天開始算
                targetDate = addWeeks(targetDate, i); // 先跳到第 i 週

                // 調整到正確的星期幾 (0=週日, 1=週一...6=週六)
                // date-fns 的 getDay() 回傳 0-6
                const currentDayOfWeek = targetDate.getDay();
                const diff = (weekday - currentDayOfWeek + 7) % 7;
                targetDate.setDate(targetDate.getDate() + diff);
                
                // 將時間設定為模板的 start_time
                const [hour, minute, second] = start_time.split(':').map(Number);
                targetDate.setHours(hour, minute, second, 0);

                // 確保課程日期沒有超過模板的結束日期
                if (isBefore(targetDate, today) || isBefore(template.end_date, targetDate)) {
                    // 如果日期已在過去，或者超出了模板的結束日期，則跳過
                    continue;
                }

                const courseTime = targetDate.toISOString(); // 轉換為 ISO 格式儲存

                // 檢查這堂課是否已經存在於 courses 表中
                const existingCourse = await pgClient.query(
                    `SELECT id FROM courses WHERE template_id = $1 AND time = $2;`,
                    [template_id, courseTime]
                );

                if (existingCourse.rows.length === 0) {
                    // 如果不存在，則插入新的課程實例
                    const courseId = `C${Date.now()}`; // 簡單生成一個課程 ID
                    await pgClient.query(
                        `INSERT INTO courses (id, title, time, capacity, points_cost, students, waiting, template_id, is_canceled_instance)
                         VALUES ($1, $2, $3, $4, $5, '{}', '{}', $6, FALSE);`,
                        [courseId, title, courseTime, capacity, points_cost, template_id]
                    );
                    console.log(`  > 生成新課程: ${title} - ${format(targetDate, 'yyyy-MM-dd HH:mm', { locale: zhTW})}`);
                } else {
                    // console.log(`  > 課程已存在: ${title} - ${format(targetDate, 'yyyy-MM-dd HH:mm', { locale: zhTW})}`);
                }
            }
        }

        console.log('週期性課程檢查與更新完成。');

    } catch (error) {
        console.error('執行週期性課程更新時發生錯誤:', error);
        // 在生產環境中，您可能還會想發送警報（例如 email, Slack 訊息）
    } finally {
        await pgClient.end(); // 關閉資料庫連接
    }
}

// 執行主要函式
updateWeeklyCourses();

