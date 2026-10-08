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
  if (!designReady || !designSnapshot || designTarget !== designSnapshot.id) return false
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
      const isBusiness = item.IsBusParam ?? item.isBusParam
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
    const modelResponse = await models.loadFromServer({ fields: ['rowid', 'MetaName', 'description', 'Type', 'dataSetId'],
      filter: { field: 'dataSetId', operator: 'eq', value: id }, sort: 'rowid:asc', allPages: true, maxRows: 50000 })
    designAssertReadCurrent(readCapture)
    if (!modelResponse.success) throw new Error('模型查询失败或无权读取')
    const modelResult = designVerifyRows(models, ['rowid', 'dataSetId'], id)
    const modelIds = new Set(modelResult.rows.map(row => designText(row.rowid)))

    const modelOwner = { binding: `#${designScenarioId}@Base_DataModel@designModels`, view: models,
      ...modelResult, identityFields: ['rowid', 'dataSetId'], owner: id }
    readCapture.verified.push(modelOwner)
    designAssertReadCurrent(readCapture)
    const fieldResponse = await fields.loadFromServer({ fields: ['rowid', 'Name', 'AsName', 'FieldType', 'IsOutput', 'IsPKey', 'dataSetId', 'dataModelId'],
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

async function __init__() {
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
