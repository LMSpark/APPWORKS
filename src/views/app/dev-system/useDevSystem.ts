/**
 * @module app:views/app/dev-system/useDevSystem
 * 职责：提供 DevSystem 的 useDevSystem 能力，围绕 DevSystemCtx 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程；正式节点数据通过 SPARK DataView/DataSet，领域命令保留其目标校验。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/useDevSystem。
 */
/**
 * useDevSystem — 当前编辑 scope 项目蓝图设计器的单入口编排器。
 *
 * DevSystem 经当前 ProjectWorkspace 编辑对应 scope 的 ProjectBlueprint（领域实例）；
 * 左侧项目蓝图树，右侧节点属性与（若为配置页）页面内容。
 */
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useApplicationRouter } from '@/composables/useApplicationRouter'
import { buildApplicationPath } from '@/services/application-scope'
import { useDevState, type DevWorkspaceTab } from './useDevState'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'
import { onPageConfigChange } from '@/services/sse-events'
import { buildDataViewKey, ensureDataSetStaticInputTable, type DataSet, type DataTable, type DataView } from '@spark-appworks/spark-data'

const PAGE_DESIGN_PROMPT_ROW = 'page-design-prompt'

export function canLeaveDevSystem(hasPendingPageFileSave: boolean): boolean {
  return !hasPendingPageFileSave
}

export function useDevSystem() {
  const { router } = useApplicationRouter()
  const state = useDevState()
  onBeforeRouteLeave(() => {
    if (canLeaveDevSystem(state.hasPendingDevSystemWrite())) return true
    state.addStatus('存在待核验的 DevSystem 数据写入；请留在当前页面完成原命令核验后再离开', 'warning')
    return false
  })
  const isPageFileName = (value: string): value is PageToolFileName =>
    state.pageFileNames.some((name) => name === value)

  // ─── 工作区 Tab 状态 ───────────────────────────────────
  const workTab = ref<DevWorkspaceTab>('props')
  const previewRefreshToken = ref(0)
  const pageDesignPromptView = shallowRef<DataView>()
  const pageDesignPromptRevision = ref(0)
  let pageDesignPromptDataSet: DataSet | undefined
  let pageDesignPromptTableName: string | undefined
  let pageDesignPromptTable: DataTable | undefined

  const currentWorkspaceFile = computed<PageToolFileName | null>(() =>
    isPageFileName(workTab.value) ? workTab.value : null,
  )
  const initiatingProjectDataViewKey = computed(() => {
    const runtime = state.blueprintPageRuntime.value
    const owner = state.blueprintWorkspaceDataView.value
    if (!runtime?.isLoaded || runtime.destroyed || owner?.projectId !== state.projectId
      || typeof owner.dataSet.scenarioId !== 'string'
      || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return ''
    const key = owner.standardComponentBinding.dataViewKey
    return key && runtime.resolveView(key) === owner.view ? key : ''
  })
  const headerActionScope = computed(() => {
    const runtime=state.blueprintPageRuntime.value,owner=state.blueprintWorkspaceDataView.value
    const key=initiatingProjectDataViewKey.value
    if(!runtime||!owner||!key)return undefined
    return {runtime,owner,projectId:state.projectId,key,nodeId:state.selectedNode.value?.nodeId,pageId:state.activePageId.value}
  })
  const headerActionScopeKey = computed(() => {
    const scope=headerActionScope.value
    return scope?`${scope.runtime.instanceId}:${scope.projectId}:${scope.nodeId}:${scope.pageId}:${scope.key}`:'dev-system-actions-unbound'
  })
  const isCurrentHeaderActionScope = (captured:NonNullable<typeof headerActionScope.value>):boolean => {
    const current=headerActionScope.value
    return !!current&&current.runtime===captured.runtime&&current.owner===captured.owner&&current.projectId===captured.projectId
      &&current.key===captured.key&&current.nodeId===captured.nodeId&&current.pageId===captured.pageId
  }
  const blueprintTreeScopeKey = computed(() => {
    const runtime = state.blueprintPageRuntime.value
    const owner = state.blueprintWorkspaceDataView.value
    if (!runtime?.isLoaded || runtime.destroyed || owner?.projectId !== state.projectId
      || typeof owner.dataSet.scenarioId !== 'string' || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return 'blueprint-tree-unbound'
    const key = owner.standardComponentBinding.dataViewKey
    if (!key || runtime.resolveView(key) !== owner.view) return 'blueprint-tree-unbound'
    return `${runtime.instanceId}:${state.projectId}:${key}`
  })
  function releasePageDesignPromptTable():void {
    const dataSet=pageDesignPromptDataSet,tableName=pageDesignPromptTableName,table=pageDesignPromptTable,view=pageDesignPromptView.value
    if(dataSet&&!dataSet.destroyed&&tableName&&table&&view&&dataSet.getTable(tableName)===table
      &&dataSet.getView(tableName,'default')===view) dataSet.removeTable(tableName)
    pageDesignPromptDataSet=undefined
    pageDesignPromptTableName=undefined
    pageDesignPromptTable=undefined
    pageDesignPromptView.value=undefined
  }

  const pageDesignPromptScope = computed(() => {
    const runtime = state.blueprintPageRuntime.value
    const owner = state.blueprintWorkspaceDataView.value
    const pageId = state.activePageId.value
    const nodeId = state.selectedNode.value?.nodeId
    if (!runtime?.isLoaded || runtime.destroyed || owner?.projectId !== state.projectId
      || owner.nodeId!==nodeId || !pageId || !nodeId || typeof owner.dataSet.scenarioId !== 'string'
      || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return undefined
    return { runtime, owner, pageId, nodeId, projectId: state.projectId }
  })

  watch(pageDesignPromptScope, (scope) => {
    releasePageDesignPromptTable()
    if (!scope) {
      pageDesignPromptRevision.value++
      return
    }
    const dataSet = scope.owner.dataSet
    const tableName=`DevSystemPageDesignPromptInput${crypto.randomUUID().replaceAll('-','')}`
    if(dataSet.getTable(tableName))throw new Error('DevSystem AI 提示词临时表名称冲突')
    ensureDataSetStaticInputTable(dataSet, tableName, [
      { name: 'promptId', primary: true },
      { name: 'businessPrompt' },
    ])
    const table=dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table||!view) throw new Error('DevSystem AI 提示词 DataView 未装配')
    pageDesignPromptDataSet = dataSet
    pageDesignPromptTableName=tableName
    pageDesignPromptTable=table
    pageDesignPromptView.value = view
    try {
      view.commitMode='staged'
      if (!view.rows.some(row => row['promptId'] === PAGE_DESIGN_PROMPT_ROW)) {
        view.appendRow({ promptId: PAGE_DESIGN_PROMPT_ROW, businessPrompt: '' })
      }
      view.setCurrentRowById(PAGE_DESIGN_PROMPT_ROW)
      const key = buildDataViewKey(tableName, 'default', dataSet.scenarioId)
      if (scope.runtime.resolveView(key) !== view) throw new Error('DevSystem AI 提示词 DataView 不属于当前运行时')
    } catch(error) {
      releasePageDesignPromptTable()
      throw error
    }
    pageDesignPromptRevision.value++
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    releasePageDesignPromptTable()
  })

  const pageDesignPromptViewKey = computed(() => {
    void pageDesignPromptRevision.value
    const scope = pageDesignPromptScope.value
    const view = pageDesignPromptView.value
    if (!scope || !view || pageDesignPromptDataSet !== scope.owner.dataSet) return ''
    const key = buildDataViewKey(view.tableName, view.viewId, scope.owner.dataSet.scenarioId)
    return scope.runtime.resolveView(key) === view ? key : ''
  })
  const pageDesignPromptScopeKey = computed(() => {
    const scope=pageDesignPromptScope.value
    return scope&&pageDesignPromptViewKey.value
      ?`${scope.runtime.instanceId}:${scope.projectId}:${scope.nodeId}:${scope.pageId}:${pageDesignPromptViewKey.value}`
      :'dev-system-prompt-unbound'
  })
  function currentPageDesignPrompt(): string {
    const view = pageDesignPromptView.value
    const scope = pageDesignPromptScope.value
    if (!scope || !view || pageDesignPromptViewKey.value === '') return ''
    const row = view.currentRow
    const id = row && view.getPkKey(row)
    if (!row || id === null || id === undefined || view.fieldAccess(row, 'businessPrompt').read !== 'visible') return ''
    const value = view.getEditingRow(id)?.['businessPrompt'] ?? row['businessPrompt']
    return typeof value === 'string' ? value : ''
  }
  function notifyPageDesignPromptChanged(): void { pageDesignPromptRevision.value++ }

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
  const canRunPageDesignAi = computed(() => {
    void pageDesignPromptRevision.value
    return Boolean(state.activePageId.value && state.selectedNode.value?.nodeId && pageDesignPromptViewKey.value
      && (currentPageDesignPrompt().trim() || activePageDescription.value))
  })

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
    void router.push(buildApplicationPath({ projectId: state.projectId }, `/${pageId}`))
  }

  function switchToPreview() {
    if (!canPreviewCurrentPage.value) return
    workTab.value = 'preview'
    previewRefreshToken.value++
  }

  function saveAll() {
    void state.saveAll()
  }

  async function runPageDesignAiFor(captured:NonNullable<typeof headerActionScope.value>):Promise<void> {
    if (!isCurrentHeaderActionScope(captured)||!canRunPageDesignAi.value) return
    const scope = pageDesignPromptScope.value
    if(scope?.runtime !== captured.runtime||scope.owner!==captured.owner||scope.projectId!==captured.projectId
      ||scope.nodeId!==captured.nodeId||scope.pageId!==captured.pageId)return
    const description = currentPageDesignPrompt().trim() || activePageDescription.value
    if(!description||!isCurrentHeaderActionScope(captured))return
    await state.runPageDesignAi({ description })
  }
  const headerActions=computed(()=>{
    const captured=headerActionScope.value
    return {
      preview:()=>{if(captured&&isCurrentHeaderActionScope(captured))switchToPreview()},
      saveAll:()=>{if(captured&&isCurrentHeaderActionScope(captured))saveAll()},
      runPageDesignAi:()=>{if(captured)void runPageDesignAiFor(captured)},
      previewPage:(pageId:string)=>{if(captured?.pageId === pageId&&isCurrentHeaderActionScope(captured))previewPage(pageId)},
    }
  })

  function isWorkspaceTabDirty(name: PageToolFileName): boolean {
    void state.projectRevision.value
    void state.externalDataViewRevision.value
    return state.isPageToolFileDirty(name)
  }

  return {
    state,
    workTab,
    previewRefreshToken,
    currentWorkspaceFile,
    pageDesignPromptViewKey,
    pageDesignPromptScopeKey,
    headerActionScopeKey,
    headerActions,
    initiatingProjectDataViewKey,
    blueprintTreeScopeKey,
    notifyPageDesignPromptChanged,
    canPreviewCurrentPage,
    canSaveFromHeader,
    canRunPageDesignAi,
    headerSaveLabel,
    isWorkspaceTabDirty,
  }
}

/** Dev System Ctx 的语义模型。 */
export type DevSystemCtx = ReturnType<typeof useDevSystem>
