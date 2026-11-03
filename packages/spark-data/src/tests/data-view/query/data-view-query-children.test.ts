import {describe, expect, it} from 'vitest'
import {DataViewQuery} from '../../../query/data-view-query'
import {DataView} from '../../../data-view'

describe('explicit Join child query configuration', () => {
  it('captures and roundtrips nested formal model names, output fields and filters', () => {
    const input = {outputType: 'Join', children: [{modelName: 'Details', fields: ['detailId', 'amount'],
      filter: {field: 'amount', operator: 'gt', value: 0}, children: [{modelName: 'Products', fields: ['productName']}]}]}
    const parsed = DataViewQuery.parse(input)
    expect(parsed).toEqual(input)
    expect(DataViewQuery.capture(parsed)).toEqual(input)
    const view = new DataView('Orders', 'default')
    view.queryConfig = parsed
    expect(DataView.fromJson(view.toJson(), 'Orders', 'restored').queryConfig).toEqual(input)
    input.children[0]!.fields.push('later')
    input.children[0]!.filter.value = 9
    expect(parsed.children?.[0]?.fields).toEqual(['detailId', 'amount'])
    expect(parsed.children?.[0]?.filter).toEqual({field: 'amount', operator: 'gt', value: 0})
    expect(Object.isFrozen(parsed.children?.[0]?.children)).toBe(true)
    expect(Object.isFrozen(parsed.children?.[0]?.filter)).toBe(true)
  })

  it.each([
    {children: []}, {outputType: 'Table', children: []}, {outputType: 'HierarchyData', children: []},
    {outputType: 'Join', children: null}, {outputType: 'Join', children: [{}]},
    {outputType: 'Join', children: [{modelName: ' ', fields: ['id']}]},
    {outputType: 'Join', children: [{modelName: 'Details', fields: []}]},
    {outputType: 'Join', children: [{modelName: 'Details', fields: ['id', 'id']}]},
    {outputType: 'Join', children: [{modelName: 'Details', fields: ['id'], scenarioId: 'other'}]},
    {outputType: 'Join', children: [{modelName: 'Details', fields: ['id'], pageSize: 1}]},
    {outputType: 'Join', children: [{modelName: 'Details', fields: ['id'], filter: {field: 'id', operator: 'guess', value: 1}}]},
  ])('rejects invalid or ambiguous child query configuration %j', input => {
    expect(() => DataViewQuery.parse(input)).toThrow(/children/)
  })

  it('rejects ancestor model cycles, duplicate siblings and cyclic input objects', () => {
    const child = {modelName: 'Details', fields: ['id']}
    expect(() => DataViewQuery.parse({outputType: 'Join', children: [child, child]})).toThrow(/children/)
    expect(() => DataViewQuery.parse({outputType: 'Join', children: [{...child, children: [child]}]})).toThrow(/children/)
    const cyclic: Record<string, unknown> = {...child}
    cyclic['children'] = [cyclic]
    expect(() => DataViewQuery.parse({outputType: 'Join', children: [cyclic]})).toThrow(/children/)
  })

  it('keeps root and child field validation separate and detects a changed child filter', () => {
    const config = {outputType: 'Join', children: [{modelName: 'Details', fields: ['detailId']}]}
    expect(() => DataViewQuery.validateFields(config, new Set(['orderId']))).not.toThrow()
    expect(DataViewQuery.differsOnlyInAutoQuery(DataViewQuery.parse(config), DataViewQuery.parse({...config,
      children: [{...config.children[0]!, filter: {field: 'detailId', operator: 'eq', value: 'new'}}]}))).toBe(false)
  })

  it('rejects sparse child and field arrays instead of preserving invisible plan holes', () => {
    expect(() => DataViewQuery.parse({outputType: 'Join', children: Array(1)})).toThrow(/children/)
    expect(() => DataViewQuery.parse({outputType: 'Join', children: [{modelName: 'Details', fields: Array(1)}]})).toThrow(/fields/)
  })

  it('accepts 64 explicit levels with empty leaf children and rejects a 65th level', () => {
    const nested = (count: number): unknown[] => {
      let children: unknown[] = []
      for (let index = count; index > 0; index--) children = [{modelName: `Model${index}`, fields: ['id'], children}]
      return children
    }
    expect(() => DataViewQuery.parse({outputType: 'Join', children: nested(64)})).not.toThrow()
    expect(() => DataViewQuery.parse({outputType: 'Join', children: nested(65)})).toThrow(/64/)
  })
})
