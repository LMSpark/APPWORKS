/**
 * @module @spark-appworks/spark-data:validation/column-validation
 * 职责：提供 spark-data 数据管线中的 column validation 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 列验证规则提取
 *
 * 从 DataColumn 元数据提取框架无关的验证规则描述符。
 * UI 框架层（如 Element Plus）负责将描述符转换为具体的表单验证规则。
 *
 * 数据流：pagedata.json → DataColumn → extractColumnRules() → UI 层转换 → el-form-item :rules
 */

import type { DataColumn } from '../types'

// ===== 规则描述符类型 =====

/** 验证规则类型 */
export type ValidationRuleType = 'required' | 'type' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern'

/** 框架无关的验证规则描述符 */
export type ColumnValidationRule =
  | { type: 'required' | 'type'; message: string }
  | { type: 'minLength' | 'maxLength' | 'min' | 'max'; message: string; value: number }
  | { type: 'pattern'; message: string; value: string }

// ===== 字符串类型集合 =====
const STRING_TYPES = new Set(['string', 'varchar', 'text'])
const NUMBER_TYPES = new Set(['number', 'int', 'integer', 'decimal', 'float', 'double'])

/**
 * 从 DataColumn 提取验证规则描述符。
 *
 * 规则优先级：`required` > `allowDBNull`（required 显式设置时覆盖 allowDBNull）。
 *
 * @param column - 列定义
 * @returns 验证规则数组（空数组表示无验证）
 *
 * @example
 * ```ts
 * const rules = extractColumnRules({ name: 'email', type: 'string', required: true, maxLength: 50 })
 * // [{ type: 'required', message: 'email 不能为空' }, { type: 'maxLength', message: '...', value: 50 }]
 * ```
 */
export function extractColumnRules(column: DataColumn): ColumnValidationRule[] {
  const rules: ColumnValidationRule[] = []
  const label = column.label ?? column.name

  // 必填规则：required 优先，回退到 allowDBNull
  const isRequired = column.required === true || (column.required === undefined && column.allowDBNull === false)
  if (isRequired) {
    rules.push({ type: 'required', message: `${label}不能为空` })
  }

  const colType = column.type.toLowerCase()

  // 字符串长度校验
  if (STRING_TYPES.has(colType)) {
    if (column.minLength !== undefined && column.minLength > 0) {
      rules.push({ type: 'minLength', message: `${label}至少${column.minLength}个字符`, value: column.minLength })
    }
    if (column.maxLength !== undefined && column.maxLength > 0) {
      rules.push({ type: 'maxLength', message: `${label}最多${column.maxLength}个字符`, value: column.maxLength })
    }
  }

  // 数值范围校验
  if (NUMBER_TYPES.has(colType)) {
    if (column.min !== undefined) {
      rules.push({ type: 'min', message: `${label}不能小于${column.min}`, value: column.min })
    }
    if (column.max !== undefined) {
      rules.push({ type: 'max', message: `${label}不能大于${column.max}`, value: column.max })
    }
  }

  // 正则校验
  if (column.pattern) {
    rules.push({
      type: 'pattern',
      message: column.patternMessage ?? `${label}格式不正确`,
      value: column.pattern,
    })
  }

  return rules
}

/**
 * 判断列是否为必填（便捷函数）。
 *
 * @param column - 列定义
 * @returns true 表示必填
 */
export function isColumnRequired(column: DataColumn): boolean {
  return column.required === true || (column.required === undefined && column.allowDBNull === false)
}
