// Renderer Demo 页面脚本

function __init__() {
  console.log('✅ Renderer Demo 初始化完成')
  
  if ($dataSet) {
    // 确保 users 表使用静态数据，不触发 API 请求
    var usersView = $dataSet.getView('users', 'default')
    console.log('👁️ users view:', usersView ? 'OK (' + usersView.rows.length + ' rows)' : 'NULL')
    
    // 确保 education_dict 表使用静态数据，不触发 API 请求
    var eduView = $dataSet.getView('education_dict', 'default')
    console.log('👁️ education_dict view:', eduView ? 'OK (' + eduView.rows.length + ' rows)' : 'NULL')
    
    // 确保 user_resumes 表使用静态数据
    var resumeView = $dataSet.getView('user_resumes', 'default')
    console.log('👁️ user_resumes view:', resumeView ? 'OK (' + resumeView.rows.length + ' rows)' : 'NULL')
  } else {
    console.warn('⚠️ $dataSet is null!')
  }
}
