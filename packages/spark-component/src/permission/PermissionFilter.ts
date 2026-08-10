/**
 * @module @spark-appworks/spark-component:permission/PermissionFilter
 * 职责：提供 Permission Filter 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 权限过滤器 — 纯函数集
 *
 * 批量过滤行、字段，并保留服务端已经处理好的显示值
 */

import type { DataRow } from '@spark-appworks/spark-data'
import { FieldVisibility } from '@spark-appworks/spark-data'
import type { PagePermissionMode } from '../core/capability-keys.js'
import { canDelete, canEdit, isFieldEditable, isFieldVisible, getFieldVisibility } from './PermissionChecker'

export function filterDeletableRows(rows: DataRow[], permissionMode?: PagePermissionMode): DataRow[] {
  return rows.filter(row => canDelete(row, permissionMode))
}

export function filterEditableRows(rows: DataRow[], permissionMode?: PagePermissionMode): DataRow[] {
  return rows.filter(row => canEdit(row, permissionMode))
}

export function filterFields(row: DataRow, permissionMode?: PagePermissionMode): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(row)) {
    if (!field.startsWith('_') && isFieldVisible(field, row, permissionMode)) {
      filtered[field] = value
    }
  }
  return filtered
}

export function getEditableFields(row: DataRow, allFields: string[], permissionMode?: PagePermissionMode): string[] {
  return allFields.filter(field => isFieldEditable(field, row, permissionMode))
}

export function getVisibleFields(row: DataRow, allFields: string[], permissionMode?: PagePermissionMode): string[] {
  return allFields.filter(field => isFieldVisible(field, row, permissionMode))
}

export function filterDisplayableFields(row: DataRow, permissionMode?: PagePermissionMode): DataRow {
  const filtered: DataRow = {}
  for (const [field, value] of Object.entries(row)) {
    if (field.startsWith('_')) {
      filtered[field] = value
      continue
    }

    const visibility = getFieldVisibility(field, row, permissionMode)
    if (visibility === FieldVisibility.Hidden) continue
    filtered[field] = value
  }
  return filtered
}
