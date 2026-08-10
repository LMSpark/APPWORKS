function __init__() {
}

function handleCurrentChange(currentRow) {
  if (!currentRow) {
    return;
  }
  $page.showMessage('当前行：' + (currentRow.name || '未命名节点'), 'info');
}