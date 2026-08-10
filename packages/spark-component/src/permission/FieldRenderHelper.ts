/**
 * @module @spark-appworks/spark-component:permission/FieldRenderHelper
 * 职责：提供 Field Render Helper 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 字段渲染状态计算 — 纯函数
 *
 * 结合字段配置和权限，计算字段的最终渲染状态。
 * 内部直接调用 checker 纯函数，调用方无需传入 checker 依赖。
 */

import type { DataRow, FieldRenderState } from '@spark-appworks/spark-data'
import { FieldVisibility } from '@spark-appworks/spark-data'
import type { FieldRenderConfig } from '@spark-appworks/spark-utils'
import type { PermissionMode } from '@spark-appworks/spark-utils'
import { canEdit, isFieldEditable, getFieldVisibility, maskFieldValue } from './PermissionChecker'

/**
 * 计算单个字段的渲染状态（可见性 + 可编辑性 + 展示值）。
 */
export function computeFieldState(config: FieldRenderConfig, row: DataRow, permissionMode?: PermissionMode): FieldRenderState {
  const { field } = config
  const visibility = getFieldVisibility(field, row, permissionMode)
  const readable = visibility !== FieldVisibility.Hidden && (config.visible !== false)
  const editable = canEdit(row, permissionMode)
    && isFieldEditable(field, row, permissionMode)
    && (config.editable !== false)
  const shouldRender = readable

  let displayValue: string | undefined
  if (readable) {
    const value = row[field]
    displayValue = maskFieldValue({
      field,
      value,
      row,
      ...(permissionMode === undefined ? {} : { permissionMode }),
    })
  }

  return { field, visibility, readable, editable, displayValue, shouldRender }
}
