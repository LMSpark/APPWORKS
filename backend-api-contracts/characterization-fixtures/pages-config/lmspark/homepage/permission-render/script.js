/**
 * 权限驱动 UI 演示 ——「改权限不改代码」
 *
 * 核心理念：
 *   后端在返回数据时附带权限快照（_perm / _modelPerm），
 *   前端零代码容器（r-table / r-form）消费这些返回值，无需散落手写判断。
 *
 * 本演示中"切换角色"= 模拟后端返回不同的数据+权限组合。
 * script.js 只负责把“模拟业务返回值”写入 DataSet；
 * 右侧 r-table / r-form 再用零代码权限链消费这些结果。
 *
 * 沙箱注入: $route $el $query $queryAll
 *            $dataSet $refreshData $page permission
 *            SparkData h
 */

// ── 页面状态 ─────────────────────────────────────────────────────────────────
let _pageState = {
  currentUser: 'user1',
}

// ── 模拟后端响应（不同角色返回不同数据+权限快照）────────────────────────────
// 真实场景：后端鉴权模块自动把 _perm/_modelPerm 注入响应体，前端代码感知不到。
var MOCK_RESPONSES = {
  user1: {
    _modelPerm: { allowCreate: false, allowImport: false, allowExport: false },
    rows: [
      { id: 1, name: '张***', email: 'zhang@example.com', department: '销售部',
        _perm: { allowDelete: false, editableFields: [], hiddenFields: ['department'] } },
      { id: 2, name: '李***', email: 'li@example.com',   department: '销售部',
        _perm: { allowDelete: false, editableFields: ['email'] } },
    ]
  },
  manager: {
    _modelPerm: { allowCreate: true, allowImport: false, allowExport: true },
    rows: [
      { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部',
        _perm: { allowDelete: false, editableFields: ['name', 'email'] } },
      { id: 2, name: '李四', email: 'li@example.com',   department: '销售部',
        _perm: { allowDelete: false, editableFields: ['name', 'email'] } },
      { id: 3, name: '王五', email: 'wang@example.com', department: '市场部',
        _perm: { allowDelete: false, editableFields: ['name', 'email'] } },
    ]
  },
  admin: {
    _modelPerm: { allowCreate: true, allowImport: true, allowExport: true },
    rows: [
      { id: 1, name: '张三', email: 'zhang@example.com', department: '销售部',
        _perm: { allowDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 2, name: '李四', email: 'li@example.com',   department: '销售部',
        _perm: { allowDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 3, name: '王五', email: 'wang@example.com', department: '市场部',
        _perm: { allowDelete: true, editableFields: ['name', 'email', 'department'] } },
      { id: 4, name: '赵六', email: 'zhao@example.com', department: '技术部',
        _perm: { allowDelete: true, editableFields: ['name', 'email', 'department'] } },
    ]
  }
}

function cloneRows(rows) {
  return rows.map(function(row) {
    var perm = row._perm || {}
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      department: row.department,
      _perm: {
        allowDelete: perm.allowDelete === true,
        editableFields: Array.isArray(perm.editableFields) ? perm.editableFields.slice() : [],
        hiddenFields: Array.isArray(perm.hiddenFields) ? perm.hiddenFields.slice() : [],
        maskedFields: Array.isArray(perm.maskedFields) ? perm.maskedFields.slice() : [],
      }
    }
  })
}

function getPermissionView() {
  return $dataSet?.getView('PermissionUsers', 'default') || null
}

function canCreate(modelPerm) {
  return permission.isPermittedAction('create', { modelPermission: modelPerm })
}

function canImport(modelPerm) {
  return permission.isPermittedAction('import', { modelPermission: modelPerm })
}

function canExport(modelPerm) {
  return permission.isPermittedAction('export', { modelPermission: modelPerm })
}

function canEdit(row) {
  return permission.isPermittedAction('edit', { row: row })
}

function canDelete(row) {
  return permission.isPermittedAction('delete', { row: row })
}

// ── 事件处理（业务逻辑，最小化）───────────────────────────────────────────────

function handleSwitchUser(userId) {
  var resp = MOCK_RESPONSES[userId]
  if (!resp) return
  var view = getPermissionView()
  if (!view) return

  var nextRows = cloneRows(resp.rows)
  _pageState.currentUser = userId

  view.replaceRows(nextRows)
  view._modelPerm = {
    allowCreate: resp._modelPerm.allowCreate === true,
    allowImport: resp._modelPerm.allowImport === true,
    allowExport: resp._modelPerm.allowExport === true,
  }

  if (view.rows.length > 0) {
    view.setCurrentRow(view.rows[0])
    view.setSelectedRows([view.rows[0]])
  } else {
    view.setCurrentRow(null)
    view.clearSelectedRows()
  }
}

function __init__() {
  handleSwitchUser('user1')
}

// ── Render* 渲染函数（固定框架代码；权限数据改了，UI 自动变）─────────────────

/**
 * 角色选择——切换 = 模拟后端返回不同权限数据
 */
function RenderUserSwitch() {
  var current = _pageState.currentUser
  var roles = [
    { value: 'user1',   label: '员工',   desc: '脱敏·只读' },
    { value: 'manager', label: '经理',   desc: '可编辑·不可删' },
    { value: 'admin',   label: '管理员', desc: '完整权限' },
  ]
  return h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
    roles.map(function(r) {
      var active = current === r.value
      return h('label', {
        style: 'display:flex;flex-direction:column;align-items:center;padding:8px 18px;' +
               'border-radius:8px;cursor:pointer;user-select:none;min-width:88px;' +
               'border:2px solid ' + (active ? '#409eff' : '#e4e7ed') + ';' +
               'background:' + (active ? '#ecf5ff' : '#fff') + ';' +
               'color:' + (active ? '#409eff' : '#909399') + ';transition:all .12s;',
      }, [
        h('input', {
          type: 'radio', name: 'role-switch', value: r.value,
          checked: active,
          onChange: function() { handleSwitchUser(r.value) },
          style: 'display:none;',
        }),
        h('span', { style: 'font-size:14px;font-weight:600;' }, r.label),
        h('span', { style: 'font-size:11px;margin-top:2px;' }, r.desc),
      ])
    })
  )
}

/**
 * 权限快照——实时展示"后端下发"的 _perm / _modelPerm
 * 这块内容由数据驱动，代码固定不变
 */
function RenderPermSnapshot() {
  var view = getPermissionView()
  var mp   = view ? (view._modelPerm || null) : null
  var rows = view ? (view.rows || []) : []
  if (!mp) return h('div', { style: 'color:#c0c4cc;font-size:13px;' }, '切换角色后显示')

  var tag = function(ok, label) {
    return h('span', {
      style: 'display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;' +
             'margin:2px;border:1px solid ' + (ok ? '#b3e19d' : '#fab6b6') + ';' +
             'background:' + (ok ? '#f0f9eb' : '#fef0f0') + ';' +
             'color:' + (ok ? '#529b2e' : '#c45656') + ';',
    }, (ok ? '✓ ' : '✗ ') + label)
  }

  return h('div', { style: 'font-size:13px;' }, [
    // 模型级权限
    h('div', { style: 'color:#606266;font-size:12px;font-weight:600;margin-bottom:6px;' }, '_modelPerm'),
    h('div', { style: 'margin-bottom:12px;' }, [
      tag(canCreate(mp), '新增'),
      tag(canImport(mp), '导入'),
      tag(canExport(mp), '导出'),
    ]),
    // 行级权限
    h('div', { style: 'color:#606266;font-size:12px;font-weight:600;margin-bottom:6px;' }, '每行 _perm'),
    ...rows.map(function(row) {
      return h('div', {
        style: 'padding:6px 8px;margin-bottom:4px;background:#fafafa;' +
               'border-radius:4px;border:1px solid #f0f2f5;',
      }, [
        h('div', { style: 'font-size:12px;font-weight:600;color:#303133;margin-bottom:3px;' },
          '#' + row.id + '  ' + row.name),
        h('div', [
          tag(canEdit(row),   '编辑'),
          tag(canDelete(row), '删除'),
        ]),
        row._perm.editableFields && row._perm.editableFields.length
          ? h('div', { style: 'font-size:11px;color:#909399;margin-top:2px;' },
              '可改字段：' + row._perm.editableFields.join('、'))
          : h('div', { style: 'font-size:11px;color:#c0c4cc;margin-top:2px;' }, '只读，无可编辑字段'),
      ])
    }),
  ])
}

