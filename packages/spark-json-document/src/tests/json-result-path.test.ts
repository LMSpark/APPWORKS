import { describe, expect, it } from 'vitest'

import {
  readJsonProperty,
  readJsonValueAtResultPath,
  resultPathToJmespath,
} from '../core/json-result-path'

describe('json-result-path (jmespath)', () => {
  it('maps resultPath segments to jmespath expressions', () => {
    expect(resultPathToJmespath([])).toBeNull()
    expect(resultPathToJmespath(['directory'])).toBe('directory')
    expect(resultPathToJmespath(['node', 'props'])).toBe('node.props')
  })

  it('reads nested values via jmespath', () => {
    const value = { directory: { name: 'pages' }, count: 2 }
    expect(readJsonValueAtResultPath(value, [])).toBe(value)
    expect(readJsonValueAtResultPath(value, ['directory'])).toEqual({ name: 'pages' })
    expect(readJsonProperty(value, 'count')).toBe(2)
  })
})
