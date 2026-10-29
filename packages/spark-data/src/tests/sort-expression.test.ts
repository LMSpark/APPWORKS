import {describe, expect, it} from 'vitest'
import {sortDataRowsByExpression} from '../query/sort-expression'
import type {DataColumn, DataRow} from '../types'

const columns: DataColumn[] = [
  {name: 'id', type: 'string', isPrimaryKey: true},
  {name: 'rank', type: 'number'},
]

describe('sortDataRowsByExpression', () => {
  it('compares numeric strings by declared number type without mutating source rows', () => {
    const rows: DataRow[] = [{id: 'ten', rank: '10'}, {id: 'two', rank: '2'}]
    const sorted = sortDataRowsByExpression(rows, columns, [{field: 'rank', direction: 'asc'}])

    expect(sorted.map(row => row['id'])).toEqual(['two', 'ten'])
    expect(rows.map(row => row['id'])).toEqual(['ten', 'two'])
  })

  it('treats null and undefined as equal and keeps their stable order', () => {
    const rows: DataRow[] = [
      {id: 'null', rank: null},
      {id: 'undefined'},
      {id: 'one', rank: 1},
    ]

    const ascending = sortDataRowsByExpression(rows, columns, [{field: 'rank', direction: 'asc'}])
    const descending = sortDataRowsByExpression(rows, columns, [{field: 'rank', direction: 'desc'}])

    expect(ascending.map(row => row['id'])).toEqual(['null', 'undefined', 'one'])
    expect(descending.map(row => row['id'])).toEqual(['one', 'null', 'undefined'])
  })

  it('preserves insertion order for unknown sort columns or unsupported column types', () => {
    const rows: DataRow[] = [{id: 'B', rank: 2}, {id: 'A', rank: 1}]

    expect(sortDataRowsByExpression(rows, columns, [{field: 'missing', direction: 'asc'}])).toEqual(rows)
    expect(sortDataRowsByExpression(rows, [{name: 'rank', type: 'time'}], [{field: 'rank', direction: 'asc'}])).toEqual(rows)
  })
})
