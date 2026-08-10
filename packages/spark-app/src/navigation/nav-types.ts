/**
 * @module @spark-appworks/spark-app:navigation/nav-types
 * 职责：提供应用壳层 nav-types 能力，围绕 NavigationContext 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/nav-types。
 */
import type { ComputedRef, InjectionKey } from 'vue'
import type {
  RuntimeNavigationContextState,
  RuntimeNavigationItem,
  RuntimeNavigationRegionItems,
  RuntimeNavigationRegionVisibility,
} from './runtime-navigation'

/* ══════════════════════════════════════════════════════════
 * NavigationContext — Vue 依赖的运行时类型
 *
 * 纯 TS 项目节点类型（ProjectBlueprintTreeNodeData, ProjectBlueprintTreeData 等）定义在 ProjectNode，
 * 此文件仅保留 Vue 特有的类型。
 * ══════════════════════════════════════════════════════════ */

/** Navigation Context 的运行上下文。 */
export type NavigationContext = {
  /** 从根到当前叶子的节点路径 */
  activePath: ComputedRef<RuntimeNavigationItem[]>
  /** 各区域的导航项 */
  regionItems: ComputedRef<RuntimeNavigationRegionItems>
  /** 各区域是否可见（有项为 true） */
  regionVisibility: ComputedRef<RuntimeNavigationRegionVisibility>
  /** 当前模块的上下文选择器状态（null = 当前模块无上下文；作用域：模块下全部页面） */
  moduleContext: ComputedRef<RuntimeNavigationContextState | null>
  /** 导航到指定节点（处理外部链接、重定向、首个叶子等） */
  navigateTo: (node: RuntimeNavigationItem) => void
  /** 导航到指定路径（自动追加租户前缀） */
  navigateToPath: (path: string) => void
  /** 设置当前模块上下文选择器的值 */
  setContextValue: (value: string | number | null) => void
  /** 判断节点是否在活动路径上 */
  isNodeActive: (node: RuntimeNavigationItem) => boolean
  /** 获取节点的角标（运行时动态设定） */
  getBadge: (nodeId: string) => string | number | undefined
  /** 设置节点的角标（运行时 API） */
  setBadge: (nodeId: string, value: string | number | undefined) => void}

/** Vue 注入键 */
export const NAV_KEY: InjectionKey<NavigationContext> = Symbol('spark-navigation')
