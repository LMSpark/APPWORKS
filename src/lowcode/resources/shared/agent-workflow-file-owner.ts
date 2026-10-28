import {RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import catalogPageData from '../../../../config/pages/data-platform/data-space-catalog/pagedata.json'
import {lowcodeApi, lowcodeDesignFileUpload} from '@/lowcode/lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {
  AGENT_WORKFLOW_DATA_SPACE_NAME,
  AGENT_WORKFLOW_FILE_RESOURCE_ID,
  AGENT_WORKFLOW_FILE_TABLE,
  AgentWorkflowFileResource,
  resolveAgentWorkflowDataSpaceId,
} from './agent-workflow-file-resource'

type RequestScope = ReturnType<typeof lowcodeApi.readRequestScope>
type WorkflowFileApi = Pick<typeof lowcodeApi.design, 'listFiles' | 'readTextFile' | 'readFileBytes'>

export type AgentWorkflowFileDataViewOwner = Readonly<{
  readonly runtime: PageRuntime
  readonly catalogView: DataView
  readonly dataSet: DataSet
  readonly directoryView: DataView
  readonly designView: DataView
  readonly definitionView: DataView
  readonly documentView: DataView
  refreshDirectory(): Promise<void>
  loadDocument(workflowId: string, fileName: 'design.json' | 'definition.json'): Promise<void>
  listWorkflowEntries(): Promise<ReadonlyArray<Readonly<{workflowId: string; timestamp: string}>>>
  listWorkflowIds(): Promise<readonly string[]>
  readDocument(workflowId: string, fileName: 'design.json' | 'definition.json'): Promise<string>
  dispose(): void
}>

type OwnerInput = Readonly<{
  applicationId: string
  readScope: () => RequestScope
  api: WorkflowFileApi
  fileUpload: Pick<typeof lowcodeDesignFileUpload, 'uploadWorkingText'>
  catalogScenarioId: string
  loadScenario: (input: Readonly<{projectId: string; scenarioId: string}>) => Promise<DataSet>
}>

/** One PageRuntime owner for the formal catalog lookup and one for the resolved file resource. */
export async function createAgentWorkflowFileDataViewOwner(input?: Partial<OwnerInput>): Promise<AgentWorkflowFileDataViewOwner> {
  const readScope = input?.readScope ?? lowcodeApi.readRequestScope
  const initialScope = readScope()
  const applicationId = input?.applicationId ?? initialScope.headers['X-AppId']
  if (!applicationId || initialScope.headers['X-AppId'] !== applicationId) {
    throw new Error('SPARK_EXECUTION_SCOPE_STALE: 当前应用身份无效')
  }
  const catalogScenarioId = input?.catalogScenarioId ?? catalogPageData.scenarioId
  const api = input?.api ?? lowcodeApi.design
  const fileUpload = input?.fileUpload ?? lowcodeDesignFileUpload
  const loadScenario = input?.loadScenario ?? (command => loadLowcodeRuntimeScenario(command))
  const assertCurrent = (): void => {
    const current = readScope()
    if (current.token !== initialScope.token || current.headers['X-AppId'] !== applicationId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: Workflow 文件请求所属应用已失效')
    }
  }

  const preflightRuntime = new PageRuntime({pageId: 'agent-workflow-file-catalog-preflight', scenarioIds: [catalogScenarioId],
    mainScenarioId: catalogScenarioId, loadScenario: id => loadScenario({projectId: applicationId, scenarioId: id})})
  let runtime: PageRuntime | undefined
  try {
    assertCurrent()
    await preflightRuntime.load()
    assertCurrent()
    const preflightCatalog = preflightRuntime.getDataSet(catalogScenarioId)
    const preflightView = preflightCatalog?.getView('Base_DataSet', 'catalog')
    if (!preflightCatalog || !preflightView || preflightCatalog.scenarioId !== catalogScenarioId) {
      throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录DataSet缺少 Base_DataSet@catalog')
    }
    preflightView.queryConfig = {...preflightView.queryConfig, fields: ['rowid', 'Name'], allPages: true, maxRows: 50000, autoQuery: false}
    const catalogResult = await preflightView.loadFromServer({filter: {field: 'Name', operator: 'eq', value: AGENT_WORKFLOW_DATA_SPACE_NAME}, allPages: true, maxRows: 50000})
    assertCurrent()
    if (!catalogResult.success) throw catalogResult.error ?? new Error(catalogResult.message ?? '正式数据空间目录查询失败')
    const targetId = resolveAgentWorkflowDataSpaceId(preflightView)
    preflightRuntime.dispose()
    assertCurrent()

    runtime = new PageRuntime({pageId: 'agent-workflow-file-data', scenarioIds: [catalogScenarioId, targetId], mainScenarioId: targetId,
      loadScenario: id => loadScenario({projectId: applicationId, scenarioId: id})})
    await runtime.load()
    assertCurrent()
    const catalog = runtime.getDataSet(catalogScenarioId)
    const catalogView = catalog?.getView('Base_DataSet', 'catalog')
    if (!catalog || !catalogView || catalog.scenarioId !== catalogScenarioId) throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录DataSet未保留在页面PageRuntime中')
    catalogView.queryConfig = {...catalogView.queryConfig, fields: ['rowid', 'Name'], allPages: true, maxRows: 50000, autoQuery: false}
    const verifiedCatalog = await catalogView.loadFromServer({filter: {field: 'Name', operator: 'eq', value: AGENT_WORKFLOW_DATA_SPACE_NAME}, allPages: true, maxRows: 50000})
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
    return {
      runtime, catalogView, dataSet, directoryView, designView, definitionView, documentView,
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
      dispose: () => {runtime?.dispose(); runtime = undefined},
    }
  } catch (error) {
    runtime?.dispose()
    preflightRuntime.dispose()
    throw error
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
