/**
 * @module @spark-appworks/spark-app:router/route-helpers
 * 职责：提供应用壳层 route-helpers 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/route-helpers。
 */
import type { RuntimeNavigationItem } from '../navigation/runtime-navigation'

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function resolveCrossProjectRefPageId(refPath: string | undefined): string | null {
  const normalizedRefPath = typeof refPath === 'string' ? refPath.trim() : ''
  if (normalizedRefPath === '') return null

  const match = /^@app:[^/]+(\/.*)?$/.exec(normalizedRefPath)
  const targetPath = (match?.[1] ?? normalizedRefPath).split('#', 1)[0]?.split('?', 1)[0] ?? ''
  const pageId = targetPath.replace(/^\/+/, '').replace(/\/+$/, '')
  return pageId === '' ? null : pageId
}

export function resolveNavRoutePageId(node: RuntimeNavigationItem, rawNodePath: string): string {
  if (node.itemKind === 'ref') {
    return resolveCrossProjectRefPageId(node.refPath) ?? node.refId ?? node.id
  }

  const normalizedPath = normalizePath(rawNodePath)
  const slug = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const slugSegments = slug.split('/').filter(Boolean)
  const isConfigLikeNode =
    node.itemKind !== 'system-page' &&
    node.itemKind !== 'system-action' &&
    node.itemKind !== 'link'

  const firstSlugSegment = slugSegments[0]
  if (isConfigLikeNode && slugSegments.length === 1 && firstSlugSegment !== undefined) {
    return firstSlugSegment
  }

  const lastSlugSegment = slugSegments.at(-1)
  if (isConfigLikeNode && slugSegments.length > 1 && isUuidLike(node.id) && lastSlugSegment !== undefined) {
    return lastSlugSegment
  }

  return node.id
}
