/**
 * @module @spark-appworks/spark-component:core/system/plugin
 * 职责：提供 plugin 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import type { App, Plugin } from 'vue'
import type { ComponentRegistry } from '../types.js'
import { getGlobalRegistry } from './registry.js'
import { SPARK_REGISTRY_KEY } from './keys.js'

/** Spark Plugin Options 的调用配置。 */
export type SparkPluginOptions = {
  /** 自定义注册表（测试/隔离场景用） */
  registry?: ComponentRegistry}

export function createSparkPlugin(options?: SparkPluginOptions): Plugin {
  return {
    install(app: App) {
      // 默认使用全局 registry，确保 Spark.register() 注册的组件可被找到
      const registry = options?.registry ?? getGlobalRegistry()

      // Registry 通过 Vue DI 注入；业务能力上下文由 Spark runtime owner/pageRoot 锚点建树。
      app.provide(SPARK_REGISTRY_KEY, registry)
    }
  }
}
