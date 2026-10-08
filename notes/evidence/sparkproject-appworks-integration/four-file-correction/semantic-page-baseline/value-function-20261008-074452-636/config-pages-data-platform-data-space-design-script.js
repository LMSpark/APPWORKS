var designLoading = false
var designError = ''
var designLayoutState = '尚未读取布局'
var designLayoutSummary = null
var designLayoutGraph = null
var designParametersValue = null
var designReady = false
var designTarget = null
var designSnapshot = null
var designLoadRevision = 0
var designParameterEditorOpen = false
var designParameterEditCapture = null
var designParameterRecovery = null
var designEditError = ''

var designScenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
var catalogScenarioId = '90A82E287930A234FEC3E687C94A93EA'

function designText(value) {
  return value == null ? '' : String(value).trim()
}

function designSingleRouteValue(value, label) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`设计页路由缺少有效${label}`)
  }
  return value.trim()
}

function designReturnPath() {
  const tenantId = designSingleRouteValue($route.params.tenantId, '租户身份')
  const projectId = designSingleRouteValue($route.params.projectId, '应用身份')
  const value = $route.query.returnTo
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return ''
  const pathname = value.split(/[?#]/, 1)[0]
  if (/[\u0000-\u001f\u007f]/.test(pathname)) return ''
  const segments = pathname.split('/')
  let decodedSegments
  try { decodedSegments = segments.map(segment => decodeURIComponent(segment)) } catch { return '' }
  if (decodedSegments.some(segment => /[\u0000-\u001f\u007f]/.test(segment)
    || segment === '.' || segment === '..' || /[\\/]/.test(segment))) return ''
  if (decodedSegments[1] !== 't' || decodedSegments[2] !== tenantId || decodedSegments[3] !== projectId
    || !decodedSegments[4]) return ''
  return value
}

function designCurrentTarget() {
  const id = designSingleRouteValue($route.query.dataSpaceId, '数据空间 ID')
  if (/[\\/%]/.test(id) || id === '.' || id === '..') throw new Error('数据空间 ID 格式无效')
  return id
}

function designDataSet(scenarioId, expected) {
  const dataSet = $page.getDataSet(scenarioId)
  if (!dataSet || dataSet.scenarioId !== expected) throw new Error('设计页必需场景未装载')
  return dataSet
}

function designView(binding) {
  const view = $page.resolveView(binding)
  if (!view) throw new Error(`页面未配置正式视图：${binding}`)
  return view
}

function designRequireReadable(view, row, fields) {
  for (const field of fields) {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error('当前数据权限不能读取设计所需身份或关联字段')
  }
}

function designVerifyRows(view, fields, owner) {
  if (view.loadingError) throw new Error('正式数据查询失败或无权读取')
  if (view.requestState !== 3) throw new Error('正式数据查询尚未完成')
  const rows = view.rows
  if (!Array.isArray(rows) || rows.length !== view.total) throw new Error('正式数据查询未返回完整结果')
  const ids = new Set()
  for (const row of rows) {
    designRequireReadable(view, row, fields)
    const id = designText(row.rowid)
    const key = designText(view.getPkKey(row))
    if (!id || id !== key || ids.has(id)) throw new Error('正式数据行身份缺失、重复或与主键不一致')
    ids.add(id)
    if (owner && designText(row.dataSetId) !== owner) throw new Error('正式数据记录不属于目标数据空间')
  }
  return { rows, total: view.total, requestState: view.requestState }
}

function designEntryIsCurrent(entry, owner) {
  const view = $page.resolveView(entry.binding)
  if (view !== entry.view) return false
  const current = designVerifyRows(view, entry.identityFields, owner)
  return current.rows === entry.rows && current.total === entry.total && current.requestState === entry.requestState
}

function designSnapshotIsCurrent() {
  if (!designReady || !designSnapshot || designTarget !== designSnapshot.id
    || designCurrentTarget() !== designSnapshot.id) return false
  try {
    if ($page.getDataSet(catalogScenarioId) !== designSnapshot.catalogDataSet
      || $page.getDataSet(designScenarioId) !== designSnapshot.designDataSet) return false
    for (const entry of designSnapshot.views) {
      if (!designEntryIsCurrent(entry, entry.owner)) return false
    }
    const byBinding = new Map(designSnapshot.views.map(entry => [entry.binding, entry]))
    const models = byBinding.get(`#${designScenarioId}@Base_DataModel@designModels`).rows
    const modelIds = new Set(models.map(row => designText(row.rowid)))
    const fields = byBinding.get(`#${designScenarioId}@Base_DataModel_Field@designFields`).rows
    const relations = byBinding.get(`#${designScenarioId}@Base_DataModel_Relation@designRelations`).rows
    if (fields.some(row => !modelIds.has(designText(row.dataModelId)))) return false
    if (relations.some(row => !modelIds.has(designText(row.parentModId)) || !modelIds.has(designText(row.childModId)))) return false
    const target = designSnapshot.targetView
    if ($page.resolveView(`#${catalogScenarioId}@Base_DataSet@designTarget`) !== target
      || target.rows !== designSnapshot.targetRows || target.total !== designSnapshot.targetTotal
      || target.requestState !== designSnapshot.targetRequestState || target.loadingError) return false
    const row = target.rows[0]
    return target.rows.length === 1 && target.total === 1 && row === designSnapshot.targetRow
      && designText(row.rowid) === designSnapshot.id
      && designText(target.getPkKey(row)) === designSnapshot.id
      && target.fieldAccess(row, 'rowid').read === 'visible'
  } catch { return false }
}

function designAssertReadCurrent(capture) {
  const { revision, page, targetId, catalogDataSet, designDataSet: designDataSetRef, views: capturedViews,
    verified, target: targetCapture } = capture
  if (revision !== designLoadRevision) throw new Error('PAGE_RUNTIME_STALE: 设计读取已被新一轮替代')
  if ($page !== page || designCurrentTarget() !== targetId) throw new Error('PAGE_RUNTIME_STALE: 页面或数据空间目标已变化')
  if ($page.getDataSet(catalogScenarioId) !== catalogDataSet || $page.getDataSet(designScenarioId) !== designDataSetRef) {
    throw new Error('PAGE_RUNTIME_STALE: 设计场景已失效')
  }
  for (const capture of capturedViews) {
    if ($page.resolveView(capture.binding) !== capture.view) throw new Error('PAGE_RUNTIME_STALE: 设计视图已失效')
  }
  for (const entry of verified) {
    if (!designEntryIsCurrent(entry, entry.owner)) throw new Error('SPARK_QUERY_CONTEXT_STALE: 设计查询身份、权限或结果已变化')
  }
  const byBinding = new Map(verified.map(entry => [entry.binding, entry]))
  const modelEntry = byBinding.get(`#${designScenarioId}@Base_DataModel@designModels`)
  const fieldEntry = byBinding.get(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  const relationEntry = byBinding.get(`#${designScenarioId}@Base_DataModel_Relation@designRelations`)
  if (modelEntry && fieldEntry) {
    const modelIds = new Set(modelEntry.rows.map(row => designText(row.rowid)))
    if (fieldEntry.rows.some(row => !modelIds.has(designText(row.dataModelId)))) {
      throw new Error('SPARK_QUERY_CONTEXT_STALE: 字段所属模型已变化')
    }
    if (relationEntry && relationEntry.rows.some(row => !modelIds.has(designText(row.parentModId))
      || !modelIds.has(designText(row.childModId)))) throw new Error('SPARK_QUERY_CONTEXT_STALE: 关系端点已变化')
  }
  if (targetCapture) {
    const target = targetCapture.view
    if ($page.resolveView(`#${catalogScenarioId}@Base_DataSet@designTarget`) !== target
      || target.rows !== targetCapture.rows || target.total !== targetCapture.total
      || target.requestState !== targetCapture.requestState || target.loadingError
      || target.rows.length !== 1 || target.rows[0] !== targetCapture.row
      || designText(target.getPkKey(targetCapture.row)) !== targetCapture.id
      || designText(targetCapture.row.rowid) !== targetCapture.id
      || target.fieldAccess(targetCapture.row, 'rowid').read !== 'visible') {
      throw new Error('SPARK_QUERY_CONTEXT_STALE: 目标数据空间查询已变化')
    }
  }
}

function designBeforeRender() {
  return designSnapshotIsCurrent()
}

function designParameterEditIsCurrent(capture) {
  if (!capture || !designSnapshotIsCurrent() || $page !== capture.page
    || designTarget !== capture.targetId || !designSnapshot
    || designSnapshot.designDataSet !== capture.dataSet
    || $page.resolveView(capture.binding) !== capture.view
    || capture.view.dataSet !== capture.dataSet || capture.view.rows !== capture.rows
    || capture.view.total !== capture.total || capture.view.requestState !== capture.requestState
    || capture.view.rows.length !== 1 || capture.view.rows[0] !== capture.row
    || designText(capture.view.getPkKey(capture.row)) !== capture.targetId
    || designText(capture.row.rowid) !== capture.targetId
    || capture.view.fieldAccess(capture.row, 'rowid').read !== 'visible'
    || capture.view.fieldAccess(capture.row, 'inputParams').read !== 'visible'
    || capture.view.fieldAccess(capture.row, 'inputParams').write !== 'allowed'
    || capture.view.editActionState(capture.row) !== 'enabled') return false
  return true
}

function designParameterViewIsBusy(view) {
  return Boolean(view && (view.mutating === true || view.requestState === 2))
}

function designParameterHasPendingLocal(view, targetId) {
  return view.dirtyTracking.hasPendingChanges(targetId) || view.hasEditingChanges(targetId)
}

function designParameterEditAllowed() {
  if (!designSnapshotIsCurrent()) return false
  const entry = designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataSet@designParameters`)
  if (!entry || entry.rows.length !== 1) return false
  const row = entry.rows[0]
  return entry.view.editActionState(row) === 'enabled'
    && entry.view.fieldAccess(row, 'rowid').read === 'visible'
    && entry.view.fieldAccess(row, 'inputParams').read === 'visible'
    && entry.view.fieldAccess(row, 'inputParams').write === 'allowed'
}

function designParameterEditEntryBeforeRender() {
  return designParameterEditAllowed()
}

function designOpenParameterEditor() {
  if (!designParameterEditAllowed()) return
  const entry = designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataSet@designParameters`)
  if (!entry || entry.rows.length !== 1) return
  const row = entry.rows[0]
  if (entry.view.editActionState(row) !== 'enabled'
    || entry.view.fieldAccess(row, 'rowid').read !== 'visible'
    || entry.view.fieldAccess(row, 'inputParams').read !== 'visible'
    || entry.view.fieldAccess(row, 'inputParams').write !== 'allowed') return
  try {
    designValidateParameterItems(designParseInputParameters(row.inputParams))
  } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '输入参数当前不可编辑', 'warning')
    return
  }
  designParameterEditCapture = { page: $page, targetId: designSnapshot.id, dataSet: designSnapshot.designDataSet,
    binding: entry.binding, view: entry.view, rows: entry.rows, total: entry.total,
    requestState: entry.requestState, row }
  designParameterEditorOpen = true
  const dialog = $components.getApi('design-parameters-dialog')
  if (!dialog || typeof dialog.open !== 'function') throw new Error('输入参数编辑弹窗尚未装载')
  dialog.open()
}

function designParameterEditorBeforeRender() {
  const capture = designParameterEditCapture
  if (!designParameterEditorOpen || !designParameterEditIsCurrent(capture)) return { visible: false }
  const editingRow = capture.view.getEditingRow(capture.targetId)
  if (!editingRow) return { visible: false }
  try {
    const modelValue = designParseInputParameters(editingRow.inputParams)
    return { visible: true, props: { modelValue, disabled: false } }
  } catch { return { visible: false } }
}

function designChangeInputParameters(items) {
  const capture = designParameterEditCapture
  if (designParameterViewIsBusy(capture && capture.view) || !designParameterEditorOpen || !designParameterEditIsCurrent(capture)) return
  try { designValidateParameterItems(items) } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '输入参数格式无效', 'warning')
    return
  }
  const row = capture.view.getEditingRow(capture.targetId)
  if (!row || capture.view.fieldAccess(row, 'inputParams').write !== 'allowed') return
  capture.view.updateEditingValue(capture.targetId, 'inputParams', JSON.stringify(items))
}

function designCancelParameterEditor() {
  const capture = designParameterEditCapture
  if (designParameterViewIsBusy(capture && capture.view)) {
    const busyDialog = $components.getApi('design-parameters-dialog')
    if (designParameterEditorOpen && busyDialog && typeof busyDialog.open === 'function') busyDialog.open()
    return
  }
  if (designParameterRecovery) {
    designParameterEditCapture = null
    designParameterEditorOpen = false
    return
  }
  if (capture && designParameterEditIsCurrent(capture)) capture.view.discardEditingRows([capture.targetId])
  designParameterEditCapture = null
  designParameterEditorOpen = false
  const dialog = $components.getApi('design-parameters-dialog')
  if (dialog && typeof dialog.close === 'function' && dialog.isVisible()) dialog.close()
}

function designCloseParameterEditor() {
  const capture = designParameterEditCapture
  if (designParameterViewIsBusy(capture && capture.view)) {
    const dialog = $components.getApi('design-parameters-dialog')
    if (dialog && typeof dialog.open === 'function') dialog.open()
    return
  }
  designCancelParameterEditor()
}

function designParameterRecoveryBeforeRender() {
  return Boolean(designParameterRecovery)
}

function designParameterRecoveryState() {
  const recovery = designParameterRecovery
  if (!recovery) return null
  const pending = recovery.pending && (designParameterViewIsBusy(recovery.view)
    || designParameterHasPendingLocal(recovery.view, recovery.targetId))
  const message = recovery.pending && !pending
    ? '当前 DataView 已无本地待保存修改，请重新读取服务器数据确认状态。' : recovery.message
  return { pending, message }
}

function RenderDesignParameterRecoveryStatus() {
  const state = designParameterRecoveryState()
  if (!state) return null
  return h('p', { role: 'alert' }, state.message)
}

function designParameterRetryBeforeRender() {
  const state = designParameterRecoveryState()
  return Boolean(state && !state.pending
    && !designParameterViewIsBusy(designParameterRecovery.view))
}

function designParameterDiscardBeforeRender() {
  const state = designParameterRecoveryState()
  return Boolean(state && state.pending
    && !designParameterViewIsBusy(designParameterRecovery.view))
}

function designEditableRow(binding, owner, ownerField) {
  if (!designSnapshotIsCurrent()) return null
  const entry = designSnapshot.views.find(item => item.binding === binding)
  if (!entry) return null
  const row = entry.view.currentRow
  if (!row || !entry.rows.includes(row)) return null
  const id = designText(row.rowid)
  if (!id || designText(entry.view.getPkKey(row)) !== id
    || entry.view.fieldAccess(row, 'rowid').read !== 'visible'
    || entry.view.fieldAccess(row, ownerField).read !== 'visible'
    || (owner && designText(row[ownerField]) !== owner)
    || entry.view.editActionState(row) !== 'enabled') return null
  return { entry, row, id }
}

function designModelEditorBeforeRender() {
  return Boolean(designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId'))
}

function designModelUsesInputParameters(modelRow) {
  const modelView = $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`)
  if (!modelView || modelView.fieldAccess(modelRow, 'Type').read !== 'visible') return true
  const sourceType = designText(modelRow && modelRow.Type)
  return sourceType === '接口' || sourceType === '视图'
}

function designModelFilterContextKey(selection) {
  return `${designScenarioId}:${designSnapshot.id}:${selection.id}:${designLoadRevision}`
}

function designModelFilterOptions(selection) {
  const fieldView = $page.resolveView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  if (!fieldView || !designSnapshotIsCurrent()) return { columns: [], tableFields: [], systemParams: [] }
  const modelId = designText(selection.row.rowid)
  const columns = []
  for (const row of fieldView.rows) {
    if (designText(row.dataSetId) !== designSnapshot.id || designText(row.dataModelId) !== modelId
      || fieldView.fieldAccess(row, 'dataSetId').read !== 'visible'
      || fieldView.fieldAccess(row, 'dataModelId').read !== 'visible'
      || fieldView.fieldAccess(row, 'Name').read !== 'visible'
      || fieldView.fieldAccess(row, 'FieldType').read !== 'visible') continue
    const name = designText(row.Name)
    const type = designText(row.FieldType).toLowerCase()
    if (!name || !type) continue
    const column = { name, type }
    if (fieldView.fieldAccess(row, 'description').read === 'visible' && designText(row.description)) {
      column.label = designText(row.description)
    }
    columns.push(column)
  }
  const systemParams = Array.isArray(designParametersValue) ? designParametersValue.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const name = designText(item.Name ?? item.name)
    if (!name) return []
    const label = designText(item.Description ?? item.description)
    return [{ label: label || name, value: name }]
  }) : []
  return { columns, tableFields: columns.map(({ name, label }) => label ? { name, label } : { name }), systemParams }
}

function designModelFilterEditorBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected || designModelUsesInputParameters(selected.row)) return { visible: false }
  const view = selected.entry.view
  const canRead = view.fieldAccess(selected.row, 'Filter').read === 'visible'
  const canWrite = view.fieldAccess(selected.row, 'Filter').write === 'allowed'
  const editingRow = view.getEditingRow(selected.id)
  const context = designModelFilterOptions(selected)
  return { visible: canRead, props: {
    contextKey: designModelFilterContextKey(selected),
    modelValue: editingRow && Object.prototype.hasOwnProperty.call(editingRow, 'Filter') ? editingRow.Filter : selected.row.Filter,
    columns: context.columns,
    functionContext: {
      tables: selected.entry.view.fieldAccess(selected.row, 'Name').read === 'visible'
        ? [{ name: designText(selected.row.Name), fields: context.tableFields }] : [],
      systemParams: context.systemParams,
    },
    disabled: !canWrite || !designSnapshotIsCurrent(),
  } }
}

function designChangeModelFilter(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || typeof event.contextKey !== 'string' || typeof event.value !== 'string') return
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected || designModelUsesInputParameters(selected.row)
    || event.contextKey !== designModelFilterContextKey(selected)
    || selected.entry.view.fieldAccess(selected.row, 'Filter').read !== 'visible'
    || selected.entry.view.fieldAccess(selected.row, 'Filter').write !== 'allowed'
    || !designSnapshotIsCurrent()) return
  selected.entry.view.updateEditingValue(selected.id, 'Filter', event.value)
}

function designModelFieldOptions(modelRow) {
  const fieldView = $page.resolveView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  if (!fieldView || !designSnapshotIsCurrent()) return []
  const modelId = designText(modelRow && modelRow.rowid)
  if (!modelId || designText(modelRow.dataSetId) !== designSnapshot.id) return []
  const options = new Map()
  for (const row of fieldView.rows) {
    if (designText(row.dataSetId) !== designSnapshot.id || designText(row.dataModelId) !== modelId
      || fieldView.fieldAccess(row, 'dataSetId').read !== 'visible'
      || fieldView.fieldAccess(row, 'dataModelId').read !== 'visible'
      || fieldView.fieldAccess(row, 'Name').read !== 'visible') continue
    const value = designText(row.Name)
    if (!value || options.has(value)) continue
    const description = fieldView.fieldAccess(row, 'description').read === 'visible' ? designText(row.description) : ''
    options.set(value, { label: description || value, value })
  }
  return Array.from(options.values())
}

function designModelParentFieldBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected) return { visible: false }
  return { visible: true, props: { options: designModelFieldOptions(selected.row) } }
}

function designEnumOptionsBeforeRender(binding, field, choices) {
  const selected = designEditableRow(binding, designSnapshot && designSnapshot.id, 'dataSetId')
  const options = choices.map(([label, value]) => ({ label, value }))
  if (selected && selected.entry.view.fieldAccess(selected.row, field).read === 'visible') {
    const current = designText(selected.row[field])
    if (current && !choices.some(([, value]) => value === current)) {
      options.unshift({ label: '未知值（当前值保留）', value: current })
    }
  }
  return { options }
}

function designModelOutputTypeBeforeRender() {
  return designEnumOptionsBeforeRender(`#${designScenarioId}@Base_DataModel@designModels`, 'OutputType', [
    ['关联表查询', 'Join'], ['自引用树查询', 'SelfRefData'], ['多表层级查询', 'HierarchyData'],
    ['多表导航查询', 'Navigation'], ['单表查询', 'Table'],
  ])
}

function designModelSelfTypeBeforeRender() {
  return designEnumOptionsBeforeRender(`#${designScenarioId}@Base_DataModel@designModels`, 'selfType', [
    ['直接子节点', 'child'], ['定位展开（祖先及各级同级节点）', 'parent'],
  ])
}

function designModelCacheTypeBeforeRender() {
  return designEnumOptionsBeforeRender(`#${designScenarioId}@Base_DataModel@designModels`, 'cacheType', [
    ['页面缓存', '页面'], ['浏览器缓存', '浏览器'], ['不设置', '不设置'],
  ])
}

function designFieldOrderTypeBeforeRender() {
  return designEnumOptionsBeforeRender(`#${designScenarioId}@Base_DataModel_Field@designFields`, 'OrderType', [
    ['不排序', ''], ['升序', 'ascending'], ['降序', 'descending'],
  ])
}

function designFieldEditorBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
  return Boolean(selected && designSnapshot.views.find(item => item.binding === selected.entry.binding)
    && designSnapshot.views.some(item => item.binding === `#${designScenarioId}@Base_DataModel@designModels`
      && item.rows.some(model => designText(model.rowid) === designText(selected.row.dataModelId))))
}

function designHasEditableChanges(selection, fields) {
  if (!selection) return false
  const { entry, row, id } = selection
  if (!entry.view.hasEditingChanges(id)) return false
  const editingRow = entry.view.getEditingRow(id)
  if (!editingRow) return false
  return Object.keys(editingRow).some(field => fields.includes(field)
    && JSON.stringify(row[field]) !== JSON.stringify(editingRow[field]))
}

function designModelSaveBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  return !designEditError && !designViewIsBusy(selected && selected.entry.view)
    && designHasEditableChanges(selected, ['description', 'Filter', 'RequestComplete', 'OutputType', 'parentField', 'hasChildField',
      'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain'])
}

function designFieldSaveBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
  return !designEditError && !designViewIsBusy(selected && selected.entry.view)
    && designHasEditableChanges(selected, ['description', 'AsName', 'IsOutput', 'OrderType', 'Order', 'Group'])
}

function designModelCancelBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  return Boolean(selected && selected.entry.view.hasEditingChanges(selected.id) && !designViewIsBusy(selected.entry.view))
}

function designFieldCancelBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
  return Boolean(selected && selected.entry.view.hasEditingChanges(selected.id) && !designViewIsBusy(selected.entry.view))
}

function designViewIsBusy(view) {
  return Boolean(view && (view.mutating === true || view.requestState === 2))
}

function RenderDesignEditStatus() {
  return designEditError ? h('p', { role: 'alert', class: 'design-error' }, designEditError) : null
}

function RenderDesignModelConfigStatus() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected) return null
  const view = selected.entry.view
  const warnings = []
  const enums = [
    ['OutputType', ['Join', 'SelfRefData', 'HierarchyData', 'Navigation', 'Table'], '输出类型'],
    ['selfType', ['child', 'parent'], '自引用输出类型'],
    ['cacheType', ['页面', '浏览器', '不设置'], '缓存类型'],
  ]
  for (const [field, values, label] of enums) {
    if (view.fieldAccess(selected.row, field).read !== 'visible') continue
    const value = designText(selected.row[field])
    if (value && !values.includes(value)) warnings.push(`${label}存在未知配置，保存其他字段时将保留。`)
  }
  if (view.fieldAccess(selected.row, 'parentField').read === 'visible'
    && designText(selected.row.parentField) && !designModelFieldOptions(selected.row).some(option => option.value === designText(selected.row.parentField))) {
    warnings.push('父字段不在当前可见的正式字段选项中，保存其他字段时将保留。')
  }
  return warnings.length ? h('p', { class: 'design-warning', role: 'status' }, warnings.join(' ')) : null
}

function RenderDesignFieldConfigStatus() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected || selected.entry.view.fieldAccess(selected.row, 'OrderType').read !== 'visible') return null
  const value = designText(selected.row.OrderType)
  return value && !['ascending', 'descending'].includes(value)
    ? h('p', { class: 'design-warning', role: 'status' }, '排序类型存在未知配置，保存其他字段时将保留。') : null
}

function designCancelEditing(binding, owner, ownerField) {
  const selected = designEditableRow(binding, owner, ownerField)
  if (!selected || designViewIsBusy(selected.entry.view)) return
  selected.entry.view.discardEditingRows([selected.id])
  designEditError = '本地修改已取消；如保存结果曾不确定，请重新加载并核实服务器数据。'
}

function designCancelModelEdit() {
  designCancelEditing(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
}

function designCancelFieldEdit() {
  designCancelEditing(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
}

async function designSaveEditingRow(binding, tableName, editableFields, identityFields) {
  const selection = designEditableRow(binding, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selection || designViewIsBusy(selection.entry.view) || designEditError) return
  const { entry, row, id } = selection
  const view = entry.view
  const editingRow = view.getEditingRow(id)
  if (!editingRow || !view.hasEditingChanges(id)) return
  if (tableName === 'Base_DataModel') {
    for (const field of ['IsBusiness', 'IsBusinessMain']) {
      if (editingRow[field] === true) view.updateEditingValue(id, field, 1)
      else if (editingRow[field] === false) view.updateEditingValue(id, field, 0)
    }
  }
  if (tableName === 'Base_DataModel_Field' && typeof editingRow.IsOutput === 'boolean') {
    view.updateEditingValue(id, 'IsOutput', editingRow.IsOutput ? 1 : 0)
  }
  const normalizedEditingRow = view.getEditingRow(id)
  if (!normalizedEditingRow) return
  const changedFields = Object.keys(normalizedEditingRow)
    .filter(field => JSON.stringify(row[field]) !== JSON.stringify(normalizedEditingRow[field]))
  if (changedFields.length === 0) {
    view.discardEditingRows([id])
    return
  }
  const unexpectedFields = changedFields.filter(field => !editableFields.includes(field))
  if (unexpectedFields.length > 0) throw new Error(`本表单不允许修改字段：${unexpectedFields.join('、')}`)
  if (tableName === 'Base_DataModel_Field') {
    for (const field of ['Order', 'Group']) {
      if (changedFields.includes(field) && (!Number.isSafeInteger(normalizedEditingRow[field]) || normalizedEditingRow[field] < 0)) {
        throw new Error(`${field}必须是非负整数`)
      }
    }
    if (changedFields.includes('OrderType') && !['', 'ascending', 'descending'].includes(normalizedEditingRow.OrderType)) {
      throw new Error('OrderType只能清空或选择升序、降序')
    }
  }
  if (tableName === 'Base_DataModel') {
    const enumFields = {
      OutputType: ['Join', 'SelfRefData', 'HierarchyData', 'Navigation', 'Table'],
      cacheType: ['页面', '浏览器', '不设置'],
    }
    for (const [field, values] of Object.entries(enumFields)) {
      if (changedFields.includes(field) && !values.includes(normalizedEditingRow[field])) {
        throw new Error(`${field}不是有效选项`)
      }
    }
    if (changedFields.includes('selfType') && normalizedEditingRow.selfType !== ''
      && !['child', 'parent'].includes(normalizedEditingRow.selfType)) {
      throw new Error('selfType只能清空或选择 child、parent')
    }
    if (changedFields.includes('parentField') && normalizedEditingRow.parentField
      && !designModelFieldOptions(row).some(option => option.value === designText(normalizedEditingRow.parentField))) {
      throw new Error('parentField必须选择当前模型可见的正式字段')
    }
  }
  for (const field of changedFields) {
    if (view.fieldAccess(row, field).read !== 'visible' || view.fieldAccess(row, field).write !== 'allowed') {
      throw new Error(`字段 ${field} 当前不可读写`)
    }
  }
  const page = $page
  const dataSet = designSnapshot.designDataSet
  const targetId = designSnapshot.id
  const baselineRows = entry.rows
  const baselineTotal = entry.total
  const baselineRequestState = entry.requestState
  if (!designSnapshotIsCurrent() || $page !== page || designCurrentTarget() !== targetId
    || $page.getDataSet(designScenarioId) !== dataSet || $page.resolveView(binding) !== view
    || view.rows !== baselineRows || view.total !== baselineTotal || view.requestState !== baselineRequestState) {
    throw new Error('设计数据、权限或页面上下文已变化，请重新读取后再保存')
  }
  let saveStarted = false
  try {
    saveStarted = true
    const result = await dataSet.saveChanges({ views: [{ tableName, viewId: entry.binding.split('@').pop(), ids: [id] }] })
    if (!result.success || !result.data || result.data.failedCount !== 0
      || result.data.failedEditingRows !== 0 || result.data.savedCount !== 1) {
      throw new Error('DataSet 保存回执未确认唯一目标行成功')
    }
    if ($page !== page || designCurrentTarget() !== targetId || $page.getDataSet(designScenarioId) !== dataSet
      || $page.resolveView(binding) !== view || view.dataSet !== dataSet) {
      throw new Error('保存期间页面或查询 owner 已变化')
    }
    const response = await view.loadFromServer({ fields: identityFields,
      filter: { field: 'dataSetId', operator: 'eq', value: targetId }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    if ($page !== page || designCurrentTarget() !== targetId || $page.getDataSet(designScenarioId) !== dataSet
      || $page.resolveView(binding) !== view || view.dataSet !== dataSet) {
      throw new Error('回读期间页面或查询 owner 已变化')
    }
    if (!response.success || view.loadingError) throw new Error('保存已返回，但服务器回读失败')
    const refreshed = designVerifyRows(view, ['rowid', 'dataSetId'], targetId)
    const savedRow = refreshed.rows.find(item => designText(item.rowid) === id)
    if (refreshed.total !== baselineTotal || !savedRow
      || changedFields.some(field => JSON.stringify(savedRow[field]) !== JSON.stringify(normalizedEditingRow[field]))) {
      throw new Error('保存后回读与提交字段或目标身份不一致')
    }
    const index = designSnapshot.views.findIndex(item => item.binding === binding)
    if (index < 0) throw new Error('保存后的设计视图快照已失效')
    designSnapshot.views[index] = { ...entry, ...refreshed }
    view.setCurrentRow(savedRow)
    designEditError = ''
  } catch (error) {
    if (saveStarted) designEditError = `保存结果未能完全确认：${error instanceof Error ? error.message : '未知错误'}。不要重复提交；可取消本地修改后重新读取服务器状态。`
    throw error
  }
}

async function designSaveModel() {
  try {
    await designSaveEditingRow(`#${designScenarioId}@Base_DataModel@designModels`, 'Base_DataModel',
      ['description', 'Filter', 'RequestComplete', 'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType',
        'IsBusiness', 'IsBusinessMain'], ['rowid', 'Name', 'MetaName', 'description', 'Type', 'dataSetId', 'Filter', 'RequestComplete',
        'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain'])
    $page.showMessage('模型配置已保存并回读', 'success')
  } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '模型配置保存失败', 'warning')
  }
}

async function designSaveField() {
  try {
    await designSaveEditingRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, 'Base_DataModel_Field',
      ['description', 'AsName', 'IsOutput', 'OrderType', 'Order', 'Group'], ['rowid', 'Name', 'AsName', 'FieldType', 'IsOutput',
        'IsPKey', 'description', 'dataSetId', 'dataModelId', 'OrderType', 'Order', 'Group'])
    $page.showMessage('字段配置已保存并回读', 'success')
  } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '字段配置保存失败', 'warning')
  }
}

async function designConfirmParameterEditor() {
  if (designParameterViewIsBusy(designParameterEditCapture && designParameterEditCapture.view) || designParameterRecovery) return
  const capture = designParameterEditCapture
  if (!designParameterEditorOpen || !designParameterEditIsCurrent(capture)) {
    $page.showMessage('输入参数编辑上下文已变化，请重新打开后重试', 'warning')
    return
  }
  const editingRow = capture.view.getEditingRow(capture.targetId)
  if (!editingRow || capture.view.fieldAccess(editingRow, 'inputParams').write !== 'allowed') {
    $page.showMessage('输入参数写权限已变化，请重新读取后重试', 'warning')
    return
  }
  let parsed
  let finalized
  try {
    parsed = designParseInputParameters(editingRow.inputParams)
    const original = designParseInputParameters(capture.row.inputParams)
    if (JSON.stringify(parsed) === JSON.stringify(original)) {
      designCancelParameterEditor()
      return
    }
    finalized = designFinalizeParameterItems(parsed, original)
    if (designParameterArraysEquivalent(finalized, original)) {
      designCancelParameterEditor()
      return
    }
  } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '输入参数校验失败', 'warning')
    return
  }
  if (!designParameterEditIsCurrent(capture)
    || capture.view.fieldAccess(editingRow, 'inputParams').write !== 'allowed') {
    $page.showMessage('输入参数编辑上下文或写权限已变化，请重新读取后重试', 'warning')
    return
  }
  const serialized = JSON.stringify(finalized)
  if (typeof serialized !== 'string') {
    $page.showMessage('输入参数无法序列化', 'warning')
    return
  }
  capture.view.updateEditingValue(capture.targetId, 'inputParams', serialized)
  let saveStarted = false
  try {
    saveStarted = true
    const result = await capture.dataSet.saveChanges({ views: [
      { tableName: 'Base_DataSet', viewId: 'designParameters', ids: [capture.targetId] },
    ] })
    if (!result.success || !result.data || result.data.failedCount !== 0
      || result.data.failedEditingRows !== 0 || result.data.savedCount !== 1) {
      throw new Error('输入参数保存回执未确认唯一目标行成功')
    }
    designParameterEditorOpen = false
    const dialog = $components.getApi('design-parameters-dialog')
    if (dialog && typeof dialog.close === 'function' && dialog.isVisible()) dialog.close()
    if ($page !== capture.page || designCurrentTarget() !== capture.targetId
      || capture.dataSet !== $page.getDataSet(designScenarioId)
      || $page.resolveView(capture.binding) !== capture.view || capture.view.dataSet !== capture.dataSet) {
      throw new Error('保存期间页面或输入参数查询 owner 已变化')
    }
    const readbackResponse = await capture.view.loadFromServer({ fields: ['rowid', 'inputParams'],
      filter: { field: 'rowid', operator: 'eq', value: capture.targetId }, sort: 'rowid:asc',
      allPages: true, maxRows: 50000 })
    if ($page !== capture.page || designCurrentTarget() !== capture.targetId
      || capture.dataSet !== $page.getDataSet(designScenarioId)
      || $page.resolveView(capture.binding) !== capture.view || capture.view.dataSet !== capture.dataSet) {
      throw new Error('保存期间页面或输入参数查询 owner 已变化')
    }
    if (!readbackResponse.success || capture.view.loadingError) throw new Error('输入参数保存成功，但重新读取失败')
    const refreshed = designVerifyRows(capture.view, ['rowid', 'inputParams'])
    if (refreshed.total !== 1 || designText(capture.view.getPkKey(refreshed.rows[0])) !== capture.targetId
      || designText(refreshed.rows[0].rowid) !== capture.targetId) {
      throw new Error('输入参数保存后回读的目标身份不一致')
    }
    const readback = designParseInputParameters(refreshed.rows[0].inputParams)
    if (JSON.stringify(readback) !== JSON.stringify(finalized)) throw new Error('输入参数保存后回读值与提交值不一致')
    const index = designSnapshot.views.findIndex(entry => entry.binding === capture.binding)
    if (index < 0) throw new Error('输入参数查询快照已失效')
    designSnapshot.views[index] = { ...designSnapshot.views[index], ...refreshed }
    designParametersValue = readback
    designParameterEditorOpen = false
    designParameterEditCapture = null
    designParameterRecovery = null
    $page.showMessage('输入参数已保存', 'success')
  } catch (error) {
    if (saveStarted) {
      const pending = designParameterHasPendingLocal(capture.view, capture.targetId)
      designParameterRecovery = { view: capture.view, dataSet: capture.dataSet, page: capture.page,
        targetId: capture.targetId, binding: capture.binding, pending,
        message: pending ? '输入参数保存结果未能确认。可放弃本地修改并重新读取；此操作不代表服务器回滚。'
          : '保存已确认但重新读取未完成。请重新读取服务器数据。' }
      designParameterEditorOpen = false
      designParameterEditCapture = null
      const dialog = $components.getApi('design-parameters-dialog')
      if (dialog && typeof dialog.close === 'function' && dialog.isVisible()) dialog.close()
      const message = error instanceof Error ? error.message : '输入参数保存结果未知'
      if (!message.startsWith('PAGE_RUNTIME_STALE:')) $page.showMessage(message, 'error')
    } else {
      $page.showMessage(error instanceof Error ? error.message : '输入参数保存失败', 'error')
    }
  }
}

async function designParameterDiscardAndRead() {
  const recovery = designParameterRecovery
  const state = designParameterRecoveryState()
  if (!recovery || !state || !state.pending || designParameterViewIsBusy(recovery.view)) return
  const confirmed = await $page.showConfirm('这会放弃当前页面的本地输入参数修改并重新读取；不会撤回可能已提交到服务器的内容。是否继续？', '放弃本地修改并重新读取')
  if (!confirmed) return
  if ($page !== recovery.page || designCurrentTarget() !== recovery.targetId
    || $page.getDataSet(designScenarioId) !== recovery.dataSet
    || $page.resolveView(recovery.binding) !== recovery.view || recovery.view.dataSet !== recovery.dataSet) {
    recovery.message = '页面或查询 owner 已变化；本地修改尚未放弃，请重新打开页面处理。'
    return
  }
  let discarded = false
  try {
    recovery.view.discardPendingChanges([recovery.targetId])
    discarded = true
    recovery.pending = false
    recovery.message = '本地修改已放弃，正在重新读取服务器数据…'
    await reloadDesign()
    if ($page !== recovery.page || designCurrentTarget() !== recovery.targetId
      || $page.getDataSet(designScenarioId) !== recovery.dataSet
      || $page.resolveView(recovery.binding) !== recovery.view || recovery.view.dataSet !== recovery.dataSet) {
      throw new Error('重读期间页面或输入参数查询 owner 已变化')
    }
    if (!designReady) throw new Error('页面数据未能通过完整性校验')
    designParameterRecovery = null
  } catch (error) {
    recovery.message = discarded
      ? `本地修改已放弃，服务器重新读取失败：${error instanceof Error ? error.message : '未知错误'}。可再次重新读取。`
      : `本地修改尚未放弃：${error instanceof Error ? error.message : '未知错误'}。可再次确认后重试。`
  }
}

async function designParameterRetryRead() {
  const recovery = designParameterRecovery
  const state = designParameterRecoveryState()
  if (!recovery || !state || state.pending || designParameterViewIsBusy(recovery.view)) return
  if ($page !== recovery.page || designCurrentTarget() !== recovery.targetId
    || $page.getDataSet(designScenarioId) !== recovery.dataSet
    || $page.resolveView(recovery.binding) !== recovery.view || recovery.view.dataSet !== recovery.dataSet) {
    recovery.message = '页面或查询 owner 已变化，请重新打开页面读取。'
    return
  }
  try {
    await reloadDesign()
    if ($page !== recovery.page || designCurrentTarget() !== recovery.targetId
      || $page.getDataSet(designScenarioId) !== recovery.dataSet
      || $page.resolveView(recovery.binding) !== recovery.view || recovery.view.dataSet !== recovery.dataSet) {
      throw new Error('重读期间页面或输入参数查询 owner 已变化')
    }
    if (!designReady) throw new Error('页面数据未能通过完整性校验')
    designParameterRecovery = null
  } catch (error) {
    recovery.message = `服务器重新读取失败：${error instanceof Error ? error.message : '未知错误'}。可再次重新读取。`
  }
}

function designFieldDisplay(view, row, field) {
  const access = view.fieldAccess(row, field)
  if (access.read === 'invisible') return ''
  if (access.read === 'masked') return '••••'
  const value = row[field]
  return value == null ? '' : String(value)
}

function designGraphBeforeRender() {
  if (designLayoutGraph === null || !designSnapshotIsCurrent()) return { visible: false }
  const modelView = $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`)
  if (!modelView) return { visible: false }
  const rowsById = new Map(modelView.rows.map(row => [designText(row.rowid), row]))
  const nodes = designLayoutGraph.nodes.map(node => {
    const row = rowsById.get(node.id)
    if (!row) return null
    return {
      id: node.id,
      x: node.x,
      y: node.y,
      title: designFieldDisplay(modelView, row, 'MetaName'),
      description: designFieldDisplay(modelView, row, 'description'),
    }
  })
  if (nodes.some(node => node === null)) return { visible: false }
  return { visible: true, props: { nodes, edges: designLayoutGraph.edges } }
}

function designParseInputParameters(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return []
  let parsed
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value } catch {
    throw new Error('输入参数不是有效 JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('输入参数必须是数组')
  if (parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('输入参数项必须是对象')
  }
  return parsed
}

function designParameterId(item) {
  const keys = ['rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id']
  const values = keys.filter(key => Object.prototype.hasOwnProperty.call(item, key))
    .map(key => item[key]).filter(value => value != null && value !== '')
  if (values.some(value => typeof value !== 'string' || !value.trim())) throw new Error('输入参数 ID 类型无效')
  const identities = [...new Set(values.map(value => value.trim()))]
  if (identities.length > 1) throw new Error('输入参数存在冲突的 ID 别名')
  return identities[0] ?? ''
}

function designValidateParameterItems(items) {
  if (!Array.isArray(items)) throw new Error('输入参数必须是数组')
  const ids = new Set()
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第${index + 1}项输入参数必须是对象`)
    const id = designParameterId(item)
    if (id && ids.has(id)) throw new Error(`第${index + 1}项输入参数 ID 重复`)
    if (id) ids.add(id)
    for (const key of ['Name', 'name', 'Description', 'description']) {
      if (Object.prototype.hasOwnProperty.call(item, key) && typeof item[key] !== 'string') {
        throw new Error(`第${index + 1}项${key === 'Name' || key === 'name' ? '名称' : '描述'}类型无效`)
      }
    }
  }
  try { JSON.stringify(items) } catch { throw new Error('输入参数包含无法保存的值') }
}

function designParameterComparable(item) {
  const extra = { ...item }
  for (const key of ['Name', 'name', 'Description', 'description', 'IsBusParam',
    'rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id']) delete extra[key]
  const name = typeof item.Name === 'string' ? item.Name : item.name
  const description = typeof item.Description === 'string' ? item.Description : item.description
  return { id: designParameterId(item), name: typeof name === 'string' ? name.trim() : '',
    description: typeof description === 'string' ? description.trim() : '',
    isBusParam: Boolean(item.IsBusParam), extra: JSON.stringify(extra) }
}

function designParameterArraysEquivalent(left, right) {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index]
    return Boolean(other) && JSON.stringify(designParameterComparable(item)) === JSON.stringify(designParameterComparable(other))
  })
}

function designFinalizeParameterItems(items, originalItems) {
  designValidateParameterItems(items)
  const usedOriginals = new Set()
  return items.map((item, index) => {
    const id = designParameterId(item)
    const originalIndex = originalItems.findIndex((candidate, candidateIndex) => !usedOriginals.has(candidateIndex)
      && (id ? designParameterId(candidate) === id
        : !designParameterId(candidate) && JSON.stringify(candidate) === JSON.stringify(item)))
    if (originalIndex >= 0) {
      usedOriginals.add(originalIndex)
      const original = originalItems[originalIndex]
      if (JSON.stringify(item) === JSON.stringify(original)) return item
    }
    if (!id && originalIndex < 0) {
      throw new Error(`第${index + 1}项输入参数缺少稳定身份`)
    }
    const next = { ...item }
    const name = typeof item.Name === 'string' ? item.Name : item.name
    if (typeof name !== 'string' || !name.trim()) throw new Error(`第${index + 1}项名称不能为空`)
    next.Name = name.trim()
    const description = typeof item.Description === 'string' ? item.Description : item.description
    next.Description = typeof description === 'string' ? description.trim() : ''
    next.IsBusParam = Boolean(item.IsBusParam)
    return next
  })
}

function designParseLayout(source, models, relations) {
  if (source === null) return { state: '未保存布局（文件不存在）', summary: null, graph: null }
  let layout
  try { layout = JSON.parse(source) } catch { throw new Error('布局文件不是有效 JSON') }
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('布局根节点必须是对象')
  if (layout.graphVersion !== 1 || !Array.isArray(layout.nodes) || !Array.isArray(layout.edges)) {
    throw new Error('布局版本或节点/关系结构不受支持')
  }
  const modelIds = new Set(models.rows.map(row => designText(row.rowid)))
  const relationById = new Map(relations.rows.map(row => [designText(row.rowid), row]))
  const nodeIds = new Set()
  for (const node of layout.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string'
      || !modelIds.has(node.id) || nodeIds.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      throw new Error('布局包含未知、重复或坐标无效的模型节点')
    }
    nodeIds.add(node.id)
  }
  const edgeIds = new Set()
  const graphEdges = []
  for (const edge of layout.edges) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge) || typeof edge.id !== 'string'
      || edgeIds.has(edge.id) || !relationById.has(edge.id)) throw new Error('布局包含未知或重复的关系边')
    const relation = relationById.get(edge.id)
    if (designText(edge.sourceNodeId) !== designText(relation.parentModId)
      || designText(edge.targetNodeId) !== designText(relation.childModId)
      || !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new Error('布局关系端点与正式关系不一致')
    }
    const graphEdge = { id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId }
    if (Object.prototype.hasOwnProperty.call(edge, 'pointsList')) {
      if (!Array.isArray(edge.pointsList) || edge.pointsList.length < 2
        || edge.pointsList.some(point => !point || typeof point !== 'object' || Array.isArray(point)
          || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        throw new Error('布局包含无效的边路径点')
      }
      graphEdge.pointsList = edge.pointsList.map(point => ({ x: point.x, y: point.y }))
    }
    graphEdges.push(graphEdge)
    edgeIds.add(edge.id)
  }
  return { state: '已保存布局', summary: { graphVersion: 1, nodes: nodeIds.size, edges: edgeIds.size },
    graph: { nodes: layout.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })), edges: graphEdges } }
}

function designRenderSummary(label, value) {
  return h('div', { class: 'design-summary' }, `${label}：${value}`)
}

function RenderDesignStatus() {
  if (designLoading) return h('div', { class: 'design-status', role: 'status' }, '正在读取数据空间设计信息…')
  if (designError) return h('div', { class: 'design-error', role: 'alert' }, designError)
  if (!designReady) return h('div', { class: 'design-status', role: 'status' }, '正在加载数据空间设计信息…')
  if (!designSnapshotIsCurrent()) return h('div', { class: 'design-error', role: 'alert' }, '数据空间信息已变化，请重新加载')
  return h('div', { class: 'design-status', role: 'status' }, '数据空间设计信息已加载')
}

function RenderDesignParameters() {
  if (!designSnapshotIsCurrent()) return null
  const value = designParametersValue
  return h('section', { class: 'design-panel' }, [
    h('h3', {}, '输入参数'),
    ...(value.length ? value.map((item, index) => {
      const id = item.id ?? item.ID ?? item.rowid
      const name = item.Name ?? item.name
      const description = item.Description ?? item.description
      const isBusiness = Boolean(item.IsBusParam)
      return h('div', { class: 'design-parameter', key: index }, [
        id == null ? null : h('div', {}, `ID：${String(id)}`),
        name == null ? null : h('div', {}, `名称：${String(name)}`),
        description == null ? null : h('div', {}, `描述：${String(description)}`),
        isBusiness == null ? null : h('div', {}, `业务参数：${isBusiness ? '是' : '否'}`),
      ])
    })
      : [h('div', { class: 'design-empty' }, '无输入参数')]),
  ])
}

function RenderDesignLayout() {
  if (!designSnapshotIsCurrent()) return null
  const summary = designLayoutSummary
  return h('section', { class: 'design-panel' }, [
    h('h3', {}, '布局'),
    h('div', { class: 'design-summary' }, designLayoutState),
    ...(summary ? [designRenderSummary('版本', summary.graphVersion),
      designRenderSummary('模型节点', summary.nodes), designRenderSummary('关系边', summary.edges)] : []),
  ])
}

async function reloadDesign() {
  if (designLoading) return
  designReady = false
  designSnapshot = null
  designParametersValue = null
  designLayoutSummary = null
  designLayoutGraph = null
  designEditError = ''
  designLayoutState = '正在读取布局'
  designError = ''
  designLoading = true
  const revision = ++designLoadRevision
  try {
    const id = designCurrentTarget()
    const catalogDataSet = designDataSet(catalogScenarioId, catalogScenarioId)
    const designDataSetRef = designDataSet(designScenarioId, designScenarioId)
    const target = designView(`#${catalogScenarioId}@Base_DataSet@designTarget`)
    const parameters = designView(`#${designScenarioId}@Base_DataSet@designParameters`)
    const models = designView(`#${designScenarioId}@Base_DataModel@designModels`)
    const fields = designView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
    const relations = designView(`#${designScenarioId}@Base_DataModel_Relation@designRelations`)
    designTarget = id
    const capturedViews = [
      { binding: `#${catalogScenarioId}@Base_DataSet@designTarget`, view: target },
      { binding: `#${designScenarioId}@Base_DataSet@designParameters`, view: parameters },
      { binding: `#${designScenarioId}@Base_DataModel@designModels`, view: models },
      { binding: `#${designScenarioId}@Base_DataModel_Field@designFields`, view: fields },
      { binding: `#${designScenarioId}@Base_DataModel_Relation@designRelations`, view: relations },
    ]
    const readCapture = { revision, page: $page, targetId: id, catalogDataSet, designDataSet: designDataSetRef,
      views: capturedViews, verified: [], target: null }

    const targetResponse = await target.loadFromServer({ fields: ['rowid', 'Name', 'Type', 'description'],
      filter: { field: 'rowid', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!targetResponse.success) throw new Error('数据空间目录查询失败或无权读取')
    if (target.loadingError) throw new Error('数据空间目录查询失败或无权读取')
    if (target.rows.length !== 1 || target.total !== 1) throw new Error('目标数据空间不存在、不可读或身份不唯一')
    const targetRow = target.rows[0]
    if (designText(target.getPkKey(targetRow)) !== id || designText(targetRow.rowid) !== id
      || target.fieldAccess(targetRow, 'rowid').read !== 'visible') throw new Error('目标数据空间身份校验失败或无读取权限')
    const targetCapture = { view: target, row: targetRow, rows: target.rows, total: target.total,
      requestState: target.requestState, id }
    readCapture.target = targetCapture

    designAssertReadCurrent(readCapture)
    const parameterResponse = await parameters.loadFromServer({ fields: ['rowid', 'inputParams'],
      filter: { field: 'rowid', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!parameterResponse.success) throw new Error('数据空间参数查询失败或无权读取')
    const parameterResult = designVerifyRows(parameters, ['rowid', 'inputParams'])
    if (parameterResult.total !== 1 || designText(parameterResult.rows[0].rowid) !== id) throw new Error('数据空间参数身份校验失败')

    const parameterOwner = { binding: `#${designScenarioId}@Base_DataSet@designParameters`, view: parameters,
      ...parameterResult, identityFields: ['rowid', 'inputParams'], owner: '' }
    readCapture.verified.push(parameterOwner)
    designAssertReadCurrent(readCapture)
    const modelResponse = await models.loadFromServer({ fields: ['rowid', 'Name', 'MetaName', 'description', 'Type', 'dataSetId',
      'Filter', 'RequestComplete', 'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!modelResponse.success) throw new Error('模型查询失败或无权读取')
    const modelResult = designVerifyRows(models, ['rowid', 'dataSetId'], id)
    const modelIds = new Set(modelResult.rows.map(row => designText(row.rowid)))

    const modelOwner = { binding: `#${designScenarioId}@Base_DataModel@designModels`, view: models,
      ...modelResult, identityFields: ['rowid', 'dataSetId'], owner: id }
    readCapture.verified.push(modelOwner)
    designAssertReadCurrent(readCapture)
    const fieldResponse = await fields.loadFromServer({ fields: ['rowid', 'Name', 'AsName', 'FieldType', 'IsOutput', 'IsPKey',
      'description', 'dataSetId', 'dataModelId', 'OrderType', 'Order', 'Group'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!fieldResponse.success) throw new Error('字段查询失败或无权读取')
    const fieldResult = designVerifyRows(fields, ['rowid', 'dataSetId', 'dataModelId'], id)
    if (fieldResult.rows.some(row => !modelIds.has(designText(row.dataModelId)))) throw new Error('字段所属模型不在目标模型集合中')

    const fieldOwner = { binding: `#${designScenarioId}@Base_DataModel_Field@designFields`, view: fields,
      ...fieldResult, identityFields: ['rowid', 'dataSetId', 'dataModelId'], owner: id }
    readCapture.verified.push(fieldOwner)
    designAssertReadCurrent(readCapture)
    const relationResponse = await relations.loadFromServer({ fields: ['rowid', 'dataSetId', 'parentModId', 'childModId', 'depType', 'filter', 'cascadeDel'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!relationResponse.success) throw new Error('关系查询失败或无权读取')
    const relationResult = designVerifyRows(relations, ['rowid', 'dataSetId', 'parentModId', 'childModId'], id)
    if (relationResult.rows.some(row => !modelIds.has(designText(row.parentModId)) || !modelIds.has(designText(row.childModId)))) {
      throw new Error('正式关系端点不在目标模型集合中')
    }

    const inputParams = designParseInputParameters(parameterResult.rows[0].inputParams)
    const relationOwner = { binding: `#${designScenarioId}@Base_DataModel_Relation@designRelations`, view: relations,
      ...relationResult, identityFields: ['rowid', 'dataSetId', 'parentModId', 'childModId'], owner: id }
    readCapture.verified.push(relationOwner)
    designAssertReadCurrent(readCapture)
    const layoutText = await $page.readDataSpaceLayout(id)
    designAssertReadCurrent(readCapture)
    const layout = designParseLayout(layoutText, modelResult, relationResult)
    if (revision !== designLoadRevision) return

    designSnapshot = {
      id, catalogDataSet, designDataSet: designDataSetRef, targetView: target, targetRow,
      targetRows: target.rows, targetTotal: target.total, targetRequestState: target.requestState,
      views: [
        parameterOwner, modelOwner, fieldOwner, relationOwner,
      ],
    }
    designParametersValue = inputParams
    designLayoutState = layout.state
    designLayoutSummary = layout.summary
    designLayoutGraph = layout.graph
    designReady = true
  } catch (error) {
    if (revision === designLoadRevision) {
      const message = error instanceof Error ? error.message : ''
      const known = ['目标数据空间不存在、不可读或身份不唯一', '目标数据空间身份校验失败或无读取权限',
        '正式数据查询未返回完整结果', '正式数据行身份缺失、重复或与主键不一致',
        '当前数据权限不能读取设计所需身份或关联字段', '数据空间参数身份校验失败',
        '正式数据记录不属于目标数据空间',
        '字段所属模型不在目标模型集合中', '正式关系端点不在目标模型集合中',
        '输入参数不是有效 JSON', '输入参数必须是数组', '输入参数项必须是对象',
        '布局文件不是有效 JSON', '布局根节点必须是对象', '布局版本或节点/关系结构不受支持',
        '布局包含未知、重复或坐标无效的模型节点', '布局包含未知或重复的关系边', '布局关系端点与正式关系不一致',
        '布局包含无效的边路径点']
      designError = message.startsWith('PAGE_RUNTIME_STALE:') ? '页面已失效，请重新打开设计页'
        : known.includes(message) ? message : '设计数据读取失败，请检查网络和数据权限后重试'
    }
  } finally {
    if (revision === designLoadRevision) designLoading = false
  }
}

function designCurrentViewsCaptureIsCurrent(capture) {
  if ($page !== capture.page || $page.getDataSet(catalogScenarioId) !== capture.catalogDataSet
    || $page.getDataSet(designScenarioId) !== capture.designDataSet
    || $page.resolveView(`#${catalogScenarioId}@Base_DataSet@designTarget`) !== capture.targetView
    || capture.targetView.rows !== capture.targetRows || capture.targetView.total !== capture.targetTotal
    || capture.targetView.requestState !== capture.targetRequestState || capture.targetView.loadingError
    || capture.targetRows.length !== 1 || capture.targetRows[0] !== capture.targetRow
    || designText(capture.targetRow.rowid) !== capture.targetId
    || designText(capture.targetView.getPkKey(capture.targetRow)) !== capture.targetId
    || capture.targetView.fieldAccess(capture.targetRow, 'rowid').read !== 'visible') return false
  return capture.views.every(entry => designEntryIsCurrent(entry, entry.owner))
}

async function designRebuildFromCurrentViews(options) {
  const { id, catalogDataSet, designDataSetRef, target, parameters, models, fields, relations } = options
  const targetResult = designVerifyRows(target, ['rowid'])
  if (targetResult.rows.length !== 1 || targetResult.total !== 1) throw new Error('目标数据空间不存在、不可读或身份不唯一')
  const targetRow = targetResult.rows[0]
  if (designText(target.getPkKey(targetRow)) !== id || designText(targetRow.rowid) !== id
    || target.fieldAccess(targetRow, 'rowid').read !== 'visible') throw new Error('目标数据空间身份校验失败或无读取权限')
  const parameterResult = designVerifyRows(parameters, ['rowid', 'inputParams'])
  if (parameterResult.total !== 1 || designText(parameterResult.rows[0].rowid) !== id) throw new Error('数据空间参数身份校验失败')
  const modelResult = designVerifyRows(models, ['rowid', 'dataSetId'], id)
  const modelIds = new Set(modelResult.rows.map(row => designText(row.rowid)))
  const fieldResult = designVerifyRows(fields, ['rowid', 'dataSetId', 'dataModelId'], id)
  if (fieldResult.rows.some(row => !modelIds.has(designText(row.dataModelId)))) throw new Error('字段所属模型不在目标模型集合中')
  const relationResult = designVerifyRows(relations, ['rowid', 'dataSetId', 'parentModId', 'childModId'], id)
  if (relationResult.rows.some(row => !modelIds.has(designText(row.parentModId))
    || !modelIds.has(designText(row.childModId)))) throw new Error('正式关系端点不在目标模型集合中')
  const parameterRow = parameters.getEditingRow(id)
  if (!parameterRow || designText(parameterRow.rowid) !== id) throw new Error('数据空间参数编辑态身份校验失败')
  const inputParams = designParseInputParameters(parameterRow.inputParams)
  const views = [
    { binding: `#${designScenarioId}@Base_DataSet@designParameters`, view: parameters, ...parameterResult,
      identityFields: ['rowid', 'inputParams'], owner: '' },
    { binding: `#${designScenarioId}@Base_DataModel@designModels`, view: models, ...modelResult,
      identityFields: ['rowid', 'dataSetId'], owner: id },
    { binding: `#${designScenarioId}@Base_DataModel_Field@designFields`, view: fields, ...fieldResult,
      identityFields: ['rowid', 'dataSetId', 'dataModelId'], owner: id },
    { binding: `#${designScenarioId}@Base_DataModel_Relation@designRelations`, view: relations, ...relationResult,
      identityFields: ['rowid', 'dataSetId', 'parentModId', 'childModId'], owner: id },
  ]
  const capture = { page: $page, catalogDataSet, designDataSet: designDataSetRef,
    targetView: target, targetRows: targetResult.rows, targetTotal: targetResult.total,
    targetRequestState: targetResult.requestState, targetRow, targetId: id, views }
  const layoutText = await $page.readDataSpaceLayout(id)
  if (!designCurrentViewsCaptureIsCurrent(capture)) throw new Error('SPARK_QUERY_CONTEXT_STALE: 重挂载期间查询身份已变化')
  const layout = designParseLayout(layoutText, modelResult, relationResult)
  designTarget = id
  designSnapshot = { id, catalogDataSet, designDataSet: designDataSetRef, targetView: target, targetRow,
    targetRows: targetResult.rows, targetTotal: targetResult.total, targetRequestState: targetResult.requestState, views }
  designParametersValue = inputParams
  designLayoutState = layout.state
  designLayoutSummary = layout.summary
  designLayoutGraph = layout.graph
  designError = ''
  designReady = true
}

async function __init__() {
  designParameterEditorOpen = false
  designParameterEditCapture = null
  let id
  try { id = designCurrentTarget() } catch (error) {
    designReady = false
    designSnapshot = null
    designParametersValue = null
    designError = error instanceof Error ? error.message : '数据空间 ID 格式无效'
    return
  }
  const catalogDataSet = designDataSet(catalogScenarioId, catalogScenarioId)
  const designDataSetRef = designDataSet(designScenarioId, designScenarioId)
  const target = designView(`#${catalogScenarioId}@Base_DataSet@designTarget`)
  const parameters = designView(`#${designScenarioId}@Base_DataSet@designParameters`)
  const models = designView(`#${designScenarioId}@Base_DataModel@designModels`)
  const fields = designView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  const relations = designView(`#${designScenarioId}@Base_DataModel_Relation@designRelations`)
  const hasEditing = parameters.hasEditingChanges(id)
  const hasPending = parameters.dirtyTracking.hasPendingChanges(id)
  if (hasPending) {
    designTarget = id
    designReady = false
    designSnapshot = null
    designParametersValue = null
    designParameterRecovery = { view: parameters, dataSet: designDataSetRef, page: $page, targetId: id,
      binding: `#${designScenarioId}@Base_DataSet@designParameters`, pending: true,
      message: '当前页面存在未确认的本地输入参数修改。可放弃本地修改并重新读取；此操作不代表服务器回滚。' }
    return
  }
  if (hasEditing) {
    designLoading = true
    try {
      await designRebuildFromCurrentViews({ id, catalogDataSet, designDataSetRef, target,
        parameters, models, fields, relations })
    } catch (error) {
      designReady = false
      designSnapshot = null
      designParametersValue = null
      designError = error instanceof Error ? error.message : '当前页面数据不可用'
      designParameterRecovery = { view: parameters, dataSet: designDataSetRef, page: $page, targetId: id,
        binding: `#${designScenarioId}@Base_DataSet@designParameters`, pending: true,
        message: '本地参数草稿未能重建，先放弃本地修改并重新读取；不会自动提交草稿。' }
    } finally {
      designLoading = false
    }
    return
  }
  await reloadDesign()
}

function returnToCatalog() {
  const path = designReturnPath()
  if (!path) {
    $page.showMessage('缺少当前租户应用下的有效目录返回地址', 'warning')
    return
  }
  $page.navigate(path)
}
