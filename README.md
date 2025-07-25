# 九容瑜伽 LINE Bot
基本回覆功能設定
整體架構
目標： 提高程式碼的組織性、可讀性和可維護性。
 * 分離設定檔：
   * config.js: 放置所有常數 (COMMANDS, MESSAGES, BANK_INFO 等)。
   * menus.js: 放置所有的 Flex Message 模板和 Quick Reply 選單定義。
 * 分離資料庫操作：
   * db.js: 封裝所有與 PostgreSQL 互動的函式 (CRUD 操作，如 getUser, saveUser, getAllCourses 等)。
 * 分離 Line Bot 輔助函式：
   * lineUtils.js: 放置 reply, push 等 Line 訊息發送相關的輔助函式。
 * 分離指令處理邏輯：
   * handlers/teacherHandlers.js: 處理所有老師相關的指令邏輯。
   * handlers/studentHandlers.js: 處理所有學員相關的指令邏輯。
   * handlers/commonHandlers.js: 處理共用指令 (例如狀態切換)。
 * 主程式 (index.js 或 app.js): 負責初始化、事件監聽，並將請求分派給對應的處理器。
