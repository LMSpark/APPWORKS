/**
 * @module @spark-appworks/spark-lowcode-api:realtime/data-entry/ai-data-entry-fields
 * 职责：从当前正式 DataView 的输出列及新增字段权限，派生本轮 AI 批量录入使用的最小字段约束，并校验候选值的基本类型。
 * 边界：只投影列定义和已有权限，不保存第二份字段配置、不扩大写权限；最终领域校验与新增仍交回原 DataView。
 * AI用途：构造本轮请求的字段 schema 与确认前基础校验时，从这里取得正式字段白名单，不能依据业务行或页面配置自行补列。
 */
import type {DataColumn, DataRow, DataView} from '@spark-appworks/spark-data'

/** 当前正式 DataView 允许 AI 生成并供 readback 校验的最小字段元数据；此类型不授予写权限。 */
export type AiDataEntryField = Readonly<{
  /** 正式 DataColumn 的规范名称，也是候选对象使用的字段键。 */
  name: string
  /** 正式 DataColumn 类型；未知或不支持类型不会进入本字段白名单。 */
  type: string
  /** 字段展示标签；缺少正式标签时由列名回退。 */
  label: string
  /** 当前新增字段权限判定为必填时为 true，确认前须按此检查。 */
  required: boolean
  /** 当前新增规则允许空值时为 true；它不替代 DataView 的正式校验。 */
  nullable: boolean
  /** 正式字段允许的最小字符串长度；未配置时省略。 */
  minLength?: number
  /** 正式字段允许的最大字符串长度；未配置时省略。 */
  maxLength?: number
  /** 正式字段配置的数值下界；未配置时省略。 */
  min?: number
  /** 正式字段配置的数值上界；未配置时省略。 */
  max?: number
  /** 正式字段配置的字符串模式约束；未配置时省略。 */
  pattern?: string
  /** 正式输入的空白处理模式；reject 在保存时拒绝首尾空白，normalize 在保存前移除。 */
  trim?: 'reject' | 'normalize'
  /** 正式字段的枚举值与标签；候选值必须匹配其中一个 value。 */
  enumOptions?: ReadonlyArray<Readonly<{value: string; label: string}>>
}>

const SUPPORTED_TYPES = new Set([
  'number', 'int', 'integer', 'tinyint', 'decimal', 'float', 'double',
  'string', 'varchar', 'text', 'boolean', 'bool',
  'date', 'datetime', 'time', 'object', 'array', 'enum',
])

function supported(column: DataColumn): boolean {
  return SUPPORTED_TYPES.has(column.type.toLowerCase())
}

/**
 * Projects only the output DataColumn fields that are both explicitly enabled and writable for new rows.
 * A stale/unavailable query or a disabled table add action yields an empty result; the session reports that generation is unavailable.
 */
export function deriveAiDataEntryFields(view: DataView): readonly AiDataEntryField[] {
  let snapshot: ReturnType<DataView['readSnapshot']>
  try { snapshot = view.readSnapshot() } catch { return [] }
  if (view.addActionState() !== 'enabled') return []

  const output = new Set(snapshot.fields)
  const primaryKeys = new Set(view.effectivePkFields)
  const result: AiDataEntryField[] = []
  for (const column of view.columns) {
    if (!output.has(column.name) || column.allowAIAdd !== true || primaryKeys.has(column.name)
      || column.isPrimaryKey === true || column.autoIncrement === true || column.isComputed === true
      || column.computeExpression !== undefined || !supported(column)) continue
    if (view.newRowFieldAccess(column.name).write !== 'allowed') continue

    const access = view.newRowFieldAccess(column.name)
    const required = access.required
    result.push({
      name: column.name,
      type: column.type,
      label: column.label ?? column.name,
      required,
      nullable: column.allowDBNull !== false && !required,
      ...(column.minLength === undefined ? {} : {minLength: column.minLength}),
      ...(column.maxLength === undefined ? {} : {maxLength: column.maxLength}),
      ...(column.min === undefined ? {} : {min: column.min}),
      ...(column.max === undefined ? {} : {max: column.max}),
      ...(column.pattern === undefined ? {} : {pattern: column.pattern}),
      ...(column.trim === undefined ? {} : {trim: column.trim}),
      ...(column.enumOptions === undefined ? {} : {enumOptions: column.enumOptions}),
    })
  }
  return result
}

function isRecord(value: unknown): value is DataRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Reflect.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Performs fail-closed runtime checks before delegating formal constraints to DataView.validator. */
export function validateAiDataEntryValue(field: AiDataEntryField, value: unknown): void {
  if (value === null) {
    if (field.nullable) return
    throw new Error(`AI候选字段 ${field.name} 不允许为空`)
  }
  const type = field.type.toLowerCase()
  const valid = (() => {
    switch (type) {
      case 'number': case 'decimal': case 'float': case 'double':
        return typeof value === 'number' && Number.isFinite(value)
      case 'int': case 'integer': case 'tinyint':
        return typeof value === 'number' && Number.isSafeInteger(value)
      case 'string': case 'varchar': case 'text': case 'time':
        return typeof value === 'string'
      case 'boolean': case 'bool':
        return typeof value === 'boolean'
      case 'date': case 'datetime':
        return value instanceof Date ? Number.isFinite(value.getTime())
          : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))
      case 'object':
        return isRecord(value)
      case 'array':
        return Array.isArray(value)
      case 'enum':
        return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      default:
        return false
    }
  })()
  if (!valid) throw new Error(`AI候选字段 ${field.name} 的值不符合正式类型 ${field.type}`)
  if (type === 'enum' && field.enumOptions && !field.enumOptions.some(option => option.value === value)) {
    throw new Error(`AI候选字段 ${field.name} 不在正式枚举选项中`)
  }
}
