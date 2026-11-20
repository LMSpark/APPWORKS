/**
 * @module @spark-appworks/spark-data:core/event-emitter
 * 职责：提供数据层 event-emitter 能力，围绕 模块入口、副作用注册或内部组合逻辑 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 core/event-emitter 的数据语义。
 */
import type { SparkEventEmitter } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): SparkEventEmitter<TEventMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  return {
    on(event, handler) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit(event, ...args) {
      const handlers = listeners.get(event)
      if (!handlers) return
      for (const handler of handlers) {
        handler(...args)
      }
    },
    removeAllListeners(event) {
      if (event !== undefined) {
        listeners.delete(event)
        return
      }
      listeners.clear()
    },
    listenerCount(event) {
      if (event !== undefined) return listeners.get(event)?.size ?? 0
      let total = 0
      for (const handlers of listeners.values()) {
        total += handlers.size
      }
      return total
    },
  }
}
