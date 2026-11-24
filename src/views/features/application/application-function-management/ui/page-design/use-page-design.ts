/**
 * @module app:views/features/application/application-function-management/ui/page-design/use-page-design
 * 职责：项目蓝图页“页面设计”页签：AI 编辑提示词、工具预览/打开运行页、三文件交付发布与待定提交核验。
 * 边界：共享蓝图页的工作区状态；工具文件经文件 DataView 保存，发布指针只经蓝图 owner 的 VersionId 字段写回并回读；
 *   不自动保存，不替蓝图字段或场景定义提交。
 * AI用途：调整页面设计动作或交付发布 saga 时定位本模块。
 */
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { getNavTree, resolveNavNodeRuntimeTarget, useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { buildDataViewKey, ensureDataSetStaticInputTable, parseDataViewKey, parseRuntimeDataSetPlanFile,
 type DataSet, type DataTable, type DataView } from '@spark-appworks/spark-data'
import {
  PAGE_TOOL_FILE_NAMES, PageTool, encodePageToolPublicationVersions, pageToolPublicationVersionKey,
  parseConfigToolPageId, parsePageToolPublicationVersions, type PageToolFileName, type PageToolPublicationFileName,
} from '@spark-appworks/spark-project-model'
import { buildConfigPageNavigationPath, readConfigPageScenarioCall } from '@/services/application-scope'
import { onPageConfigChange } from '@/services/sse-events'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import {
  createPageToolPublicationManifest,
  createPageToolDatasetPublicationManifest,
  withPageToolPublication,
  type PageToolPublication,
  type PageToolPublicationFileSource,
  type PageToolPublicationScenarioSource,
} from '@/services/project/page-tool-publication'
import {createPagePublicationManifestFileView} from '@/services/project/page-tool-file-dataview'
import { lowcodeApi } from '@/platform-adapters/lowcode-runtime'
import {readRuntimeDataSetPlan} from '@/platform-adapters/data-space/runtime-data-set-plan-file'
import type { DevState } from '../blueprint-state/useDevState'
import {formatFileSnapshotName} from '@/platform-adapters/api/design/lowcode-file-identity'

const PAGE_DESIGN_PROMPT_ROW = 'page-design-prompt'
const DELIVERY_FILES = PAGE_TOOL_FILE_NAMES

export function resolvePageToolCall(tool: PageTool, target: string, mainScenarioId?: string) {
  if (parseConfigToolPageId(target) !== tool.pageId) throw new Error('配置工具调用目标与页面身份不符')
  const call = readConfigPageScenarioCall(target, mainScenarioId)
  for (const binding of tool.getNodeTree().collectDataViewKeys()) {
    const descriptor = parseDataViewKey(binding)
    const scenarioId = descriptor?.scope ?? mainScenarioId
    if (!descriptor || !scenarioId || !call.scenarioIds.includes(scenarioId)) {
      throw new Error(`页面绑定 ${binding} 引用了未声明的数据空间，请先配置导航地址`)
    }
  }
  return call
}

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
    if (!match || matches.length !== 1 || match.unavailable) {
      const warning = !match ? '当前应用的运行导航未返回所选节点'
        : matches.length !== 1 ? '当前应用的运行导航返回了重复的节点身份'
        : '所选运行节点或其上级已隐藏或停用'
      state.addStatus(warning, 'warning')
      return
    }
    const target=currentNavigationTarget.value
    const scenarioId=String(scope.owner.value('conid') ?? '').trim()
    const resource=target.startsWith('vue:') ? target.slice(4).replace(/^\/+/,'') : ''
    const matchesNative=resource!=='' && match.node.itemKind==='system-page' && match.node.path===`/${resource}`
    const toolPageId=parseConfigToolPageId(target)
    let configPath: string | undefined
    if (toolPageId) {
      try {configPath = buildConfigPageNavigationPath(scope.nodeId, scenarioId, target)}
      catch (error) {state.addStatus(String(error), 'warning');return}
    }
    const matchesConfig=toolPageId!=='' && toolPageId===scope.pageId && match.node.itemKind==='page'
      && match.node.tool?.projectId===scope.projectId && match.node.tool.pageId===toolPageId
      && match.node.path===configPath
    if (!matchesNative && !matchesConfig) {
      state.addStatus('运行导航的页面类型、目标或路径与所选蓝图节点不一致', 'warning')
      return
    }
    if ((match.node.blueprintScenarioId ?? '')!==scenarioId) {
      state.addStatus('运行导航与所选蓝图节点的主数据空间不一致', 'warning')
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
  let recoverPublication: (() => Promise<void>) | undefined
  const delivering = ref(false)
  const canVerifyPendingWrites = computed(() => {
    void state.externalDataViewRevision.value
    void state.projectRevision.value
    return state.hasUnconfirmedBlueprintWrite() && !delivering.value && !state.allSaving.value && !state.pageIoBusy.value && !state.blueprintSaving.value
  })
  const saveJournal = computed(() => state.blueprintWorkspaceDataView.value?.dataSet.saveJournal)
  const pendingWriteActionLabel = computed(() => {
    const action=saveJournal.value?.currentRecoverableAction
    return action==='verify-original-receipt'?'核验原保存回执'
      :action==='continue-phase'?'继续原保存阶段':'核验待定提交'
  })
  function verifyPendingWrites(): void {
    if (hasPendingPreview()) {
      state.addStatus('预览页面仍有未保存业务数据或待核验写入，请在预览中处理；页面设计不会代替业务提交', 'warning')
      return
    }
    if (recoverPublication) void recoverPublication()
    else void state.verifyUnconfirmedBlueprintWrites()
  }

  const canSaveDelivery = computed(() => {
    void state.externalDataViewRevision.value
    const owner=actionScope.value?.owner
    return !!owner && !!actionScope.value.pageId && owner.canRead('NavigationUrl') && owner.canRead('VersionId') && owner.canWrite('VersionId')
  })

  /** 四文件交付：工具、pagedata与发布说明均经原 DataView owner 生成不可覆盖快照，再切换 VersionId。 */
  async function saveDelivery(captured:NonNullable<typeof actionScope.value>): Promise<void> {
    try {
      const session = lowcodeApi.session.get()
      if (!session?.identity.userId || !session.enterprise.shortName) throw new Error('发布需要当前登录身份和企业标识')
      const scope = lowcodeApi.readRequestScope().token
      const owner = [JSON.stringify([session.enterprise.id, session.identity.enterpriseId]), session.enterprise.shortName,
        session.identity.userId, captured.projectId, captured.nodeId]
      await withPageToolPublication(owner, async journal => {
        if (scope !== lowcodeApi.readRequestScope().token) throw new Error('发布请求所属会话已变化')
        await publish(captured, journal)
      })
    } catch (error) { state.addStatus(`发布未完成：${String(error)}`, 'error') }
  }

  async function publish(captured:NonNullable<typeof actionScope.value>, journal:PageToolPublication): Promise<void> {
    if (!isCurrentScope(captured) || delivering.value) return
    const {owner:current,runtime,nodeId,pageId,projectId}=captured
    if (!pageId) {state.addStatus('交付工具身份必须与当前项目及页面一致', 'error'); return}
    if (!canSaveDelivery.value) {state.addStatus('发布交付要求当前 DataView 可读 NavigationUrl、VersionId 且允许写 VersionId', 'warning'); return}
    if (current.dirty || current.hasUnconfirmedSave) {state.addStatus('请先保存或取消当前节点字段修改，再提交发布文件', 'warning'); return}
    const scopeToken = lowcodeApi.readRequestScope().token
    const originalNavigationUrl = String(current.value('NavigationUrl') ?? '')
    const mainScenarioId = String(current.value('conid') ?? '').trim()
    const originalVersionId = String(current.value('VersionId') ?? '')
    let expectedVersionId = originalVersionId
    let fileViews=new Map<PageToolPublicationFileName,DataView>()
    const written: string[] = []
    const confirmed: string[] = []
    const attemptedSnapshots: string[] = []
    const attemptedReferences: string[] = []
    const readFileText=(fileName:PageToolPublicationFileName):string=>{
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
      const targetMismatches=[
        !isCurrentScope(captured)?'scope':undefined,
        state.blueprintPageRuntime.value!==runtime?'runtime':undefined,
        state.blueprintWorkspaceDataView.value!==current?'owner':undefined,
        lowcodeApi.readRequestScope().token!==scopeToken?'token':undefined,
        current.projectId!==projectId?'project':undefined,
        current.nodeId!==nodeId?'node':undefined,
      ].filter((field):field is string=>field!==undefined)
      if (targetMismatches.length>0) throw new Error(`交付目标已切换(${targetMismatches.join(',')})，后续交付已停止`)
      if (current.isBusy || current.view.loadingError) throw new Error('交付蓝图 DataView 查询状态已改变，后续交付已停止')
      if (!current.canRead('NavigationUrl') || !current.canRead('conid') || !current.canRead('VersionId') || !current.canWrite('VersionId')) {
        throw new Error('交付期间正式 DataView 字段权限已改变，后续交付已停止')
      }
      const row = current.row
      const rowKey = row ? current.view.getPkKey(row) : undefined
      if (!row || rowKey === undefined) throw new Error('交付 DataView 当前行已丢失，后续交付已停止')
      const identityMismatches=[
        row['rowid']!==nodeId?'nodeId':undefined,
        row['SysId']!==projectId?'projectId':undefined,
        String(current.value('NavigationUrl')??'')!==originalNavigationUrl?'NavigationUrl':undefined,
        String(current.value('conid')??'').trim()!==mainScenarioId?'conid':undefined,
        String(current.value('VersionId')??'')!==expectedVersionId?'VersionId':undefined,
      ].filter((field):field is string=>field!==undefined)
      if(identityMismatches.length>0)throw new Error(`交付 DataView 发布身份已改变(${identityMismatches.join(',')})，后续交付已停止`)
      const patch = current.view.getEditingPatch(rowKey)
      const changedFields = Object.keys(patch ?? {})
      const tracking = current.view.dirtyTracking
      const submittedRowIds = current.view.rows.map(candidate => current.view.getPkKey(candidate))
        .filter((key): key is string | number => key !== undefined
          && (current.view.hasEditingChanges(key) || current.view.dirtyTracking.hasPendingChanges(key)))
      if (current.hasUnconfirmedSave || current.hasPendingBlueprintCommand
        || tracking.isPendingCreate(rowKey) || tracking.pendingDeleteIds.has(rowKey)) {
        throw new Error('交付 DataView 保存或命令状态已改变，后续交付已停止')
      }
      if (allowOnlyOwnedVersionPatch) {
        const diff = current.view.getDirtyChanges(rowKey)
        const staged = tracking.hasPendingChanges(rowKey)
        const isOwnedPatch = !staged && changedFields.length === 1 && patch?.['VersionId'] === expectedVersionId
        const isOwnedStage = staged && changedFields.length === 0 && Object.keys(diff).length === 1
          && String(diff['VersionId']?.from ?? '') === originalVersionId && diff['VersionId']?.to === expectedVersionId
        if (submittedRowIds.length !== 1 || submittedRowIds[0] !== rowKey || (!isOwnedPatch && !isOwnedStage)) {
          throw new Error(`交付期间 DataView 出现其他未保存修改(staged=${staged},ownedPatch=${isOwnedPatch},ownedStage=${isOwnedStage},fields=${changedFields.join(',')||'-'},rows=${submittedRowIds.join(',')||'-'})，后续交付已停止`)
        }
      } else if (current.dirty || changedFields.length > 0) {
        throw new Error(`交付期间 DataView 出现未保存修改(owner=${current.dirty},fields=${changedFields.join(',')||'-'},rows=${submittedRowIds.join(',')||'-'})，后续交付已停止`)
      }
    }
    const finishPublication = async () => {
      assertTarget()
      const readbackVersions = String(current.value('VersionId') ?? '').trim()
      if (encodePageToolPublicationVersions(parsePageToolPublicationVersions(readbackVersions)) !== expectedVersionId) {
        throw new Error('四文件发布指针回读不一致')
      }
      recoverPublication = undefined
      confirmed.push(...written)
      journal.finish()
      state.refreshBlueprintTreeProjection()
      state.addStatus('工具、场景与发布 manifest 快照均已确认，发布指针已一次切换并读回', 'success')
      try {await reloadAndSyncNavigation()} catch (error) {
        state.addStatus(`发布已确认，运行菜单刷新失败：${String(error)}`, 'warning')
      }
    }
    delivering.value = true
    try {
      const digestOf = async (text: string) => {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
      }
      const call = await digestOf(JSON.stringify([pageId, originalNavigationUrl, mainScenarioId]))
      assertTarget()
      const pointer = journal.confirmedPointer(call)
      if (pointer !== undefined) {
        expectedVersionId = pointer
        await current.rereadSelectedNode()
        await finishPublication()
        return
      }
      fileViews=new Map(await Promise.all(DELIVERY_FILES.map(async fileName=>[fileName,await state.loadPageToolFileDataView({pageId,fileName})] as const)))
      assertTarget()
      const texts = new Map(DELIVERY_FILES.map(name=>[name,readFileText(name)]))
      if (lowcodeApi.readRequestScope().headers['X-AppId'] !== projectId || pageId.trim() !== pageId
        || pageId === '.' || pageId === '..' || /[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
        || !current.canRead('conid')) throw new Error('交付工具与主空间身份必须可核验')
      const tool = new PageTool({pageId})
      const ruleText = texts.get('rule.json')
      if (ruleText === undefined) throw new Error('交付规则文本缺失')
      tool.hydrateFileText('rule.json', ruleText)
      const callDefinition = resolvePageToolCall(tool, originalNavigationUrl, mainScenarioId)
      const datasetSources = await Promise.all(callDefinition.scenarioIds.map(async scenarioId => {
        const text=await readRuntimeDataSetPlan({scenarioId,dataSet:current.dataSet,assertCurrent:()=>assertTarget()})
        assertTarget()
        if (text === null) return null
        const plan = parseRuntimeDataSetPlanFile(text, scenarioId)
        return {scenarioId, text, sourceRevision: plan.contentHash}
      }))
      if (datasetSources.some(Boolean) && datasetSources.some(source => source === null)) {
        throw new Error('PAGE_PUBLICATION_DATASET_INCOMPLETE: 同一次页面调用的场景必须统一使用独立 Dataset Plan')
      }
      const useDatasetPublication = datasetSources.every(Boolean)
      const scenarioSources = useDatasetPublication ? [] : await Promise.all(callDefinition.scenarioIds.map(async scenarioId => {
        const dataSet = await state.editor.loadScenarioDefinitions({scenarioId})
        assertTarget()
        const fileView = dataSet.getView('DataViewDefinition')
        if (!fileView || fileView.destroyed || fileView.queryContext['dataSpaceId'] !== scenarioId) {
          throw new Error(`场景 ${scenarioId} 的正式 pagedata DataView 无效`)
        }
        await fileView.refresh()
        assertTarget()
        const source = await fileView.previewSource()
        assertTarget()
        const definitionViews = Object.values(dataSet.tables).flatMap(table => table.viewList)
        if (definitionViews.some(view => view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())
          || source.version === null || source.content === null) throw new Error(`场景 ${scenarioId} 有未保存或未确认的 pagedata 修改`)
        return {
          scenarioId, fileView, text: source.content, sourceRevision: String(source.version),
        }
      }))
      const digest = await digestOf(JSON.stringify({
        files: [...texts],
        ...(useDatasetPublication
          ? {dataset: datasetSources.map(source => source && [source.scenarioId, source.sourceRevision, source.text])}
          : {pagedata: scenarioSources.map(source => [source.scenarioId, source.sourceRevision, source.text])}),
      }))
      assertTarget()
      const intent = journal.open(call, digest, originalVersionId)
      let versions = parsePageToolPublicationVersions(expectedVersionId.trim())
      const fileSources: PageToolPublicationFileSource[] = []
      for (const fileName of DELIVERY_FILES) {
        assertTarget()
        const text = texts.get(fileName)
        if (text === undefined) throw new Error('交付文本缺失')
        const fileView=await state.loadPageToolFileDataView({pageId,fileName})
        assertTarget()
        if(readFileText(fileName)!==text)throw new Error(`${fileName} 交付期间 DataView 已修改`)
        const version = await journal.snapshot({intent, fileView, fileName, text, assertTarget,
          onAttempt: name => attemptedSnapshots.push(name)})
        assertTarget()
        written.push(formatFileSnapshotName(version,fileName))
        fileSources.push({fileName, version, text})
        if (readFileText(fileName)!==text) throw new Error(`${fileName} 上传期间 DataView 已修改，未更新发布引用`)
        versions = Object.freeze({ ...versions, [pageToolPublicationVersionKey(fileName)]: version })
      }
      const pagedataSources: PageToolPublicationScenarioSource[] = []
      if (!useDatasetPublication) {
        for (const source of scenarioSources) {
          assertTarget()
          const snapshot = await journal.scenarioSnapshot({
            intent, scenarioId: source.scenarioId, fileView: source.fileView, text: source.text,
            sourceRevision: source.sourceRevision, assertTarget,
            onAttempt: name => attemptedSnapshots.push(`${source.scenarioId}/${name}`),
          })
          pagedataSources.push(snapshot)
          written.push(`${source.scenarioId}/${formatFileSnapshotName(snapshot.version,'pagedata.json')}`)
        }
      }
      assertTarget()
      for (const fileName of DELIVERY_FILES) {
        if (readFileText(fileName) !== texts.get(fileName)) throw new Error(`${fileName} 交付期间 DataView 已修改，未更新发布引用`)
      }
      const manifest = useDatasetPublication
        ? await createPageToolDatasetPublicationManifest({
          pageId, files: fileSources,
          dataset: datasetSources.flatMap(source => source === null ? [] : [{...source}]),
        })
        : await createPageToolPublicationManifest({pageId, files: fileSources, pagedata: pagedataSources})
      const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
      const manifestView = createPagePublicationManifestFileView({
        dataSet: current.dataSet, appId: projectId, pageId, workspace: state.editor, assertCurrent: () => assertTarget(),
      })
      await manifestView.refresh()
      assertTarget()
      let manifestRow = manifestView.currentRow
      if (!manifestRow) {
        await manifestView.addRow({text: manifestText})
        manifestRow = manifestView.currentRow
      } else {
        const manifestId = manifestView.getPkKey(manifestRow)
        if (manifestId === undefined) throw new Error('发布 manifest 文件 DataView 缺少身份')
        const edited = manifestView.getEditingRow(manifestId) ?? manifestRow
        if (edited['text'] !== manifestText) await manifestView.editRowById(manifestId, {text: manifestText})
      }
      if (manifestView.hasUnconfirmedSave) {
        const verified = await manifestView.verifySourceWriteAttempt()
        if (verified.state !== 'confirmed') throw new Error('发布 manifest 原工作文件提交仍待核验')
        manifestView.acknowledgeSourceWriteAttempt()
      }
      if (manifestView.dirtyTracking.hasPendingChanges() || manifestView.hasEditingChanges()) {
        const result = await current.dataSet.saveChanges({views: [{tableName: manifestView.tableName, viewId: manifestView.viewId}]})
        assertTarget()
        if (!result.success) throw result.error ?? new Error(result.message ?? '发布 manifest 工作文件保存失败')
      }
      const manifestVersion = await journal.snapshot({
        intent, fileView: manifestView, fileName: 'publication-manifest.json', text: manifestText, assertTarget,
        onAttempt: name => attemptedSnapshots.push(name),
      })
      assertTarget()
      written.push(`${manifestVersion}__publication-manifest.json`)
      versions = Object.freeze({...versions, manifest: manifestVersion})
      expectedVersionId = encodePageToolPublicationVersions(versions)
      if(originalVersionId===expectedVersionId){
        assertTarget()
        await finishPublication()
        return
      }
      current.update('VersionId', expectedVersionId)
      state.notifyExternalDataViewChanged()
      assertTarget(true)
      const progress = {
        beforeSubmit() {
          assertTarget(true)
          for (const file of DELIVERY_FILES) {
            if (readFileText(file) !== texts.get(file)) throw new Error(`${file} 在提交发布指针前已修改`)
          }
          intent.pointer = {value: expectedVersionId, state: 'pending'}
          journal.write(intent)
          attemptedReferences.push(...written)
        },
        accepted() { intent.pointer = {value: expectedVersionId, state: 'confirmed'}; journal.write(intent) },
        rejected() { intent.pointer = null; journal.write(intent) },
      }
      try {
        await current.saveSelectedNode(progress)
      } catch (error) {
        if (isCurrentScope(captured) && current.hasPendingBlueprintCommand) {
          recoverPublication = async () => {
            if (delivering.value || !isCurrentScope(captured)) return
            delivering.value = true
            try {
              if (lowcodeApi.readRequestScope().token !== scopeToken || !current.hasPendingBlueprintCommand) {
                throw new Error('原发布指针的核验范围已失效')
              }
              await journal.resume(async () => {
                if (!isCurrentScope(captured) || lowcodeApi.readRequestScope().token !== scopeToken) throw new Error('原发布核验目标已变化')
                await current.saveSelectedNode(progress)
                await finishPublication()
              })
            } catch (cause) {
              state.addStatus(`发布指针仍待核验：${String(cause)}`, 'error')
            } finally {
              delivering.value = false
              state.notifyExternalDataViewChanged()
            }
          }
        }
        // 只有当前仍只包含本次发布的覆盖、且没有未知保存时，才释放覆盖以便续办。
        try {assertTarget(true);current.cancel()} catch { /* 保留当前编辑或未知回执 */ }
        throw error
      }
      await finishPublication()
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
    saveJournal,
    pendingWriteActionLabel,
    verifyPendingWrites,
    delivering,
    canSaveDelivery,
  }
}
