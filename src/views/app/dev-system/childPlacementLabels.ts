/**
 * @module app:views/app/dev-system/childPlacementLabels
 * 职责：提供 DevSystem 的 childPlacementLabels 能力，围绕 NavigationPlacementValue 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/childPlacementLabels。
 */
import { isNavigationPlacement, type NavigationPlacement } from '@spark-appworks/spark-utils'

/** Child Placement Value 的语义模型。 */
type NavigationPlacementValue = '' | NavigationPlacement

const CHILD_PLACEMENT_LABELS = {
  header: '顶部',
  sidebar: '侧边栏',
  toolbar: '工具栏',
  'user-menu': '用户菜单',
  parent: '继承父级',
  flat: '平铺',
} satisfies Record<NavigationPlacement, string>

export const CHILD_PLACEMENT_OPTIONS: ReadonlyArray<{ value: NavigationPlacementValue; label: string }> = [
  { value: '', label: '默认' },
  { value: 'header', label: '顶部' },
  { value: 'sidebar', label: '侧边栏' },
  { value: 'toolbar', label: '工具栏' },
  { value: 'user-menu', label: '用户菜单' },
  { value: 'parent', label: '继承父级' },
  { value: 'flat', label: '平铺' },
]

export function formatNavigationPlacementLabel(value: string | null | undefined): string {
  if (!value) return ''
  if (isNavigationPlacement(value)) {
    return CHILD_PLACEMENT_LABELS[value]
  }
  return value
}
