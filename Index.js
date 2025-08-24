async function showAvailableCourses(userId, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const sevenDaysLater = new Date(Date.now() + 7 * CONSTANTS.TIME.ONE_DAY_IN_MS);
        const coursesRes = await client.query(
            `SELECT
                c.*,
                t.name AS teacher_name,
                t.image_url AS teacher_image_url,
    
            t.bio AS teacher_bio,
                COALESCE(array_length(c.waiting, 1), 0) AS waiting_count
             FROM courses c
             LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE c.time > NOW() AND c.time < $1
           
  ORDER BY c.time ASC LIMIT $2 OFFSET $3`,
            [sevenDaysLater, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = coursesRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : coursesRes.rows;

        if (pageCourses.length === 0 && page === 1) {
            return '抱歉，未来 7 天內沒有可預約或候補的課程。';
       
 }
        if (pageCourses.length === 0) {
            return '沒有更多課程了。';
}

        const placeholder_avatar = 'https://i.imgur.com/s43t5tQ.jpeg';
const courseBubbles = pageCourses.map(c => {
            const studentCount = c.students?.length || 0;
            const spotsBookedByUser = (c.students || []).filter(id => id === userId).length;
            const isFull = studentCount >= c.capacity;
            
            const statusComponents = [];
            if 
(spotsBookedByUser > 0) {
                statusComponents.push({ type: 'text', text: `✅ 您已預約 ${spotsBookedByUser} 位`, color: '#28a745', size: 'sm', weight: 'bold', margin: 'md' });
            }

            let courseStatusText;
            let footerButton;

            if (isFull) {
             
   courseStatusText = `候補中 (${c.waiting_count}人)`;
                footerButton = { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '加入候補', data: `action=confirm_join_waiting_list_start&course_id=${c.id}` } };
            } else {
                const remainingSpots = c.capacity - studentCount;
                courseStatusText = `剩餘 ${remainingSpots} 位`;
footerButton = { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '預約此課程', data: `action=select_booking_spots&course_id=${c.id}` }, color: '#52B69A' };
}

            return {
                type: 'bubble', size: 'giga',
                hero: { type: 'image', url: c.teacher_image_url ||
placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'xl', spacing: 'md',
                    contents: [
                        { type: 'text', text: 
getCourseMainTitle(c.title), weight: 'bold', size: 'xl', wrap: true },
                        ...statusComponents,
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: `授課老師：${c.teacher_name ||
'待定'}`, size: 'sm', margin: 'md' },
                        { type: 'text', text: c.teacher_bio ||
'', wrap: true, size: 'xs', color: '#888888', margin: 'xs' },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'sm' },
                        { type: 'text', text: `${c.points_cost} 點`, size: 'sm' },
                        { type: 
'text', text: courseStatusText, size: 'sm' },
                    ]
                },
                footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [footerButton] }
            };
});
        
        const paginationBubble = createPaginationBubble('action=view_available_courses', page, hasNextPage);
        if (paginationBubble) courseBubbles.push(paginationBubble);
        
        const headerText = '🗓️ 7日內可預約課程';
const flexMessage = { type: 'flex', altText: headerText, contents: { type: 'carousel', contents: courseBubbles } };
return page === 1 ? [{ type: 'text', text: `你好！${headerText}如下，請左右滑動查看：` }, flexMessage] : flexMessage;
    });
}
async function showMyCourses(userId, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const res = await client.query(
            `SELECT
                c.*,
                t.name AS teacher_name,
                t.image_url AS teacher_image_url
             FROM courses c
     
        LEFT JOIN teachers t ON c.teacher_id = t.id
             WHERE (
                c.students @> ARRAY[$1]::text[] OR c.waiting @> ARRAY[$1]::text[]
             ) AND c.time > NOW()
             ORDER BY c.time ASC`,
            [userId]
    
    );

        const allCourseCardsData = res.rows.flatMap(c => {
            const cards = [];
            const spotsBookedByUser = (c.students || []).filter(id => id === userId).length;
            const isUserOnWaitingList = (c.waiting || []).includes(userId);

            if (spotsBookedByUser > 0) cards.push({ course: c, type: 'booked', spots: spotsBookedByUser });
       
     if (isUserOnWaitingList) cards.push({ course: c, type: 'waiting' });
            return cards;
        });

        if (allCourseCardsData.length === 0 && page === 1) {
            return '您目前沒有任何已預約或候補中的課程。';
}
        
        const hasNextPage = allCourseCardsData.length > offset + CONSTANTS.PAGINATION_SIZE;
const pageCardsData = allCourseCardsData.slice(offset, offset + CONSTANTS.PAGINATION_SIZE);
        
        if (pageCardsData.length === 0) {
            return '沒有更多課程了。';
}

        const placeholder_avatar = 'https://i.imgur.com/s43t5tQ.jpeg';
const courseBubbles = pageCardsData.map(cardData => {
            const c = cardData.course;
            const statusComponents = [];
            const footerButtons = [];

            if (cardData.type === 'booked') {
                statusComponents.push({ type: 'text', text: `✅ 您已預約 ${cardData.spots} 位`, color: '#28a745', size: 'sm', weight: 'bold', margin: 'md' });
  
              footerButtons.push({ type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: `取消 ${cardData.spots > 1 ? '1位 ' : ''}預約`, data: `action=confirm_cancel_booking_start&course_id=${c.id}` } });
            }
            if (cardData.type === 'waiting') {
                const waitingPosition = (c.waiting || []).indexOf(userId) + 1;
         
       statusComponents.push({ type: 'text', text: `🕒 您在候補名單中 (第${waitingPosition}位)`, color: '#FFA500', size: 'sm', weight: 'bold', margin: 'sm' });
                footerButtons.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '取消候補', data: `action=confirm_cancel_waiting_start&course_id=${c.id}` } });
}

            return {
                type: 'bubble', size: 'giga',
                hero: { type: 'image', url: c.teacher_image_url ||
placeholder_avatar, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
                body: {
                    type: 'box', layout: 'vertical', paddingAll: 'xl', spacing: 'md',
                    contents: [
                        { type: 'text', text: 
getCourseMainTitle(c.title), weight: 'bold', size: 'xl', wrap: true },
                        ...statusComponents,
                        { type: 'separator', margin: 'lg' },
                        { type: 'text', text: `授課老師：${c.teacher_name ||
'待定'}`, size: 'sm', margin: 'md' },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'sm' }
                    ]
                },
                footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerButtons 
}
            };
        });

        const paginationBubble = createPaginationBubble('action=view_my_courses', page, hasNextPage);
if (paginationBubble) {
            courseBubbles.push(paginationBubble);
}

        return { type: 'flex', altText: '我的課程列表', contents: { type: 'carousel', contents: courseBubbles } };
});
}

async function showMyMessages(userId, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const res = await client.query(
            `SELECT * FROM feedback_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
            [userId, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageMessages = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;
    

        if (pageMessages.length > 0) {
            await client.query(
                "UPDATE feedback_messages SET is_student_read = true WHERE user_id = $1 AND status = 'replied' AND is_student_read = false",
                [userId]
            );
        }
  
    
    if (pageMessages.length === 0 && page === 1) {
            return '您目前沒有任何留言紀錄。';
        }
        if (pageMessages.length === 0) {
            return '沒有更多留言紀錄了。';
        }

        const statusMap = {
            new: { text: '🟡 等待回覆', color: '#ffb703' },
    
        read: { text: '⚪️ 老師已讀', color: '#adb5bd' },
            replied: { text: '🟢 老師已回覆', color: '#2a9d8f' },
        };
const listItems = pageMessages.map(msg => {
            const statusInfo = statusMap[msg.status] || { text: msg.status, color: '#6c757d' };
            const replyContent = msg.teacher_reply
                ? [{ type: 'separator', margin: 'sm' }, { type: 'text', text: `老師回覆：${msg.teacher_reply}`, wrap: true, size: 'xs', color: '#495057' }]
                : [];

       
     return {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                spacing: 'sm',
                contents: [
         
           {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
              
              { type: 'text', text: '我的留言', weight: 'bold', size: 'sm', flex: 3 },
                            { type: 'text', text: statusInfo.text, size: 'xs', color: statusInfo.color, align: 'end', flex: 2 }
                        ]
          
          },
                    { type: 'text', text: msg.message, wrap: true, size: 'sm' },
                    ...replyContent,
                    { type: 'text', text: formatDateTime(msg.timestamp), size: 'xxs', color: '#AAAAAA', margin: 'md' }
          
      ]
            };
        });
const paginationBubble = createPaginationBubble('action=view_my_messages', page, hasNextPage);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
return {
            type: 'flex',
            altText: '您的歷史留言紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', 
text: '我的留言紀錄', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
});
}


async function showSingleCoursesForCancellation(prefix, page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const coursesRes = await client.query("SELECT * FROM courses WHERE id LIKE $1 AND time > NOW() ORDER BY time ASC LIMIT $2 OFFSET $3", [`${prefix}%`, CONSTANTS.PAGINATION_SIZE + 1, offset]);

        const hasNextPage = coursesRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageCourses = hasNextPage ? coursesRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : coursesRes.rows;

        if (pageCourses.length === 0 && page === 1) {
           return "此系列沒有可取消的未來課程。";
   
     }
        if (pageCourses.length === 0) {
            return '沒有更多課程了。';
        }

        const listItems = pageCourses.map(c => ({
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
          
  paddingAll: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
     
               contents: [
                        { type: 'text', text: c.title, wrap: true, weight: 'bold', size: 'sm' },
                        { type: 'text', text: formatDateTime(c.time), size: 'sm', margin: 'md'}
                 
   ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 2,
  
                  justifyContent: 'center',
                    contents: [
                        { type: 'button', style: 'primary', color: '#DE5246', height: 'sm', action: { type: 'postback', label: '取消此堂', data: `action=confirm_single_course_cancel&course_id=${c.id}` } }
                  
  ]
                }
            ]
        }));
const paginationBubble = createPaginationBubble('action=manage_course_group', page, hasNextPage, `&prefix=${prefix}`);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
return {
            type: 'flex',
            altText: '請選擇要單次取消的課程',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', 
text: '單堂課程管理', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
});
}


async function showShopProducts(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const productsRes = await client.query("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC LIMIT $1 OFFSET $2", [CONSTANTS.PAGINATION_SIZE + 1, offset]);

        const hasNextPage = productsRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            return '目前商城沒有任何商品，敬請期待！';
       
 }
        if (pageProducts.length === 0) {
            return '沒有更多商品了。';
        }

        const productBubbles = pageProducts.map(p => {
            const isSoldOut = p.inventory <= 0;
            const buttonStyle = isSoldOut ? 'secondary' : 'primary';
            const buttonLabel = isSoldOut ? 
'已售完' : '我要兌換';
            const buttonAction = isSoldOut
                ? { type: 'message', label: buttonLabel, text: '此商品已售完' }
                : { type: 'postback', label: buttonLabel, data: `action=confirm_product_purchase&product_id=${p.id}` };
return {
                type: 'bubble',
                hero: (p.image_url && p.image_url.startsWith('https')) ?
{ type: 'image', url: p.image_url, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' } : undefined,
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
       
                 { type: 'text', text: p.name, weight: 'bold', size: 'xl' },
                        {
                            type: 'box',
                     
       layout: 'horizontal',
                            margin: 'md',
                            contents: [
                                { type: 
'text', text: `${p.price} 點`, size: 'lg', color: '#1A759F', weight: 'bold', flex: 2 },
                                { type: 'text', text: `庫存: ${p.inventory}`, size: 'sm', color: '#666666', align: 'end', flex: 1, gravity: 'bottom' }
                            ]
            
            },
                        { type: 'text', text: p.description ||
' ', wrap: true, size: 'sm', margin: 'md', color: '#666666' },
                    ]
                },
                footer: {
                    type: 'box',
                
    layout: 'vertical',
                    contents: [
                        {
                            type: 'button',
                     
       style: buttonStyle,
                            action: buttonAction,
                            color: isSoldOut ?
'#AAAAAA' : '#52B69A',
                        }
                    ]
                }
            };
});

        const paginationBubble = createPaginationBubble('action=view_shop_products', page, hasNextPage);
        if (paginationBubble) {
            productBubbles.push(paginationBubble);
}

        return { type: 'flex', altText: '活動商城', contents: { type: 'carousel', contents: productBubbles } };
});
}

async function showProductManagementList(page = 1, filter = null) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        let baseQuery = "SELECT * FROM products";
        const queryParams = [];
        let paramIndex = 1;

        if (filter) {
            baseQuery += ` WHERE status = $${paramIndex++}`;
            queryParams.push(filter);
        }

        baseQuery += ` ORDER 
BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        queryParams.push(CONSTANTS.PAGINATION_SIZE + 1, offset);

        const productsRes = await client.query(baseQuery, queryParams);

        const hasNextPage = productsRes.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageProducts = hasNextPage ? productsRes.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : productsRes.rows;

        if (pageProducts.length === 0 && page === 1) {
            const emptyMessage = filter === 'available'
        
        ? '目前沒有任何販售中的商品。'
                : (filter === 'unavailable' ? '目前沒有任何已下架的商品。' : '目前沒有任何商品可管理。');
            return emptyMessage;
        }
        if (pageProducts.length === 0) {
            return '沒有更多商品了。';
}

        const productBubbles = pageProducts.map(p => {
            const statusColor = p.status === 'available' ? '#52B69A' : '#6A7D8B';
            const toggleLabel = p.status === 'available' ? '下架商品' : '重新上架';
            const toggleAction = `action=toggle_product_status&product_id=${p.id}`;

            return {
                type: 
'bubble',
                hero: (p.image_url && p.image_url.startsWith('https')) ? {
                    type: 'image',
                    url: p.image_url,
                    size: 'full',
                
    aspectRatio: '1:1',
                    aspectMode: 'cover',
                } : undefined,
                body: {
                    type: 'box',
                  
  layout: 'vertical',
                    spacing: 'md',
                    contents: [
                        { type: 'text', text: p.name, weight: 'bold', size: 'xl', wrap: true },
                    
    { type: 'text', text: p.description || '無描述', wrap: true, size: 'sm', color: '#666666', margin: 'md' },
                        { type: 'separator', margin: 'lg' },
                        {
                            
type: 'box',
                            layout: 'horizontal',
                            margin: 'md',
                            contents: [
            
                    { type: 'text', text: `價格: ${p.price} 點`, size: 'md' },
                                { type: 'text', text: `庫存: ${p.inventory}`, size: 'md', align: 'end' }
                            ]
 
                       }
                    ]
                },
                footer: {
                    type: 'box',
   
                 layout: 'vertical',
                    spacing: 'sm',
                    contents: [
                        { type: 'button', style: 'primary', height: 'sm', color: '#52B69A', action: { type: 'postback', label: '✏️ 編輯資訊', 
data: `action=manage_product&product_id=${p.id}` } },
                        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '📦 調整庫存', data: `action=adjust_inventory_start&product_id=${p.id}` } },
                        { type: 'button', style: 'secondary', height: 'sm', color: '#D9534F', action: { type: 'postback', label: toggleLabel, data: toggleAction } }
              
      ]
                }
            };
});

        const paginationBubble = createPaginationBubble(
            'action=view_products',
            page,
            hasNextPage,
            filter ? `&filter=${filter}` : ''
        );
if (paginationBubble) {
            productBubbles.push(paginationBubble);
}

        return { type: 'flex', altText: '商品管理列表', contents: { type: 'carousel', contents: productBubbles } };
});
}

async function showStudentExchangeHistory(userId, page = 1) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const res = await client.query(`SELECT * FROM product_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, CONSTANTS.PAGINATION_SIZE + 1, offset]);

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageOrders = hasNextPage ? res.rows.slice(0, CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageOrders.length === 0 && page === 1) {
            return '您沒有任何商品兌換紀錄。';
      
  }
         if (pageOrders.length === 0) {
            return '沒有更多紀錄了。';
        }

        const listItems = pageOrders.map(order => {
            let statusText, statusColor;
            switch (order.status) {
                case 'completed': statusText = '✅ 已完成/可領取'; statusColor 
= '#52b69a'; break;
                case 'pending': statusText = '🕒 處理中'; statusColor = '#ff9e00'; break;
                case 'cancelled': statusText = '❌ 已取消'; statusColor = '#d90429'; break;
                default: statusText = '未知狀態';
statusColor = '#6c757d';
            }

            return {
                type: 'box',
                layout: 'horizontal',
                paddingAll: 'md',
                contents: [
                
    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 3,
                     
   contents: [
                            { type: 'text', text: order.product_name, weight: 'bold', size: 'sm', wrap: true },
                            { type: 'text', text: statusText, color: statusColor, size: 'xs', weight: 'bold' },
                  
          { type: 'text', text: formatDateTime(order.created_at), size: 'xxs', color: '#AAAAAA' },
                        ]
                    },
                    {
                 
       type: 'text',
                        text: `-${order.points_spent} 點`,
                        gravity: 'center',
                        align: 'end',
                
        flex: 2,
                        weight: 'bold',
                        size: 'sm',
                        color: '#D9534F',
                
    }
                ]
            };
});

        const paginationBubble = createPaginationBubble('action=view_exchange_history', page, hasNextPage);
        const footerContents = paginationBubble ? paginationBubble.body.contents : [];
const flexMessage = {
            type: 'flex',
            altText: '兌換紀錄',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { type: 'box', layout: 'vertical', contents: [{ 
type: 'text', text: '我的兌換紀錄', weight: 'bold', size: 'lg', color: '#FFFFFF', wrap: true }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
        };
if (page === 1) {
            return [{ type: 'text', text: '以下是您近期的商品兌換紀錄：' }, flexMessage ];
}
        return flexMessage;
    });
}


async function showCourseRosterSummary(page) {
    const offset = (page - 1) * CONSTANTS.PAGINATION_SIZE;
return withDatabaseClient(async (client) => {
        const sevenDaysLater = new Date(Date.now() + 7 * CONSTANTS.TIME.ONE_DAY_IN_MS);
        const res = await client.query(
            `SELECT id, title, time,
                    COALESCE(array_length(students, 1), 0) as student_count,
                    COALESCE(array_length(waiting, 1), 0) as waiting_count
     
        FROM courses
             WHERE time > NOW() AND time < $1
             ORDER BY time ASC LIMIT $2 OFFSET $3`,
            [sevenDaysLater, CONSTANTS.PAGINATION_SIZE + 1, offset]
        );

        const hasNextPage = res.rows.length > CONSTANTS.PAGINATION_SIZE;
        const pageCourses = hasNextPage ? res.rows.slice(0, 
CONSTANTS.PAGINATION_SIZE) : res.rows;

        if (pageCourses.length === 0 && page === 1) {
            return '未來 7 天內沒有任何課程。';
        }
        if (pageCourses.length === 0) {
            return '沒有更多課程了。';
        }

        const listItems = pageCourses.map(c => ({
            type: 
'box',
            layout: 'horizontal',
            spacing: 'md',
            paddingAll: 'md',
            contents: [
                {
                    type: 'box',
           
         layout: 'vertical',
                    flex: 4,
                    contents: [
                        { type: 'text', text: c.title, weight: 'bold', size: 'sm', wrap: true },
             
           { type: 'text', text: formatDateTime(c.time), size: 'xs', color: '#666666' },
                        { type: 'text', text: `預約: ${c.student_count} 人 / 候補: ${c.waiting_count} 人`, size: 'xs', margin: 'sm' }
                    ]
                },
     
           {
                    type: 'box',
                    layout: 'vertical',
                    flex: 2,
                    justifyContent: 'center',
     
               contents: [
                        { type: 'button', style: 'primary', height: 'sm', action: { type: 'postback', label: '看名單', data: `action=view_course_roster_details&course_id=${c.id}` } }
                    ]
                }
        
    ]
        }));
        
        const paginationBubble = createPaginationBubble('action=view_course_roster_summary', page, hasNextPage);
const footerContents = paginationBubble ? paginationBubble.body.contents : [];

        return {
            type: 'flex',
            altText: '課程狀態查詢',
            contents: {
                type: 'bubble',
                size: 'giga',
                header: { 
type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '7日內課程狀態查詢', weight: 'bold', size: 'lg', color: '#FFFFFF' }], backgroundColor: '#343A40' },
                body: { type: 'box', layout: 'vertical', paddingAll: 'none', contents: listItems.flatMap((item, index) => index === 0 ? [item] : [{ type: 'separator' }, item]) },
                footer: { type: 'box', layout: 'vertical', contents: footerContents }
            }
      
  };
    });
}


async function showCourseRosterDetails(courseId) {
    return withDatabaseClient(async (client) => {
        const courseRes = await client.query("SELECT title, time, students, waiting FROM courses WHERE id = $1", [courseId]);
        if (courseRes.rows.length === 0) {
            return '找不到該課程的資料。';
        }
        const course = courseRes.rows[0];
        const studentIds = course.students || [];
     
   const waitingIds = course.waiting || [];
        const allUserIds = [...studentIds, ...waitingIds];

        let users = [];
        if (allUserIds.length > 0) {
            const usersRes = await client.query("SELECT id, name, picture_url FROM users WHERE id = ANY($1::text[])", [allUserIds]);
            users = usersRes.rows;
        }

        const 
userMap = new Map(users.map(u => [u.id, u]));
        const placeholderAvatar = 'https://i.imgur.com/8l1Yd2S.png';

        const createStudentListComponent = (ids, title) => {
            const studentCounts = ids.reduce((acc, id) => {
                acc[id] = (acc[id] ||
0) + 1;
                return acc;
            }, {});
            
            const uniqueIds = Object.keys(studentCounts);

            const studentBoxes = [];
if (uniqueIds.length > 0) {
                uniqueIds.forEach(id => {
                    const user = userMap.get(id);
                    const count = studentCounts[id];
                    const displayName = user?.name || '未知用戶';
       
             const displayText = count > 1 ? `${displayName} (x${count})` : displayName;

                    studentBoxes.push({
                        type: 'box',
                        layout: 'vertical',
       
                 alignItems: 'center',
                        spacing: 'sm',
                        contents: [
                            {
    
                            type: 'image',
                                url: user?.picture_url || placeholderAvatar,
                                aspectRatio: '1:1',
   
                             size: 'md',
                                flex: 0
                            },
         
                   {
                                type: 'text',
                                text: displayText,
               
                 wrap: true,
                                size: 'sm',
                                align: 'center'
                
            }
                        ]
                    });
});
            }

            const listContents = [
                { type: 'text', text: title, weight: 'bold', color: '#1A759F', margin: 'lg', size: 'md', align: 'center' },
            ];
if (studentBoxes.length === 0) {
                listContents.push({ type: 'text', text: '無', margin: 'md', size: 'sm', color: '#999999', align: 'center' });
} else {
                const rows = [];
for (let i = 0; i < studentBoxes.length; i += 4) {
                    rows.push({
                        type: 'box',
                        layout: 'horizontal',
                   
     spacing: 'md',
                        margin: 'lg',
                        contents: studentBoxes.slice(i, i + 4)
                    });
}
                listContents.push(...rows);
}

            return listContents;
        };
const bodyContents = [
            ...createStudentListComponent(studentIds, `✅ 已預約學員 (${studentIds.length})`),
            { type: 'separator', margin: 'xl' },
            ...createStudentListComponent(waitingIds, `🕒 候補中學員 (${waitingIds.length})`)
        ];
return {
            type: 'flex',
            altText: `課程 ${course.title} 的詳細名單`,
            contents: {
                type: 'bubble',
                size: 'giga',
                header: {
       
             type: 'box', layout: 'vertical', paddingAll: 'lg',
                    contents: [
                        { type: 'text', text: course.title, weight: 'bold', size: 'xl', wrap: true },
                        { type: 
'text', text: formatDateTime(course.time), size: 'sm', color: '#666666', margin: 'md' }
                    ]
                },
                body: {
                    type: 'box',
                 
   layout: 'vertical',
                    paddingAll: 'md',
                    contents: bodyContents
                }
            }
        };
});
}

async function showStudentDetails(studentId) {
    return withDatabaseClient(async (client) => {
        const userRes = await client.query('SELECT name, picture_url, points FROM users WHERE id = $1', [studentId]);
        if (userRes.rows.length === 0) {
            return '找不到該學員的資料。';
        }
        const student = userRes.rows[0];

        const coursesRes = await client.query(
          
  `SELECT title, time FROM courses WHERE $1 = ANY(students) AND time > NOW() ORDER BY time ASC LIMIT 3`,
            [studentId]
        );

        const ordersRes = await client.query(
            `SELECT points, status, timestamp FROM orders WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 3`,
            [studentId]
        );

 
       const createListItem = (text, size = 'sm', color = '#666666') => ({ type: 'text', text, size, color, wrap: true, margin: 'sm' });

        const coursesContents = [];
        if (coursesRes.rows.length > 0) {
            coursesRes.rows.forEach(course => {
                coursesContents.push(createListItem(`- ${getCourseMainTitle(course.title)} (${formatDateTime(course.time)})`));
});
        } else {
            coursesContents.push(createListItem('無', 'sm', '#aaaaaa'));
}
        
        const statusMap = { 'completed': '✅', 'pending_confirmation': '🕒', 'pending_payment': '❗', 'rejected': '❌' };
const ordersContents = [];
        if (ordersRes.rows.length > 0) {
            ordersRes.rows.forEach(order => {
                const statusIcon = statusMap[order.status] || '❓';
                ordersContents.push(createListItem(`${statusIcon} ${order.points}點 (${formatDateTime(order.timestamp)})`));
            });
} else {
            ordersContents.push(createListItem('無', 'sm', '#aaaaaa'));
}

        return {
            type: 'flex',
            altText: `學員 ${student.name} 的詳細資料`,
            contents: {
                type: 'bubble',
                size: 'giga',
                
header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: 'lg',
                    backgroundColor: '#343A40',
               
     contents: [
                        { type: 'text', text: student.name, weight: 'bold', size: 'xl', color: '#FFFFFF', align: 'center' },
                        {
                            type: 'box', layout: 'baseline', margin: 
'md', justifyContent: 'center',
                            contents: [
                                { type: 'text', text: '剩餘點數', size: 'sm', color: '#FFFFFF' },
                            
    { type: 'text', text: `${student.points}`, weight: 'bold', size: 'xxl', color: '#52B69A', margin: 'sm' },
                                { type: 'text', text: '點', size: 'sm', color: '#FFFFFF' }
                            ]
              
          }
                    ]
                },
                body: {
                    type: 'box',
                
    layout: 'vertical',
                    paddingTop: 'lg',
                    spacing: 'xl',
                    contents: [
                        {
        
                    type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                            contents: [
                                { type: 'text', text: '📅 近期預約課程', weight: 'bold', size: 'md', color: '#333333' 
},
                                ...coursesContents
                            ]
                        },
                
        { type: 'separator', margin: 'xl' },
                        {
                            type: 'box', layout: 'vertical', margin: 'lg', spacing: 'sm',
                            
contents: [
                                { type: 'text', text: '💰 近期購點紀錄', weight: 'bold', size: 'md', color: '#333333' },
                                ...ordersContents
                       
     ]
                        }
                    ]
                }
            }
        };
});
}
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});
app.get('/', (req, res) => res.send('九容瑜伽 LINE Bot 正常運作中。'));

app.listen(PORT, async () => {
  try {
    checkEnvironmentVariables();
    console.log('✅ 資料庫結構已由 Build Command 處理。');

    console.log(`✅ 伺服器已啟動，監聽埠號 ${PORT}`);
    console.log(`Bot 版本 V35.0 (報表查詢功能擴充)`);

    setInterval(() => { if (SELF_URL.startsWith('https')) {axios.get(SELF_URL).catch(err => console.error("Ping self failed:", err.message));}}, CONSTANTS.INTERVALS.PING_INTERVAL_MS);
    setInterval(cancelExpiredPendingOrders, CONSTANTS.TIME.ONE_HOUR_IN_MS);
    const CLEANUP_INTERVAL_MS = CONSTANTS.TIME.ONE_HOUR_IN_MS * 6;
    setInterval(cleanCoursesDB, CLEANUP_INTERVAL_MS);
    console.log(`🧹 已設定定期清理任務，每 ${CLEANUP_INTERVAL_MS / 3600000} 小時執行一次。`);
  } catch (error) {
    console.error('❌ 應用程式啟動失敗:', error);
    process.exit(1);
  
}
});
