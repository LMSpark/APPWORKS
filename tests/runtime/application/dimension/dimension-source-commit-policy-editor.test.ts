import {afterEach, describe, expect, it, vi} from 'vitest'
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {DimensionSourceSavedBinding} from '@/lowcode/resources/structured-config/dimension-source/binding-editor'
import {DimensionSourceCommitPolicyEditor} from '@/lowcode/resources/structured-config/dimension-source/commit-policy-editor'
import {createDimensionRuntime} from './dimension.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModels']>>[number]

const runtimes: PageRuntime[] = [], editors: DimensionSourceCommitPolicyEditor[] = []
afterEach(() => {
  editors.splice(0).forEach(editor => editor.dispose())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
})

function formal(id: string, metaName: string, primaryKey: string, columns: Record<string, string>, sourceType = '数据库表'): FormalModel {
  return {id, name: metaName, metaName, sourceType, sourceId: 'DB', sourceName: metaName, primaryKey, businessMain: false, raw: {},
    fields: Object.entries(columns).map(([name, type], order) => ({id: `${id}-${name}`, modelId: id, name, canonicalName: name,
      primaryKey: name === primaryKey, description: name, type, output: true, computed: false, order, orderType: '', raw: {}}))}
}
const columns = (names: readonly string[]) => Object.fromEntries(names.map(name => [name, 'string']))
function protocolModels(): FormalModel[] {
  return [
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
}
const savedBinding: DimensionSourceSavedBinding = {id: 'B1', sourceKind: 'data-model', eventCode: 'expense.changed', bindingVersion: 2,
  projectionRole: 'business-result', modelId: 'MODEL', modelMetaName: 'Expense'}
const bindingRow = {id: 'B1', binding_code: 'expense-source', source_application_id: 'APP', source_node_id: 'NODE', source_kind: 'data-model',
  source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: '', event_code: 'expense.changed', payload_version: 1,
  binding_version: 2, status: 0, projection_role: 'business-result', account_field_id: '', account_field_name: ''}

async function open(policies: Array<Record<string, unknown>> = [], binding: Record<string, unknown> = bindingRow) {
  const f = await createDimensionRuntime()
  runtimes.push(f.runtime)
  f.http.records['Bil_Dimension_Source_Binding'] = [binding]
  f.http.records['Bil_Dimension_Source_Commit_Policy'] = policies
  f.http.records['Bil_Dimension_Source_Commit_Field'] = []
  const models = {list: protocolModels()}
  const readModels = vi.fn<DataSpaceDesignApi['readModels']>(async () => models.list)
  const editor = new DimensionSourceCommitPolicyEditor({dataSet: f.dataSet, readModels, binding: savedBinding,
    target: {applicationId: 'APP', nodeId: 'NODE', dataSpaceId: 'SPACE-A', assertCurrent: () => undefined}})
  editors.push(editor)
  return {...f, editor, models}
}

function fillDraft(f: Awaited<ReturnType<typeof open>>, values: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries({root_meta_name: 'CommitRoot', intent_meta_name: 'CommitIntent', successor_meta_name: 'CommitSuccessor',
    fact_meta_name: 'CommitFact', head_meta_name: 'CommitHead', source_commit_field: 'commit_ref', ...values})) {
    f.editor.draft.updateEditingValue(f.editor.draftId, key, value)
  }
}
function addFact(f: Awaited<ReturnType<typeof open>>, values: Record<string, unknown>) {
  f.editor.addFact()
  const id = f.editor.factIds().at(-1)!
  for (const [key, value] of Object.entries(values)) f.editor.facts.updateEditingValue(id, key, value)
  return id
}

describe('维度来源提交协议草稿编辑 owner', () => {
  it('prefills the next version from the bound source model', async () => {
    const f = await open([{id: 'P-OLD', binding_id: 'B1', status: 0, protocol_version: 1, binding_version: 2, policy_version: 3, field_count: 1}])
    await f.editor.load()
    expect(f.editor.policyIds()).toEqual(['P-OLD'])
    expect(f.editor.draft.getEditingRow(f.editor.draftId)).toMatchObject({policy_version: '4', source_meta_name: 'Expense', source_key_field: 'rowid'})
    expect(f.editor.sourceFieldOptions.rows.map(row => row['canonicalName'])).toEqual(['rowid', 'commit_ref', 'amount', 'payload'])
  })

  it('saves an immutable draft with a digest identity and facts in one DataSet save, then verifies the readback', async () => {
    const f = await open()
    await f.editor.load()
    fillDraft(f)
    addFact(f, {field_id: 'amount', source_field: 'amount', value_type: 'number', required_flag: 1})
    addFact(f, {field_id: 'customer', source_field: 'payload', source_path: '["customer","id"]', value_type: 'string'})
    const requests = vi.fn(async () => undefined)
    f.http.beforeSave = requests
    await f.editor.saveDraft()
    expect(requests).toHaveBeenCalledTimes(1)
    const [policy] = f.http.records['Bil_Dimension_Source_Commit_Policy'] ?? []
    expect(policy).toMatchObject({binding_id: 'B1', status: '0', protocol_version: '1', binding_version: '2', policy_version: '1', field_count: '2',
      source_meta_name: 'Expense', head_meta_name: 'CommitHead', source_key_field: 'rowid', source_commit_field: 'commit_ref'})
    expect(String(policy?.['id'])).toMatch(/^[0-9a-f]{32}$/)
    expect(f.http.records['Bil_Dimension_Source_Commit_Field']).toEqual(expect.arrayContaining([
      expect.objectContaining({policy_id: policy?.['id'], field_id: 'amount', source_path: '', value_type: 'number', required_flag: true}),
      expect.objectContaining({policy_id: policy?.['id'], field_id: 'customer', source_path: '["customer","id"]', required_flag: false}),
    ]))
    expect(f.editor.policyIds()).toEqual([policy?.['id']])
    expect(f.editor.factIds()).toEqual([])
    expect(f.editor.draft.getEditingRow(f.editor.draftId)).toMatchObject({policy_version: '2'})
  })

  it.each([
    ['no facts', () => undefined, {}, '来源提交字段集合不能为空'],
    ['a stale policy version', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'number'}),
      {policy_version: 0}, '来源提交配置版本必须是正整数'],
    ['the commit field as a fact', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'commit_ref', value_type: 'string'}),
      {}, '来源提交引用字段不能配置为事实：commit_ref'],
    ['a type mismatch', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'boolean'}),
      {}, '来源字段 amount 的正式类型与配置不一致：decimal'],
    ['a path on a non-JSON field', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'amount', source_path: '["x"]', value_type: 'number'}),
      {}, '来源字段 amount 路径源必须是正式 JSON 字段：decimal'],
    ['a prototype path segment', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'payload', source_path: '["__proto__"]', value_type: 'string'}),
      {}, '来源字段路径包含不允许的属性名'],
    ['duplicate protocol models', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'number'}),
      {head_meta_name: 'CommitFact'}, '来源与五个协议 metaName 必须互不重复'],
    ['a table in the head role', (f: Awaited<ReturnType<typeof open>>) => addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'number'}),
      {head_meta_name: 'CommitRoot', root_meta_name: 'CommitHead'}, '来源提交需由五个普通表和一个数据库视图组成，且角色类型必须匹配'],
  ])('rejects %s without writing', async (_name, arrange, draft, message) => {
    const f = await open()
    await f.editor.load()
    fillDraft(f, draft)
    arrange(f)
    await expect(f.editor.saveDraft()).rejects.toThrow(message)
    expect(f.http.saves).toEqual([])
  })

  it('requires a version above the latest formal version', async () => {
    const f = await open([{id: 'P-OLD', binding_id: 'B1', status: 0, protocol_version: 1, binding_version: 2, policy_version: 3, field_count: 1}])
    await f.editor.load()
    fillDraft(f, {policy_version: 3})
    addFact(f, {field_id: 'a', source_field: 'amount', value_type: 'number'})
    await expect(f.editor.saveDraft()).rejects.toThrow('来源提交配置版本必须大于当前正式版本 3')
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
