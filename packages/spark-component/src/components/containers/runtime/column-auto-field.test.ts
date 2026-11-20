import {describe, expect, it} from 'vitest'
import type {DataColumn} from '@spark-appworks/spark-data'
import {sparkColumnToAutoFieldNode} from './column-auto-field'

describe('sparkColumnToAutoFieldNode', () => {
  it('maps enum columns to r-select with static options', () => {
    const column: DataColumn = {
      name: 'Type',
      type: 'enum',
      enumOptions: [{value: 'MYSQL', label: 'MySQL'}],
    }
    const node = sparkColumnToAutoFieldNode(column, 'form')
    expect(node.type).toBe('r-select')
    expect(node.props?.['options']).toEqual([{value: 'MYSQL', label: 'MySQL'}])
  })
})
