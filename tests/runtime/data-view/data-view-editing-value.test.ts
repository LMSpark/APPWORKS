import { describe, expect, it } from 'vitest'
import { isDataViewEditingSource, writeDataViewEditingValue } from '../../../packages/spark-component/src/components/fields/context/dataViewEditing'
import type { DataRow } from '@spark-appworks/spark-data'

function createEditingSource(_rows?: DataRow[]) {
  const store = new Map<string | number, DataRow>()
  const pkField = 'id'
  return {
    store,
    source: {
      getPkKey(row: DataRow): string | number | undefined {
        const v = row[pkField]
        if (v === undefined || v === null) return undefined
        return typeof v === 'string' || typeof v === 'number' ? v : undefined
      },
      hasEditingChanges(id?: string | number): boolean {
        return id !== undefined && store.has(id)
      },
      getEditingRow(id: string | number): DataRow | null {
        return store.get(id) ?? null
      },
      updateEditingValue(id: string | number, field: string, value: unknown): DataRow {
        const row = store.get(id) ?? { [pkField]: id }
        const updated = { ...row, [field]: value }
        store.set(id, updated)
        return updated
      },
    },
  }
}

describe('writeDataViewEditingValue', () => {
  it('source 为 null 时返回 false', () => {
    expect(writeDataViewEditingValue({
      source: null,
      row: { id: 1 },
      field: 'name',
      value: 'test',
    })).toBe(false)
  })

  it('row 为 null 时返回 false', () => {
    const { source } = createEditingSource()
    expect(writeDataViewEditingValue({
      source,
      row: null,
      field: 'name',
      value: 'test',
    })).toBe(false)
  })

  it('source 不是 editing source 时返回 false（纯对象缺少编辑方法）', () => {
    expect(writeDataViewEditingValue({
      source: {},
      row: { id: 1 },
      field: 'name',
      value: 'test',
    })).toBe(false)
  })

  it('row 缺少主键时返回 false 且不抛错（筛选区 rowMirror 场景）', () => {
    const { source } = createEditingSource()
    // rowMirror 是空对象，没有主键字段
    const rowMirror: DataRow = {}

    expect(() => {
      const result = writeDataViewEditingValue({
        source,
        row: rowMirror,
        field: 'name',
        value: 'hello',
      })
      expect(result).toBe(false)
    }).not.toThrow()
  })

  it('row 有主键时写入编辑态并返回 true（表单编辑场景）', () => {
    const { source } = createEditingSource()
    const row: DataRow = { id: 1, name: 'old' }

    const result = writeDataViewEditingValue({
      source,
      row,
      field: 'name',
      value: 'updated',
    })

    expect(result).toBe(true)
    expect(source.getEditingRow(1)).toEqual({ id: 1, name: 'updated' })
  })
})

describe('isDataViewEditingSource', () => {
  it('DataView 实例被识别为 editing source', () => {
    const { source } = createEditingSource()
    expect(isDataViewEditingSource(source)).toBe(true)
  })

  it('空对象不是 editing source', () => {
    expect(isDataViewEditingSource({})).toBe(false)
  })

  it('null 不是 editing source', () => {
    expect(isDataViewEditingSource(null)).toBe(false)
  })

  it('缺少任一方法的对象不是 editing source', () => {
    expect(isDataViewEditingSource({
      getPkKey: () => 1,
      hasEditingChanges: () => false,
      getEditingRow: () => null,
      // 缺少 updateEditingValue
    })).toBe(false)
  })
})
