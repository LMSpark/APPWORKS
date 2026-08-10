import { describe, expect, it } from 'vitest'
import { DataSpaceFrontendModel } from '@spark-appworks/spark-lowcode-api'

import { toDataPermissionSnapshotInput } from '../../src/lowcode/lowcode-data-space-runtime'

function model(): DataSpaceFrontendModel {
  return new DataSpaceFrontendModel({
    dataSpaceId: 'SPACE-1',
    modelId: 'MODEL-1',
    name: '工资模型',
    resource: {
      resourceName: 'Salary', resourceType: 'table', primaryKeyField: 'rowid', databaseName: 'payroll',
    },
    fields: [{ fieldId: 'FIELD-1', resourceField: 'salary' }],
    relations: [],
  })
}

describe('lowcode data-space runtime binding', () => {
  it('atomically combines data and backend-authorized feature tags for spark-data', () => {
    const input = toDataPermissionSnapshotInput(model(), {
      data: {
        formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1', total: 1,
        allowAdd: true, systemKey: 'TABLE-KEY',
        rows: [{
          rowid: 'ROW-1', salary: 100, lingma_sys_key: 'ROW-KEY',
          lingma_sys_params: { r: [], e: ['salary'], h: [], m: [], d: true },
        }],
        originalRows: [{ rowid: 'ROW-1', salary: 100 }],
      },
      permission: {
        formKey: 'FORM-1', authorizedFeatureTags: ['salary.approve'],
        allowAddByResource: { 'payroll@Salary': true },
      },
    })

    expect(input).toMatchObject({
      formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1', allowAdd: true,
      authorizedFeatureTags: ['salary.approve'],
      rows: [{ lingma_sys_key: 'ROW-KEY', lingma_sys_params: { e: ['salary'], d: true } }],
    })
  })

  it('rejects permission snapshots from another FormKey', () => {
    expect(() => toDataPermissionSnapshotInput(model(), {
      data: {
        formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1', total: 0,
        allowAdd: false, systemKey: '', rows: [], originalRows: [],
      },
      permission: { formKey: 'FORM-2', authorizedFeatureTags: [], allowAddByResource: {} },
    })).toThrow('FormKey 不一致')
  })
})
