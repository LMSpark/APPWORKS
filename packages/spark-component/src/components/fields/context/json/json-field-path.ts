/**
 * @module @spark-appworks/spark-component:components/fields/context/json/json-field-path
 * 职责：标准字段共用的严格JSON子路径定位和不可变写回。
 * 边界：不读写DataView、不推导业务节点身份，不建立草稿或持久化入口。
 * AI用途：JSON与过滤字段在同一原字段中合并最新兄弟成员。
 */
import {asJsonValue, isJsonObject, parseJsonDocument, type JsonPath, type JsonValue} from '@spark-appworks/spark-json-document'

/** 标准JSON字段的原值路径算法；只允许已存在的父容器。 */
export class JsonFieldPath {
  /** native读取原生JSON，非native解析JSON文本；根必须是对象或数组。 */
  static root(raw: unknown, native = true) {
    const value = native ? asJsonValue(raw) : parseJsonDocument(String(raw))
    if (!Array.isArray(value) && !isJsonObject(value)) throw new Error('JSON路径的根必须是对象或数组')
    return value
  }

  /** 严格校验每个索引与自有属性；可选叶只允许对象成员缺失，不补父对象或数组项。 */
  static parent(root: JsonValue, path: JsonPath, optionalLeaf = false) {
    let current = root
    for (const [index, key] of path.entries()) {
      if (typeof key === 'number') {
        if (!Array.isArray(current) || !Number.isSafeInteger(key) || key < 0 || !Object.hasOwn(current, key)) throw new Error('JSON路径不存在或类型不匹配')
        if (index === path.length - 1) return current
        const next = current[key]
        if (next === undefined) throw new Error('JSON路径不存在或类型不匹配')
        current = next
      } else {
        if (!isJsonObject(current) || !Object.hasOwn(current, key) && !(optionalLeaf && index === path.length - 1)) throw new Error('JSON路径不存在或类型不匹配')
        if (index === path.length - 1) return current
        const next = current[key]
        if (next === undefined) throw new Error('JSON路径不存在或类型不匹配')
        current = next
      }
    }
    throw new Error('JSON路径不能为空')
  }

  /** 读取叶值；可选的缺失对象成员返回undefined。 */
  static read(root: JsonValue, path: JsonPath, optionalLeaf = false): JsonValue | undefined {
    const parent = this.parent(root, path, optionalLeaf)
    return Array.isArray(parent) ? parent[Number(path.at(-1))] : parent[String(path.at(-1))]
  }

  /** 克隆最新原字段后修改一个叶值；undefined只移除对象成员。 */
  static replace(raw: unknown, path: JsonPath, value: unknown, optionalLeaf = false) {
    const root = parseJsonDocument(JSON.stringify(this.root(raw))), parent = this.parent(root, path, optionalLeaf)
    const key = path.at(-1)
    if (key === undefined) throw new Error('JSON路径不能为空')
    if (value === undefined) {
      if (Array.isArray(parent)) throw new Error('JSON数组项不能写入undefined')
      Reflect.deleteProperty(parent, String(key))
    } else {
      const next = asJsonValue(value)
      if (next === null && value !== null) throw new Error('输入超出有效JSON值范围')
      Object.defineProperty(parent, key, {value: next, enumerable: true, writable: true, configurable: true})
    }
    return root
  }

  /** 原叶之外的所属对象结构，用于拒绝路径重排后指向另一节点的旧回调。 */
  static identity(root: JsonValue, path: JsonPath): string {
    const parent = this.parent(root, path, true), key = String(path.at(-1))
    return JSON.stringify(Object.fromEntries(Object.entries(parent).filter(([name]) => name !== key)))
  }
}
