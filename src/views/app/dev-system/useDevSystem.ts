/**
 * @module app:views/app/dev-system/useDevSystem
 * 职责：提供 DevSystem 的 useDevSystem 能力，围绕 DevSystemCtx 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/useDevSystem。
 */
/**
 * useDevSystem — 当前编辑 scope 项目蓝图设计器的单入口编排器。
 *
 * DevSystem 经当前 ProjectWorkspace 编辑对应 scope 的 ProjectBlueprint（领域实例）；
 * 左侧项目蓝图树，右侧节点属性与（若为配置页）页面内容。
 */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { buildTenantPath } from '@/services/tenant-scope'
import { useDevState, type DevWorkspaceTab } from './useDevState'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'
import { onPageConfigChange } from '@/services/sse-events'

export function useDevSystem() {
  const { router } = useTenantRouter()
  const state = useDevState()
  const isPageFileName = (value: string): value is PageToolFileName =>
    state.pageFileNames.some((name) => name === value)

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)
  const pageDesignAiPrompt = ref('')

  const currentWorkspaceFile = computed<PageToolFileName | null>(() =>
    isPageFileName(workTab.value) ? workTab.value : null,
  )

  const stopPageConfigChange = onPageConfigChange((event) => {
    if (event.pageId !== state.activePageId.value) return
    const file = event.file
    state.editor.notifyPageFileChanged(
      event.pageId,
      isPageFileName(file) ? file : '__bulk',
    )
  })
  onScopeDispose(stopPageConfigChange)

  // ─── 派生能力 ──────────────────────────────────────────
  const canPreviewCurrentPage = computed(
    () => Boolean(state.blueprintDraft.navigation?.target) || Boolean(state.activePageId.value),
  )
  const activePageDescription = computed(() => {
    const pageId = state.activePageId.value
    if (!pageId) return ''
    const page = state.pageList.value.find((item: { pageId: string }) => item.pageId === pageId)
    return String(page?.effectiveDescription ?? page?.description ?? '').trim()
  })
  const canSaveCleanNode = computed(() => {
    if (workTab.value !== 'props') return false
    const node = state.selectedNode.value
    return Boolean(node)
  })
  const canSaveFromHeader = computed(() => state.hasAnyDirty.value || canSaveCleanNode.value)
  const headerSaveLabel = computed(() => state.hasAnyDirty.value ? '全部保存' : '保存')
  const canRunPageDesignAi = computed(() =>
    Boolean(state.activePageId.value && (pageDesignAiPrompt.value.trim() || activePageDescription.value)),
  )

  // 选中节点时自动切到节点属性页签
  watch(() => state.selectedNode.value?.nodeId ?? '', (nextId, prevId) => {
    if (nextId && nextId !== prevId) {
      workTab.value = 'props'
    }
  })

  // activePageId 切换时的默认页签联动
  watch(() => state.activePageId.value, (nextPageId) => {
    const hasSelectedNode = state.selectedNode.value !== null
    if (nextPageId && !hasSelectedNode) {
      workTab.value = 'rule.json'
      return
    }
    if (!nextPageId && hasSelectedNode) {
      workTab.value = 'props'
    }
  })

  // ─── 动作方法 ──────────────────────────────────────────
  function previewPage(pageId: string) {
    void router.push(buildTenantPath({ tenantId: state.tenantId, projectId: state.projectId }, `/${pageId}`))
  }

  function switchToPreview() {
    if (!canPreviewCurrentPage.value) return
    workTab.value = 'preview'
    previewRefreshToken.value++
  }

  function saveAll() {
    void state.saveAll()
  }

  async function runPageDesignAi() {
    if (!canRunPageDesignAi.value) return
    const description = pageDesignAiPrompt.value.trim() || activePageDescription.value
    await state.runPageDesignAi({ description })
  }

  function isWorkspaceTabDirty(name: PageToolFileName): boolean {
    void state.projectRevision.value
    return state.project.readDirtyProjection().dirtyFiles.has(name)
  }

  return {
    state,
    workTab,
    previewRefreshToken,
    currentWorkspaceFile,
    pageDesignAiPrompt,
    canPreviewCurrentPage,
    canSaveFromHeader,
    canRunPageDesignAi,
    headerSaveLabel,
    previewPage,
    switchToPreview,
    saveAll,
    runPageDesignAi,
    isWorkspaceTabDirty,
  }
}

/** Dev System Ctx 的语义模型。 */
export type DevSystemCtx = ReturnType<typeof useDevSystem>
