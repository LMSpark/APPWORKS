import {describe, expect, it} from 'vitest'
import {sparkColumnToAutoFieldNode} from '../../../packages/spark-component/src/components/containers/runtime/column-auto-field'

describe('formal SQL metadata automatic fields', () => {
  it.each(['VARCHAR', 'CHAR', 'TEXT'])('recognizes formal %s without forcing readonly', type => {
    const field = sparkColumnToAutoFieldNode({name: 'tblname', type}, 'form')
    expect(field.type).toBe('r-text')
    expect(field.props).not.toHaveProperty('readonly', true)
  })
  it('keeps an unsupported type readonly', () => {
    expect(sparkColumnToAutoFieldNode({name: 'x', type: 'unknown'}, 'form').props).toHaveProperty('readonly', true)
  })
})
