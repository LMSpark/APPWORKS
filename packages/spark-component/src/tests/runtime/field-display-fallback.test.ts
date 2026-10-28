import { describe, expect, it, vi } from 'vitest'
import type { DataRow, DataView } from '@spark-appworks/spark-data'
import { resolveReadableDisplayFallback } from '../../components/fields/context/field-display-fallback'

describe('resolveReadableDisplayFallback', () => {
  it('returns the first non-empty visible field and skips hidden or masked values', () => {
    const row = { AppDesc: 'secret', AppName: 'catalog-key', rowid: 'app-7' } as DataRow
    const fieldAccess = vi.fn((_row: DataRow | null, field: string) => ({
      read: field === 'AppDesc' ? 'masked' : field === 'AppName' ? 'visible' : 'visible',
    }))

    expect(resolveReadableDisplayFallback({
      view: { fieldAccess } as unknown as DataView,
      row,
      fields: ['AppDesc', 'AppName', 'rowid'],
    })).toBe('catalog-key')
    expect(fieldAccess.mock.calls.map(([, field]) => field)).toEqual(['AppDesc', 'AppName'])
  })

  it('returns an empty string when no candidate is readable and non-empty', () => {
    const row = { AppDesc: 'hidden', AppName: '', rowid: 'app-7' } as DataRow
    const fieldAccess = vi.fn(() => ({ read: 'invisible' }))

    expect(resolveReadableDisplayFallback({
      view: { fieldAccess } as unknown as DataView,
      row,
      fields: ['AppDesc', 'AppName', 'rowid'],
    })).toBe('')
  })

  it('never reads a hidden candidate value', () => {
    const row = { rowid: 'app-7' } as DataRow
    Object.defineProperty(row, 'AppDesc', { get: () => { throw new Error('hidden value was read') } })
    const fieldAccess = vi.fn((_row: DataRow | null, field: string) => ({ read: field === 'rowid' ? 'visible' : 'invisible' }))

    expect(resolveReadableDisplayFallback({
      view: { fieldAccess } as unknown as DataView,
      row,
      fields: ['AppDesc', 'rowid'],
    })).toBe('app-7')
    expect(fieldAccess.mock.calls.map(([, field]) => field)).toEqual(['AppDesc', 'rowid'])
  })
})
