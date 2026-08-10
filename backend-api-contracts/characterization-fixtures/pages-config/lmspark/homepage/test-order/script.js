let _pageState = {}

function __init__() {
  const view = $dataSet?.getView('test-order', 'default')
  if (!view) return
  
  console.log('[test-order] 页面初始化完成，数据行数：', view.rows?.length || 0)
}

// 当前 rule.json 中没有 on 事件或 Render* 函数需要定义