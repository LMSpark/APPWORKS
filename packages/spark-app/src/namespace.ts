/**
 * @module @spark-appworks/spark-app:namespace
 * 职责：提供 spark-app 应用壳中的 namespace 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */

import { bootstrap } from './app/bootstrap'
import { start } from './app/start'
import { setupRouterGuards } from './router/guards'
import { createDynamicRouter } from './router/dynamic'
import { setupErrorHandler } from './app/error-handler'
import { loadConfig } from './app/config'
import { createAppContext } from './app/app-context'
import { createThemeService } from './shell/theme'

/**
 * SparkApp 命名空间
 *
 * 使用说明：
 * main.ts 显式导入需要的层，保持依赖清晰
 *
 * @example
 * ```ts
 * // main.ts - 显式导入各层
 * import { SparkApp } from '@spark-appworks/spark-app'        // L1 应用层
 * import { PageContentLoader } from '@spark-appworks/spark-project-model' // L2 页面节点层
 * // 其他层级包按需在主应用中导入
 *
 * // 使用应用层功能
 * await SparkApp.bootstrap({ app, router, config })
 *
 * // 使用页面节点层功能
 * const pageNodes = new PageContentLoader({ projectId, readPageFile })
 *
 * // 其他功能在主应用中按需组合使用
 * ```
 */
export const SparkApp = {
  /**
   * 启动应用（高级 API - 推荐）
   *
   * 自动完成：
   * - 创建 Vue 应用和 Router
   * - 执行 Bootstrap 流程
   * - 错误降级处理
   * - 应用挂载
   *
   * 完全声明式，main.ts 只需配置
   */
  start,

  /**
   * 应用初始化流水线（中级 API）
   *
   * 需要手动创建 app 和 router
   *
   * 自动处理：
   * - 用户认证
   * - 创建 AppContext
   * - 路由守卫
   * - 错误处理
   * - 应用挂载
   */
  bootstrap,

  /**
   * 设置路由守卫
   *
   * 功能：
   * - 认证守卫
   * - 权限检查
   * - 预加载
   */
  setupRouterGuards,

  /**
   * 创建动态路由管理器
   * 根据页面配置加载器动态注册路由
   */
  createDynamicRouter,

  /**
   * 设置错误处理
   *
   * 功能：
   * - 全局错误捕获
   * - 错误边界
   * - 降级处理
   */
  setupErrorHandler,

  /**
   * 加载配置
   *
   * 支持：
   * - 本地配置
   * - 远程配置
   * - 配置合并
   */
  loadConfig,

  /**
   * 创建应用上下文
   *
   * 包含：
   * - 用户信息
   * - 租户信息
   * - 权限管理
   * - 环境信息
   *
   * @see useAppContext from '@spark-appworks/spark-app/composables' - 组件中使用
   */
  createAppContext,

  /**
   * 创建主题服务
   *
   * 支持 light / dark / auto 三模式。
   * Element Plus 暗黑模式通过 html.dark class 自动切换。
   *
   * @example
   * ```ts
   * const theme = SparkApp.createThemeService({ initialMode: 'auto' })
   * theme.setMode('dark')
   * ```
   */
  createThemeService
}

export default SparkApp
