/**
 * @module @spark-appworks/spark-app:navigation/useNavigation
 * 职责：提供应用壳层 useNavigation 能力，围绕 UseNavigationOptions 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/useNavigation。
 */
import { computed, inject, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { createRequest } from '@spark-appworks/spark-utils'
import { readPrototypeProperty } from '@spark-appworks/spark-utils/internal'
import type { NavigationContext } from './nav-types'
import { NAV_KEY } from './nav-types'
import { getDynamicRouter, refreshRoutes } from './nav-access'
import { CROSS_PROJECT_REF_HOST_ROUTE_NAME } from '../router/cross-project-ref-route'
import { resolveNavNodeRuntimeTarget } from './runtime-target'
import type { NavigationActionRegistry } from './action-registry'
import type { ContextItem } from '@spark-appworks/spark-utils'
import type {
  NavigationContextConfig,
  NavigationPlacement,
} from '@spark-appworks/spark-utils'
import type {
  RuntimeNavigation,
  RuntimeNavigationContextState,
  RuntimeNavigationItem,
  RuntimeNavigationRegionItems,
  RuntimeNavigationRegionVisibility,
} from './runtime-navigation'
import { SYSTEM_PAGE_NAVIGATION_ID_QUERY } from './runtime-navigation'

/* ══════════════════════════════════════════════════════════
 * useNavigation — 应用导航核心 composable
 *
 * 在 App.vue 中调用一次，自动通过 Vue provide 向下注入。
 * 子组件通过 useNav() 消费。
 * ══════════════════════════════════════════════════════════ */

const CONTEXT_STORAGE_PREFIX = 'spark-nav-ctx:'
const PLATFORM_PATH_PREFIX = '/platform'
const _contextCache = new Map<string, ContextItem[]>()

type NamedRoutePush = Readonly<{
  routeName: string | symbol
  routePath: string
  inputPath: string
  identityNodeId?: string
}>

function contextSourceKey(nodeId: string, source: string): string {
  return `${nodeId}::${source}`
}

function contextConfigSignature(config: NavigationContextConfig): string {
  const sourcePart = Array.isArray(config.source)
    ? `static:${JSON.stringify(config.source)}`
    : `remote:${config.source}`

  return JSON.stringify({
    source: sourcePart,
    placeholder: config.placeholder ?? '',
    defaultValue: config.defaultValue ?? null,
    paramName: config.paramName ?? '',
  })
}

function isSameContextConfig(
  a: NavigationContextConfig,
  b: NavigationContextConfig,
): boolean {
  return contextConfigSignature(a) === contextConfigSignature(b)
}

function isNavContextItem(value: unknown): value is ContextItem {
  if (value === null || typeof value !== 'object') return false
  const id = readPrototypeProperty(value, 'id')
  const title = readPrototypeProperty(value, 'title')
  return (typeof id === 'string' || typeof id === 'number') && typeof title === 'string'
}

function isNavContextItemArray(value: unknown): value is readonly ContextItem[] {
  return Array.isArray(value) && value.every(isNavContextItem)
}

function parseStoredContextValue(stored: string): string | number | null {
  const parsed: unknown = JSON.parse(stored)
  return typeof parsed === 'string' || typeof parsed === 'number' ? parsed : null
}

/** 约定优先：将简写形式归一化为完整运行导航上下文配置。 */
function normalizeContextConfig(
  input: string | readonly ContextItem[] | NavigationContextConfig,
): NavigationContextConfig {
  // 字符串 → URL 简写
  if (typeof input === 'string') {
    return { source: input }
  }
  // 数组 → 静态列表
  if (isNavContextItemArray(input)) {
    return { source: input }
  }
  // 已是完整配置
  if ('source' in input) return input
  throw new Error('运行导航上下文配置无效')
}

/** 将 source 解析为远程 URL（字符串直接作为 url） */
function resolveRemoteSource(source: string): { url: string } {
  return { url: source }
}

/** Use Navigation Options 的调用配置。 */
type UseNavigationOptions = {
  /** 跨应用导航回调：检测到 @app:projectId/path 格式时调用，由调用方实现项目切换逻辑 */
  onCrossAppNavigate?: (projectId: string, path: string) => Promise<void>
  /** 返回额外请求头（如 Authorization），用于远程上下文数据加载 */
  getHeaders?: () => Record<string, string>
  /** system-action 命令执行器 */
  actionRegistry?: NavigationActionRegistry}

export function useNavigation(navRoot: RuntimeNavigation, _options?: UseNavigationOptions): NavigationContext {
  const route = useRoute()
  const router = useRouter()

  // ── 活动路径（从根到当前叶子） ──
  const _activePath = ref<RuntimeNavigationItem[]>([])

  // ── 角标动态覆写 ──
  const _badges = reactive<Record<string, string | number | undefined>>({})

  // ── 模块上下文（单一状态，作用域 = 模块下全部页面） ──
  const _moduleContext = ref<RuntimeNavigationContextState | null>(null)

  /** 模块节点缓存（key = moduleId），避免切换子页面时重建 */
  const _contextByModule = new Map<string, RuntimeNavigationContextState>()

  // ── 路由变化 → 重算活动路径 + 模块上下文 ──

  /** 从实际路由路径中剥离工作台前缀（/t/:tenantId/:projectId/xxx 或 /platform/xxx → /xxx） */
  function stripWorkspacePrefix(path: string): string {
    const match = /^\/t\/[^/]+\/[^/]+(.*)$/.exec(path)
    if (match) return match[1] ?? '/'
    if (path === PLATFORM_PATH_PREFIX) return '/'
    if (path.startsWith(`${PLATFORM_PATH_PREFIX}/`)) return path.slice(PLATFORM_PATH_PREFIX.length) || '/'
    return path
  }

  function normalizePath(path: string): string {
    const trimmed = path.trim()
    if (trimmed === '') return '/'
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    if (withLeadingSlash.length === 1) return withLeadingSlash
    return withLeadingSlash.replace(/\/+$/, '')
  }

  function normalizeComparablePath(path: string): string {
    return normalizePath(stripWorkspacePrefix(path))
  }

  function resolveNodeRoutePath(node: RuntimeNavigationItem): string | null {
    const target = resolveNavNodeRuntimeTarget(node)
    return target.kind === 'route' ? target.path : null
  }

  /** 为裸路径添加当前租户+项目前缀（/xxx → /t/{tenantId}/{projectId}/xxx） */
  function addTenantPrefix(path: string): string {
    const normalized = normalizePath(path)
    const tenantId = route.params['tenantId']
    const projectId = route.params['projectId']

    // 兼容导航里写了模板路径的场景：替换为当前真实值
    if (normalized.startsWith('/t/:tenantId')) {
      const resolvedTenant = typeof tenantId === 'string' && tenantId ? tenantId : 'default'
      const resolvedProject = typeof projectId === 'string' && projectId ? projectId : 'homepage'
      // 先替换完整模板 /t/:tenantId/:projectId，再兜底只有 :tenantId 的情况
      const replaced = normalized.includes('/t/:tenantId/:projectId')
        ? normalized.replace('/t/:tenantId/:projectId', `/t/${resolvedTenant}/${resolvedProject}`)
        : normalized.replace('/t/:tenantId', `/t/${resolvedTenant}/${resolvedProject}`)
      return normalizePath(replaced)
    }

    // 已有真实租户前缀 → 直接返回
    if (normalized.startsWith('/t/')) return normalized
    if (normalized === PLATFORM_PATH_PREFIX || normalized.startsWith(`${PLATFORM_PATH_PREFIX}/`)) return normalized

    if (route.path === PLATFORM_PATH_PREFIX || route.path.startsWith(`${PLATFORM_PATH_PREFIX}/`)) {
      return normalizePath(`${PLATFORM_PATH_PREFIX}${normalized}`)
    }

    if (typeof tenantId === 'string' && tenantId) {
      const resolvedProject = typeof projectId === 'string' && projectId ? projectId : 'homepage'
      return normalizePath(`/t/${tenantId}/${resolvedProject}${normalized}`)
    }
    return normalized
  }

  watch(
    [() => route.path, () => route.meta['nodeId'], () => route.meta['systemPageIdentityState'], () => navRoot.items,
      () => getDynamicRouter()?.systemPageRevision.value],
    ([path]) => {
      const shortPath = stripWorkspacePrefix(path)
      const isIdentityHost = route.meta['systemPageIdentityHost'] === true
      const activeIdentityNodeId = route.meta['systemPageIdentityState'] === 'resolved'
        && typeof route.meta['nodeId'] === 'string'
        ? route.meta['nodeId']
        : null
      _activePath.value = findActivePath(navRoot.items, shortPath, isIdentityHost ? activeIdentityNodeId : undefined)
      syncModuleContext()
    },
    { immediate: true },
  )

  /* ────────────────────────────────────────────
   * 节点排序 & 过滤
   * ──────────────────────────────────────────── */

  function sortNodes(nodes: RuntimeNavigationItem[]): RuntimeNavigationItem[] {
    return [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  function filterVisible(nodes: RuntimeNavigationItem[]): RuntimeNavigationItem[] {
    return sortNodes(nodes).filter((n) => !n.hidden)
  }

  /* ────────────────────────────────────────────
   * 活动路径查找（DFS）
   * ──────────────────────────────────────────── */

  function findActivePath(nodes: RuntimeNavigationItem[], targetPath: string, identityNodeId?: string | null): RuntimeNavigationItem[] {
    const normalizedTargetPath = normalizeComparablePath(targetPath)

    for (const node of sortNodes(nodes)) {
      if (identityNodeId !== undefined) {
        if (identityNodeId !== null && node.id === identityNodeId) return [node]
      } else {
        const nodePath = resolveNodeRoutePath(node)
        if (nodePath !== null) {
          const normalizedNodePath = normalizeComparablePath(nodePath)
          if (normalizedNodePath === normalizedTargetPath) return [node]
        }
      }
      if (node.children?.length) {
        const sub = findActivePath(node.children, targetPath, identityNodeId)
        if (sub.length > 0) return [node, ...sub]
      }
    }
    return []
  }

  /* ────────────────────────────────────────────
   * 区域派生
   * ──────────────────────────────────────────── */

  const regionItems = computed<RuntimeNavigationRegionItems>(() => {
    const regions: RuntimeNavigationRegionItems = { header: [], sidebar: [], toolbar: [], userMenu: [] }
    const claimedPlacements = new Set<NavigationPlacement>()

    // 根级子项：toolbar/user-menu 组提取到对应区域，其余放入 root childPlacement 指定区域
    const rootVisible = filterVisible(navRoot.items)
    const normalRoots: RuntimeNavigationItem[] = []
    for (const child of rootVisible) {
      if (child.childPlacement === 'toolbar' && child.children?.length) {
        regions.toolbar = filterVisible(child.children)
      } else if (child.childPlacement === 'user-menu' && child.children?.length) {
        regions.userMenu = filterVisible(child.children)
      } else {
        normalRoots.push(child)
      }
    }
    regions[navRoot.childPlacement] = normalRoots

    // 沿活动路径，每个有子节点的非叶节点根据 childPlacement 放入对应区域
    for (const node of _activePath.value) {
      if (!node.children?.length) continue
      const placement = resolveNavigationPlacement(node)
      // parent / flat / toolbar / user-menu 不创建新区域
      if (placement === 'parent' || placement === 'flat' || placement === 'toolbar' || placement === 'user-menu') continue
      // 同一区域只投影离根最近的一层；更深层节点交给区域内递归导航渲染，避免点击子项后把当前层整体替换掉。
      if (claimedPlacements.has(placement)) continue
      regions[placement] = filterVisible(node.children)
      claimedPlacements.add(placement)
    }

    return regions
  })

  const regionVisibility = computed<RuntimeNavigationRegionVisibility>(() => ({
    header: regionItems.value.header.length > 0,
    sidebar: regionItems.value.sidebar.length > 0,
    toolbar: regionItems.value.toolbar.length > 0,
    userMenu: regionItems.value.userMenu.length > 0,
  }))

  /** 解析 childPlacement（'parent' 向上追溯到祖先的非 parent 值） */
  function resolveNavigationPlacement(node: RuntimeNavigationItem): NavigationPlacement {
    const placement = node.childPlacement ?? 'sidebar'
    if (placement !== 'parent') return placement

    // 沿 activePath 向上查找最近的非 'parent' 祖先
    const idx = _activePath.value.indexOf(node)
    for (let i = idx - 1; i >= 0; i--) {
      const ancestor = _activePath.value[i]
      if (!ancestor) continue
      const ap = ancestor.childPlacement ?? 'sidebar'
      if (ap !== 'parent') return ap
    }

    // 兜底：回退到 root 的 childPlacement
    return navRoot.childPlacement
  }

  /* ────────────────────────────────────────────
   * 模块上下文管理（父级 = 模块 ID，作用域 = 模块下全部页面）
   * ──────────────────────────────────────────── */

  function syncModuleContext() {
    // 模块 = activePath 中的第一个节点（根的直接子节点）
    const moduleNode = _activePath.value[0]
    if (moduleNode?.context === undefined) {
      _moduleContext.value = null
      return
    }

    // 约定优先：归一化简写为完整运行导航上下文配置。
    const config = normalizeContextConfig(moduleNode.context)

    // 同模块复用已有状态
    const cached = _contextByModule.get(moduleNode.id)
    if (cached) {
      if (!isSameContextConfig(cached.config, config)) {
        cached.config = config
        cached.selected = restoreContextValue(moduleNode.id, config)
        cached.items = []
        cached.error = null
        void loadContextItems(cached, true)
      }
      _moduleContext.value = cached
      return
    }

    const state: RuntimeNavigationContextState = reactive({
      config,
      nodeId: moduleNode.id,
      selected: restoreContextValue(moduleNode.id, config),
      items: [],
      loading: false,
      error: null,
    })
    void loadContextItems(state)
    _contextByModule.set(moduleNode.id, state)
    _moduleContext.value = state
  }

  async function loadContextItems(state: RuntimeNavigationContextState, forceReload = false) {
    const { source } = state.config

    // 静态数据
    if (typeof source !== 'string') {
      state.items = [...source]
      return
    }

    // 约定优先：字符串 source 解析为 { url }
    const remote = resolveRemoteSource(source)
    const cacheKey = contextSourceKey(state.nodeId, remote.url)

    // 缓存命中
    if (!forceReload && _contextCache.has(cacheKey)) {
      state.items = _contextCache.get(cacheKey) ?? []
      return
    }

    // 远程加载
    state.loading = true
    state.error = null
    try {
      const client = createRequest()
      const headers = _options?.getHeaders?.() ?? {}
      const data = await client.request<unknown>({
        url: remote.url,
        method: 'GET',
        headers,
      })

      const items = Array.isArray(data) ? data.filter(isNavContextItem) : []
      state.items = items
      _contextCache.set(cacheKey, items)
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
    } finally {
      state.loading = false
    }
  }

  function restoreContextValue(
    nodeId: string,
    config: NavigationContextConfig,
  ): string | number | null {
    // 优先从 URL query
    if (config.paramName !== undefined && config.paramName !== '') {
      const val = route.query[config.paramName]
      if (val !== null && val !== undefined && val !== '') return String(val)
    }

    // localStorage
    const stored = localStorage.getItem(CONTEXT_STORAGE_PREFIX + nodeId)
    if (stored !== null) {
      try {
        return parseStoredContextValue(stored)
      } catch {
        // ignore
      }
    }

    // 默认值
    return config.defaultValue ?? null
  }

  function setContextValue(value: string | number | null) {
    const state = _moduleContext.value
    if (!state) return

    state.selected = value

    // 持久化
    if (value !== null) {
      localStorage.setItem(CONTEXT_STORAGE_PREFIX + state.nodeId, JSON.stringify(value))
    } else {
      localStorage.removeItem(CONTEXT_STORAGE_PREFIX + state.nodeId)
    }

    // 同步到 URL query（不含待移除的 key）
    if (state.config.paramName !== undefined && state.config.paramName !== '') {
      const paramName = state.config.paramName
      const newQuery: LocationQueryRaw = {}
      for (const [k, v] of Object.entries(route.query)) {
        if (k === paramName) continue
        newQuery[k] = Array.isArray(v) ? [...v] : v
      }
      if (value !== null) {
        newQuery[paramName] = String(value)
      }
      void router.replace({ query: newQuery })
    }
  }

  /* ────────────────────────────────────────────
   * 导航操作
   * ──────────────────────────────────────────── */

  function pushNamedRoute(command: NamedRoutePush): void {
    const tenantId = route.params['tenantId']
    const projectId = route.params['projectId']
    const params: Record<string, string> = {}
    if (command.routePath.startsWith('/t/')) {
      if (typeof tenantId === 'string' && tenantId) {
        params['tenantId'] = tenantId
      }
      if (typeof projectId === 'string' && projectId) {
        params['projectId'] = projectId
      }
    }
    const requested = router.resolve(command.inputPath)
    const query = { ...requested.query }
    if (command.identityNodeId !== undefined) {
      if (Object.prototype.hasOwnProperty.call(query, SYSTEM_PAGE_NAVIGATION_ID_QUERY)) {
        throw new Error(`系统页面目标使用保留身份参数：${command.identityNodeId}`)
      }
      query[SYSTEM_PAGE_NAVIGATION_ID_QUERY] = command.identityNodeId
    }
    void router.push({
      name: command.routeName,
      query,
      hash: requested.hash,
      ...(Object.keys(params).length > 0 ? { params } : {}),
    })
  }

  function ensureCrossProjectRefHostRoute(): boolean {
    const existing = router.getRoutes().find(routeRecord => routeRecord.name === CROSS_PROJECT_REF_HOST_ROUTE_NAME)
    const defaultProps = readPrototypeProperty(existing?.props, 'default')
    return existing?.meta['crossProjectRefHost'] === true && typeof defaultProps === 'function'
  }

  async function navigateToRefNode(node: RuntimeNavigationItem): Promise<void> {
    const target = resolveNavNodeRuntimeTarget(node)
    if (target.kind !== 'route') return

    const refNodeId = node.id
    await refreshRoutes().catch(() => null)
    const tenantId = route.params['tenantId']
    const projectId = route.params['projectId']
    if (
      typeof tenantId === 'string' && tenantId &&
      typeof projectId === 'string' && projectId &&
      ensureCrossProjectRefHostRoute()
    ) {
      void router.push({
        name: CROSS_PROJECT_REF_HOST_ROUTE_NAME,
        params: {
          tenantId,
          projectId,
          refNodeId,
        },
      })
      return
    }

    const targetPath = addTenantPrefix(target.path)
    void router.push(targetPath)
  }

  /**
   * 导航到指定路径 — 统一从路由表 meta.type 自动判定
   *
   * 如果该路径存在 system-page / cross-project-ref 路由，优先按 name 跳转（精确匹配）；
   * 否则降级为 router.push(path)。
   * 不再依赖导航节点的 linkTarget 字段 —— 路由表是唯一权威。
   */
  function navigateByPath(path: string, identityNodeId?: string): void {
    // 跨应用导航：@app:projectId/path → 委托给外部回调
    if (path.startsWith('@app:') && _options?.onCrossAppNavigate) {
      const match = /^@app:([^/]+)(\/.*)?$/.exec(path)
      if (match?.[1]) {
        void _options.onCrossAppNavigate(match[1], match[2] ?? '/')
        return
      }
    }

    const targetPath = addTenantPrefix(path)
    if (identityNodeId !== undefined) {
      const resolvedTarget = router.resolve(targetPath)
      const selectedRoute = router.getRoutes().find(routeRecord => routeRecord.name === resolvedTarget.name)
      if (selectedRoute?.meta['systemPageIdentityHost'] === true && selectedRoute.name !== undefined) {
        pushNamedRoute({
          routeName: selectedRoute.name,
          routePath: selectedRoute.path,
          inputPath: targetPath,
          identityNodeId,
        })
        return
      }
    }

    const normalizedInputPath = normalizePath(path.split(/[?#]/, 1)[0] ?? '')
    const exactSystemRoute = router
      .getRoutes()
      .find((routeRecord) =>
        routeRecord.meta['type'] === 'system-page' &&
        normalizePath(routeRecord.path) === normalizedInputPath
      )

    if (exactSystemRoute?.name !== undefined) {
      pushNamedRoute({ routeName: exactSystemRoute.name, routePath: exactSystemRoute.path, inputPath: path })
      return
    }

    const targetComparablePath = normalizeComparablePath(targetPath.split(/[?#]/, 1)[0] ?? '')

    // 从路由表查找 vue-component 路由（路由注册时由 DynamicRouter 写入 meta.type）
    const vueRoute = router
      .getRoutes()
      .find((routeRecord) =>
        routeRecord.meta['type'] === 'system-page' &&
        normalizeComparablePath(routeRecord.path) === targetComparablePath
      )

    if (vueRoute?.name !== undefined) {
      pushNamedRoute({ routeName: vueRoute.name, routePath: vueRoute.path, inputPath: targetPath })
      return
    }

    const crossProjectRoute = router
      .getRoutes()
      .find((routeRecord) =>
        routeRecord.meta['type'] === 'cross-project-ref' &&
        normalizeComparablePath(routeRecord.path) === targetComparablePath
      )

    if (crossProjectRoute?.name !== undefined) {
      pushNamedRoute({ routeName: crossProjectRoute.name, routePath: crossProjectRoute.path, inputPath: targetPath })
      return
    }

    void router.push(targetPath)
  }

  function navigateToPath(path: string) {
    navigateByPath(path)
  }

  function navigateTo(node: RuntimeNavigationItem) {
    if (node.disabled) return
    const target = resolveNavNodeRuntimeTarget(node)

    if (target.kind === 'action') {
      void _options?.actionRegistry?.execute(target.command, { node, source: 'navigation' })
      return
    }

    // self 链接：当前窗口导航（同源+跨项目走 switchAndReload，同项目走 router.push，跨域走 location.href）
    if (target.kind === 'external' && target.mode === 'self' && target.href !== '') {
      const url = target.href
      try {
        const parsed = new URL(url, window.location.origin)
        if (parsed.origin === window.location.origin) {
          // 解析目标路径中的 projectId：/t/{tenantId}/{projectId}/...
          const segments = parsed.pathname.replace(/^\/+/, '').split('/')
          const targetProjectId = segments[0] === 't' && segments.length >= 3 ? segments[2] : undefined
          const currentProjectId = typeof route.params['projectId'] === 'string' ? route.params['projectId'] : undefined
          if (targetProjectId && currentProjectId && targetProjectId !== currentProjectId && _options?.onCrossAppNavigate) {
            // 跨项目：提取 projectId 之后的路径段
            const innerPath = `/${segments.slice(3).join('/')}${parsed.search}${parsed.hash}`
            void _options.onCrossAppNavigate(targetProjectId, innerPath)
          } else {
            void router.push(parsed.pathname + parsed.search + parsed.hash)
          }
        } else {
          window.location.href = url
        }
      } catch {
        window.location.href = url
      }
      return
    }

    // new-tab 外部链接：直接新标签页打开
    if (target.kind === 'external' && target.mode === 'new-tab' && target.href !== '') {
      window.open(target.href, '_blank', 'noopener,noreferrer')
      return
    }

    // iframe 外部链接：跳转到虚拟路由
    if (target.kind === 'route' && target.routeKind === 'external-link') {
      navigateByPath(target.path)
      return
    }

    // 跨工程引用：进入本项目宿主路由，再由 CrossProjectRefPage 加载目标项目页面。
    if (target.kind === 'route' && target.routeKind === 'cross-project-ref') {
      void navigateToRefNode(node)
      return
    }

    // 重定向
    if (target.kind === 'container' && target.redirect !== undefined) {
      navigateByPath(target.redirect)
      return
    }

    // 叶子节点
    if (target.kind === 'route') {
      if (target.routeKind === 'page') {
        navigateByPath(target.path, node.id)
      } else {
        navigateByPath(target.path)
      }
      return
    }

    // 组节点：跳转到第一个可见叶子
    if (node.children?.length) {
      const leaf = findFirstLeaf(node.children)
      if (leaf !== undefined) {
        navigateTo(leaf)
      }
    }
  }

  function findFirstLeaf(nodes: RuntimeNavigationItem[]): RuntimeNavigationItem | undefined {
    for (const node of filterVisible(nodes)) {
      if (node.disabled) continue
      if (resolveNodeRoutePath(node) !== null) return node
      if (node.children?.length) {
        const leaf = findFirstLeaf(node.children)
        if (leaf) return leaf
      }
    }
    return undefined
  }

  /* ────────────────────────────────────────────
   * 角标
   * ──────────────────────────────────────────── */

  function getBadge(nodeId: string): string | number | undefined {
    return _badges[nodeId]
  }

  function setBadge(nodeId: string, value: string | number | undefined) {
    _badges[nodeId] = value
  }

  /* ────────────────────────────────────────────
   * 活动判断
   * ──────────────────────────────────────────── */

  function isNodeActive(node: RuntimeNavigationItem): boolean {
    return _activePath.value.some((n) => n.id === node.id)
  }

  /* ── 组装上下文并 provide ── */

  const context: NavigationContext = {
    activePath: computed(() => _activePath.value),
    regionItems,
    regionVisibility,
    moduleContext: computed(() => _moduleContext.value),
    navigateTo,
    navigateToPath,
    setContextValue,
    isNodeActive,
    getBadge,
    setBadge,
  }

  provide(NAV_KEY, context)

  return context
}

/* ══════════════════════════════════════════════════════════
 * useNav — 子组件消费导航上下文
 * ══════════════════════════════════════════════════════════ */

export function useNav(): NavigationContext | null {
  return inject(NAV_KEY, null)
}
