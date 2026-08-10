let _pageState = {}

function __init__() {
  const usersView = $dataSet?.getView('Users', 'default')
  if (usersView) {
    usersView.events.on('currentRowChanged', (currentRow) => {
      // 当前行变化时，框架会自动通过 relation 过滤 Orders 数据
      // 无需手动处理
    })
  }
}

// 注意：rule.json 中没有引用任何事件处理函数（on）或 Render* 函数，因此无需额外定义。