/**
 * @module @spark-appworks/spark-app:shell/plugins/presets
 * 职责：提供 spark-app 应用壳中的 presets 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 内置插件预设
 *
 * 提供常用 UI 框架的插件加载器
 */

import type { Plugin } from 'vue'
import { getGlobalPluginRegistry } from './registry'
import { isRecord } from '@spark-appworks/spark-utils'
import { readProperty } from '@spark-appworks/spark-utils/internal'

function isVuePlugin(value: unknown): value is Plugin {
  return typeof value === 'function'
    || (isRecord(value) && typeof readProperty(value, 'install') === 'function')
}

function requireDefaultPlugin(module: unknown, moduleName: string): { default: Plugin } {
  const defaultExport = readProperty(module, 'default')
  if (isVuePlugin(defaultExport)) return { default: defaultExport }
  if (isVuePlugin(module)) return { default: module }
  throw new Error(`插件模块 ${moduleName} 未提供有效的 Vue Plugin 默认导出`)
}

async function loadElementPlusPlugin(): Promise<{ default: Plugin }> {
  return requireDefaultPlugin(await import('element-plus'), 'element-plus')
}

async function loadVxeTablePlugin(): Promise<{ default: Plugin }> {
  return requireDefaultPlugin(await import('vxe-table'), 'vxe-table')
}

/**
 * 注册内置插件
 *
 * 包括：
 * - element-plus: Vue 3 UI 组件库
 * - vxe-table: 强大的表格组件
 */
export function registerBuiltinPlugins(): void {
  getGlobalPluginRegistry().registerAll({
    'element-plus': {
      name: 'Element Plus',
      module: 'element-plus',
      loader: loadElementPlusPlugin,
      description: 'Vue 3 UI 组件库',
      version: '^2.5.0',
      defaultOptions: {
        size: 'default',
        zIndex: 2000
      }
    },

    'vxe-table': {
      name: 'VXE Table',
      module: 'vxe-table',
      loader: loadVxeTablePlugin,
      description: '强大的 Vue 表格组件',
      version: '^4.17.0',
      defaultOptions: {}
    }
  })
}

/**
 * 注册所有预设插件
 *
 * 目前等同于 registerBuiltinPlugins
 */
export function registerAllPresetPlugins(): void {
  registerBuiltinPlugins()
}

/**
 * 未来扩展：注册状态管理插件（需要先安装依赖）
 *
 * @example
 * ```typescript
 * // 安装依赖后取消注释
 * // pnpm add pinia
 * export function registerStatePlugins(): void {
 *   getGlobalPluginRegistry().register('pinia', {
 *     name: 'Pinia',
 *     module: 'pinia',
 *     loader: async () => {
 *       const { createPinia } = await import('pinia')
 *       return { default: createPinia() }
 *     }
 *   })
 * }
 * ```
 */

/**
 * 未来扩展：注册国际化插件（需要先安装依赖）
 *
 * @example
 * ```typescript
 * // 安装依赖后取消注释
 * // pnpm add vue-i18n
 * export function registerI18nPlugins(): void {
 *   getGlobalPluginRegistry().register('vue-i18n', {
 *     name: 'Vue I18n',
 *     module: 'vue-i18n',
 *     loader: async () => {
 *       const { createI18n } = await import('vue-i18n')
 *       return { default: createI18n({ ... }) }
 *     }
 *   })
 * }
 * ```
 */

