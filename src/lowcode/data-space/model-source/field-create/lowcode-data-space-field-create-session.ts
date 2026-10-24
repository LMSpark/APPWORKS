/**
 * @module lowcode/data-space/model-source/field-create/lowcode-data-space-field-create-session
 * 职责：计算字段新增的输入草稿、暂存、提交与精确回读（无独立命令类 FSM）。
 * 边界：局部输入视图不授权或持久化；新增经原元数据 DataView 和 DataSet 提交。
 */
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceFieldValue} from '../field-value/lowcode-data-space-field-value'
import {DataSpaceDefinitionSave, definitionTargetDraftSignature, verifyDataSpaceDefinitionCapture, verifyAndDiscardDataSpaceDefinitionCapture, type DataSpaceDefinitionCaptureBatch} from '../save/data-space-definition-save'

export type FieldCreateStatus = 'idle' | 'editing' | 'saving' | 'unknown' | 'readback' | 'different'

export type FieldCreateFlow = {
  status: FieldCreateStatus
  modelIdentity: string
  id: string | null
  expected: DataRow | null
  stagedSnapshot: string
  verification: string
  capture: DataSpaceDefinitionCaptureBatch | null
  captureSignature: string
}

export type FieldCreateLifecycle = Readonly<{
  assertCurrent(): void
  onDispatch(): void
  readDefinition?(): DataSet | ScenarioViewConfig | null
  validate(values: DataRow): Promise<() => void>
  assertStaging?(): void
}>

export type FieldCreateHost = {
  readonly input: DataView
  readonly fields: DataView
  readonly models: DataView
  readonly dataSet: DataSet
  readonly targetId: string
  readonly modelId: string
  readonly viewId: 'default' | 'modelFields'
  readonly contexts: string
  flow: FieldCreateFlow
  lifecycle: FieldCreateLifecycle
}

export type FieldCreateHostInput = Readonly<{
  dataSet: DataSet
  targetId: string
  modelId: string
  lifecycle: FieldCreateLifecycle
  viewId?: 'default' | 'modelFields'
}>

export function createFieldCreateHost(hostInput: FieldCreateHostInput): FieldCreateHost {
  const viewId = hostInput.viewId ?? 'default'
  const {dataSet, targetId, modelId, lifecycle} = hostInput
  const fields = dataSet.getView('Base_DataModel_Field', viewId), models = dataSet.getView('Base_DataModel', 'default')
  if (!fields || !models) throw new Error('缺少正式模型或字段视图')
  const contexts = JSON.stringify([models.queryContext, fields.queryContext])
  const table = dataSet.addTable(`FieldCreate_${crypto.randomUUID().replaceAll('-', '')}`, [
    {name: 'id', type: 'string', isPrimaryKey: true},
    ...['Name', 'AsName', 'description', 'ValueFun', 'FieldType'].map(name => ({name, type: 'string'})),
    {name: 'IsOutput', type: 'number'}, {name: 'IsPKey', type: 'number'},
  ])
  table.resourceType = 'static-data'
  const input = table.getOrCreateView('default')
  input.commitMode = 'staged'
  return {input, fields, models, dataSet, targetId, modelId, viewId, contexts,
    flow: {status: 'idle', modelIdentity: '', id: null, expected: null, stagedSnapshot: '', verification: '', capture: null, captureSignature: ''},
    lifecycle}
}

function assertOwner(host: FieldCreateHost): void {
  const {lifecycle, dataSet, input, models, fields, targetId, contexts} = host
  lifecycle.assertCurrent()
  if (dataSet.destroyed || input.destroyed || [models, fields].some(view =>
    view.destroyed || dataSet.getView(view.tableName, view.viewId) !== view || view.dataTable?.modelBinding?.modelName !== view.tableName
    || view.queryContext['dataSpaceId'] !== targetId) || JSON.stringify([models.queryContext, fields.queryContext]) !== contexts) {
    throw new Error('字段新增查询或目标已变化')
  }
}

function assertCaptureIdle(batch: DataSpaceDefinitionCaptureBatch): void {
  if (batch.targets.some(({view}) => view.mutating || view.requestState === RequestState.Loading)) {
    throw new Error('原字段新增视图仍有请求，不能核验或放弃本地修改')
  }
}

function flowStatus(host: FieldCreateHost): FieldCreateStatus {
  const {flow, fields} = host
  if (flow.status === 'saving') return 'saving'
  if (flow.status === 'readback' || flow.status === 'different') return flow.status
  if (flow.id && fields.hasUnconfirmedSave) return 'unknown'
  if (flow.status === 'unknown') return 'unknown'
  return flow.status
}

function assertClean(host: FieldCreateHost, forReadback = false): void {
  const {viewId, lifecycle, fields, models, modelId, targetId, flow} = host
  assertOwner(host)
  const staging = viewId === 'modelFields'
  if (staging) {
    lifecycle.assertStaging?.()
    if (fields.commitMode !== 'staged') throw new Error('模型工作区必须使用暂存提交模式')
    if (fields.queryContext['modelId'] !== modelId || fields.rows.some(row =>
      row['dataModelId'] !== modelId || row['dataSetId'] !== targetId || row['type'] !== 'dataModel')) throw new Error('新增字段工作区所属模型已变化')
  }
  for (const view of [models, fields]) {
    if ((!forReadback && view.requestState !== RequestState.Loaded) || view.requestState === RequestState.Loading || view.mutating
      || !forReadback && view === fields && view.rows.filter(row => !view.dirtyTracking.isPendingCreate(view.getPkKey(row) ?? '')).length + view.dirtyTracking.pendingDeleteIds.size !== view.total) throw new Error('模型未读取或字段尚未完整读取')
    if ((!staging && view.hasEditingChanges()) || view.dirtyTracking.dirtyRowIds.size || !staging && view.dirtyTracking.pendingDeleteIds.size
      || [...view.dirtyTracking.pendingCreateIds].some(id => view !== fields || !staging && id !== flow.id)
      || staging && view === models && view.rows.some(row => row['rowid'] !== modelId && view.hasEditingChanges(view.getPkKey(row)))) throw new Error('请先处理其他模型或字段草稿')
  }
  const matches = models.rows.filter(row => row['rowid'] === modelId), model = matches[0]
  const keys = ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type']
  if (matches.length !== 1 || model?.['dataSetId'] !== targetId || keys.some(key => models.fieldAccess(model, key).read !== 'visible')) {
    throw new Error('新增字段所属模型不可确认')
  }
  const identity = JSON.stringify(keys.map(key => model[key]))
  if (flow.modelIdentity && identity !== flow.modelIdentity) throw new Error('所属模型已变化，请取消后重新开始')
}

export function fieldCreateGetState(host: FieldCreateHost) {
  assertOwner(host)
  const status = flowStatus(host)
  const capture = host.flow.capture
  const canAbandonNotApplied = capture?.resolution === 'not-applied' && !!host.flow.id
    && definitionTargetDraftSignature(host.fields, [host.flow.id]) === host.flow.captureSignature
  const canDiscardLocalChanges = capture?.resolution === 'confirmed' && capture.targets.every(({view}) => !view.mutating && view.requestState !== RequestState.Loading)
    && capture.targets.some(target =>
    target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))
  return {status, pending: status !== 'idle', fieldId: host.flow.id, verification: host.flow.verification,
    canAdd: host.fields.addActionState() === 'enabled', canAbandonNotApplied, canDiscardLocalChanges,
    dataViewKey: buildDataViewKey(host.input.tableName, host.input.viewId, host.dataSet.scenarioId)}
}

export function fieldCreateBegin(host: FieldCreateHost): void {
  if (flowStatus(host) !== 'idle') throw new Error('请先处理当前新增')
  assertClean(host)
  if (host.fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
  const model = host.models.rows.find(row => row['rowid'] === host.modelId)
  if (!model) throw new Error('新增字段所属模型不可确认')
  host.flow.modelIdentity = JSON.stringify(['rowid', 'dataSetId', 'Name', 'MetaName', 'Type'].map(key => model[key]))
  host.input.replaceRows([{id: 'draft', Name: '', AsName: '', description: '', ValueFun: '', FieldType: '计算字段', IsPKey: 0, IsOutput: 1}])
  host.input.setCurrentRowById('draft'); host.flow.status = 'editing'
}

export function fieldCreateReadValueFunction(host: FieldCreateHost) {
  assertOwner(host)
  return {...new LowcodeDataSpaceFieldValue({dataSet: host.dataSet, targetId: host.targetId, modelId: host.modelId, viewId: host.viewId}).read(host.lifecycle.readDefinition),
    value: host.input.getEditingRow('draft')?.['ValueFun']}
}

export function fieldCreateStageValueFunction(host: FieldCreateHost, value: string): void {
  assertOwner(host)
  if (flowStatus(host) !== 'editing') throw new Error('新增字段草稿当前不可修改')
  new LowcodeDataSpaceFieldValue({dataSet: host.dataSet, targetId: host.targetId, modelId: host.modelId, viewId: host.viewId}).validate(value)
  host.input.updateEditingValue('draft', 'ValueFun', value)
}

function fieldCreateValues(host: FieldCreateHost): DataRow {
  const input = host.input.getEditingRow('draft')
  if (!input) throw new Error('缺少计算字段输入')
  const row = {...input}
  if (host.viewId === 'modelFields') for (const key of ['Name', 'description']) {
    if (typeof row[key] === 'string') row[key] = row[key].trim()
  }
  for (const key of ['Name', 'AsName']) if (typeof row[key] !== 'string' || key === 'Name' && !row[key].trim() || row[key] !== row[key].trim()
    || /[\u0000-\u001f\u007f]/.test(row[key]) || row[key] === '_pk') throw new Error('字段名称必须是非空文本，别名可留空；不能含首尾空白、控制字符或使用保留字段_pk')
  if (typeof row['description'] !== 'string' || row['IsOutput'] !== 0 && row['IsOutput'] !== 1) throw new Error('说明或输出开关格式无效')
  if (String(row['Name']).length > 100 || String(row['AsName']).length > 100 || row['description'].length > 200) throw new Error('名称和规范别名不能超过100个字符，描述不能超过200个字符')
  new LowcodeDataSpaceFieldValue({dataSet: host.dataSet, targetId: host.targetId, modelId: host.modelId, viewId: host.viewId}).validate(row['ValueFun'])
  return {dataSetId: host.targetId, dataModelId: host.modelId, type: 'dataModel', FieldType: '计算字段', IsPKey: 0,
    Name: row['Name'], AsName: row['AsName'], description: row['description'], ValueFun: row['ValueFun'], IsOutput: row['IsOutput'],
    Expression: '', allowAIAdd: 0, OrderType: '', Order: 0, Group: 0}
}

function fieldCreateFinish(host: FieldCreateHost): void {
  host.input.discardEditingRows(); host.input.replaceRows([])
  host.flow.id = null; host.flow.expected = null; host.flow.stagedSnapshot = ''; host.flow.modelIdentity = ''
  host.flow.verification = ''; host.flow.capture = null; host.flow.captureSignature = ''; host.flow.status = 'idle'
}

export function fieldCreateCancel(host: FieldCreateHost): void {
  assertOwner(host)
  if (flowStatus(host) !== 'editing') throw new Error('已派发字段新增须先核验')
  fieldCreateFinish(host)
}

function fieldCreateMatches(row: DataRow | undefined, values: DataRow): boolean {
  return !!row && Object.entries(values).every(([key, value]) => Object.is(row[key], value))
}

export async function fieldCreateStage(host: FieldCreateHost): Promise<string> {
  if (host.viewId !== 'modelFields' || flowStatus(host) !== 'editing') throw new Error('只有正在编辑的模型工作区输入可以暂存')
  assertClean(host)
  if (host.fields.addActionState() !== 'enabled') throw new Error('当前查询不允许新增字段')
  const values = fieldCreateValues(host), snapshot = JSON.stringify(host.input.getEditingRow('draft'))
  const outputName = typeof values['AsName'] === 'string' && values['AsName'].length > 0 ? values['AsName'] : values['Name']
  for (const row of host.fields.rows) {
    if (['Name', 'AsName', 'IsOutput', 'IsPKey'].some(key => host.fields.fieldAccess(row, key).read !== 'visible')) throw new Error('已有字段合同不可核验')
    const key = host.fields.getPkKey(row)
    if (key === undefined) throw new Error('已有字段身份不可核验')
    const next = host.fields.getEditingRow(key) ?? row
    if (next['Name'] === values['Name']) throw new Error('字段名称已存在')
    const alias = typeof next['AsName'] === 'string' && next['AsName'].length > 0 ? next['AsName'] : next['Name']
    if (alias === outputName) throw new Error('模型列名称与已有字段冲突')
  }
  const before = new Set(host.fields.dirtyTracking.pendingCreateIds)
  host.flow.status = 'saving'
  try {
    await host.fields.addRow(values)
    assertClean(host)
    const added = host.fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(host.fields.getPkKey(row) ?? ''))
    const row = added[0], id = row && host.fields.getPkKey(row)
    if (added.length !== 1 || typeof id !== 'string' || row?.['rowid'] !== id || !fieldCreateMatches(row, values)
      || host.fields.addActionState() !== 'enabled' || JSON.stringify(host.input.getEditingRow('draft')) !== snapshot) throw new Error('新增暂存或权限未确认')
    fieldCreateFinish(host); return id
  } catch (cause) {
    const added = host.fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(host.fields.getPkKey(row) ?? ''))
    const row = added[0], id = row && host.fields.getPkKey(row)
    if (added.length === 1 && id !== undefined && fieldCreateMatches(row, values)) host.fields.discardPendingChanges([id])
    host.flow.status = 'editing'; throw cause
  }
}

export async function fieldCreateSave(host: FieldCreateHost): Promise<string> {
  if (host.viewId !== 'default') throw new Error('模型工作区须先确认暂存，再由顶部统一保存')
  if (flowStatus(host) !== 'editing') throw new Error('请先编辑或核验当前新增，不能重复提交')
  assertClean(host)
  const values = fieldCreateValues(host), snapshot = JSON.stringify(host.input.getEditingRow('draft'))
  host.flow.status = 'saving'
  try {
    const check = await host.lifecycle.validate(values)
    assertClean(host); check()
    if (JSON.stringify(host.input.getEditingRow('draft')) !== snapshot || host.fields.addActionState() !== 'enabled') throw new Error('新增草稿或权限已变化')
    const before = new Set(host.fields.dirtyTracking.pendingCreateIds)
    try {await host.fields.addRow({...values})} finally {
      const added = host.fields.dirtyTracking.pendingCreateRows.filter(row => !before.has(host.fields.getPkKey(row) ?? ''))
      const row = added[0], id = row && host.fields.getPkKey(row)
      if (added.length === 1 && typeof id === 'string' && row?.['rowid'] === id) {
        host.flow.id = id; host.flow.expected = {...values}; host.flow.stagedSnapshot = JSON.stringify(row)
      }
    }
    assertClean(host)
    check()
    if (!host.flow.id || !host.flow.expected || host.fields.addActionState() !== 'enabled'
      || JSON.stringify(host.input.getEditingRow('draft')) !== snapshot || !fieldCreateMatches(host.fields.rows.find(row => row['rowid'] === host.flow.id), values)) throw new Error('新增暂存或权限未确认')
    const id = host.flow.id
    const part = {
      dataSet: host.dataSet, targetId: host.targetId, modelId: host.modelId,
      prepare: () => Promise.resolve().then(() => {assertClean(host); check()}),
      apply: async () => {},
      check: () => {
        assertClean(host); check()
        if (!host.flow.id || host.flow.id !== id || !host.flow.expected || !fieldCreateMatches(host.fields.rows.find(row => row['rowid'] === id), host.flow.expected)
          || JSON.stringify(host.input.getEditingRow('draft')) !== snapshot || host.fields.addActionState() !== 'enabled') throw new Error('新增目标、输入或权限已变化')
      },
      targets: () => [{tableName: host.fields.tableName, viewId: host.fields.viewId, ids: [id]}],
      dispatched: (capture: DataSpaceDefinitionCaptureBatch) => {
        host.lifecycle.onDispatch()
        host.flow.capture = capture
        host.flow.captureSignature = definitionTargetDraftSignature(host.fields, [id])
      },
      confirm: async () => {
        assertOwner(host)
        if (!await fieldCreateReadback(host)) throw new Error(host.flow.verification)
      },
      settled: () => fieldCreateFinish(host),
      failed: (stage: 'preparing' | 'applying' | 'dispatched' | 'confirmed') => {
        host.flow.status = stage === 'confirmed' ? 'readback' : stage === 'dispatched' ? 'unknown' : 'editing'
      },
    }
    await DataSpaceDefinitionSave.run([part])
    return id
  } catch (error) {
    if (!host.flow.capture) host.flow.status = 'editing'
    if (!host.flow.capture && host.flow.id) {
      try {fieldCreateDiscardStaged(host); host.flow.id = null; host.flow.expected = null} catch {host.flow.status = 'readback'}
    }
    if (!host.flow.capture) host.flow.captureSignature = ''
    throw error
  }
}

function fieldCreateDiscardStaged(host: FieldCreateHost): void {
  assertClean(host, true)
  if (!host.flow.id) return
  if (host.fields.dirtyTracking.isPendingCreate(host.flow.id)
    && JSON.stringify(host.fields.rows.find(row => row['rowid'] === host.flow.id)) !== host.flow.stagedSnapshot) throw new Error('新增暂存已被其他操作修改，不能覆盖')
  if (host.fields.dirtyTracking.hasPendingChanges(host.flow.id)) host.fields.discardPendingChanges([host.flow.id])
}

async function fieldCreateReadback(host: FieldCreateHost): Promise<boolean> {
  assertClean(host, true)
  const editState = {edited: false}
  const onEdit = () => {editState.edited = true}
  host.fields.events.on('editingFieldChanged', onEdit)
  let loaded: Awaited<ReturnType<DataView['loadFromServer']>>
  try {
    loaded = await host.fields.loadFromServer({filter: {field: 'dataSetId', operator: 'eq', value: host.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    assertClean(host)
    if (editState.edited) throw new Error('正式字段回读期间出现后续修改；保留修改，请重新核验')
  } finally {host.fields.events.off('editingFieldChanged', onEdit)}
  if (!loaded.success || host.fields.loadingError) throw new Error('新增字段回读失败')
  const matches = host.fields.rows.filter(row => row['rowid'] === host.flow.id), row = matches[0]
  const equal = !!row && matches.length === 1 && !!host.flow.expected && Object.keys(host.flow.expected).every(key => host.fields.fieldAccess(row, key).read === 'visible')
    && fieldCreateMatches(row, host.flow.expected)
  host.flow.verification = equal ? '已精确回读计算字段' : row ? '新增字段回读值或权限与提交不一致' : '未读取到新增字段，不能确认写入结果'
  return equal
}

export async function fieldCreateVerify(host: FieldCreateHost): Promise<string | null> {
  assertOwner(host)
  const recovery = flowStatus(host)
  if (!['unknown', 'readback', 'different'].includes(recovery)) throw new Error('没有待核验的字段新增')
  const capture = host.flow.capture
  if (!capture) throw new Error('缺少字段新增原始提交捕获，未知结果仍保留')
  assertCaptureIdle(capture)
  if (capture.resolution === 'not-applied') {
    host.flow.status = 'different'; host.flow.verification = '服务已确认本次新增未应用；请明确结束本次新增意图'; return null
  }
  host.flow.status = 'saving'
  try {
    const outcome = await verifyDataSpaceDefinitionCapture(host.dataSet, capture)
    assertOwner(host)
    if (outcome === 'not-applied') {
      host.flow.status = 'different'; host.flow.verification = '服务已确认本次新增未应用；请明确结束本次新增意图'; return null
    }
    if (outcome !== 'confirmed' && outcome !== 'already-confirmed') throw new Error('字段新增原始提交尚未确认')
    if (capture.targets.some(target => target.ids.some(id => target.view.hasEditingChanges(id) || target.view.dirtyTracking.hasPendingChanges(id)))) {
      host.flow.status = 'different'; host.flow.verification = '原新增已确认，但字段存在后续修改；请选择保留修改或明确放弃并核验'; return null
    }
    if (!await fieldCreateReadback(host)) {host.flow.status = 'different'; return null}
    const id = host.flow.id; fieldCreateFinish(host); return id
  } catch (error) {host.flow.status = capture.resolution === 'confirmed' ? 'readback' : 'unknown'; throw error}
}

export function fieldCreateAbandonNotApplied(host: FieldCreateHost): void {
  assertOwner(host)
  const capture = host.flow.capture
  if (host.flow.status !== 'different' || capture?.resolution !== 'not-applied' || !host.flow.id
    || definitionTargetDraftSignature(host.fields, [host.flow.id]) !== host.flow.captureSignature) throw new Error('只能结束已确认未应用且未变化的原新增意图')
  assertCaptureIdle(capture)
  fieldCreateDiscardStaged(host)
  fieldCreateFinish(host)
}

export async function fieldCreateDiscardLocalChangesAndVerify(host: FieldCreateHost): Promise<string | null> {
  assertOwner(host)
  const capture = host.flow.capture
  if (capture?.resolution !== 'confirmed' || !host.flow.id) throw new Error('只有原新增已确认后才能放弃后续字段修改')
  assertCaptureIdle(capture)
  host.flow.status = 'saving'
  try {
    await verifyAndDiscardDataSpaceDefinitionCapture(host.dataSet, capture, {discardLocalChanges: true, acceptCurrentOnInvalidReceipt: false})
    assertOwner(host)
    if (!await fieldCreateReadback(host)) {host.flow.status = 'different'; return null}
    const id = host.flow.id; fieldCreateFinish(host); return id
  } catch (error) {host.flow.status = 'readback'; throw error}
}

/** 页面与测试沿用的句柄；方法委托会话 host，不单独持有命令类 FSM。 */
export type FieldCreateHandle = {
  readonly input: DataView
  begin(): void
  cancel(): void
  getState(): ReturnType<typeof fieldCreateGetState>
  readValueFunction(): ReturnType<typeof fieldCreateReadValueFunction>
  stageValueFunction(value: string): void
  stage(): Promise<string>
  save(): Promise<string>
  verify(): Promise<string | null>
  abandonNotApplied(): void
  discardLocalChangesAndVerify(): Promise<string | null>
}

export function createFieldCreateHandle(host: FieldCreateHost): FieldCreateHandle {
  return {
    input: host.input,
    begin: () => fieldCreateBegin(host),
    cancel: () => fieldCreateCancel(host),
    getState: () => fieldCreateGetState(host),
    readValueFunction: () => fieldCreateReadValueFunction(host),
    stageValueFunction: value => fieldCreateStageValueFunction(host, value),
    stage: () => fieldCreateStage(host),
    save: () => fieldCreateSave(host),
    verify: () => fieldCreateVerify(host),
    abandonNotApplied: () => fieldCreateAbandonNotApplied(host),
    discardLocalChangesAndVerify: () => fieldCreateDiscardLocalChangesAndVerify(host),
  }
}
