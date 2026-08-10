/**
 * @module @spark-appworks/spark-app:router/cross-project-ref-page
 * 职责：提供应用壳层 cross-project-ref-page 能力，围绕 CrossProjectRefPageRouteProps 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/cross-project-ref-page。
 */
import { computed, defineComponent, h, ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { SparkPageRenderer } from '@spark-appworks/spark-component'
import {
  createRuntimePageNode,
  PageContentLoader,
  type PageNodeLike,
} from '@spark-appworks/spark-project-model'
import { Logger } from '@spark-appworks/spark-utils'
import { getNavTree } from '../navigation/nav-access'
import type { RuntimeNavigation, RuntimeNavigationItem } from '../navigation/runtime-navigation'

type ReloadableRenderer = {
  reload?: () => Promise<void>}

type ParsedRefPath = {
  projectId: string | null
  pageId: string | null}

type ResolvedRefTarget = {
  hostRefNodeId: string | null
  targetProjectId: string | null
  refPath: string | null
  pageId: string | null}

/** Cross Project Ref Page Route Props 的属性契约。 */
export type CrossProjectRefPageRouteProps = {
    /** page Content Loader 字段。 */
pageContentLoader: PageContentLoader
    /** tenant Id 标识。 */
tenantId?: string | undefined
    /** host Project Id 标识。 */
hostProjectId?: string | undefined
    /** route Path 路径。 */
routePath?: string | undefined
    /** route Meta 字段。 */
routeMeta?: Record<string, unknown> | undefined}

type RefTargetResolutionInput = Readonly<{
  navTree: RuntimeNavigation | null
  routePath: string
  routeMeta: Record<string, unknown>
  hostProjectId: string | null
}>

const logger = Logger('CrossProjectRefPage')

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function createCrossProjectRefRouteProps(pageContentLoader: PageContentLoader) {
  return (route: RouteLocationNormalizedLoaded): CrossProjectRefPageRouteProps => {
    const tenantId = asNonEmptyString(route.params['tenantId'])
    const hostProjectId = asNonEmptyString(route.params['projectId'])
    return {
      pageContentLoader,
      routePath: route.path,
      routeMeta: { ...route.meta },
      ...(tenantId !== null && { tenantId }),
      ...(hostProjectId !== null && { hostProjectId }),
    }
  }
}

function stripQueryAndHash(path: string): string {
  return path.split('#', 1)[0]?.split('?', 1)[0] ?? path
}

function normalizePath(path: string): string {
  const trimmed = stripQueryAndHash(path).trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function stripTenantProjectPrefix(path: string): string {
  const normalized = normalizePath(path)
  const match = /^\/t\/[^/]+\/[^/]+(\/.*)?$/.exec(normalized)
  return normalizePath(match?.[1] ?? normalized)
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function resolveHostRefNodeId(routePath: string): string | null {
  const segments = stripTenantProjectPrefix(routePath).split('/').filter(Boolean)
  const refIndex = segments.indexOf('__ref')
  const refNodeId = refIndex >= 0 ? segments[refIndex + 1] : undefined
  return refNodeId === undefined ? null : decodePathSegment(refNodeId)
}

function safePageId(value: unknown, hostRefNodeId: string | null): string | null {
  const pageId = asNonEmptyString(value)
  if (pageId === null || pageId === hostRefNodeId) return null
  return pageId
}

function lastPathSegment(path: string): string | null {
  const normalized = normalizePath(path)
  const segments = normalized.split('/').filter(Boolean)
  return segments.length === 0 ? null : (segments[segments.length - 1] ?? null)
}

function parseRefPath(refPath: string | null): ParsedRefPath {
  if (refPath === null) return { projectId: null, pageId: null }

  const trimmed = refPath.trim()
  const appMatch = /^@app:([^/]+)(\/.*)?$/.exec(trimmed)
  if (appMatch !== null) {
    return {
      projectId: asNonEmptyString(appMatch[1]),
      pageId: appMatch[2] === undefined ? null : lastPathSegment(appMatch[2]),
    }
  }

  return {
    projectId: null,
    pageId: lastPathSegment(trimmed),
  }
}

function refNodeHostPath(node: RuntimeNavigationItem): string {
  const explicitPath = asNonEmptyString(node.path)
  if (explicitPath !== null && normalizePath(explicitPath).includes('/__ref/')) {
    return explicitPath
  }
  return `/__ref/${encodeURIComponent(node.id)}`
}

function findRefNodeById(nodes: RuntimeNavigationItem[], refNodeId: string): RuntimeNavigationItem | null {
  for (const node of nodes) {
    if (node.itemKind === 'ref' && node.id === refNodeId) return node
    if (node.children?.length) {
      const match = findRefNodeById(node.children, refNodeId)
      if (match !== null) return match
    }
  }
  return null
}

function findRefNodeByHostPath(nodes: RuntimeNavigationItem[], routePath: string): RuntimeNavigationItem | null {
  const targetPath = stripTenantProjectPrefix(routePath)
  for (const node of nodes) {
    if (node.itemKind === 'ref' && stripTenantProjectPrefix(refNodeHostPath(node)) === targetPath) {
      return node
    }
    if (node.children?.length) {
      const match = findRefNodeByHostPath(node.children, routePath)
      if (match !== null) return match
    }
  }
  return null
}

function findRouteRefNode(
  navTree: RuntimeNavigation | null,
  routePath: string,
  hostRefNodeId: string | null,
): RuntimeNavigationItem | null {
  if (navTree === null) return null
  if (hostRefNodeId !== null) {
    const byId = findRefNodeById(navTree.items, hostRefNodeId)
    if (byId !== null) return byId
  }
  return findRefNodeByHostPath(navTree.items, routePath)
}

function resolveRefTarget(input: RefTargetResolutionInput): ResolvedRefTarget {
  const { navTree, routePath, routeMeta, hostProjectId } = input
  const hostRefNodeId = resolveHostRefNodeId(routePath)
  const refNode = findRouteRefNode(navTree, routePath, hostRefNodeId)
  const refPath = asNonEmptyString(refNode?.refPath) ?? asNonEmptyString(routeMeta['refPath'])
  const parsedRefPath = parseRefPath(refPath)

  const targetProjectId =
    asNonEmptyString(refNode?.refProjectId) ??
    asNonEmptyString(routeMeta['refProjectId']) ??
    parsedRefPath.projectId ??
    hostProjectId

  const pageId =
    parsedRefPath.pageId ??
    safePageId(routeMeta['refPageId'], hostRefNodeId) ??
    safePageId(routeMeta['pageId'], hostRefNodeId) ??
    safePageId(refNode?.refId, hostRefNodeId)

  return {
    hostRefNodeId,
    targetProjectId,
    refPath,
    pageId,
  }
}

export const CrossProjectRefPage = defineComponent({
  name: 'SparkCrossProjectRefPage',
  props: {
    pageContentLoader: {
      type: Object,
      required: true,
    },
    tenantId: {
      type: String,
      required: false,
    },
    hostProjectId: {
      type: String,
      required: false,
    },
    routePath: {
      type: String,
      required: false,
    },
    routeMeta: {
      type: Object,
      required: false,
      default: () => ({}),
    },
  },
  setup(props: Readonly<CrossProjectRefPageRouteProps>, { expose }) {
    const pageRendererRef = ref<ReloadableRenderer | null>(null)
    let lastLoggedErrorKey: string | null = null

    expose({
      async reload() {
        await pageRendererRef.value?.reload?.()
      },
    })

    const tenantId = computed(() => asNonEmptyString(props.tenantId))
    const hostProjectId = computed(() => asNonEmptyString(props.hostProjectId))
    const routePath = computed(() => {
      const resolved = asNonEmptyString(props.routePath)
      return resolved ?? '/'
    })
    const routeMeta = computed(() => props.routeMeta ?? {})
    const refTarget = computed(() =>
      resolveRefTarget({
        navTree: getNavTree(),
        routePath: routePath.value,
        routeMeta: routeMeta.value,
        hostProjectId: hostProjectId.value,
      })
    )
    const targetProjectId = computed(() => refTarget.value.targetProjectId)
    const targetPageId = computed(() => refTarget.value.pageId)

    const scopedPageContentLoader = computed<PageContentLoader | null>(() => {
      const scopedProjectId = targetProjectId.value
      if (tenantId.value === null || scopedProjectId === null) return null

      const readPageFile = props.pageContentLoader.getPageFileReader()
      return new PageContentLoader({
        projectId: scopedProjectId,
        ...(readPageFile === undefined ? {} : { readPageFile }),
      })
    })

    const scopedPageNode = computed<PageNodeLike | null>(() => {
      const loader = scopedPageContentLoader.value
      const pageId = targetPageId.value
      if (loader === null || pageId === null) return null
      return createRuntimePageNode(pageId, loader)
    })

    const errorMessage = computed(() => {
      if (tenantId.value === null) return '缺少 tenantId，无法解析引用页面'
      if (targetProjectId.value === null) return '缺少目标项目 ID，无法解析引用页面'
      if (targetPageId.value === null) return '缺少目标页面 ID，无法解析引用页面'
      return null
    })

    function logInitError(message: string): void {
      const target = refTarget.value
      const logKey = JSON.stringify({
        route: routePath.value,
        hostRefNodeId: target.hostRefNodeId,
        refProjectId: target.targetProjectId,
        refPath: target.refPath,
        pageId: target.pageId,
        message,
      })
      if (logKey === lastLoggedErrorKey) return

      lastLoggedErrorKey = logKey
      logger.error('跨项目引用页初始化失败', {
        route: routePath.value,
        tenantId: tenantId.value,
        hostRefNodeId: target.hostRefNodeId,
        refProjectId: target.targetProjectId,
        refPath: target.refPath,
        pageId: target.pageId,
        message,
      })
    }

    return () => {
      if (errorMessage.value !== null || scopedPageNode.value === null || targetPageId.value === null) {
        const message = errorMessage.value ?? '引用页面节点初始化失败'
        logInitError(message)
        return h('div', { class: 'spark-cross-project-ref-error' }, message)
      }

      return h(SparkPageRenderer, {
        ref: pageRendererRef,
        key: `${targetProjectId.value}:${targetPageId.value}`,
        pageId: targetPageId.value,
        pageNode: scopedPageNode.value,
      })
    }
  },
})
