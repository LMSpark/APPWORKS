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
import { getNavTree, resolveNavNodeRuntimeTarget, useNav, useSystemPageDirtySource, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { buildConfigPageNavigationPath } from '@/services/application-scope'
import { useDevState } from './useDevState'
import { parseConfigToolPageId, type PageToolFileName } from '@spark-appworks/spark-project-model'
import { onPageConfigChange } from '@/services/sse-events'
import { buildDataViewKey, ensureDataSetStaticInputTable, type DataSet, type DataTable, type DataView } from '@spark-appworks/spark-data'

const PAGE_DESIGN_PROMPT_ROW = 'page-design-prompt'

export type DevPreviewRequest = Readonly<{
  projectId: string
  nodeId: string
  pageId: string
  runtimeId: string
  sequence: number
}>

export function canLeaveDevSystem(hasPendingPageFileSave: boolean): boolean {
  return !hasPendingPageFileSave
}

export function useDevSystem() {
  const navigation = useNav()
  const state = useDevState()
  const previewGuards = new Set<() => boolean>()
  const hasPendingPreview = (): boolean => [...previewGuards].some(guard => guard())
  function registerPreviewGuard(guard: () => boolean): () => void {
    previewGuards.add(guard)
    return () => {previewGuards.delete(guard)}
  }
  useSystemPageDirtySource({get isDirty() {return state.hasPendingDevSystemWrite() || hasPendingPreview()}})
  onBeforeRouteLeave(() => {
    if (canLeaveDevSystem(state.hasPendingDevSystemWrite() || hasPendingPreview())) return true
    state.addStatus('存在待核验的 DevSystem 写入或预览业务修改；请先在原页面处理后再离开', 'warning')
    return false
  })
  const isPageFileName = (value: string): value is PageToolFileName =>
    state.pageFileNames.some((name) => name === value)

  const previewRequest = shallowRef<DevPreviewRequest>()
  let previewSequence = 0
  const pageDesignPromptView = shallowRef<DataView>()
  const pageDesignPromptRevision = ref(0)
  let pageDesignPromptDataSet: DataSet | undefined
  let pageDesignPromptTableName: string | undefined
  let pageDesignPromptTable: DataTable | undefined

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
    const nodeId=state.selectedNode.value?.nodeId
    if(!runtime||!owner||!key||!nodeId||owner.nodeId!==nodeId)return undefined
    return {runtime,owner,projectId:state.projectId,key,nodeId,pageId:state.activePageId.value}
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
  const currentNavigationTarget = computed(() => {
    void state.externalDataViewRevision.value
    const scope=headerActionScope.value
    const target=scope?.owner.value('NavigationUrl')
    return typeof target==='string' ? target : ''
  })
  const canPreviewCurrentPage = computed(() => Boolean(currentNavigationTarget.value) || Boolean(state.activePageId.value))
  const previewActionLabel = computed(() => currentNavigationTarget.value.startsWith('vue:') ? '打开运行页面' : '预览页面')
  const activePageDescription = computed(() => {
    const pageId = state.activePageId.value
    if (!pageId) return ''
    const page = state.pageList.value.find((item: { pageId: string }) => item.pageId === pageId)
    return String(page?.effectiveDescription ?? page?.description ?? '').trim()
  })
  const canSaveCleanNode = computed(() => Boolean(state.selectedNode.value))
  const canSaveFromHeader = computed(() => state.hasAnyDirty.value || canSaveCleanNode.value)
  const headerSaveLabel = computed(() => state.hasAnyDirty.value ? '全部保存' : '保存')
  const canRunPageDesignAi = computed(() => {
    void pageDesignPromptRevision.value
    return Boolean(state.activePageId.value && state.selectedNode.value?.nodeId && pageDesignPromptViewKey.value
      && (currentPageDesignPrompt().trim() || activePageDescription.value))
  })

  // ─── 动作方法 ──────────────────────────────────────────
  function openRuntimePage(scope: NonNullable<typeof headerActionScope.value>): void {
    const tree=getNavTree()
    if (tree?.projectId!==scope.projectId || !navigation) {
      state.addStatus('当前应用的运行导航身份不可用，无法打开目标页面', 'warning')
      return
    }
    if (!scope.owner.canRead('conid')) {
      state.addStatus('当前节点的数据空间身份不可读取，无法核对运行导航', 'warning')
      return
    }
    const matches:Array<{node:RuntimeNavigationItem; unavailable:boolean}>=[]
    const collect=(items:readonly RuntimeNavigationItem[], unavailable=false):void=>{
      for (const node of items) {
        const blocked=unavailable || node.disabled===true || node.hidden===true
        if (node.id===scope.nodeId) matches.push({node,unavailable:blocked})
        if (node.children) collect(node.children,blocked)
      }
    }
    collect(tree.items)
    const match=matches[0]
    const target=currentNavigationTarget.value
    const scenarioId=String(scope.owner.value('conid') ?? '').trim()
    const resource=target.startsWith('vue:') ? target.slice(4).replace(/^\/+/,'') : ''
    const matchesNative=resource!=='' && match?.node.itemKind==='system-page' && match.node.path===`/${resource}`
    const toolPageId=parseConfigToolPageId(target)
    const matchesConfig=toolPageId!=='' && toolPageId===scope.pageId && match?.node.itemKind==='page'
      && match.node.tool?.projectId===scope.projectId && match.node.tool.pageId===toolPageId
      && match.node.path===buildConfigPageNavigationPath(scope.nodeId,scenarioId)
    if (matches.length!==1 || !match || match.unavailable || (!matchesNative && !matchesConfig)
      || (match.node.blueprintScenarioId ?? '')!==scenarioId) {
      state.addStatus('运行导航的节点、目标或数据空间身份不匹配，或该页面尚不可用', 'warning')
      return
    }
    const resolved=resolveNavNodeRuntimeTarget(match.node)
    if (resolved.kind!=='route' || resolved.routeKind!=='page') {
      state.addStatus('运行导航目标不是可打开的页面', 'warning')
      return
    }
    navigation.navigateTo(match.node)
  }

  function switchToPreview(scope: NonNullable<typeof headerActionScope.value>) {
    if (!canPreviewCurrentPage.value) return
    const target=currentNavigationTarget.value
    if (target.startsWith('vue:')) {openRuntimePage(scope);return}
    if (!scope.pageId || parseConfigToolPageId(target)!==scope.pageId) {
      state.addStatus('当前节点的配置工具目标身份无效，无法预览', 'warning')
      return
    }
    previewRequest.value={projectId:scope.projectId,nodeId:scope.nodeId,pageId:scope.pageId,
      runtimeId:scope.runtime.instanceId,sequence:++previewSequence}
  }

  function saveAll() {
    if (hasPendingPreview()) {
      state.addStatus('预览页面仍有未保存业务数据或待核验写入，请在预览中处理；工作台保存不会代替业务提交', 'warning')
      return
    }
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
      preview:()=>{if(captured&&isCurrentHeaderActionScope(captured))switchToPreview(captured)},
      saveAll:()=>{if(captured&&isCurrentHeaderActionScope(captured))saveAll()},
      runPageDesignAi:()=>{if(captured)void runPageDesignAiFor(captured)},
      openRuntimePage:()=>{if(captured&&isCurrentHeaderActionScope(captured))openRuntimePage(captured)},
    }
  })

  return {
    state,
    previewRequest,
    registerPreviewGuard,
    pageDesignPromptViewKey,
    pageDesignPromptScopeKey,
    headerActionScopeKey,
    headerActions,
    initiatingProjectDataViewKey,
    blueprintTreeScopeKey,
    notifyPageDesignPromptChanged,
    canPreviewCurrentPage,
    previewActionLabel,
    canSaveFromHeader,
    canRunPageDesignAi,
    headerSaveLabel,
  }
}

/** Dev System Ctx 的语义模型。 */
export type DevSystemCtx = ReturnType<typeof useDevSystem>
