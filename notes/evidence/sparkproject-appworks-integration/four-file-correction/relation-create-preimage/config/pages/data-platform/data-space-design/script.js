var designLoading = false
var designError = ''
var designLayoutState = '尚未读取布局'
var designLayoutSummary = null
var designLayoutGraph = null
var designLayoutText = null
var designGraphDraft = null
var designGraphDraftRevision = 0
var designGraphSelectedId = ''
var designGraphSaving = false
var designGraphSaveUnknown = false
var designGraphMessage = ''
var designContentRevision = -1
var designRecoveryCapture = null
var designLayoutCreatePreview = null
var designLayoutCreateBusy = false
var designLayoutCreateUnknown = false
var designLayoutCreateMessage = ''
var designLayoutCreateRevision = 0
var designParametersValue = null
var designReady = false
var designTarget = null
var designSnapshot = null
var designLoadRevision = 0
var designParameterEditorOpen = false
var designParameterEditCapture = null
var designParameterRecovery = null
var designEditError = ''
var designRelationEditorId = ''
var designRelationDependencyOptions = []
var designRelationDependencyState = '正在读取关系类型字典'
var designRelationSaveError = ''
var designRelationSaving = false
var designRelationValidatedFilter = null
var designRelationValidatedJoinFilter = null
var designRelationJoinEditAllowed = false

var designScenarioId = '8D1AB14DD8277F3E7017CD38F77B09FD'
var catalogScenarioId = '90A82E287930A234FEC3E687C94A93EA'
var designLayoutFingerprintFields = {
  target: ['rowid', 'Name', 'Type', 'description'],
  parameters: ['rowid', 'inputParams'],
  models: ['rowid', 'Name', 'MetaName', 'description', 'Type', 'dataSetId', 'Filter', 'RequestComplete',
    'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain',
    'JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'],
  fields: ['rowid', 'Name', 'AsName', 'FieldType', 'IsOutput', 'IsPKey', 'description', 'dataSetId',
    'dataModelId', 'type', 'ValueFun', 'OrderType', 'Order', 'Group'],
  relations: ['rowid', 'dataSetId', 'parentModId', 'childModId', 'parentTable', 'childTable', 'depType', 'filter', 'cascadeDel'],
}

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

function designVerifyReadableModelNames(view, rows) {
  const names = new Set()
  for (const row of rows) {
    if (view.fieldAccess(row, 'Name').read !== 'visible') continue
    const name = designText(row.Name)
    if (!name) continue
    if (names.has(name)) throw new Error('模型注册名重复，表达式引用无法唯一绑定')
    names.add(name)
  }
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
  return Boolean(designCurrentModelSelection())
}

function designModelUsesInputParameters(modelRow) {
  const modelView = $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`)
  if (!modelView || modelView.fieldAccess(modelRow, 'Type').read !== 'visible') return true
  const sourceType = designText(modelRow && modelRow.Type)
  return sourceType === '接口' || sourceType === '视图'
}

function designModelInputParamOptions(selection) {
  const fieldBinding = `#${designScenarioId}@Base_DataModel_Field@designFields`
  const fieldView = $page.resolveView(fieldBinding)
  const fieldEntry = designSnapshot && designSnapshot.views.find(item => item.binding === fieldBinding)
  if (!fieldView || !fieldEntry || fieldView !== fieldEntry.view || !designSnapshotIsCurrent()) return []
  const modelId = designText(selection.row.rowid)
  if (!modelId || designText(selection.row.dataSetId) !== designSnapshot.id) return []
  return fieldEntry.rows.flatMap(row => {
    if (designText(row.dataSetId) !== designSnapshot.id || designText(row.dataModelId) !== modelId
      || fieldView.fieldAccess(row, 'rowid').read !== 'visible'
      || fieldView.fieldAccess(row, 'dataSetId').read !== 'visible'
      || fieldView.fieldAccess(row, 'dataModelId').read !== 'visible'
      || fieldView.fieldAccess(row, 'type').read !== 'visible'
      || fieldView.fieldAccess(row, 'Name').read !== 'visible'
      || designText(row.type) !== 'inputParams') return []
    const rowid = designText(row.rowid)
    const name = designText(row.Name)
    return rowid && name ? [{ label: name, value: rowid }] : []
  })
}

function designCurrentModelSelection() {
  if (!designSnapshotIsCurrent()) return null
  const binding = `#${designScenarioId}@Base_DataModel@designModels`
  const entry = designSnapshot.views.find(item => item.binding === binding)
  const view = $page.resolveView(binding)
  const row = view && view.currentRow
  if (!entry || !view || view !== entry.view || !row || !entry.rows.includes(row)
    || view.fieldAccess(row, 'rowid').read !== 'visible'
    || view.fieldAccess(row, 'dataSetId').read !== 'visible'
    || view.fieldAccess(row, 'Type').read !== 'visible') return null
  const id = designText(row.rowid)
  if (!id || id !== designText(view.getPkKey(row)) || designText(row.dataSetId) !== designSnapshot.id) return null
  return { entry, view, row, id }
}

function designModelInputParamSelectorBeforeRender() {
  const selected = designCurrentModelSelection()
  if (!selected || !designModelUsesInputParameters(selected.row)) return { visible: false }
  const fieldView = $page.resolveView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  const currentField = fieldView && fieldView.currentRow
  const selectedFieldId = currentField && fieldView.rows.includes(currentField)
    && designText(currentField.dataSetId) === designSnapshot.id
    && designText(currentField.dataModelId) === designText(selected.row.rowid)
    && fieldView.fieldAccess(currentField, 'rowid').read === 'visible'
    && fieldView.fieldAccess(currentField, 'dataSetId').read === 'visible'
    && fieldView.fieldAccess(currentField, 'dataModelId').read === 'visible'
    && fieldView.fieldAccess(currentField, 'type').read === 'visible'
    && fieldView.fieldAccess(currentField, 'Name').read === 'visible'
    && designText(currentField.type) === 'inputParams'
    ? designText(currentField.rowid) : ''
  const options = designModelInputParamOptions(selected)
  return { visible: true, props: { options, modelValue: selectedFieldId,
    disabled: !fieldView || options.length === 0 } }
}

function designSelectModelInputParam(value) {
  if (typeof value !== 'string') return
  const selected = designCurrentModelSelection()
  if (!selected || !designModelUsesInputParameters(selected.row)) return
  const fieldBinding = `#${designScenarioId}@Base_DataModel_Field@designFields`
  const fieldView = $page.resolveView(fieldBinding)
  const fieldEntry = designSnapshot && designSnapshot.views.find(item => item.binding === fieldBinding)
  if (!fieldView || !fieldEntry || fieldView !== fieldEntry.view || !designSnapshotIsCurrent()) return
  if (!value) {
    fieldView.setCurrentRow(null)
    return
  }
  const row = fieldEntry.rows.find(item => designText(item.rowid) === value
    && designText(item.dataSetId) === designSnapshot.id
    && designText(item.dataModelId) === designText(selected.row.rowid)
    && designText(item.type) === 'inputParams'
    && ['rowid', 'dataSetId', 'dataModelId', 'type', 'Name'].every(field => fieldView.fieldAccess(item, field).read === 'visible'))
  if (row) fieldView.setCurrentRow(row)
}

function designValueFunctionContextKey(fieldRow, selectedModelId) {
  return `${designScenarioId}:${designSnapshot.id}:${designText(fieldRow.dataModelId)}:${designText(fieldRow.rowid)}:${selectedModelId}:${designLoadRevision}`
}

function designSpaceParameterOptions() {
  return Array.isArray(designParametersValue) ? designParametersValue.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const name = designText(item.Name ?? item.name)
    if (!name) return []
    const label = designText(item.Description ?? item.description)
    return [{ label: label || name, value: name }]
  }) : []
}

function designExpressionCatalog(currentModelId, extraParentId = '') {
  if (!designSnapshotIsCurrent()) return null
  const modelBinding = `#${designScenarioId}@Base_DataModel@designModels`
  const fieldBinding = `#${designScenarioId}@Base_DataModel_Field@designFields`
  const relationBinding = `#${designScenarioId}@Base_DataModel_Relation@designRelations`
  const modelEntry = designSnapshot.views.find(item => item.binding === modelBinding)
  const fieldEntry = designSnapshot.views.find(item => item.binding === fieldBinding)
  const relationEntry = designSnapshot.views.find(item => item.binding === relationBinding)
  if (!modelEntry || !fieldEntry || !relationEntry || $page.resolveView(modelBinding) !== modelEntry.view
    || $page.resolveView(fieldBinding) !== fieldEntry.view || $page.resolveView(relationBinding) !== relationEntry.view) return null
  const fieldView = fieldEntry.view
  const modelView = modelEntry.view
  const relationView = relationEntry.view
  const modelById = new Map(modelEntry.rows.filter(row => designText(row.dataSetId) === designSnapshot.id
    && ['rowid', 'dataSetId'].every(field => modelView.fieldAccess(row, field).read === 'visible')
    && designText(row.rowid) === designText(modelView.getPkKey(row)))
    .map(row => [designText(row.rowid), row]))
  const currentModel = modelById.get(currentModelId)
  if (!currentModel) return null
  const parentIdsByChild = new Map()
  for (const relation of relationEntry.rows) {
    if (designText(relation.dataSetId) !== designSnapshot.id
      || !['rowid', 'dataSetId', 'parentModId', 'childModId'].every(field => relationView.fieldAccess(relation, field).read === 'visible')
      || designText(relation.rowid) !== designText(relationView.getPkKey(relation))) continue
    const parentId = designText(relation.parentModId)
    const childId = designText(relation.childModId)
    if (!parentId || !childId) continue
    const parents = parentIdsByChild.get(childId) || []
    parents.push(parentId)
    parentIdsByChild.set(childId, parents)
  }
  const visited = new Set([currentModelId])
  const queue = [currentModelId]
  const ancestors = []
  const enqueue = id => {
    if (!id || visited.has(id) || !modelById.has(id)) return
    visited.add(id)
    queue.push(id)
    ancestors.push(modelById.get(id))
  }
  enqueue(extraParentId)
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const id of parentIdsByChild.get(queue[cursor]) || []) enqueue(id)
  }
  const readableFields = model => fieldEntry.rows.flatMap(row => {
    if (designText(row.dataSetId) !== designSnapshot.id || designText(row.dataModelId) !== designText(model.rowid)
      || !['rowid', 'dataSetId', 'dataModelId', 'type', 'Name', 'FieldType'].every(field => fieldView.fieldAccess(row, field).read === 'visible')
      || designText(row.rowid) !== designText(fieldView.getPkKey(row))
      || designText(row.type) === 'inputParams') return []
    const name = designText(row.Name)
    const type = designText(row.FieldType).toLowerCase()
    if (!name || !type) return []
    const description = fieldView.fieldAccess(row, 'description').read === 'visible' ? designText(row.description) : ''
    const alias = fieldView.fieldAccess(row, 'AsName').read === 'visible' ? designText(row.AsName) : ''
    return [{ name, type, ...(description || alias ? { label: description || alias } : {}) }]
  })
  const models = [currentModel, ...ancestors]
  const tables = models.flatMap(model => {
    if (modelView.fieldAccess(model, 'Name').read !== 'visible') return []
    const name = designText(model.Name)
    const fields = readableFields(model)
    return name ? [{ name, fields }] : []
  })
  const relatedFields = ancestors.flatMap(model => {
    if (modelView.fieldAccess(model, 'Name').read !== 'visible') return []
    const modelName = designText(model.Name)
    if (!modelName) return []
    return readableFields(model).map(field => ({
      label: field.label || `${modelName}.${field.name}`,
      value: `${modelName}.${field.name}`,
    }))
  })
  return { currentFields: readableFields(currentModel), tables, relatedFields, params: designSpaceParameterOptions() }
}

function designValueFunctionContext(fieldRow, mode) {
  if (!designSnapshotIsCurrent()) return null
  const fieldEntry = designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataModel_Field@designFields`)
  if (!fieldEntry || !fieldEntry.rows.includes(fieldRow) || designText(fieldRow.dataSetId) !== designSnapshot.id
    || !['rowid', 'dataSetId', 'dataModelId', 'type'].every(field => fieldEntry.view.fieldAccess(fieldRow, field).read === 'visible')
    || designText(fieldRow.rowid) !== designText(fieldEntry.view.getPkKey(fieldRow))) return null
  const catalog = designExpressionCatalog(designText(fieldRow.dataModelId))
  if (!catalog) return null
  const { tables, relatedFields, params } = catalog
  return mode === 'inputParams' ? { tables, relatedFields, systemParams: params } : { tables, relatedFields, inputParams: params }
}

function designFieldValueFunctionBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel_Field@designFields`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected || selected.entry.view.fieldAccess(selected.row, 'type').read !== 'visible'
    || designText(selected.row.type) === 'inputParams'
    || selected.entry.view.fieldAccess(selected.row, 'ValueFun').read !== 'visible') return { visible: false }
  const modelSelection = designCurrentModelSelection()
  const selectedModelId = modelSelection ? modelSelection.id : ''
  const functionContext = designValueFunctionContext(selected.row, 'ordinary')
  if (!functionContext) return { visible: false }
  const editingRow = selected.entry.view.getEditingRow(selected.id)
  return { visible: true, props: {
    contextKey: designValueFunctionContextKey(selected.row, selectedModelId),
    modelValue: editingRow && Object.prototype.hasOwnProperty.call(editingRow, 'ValueFun') ? editingRow.ValueFun : selected.row.ValueFun,
    functionContext,
    disabled: selected.entry.view.fieldAccess(selected.row, 'ValueFun').write !== 'allowed',
  } }
}

function designInputParamValueFunctionBeforeRender() {
  const selectedModel = designCurrentModelSelection()
  const fieldBinding = `#${designScenarioId}@Base_DataModel_Field@designFields`
  const fieldView = $page.resolveView(fieldBinding)
  const fieldEntry = designSnapshot && designSnapshot.views.find(item => item.binding === fieldBinding)
  const row = fieldView && fieldView.currentRow
  if (!selectedModel || !designModelUsesInputParameters(selectedModel.row) || !fieldView || !fieldEntry
    || fieldView !== fieldEntry.view || !row || !fieldEntry.rows.includes(row)
    || designText(row.dataSetId) !== designSnapshot.id || designText(row.dataModelId) !== selectedModel.id
    || designText(row.type) !== 'inputParams'
    || !['rowid', 'dataSetId', 'dataModelId', 'type', 'Name', 'ValueFun'].every(field => fieldView.fieldAccess(row, field).read === 'visible')) {
    return { visible: false }
  }
  const functionContext = designValueFunctionContext(row, 'inputParams')
  if (!functionContext) return { visible: false }
  const editingRow = fieldView.getEditingRow(designText(row.rowid))
  return { visible: true, props: {
    contextKey: designValueFunctionContextKey(row, selectedModel.id),
    modelValue: editingRow && Object.prototype.hasOwnProperty.call(editingRow, 'ValueFun') ? editingRow.ValueFun : row.ValueFun,
    functionContext,
    disabled: fieldView.fieldAccess(row, 'ValueFun').write !== 'allowed'
      || fieldView.editActionState(row) !== 'enabled',
  } }
}

function designInputParamEditorBeforeRender() {
  return designInputParamValueFunctionBeforeRender().visible === true
}

function designChangeFieldValueFunction(event, mode) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || typeof event.contextKey !== 'string' || typeof event.value !== 'string') return
  const fieldBinding = `#${designScenarioId}@Base_DataModel_Field@designFields`
  const fieldView = $page.resolveView(fieldBinding)
  const fieldEntry = designSnapshot && designSnapshot.views.find(item => item.binding === fieldBinding)
  const row = fieldView && fieldView.currentRow
  if (!fieldView || !fieldEntry || fieldView !== fieldEntry.view || !row || !fieldEntry.rows.includes(row)
    || fieldView.fieldAccess(row, 'type').read !== 'visible' || fieldView.fieldAccess(row, 'ValueFun').read !== 'visible'
    || fieldView.fieldAccess(row, 'ValueFun').write !== 'allowed' || !designSnapshotIsCurrent()) return
  let selectedModelId = ''
  if (mode === 'inputParams') {
    const selectedModel = designCurrentModelSelection()
    if (!selectedModel || !designModelUsesInputParameters(selectedModel.row)
      || designText(row.dataModelId) !== selectedModel.id || designText(row.type) !== 'inputParams'
      || fieldView.editActionState(row) !== 'enabled') return
    selectedModelId = selectedModel.id
  } else {
    if (designText(row.type) === 'inputParams') return
    const modelSelection = designCurrentModelSelection()
    selectedModelId = modelSelection ? modelSelection.id : ''
  }
  if (event.contextKey !== designValueFunctionContextKey(row, selectedModelId)) return
  if (event.value !== '') {
    let value
    try { value = JSON.parse(event.value) } catch { return }
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.Type !== 'string' || !value.Type) return
  }
  fieldView.updateEditingValue(designText(row.rowid), 'ValueFun', event.value)
}

function designChangeFieldValueFunctionValue(event) {
  designChangeFieldValueFunction(event, 'ordinary')
}

function designChangeInputParamValueFunction(event) {
  designChangeFieldValueFunction(event, 'inputParams')
}

function designModelFilterContextKey(selection) {
  return `${designScenarioId}:${designSnapshot.id}:${selection.id}:${designLoadRevision}`
}

function designModelFilterOptions(selection) {
  return designExpressionCatalog(designText(selection.row.rowid))
}

function designModelFilterEditorBeforeRender() {
  const selected = designEditableRow(`#${designScenarioId}@Base_DataModel@designModels`, designSnapshot && designSnapshot.id, 'dataSetId')
  if (!selected || designModelUsesInputParameters(selected.row)) return { visible: false }
  const view = selected.entry.view
  const canRead = view.fieldAccess(selected.row, 'Filter').read === 'visible'
  const canWrite = view.fieldAccess(selected.row, 'Filter').write === 'allowed'
  const editingRow = view.getEditingRow(selected.id)
  const context = designModelFilterOptions(selected)
  if (!context) return { visible: false }
  return { visible: canRead, props: {
    contextKey: designModelFilterContextKey(selected),
    modelValue: editingRow && Object.prototype.hasOwnProperty.call(editingRow, 'Filter') ? editingRow.Filter : selected.row.Filter,
    columns: context.currentFields,
    functionContext: {
      tables: context.tables,
      relatedFields: context.relatedFields,
      systemParams: context.params,
      inputParams: context.params,
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

function designRelationEntry() {
  return designSnapshot && designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataModel_Relation@designRelations`)
}

function designRelationModelEntry() {
  return designSnapshot && designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataModel@designModels`)
}

function designRelationFieldEntry() {
  return designSnapshot && designSnapshot.views.find(item => item.binding === `#${designScenarioId}@Base_DataModel_Field@designFields`)
}

function designRelationSelected() {
  const entry = designRelationEntry()
  if (!entry || !designRelationEditorId) return null
  const row = entry.view.rows.find(item => entry.view.getPkKey(item) === designRelationEditorId)
  if (!row || designText(row.dataSetId) !== designSnapshot.id) return null
  return { entry, row, id: designRelationEditorId, editingRow: entry.view.getEditingRow(designRelationEditorId) || row }
}

function designRelationModelById(id) {
  const entry = designRelationModelEntry()
  if (!entry || !designSnapshotIsCurrent()) return null
  const rows = entry.rows.filter(row => designText(row.rowid) === designText(id)
    && designText(row.dataSetId) === designSnapshot.id)
  return rows.length === 1 ? rows[0] : null
}

function designRelationModelLabel(id) {
  const entry = designRelationModelEntry()
  const model = designRelationModelById(id)
  if (!entry || !model || entry.view.fieldAccess(model, 'Name').read !== 'visible') return '模型不可读'
  return designText(model.Name) || designText(id)
}

function designRelationParentName(selected) {
  const parent = selected && designRelationModelById(selected.editingRow.parentModId)
  const modelEntry = designRelationModelEntry()
  if (!parent || !modelEntry || modelEntry.view.fieldAccess(parent, 'Name').read !== 'visible') return ''
  return designText(parent.Name)
}

function designRelationModelOptions() {
  const entry = designRelationModelEntry()
  if (!entry || !designSnapshotIsCurrent()) return []
  return entry.rows.flatMap(row => {
    if (designText(row.dataSetId) !== designSnapshot.id || entry.view.fieldAccess(row, 'rowid').read !== 'visible'
      || entry.view.fieldAccess(row, 'Name').read !== 'visible') return []
    const value = designText(row.rowid)
    const label = designText(row.Name)
    return value && label ? [{ label: `${label}（${value}）`, value }] : []
  })
}

function designRelationAddBeforeRender() {
  const entry = designRelationEntry()
  return { visible: designSnapshotIsCurrent() && entry?.view.addActionState() !== 'hidden'
    && !designRelationSelected(), disabled: true, title: '当前 DataView 未提供新增行字段权限上下文，暂不能安全新增关系' }
}

async function designAddRelation() {
  $page.showMessage('新增关系暂不可用：当前 DataView 没有新行字段级读写权限上下文。', 'warning')
}

function designSelectRelation(row) {
  if (designGraphGuardBusinessMutation()) return
  if (!row || !designSnapshotIsCurrent() || designRelationSaving) return
  const entry = designRelationEntry()
  const id = designText(row.rowid)
  if (!entry || !id || !entry.rows.some(item => item === row)
    || (entry.view.editActionState(row) !== 'enabled' && entry.view.deleteActionState(row) !== 'enabled')
    || designRelationSaveError) return
  if (designRelationSelected()) designCancelRelation()
  designRelationEditorId = id
  designRelationValidatedFilter = null
  designRelationValidatedJoinFilter = null
  const child = designRelationModelById(row.childModId)
  const modelView = designRelationModelEntry()?.view
  designRelationJoinEditAllowed = Boolean(child && modelView && !modelView.dirtyTracking.isDirty(designText(child.rowid))
    && !modelView.hasEditingChanges(designText(child.rowid)) && !modelView.dirtyTracking.isPendingDelete(designText(child.rowid)))
  entry.view.setCurrentRow(row)
  try { designRelationStartEditing({ entry, row, id }) }
  catch (error) { designRelationEditorId = ''; designEditError = error instanceof Error ? error.message : '关系行不可编辑' }
}

function designRelationEndpointOptionsBeforeRender(context) {
  const selected = designRelationSelected()
  const value = selected && selected.editingRow && context?.props?.field ? selected.editingRow[context.props.field] : ''
  const options = designRelationModelOptions()
  const current = designText(value)
  if (current && !options.some(option => option.value === current)) options.unshift({ label: `未知或不可读模型（${current}）`, value: current })
  const childId = selected && designText(selected.editingRow.childModId)
  const modelView = designRelationModelEntry()?.view
  const joinPatch = childId && modelView?.getEditingPatch(childId)
  const joinChanged = joinPatch && ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'].some(field => Object.hasOwn(joinPatch, field))
  return { options, disabled: !selected || !designSnapshotIsCurrent() || designRelationSaving
    || (context?.props?.field === 'childModId' && Boolean(joinChanged)) }
}

function designRelationChildChanged() {
  const selected = designRelationSelected()
  const modelEntry = designRelationModelEntry()
  if (!selected || !modelEntry || !designSnapshotIsCurrent()) return
  const childId = designText(selected.editingRow.childModId)
  const child = designRelationModelById(childId)
  if (!child) return
  modelEntry.view.setCurrentRow(child)
  const patch = modelEntry.view.getEditingPatch(childId)
  designRelationJoinEditAllowed = !modelEntry.view.dirtyTracking.isDirty(childId)
    && !modelEntry.view.dirtyTracking.isPendingDelete(childId)
    && !(patch && Object.keys(patch).some(field => !['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'].includes(field)))
  designRelationValidatedJoinFilter = null
}

function designRelationDependencyOptionsBeforeRender() {
  const selected = designRelationSelected()
  const current = selected && selected.entry.view.fieldAccess(selected.row, 'depType').read === 'visible'
    ? designText(selected.editingRow.depType) : ''
  const options = designRelationDependencyOptions.slice()
  if (current && !options.some(option => option.value === current)) options.unshift({ label: `未知值（${current}，保存其他字段时保留）`, value: current })
  return { options, disabled: !selected || !designSnapshotIsCurrent() || designRelationSaving
    || designRelationDependencyState !== '关系类型字典已读取' }
}

function designRelationFilterContext(selected) {
  const childId = designText(selected && selected.editingRow.childModId)
  const parentId = selected?.entry.view.fieldAccess(selected.row, 'parentModId').read === 'visible'
    ? designText(selected.editingRow.parentModId) : ''
  const catalog = designExpressionCatalog(childId, parentId)
  return catalog ? { columns: catalog.currentFields, functionContext: { tables: catalog.tables,
    relatedFields: catalog.relatedFields, systemParams: catalog.params, inputParams: catalog.params } }
    : { columns: [], functionContext: { tables: [], relatedFields: [], systemParams: [], inputParams: [] } }
}

function designRelationEditorBeforeRender() {
  const selected = designRelationSelected()
  return { visible: Boolean(selected), props: { disabled: designRelationSaving || !designSnapshotIsCurrent()
    || selected?.entry.view.editActionState(selected.row) !== 'enabled' } }
}

function designRelationFilterBeforeRender() {
  const selected = designRelationSelected()
  if (!selected) return { visible: false }
  const view = selected.entry.view
  const access = view.fieldAccess(selected.row, 'filter')
  const context = designRelationFilterContext(selected)
  return { visible: access.read === 'visible', props: { contextKey: `relation:${designSnapshot.id}:${selected.id}:${designLoadRevision}`,
    modelValue: selected.editingRow.filter ?? '', columns: context.columns, functionContext: context.functionContext,
    disabled: access.write !== 'allowed' || selected.entry.view.editActionState(selected.row) !== 'enabled'
      || !designSnapshotIsCurrent() || designRelationSaving } }
}

function designChangeRelationFilter(event) {
  const selected = designRelationSelected()
  if (!selected || !event || typeof event.contextKey !== 'string' || typeof event.value !== 'string'
    || event.contextKey !== `relation:${designSnapshot.id}:${selected.id}:${designLoadRevision}`
    || selected.entry.view.fieldAccess(selected.row, 'filter').write !== 'allowed' || !designSnapshotIsCurrent()) return
  selected.entry.view.updateEditingValue(selected.id, 'filter', event.value)
}

function designRelationFilterValidation(event) {
  const selected = designRelationSelected()
  const expected = selected ? `relation:${designSnapshot.id}:${selected.id}:${designLoadRevision}` : ''
  if (!selected || !event || event.contextKey !== expected || typeof event.valid !== 'boolean'
    || (event.value != null && typeof event.value !== 'string')) return
  designRelationValidatedFilter = { id: selected.id, contextKey: expected, value: event.value ?? '', valid: event.valid, message: event.message }
}

function designRelationJoinInfo(selected) {
  if (!selected) return null
  const modelEntry = designRelationModelEntry()
  const child = designRelationModelById(selected.editingRow.childModId)
  if (!modelEntry || !child || modelEntry.view.fieldAccess(child, 'PId').read !== 'visible') return { child, ownerId: '', editable: false }
  const ownerId = designText(modelEntry.view.getEditingRow(designText(child.rowid))?.PId ?? child.PId)
  const parentName = designRelationParentName(selected)
  return { child, ownerId, editable: !ownerId || (parentName !== '' && ownerId === parentName) }
}

function designRelationJoinOwnerBeforeRender() {
  const info = designRelationJoinInfo(designRelationSelected())
  const entry = designRelationModelEntry()
  const owners = info?.ownerId && entry ? entry.rows.filter(row => designText(row.Name) === info.ownerId
    && entry.view.fieldAccess(row, 'Name').read === 'visible') : []
  const ownerLabel = owners.length === 1 ? `${info.ownerId}（${designText(owners[0].rowid)}）`
    : owners.length > 1 ? `${info.ownerId}（模型 Name 不唯一）` : info?.ownerId || ''
  return { value: !info ? 'Join 配置归属不可读' : info.ownerId
    ? `由父模型 ${ownerLabel} 的关系管理` : '尚未配置 Join 归属' }
}

function designRelationJoinEditorBeforeRender() {
  const selected = designRelationSelected()
  const info = designRelationJoinInfo(selected)
  if (info?.child && designRelationModelEntry()?.view.currentRow !== info.child) designRelationModelEntry().view.setCurrentRow(info.child)
  return { visible: Boolean(info && info.child), props: { disabled: designRelationSaving || !info?.editable
    || !designRelationJoinEditAllowed || !designSnapshotIsCurrent() } }
}

function designRelationJoinFieldBeforeRender(context) {
  const selected = designRelationSelected()
  const info = designRelationJoinInfo(selected)
  const fieldEntry = designRelationFieldEntry()
  const modelEntry = designRelationModelEntry()
  const options = []
  if (fieldEntry && info?.child) for (const field of fieldEntry.rows) {
    if (designText(field.dataSetId) !== designSnapshot.id || designText(field.dataModelId) !== designText(info.child.rowid)
      || fieldEntry.view.fieldAccess(field, 'Name').read !== 'visible') continue
    const description = fieldEntry.view.fieldAccess(field, 'description').read === 'visible' ? designText(field.description) : ''
    options.push({ label: description || designText(field.Name), value: designText(field.Name) })
  }
  const current = modelEntry && info?.child && modelEntry.view.fieldAccess(info.child, 'JoinType').read === 'visible'
    ? designText(modelEntry.view.getEditingRow(designText(info.child.rowid))?.JoinType ?? info.child.JoinType) : ''
  const joinTypes = [['内连接', 'INNER'], ['左连接', 'LEFT'], ['右连接', 'RIGHT'], ['全连接', 'FULL'], ['交叉连接', 'CROSS']]
    .map(([label, value]) => ({ label, value }))
  if (current && !joinTypes.some(option => option.value === current)) joinTypes.unshift({ label: `未知值（${current}）`, value: current })
  return { options: context?.props?.field === 'JoinType' ? joinTypes : options,
    disabled: !info?.editable || !selected || !designSnapshotIsCurrent() || designRelationSaving }
}

function designRelationJoinFilterBeforeRender() {
  const selected = designRelationSelected()
  const info = designRelationJoinInfo(selected)
  if (!selected || !info?.child) return { visible: false }
  const modelEntry = designRelationModelEntry()
  const parentName = designRelationParentName(selected)
  const editable = designText(info.child.PId) === '' || (parentName !== '' && designText(info.child.PId) === parentName)
  const model = modelEntry.view.getEditingRow(designText(info.child.rowid)) || info.child
  const context = designRelationFilterContext(selected)
  return { visible: modelEntry.view.fieldAccess(info.child, 'JoinFilter').read === 'visible', props: {
    contextKey: `join:${designSnapshot.id}:${selected.id}:${designLoadRevision}`,
    modelValue: model.JoinFilter ?? '', columns: context.columns, functionContext: context.functionContext,
    disabled: !editable || modelEntry.view.fieldAccess(info.child, 'JoinFilter').write !== 'allowed'
      || !designSnapshotIsCurrent() || designRelationSaving,
  } }
}

function designChangeRelationJoinFilter(event) {
  const selected = designRelationSelected()
  const info = designRelationJoinInfo(selected)
  const modelEntry = designRelationModelEntry()
  if (!selected || !info?.child || !modelEntry || !event || typeof event.contextKey !== 'string'
    || typeof event.value !== 'string' || event.contextKey !== `join:${designSnapshot.id}:${selected.id}:${designLoadRevision}`
    || !info.editable || modelEntry.view.fieldAccess(info.child, 'JoinFilter').write !== 'allowed' || !designSnapshotIsCurrent()) return
  modelEntry.view.updateEditingValue(designText(info.child.rowid), 'JoinFilter', event.value)
}

function designRelationJoinFilterValidation(event) {
  const selected = designRelationSelected()
  const info = designRelationJoinInfo(selected)
  const expected = selected ? `join:${designSnapshot.id}:${selected.id}:${designLoadRevision}` : ''
  if (!selected || !info?.child || !event || event.contextKey !== expected || typeof event.valid !== 'boolean'
    || (event.value != null && typeof event.value !== 'string')) return
  designRelationValidatedJoinFilter = { id: selected.id, childId: designText(info.child.rowid), contextKey: expected,
    value: event.value ?? '', valid: event.valid, message: event.message }
}

async function designLoadRelationDependencyOptions(capture) {
  if (typeof $page.readDataSpaceRelationDependencyOptions !== 'function') {
    designRelationDependencyOptions = []
    designRelationDependencyState = '关系类型字典读取能力不可用'
    return
  }
  designRelationDependencyState = '正在读取关系类型字典'
  try {
    const options = await $page.readDataSpaceRelationDependencyOptions()
    designAssertReadCurrent(capture)
    if (!Array.isArray(options) || options.some(item => !item || typeof item.label !== 'string'
      || typeof item.value !== 'string' || !item.value.trim())) throw new Error('正式关系类型字典格式无效')
    designRelationDependencyOptions = options.map(item => ({ label: item.label, value: item.value }))
    designRelationDependencyState = '关系类型字典已读取'
  } catch (error) {
    designRelationDependencyOptions = []
    designRelationDependencyState = error instanceof Error ? error.message : '关系类型字典读取失败'
  }
}

function designRelationUpdateSnapshotAfterOwnedMutation(entry) {
  if (!designSnapshot || !entry || !designSnapshotIsCurrentForRelationMutation(entry)) return false
  const index = designSnapshot.views.findIndex(item => item.binding === entry.binding)
  if (index < 0) return false
  designSnapshot.views[index] = { ...entry, rows: entry.view.rows, total: entry.view.total, requestState: entry.view.requestState }
  return true
}

function designSnapshotIsCurrentForRelationMutation(entry) {
  if (!designSnapshot || $page.getDataSet(designScenarioId) !== designSnapshot.designDataSet
    || designCurrentTarget() !== designSnapshot.id || entry.view.requestState !== entry.requestState
    || entry.view.loadingError || entry.view.mutating || entry.view.requestState !== 3) return false
  return designSnapshot.views.every(item => item.binding === entry.binding
    ? item.view === entry.view && item.view.requestState === item.requestState
    : designEntryIsCurrent(item, item.owner))
}

function designRelationCaptureOwnerIsCurrent(capture) {
  return $page === capture.page && designCurrentTarget() === capture.targetId
    && $page.getDataSet(designScenarioId) === capture.dataSet
    && $page.resolveView(`#${designScenarioId}@Base_DataModel_Relation@designRelations`) === capture.relationView
    && $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`) === capture.modelView
    && !capture.relationView.loadingError && !capture.modelView.loadingError
    && capture.relationView.requestState === 3 && capture.modelView.requestState === 3
}

function designRelationSaveReceiptIsExact(data, expectedViews) {
  if (!data || data.viewCount !== expectedViews.length || data.viewResults?.length !== expectedViews.length
    || data.failedCount !== 0 || data.failedEditingRows !== 0) return false
  const matches = expectedViews.map(expected => data.viewResults.filter(result => result.tableName === expected.tableName
    && result.viewId === expected.viewId))
  if (matches.some(items => items.length !== 1)) return false
  return expectedViews.every((expected, index) => {
    const result = matches[index][0]
    if (!result || result.failedCount !== 0 || result.failedEditingRows !== 0) return false
    const counts = { create: result.createdCount, change: result.savedCount, delete: result.deletedCount }
    const expectedCount = counts[expected.action]
    return expectedCount === 1 && Object.entries(counts).every(([action, count]) => action === expected.action || count === 0)
  })
}

function designRelationStartEditing(selected) {
  const { entry, row, id } = selected
  if (entry.view.dirtyTracking.isPendingCreate(id)) return
  if (entry.view.dirtyTracking.isDirty(id) || entry.view.hasEditingChanges(id)
    || entry.view.dirtyTracking.isPendingDelete(id)) throw new Error('关系行存在其他本地修改，请先处理后再编辑')
  for (const field of ['rowid', 'dataSetId', 'parentModId', 'childModId']) {
    if (entry.view.fieldAccess(row, field).read !== 'visible') throw new Error(`关系字段 ${field} 不可读`)
  }
  if (entry.view.editActionState(row) !== 'enabled') return
  for (const field of ['depType', 'filter', 'cascadeDel']) {
    if (entry.view.fieldAccess(row, field).read !== 'visible') throw new Error(`关系字段 ${field} 不可读`)
  }
  for (const field of ['parentModId', 'childModId', 'depType', 'filter']) {
    entry.view.updateEditingValue(id, field, row[field] ?? '')
  }
}

function designRelationTouchEndpoints(selected) {
  const view = selected.entry.view
  const row = view.getEditingRow(selected.id) || selected.row
  const parentId = designText(row.parentModId)
  const childId = designText(row.childModId)
  const parent = designRelationModelById(parentId)
  const child = designRelationModelById(childId)
  if (!parent || !child) throw new Error('请选择目标空间中可读的父、子模型')
  const modelView = designRelationModelEntry().view
  for (const [model, fields] of [[parent, ['Name']], [child, ['Name']]]) {
    for (const field of fields) if (modelView.fieldAccess(model, field).read !== 'visible') throw new Error('关系端点注册名不可读')
  }
  const endpointChanged = view.dirtyTracking.isPendingCreate(selected.id)
    || designText(selected.row.parentModId) !== parentId || designText(selected.row.childModId) !== childId
  for (const [field, model] of [['parentTable', parent], ['childTable', child]]) {
    if (!endpointChanged) continue
    const access = view.fieldAccess(selected.row, field)
    const next = designText(model.Name)
    if (access.read !== 'visible') throw new Error(`关系字段 ${field} 当前不可读`)
    if (String(selected.row[field] ?? '') !== next && access.write !== 'allowed') throw new Error(`关系字段 ${field} 当前不可写`)
    if (String(selected.row[field] ?? '') === next) continue
    view.updateEditingValue(selected.id, field, next)
  }
  return { parent, child, row: view.getEditingRow(selected.id) || row }
}

function designRelationValidateJoin(selected, child) {
  const modelEntry = designRelationModelEntry()
  const childId = designText(child.rowid)
  const modelView = modelEntry.view
  const base = child
  const editing = modelView.getEditingRow(childId) || base
  const candidatePatch = modelView.getEditingPatch(childId) || {}
  const joinTouched = ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'].some(field => Object.hasOwn(candidatePatch, field))
  if (!joinTouched) return { modelView, childId, base, editing, changed: [] }
  const ownerId = designText(editing.PId)
  const relationParentName = designRelationParentName(selected)
  const ownsJoin = !ownerId || (relationParentName !== '' && ownerId === relationParentName)
  const joinFields = ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId']
  for (const field of joinFields) {
    if (modelView.fieldAccess(base, field).read !== 'visible') throw new Error(`子模型 Join 字段 ${field} 不可读`)
  }
  if (!ownsJoin) return { modelView, childId, base, editing, changed: [] }
  const joinType = designText(editing.JoinType)
  const foreignKey = designText(editing.ForeignKeyFields)
  const joinFilter = designText(editing.JoinFilter)
  const present = Boolean(joinType || foreignKey || joinFilter)
  if (present && (!joinType || !foreignKey || !joinFilter)) throw new Error('子模型 Join 配置的 Join 类型、外键字段和过滤条件必须全部填写或全部清空')
  if (joinType && joinType !== designText(base.JoinType) && !['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'].includes(joinType)) throw new Error('JoinType 不是有效选项')
  if (foreignKey && !designModelFieldOptions(child).some(option => option.value === foreignKey)) throw new Error('外键字段必须是子模型可读正式字段')
  if (joinFilter !== designText(base.JoinFilter) || Boolean(joinFilter)) {
    const contextKey = `join:${designSnapshot.id}:${selected.id}:${designLoadRevision}`
    if (designRelationValidatedJoinFilter?.id !== selected.id || designRelationValidatedJoinFilter?.childId !== childId
      || designRelationValidatedJoinFilter?.contextKey !== contextKey || !designRelationValidatedJoinFilter.valid
      || designRelationValidatedJoinFilter.value !== joinFilter) throw new Error(designRelationValidatedJoinFilter?.message
        || 'JoinFilter 必须由当前结构化过滤控件确认有效后提交')
  }
  const targetOwner = present ? designRelationParentName(selected) : ''
  if (present && !targetOwner) throw new Error('子模型 Join 归属父模型 Name 不可读')
  const changed = []
  for (const [field, next] of [['JoinType', joinType], ['ForeignKeyFields', foreignKey], ['JoinFilter', joinFilter], ['PId', targetOwner]]) {
    if (String(base[field] ?? '') === String(next)) continue
    if (modelView.fieldAccess(base, field).write !== 'allowed') throw new Error(`子模型字段 ${field} 当前不可写`)
    changed.push(field)
  }
  return { modelView, childId, base, editing, changed, values: { JoinType: joinType, ForeignKeyFields: foreignKey,
    JoinFilter: joinFilter, PId: targetOwner } }
}

function designRelationAssertCurrent(capture) {
  if (!designSnapshotIsCurrent() || designSnapshot.id !== capture.targetId || designSnapshot.designDataSet !== capture.dataSet
    || !designRelationCaptureOwnerIsCurrent(capture)) throw new Error('关系编辑期间页面、目标或查询权限已变化')
}

async function designPersistRelationLayoutEdge(command) {
  const contentOwner = $page.getDataSpaceLayoutContent(command.targetId)
  if (contentOwner.status !== 'idle' || contentOwner.draft !== undefined) {
    designLayoutState = '关系元数据已确认；布局草稿或文件结果未确认，未同步关系边'
    throw new Error('PARTIAL_LAYOUT:关系元数据已确认，但布局草稿或文件结果未确认')
  }
  const current = await $page.readDataSpaceLayout(command.targetId)
  if (!designRelationCaptureOwnerIsCurrent(command.capture)) throw new Error('布局读取期间关系查询身份或页面已变化')
  if (current === null) {
    designLayoutState = '布局文件缺失；关系元数据已确认，未自动创建布局'
    throw new Error('PARTIAL_LAYOUT:布局文件缺失，关系元数据已确认但图结果未确认')
  }
  if (typeof current !== 'string' || current !== designLayoutText) throw new Error('布局原文已变化，请重新读取后再操作')
  if (typeof $page.saveDataSpaceLayout !== 'function') throw new Error('PARTIAL_LAYOUT: 布局写入能力不可用')
  const layout = JSON.parse(current)
  const nodes = new Set(layout.nodes.map(node => node.id))
  const edges = layout.edges
  const index = edges.findIndex(edge => edge.id === command.id)
  let changed = false
  if (command.action === 'delete') {
    if (index >= 0) { edges.splice(index, 1); changed = true }
  } else if (command.action === 'add') {
    if (nodes.has(command.parentId) && nodes.has(command.childId) && index < 0) {
      edges.push({ id: command.id, sourceNodeId: command.parentId, targetNodeId: command.childId })
      changed = true
    }
  } else if (nodes.has(command.parentId) && nodes.has(command.childId)) {
    if (index < 0) {
      edges.push({ id: command.id, sourceNodeId: command.parentId, targetNodeId: command.childId })
      changed = true
    } else {
      const edge = edges[index]
      if (edge.sourceNodeId !== command.parentId || edge.targetNodeId !== command.childId) {
      const nextEdge = { ...edge, sourceNodeId: command.parentId, targetNodeId: command.childId }
      delete nextEdge.pointsList
      edges[index] = nextEdge
      changed = true
      }
    }
  } else if (command.action === 'change' && index >= 0) {
    edges.splice(index, 1)
    changed = true
  } else if (index >= 0) {
    // The former edge would no longer match the formal relation after the endpoint change.
    edges.splice(index, 1)
    changed = true
  }
  if (!changed) {
    designLayoutState = command.action === 'add' && (!nodes.has(command.parentId) || !nodes.has(command.childId))
      ? '关系元数据已确认；布局未包含关系端点节点，保留原文且未自动放置节点'
      : '布局原文无需变更；关系元数据已确认'
    return
  }
  const content = JSON.stringify(layout)
  try {
    await $page.saveDataSpaceLayout({ dataSpaceId: command.targetId, content, expectedContent: current })
    if (!designRelationCaptureOwnerIsCurrent(command.capture)) throw new Error('布局写入期间关系查询身份或页面已变化')
    designLayoutText = content
    designLayoutState = '关系布局已写入并回读确认'
  } catch (error) {
    designLayoutState = `关系元数据已确认，布局未确认：${error instanceof Error ? error.message : '未知错误'}`
    throw error
  }
}

async function designRebuildRelationSnapshot(capture) {
  if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('关系结果更新期间页面或查询身份已变化')
  const catalogDataSet = $page.getDataSet(catalogScenarioId)
  const target = $page.resolveView(`#${catalogScenarioId}@Base_DataSet@designTarget`)
  const parameters = $page.resolveView(`#${designScenarioId}@Base_DataSet@designParameters`)
  const models = $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`)
  const fields = $page.resolveView(`#${designScenarioId}@Base_DataModel_Field@designFields`)
  const relations = $page.resolveView(`#${designScenarioId}@Base_DataModel_Relation@designRelations`)
  if (!catalogDataSet || !target || !parameters || !models || !fields || !relations) throw new Error('关系结果更新所需正式 DataView 不可用')
  await designRebuildFromCurrentViews({ id: capture.targetId, catalogDataSet, designDataSetRef: capture.dataSet,
    target, parameters, models, fields, relations })
}

async function designSaveRelation() {
  if (designGraphGuardBusinessMutation()) return
  const selected = designRelationSelected()
  if (!selected || designRelationSaving || designRelationSaveError) return
  const isNew = selected.entry.view.dirtyTracking.isPendingCreate(selected.id)
  const relationView = selected.entry.view
  const modelEntry = designRelationModelEntry()
  const modelView = modelEntry.view
  const dataSet = designSnapshot.designDataSet
  const capture = { page: $page, targetId: designSnapshot.id, dataSet, relationView, modelView }
  let dispatched = false
  let stagedModelId = ''
  let stagedRelation = false
  try {
    if (!designSnapshotIsCurrent() || (isNew && relationView.addActionState() !== 'enabled')) throw new Error('关系查询身份或新增权限已失效')
    const endpoint = designRelationTouchEndpoints(selected)
    const row = endpoint.row
    if (relationView.fieldAccess(selected.row, 'dataSetId').read !== 'visible') throw new Error('关系数据空间身份不可读')
    const relationFields = ['parentModId', 'childModId', 'depType', 'filter', 'parentTable', 'childTable']
    const changedFields = relationFields.filter(field => String(selected.row[field] ?? '') !== String(row[field] ?? ''))
    for (const field of changedFields) {
      const access = relationView.fieldAccess(selected.row, field)
      if (access.read !== 'visible' || access.write !== 'allowed') throw new Error(`关系字段 ${field} 当前不可读写`)
    }
    if (designText(row.dataSetId) !== capture.targetId) throw new Error('关系目标身份无效')
    for (const field of ['parentModId', 'childModId']) {
      if (relationView.fieldAccess(selected.row, field).read !== 'visible') throw new Error(`关系字段 ${field} 不可读`)
    }
    const depType = designText(row.depType)
    const depTypeChanged = isNew || depType !== designText(selected.row.depType)
    if ((depTypeChanged || changedFields.includes('depType'))
      && relationView.fieldAccess(selected.row, 'depType').read !== 'visible') throw new Error('关系字段 depType 不可读')
    if (depTypeChanged && (!depType || designRelationDependencyState !== '关系类型字典已读取'
      || !designRelationDependencyOptions.some(option => option.value === depType))) throw new Error('关系类型字典不可用或所选关系类型无效')
    for (const field of changedFields) {
      const access = relationView.fieldAccess(selected.row, field)
      if (access.required && !designText(row[field])) throw new Error(`关系字段 ${field} 为必填`)
    }
    const filterChanged = isNew || changedFields.includes('filter')
    if (filterChanged) {
      if (relationView.fieldAccess(selected.row, 'filter').read !== 'visible') throw new Error('关系字段 filter 不可读')
      if (typeof row.filter !== 'string') throw new Error('关系过滤条件必须是正式序列化字符串')
      const filterContextKey = `relation:${designSnapshot.id}:${selected.id}:${designLoadRevision}`
      if (designRelationValidatedFilter?.id !== selected.id || designRelationValidatedFilter?.contextKey !== filterContextKey
        || !designRelationValidatedFilter.valid || designRelationValidatedFilter.value !== row.filter) {
        throw new Error(designRelationValidatedFilter?.message || '关系过滤条件必须由当前结构化过滤控件确认有效后提交')
      }
    }
    const join = designRelationValidateJoin(selected, endpoint.child)
    const relationChanged = isNew || changedFields.length > 0
    if (!relationChanged && join.changed.length === 0) throw new Error('关系没有待保存的修改')
    designRelationAssertCurrent(capture)

    designRelationSaving = true
    if (join.changed.length) {
      const joinPatch = modelView.getEditingPatch(join.childId) || {}
      const hasOtherModelDraft = Object.keys(joinPatch).some(field => !['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'].includes(field))
      if (!designRelationJoinEditAllowed || modelView.dirtyTracking.isDirty(join.childId)
        || hasOtherModelDraft || modelView.dirtyTracking.isPendingDelete(join.childId)) {
        throw new Error('子模型存在其他本地修改，拒绝混入关系保存')
      }
      for (const field of join.changed) modelView.updateEditingValue(join.childId, field, join.values[field])
      const apply = await modelView.applyEditingRows([join.childId])
      if (!apply.success || apply.data?.failedCount !== 0) throw new Error('子模型 Join 编辑状态无法 stage')
      stagedModelId = join.childId
      if (!designRelationUpdateSnapshotAfterOwnedMutation(modelEntry)) throw new Error('子模型 Join 草稿无法绑定当前查询快照')
    }
    if (!isNew && relationChanged) {
      const patch = Object.fromEntries(changedFields
        .map(field => [field, row[field]]))
      const staged = await relationView.editRowById(selected.id, patch)
      if (staged !== true && staged?.success !== true) throw new Error('关系修改无法 stage')
      stagedRelation = true
      if (!designRelationUpdateSnapshotAfterOwnedMutation(selected.entry)) throw new Error('关系修改草稿无法绑定当前查询快照')
    }
    if (isNew) {
      const apply = await relationView.applyEditingRows([selected.id])
      if (!apply.success || apply.data?.failedCount !== 0) throw new Error('新增关系编辑状态无法 stage')
      stagedRelation = true
      if (!designRelationUpdateSnapshotAfterOwnedMutation(selected.entry)) throw new Error('新增关系草稿无法绑定当前查询快照')
    }
    if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('stage 后关系查询身份或页面已变化')
    const views = []
    const expectedViews = []
    if (join.changed.length) {
      views.push({ tableName: 'Base_DataModel', viewId: 'designModels', ids: [join.childId] })
      expectedViews.push({ tableName: 'Base_DataModel', viewId: 'designModels', action: 'change' })
    }
    if (isNew || relationChanged) {
      views.push({ tableName: 'Base_DataModel_Relation', viewId: 'designRelations', ids: [selected.id] })
      expectedViews.push({ tableName: 'Base_DataModel_Relation', viewId: 'designRelations', action: isNew ? 'create' : 'change' })
    }
    dispatched = true
    designRelationSaving = true
    const result = await dataSet.saveChanges({ views })
    if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('保存期间关系查询身份或页面已变化')
    if (!result.success || !designRelationSaveReceiptIsExact(result.data, expectedViews)) {
      throw new Error('多视图保存回执未按 tableName/viewId/操作类型确认目标行成功')
    }
    for (const entry of views) {
      const view = entry.tableName === 'Base_DataModel' ? modelView : relationView
      const response = await view.loadFromServer({ fields: entry.tableName === 'Base_DataModel'
        ? ['rowid', 'Name', 'MetaName', 'description', 'Type', 'dataSetId', 'Filter', 'RequestComplete',
          'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain',
          'JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId']
        : ['rowid', 'dataSetId', 'parentModId', 'childModId', 'parentTable', 'childTable', 'depType', 'filter', 'cascadeDel'],
        filter: { field: 'dataSetId', operator: 'eq', value: capture.targetId }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
      if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('回读期间关系查询身份或页面已变化')
      if (!response.success || view.loadingError || view.rows.length !== view.total) throw new Error('保存后正式关系/模型回读失败或不完整')
      const id = entry.tableName === 'Base_DataModel' ? join.childId : selected.id
      const matching = view.rows.filter(item => designText(item.rowid) === id && designText(item.dataSetId) === capture.targetId)
      if (matching.length !== 1) throw new Error('保存后精确目标身份缺失或重复')
      if (entry.tableName === 'Base_DataModel') {
        for (const field of join.changed) if (String(matching[0][field] ?? '') !== String(join.values[field] ?? '')) throw new Error(`子模型 ${field} 回读不一致`)
      } else {
        const expected = { parentModId: row.parentModId, childModId: row.childModId, parentTable: row.parentTable,
          childTable: row.childTable, depType: row.depType, filter: row.filter }
        for (const [field, value] of Object.entries(expected)) if (String(matching[0][field] ?? '') !== String(value ?? '')) throw new Error(`关系 ${field} 回读不一致`)
      }
    }
    await designPersistRelationLayoutEdge({ action: isNew ? 'add' : 'change', id: selected.id,
      parentId: designText(row.parentModId), childId: designText(row.childModId), targetId: capture.targetId, capture })
    designRelationEditorId = ''
    designRelationValidatedFilter = null
    designRelationValidatedJoinFilter = null
    designRelationSaveError = ''
    await designRebuildRelationSnapshot(capture)
    $page.showMessage('关系变更已保存并按目标回读确认', 'success')
  } catch (error) {
    if (!dispatched && designRelationCaptureOwnerIsCurrent(capture)) {
      if (stagedModelId) {
        modelView.discardPendingChanges([stagedModelId])
        designRelationUpdateSnapshotAfterOwnedMutation(modelEntry)
      }
      if (stagedRelation) {
        relationView.discardPendingChanges([selected.id])
        designRelationUpdateSnapshotAfterOwnedMutation(selected.entry)
      }
    }
    const message = error instanceof Error ? error.message : '关系变更失败'
    if (dispatched) designRelationSaveError = message.startsWith('PARTIAL_LAYOUT:')
      ? `关系元数据已确认，布局未确认：${message.slice('PARTIAL_LAYOUT:'.length).trim()}。请重新打开核验，勿重复提交。`
      : `保存结果尚未完全确认：${message}。请重新打开核验，勿重复提交。`
    designEditError = message
    $page.showMessage(designRelationSaveError || message, 'warning')
  } finally { designRelationSaving = false }
}

async function designDeleteRelation() {
  if (designGraphGuardBusinessMutation()) return
  const selected = designRelationSelected()
  if (!selected || designRelationSaving || designRelationSaveError) return
  if (selected.entry.view.dirtyTracking.isPendingCreate(selected.id)) { designCancelRelation(); return }
  const view = selected.entry.view
  const row = selected.row
  if (!designSnapshotIsCurrent() || view.deleteActionState(row) !== 'enabled') throw new Error('当前关系不允许删除')
  for (const field of ['rowid', 'dataSetId', 'parentModId', 'childModId']) {
    if (view.fieldAccess(row, field).read !== 'visible') throw new Error(`关系删除身份字段 ${field} 不可读`)
  }
  const info = designRelationJoinInfo(selected)
  const id = selected.id
  const parentId = designText(row.parentModId)
  const childId = designText(row.childModId)
  const parentName = designRelationModelById(parentId)
  const modelView = designRelationModelEntry()?.view
  const otherRows = view.rows.filter(item => designText(item.rowid) !== id
    && designText(item.dataSetId) === designSnapshot.id)
  const canResolveOtherEdges = otherRows.every(item => view.fieldAccess(item, 'parentModId').read === 'visible'
    && view.fieldAccess(item, 'childModId').read === 'visible')
  const otherSameOwnerEdge = !canResolveOtherEdges || otherRows.some(item => designText(item.parentModId) === parentId
    && designText(item.childModId) === childId)
  const clearJoin = Boolean(info?.child && info.ownerId && info.ownerId === designText(parentName?.Name)
    && !otherSameOwnerEdge)
  if (clearJoin) {
    for (const field of ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId']) {
      if (modelView.fieldAccess(info.child, field).read !== 'visible' || modelView.fieldAccess(info.child, field).write !== 'allowed') {
        throw new Error(`删除最后一条父归属关系需读取并清理子模型 Join 字段 ${field}`)
      }
    }
  }
  const capture = { page: $page, targetId: designSnapshot.id, dataSet: designSnapshot.designDataSet,
    relationView: view, modelView: designRelationModelEntry().view }
  let dispatched = false
  let stagedRelation = false
  let stagedJoinClear = false
  try {
    designRelationAssertCurrent(capture)
    if (view.dirtyTracking.isDirty(id) || view.hasEditingChanges(id) || view.dirtyTracking.isPendingDelete(id)) {
      throw new Error('关系行已有其他本地修改，请先取消或完成该修改')
    }
    designRelationSaving = true
    if (clearJoin) {
      if (modelView.dirtyTracking.isDirty(childId) || modelView.hasEditingChanges(childId)
        || modelView.dirtyTracking.isPendingDelete(childId)) throw new Error('删除关系时子模型已有本地修改，拒绝混入 Join 清理')
      for (const field of ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId']) modelView.updateEditingValue(childId, field, '')
      const apply = await modelView.applyEditingRows([childId])
      if (!apply.success || apply.data?.failedCount !== 0) throw new Error('子模型 Join 清理无法 stage')
      stagedJoinClear = true
      const modelEntry = designRelationModelEntry()
      if (!designRelationUpdateSnapshotAfterOwnedMutation(modelEntry)) throw new Error('子模型 Join 清理无法绑定当前查询快照')
    }
    const result = await view.removeRow(id)
    if (result !== true && result?.success !== true) throw new Error('关系删除无法 stage')
    stagedRelation = true
    const entry = designRelationEntry()
    if (!designRelationUpdateSnapshotAfterOwnedMutation(entry)) throw new Error('指定关系删除草稿无法绑定当前查询快照')
    dispatched = true
    const deleteViews = clearJoin ? [
      { tableName: 'Base_DataModel', viewId: 'designModels', ids: [childId] },
      { tableName: 'Base_DataModel_Relation', viewId: 'designRelations', ids: [id] },
    ] : [{ tableName: 'Base_DataModel_Relation', viewId: 'designRelations', ids: [id] }]
    const expectedDeleteViews = clearJoin ? [
      { tableName: 'Base_DataModel', viewId: 'designModels', action: 'change' },
      { tableName: 'Base_DataModel_Relation', viewId: 'designRelations', action: 'delete' },
    ] : [{ tableName: 'Base_DataModel_Relation', viewId: 'designRelations', action: 'delete' }]
    const saved = await capture.dataSet.saveChanges({ views: deleteViews })
    if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('删除期间关系查询身份或页面已变化')
    if (!saved.success || !designRelationSaveReceiptIsExact(saved.data, expectedDeleteViews)) {
      throw new Error('关系删除回执未确认指定行成功')
    }
    const response = await view.loadFromServer({ fields: ['rowid', 'dataSetId', 'parentModId', 'childModId', 'parentTable', 'childTable', 'depType', 'filter', 'cascadeDel'],
      filter: { field: 'dataSetId', operator: 'eq', value: capture.targetId }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    if (!designRelationCaptureOwnerIsCurrent(capture)) throw new Error('删除回读期间关系查询身份或页面已变化')
    if (!response.success || view.loadingError || view.rows.length !== view.total || view.rows.some(item => designText(item.rowid) === id)) {
      throw new Error('指定关系删除后的正式回读未确认')
    }
    if (clearJoin) {
      const modelsResponse = await modelView.loadFromServer({ fields: ['rowid', 'Name', 'MetaName', 'description', 'Type', 'dataSetId',
        'Filter', 'RequestComplete', 'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue', 'cacheType', 'IsBusiness', 'IsBusinessMain',
        'JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'],
        filter: { field: 'dataSetId', operator: 'eq', value: capture.targetId }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
      if (!modelsResponse.success || modelView.loadingError || modelView.rows.length !== modelView.total) throw new Error('清理 Join 后模型正式回读失败或不完整')
      const childRows = modelView.rows.filter(item => designText(item.rowid) === childId && designText(item.dataSetId) === capture.targetId)
      if (childRows.length !== 1 || ['JoinType', 'ForeignKeyFields', 'JoinFilter', 'PId'].some(field => designText(childRows[0][field]) !== '')) {
        throw new Error('删除后子模型 Join 清理回读不一致')
      }
    }
    await designPersistRelationLayoutEdge({ action: 'delete', id, parentId, childId, targetId: capture.targetId, capture })
    designRelationEditorId = ''
    await designRebuildRelationSnapshot(capture)
    $page.showMessage(`关系 ${id} 已删除；其他关系保留`, 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '关系删除失败'
    if (!dispatched && designRelationCaptureOwnerIsCurrent(capture)) {
      if (stagedJoinClear) {
        modelView.discardPendingChanges([childId])
        designRelationUpdateSnapshotAfterOwnedMutation(designRelationModelEntry())
      }
      if (stagedRelation && view.dirtyTracking.isPendingDelete(id)) view.discardPendingChanges([id])
      const entry = designRelationEntry()
      if (entry) designRelationUpdateSnapshotAfterOwnedMutation(entry)
    }
    if (dispatched) designRelationSaveError = message.startsWith('PARTIAL_LAYOUT:')
      ? `关系元数据已确认，布局未确认：${message.slice('PARTIAL_LAYOUT:'.length).trim()}。请重新打开核验，勿重复提交。`
      : `关系删除结果尚未完全确认：${message}。请重新打开核验，勿重复提交。`
    designEditError = message
    $page.showMessage(designRelationSaveError || message, 'warning')
  } finally { designRelationSaving = false }
}

function designRelationSaveBeforeRender() {
  const selected = designRelationSelected()
  return { visible: Boolean(selected), disabled: designRelationSaving || !designSnapshotIsCurrent()
    || selected?.entry.view.editActionState(selected.row) !== 'enabled' || Boolean(designRelationSaveError) }
}

function designRelationDeleteBeforeRender() {
  const selected = designRelationSelected()
  return { visible: Boolean(selected && !selected.entry.view.dirtyTracking.isPendingCreate(selected.id)),
    disabled: !selected || selected.entry.view.deleteActionState(selected.row) !== 'enabled' || designRelationSaving || Boolean(designRelationSaveError) }
}

function designRelationCancelBeforeRender() {
  return { visible: Boolean(designRelationSelected()), disabled: designRelationSaving }
}

function designRelationParentDisplayBeforeRender(context) { return { value: designRelationModelLabel(context?.row?.parentModId) } }
function designRelationChildDisplayBeforeRender(context) { return { value: designRelationModelLabel(context?.row?.childModId) } }

function designCancelRelation() {
  const selected = designRelationSelected()
  if (!selected || designRelationSaving) return
  const { id } = selected
  const view = selected.entry.view
  const baseline = designSnapshot.views.find(item => item.binding === selected.entry.binding)
  if (designViewIsBusy(view)) return
  if (view.dirtyTracking.isPendingCreate(id)) view.discardPendingChanges([id])
  else view.discardEditingRows([id])
  const info = designRelationJoinInfo(selected)
  if (info?.child && info.editable && designRelationJoinEditAllowed) {
    designRelationModelEntry().view.discardEditingRows([designText(info.child.rowid)])
  }
  designRelationEditorId = ''
  designRelationValidatedFilter = null
  designRelationValidatedJoinFilter = null
  designRelationJoinEditAllowed = false
  if (baseline) designRelationUpdateSnapshotAfterOwnedMutation(baseline)
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
  return Boolean(selected && selected.entry.view.fieldAccess(selected.row, 'type').read === 'visible'
    && designText(selected.row.type) !== 'inputParams' && designSnapshot.views.find(item => item.binding === selected.entry.binding)
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
    && designHasEditableChanges(selected, ['description', 'AsName', 'IsOutput', 'OrderType', 'Order', 'Group', 'ValueFun'])
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
  if (designGraphGuardBusinessMutation()) throw new Error(designGraphMessage)
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
    if (view.fieldAccess(row, 'type').read !== 'visible') throw new Error('字段分类不可读，不能保存字段配置')
    const isInputParam = designText(row.type) === 'inputParams'
    const allowedFields = isInputParam ? ['ValueFun'] : editableFields
    const categoryUnexpected = changedFields.filter(field => !allowedFields.includes(field))
    if (categoryUnexpected.length > 0) throw new Error(isInputParam
      ? '来源入参只允许修改 ValueFun' : `普通字段表单不允许修改字段：${categoryUnexpected.join('、')}`)
    if (changedFields.includes('ValueFun')) {
      const value = normalizedEditingRow.ValueFun
      if (typeof value !== 'string') throw new Error('ValueFun必须是序列化的值函数字符串')
      if (value !== '') {
        let parsed
        try { parsed = JSON.parse(value) } catch { throw new Error('ValueFun必须是有效的值函数 JSON') }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
          || typeof parsed.Type !== 'string' || !parsed.Type) throw new Error('ValueFun必须包含有效 Type')
      }
    }
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
      ['description', 'AsName', 'IsOutput', 'OrderType', 'Order', 'Group', 'ValueFun'], ['rowid', 'Name', 'AsName', 'FieldType', 'IsOutput',
        'IsPKey', 'description', 'dataSetId', 'dataModelId', 'type', 'ValueFun', 'OrderType', 'Order', 'Group'])
    $page.showMessage('字段配置已保存并回读', 'success')
  } catch (error) {
    $page.showMessage(error instanceof Error ? error.message : '字段配置保存失败', 'warning')
  }
}

async function designConfirmParameterEditor() {
  if (designGraphGuardBusinessMutation()) return
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

function designGraphContextKey() {
  return `${designSnapshot && designSnapshot.id}:${designLoadRevision}:${designGraphDraftRevision}`
}

function designGraphBusinessDraftExists() {
  if (!designSnapshot) return false
  return designSnapshot.views.some(entry => entry.view.hasEditingChanges()
    || entry.view.dirtyTracking.hasPendingChanges())
}

function designLayoutOwner() {
  return $page.getDataSpaceLayoutContent(designCurrentTarget())
}

function designRefreshLayoutProjection() {
  if (!designSnapshotIsCurrent()) return
  const state = designLayoutOwner()
  if (state.revision === designContentRevision || state.baseline === undefined) return
  const models = designRelationModelEntry()
  const relations = designRelationEntry()
  let baseline = null
  try { baseline = designParseLayout(state.baseline, models, relations) } catch {
    // A confirmed metadata change can make the old file stale while its replacement is in flight.
  }
  const draft = state.draft === undefined ? null : designParseLayout(state.draft, models, relations)
  designLayoutText = state.baseline
  designLayoutGraph = baseline ? baseline.graph : null
  designLayoutSummary = baseline ? baseline.summary : null
  designLayoutState = baseline ? baseline.state : '原布局与当前正式关系不一致；保留内容状态待核对'
  designGraphDraft = draft ? {document: JSON.parse(state.draft), graph: draft.graph} : null
  designContentRevision = state.revision
  designGraphDraftRevision++
  if (state.status === 'unknown') designGraphMessage = '布局保存结果尚未确认；请明确重新读取并采用远端布局，或保留当前草稿'
  else if (state.status === 'pending') designGraphMessage = '布局正在保存；当前请求仍由页面运行实例收束'
  else if (!designGraphDraft && (designGraphMessage.includes('结果尚未确认')
    || designGraphMessage.includes('正在保存'))) designGraphMessage = '布局写入已确认，请核对当前图'
}

function designLayoutCanonical(value) {
  if (Array.isArray(value)) return value.map(designLayoutCanonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, designLayoutCanonical(value[key])]))
}

function designLayoutFingerprint() {
  if (!designSnapshotIsCurrent()) throw new Error('正式数据空间快照已失效')
  const byBinding = new Map(designSnapshot.views.map(entry => [entry.binding, entry]))
  const parts = [
    {view: designSnapshot.targetView, rows: designSnapshot.targetRows, fields: designLayoutFingerprintFields.target},
    {entry: byBinding.get(`#${designScenarioId}@Base_DataSet@designParameters`), fields: designLayoutFingerprintFields.parameters},
    {entry: byBinding.get(`#${designScenarioId}@Base_DataModel@designModels`), fields: designLayoutFingerprintFields.models},
    {entry: byBinding.get(`#${designScenarioId}@Base_DataModel_Field@designFields`), fields: designLayoutFingerprintFields.fields},
    {entry: byBinding.get(`#${designScenarioId}@Base_DataModel_Relation@designRelations`), fields: designLayoutFingerprintFields.relations},
  ]
  const rows = parts.map(part => {
    const view = part.entry ? part.entry.view : part.view
    const source = part.entry ? part.entry.rows : part.rows
    if (!view || !source) throw new Error('正式数据空间快照缺少必要视图')
    return source.map(row => ({id: designText(view.getPkKey(row)), fields: part.fields.map(field => {
      const read = view.fieldAccess(row, field).read
      return [field, read, read === 'visible'
        ? (Object.prototype.hasOwnProperty.call(row, field) ? designLayoutCanonical(row[field]) : {missing: true})
        : null]
    })})).sort((left, right) => left.id.localeCompare(right.id))
  })
  const options = designRelationDependencyOptions.map(item => ({label: item.label, value: item.value}))
    .sort((left, right) => left.value.localeCompare(right.value) || left.label.localeCompare(right.label))
  return JSON.stringify(designLayoutCanonical({rows, options}))
}

function designBuildInitialLayout() {
  const models = designRelationModelEntry().rows.slice().sort((left, right) => designText(left.rowid).localeCompare(designText(right.rowid)))
  const relations = designRelationEntry().rows.slice().sort((left, right) => designText(left.rowid).localeCompare(designText(right.rowid)))
  const modelIds = models.map(row => designText(row.rowid))
  const modelIdSet = new Set(modelIds)
  const childMap = new Map(modelIds.map(id => [id, []]))
  const indegree = new Map(modelIds.map(id => [id, 0]))
  for (const relation of relations) {
    const parent = designText(relation.parentModId)
    const child = designText(relation.childModId)
    if (!modelIdSet.has(parent) || !modelIdSet.has(child)) throw new Error('正式关系端点不在目标模型集合中')
    childMap.get(parent).push(child)
    indegree.set(child, indegree.get(child) + 1)
  }
  const queue = modelIds.filter(id => indegree.get(id) === 0)
  const levels = new Map(queue.map(id => [id, 0]))
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index]
    for (const child of childMap.get(parent)) {
      levels.set(child, Math.max(levels.get(child) || 0, levels.get(parent) + 1))
      indegree.set(child, indegree.get(child) - 1)
      if (indegree.get(child) === 0) queue.push(child)
    }
  }
  modelIds.forEach((id, index) => { if (!levels.has(id)) levels.set(id, Math.floor(index / 4)) })
  const groups = new Map()
  for (const id of modelIds) {
    const level = levels.get(id)
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level).push(id)
  }
  const positions = new Map()
  for (const [level, ids] of groups) ids.forEach((id, row) => positions.set(id,
    {x: 250 + level * (232 + 102), y: 150 + row * (120 + 86)}))
  const graph = {graphVersion: 1,
    nodes: modelIds.map(id => ({id, ...positions.get(id)})),
    edges: relations.map(row => ({id: designText(row.rowid), sourceNodeId: designText(row.parentModId),
      targetNodeId: designText(row.childModId)}))}
  const parsed = designParseLayout(JSON.stringify(graph), designRelationModelEntry(), designRelationEntry())
  if (parsed.graph.nodes.length !== models.length || parsed.graph.edges.length !== relations.length) {
    throw new Error('布局预览与完整正式模型关系不一致')
  }
  return {graph: parsed.graph, content: JSON.stringify(graph)}
}

function designLayoutCreateAllowed() {
  const content = designLayoutOwner()
  return designSnapshotIsCurrent() && designLayoutText === null && designLayoutGraph === null
    && content.baseline === null && content.status === 'idle' && content.draft === undefined
    && !designLayoutCreateBusy && !designLayoutCreateUnknown && !designGraphDraft && !designGraphSaving
    && !designRelationSaving && !designParameterEditorOpen && !designParameterRecovery
    && !designGraphBusinessDraftExists() && designSnapshot.views.every(entry => !entry.view.mutating)
}

async function designPrepareLayoutCreate() {
  if (!designLayoutCreateAllowed()) {
    designLayoutCreateMessage = '仅在布局明确缺失且正式数据无未保存修改时可预览创建'
    return
  }
  try {
    const fingerprint = designLayoutFingerprint()
    const built = designBuildInitialLayout()
    const preview = {page: $page, targetId: designSnapshot.id, revision: designLoadRevision,
      fingerprint, graph: built.graph, content: built.content, used: false}
    designLayoutCreatePreview = preview
    designLayoutCreateMessage = '只读预览已生成；确认仅创建布局文件，不修改模型、字段或关系'
  } catch (error) {
    designLayoutCreatePreview = null
    designLayoutCreateMessage = `布局预览失败：${error instanceof Error ? error.message : '未知错误'}`
  }
}

function designCancelLayoutCreate() {
  if (designLayoutCreateBusy || designLayoutCreateUnknown) return
  designLayoutCreatePreview = null
  designLayoutCreateRevision++
  designLayoutCreateMessage = '本地布局预览已取消；未写入文件'
}

async function designConfirmLayoutCreate() {
  const preview = designLayoutCreatePreview
  if (!preview || preview.used || designLayoutCreateBusy || designLayoutCreateUnknown || !designLayoutCreateAllowed()
    || preview.page !== $page || preview.targetId !== designSnapshot.id || preview.revision !== designLoadRevision) return
  preview.used = true
  const operation = ++designLayoutCreateRevision
  designLayoutCreateBusy = true
  designLayoutCreateMessage = '正在重新核对正式数据和缺失文件'
  let writeStarted = false
  let writeConfirmed = false
  try {
    await designReloadDesignCore()
    if (operation !== designLayoutCreateRevision || preview.page !== $page || !designSnapshotIsCurrent()
      || designSnapshot.id !== preview.targetId || designLayoutText !== null) throw new Error('目标、正式查询或布局文件已变化')
    if (designGraphBusinessDraftExists() || designLayoutFingerprint() !== preview.fingerprint) {
      throw new Error('正式数据空间配置或读取权限已变化，请重新预览')
    }
    if (await $page.readDataSpaceLayout(preview.targetId) !== null) throw new Error('布局文件已出现，请重新加载')
    if (operation !== designLayoutCreateRevision || !designSnapshotIsCurrent()
      || designLayoutFingerprint() !== preview.fingerprint) throw new Error('正式数据空间配置或读取权限已变化，请重新预览')
    writeStarted = true
    await $page.createDataSpaceLayout({dataSpaceId: preview.targetId, content: preview.content})
    writeConfirmed = true
    await designReloadDesignCore()
    if (operation !== designLayoutCreateRevision || !designSnapshotIsCurrent()
      || designSnapshot.id !== preview.targetId || designLayoutText !== preview.content
      || designLayoutFingerprint() !== preview.fingerprint) throw new Error('写后完整重新装载与预览不一致')
    designLayoutCreatePreview = null
    designLayoutCreateMessage = '布局文件已创建、逐字节回读并完整重新装载'
  } catch (error) {
    if (writeStarted && !writeConfirmed) designLayoutCreateUnknown = true
    const state = writeConfirmed ? '布局文件已创建，但后续完整读取未通过'
      : writeStarted ? '布局创建结果尚未确认' : '布局未写入'
    designLayoutCreateMessage = `${state}：${error instanceof Error ? error.message : '未知错误'}。请明确重新读取核对；不会自动重试。`
  } finally { designLayoutCreateBusy = false }
}

function designLayoutCreatePreviewBeforeRender() {
  const preview = designLayoutCreatePreview
  if (!preview || preview.targetId !== designTarget || !designSnapshotIsCurrent()) return {visible: false}
  const models = designRelationModelEntry()
  const rows = new Map(models.rows.map(row => [designText(row.rowid), row]))
  return {visible: true, props: {disabled: true, nodes: preview.graph.nodes.map(node => ({...node,
    title: designFieldDisplay(models.view, rows.get(node.id), 'MetaName'),
    description: designFieldDisplay(models.view, rows.get(node.id), 'description')})), edges: preview.graph.edges}}
}

function designLayoutCreatePrepareBeforeRender() { return {visible: designLayoutText === null && designSnapshotIsCurrent(),
  disabled: !designLayoutCreateAllowed() || Boolean(designLayoutCreatePreview)} }
function designLayoutCreateConfirmBeforeRender() { return {visible: Boolean(designLayoutCreatePreview),
  disabled: designLayoutCreateBusy || designLayoutCreateUnknown || designLayoutCreatePreview?.used} }
function designLayoutCreateCancelBeforeRender() { return {visible: Boolean(designLayoutCreatePreview),
  disabled: designLayoutCreateBusy || designLayoutCreateUnknown} }
function RenderDesignLayoutCreateStatus() { return designLayoutCreateMessage
  ? h('p', {role: 'status', class: 'design-graph-status'}, designLayoutCreateMessage) : null }

function designLayoutRecoveryBeforeRender() {
  let state
  try { state = designLayoutOwner() } catch { return {visible: false} }
  return {visible: state.status !== 'idle' || state.draft !== undefined}
}

function RenderDesignLayoutRecoveryStatus() {
  const state = designLayoutOwner()
  if (state.status === 'pending') return h('p', {role: 'status'}, '布局文件请求仍在途；页面运行实例正在等待实际结果')
  if (state.status === 'unknown') return h('p', {role: 'status'}, '布局写入结果尚未确认；可明确重新读取并采用远端布局，取消操作将保留本地草稿')
  return h('p', {role: 'status'}, '布局有未保存草稿；采用远端布局会放弃本地修改')
}

function designLayoutAdoptBeforeRender() {
  const state = designLayoutOwner()
  return {disabled: state.status === 'pending' || (!designRecoveryCapture && !designSnapshotIsCurrent())}
}

async function designAdoptRemoteLayout() {
  const id = designCurrentTarget()
  const state = $page.getDataSpaceLayoutContent(id)
  if (state.status === 'pending' || state.draft === undefined && state.status !== 'unknown') return
  const confirmed = await $page.showConfirm('重新读取并采用远端布局将放弃本地布局草稿；不会回滚已发送的保存请求。是否继续？')
  if (!confirmed || $page.getDataSpaceLayoutContent(id).revision !== state.revision) return
  try {
    const capture = designRecoveryCapture
    if (!capture || capture.targetId !== id) throw new Error('当前正式模型关系尚未完成读取')
    designAssertReadCurrent(capture.readCapture)
    const remote = await $page.readDataSpaceLayoutForAdoption(id)
    designAssertReadCurrent(capture.readCapture)
    const validated = designParseLayout(remote.content, capture.models, capture.relations)
    $page.adoptDataSpaceLayoutRead(id, remote)
    designGraphMessage = '已读取并采用远端布局；这仅确认当前读到的文件内容'
    designLayoutCreateMessage = ''
    designLayoutCreateUnknown = false
    designGraphSaveUnknown = false
    designGraphSaving = false
    designLayoutCreatePreview = null
    if (designSnapshotIsCurrent()) {
      designLayoutText = remote.content
      designLayoutGraph = validated.graph
      designLayoutSummary = validated.summary
      designLayoutState = validated.state
      designGraphDraft = null
      designGraphDraftRevision++
      designContentRevision = $page.getDataSpaceLayoutContent(id).revision
    } else await designReloadDesignCore()
  } catch (error) {
    designGraphMessage = `远端布局尚未采用，保留本地状态：${error instanceof Error ? error.message : '未知错误'}`
  }
}

function designGraphGuardBusinessMutation() {
  const content = designLayoutOwner()
  if (content.status !== 'idle' || content.draft !== undefined) {
    designGraphMessage = content.status === 'pending' ? '布局正在保存，请等待确认'
      : content.status === 'unknown' ? '布局写入结果尚未确认，请明确读取并采用远端布局'
        : '布局有未保存修改，请先保存或取消'
    return true
  }
  if (designLayoutCreateBusy || designLayoutCreatePreview || designLayoutCreateUnknown) {
    designLayoutCreateMessage = '布局创建预览或写入尚未结束，请先取消预览或重新读取核对'
    return true
  }
  if (!designGraphDraft && !designGraphSaving && !designGraphSaveUnknown) return false
  designGraphMessage = designGraphSaving ? '布局正在保存，请等待确认'
    : designGraphSaveUnknown ? '布局保存结果尚未确认，请重新读取后核对'
      : '布局有未保存修改，请先保存或取消'
  return true
}

function designGraphSelect(event) {
  designRefreshLayoutProjection()
  if (designLayoutOwner().status !== 'idle') return
  if (!event || event.contextKey !== designGraphContextKey() || !designSnapshotIsCurrent()
    || designGraphSaving || designGraphSaveUnknown) return
  const type = event.type
  const id = designText(event.id)
  if ((type !== 'node' && type !== 'edge') || !id) return
  const entry = type === 'node' ? designRelationModelEntry() : designRelationEntry()
  const rows = entry && entry.rows.filter(row => designText(row.rowid) === id
    && designText(entry.view.getPkKey(row)) === id && designText(row.dataSetId) === designSnapshot.id
    && entry.view.fieldAccess(row, 'rowid').read === 'visible')
  if (!rows || rows.length !== 1 || !designLayoutGraph || !(type === 'node'
    ? designLayoutGraph.nodes.some(node => node.id === id)
    : designLayoutGraph.edges.some(edge => edge.id === id))) return
  if (!event.open) { designGraphSelectedId = id; return }
  if (designGraphBusinessDraftExists()) {
    designGraphMessage = '存在未保存的模型、字段或关系修改，请先保存或取消再切换'
    return
  }
  const row = rows[0]
  if (type === 'node') {
    if (entry.view.fieldAccess(row, 'Type').read !== 'visible') return
    entry.view.setCurrentRow(row)
  } else {
    designSelectRelation(row)
    if (designRelationEditorId !== id) return
  }
  designGraphSelectedId = id
  designGraphMessage = ''
  $components.getApi('design-tabs')?.setActiveTab(type === 'node' ? 'models' : 'relations')
}

function designGraphMove(event) {
  designRefreshLayoutProjection()
  if (designLayoutOwner().status !== 'idle') return
  if (!event || event.contextKey !== designGraphContextKey() || !designSnapshotIsCurrent()
    || designGraphSaving || designGraphSaveUnknown || designRelationSaving || typeof designLayoutText !== 'string'
    || !Number.isFinite(event.x) || !Number.isFinite(event.y) || !Array.isArray(event.edges)) return
  const sourceGraph = designGraphDraft ? designGraphDraft.graph : designLayoutGraph
  const id = designText(event.id)
  const sourceNode = sourceGraph && sourceGraph.nodes.find(node => node.id === id)
  if (!sourceNode || (sourceNode.x === event.x && sourceNode.y === event.y)) return
  const model = designRelationModelById(id)
  if (!model || designRelationModelEntry().view.fieldAccess(model, 'rowid').read !== 'visible') return
  const incident = sourceGraph.edges.filter(edge => edge.source === id || edge.target === id)
  const expected = incident.filter(edge => edge.pointsList)
  const movedIds = new Set(event.edges.map(edge => edge.id))
  if (event.edges.length !== expected.length || movedIds.size !== expected.length || event.edges.some(edge => {
    const original = expected.find(item => item.id === edge.id)
    return !original || !Array.isArray(edge.pointsList) || edge.pointsList.length < 2
      || edge.pointsList.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
  })) return
  if (designGraphBusinessDraftExists()) {
    designGraphMessage = '存在未保存的业务修改，请先保存或取消再调整布局'
    return
  }
  const document = designGraphDraft ? JSON.parse(JSON.stringify(designGraphDraft.document)) : JSON.parse(designLayoutText)
  const rawNode = document.nodes.find(node => node.id === id)
  if (!rawNode) return
  const dx = event.x - sourceNode.x
  const dy = event.y - sourceNode.y
  rawNode.x = event.x
  rawNode.y = event.y
  if (rawNode.position && typeof rawNode.position === 'object') {
    rawNode.position = { ...rawNode.position, x: event.x, y: event.y }
  }
  if (rawNode.text && typeof rawNode.text === 'object'
    && Number.isFinite(rawNode.text.x) && Number.isFinite(rawNode.text.y)) {
    rawNode.text = { ...rawNode.text, x: rawNode.text.x + dx, y: rawNode.text.y + dy }
  }
  for (const moved of event.edges) {
    const edge = document.edges.find(item => item.id === moved.id)
    if (!edge || !Array.isArray(edge.pointsList)) return
    const oldPoints = edge.pointsList
    edge.pointsList = moved.pointsList.map((point, index) => {
      const original = oldPoints.length === 2 && moved.pointsList.length === 3
        ? (index === 1 ? null : oldPoints[index === 0 ? 0 : 1]) : oldPoints[index]
      return { ...(original || {}), x: point.x, y: point.y }
    })
  }
  for (const connected of incident) {
    const edge = document.edges.find(item => item.id === connected.id)
    if (!edge) return
    if (edge.startPoint && typeof edge.startPoint === 'object' && connected.source === id
      && Number.isFinite(edge.startPoint.x) && Number.isFinite(edge.startPoint.y)) {
      const point = Array.isArray(edge.pointsList) ? edge.pointsList[0] : null
      edge.startPoint = { ...edge.startPoint,
        x: point ? point.x : edge.startPoint.x + dx, y: point ? point.y : edge.startPoint.y + dy }
    }
    if (edge.endPoint && typeof edge.endPoint === 'object' && connected.target === id
      && Number.isFinite(edge.endPoint.x) && Number.isFinite(edge.endPoint.y)) {
      const point = Array.isArray(edge.pointsList) ? edge.pointsList[edge.pointsList.length - 1] : null
      edge.endPoint = { ...edge.endPoint,
        x: point ? point.x : edge.endPoint.x + dx, y: point ? point.y : edge.endPoint.y + dy }
    }
    if (edge.text && typeof edge.text === 'object' && Number.isFinite(edge.text.x) && Number.isFinite(edge.text.y)) {
      const shift = connected.source === id && connected.target === id ? 1 : 0.5
      edge.text = { ...edge.text, x: edge.text.x + dx * shift, y: edge.text.y + dy * shift }
    }
  }
  const modelEntry = designRelationModelEntry()
  const relationEntry = designRelationEntry()
  const parsed = designParseLayout(JSON.stringify(document), modelEntry, relationEntry)
  designGraphDraft = { document, graph: parsed.graph }
  $page.setDataSpaceLayoutDraft({dataSpaceId: designSnapshot.id, content: JSON.stringify(document)})
  designContentRevision = designLayoutOwner().revision
  designGraphDraftRevision++
  designGraphMessage = '布局有未保存修改'
}

async function designGraphSave() {
  designRefreshLayoutProjection()
  if (designLayoutOwner().status !== 'idle') return
  if (!designGraphDraft || designGraphSaving || designGraphSaveUnknown || designRelationSaving
    || !designSnapshotIsCurrent()) return
  if (designGraphBusinessDraftExists()) { designGraphMessage = '请先保存或取消业务修改'; return }
  const document = designGraphDraft.document
  const submittedGraph = designGraphDraft.graph
  const content = JSON.stringify(document)
  const targetId = designSnapshot.id
  const expectedContent = designLayoutText
  designGraphSaving = true
  designGraphMessage = '正在保存布局'
  let writeStarted = false
  try {
    const current = await $page.readDataSpaceLayout(targetId)
    if (!designSnapshotIsCurrent() || designSnapshot.id !== targetId) throw new Error('布局读取期间页面或查询身份已变化')
    if (current !== expectedContent) throw new Error('布局原文已变化，请重新读取后核对')
    writeStarted = true
    await $page.saveDataSpaceLayout({dataSpaceId: targetId, content, expectedContent})
    if (!designSnapshotIsCurrent() || designSnapshot.id !== targetId) throw new Error('布局写入期间页面或查询身份已变化')
    designLayoutText = content
    designLayoutGraph = submittedGraph
    designLayoutSummary = {graphVersion: 1, nodes: document.nodes.length, edges: document.edges.length}
    designGraphDraft = null
    designGraphDraftRevision++
    designGraphMessage = '布局已保存并逐字回读确认'
  } catch (error) {
    if (writeStarted) designGraphSaveUnknown = true
    designGraphMessage = `${writeStarted ? '布局保存结果尚未确认' : '布局未写入'}：${error instanceof Error ? error.message : '未知错误'}。重新读取将放弃本地布局草稿；不会自动重试。`
  } finally { designGraphSaving = false }
}

function designGraphCancel() {
  designRefreshLayoutProjection()
  if (designLayoutOwner().status !== 'idle') return
  if (designGraphSaving || designGraphSaveUnknown) return
  if (designSnapshot) $page.discardDataSpaceLayoutDraft(designSnapshot.id)
  designGraphDraft = null
  designContentRevision = designLayoutOwner().revision
  designGraphDraftRevision++
  designGraphMessage = '本地布局修改已取消'
}

function designGraphConnect(event) {
  if (!event || event.contextKey !== designGraphContextKey() || !designSnapshotIsCurrent() || designGraphSaving) return
  designGraphMessage = '新增关系暂不可用：当前 DataView 没有新行字段级权限上下文'
}

function RenderDesignGraphStatus() {
  designRefreshLayoutProjection()
  return designGraphMessage ? h('p', {role: 'status', class: 'design-graph-status'}, designGraphMessage) : null
}

function designGraphSaveBeforeRender() { designRefreshLayoutProjection(); const content = designLayoutOwner(); return {
  disabled: !designGraphDraft || content.status !== 'idle' || designRelationSaving} }
function designGraphCancelBeforeRender() { designRefreshLayoutProjection(); const content = designLayoutOwner(); return {
  disabled: !designGraphDraft || content.status !== 'idle'} }

function designGraphBeforeRender() {
  designRefreshLayoutProjection()
  if (designLayoutGraph === null && !designGraphDraft || !designSnapshotIsCurrent()) return { visible: false }
  const modelView = $page.resolveView(`#${designScenarioId}@Base_DataModel@designModels`)
  if (!modelView) return { visible: false }
  const rowsById = new Map(modelView.rows.map(row => [designText(row.rowid), row]))
  const graph = designGraphDraft ? designGraphDraft.graph : designLayoutGraph
  const nodes = graph.nodes.map(node => {
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
  const draggableIds = nodes.filter(node => node && modelView.fieldAccess(rowsById.get(node.id), 'rowid').read === 'visible')
    .map(node => node.id)
  return { visible: true, props: { nodes, edges: graph.edges, contextKey: designGraphContextKey(), draggableIds,
    selectedId: designGraphSelectedId, disabled: designLayoutOwner().status !== 'idle' || designRelationSaving
      || designGraphBusinessDraftExists() } }
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

function RenderDesignRelationNames() {
  if (!designSnapshotIsCurrent()) return null
  const entry = designRelationEntry()
  if (!entry || entry.rows.length === 0) return h('div', { class: 'design-empty' }, '当前空间暂无模型关系')
  return h('div', { class: 'design-relation-name-list' }, entry.rows.map(row => {
    const id = designText(row.rowid)
    return h('button', { type: 'button', class: 'design-relation-name-item', key: id,
      disabled: designRelationSaving || (entry.view.editActionState(row) !== 'enabled'
        && entry.view.deleteActionState(row) !== 'enabled') || Boolean(designRelationSaveError),
      onClick: () => designSelectRelation(row) }, [
      h('span', {}, `父：${designRelationModelLabel(row.parentModId)}`),
      h('span', {}, ' → '),
      h('span', {}, `子：${designRelationModelLabel(row.childModId)}`),
      h('span', { class: 'design-relation-id' }, `关系 ID：${id}`),
    ])
  }))
}

async function reloadDesign() {
  const content = designLayoutOwner()
  if (content.status !== 'idle' || content.draft !== undefined) {
    designGraphMessage = '布局草稿或写入结果尚未处理；请保存、取消或明确读取并采用远端布局'
    return
  }
  if (designLayoutCreateBusy) {
    designLayoutCreateMessage = '布局创建正在核对或写入，请等待结果'
    return
  }
  if (designLayoutCreatePreview && !designLayoutCreateUnknown) designCancelLayoutCreate()
  await designReloadDesignCore()
}

async function designReloadDesignCore(restoreContent) {
  if (designLoading) return
  const retained = designLayoutOwner()
  if (!restoreContent && (retained.status !== 'idle' || retained.draft !== undefined)) {
    designGraphMessage = '布局有未保存修改，请先取消布局草稿再重新加载'
    return
  }
  designGraphDraft = null
  designGraphSaveUnknown = false
  designGraphSelectedId = ''
  designRecoveryCapture = null
  designGraphDraftRevision++
  designReady = false
  designSnapshot = null
  designParametersValue = null
  designLayoutSummary = null
  designLayoutGraph = null
  designLayoutText = null
  designEditError = ''
  designRelationEditorId = ''
  designRelationSaveError = ''
  designRelationDependencyOptions = []
  designRelationDependencyState = '正在读取关系类型字典'
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

    const targetResponse = await target.loadFromServer({ fields: designLayoutFingerprintFields.target,
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
    const parameterResponse = await parameters.loadFromServer({ fields: designLayoutFingerprintFields.parameters,
      filter: { field: 'rowid', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!parameterResponse.success) throw new Error('数据空间参数查询失败或无权读取')
    const parameterResult = designVerifyRows(parameters, ['rowid', 'inputParams'])
    if (parameterResult.total !== 1 || designText(parameterResult.rows[0].rowid) !== id) throw new Error('数据空间参数身份校验失败')

    const parameterOwner = { binding: `#${designScenarioId}@Base_DataSet@designParameters`, view: parameters,
      ...parameterResult, identityFields: ['rowid', 'inputParams'], owner: '' }
    readCapture.verified.push(parameterOwner)
    designAssertReadCurrent(readCapture)
    const modelResponse = await models.loadFromServer({ fields: designLayoutFingerprintFields.models,
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!modelResponse.success) throw new Error('模型查询失败或无权读取')
    const modelResult = designVerifyRows(models, ['rowid', 'dataSetId'], id)
    designVerifyReadableModelNames(models, modelResult.rows)
    const modelIds = new Set(modelResult.rows.map(row => designText(row.rowid)))

    const modelOwner = { binding: `#${designScenarioId}@Base_DataModel@designModels`, view: models,
      ...modelResult, identityFields: ['rowid', 'dataSetId'], owner: id }
    readCapture.verified.push(modelOwner)
    designAssertReadCurrent(readCapture)
    const fieldResponse = await fields.loadFromServer({ fields: designLayoutFingerprintFields.fields,
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!fieldResponse.success) throw new Error('字段查询失败或无权读取')
    const fieldResult = designVerifyRows(fields, ['rowid', 'dataSetId', 'dataModelId'], id)
    if (fieldResult.rows.some(row => !modelIds.has(designText(row.dataModelId)))) throw new Error('字段所属模型不在目标模型集合中')

    const fieldOwner = { binding: `#${designScenarioId}@Base_DataModel_Field@designFields`, view: fields,
      ...fieldResult, identityFields: ['rowid', 'dataSetId', 'dataModelId'], owner: id }
    readCapture.verified.push(fieldOwner)
    designAssertReadCurrent(readCapture)
    const relationResponse = await relations.loadFromServer({ fields: designLayoutFingerprintFields.relations,
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
    await designLoadRelationDependencyOptions(readCapture)
    designAssertReadCurrent(readCapture)
    designRecoveryCapture = {targetId: id, readCapture, models: modelResult, relations: relationResult}
    const layoutText = restoreContent && (retained.status !== 'idle' || retained.draft !== undefined)
      ? retained.draft ?? retained.baseline : await $page.readDataSpaceLayout(id)
    if (layoutText === undefined) throw new Error('布局原文尚未加载')
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
    designLayoutText = layoutText
    designLayoutSummary = layout.summary
    designLayoutGraph = layout.graph
    designReady = true
    designRefreshLayoutProjection()
  } catch (error) {
    if (revision === designLoadRevision) {
      const message = error instanceof Error ? error.message : ''
      const known = ['目标数据空间不存在、不可读或身份不唯一', '目标数据空间身份校验失败或无读取权限',
        '正式数据查询未返回完整结果', '正式数据行身份缺失、重复或与主键不一致',
        '当前数据权限不能读取设计所需身份或关联字段', '数据空间参数身份校验失败',
        '正式数据记录不属于目标数据空间',
        '字段所属模型不在目标模型集合中', '正式关系端点不在目标模型集合中',
        '模型注册名重复，表达式引用无法唯一绑定',
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
  designVerifyReadableModelNames(models, modelResult.rows)
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
  const retainedContent = $page.getDataSpaceLayoutContent(id)
  const layoutText = retainedContent.status !== 'idle' || retainedContent.draft !== undefined
    ? retainedContent.draft ?? retainedContent.baseline : await $page.readDataSpaceLayout(id)
  if (layoutText === undefined) throw new Error('布局原文尚未加载')
  if (!designCurrentViewsCaptureIsCurrent(capture)) throw new Error('SPARK_QUERY_CONTEXT_STALE: 重挂载期间查询身份已变化')
  const layout = designParseLayout(layoutText, modelResult, relationResult)
  designTarget = id
  designSnapshot = { id, catalogDataSet, designDataSet: designDataSetRef, targetView: target, targetRow,
    targetRows: targetResult.rows, targetTotal: targetResult.total, targetRequestState: targetResult.requestState, views }
  designParametersValue = inputParams
  designLayoutState = layout.state
  designLayoutText = layoutText
  designLayoutSummary = layout.summary
  designLayoutGraph = layout.graph
  designError = ''
  designReady = true
  designRefreshLayoutProjection()
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
  await designReloadDesignCore(true)
}

function returnToCatalog() {
  if (designGraphGuardBusinessMutation()) return
  const path = designReturnPath()
  if (!path) {
    $page.showMessage('缺少当前租户应用下的有效目录返回地址', 'warning')
    return
  }
  $page.navigate(path)
}
