import {describe, expect, it} from 'vitest'
import {DataViewFilter, DataViewFilterCodec} from '../../index'

describe('SPARK filter storage owned by spark-data', () => {
  it.each([
    ['eq', 'equal'], ['ne', 'notequal'], ['gt', 'greaterthan'], ['gte', 'greaterthanorequal'],
    ['lt', 'lessthan'], ['lte', 'lessthanorequal'], ['contains', 'contains'], ['not-contains', 'nolike'],
    ['starts-with', 'startswith'], ['not-starts-with', 'nostartswith'], ['ends-with', 'endswith'],
    ['not-ends-with', 'notendswith'], ['in', 'in'], ['not-in', 'notin'],
    ['is-null', 'isnull'], ['is-not-null', 'isnotnull'], ['is-empty', 'isempty'], ['is-not-empty', 'isnotempty'],
  ])('round trips operator %s without API imports', (operator, wire) => {
    const parsed = DataViewFilter.parse({field: 'Name', operator, value: false})
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(DataViewFilterCodec.encode(parsed.value)).toMatchObject({Operator: wire})
    expect(DataViewFilterCodec.decode(DataViewFilterCodec.encode(parsed.value)).toJSON()).toEqual(parsed.value.toJSON())
  })

  it.each(['GetConstValue', 'GetRefData', 'GetGroupData', 'SystemData', 'GetExpData', 'GetTableField',
    'GetApiPublicParam', 'GetInputParam', 'GetObjectArray', 'GetUserMasterId', 'GetFlowNodeStepUserId',
    'GetHuoShanData', 'GetApiAccount', 'CozeAuth', 'CustomFunction'])('preserves %s and opaque payloads', Type => {
    const tree = DataViewFilter.group({logic: 'or', filters: [
      {logic: 'and', filters: []},
      {field: 'Name', operator: 'eq', value: {Type, Value: {Type: 'literal-data'}, Extra: [null, false, 0, '']}},
    ]})
    expect(DataViewFilterCodec.parseStored(DataViewFilterCodec.serializeStored(tree))?.toJSON()).toEqual(tree.toJSON())
  })

  it('distinguishes absent filter, empty groups and corrupt persisted input', () => {
    expect(DataViewFilterCodec.parseStored('  ')).toBeUndefined()
    expect(DataViewFilterCodec.serializeStored(undefined)).toBe('')
    expect(DataViewFilterCodec.parseStored('{"Type":"or","Filters":[]}')?.toJSON()).toEqual({logic: 'or', filters: []})
    for (const input of ['{', '{"Type":"and","Filters":[null]}', '{"Type":"cond","Field":"Name","Operator":"equal","Value":"fallback"}']) {
      expect(() => DataViewFilterCodec.parseStored(input)).toThrow()
    }
  })
})
