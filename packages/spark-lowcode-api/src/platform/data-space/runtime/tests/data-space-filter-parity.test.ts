import { describe, expect, it } from 'vitest'
import { DataViewFilter } from '@spark-appworks/spark-data'
import { DataViewFilterCodec } from '@spark-appworks/spark-data'

const operatorPairs = [
  ['eq', 'equal'], ['ne', 'notequal'], ['gt', 'greaterthan'],
  ['gte', 'greaterthanorequal'], ['lt', 'lessthan'], ['lte', 'lessthanorequal'],
  ['is-null', 'isnull'], ['is-not-null', 'isnotnull'], ['contains', 'contains'],
  ['not-contains', 'nolike'], ['starts-with', 'startswith'], ['not-starts-with', 'nostartswith'],
  ['ends-with', 'endswith'], ['not-ends-with', 'notendswith'], ['in', 'in'],
  ['not-in', 'notin'], ['is-empty', 'isempty'], ['is-not-empty', 'isnotempty'],
] as const

const functionCases = [
  { Type: 'GetRefData', RefTableName: 'Orders', RefFieldName: 'amount', FkFieldName: 'customerId' },
  { Type: 'GetGroupData', GroupTableName: 'Orders', GroupField: 'customerId', Field: 'amount', ValType: 'SUM' },
  { Type: 'SystemData', ParamName: 'UserID' },
  { Type: 'GetExpData', refTableName: 'Orders', Exp: 'amount + 1' },
  { Type: 'GetTableField', Field: 'Orders.amount' },
  { Type: 'GetApiPublicParam', ParamName: 'publicKey' },
  { Type: 'GetInputParam', ParamName: 'query' },
  { Type: 'GetObjectArray', arrParamName: 'query', objectConstruct: '{"id":"item.id"}' },
  { Type: 'GetUserMasterId', refType: 'role', roleClassId: 'roleClass' },
  { Type: 'GetFlowNodeStepUserId', ModelId: 'flow', NodeId: 'node', Role: 'send' },
  { Type: 'GetHuoShanData', accessKey: 'fixture-key', secretKey: 'fixture-secret' },
  { Type: 'GetApiAccount', ParamName: 'account' },
  { Type: 'CozeAuth', publicKey: 'fixture-public', privateKey: 'fixture-private', appId: 'app' },
] as const

describe('SPARK filter request parity', () => {
  it.each(operatorPairs)('%s maps to %s', (operator, wireOperator) => {
    const filter = DataViewFilter.condition({ field: 'Name', operator, value: 'sample' })
    const unary = ['is-null', 'is-not-null', 'is-empty', 'is-not-empty'].includes(operator)
    expect(DataViewFilterCodec.encode(filter)).toEqual({
      Type: 'cond', Field: 'Name', Operator: wireOperator, Value: null,
      ValueFun: { Type: 'GetConstValue', Value: unary ? null : 'sample' },
    })
  })

  it.each(['', '  ', null, [], 0, false].map(value => ({ value })))('preserves explicit constant $value', ({ value }) => {
    expect(DataViewFilterCodec.encode(DataViewFilter.condition({ field: 'Name', operator: 'eq', value })))
      .toHaveProperty('ValueFun', { Type: 'GetConstValue', Value: value })
  })

  it('preserves extension functions and all nested parameters', () => {
    const value = { Type: 'CustomFunction', Config: { Fields: ['A', 'B'], Enabled: false } }
    expect(DataViewFilterCodec.encode(DataViewFilter.condition({ field: 'Name', operator: 'eq', value })))
      .toHaveProperty('ValueFun', value)
  })

  it('preserves empty groups and nested logic', () => {
    const filter = DataViewFilter.group({ logic: 'and', filters: [{ logic: 'or', filters: [] }] })
    expect(DataViewFilterCodec.encode(filter)).toEqual({ Type: 'and', Filters: [{ Type: 'or', Filters: [] }] })
  })
})

describe('SPARK filter definition decoding', () => {
  it.each(functionCases)('preserves the complete default function $Type through both boundaries', value => {
    const wire = { Type: 'cond', Field: 'result', Operator: 'equal', Value: null, ValueFun: value }
    expect(DataViewFilterCodec.decode(wire).toJSON()).toEqual({ field: 'result', operator: 'eq', value })
    expect(DataViewFilterCodec.encode(DataViewFilterCodec.decode(JSON.stringify(wire)))).toEqual(wire)
  })
  it.each(operatorPairs)('decodes wire %s / %s', (operator, wireOperator) => {
    const unary = ['is-null', 'is-not-null', 'is-empty', 'is-not-empty'].includes(operator)
    const filter = DataViewFilterCodec.decode({ Type: 'cond', Field: 'Name', Operator: wireOperator,
      Value: null, ValueFun: { Type: 'GetConstValue', Value: 'sample' } })
    expect(filter.toJSON()).toEqual(unary ? { field: 'Name', operator } : { field: 'Name', operator, value: 'sample' })
  })

  it.each(['', '  ', null, [], 0, false].map(value => ({ value })))('decodes explicit constant $value', ({ value }) => {
    const wire = { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null,
      ValueFun: { Type: 'GetConstValue', Value: value } }
    expect(DataViewFilterCodec.decode(JSON.stringify(wire)).toJSON()).toEqual({ field: 'Name', operator: 'eq', value })
    expect(DataViewFilterCodec.encode(DataViewFilterCodec.decode(wire))).toEqual(wire)
  })

  it('preserves dynamic parameters and isolates decoded state from the definition', () => {
    const wire = { Type: 'or', Filters: [{ Type: 'cond', Field: 'Name', Operator: 'equal', Value: null,
      ValueFun: { Type: 'CustomFunction', Params: { Names: ['A'], Enabled: false } } }] }
    const filter = DataViewFilterCodec.decode(wire)
    wire.Filters[0]!.ValueFun.Params.Names.push('B')
    expect(DataViewFilterCodec.encode(filter)).toEqual({ Type: 'or', Filters: [{ Type: 'cond', Field: 'Name',
      Operator: 'equal', Value: null, ValueFun: { Type: 'CustomFunction', Params: { Names: ['A'], Enabled: false } } }] })
  })

  it('preserves empty groups', () => {
    expect(DataViewFilterCodec.decode({ Type: 'and', Filters: [{ Type: 'or', Filters: [] }] }).toJSON())
      .toEqual({ logic: 'and', filters: [{ logic: 'or', filters: [] }] })
  })

  it.each([
    { Type: 'GetConstValue', Value: { Type: 'BusinessObject', Name: 'A' } },
    { Type: 'GetConstValue', Value: 0, Format: 'decimal' },
  ])('preserves constant wrappers whose payload cannot be unwrapped losslessly: $Type', value => {
    const wire = { Type: 'cond', Field: 'Name', Operator: 'equal', Value: null, ValueFun: value }
    expect(DataViewFilterCodec.encode(DataViewFilterCodec.decode(wire))).toEqual(wire)
  })

  it.each([
    null, '', '{', { field: 'Name', operator: 'eq', value: 1 },
    { Type: 'and', Filters: [null] }, { Type: 'or', Filters: {} },
    { Type: 'cond', Field: 'Name', Operator: 'unknown', ValueFun: { Type: 'GetConstValue', Value: 1 } },
    { Type: 'cond', Field: 'Name', Operator: 'equal', Value: 1 },
    { Type: 'cond', Field: '', Operator: 'equal', ValueFun: { Type: 'GetConstValue', Value: 1 } },
    { Type: 'cond', Field: 'Name', Operator: 'equal', ValueFun: { Type: 'GetConstValue' } },
    { Type: 'cond', Field: 'Name', Operator: 'equal', ValueFun: { Type: '' } },
  ])('rejects damaged definitions instead of clearing or dropping a condition: %j', input => {
    expect(() => DataViewFilterCodec.decode(input)).toThrow()
  })

  it('rejects circular groups with a located error', () => {
    const wire: { Type: 'and'; Filters: unknown[] } = { Type: 'and', Filters: [] }
    wire.Filters.push(wire)
    expect(() => DataViewFilterCodec.decode(wire)).toThrow('$.Filters[0]')
  })
})

