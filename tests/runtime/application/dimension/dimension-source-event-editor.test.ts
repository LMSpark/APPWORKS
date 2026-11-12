import {afterEach, describe, expect, it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DimensionSourceSavedBinding} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {DimensionSourceEventEditor} from '@/lowcode/resources/structured-config/dimension-source/event-editor'
import {catalogField, createDimensionSourceRuntime} from './dimension.fixture'

const runtimes: PageRuntime[] = []
afterEach(() => runtimes.splice(0).forEach(runtime => runtime.dispose()))

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
  const f = await createDimensionSourceRuntime()
  runtimes.push(f.runtime)
  f.http.records['Base_DataModel_Field']!.push(catalogField('F-NO', 'MODEL', 'bill_no'), catalogField('F-DATE', 'MODEL', 'bill_date'))
  f.http.records['Bil_Dimension_Source_Binding'] = seed.bindings ?? [bindingRow]
  f.http.records['Bil_Dimension_Rule_Template'] = seed.events ?? []
  f.http.records['Bil_Dimension_Rule'] = seed.rules ?? []
  const editor = new DimensionSourceEventEditor({dataSet: f.dataSet, binding: seed.binding ?? savedBinding,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
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
    expect(f.editor.categories.rows.map(row => row['biz_category_code'])).toEqual(['finance'])
    expect(f.editor.outputFields.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'amount', 'account_set', 'total', 'commit_id', 'bill_no', 'bill_date'])
    edit(f, {template_name: '费用变化', biz_category: 'finance', biz_date_field: 'bill_date', status: true})
    await expect(f.editor.save()).resolves.toBe(true)
    expect(f.http.records['Bil_Dimension_Rule_Template']).toEqual([expect.objectContaining({template_code: 'expense.changed',
      template_name: '费用变化', template_category: 'finance', biz_category: 'finance', source_table: 'Expense', source_pk_field: 'rowid',
      builtin_flag: false, voucher_required: false, auto_voucher_write: false, stop_after_match: true, status: true})])
    expect(f.editor.isNew).toBe(false)
  })

  it.each([
    ['an unregistered category', {template_name: 'x', biz_category: 'ghost'}, 'biz_category 不在当前可选范围内或不唯一'],
    ['a disabled category', {template_name: 'x', biz_category: 'retired'}, 'biz_category 不在当前可选范围内或不唯一'],
    ['a non-output business number field', {template_name: 'x', biz_category: 'finance', biz_no_field: 'secret'}, 'biz_no_field 不在当前可选范围内或不唯一'],
    ['enabling without a business date field', {template_name: 'x', biz_category: 'finance', status: true}, '启用事件业务日期字段不能为空'],
    ['a missing event name', {biz_category: 'finance'}, 'template_name 不能为空'],
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

  it('refuses builtin events, foreign source tables, models outside the node space and platform event codes', async () => {
    const builtin = await open({events: [{...eventRow, builtin_flag: true}]})
    await expect(builtin.editor.load()).rejects.toThrow('内置事件合同不能由数据模型事件编辑器修改：expense.changed')
    const foreign = await open({events: [{...eventRow, source_table: 'Other'}]})
    await expect(foreign.editor.load()).rejects.toThrow('现有事件来源资源与当前正式模型不一致：Expense')
    const outside = await open({bindings: [{...bindingRow, source_model_id: 'FOREIGN', source_model_meta_name: 'Foreign'}],
      binding: {...savedBinding, modelId: 'FOREIGN', modelMetaName: 'Foreign'}})
    await expect(outside.editor.load()).rejects.toThrow('当前蓝图节点未绑定维度来源模型：Foreign')
    const platform = await open({bindings: [{...bindingRow, event_code: 'enterprise.task.changed'}],
      binding: {...savedBinding, eventCode: 'enterprise.task.changed'}})
    await expect(platform.editor.load()).rejects.toThrow('事件编码属于平台注册事件，不能作为数据模型事件维护：enterprise.task.changed')
  })

  it('refuses a binding that changed since the source editor saved it', async () => {
    const f = await open({bindings: [{...bindingRow, event_code: 'expense.v2'}]})
    await expect(f.editor.load()).rejects.toThrow('维度来源绑定事件编码已变化，请刷新后重试')
  })
})
