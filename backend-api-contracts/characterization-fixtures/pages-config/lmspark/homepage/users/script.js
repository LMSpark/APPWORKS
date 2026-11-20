let _pageState = {};

function __init__() {
  const view = $dataSet?.getView('users', 'default');
  if (!view) {
    console.warn('users 视图未找到');
    return;
  }
  console.log('👥 用户管理页面初始化完成，数据行数:', view.rows.length);
  
  view.events.on('currentRowChanged', (currentRow) => {
    console.log('当前行变更:', currentRow);
  });
  
  view.events.on('selectedRowsChanged', (selectedRows) => {
    console.log('选中行变更:', selectedRows);
  });
}

function handleRowChange(currentRow, oldRow) {
  console.log('表格当前行变更:', currentRow, '旧行:', oldRow);
}

function handleSelection(selection) {
  console.log('表格选中行变更:', selection);
}