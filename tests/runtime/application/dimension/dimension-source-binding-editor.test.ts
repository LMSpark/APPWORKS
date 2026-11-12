import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DimensionSourceBindingEditor} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {createDimensionSourceRuntime} from './dimension.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
type FormalField = FormalModel['fields'][number]

const runtimes: PageRuntime[] = [], editors: DimensionSourceBindingEditor[] = []
afterEach(() => {
  editors.splice(0).forEach(editor => editor.dispose())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
})

function field(id: string, canonicalName: string, changes: Partial<FormalField> = {}): FormalField {
  return {id, modelId: 'MODEL', name: canonicalName, canonicalName, primaryKey: false, description: canonicalName, type: 'string',
    output: true, computed: false, order: 0, orderType: '', raw: {}, ...changes}
}
function model(changes: Partial<FormalModel> = {}): FormalModel {
  return {id: 'MODEL', name: '费用单', metaName: 'Expense', sourceType: 'table', sourceId: 'DB', sourceName: 'expense_table', primaryKey: 'rowid',
    businessMain: false, raw: {}, fields: [field('F-ROWID', 'rowid', {primaryKey: true}), field('F-AMOUNT', 'amount'),
      field('F-ACCOUNT', 'account_set')], ...changes}
}
function lineModel(): FormalModel {
  return {id: 'LINE', name: '费用明细', metaName: 'ExpenseLine', sourceType: 'table', sourceId: 'DB', sourceName: 'expense_line_table', primaryKey: 'rowid',
    businessMain: false, raw: {}, fields: [field('L-ROWID', 'rowid', {primaryKey: true, modelId: 'LINE'}), field('L-EXPENSE', 'expense_id', {modelId: 'LINE'}),
      field('L-AMOUNT', 'amount', {modelId: 'LINE'})]}
}
function binding(changes: Record<string, unknown> = {}) {
  return {id: 'B1', binding_code: 'expense-source', source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
    source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: '', event_code: 'expense', payload_version: 1, binding_version: 2,
    effective_from: null, effective_to: null, status: 1, description: '', projection_role: 'business-result', account_field_id: '', account_field_name: '',
    ...changes}
}
const savedMapping = {id: 'M1', binding_id: 'B1', source_field_id: 'F-AMOUNT', source_field_name: 'amount', target_definition_id: 'D1',
  target_definition_code: 'cost', mapping_kind: 'direct', mapping_value: '', required_flag: true, sort_no: 1, version_no: 2}

type Seed = Readonly<{bindings?: Array<Record<string, unknown>>; mappings?: Array<Record<string, unknown>>; ledger?: () => Promise<boolean>}>

async function open(seed: Seed = {}) {
  const f = await createDimensionSourceRuntime()
  runtimes.push(f.runtime)
  f.http.records['Bil_Dimension_Source_Binding'] = seed.bindings ?? []
  f.http.records['Bil_Dimension_Source_Mapping'] = seed.mappings ?? []
  const formal = {models: [model(), lineModel()]}
  const readModels = vi.fn<DataSpaceDesignApi['readModels']>(async () => formal.models)
  const hasLedgerRecords = vi.fn(seed.ledger ?? (async () => false))
  const editor = new DimensionSourceBindingEditor({dataSet: f.dataSet, readModels, hasLedgerRecords,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
  editors.push(editor)
  await editor.loadModels()
  return {...f, editor, readModels, hasLedgerRecords, formal}
}
type Opened = Awaited<ReturnType<typeof open>>

function edit(f: Opened, values: Record<string, unknown>) {
  const id = f.editor.bindingId!
  for (const [key, value] of Object.entries(values)) f.editor.binding.updateEditingValue(id, key, value)
}
async function editMapping(f: Opened, id: string | number, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) f.editor.mapping.updateEditingValue(id, key, value)
  await vi.waitFor(() => expect(f.editor.mapping.getEditingRow(id)).toMatchObject({source_field_name: expect.stringMatching(/./),
    ...('target_definition_id' in values ? {target_definition_code: expect.stringMatching(/./)} : {})}))
}

async function draft(f: Opened, mapping: Record<string, unknown> = {}) {
  await f.editor.selectSource('data-model', 'MODEL')
  const id = f.editor.bindingId!
  edit(f, {binding_code: 'expense-source', event_code: 'expense', status: '1'})
  await f.editor.addMapping()
  const mappingId = f.editor.mappingIds().at(-1)!
  await editMapping(f, mappingId, {source_field_id: 'F-AMOUNT', target_definition_id: 'D1', ...mapping})
  return {id, mappingId}
}

describe('维度来源绑定编辑 owner：数据模型来源', () => {
  it('lists node models from the catalog view and registered platform contracts from the option catalog', async () => {
    const f = await open()
    expect(f.editor.models.dataSet?.scenarioId).toBe(f.catalog.scenarioId)
    expect(f.editor.models.rows.map(row => row['rowid'])).toEqual(['MODEL', 'LINE'])
    expect(f.editor.contracts.rows.map(row => row['label'])).toEqual(['企业任务变化 · v2'])
    expect(f.readModels).not.toHaveBeenCalled()
  })

  it('creates a draft binding with defaults and loads formal output candidates through 7AB views', async () => {
    const f = await open({bindings: [binding({id: 'OTHER', source_node_id: 'NODE-2'})]})
    await f.editor.selectSource('data-model', 'MODEL')
    const id = f.editor.bindingId!
    expect(f.editor.binding.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(f.editor.binding.getEditingRow(id)).toMatchObject({source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
      source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: '', payload_version: '1', binding_version: '1', status: '0',
      projection_role: 'business-result', account_field_id: ''})
    expect(f.editor.mappingIds()).toEqual([])
    expect(f.editor.sourceFields.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'amount', 'account_set', 'total', 'commit_id'])
    expect(f.editor.accountFields.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'amount', 'account_set', 'commit_id'])
    expect(f.editor.savedBinding()).toBeUndefined()
  })

  it('loads the unique existing binding with only its own mappings', async () => {
    const f = await open({bindings: [binding()], mappings: [savedMapping, {...savedMapping, id: 'M9', binding_id: 'B9'}]})
    await f.editor.selectSource('data-model', 'MODEL')
    expect(f.editor.bindingId).toBe('B1')
    expect(f.editor.mappingIds()).toEqual(['M1'])
    expect(f.editor.hasDraft()).toBe(false)
    expect(f.editor.savedBinding()).toEqual({id: 'B1', sourceKind: 'data-model', eventCode: 'expense', bindingVersion: 2,
      projectionRole: 'business-result', modelId: 'MODEL', modelMetaName: 'Expense'})
  })

  it('refuses to choose among duplicate bindings or a model outside the node data space', async () => {
    const f = await open({bindings: [binding(), binding({id: 'B2', binding_code: 'dup'})]})
    await expect(f.editor.selectSource('data-model', 'MODEL')).rejects.toThrow('蓝图节点来源存在 2 个绑定，不能自动选择，请先治理重复配置')
    await expect(f.editor.selectSource('data-model', 'FOREIGN')).rejects.toThrow('来源模型不属于当前数据空间：FOREIGN')
    expect(f.editor.bindingId).toBeUndefined()
  })

  it('fills mapping names on edit and saves binding with mappings in one DataSet save', async () => {
    const f = await open()
    const {id, mappingId} = await draft(f)
    expect(f.editor.mapping.getEditingRow(mappingId)).toMatchObject({source_field_name: 'amount', target_definition_code: 'cost'})
    const requests = vi.fn(async () => undefined)
    f.http.beforeSave = requests
    await expect(f.editor.save()).resolves.toBe(true)
    expect(requests).toHaveBeenCalledTimes(1)
    expect(f.http.records['Bil_Dimension_Source_Binding']).toEqual([expect.objectContaining({id, binding_code: 'expense-source',
      source_model_id: 'MODEL', status: '1', projection_role: 'business-result'})])
    expect(f.http.records['Bil_Dimension_Source_Mapping']).toEqual([expect.objectContaining({id: mappingId, binding_id: String(id),
      source_field_id: 'F-AMOUNT', source_field_name: 'amount', target_definition_id: 'D1', target_definition_code: 'cost', sort_no: 1})])
    expect(f.editor.hasDraft()).toBe(false)
    expect(f.editor.savedBinding()?.id).toBe(String(id))
    expect(f.hasLedgerRecords).not.toHaveBeenCalled()
    expect(f.readModels).not.toHaveBeenCalled()
  })

  it.each([
    ['a source field that is not a formal output', {source_field_id: 'F-SECRET'}, 'source_field_id 不在当前可选范围内或不唯一'],
    ['a missing target definition', {target_definition_id: 'D404'}, 'target_definition_id 不在当前可选范围内或不唯一'],
    ['a disabled definition on an enabled binding', {target_definition_id: 'D2'}, '第 1 行目标维度未启用：dept'],
    ['a constant mapping without value', {mapping_kind: 'constant'}, '常量映射缺少映射值'],
  ])('rejects %s without writing', async (_name, mapping, message) => {
    const f = await open()
    const {mappingId} = await draft(f)
    for (const [key, value] of Object.entries(mapping)) f.editor.mapping.updateEditingValue(mappingId, key, value)
    await expect(f.editor.save()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('rejects an enabled binding without mappings and duplicate field-dimension pairs', async () => {
    const f = await open()
    await f.editor.selectSource('data-model', 'MODEL')
    edit(f, {binding_code: 'expense-source', event_code: 'expense', status: '1'})
    await expect(f.editor.save()).rejects.toThrow('启用来源绑定前至少配置一个正式字段映射')
    for (let index = 0; index < 2; index++) {
      await f.editor.addMapping()
      await editMapping(f, f.editor.mappingIds().at(-1)!, {source_field_id: 'F-AMOUNT', target_definition_id: 'D1'})
    }
    await expect(f.editor.save()).rejects.toThrow('第 2 行与已有字段维度映射重复')
    expect(f.http.saves).toEqual([])
  })

  it('keeps an unknown save result and refuses to discard it', async () => {
    const f = await open()
    await draft(f)
    f.http.failAfterWrite = true
    await expect(f.editor.save()).rejects.toThrow('保存结果未知')
    expect(f.editor.unknown).toBe(true)
    expect(() => f.editor.discard()).toThrow('保存结果未知')
    await expect(f.editor.addMapping()).rejects.toThrow('保存结果未知')
    await f.editor.save().catch(() => undefined)
    const bindingIds = f.http.saves.filter(save => save.table === 'Bil_Dimension_Source_Binding')
      .flatMap(save => [...save.added, ...save.changed].map(row => row['id']))
    expect(new Set(bindingIds).size).toBe(1)
  })

  it('discards drafts without writing', async () => {
    const f = await open()
    const {id} = await draft(f)
    f.editor.discard()
    expect(f.editor.binding.rows.some(row => f.editor.binding.getPkKey(row) === id)).toBe(false)
    expect(f.editor.mapping.rows).toEqual([])
    expect(f.http.saves).toEqual([])
  })
})

describe('维度来源绑定编辑 owner：账套字段、投影角色与版本', () => {
  it('fills the account field name and requires it for source-voucher projections', async () => {
    const f = await open()
    await draft(f)
    edit(f, {projection_role: 'source-voucher'})
    await expect(f.editor.save()).rejects.toThrow('正式账套字段不能为空')
    edit(f, {account_field_id: 'F-ACCOUNT'})
    await vi.waitFor(() => expect(f.editor.binding.getEditingRow(f.editor.bindingId!)).toMatchObject({account_field_name: 'account_set'}))
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.http.records['Bil_Dimension_Source_Binding']?.[0]).toMatchObject({projection_role: 'source-voucher',
      account_field_id: 'F-ACCOUNT', account_field_name: 'account_set'})
  })

  it('rejects a computed account field through the catalog reference', async () => {
    const f = await open()
    await draft(f)
    edit(f, {account_field_id: 'F-TOTAL', account_field_name: 'total'})
    await expect(f.editor.save()).rejects.toThrow('不在当前可选范围内或不唯一')
    expect(f.http.saves).toEqual([])
  })

  it('requires a higher binding version when the event contract changes', async () => {
    const f = await open({bindings: [binding()], mappings: [savedMapping]})
    await f.editor.selectSource('data-model', 'MODEL')
    edit(f, {event_code: 'expense.v2'})
    await expect(f.editor.save()).rejects.toThrow('平台事件合同或载荷版本变化时必须增加绑定版本')
    edit(f, {binding_version: '1'})
    await expect(f.editor.save()).rejects.toThrow('平台事件合同或载荷版本变化时必须增加绑定版本')
    edit(f, {event_code: 'expense'})
    await expect(f.editor.save()).rejects.toThrow('绑定版本不能倒退')
    expect(f.http.saves).toEqual([])
  })

  it('refuses protected changes when formal dimension results use the binding', async () => {
    const f = await open({bindings: [binding()], mappings: [savedMapping], ledger: async () => true})
    await f.editor.selectSource('data-model', 'MODEL')
    edit(f, {description: '只改说明'})
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.hasLedgerRecords).not.toHaveBeenCalled()
    edit(f, {binding_version: '3'})
    await expect(f.editor.save()).rejects.toThrow('已有正式维度结果使用此来源绑定，不能变更角色、模型、关联字段或绑定版本')
    expect(f.hasLedgerRecords).toHaveBeenCalledWith('B1', expect.any(Function))
  })

  it('refuses protected changes when the ledger cannot be verified', async () => {
    const f = await open({bindings: [binding()], mappings: [savedMapping], ledger: async () => { throw new Error('台账查询失败') }})
    await f.editor.selectSource('data-model', 'MODEL')
    edit(f, {projection_role: 'source-voucher', account_field_id: 'F-ACCOUNT', account_field_name: 'account_set'})
    await expect(f.editor.save()).rejects.toThrow('台账查询失败')
    expect(f.http.saves).toEqual([])
  })
})

describe('维度来源绑定编辑 owner：平台注册事件来源', () => {
  it('maps contract dimension fields through the platform mapping view and fills name and dimension code', async () => {
    const f = await open()
    await f.editor.selectSource('platform-event', 'platform.enterprise-task.v2')
    const id = f.editor.bindingId!
    expect(f.editor.mapping.viewId).toBe('platformByBinding')
    expect(f.editor.binding.getEditingRow(id)).toMatchObject({source_kind: 'platform-event', source_contract_id: 'platform.enterprise-task.v2',
      event_code: 'enterprise.task.changed', payload_version: '2', source_model_id: ''})
    expect(f.editor.contractFields.rows.map(row => row['value'])).toEqual(['status', 'kind', 'priority'])
    expect(f.editor.bindingFormFields()).not.toContain('account_field_id')
    expect(f.editor.platformNonDimensionFields()).toContain('任务标题')
    await expect(f.editor.addCollection()).rejects.toThrow('平台注册事件来源不支持数据空间集合')
    edit(f, {binding_code: 'task-source', status: '1'})
    await f.editor.addMapping()
    const mappingId = f.editor.mappingIds()[0]!
    await editMapping(f, mappingId, {source_field_id: 'status'})
    expect(f.editor.mapping.getEditingRow(mappingId)).toMatchObject({source_field_name: '任务状态', target_definition_code: 'task.status'})
    f.editor.mapping.updateEditingValue(mappingId, 'target_definition_id', 'D-STATUS')
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.http.records['Bil_Dimension_Source_Binding']?.[0]).toMatchObject({source_kind: 'platform-event', event_code: 'enterprise.task.changed'})
    expect(f.http.records['Bil_Dimension_Source_Mapping']?.[0]).toMatchObject({source_field_id: 'status', target_definition_id: 'D-STATUS'})
  })

  it('rejects a platform mapping to a definition other than the contract dimension', async () => {
    const f = await open()
    await f.editor.selectSource('platform-event', 'platform.enterprise-task.v2')
    edit(f, {binding_code: 'task-source'})
    await f.editor.addMapping()
    const mappingId = f.editor.mappingIds()[0]!
    await editMapping(f, mappingId, {source_field_id: 'status'})
    f.editor.mapping.updateEditingValue(mappingId, 'target_definition_id', 'D1')
    await expect(f.editor.save()).rejects.toThrow('不在当前可选范围内或不唯一')
    expect(f.http.saves).toEqual([])
  })

  it('rejects a tampered event code and source-voucher projections through the scene model rule', async () => {
    const f = await open()
    await f.editor.selectSource('platform-event', 'platform.enterprise-task.v2')
    edit(f, {binding_code: 'task-source', event_code: 'tampered'})
    await expect(f.editor.save()).rejects.toThrow('来源绑定与平台注册事件合同不一致')
    edit(f, {event_code: 'enterprise.task.changed', projection_role: 'source-voucher'})
    await expect(f.editor.save()).rejects.toThrow('来源凭证投影必须绑定节点数据空间模型')
    expect(f.http.saves).toEqual([])
  })

  it('rejects unregistered contracts', async () => {
    const f = await open()
    await expect(f.editor.selectSource('platform-event', 'platform.ghost')).rejects.toThrow('平台事件合同 platform.ghost 未登记或已退役')
  })
})

describe('维度来源绑定编辑 owner：来源子集合', () => {
  async function withCollection(f: Opened, values: Record<string, unknown> = {}) {
    await draft(f)
    await f.editor.addCollection()
    const id = f.editor.collectionIds().at(-1)!
    for (const [key, value] of Object.entries({collection_name: 'lines', source_model_id: 'LINE', child_key_field_id: 'L-EXPENSE',
      child_pk_field_id: 'L-ROWID', ...values})) {
      f.editor.collection.updateEditingValue(id, key, value)
    }
    await vi.waitFor(() => expect(f.editor.collection.getEditingRow(id)?.['child_pk_field_name']).not.toBe(''))
    return id
  }

  it('defaults the parent key, fills model and key names, and saves collections in the same DataSet save', async () => {
    const f = await open()
    const id = await withCollection(f)
    expect(f.editor.collection.currentRow && f.editor.collection.getPkKey(f.editor.collection.currentRow)).toBe(id)
    expect(f.editor.collection.getEditingRow(id)).toMatchObject({parent_key_field_id: 'F-ROWID', parent_key_field_name: 'rowid',
      source_model_meta_name: 'ExpenseLine', child_pk_field_name: 'rowid', child_key_field_name: 'expense_id'})
    const requests = vi.fn(async () => undefined)
    f.http.beforeSave = requests
    await expect(f.editor.save()).resolves.toBe(true)
    expect(requests).toHaveBeenCalledTimes(1)
    expect(f.readModels).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: 'SPACE-A'}))
    expect(f.http.records['Bil_Dimension_Source_Collection']).toEqual([expect.objectContaining({id, collection_name: 'lines',
      binding_id: String(f.editor.bindingId), source_model_id: 'LINE', sort_no: 1})])
    expect(f.editor.collectionParents.rows.map(row => row['id'])).toEqual([id])
  })

  it.each([
    ['an unsafe name', {collection_name: '1lines'}, '集合名称须为安全字段名'],
    ['a reserved name', {collection_name: 'constructor'}, '来源集合名称不能使用 constructor'],
    ['a name shadowing a parent field', {collection_name: 'amount'}, '集合名称不能覆盖父模型正式字段：amount'],
    ['a foreign key from another model', {child_key_field_id: 'F-AMOUNT'}, '第 1 行子外键字段与正式模型不一致'],
  ])('rejects %s without writing', async (_name, values, message) => {
    const f = await open()
    await withCollection(f, values)
    await expect(f.editor.save()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('refuses removing a collection that still has children', async () => {
    const f = await open()
    const parent = await withCollection(f)
    await f.editor.addCollection()
    const child = f.editor.collectionIds().at(-1)!
    f.editor.collection.updateEditingValue(child, 'parent_collection_id', parent)
    await expect(f.editor.removeCollection(parent)).rejects.toThrow('请先移除 lines 下的子集合')
    await f.editor.removeCollection(child)
    expect(f.editor.collectionIds()).toEqual([parent])
  })
})
