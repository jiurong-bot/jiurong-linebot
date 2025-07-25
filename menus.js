// menus.js
const { COMMANDS, POINTS_PACKAGES } = require('./config');

const studentMenu = [
  { type: 'message', label: '預約課程', text: COMMANDS.STUDENT.BOOK_COURSE },
  { type: 'message', label: '我的課程', text: COMMANDS.STUDENT.MY_COURSES },
  { type: 'message', label: '點數功能', text: COMMANDS.STUDENT.POINT_FUNCTIONS },
];

const teacherMenu = [
  { type: 'message', label: '點數管理', text: COMMANDS.TEACHER.POINT_MANAGEMENT },
  { type: 'message', label: '課程管理', text: COMMANDS.TEACHER.COURSE_MANAGEMENT },
  { type: 'message', label: '統計報表', text: COMMANDS.TEACHER.REPORT },
  { type: 'message', label: '查詢學員', text: COMMANDS.TEACHER.SEARCH_STUDENT + ' ' }, // 預留一個空格讓老師輸入學員名稱
];

const pointFunctionsMenu = [
  { type: 'message', label: '購買點數', text: COMMANDS.STUDENT.PURCHASE_POINTS },
  { type: 'message', label: '查詢點數', text: COMMANDS.STUDENT.CHECK_POINTS },
  { type: 'message', label: '購點歷史', text: COMMANDS.STUDENT.PURCHASE_HISTORY },
  { type: 'message', label: '取消購點', text: COMMANDS.STUDENT.CANCEL_PURCHASE },
  { type: 'message', label: '返回主選單', text: COMMANDS.STUDENT.MAIN_MENU },
];

// Flex Message 模板範例 - 購買點數選單
function getPurchasePointsFlexMessage() {
    const bubbles = POINTS_PACKAGES.map(pkg => ({
        type: 'bubble',
        size: 'micro', // 或 'mega', 'giga' 等
        header: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: `${pkg.points} 點`, weight: 'bold', size: 'xxl', color: '#ffffff' },
            { type: 'text', text: `NT$ ${pkg.amount}`, weight: 'bold', size: 'md', color: '#ffffff' }
          ],
          backgroundColor: '#52b69a', paddingAll: 'lg'
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'xl',
          contents: [
            { type: 'text', text: `平均每點 ${Math.round(pkg.amount / pkg.points * 100) / 100} 元`, size: 'sm', align: 'center', color: '#AAAAAA' }
          ],
          justifyContent: 'center', alignItems: 'center', height: '80px'
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
          contents: [
            {
              type: 'button', style: 'primary', color: '#ff9e00', height: 'sm',
              action: {
                type: 'postback',
                label: '立即購買',
                data: `${COMMANDS.STUDENT.ACTION_CONFIRM_PURCHASE}&points=${pkg.points}&amount=${pkg.amount}`,
                displayText: `我要購買 ${pkg.points} 點`
              },
            },
          ],
        },
    }));

    return {
        type: 'flex',
        altText: '選擇您的購點方案',
        contents: { type: 'carousel', contents: bubbles }
    };
}

// 購點待確認 Flex Message 模板
function getPendingPurchaseFlexMessage(order) {
    return {
        type: 'flex',
        altText: `您的購點訂單 #${order.orderId} 待確認`,
        contents: {
            type: 'bubble',
            header: {
                type: 'box', layout: 'vertical',
                contents: [{ type: 'text', text: `待確認訂單 #${order.orderId}`, color: '#ffffff', weight: 'bold', size: 'md' }],
                backgroundColor: '#ff9e00', paddingAll: 'lg'
            },
            body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                    { type: 'text', text: `購買點數: ${order.points} 點`, wrap: true, size: 'sm', weight: 'bold' },
                    { type: 'text', text: `應付金額: $${order.amount}`, wrap: true, size: 'sm', weight: 'bold' },
                    { type: 'text', text: `匯款後五碼: ${order.last5Digits || '尚未輸入'}`, wrap: true, size: 'sm' },
                    { type: 'text', text: `請輸入您的匯款帳號後五碼`, wrap: true, size: 'sm', color: '#AAAAAA' },
                ],
            },
            footer: {
                type: 'box', layout: 'vertical', spacing: 'sm', flex: 0,
                contents: [
                    {
                        type: 'button', style: 'primary', color: '#52b69a', height: 'sm',
                        action: {
                            type: 'message',
                            label: '取消此訂單',
                            text: COMMANDS.STUDENT.CANCEL_PURCHASE
                        },
                    },
                ],
            },
        },
    };
}


module.exports = {
  studentMenu,
  teacherMenu,
  pointFunctionsMenu,
  getPurchasePointsFlexMessage,
  getPendingPurchaseFlexMessage,
  // 這裡可以導出更多的 Flex Message 模板，例如課程列表、購點歷史等
};
