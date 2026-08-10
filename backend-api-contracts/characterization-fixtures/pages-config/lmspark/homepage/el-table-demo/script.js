/**
 * 表格演示 —— 带操作列的数据表格
 *
 * 演示要点：
 * 1. 原生 HTML table 用 h() 渲染（⚠️ h() 中字符串类型如 'el-table' 会被 Vue 当作原生元素处理）
 * 2. 操作列包含 详情 / 编辑 / 删除 按钮
 * 3. 工具栏包含 新增 / 刷新 按钮
 * 4. 薪资千分位、日期、布尔标签等列格式化
 *
 * 沙箱注入: $route $el $query $queryAll
 *            $dataSet $refreshData $page
 *            SparkData h
 */

// ── 内联数据（演示用；真实项目走 DataSet + API）─────────────────────────────
var INIT_ROWS = [
  { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部', salary: 12000, joinDate: '2021-03-15', isActive: true },
  { id: 2, name: '李四', email: 'li@example.com',    department: '技术部', salary: 18500, joinDate: '2020-08-01', isActive: true },
  { id: 3, name: '王五', email: 'wang@example.com',  department: '市场部', salary: 15000, joinDate: '2022-01-10', isActive: true },
  { id: 4, name: '赵六', email: 'zhao@example.com',  department: '技术部', salary: 22000, joinDate: '2019-06-20', isActive: false },
  { id: 5, name: '钱七', email: 'qian@example.com',  department: '销售部', salary: 9800,  joinDate: '2023-11-05', isActive: true },
  { id: 6, name: '孙八', email: 'sun@example.com',   department: '市场部', salary: 16500, joinDate: '2021-09-18', isActive: true },
]

// ── 页面状态 ─────────────────────────────────────────────────────────────────
let _pageState = {
  rows: INIT_ROWS.slice(),  // 模块顶层初始化，首次渲染即有数据
}

function __init__() {
  // rows 已在顶层初始化；如需根据路由参数加载不同数据，可在此处处理
}

// ── 事件处理 ─────────────────────────────────────────────────────────────────

function handleAdd() {
  $page.showMessage('新增用户（演示）', 'success')
}

function handleRefresh() {
  _pageState.rows = INIT_ROWS.slice()
  if (typeof $refreshData === 'function') {
    $refreshData()
  }
  $page.showMessage('已刷新（恢复初始数据）', 'success')
}

function handleEdit(row) {
  $page.showMessage('编辑「' + row.name + '」— ID: ' + row.id, 'info')
}

function handleDelete(row) {
  $page.showConfirm('确认删除「' + row.name + '」？').then(function(ok) {
    if (!ok) return
    _pageState.rows = _pageState.rows.filter(function(r) { return r.id !== row.id })
    if (typeof $refreshData === 'function') {
      $refreshData()
    }
    $page.showMessage('「' + row.name + '」已删除', 'success')
  })
}

function handleViewDetail(row) {
  $page.showAlert(
    '姓名：' + row.name + '\n' +
    '邮箱：' + row.email + '\n' +
    '部门：' + row.department + '\n' +
    '薪资：' + Number(row.salary).toLocaleString('zh-CN') + '\n' +
    '入职：' + row.joinDate + '\n' +
    '在职：' + (row.isActive ? '是' : '否'),
    '用户详情 #' + row.id
  )
}

// ── Render* 渲染函数 ─────────────────────────────────────────────────────────

/**
 * 工具栏：新增 + 刷新
 */
function RenderToolbar() {
  var btnStyle = 'padding:6px 14px;border:1px solid #dcdfe6;border-radius:4px;cursor:pointer;font-size:13px;'
  return h('div', { style: 'display:flex;gap:8px;' }, [
    h('button', {
      style: btnStyle + 'background:#409eff;color:#fff;border-color:#409eff;',
      onClick: handleAdd,
    }, '＋ 新增'),
    h('button', {
      style: btnStyle + 'background:#fff;color:#606266;',
      onClick: handleRefresh,
    }, '🔄 刷新'),
  ])
}

/**
 * 数据表格：原生 HTML table + 操作列
 *
 * ⚠️ 注意：h('el-table', ...) 用字符串组件名会被 Vue 当作原生 HTML 元素，
 * 不会解析为 Element Plus 组件。若需使用 el-table，应在 rule.json 中配置 dataViewKey 绑定。
 * Render* 函数中请使用原生 HTML 标签。
 */
function RenderTable() {
  var rows = _pageState.rows
  if (!rows.length) {
    return h('div', { style: 'text-align:center;color:#c0c4cc;padding:32px;font-size:13px;' }, '暂无数据')
  }

  var tableStyle = 'width:100%;border-collapse:collapse;font-size:14px;'
  var thStyle = 'padding:10px 12px;text-align:left;background:#f5f7fa;color:#606266;font-weight:600;border:1px solid #ebeef5;white-space:nowrap;'
  var tdStyle = 'padding:10px 12px;border:1px solid #ebeef5;color:#606266;'
  var tdRightStyle = 'padding:10px 12px;border:1px solid #ebeef5;color:#606266;text-align:right;font-variant-numeric:tabular-nums;'
  var tdCenterStyle = 'padding:10px 12px;border:1px solid #ebeef5;color:#606266;text-align:center;'

  function tagSpan(text, type) {
    var colors = { success: '#67c23a', danger: '#f56c6c' }
    var bg     = { success: '#f0f9eb', danger: '#fef0f0' }
    return h('span', {
      style: 'display:inline-block;padding:2px 8px;border-radius:3px;font-size:12px;'
           + 'color:' + (colors[type] || '#909399') + ';'
           + 'background:' + (bg[type] || '#f4f4f5') + ';'
    }, text)
  }

  function linkBtn(text, color, onClick) {
    return h('a', {
      href: 'javascript:void(0)',
      style: 'margin-right:8px;color:' + color + ';text-decoration:none;font-size:13px;cursor:pointer;',
      onClick: onClick,
    }, text)
  }

  return h('table', { style: tableStyle }, [
    h('thead', [
      h('tr', [
        h('th', { style: thStyle + 'width:50px;' }, 'ID'),
        h('th', { style: thStyle }, '姓名'),
        h('th', { style: thStyle }, '邮箱'),
        h('th', { style: thStyle }, '部门'),
        h('th', { style: thStyle + 'text-align:right;' }, '薪资'),
        h('th', { style: thStyle }, '入职日期'),
        h('th', { style: thStyle + 'text-align:center;' }, '在职'),
        h('th', { style: thStyle + 'text-align:center;width:160px;' }, '操作'),
      ])
    ]),
    h('tbody', rows.map(function(row, i) {
      var bgColor = i % 2 === 1 ? 'background:#fafafa;' : ''
      return h('tr', { style: bgColor }, [
        h('td', { style: tdStyle }, row.id),
        h('td', { style: tdStyle }, row.name),
        h('td', { style: tdStyle }, row.email),
        h('td', { style: tdStyle }, row.department),
        h('td', { style: tdRightStyle }, Number(row.salary).toLocaleString('zh-CN')),
        h('td', { style: tdStyle }, row.joinDate),
        h('td', { style: tdCenterStyle }, [
          tagSpan(row.isActive ? '是' : '否', row.isActive ? 'success' : 'danger')
        ]),
        h('td', { style: tdCenterStyle }, [
          linkBtn('详情', '#409eff', function() { handleViewDetail(row) }),
          linkBtn('编辑', '#e6a23c', function() { handleEdit(row) }),
          linkBtn('删除', '#f56c6c', function() { handleDelete(row) }),
        ]),
      ])
    })),
  ])
}
