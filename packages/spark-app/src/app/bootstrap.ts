/**
 * @module @spark-appworks/spark-app:app/bootstrap
 * 职责：提供 spark-app 应用壳中的 bootstrap 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * @fileoverview 应用启动引导模块 - SPARK 应用的初始化流水线
 * @packageDocumentation
 *
 * 本模块提供了完整的应用启动流程，包含配置加载、认证初始化、
 * 服务注册、路由配置等关键步骤。采用流水线设计模式，确保
 * 各个启动阶段的有序执行和错误处理。
 *
 * 主要特性：
 * - 阶段化启动：清晰的初始化步骤和日志记录
 * - 灵活配置：支持自定义认证、路由和服务配置
 * - 错误处理：完善的异常捕获和错误传播
 * - 环境适配：自动适配开发和生产环境
 *
 * @example
 * ```typescript
 * import { bootstrap } from './bootstrap'
 *
 * // 基础启动
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api' }
 * })
 *
 * // 完整配置启动
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api', enableMock: true },
 *   beforeMount: async (context) => {
 *     console.log('应用即将挂载', context.user)
 *   },
 *   afterMount: async (context) => {
 *     console.log('应用挂载完成')
 *   }
 * })
 * ```
 *
 * @author SPARK Team
 * @version 1.0.0
 * @since 2024
 */

import type { BootstrapOptions, AppContext, AppConfig } from '../types'
import { THEME_INJECTION_KEY } from '../shell/theme'
import { setupRouterGuards } from '../router/guards'
import { setupErrorHandler } from './error-handler'
import { createLogger } from '../logger'
import { loadConfig } from './config'
import { toError } from '@spark-appworks/spark-utils'

/**
 * =============================================================================
 * 常量和配置
 * =============================================================================
 */

/**
 * 引导过程日志记录器
 * 使用专门的 logger 实例，避免与其他模块的日志混淆
 */
const bootstrapLogger = createLogger('bootstrap')

/**
 * =============================================================================
 * 主要功能函数
 * =============================================================================
 */

/**
 * 应用启动引导函数
 *
 * 执行完整的应用初始化流水线，包含以下阶段：
 * 1. 配置加载 - 加载应用配置文件
 * 2. 认证初始化 - 设置认证服务和路由
 * 3. 用户鉴权 - 验证用户身份和权限
 * 4. 服务注册 - 通过 SPARK 能力系统提供应用服务
 * 5. 路由守卫 - 配置路由访问控制
 * 6. 挂载前钩子 - 执行自定义初始化逻辑
 * 7. 应用挂载 - 挂载 Vue 应用实例
 * 8. 挂载后钩子 - 执行清理和后续逻辑
 *
 * @param options - 启动配置选项
 * @throws {Error} 当认证失败或初始化过程中发生错误时抛出
 *
 * @example
 * ```typescript
 * await bootstrap({
 *   app: createApp(App),
 *   router: createRouter(routes),
 *   config: { apiBaseUrl: '/api/v1' },
 *   authenticate: async (config) => resolveAppContext(config)
 * })
 * ```
 */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const { app, router, config, beforeMount, afterMount, authenticate, mountTarget = '#app' } = options

  try {
    // =========================================================================
    // 阶段 1: 配置加载
    // =========================================================================
    logPhase('CONFIG', '加载应用配置')
    const appConfig = await loadConfig(config)

    // =========================================================================
    // 阶段 2: 解析应用认证上下文
    // =========================================================================
    logPhase('AUTH', '用户鉴权')
    const appContext = authenticate
      ? await authenticate(appConfig)
      : defaultMockContext(appConfig)

    if (!appContext) {
      throw new Error('应用宿主未提供有效认证上下文')
    }

    // =========================================================================
    // 阶段 4: SPARK 组件系统和服务注册
    // =========================================================================
    // SPARK 通过"能力系统"管理组件与页面运行时服务：SparkApp.start() 已安装插件并暴露
    // SPARK_REGISTRY_KEY；服务通过 sparkConsume(PAGE_RUNTIME_SERVICES) 或直接 useRouter()/Logger() 获取。

    logPhase('SERVICES', 'SPARK 能力系统服务已就绪')

    // 注册主题服务到 Vue DI（供非 SPARK 组件使用 useTheme()）
    if (options.themeService) {
      app.provide(THEME_INJECTION_KEY, options.themeService)
    }

    // =========================================================================
    // 阶段 5: 设置路由守卫
    // =========================================================================
    logPhase('ROUTER', '配置路由守卫')
    setupRouterGuards(router, {}, appContext)

    // 设置全局错误处理
    setupErrorHandler(app)

    // =========================================================================
    // 阶段 6: 挂载前钩子
    // =========================================================================
    // 构建扩展的 Bootstrap Context（包含 app 和 router 实例），供前后挂载钩子共用
    const bootstrapContext = { ...appContext, app, router, ...(options.themeService ? { theme: options.themeService } : {}) }
    if (beforeMount) {
      await beforeMount(bootstrapContext)
    }

    // =========================================================================
    // 阶段 7: 挂载应用
    // =========================================================================
    logPhase('MOUNT', '挂载应用')
    app.use(router)
    await router.isReady()
    app.mount(mountTarget)

    // =========================================================================
    // 阶段 8: 挂载后钩子
    // =========================================================================
    logPhase('COMPLETE', '应用启动完成')
    if (afterMount) {
      await afterMount(bootstrapContext)
    }

    // 记录启动成功信息
    bootstrapLogger.info('SPARK 应用启动成功', {
      version: appConfig.version,
      user: appContext.user.username,
      tenant: appContext.tenant.tenantName
    })
  } catch (error) {
    bootstrapLogger.error('应用启动失败', toError(error))
    // 不在框架层处理错误展示，由调用方（start.ts 或 main.ts）决定如何处理
    throw error
  }
}

/**
 * =============================================================================
 * 辅助函数
 * =============================================================================
 */

/**
 * 默认 Mock 上下文只服务显式 enableMock 场景。
 *
 * @param config - 应用配置
 * @returns 应用上下文或 null（认证失败）
 *
 * @private
 */
function defaultMockContext(config: AppConfig): AppContext | null {
  if (!config.enableMock) return null
  return {
      user: {
        userId: 'dev-user-001',
        username: 'developer',
        displayName: '开发者',
        roles: ['admin', 'developer'],
        permissions: ['*'] // 所有权限
      },
      tenant: {
        tenantId: 'default',
        tenantName: '默认租户'
      },
      env: {
        mode: 'development',
        apiBaseUrl: config.apiBaseUrl,
        version: config.version ?? '0.1.0'
      },
      config: {},
      initializedAt: new Date().toISOString()
  }
}

/**
 * 记录初始化阶段日志
 *
 * 为每个初始化阶段记录结构化的日志信息，
 * 便于跟踪启动进度和排查问题。
 *
 * @param phase - 阶段标识符（如 'CONFIG', 'AUTH'）
 * @param message - 阶段描述信息
 *
 * @private
 */
function logPhase(phase: string, message: string): void {
  bootstrapLogger.info(`[${phase}] ${message}`)
}
