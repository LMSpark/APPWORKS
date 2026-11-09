/**
 * @module app:lowcode/resources/repository/agent-workflow/agent-workflow-file-owner
 * 职责：从正式目录解析「Agent工作流文件资源」空间，装配其 DataSet 并绑定文件表与 design.json 五张投影表的执行器。
 * 边界：页面和 AI 运行器只经本 owner 的 DataView 读写工作流文件；文件提交链在 agent-workflow-file-resource。
 * AI用途：工作流设计页或 AI 运行器找不到工作流视图、加载设计或子图失败时，用本模块定位装配与绑定。
 */
import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {lowcodeApi, lowcodeDesignFileUpload} from '@/lowcode/lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {
  AGENT_WORKFLOW_DATA_SPACE_NAME,
  AGENT_WORKFLOW_FILE_RESOURCE_ID,
  AGENT_WORKFLOW_FILE_TABLE,
  AgentWorkflowFileResource,
  resolveAgentWorkflowDataSpaceId,
} from './agent-workflow-file-resource'
import {AGENT_WORKFLOW_DESIGN_TABLES, AgentWorkflowDesignResource} from './agent-workflow-design-resource'
import {AGENT_WORKFLOW_CAPABILITY_TABLE, AGENT_WORKFLOW_DESIGN_TABLE, AGENT_WORKFLOW_LINE_TABLE, AGENT_WORKFLOW_NODE_TABLE,
  AGENT_WORKFLOW_VARIABLE_TABLE} from './agent-workflow-design-projection'

/** 当前请求作用域（令牌与应用头）。 */
type RequestScope = ReturnType<typeof lowcodeApi.readRequestScope>
/** owner 使用的工作流文件读取接口。 */
type WorkflowFileApi = Pick<typeof lowcodeApi.design, 'listFiles' | 'readTextFile' | 'readFileBytes'>

/** Agent 工作流文件空间的运行实例及其命名视图、加载命令。 */
export type AgentWorkflowFileDataViewOwner = Readonly<{
  /** 文件空间的 PageRuntime。 */
  readonly runtime: PageRuntime
  /** 用于解析空间身份的正式目录视图。 */
  readonly catalogView: DataView
  /** 文件空间 DataSet。 */
  readonly dataSet: DataSet
  /** 工作流目录视图。 */
  readonly directoryView: DataView
  /** design.json 文件行视图。 */
  readonly designView: DataView
  /** definition.json 文件行视图。 */
  readonly definitionView: DataView
  /** 最近一次 loadDocument 使用的文件行视图。 */
  readonly documentView: DataView
  /** design.json 的五张投影表视图；同一执行器，一次 saveChanges 合成一次文件写入。 */
  readonly design: AgentWorkflowDesignViews
  /** 读取工作流的流程、主图、变量和能力；子图视图清空，待选中循环/迭代节点后再查。 */
  loadDesign(workflowId: string): Promise<void>
  /** 让子图视图查询指定 graphPath；传空串清空子图。 */
  loadChildGraph(graphPath: string): Promise<void>
  /** 重新查询工作流目录。 */
  refreshDirectory(): Promise<void>
  /** 让对应文件行视图查询指定工作流的文件。 */
  loadDocument(workflowId: string, fileName: 'design.json' | 'definition.json'): Promise<void>
  /** 查询目录并返回工作流及其修改时间。 */
  listWorkflowEntries(): Promise<ReadonlyArray<Readonly<{workflowId: string; timestamp: string}>>>
  /** 查询目录并返回工作流 ID。 */
  listWorkflowIds(): Promise<readonly string[]>
  /** 经文件行视图读取文件全文。 */
  readDocument(workflowId: string, fileName: 'design.json' | 'definition.json'): Promise<string>
  /** 释放目录和文件空间的运行实例。 */
  dispose(): void
}>

/** owner 的可注入依赖；缺省使用当前应用的正式运行接口。 */
type OwnerInput = Readonly<{
  /** 应用 ID，须与当前请求作用域一致。 */
  applicationId: string
  /** 读取当前请求作用域。 */
  readScope: () => RequestScope
  /** 文件读取接口。 */
  api: WorkflowFileApi
  /** 文件上传接口。 */
  fileUpload: Pick<typeof lowcodeDesignFileUpload, 'uploadWorkingText'>
  /** 数据空间目录场景 ID。 */
  catalogScenarioId: string
  /** 装配指定场景的 DataSet。 */
  loadScenario: (input: Readonly<{projectId: string; scenarioId: string}>) => Promise<DataSet>
}>

/** One PageRuntime owner for the formal catalog lookup and one for the resolved file resource. */
export async function createAgentWorkflowFileDataViewOwner(input?: Partial<OwnerInput>): Promise<AgentWorkflowFileDataViewOwner> {
  const readScope = input?.readScope ?? (() => lowcodeApi.readRequestScope())
  const initialScope = readScope()
  const applicationId = input?.applicationId ?? initialScope.headers['X-AppId']
  if (!applicationId || initialScope.headers['X-AppId'] !== applicationId) {
    throw new Error('SPARK_EXECUTION_SCOPE_STALE: 当前应用身份无效')
  }
  const catalogScenarioId = input?.catalogScenarioId ?? getBuiltinScenarioResource('dataSpaceCatalog').scenarioId
  const api = input?.api ?? lowcodeApi.design
  const fileUpload = input?.fileUpload ?? lowcodeDesignFileUpload
  const loadScenario = input?.loadScenario ?? (command => loadLowcodeRuntimeScenario(command))
  const assertCurrent = (): void => {
    const current = readScope()
    if (current.token !== initialScope.token || current.headers['X-AppId'] !== applicationId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: Workflow 文件请求所属应用已失效')
    }
  }

  const session = new NativePageRuntimeSession()
  const loadOwnedScenario = (id: string) => loadScenario({projectId: applicationId, scenarioId: id})
  try {
    assertCurrent()
    const preflightRuntime = session.acquire({pageId: 'agent-workflow-file-catalog-preflight', scenarioIds: [catalogScenarioId],
      mainScenarioId: catalogScenarioId, targetId: catalogScenarioId, loadScenario: loadOwnedScenario})
    await preflightRuntime.load()
    assertCurrent()
    const preflightCatalog = preflightRuntime.getDataSet(catalogScenarioId)
    const preflightView = preflightCatalog?.getView('Base_DataSet', 'catalog')
    if (!preflightCatalog || !preflightView || preflightCatalog.scenarioId !== catalogScenarioId) {
      throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录DataSet缺少 Base_DataSet@catalog')
    }
    preflightView.queryConfig = {...preflightView.queryConfig, fields: ['rowid', 'Name'], allPages: true, maxRows: 50000, autoQuery: false}
    const catalogResult = await preflightView.loadFromServer({filter: {field: 'Name', operator: 'eq', value: AGENT_WORKFLOW_DATA_SPACE_NAME}, sort: '', allPages: true, maxRows: 50000})
    assertCurrent()
    if (!catalogResult.success) throw catalogResult.error ?? new Error(catalogResult.message ?? '正式数据空间目录查询失败')
    const targetId = resolveAgentWorkflowDataSpaceId(preflightView)
    if (!session.isCurrent(preflightRuntime)) throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 目录预查询已失效')
    session.dispose()
    assertCurrent()

    const runtime = session.acquire({pageId: 'agent-workflow-file-data', scenarioIds: [catalogScenarioId, targetId],
      mainScenarioId: targetId, targetId, loadScenario: loadOwnedScenario})
    await runtime.load()
    assertCurrent()
    const catalog = runtime.getDataSet(catalogScenarioId)
    const catalogView = catalog?.getView('Base_DataSet', 'catalog')
    if (!catalog || !catalogView || catalog.scenarioId !== catalogScenarioId) throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录DataSet未保留在页面PageRuntime中')
    catalogView.queryConfig = {...catalogView.queryConfig, fields: ['rowid', 'Name'], allPages: true, maxRows: 50000, autoQuery: false}
    const verifiedCatalog = await catalogView.loadFromServer({filter: {field: 'Name', operator: 'eq', value: AGENT_WORKFLOW_DATA_SPACE_NAME}, sort: '', allPages: true, maxRows: 50000})
    assertCurrent()
    if (!verifiedCatalog.success || resolveAgentWorkflowDataSpaceId(catalogView) !== targetId) {
      throw verifiedCatalog.error ?? new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: PageRuntime目录身份与预查询不一致')
    }
    const dataSet = runtime.getDataSet(targetId)
    const table = dataSet?.getTable(AGENT_WORKFLOW_FILE_TABLE)
    if (dataSet?.scenarioId !== targetId || table?.resourceType !== 'file'
      || table.resourceId !== AGENT_WORKFLOW_FILE_RESOURCE_ID || table.modelBinding
      || !(table.getView('directory') && table.getView('design') && table.getView('definition'))) {
      throw new Error('AGENT_WORKFLOW_FILE_BINDING: 目标空间缺少已注册的文件资源及完整视图')
    }
    const resource = new AgentWorkflowFileResource({applicationId, api, fileUpload, assertCurrent})
    for (const view of table.viewList) view.bindQueryExecutor({executeQuery: resource.executeQuery.bind(resource),
      save: resource.save.bind(resource), hasUnconfirmedSave: resource.hasUnconfirmedSave.bind(resource)},
    {resource: {resourceType: 'file', resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID}})
    const designBinding = bindDesignTables(dataSet, new AgentWorkflowDesignResource({applicationId, api, fileUpload, assertCurrent}))
    const designViews = (): AgentWorkflowDesignViews => {
      if (designBinding instanceof Error) throw designBinding
      return designBinding
    }
    const directoryView = table.getView('directory')
    const designView = table.getView('design')
    const definitionView = table.getView('definition')
    if (!directoryView || !designView || !definitionView) throw new Error('AGENT_WORKFLOW_FILE_BINDING: 文件资源DataView缺失')
    const documentView = definitionView
    if (directoryView.dataSet !== dataSet || documentView.dataSet !== dataSet) throw new Error('AGENT_WORKFLOW_FILE_BINDING: DataView不属于目标DataSet')
    const refreshDirectory = async () => {
      assertCurrent()
      const result = await directoryView.requestRefresh()
      assertCurrent()
      if (!result.success || directoryView.requestState !== RequestState.Loaded || directoryView.loadingError) {
        throw result.error ?? directoryView.loadingError ?? new Error(result.message ?? '工作流目录查询失败')
      }
    }
    const listWorkflowEntries = async () => {
      await refreshDirectory()
      return directoryView.rows.map(row => {
        if (directoryView.fieldAccess(row, 'workflowId').read !== 'visible' || typeof row['workflowId'] !== 'string') {
          throw new Error('AGENT_WORKFLOW_FILE_DIRECTORY: 工作流身份不可读')
        }
        if (directoryView.fieldAccess(row, 'timestamp').read !== 'visible' || typeof row['timestamp'] !== 'string') {
          throw new Error('AGENT_WORKFLOW_FILE_DIRECTORY: 工作流更新时间不可读')
        }
        return {workflowId: row['workflowId'], timestamp: row['timestamp']}
      })
    }
    const loadDesignViews = async (views: readonly DataView[], context: Readonly<Record<string, string>>) => {
      assertCurrent()
      for (const view of views) {
        if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave) {
          throw new Error(`AGENT_WORKFLOW_DESIGN_LOAD: ${view.tableName}@${view.viewId} 仍有未保存或待核验的修改`)
        }
      }
      const results = await Promise.all(views.map(view => {
        view.queryContext = {...view.queryContext, ...context}
        return view.requestRefresh()
      }))
      assertCurrent()
      const failed = results.find(result => !result.success)
      if (failed) throw failed.error ?? new Error(failed.message ?? 'Agent 工作流设计查询失败')
    }
    return {
      runtime, catalogView, dataSet, directoryView, designView, definitionView, documentView,
      get design() {return designViews()},
      loadDesign: async workflowId => {
        const design = designViews()
        const ids = await thisDirectoryIds(directoryView, assertCurrent)
        if (!ids.includes(workflowId)) throw new Error(`AGENT_WORKFLOW_FILE_DIRECTORY: 工作流不在当前可读目录中: ${workflowId}`)
        await loadDesignViews([design.workflow, design.nodes, design.lines, design.variables, design.capabilities], {workflowId})
        await loadDesignViews([design.childNodes, design.childLines], {workflowId, graphPath: ''})
      },
      loadChildGraph: async graphPath => {
        const design = designViews()
        await loadDesignViews([design.childNodes, design.childLines], {graphPath})
      },
      refreshDirectory,
      loadDocument: async (workflowId, fileName) => {
        assertCurrent()
        const ids = await thisDirectoryIds(directoryView, assertCurrent)
        if (!ids.includes(workflowId)) throw new Error(`AGENT_WORKFLOW_FILE_DIRECTORY: 工作流不在当前可读目录中: ${workflowId}`)
        const selected = fileName === 'design.json' ? designView : definitionView
        selected.queryContext = {...selected.queryContext, workflowId}
        const result = await selected.requestRefresh()
        assertCurrent()
        const row = selected.rows.find(item => item['workflowId'] === workflowId && item['fileName'] === fileName)
        if (!result.success || selected.rows.length !== 1 || !row || selected.fieldAccess(row, 'content').read !== 'visible'
          || typeof row['content'] !== 'string') {
          throw result.error ?? selected.loadingError ?? new Error(result.message ?? `工作流文件不可读: ${workflowId}/${fileName}`)
        }
        selected.setCurrentRow(row)
      },
      listWorkflowEntries,
      listWorkflowIds: async () => (await listWorkflowEntries()).map(row => row.workflowId),
      readDocument: async (workflowId, fileName) => {
        await (async () => {
          assertCurrent()
          const ids = await thisDirectoryIds(directoryView, assertCurrent)
          if (!ids.includes(workflowId)) throw new Error(`AGENT_WORKFLOW_FILE_DIRECTORY: 工作流不在当前可读目录中: ${workflowId}`)
          const selected = fileName === 'design.json' ? designView : definitionView
          selected.queryContext = {...selected.queryContext, workflowId}
          const result = await selected.requestRefresh()
          assertCurrent()
          const row = selected.rows.find(item => item['workflowId'] === workflowId && item['fileName'] === fileName)
          if (!result.success || selected.rows.length !== 1 || !row || selected.fieldAccess(row, 'content').read !== 'visible'
            || typeof row['content'] !== 'string') {
            throw result.error ?? selected.loadingError ?? new Error(result.message ?? `工作流文件不可读: ${workflowId}/${fileName}`)
          }
          selected.setCurrentRow(row)
        })()
        const selected = fileName === 'design.json' ? designView : definitionView
        assertCurrent()
        const row = selected.currentRow
        if (!row || selected.fieldAccess(row, 'content').read !== 'visible' || typeof row['content'] !== 'string') {
          throw new Error(`AGENT_WORKFLOW_FILE_READ: DataView currentRow 不可读: ${workflowId}/${fileName}`)
        }
        return row['content']
      },
      dispose: () => {session.dispose()},
    }
  } catch (error) {
    session.dispose()
    throw error
  }
}

/** design.json 投影视图：主图与子图分开查询、分开保留编辑，保存时合成一次写入。 */
export type AgentWorkflowDesignViews = Readonly<{
  /** 流程行（标题、版本、运行绑定）。 */
  workflow: DataView
  /** 主图节点。 */
  nodes: DataView
  /** 主图连线。 */
  lines: DataView
  /** 当前选中循环/迭代节点的子图节点。 */
  childNodes: DataView
  /** 当前子图连线。 */
  childLines: DataView
  /** 流程变量。 */
  variables: DataView
  /** 流程能力。 */
  capabilities: DataView
}>

/** 空间未完整声明五张投影表时返回错误而不抛出：文件行与发布定义照常可用，只有使用设计视图时才失败。 */
function bindDesignTables(dataSet: DataSet, resource: AgentWorkflowDesignResource): AgentWorkflowDesignViews | Error {
  const executor = {executeQuery: resource.executeQuery.bind(resource), save: resource.save.bind(resource),
    hasUnconfirmedSave: resource.hasUnconfirmedSave.bind(resource)}
  for (const definition of AGENT_WORKFLOW_DESIGN_TABLES) {
    const table = dataSet.getTable(definition.tableName)
    if (table?.resourceType !== 'file' || table.resourceId !== definition.resourceId || table.modelBinding
      || Object.keys(definition.views).some(viewId => !table.getView(viewId))) {
      return new Error(`AGENT_WORKFLOW_DESIGN_BINDING: 目标空间缺少已注册的设计投影表及完整视图: ${definition.tableName}`)
    }
  }
  for (const definition of AGENT_WORKFLOW_DESIGN_TABLES) {
    dataSet.getTable(definition.tableName)?.viewList.forEach(view =>
      view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: definition.resourceId}}))
  }
  const view = (tableName: string, viewId: string): DataView => {
    const found = dataSet.getView(tableName, viewId)
    if (!found) throw new Error(`AGENT_WORKFLOW_DESIGN_BINDING: 缺少视图 ${tableName}@${viewId}`)
    return found
  }
  return {
    workflow: view(AGENT_WORKFLOW_DESIGN_TABLE, 'design'),
    nodes: view(AGENT_WORKFLOW_NODE_TABLE, 'graph'),
    lines: view(AGENT_WORKFLOW_LINE_TABLE, 'graph'),
    childNodes: view(AGENT_WORKFLOW_NODE_TABLE, 'child'),
    childLines: view(AGENT_WORKFLOW_LINE_TABLE, 'child'),
    variables: view(AGENT_WORKFLOW_VARIABLE_TABLE, 'design'),
    capabilities: view(AGENT_WORKFLOW_CAPABILITY_TABLE, 'design'),
  }
}

async function thisDirectoryIds(view: DataView, assertCurrent: () => void): Promise<readonly string[]> {
  assertCurrent()
  const result = await view.requestRefresh()
  assertCurrent()
  if (!result.success || view.requestState !== RequestState.Loaded || view.loadingError) {
    throw result.error ?? view.loadingError ?? new Error(result.message ?? '工作流目录查询失败')
  }
  return view.rows.flatMap(row => view.fieldAccess(row, 'workflowId').read === 'visible' && typeof row['workflowId'] === 'string'
    ? [row['workflowId']] : [])
}
