/**
 * @module app:views/features/application/application-function-management/ui/page-design/node-target-resources
 * 职责：在当前蓝图运行 DataSet 中装配新工具命令输入视图。
 * 边界：导航候选直接绑定原蓝图 DataView；命令输入不属于正式蓝图保存目标。
 */
import {
  buildDataViewKey,
  ensureDataSetStaticInputTable,
  type DataSet,
  type DataView,
} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import {computed, onScopeDispose, ref, shallowRef, watch} from 'vue'
import type {DevState} from '../blueprint-state/useDevState'

export type NodeTargetTreeOwner = Pick<BlueprintWorkspaceDataView, 'projectId' | 'nodeId' | 'dataSet' | 'hasTreeProjection' | 'canRead' | 'value'>

export type NodeTargetResourceScope = Readonly<{
  dataSet: DataSet
  runtime: PageRuntime
  owner: NodeTargetTreeOwner
  projectId: string
  nodeId: string
}>

export type NodeTargetResources = Readonly<{
  scope: NodeTargetResourceScope
  commandInputView?: DataView
  commandInputViewKey?: string
  dispose: () => void
}>

type CreateNodeTargetResourcesInput = Readonly<{
  scope: NodeTargetResourceScope
  createTool: boolean
}>

function uniqueTableName(dataSet: DataSet, prefix: string): string {
  for (let attempt = 0; attempt < 4; attempt++) {
    const name = `${prefix}${crypto.randomUUID().replaceAll('-', '')}`
    if (!dataSet.getTable(name)) return name
  }
  throw new Error(`DEV_SYSTEM_TARGET_RESOURCE_COLLISION: ${prefix}`)
}

/**
 * Create the scoped create-tool input view. Navigation targets bind directly to the
 * standard Blueprint DataView; no unused options projection is created.
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
  const created: Array<{tableName: string; table: NonNullable<ReturnType<DataSet['getTable']>>; view: DataView}> = []
  const addStaticView = (tableName: string, columns: Array<{name: string; primary?: boolean}>): DataView => {
    ensureDataSetStaticInputTable(dataSet, tableName, columns)
    const table = dataSet.getTable(tableName)
    const view = dataSet.getView(tableName, 'default')
    if (!table || !view) throw new Error(`DEV_SYSTEM_TARGET_RESOURCE_VIEW: ${tableName}`)
    created.push({tableName, table, view})
    return view
  }

  let commandInputView: DataView | undefined
  try {
    if (input.createTool) {
      const inputTableName = uniqueTableName(dataSet, 'BlueprintCreateToolInput')
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

    const commandInputViewKey = commandInputView
      ? buildDataViewKey(commandInputView.tableName, commandInputView.viewId, scenarioId)
      : undefined
    if (commandInputView && (!commandInputViewKey || runtime.resolveView(commandInputViewKey) !== commandInputView)) {
      throw new Error('DEV_SYSTEM_TARGET_INPUT_RUNTIME: 命令输入视图未注册到当前运行时')
    }
    const resource: NodeTargetResources = {
      scope: input.scope,
      ...(commandInputView && commandInputViewKey ? {commandInputView, commandInputViewKey} : {}),
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
    if (!hasNavigation || !owner || !runtime?.isLoaded || runtime.destroyed || !nodeId || (kind !== 'page' && kind !== 'content')
      || owner.projectId !== projectId || owner.nodeId !== nodeId || !owner.hasTreeProjection
      || typeof owner.dataSet.scenarioId !== 'string' || runtime.getDataSet(owner.dataSet.scenarioId) !== owner.dataSet) return
    try {
      const created = createNodeTargetResources({
        scope: {dataSet: owner.dataSet, runtime, owner, projectId, nodeId},
        createTool:true,
      })
      resources.value = created
    } catch (error) {
      state.addStatus(`导航目标资源装配失败: ${String(error)}`, 'error')
    }
  }, {immediate: true, flush: 'sync'})

  onScopeDispose(release)

  function notifyInputChanged(target: NodeTargetResources): void {
    if (isCurrent(target)) inputRevision.value++
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
    createTool,
  }
}
