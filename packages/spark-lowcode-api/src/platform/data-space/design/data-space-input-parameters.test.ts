import {describe, expect, it} from 'vitest'
import {DataSpaceDesignApi} from './data-space-design-api'

const legacy = {Name: '旧参数', extra: {keep: [false, 0, null]}}
const original = [{rowid: 'P1', Name: 'customer', Description: '客户', IsBusParam: true}, legacy]

describe('data-space input parameter declaration contract', () => {
  it('projects legacy display fields and merges only edited fields before the existing save validation', () => {
    const adapter=DataSpaceDesignApi.inputParameterRowAdapter()
    const row={Id:'P',name:'old',description:'desc',IsBusParam:0,extra:{keep:true}}
    expect(adapter.read(row)).toEqual({Name:'old',Description:'desc',IsBusParam:false})
    const changed=adapter.write({...adapter.read(row),Description:'new'},row)
    expect(changed).toEqual({...row,Description:'new'})
    expect(row.description).toBe('desc');expect(row).not.toHaveProperty('Description')
    expect(DataSpaceDesignApi.prepareInputParameters({value:[changed],original:[row]}).items)
      .toEqual([{...row,Name:'old',Description:'new',IsBusParam:false}])
  })
  it.each([undefined, null, '', '  ', '[]', []])('reads an empty declaration without manufacturing defaults: %j', value => {
    expect(DataSpaceDesignApi.readInputParameters({value})).toEqual([])
  })

  it('preserves legacy objects, unknown attributes and caller data while normalizing only edited entries', () => {
    const value = [{...original[0], Name: ' client ', Description: ' 新描述 '}, legacy,
      {Id: 'P2', name: ' flag ', description: ' 启用 ', IsBusParam: false, unknown: 7}]
    const before = JSON.stringify(value)
    const result = DataSpaceDesignApi.prepareInputParameters({value, original})
    expect(result).toEqual({changed: true, items: [
      {rowid: 'P1', Name: 'client', Description: '新描述', IsBusParam: true}, legacy,
      {Id: 'P2', name: ' flag ', description: ' 启用 ', IsBusParam: false, unknown: 7, Name: 'flag', Description: '启用'},
    ]})
    expect(JSON.stringify(value)).toBe(before)
    result.items[1]!['Name'] = 'cannot mutate caller'
    expect(legacy.Name).toBe('旧参数')
  })

  it('keeps unchanged bytes eligible for no-op and accepts untouched legacy entries without IDs', () => {
    const text = ' [ {"rowid":"P1","Name":"客户","IsBusParam":true,"extra":0} ] '
    expect(DataSpaceDesignApi.prepareInputParameters({value: text, original: text}).changed).toBe(false)
    expect(DataSpaceDesignApi.prepareInputParameters({value: [{rowid: 'P1', Name: ' 客户 ', IsBusParam: true, extra: 0}], original: text}).changed).toBe(false)
    expect(DataSpaceDesignApi.prepareInputParameters({value: original, original})).toEqual({changed: false, items: original})
  })

  it.each([
    {value: '[broken', error: /JSON/}, {value: '{}', error: /数组/},
    {value: '[null]', error: /对象/}, {value: [{rowid: 'P1', Name: 3}], error: /类型/},
    {value: [{rowid: 'P1', id: 'P2', Name: 'a'}], error: /冲突/},
    {value: [{rowid: 'P1', Name: 'a'}, {id: 'P1', Name: 'b'}], error: /ID 重复/},
  ])('rejects malformed editable declarations: $error', ({value, error}) => {
    expect(() => DataSpaceDesignApi.readInputParameters({value, editable: true})).toThrow(error)
  })

  it.each([
    {value: [{Name: 'new'}], error: /稳定身份/},
    {value: [{rowid: 'P1', Name: ''}], error: /名称不能为空/},
    {value: [{rowid: 'P1', Name: 'same'}, {rowid: 'P2', Name: ' same '}], error: /名称重复/},
  ])('rejects ambiguous edits before persistence: $error', ({value, error}) => {
    expect(() => DataSpaceDesignApi.prepareInputParameters({value, original})).toThrow(error)
  })

  it('does not silently repair unchanged ambiguous legacy names but rejects new ambiguity', () => {
    const existing = [{rowid: 'P1', Name: 'same'}, {rowid: 'P2', Name: 'same'}]
    expect(DataSpaceDesignApi.prepareInputParameters({value: existing, original: existing}).changed).toBe(false)
    expect(() => DataSpaceDesignApi.prepareInputParameters({value: [...existing, {rowid: 'P3', Name: 'third'}], original: existing}))
      .toThrow(/名称重复/)
    expect(DataSpaceDesignApi.prepareInputParameters({value: [existing[0]], original: existing}).changed).toBe(true)
  })

  it.each([undefined, NaN, Infinity, () => 1, new Date(0)])('rejects non-JSON entry values instead of dropping or replacing them: %j', extra => {
    expect(() => DataSpaceDesignApi.prepareInputParameters({value: [{rowid: 'P1', Name: 'ok', extra}], original: []})).toThrow(/JSON/)
  })

  it('rejects cyclic input and allows deletion without guessing parameter flags', () => {
    const cyclic: Record<string, unknown> = {rowid: 'P1', Name: 'a'}
    cyclic['self'] = cyclic
    expect(() => DataSpaceDesignApi.prepareInputParameters({value: [cyclic], original: []})).toThrow(/JSON/)
    expect(DataSpaceDesignApi.prepareInputParameters({value: [], original})).toEqual({changed: true, items: []})
    expect(DataSpaceDesignApi.readInputParameters({value: JSON.stringify(original)})).toEqual(original)
  })
})
