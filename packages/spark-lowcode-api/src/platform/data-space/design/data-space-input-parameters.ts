/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/design/data-space-input-parameters
 * 职责：解释数据库 inputParams 声明并校验编辑结果。
 * 边界：保留旧项与未知属性，不管理调用值、权限或持久化。
 * AI用途：复用声明编辑合同，避免页面与设计会话各自规范化。
 */
import {isRecord} from '@spark-appworks/spark-utils'

/** 声明行的纯编辑适配；所有写入仍由绑定字段及原DataSet承接。 */
export type InputParameterRowAdapter = {
  read: (original: Readonly<Record<string, unknown>>) => Record<string, unknown>
  write: (value: Readonly<Record<string, unknown>>, original: Readonly<Record<string, unknown>> | undefined) => Record<string, unknown>
  canEdit: (original: Readonly<Record<string, unknown>> | undefined) => boolean
}

/** 空间参数声明的纯数据规则，由设计门面和元数据消费者复用。 */
export class DataSpaceInputParameters {
  /** 旧字段仅作读取兼容；确认时只合并实际修改的成员，不改未编辑项或旧ID属性。 */
  static rowAdapter(): InputParameterRowAdapter {
    const cryptoApi = (): Crypto | undefined => (globalThis as {crypto?: Crypto}).crypto
    const read = (original: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
      Name: original['Name'] ?? original['name'] ?? '',
      Description: original['Description'] ?? original['description'] ?? '',
      IsBusParam: Boolean(original['IsBusParam']),
    })
    return {read, canEdit: original => !!original && !!this.identity(original)
      || typeof cryptoApi()?.getRandomValues === 'function',
    write: (value, original) => {
      const initial = read(original ?? {})
      const next = original ? this.read([original])[0] : {...initial}
      if (!next) throw new Error('输入参数原记录不可用')
      for (const field of ['Name', 'Description', 'IsBusParam']) {
        if (typeof value[field] !== (field === 'IsBusParam' ? 'boolean' : 'string')) throw new Error('输入参数编辑值类型无效')
        if (value[field] !== initial[field]) next[field] = value[field]
      }
      if (!this.identity(next)) {
        const secureCrypto = cryptoApi()
        if (!secureCrypto || typeof secureCrypto.getRandomValues !== 'function') throw new Error('当前环境不能安全生成输入参数 ID')
        const bytes = secureCrypto.getRandomValues(new Uint8Array(16))
        next['rowid'] = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
      }
      return next
    }}
  }
  private static json(value: unknown): string {
    const ancestors = new Set<object>()
    const visit = (item: unknown): void => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint'
        || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('输入参数必须是 JSON 数据')
      if (item === null || typeof item !== 'object') return
      if ((!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
        || ancestors.has(item)) throw new Error('输入参数必须是无循环的 JSON 数据')
      ancestors.add(item)
      for (const child of Array.isArray(item) ? item : Object.values(item)) visit(child)
      ancestors.delete(item)
    }
    visit(value)
    return JSON.stringify(value)
  }

  private static identity(item: Record<string, unknown>): string {
    const values = ['rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id']
      .filter(key => Object.hasOwn(item, key)).map(key => item[key]).filter(value => value !== null && value !== undefined && value !== '')
    const identities = new Set<string>()
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim()) throw new Error('输入参数 ID 类型无效')
      identities.add(value.trim())
    }
    if (identities.size > 1) throw new Error('输入参数存在冲突的 ID 别名')
    return [...identities][0] ?? ''
  }

  /** 读取声明副本；editable 校验旧编辑器已有的对象、身份及字段类型边界，不补默认值。 */
  static read(value: unknown, editable = false): Array<Record<string, unknown>> {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return []
    let parsed: unknown
    try { parsed = JSON.parse(typeof value === 'string' ? value : this.json(value)) } catch {
      throw new Error('输入参数不是有效 JSON 数据')
    }
    if (!Array.isArray(parsed)) throw new Error('输入参数必须是数组')
    const items: Array<Record<string, unknown>> = []
    const ids = new Set<string>()
    for (const [index, item] of parsed.entries()) {
      if (!isRecord(item)) throw new Error('输入参数项必须是对象')
      if (editable) {
        const id = this.identity(item)
        if (id && ids.has(id)) throw new Error(`第${index + 1}项输入参数 ID 重复`)
        if (id) ids.add(id)
        for (const key of ['Name', 'name', 'Description', 'description']) {
          if (Object.hasOwn(item, key) && typeof item[key] !== 'string') throw new Error(`第${index + 1}项名称或描述类型无效`)
        }
      }
      items.push(item)
    }
    return items
  }

  private static comparable(item: Record<string, unknown>): unknown {
    const known = ['Name', 'name', 'Description', 'description', 'IsBusParam', 'rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id']
    const extra = Object.fromEntries(Object.entries(item).filter(([key]) => !known.includes(key)))
    const name = typeof item['Name'] === 'string' ? item['Name'] : item['name']
    const description = typeof item['Description'] === 'string' ? item['Description'] : item['description']
    return {id: this.identity(item), name: typeof name === 'string' ? name.trim() : '',
      description: typeof description === 'string' ? description.trim() : '', isBusParam: Boolean(item['IsBusParam']), extra: JSON.stringify(extra)}
  }

  /** 校验拟保存声明；只规范化改动项，无语义变化时返回原声明副本，调用方保留原始字节。 */
  static prepare(value: unknown, original: unknown): {items: Array<Record<string, unknown>>; changed: boolean} {
    const items = this.read(value, true)
    const baseline = this.read(original)
    if (JSON.stringify(items) === JSON.stringify(baseline)) return {items: baseline, changed: false}
    const used = new Set<number>()
    const finalized = items.map((item, index) => {
      const id = this.identity(item)
      const originalIndex = baseline.findIndex((candidate, candidateIndex) => !used.has(candidateIndex)
        && (id ? this.identity(candidate) === id : !this.identity(candidate) && JSON.stringify(candidate) === JSON.stringify(item)))
      if (originalIndex >= 0) {
        used.add(originalIndex)
        if (JSON.stringify(item) === JSON.stringify(baseline[originalIndex])) return item
      }
      if (!id && originalIndex < 0) throw new Error(`第${index + 1}项输入参数缺少稳定身份`)
      const name = typeof item['Name'] === 'string' ? item['Name'] : item['name']
      if (typeof name !== 'string' || !name.trim()) throw new Error(`第${index + 1}项名称不能为空`)
      const description = typeof item['Description'] === 'string' ? item['Description'] : item['description']
      return {...item, Name: name.trim(), Description: typeof description === 'string' ? description.trim() : '', IsBusParam: Boolean(item['IsBusParam'])}
    })
    const unchanged = finalized.length === baseline.length && finalized.every((item, index) => {
      const other = baseline[index]
      return other !== undefined && JSON.stringify(this.comparable(item)) === JSON.stringify(this.comparable(other))
    })
    if (unchanged) return {items: baseline, changed: false}
    const names = new Set<string>()
    for (const item of finalized) {
      const name = typeof item['Name'] === 'string' ? item['Name'] : item['name']
      if (typeof name !== 'string' || !name.trim()) continue
      if (names.has(name.trim())) throw new Error(`输入参数名称重复：${name.trim()}`)
      names.add(name.trim())
    }
    return {items: finalized, changed: true}
  }
}
