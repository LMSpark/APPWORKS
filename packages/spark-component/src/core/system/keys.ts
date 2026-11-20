/**
 * @module @spark-appworks/spark-component:core/system/keys
 * 职责：维护 @spark-appworks/spark-component 中 system/keys 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 system/keys 的声明、导出和使用边界时，从本模块开始。
 */
import type { InjectionKey } from 'vue'
import type { ComponentRegistry } from '../types.js'

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry')
