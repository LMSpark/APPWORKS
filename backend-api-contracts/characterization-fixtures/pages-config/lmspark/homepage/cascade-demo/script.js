// 沙箱注入的全局变量: 
// - $route, $el, $query, $queryAll, $dataSet, $refreshData, $page, SparkData, h

let selectedUser = null;

/**
 * 处理用户行选择
 */
function handleUserRowChange(currentRow) {
  selectedUser = currentRow;
  if (currentRow) {
    console.log('✅ 选中用户:', currentRow);
  }
}

/**
 * 添加新用户
 */
async function handleAddUser() {
  const name = await $page.showPrompt('请输入用户名', '添加用户')
  if (name === null) return
  const email = await $page.showPrompt('请输入邮箱', '添加用户')
  if (email === null) return

  try {
    const usersView = $dataSet.getView('Users', 'default');
    const maxId = Math.max(...usersView.rows.map(r => r.id), 0);
    usersView.appendRow({ id: maxId + 1, name, email });

    $page.showMessage(`✅ 用户添加成功: ${name}`, 'success');
  } catch (error) {
    console.error('添加用户失败:', error);
    $page.showMessage('添加用户失败', 'error');
  }
}

/**
 * 批量修改用户ID（同时手动级联更新 Orders.userId）
 */
async function handleUpdateUserIdBatch() {
  try {
    const offset = await $page.showPrompt(
      '输入要增加的ID偏移量（例如：100），订单的userId会自动级联更新',
      '批量修改用户ID',
      { placeholder: '请输入正整数' }
    )
    if (offset === null) return

    const dataSet = $dataSet;
    const usersView  = dataSet.getView('Users',  'default');
    const ordersView = dataSet.getView('Orders', 'default');
    const offsetNum  = parseInt(offset);

    // 构建旧ID→新ID映射，创建新行对象（不原地修改）
    const idMapping = new Map();
    const newUserRows = usersView.rows.map(user => {
      const newId = user.id + offsetNum;
      idMapping.set(user.id, newId);
      return { ...user, id: newId };
    });

    // 级联更新 Orders.userId
    const newOrderRows = ordersView.rows.map(order =>
      idMapping.has(order.userId)
        ? { ...order, userId: idMapping.get(order.userId) }
        : order
    );

    // replaceRows 触发 rowsChanged 事件，UI 自动更新
    usersView.replaceRows(newUserRows);
    ordersView.replaceRows(newOrderRows);

    $page.showMessage(`✅ 已批量更新 ${newUserRows.length} 个用户ID，订单已手动级联更新`, 'success');
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量更新失败:', error);
      $page.showMessage('批量更新失败', 'error');
    }
  }
}

/**
 * 删除选中用户（手动级联删除子表数据）
 */
async function handleDeleteSelectedUser() {
  if (!selectedUser) {
    $page.showMessage('请先点击表格中的一行选择用户', 'warning');
    return;
  }

  try {
    const dataSet = $dataSet;
    const usersView      = dataSet.getView('Users',      'default');
    const ordersView     = dataSet.getView('Orders',     'default');
    const orderItemsView = dataSet.getView('OrderItems', 'default');

    // 统计关联数据（仅用于提示）
    const relatedOrders    = ordersView.rows.filter(o => o.userId === selectedUser.id);
    const relatedOrderIds  = new Set(relatedOrders.map(o => o.id));
    const relatedItemCount = orderItemsView.rows.filter(item => relatedOrderIds.has(item.orderId)).length;

    const confirmed = await $page.showConfirm(
      `确定要删除用户 "${selectedUser.name}" 吗？\n\n⚠️ 这将会级联删除：\n` +
      `• ${relatedOrders.length} 个订单\n` +
      `• ${relatedItemCount} 个订单明细`,
      '危险操作',
      { confirmText: '确定删除', type: 'warning' }
    )
    if (!confirmed) return

    // 级联删除：从最深层开始，全部用 replaceRows 触发事件
    orderItemsView.replaceRows(orderItemsView.rows.filter(item => !relatedOrderIds.has(item.orderId)));
    ordersView.replaceRows(ordersView.rows.filter(o => o.userId !== selectedUser.id));
    usersView.deleteRowById(selectedUser.id);

    $page.showMessage(`✅ 用户删除成功！\n级联删除了 ${relatedOrders.length} 个订单和 ${relatedItemCount} 个明细`, 'success');
    selectedUser = null;
  } catch (error) {
    console.error('删除失败:', error);
    $page.showMessage('删除失败', 'error');
  }
}

/**
 * 刷新所有数据（重新加载数据集）
 */
async function handleRefreshData() {
  try {
    await $refreshData();
    selectedUser = null;
    $page.showMessage('✅ 数据已刷新', 'success');
    console.log('🔄 所有数据已重新加载');
  } catch (error) {
    console.error('刷新数据失败:', error);
    $page.showMessage('刷新数据失败', 'error');
  }
}

/**
 * 重置数据到初始状态
 */
async function handleResetData() {
  try {
    const dataSet = $dataSet;
    const usersView      = dataSet.getView('Users',      'default');
    const ordersView     = dataSet.getView('Orders',     'default');
    const orderItemsView = dataSet.getView('OrderItems', 'default');

    // 重置 Users
    usersView.replaceRows([
      { id: 1,  name: '张三', email: 'zhangsan@example.com' },
      { id: 2,  name: '李四', email: 'lisi@example.com' },
      { id: 3,  name: '王五', email: 'wangwu@example.com' },
      { id: 4,  name: '赵六', email: 'zhaoliu@example.com' },
      { id: 5,  name: '孙七', email: 'sunqi@example.com' },
    ]);

    // 重置 Orders
    ordersView.replaceRows([
      { id: 1,  userId: 1, orderNo: 'ORD-2024-001', amount: 299.00 },
      { id: 2,  userId: 1, orderNo: 'ORD-2024-002', amount: 159.00 },
      { id: 3,  userId: 2, orderNo: 'ORD-2024-003', amount: 899.00 },
      { id: 4,  userId: 2, orderNo: 'ORD-2024-004', amount: 450.00 },
      { id: 5,  userId: 3, orderNo: 'ORD-2024-005', amount: 1200.00 },
      { id: 6,  userId: 3, orderNo: 'ORD-2024-006', amount: 680.00 },
      { id: 7,  userId: 4, orderNo: 'ORD-2024-007', amount: 350.00 },
      { id: 8,  userId: 5, orderNo: 'ORD-2024-008', amount: 780.00 },
    ]);

    // 重置 OrderItems
    orderItemsView.replaceRows([
      { id: 1,  orderId: 1, productName: '笔记本电脑',   quantity: 1, price: 299.00 },
      { id: 2,  orderId: 2, productName: '无线鼠标',     quantity: 2, price: 79.50  },
      { id: 3,  orderId: 3, productName: '机械键盘',     quantity: 1, price: 899.00 },
      { id: 4,  orderId: 4, productName: '显示器',       quantity: 1, price: 450.00 },
      { id: 5,  orderId: 5, productName: '服务器',       quantity: 1, price: 1200.00 },
      { id: 6,  orderId: 6, productName: '路由器',       quantity: 2, price: 340.00 },
      { id: 7,  orderId: 7, productName: '移动硬盘',     quantity: 1, price: 350.00 },
      { id: 8,  orderId: 8, productName: '耳机',         quantity: 2, price: 390.00 },
    ]);

    selectedUser = null;
    $page.showMessage('✅ 数据已重置为初始状态', 'success');
    console.log('↩️ 所有数据已重置');
  } catch (error) {
    console.error('重置数据失败:', error);
    $page.showMessage('重置数据失败', 'error');
  }
}

// 页面脚本加载完成
console.log('📦 cascade-demo 脚本已加载（低代码模式）');
