// jobs.js
const { default: fetch } = require('node-fetch');
const { 
  pgPool, 
  getAllCourses, 
  push, 
  formatDateTime,
  ONE_DAY_IN_MS,
  SELF_URL
} = require('./utils');

const sentReminders = {};

// 定期刪除一天前的舊課程
async function cleanCoursesDB() {
  const now = Date.now();
  try {
    const result = await pgPool.query(`DELETE FROM courses WHERE time < $1`, [new Date(now - ONE_DAY_IN_MS)]);
    if (result.rowCount > 0) {
      console.log(`🧹 定期清理：刪除了 ${result.rowCount} 筆過期課程。`);
    }
  } catch (err) {
    console.error('❌ 定期清理課程時發生錯誤:', err.stack);
  }
}

// 檢查並發送一小時內課程的提醒
async function checkAndSendReminders() {
    const ONE_HOUR_IN_MS = 3600000;
    const now = Date.now();
    try {
        const courses = await getAllCourses();
        const usersRes = await pgPool.query('SELECT id, name FROM users');
        const dbUsersMap = new Map(usersRes.rows.map(u => [u.id, u]));
        
        for (const id in courses) {
            const course = courses[id];
            const courseTime = new Date(course.time).getTime();
            const timeUntilCourse = courseTime - now;
            const minTimeForReminder = ONE_HOUR_IN_MS - (5 * 60 * 1000); // 55分鐘前
            
            if (timeUntilCourse > 0 && timeUntilCourse <= ONE_HOUR_IN_MS && timeUntilCourse >= minTimeForReminder && !sentReminders[id]) {
                for (const studentId of course.students) {
                    if (dbUsersMap.has(studentId)) {
                        push(studentId, `🔔 提醒：您預約的課程「${course.title}」將於 1 小時內開始！\n時間：${formatDateTime(course.time)}`).catch(e => console.error(`   ❌ 向學員 ${studentId} 發送提醒失敗:`, e.message));
                    }
                }
                sentReminders[id] = true;
                console.log(`✉️ 已發送課程「${course.title}」的上課提醒。`);
            }
        }
        
        // 清理舊的提醒紀錄
        for (const id in sentReminders) { 
            if (!courses[id] || (new Date(courses[id].time).getTime() < (now - ONE_DAY_IN_MS))) {
                delete sentReminders[id];
            }
        }
    } catch (err) { 
        console.error('❌ 自動提醒功能發生錯誤:', err.stack); 
    }
}

// Ping 自身以保持服務喚醒 (Keep-alive)
function keepAlive() {
  if (SELF_URL && SELF_URL !== 'https://你的部署網址/') {
    fetch(SELF_URL)
      .then(res => {
        if (res.ok) {
          console.log(`Keep-alive ping 成功，狀態碼: ${res.status}`);
        } else {
          console.warn(`Keep-alive ping 收到非成功狀態碼: ${res.status}`);
        }
      })
      .catch((err) => console.error('❌ Keep-alive ping 失敗:', err.message));
  }
}

module.exports = {
  cleanCoursesDB,
  checkAndSendReminders,
  keepAlive
};
