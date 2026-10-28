import { describe, expect, it } from 'vitest'
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import { selectFieldContextRow } from '../../components/fields/context/field-row-scope'

describe('selectFieldContextRow', () => {
  it('uses the row scope when the explicit binding resolves to that same DataView', () => {
    const row = { rowid: 'row-scope' } as DataRow
    const current = { rowid: 'view-current' } as DataRow
    const view = {rows: [row]} as DataView

    expect(selectFieldContextRow({ source: view, inheritedSource: view, inheritedRow: row, currentRow: current, explicit: true })).toBe(row)
  })

  it('does not borrow a row scope from a different DataView for an explicit binding', () => {
    const current = { rowid: 'view-current' } as DataRow
    const inherited = {rowid: 'view-current'} as DataRow
    const source = {rows: [current]} as DataView
    const inheritedSource = {rows: [inherited]} as DataView

    expect(selectFieldContextRow({ source, inheritedSource, inheritedRow: inherited, currentRow: current, explicit: true })).toBe(current)
  })

  it('keeps the matching row scope even when field permissions are evaluated separately per row', () => {
    const matchingRow = { rowid: 'restricted-presentation-row' } as DataRow
    const current = { rowid: 'unrelated-current-row' } as DataRow
    const view = {rows: [matchingRow]} as DataView

    expect(selectFieldContextRow({
      source: view,
      inheritedSource: view,
      inheritedRow: matchingRow,
      currentRow: current,
      explicit: true,
    })).toBe(matchingRow)
  })

  it('falls back to currentRow when same-view DATA_ROW is not one of the DataView rows', () => {
    const current = {rowid: 'current'} as DataRow
    const decoy = {rowid: 'current'} as DataRow
    const view = {rows: [current]} as DataView

    expect(selectFieldContextRow({source: view, inheritedSource: view, inheritedRow: decoy, currentRow: current, explicit: true})).toBe(current)
  })
})
