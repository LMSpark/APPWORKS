/**
 * @module app:main
 * 职责：提供 src 应用层的 main 能力，连接运行时上下文、视图组件和服务。
 * 边界：只服务应用入口和组合层，不修改基础包协议，也不承担服务端职责。
 * AI用途：排查应用启动、运行时上下文或局部 UI 接线时，用本模块确认源码入口。
 */
/**
 * SPARK 主应用入口
 *
 * 🎯 设计理念：
 * - 100% 声明式配置，0 实现逻辑
 * - 配置即文档，所有配置都有类型约束
 * - SparkApp.start() 自动处理所有初始化流程
 *
 * 🔧 技术栈：
 * - Vue 3.5 + TypeScript
 * - Element Plus + VXE Table
 * - SPARK 组件系统 + 动态路由系统
 *
 * 📦 架构层次（由 SparkApp.start 自动完成）：
 * - L1: @spark-appworks/spark-app - 应用基础设施层
 * - L2: @spark-appworks/spark-project-model - PageNode 编排层
 * - L4-L6: @spark-appworks/spark-component - 组件核心层
 *
 *
 * 💾 缓存分级过期策略：
 * - 默认级别定义：0=永不过期, 1=3天, 2=7天, 3=15天(默认), 4=30天
 * - 可在 createFileLoader 配置 expirationTiers 自定义级别
 * - 可在 load 时指定 expirationLevel 为单个文件设置级别
 * - 示例：
 *   ```ts
 *   // 全局配置
 *   createFileLoader({
 *     defaultExpirationLevel: 3,  // 默认15天
 *     expirationTiers: [
 *       { level: 0, maxAge: Infinity, description: '永不过期' },
 *       { level: 1, maxAge: 3 * 24 * 60 * 60 * 1000 }
 *     ]
 *   })
 *
 *   // 单文件配置
 *   loader.load('/home/pagedata.json', { expirationLevel: 0 })  // 永不过期
 *   loader.load('/admin/rule.json', { expirationLevel: 1 })     // 3天过期
 *   ```
 */

// SPARK 架构包
import * as SparkAppRuntime from '@spark-appworks/spark-app'
import type {
  AppConfig,
  AppContext,
  RuntimeNavigationItem,
} from '@spark-appworks/spark-app'
import { SparkPageRenderer, Spark } from '@spark-appworks/spark-component'
import { loadScenarioDataSet } from './lowcode/data-space/lowcode-data-space-runtime'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { addLogTransport, isRecord } from '@spark-appworks/spark-utils'

import {
  activateLowcodeApplication,
  createLowcodeProjectGateways,
  enterLowcodeApplicationCatalog,
  hasLowcodeSession,
  lowcodeApi,
  lowcodeApplicationCatalogNavigation,
  readLowcodePageFile,
  readLowcodePrincipal,
  readLowcodeRuntimeNavigation,
} from './lowcode/lowcode-runtime'
import {
  buildTenantPath,
  parseTenantScope,
  stripTenantScope,
} from './services/tenant-scope'
import type { Router } from 'vue-router'
const {
  SparkApp,
  PluginManager,
  configureRemoteLogger,
  createLogger,
  getNavTree,
  getNavHomePath,
  registerBuiltinPlugins,
  resolveNavNodeRuntimeTarget,
} = SparkAppRuntime
const startupLogger = createLogger('main')
const PLATFORM_PATH_PREFIX = '/platform'
const HOST_APP_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  logLevel: import.meta.env.PROD ? 'info' : 'debug',
  enableMock: false,
  enableRemoteConfig: false,
  version: '1.0.0',
  features: {
    enableExport: true,
    enableOffline: false,
  },
}
const HOST_PLUGIN_CONFIGS = {
  'element-plus': {
    enabled: true,
    options: {
      size: 'default',
      zIndex: 2000,
    },
    priority: 1,
  },
  'vxe-table': {
    enabled: true,
    priority: 2,
  },
}
const HOST_SPARK_CONFIG = { enabled: true }
const HOST_PAGE_NODE_CONFIG = {
  apiBaseUrl: '/api',
  homePath: '/home',
}

function resolveLowcodeBootstrapContext(config: AppConfig): AppContext {
  const session = lowcodeApi.session.get()
  const mode = import.meta.env.MODE === 'test'
    ? 'test'
    : import.meta.env.DEV ? 'development' : 'production'
  const common = {
    env: {
      mode,
      apiBaseUrl: config.apiBaseUrl,
      version: config.version ?? '0.1.0',
    },
    config: Object.fromEntries(Object.entries(config)),
    initializedAt: new Date().toISOString(),
  } as const
  if (session === null) {
    return {
      ...common,
      user: {
        userId: 'public',
        username: 'public',
        displayName: '未登录',
        roles: [],
        permissions: [],
      },
      tenant: {
        tenantId: 'public',
        tenantName: '平台公共域',
      },
    }
  }
  return {
    ...common,
    user: {
      userId: session.identity.userId,
      username: session.identity.account,
      displayName: session.identity.displayName,
      roles: session.identity.role === null ? [] : [session.identity.role],
      permissions: [],
    },
    tenant: {
      tenantId: session.enterprise.shortName,
      tenantName: session.enterprise.shortCode
        ?? session.enterprise.code
        ?? session.enterprise.name
        ?? session.enterprise.shortName,
      tenantCode: session.enterprise.shortName,
    },
  }
}

// late-binding pageId（路由就绪后由 afterMount 注入）
let _currentPageId: string | undefined

// 浏览器会话级 ID（页面刷新后重新生成，用于追踪一次启动周期）
const _sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// 主应用组件
import { createApp } from 'vue'
import App from './App.vue'
import ErrorFallback from './components/ErrorFallback.vue'
import './style.css'

// ============================================================================
// 应用启动入口（宿主配置由 composition root 明确提供）
// ============================================================================

/**
 * 从路由 path 提取 pageId（去除前导 `/`）
 * 例：'/order-list' → 'order-list', '/admin/users' → 'admin/users'
 */
function extractPageId(path: string): string | undefined {
  // 租户作用域路由：/t/{tenantId}/{projectId}/xxx -> xxx
  const raw = parseTenantScope(path) ? stripTenantScope(path) : path.replace(/^\/+/, '')
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeRoutePath(path: string): string {
  const trimmed = path.split(/[?#]/, 1)[0]?.trim() ?? ''
  if (trimmed === '' || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

function isPlatformWorkspacePath(path: string): boolean {
  const normalized = normalizeRoutePath(path)
  return normalized === PLATFORM_PATH_PREFIX || normalized.startsWith(`${PLATFORM_PATH_PREFIX}/`)
}

function navigationContainsPath(nodes: RuntimeNavigationItem[], targetPath: string): boolean {
  const normalizedTargetPath = normalizeRoutePath(targetPath)
  for (const node of nodes) {
    const runtimeTarget = resolveNavNodeRuntimeTarget(node)
    if (runtimeTarget.kind === 'route' && normalizeRoutePath(runtimeTarget.path) === normalizedTargetPath) return true
    if (node.children !== undefined && navigationContainsPath(node.children, normalizedTargetPath)) return true
  }
  return false
}

async function ensureCurrentScopedRouteIsNavigable(router: Router): Promise<void> {
  const scope = parseTenantScope(window.location.pathname)
  if (!scope) return

  const navTree = getNavTree()
  if (navTree === null) return

  const scopedPath = normalizeRoutePath(stripTenantScope(window.location.pathname))
  const registeredRoute = router.resolve(window.location.pathname)
  const isKnownPath = registeredRoute.meta['programmaticTool'] === true
    || registeredRoute.meta['type'] === 'system-page'
    || scopedPath === normalizeRoutePath(navTree.homePath ?? getNavHomePath())
    || navigationContainsPath(navTree.items, scopedPath)
  if (isKnownPath) return

  const replacementPath = buildTenantPath(scope, getNavHomePath())
  const replacementLocation = `${replacementPath}${window.location.search}${window.location.hash}`
  startupLogger.warn('当前租户作用域路径未在项目导航中注册，已切换到项目首页', {
    currentPath: window.location.pathname,
    replacementPath,
  })
  window.history.replaceState(window.history.state, '', replacementLocation)
  await router.replace(replacementLocation)
}

function mountStartupError(error: unknown, fallbackMessage: string): void {
  const appElement = document.querySelector('#app')
  if (appElement?.innerHTML) {
    startupLogger.warn('⚠️ 检测到已挂载的应用，跳过错误页面渲染')
    return
  }

  const normalizedError = error instanceof Error ? error : new Error(fallbackMessage)
  const errorApp = createApp(ErrorFallback, { error: normalizedError })
  errorApp.mount('#app')
}

/**
 * 启动应用
 *
 * 流程：
 * 1. 清理损坏的页面缓存
 * 2. 动态导入 UI 插件
 * 3. 从 lowcode 会话解析企业与应用上下文
 * 4. 启动 SPARK 应用
 */
async function startApp() {
  try {
    // 🔧 清除损坏的页面缓存（仅处理当前 spark_page_ 前缀）
    if (typeof localStorage !== 'undefined') {
      const badKeys = Object.keys(localStorage).filter(k => {
        const isPageCache = k.startsWith('spark_page_')
        if (!isPageCache) return false
        try {
          const cached = localStorage.getItem(k)
          if (cached === null) return false
          const parsed: unknown = JSON.parse(cached)
          if (!isRecord(parsed)) return true  // 格式不合法
          // :raw 槽位必须存字符串（原始文件内容）
          if (k.endsWith(':raw') && typeof parsed['data'] !== 'string') return true
        } catch { return true /* JSON.parse 失败 → 强制清除 */ }
        return false
      })

      if (badKeys.length > 0) {
        startupLogger.warn(`🔧 检测到 ${badKeys.length} 个损坏的缓存项，正在清除...`)
        badKeys.forEach(k => {
          startupLogger.debug('清除缓存', { key: k })
          localStorage.removeItem(k)
        })
        startupLogger.info('✅ 缓存已清除')
      }
    }

    startupLogger.info('✅ 宿主配置已就绪', { version: HOST_APP_CONFIG.version })

    // ━━ 1.5 全链路 Logger 贯穿（APP 层唯一注册点） ━━━━━━━━━━━━━━━━━━━━━━━
    //
    // 三条日志链路统一汇入同一组 transport：
    //   A) spark-utils  Logger()  → addLogTransport()   — FileLoader / bindRules / PageRenderer
    //   B) spark-app    AppLogger → addGlobalTransport() — error handler / warnHandler / startupLogger
    //   C) PAGE_RUNTIME_SERVICES.logger → 实际是 Logger('PageRenderer')，走链路 A
    //
    // 远程日志仍然通过统一 logger 配置上报；旧本地 collector 已下线。
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const auditRemoteLogsEnabled = import.meta.env['VITE_AUDIT_REMOTE_LOGS'] === 'true'
    if (auditRemoteLogsEnabled) {
      const rawAuditEndpoint: unknown = import.meta.env['VITE_AUDIT_LOG_ENDPOINT']
      const auditEndpoint = typeof rawAuditEndpoint === 'string' ? rawAuditEndpoint.trim() : ''
      if (auditEndpoint === '') {
        throw new Error('VITE_AUDIT_REMOTE_LOGS=true 时必须显式配置 VITE_AUDIT_LOG_ENDPOINT')
      }
      const remoteTransport = configureRemoteLogger({
        endpoint: auditEndpoint,
        minLevel: 'debug',
        batchSize: 50,
        flushInterval: 5000,
        getPageId: () => _currentPageId,
        sessionId: _sessionId,
      })
      // 远程日志同样双注册，确保全链路上报
      addLogTransport(remoteTransport)
      // remoteTransport 已通过 configureRemoteLogger 注册到 spark-app _globalTransports

      startupLogger.info('📡 远程日志已启用（全链路）', {
        endpoint: auditEndpoint,
        minLevel: 'debug',
      })
    } else {
      startupLogger.info('📋 日志模式：本地诊断（远程审计未启用）', {
        auditFlag: auditRemoteLogsEnabled,
      })
    }

    // 2. 注册内置插件加载器
    registerBuiltinPlugins()

    // 3. 动态加载插件（根据配置）
    startupLogger.info('🔌 正在加载 UI 插件...')
    const pluginConfigs = HOST_PLUGIN_CONFIGS
    const pluginInstances = await PluginManager.loadPlugins(pluginConfigs)
    const plugins = pluginInstances.map(p => p.plugin)

    // 加载插件样式
    const epConfig = pluginConfigs['element-plus']
    if (epConfig.enabled) {
      await import('element-plus/dist/index.css')
      // Element Plus 暗黑模式 CSS 变量（html.dark 时自动覆盖）
      await import('element-plus/theme-chalk/dark/css-vars.css')
    }
    const vxeConfig = pluginConfigs['vxe-table']
    if (vxeConfig.enabled) {
      await import('vxe-table/lib/style.css')
    }

    startupLogger.info(`✅ 已加载 ${plugins.length} 个插件`)

    // 4. 构建 Vue 组件页面注册表（数据来自根级 config/navigation/vue-pages.json）
    startupLogger.info('📄 构建 Vue 组件页面映射...')
    const { buildComponentMap, buildPreAuthNavTree, getPublicPaths } = await import('./registries/vue-page-registry')
    const componentMap = await buildComponentMap()

    // 登录前导航树 — 从 Vue page registry scope='public' 自动派生
    const preAuthNavTree = buildPreAuthNavTree()
    // 公共路径集合 — 路由守卫用（未登录时只允许这些路径）
    const publicPaths = getPublicPaths()
    startupLogger.info(`✅ componentMap: ${Object.keys(componentMap).length} 个组件, preAuthNav: ${preAuthNavTree.items.length} 个节点, publicPaths: ${publicPaths.size} 个`)

    // 5.1 URL → localStorage 项目上下文预同步
    // 浏览器地址栏输入跨项目 URL 时，在 registerRoutes() 加载导航树之前
    // 将 URL 中的 projectId 写入 localStorage，确保后续 API 调用使用正确的项目上下文
    {
      const urlScope = parseTenantScope(window.location.pathname)
      if (urlScope && hasLowcodeSession()) {
        const principal = readLowcodePrincipal()
        if (principal?.enterpriseName === urlScope.tenantId && urlScope.projectId !== principal.applicationId) {
          startupLogger.info(`📌 URL 应用上下文预同步: ${principal.applicationId ?? 'catalog'} → ${urlScope.projectId}`)
          if (urlScope.projectId === 'homepage') enterLowcodeApplicationCatalog()
          else await activateLowcodeApplication(urlScope.projectId)
        }
      }
    }

    // 6. 启动 SPARK 应用
    startupLogger.info('🚀 启动 SPARK 应用...')

    await SparkApp.start({
      // === 应用根组件 ===
      rootComponent: App,

      // === 路由配置（从 JSON 加载）===
      routerMode: 'history',
      mountTarget: '#app',

      // === UI 插件（动态加载）===
      plugins,

      // === CSS 主题（light / dark / auto 三模式） ===
      theme: true,

      // === SPARK 组件系统配置（从 JSON 加载）===
      spark: {
        ...HOST_SPARK_CONFIG
        // SparkApp 会自动导入 virtual:spark-components
        // 不需要手动传递 registerComponents
      },

      // === PageNode 运行配置（路由从 DB 动态加载）===
      pageNode: {
        ...HOST_PAGE_NODE_CONFIG,
        getProjectId: () => lowcodeApi.application.get()?.application.id ?? 'homepage',
        readPageFile: readLowcodePageFile,
        pageComponent: SparkPageRenderer,
        loadScenario: async ({ projectId, scenarioId }) => {
          const scope = lowcodeApi.readRequestScope()
          const assertCurrent = () => {
            if (lowcodeApi.readRequestScope().token !== scope.token || scope.headers['X-AppId'] !== projectId) {
              throw new Error('SPARK_EXECUTION_SCOPE_STALE: 场景请求所属应用已失效')
            }
          }
          assertCurrent()
          const text = await createLowcodeProjectGateways(projectId).scenarioViews.readText(scenarioId)
          assertCurrent()
          if (text === null) throw new Error(`SCENARIO_VIEW_FILE_MISSING: 场景 ${scenarioId} 尚未建立视图配置`)
          const result = await loadScenarioDataSet({ scenarioId, config: new ScenarioViewConfig(scenarioId, text), assertCurrent })
          try { assertCurrent() } catch (failure) { result.dataSet.destroy(); throw failure }
          return result.dataSet
        },
        componentMap,
        isAuthenticated: hasLowcodeSession,
        tenantPathPrefix: '/t/:tenantId/:projectId',
        preAuthNavTree,
        // 导航树作为路由唯一来源 — DynamicRouter 从导航树派生路由
        loadNavigation: async () => {
          return readLowcodeRuntimeNavigation()
        },
        loadPlatformNavigation: () => Promise.resolve(lowcodeApplicationCatalogNavigation()),
        isPlatformNavigationEnabled: () => false,
        platformPathPrefix: PLATFORM_PATH_PREFIX,
      },

      // === 应用基础配置（从 JSON 加载）===
      config: HOST_APP_CONFIG,

      // 认证会话只由 lowcode 前端 API 解释，spark-app 不再绑定旧认证协议。
      authenticate: resolveLowcodeBootstrapContext,

      // === 生命周期钩子 ===

      // 启动前钩子
      onBeforeStart: () => {
        startupLogger.info('🚀 SPARK 应用启动中...')
      },

      // 挂载前钩子
      beforeMount: async (context) => {
        const { router } = context

        // 尽早注入 pageId 上下文
        // mount 阶段渲染页面时产生的错误需要正确的 pageId 标记，
        // 必须在 app.mount() 之前设置，否则 collectorTransport 记录的 pageId 为 undefined
        _currentPageId = extractPageId(router.currentRoute.value.path)
        router.afterEach((to) => {
          _currentPageId = extractPageId(to.path)
        })

        // ── 认证路由守卫（租户隔离） ──
        // publicPaths 从 Vue page registry scope='public' 自动派生，消除硬编码
        router.beforeEach(async (to) => {
          const publicHomePath = preAuthNavTree.homePath ?? '/'
          const isPublicPath = publicPaths.has(to.path)
          const isPublicUtilityPath = isPublicPath && to.path !== publicHomePath && to.path !== '/login'
          if (!hasLowcodeSession()) {
            // 未登录：停留在平台域（平台首页/登录页/平台公开页）
            if (to.path.startsWith('/t/') || isPlatformWorkspacePath(to.path)) return publicHomePath
            return isPublicPath ? undefined : publicHomePath
          }
          const principal = readLowcodePrincipal()
          const tenantId = principal?.enterpriseName
          const projectId = principal?.applicationId ?? 'homepage'
          if (!tenantId || !projectId) return '/login'
          const currentScope = { tenantId, projectId }
          // 已登录：默认进入租户主应用首页；但保留 about / hidden demos 这类平台静态工具页的直达访问。
          if (isPublicUtilityPath) return undefined
          if (isPlatformWorkspacePath(to.path)) return buildTenantPath(currentScope, getNavHomePath())
          if (!to.path.startsWith('/t/')) return buildTenantPath(currentScope, getNavHomePath())

          // 租户路径：验证 URL 中的 tenantId/projectId 与当前用户一致
          const urlScope = parseTenantScope(to.path)
          if (urlScope) {
            if (urlScope.tenantId !== tenantId) {
              // 租户不匹配 → 重定向到当前租户首页
              const rest = stripTenantScope(to.path)
              return { path: buildTenantPath(currentScope, rest || getNavHomePath()), query: to.query, hash: to.hash }
            }
            if (urlScope.projectId !== projectId) {
              SparkAppRuntime.getDynamicRouter()?.assertPageRuntimesClean()
              if (urlScope.projectId === 'homepage') enterLowcodeApplicationCatalog()
              else await activateLowcodeApplication(urlScope.projectId)
              SparkAppRuntime.getDynamicRouter()?.disposePageRuntimes()
              await SparkAppRuntime.refreshRoutes()
              return { path: to.path, query: to.query, hash: to.hash, replace: true }
            }
          }
          return undefined
        })

        await ensureCurrentScopedRouteIsNavigable(router)

        startupLogger.info('✅ 应用准备挂载')

        // 🎨 注册主项目本地组件。内置 renderer 与扫描组件由 SparkApp.start() 负责。
        const ModuleContextBadge = (await import('./components/ModuleContextBadge.vue')).default
        Spark.register('r-module-context-badge', ModuleContextBadge)

        startupLogger.info('✅ SPARK 组件注册完成（内置 renderer + virtual:spark-components + 本地扩展）')

      },

      // 挂载后钩子
      afterMount: (context) => {
        startupLogger.info('✅ 应用启动完成')

        // 统计路由信息
        const allRoutes = context.router.getRoutes()
        const vueRoutes = allRoutes.filter(r => r.meta['type'] === 'system-page')
        const configRoutes = allRoutes.filter(r => r.meta['type'] !== 'system-page')

        startupLogger.info('📊 路由统计', {
          总路由数: allRoutes.length,
          Vue组件页面: vueRoutes.length,
          配置页面: configRoutes.length
        })

        startupLogger.info('🎉 混合渲染系统启动完成!')
        startupLogger.info('📄 Vue 组件页面:', { paths: vueRoutes.map(r => r.path) })
        startupLogger.info('⚙️ 配置页面:', { paths: configRoutes.map(r => r.path) })
      },

      // === 错误处理 ===
      onStartError: (error) => {
        startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })

        mountStartupError(error, String(error))
      }
    })
  } catch (error) {
    startupLogger.error('❌ 应用启动失败', error instanceof Error ? error : { error })

    // 配置加载失败时的降级处理
    mountStartupError(error, '配置加载失败')
  }
}

// 启动应用
void startApp()
