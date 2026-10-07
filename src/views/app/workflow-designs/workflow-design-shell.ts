/**
 * @module app:views/app/workflow-designs/workflow-design-shell
 * 职责：WorkflowDesigns 页面布局常量、设计稿列表文案、节点默认值与错误文本等纯辅助。
 * 边界：无响应式状态与副作用。
 * AI用途：调整面板宽度、分屏比例或列表展示文案时，从本模块定位。
 */
import type { WorkflowDesignNodeCreateKind, WorkflowDesignSummary } from '@/services/workflow-designs'
import type { GraphSplitPanel } from './workflow-design-view-types'

export const MIN_LEFT_PANEL_WIDTH = 220

export const MAX_LEFT_PANEL_WIDTH = 480

export const COLLAPSED_LEFT_PANEL_WIDTH = 48

export const MIN_RIGHT_PANEL_WIDTH = 200

export const MAX_RIGHT_PANEL_WIDTH = 320

export const GRAPH_SPLIT_MIN_RATIO = 22

export const GRAPH_SPLIT_MAX_RATIO = 78

export const GRAPH_SPLIT_SNAP_RATIO = 12

export const GRAPH_SPLIT_STORAGE_PREFIX = 'spark.workflow-design.graph-split.'

export const UNREADABLE_WORKFLOW_DESIGN_STATUS = 'unreadable'

export const UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR = '设计稿格式不兼容或文件不可读'

export function isUnreadableDesign(item: WorkflowDesignSummary | undefined): boolean {
  return item?.status === UNREADABLE_WORKFLOW_DESIGN_STATUS
}

export function workflowDesignErrorMessage(item: WorkflowDesignSummary | undefined): string {
  const message = item?.error?.trim()
  return message && message.length > 0 ? message : UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR
}

export function workflowDesignListItemTitle(item: WorkflowDesignSummary): string {
  const title = item.title ?? ''
  return isUnreadableDesign(item) ? workflowDesignErrorMessage(item) : title.length > 0 ? title : item.workflowId
}

export function defaultCreateNodeId(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'start') return 'start'
  if (nodeKind === 'output') return 'output'
  return 'node.model'
}

export function defaultCreateNodeTitle(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'start') return 'Start'
  if (nodeKind === 'output') return 'Output'
  return 'Business Node'
}

export function graphPanelTitle(panel: GraphSplitPanel): string {
  const graphView = panel.graphView
  if (graphView === null) return panel.role === 'main' ? 'Main Graph' : 'Child Graph'
  return panel.role === 'main' ? `Main / ${graphView.title}` : `Child / ${graphView.title}`
}

export function graphSplitStorageKey(workflowId: string): string {
  return `${GRAPH_SPLIT_STORAGE_PREFIX}${workflowId}`
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return String(error)
}
