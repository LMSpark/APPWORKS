/**
 * @module @spark-appworks/spark-app:router/route-helpers
 * 职责：提供应用壳层 route-helpers 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/route-helpers。
 */
import type { RuntimeNavigationItem } from '../navigation/runtime-navigation'

export function resolveNavRoutePageId(node: RuntimeNavigationItem, rawNodePath: string): string {
  if (node.tool) return node.tool.pageId
  if (node.itemKind === 'page') throw new Error(`配置节点 ${node.id} 缺少明确工具目标，不能根据路径推断 ${rawNodePath}`)
  return node.id
}
