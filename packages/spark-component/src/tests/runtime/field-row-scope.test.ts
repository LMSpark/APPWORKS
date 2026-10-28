import { describe, expect, it } from 'vitest'
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import { selectFieldContextRow } from '../../components/fields/context/field-row-scope'

describe('selectFieldContextRow', () => {
  it('uses the row scope when the explicit binding resolves to that same DataView', () => {
    const view = {} as DataView
    const row = { rowid: 'row-scope' } as DataRow
    const current = { rowid: 'view-current' } as DataRow

    expect(selectFieldContextRow({ source: view, inheritedSource: view, inheritedRow: row, currentRow: current, explicit: true })).toBe(row)
  })

  it('does not borrow a row scope from a different DataView for an explicit binding', () => {
    const source = {} as DataView
    const inheritedSource = {} as DataView
    const current = { rowid: 'view-current' } as DataRow

    expect(selectFieldContextRow({ source, inheritedSource, inheritedRow: { rowid: 'other-view' } as DataRow, currentRow: current, explicit: true })).toBe(current)
  })

  it('keeps the matching row scope even when field permissions are evaluated separately per row', () => {
    const view = {} as DataView
    const matchingRow = { rowid: 'restricted-presentation-row' } as DataRow
    const current = { rowid: 'unrelated-current-row' } as DataRow

    expect(selectFieldContextRow({
      source: view,
      inheritedSource: view,
      inheritedRow: matchingRow,
      currentRow: current,
      explicit: true,
    })).toBe(matchingRow)
  })
})
