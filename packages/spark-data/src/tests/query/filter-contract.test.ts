import { describe, expect, it, vi } from 'vitest'
import { DataViewFilter } from '../../query/filter/data-view-filter'
import {getDataViewFilterFunctionDefinitions} from '../../query/filter/data-view-filter-catalog'
import { DataViewFilterLocal } from '../../query/filter/data-view-filter-local'
import type { DataViewFilterFunctionContext, DataViewFilterJsonObject } from '../../query/filter/data-view-filter-contract'

describe('filter editor context constraints', () => {
  it('retains explicit disabled definitions through repeated normalization and validation', () => {
    const context: DataViewFilterFunctionContext = {inputParams: [{label: '目标空间', value: 'dataSpaceId'}], definitions: [
      ...getDataViewFilterFunctionDefinitions({inputParams: [{label: '目标空间', value: 'dataSpaceId'}]})
        .map(item => ({...item, enabled: () => item.type === 'GetInputParam'})),
      {type: 'GetConstValue', label: '常量', fields: [{key: 'Value', label: '值', control: 'json', required: true}]},
    ]}
    const once = DataViewFilter.editorContext(context), twice = DataViewFilter.editorContext(once)
    for (const result of [once, twice]) {
      expect(getDataViewFilterFunctionDefinitions(result).map(item => item.type)).toEqual(['GetInputParam', 'GetConstValue'])
      expect(DataViewFilter.condition({field: 'value', operator: 'eq', value: {Type: 'SystemData', ParamName: 'UserID'}})
        .validate({fields: [{name: 'value', type: 'text'}], valueFunctions: result}).length).toBeGreaterThan(0)
      expect(DataViewFilter.condition({field: 'value', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'dataSpaceId'}})
        .validate({fields: [{name: 'value', type: 'text'}], valueFunctions: result})).toEqual([])
    }
    expect(once.systemParams?.filter(item => item.value === 'UserID')).toHaveLength(1)
    expect(twice.systemParams).toEqual(once.systemParams)
  })
})

describe('backend aggregate value-function editing', () => {
  it.each(['SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX'])('edits %s without inventing a referenced table', ValType => {
    const value = {Type: 'GetGroupData', ValType}
    const filter = DataViewFilter.condition({field: 'amount', operator: 'eq', value})
    expect(filter.validate({fields: [{name: 'amount', type: 'number'}], valueFunctions: {}})).toEqual([])
    expect(getDataViewFilterFunctionDefinitions({}).find(item => item.type === 'GetGroupData')?.fields.map(field => field.key)).toEqual(['ValType'])
    expect(filter.toJSON()).toEqual({field: 'amount', operator: 'eq', value})
  })
  it.each(['Sum', 'Count', 'Avg', 'Min', 'Max'])('recognizes the backend %s subtype in the same editor', Type => {
    const filter = DataViewFilter.condition({field: 'amount', operator: 'eq', value: {Type}})
    expect(filter.validate({fields: [{name: 'amount', type: 'number'}], valueFunctions: {}})).toEqual([])
  })
  it.each([
    {Type: 'GetGroupData', GroupTableName: 'Orders', GroupField: 'customer', Field: 'amount', ValType: 'SUM'},
    {Type: 'GetGroupData', ValType: 'JOINSTR'},
  ])('preserves unsupported legacy aggregate data and diagnoses it rather than inventing execution: %j', value => {
    const filter = DataViewFilter.condition({field: 'amount', operator: 'eq', value})
    expect(filter.validate({fields: [{name: 'amount', type: 'number'}], valueFunctions: {}}).length).toBeGreaterThan(0)
    expect(filter.toJSON()).toEqual({field: 'amount', operator: 'eq', value})
  })
})

const functionContext: DataViewFilterFunctionContext = {
  tables: [{ name: 'Orders', fields: [{ name: 'id' }, { name: 'amount' }, { name: 'customerId' }] }],
  relatedFields: [{ label: '订单金额', value: 'Orders.amount' }],
  apiPublicParams: [{ label: '公共参数', value: 'publicKey' }],
  inputParams: [{ label: '查询参数', value: 'query' }],
  apiAccounts: [{ label: '账号', value: 'account' }],
  flowModelOptions: [{ label: '模型', value: 'flow' }],
  flowNodeOptionsByModelId: { flow: [{ label: '节点', value: 'node' }] },
  capabilities: ['huoshan', 'api-account', 'coze-auth'],
}

const functionCases: readonly DataViewFilterJsonObject[] = [
  { Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'amount', FkFieldName: 'customerId' },
  { Type: 'GetGroupData', ValType: 'SUM' },
  { Type: 'SystemData', ParamName: 'UserID' },
  { Type: 'GetExpData', refTableName: 'Orders', Exp: 'amount + 1' },
  { Type: 'GetTableField', Field: 'Orders.amount' },
  { Type: 'GetApiPublicParam', ParamName: 'publicKey' },
  { Type: 'GetInputParam', ParamName: 'query' },
  { Type: 'GetObjectArray', arrParamName: 'query', objectConstruct: '{"id":"item.id"}' },
  { Type: 'GetUserMasterId', refType: 'dep', depLevel: '0' },
  { Type: 'GetFlowNodeStepUserId', ModelId: 'flow', NodeId: 'node', Role: 'send' },
  { Type: 'GetHuoShanData', accessKey: 'fixture-key', secretKey: 'fixture-secret' },
  { Type: 'GetApiAccount', ParamName: 'account' },
  { Type: 'CozeAuth', publicKey: 'fixture-public', privateKey: 'fixture-private', appId: 'app' },
]

describe('filter editor field loading', () => {
  it('loads only explicit function tables once and preserves the full model catalogue', async () => {
    const orders = vi.fn(async () => [{name: 'amount'}, {name: 'id'}])
    const unused = vi.fn(async () => [{name: 'secret'}])
    const context = {tables: [{name: 'Orders', loadFields: orders}, {name: 'Unused', loadFields: unused}]}
    const filter = DataViewFilter.group({logic: 'and', filters: [
      {field: 'Name', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'amount', FkFieldName: 'id'}},
      {field: 'Name', operator: 'eq', value: {Type: 'GetGroupData', GroupTableName: 'Orders', GroupField: 'id', Field: 'amount', ValType: 'SUM'}},
      {field: 'Name', operator: 'eq', value: {Type: 'GetConstValue', Value: {Type: 'GetRefData', RefTableName: 'Unused'}}},
    ]})
    const result = await filter.loadEditorContext(context)
    expect(orders).toHaveBeenCalledOnce(); expect(unused).not.toHaveBeenCalled()
    expect(result.tables?.map(table => table.name)).toEqual(['Orders', 'Unused'])
    expect(result.tables?.[0]?.fields).toEqual([{name: 'amount'}, {name: 'id'}])
    expect(context.tables[0]).not.toHaveProperty('fields')
    expect(filter.validate({fields: [{name: 'Name', type: 'text'}], valueFunctions: result}))
      .toEqual([expect.objectContaining({code: 'invalid-value-function', message: expect.stringContaining('旧引用分组')})])
    expect(filter.toJSON()).toHaveProperty('filters.1.value.GroupTableName', 'Orders')
  })

  it('keeps an explicit empty field catalogue authoritative and does not load unknown tables', async () => {
    const loadFields = vi.fn(async () => [{name: 'id'}])
    for (const name of ['Orders', 'Unknown']) {
      const filter = DataViewFilter.condition({field: 'Name', operator: 'eq', value: {Type: 'GetRefData', RefTableName: name, RefFieldName: 'id', FkFieldName: 'id'}})
      const result = await filter.loadEditorContext({tables: [{name: 'Orders', fields: [], loadFields}]})
      expect(filter.validate({fields: [{name: 'Name', type: 'text'}], valueFunctions: result})).not.toEqual([])
    }
    expect(loadFields).not.toHaveBeenCalled()
  })

  it('propagates loader errors without caching a false empty catalogue', async () => {
    const loadFields = vi.fn().mockRejectedValueOnce(new Error('fields unavailable')).mockResolvedValueOnce([{name: 'id'}])
    const context = {tables: [{name: 'Orders', loadFields}]}
    const filter = DataViewFilter.condition({field: 'Name', operator: 'eq', value: {Type: 'GetExpData', refTableName: 'Orders', Exp: 'id'}})
    await expect(filter.loadEditorContext(context)).rejects.toThrow('fields unavailable')
    expect((await filter.loadEditorContext(context)).tables?.[0]?.fields).toEqual([{name: 'id'}])
    expect(loadFields).toHaveBeenCalledTimes(2)
  })

  it('rejects ambiguous model identity and malformed field catalogues', async () => {
    const filter = DataViewFilter.condition({field: 'Name', operator: 'eq', value: {Type: 'GetExpData', refTableName: 'Orders', Exp: 'id'}})
    const loadFields = vi.fn(async () => [{name: 'id'}])
    await expect(filter.loadEditorContext({tables: [{name: 'Orders', fields: []}, {name: 'Orders', loadFields}]})).rejects.toThrow('重复名称')
    expect(loadFields).not.toHaveBeenCalled()
    for (const fields of [[{name: ''}], [{name: 'id'}, {name: 'id'}]]) {
      await expect(filter.loadEditorContext({tables: [{name: 'Orders', loadFields: async () => fields}]})).rejects.toThrow('字段目录无效')
    }
  })
})

describe('local execution of the public filter tree', () => {
  it.each([
    { operator: 'eq', row: 4, value: 4, expected: true },
    { operator: 'ne', row: 4, value: 5, expected: true },
    { operator: 'gt', row: 4, value: 3, expected: true },
    { operator: 'gte', row: 4, value: 4, expected: true },
    { operator: 'lt', row: 4, value: 5, expected: true },
    { operator: 'lte', row: 4, value: 4, expected: true },
    { operator: 'contains', row: 'abc', value: 'b', expected: true },
    { operator: 'not-contains', row: 'abc', value: 'x', expected: true },
    { operator: 'starts-with', row: 'abc', value: 'a', expected: true },
    { operator: 'not-starts-with', row: 'abc', value: 'b', expected: true },
    { operator: 'ends-with', row: 'abc', value: 'c', expected: true },
    { operator: 'not-ends-with', row: 'abc', value: 'b', expected: true },
    { operator: 'in', row: 4, value: [4, 5], expected: true },
    { operator: 'not-in', row: 4, value: [5], expected: true },
    { operator: 'is-null', row: null, expected: true },
    { operator: 'is-not-null', row: '', expected: true },
    { operator: 'is-empty', row: '', expected: true },
    { operator: 'is-not-empty', row: ' ', expected: true },
    { operator: 'is-null', row: '', expected: false },
    { operator: 'is-empty', row: null, expected: false },
    { operator: 'is-empty', row: ' ', expected: false },
    { operator: 'is-not-empty', row: null, expected: false },
    { operator: 'eq', row: false, value: 0, expected: false },
    { operator: 'in', row: [1, 2], value: [2, 3], expected: true },
    { operator: 'not-in', row: [1, 2], value: [3], expected: true },
  ])('evaluates $operator with explicit values', input => {
    const parsed = DataViewFilter.parse({ field: 'value', operator: input.operator,
      ...('value' in input ? { value: input.value } : {}) })
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(new DataViewFilterLocal(parsed.value).matches({ value: input.row })).toBe(input.expected)
  })

  it('preserves nested OR/AND, empty groups and current-row field functions', () => {
    const filter = DataViewFilter.group({ logic: 'or', filters: [
      { logic: 'and', filters: [
        { field: 'amount', operator: 'gte', value: { Type: 'GetTableField', Field: 'minimum' } },
        { field: 'active', operator: 'eq', value: { Type: 'GetConstValue', Value: false } },
      ] },
      { field: 'amount', operator: 'eq', value: 0 },
    ] })
    const owner = new DataViewFilterLocal(filter)
    owner.validateFields(new Set(['amount', 'minimum', 'active']))
    const row = Object.freeze({ amount: 4, minimum: 3, active: false })
    expect(owner.matches(row)).toBe(true)
    expect(owner.matches({ amount: 2, minimum: 3, active: false })).toBe(false)
    expect(row).toEqual({ amount: 4, minimum: 3, active: false })
    expect(new DataViewFilterLocal(DataViewFilter.group({ logic: 'and', filters: [] })).matches({})).toBe(true)
    expect(new DataViewFilterLocal(DataViewFilter.group({ logic: 'or', filters: [] })).matches({})).toBe(false)
  })

  it.each(functionCases.filter(value => value['Type'] !== 'GetTableField'))
    ('rejects server function $Type before short-circuit evaluation', value => {
      const filter = DataViewFilter.group({ logic: 'or', filters: [
        { logic: 'and', filters: [] },
        { field: 'result', operator: 'eq', value },
      ] })
      expect(() => new DataViewFilterLocal(filter)).toThrow('DATA_VIEW_FILTER_LOCAL_FUNCTION')
      expect(filter.toJSON()).toHaveProperty('filters.1.value', value)
    })

  it('checks field references without guessing a qualified-table alias', () => {
    const owner = new DataViewFilterLocal(DataViewFilter.condition({ field: 'amount', operator: 'gte',
      value: { Type: 'GetTableField', Field: 'Orders.minimum' } }))
    expect(() => owner.validateFields(new Set(['amount', 'minimum']))).toThrow('Orders.minimum')
    expect(() => owner.matches({ amount: 4, minimum: 3 })).toThrow('Orders.minimum')
    expect(() => new DataViewFilterLocal(DataViewFilter.condition({ field: 'missing', operator: 'eq', value: 0 }))
      .validateFields(new Set(['amount']))).toThrow('missing')
  })
})

describe('SPARK public filter value object', () => {
  it.each(['', '  ', null, [], 0, false].map(value => ({ value })))('preserves explicit value $value', ({ value }) => {
    const result = DataViewFilter.parse({ field: 'amount', operator: 'eq', value })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected valid filter')
    expect(result.value.toJSON()).toEqual({ field: 'amount', operator: 'eq', value })
  })

  it.each(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is-null', 'is-not-null', 'contains', 'not-contains', 'starts-with', 'not-starts-with', 'ends-with', 'not-ends-with', 'in', 'not-in', 'is-empty', 'is-not-empty'])('accepts formal operator %s', (operator) => {
    expect(DataViewFilter.parse({ field: 'field', operator, value: 0 }).ok).toBe(true)
  })

  it.each([
    { field: 'amount', operator: 'eq' },
    { field: 'amount', operator: 'eq', value: undefined },
    { field: 'amount', operator: 'eq', value: { Type: 'GetConstValue' } },
    { field: 'amount', operator: 'eq', value: { Type: '' } },
    { field: 'amount', op: '==' , value: 1 },
    { Type: 'cond', Field: 'amount', Operator: 'equal' },
    { logic: 'or', filters: [{ field: 'amount', operator: 'eq', value: 1 }, false] },
    { field: 'amount', operator: 'eq', value: { nested: undefined } },
  ])('rejects damaged input without removing constraints: %j', (input) => {
    const result = DataViewFilter.parse(input)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected diagnostics')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result).not.toHaveProperty('value')
  })

  it('preserves extension function payloads and nested empty groups', () => {
    const input = { logic: 'or', filters: [
      { logic: 'and', filters: [] },
      { field: 'account', operator: 'eq', value: { Type: 'CustomFunction', Args: { values: [null, false, ''] } } },
    ] }
    const result = DataViewFilter.parse(JSON.stringify(input))
    if (!result.ok) throw new Error('expected valid filter')
    expect(result.value.toJSON()).toEqual(input)
    expect(JSON.parse(result.value.serialize())).toEqual(input)
  })

  it.each(['GetConstValue', 'GetRefData', 'GetGroupData', 'SystemData', 'GetExpData', 'GetTableField', 'GetApiPublicParam', 'GetInputParam', 'GetObjectArray', 'GetUserMasterId', 'GetFlowNodeStepUserId', 'GetHuoShanData', 'GetApiAccount', 'CozeAuth'])('preserves %s and its complete JSON payload', (Type) => {
    const value = { Type, Value: null, Exp: 'a + b', Field: 'Model.Name', Params: { key: false, values: [] } }
    const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value })
    expect(filter.toJSON()).toEqual({ field: 'result', operator: 'eq', value })
    expect(JSON.parse(filter.serialize())).toEqual(filter.toJSON())
  })

  it('constructs a group without omitting members or unwrapping a singleton', () => {
    const tree = { logic: 'and' as const, filters: [{ field: 'status', operator: 'eq' as const, value: 'draft' }] }
    expect(DataViewFilter.group(tree).toJSON()).toEqual(tree)
    expect(DataViewFilter.group({ logic: 'or', filters: [] }).toJSON()).toEqual({ logic: 'or', filters: [] })
  })

  it('takes an immutable snapshot without freezing the caller', () => {
    const input = { field: 'status', operator: 'in', value: ['draft'] }
    const result = DataViewFilter.parse(input)
    if (!result.ok) throw new Error('expected valid filter')
    input.value.push('done')
    const tree = result.value.toJSON()
    expect(tree).toEqual({ field: 'status', operator: 'in', value: ['draft'] })
    expect(Object.isFrozen(tree)).toBe(true)
    if (!('field' in tree)) throw new Error('expected condition')
    expect(Object.isFrozen(tree.value)).toBe(true)
  })

  it('reports the damaged child path and invalid JSON', () => {
    const result = DataViewFilter.parse({ logic: 'and', filters: [{ field: '', operator: 'eq', value: 1 }] })
    if (result.ok) throw new Error('expected diagnostics')
    expect(result.issues[0]?.path).toBe('$.filters[0].field')
    expect(DataViewFilter.parse('{').ok).toBe(false)
    expect(DataViewFilter.parse(null).ok).toBe(false)
  })

  it('rejects cyclic input with diagnostics', () => {
    const input: Record<string, unknown> = { logic: 'and' }
    input['filters'] = [input]
    expect(DataViewFilter.parse(input).ok).toBe(false)
  })

  it('rejects array holes instead of turning missing values into JSON null', () => {
    const value: unknown[] = []
    value.length = 2
    expect(DataViewFilter.parse({ field: 'status', operator: 'in', value }).ok).toBe(false)
  })

  it('validates field operators without rewriting the original tree', () => {
    const filter = DataViewFilter.condition({ field: 'amount', operator: 'contains', value: '' })
    expect(filter.validate({ fields: [{ name: 'amount', type: 'number' }] })).toEqual([
      expect.objectContaining({ code: 'operator-not-allowed', path: '$.operator' }),
    ])
    expect(filter.toJSON()).toEqual({ field: 'amount', operator: 'contains', value: '' })
    expect(filter.validate({ fields: [] })[0]?.code).toBe('unknown-field')
  })

  it('preserves explicit values during contextual validation', () => {
    for (const value of ['', null, [], 0, false]) {
      expect(DataViewFilter.condition({ field: 'status', operator: 'eq', value })
        .validate({ fields: [{ name: 'status', type: 'text' }] })).toEqual([])
    }
  })

  it('honors explicit operator restrictions and reports nested limits', () => {
    const filter = DataViewFilter.group({ logic: 'and', filters: [
      { logic: 'or', filters: [{ field: 'active', operator: 'eq', value: false }] },
      { field: 'active', operator: 'ne', value: true },
    ] })
    const issues = filter.validate({ fields: [{ name: 'active', type: 'boolean', operators: ['eq'] }], maxDepth: 0, maxRules: 1 })
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'max-depth', path: '$.filters[0]' }),
      expect.objectContaining({ code: 'max-rules', path: '$.filters[1]' }),
      expect.objectContaining({ code: 'operator-not-allowed', path: '$.filters[1].operator' }),
    ]))
    expect(DataViewFilter.condition({ field: 'active', operator: 'eq', value: false })
      .validate({ fields: [{ name: 'active', type: 'boolean', operators: [] }] })[0]?.code).toBe('operator-not-allowed')
  })

  it.each(functionCases)('validates complete function $Type against its editing context', (value) => {
    const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value })
    expect(filter.validate({ fields: [{ name: 'result', type: 'text' }], valueFunctions: functionContext })).toEqual([])
    expect(filter.toJSON()).toEqual({ field: 'result', operator: 'eq', value })
  })

  it.each(functionCases)('reports missing parameters for $Type without rewriting it', (value) => {
    const Type = value['Type']
    if (typeof Type !== 'string') throw new Error('expected function type')
    const draft = { Type }
    const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value: draft })
    expect(filter.validate({ fields: [{ name: 'result', type: 'text' }], valueFunctions: functionContext }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'value-required' })]))
    expect(filter.toJSON()).toEqual({ field: 'result', operator: 'eq', value: draft })
  })

  it.each(functionCases.flatMap(value => Object.keys(value).filter(key => key !== 'Type').map(key => ({ value, key }))))
    ('requires each parameter $key of $value.Type', ({ value, key }) => {
      const draft = { ...value }
      delete draft[key]
      const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value: draft })
      expect(filter.validate({ fields: [{ name: 'result', type: 'text' }], valueFunctions: functionContext }))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'value-required', path: `$.value.${key}` })]))
    })

  it('keeps extension transport separate from editing registration', () => {
    const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value: { Type: 'Extension', Arg: '' } })
    const fields = [{ name: 'result', type: 'text' as const }]
    expect(filter.validate({ fields })).toEqual([])
    expect(filter.validate({ fields, valueFunctions: {} })[0]?.code).toBe('invalid-value-function')
    expect(filter.validate({ fields, valueFunctions: {
      definitions: [{ type: 'Extension', label: '扩展', fields: [{ key: 'Arg', label: '参数', required: true }] }],
    } })[0]?.path).toBe('$.value.Arg')
  })

  it('checks selected fields, capability availability and model-dependent flow nodes', () => {
    const fields = [{ name: 'result', type: 'text' as const }]
    const validate = (value: DataViewFilterJsonObject, valueFunctions: DataViewFilterFunctionContext = functionContext) =>
      DataViewFilter.condition({ field: 'result', operator: 'eq', value }).validate({ fields, valueFunctions })
    expect(validate({ Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'deleted', FkFieldName: 'customerId' })[0]?.path)
      .toBe('$.value.RefFieldName')
    expect(validate({ Type: 'GetFlowNodeStepUserId', ModelId: 'flow', NodeId: 'other-node', Role: 'send' })[0]?.path)
      .toBe('$.value.NodeId')
    expect(validate({ Type: 'CozeAuth', publicKey: 'p', privateKey: 's', appId: 'a' }, {})[0]?.code)
      .toBe('invalid-value-function')
    expect(validate({ Type: 'GetUserMasterId', refType: 'dep', depLevel: '0', getChildDep: false })).toEqual([])
    const legacy = {Type: 'GetUserMasterId', refType: 'role', roleClassId: 'legacy'}
    expect(validate(legacy)[0]).toMatchObject({path: '$.value', code: 'invalid-value-function',
      message: expect.stringContaining('已停用的角色分类分支')})
    expect(DataViewFilter.condition({field: 'result', operator: 'eq', value: legacy}).toJSON().value).toEqual(legacy)
  })

  it('does not substitute defaults for explicitly empty choices or reset disabled selections', () => {
    const filter = DataViewFilter.condition({ field: 'result', operator: 'eq', value: { Type: 'SystemData', ParamName: 'UserID' } })
    const fields = [{ name: 'result', type: 'text' as const }]
    expect(filter.validate({ fields, valueFunctions: { systemParams: [] } })[0]?.path).toBe('$.value.ParamName')
    expect(filter.validate({ fields, valueFunctions: { systemParams: [{ label: '用户', value: 'UserID', disabled: true }] } })[0]?.path)
      .toBe('$.value.ParamName')
    expect(filter.toJSON()).toEqual({ field: 'result', operator: 'eq', value: { Type: 'SystemData', ParamName: 'UserID' } })
  })

  it.each(['', '  ', null, [], 0, false].map(Value => ({ Value })))('preserves explicit GetConstValue $Value even in an editing context', ({ Value }) => {
    expect(DataViewFilter.condition({ field: 'result', operator: 'eq', value: { Type: 'GetConstValue', Value } })
      .validate({ fields: [{ name: 'result', type: 'text' }], valueFunctions: {} })).toEqual([])
  })

  it('uses registered extension validation and multiple choices without hiding diagnostics', () => {
    const context: DataViewFilterFunctionContext = { definitions: [{
      type: 'Extension', label: '扩展',
      fields: [{ key: 'Keys', label: '键', multiple: true, required: true, options: [{ label: '零', value: 0 }, { label: '否', value: false }] }],
      validate: value => value['Status'] === 'blocked' ? '扩展不可用' : null,
    }] }
    const fields = [{ name: 'result', type: 'text' as const }]
    const valid = DataViewFilter.condition({ field: 'result', operator: 'eq', value: { Type: 'Extension', Keys: [0, false] } })
    expect(valid.validate({ fields, valueFunctions: context })).toEqual([])
    const invalid = DataViewFilter.condition({ field: 'result', operator: 'eq', value: { Type: 'Extension', Keys: [], Status: 'blocked' } })
    expect(invalid.validate({ fields, valueFunctions: context })).toEqual([
      expect.objectContaining({ code: 'invalid-value-function', path: '$.value', message: '扩展不可用' }),
      expect.objectContaining({ code: 'value-required', path: '$.value.Keys' }),
    ])
  })
})
