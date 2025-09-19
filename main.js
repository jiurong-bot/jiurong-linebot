// main.js - 新的啟動檔案

// 引入您的既有程式
const startWebServer = require('./server'); // 假設 server.js 導出一個啟動函式
const startWorker = require('./worker.js');   // 假設 worker.js 導出一個啟動函式

console.log("Starting unified application...");

// 1. 啟動網頁伺服器
startWebServer();
console.log("Web Server is running.");

// 2. 啟動背景 Worker
startWorker();
console.log("Background Worker is running.");
