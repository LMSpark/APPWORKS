import { computed, onBeforeUnmount, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import { NativePageRuntimeSession, SYSTEM_PAGE_NAVIGATION_ID_QUERY, useSystemPageDirtySource } from '@spark-appworks/spark-app'
import { buildDataViewKey, DataViewFilter, isDataRow, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { PAGE_RUNTIME, useSparkComponent } from '@spark-appworks/spark-component'
import type { PageRuntime } from '@spark-appworks/spark-project-model'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { loadLowcodeRuntimeScenario, readLowcodeExecutionProject } from '@/lowcode/data-space/lowcode-data-space-runtime'
import type { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import { useDevState } from '@/views/app/dev-system/useDevState'
import { resolveNavHostProjectBinding, resolveProjectCandidate } from '@/views/app/dev-system/nav-host-project-picker/nav-host-project-picker-contract'

type BlueprintTab = 'basic' | 'dataSpace'
type BlueprintTreeContext = Readonly<{
  key: string
  projectId: string
  owner: BlueprintWorkspaceDataView
  runtime: PageRuntime
}>
type DeleteTarget = Readonly<{
  contextKey: string
  projectId: string
  nodeId: string
  parentNodeId: string
}>

function readQueryString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`蓝图页面查询参数 ${name} 必须是非空字符串`)
  }
  return value.trim()
}

function readNodeId(row: unknown): string {
  if (!isDataRow(row)) return ''
  const nodeId = row['rowid']
  return typeof nodeId === 'string' || typeof nodeId === 'number' ? String(nodeId) : ''
}

function hasBlueprintNode(node: unknown, nodeId: string): boolean {
  if (!isDataRow(node)) return false
  if (node['nodeId'] === nodeId) return true
  const children = node['children']
  if (!Array.isArray(children)) return false
  for (const child of children.filter(isDataRow)) {
    if (hasBlueprintNode(child, nodeId)) return true
  }
  return false
}

function readTab(value: unknown): BlueprintTab {
  if (value === undefined) return 'basic'
  if (value === 'basic' || value === 'dataSpace') return value
  throw new Error(`蓝图页面不支持 blueprintTab=${String(value)}`)
}

function requireView(runtime: PageRuntime, scenarioId: string, modelName: string): DataView {
  const view = runtime.resolveView(buildDataViewKey(modelName, 'default', scenarioId))
  if (!view || view.dataSet?.scenarioId !== scenarioId
    || view.dataTable?.modelBinding?.modelName !== modelName || view.viewId !== 'default') {
    throw new Error(`蓝图入口缺少正式视图：${scenarioId}@${modelName}@default`)
  }
  return view
}

export function useApplicationFunctionPage() {
  const route = useRoute()
  const state = useDevState()
  const {sparkProvide, sparkRemove} = useSparkComponent({type: 'application-function-page'})
  const loading = ref(false)
  const error = ref('')
  const targetProjectId = ref('')
  const targetReady = ref(false)
  const deletingTarget = shallowRef<DeleteTarget>()
  const activeTab = ref<BlueprintTab>('basic')
  const requestedNodeId = ref('')
  let loadRevision = 0
  let releasePreflight = () => {}

  const treeContext = computed<BlueprintTreeContext | undefined>(() => {
    if (!targetReady.value) return undefined
    const owner = state.blueprintWorkspaceDataView.value
    const runtime = state.blueprintPageRuntime.value
    const projectId = targetProjectId.value
    const scenarioId = owner?.dataSet.scenarioId
    if (!owner || !runtime?.isLoaded || runtime.destroyed || owner.projectId !== projectId
      || typeof scenarioId !== 'string' || runtime.getDataSet(scenarioId) !== owner.dataSet) return undefined
    const key = owner.standardComponentBinding.dataViewKey
    if (!key || runtime.resolveView(key) !== owner.view) return undefined
    return { key: `${runtime.instanceId}:${projectId}:${key}`, projectId, owner, runtime }
  })

  const treeDataViewKey = computed(() => treeContext.value?.owner.standardComponentBinding.dataViewKey ?? '')
  const treeBinding = computed(() => treeDataViewKey.value ? { dataViewKey: treeDataViewKey.value } : {})
  const selectedNodeId = computed(() => state.selectedNode.value?.nodeId === requestedNodeId.value
    ? requestedNodeId.value : '')
  const isSelectedNodeReady = computed(() => selectedNodeId.value !== '')
  const canAddRoot = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && !owner.isBusy && !owner.dirty && !state.blueprintSaving.value
      && !owner.hasPendingBlueprintCommand && owner.view.addActionState() === 'enabled'
  })
  const canSaveChanges = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && !owner.isBusy && !state.blueprintSaving.value && (owner.dirty || owner.hasUnconfirmedSave)
      && !state.hasAnyFileDirty.value && state.editor.dirtyScenarioIds.length === 0
  })
  const canCancelChanges = computed(() => {
    void state.externalDataViewRevision.value
    const owner = treeContext.value?.owner
    return !!owner && owner.dirty && !owner.isBusy && !state.blueprintSaving.value && !owner.hasPendingBlueprintCommand
      && !state.hasAnyFileDirty.value && state.editor.dirtyScenarioIds.length === 0
  })

  watch(treeContext, context => {
    if (context) sparkProvide(PAGE_RUNTIME, context.runtime)
    else sparkRemove(PAGE_RUNTIME)
  }, {immediate: true})

  function isCurrentContext(key: string): boolean {
    return treeContext.value?.key === key
  }

  function canMove(row: DataRow | undefined, context: BlueprintTreeContext | undefined): boolean {
    const owner = context?.owner
    if (!owner || !row) return false
    const nodeId = readNodeId(row)
    const matches = owner.view.rows.filter(candidate => String(candidate['rowid']) === nodeId)
    const formalRow = matches[0]
    const rootNodeId = state.project.rootNode?.id
    return matches.length === 1 && !!formalRow
      && rootNodeId !== undefined && String(formalRow['rowid']) !== rootNodeId
      && owner.view.editActionState(formalRow) === 'enabled'
      && owner.view.fieldAccess(formalRow, 'prowid').write === 'allowed'
      && owner.view.fieldAccess(formalRow, 'FunOrderValue').write === 'allowed'
  }

  function onNodeClick(...args: unknown[]): void {
    const context = treeContext.value
    const control = args[3]
    if (control !== null && typeof control === 'object' && 'cancel' in control) control.cancel = true
    if (!context || !isCurrentContext(context.key)) return
    const nodeId = readNodeId(args[0])
    if (!nodeId) return
    void selectNode(nodeId, context)
  }

  async function selectNode(nodeId: string, context: BlueprintTreeContext): Promise<void> {
    try {
      if (state.hasAnyDirty.value && state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('当前蓝图存在未处理修改，先完成原节点保存或核验后再切换')
      }
      await state.selectNodeById(nodeId)
      if (!isCurrentContext(context.key) || state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('蓝图节点选择期间项目或节点身份发生变化')
      }
      requestedNodeId.value = nodeId
    } catch (cause) {
      error.value = String(cause)
    }
  }

  function onNodeDrop(...args: unknown[]): void {
    const context = treeContext.value
    const control = args[1]
    if (control !== null && typeof control === 'object' && 'cancel' in control) control.cancel = true
    const event = args[0]
    if (!context || !isCurrentContext(context.key) || event === null || typeof event !== 'object') return
    const draggedKey: unknown = Reflect.get(event, 'draggedKey')
    const targetKey: unknown = Reflect.get(event, 'targetKey')
    const position: unknown = Reflect.get(event, 'dropType')
    if (typeof draggedKey !== 'string' || typeof targetKey !== 'string'
      || (position !== 'before' && position !== 'after' && position !== 'inner')) return
    if (state.hasAnyDirty.value) {
      error.value = '当前蓝图存在未处理修改，先完成原节点保存或核验后再移动节点'
      return
    }
    void state.moveBlueprintNodeRelative({ nodeId: draggedKey, targetNodeId: targetKey, position })
      .catch(cause => { error.value = String(cause) })
  }

  function addChildFromRow(...args: unknown[]): void {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || state.hasAnyDirty.value) return
    const nodeId = readNodeId(args[0])
    if (nodeId) void state.addChildNodeById(nodeId).catch(cause => { error.value = String(cause) })
  }

  function beginDelete(...args: unknown[]): void {
    const context = treeContext.value
    const row = args[0]
    const nodeId = readNodeId(row)
    if (!context || !isCurrentContext(context.key) || !nodeId || state.hasAnyDirty.value) return
    const matches = context.owner.view.rows.filter(candidate => String(candidate['rowid']) === nodeId)
    const target = matches[0]
    if (matches.length !== 1 || !target) return
    if (target['SysId'] !== context.projectId
      || context.owner.view.deleteActionState(target) !== 'enabled') return
    if (context.owner.view.rows.some(candidate => String(candidate['prowid'] ?? '') === nodeId)) {
      error.value = '仅允许删除无子节点的蓝图叶子'
      return
    }
    deletingTarget.value = {
      contextKey: context.key,
      projectId: context.projectId,
      nodeId,
      parentNodeId: String(target['prowid'] ?? ''),
    }
  }

  function cancelDelete(): void {
    deletingTarget.value = undefined
  }

  function confirmDelete(): void {
    const target = deletingTarget.value
    const context = treeContext.value
    deletingTarget.value = undefined
    if (!target || !context) return
    if (target.contextKey !== context.key || target.projectId !== context.projectId) return
    const matches = context.owner.view.rows.filter(row => String(row['rowid']) === target.nodeId)
    const row = matches[0]
    if (matches.length !== 1 || !row) {
      error.value = '蓝图删除目标已变化或当前 DataView 不允许删除'
      return
    }
    if (row['SysId'] !== target.projectId || String(row['prowid'] ?? '') !== target.parentNodeId
      || context.owner.view.deleteActionState(row) !== 'enabled'
      || context.owner.view.rows.some(candidate => String(candidate['prowid'] ?? '') === target.nodeId)) {
      error.value = '蓝图删除目标已变化或当前 DataView 不允许删除'
      return
    }
    state.removeNodeById(target.nodeId)
  }

  function assertNoPendingChanges(): void {
    if (state.hasAnyDirty.value) throw new Error('蓝图存在未处理修改，先完成保存或取消再切换入口目标')
  }

  async function loadTarget(): Promise<void> {
    const revision = ++loadRevision
    releasePreflight()
    targetReady.value = false
    loading.value = true
    error.value = ''
    const relationSession = new NativePageRuntimeSession()
    const candidateSession = new NativePageRuntimeSession()
    const dispose = () => {relationSession.dispose(); candidateSession.dispose()}
    releasePreflight = dispose
    try {
      const execution = readLowcodeExecutionProject()
      const navigationId = readQueryString(route.meta['nodeId'], 'navigationId')
      const query = route.query
      const assertCurrent = () => {
        execution.assertCurrent()
        if (revision !== loadRevision || route.query !== query
          || route.meta['systemPageIdentityState'] !== 'resolved' || route.meta['nodeId'] !== navigationId
          || route.params['projectId'] !== execution.projectId) throw new Error('蓝图入口目标查询或正式导航身份已失效')
      }
      assertCurrent()
      const marker = query[SYSTEM_PAGE_NAVIGATION_ID_QUERY]
      if (marker !== undefined && marker !== navigationId) throw new Error('蓝图入口导航标记与正式导航身份不匹配')
      const nodeId = query['nodeId'] === undefined ? '' : readQueryString(query['nodeId'], 'nodeId')
      readTab(route.query['blueprintTab'])
      assertNoPendingChanges()
      const loadScenario = (scenarioId: string) => {
        assertCurrent()
        return loadLowcodeRuntimeScenario({projectId: execution.projectId, scenarioId})
      }
      const relationRuntime = relationSession.acquire({pageId: navigationId,
        scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY], targetId: navigationId, loadScenario})
      await relationRuntime.load()
      assertCurrent()
      const relations = requireView(relationRuntime, LOWCODE_APPLICATION_CATALOG_FORM_KEY, 'Base_Navigation_DataRelation')
      relations.queryConfig = {...relations.queryConfig, allPages: true}
      relations.filterExpression = DataViewFilter.condition({field: 'prowid', operator: 'eq', value: navigationId}).toJSON()
      await relations.refresh()
      assertCurrent()
      if (relations.loadingError) throw relations.loadingError
      if (relations.total !== relations.rows.length) throw new Error('蓝图导航宿主关系读取不完整')
      const binding = resolveNavHostProjectBinding(relations, navigationId)
      const projectId = readQueryString(query[binding.valueParameter], binding.valueParameter)
      const candidates = candidateSession.acquire({pageId: navigationId,
        scenarioIds: [binding.scenarioId], targetId: projectId, loadScenario})
      await candidates.load()
      assertCurrent()
      const candidateView = requireView(candidates, binding.scenarioId, binding.modelName)
      candidateView.queryConfig = {...candidateView.queryConfig, allPages: true}
      candidateView.filterExpression = DataViewFilter.condition({field: binding.valueField, operator: 'eq', value: projectId}).toJSON()
      await candidateView.refresh()
      assertCurrent()
      if (candidateView.loadingError) throw candidateView.loadingError
      const candidate = candidateView.rows[0]
      if (candidateView.total !== 1 || candidateView.rows.length !== 1 || !candidate
        || resolveProjectCandidate(candidateView, candidate, binding) !== projectId) throw new Error('蓝图目标未通过正式宿主候选精确核验')
      const applications = requireView(relationRuntime, LOWCODE_APPLICATION_CATALOG_FORM_KEY, 'Base_AppSystemList')
      applications.filterExpression = DataViewFilter.condition({field: 'rowid', operator: 'eq', value: projectId}).toJSON()
      await applications.refresh()
      assertCurrent()
      if (applications.loadingError) throw applications.loadingError
      const application = applications.rows[0]
      if (applications.total !== 1 || applications.rows.length !== 1 || !application
        || resolveProjectCandidate(applications, application, {valueField: 'rowid', labelField: 'AppName'}) !== projectId) {
        throw new Error('当前租户正式应用目录未确认蓝图目标')
      }
      assertNoPendingChanges()
      if (!await state.openEditingProject({projectId})) throw new Error('当前工作区尚不能切换到被设计应用')
      assertCurrent()
      targetProjectId.value = projectId
      const owner = await state.loadBlueprintWorkspaceDataView()
      assertCurrent()
      if (owner.projectId !== projectId) throw new Error('蓝图 DataView 与宿主指定目标不匹配')
      activeTab.value = readTab(route.query['blueprintTab'])
      if (!owner.hasTreeProjection) await state.loadBlueprintTreeFromDataView()
      assertCurrent()
      if (!nodeId) {
        requestedNodeId.value = state.selectedNode.value?.nodeId ?? ''
        targetReady.value = true
        return
      }
      requestedNodeId.value = nodeId
      const tree = owner.treeProjection()
      if (!hasBlueprintNode(tree, nodeId)) throw new Error(`当前应用蓝图中未找到 nodeId=${nodeId}`)
      if (owner.dirty || owner.hasUnconfirmedSave) {
        if (owner.nodeId !== nodeId || state.selectedNode.value?.nodeId !== nodeId) {
          throw new Error('同项目蓝图 owner 存在未确认修改，仅允许在原 nodeId 下接管，不会自动保存或丢弃')
        }
      } else {
        await state.selectNodeById(nodeId)
      }
      assertCurrent()
      if (state.selectedNode.value?.nodeId !== nodeId) {
        throw new Error('蓝图 DataView 未能定位到查询参数指定的 nodeId')
      }
      targetReady.value = true
    } catch (cause) {
      if (revision === loadRevision) error.value = String(cause)
    } finally {
      dispose()
      if (revision === loadRevision) loading.value = false
    }
  }

  function selectTab(tab: BlueprintTab): void {
    activeTab.value = tab
  }

  async function saveBlueprintChanges(): Promise<void> {
    const context = treeContext.value
    if (!context || !isCurrentContext(context.key) || state.blueprintSaving.value) return
    if (state.hasAnyFileDirty.value || state.editor.dirtyScenarioIds.length > 0) {
      error.value = '当前 owner 还包含工具文件或场景定义修改；本页不会替它们提交'
      return
    }
    state.blueprintSaving.value = true
    try {
      await context.owner.save()
      if (!isCurrentContext(context.key)) throw new Error('保存期间蓝图项目或运行时身份已变化')
      state.refreshBlueprintTreeProjection()
      error.value = ''
    } catch (cause) {
      error.value = String(cause)
    } finally {
      state.blueprintSaving.value = false
      state.notifyExternalDataViewChanged()
    }
  }

  function cancelBlueprintChanges(): void {
    const context = treeContext.value
    if (!context || !canCancelChanges.value) return
    try {
      context.owner.cancel()
      state.refreshBlueprintTreeProjection()
      state.notifyExternalDataViewChanged()
      error.value = ''
    } catch (cause) {
      error.value = String(cause)
    }
  }

  useSystemPageDirtySource({ get isDirty() { return state.hasAnyDirty.value } })
  const guardPendingChanges = () => {
    if (!state.hasAnyDirty.value) return true
    error.value = '蓝图存在未保存修改或待核验提交，处理完成后才能离开'
    return false
  }
  onBeforeRouteLeave(guardPendingChanges)
  onBeforeRouteUpdate(guardPendingChanges)
  const stopTargetWatch = watch(
    () => [route.params['projectId'], route.query, route.meta['nodeId'], route.meta['systemPageIdentityState']],
    () => { void loadTarget() },
    { immediate: true },
  )
  onScopeDispose(() => {loadRevision++; releasePreflight(); sparkRemove(PAGE_RUNTIME)})
  onBeforeUnmount(stopTargetWatch)

  return {
    state,
    loading,
    error,
    activeTab,
    treeBinding,
    treeContext,
    selectedNodeId,
    isSelectedNodeReady,
    canAddRoot,
    canSaveChanges,
    canCancelChanges,
    deletingTarget,
    isCurrentContext,
    canMove,
    onNodeClick,
    onNodeDrop,
    addChildFromRow,
    beginDelete,
    cancelDelete,
    confirmDelete,
    selectTab,
    saveBlueprintChanges,
    cancelBlueprintChanges,
    loadTarget,
  }
}
