import { describe, expect, it } from 'vitest'
import {
  FieldVisibility,
  type DataPermissionSnapshot,
  type DataRow,
} from '@spark-appworks/spark-data'
import { permission } from '../../packages/spark-component/src/index'

const { isPermittedAction, resolveFieldPermissionState } = permission

function snapshot(input?: Partial<DataPermissionSnapshot>): DataPermissionSnapshot {
  return {
    formKey: 'FORM-1',
    dataSpaceId: 'SPACE-1',
    modelId: 'MODEL-1',
    allowAdd: false,
    systemKey: 'TABLE-KEY',
    originalRows: [],
    authorizedFeatureTags: [],
    ...input,
  }
}

describe('PermissionResolver', () => {
  it('uses backend table, feature and row decisions as the only action result', () => {
    const permissionSnapshot = snapshot({ allowAdd: true, authorizedFeatureTags: ['import'] })
    const editableRow: DataRow = {
      id: 1,
      lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: true },
    }
    const lockedRow: DataRow = {
      id: 2,
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    }

    expect(isPermittedAction('create', { permissionSnapshot })).toBe(true)
    expect(isPermittedAction('import', { permissionSnapshot })).toBe(true)
    expect(isPermittedAction('export', { permissionSnapshot })).toBe(false)
    expect(isPermittedAction('edit', { row: editableRow })).toBe(true)
    expect(isPermittedAction('delete', { row: editableRow })).toBe(true)
    expect(isPermittedAction('delete', { row: lockedRow })).toBe(false)
  })

  it('fails closed for missing permission data', () => {
    const row: DataRow = { id: 1, name: 'Alice' }
    const state = resolveFieldPermissionState({ field: 'name', row })

    expect(isPermittedAction('create', {})).toBe(false)
    expect(isPermittedAction('edit', { row })).toBe(false)
    expect(isPermittedAction('delete', { row })).toBe(false)
    expect(state).toMatchObject({
      readable: false,
      editable: false,
      visibility: FieldVisibility.Hidden,
      shouldRender: false,
    })
  })

  it('keeps required/editable and hidden/masked channels independent', () => {
    const row: DataRow = {
      id: 1,
      requiredName: '',
      phone: '13800138000',
      secret: 'top-secret',
      password: 'hidden-editable',
      lingma_sys_params: {
        r: ['requiredName'],
        e: ['phone', 'password'],
        h: ['secret', 'password'],
        m: ['phone'],
        d: false,
      },
    }

    expect(resolveFieldPermissionState({ field: 'requiredName', row })).toMatchObject({
      visibility: FieldVisibility.Visible,
      readable: true,
      editable: true,
    })
    expect(resolveFieldPermissionState({ field: 'phone', row })).toMatchObject({
      visibility: FieldVisibility.Masked,
      readable: true,
      editable: true,
      displayValue: '••••',
    })
    expect(resolveFieldPermissionState({ field: 'secret', row })).toMatchObject({
      visibility: FieldVisibility.Hidden,
      readable: false,
      editable: false,
    })
    expect(resolveFieldPermissionState({ field: 'password', row })).toMatchObject({
      visibility: FieldVisibility.Hidden,
      readable: false,
      editable: true,
      shouldRender: false,
    })
  })
})
