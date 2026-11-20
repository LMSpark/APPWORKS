function __init__() {
  const table = $dataSet?.getTable('Projects')
  if (table) {
    const currentApi = table.api || {}
    const currentList = currentApi.list || {}
    if (typeof table.setApi === 'function') {
      table.setApi({
        ...currentApi,
        list: {
          ...currentList,
          method: currentList.method || 'GET',
          url: '/tenants/{tenantId}/projects',
        },
      })
    }
  }

  const view = $dataSet?.getView('Projects', 'default')
  if (!view) return

  view.events.on('requestStateChanged', (state) => {
    console.info('[dynamic-columns] Projects requestState:', state)
  })
}

function refreshProjects() {
  const view = $dataSet?.getView('Projects', 'default')
  if (!view) {
    $page.showMessage('Projects 视图不存在', 'warning')
    return
  }

  view.refresh()
    .then(() => $page.showMessage('Projects 刷新完成', 'success'))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      $page.showMessage(`Projects 刷新失败: ${message}`, 'error')
    })
}
