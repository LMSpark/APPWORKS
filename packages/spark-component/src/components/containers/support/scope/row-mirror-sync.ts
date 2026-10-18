/**
 * @module @spark-appworks/spark-component:components/containers/support/scope/row-mirror-sync
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/row-mirror-sync 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/row-mirror-sync 的声明、导出和使用边界时，从本模块开始。
 */
import {isDataRow, type DataRow} from '@spark-appworks/spark-data'
import {toRaw} from 'vue'

const ROW_SOURCE = Symbol('spark-render-row-source')

/** 解析标准容器行镜像保留的原对象身份；普通同主键副本不被认定为原行。 */
export function resolveReactiveRow(row: DataRow | null | undefined): DataRow | null {
  if (!row) return null
  const raw = toRaw(row)
  const source: unknown = Reflect.get(row, ROW_SOURCE)
  if (!Object.hasOwn(raw, ROW_SOURCE)) return row
  return isDataRow(source) ? source : null
}

export function syncReactiveRow(
  target: DataRow,
  source: DataRow | null | undefined,
  preserveIdentity = false,
): void {
  // 仅为标准容器的现有渲染镜像保留对象引用，不复制权限、值或草稿；Symbol不进入业务序列化。
  if (preserveIdentity || source && Object.hasOwn(toRaw(source), ROW_SOURCE)) {
    if (!Object.hasOwn(toRaw(target), ROW_SOURCE)) {
      Object.defineProperty(toRaw(target), ROW_SOURCE, {value: undefined, configurable: true, writable: true})
    }
    // 属性保持非枚举，但身份读写必须经过Vue代理；相同字段值也可能属于新查询返回的另一行。
    Reflect.set(target, ROW_SOURCE, resolveReactiveRow(source))
  } else Reflect.deleteProperty(target, ROW_SOURCE)
  const incoming = source ?? {}
  const incomingKeys = new Set(Object.keys(incoming))

  for (const key of Object.keys(target)) {
    if (!incomingKeys.has(key)) {
      target[key] = undefined
    }
  }

  for (const key of incomingKeys) {
    if (target[key] !== incoming[key]) {
      target[key] = incoming[key]
    }
  }
}
