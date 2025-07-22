// commands.js
const COMMANDS = {
  // 通用指令
  SWITCH_ROLE: '切換身份',

  // 老師指令
  TEACHER: {
    MAIN_MENU: '老師主選單',
    COURSE_MANAGEMENT: '課程管理',
    ADD_COURSE: '新增課程',
    CANCEL_COURSE: '取消課程',
    VIEW_COURSES: '查看課程表', // 老師查看所有課程
    POINT_MANAGEMENT: '點數管理',
    MANUAL_ADJUST_POINTS: '手動調整點數',
    CANCEL_MANUAL_ADJUST: '返回點數管理', // 調整點數流程中的取消
    VIEW_PENDING_PURCHASES: '查看待確認購點',
    LIST_STUDENTS: '學生列表',
  },

  // 學員指令
  STUDENT: {
    MAIN_MENU: '學員主選單',
    VIEW_COURSES: '課程報名', // 學員查看可報名課程
    MY_COURSES: '我的課程',
    VIEW_POINTS: '剩餘點數',
    BUY_POINTS: '購買點數',
    POINTS_MENU: '點數查詢',
    VIEW_PURCHASE_HISTORY: '購點紀錄',
    RETURN_POINTS_MENU: '返回點數相關功能', // 購點流程中的取消/返回
    CONFIRM_ADD_COURSE: '確認建立課程', // 新增課程確認
    CANCEL_ADD_COURSE: '取消新增課程', // 新增課程取消
    CONFIRM_BUY_POINTS: '確認購買點數', // 購買點數確認
    CANCEL_PURCHASE: '取消購買', // 購買點數取消
  },
};

module.exports = COMMANDS;
