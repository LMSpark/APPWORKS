/**
 * @module @spark-appworks/spark-component:page/context/page-component-registry
 * 职责：维护 @spark-appworks/spark-component 中 page/context/page-component-registry 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 page/context/page-component-registry 的声明、导出和使用边界时，从本模块开始。
 */
import type {
  PageComponentApiEntry,
  PageComponentRegistry,
} from '../../core/capability-keys.js'
import type { ComponentInstanceSnapshot } from '@spark-appworks/spark-utils'

export function createPageComponentRegistry(): PageComponentRegistry {
  const instanceMap = new Map<string, ComponentInstanceSnapshot>()
  const instanceRefCount = new Map<string, number>()
  const apiMap = new Map<string, PageComponentApiEntry>()

  function listInstances(type?: string): ComponentInstanceSnapshot[] {
    if (type === undefined || type.trim().length === 0) {
      return Array.from(instanceMap.values())
    }
    return Array.from(instanceMap.values()).filter(item => item.type === type)
  }

  function listApis(type?: string): PageComponentApiEntry[] {
    if (type === undefined || type.trim().length === 0) {
      return Array.from(apiMap.values())
    }
    return Array.from(apiMap.values()).filter(item => item.type === type)
  }

  function getApi<T = unknown>(id: string): T | null
  function getApi(id: string): unknown {
    return apiMap.get(id)?.api ?? null
  }

  function getApisByType<T = unknown>(type: string): T[]
  function getApisByType(type: string): unknown[] {
    return listApis(type).map(item => item.api)
  }

  return {
    registerInstance(entry) {
      const normalized = entry.props === undefined
        ? { id: entry.id, type: entry.type }
        : { id: entry.id, type: entry.type, props: entry.props }
      instanceMap.set(entry.id, normalized)
      const count = instanceRefCount.get(entry.id) ?? 0
      instanceRefCount.set(entry.id, count + 1)
    },
    unregisterInstance(id) {
      const count = instanceRefCount.get(id) ?? 0
      if (count <= 1) {
        instanceRefCount.delete(id)
        instanceMap.delete(id)
        apiMap.delete(id)
        return
      }
      instanceRefCount.set(id, count - 1)
    },
    listInstances,
    getInstance(id) {
      return instanceMap.get(id) ?? null
    },

    registerApi(entry) {
      apiMap.set(entry.id, {
        id: entry.id,
        type: entry.type,
        api: entry.api,
      })
    },
    unregisterApi(id) {
      apiMap.delete(id)
    },
    listApis,
    getApi,
    getApisByType,
  }
}
