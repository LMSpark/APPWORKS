// 系统设置页面脚本
// 沙箱注入的全局变量: 
// - $route, $el, $query, $queryAll, $dataSet, $refreshData, $page, SparkData, h

function __init__() {
  // 设置表只有一行，自动选中以驱动 r-form 显示
  const view = $dataSet?.getView('settings', 'default')
  if (view && view.rows.length > 0) {
    view.setCurrentRow(view.rows[0])
  }
}

function saveSettings() {
  $page.showMessage('💾 保存设置', 'success')
}

function resetSettings() {
  $page.showMessage('🔄 重置设置', 'info')
}

function exportConfig() {
  $page.showMessage('📤 导出配置', 'info')
}
