import {describe, expect, it} from 'vitest'
import {inspectContentPlaceholders,validateContentPlaceholders} from '@/services/smart-bid/content-placeholders'

describe('bidding content placeholders', () => {
  it('exposes exact unique names for the editor without rewriting Unicode or hiding syntax errors',()=>{
    const parsed=inspectContentPlaceholders('{{e\u0301}} {{é}} {{e\u0301}} {{ bad}}')
    expect(parsed.names).toEqual(['e\u0301','é']);expect(parsed.errors).toEqual(['INVALID_PLACEHOLDER'])
    expect(Object.isFrozen(parsed.names)).toBe(true);expect(Object.isFrozen(parsed.errors)).toBe(true)
  })
  it('accepts repeated references and preserves false or zero as present data', () => {
    expect(validateContentPlaceholders({value: '{{工期}} / {{工期}} {{符合}}', data: {工期: 0, 符合: false}})).toEqual([])
  })
  it('reports missing and unused keys independently', () => {
    expect(validateContentPlaceholders({value: '{{工期}}', data: {报价: '0'}})).toEqual(['MISSING_DATA:工期', 'UNUSED_DATA:报价'])
  })
  it.each(['', ' 工期', '工期 ', 'a\nb', 'a'.repeat(65), 'a{b'])('rejects an invalid name %j', name => {
    expect(validateContentPlaceholders({value: `{{${name}}}`, data: {}})).toContain('INVALID_PLACEHOLDER')
  })
  it('rejects an unclosed placeholder', () => {
    expect(validateContentPlaceholders({value: '承诺{{工期', data: {}})).toContain('INVALID_PLACEHOLDER')
  })
  it('does not treat inherited properties as supplied data', () => {
    expect(validateContentPlaceholders({value: '{{toString}}', data: {}})).toEqual(['MISSING_DATA:toString'])
  })
})
