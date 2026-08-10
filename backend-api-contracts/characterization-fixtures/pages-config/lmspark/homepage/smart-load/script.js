// 沙箱注入的全局变量: 
// - $route, $el, $query, $queryAll, $dataSet, $refreshData, $page, SparkData, h

// 数据加载通过视图的 CRUD API 完成（loadFromServer）

/**
 * 请求订单明细数据 - 完全解耦：发起请求不等待，数据加载完成后自动更新 UI
 */
function handleRequestOrderDetails() {
  const dataSet = $dataSet;
  
  if (!dataSet) {
    $page.showMessage('DataSetManager 未初始化', 'warning');
    return;
  }

  const view = dataSet.getView('OrderDetails', 'default');
  if (!view?.table?.api?.list) {
    $page.showMessage('演示环境无后端 API，展示已内联的静态数据', 'info');
    console.log('❓ OrderDetails 没有 API 配置，跳过请求');
    return;
  }
  
  $page.showMessage('🔍 开始智能加载 OrderDetails...', 'info');
  console.log('='.repeat(60));
  console.log('🚀 用户请求: OrderDetails 数据（非阻塞）');
  console.log('='.repeat(60));
  view.loadFromServer();
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求产品数据
 */
function handleRequestProducts() {
  const dataSet = $dataSet;
  const view = dataSet?.getView('Products', 'default');
  if (!view?.table?.api?.list) {
    $page.showMessage('演示环境无后端 API，展示已内联的静态数据', 'info');
    return;
  }
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Products 数据（非阻塞）');
  console.log('='.repeat(60));
  view.loadFromServer();
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 请求分类数据
 */
function handleRequestCategories() {
  const dataSet = $dataSet;
  const view = dataSet?.getView('Categories', 'default');
  if (!view?.table?.api?.list) {
    $page.showMessage('演示环境无后端 API，展示已内联的静态数据', 'info');
    return;
  }
  console.log('='.repeat(60));
  console.log('🚀 用户请求: Categories 数据（非阻塞）');
  console.log('='.repeat(60));
  view.loadFromServer();
  console.log('✅ 请求已发起，等待数据加载...');
}

/**
 * 清空所有数据
 */
function handleClearAll() {
  const dataSet = $dataSet;
  
  console.log('='.repeat(60));
  console.log('🗑️ 清空所有表数据');
  console.log('='.repeat(60));
  
  // 获取所有表
  const tables = dataSet.tables;
  
  Object.keys(tables).forEach(tableName => {
    const view = dataSet.getView(tableName, 'default');
    if (view) view.clearAll(); // clearAll 自动通知订阅者
  });
  
  $page.showMessage('🗑️ 所有数据已清空');
}

/**
 * 页面初始化函数（由 PageRenderer 自动调用）
 * 用于注册数据加载器等初始化操作
 */
function __init__() {
  console.log('📦 smart-load 脚本开始初始化...');
  
  const dataSet = $dataSet;
  
  if (dataSet) {
    // 数据加载通过视图的 CRUD API 完成，不再使用 dataLoader
    console.log('✅ smart-load 初始化完成');
    console.log('📋 可用表: Categories, Products, OrderDetails');
    console.log('🔗 依赖关系: OrderDetails → Products → Categories');
    
    // 监听加载成功事件（用于显示提示）
    dataSet.on('loadSuccess', ({ tableName }) => {
      console.log('='.repeat(60));
      console.log(`✅ ${tableName} 加载完成！数据已自动更新到 UI`);
      console.log('='.repeat(60));
      $page.showMessage(`✅ ${tableName} 数据加载完成！`);
    });
    
    // 监听加载失败事件
    dataSet.on('loadError', ({ tableName, error }) => {
      console.error(`❌ ${tableName} 加载失败:`, error);
      $page.showMessage(`❌ ${tableName} 数据加载失败`, 'error');
    });
  } else {
    console.warn('⚠️ DataSetManager 未初始化');
  }
  
  console.log('✅ smart-load 脚本初始化完成');
}




