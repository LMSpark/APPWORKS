import { describe, expect, it } from 'vitest'
import { permission } from '../../packages/spark-component/src/index'
import type { DataPermissionSnapshot, DataRow } from '@spark-appworks/spark-data'

const { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } = permission

function snapshot(tags: readonly string[] = []): DataPermissionSnapshot {
  return {
    formKey: 'FORM-1',
    dataSpaceId: 'SPACE-1',
    modelId: 'MODEL-1',
    allowAdd: true,
    systemKey: 'TABLE-KEY',
    originalRows: [],
    authorizedFeatureTags: tags,
  }
}

describe('PermissionChecker', () => {
  it('fails closed when the backend permission result is missing', () => {
    const row: DataRow = { id: 1 }

    expect(canCreate()).toBe(false)
    expect(canImport()).toBe(false)
    expect(canExport()).toBe(false)
    expect(canEdit(row)).toBe(false)
    expect(canDelete(row)).toBe(false)
    expect(canCreateChild(row)).toBe(false)
  })

  it('consumes allowAdd, feature tags and row sparse sets without compressing them', () => {
    const permissionSnapshot = snapshot(['import', 'export', 'create-child'])
    const row: DataRow = {
      id: 1,
      lingma_sys_params: { r: ['requiredName'], e: ['name'], h: [], m: [], d: true },
    }

    expect(canCreate(permissionSnapshot)).toBe(true)
    expect(canImport(permissionSnapshot)).toBe(true)
    expect(canExport(permissionSnapshot)).toBe(true)
    expect(canEdit(row)).toBe(true)
    expect(canDelete(row)).toBe(true)
    expect(canCreateChild(row, permissionSnapshot)).toBe(true)
  })
})
