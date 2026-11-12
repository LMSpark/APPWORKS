/**
 * @module app:views/features/application/application-function-management/ui/page-design/use-page-design
 * 职责：项目蓝图页“页面设计”页签：AI 编辑提示词、工具预览/打开运行页、三文件交付发布与待定提交核验。
 * 边界：共享蓝图页的工作区状态；工具文件经文件 DataView 保存，发布指针只经蓝图 owner 的 VersionId 字段写回并回读；
 *   不自动保存，不替蓝图字段或场景定义提交。
 * AI用途：调整页面设计动作或交付发布 saga 时定位本模块。
 */
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { getNavTree, resolveNavNodeRuntimeTarget, useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { buildDataViewKey, ensureDataSetStaticInputTable, type DataSet, type DataTable, type DataView } from '@spark-appworks/spark-data'
import { parseConfigToolPageId, type PageToolFileName } from '@spark-appworks/spark-project-model'
import {
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  parseLowcodeBlueprintFileVersions,
  type LowcodeBlueprintFileName,
} from '@spark-appworks/spark-lowcode-api'
import { buildConfigPageNavigationPath } from '@/services/application-scope'
import { onPageConfigChange } from '@/services/sse-events'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import type { DevState } from '../blueprint-state/useDevState'

const PAGE_DESIGN_PROMPT_ROW = 'page-design-prompt'
const DELIVERY_FILES = ['rule.json', 'script.js', 'style.css'] as const satisfies readonly LowcodeBlueprintFileName[]

/** 预览请求：只在同一项目、节点、工具与运行实例下被预览页签接受。 */
export type DevPreviewRequest = Readonly<{
  projectId: string
  nodeId: string
  pageId: string
  runtimeId: string
  sequence: number
}>

export function usePageDesign(state: DevState) {
  const navigation = useNav()
  const previewGuards = new Set<() => boolean>()
  const hasPendingPreview = (): boolean => [...previewGuards].some(guard => guard())
  function registerPreviewGuard(guard: () => boolean): () => void {
    previewGuards.add(guard)
    return () => {previewGuards.delete(guard)}
  }
  /** 预览中的业务修改或工具/场景写入待核验：页面离开与节点切换都须先处理。 */
  const hasPendingWork = (): boolean => state.hasPendingBlueprintWrite() || hasPendingPreview()
  const isPageFileName = (value: string): value is PageToolFileName =>
    state.pageFileNames.some((name) => name === value)

  const previewRequest = shallowRef<DevPreviewRequest>()
  let previewSequence = 0
  const pageDesignPromptView = shallowRef<DataView>()
  const pageDesignPromptRevision = ref(0)
  let pageDesignPromptDataSet: DataSet | undefined
  let pageDesignPromptTableName: string | undefined
  let pageDesignPromptTable: DataTable | undefined

  const actionScope = computed(() => {
    const runtime=state.blueprintPageRuntime.value,owner=state.blueprintWorkspaceDataView.value
    const nodeId=state.selectedNode.value?.nodeId
    if (!runtime?.isLoaded || runtime.destroyed || owner?.projectId !== state.projectId || !nodeId || owner.nodeId !== nodeId
      || typeof owner.dataSet.scenarioId !== 'string' || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return undefined
    const key = owner.standardComponentBinding.dataViewKey
    if (!key || runtime.resolveView(key) !== owner.view) return undefined
    return {runtime,owner,projectId:state.projectId,key,nodeId,pageId:state.activePageId.value}
  })
  const actionScopeKey = computed(() => {
    const scope=actionScope.value
    return scope?`${scope.runtime.instanceId}:${scope.projectId}:${scope.nodeId}:${scope.pageId}:${scope.key}`:'page-design-unbound'
  })
  const isCurrentScope = (captured:NonNullable<typeof actionScope.value>):boolean => {
    const current=actionScope.value
    return !!current&&current.runtime===captured.runtime&&current.owner===captured.owner&&current.projectId===captured.projectId
      &&current.key===captured.key&&current.nodeId===captured.nodeId&&current.pageId===captured.pageId
  }

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
    const scope = actionScope.value
    return scope?.pageId ? scope : undefined
  })

  watch(pageDesignPromptScope, (scope) => {
    releasePageDesignPromptTable()
    if (!scope) {
      pageDesignPromptRevision.value++
      return
    }
    const dataSet = scope.owner.dataSet
    const tableName=`PageDesignPromptInput${crypto.randomUUID().replaceAll('-','')}`
    if(dataSet.getTable(tableName))throw new Error('页面设计 AI 提示词临时表名称冲突')
    ensureDataSetStaticInputTable(dataSet, tableName, [
      { name: 'promptId', primary: true },
      { name: 'businessPrompt' },
    ])
    const table=dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table||!view) throw new Error('页面设计 AI 提示词 DataView 未装配')
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
      if (scope.runtime.resolveView(key) !== view) throw new Error('页面设计 AI 提示词 DataView 不属于当前运行时')
    } catch(error) {
      releasePageDesignPromptTable()
      throw error
    }
    pageDesignPromptRevision.value++
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(releasePageDesignPromptTable)

  const pageDesignPromptViewKey = computed(() => {
    void pageDesignPromptRevision.value
    const scope = pageDesignPromptScope.value
    const view = pageDesignPromptView.value
    if (!scope || !view || pageDesignPromptDataSet !== scope.owner.dataSet) return ''
    const key = buildDataViewKey(view.tableName, view.viewId, scope.owner.dataSet.scenarioId)
    return scope.runtime.resolveView(key) === view ? key : ''
  })
  const pageDesignPromptScopeKey = computed(() => pageDesignPromptViewKey.value
    ? `${actionScopeKey.value}:${pageDesignPromptViewKey.value}` : 'page-design-prompt-unbound')
  function currentPageDesignPrompt(): string {
    const view = pageDesignPromptView.value
    if (!pageDesignPromptScope.value || !view || pageDesignPromptViewKey.value === '') return ''
    const row = view.currentRow
    const id = row && view.getPkKey(row)
    if (!row || id === null || id === undefined || view.fieldAccess(row, 'businessPrompt').read !== 'visible') return ''
    const value = view.getEditingRow(id)?.['businessPrompt'] ?? row['businessPrompt']
    return typeof value === 'string' ? value : ''
  }
  function notifyPageDesignPromptChanged(): void { pageDesignPromptRevision.value++ }

  const stopPageConfigChange = onPageConfigChange((event) => {
    if (event.pageId !== state.activePageId.value) return
    state.editor.notifyPageFileChanged(event.pageId, isPageFileName(event.file) ? event.file : '__bulk')
  })
  onScopeDispose(stopPageConfigChange)

  const currentNavigationTarget = computed(() => {
    void state.externalDataViewRevision.value
    const target=actionScope.value?.owner.value('NavigationUrl')
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
  const canRunPageDesignAi = computed(() => {
    void pageDesignPromptRevision.value
    return Boolean(state.activePageId.value && state.selectedNode.value?.nodeId && pageDesignPromptViewKey.value
      && (currentPageDesignPrompt().trim() || activePageDescription.value))
  })

  function openRuntimePage(scope: NonNullable<typeof actionScope.value>): void {
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

  function switchToPreview(scope: NonNullable<typeof actionScope.value>): void {
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

  async function runPageDesignAiFor(captured:NonNullable<typeof actionScope.value>):Promise<void> {
    if (!isCurrentScope(captured)||!canRunPageDesignAi.value) return
    const description = currentPageDesignPrompt().trim() || activePageDescription.value
    if(!description||!isCurrentScope(captured))return
    await state.runPageDesignAi({ description })
  }

  /** 待定提交核验：只在原文件/命令回执未知时出现，沿工作区原 attempt 核验，不重复写入。 */
  const canVerifyPendingWrites = computed(() => {
    void state.externalDataViewRevision.value
    void state.projectRevision.value
    return state.hasPendingBlueprintWrite() && !state.allSaving.value && !state.pageIoBusy.value && !state.blueprintSaving.value
  })
  function verifyPendingWrites(): void {
    if (hasPendingPreview()) {
      state.addStatus('预览页面仍有未保存业务数据或待核验写入，请在预览中处理；页面设计不会代替业务提交', 'warning')
      return
    }
    void state.saveAll()
  }

  const delivering = ref(false)
  const canSaveDelivery = computed(() => {
    void state.externalDataViewRevision.value
    const owner=actionScope.value?.owner
    return !!owner && !!actionScope.value.pageId && owner.canRead('NavigationUrl') && owner.canRead('VersionId') && owner.canWrite('VersionId')
  })

  /** 三文件交付：逐文件追加正式快照，再写回 VersionId 指针并回读；任一步失败即停止并如实报告已确认部分。 */
  async function saveDelivery(captured:NonNullable<typeof actionScope.value>): Promise<void> {
    if (!isCurrentScope(captured) || delivering.value) return
    const {owner:current,runtime,nodeId,pageId,projectId}=captured
    if (!pageId) {state.addStatus('交付工具身份必须与当前项目及页面一致', 'error'); return}
    if (!canSaveDelivery.value) {state.addStatus('发布交付要求当前 DataView 可读 NavigationUrl、VersionId 且允许写 VersionId', 'warning'); return}
    if (current.dirty || current.hasUnconfirmedSave) {state.addStatus('请先保存或取消当前节点字段修改，再提交发布文件', 'warning'); return}
    const scopeToken = lowcodeApi.readRequestScope().token
    const originalNavigationUrl = String(current.value('NavigationUrl') ?? '')
    let expectedVersionId = String(current.value('VersionId') ?? '')
    let fileViews=new Map<LowcodeBlueprintFileName,DataView>()
    const written: string[] = []
    const confirmed: string[] = []
    const attemptedSnapshots: string[] = []
    const attemptedReferences: string[] = []
    const readFileText=(fileName:LowcodeBlueprintFileName):string=>{
      const view=fileViews.get(fileName)
      const row=view?.currentRow
      const id=view&&row?view.getPkKey(row):undefined
      if(!view||!row||id===undefined)throw new Error(`${fileName} 文件 DataView 身份或文本无效`)
      const edited=view.getEditingRow(id)??row
      if(row['pageId']!==pageId||row['fileName']!==fileName||typeof edited['text']!=='string')throw new Error(`${fileName} 文件 DataView 身份或文本无效`)
      if(view.dirtyTracking.hasPendingChanges(id)||view.hasEditingChanges(id))throw new Error(`${fileName} 存在未保存的文件 DataView 修改，不能发布`)
      if(view.hasUnconfirmedSave)throw new Error(`${fileName} 的文件 DataView 提交回执仍待核验，不能发布`)
      return edited['text']
    }
    const assertTarget = (allowOnlyOwnedVersionPatch = false) => {
      if (!isCurrentScope(captured) || state.blueprintPageRuntime.value !== runtime || state.blueprintWorkspaceDataView.value !== current
        || lowcodeApi.readRequestScope().token !== scopeToken
        || current.projectId !== projectId || current.nodeId !== nodeId) throw new Error('交付目标已切换，后续交付已停止')
      if (current.isBusy || current.view.loadingError) throw new Error('交付蓝图 DataView 查询状态已改变，后续交付已停止')
      if (!current.canRead('NavigationUrl') || !current.canRead('VersionId') || !current.canWrite('VersionId')) {
        throw new Error('交付期间正式 DataView 字段权限已改变，后续交付已停止')
      }
      const row = current.row
      const rowKey = row ? current.view.getPkKey(row) : undefined
      if (!row || rowKey === undefined || row['rowid'] !== nodeId || row['SysId'] !== projectId
        || String(current.value('NavigationUrl') ?? '') !== originalNavigationUrl
        || String(current.value('VersionId') ?? '') !== expectedVersionId) throw new Error('交付 DataView 行或发布身份已改变，后续交付已停止')
      const patch = current.view.getEditingPatch(rowKey)
      const changedFields = Object.keys(patch ?? {})
      const submittedRowIds = current.view.rows.map(candidate => current.view.getPkKey(candidate))
        .filter((key): key is string | number => key !== undefined
          && (current.view.hasEditingChanges(key) || current.view.dirtyTracking.hasPendingChanges(key)))
      if (current.hasUnconfirmedSave || current.hasPendingBlueprintCommand || current.view.dirtyTracking.hasPendingChanges(rowKey)) {
        throw new Error('交付 DataView 保存或命令状态已改变，后续交付已停止')
      }
      if (allowOnlyOwnedVersionPatch) {
        if (submittedRowIds.length !== 1 || submittedRowIds[0] !== rowKey
          || changedFields.length !== 1 || changedFields[0] !== 'VersionId' || patch?.['VersionId'] !== expectedVersionId) {
          throw new Error('交付期间 DataView 出现其他未保存修改，后续交付已停止')
        }
      } else if (current.dirty || changedFields.length > 0) {
        throw new Error('交付期间 DataView 出现未保存修改，后续交付已停止')
      }
    }
    delivering.value = true
    try {
      fileViews=new Map(await Promise.all(DELIVERY_FILES.map(async fileName=>[fileName,await state.loadPageToolFileDataView({pageId,fileName})] as const)))
      assertTarget()
      const texts = new Map(DELIVERY_FILES.map(name=>[name,readFileText(name)]))
      const runtimeTarget = String(current.value('NavigationUrl') ?? '')
      if (lowcodeApi.readRequestScope().headers['X-AppId'] !== projectId || pageId.trim() !== pageId
        || pageId === '.' || pageId === '..' || /[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
        || runtimeTarget !== `cfg:${pageId}`) throw new Error('交付工具身份必须与当前项目及页面一致')
      let versions = parseLowcodeBlueprintFileVersions(expectedVersionId.trim())
      for (const fileName of DELIVERY_FILES) {
        assertTarget()
        const text = texts.get(fileName)
        if (text === undefined) throw new Error('交付文本缺失')
        const fileView=await state.loadPageToolFileDataView({pageId,fileName})
        assertTarget()
        if(readFileText(fileName)!==text)throw new Error(`${fileName} 交付期间 DataView 已修改`)
        const history=await fileView.createSourceVersion(attempt=>{
          if(typeof attempt.fileName==='string'&&!attemptedSnapshots.includes(attempt.fileName))attemptedSnapshots.push(attempt.fileName)
        })
        if(history.state!=='confirmed'||typeof history.version!=='number'||typeof history.fileName!=='string') {
          throw new Error(`${fileName} 文件 DataView 未确认快照回执`)
        }
        const {version,fileName:versionedName}=history
        written.push(versionedName)
        assertTarget()
        fileView.acknowledgeSourceHistoryAttempt()
        if (readFileText(fileName)!==text) throw new Error(`${fileName} 上传期间 DataView 已修改，未更新发布引用`)
        versions = Object.freeze({ ...versions, [lowcodeBlueprintFileVersionKey(fileName)]: version })
        attemptedReferences.push(versionedName)
        expectedVersionId = encodeLowcodeBlueprintFileVersions(versions)
        current.update('VersionId', expectedVersionId)
        state.notifyExternalDataViewChanged()
        assertTarget(true)
        await current.save()
        assertTarget()
        const readbackVersions = String(current.value('VersionId') ?? '').trim()
        if (encodeLowcodeBlueprintFileVersions(parseLowcodeBlueprintFileVersions(readbackVersions)) !== expectedVersionId) throw new Error(`${fileName} 发布指针回读不一致`)
        confirmed.push(versionedName)
        state.notifyExternalDataViewChanged()
      }
      state.addStatus('三个交付文件已独立追加版本、切换发布指针并读回', 'success')
    } catch (error) {
      state.addStatus(`交付保存失败: ${String(error)}；已确认快照：${written.join('、') || '无'}；已确认发布引用：${confirmed.join('、') || '无'}；已尝试快照：${attemptedSnapshots.join('、') || '无'}；已尝试发布引用：${attemptedReferences.join('、') || '无'}。未确认的请求须核查远端结果`, 'error')
    } finally {
      delivering.value = false
      state.notifyExternalDataViewChanged()
    }
  }

  const actions=computed(()=>{
    const captured=actionScope.value
    return {
      preview:()=>{if(captured&&isCurrentScope(captured))switchToPreview(captured)},
      runPageDesignAi:()=>{if(captured)void runPageDesignAiFor(captured)},
      openRuntimePage:()=>{if(captured&&isCurrentScope(captured))openRuntimePage(captured)},
      saveDelivery:()=>{if(captured)void saveDelivery(captured)},
    }
  })

  return {
    previewRequest,
    registerPreviewGuard,
    hasPendingWork,
    pageDesignPromptViewKey,
    pageDesignPromptScopeKey,
    actionScopeKey,
    actions,
    notifyPageDesignPromptChanged,
    canPreviewCurrentPage,
    previewActionLabel,
    canRunPageDesignAi,
    canVerifyPendingWrites,
    verifyPendingWrites,
    delivering,
    canSaveDelivery,
  }
}
