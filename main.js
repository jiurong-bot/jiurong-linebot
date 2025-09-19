// main.js (這是我們新的統一入口)

// 引入我們剛剛從其他檔案匯出的兩個啟動函式
const startServer = require('./server');
const startWorker = require('./startworker');

console.log('🚀 正在啟動整合服務...');

// 依次執行這兩個函式
startServer();
startWorker();

console.log('✅ 所有服務均已啟動！');
