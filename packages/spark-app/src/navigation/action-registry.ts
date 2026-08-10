/**
 * @module @spark-appworks/spark-app:navigation/action-registry
 * 职责：提供应用壳层 action-registry 能力，围绕 NavigationActionContext、NavigationActionHandler、NavigationActionRegistry 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/action-registry。
 */
import type { InjectionKey } from 'vue'
import type { RuntimeNavigationItem } from './runtime-navigation'

/** Navigation Action Context 的运行上下文。 */
export type NavigationActionContext = {
    /** command 字段。 */
command: string
    /** node 字段。 */
node?: RuntimeNavigationItem
    /** 来源对象。 */
source?: 'navigation' | 'toolbar' | 'user-menu' | 'app-shell'}

/** Navigation Action Handler 的回调函数契约。 */
export type NavigationActionHandler = {
  (context: NavigationActionContext): void | Promise<void>}

/** Navigation Action Registry 的语义模型。 */
export type NavigationActionRegistry = {
  /** 注册 command 到 handler 的映射；返回卸载函数，调用即反注册；重复注册会覆盖 */
  register(command: string, handler: NavigationActionHandler): () => void
  /** 按 command 取消注册；返回是否实际移除（command 不存在时返回 false） */
  unregister(command: string): boolean
  /** 检查 command 是否已注册 */
  has(command: string): boolean
  /** 按 command 查找并执行 handler；context 会与 command 合并为完整 NavigationActionContext；未注册时返回 false */
  execute(command: string, context?: Omit<NavigationActionContext, 'command'>): Promise<boolean>
  /** 返回当前所有已注册的 command 标识列表 */
  getCommands(): string[]}

function normalizeCommand(command: string): string {
  return command.trim()
}

export function createNavigationActionRegistry(): NavigationActionRegistry {
  const handlers = new Map<string, NavigationActionHandler>()

  return {
    register(command, handler) {
      const normalized = normalizeCommand(command)
      if (normalized === '') {
        throw new Error('[NavigationActionRegistry] command is required')
      }
      handlers.set(normalized, handler)
      return () => {
        if (handlers.get(normalized) === handler) {
          handlers.delete(normalized)
        }
      }
    },
    unregister(command) {
      return handlers.delete(normalizeCommand(command))
    },
    has(command) {
      return handlers.has(normalizeCommand(command))
    },
    async execute(command, context = {}) {
      const normalized = normalizeCommand(command)
      const handler = handlers.get(normalized)
      if (handler === undefined) return false
      await handler({ ...context, command: normalized })
      return true
    },
    getCommands() {
      return Array.from(handlers.keys())
    },
  }
}

export const NAVIGATION_ACTION_REGISTRY_KEY: InjectionKey<NavigationActionRegistry> = Symbol('spark-navigation-actions')
