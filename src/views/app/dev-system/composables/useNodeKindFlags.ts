/**
 * @module app:views/app/dev-system/composables/useNodeKindFlags
 * 职责：提供 DevSystem 的 useNodeKindFlags 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/composables/useNodeKindFlags。
 */
/**
 * 节点类型（nodeKind）条件标志 — 跨属性编辑子组件共享
 */
import { computed } from 'vue'
import { isNestedConfigPageNode } from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'

export function useNodeKindFlags(state: DevState) {
  const isDirectoryNode = computed(() => {
    const kind = state.blueprintDraft.nodeKind
    return kind === 'system-directory' || kind === 'module'
  })
  const isSystemPageNode = computed(() => state.blueprintDraft.nodeKind === 'system-page')
  const isSystemActionNode = computed(() => state.blueprintDraft.nodeKind === 'system-action')
  const isPageNode = computed(() => state.blueprintDraft.nodeKind === 'page')
  const isLinkNode = computed(() => state.blueprintDraft.nodeKind === 'link')
  const isSubPageNode = computed(() => isNestedConfigPageNode(state.blueprintDraft))
  const isRefNode = computed(() => state.blueprintDraft.nodeKind === 'ref')

  const showTargetSelector = computed(() =>
    isSystemPageNode.value || isPageNode.value || isSystemActionNode.value,
  )
  const showPathStatus = computed(() =>
    isSystemPageNode.value || isPageNode.value || isSystemActionNode.value,
  )

  const routeSectionLabel = computed(() => {
    if (isSystemActionNode.value) return '动作配置'
    if (isLinkNode.value) return '链接配置'
    if (isDirectoryNode.value) return '重定向'
    if (isSubPageNode.value) return '关联页面'
    if (isRefNode.value) return '引用配置'
    return '路由 & 关联页面'
  })

  return {
    isDirectoryNode,
    isSystemPageNode,
    isSystemActionNode,
    isPageNode,
    isLinkNode,
    isSubPageNode,
    isRefNode,
    showTargetSelector,
    showPathStatus,
    routeSectionLabel,
  }
}
