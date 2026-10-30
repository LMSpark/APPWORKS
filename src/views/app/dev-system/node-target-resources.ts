/**
 * @module app:views/app/dev-system/node-target-resources
 * 职责：在当前 DevSystem 运行 DataSet 中装配导航候选只读视图和新工具命令输入视图。
 * 边界：候选由本资源从当前已授权导航投影和静态页面注册表派生；命令输入不属于正式蓝图保存目标。
 */
import {
  buildDataViewKey,
  dataSetCommandQueryResultFromLocalRows,
  ensureDataSetStaticInputTable,
  type DataSet,
  type DataRow,
  type DataView,
} from '@spark-appworks/spark-data'
import {getVuePageOptions} from '@/registries/vue-page-registry'
import {
  resolvePageNodePageId,
  type PageRuntime,
  type ProjectBlueprintTreeNodeData,
} from '@spark-appworks/spark-project-model'
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import {computed, onScopeDispose, ref, shallowRef, watch} from 'vue'
import type {DevState} from './useDevState'

export type NodeTargetOptionRow = Readonly<DataRow & {
  value: string
  label: string
}>

export type NodeTargetTreeOwner = Pick<BlueprintWorkspaceDataView, 'projectId' | 'nodeId' | 'dataSet' | 'hasTreeProjection' | 'treeProjection' | 'canRead' | 'value'>

export type NodeTargetResourceScope = Readonly<{
  dataSet: DataSet
  runtime: PageRuntime
  owner: NodeTargetTreeOwner
  projectId: string
  nodeId: string
}>

export type NodeTargetResources = Readonly<{
  scope: NodeTargetResourceScope
  optionsView: DataView
  optionsViewKey: string
  commandInputView?: DataView
  commandInputViewKey?: string
  refreshOptions: () => Promise<void>
  dispose: () => void
}>

type CreateNodeTargetResourcesInput = Readonly<{
  scope: NodeTargetResourceScope
  createTool: boolean
  assertCurrent: () => void
}>

function readTargetOptions(owner: NodeTargetTreeOwner): NodeTargetOptionRow[] {
  if (!owner.hasTreeProjection) throw new Error('DEV_SYSTEM_TARGET_TREE_UNLOADED: 蓝图 DataView 树尚未加载')
  const tree = owner.treeProjection()
  const options = new Map<string, NodeTargetOptionRow>()
  for (const page of getVuePageOptions()) {
    const value = page.path
    options.set(value, {value, label: `页面 · ${page.title}`})
  }
  const visit = (node: ProjectBlueprintTreeNodeData): void => {
    const pageId = resolvePageNodePageId(node)
    if (pageId) {
      const value = `cfg:${pageId}`
        if (!options.has(value)) options.set(value, {value, label: `工具 · ${node.navigation?.title ?? node.capability.name}`})
    }
    node.children?.forEach(visit)
  }
  visit(tree)
  return [...options.values()]
}

function uniqueTableName(dataSet: DataSet, prefix: string): string {
  for (let attempt = 0; attempt < 4; attempt++) {
    const name = `${prefix}${crypto.randomUUID().replaceAll('-', '')}`
    if (!dataSet.getTable(name)) return name
  }
  throw new Error(`DEV_SYSTEM_TARGET_RESOURCE_COLLISION: ${prefix}`)
}

/**
 * Create scoped DataViews for the target selector and optional create-tool input.
 * The target table is a local derived resource, not a catalog or a copy of file storage.
 */
export function createNodeTargetResources(input: CreateNodeTargetResourcesInput): NodeTargetResources {
  const {dataSet, runtime} = input.scope
  const scenarioId = dataSet.scenarioId
  if (!scenarioId || dataSet.destroyed || runtime.destroyed || !runtime.isLoaded
    || input.scope.owner.dataSet !== dataSet || input.scope.owner.projectId !== input.scope.projectId
    || input.scope.owner.nodeId !== input.scope.nodeId
    || runtime.getDataSet(scenarioId) !== dataSet) {
    throw new Error('DEV_SYSTEM_TARGET_RESOURCE_IDENTITY: DataSet 不属于当前已加载 PageRuntime')
  }

  let disposed = false
  let lastOptionsSignature: string | undefined
  let pendingRefresh: {signature: string; promise: Promise<void>} | undefined
  const clearPendingRefresh = (promise: Promise<void>) => {
    if (pendingRefresh?.promise === promise) pendingRefresh = undefined
  }
  const assertCurrent = () => {
    input.assertCurrent()
    if (disposed || dataSet.destroyed || runtime.destroyed || !runtime.isLoaded
      || runtime.getDataSet(scenarioId) !== dataSet) {
      throw new Error('DEV_SYSTEM_TARGET_RESOURCE_STALE: 导航目标资源已切换')
    }
  }
  const created: Array<{tableName: string; table: NonNullable<ReturnType<DataSet['getTable']>>; view: DataView}> = []
  const addStaticView = (tableName: string, columns: Array<{name: string; primary?: boolean}>): DataView => {
    ensureDataSetStaticInputTable(dataSet, tableName, columns)
    const table = dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table || !view) throw new Error(`DEV_SYSTEM_TARGET_RESOURCE_VIEW: ${tableName}`)
    created.push({tableName, table, view})
    return view
  }

  const optionsTableName = uniqueTableName(dataSet, 'DevSystemNodeTargetOptions')
  let optionsView: DataView | undefined
  let commandInputView: DataView | undefined
  try {
    optionsView = addStaticView(optionsTableName, [
      {name: 'value', primary: true},
      {name: 'label'},
    ])
    const optionsTable = dataSet.getTable(optionsTableName)
    if (!optionsTable) throw new Error('DEV_SYSTEM_TARGET_OPTIONS_TABLE: 候选表不存在')
    const optionsResourceId = `dev-system-node-target-options:${input.scope.projectId}:${input.scope.nodeId}:${crypto.randomUUID()}`
    optionsTable.resourceId = optionsResourceId
    optionsView.bindQueryExecutor({
      localAggregates: false,
      executeQuery: async view => {
        assertCurrent()
        return dataSetCommandQueryResultFromLocalRows(view, readTargetOptions(input.scope.owner), assertCurrent)
      },
    }, {resource: {resourceType: 'static-data', resourceId: optionsResourceId}})

    if (input.createTool) {
      const inputTableName = uniqueTableName(dataSet, 'DevSystemCreateToolInput')
      commandInputView = addStaticView(inputTableName, [
        {name: 'inputId', primary: true},
        {name: 'newToolId'},
      ])
      commandInputView.commitMode = 'staged'
      const row = {inputId: 'new-tool', newToolId: ''}
      if (!commandInputView.rows.some(candidate => candidate['inputId'] === row.inputId)) {
        commandInputView.appendRow(row)
      }
      commandInputView.setCurrentRowById(row.inputId)
    }

    const optionsViewKey = buildDataViewKey(optionsView.tableName, optionsView.viewId, scenarioId)
    if (runtime.resolveView(optionsViewKey) !== optionsView) throw new Error('DEV_SYSTEM_TARGET_OPTIONS_RUNTIME: 候选视图未注册到当前运行时')
    const commandInputViewKey = commandInputView
      ? buildDataViewKey(commandInputView.tableName, commandInputView.viewId, scenarioId)
      : undefined
    if (commandInputView && (!commandInputViewKey || runtime.resolveView(commandInputViewKey) !== commandInputView)) {
      throw new Error('DEV_SYSTEM_TARGET_INPUT_RUNTIME: 命令输入视图未注册到当前运行时')
    }
    const resource: NodeTargetResources = {
      scope: input.scope,
      optionsView,
      optionsViewKey,
      ...(commandInputView && commandInputViewKey ? {commandInputView, commandInputViewKey} : {}),
      refreshOptions: async () => {
        assertCurrent()
        const signature = JSON.stringify(readTargetOptions(input.scope.owner))
        if (signature === lastOptionsSignature) return
        if (pendingRefresh) {
          await pendingRefresh.promise
          assertCurrent()
          if (signature === lastOptionsSignature) return
        }
        const promise = (async () => {
          await optionsView?.refresh()
          assertCurrent()
          if (optionsView?.loadingError) throw optionsView.loadingError
          lastOptionsSignature = signature
        })()
        pendingRefresh = {signature, promise}
        try {await promise} finally {clearPendingRefresh(promise)}
      },
      dispose: () => {
        if (disposed) return
        disposed = true
        for (const item of created.reverse()) {
          if (!dataSet.destroyed && dataSet.getTable(item.tableName) === item.table
            && dataSet.getView(item.tableName, 'default') === item.view) {
            dataSet.removeTable(item.tableName)
          }
        }
      },
    }
    return resource
  } catch (error) {
    disposed = true
    for (const item of created.reverse()) {
      if (dataSet.getTable(item.tableName) === item.table
        && dataSet.getView(item.tableName, 'default') === item.view) {
        dataSet.removeTable(item.tableName)
      }
    }
    throw error
  }
}

/** Own the target-selector resources only while NodeTargetConfig is mounted. */
export function useNodeTargetResources(state: DevState) {
  const resources = shallowRef<NodeTargetResources>()
  const inputRevision = ref(0)
  const inputValue = computed(() => {
    void inputRevision.value
    const view = resources.value?.commandInputView
    const row = view?.currentRow
    if (!view || !row) return ''
    const id = view.getPkKey(row)
    if (id === undefined || view.fieldAccess(row, 'newToolId').read !== 'visible') return ''
    const value = view.getEditingRow(id)?.['newToolId'] ?? row['newToolId']
    return typeof value === 'string' ? value : ''
  })
  let generation = 0
  let refreshQueued = false
  let removeSourceListeners = () => {}

  const isCurrent = (target: NodeTargetResources): boolean => {
    const {scope} = target
    try {
      return resources.value === target
      && scope.projectId === state.projectId
      && scope.runtime === state.blueprintPageRuntime.value
      && scope.owner === state.blueprintWorkspaceDataView.value
      && scope.nodeId === state.selectedNode.value?.nodeId
      && scope.owner.projectId === scope.projectId && scope.owner.nodeId === scope.nodeId
      && scope.owner.canRead('rowid') && scope.owner.value('rowid') === scope.nodeId
      && scope.runtime.isLoaded && !scope.runtime.destroyed
      && typeof scope.dataSet.scenarioId === 'string'
      && scope.runtime.getDataSet(scope.dataSet.scenarioId) === scope.dataSet
    } catch {return false}
  }

  const release = () => {
    generation++
    removeSourceListeners()
    removeSourceListeners = () => {}
    const target = resources.value
    resources.value = undefined
    target?.dispose()
    inputRevision.value++
  }

  watch([
    () => state.blueprintWorkspaceDataView.value,
    () => state.blueprintPageRuntime.value,
    () => state.projectId,
    () => state.selectedNode.value?.nodeId,
    () => state.selectedNode.value?.kind,
    () => Boolean(state.selectedNode.value?.navigation),
  ], ([owner, runtime, projectId, nodeId, kind, hasNavigation]) => {
    release()
    if (!hasNavigation || !owner || !runtime?.isLoaded || runtime.destroyed || !nodeId || !kind
      || owner.projectId !== projectId || owner.nodeId !== nodeId || !owner.hasTreeProjection
      || typeof owner.dataSet.scenarioId !== 'string' || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return
    const ownerScenarioId = owner.dataSet.scenarioId
    const currentGeneration = generation
    let created: NodeTargetResources | undefined
    const assertCurrent = () => {
      if (!created || currentGeneration !== generation || resources.value !== created
        || owner !== state.blueprintWorkspaceDataView.value || runtime !== state.blueprintPageRuntime.value
        || projectId !== state.projectId || nodeId !== state.selectedNode.value?.nodeId
        || owner.nodeId !== nodeId || !owner.canRead('rowid') || owner.value('rowid') !== nodeId
        || runtime.destroyed || !runtime.isLoaded
        || runtime.getDataSet(ownerScenarioId) !== owner.dataSet) {
        throw new Error('DEV_SYSTEM_TARGET_RESOURCE_STALE: 项目、节点或运行时已切换')
      }
    }
    try {
      created = createNodeTargetResources({
        scope: {dataSet: owner.dataSet, runtime, owner, projectId, nodeId},
        createTool: kind === 'page' || kind === 'content',
        assertCurrent,
      })
      resources.value = created
      const sourceEvents = ['rowsChanged', 'editingChanged', 'editingDiscarded', 'mutatingChanged'] as const
      for (const event of sourceEvents) owner.view.events.on(event, refreshOptions)
      removeSourceListeners = () => {for (const event of sourceEvents) owner.view.events.off(event, refreshOptions)}
      void created.refreshOptions().catch(error => {
        if (resources.value === created) state.addStatus(`导航目标候选加载失败: ${String(error)}`, 'error')
      })
    } catch (error) {
      state.addStatus(`导航目标资源装配失败: ${String(error)}`, 'error')
    }
  }, {immediate: true, flush: 'sync'})

  function refreshOptions(): void {
    if (refreshQueued) return
    refreshQueued = true
    void Promise.resolve().then(() => {
      refreshQueued = false
      const target = resources.value
      if (!target || !isCurrent(target)) return
      void target.refreshOptions().catch(error => {
        if (resources.value === target) state.addStatus(`导航目标候选刷新失败: ${String(error)}`, 'error')
      })
    })
  }
  watch([
    () => state.projectRevision.value,
    () => state.externalDataViewRevision.value,
  ], refreshOptions, {flush: 'post'})

  onScopeDispose(release)

  function notifyInputChanged(target: NodeTargetResources): void {
    if (isCurrent(target)) inputRevision.value++
  }
  function changeTarget(target: NodeTargetResources, value: unknown): void {
    if (isCurrent(target)) state.handlePathChange(typeof value === 'string' ? value : '')
  }
  function changeNavigation(target: NodeTargetResources): void {
    if (isCurrent(target)) state.markBlueprintDirty()
  }
  async function createTool(target: NodeTargetResources): Promise<boolean> {
    if (!isCurrent(target)) return false
    const pageId = inputValue.value.trim()
    if (!pageId) {
      state.addStatus('请先输入新工具 ID', 'warning')
      return false
    }
    const node = state.selectedNode.value
    if (!node || !isCurrent(target)) return false
    return state.createPageForSelectedNode({
      pageId,
      title: state.blueprintDraft.navigation?.title ?? state.blueprintDraft.capability.name ?? '',
      icon: state.blueprintDraft.navigation?.icon ?? 'Document',
    })
  }

  return {
    resources,
    inputValue,
    isCurrent,
    notifyInputChanged,
    changeTarget,
    changeNavigation,
    createTool,
  }
}
