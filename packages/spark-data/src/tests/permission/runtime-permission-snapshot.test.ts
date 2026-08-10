import { describe, expect, it } from 'vitest'

import { DataTable } from '../../data-table'

describe('DataTable backend permission snapshot', () => {
  it('registers rows, original rows, identities and five sparse sets as one baseline', () => {
    const table = new DataTable(
      'PayrollSalary',
      [
        { name: 'rowid', type: 'string', isPrimaryKey: true },
        { name: 'salary', type: 'decimal' },
      ],
    )

    table.ingestPermissionSnapshot({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      rows: [{
        rowid: 'ROW-1',
        salary: 100,
        lingma_sys_key: 'ROW-KEY',
        lingma_sys_params: { r: [], e: ['salary'], h: [], m: [], d: true },
      }],
      originalRows: [{ rowid: 'ROW-1', salary: 100, lingma_sys_key: 'ROW-KEY' }],
      total: 1,
      allowAdd: true,
      systemKey: 'TABLE-KEY',
      authorizedFeatureTags: ['salary.export'],
    })

    const view = table.getView('default')
    expect(view?.rows[0]?.lingma_sys_params).toEqual({ r: [], e: ['salary'], h: [], m: [], d: true })
    expect(view?.permissionSnapshot).toEqual({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      allowAdd: true,
      systemKey: 'TABLE-KEY',
      originalRows: [{ rowid: 'ROW-1', salary: 100, lingma_sys_key: 'ROW-KEY' }],
      authorizedFeatureTags: ['salary.export'],
    })
    expect(view?.total).toBe(1)
  })

  it('fails before replacing the current baseline when a row has no backend permission result', () => {
    const table = new DataTable(
      'PayrollSalary',
      [{ name: 'rowid', type: 'string', isPrimaryKey: true }],
    )
    const view = table.getView('default')
    view?.replaceRows([{ rowid: 'OLD' }])

    expect(() => table.ingestPermissionSnapshot({
      formKey: 'FORM-1',
      dataSpaceId: 'SPACE-1',
      modelId: 'MODEL-1',
      rows: [{ rowid: 'NEW' }],
      originalRows: [{ rowid: 'NEW' }],
      total: 1,
      allowAdd: false,
      systemKey: '',
      authorizedFeatureTags: [],
    })).toThrow('缺少 lingma_sys_params')
    expect(view?.rows).toEqual([{ rowid: 'OLD', _pk: 'OLD' }])
    expect(view?.permissionSnapshot).toBeNull()
  })
})
