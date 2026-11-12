/**
 * @module @spark-appworks/spark-data:core/data-field-member
 * 职责：JSON 源字段内单个成员的严格定位、读取与合并写回。
 * 边界：只计算源字段的新值，不读写 DataView、不判断权限；编辑、取消、权限和保存差异仍沿源字段。
 */

/** 源字段内的成员路径；字符串为对象键，数字为已存在数组项下标。 */
export type DataFieldMemberPath = ReadonlyArray<string | number>
/** text 源字段保存 JSON 文本，native 源字段保存原生对象或数组。 */
export type DataFieldMemberFormat = 'text' | 'native'
/** 定位一个 JSON 源字段成员。 */
export type DataFieldMemberRef = Readonly<{
  /** 承载 JSON 的源字段，权限和保存均以此字段为准。 */
  field: string
  /** 成员路径，不能为空。 */
  path: DataFieldMemberPath
  /** 源字段存储格式，默认 text。 */
  format?: DataFieldMemberFormat
}>
/** 一次成员写入；value 为 undefined 时移除对象成员。 */
export type DataFieldMemberEdit = DataFieldMemberRef & Readonly<{value: unknown}>
type MemberContainer = Record<string, unknown> | unknown[]

function isContainer(value: unknown): value is MemberContainer {
  return typeof value === 'object' && value !== null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isContainer(value) && !Array.isArray(value)
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** JSON 成员路径算法；对象叶允许缺失，父容器必须已存在，不补建中间层。 */
export class DataFieldMember {
  /** 解析源字段；空文本、null 或 undefined 视为空对象，其它非容器值显式失败。 */
  static root(raw: unknown, format: DataFieldMemberFormat = 'text'): MemberContainer {
    if (raw === undefined || raw === null || raw === '') return {}
    let value: unknown = raw
    if (format === 'text') {
      if (typeof raw !== 'string') throw new Error('DATA_FIELD_MEMBER: 文本格式源字段必须是 JSON 字符串')
      try {value = JSON.parse(raw)}
      catch {throw new Error('DATA_FIELD_MEMBER: 源字段不是有效 JSON')}
    }
    if (!isContainer(value)) throw new Error('DATA_FIELD_MEMBER: 源字段根必须是对象或数组')
    return value
  }

  /** 返回叶所在容器；数组下标必须已存在，对象中间层必须已存在。 */
  static parent(root: MemberContainer, path: DataFieldMemberPath): MemberContainer {
    if (path.length === 0) throw new Error('DATA_FIELD_MEMBER: 成员路径不能为空')
    let current: unknown = root
    for (const [index, key] of path.entries()) {
      const last = index === path.length - 1
      if (typeof key === 'number') {
        if (!Array.isArray(current) || !Number.isSafeInteger(key) || key < 0 || !Object.hasOwn(current, key)) {
          throw new Error('DATA_FIELD_MEMBER: 成员路径不存在或类型不匹配')
        }
      } else if (!isPlainObject(current) || !last && !Object.hasOwn(current, key)) {
        throw new Error('DATA_FIELD_MEMBER: 成员路径不存在或类型不匹配')
      }
      if (last) return current
      current = Array.isArray(current) ? current[Number(key)] : current[String(key)]
    }
    throw new Error('DATA_FIELD_MEMBER: 成员路径不能为空')
  }

  /** 读取源字段成员；缺失的对象叶返回 undefined。 */
  static read(raw: unknown, member: Omit<DataFieldMemberRef, 'field'>): unknown {
    const root = this.root(raw, member.format)
    const parent = this.parent(root, member.path), key = member.path.at(-1)
    return Array.isArray(parent) ? parent[Number(key)] : parent[String(key)]
  }

  /** 两个源字段值解析后 JSON 等价；任一方不是有效 JSON 容器时视为不等价。 */
  static equivalent(left: unknown, right: unknown, format: DataFieldMemberFormat = 'text'): boolean {
    if (Object.is(left, right)) return true
    try {return sameJson(this.root(left, format), this.root(right, format))}
    catch {return false}
  }

  /**
   * 克隆源字段后替换一个成员，保留其它成员。
   * @returns 合并后的源字段值；结果与原值 JSON 等价时返回原值，避免格式差异制造编辑覆盖。
   */
  static merge(raw: unknown, edit: Omit<DataFieldMemberEdit, 'field'>): unknown {
    const format = edit.format ?? 'text'
    const original = this.root(raw, format)
    const root = this.root(JSON.stringify(original))
    const parent = this.parent(root, edit.path), key = edit.path.at(-1)
    if (edit.value === undefined) {
      if (Array.isArray(parent)) throw new Error('DATA_FIELD_MEMBER: 数组项不能移除')
      Reflect.deleteProperty(parent, String(key))
    } else {
      if (typeof edit.value === 'function' || typeof edit.value === 'symbol') throw new Error('DATA_FIELD_MEMBER: 成员值不是有效 JSON')
      const serialized = JSON.stringify(edit.value)
      Object.defineProperty(parent, String(key), {value: JSON.parse(serialized), enumerable: true, writable: true, configurable: true})
    }
    if (sameJson(root, original)) return raw
    if (format === 'native') return root
    return JSON.stringify(root)
  }
}
