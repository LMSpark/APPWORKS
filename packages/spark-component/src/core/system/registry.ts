/**
 * @module @spark-appworks/spark-component:core/system/registry
 * 职责：提供 registry 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * SPARK 组件注册表
 *
 * - `createComponentRegistry()` 创建隔离实例（测试/多实例）
 * - `getGlobalRegistry()` 返回应用级单例
 *
 */

import { Logger } from '@spark-appworks/spark-utils'
import type {
  ComponentRegistry,
  ComponentDefinition,
  ComponentRegistrationArgs,
  ComponentRegistrationInput,
} from '../types.js'

const logger = Logger('Spark:Registry')

function shouldLogRegistryDetails(): boolean {
  if (typeof globalThis === 'undefined') return false
  return Reflect.get(globalThis, '__SPARK_DEBUG_REGISTRY__') === true
}

/* -------------------------------------------------------------------------- */

let _globalRegistry: ComponentRegistry | undefined

/** 获取全局注册表单例（惰性创建）。 */
export function getGlobalRegistry(): ComponentRegistry {
  _globalRegistry ??= createComponentRegistry()
  return _globalRegistry
}

/* -------------------------------------------------------------------------- */

/** 构造 ComponentDefinition，合并可选 meta。 */
function createDefinition(
  type: string,
  component: unknown,
  meta?: Record<string, unknown>
): ComponentDefinition {
  const def: ComponentDefinition = { type, component }
  if (meta !== undefined) def.meta = meta
  return def
}

function assertResolvedComponent(type: string, component: unknown): void {
  if (typeof component === 'string') {
    throw new Error(
      `[Spark] register("${type}") received a string component. `
      + 'Path-string registration has been removed; import the component or wrap a loader with defineAsyncComponent() before registering.'
    )
  }

  if (typeof component === 'function') {
    throw new Error(
      `[Spark] register("${type}") received a function component. `
      + 'Function registration has been removed; register a component object or wrap async loaders with defineAsyncComponent().'
    )
  }
}

function normalizeRegistration(args: ComponentRegistrationArgs): ComponentRegistrationInput {
  if (typeof args[0] === 'string') {
    const [type, component, meta, options] = args
    return { type, component, meta, options }
  }
  return args[0]
}

/**
 * 创建隔离的组件注册表实例。
 * 需要全局注册表请用 `getGlobalRegistry()`。
 */
export function createComponentRegistry(): ComponentRegistry {
  const components = new Map<string, ComponentDefinition>()

  return {
    /**
     * 注册组件，若 type 已存在则覆盖并打 warn。
     * `options.silent = true` 时静默覆盖（HMR 场景）。
     */
    register(...args: ComponentRegistrationArgs): void {
      const { type, component, meta, options } = normalizeRegistration(args)
      if (!type) throw new Error('Component type is required')
      assertResolvedComponent(type, component)
      if (components.has(type) && !options?.silent) logger.warn(`Overwriting component: ${type}`)
      components.set(type, createDefinition(type, component, meta))
      if (!options?.silent && shouldLogRegistryDetails()) logger.debug(`Registered: ${type}`)
    },

    /** 按 type 获取组件定义，不存在返回 undefined。 */
    get(type: string): ComponentDefinition | undefined {
      return components.get(type)
    },

    /** 检查 type 是否已注册。 */
    has(type: string): boolean {
      return components.has(type)
    },

    /** 移除组件，返回是否存在（存在才移除）。 */
    unregister(type: string): boolean {
      const existed = components.delete(type)
      if (existed && shouldLogRegistryDetails()) logger.debug(`Unregistered: ${type}`)
      return existed
    },

    /** 返回所有已注册组件的只读 Map（直接暴露内部引用，零拷贝）。
     *  调用方不得修改（TypeScript ReadonlyMap 保证编译期安全）。 */
    getAll(): ReadonlyMap<string, ComponentDefinition> {
      return components
    }
  }
}

