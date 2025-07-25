// config.js

const COMMANDS = {
    // 學員指令
    STUDENT: {
        MAIN_MENU: '@學員主選單',
        BOOK_COURSE: '@預約課程',
        MY_COURSES: '@我的課程',
        POINT_FUNCTIONS: '@點數功能',
        PURCHASE_POINTS: '@購買點數',
        CHECK_POINTS: '@查詢點數',
        PURCHASE_HISTORY: '@購點歷史',
        CANCEL_PURCHASE: '@取消購點',
        BACK_TO_POINT_FUNCTIONS: '@返回點數功能', // 新增：返回點數功能的指令
        // 後台會發送的 postback action
        ACTION_BOOK_COURSE_CONFIRM: 'action=book_course_confirm',
        ACTION_CANCEL_BOOKING_CONFIRM: 'action=cancel_booking_confirm',
        ACTION_CONFIRM_PURCHASE: 'action=confirm_purchase',
        ACTION_REJECT_PURCHASE: 'action=reject_purchase',
    },
    // 老師指令
    TEACHER: {
        MAIN_MENU: '@老師主選單',
        POINT_MANAGEMENT: '@點數管理',
        COURSE_MANAGEMENT: '@課程管理',
        REPORT: '@統計報表',
        SEARCH_STUDENT: '@查詢學員', // 後面跟著學員名稱或 ID
        PENDING_ORDERS: '@待確認訂單',
        MANUAL_ADJUST_POINTS: '@手動調整點數',
        CANCEL_MANUAL_ADJUST: '@返回點數管理', // 取消手動調整點數的指令
        ADD_COURSE: '@新增課程', // 新增課程的指令
        CANCEL_COURSE: '@取消課程', // 取消課程的指令
        COURSE_LIST: '@課程列表', // 顯示課程列表的指令
        // 後台會發送的 postback action
        ACTION_CONFIRM_ORDER: 'action=confirm_order',
        ACTION_REJECT_ORDER: 'action=reject_order',
        ACTION_ADD_COURSE_START: 'action=add_course_start',
        ACTION_CANCEL_COURSE_CONFIRM: 'action=cancel_course_confirm',
        ACTION_ADD_COURSE_CONFIRM: 'action=add_course_confirm',
    },
    // 共用指令
    COMMON: {
        BACK: '@返回', // 可以用作通用返回
    }
};

const MESSAGES = {
    STUDENT: {
        POINTS_NOT_ENOUGH: (cost, current) => `您的點數不足，此課程需要 ${cost} 點，您目前有 ${current} 點。請先購買點數。`,
        COURSE_ALREADY_BOOKED: '您已經預約此課程了。',
        COURSE_ALREADY_WAITING: '您已在該課程的候補名單中，請耐心等待。',
        COURSE_EXPIRED: '該課程已過期，無法預約。',
        COURSE_NOT_FOUND: '找不到該課程，或課程已不存在。',
        NO_NEW_COURSES: '目前沒有您可以預約的新課程。',
        NO_MY_COURSES: '您目前沒有任何已預約或候補中的未來課程。',
        CANCEL_BOOKING_TOO_LATE: (title) => `課程「${title}」即將開始，距離上課時間已不足 8 小時，無法取消退點。`,
        PURCHASE_LAST5_INVALID: '您輸入的匯款帳號後五碼格式不正確，請輸入五位數字。',
        PURCHASE_ORDER_INVALID: '此訂單狀態不正確或已處理，請重新開始購點流程。',
        PURCHASE_CONFIRM_PROMPT: (points, amount) => `您選擇了購買 ${points} 點，共 ${amount} 元。請確認。`,
        PURCHASE_COMPLETE_PROMPT: (orderId, bankInfo) => `✅ 已確認購買，請先完成轉帳。\n\n戶名：${bankInfo.accountName}\n銀行：${bankInfo.bankName}\n帳號：${bankInfo.accountNumber}\n\n完成轉帳後，請再次進入「點數功能」查看新的匯款提示卡片，並輸入您的匯款帳號後五碼。\n\n您的訂單編號為：${orderId}`,
        CANCEL_PURCHASE_NO_PENDING: '目前沒有待取消的購點訂單。',
        PURCHASE_HISTORY_EMPTY: '您目前沒有點數相關記錄。',
        NO_PENDING_ORDER_FOR_LAST5_INPUT: '目前沒有需要輸入或修改匯款後五碼的待確認訂單。',
        PURCHASE_AMOUNT_INVALID: '輸入的購點數量無效，請輸入正整數。',
        PURCHASE_PENDING_EXISTS: '您有尚未完成的購點訂單，請先完成或取消。',
    },
    TEACHER: {
        COURSE_NOT_FOUND: '找不到該課程，可能已被取消。',
        MANUAL_ADJUST_FORMAT_ERROR: '指令格式錯誤。\n請輸入：學員姓名/ID [空格] 點數\n例如：王小明 5\n或\nU123abc -2\n\n輸入 @返回點數管理 取消。',
        MANUAL_ADJUST_INVALID_POINTS: '點數數量必須是非零整數。',
        MANUAL_ADJUST_STUDENT_NOT_FOUND: (query) => `找不到學員：${query}。`,
        MANUAL_ADJUST_INSUFFICIENT_POINTS: (name) => `學員 ${name} 點數不足。`,
        PENDING_ORDERS_EMPTY: '目前沒有待確認的購點訂單。',
        ORDER_NOT_FOUND_OR_INVALID: '找不到此筆待確認訂單或訂單狀態不正確。',
        STUDENT_NOT_FOUND_FOR_ORDER: (userId) => `找不到購點學員 (ID: ${userId}) 的資料。`,
        ADD_COURSE_PROMPT_1: '請輸入課程名稱：',
        ADD_COURSE_PROMPT_2: '請輸入課程時間 (格式：YYYY-MM-DD HH:MM)：',
        ADD_COURSE_PROMPT_3: '請輸入課程所需點數：',
        ADD_COURSE_PROMPT_4: '請輸入課程容量 (人數)：',
        ADD_COURSE_CONFIRM: (title, time, points, capacity) => `請確認課程資訊：\n名稱：${title}\n時間：${time}\n點數：${points}\n容量：${capacity}\n\n輸入 @老師主選單 取消，或輸入「確認新增」完成。`,
        ADD_COURSE_SUCCESS: (title) => `✅ 課程「${title}」已成功新增。`,
        ADD_COURSE_INVALID_TIME: '課程時間格式不正確，請使用 YYYY-MM-DD HH:MM 格式。',
        ADD_COURSE_INVALID_POINTS_CAPACITY: '點數和容量必須是正整數。',
        ADD_COURSE_CANCELLED: '已取消新增課程。',
        COURSE_CANCEL_CONFIRM: (title) => `確定要取消課程「${title}」嗎？取消後，已報名的學員將自動退點並收到通知。`,
        COURSE_CANCEL_SUCCESS: (title) => `✅ 課程「${title}」已成功取消。`,
    },
    COMMON: {
        RETURN_MAIN_MENU: '已返回主選單。',
        OPERATION_CANCELLED: '操作已取消。',
        INVALID_COMMAND: '指令無效，請使用下方選單或輸入正確指令。',
        SYSTEM_ERROR: '系統發生錯誤，請稍後再試。',
        DATABASE_ERROR: '資料庫操作失敗，請稍後再試。',
        TRANSACTION_FAILED: '操作失敗，資料庫發生錯誤，請稍後再試。',
        PERMISSION_DENIED: '您沒有權限執行此操作。',
    }
};

const BANK_INFO = {
    accountName: '王小明', // 你的戶名
    bankName: 'OO銀行', // 你的銀行名稱
    accountNumber: '1234567890123' // 你的銀行帳號
};

const POINTS_PACKAGES = [
    { points: 10, amount: 1000 },
    { points: 25, amount: 2000 },
    { points: 60, amount: 4500 }
];

module.exports = {
    COMMANDS,
    MESSAGES,
    BANK_INFO,
    POINTS_PACKAGES,
};
