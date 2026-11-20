/**
 * @module @spark-appworks/spark-utils:internal/guards
 * 职责：提供框架无关的 guards 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * SPARK 类型守卫（基础层）。
 *
 * 所有包的类型守卫 SSoT，按使用频率分为两级：
 * - 根出口（@spark-appworks/spark-utils）：isRecord、isObject、isCallable
 * - /internal 出口：全部守卫，包括扩展的 read*Property 系列
 */

// ═══════════════════════════════════════════════════════════════
// 基础类型守卫
// ═══════════════════════════════════════════════════════════════

/** 判定值为 Record<string, unknown>（普通对象，排除数组和 null）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判定值为 object 类型（含数组，排除 null）。 */
export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

/** 判定值为可调用函数。 */
export function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

// ═══════════════════════════════════════════════════════════════
// 属性读取（仅自有属性，不触碰原型链）
// ═══════════════════════════════════════════════════════════════

/** 读取自有属性值（不触碰原型链）。 */
export function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

/** 沿原型链读取属性值；用于必须接受 class 实例或框架对象的边界。 */
export function readPrototypeProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined
  let current: object | null = value
  while (current !== null) {
    const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor !== undefined) return descriptor.value
    const prototype: unknown = Object.getPrototypeOf(current)
    current = prototype !== null && typeof prototype === 'object' ? prototype : null
  }
  return undefined
}

/** 拷贝对象自有可枚举属性到普通 Record，排除 null、数组和基础类型。 */
export function copyOwnEnumerableProperties(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const record: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    record[key] = item
  }
  return record
}

/** 读取 string 类型自有属性。 */
export function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : undefined
}

/** 读取非空 string 类型自有属性；只校验 trim 后非空，返回原始字符串。 */
export function readNonEmptyStringProperty(value: unknown, key: string): string | undefined {
  const property = readStringProperty(value, key)
  return property !== undefined && property.trim() !== '' ? property : undefined
}

/** 读取 number 类型自有属性。 */
export function readNumberProperty(value: unknown, key: string): number | undefined {
  const property = readProperty(value, key)
  return typeof property === 'number' ? property : undefined
}

/** 读取 boolean 类型自有属性。 */
export function readBooleanProperty(value: unknown, key: string): boolean | undefined {
  const property = readProperty(value, key)
  return typeof property === 'boolean' ? property : undefined
}

/** 判定值为 string[]。 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** 读取 string[] 类型自有属性。 */
export function readStringArrayProperty(value: unknown, key: string): string[] | undefined {
  const property = readProperty(value, key)
  return isStringArray(property) ? property : undefined
}
