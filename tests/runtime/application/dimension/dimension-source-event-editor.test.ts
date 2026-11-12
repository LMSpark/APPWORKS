import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DimensionSourceSavedBinding} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {DimensionSourceEventEditor} from '@/lowcode/resources/structured-config/dimension-source/event-editor'
import {createDimensionRuntime} from './dimension.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]
type FormalField = FormalModel['fields'][number]

const runtimes: PageRuntime[] = [], editors: DimensionSourceEventEditor[] = []
afterEach(() => {
  editors.splice(0).forEach(editor => editor.dispose())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
})

function field(id: string, canonicalName: string, output = true): FormalField {
  return {id, modelId: 'MODEL', name: canonicalName, canonicalName, primaryKey: canonicalName === 'rowid', description: canonicalName,
    type: 'string', output, computed: false, order: 0, orderType: '', raw: {}}
}
const expense: FormalModel = {id: 'MODEL', name: '费用单', metaName: 'Expense', sourceType: 'table', sourceId: 'DB', sourceName: 'Expense',
  primaryKey: 'rowid', businessMain: false, raw: {}, fields: [field('F-ROWID', 'rowid'), field('F-NO', 'bill_no'), field('F-DATE', 'bill_date'),
    field('F-SECRET', 'secret', false)]}
const savedBinding: DimensionSourceSavedBinding = {id: 'B1', sourceKind: 'data-model', eventCode: 'expense.changed', bindingVersion: 1,
  projectionRole: 'business-result', modelId: 'MODEL', modelMetaName: 'Expense'}
const bindingRow = {id: 'B1', binding_code: 'expense-source', source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
  source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: '', event_code: 'expense.changed', payload_version: 1,
  binding_version: 1, status: 0, projection_role: 'business-result', account_field_id: '', account_field_name: ''}
const eventRow = {rowid: 'E1', template_code: 'expense.changed', template_name: '费用变化', template_category: 'finance', event_code: 'expense.changed',
  biz_category: 'finance', source_table: 'Expense', source_pk_field: 'rowid', biz_no_field: 'bill_no', biz_date_field: 'bill_date', priority: 0,
  status: true, builtin_flag: false, voucher_required: false, auto_voucher_write: false, stop_after_match: true, description: ''}

type Seed = Readonly<{events?: Array<Record<string, unknown>>; rules?: Array<Record<string, unknown>>; bindings?: Array<Record<string, unknown>>
  binding?: DimensionSourceSavedBinding}>

async function open(seed: Seed = {}) {
  const f = await createDimensionRuntime()
  runtimes.push(f.runtime)
  f.http.records['Bil_Dimension_Source_Binding'] = seed.bindings ?? [bindingRow]
  f.http.records['Bil_Dimension_Rule_Template'] = seed.events ?? []
  f.http.records['Bil_Dimension_Rule'] = seed.rules ?? []
  f.http.records['Bil_Dimension_Biz_Category'] = [{rowid: 'C1', biz_category_code: 'finance', biz_category_name: '财务', status: true},
    {rowid: 'C2', biz_category_code: 'retired', biz_category_name: '停用', status: false}]
  const readModels = vi.fn<DataSpaceDesignApi['readModels']>(async () => [expense])
  const editor = new DimensionSourceEventEditor({dataSet: f.dataSet, readModels, binding: seed.binding ?? savedBinding,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
  editors.push(editor)
  return {...f, editor}
}

function edit(f: Awaited<ReturnType<typeof open>>, values: Record<string, unknown>) {
  const id = f.editor.eventId!
  for (const [key, value] of Object.entries(values)) f.editor.template.updateEditingValue(id, key, value)
}

describe('维度来源数据模型事件编辑 owner', () => {
  it('creates a new event contract draft from the binding and saves create defaults with one DataSet save', async () => {
    const f = await open()
    await f.editor.load()
    expect(f.editor.isNew).toBe(true)
    expect(f.editor.template.getEditingRow(f.editor.eventId!)).toMatchObject({template_code: 'expense.changed', event_code: 'expense.changed',
      source_table: 'Expense', source_pk_field: 'rowid'})
    expect(f.editor.outputFieldOptions.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'bill_no', 'bill_date'])
    edit(f, {template_name: '费用变化', biz_category: 'finance', biz_date_field: 'bill_date', status: true})
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.http.records['Bil_Dimension_Rule_Template']).toEqual([expect.objectContaining({template_code: 'expense.changed',
      template_name: '费用变化', template_category: 'finance', biz_category: 'finance', source_table: 'Expense', source_pk_field: 'rowid',
      builtin_flag: false, voucher_required: false, auto_voucher_write: false, stop_after_match: true, status: true})])
    expect(f.editor.isNew).toBe(false)
  })

  it.each([
    ['an unregistered category', {template_name: 'x', biz_category: 'ghost'}, '维度事件业务分类未正式登记、未启用或不唯一：ghost'],
    ['a disabled category', {template_name: 'x', biz_category: 'retired'}, '维度事件业务分类未正式登记、未启用或不唯一：retired'],
    ['a non-output business number field', {template_name: 'x', biz_category: 'finance', biz_no_field: 'secret'}, '业务编号字段不属于当前模型输出字段：secret'],
    ['enabling without a business date field', {template_name: 'x', biz_category: 'finance', status: true}, '启用事件业务日期字段不能为空'],
    ['a missing event name', {biz_category: 'finance'}, '维度事件名称不能为空'],
  ])('rejects %s without writing', async (_name, values, message) => {
    const f = await open()
    await f.editor.load()
    edit(f, values)
    await expect(f.editor.save()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('rejects a template code already used by another event', async () => {
    const f = await open({events: [{...eventRow, rowid: 'E9', event_code: 'other', template_code: 'taken'}]})
    await f.editor.load()
    edit(f, {template_code: 'taken', template_name: 'x', biz_category: 'finance'})
    await expect(f.editor.save()).rejects.toThrow('template_code 已存在：taken')
  })

  it('refuses contract changes or disabling while rules reference the event', async () => {
    const f = await open({events: [eventRow], rules: [{rowid: 'R1', event_code: 'expense.changed', status: true}]})
    await f.editor.load()
    expect(f.editor.isNew).toBe(false)
    edit(f, {biz_no_field: 'rowid'})
    await expect(f.editor.save()).rejects.toThrow('事件合同已有规则或其它来源引用，不能变更业务分类或来源字段：expense.changed')
    edit(f, {biz_no_field: 'bill_no', status: false})
    await expect(f.editor.save()).rejects.toThrow('事件存在启用规则引用，不能停用：expense.changed')
    edit(f, {status: true, template_name: '费用单变化'})
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.http.records['Bil_Dimension_Rule_Template']?.[0]).toMatchObject({template_name: '费用单变化'})
  })

  it('refuses builtin events, foreign source tables and platform event codes', async () => {
    const builtin = await open({events: [{...eventRow, builtin_flag: true}]})
    await expect(builtin.editor.load()).rejects.toThrow('内置事件合同不能由数据模型事件编辑器修改：expense.changed')
    const foreign = await open({events: [{...eventRow, source_table: 'Other'}]})
    await expect(foreign.editor.load()).rejects.toThrow('现有事件来源资源与当前正式模型不一致：Expense')
    const platform = await open({bindings: [{...bindingRow, event_code: 'enterprise.task.changed'}],
      binding: {...savedBinding, eventCode: 'enterprise.task.changed'}})
    await expect(platform.editor.load()).rejects.toThrow('事件编码属于平台注册事件，不能作为数据模型事件维护：enterprise.task.changed')
  })

  it('refuses a binding that changed since the source editor saved it', async () => {
    const f = await open({bindings: [{...bindingRow, event_code: 'expense.v2'}]})
    await expect(f.editor.load()).rejects.toThrow('维度来源绑定事件编码已变化，请刷新后重试')
  })
})
