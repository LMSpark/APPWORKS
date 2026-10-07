/**
 * @module @spark-appworks/spark-app:shell/plugins/registry
 * 职责：提供 spark-app 应用壳中的 registry 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 插件管理系统
 *
 * 提供统一的插件注册、配置和加载机制
 */

import type { Plugin } from 'vue'
import { createLogger } from '../../logger'
import { toError } from '@spark-appworks/spark-utils'

const pluginLogger = createLogger('plugins')

/**
 * 插件配置项
 */
export type PluginConfigItem = {
  /** 是否启用 */
  enabled: boolean
  /** 插件选项 */
  options?: Record<string, unknown>
  /** 是否懒加载 */
  lazy?: boolean
  /** 优先级（数字越小越先加载） */
  priority?: number}

/**
 * 插件配置类型（支持简单布尔值或详细配置）
 */
// 这里不再为 JS 基础类型保留导出别名，插件配置直接使用 boolean | PluginConfigItem。

/**
 * 插件加载器定义
 */
export type PluginLoader = {
  /** 插件 ID */
  id: string
  /** 插件名称 */
  name: string
  /** 模块路径或包名 */
  module: string
  /** 动态导入函数 */
  loader: () => Promise<{ default: Plugin }>
  /** 默认配置 */
  defaultOptions?: Record<string, unknown>
  /** 插件描述 */
  description?: string
  /** 插件版本 */
  version?: string}

/**
 * 插件实例（加载后的结果）
 */
export type PluginInstance = {
  /** 插件对象 */
  plugin: Plugin
  /** 插件选项 */
  options?: Record<string, unknown>
  /** 加载器信息 */
  loader: PluginLoader}

/** Plugin Registry 的语义模型。 */
export class PluginRegistry {
  private readonly loaders = new Map<string, PluginLoader>()

    /** 执行 register 操作。 */
register(id: string, loader: Omit<PluginLoader, 'id'>): void {
    if (this.loaders.has(id)) {
      pluginLogger.warn(`Plugin "${id}" already registered, will be overwritten`)
    }
    this.loaders.set(id, { id, ...loader })
  }

    /** 执行 register All 操作。 */
registerAll(entries: Record<string, Omit<PluginLoader, 'id'>> | null | undefined): void {
    if (entries === null || entries === undefined) return
    for (const [id, loader] of Object.entries(entries)) {
      this.register(id, loader)
    }
  }

    /** 执行 get 操作。 */
get(id: string): PluginLoader | undefined {
    return this.loaders.get(id)
  }

    /** 执行 has 操作。 */
has(id: string): boolean {
    return this.loaders.has(id)
  }

    /** 读取 All。 */
getAll(): PluginLoader[] {
    return Array.from(this.loaders.values())
  }

    /** 读取 All Ids。 */
getAllIds(): string[] {
    return Array.from(this.loaders.keys())
  }

    /** 执行 unregister 操作。 */
unregister(id: string): boolean {
    return this.loaders.delete(id)
  }

    /** 执行 clear 操作。 */
clear(): void {
    this.loaders.clear()
  }

    /** 读取 Stats。 */
getStats(): { total: number; plugins: string[] } {
    return { total: this.loaders.size, plugins: Array.from(this.loaders.keys()) }
  }
}

/**
 * 创建隔离的插件注册表实例（测试 / 微前端场景）
 */
export function createPluginRegistry(): PluginRegistry {
  return new PluginRegistry()
}

/** 全局插件注册表单例（惰性创建） */
let _globalPluginRegistry: PluginRegistry | undefined

/** 获取全局插件注册表单例 */
export function getGlobalPluginRegistry(): PluginRegistry {
  _globalPluginRegistry ??= createPluginRegistry()
  return _globalPluginRegistry
}

/**
 * 插件管理器 - 负责加载和管理插件生命周期
 */
export class PluginManager {
  /**
   * 从加载器构建插件实例（loadPlugins / loadPlugin 共用）
   */
  private static async createInstance(
    loader: PluginLoader,
    configOptions?: Record<string, unknown>
  ): Promise<PluginInstance> {
    const module = await loader.loader()
    return {
      plugin: module.default,
      options: { ...loader.defaultOptions, ...configOptions },
      loader
    }
  }

  /**
   * 根据配置加载插件
   *
   * @param pluginConfigs - 插件配置对象
   * @param registry - 可选的插件注册表实例（默认使用全局注册表）
   * @returns 插件实例数组（按优先级排序）
   */
  static async loadPlugins(
    pluginConfigs: Record<string, boolean | PluginConfigItem> | null | undefined,
    registry: PluginRegistry = getGlobalPluginRegistry()
  ): Promise<PluginInstance[]> {
    const plugins: PluginInstance[] = []
    const safePluginConfigs = pluginConfigs ?? {}

    // 1. 标准化配置并按优先级排序
    const normalizedConfigs = Object.entries(safePluginConfigs)
      .map(([id, config]) => {
        const normalized = this.normalizeConfig(config)
        const loader = registry.get(id)

        return {
          id,
          config: normalized,
          loader,
          priority: normalized.priority ?? 100
        }
      })
      .filter(item => item.config.enabled === true && item.loader !== undefined)
      .sort((a, b) => a.priority - b.priority)

    // 2. 并行加载插件（按优先级分批）
    pluginLogger.info(`Loading ${normalizedConfigs.length} plugins...`)

    for (const { id, config, loader } of normalizedConfigs) {
      if (!loader) continue

      try {
        pluginLogger.info(`Loading plugin: ${loader.name} (${id})`)

        const instance = await PluginManager.createInstance(loader, config.options)
        plugins.push(instance)

        pluginLogger.info(`Plugin loaded: ${loader.name}`)
      } catch (error) {
        pluginLogger.error(`Failed to load plugin "${id}"`, toError(error))
      }
    }

    pluginLogger.info(`Successfully loaded ${plugins.length} plugins`)

    return plugins
  }

  /**
   * 加载单个插件
   *
   * @param id - 插件 ID
   * @param config - 插件配置
   * @param registry - 可选的插件注册表实例（默认使用全局注册表）
   */
  static async loadPlugin(
    id: string,
    config: boolean | PluginConfigItem = { enabled: true },
    registry: PluginRegistry = getGlobalPluginRegistry()
  ): Promise<PluginInstance | null> {
    const normalized = this.normalizeConfig(config)

    if (!normalized.enabled) {
      return null
    }

    const loader = registry.get(id)
    if (!loader) {
      pluginLogger.warn(`Plugin "${id}" not registered`)
      return null
    }

    try {
      pluginLogger.info(`Loading plugin: ${loader.name}`)
      return await PluginManager.createInstance(loader, normalized.options)
    } catch (error) {
      pluginLogger.error(`Failed to load plugin "${id}"`, toError(error))
      return null
    }
  }

  /**
   * 标准化插件配置
   */
  private static normalizeConfig(config: boolean | PluginConfigItem): PluginConfigItem {
    if (typeof config === 'boolean') {
      return { enabled: config }
    }
    return config
  }
}

/**
 * 便捷函数：创建插件注册器
 *
 * @param registry - 可选的插件注册表实例（默认使用全局注册表）
 *
 * @example
 * ```typescript
 * const register = createPluginRegister()
 * register('my-plugin', {
 *   name: 'My Plugin',
 *   module: './plugins/my-plugin',
 *   loader: () => import('./plugins/my-plugin')
 * })
 * ```
 */
export function createPluginRegister(registry: PluginRegistry = getGlobalPluginRegistry()) {
  return {
    register: (id: string, loader: Omit<PluginLoader, 'id'>) => {
      registry.register(id, loader)
    },
    registerAll: (loaders: Record<string, Omit<PluginLoader, 'id'>>) => {
      registry.registerAll(loaders)
    }
  }
}

