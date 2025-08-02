1. utils.js (公用程式模組)
 * 職責 (Responsibility)：
   作為一個集中化的模組，提供整個應用程式共享的設定、常數、客戶端實例以及通用的輔助函式。它的目標是消除程式碼重複，並將底層的實作細節與主邏輯分離。
 * 內容 (Contents)：
   * 組態與常數：定義如 COMMANDS、PURCHASE_PLANS 等不會變動的資料，以及讀取 .env 檔案中的環境變數。
   * 客戶端實例 (Client Instances)：初始化並導出 LINE Bot SDK 的 client 和 PostgreSQL 的 pgPool。這確保了整個應用程式共享同一個連線池和客戶端，提高效率。
   * 資料庫存取層 (Database Access Layer)：包含所有與資料庫互動的函式，如 getUser, saveCourse。主程式 index.js 只需呼叫這些語意清晰的函式，而不需要直接撰寫 SQL 查詢語句。
   * 通用輔助函式 (Helper Functions)：提供與特定業務流程無關的通用功能，例如 reply、push 用於發送訊息，formatDateTime 用於格式化時間。
 * 架構角色 (Architectural Role)：
   此檔案是基礎模組。index.js 和 jobs.js 都依賴它，但它不依賴專案中任何其他檔案，形成一個單向的依賴關係，讓架構更清晰。
2. jobs.js (背景任務模組)
 * 職責 (Responsibility)：
   封裝所有需要依據時間排程、在背景自動執行的任務。這些任務的執行與否，和是否有使用者傳送訊息無關。
 * 內容 (Contents)：
   * 排程函式：包含 checkAndSendReminders（發送上課提醒）、cleanCoursesDB（清理過期課程）等具體任務的邏輯。
   * 任務狀態管理：包含與任務相關的狀態變數，例如 sentReminders 物件，用來追蹤哪些提醒已經發送，避免重複。
 * 架構角色 (Architectural Role)：
   此檔案負責所有非同步、定時的背景處理。它從 utils.js 引入所需的資料庫函式或通訊函式。任務的啟動與排程（使用 setInterval）由主程式 index.js 負責。
3. index.js (應用程式進入點與控制器)
 * 職責 (Responsibility)：
   作為應用程式的主進入點 (Entry Point) 和控制器 (Controller)。它負責啟動伺服器、接收與驗證來自 LINE 平台的請求，並根據請求內容協調整個應用程式的商業邏輯。
 * 內容 (Contents)：
   * 伺服器初始化：設定 express 應用、定義 middleware、綁定 PORT 並啟動伺服器 (app.listen)。
   * Webhook 路由：定義 /webhook 端點，這是接收所有 LINE 事件的入口。
   * 商業邏輯與流程控制：包含 handleEvent, handleTeacherCommands, handleStudentCommands 等核心函式。它們解析使用者輸入，執行對應的商業邏輯。
   * 對話狀態管理：透過 pending... 系列物件，管理使用者在多步驟操作中的對話狀態。
   * 任務調度：引入 jobs.js 中的函式，並使用 setInterval 來設定它們的執行週期。
 * 架構角色 (Architectural Role)：
   此檔案是最高層的協調者。它將 utils.js 提供的工具和 jobs.js 提供的背景任務整合在一起，管理著應用程式的生命週期以及核心的「請求-回應」循環。
