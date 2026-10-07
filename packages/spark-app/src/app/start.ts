/**
 * @module @spark-appworks/spark-app:app/start
 * 职责：提供 spark-app 应用壳中的 start 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * SparkApp.start() - 最高层级 API
 *
 * 完全声明式启动应用，无需手动创建 app/router
 */

import { createApp, type Component, type Plugin } from 'vue'
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import type { PageFileReader } from '@spark-appworks/spark-project-model'
import { Spark, SparkPageRenderer, registerAllRenderers } from '@spark-appworks/spark-component'
import { createDynamicRouter, type DynamicRouterOptions } from '../router/dynamic'
import type { BootstrapOptions } from '../types'
import { bootstrap } from './bootstrap'
import { createLogger } from '../logger'
import { setDynamicRouter } from '../navigation/nav-access'
import { createThemeService, type ThemeServiceOptions, type ThemeServiceReactive } from '../shell/theme'
import { toError } from '@spark-appworks/spark-utils'
import { readNumberProperty, readProperty } from '@spark-appworks/spark-utils/internal'
import type { RuntimeNavigation } from '../navigation/runtime-navigation'

const startLogger = createLogger('start')

function shouldLogStartDetails(): boolean {
  if (typeof globalThis === 'undefined') return false
  const flag = readProperty(globalThis, '__SPARK_DEBUG_START__')
  return flag === true
}

function logStartDebug(message: string, meta?: Record<string, unknown>): void {
  if (shouldLogStartDetails()) {
    startLogger.debug(message, meta)
  }
}

type RegisterStats = {
  total: number
  sync: number
  async: number}

function normalizeRegisterStats(raw: unknown): RegisterStats | null {
  const total = readNumberProperty(raw, 'total')
  const sync = readNumberProperty(raw, 'sync')
  const async = readNumberProperty(raw, 'async')
  if (total === undefined || sync === undefined || async === undefined) return null
  return { total, sync, async }
}

type RegisterComponentsFn = {
  (app: ReturnType<typeof createApp>): unknown}

function isRegisterComponentsFn(value: unknown): value is RegisterComponentsFn {
  return typeof value === 'function'
}

/**
 * SPARK 组件系统配置
 */
export type SparkOptions = {
  /** 是否启用 SPARK 组件系统（默认 true） */
  enabled?: boolean

  /**
   * 是否自动导入并执行编译时组件注册（默认 true）
   *
   * SparkApp 会自动导入 virtual:spark-components 并执行注册函数。
   * 设置为 false 可禁用自动注册（用于自定义注册流程）。
   */
  autoRegister?: boolean}

/**
 * PageNode 运行配置
 */
export type PageNodeOptions = {
  /** 注入式页面四文件读取器，不绑定服务器路径。 */
  readPageFile: PageFileReader
  /** 认证状态检查（DynamicRouter 据此决定使用远程导航树还是 preAuthNavTree） */
  isAuthenticated?: () => boolean
  /** 页面组件（默认使用 PageRenderer） */
  pageComponent?: Component
  /**
   * system-page 路径 → Vue 组件映射。
   * 路由元数据完全由后端 DB 管理，前端只提供组件解析映射。
   */
  componentMap?: Record<string, Component>
  /**
   * 租户路径前缀（如 '/t/:tenantId'）。
   * 设置后，config 页面路由自动加此前缀。
   */
  tenantPathPrefix?: string
  /**
   * 导航数据加载函数 — 导航树作为路由的唯一来源。
   *
   * 已认证时 DynamicRouter 使用此函数加载远程导航树并派生路由。
   * refreshRoutes() 返回加载后的导航树供 UI 直接消费。
   */
  loadNavigation?: () => Promise<RuntimeNavigation>
  /** 平台工作台导航加载函数；节点路径会注册到 /platform 前缀下。 */
  loadPlatformNavigation?: () => Promise<RuntimeNavigation>
  /** 是否启用平台工作台导航注册。 */
  isPlatformNavigationEnabled?: () => boolean
  /** 平台工作台路由前缀，默认 /platform。 */
  platformPathPrefix?: string
  /**
   * 登录前本地导航树 — 未认证时使用的静态导航数据。
   *
   * 当用户未登录时，`registerRoutes()` 使用此本地导航树注册路由（如 / 和 /login）。
   * 登录后 `refreshRoutes()` 会用远程导航树替换。
   */
  preAuthNavTree?: RuntimeNavigation
  /**
   * 场景 DataSet 装载器，由 DynamicRouter 注入每次调用的 PageRuntime。
   * 后端定义为正式真源，场景 pagedata.json 只补充视图和级联。
   */
  loadScenario?: DynamicRouterOptions['loadScenario']
}

/**
 * 启动配置（扩展自 BootstrapOptions）
 */
export type StartOptions = Omit<BootstrapOptions, 'app' | 'router'> & {
  /** 根组件 */
    rootComponent: Component

    /** 路由模式（默认 'history'） */
    routerMode?: 'history' | 'hash'

    /** 挂载点（默认 '#app'） */
    mountTarget?: string

    /** SPARK 组件系统配置 */
    spark?: SparkOptions

    /** PageNode 运行配置 */
    pageNode?: PageNodeOptions

    /** UI 插件列表 */
    plugins?: Plugin[]

    /**
     * CSS 主题配置
     *
     * - `true` — 启用主题（默认 auto 跟随系统）
     * - `ThemeServiceOptions` — 自定义初始模式 / 存储键
     * - `false` / 不传 — 不启用主题服务
     */
    theme?: boolean | ThemeServiceOptions

    /** 启动前钩子 */
    onBeforeStart?: () => void | Promise<void>

    /** 启动失败钩子（如果提供，将完全接管错误处理） */
    onStartError?: (error: Error) => void | Promise<void>}

/**
 * 启动 SPARK 应用
 *
 * 最高层级 API，自动完成：
 * 1. 创建 Vue 应用实例
 * 2. 创建 Vue Router 实例
 * 3. 执行 Bootstrap 流程
 * 4. 错误降级处理
 * 5. 挂载应用
 *
 * @example
 * ```typescript
 * import { SparkApp } from '@spark-appworks/spark-app'
 * import App from './App.vue'
 *
 * SparkApp.start({
 *   rootComponent: App,
 *   config: APP_CONFIG,
 *   beforeMount: async (context) => {
 *     console.log('准备挂载', context.user)
 *   }
 * })
 * ```
 */
export async function start(options: StartOptions): Promise<void> {
  const {
    rootComponent,
    routerMode = 'history',
    mountTarget = '#app',
    spark,
    pageNode,
    plugins,
    theme,
    onBeforeStart,
    onStartError,
    ...bootstrapOptions
  } = options

  /** 主题服务实例（启用后通过 context 暴露给钩子） */
  let themeService: ThemeServiceReactive | undefined

  try {
    // 启动前钩子
    if (onBeforeStart) {
      logStartDebug('执行启动前钩子...')
      await onBeforeStart()
    }

    // 1. 创建 Vue 应用实例
    logStartDebug('创建 Vue 应用...')
    const app = createApp(rootComponent)

    // 1.5 初始化主题服务（尽早创建，避免首屏闪烁）
    if (theme !== false && theme !== undefined) {
      const themeOpts = typeof theme === 'boolean' ? {} : theme
      themeService = createThemeService(themeOpts)
      logStartDebug('主题服务已初始化', { mode: themeService.mode })
    }

    // 其他警告正常输出到控制台（仅开发环境）
    if (import.meta.env.DEV) {
      app.config.warnHandler = (msg) => {
        console.warn(`[Vue warn]: ${msg}`)
      }
    }
    // 2. 安装 UI 插件
    if (plugins && plugins.length > 0) {
      logStartDebug(`安装 ${plugins.length} 个 UI 插件...`)
      for (const plugin of plugins) app.use(plugin)
    }

    // 3. 创建 Vue Router 实例
    logStartDebug('创建 Vue Router...')
    const history = routerMode === 'hash'
      ? createWebHashHistory()
      : createWebHistory()
    const router = createRouter({
      history,
      routes: [
        {
          path: '/',
          name: 'spark-bootstrap-root',
          component: { render: () => null },
          meta: { bootstrap: true },
        },
        {
          path: '/login',
          name: 'spark-bootstrap-login',
          component: { render: () => null },
          meta: { bootstrap: true },
        },
      ],
    })

    // 4. 安装 SPARK 组件系统
    // 使用全局单例管理器，确保整个应用共享同一个组件实例集合
    if (spark?.enabled !== false) {
      logStartDebug('安装 SPARK 组件系统...')
      // 使用默认全局单例（不传参数）
      app.use(Spark.createPlugin())

      // 自动导入并执行编译时组件注册
      const shouldAutoRegister = spark?.autoRegister !== false

      if (shouldAutoRegister) {
        logStartDebug('注册内置 renderer 组件...')
        registerAllRenderers()
        startLogger.info('内置 renderer 注册完成: r-* 核心组件已就绪')

        try {
          logStartDebug('自动导入 virtual:spark-components...')
          // 动态导入虚拟模块（由 vite-plugin-spark-components 生成）
          const virtualModule = await import('virtual:spark-components')
          const registerComponents = readProperty(virtualModule, 'registerComponents')

          if (isRegisterComponentsFn(registerComponents)) {
            logStartDebug('执行自动组件注册...')
            const stats = normalizeRegisterStats(registerComponents(app))
            if (stats !== null) {
              startLogger.info(`自动注册完成: ${stats.total} 个组件 (同步: ${stats.sync}, 异步: ${stats.async})`)
              if (stats.total === 0) {
                startLogger.info('编译时注册返回 0 个组件；请确认组件扫描配置覆盖了应用组件路径')
              }
            } else {
              startLogger.warn('virtual:spark-components.registerComponents 返回值无效，无法确认编译时注册统计')
            }
          } else {
            startLogger.warn('virtual:spark-components 未导出 registerComponents 函数')
          }
        } catch (error) {
          const err = toError(error)
          startLogger.warn('无法导入 virtual:spark-components', { error: err.message })
          startLogger.info('可能原因：未配置 sparkComponentsPlugin 或组件扫描虚拟模块不可用')
        }
      }
    }

    // 5. 配置动态路由系统
    if (pageNode) {
      logStartDebug('配置动态路由系统...')

      // 默认使用 SparkPageRenderer 组件（SPARK 原生页面渲染器）
      const pageComponent: Component = pageNode.pageComponent ?? SparkPageRenderer

      // 如果未提供 pageComponent，自动使用 SparkPageRenderer
      if (pageNode.pageComponent === undefined) {
        logStartDebug('未提供 pageComponent，使用 SparkPageRenderer...')
        logStartDebug('✅ SparkPageRenderer 已就绪')
      }

      const dynamicRouterOptions: DynamicRouterOptions = {
        router,
        readPageFile: pageNode.readPageFile,
        pageComponent, // SparkPageRenderer 或用户提供的组件，if 块已确保非空
        ...(pageNode.componentMap !== undefined && { componentMap: pageNode.componentMap }),
        ...(pageNode.tenantPathPrefix !== undefined && { tenantPathPrefix: pageNode.tenantPathPrefix }),
        ...(pageNode.loadNavigation !== undefined && { loadNavigation: pageNode.loadNavigation }),
        ...(pageNode.loadPlatformNavigation !== undefined && { loadPlatformNavigation: pageNode.loadPlatformNavigation }),
        ...(pageNode.isPlatformNavigationEnabled !== undefined && { isPlatformNavigationEnabled: pageNode.isPlatformNavigationEnabled }),
        ...(pageNode.platformPathPrefix !== undefined && { platformPathPrefix: pageNode.platformPathPrefix }),
        ...(pageNode.preAuthNavTree !== undefined && { preAuthNavTree: pageNode.preAuthNavTree }),
        ...(pageNode.isAuthenticated !== undefined && { isAuthenticated: pageNode.isAuthenticated }),
        ...(pageNode.loadScenario !== undefined && { loadScenario: pageNode.loadScenario }),
      }

      const dynamicRouter = createDynamicRouter(dynamicRouterOptions)
      await dynamicRouter.registerRoutes()

      // 移除 bootstrap 占位路由 —— DynamicRouter 已注册真实路由，
      // 占位路由若保留会因 Vue Router 先注册先匹配而遮盖真实组件（render: () => null）
      if (router.hasRoute('spark-bootstrap-root')) {
        router.removeRoute('spark-bootstrap-root')
      }
      if (router.hasRoute('spark-bootstrap-login')) {
        router.removeRoute('spark-bootstrap-login')
      }

      // 注入到全局访问模块：导航访问
      setDynamicRouter(dynamicRouter)
    }

    // 6. 执行 Bootstrap 流程
    startLogger.info('启动 Bootstrap 流程...')
    await bootstrap({
      ...bootstrapOptions,
      mountTarget,
      app,
      router,
      ...(themeService ? { themeService } : {}),
    })

    startLogger.success('应用启动成功')
  } catch (error) {
    const err = toError(error)
    startLogger.error('应用启动失败', err)

    // 启动失败钩子
    if (onStartError) {
      await onStartError(err)
    }

    throw error
  }
}
