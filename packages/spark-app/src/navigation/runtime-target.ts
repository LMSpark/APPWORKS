/**
 * @module @spark-appworks/spark-app:navigation/runtime-target
 * 职责：提供应用壳层 runtime-target 能力，围绕 NavNodeRouteTargetKind、NavNodeRouteTarget、NavNodeExternalTarget 等 7 个公开契约 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/runtime-target。
 */
import type { NavigationLinkTarget } from '@spark-appworks/spark-utils'
import type { RuntimeNavigationItem } from './runtime-navigation'

/** Nav Node Route Target Kind 的语义模型。 */
export type NavNodeRouteTargetKind = 'page' | 'external-link' | 'cross-project-ref'

/** Nav Node Route Target 的语义模型。 */
export type NavNodeRouteTarget = {
    /** 类型判别字段。 */
kind: 'route'
    /** route Kind 字段。 */
routeKind: NavNodeRouteTargetKind
    /** 资源路径。 */
path: string}

/** 外链打开方式；NavigationLinkTarget 去掉 iframe（iframe 走壳内路由宿主）。 */
export type NavNodeExternalLinkMode = Exclude<NavigationLinkTarget, 'iframe'>

/** Nav Node External Target 的语义模型。 */
export type NavNodeExternalTarget = {
    /** 类型判别字段。 */
kind: 'external'
    /** mode 字段。 */
mode: NavNodeExternalLinkMode
    /** href 字段。 */
href: string}

/** Nav Node Action Target 的语义模型。 */
export type NavNodeActionTarget = {
    /** 类型判别字段。 */
kind: 'action'
    /** command 字段。 */
command: string}

/** Nav Node Container Target 的语义模型。 */
export type NavNodeContainerTarget = {
    /** 类型判别字段。 */
kind: 'container'
    /** redirect 字段。 */
redirect?: string}

/** Nav Node Runtime Target 的语义模型。 */
export type NavNodeRuntimeTarget =
  | NavNodeRouteTarget
  | NavNodeExternalTarget
  | NavNodeActionTarget
  | NavNodeContainerTarget

export function normalizeNavRuntimePath(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (withLeadingSlash.length === 1) return withLeadingSlash
  return withLeadingSlash.replace(/\/+$/, '')
}

function normalizeActionCommand(value: string): string {
  return value.trim().replace(/^\/+/, '')
}

function resolveRefHostPath(node: RuntimeNavigationItem): string {
  const explicitPath = typeof node.path === 'string' ? normalizeNavRuntimePath(node.path) : ''
  if (explicitPath.includes('/__ref/')) return explicitPath
  return normalizeNavRuntimePath(`/__ref/${encodeURIComponent(node.id)}`)
}

export function resolveNavNodeRuntimeTarget(node: RuntimeNavigationItem): NavNodeRuntimeTarget {
  const nodeKind = node.itemKind ?? 'page'

  if (nodeKind === 'system-action') {
    const command = typeof node.path === 'string' && node.path.trim() !== ''
      ? normalizeActionCommand(node.path)
      : node.id
    return { kind: 'action', command }
  }

  const redirect = typeof node.redirect === 'string' && node.redirect.trim() !== ''
    ? normalizeNavRuntimePath(node.redirect)
    : undefined

  if (nodeKind === 'module' || nodeKind === 'system-directory') {
    return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
  }

  if (nodeKind === 'ref') {
    return {
      kind: 'route',
      routeKind: 'cross-project-ref',
      path: resolveRefHostPath(node),
    }
  }

  if (nodeKind === 'link') {
    const href = typeof node.path === 'string' ? node.path.trim() : ''
    if (node.linkTarget === 'new-tab') {
      return { kind: 'external', mode: 'new-tab', href }
    }
    if (node.linkTarget === 'self') {
      return { kind: 'external', mode: 'self', href }
    }
    if (href === '') {
      return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
    }
    return {
      kind: 'route',
      routeKind: 'external-link',
      path: normalizeNavRuntimePath(`/__link/${encodeURIComponent(node.id)}`),
    }
  }

  const path = typeof node.path === 'string' && node.path.trim() !== ''
    ? normalizeNavRuntimePath(node.path)
    : ''
  if (path !== '') {
    return { kind: 'route', routeKind: 'page', path }
  }

  return redirect === undefined ? { kind: 'container' } : { kind: 'container', redirect }
}
