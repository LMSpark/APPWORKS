import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DimensionSourceSavedBinding} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {DimensionSourceCommitPolicyEditor} from '@/lowcode/resources/structured-config/dimension-source/commit-policy-editor'
import {catalogField, createDimensionSourceRuntime} from './dimension.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]

const runtimes: PageRuntime[] = []
afterEach(() => runtimes.splice(0).forEach(runtime => runtime.dispose()))

function formal(id: string, metaName: string, primaryKey: string, columns: Record<string, string>, sourceType = '数据库表'): FormalModel {
  return {id, name: metaName, metaName, sourceType, sourceId: 'DB', sourceName: metaName, primaryKey, businessMain: false, raw: {},
    fields: Object.entries(columns).map(([name, type], order) => ({id: `${id}-${name}`, modelId: id, name, canonicalName: name,
      primaryKey: name === primaryKey, description: name, type, output: true, computed: false, order, orderType: '', raw: {}}))}
}
const columns = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, 'string']))
const PROTOCOL_MODELS: readonly FormalModel[] = [
  formal('MODEL', 'Expense', 'rowid', {rowid: 'string', commit_ref: 'nvarchar(64)', amount: 'decimal', payload: 'json'}),
  formal('ROOT', 'CommitRoot', 'id', columns(['id', 'initial_commit_id'])),
  formal('INTENT', 'CommitIntent', 'id', columns(['id', 'root_id', 'predecessor_id', 'binding_id', 'binding_version', 'policy_id', 'policy_version',
    'expected_source_commit_id', 'request_digest', 'facts_digest', 'ordinal'])),
  formal('SUCC', 'CommitSuccessor', 'id', columns(['id', 'root_id', 'next_commit_id'])),
  formal('FACT', 'CommitFact', 'id', columns(['id', 'commit_id', 'field_id', 'value_type', 'value_state', 'value_text', 'value_number',
    'value_boolean', 'value_datetime'])),
  formal('HEAD', 'CommitHead', 'root_id', columns(['root_id', 'head_commit_id', 'binding_id', 'binding_version', 'policy_id', 'policy_version',
    'chain_complete', 'commit_count', 'successor_count', 'source_established', 'source_state']), '数据库视图'),
]
const savedBinding: DimensionSourceSavedBinding = {id: 'B1', sourceKind: 'data-model', eventCode: 'expense.changed', bindingVersion: 2,
  projectionRole: 'business-result', modelId: 'MODEL', modelMetaName: 'Expense'}
const bindingRow = {id: 'B1', binding_code: 'expense-source', source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
  source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: '', event_code: 'expense.changed', payload_version: 1,
  binding_version: 2, status: 0, projection_role: 'business-result', account_field_id: '', account_field_name: ''}

async function open(policies: Array<Record<string, unknown>> = [], binding: Record<string, unknown> = bindingRow) {
  const f = await createDimensionSourceRuntime()
  runtimes.push(f.runtime)
  f.http.records['Base_DataModel']!.push(...PROTOCOL_MODELS.slice(1).map(model => ({rowid: model.id, dataSetId: 'SPACE-A', Name: model.metaName,
    MetaName: model.metaName, Type: model.sourceType})))
  f.http.records['Base_DataModel_Field']!.push(catalogField('F-REF', 'MODEL', 'commit_ref', {FieldType: 'nvarchar(64)'}),
    catalogField('F-PAYLOAD', 'MODEL', 'payload', {FieldType: 'json'}))
  f.http.records['Bil_Dimension_Source_Binding'] = [binding]
  f.http.records['Bil_Dimension_Source_Commit_Policy'] = policies
  const readModels = vi.fn<DataSpaceDesignApi['readModels']>(async () => [...PROTOCOL_MODELS])
  const editor = new DimensionSourceCommitPolicyEditor({dataSet: f.dataSet, readModels, binding: savedBinding,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
  return {...f, editor}
}

function fillDraft(f: Awaited<ReturnType<typeof open>>, values: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries({root_meta_name: 'CommitRoot', intent_meta_name: 'CommitIntent', successor_meta_name: 'CommitSuccessor',
    fact_meta_name: 'CommitFact', head_meta_name: 'CommitHead', source_commit_field: 'commit_ref', ...values})) {
    f.editor.draft.updateEditingValue(f.editor.draftId!, key, value)
  }
}
async function addFact(f: Awaited<ReturnType<typeof open>>, values: Record<string, unknown>) {
  await f.editor.addFact()
  const id = f.editor.factIds().at(-1)!
  for (const [key, value] of Object.entries(values)) f.editor.facts.updateEditingValue(id, key, value)
  return id
}
type Arrange = (f: Awaited<ReturnType<typeof open>>) => Promise<unknown>
const amountFact: Arrange = f => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'number'})

describe('维度来源提交协议草稿编辑 owner', () => {
  it('prefills the next version from the bound source model and offers its output non-computed fields', async () => {
    const f = await open([{id: 'P-OLD', binding_id: 'B1', status: 0, protocol_version: 1, binding_version: 2, policy_version: 3, field_count: 1}])
    await f.editor.load()
    expect(f.editor.sourceSelectable).toBe(false)
    expect(f.editor.policyIds()).toEqual(['P-OLD'])
    const draft = f.editor.draft.getEditingRow(f.editor.draftId!)
    expect(Number(draft?.['policy_version'])).toBe(4)
    expect(draft).toMatchObject({source_meta_name: 'Expense', source_key_field: 'rowid', source_commit_field: ''})
    expect(f.editor.sourceFields.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'amount', 'account_set', 'commit_id', 'commit_ref', 'payload'])
    expect(f.editor.models.rows.map(row => row['Name'])).toEqual(['Expense', 'ExpenseLine', 'CommitRoot', 'CommitIntent', 'CommitSuccessor',
      'CommitFact', 'CommitHead'])
  })

  it('saves an immutable draft with a digest identity and facts in one DataSet save, then verifies the readback', async () => {
    const f = await open()
    await f.editor.load()
    fillDraft(f)
    await addFact(f, {field_id: 'amount', source_field: 'amount', value_type: 'number', required_flag: true})
    await addFact(f, {field_id: 'customer', source_field: 'payload', source_path: '["customer","id"]', value_type: 'string'})
    const requests = vi.fn(async () => undefined)
    f.http.beforeSave = requests
    await f.editor.saveDraft()
    expect(requests).toHaveBeenCalledTimes(1)
    const [policy] = f.http.records['Bil_Dimension_Source_Commit_Policy'] ?? []
    expect(policy).toMatchObject({binding_id: 'B1', source_meta_name: 'Expense', head_meta_name: 'CommitHead', source_key_field: 'rowid',
      source_commit_field: 'commit_ref'})
    expect([Number(policy?.['policy_version']), Number(policy?.['field_count'])]).toEqual([1, 2])
    expect(String(policy?.['id'])).toMatch(/^[0-9a-f]{32}$/)
    expect(f.http.records['Bil_Dimension_Source_Commit_Field']).toEqual(expect.arrayContaining([
      expect.objectContaining({policy_id: policy?.['id'], field_id: 'amount', source_path: '', value_type: 'number'}),
      expect.objectContaining({policy_id: policy?.['id'], field_id: 'customer', source_path: '["customer","id"]'}),
    ]))
    expect(f.editor.policyIds()).toEqual([policy?.['id']])
    expect(f.editor.factIds()).toEqual([])
    expect(Number(f.editor.draft.getEditingRow(f.editor.draftId!)?.['policy_version'])).toBe(2)
  })

  it.each<[string, Arrange, Record<string, unknown>, string]>([
    ['no facts', async () => undefined, {}, '来源提交字段集合不能为空'],
    ['a stale policy version', amountFact, {policy_version: 0}, '来源提交配置版本必须是正整数'],
    ['the commit field as a fact', f => addFact(f, {field_id: 'a', source_field: 'commit_ref', value_type: 'string'}), {}, '来源提交引用字段不能配置为事实：commit_ref'],
    ['a type mismatch', f => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'boolean'}), {}, '来源字段 amount 的正式类型与配置不一致：decimal'],
    ['a path on a non-JSON field', f => addFact(f, {field_id: 'a', source_field: 'amount', source_path: '["x"]', value_type: 'number'}),
      {}, '来源字段 amount 路径源必须是正式 JSON 字段：decimal'],
    ['a prototype path segment', f => addFact(f, {field_id: 'a', source_field: 'payload', source_path: '["__proto__"]', value_type: 'string'}),
      {}, '来源字段路径包含不允许的属性名'],
    ['duplicate protocol models', amountFact, {head_meta_name: 'CommitFact'}, '来源与五个协议 metaName 必须互不重复'],
    ['a table in the head role', amountFact, {head_meta_name: 'CommitRoot', root_meta_name: 'CommitHead'}, '来源提交需由五个普通表和一个数据库视图组成，且角色类型必须匹配'],
    ['a source field outside the model output', f => addFact(f, {field_id: 'a', source_field: 'secret', value_type: 'string'}),
      {}, '正式模型 Expense 的输出字段必须唯一：secret'],
    ['an unregistered protocol model', amountFact, {head_meta_name: 'Ghost'}, '正式蓝图数据空间缺少来源提交模型：Ghost'],
  ])('rejects %s without writing', async (_name, arrange, draft, message) => {
    const f = await open()
    await f.editor.load()
    fillDraft(f, draft)
    await arrange(f)
    await expect(f.editor.saveDraft()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('requires a version above the latest formal version', async () => {
    const f = await open([{id: 'P-OLD', binding_id: 'B1', status: 0, protocol_version: 1, binding_version: 2, policy_version: 3, field_count: 1}])
    await f.editor.load()
    fillDraft(f, {policy_version: 3})
    await amountFact(f)
    await expect(f.editor.saveDraft()).rejects.toThrow('来源提交配置版本必须大于当前正式版本 3')
  })

  it('discards the draft and its facts without writing', async () => {
    const f = await open()
    await f.editor.load()
    await amountFact(f)
    f.editor.discard()
    expect(f.editor.draftId).toBeUndefined()
    expect(f.editor.factIds()).toEqual([])
    expect(f.http.saves).toEqual([])
  })

  it('refuses non business-result bindings and binding version drift', async () => {
    const voucher = await open([], {...bindingRow, projection_role: 'source-voucher'})
    await expect(voucher.editor.load()).rejects.toThrow('来源提交只允许 business-result 来源绑定')
    const drift = await open([], {...bindingRow, binding_version: 3})
    await expect(drift.editor.load()).rejects.toThrow('来源提交请求绑定版本与正式绑定不一致')
  })

  it('shows a saved version only when its facts match field_count', async () => {
    const f = await open([{id: 'P1', binding_id: 'B1', status: 0, protocol_version: 1, binding_version: 2, policy_version: 1, field_count: 2}])
    f.http.records['Bil_Dimension_Source_Commit_Field'] = [{id: 'F1', policy_id: 'P1', field_id: 'amount', source_field: 'amount',
      source_path: '', value_type: 'number', required_flag: true}]
    await f.editor.load()
    await expect(f.editor.selectVersion('P1')).rejects.toThrow('来源提交字段集合与 field_count 不一致：1 / 2')
  })
})
