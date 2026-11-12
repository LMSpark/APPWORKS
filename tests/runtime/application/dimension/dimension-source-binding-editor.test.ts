import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DimensionSourceBindingEditor} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {createDimensionRuntime} from './dimension.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
type FormalField = FormalModel['fields'][number]

const runtimes: PageRuntime[] = [], editors: DimensionSourceBindingEditor[] = []
afterEach(() => {
  editors.splice(0).forEach(editor => editor.dispose())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
})

function field(id: string, canonicalName: string, output = true): FormalField {
  return {id, modelId: 'MODEL', name: canonicalName, canonicalName, primaryKey: false, description: canonicalName, type: 'string',
    output, computed: false, order: 0, orderType: '', raw: {}}
}
function model(changes: Partial<FormalModel> = {}): FormalModel {
  return {id: 'MODEL', name: '费用单', metaName: 'Expense', sourceType: 'table', sourceId: 'DB', sourceName: 'Expense', primaryKey: 'rowid',
    businessMain: false, raw: {}, fields: [field('F-AMOUNT', 'amount'), field('F-SECRET', 'secret', false)], ...changes}
}
function binding(changes: Record<string, unknown> = {}) {
  return {id: 'B1', binding_code: 'expense-source', source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
    source_model_id: 'MODEL', source_model_meta_name: 'Expense', event_code: 'expense', payload_version: 1, binding_version: 2,
    effective_from: null, effective_to: null, status: 1, description: '', ...changes}
}

async function open(seed: Readonly<{bindings?: Array<Record<string, unknown>>; mappings?: Array<Record<string, unknown>>}> = {}) {
  const f = await createDimensionRuntime()
  runtimes.push(f.runtime)
  f.http.records['Bil_Dimension_Source_Binding'] = seed.bindings ?? []
  f.http.records['Bil_Dimension_Source_Mapping'] = seed.mappings ?? []
  f.http.records['Bil_Dimension_Definition'] = [
    {id: 'D1', definition_code: 'cost', definition_name: '成本', status: true},
    {id: 'D2', definition_code: 'dept', definition_name: '部门', status: false},
  ]
  const formal = {models: [model()]}
  const readModels = vi.fn<DataSpaceDesignApi['readModels']>(async () => formal.models)
  const editor = new DimensionSourceBindingEditor({dataSet: f.dataSet, readModels,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
  editors.push(editor)
  await editor.loadModels()
  return {...f, editor, readModels, formal}
}

async function draft(f: Awaited<ReturnType<typeof open>>, mapping: Record<string, unknown> = {}) {
  await f.editor.selectModel('MODEL')
  const id = f.editor.bindingId!
  for (const [key, value] of Object.entries({binding_code: 'expense-source', event_code: 'expense', status: '1'})) {
    f.editor.binding.updateEditingValue(id, key, value)
  }
  await f.editor.addMapping()
  const mappingId = f.editor.mappingIds().at(-1)!
  for (const [key, value] of Object.entries({source_field_id: 'F-AMOUNT', target_definition_id: 'D1', ...mapping})) {
    f.editor.mapping.updateEditingValue(mappingId, key, value)
  }
  return {id, mappingId}
}

describe('维度来源绑定编辑 owner', () => {
  it('lists the formal models of the saved data space through a static-data option view', async () => {
    const f = await open()
    expect(f.readModels).toHaveBeenCalledWith(expect.objectContaining({dataSpaceId: 'SPACE-A'}))
    expect(f.editor.modelOptions.dataTable?.resourceType).toBe('static-data')
    expect(f.editor.modelOptions.rows.map(row => row['id'])).toEqual(['MODEL'])
  })

  it('creates a draft binding with defaults when the node has no binding for the model', async () => {
    const f = await open({bindings: [binding({id: 'OTHER', source_node_id: 'NODE-2'})]})
    await f.editor.selectModel('MODEL')
    const id = f.editor.bindingId!
    expect(f.editor.binding.dirtyTracking.isPendingCreate(id)).toBe(true)
    expect(f.editor.binding.getEditingRow(id)).toMatchObject({source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
      source_model_id: 'MODEL', source_model_meta_name: 'Expense', payload_version: '1', binding_version: '1', status: '0'})
    expect(f.editor.mappingIds()).toEqual([])
    expect(f.editor.fieldOptions.rows.map(row => row['canonicalName'])).toEqual(['amount'])
  })

  it('loads the unique existing binding with only its own mappings', async () => {
    const f = await open({bindings: [binding()], mappings: [
      {id: 'M1', binding_id: 'B1', source_field_id: 'F-AMOUNT', source_field_name: 'amount', target_definition_id: 'D1',
        target_definition_code: 'cost', mapping_kind: 'direct', mapping_value: '', required_flag: true, sort_no: 1, version_no: 2},
      {id: 'M9', binding_id: 'B9', source_field_id: 'F-AMOUNT', source_field_name: 'amount', target_definition_id: 'D1',
        target_definition_code: 'cost', mapping_kind: 'direct', mapping_value: '', required_flag: true, sort_no: 1, version_no: 1},
    ]})
    await f.editor.selectModel('MODEL')
    expect(f.editor.bindingId).toBe('B1')
    expect(f.editor.mappingIds()).toEqual(['M1'])
    expect(f.editor.hasDraft()).toBe(false)
  })

  it('refuses to choose among duplicate bindings', async () => {
    const f = await open({bindings: [binding(), binding({id: 'B2', binding_code: 'dup'})]})
    await expect(f.editor.selectModel('MODEL')).rejects.toThrow('蓝图节点来源存在 2 个绑定，不能自动选择，请先治理重复配置')
    expect(f.editor.bindingId).toBeUndefined()
  })

  it('saves binding and paired mapping identities in one DataSet save and verifies the readback', async () => {
    const f = await open()
    const {id, mappingId} = await draft(f)
    expect(f.editor.mapping.getEditingRow(mappingId)).toMatchObject({source_field_name: 'amount', target_definition_code: 'cost'})
    const requests = vi.fn(async () => undefined)
    f.http.beforeSave = requests
    await expect(f.editor.save()).resolves.toBe(true)
    expect(requests).toHaveBeenCalledTimes(1)
    expect(f.http.records['Bil_Dimension_Source_Binding']).toEqual([expect.objectContaining({id, binding_code: 'expense-source',
      source_model_id: 'MODEL', status: '1'})])
    expect(f.http.records['Bil_Dimension_Source_Mapping']).toEqual([expect.objectContaining({id: mappingId, binding_id: String(id),
      source_field_id: 'F-AMOUNT', source_field_name: 'amount', target_definition_id: 'D1', target_definition_code: 'cost', sort_no: 1})])
    expect(f.editor.hasDraft()).toBe(false)
  })

  it.each([
    ['a direct field that is not a formal output', {source_field_id: 'F-SECRET', source_field_name: 'secret'}, '第 1 行直接来源字段必须匹配根模型正式输出字段身份与名称'],
    ['a missing target definition', {target_definition_id: 'D404', target_definition_code: 'ghost'}, '第 1 行目标维度不存在或身份不唯一：D404'],
    ['a disabled definition on an enabled binding', {target_definition_id: 'D2'}, '第 1 行目标维度未启用：dept'],
    ['a definition code mismatch', {target_definition_code: 'other'}, '第 1 行目标维度身份与编码不一致：other'],
  ])('rejects %s without writing', async (_name, mapping, message) => {
    const f = await open()
    await draft(f, mapping)
    await expect(f.editor.save()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('rejects a model that no longer belongs to the data space or changed formal identity', async () => {
    const f = await open()
    await draft(f)
    f.formal.models = [model({metaName: 'Other'})]
    await expect(f.editor.save()).rejects.toThrow('根来源模型不属于正式蓝图节点数据空间：Expense')
    f.formal.models = [model({id: 'MODEL-2'})]
    await expect(f.editor.save()).rejects.toThrow('根来源模型正式身份与来源绑定不一致')
    expect(f.http.saves).toEqual([])
  })

  it('reports a readback mismatch instead of claiming success', async () => {
    const f = await open()
    await draft(f)
    f.http.beforeDefinitionRead = async table => {
      if (table !== 'Bil_Dimension_Source_Binding') return
      for (const row of f.http.records['Bil_Dimension_Source_Binding'] ?? []) row['event_code'] = 'normalized'
    }
    await expect(f.editor.save()).rejects.toThrow('来源绑定保存后读回不一致')
  })

  it('keeps an unknown save result and refuses to discard it', async () => {
    const f = await open()
    await draft(f)
    f.http.failAfterWrite = true
    await expect(f.editor.save()).rejects.toThrow('保存结果未知')
    expect(f.editor.unknown).toBe(true)
    expect(() => f.editor.discard()).toThrow('来源绑定保存结果未知')
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
