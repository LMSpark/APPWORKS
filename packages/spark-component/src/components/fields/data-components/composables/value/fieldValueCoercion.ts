/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/value/fieldValueCoercion
 * 职责：提供 fieldValueCoercion（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 field value coercion 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
// 这里不再为 JS 基础类型保留导出别名，字段值归一化结果直接使用原生联合类型。

export function coerceStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export function coerceNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === null || value === undefined || value === '') return 0
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function coerceBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === 'true' || value === '1'
  return false
}

export function coerceNullableBooleanValue(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null
  return coerceBooleanValue(value)
}

export function coercePrimitiveOptionValue(value: unknown): string | number {
  return typeof value === 'string' || typeof value === 'number' ? value : ''
}

export function coercePrimitiveOptionArray(value: unknown): Array<string | number | boolean> {
  if (!Array.isArray(value)) return []
  return value.filter(isPrimitiveOptionValue)
}

export function coerceStringNumberArray(value: unknown): Array<string | number> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
}

export function coerceTreeSelectValue(value: unknown): string | number | boolean | Array<string | number | boolean> {
  if (isPrimitiveOptionValue(value)) return value
  return coercePrimitiveOptionArray(value)
}

export function coerceCascaderValue(value: unknown): Array<string | number | boolean> | Array<Array<string | number | boolean>> {
  if (!Array.isArray(value)) return []
  if (value.every(isPrimitiveOptionValue)) return value
  return value.filter(isPrimitiveOptionPath)
}

export function coerceDateFieldValue(value: unknown): string | Date | Array<string | Date> {
  if (typeof value === 'string' || value instanceof Date) return value
  if (Array.isArray(value)) return value.filter((item): item is string | Date => typeof item === 'string' || item instanceof Date)
  return ''
}

export function coerceStringOrDateValue(value: unknown): string | Date {
  if (typeof value === 'string' || value instanceof Date) return value
  return String(value ?? '')
}

export function coerceNumberRangeValue(value: unknown): number | [number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    const start = coerceOptionalNumberValue(value[0])
    const end = coerceOptionalNumberValue(value[1])
    return [start, end]
  }
  return coerceNumberValue(value)
}

function coerceOptionalNumberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

function isPrimitiveOptionValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isPrimitiveOptionPath(value: unknown): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every(isPrimitiveOptionValue)
}
