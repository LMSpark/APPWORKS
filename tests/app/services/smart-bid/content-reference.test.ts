import {describe, expect, it} from 'vitest'
import {validateContentReference} from '@/services/smart-bid/content-reference'

describe('bidding typed content references', () => {
  it.each([
    {type: 'fact', factId: 'F'}, {type: 'number', number: '0', unit: '元'},
    {type: 'date', date: '2024-02-29'}, {type: 'bool', bool: false},
    {type: 'page', nodeId: 'N'}, {type: 'xref', nodeId: 'N', show: 'title'},
    {type: 'resource', resourceVersionId: 'R'}, {type: 'sensitive', ownerRef: 'P', field: '姓名'},
  ])('accepts a well-shaped $type reference', reference => {
    expect(validateContentReference(reference)).toEqual([])
  })
  it.each([
    null, false, {type: 'fact', factId: ''}, {type: 'fact', factId: 'F', version: 'invented'},
    {type: 'number', number: '1e3', unit: '元'}, {type: 'number', number: '1,000', unit: '元'},
    {type: 'number', number: 0, unit: '元'}, {type: 'bool', bool: 'false'},
    {type: 'date', date: '2023-02-29'}, {type: 'date', date: '2024-04-31'},
    {type: 'xref', nodeId: 'N', show: 'html'}, {type: 'sensitive', ownerRef: 'P'},
  ])('rejects malformed reference %j', reference => {
    expect(validateContentReference(reference).length).toBeGreaterThan(0)
  })
})
