/**
 * @module @spark-appworks/spark-data:validation/validation
 * 职责：提供 spark-data 数据管线中的 validation 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 数据校验系统
 * 
 * 提供字段级和行级数据校验功能
 */

import type { DataColumn } from '../types.js'
import type { DataRow } from '../types.js'

// ===== 类型定义 =====

/**
 * 校验错误
 */
export type ValidationError = {
  /** 字段名 */
  field: string
  /** 错误消息 */
  message: string
  /** 错误代码 */
  code: string
  /** 实际值 */
  value?: unknown}

/**
 * 校验结果
 */
export type ValidationResult = {
  /** 是否有效 */
  valid: boolean
  /** 错误列表 */
  errors: ValidationError[]}

/**
 * 行级校验函数
 */
export type RowValidator = {
  (row: DataRow): ValidationError[] | null}

/**
 * 数据模式（包含列定义和校验规则）
 */
export type DataSchema = {
  /** 列定义 */
  columns: DataColumn[]
  /** 自定义行级校验 */
  validate?: RowValidator}

// ===== 校验器类 =====

/**
 * 数据校验器
 * 
 * 基于数据模式（列定义 + 自定义规则）校验行数据
 */
export class DataValidator {
    /** 创建 Data Validator 实例。 */
constructor(private schema: DataSchema) {}

  /**
   * 校验单行数据
   * @param row - 行数据
   * @returns 校验结果
   */
  validate(row: DataRow): ValidationResult {
    const { errors } = this.validateColumns(row)

    // 2. 自定义行级校验
    if (this.schema.validate) {
      const customErrors = this.schema.validate(row)
      if (customErrors) {
        errors.push(...customErrors)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /** 仅执行原生列规则；fields 省略时检查全部非计算列。 */
  validateColumns(row: DataRow, fields?: ReadonlySet<string>): ValidationResult {
    const errors: ValidationError[] = []
    for (const col of this.schema.columns) {
      if (col.isComputed || col.computeExpression || (fields !== undefined && !fields.has(col.name))) continue
      errors.push(...this.validateField(col, row[col.name]))
    }
    return { valid: errors.length === 0, errors }
  }

  /**
   * 批量校验多行数据
   * @param rows - 行数据数组
   * @returns 每行的校验结果
   */
  validateBatch(rows: DataRow[]): ValidationResult[] {
    return rows.map(row => this.validate(row))
  }

  /**
   * 校验单个字段
   * @param col - 列定义
   * @param value - 字段值
   * @returns 错误列表
   */
  private validateField(col: DataColumn, value: unknown): ValidationError[] {
    const errors: ValidationError[] = []
    const label = col.label ?? col.name

    // 1. 必填校验（required 优先，回退到 allowDBNull）
    const isRequired = col.required === true || (col.required === undefined && col.allowDBNull === false)
    if (isRequired && (value === null || value === undefined || value === '')) {
      errors.push({
        field: col.name,
        message: `${label} 不能为空`,
        code: 'REQUIRED',
        value
      })
      return errors // 必填校验失败后跳过其他校验
    }

    // 2. 类型校验（跳过 null/undefined）
    if (value !== null && value !== undefined && value !== '') {
      const typeError = this.validateType(col, value, label)
      if (typeError) {
        errors.push(typeError)
      }

      // 3. 字符串长度校验
      if (typeof value === 'string') {
        if (col.minLength !== undefined && value.length < col.minLength) {
          errors.push({ field: col.name, message: `${label} 至少${col.minLength}个字符`, code: 'MIN_LENGTH', value })
        }
        if (col.maxLength !== undefined && value.length > col.maxLength) {
          errors.push({ field: col.name, message: `${label} 最多${col.maxLength}个字符`, code: 'MAX_LENGTH', value })
        }
      }

      // 4. 数值范围校验
      if (typeof value === 'number' && !isNaN(value)) {
        if (col.min !== undefined && value < col.min) {
          errors.push({ field: col.name, message: `${label} 不能小于${col.min}`, code: 'MIN_VALUE', value })
        }
        if (col.max !== undefined && value > col.max) {
          errors.push({ field: col.name, message: `${label} 不能大于${col.max}`, code: 'MAX_VALUE', value })
        }
      }

      // 5. 正则校验
      if (col.pattern && typeof value === 'string') {
        try {
          const regex = new RegExp(col.pattern)
          if (!regex.test(value)) {
            errors.push({ field: col.name, message: col.patternMessage ?? `${label} 格式不正确`, code: 'PATTERN', value })
          }
        } catch {
          errors.push({ field: col.name, message: `${label} 正则表达式无效: ${col.pattern}`, code: 'PATTERN', value })
        }
      }
    }

    return errors
  }

  /**
   * 类型校验
   * @param col - 列定义
   * @param value - 字段值
   * @param label - 字段标签
   * @returns 错误对象或 null
   */
  private validateType(col: DataColumn, value: unknown, label: string): ValidationError | null {
    const actualType = typeof value
    // toLowerCase() 提前到 switch 前，避免 case 匹配时重复计算
    const colType = col.type.toLowerCase()

    switch (colType) {
      case 'number':
      case 'int':
      case 'integer':
      case 'decimal':
      case 'float':
      case 'double':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return {
            field: col.name,
            message: `${label} 必须是有效的数字`,
            code: 'INVALID_TYPE',
            value
          }
        }
        break

      case 'string':
      case 'varchar':
      case 'text':
        if (actualType !== 'string') {
          return {
            field: col.name,
            message: `${label} 必须是字符串`,
            code: 'INVALID_TYPE',
            value
          }
        }
        break

      case 'boolean':
      case 'bool':
        if (actualType !== 'boolean') {
          return {
            field: col.name,
            message: `${label} 必须是布尔值`,
            code: 'INVALID_TYPE',
            value
          }
        }
        break

      case 'date':
      case 'datetime':
        if (!(value instanceof Date) && actualType !== 'string') {
          return {
            field: col.name,
            message: `${label} 必须是日期或日期字符串`,
            code: 'INVALID_TYPE',
            value
          }
        }
        // 字符串日期格式校验
        if (typeof value === 'string' && Number.isNaN(Date.parse(value))) {
          return {
            field: col.name,
            message: `${label} 包含无效的日期格式`,
            code: 'INVALID_DATE_FORMAT',
            value
          }
        }
        break

      default:
        // 未知类型不校验
        break
    }

    return null
  }

  /**
   * 快速校验（只返回是否有效）
   * @param row - 行数据
   * @returns 是否有效
   */
  isValid(row: DataRow): boolean {
    return this.validate(row).valid
  }

  /**
   * 获取第一个错误
   * @param row - 行数据
   * @returns 第一个错误或 null
   */
  getFirstError(row: DataRow): ValidationError | null {
    const result = this.validate(row)
    return result.errors[0] ?? null
  }
}

// ===== 工具函数 =====

/**
 * 创建数据校验器
 * @param schema - 数据模式
 * @returns 校验器实例
 */
export function createValidator(schema: DataSchema): DataValidator {
  return new DataValidator(schema)
}

/**
 * 创建数据模式
 * @param columns - 列定义
 * @param validate - 自定义校验函数
 * @returns 数据模式
 */
export function createSchema(
  columns: DataColumn[],
  validate?: RowValidator
): DataSchema {
  if (validate === undefined) {
    return { columns }
  }
  return { columns, validate }
}
