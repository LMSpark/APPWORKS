import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {AgentWorkflowFileResource, AGENT_WORKFLOW_FILE_RESOURCE_ID, AGENT_WORKFLOW_FILE_TABLE, resolveAgentWorkflowDataSpaceId} from '@/lowcode/resources/shared/agent-workflow-file-resource'

const columns = [
  {name: 'workflowId', type: 'string', isPrimaryKey: true},
  {name: 'fileName', type: 'string'},
  {name: 'timestamp', type: 'string'},
  {name: 'content', type: 'string'},
]

function fixture() {
  let current = true
  const api = {
    listFiles: vi.fn(async (input: {appType: string; folderPath: string}) => {
      expect(input).toEqual({appType: 'designfile', folderPath: 'APP/workflow-designs'})
      return [{name: 'agent.workflow.alpha', lastModified: 1730000000000}]
    }),
    readTextFile: vi.fn(async (input: {appType: string; customPath: string; fileName: string}) => {
      expect(input.appType).toBe('designfile')
      return `${input.customPath}/${input.fileName}`
    }),
  }
  const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {
    [AGENT_WORKFLOW_FILE_TABLE]: {resourceType: 'file', resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID,
      columns, views: {default: {}, directory: {}, design: {}, definition: {}}},
  }})
  const resource = new AgentWorkflowFileResource({applicationId: 'APP', api, assertCurrent: () => {
    if (!current) throw new Error('SPARK_EXECUTION_SCOPE_STALE')
  }})
  const table = dataSet.getTable(AGENT_WORKFLOW_FILE_TABLE)!
  for (const view of table.viewList) view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID}})
  return {api, dataSet, resource, stale: () => {current = false}}
}

describe('Agent Workflow file DataView resource', () => {
  it('lists directory entries through the resource DataView with read-only query grants', async () => {
    const {api, dataSet} = fixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(true)
      expect(view.requestState).toBe(RequestState.Loaded)
      expect(view.rows).toMatchObject([{workflowId: 'agent.workflow.alpha', fileName: 'design.json', timestamp: '1730000000000'}])
      expect(view.fieldAccess(view.rows[0]!, 'workflowId')).toMatchObject({read: 'visible', write: 'denied'})
      expect(api.listFiles).toHaveBeenCalledOnce()
      expect(api.readTextFile).not.toHaveBeenCalled()
    } finally {dataSet.destroy()}
  })

  it('reads design and definition only for the selected workflow and grants no writes', async () => {
    const {api, dataSet} = fixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'definition')!
    view.queryContext = {...view.queryContext, workflowId: 'agent.workflow.alpha'}
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(true)
      expect(view.rows).toMatchObject([{workflowId: 'agent.workflow.alpha', fileName: 'definition.json', timestamp: '', content: 'APP/workflow-designs/agent.workflow.alpha/definition.json'}])
      expect(view.fieldAccess(view.rows[0]!, 'content')).toMatchObject({read: 'visible', write: 'denied'})
      expect(api.readTextFile).toHaveBeenCalledWith({appType: 'designfile', customPath: 'APP/workflow-designs/agent.workflow.alpha', fileName: 'definition.json'})
    } finally {dataSet.destroy()}
  })

  it('rejects a stale application scope before returning file data', async () => {
    const {dataSet, stale} = fixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    stale()
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(false)
      expect(view.rows).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('rejects cached field and action authorization after the scope becomes stale', async () => {
    const {dataSet, resource, stale} = fixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await resource.executeQuery(view)
      const row = result.rows[0]!
      stale()
      expect(() => result.readFieldAccess(row, 'workflowId')).toThrow('SPARK_EXECUTION_SCOPE_STALE')
      expect(() => result.viewActionState(row['workflowId'])).toThrow('SPARK_EXECUTION_SCOPE_STALE')
    } finally {dataSet.destroy()}
  })
})






describe('Agent Workflow target space resolution', () => {
  async function catalog(rows: readonly Record<string, unknown>[], readable: (row: Record<string, unknown>, field: string) => boolean = () => true) {
    const dataSet = DataSet.fromJson({scenarioId: 'CATALOG', tables: {Base_DataSet: {modelBinding: {modelId: 'M', modelName: 'Base_DataSet'},
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}], views: {default: {}},
    }}})
    const view = dataSet.getView('Base_DataSet')!
    view.queryConfig = {...view.queryConfig, allPages: true}
    view.bindQueryExecutor({executeQuery: async () => ({rows, total: rows.length, rowKey: row => row['rowid'],
      assertIdentity: () => undefined, fieldAccess: (key, field) => ({read: rows.some(row => row['rowid'] === key && readable(row, field)) ? 'visible' : 'invisible',
        write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}),
      readFieldAccess: (row, field) => readable(row, field) ? 'visible' : 'invisible',
      addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
      createChildActionState: () => 'disabled', viewActionState: () => 'enabled'})})
    await view.requestRefresh()
    return {dataSet, view}
  }

  it('resolves only one exact-name row with readable formal rowid and Name', async () => {
    const {dataSet, view} = await catalog([{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}, {rowid: 'SPACE-2', Name: 'Other'}])
    try {
      expect(resolveAgentWorkflowDataSpaceId(view)).toBe('SPACE-1')
    } finally {dataSet.destroy()}
  })

  it('fails closed when the exact name is duplicated or its identity fields are unreadable', async () => {
    const duplicate = await catalog([{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}, {rowid: 'SPACE-2', Name: 'Agent工作流文件资源'}])
    const unreadable = await catalog([{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}], (_row, field) => field !== 'rowid')
    try {
      expect(() => resolveAgentWorkflowDataSpaceId(duplicate.view)).toThrow('唯一')
      expect(() => resolveAgentWorkflowDataSpaceId(unreadable.view)).toThrow('不可读')
    } finally {duplicate.dataSet.destroy(); unreadable.dataSet.destroy()}
  })
})


import {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/shared/agent-workflow-file-owner'

describe('Agent Workflow file owner lifecycle', () => {
  function modelSet(scenarioId: string, rows: readonly Record<string, unknown>[]) {
    const dataSet = DataSet.fromJson({scenarioId, tables: {Base_DataSet: {
      modelBinding: {modelId: 'M', modelName: 'Base_DataSet'},
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}], views: {default: {}, catalog: {}},
    }}})
    const view = dataSet.getView('Base_DataSet', 'catalog')!
    view.queryConfig = {...view.queryConfig, allPages: true}
    view.bindQueryExecutor({executeQuery: async () => ({rows, total: rows.length, rowKey: row => row['rowid'],
      assertIdentity: () => undefined, fieldAccess: (key, field) => ({read: rows.some(row => row['rowid'] === key && Object.hasOwn(row, field)) ? 'visible' : 'invisible',
        write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}),
      readFieldAccess: (row, field) => Object.hasOwn(row, field) ? 'visible' : 'invisible',
      addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
      createChildActionState: () => 'disabled', viewActionState: () => 'enabled'})})
    return dataSet
  }
  function workflowSet(scenarioId: string) {
    return DataSet.fromJson({scenarioId, tables: {AgentWorkflowFiles: {
      resourceType: 'file', resourceId: 'agent-workflow-files', columns,
      views: {default: {}, directory: {}, design: {}, definition: {}},
    }}})
  }

  it('loads the target from the formal catalog and serves page/AI definitions through its DataView', async () => {
    let token = 'scope-1'
    const calls: string[] = []
    const api = {listFiles: async () => [{name: 'agent.workflow.alpha', lastModified: 1730000000000}],
      readTextFile: async (input: {fileName: string}) => input.fileName === 'definition.json' ? '{"workflow":{}}' : '{"kind":"agent.workflow.design"}'}
    const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token, headers: {'X-AppId': 'APP'}}), api,
      loadScenario: async ({scenarioId}) => {
        calls.push(scenarioId)
        if (scenarioId === 'CATALOG') return modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}])
        return workflowSet(scenarioId)
      }, catalogScenarioId: 'CATALOG'})
    try {
      expect(calls).toEqual(['CATALOG', 'CATALOG', 'SPACE-1'])
      expect(await owner.listWorkflowIds()).toEqual(['agent.workflow.alpha'])
      expect(await owner.readDocument('agent.workflow.alpha', 'definition.json')).toBe('{"workflow":{}}')
      expect(owner.documentView.fieldAccess(owner.documentView.rows[0]!, 'content')).toMatchObject({read: 'visible', write: 'denied'})
    } finally {owner.dispose(); token = 'scope-2'}
  })

  it('does not load any target when the formal catalog name is ambiguous', async () => {
    const calls: string[] = []
    await expect(createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [], readTextFile: async () => ''}, catalogScenarioId: 'CATALOG',
      loadScenario: async ({scenarioId}) => {calls.push(scenarioId); return modelSet('CATALOG', [
        {rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}, {rowid: 'SPACE-2', Name: 'Agent工作流文件资源'},
      ])}})).rejects.toThrow('唯一')
    expect(calls).toEqual(['CATALOG'])
  })

  it('rejects scope changes before exposing the target DataView', async () => {
    let token = 'scope-1'
    const calls: string[] = []
    await expect(createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token, headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [], readTextFile: async () => ''}, catalogScenarioId: 'CATALOG',
      loadScenario: async ({scenarioId}) => {calls.push(scenarioId); const result = modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]); token = 'scope-2'; return result}})).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(calls).toEqual(['CATALOG'])
  })

  it('keeps selected document content on the page-owned bound DataView currentRow', async () => {
    const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [{name: 'agent.workflow.alpha', lastModified: null}], readTextFile: async () => '{"kind":"agent.workflow.design"}'},
      catalogScenarioId: 'CATALOG', loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG'
        ? modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]) : workflowSet(scenarioId)})
    try {
      expect(owner.loadDocument).toBeTypeOf('function')
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      expect(owner.designView.currentRow).toMatchObject({workflowId: 'agent.workflow.alpha', fileName: 'design.json', content: '{"kind":"agent.workflow.design"}'})
      expect(owner.designView.fieldAccess(owner.designView.currentRow!, 'content')).toMatchObject({read: 'visible', write: 'denied'})
    } finally {owner.dispose()}
  })
})
