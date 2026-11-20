let _pageState = { selectedRows: [] }

function __init__() {
  const view = $dataSet?.getView('Pages', 'default')
  if (view) {
    view.events.on('currentRowChanged', (row) => {
      console.log('当前行变更:', row)
    })
    view.events.on('selectionChange', (selection) => {
      _pageState.selectedRows = selection
    })
  }
}

function handleAdd() {
  $page.showPrompt('请输入新页面名称', '新增页面').then(name => {
    if (name) {
      const view = $dataSet?.getView('Pages', 'default')
      if (view) {
        const newId = Math.max(...view.rows.map(r => r.id), 0) + 1
        view.appendRow({
          id: newId,
          name: name,
          path: `/${name.toLowerCase().replace(/\s+/g, '-')}`,
          status: 'active',
          type: 'custom'
        })
        $page.showMessage('页面添加成功', 'success')
      }
    }
  })
}

function handleEdit() {
  const view = $dataSet?.getView('Pages', 'default')
  const currentRow = view?.currentRow
  if (!currentRow) {
    $page.showMessage('请先选择要编辑的行', 'warning')
    return
  }
  $page.showPrompt('请输入新名称', '编辑页面', currentRow.name).then(newName => {
    if (newName && newName !== currentRow.name) {
      view.updateRowById(currentRow.id, { name: newName })
      $page.showMessage('页面名称已更新', 'success')
    }
  })
}

function handleDelete() {
  if (_pageState.selectedRows.length === 0) {
    $page.showMessage('请先选择要删除的行', 'warning')
    return
  }
  $page.showConfirm(`确认删除选中的 ${_pageState.selectedRows.length} 个页面？`).then(ok => {
    if (ok) {
      const view = $dataSet?.getView('Pages', 'default')
      if (view) {
        _pageState.selectedRows.forEach(row => {
          view.deleteRowById(row.id)
        })
        _pageState.selectedRows = []
        $page.showMessage('删除成功', 'success')
      }
    }
  })
}

function RenderStatusTag(status) {
  const typeMap = {
    active: 'success',
    inactive: 'warning'
  }
  const color = typeMap[status] || 'info'
  return h('el-tag', { type: color, size: 'small' }, status)
}

function RenderTypeTag(type) {
  const typeMap = {
    system: 'primary',
    custom: 'success'
  }
  const color = typeMap[type] || 'info'
  return h('el-tag', { type: color, size: 'small' }, type)
}