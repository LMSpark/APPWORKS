/**
 * @module @spark-appworks/spark-utils:sandbox
 * 职责：提供框架无关的 sandbox 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * 共享沙箱工具
 *
 * 供 `spark-data`（计算列表达式）和 `spark-component`（页面脚本）两个沙箱统一使用。
 * 纯 TypeScript，零框架依赖。
 * 同一 JS realm 内不是安全边界（函数 constructor 链仍可逃逸），只用于阻止脚本直接误用宿主全局。
 */

/** 拦截原型链访问的危险属性，防止 `with()` 沙箱逃逸 */
export const SANDBOX_BLOCKED_KEYS = new Set<string | symbol>([
  '__proto__', 'constructor', 'prototype',
  'globalThis', 'window', 'self', 'top', 'parent', 'frames',
  'document', 'location', 'eval', 'Function',
  'process', 'require', 'module', 'exports', 'global',
  'setTimeout', 'setInterval', 'setImmediate',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts',
  'Proxy', 'Reflect',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'navigator',
  'EventSource', 'BroadcastChannel', 'Worker', 'SharedWorker', 'open', 'opener', 'postMessage',
  'import', 'Symbol',
])

/**
 * 创建安全的沙箱代理——拦截 `with(__ctx)` 中的属性查找与写入。
 *
 * - `has`  对 SANDBOX_BLOCKED_KEYS 返回 true（阻止从原型链逃逸）
 * - `has`  对目标上已有属性返回 true
 * - `has`  其余返回 false（让 with 作用域链回退到全局，Math/Array 等安全内建可正常使用）
 * - `get`  阻断危险键，返回 undefined
 * - `set`  阻断危险键写入，返回 false
 */
export function createSafeProxy<T extends object>(target: T): T {
  const handler: ProxyHandler<T> = {
    has(t, key) {
      if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) return true
      return Reflect.has(t, key)
    },
    get(t, key, receiver) {
      if (key === Symbol.unscopables) return undefined
      if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) {
        // Allow explicit overrides on the context (e.g. safe timer wrappers)
        if (Object.prototype.hasOwnProperty.call(t, key)) {
          return Reflect.get(t, key, receiver)
        }
        return undefined
      }
      return Reflect.get(t, key, receiver)
    },
    set(t, key, value) {
      if (typeof key === 'string' && SANDBOX_BLOCKED_KEYS.has(key)) return false
      return Reflect.set(t, key, value)
    },
  }
  return new Proxy(target, handler)
}
