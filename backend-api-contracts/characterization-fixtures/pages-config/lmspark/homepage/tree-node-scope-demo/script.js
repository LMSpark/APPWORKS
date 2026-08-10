// Tree Demo Page Script
// 树组件演示页面的交互逻辑

// 获取当前选中节点
function getCurrentNode() {
  const view = $dataSet && $dataSet.getView('TreeData', 'default');
  const node = view && view.getCurrentRow();
  if (node) {
    $page.showMessage(`当前选中: ${node.name}（类型: ${node.type}，状态: ${node.status}）`, 'info');
  } else {
    $page.showMessage('未选中任何节点', 'warning');
  }
}

// 获取勾选节点
function getCheckedNodes() {
  const view = $dataSet && $dataSet.getView('TreeData', 'default');
  const nodes = view ? view.selectedRows : [];
  if (nodes.length > 0) {
    const names = nodes.map(n => n.name).join(', ');
    $page.showMessage(`勾选节点 (${nodes.length}个): ${names}`, 'info');
  } else {
    $page.showMessage('未勾选任何节点', 'warning');
  }
}

// 节点点击事件
function handleNodeClick(data) {
  $page.showMessage(`点击节点: ${data.name}`, 'info');
}

// 节点展开事件
function handleNodeExpand(data) {
  console.log('展开节点:', data.name);
}

// 节点折叠事件
function handleNodeCollapse(data) {
  console.log('折叠节点:', data.name);
}
