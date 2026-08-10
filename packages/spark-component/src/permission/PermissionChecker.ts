import type { DataPermissionSnapshot, DataPermissionSets, DataRow } from '@spark-appworks/spark-data'
import { FieldVisibility } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'
import type { PagePermissionMode } from '../core/capability-keys.js'

function rowPermission(row: DataRow): DataPermissionSets | null {
  const permission = row.lingma_sys_params
  return permission ?? null
}

export function canCreate(snapshot?: DataPermissionSnapshot | null, _permissionMode?: PagePermissionMode): boolean {
  return snapshot?.allowAdd === true
}

export function canImport(snapshot?: DataPermissionSnapshot | null, _permissionMode?: PagePermissionMode): boolean {
  return snapshot?.authorizedFeatureTags.includes('import') === true
}

export function canExport(snapshot?: DataPermissionSnapshot | null, _permissionMode?: PagePermissionMode): boolean {
  return snapshot?.authorizedFeatureTags.includes('export') === true
}

export function canDelete(row: DataRow, _permissionMode?: PagePermissionMode): boolean {
  return rowPermission(row)?.d === true
}

export function canCreateChild(
  row: DataRow,
  snapshot?: DataPermissionSnapshot | null,
  _permissionMode?: PagePermissionMode,
): boolean {
  return rowPermission(row) !== null && snapshot?.authorizedFeatureTags.includes('create-child') === true
}

export function canEdit(row: DataRow, _permissionMode?: PagePermissionMode): boolean {
  const permission = rowPermission(row)
  return permission !== null && permission.r.length + permission.e.length > 0
}

export function isFieldVisible(field: string, row: DataRow, permissionMode?: PagePermissionMode): boolean {
  return getFieldVisibility(field, row, permissionMode) !== FieldVisibility.Hidden
}

export function isFieldEditable(field: string, row: DataRow, _permissionMode?: PagePermissionMode): boolean {
  const permission = rowPermission(row)
  return permission !== null && (permission.r.includes(field) || permission.e.includes(field))
}

export function isFieldRequired(field: string, row: DataRow): boolean {
  return rowPermission(row)?.r.includes(field) === true
}

export function getFieldVisibility(
  field: string,
  row: DataRow,
  _permissionMode?: PagePermissionMode,
): FieldVisibility {
  const permission = rowPermission(row)
  if (permission === null) return FieldVisibility.Hidden
  if (permission.h.includes(field)) return FieldVisibility.Hidden
  if (permission.m.includes(field)) return FieldVisibility.Masked
  return FieldVisibility.Visible
}

export type FieldMaskInput = Readonly<{
  field: string
  value: unknown
  row: DataRow
  permissionMode?: PagePermissionMode
}>

export function maskFieldValue(input: FieldMaskInput): string {
  if (getFieldVisibility(input.field, input.row, input.permissionMode) === FieldVisibility.Hidden) return ''
  if (getFieldVisibility(input.field, input.row, input.permissionMode) === FieldVisibility.Masked) return '••••'
  return String(input.value ?? '')
}

function isPermissionSnapshot(value: unknown): value is DataPermissionSnapshot {
  if (!isRecord(value)) return false
  return typeof value['formKey'] === 'string'
    && typeof value['dataSpaceId'] === 'string'
    && typeof value['modelId'] === 'string'
    && typeof value['allowAdd'] === 'boolean'
    && typeof value['systemKey'] === 'string'
    && Array.isArray(value['originalRows'])
    && Array.isArray(value['authorizedFeatureTags'])
}

export function extractPermissionSnapshot(dataSource: unknown): DataPermissionSnapshot | null {
  if (!isRecord(dataSource)) return null
  const value = dataSource['permissionSnapshot']
  return isPermissionSnapshot(value) ? value : null
}
