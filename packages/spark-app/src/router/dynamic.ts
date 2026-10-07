/**
 * @module @spark-appworks/spark-app:router/dynamic
 * 职责：提供 spark-app 应用壳中的 dynamic 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 动态路由注册器 - 支持 SPA 动态路由
 *
 * 动态路由属于应用引导层（spark-app），页面节点能力来自 spark-project-model。
 */

import type { Router, RouteRecordRaw, RouteLocationNormalizedLoaded } from 'vue-router'
import type { Component } from 'vue'
import type {
  PageRuntime,
  PageFileReader,
} from '@spark-appworks/spark-project-model'
import type { DataSet } from '@spark-appworks/spark-data'
import { createLogger } from '../logger'
import { readProperty } from '@spark-appworks/spark-utils/internal'
import { CrossProjectRefPage, createCrossProjectRefRouteProps } from './cross-project-ref-page'
import { CROSS_PROJECT_REF_HOST_ROUTE_NAME } from './cross-project-ref-route'
import { ExternalLinkFramePage } from './external-link-frame-page'
import { InvalidSystemPage } from './invalid-system-page'
import { resolveNavNodeRuntimeTarget } from '../navigation/runtime-target'
import { resolveNavRoutePageId } from './route-helpers'
import type { RuntimeNavigation, RuntimeNavigationItem } from '../navigation/runtime-navigation'
import { PageRuntimePool, type RuntimeScenarioLoadCommand } from './page-runtime-pool'

function isUnauthorizedError(error: unknown): boolean {
  return readProperty(error, 'status') === 401
    || readProperty(readProperty(error, 'response'), 'status') === 401
}

const routerLogger = createLogger('DynamicRouter')
export { CROSS_PROJECT_REF_HOST_ROUTE_NAME } from './cross-project-ref-route'
export type { RuntimeScenarioLoadCommand } from './page-runtime-pool'

function shouldLogDynamicRouteDetails(): boolean {
  if (typeof globalThis === 'undefined') return false
  const flag = readProperty(globalThis, '__SPARK_DEBUG_DYNAMIC_ROUTER__')
  return flag === true
}

/**
 * 动态路由注册选项
 */
export type DynamicRouterOptions = {
  /** Vue Router 实例 */
  router: Router

  /** 工具三文件读取器；缺省时打开配置页会明确失败。 */
  readPageFile?: PageFileReader

  /**
   * 动态页面组件（必需）
   * 用于渲染配置化页面
   *
   * @example
   * ```typescript
   * import { PageRenderer } from '@spark-appworks/spark-component'
   * const options = { router, pageComponent: PageRenderer }
   * ```
   */
  pageComponent: Component

  /**
   * system-page 路径 → Vue 组件映射。
   * 导航节点 nodeKind='system-page' 时，使用此映射解析组件。
   */
  componentMap?: Record<string, Component>

  /**
   * 租户路径前缀（如 '/t/:tenantId'）。
   * 设置后，config 页面路由自动加此前缀，使所有业务路由统一在租户 URL 下。
   * system-page 路由不受影响（DB 中已含完整路径）。
   */
  tenantPathPrefix?: string

  /**
   * 导航数据加载函数 — 导航树作为路由的唯一来源。
   *
   * 已认证时 `registerRoutes()` 使用此函数加载远程导航树并派生路由。
   * 返回的 ProjectBlueprintTreeData 对象同时用于 UI 渲染（侧栏/顶栏菜单）。
   */
  loadNavigation?: (() => Promise<RuntimeNavigation>) | undefined

  /**
   * 平台工作台导航加载函数。
   *
   * 返回的节点 path 仍保持相对形态（如 /dashboard、/tenants），
   * 注册路由时统一映射到 platformPathPrefix 下（默认 /platform）。
   */
  loadPlatformNavigation?: (() => Promise<RuntimeNavigation>) | undefined

  /** 平台工作台路由前缀（默认 /platform）。 */
  platformPathPrefix?: string | undefined

  /** 是否注册平台工作台导航。通常仅 platform_admin 返回 true。 */
  isPlatformNavigationEnabled?: (() => boolean) | undefined

  /**
   * 登录前本地导航树 — 未认证时使用的静态导航数据。
   *
   * 当 `registerRoutes()` 在未登录状态调用时（无法调用 loadNavigation），
   * 使用此本地导航树注册路由（如 / 和 /login）。
   * 登录后 `refreshRoutes()` 会用远程导航树替换。
   */
  preAuthNavTree?: RuntimeNavigation | undefined

  /**
   * 认证状态检查回调。
   *
   * `registerRoutes()` 在运行时通过此回调判断当前状态：
   * - 已登录 → 使用 `loadNavigation` 加载远程导航树
   * - 未登录 → 使用 `preAuthNavTree` 本地导航树
   */
  isAuthenticated?: (() => boolean) | undefined

  /**
   * 场景 DataSet 装载器：由 PageRuntime 按显式调用场景逐个装配。
   * 后端提供正式定义，场景 pagedata.json 只提供视图与级联配置。
   */
  loadScenario?: (command: RuntimeScenarioLoadCommand) => Promise<DataSet>
}

type RouteRegistrationOptions = {
  skipTenantPrefix?: boolean
  routePathPrefix?: string
  routeNamePrefix?: string}

/**
 * 动态路由管理器
 */
export class DynamicRouter {
  private router: Router
  private pageComponent: Component
  private registeredRoutes: Set<string> = new Set()
  /** path → Component 映射（system-page 路由使用） */
  private staticComponentMap: Map<string, Component> = new Map()
  /** 租户路径前缀（如 '/t/:tenantId'），config 路由自动加此前缀 */
  private tenantPathPrefix: string
  /** tenantPathPrefix 的实体路径匹配（如 '^/t/[^/]+'） */
  private tenantPathRegex: RegExp | null
  /** 导航数据加载函数（提供后从导航树派生路由） */
  private _loadNavigation: (() => Promise<RuntimeNavigation>) | undefined
  /** 平台工作台导航数据加载函数 */
  private _loadPlatformNavigation: (() => Promise<RuntimeNavigation>) | undefined
  private platformPathPrefix: string
  private _isPlatformNavigationEnabled: () => boolean
  /** 登录前本地导航树 */
  private _preAuthNavTree: RuntimeNavigation | null = null
  private _tenantNavTree: RuntimeNavigation | null = null
  private _platformNavTree: RuntimeNavigation | null = null
  /** 认证状态检查回调 */
  private _isAuthenticated: () => boolean
  /** 已加载的导航树（UI 侧栏/顶栏共享此数据） */
  private _navTree: RuntimeNavigation | null = null
  /** ProjectBlueprintTreeNodeData → 注册路由路径追踪（弱引用，导航树刷新后自动 GC） */
  private _navRouteMap = new WeakMap<RuntimeNavigationItem, string>()
  private readonly runtimePool: PageRuntimePool

    /** 创建 Dynamic Router 实例。 */
constructor(options: DynamicRouterOptions) {
    this.router = options.router

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pageComponent 结构可缺失
    if (options.pageComponent === undefined || options.pageComponent === null) {
      throw new Error('DynamicRouter: pageComponent 是必需的，请提供有效的 Vue 组件')
    }

    this.pageComponent = options.pageComponent
    this.tenantPathPrefix = options.tenantPathPrefix ?? ''
    this.tenantPathRegex = this.tenantPathPrefix
      ? this.createTenantPathRegex(this.tenantPathPrefix)
      : null

    // 导航加载函数（统一数据源）
    this._loadNavigation = options.loadNavigation
    this._loadPlatformNavigation = options.loadPlatformNavigation
    this.platformPathPrefix = this.normalizePath(options.platformPathPrefix ?? '/platform')
    this._isPlatformNavigationEnabled = options.isPlatformNavigationEnabled ?? (() => false)
    this._preAuthNavTree = options.preAuthNavTree ?? null
    this._isAuthenticated = options.isAuthenticated ?? (() => true)

    // 构建 path → Component 映射
    if (options.componentMap) {
      for (const [path, comp] of Object.entries(options.componentMap)) {
        this.staticComponentMap.set(this.normalizePath(path), comp)
      }
    }

    // 初始化页面实例池
    this.runtimePool = new PageRuntimePool({
      pageComponent: options.pageComponent,
      readPageFile: options.readPageFile,
      loadScenario: options.loadScenario,
      readNavTree: () => this._navTree,
      refreshRoutes: () => this.refreshRoutes(),
    })
  }

  getPageRuntime(route: RouteLocationNormalizedLoaded): PageRuntime | undefined {
    return this.runtimePool.getPageRuntime(route)
  }

  getPageRuntimeView(route: RouteLocationNormalizedLoaded): Component | undefined {
    return this.runtimePool.getPageRuntimeView(route)
  }

  getPageRuntimeNames(): string[] {
    return this.runtimePool.getPageRuntimeNames()
  }

  getPageRuntimeById(instanceId: string): PageRuntime | undefined {
    return this.runtimePool.getPageRuntimeById(instanceId)
  }

  closePageRuntime(instanceId: string): void {
    this.runtimePool.closePageRuntime(instanceId)
  }

  assertPageRuntimesClean(): void {
    this.runtimePool.assertPageRuntimesClean()
  }

  disposePageRuntimes(): void {
    this.runtimePool.disposePageRuntimes()
  }

  markPageConfigPending(pageId: string): void {
    this.runtimePool.markPageConfigPending(pageId)
  }

  private normalizePath(path: string): string {
    const trimmed = path.trim()
    if (trimmed === '') return '/'
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    if (withLeadingSlash.length === 1) return withLeadingSlash
    return withLeadingSlash.replace(/\/+$/, '')
  }

  private createTenantPathRegex(prefix: string): RegExp {
    const escaped = prefix
      .split('/')
      .filter(Boolean)
      .map(segment => segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('/')
    return new RegExp(`^/${escaped}(?=/|$)`)
  }

  private addTenantPrefix(path: string): string {
    const normalizedPath = this.normalizePath(path)
    if (!this.tenantPathPrefix) return normalizedPath
    if (normalizedPath.startsWith(this.tenantPathPrefix)) return normalizedPath
    if (this.tenantPathRegex?.test(normalizedPath)) return normalizedPath
    return this.normalizePath(`${this.tenantPathPrefix}${normalizedPath}`)
  }

  private addRoutePathPrefix(prefix: string, path: string): string {
    const normalizedPrefix = this.normalizePath(prefix)
    const normalizedPath = this.normalizePath(path)
    if (normalizedPath === '/') return normalizedPrefix
    if (normalizedPath.startsWith(`${normalizedPrefix}/`) || normalizedPath === normalizedPrefix) {
      return normalizedPath
    }
    return this.normalizePath(`${normalizedPrefix}${normalizedPath}`)
  }

  private isCurrentPlatformRoute(): boolean {
    const currentPath = this.normalizePath(this.router.currentRoute.value.path || (typeof window !== 'undefined' ? window.location.pathname : '/'))
    return currentPath === this.platformPathPrefix || currentPath.startsWith(`${this.platformPathPrefix}/`)
  }

  private activeNavTree(): RuntimeNavigation | null {
    if (this.isCurrentPlatformRoute() && this._platformNavTree !== null) {
      return this._platformNavTree
    }
    return this._tenantNavTree ?? this._preAuthNavTree
  }

  private buildScopedRefPath(path: string, targetProjectId: string): string {
    const normalizedPath = this.normalizePath(path)
    if (!this.tenantPathPrefix) return normalizedPath

    const segments = this.tenantPathPrefix.split('/').filter(Boolean)
    const resolvedSegments = segments.map((segment) => {
      if (segment === ':tenantId') return ':tenantId'
      if (segment === ':projectId') return targetProjectId
      return segment
    })

    return this.normalizePath(`/${resolvedSegments.join('/')}${normalizedPath}`)
  }

  private registerCrossProjectRefHostRoute(skipTenantPrefix = false): void {
    if (skipTenantPrefix) return

    const routePath = this.addTenantPrefix('/__ref/:refNodeId')
    const existing = this.router.getRoutes().find(route => route.name === CROSS_PROJECT_REF_HOST_ROUTE_NAME)
    const existingDefaultProps = readProperty(existing?.props, 'default')
    if (existing?.meta['crossProjectRefHost'] === true && typeof existingDefaultProps === 'function') {
      return
    }
    if (existing?.name !== undefined) {
      this.router.removeRoute(existing.name)
      this.registeredRoutes.delete(existing.path)
      if (shouldLogDynamicRouteDetails()) {
        routerLogger.debug('移除旧跨项目引用 host 路由', {
          path: existing.path,
          previousType: existing.meta['type'],
        })
      }
    }

    this.router.addRoute({
      path: routePath,
      name: CROSS_PROJECT_REF_HOST_ROUTE_NAME,
      component: CrossProjectRefPage,
      props: createCrossProjectRefRouteProps(),
      meta: {
        type: 'cross-project-ref',
        crossProjectRefHost: true,
      },
    })
    this.registeredRoutes.add(routePath)
  }

  private resolveCrossProjectRefUrl(node: RuntimeNavigationItem): string | null {
    const refPath = typeof node.refPath === 'string' ? node.refPath.trim() : ''
    if (refPath === '') return null

    const match = /^@app:([^/]+)(\/.*)?$/.exec(refPath)
    if (match !== null) {
      const targetProjectId = typeof node.refProjectId === 'string' && node.refProjectId.trim() !== ''
        ? node.refProjectId.trim()
        : match[1]
      const targetPath = match[2]
      if (targetProjectId === undefined || targetPath === undefined || targetPath.trim() === '') return null

      return this.buildScopedRefPath(targetPath, targetProjectId)
    }

    return this.normalizePath(refPath)
  }

  /** 注册所有路由（从导航树派生） */
  async registerRoutes(): Promise<void> {
    routerLogger.info('开始注册动态路由')

    const authenticated = this._isAuthenticated()

    // preAuthNavTree 只服务未登录入口和 401 回退。登录后导航路由必须完全来自远端导航树。
    if (!authenticated && this._preAuthNavTree) {
      this.registerRoutesFromNav(this._preAuthNavTree.items, { skipTenantPrefix: true, routeNamePrefix: 'public' })
    }

    if (this._loadNavigation && authenticated) {
      try {
        await this.loadAndRegisterFromNav()
        if (this._loadPlatformNavigation && this._isPlatformNavigationEnabled()) {
          await this.loadAndRegisterPlatformNav()
        }
        this._navTree = this.activeNavTree()
      } catch (error: unknown) {
        if (isUnauthorizedError(error) && this._preAuthNavTree) {
          routerLogger.warn('远程导航加载返回 401，回退到 preAuthNavTree', {
            reason: 'unauthorized',
            fallbackNodeCount: this._preAuthNavTree.items.length,
          })
          this._navTree = this._preAuthNavTree
          this._navRouteMap = new WeakMap()
          this.registerRoutesFromNav(this._preAuthNavTree.items, { skipTenantPrefix: true, routeNamePrefix: 'public' })
        } else {
          throw error
        }
      }
    } else if (this._preAuthNavTree) {
      this._navTree = this._preAuthNavTree
      this._navRouteMap = new WeakMap()
      routerLogger.info('预认证运行导航路由注册完成', { nodeCount: this._preAuthNavTree.items.length })
    }

    routerLogger.info('动态路由注册完成', { count: this.registeredRoutes.size })
  }

  /** 从导航树加载并注册路由 */
  private async loadAndRegisterFromNav(): Promise<void> {
    if (!this._loadNavigation) {
      throw new Error('[DynamicRouter] _loadNavigation not set')
    }
    const navRoot = await this._loadNavigation()
    this._tenantNavTree = navRoot
    this._navTree = navRoot
    this._navRouteMap = new WeakMap()
    this.registerRoutesFromNav(navRoot.items)
    routerLogger.info('运行导航路由注册完成', { nodeCount: navRoot.items.length })
  }

  private async loadAndRegisterPlatformNav(): Promise<void> {
    if (!this._loadPlatformNavigation) {
      throw new Error('[DynamicRouter] _loadPlatformNavigation not set')
    }
    const navRoot = await this._loadPlatformNavigation()
    this._platformNavTree = navRoot
    this.registerRoutesFromNav(navRoot.items, {
      routePathPrefix: this.platformPathPrefix,
      routeNamePrefix: 'platform',
    })
    routerLogger.info('平台导航树路由注册完成', {
      nodeCount: navRoot.items.length,
      prefix: this.platformPathPrefix,
    })
  }

  /**
   * 历史数据平滑迁移（递归）
   *
   * 将旧格式中 nodeKind='system-page' 且 path 不以 `/` 开头的节点诺认为 system-action。
   * 旧格式编了 system-page 用于同时表示“Vue 组件路由”和“toolbar 动作按钮”两种语义。
   */
  /**
   * 从导航节点树递归注册路由
   * - nodeKind='link' + linkTarget='iframe' → 内嵌 iframe 路由（path 为外部 URL）
   * - nodeKind='link' + linkTarget='new-tab' → 不注册路由（点击时 window.open）
   * - nodeKind='system-action' → 不注册路由（动作按钮，由 AppHeader 处理）
   * - nodeKind='system-page' 或路径命中 componentMap → 静态组件路由
   * - 其他页面类节点 → pageComponent (PageRenderer)
   * @param options 路由注册作用域；public 跳过租户前缀，platform 使用 /platform 前缀
   */
  private registerRoutesFromNav(nodes: RuntimeNavigationItem[], options: RouteRegistrationOptions = {}): void {
    const skipTenantPrefix = options.skipTenantPrefix === true
    const routePathPrefix = options.routePathPrefix
    this.registerCrossProjectRefHostRoute(skipTenantPrefix || routePathPrefix !== undefined)
    if (!skipTenantPrefix && routePathPrefix === undefined) {
      const toolPath = this.addTenantPrefix('/__tool/:pageId')
      if (!this.registeredRoutes.has(toolPath)) {
        this.router.addRoute({ path: toolPath, name: 'spark-page-tool-call', component: this.pageComponent,
          props: resolvedRoute => ({ pageRuntime: this.getPageRuntime(resolvedRoute), routeSnapshot: resolvedRoute }),
          meta: { type: 'config-page', title: '页面工具', programmaticTool: true } })
        this.registeredRoutes.add(toolPath)
      }
    }

    for (const node of nodes) {
      const target = resolveNavNodeRuntimeTarget(node)

      // external / action / container 节点不注册路由；hidden 只控制菜单可见性。
      if (target.kind !== 'route') {
        // 仍然递归子节点
        if (node.children?.length) {
          this.registerRoutesFromNav(node.children, options)
        }
        continue
      }

      const rawNodePath = target.path
      const isIframeNode = target.routeKind === 'external-link'
      const isCrossProjectRefNode = target.routeKind === 'cross-project-ref'
      const crossProjectRefUrl = isCrossProjectRefNode ? this.resolveCrossProjectRefUrl(node) : null
      const nodePath = typeof node.path === 'string' ? node.path.trim() : ''
      const relativePath = this.normalizePath(rawNodePath.split(/[?#]/, 1)[0] ?? '')
      const component = this.staticComponentMap.get(relativePath)
      const useStaticComponent = target.routeKind === 'page' && (node.itemKind === 'system-page' || component !== undefined)
      const pageId = resolveNavRoutePageId(node, rawNodePath)
      // 平台级路由（preAuth）不加前缀，远程导航树路由统一加租户前缀
      const routePath = routePathPrefix !== undefined
        ? this.addRoutePathPrefix(routePathPrefix, relativePath)
        : skipTenantPrefix
          ? relativePath
          : this.addTenantPrefix(relativePath)
      const routeName = options.routeNamePrefix !== undefined
        ? `nav-${options.routeNamePrefix}-${node.id}`
        : `nav-${node.id}`
      const expectedRouteType = isIframeNode
        ? 'external-link'
        : isCrossProjectRefNode
          ? 'cross-project-ref'
          : useStaticComponent && component !== undefined
            ? 'system-page'
            : node.itemKind === 'system-page'
              ? 'invalid-system-page'
              : 'config-page'

      if (!this.registeredRoutes.has(routePath)) {
        const staleRoute = this.router.getRoutes().find(route => route.path === routePath)
        if (
          staleRoute?.name !== undefined &&
          (staleRoute.meta['type'] !== expectedRouteType || staleRoute.name !== routeName)
        ) {
          this.router.removeRoute(staleRoute.name)
          if (shouldLogDynamicRouteDetails()) {
            routerLogger.debug(`移除同路径旧类型路由: ${routePath}`, {
              previousName: staleRoute.name,
              previousType: staleRoute.meta['type'],
              nextName: routeName,
              nextType: expectedRouteType,
            })
          }
        }
      }

      if (this.registeredRoutes.has(routePath)) {
        const existingRoute = this.router.getRoutes().find(route => route.path === routePath)
        const existingRouteName = existingRoute?.name
        const existingRouteType = existingRoute?.meta['type']
        const shouldReplaceWithCrossProjectRef =
          isCrossProjectRefNode &&
          existingRouteName !== undefined &&
          existingRouteType !== 'cross-project-ref'

        if (shouldReplaceWithCrossProjectRef) {
          this.router.removeRoute(existingRouteName)
          this.registeredRoutes.delete(routePath)
          if (shouldLogDynamicRouteDetails()) {
            routerLogger.debug(`跨项目引用路由覆盖同路径普通路由: ${routePath}`)
          }
        } else {
          if (shouldLogDynamicRouteDetails()) {
            routerLogger.debug(`路由已注册，跳过: ${routePath}`)
          }
          if (node.children?.length) {
            this.registerRoutesFromNav(node.children, options)
          }
          continue
        }
      }

      if (isIframeNode || isCrossProjectRefNode) {
        const linkUrl = isIframeNode
          ? nodePath
          : crossProjectRefUrl
        if (isIframeNode && linkUrl === '') {
          if (node.children?.length) {
            this.registerRoutesFromNav(node.children, options)
          }
          continue
        }
        const route: RouteRecordRaw = isCrossProjectRefNode
          ? {
              path: routePath,
              name: routeName,
              component: CrossProjectRefPage,
              props: createCrossProjectRefRouteProps(),
              meta: {
                type: 'cross-project-ref',
                pageId,
                title: node.title,
                ...(node.description !== undefined && { description: node.description }),
                refPath: node.refPath,
                nodeId: node.id,
                ...(node.refProjectId !== undefined && { refProjectId: node.refProjectId }),
                ...(node.icon !== undefined && { icon: node.icon }),
                ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
              },
            }
          : {
              path: routePath,
              name: routeName,
              component: ExternalLinkFramePage,
              meta: {
                type: 'external-link',
                pageId,
                title: node.title,
                ...(node.description !== undefined && { description: node.description }),
                linkUrl,
                ...(node.icon !== undefined && { icon: node.icon }),
                ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
              },
            }
        this.router.addRoute(route)
        this.registeredRoutes.add(routePath)
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`${isCrossProjectRefNode ? '跨项目引用' : '链接 iframe'} 路由已注册(nav): ${routePath}`)
        }
      } else if (useStaticComponent && component !== undefined) {
          const route: RouteRecordRaw = {
            path: routePath,
            name: routeName,
            component,
            meta: {
              type: 'system-page',
              pageId,
              title: node.title,
              ...(node.description !== undefined && { description: node.description }),
              ...(node.icon !== undefined && { icon: node.icon }),
              ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
            },
          }
          this.router.addRoute(route)
          this.registeredRoutes.add(routePath)
          if (shouldLogDynamicRouteDetails()) {
            routerLogger.debug(`Vue 组件路由已注册(nav): ${routePath}`)
          }
      } else if (node.itemKind === 'system-page') {
        routerLogger.warn('system-page 节点未在 componentMap / Vue 页面注册表中声明，使用显式错误页', {
          path: node.path,
          nodeId: node.id,
          pageId,
        })
        const route: RouteRecordRaw = {
          path: routePath,
          name: routeName,
          component: InvalidSystemPage,
          meta: {
            type: 'invalid-system-page',
            pageId,
            title: node.title,
            ...(node.description !== undefined && { description: node.description }),
            ...(node.icon !== undefined && { icon: node.icon }),
            ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
          },
        }
        this.router.addRoute(route)
        this.registeredRoutes.add(routePath)
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`无效 system-page 路由已注册(nav): ${routePath}`, { pageId })
        }
      } else {
        // config 页面 → PageRenderer
        const route: RouteRecordRaw = {
          path: routePath,
          name: routeName,
          component: this.pageComponent,
          props: resolvedRoute => ({ pageRuntime: this.getPageRuntime(resolvedRoute), routeSnapshot: resolvedRoute }),
          meta: {
            type: 'config-page',
            pageId,
            tool: node.tool,
            nodeId: node.id,
            title: node.title,
            ...(node.description !== undefined && { description: node.description }),
            ...(node.icon !== undefined && { icon: node.icon }),
            ...(node.permissionMode !== undefined && { permissionMode: node.permissionMode }),
          },
        }
        this.router.addRoute(route)
        this.registeredRoutes.add(routePath)
        if (shouldLogDynamicRouteDetails()) {
          routerLogger.debug(`配置页面路由已注册(nav): ${routePath}`, { pageId })
        }
      }

      // WeakMap 追踪：导航节点 → 路由路径
      this._navRouteMap.set(node, routePath)

      // 递归子节点
      if (node.children?.length) {
        this.registerRoutesFromNav(node.children, options)
      }
    }
  }

  /** 移除路由 */
  removeRoute(name: string): void {
    const route = this.router.getRoutes().find(r => r.name === name)
    if (route) this.registeredRoutes.delete(route.path)
    this.router.removeRoute(name)
    if (shouldLogDynamicRouteDetails()) {
      routerLogger.debug('路由已移除', { name })
    }
  }

  /** 刷新路由（重新加载导航树，保留静态组件映射），返回加载后的导航树 */
  async refreshRoutes(): Promise<RuntimeNavigation | null> {
    routerLogger.info('刷新动态路由')

    // 保存旧路由集合；先注册新路由再删除旧路由，避免 Vue Router 内部
    // removeRoute() 触发重导航时因新路由尚未就绪而产生 "No match found" 警告。
    const prevRoutes = new Set(this.registeredRoutes)
    this.registeredRoutes.clear()

    try {
      await this.registerRoutes()
    } catch (error) {
      // 注册失败：回退到预认证导航树，确保至少有 login/home 路由可用
      routerLogger.error('路由注册失败，回退到预认证导航树', { error: String(error) })
      if (this._preAuthNavTree) {
        this._navTree = this._preAuthNavTree
        this._navRouteMap = new WeakMap()
        this.registerRoutesFromNav(this._preAuthNavTree.items, { skipTenantPrefix: true, routeNamePrefix: 'public' })
      }
      throw error
    }

    // 移除新路由集合中不再存在的旧路由（此时新路由已全部就绪）
    for (const path of prevRoutes) {
      if (!this.registeredRoutes.has(path)) {
        const route = this.router.getRoutes().find(r => r.path === path)
        if (route?.name !== undefined) {
          this.router.removeRoute(route.name)
        }
      }
    }

    routerLogger.info('路由刷新完成')
    return this._navTree
  }

  /** 获取已加载的导航树（导航模式下可用） */
  getNavTree(): RuntimeNavigation | null {
    this._navTree = this.activeNavTree()
    return this._navTree
  }

  /** 获取已注册路由列表 */
  getRegisteredRoutes(): string[] {
    return Array.from(this.registeredRoutes)
  }
}

/** 创建动态路由管理器 */
export function createDynamicRouter(options: DynamicRouterOptions): DynamicRouter {
  return new DynamicRouter(options)
}
