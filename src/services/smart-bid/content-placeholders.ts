/**
 * @module app:services/smart-bid/content-placeholders
 * 职责：按投标业务规格§1.2核正文占位名与数据键一一对应。
 * 边界：只核引用形状和键存在性；数据类型、事实版本及授权另行验证，不展开正文。
 */

/** 读取原文中的精确有效占位名与语法错误，供编辑布局和正式校验共用。 */
export function inspectContentPlaceholders(value:string):Readonly<{names:readonly string[];errors:readonly string[]}> {
  const errors: string[] = [], names = new Set<string>()
  let offset = 0
  while (offset < value.length) {
    const start = value.indexOf('{{', offset), strayEnd = value.indexOf('}}', offset)
    if (strayEnd !== -1 && (start === -1 || strayEnd < start)) {
      errors.push('INVALID_PLACEHOLDER'); offset = strayEnd + 2; continue
    }
    if (start === -1) break
    const end = value.indexOf('}}', start + 2)
    if (end === -1) {errors.push('INVALID_PLACEHOLDER'); break}
    const name = value.slice(start + 2, end)
    if (name.length === 0 || Array.from(name).length > 64 || name.trim() !== name || /[{}\p{Cc}]/u.test(name)) errors.push('INVALID_PLACEHOLDER')
    else names.add(name)
    offset = end + 2
  }
  return Object.freeze({names:Object.freeze([...names]),errors:Object.freeze(errors)})
}
/** 检查占位名称及数据键覆盖；返回缺项，不改变原文或原数据。 */
export function validateContentPlaceholders(input: Readonly<{value: string; data: Readonly<Record<string, unknown>>}>): string[] {
  const parsed=inspectContentPlaceholders(input.value),names=new Set(parsed.names),errors=[...parsed.errors]
  for (const name of names) if (!Object.hasOwn(input.data, name)) errors.push(`MISSING_DATA:${name}`)
  for (const name of Object.keys(input.data)) if (!names.has(name)) errors.push(`UNUSED_DATA:${name}`)
  return errors
}
