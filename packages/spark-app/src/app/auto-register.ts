/**
 * @module @spark-appworks/spark-app:app/auto-register
 * 职责：提供 spark-app 应用壳中的 auto register 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 通用的运行时组件自动注册工具
 *
 * 此模块属于 spark-app 包，可在任意项目中直接安装使用，
 * 并支持通过参数配置 glob 模式与排除项。
 *
 * 注意：spark-app 已明确依赖 spark-component，
 * 此处直接静态导入 Spark，避免无效动态导入告警。
 */

import { defineAsyncComponent } from 'vue'
import { Spark } from '@spark-appworks/spark-component'
import { createLogger } from '../logger'

const logger = createLogger('AutoRegister')

export type AutoRegisterOptions = {
  /**
   * 排除规则（glob 模式）
   */
  exclude?: string[]}

const DEFAULT_EXCLUDE = [
  'App.vue',
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.vue',
  '**/*.spec.vue'
]

/**
 * 运行时扫描并注册所有匹配的 Vue 组件。
 *
 * 可用于经典模式启动，或在运行时动态追加组件时调用。
 */
export function setupAutoRegister(options: AutoRegisterOptions = {}) {

  const exclude = options.exclude ?? DEFAULT_EXCLUDE

  logger.info('🚀 启动组件自动注册...')

  // 只能静态声明所有扫描目录
  const modulesA = import.meta.glob<{ default: unknown }>('./packages/*/src/components/**/*.vue')
  const modulesB = import.meta.glob<{ default: unknown }>('./features/**/components/**/*.vue')
  const modulesC = import.meta.glob<{ default: unknown }>('./src/components/**/*.vue')
  const modulesD = import.meta.glob<{ default: unknown }>('./src/views/**/*.vue')
  const allModules = {
    ...modulesA,
    ...modulesB,
    ...modulesC,
    ...modulesD,
  }
  const registered: string[] = []

  for (const path of Object.keys(allModules)) {
    const fileName = path.split('/').pop()?.replace('.vue', '') ?? ''
    if (!fileName) continue

    // 排除过滤
    if (exclude.some(pat => {
      try {
        return new RegExp(pat.replace(/\*/g, '.*')).test(fileName)
      } catch {
        logger.warn(`排除模式 "${pat}" 不是有效的正则表达式，已跳过`)
        return false
      }
    })) {
      continue
    }

    const kebab = fileName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()

    const loader = allModules[path]
    if (!loader) continue

    Spark.register(kebab, defineAsyncComponent(loader))
    registered.push(kebab)
  }

  logger.info(`✅ 组件自动注册完成 (${registered.length} 个)`)
}
