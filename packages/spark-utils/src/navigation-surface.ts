/**
 * @module @spark-appworks/spark-utils:navigation-surface
 * 职责：运行导航表面共享契约（item kind / placement / linkTarget / root placement / context config）的唯一字面量 SSOT。
 * 边界：跨包共享的导航表面形状；不含蓝图业务 kind、壳导航树装配或 lowcode wire。
 * AI用途：蓝图交付投影与壳 RuntimeNavigation 共用这些字面量时只改本文件，禁止各包再定义同形别名。
 */
import type { ContextItem } from './script-types.js'

/** 运行导航项/蓝图交付投影种类字面量表。 */
export const RUNTIME_NAVIGATION_ITEM_KINDS = [
  'system-directory',
  'module',
  'system-page',
  'system-action',
  'page',
  'link',
  'ref',
] as const

/** 运行导航项种类；蓝图 nodeKind 交付投影与壳 itemKind 共用。 */
export type RuntimeNavigationItemKind = (typeof RUNTIME_NAVIGATION_ITEM_KINDS)[number]

const RUNTIME_NAVIGATION_ITEM_KIND_SET: ReadonlySet<string> = new Set(RUNTIME_NAVIGATION_ITEM_KINDS)

/** 运行时判定 RuntimeNavigationItemKind。 */
export function isRuntimeNavigationItemKind(value: unknown): value is RuntimeNavigationItemKind {
  return typeof value === 'string' && RUNTIME_NAVIGATION_ITEM_KIND_SET.has(value)
}

/** 导航子节点布局区域字面量表。 */
export const NAVIGATION_PLACEMENTS = [
  'header',
  'sidebar',
  'toolbar',
  'user-menu',
  'parent',
  'flat',
] as const

/** 导航子节点布局区域；蓝图 childPlacement 与壳 childPlacement 共用。 */
export type NavigationPlacement = (typeof NAVIGATION_PLACEMENTS)[number]

const NAVIGATION_PLACEMENT_SET: ReadonlySet<string> = new Set(NAVIGATION_PLACEMENTS)

/** 运行时判定 NavigationPlacement。 */
export function isNavigationPlacement(value: unknown): value is NavigationPlacement {
  return typeof value === 'string' && NAVIGATION_PLACEMENT_SET.has(value)
}

/** 项目根/壳根导航布局区域（NavigationPlacement 的合法子集）。 */
export const NAVIGATION_ROOT_PLACEMENTS = ['header', 'sidebar'] as const

/** 项目根与壳 RuntimeNavigation.childPlacement 共用；不可放宽为完整 NavigationPlacement。 */
export type NavigationRootPlacement = (typeof NAVIGATION_ROOT_PLACEMENTS)[number]

const NAVIGATION_ROOT_PLACEMENT_SET: ReadonlySet<string> = new Set(NAVIGATION_ROOT_PLACEMENTS)

/** 运行时判定 NavigationRootPlacement。 */
export function isNavigationRootPlacement(value: unknown): value is NavigationRootPlacement {
  return typeof value === 'string' && NAVIGATION_ROOT_PLACEMENT_SET.has(value)
}

/** link 节点打开目标字面量表。 */
export const NAVIGATION_LINK_TARGETS = ['iframe', 'new-tab', 'self'] as const

/** link 打开目标；蓝图 linkTarget 与壳 RuntimeNavigationItem.linkTarget 共用。 */
export type NavigationLinkTarget = (typeof NAVIGATION_LINK_TARGETS)[number]

const NAVIGATION_LINK_TARGET_SET: ReadonlySet<string> = new Set(NAVIGATION_LINK_TARGETS)

/** 运行时判定 NavigationLinkTarget。 */
export function isNavigationLinkTarget(value: unknown): value is NavigationLinkTarget {
  return typeof value === 'string' && NAVIGATION_LINK_TARGET_SET.has(value)
}

/** 动态导航上下文配置；source 可为远端名或内联 ContextItem 列表。 */
export type NavigationContextConfig = {
  source: string | readonly ContextItem[]
  placeholder?: string
  defaultValue?: string | number
  paramName?: string
}
