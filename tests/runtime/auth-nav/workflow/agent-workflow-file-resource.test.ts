import {DataSet, RequestState} from '@spark-appworks/spark-data'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import type {LowcodeDesignApi, LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {AgentWorkflowFileResource, AGENT_WORKFLOW_FILE_RESOURCE_ID, AGENT_WORKFLOW_FILE_TABLE, resolveAgentWorkflowDataSpaceId} from '@/lowcode/resources/repository/agent-workflow-file-resource'

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
    readFileBytes: vi.fn(async (input: {appType: string; customPath: string; fileName: string}) =>
      new TextEncoder().encode(`${input.customPath}/${input.fileName}`)),
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

  it('keeps the formal missing workflow directory response as a failed query', async () => {
    const {api, dataSet} = fixture()
    const error = new LowcodeApiError(1003, '文件夹路径不存在')
    vi.mocked(api.listFiles).mockRejectedValueOnce(error)
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(false)
      expect(view.requestState).not.toBe(RequestState.Loaded)
      expect(view.rows).toEqual([])
      expect(view.loadingError).toBe(error)
    } finally {dataSet.destroy()}
  })

  it('keeps a cross-module missing-directory response as a failed query', async () => {
    const {api, dataSet} = fixture()
    const foreignModuleError = Object.assign(new Error('文件夹路径不存在'), {name: 'LowcodeApiError', code: 1003})
    vi.mocked(api.listFiles).mockRejectedValueOnce(foreignModuleError)
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(false)
      expect(view.requestState).not.toBe(RequestState.Loaded)
      expect(view.rows).toEqual([])
      expect(view.loadingError).toBe(foreignModuleError)
    } finally {dataSet.destroy()}
  })

  it('keeps the backend-prefixed missing-directory response as a failed query', async () => {
    const {api, dataSet} = fixture()
    const error = new LowcodeApiError(1003, '[1003] 文件夹路径不存在')
    vi.mocked(api.listFiles).mockRejectedValueOnce(error)
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(false)
      expect(view.requestState).not.toBe(RequestState.Loaded)
      expect(view.rows).toEqual([])
      expect(view.loadingError).toBe(error)
    } finally {dataSet.destroy()}
  })

  it('loads an empty directory when listFiles successfully returns no entries', async () => {
    const {api, dataSet} = fixture()
    vi.mocked(api.listFiles).mockResolvedValueOnce([])
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(true)
      expect(view.requestState).toBe(RequestState.Loaded)
      expect(view.rows).toEqual([])
      expect(view.total).toBe(0)
      expect(view.loadingError).toBeNull()
    } finally {dataSet.destroy()}
  })

  it.each([
    ['different message', new LowcodeApiError(1003, '其他数据错误')],
    ['authorization denial', new LowcodeApiError(403, '文件夹路径不存在')],
  ])('keeps a missing-directory-like response as an error for %s', async (_label, error) => {
    const {api, dataSet} = fixture()
    vi.mocked(api.listFiles).mockRejectedValueOnce(error)
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'directory')!
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(false)
      expect(view.requestState).not.toBe(RequestState.Loaded)
      expect(view.rows).toEqual([])
      expect(view.loadingError).toBe(error)
    } finally {dataSet.destroy()}
  })

  it('reads the selected workflow definition and grants content-only writes', async () => {
    const {api, dataSet} = fixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'definition')!
    view.queryContext = {...view.queryContext, workflowId: 'agent.workflow.alpha'}
    try {
      const result = await view.requestRefresh()
      expect(result.success).toBe(true)
      expect(view.rows).toMatchObject([{workflowId: 'agent.workflow.alpha', fileName: 'definition.json', timestamp: '', content: 'APP/workflow-designs/agent.workflow.alpha/definition.json'}])
      expect(view.fieldAccess(view.rows[0]!, 'content')).toMatchObject({read: 'visible', write: 'allowed'})
      expect(view.fieldAccess(view.rows[0]!, 'workflowId')).toMatchObject({write: 'denied'})
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

describe('Agent Workflow file DataView save contract', () => {
  function unknownReceiptError(): Error {
    const error = new Error('response lost')
    error.name = 'RequestError'
    Object.assign(error, {config: {url: '/api/File/UploadFile'}})
    return error
  }
  function writableFixture(options: Readonly<{
    upload?: LowcodeDesignFileUpload['uploadWorkingText']
    readback?: LowcodeDesignApi['readFileBytes']
    readText?: LowcodeDesignApi['readTextFile']
    assertCurrent?: () => void
  }> = {}) {
    const remote = new Map<string, string>([
      ['agent.workflow.alpha/design.json', '{"kind":"agent.workflow.design","version":1}'],
      ['agent.workflow.alpha/definition.json', '{"kind":"agent.workflow","version":1}'],
    ])
    const readApi = {
      listFiles: vi.fn<LowcodeDesignApi['listFiles']>(async () => [{name: 'agent.workflow.alpha', lastModified: 1}]),
      readTextFile: vi.fn<LowcodeDesignApi['readTextFile']>(async input => options.readText
        ? options.readText(input)
        : remote.get(`${input.customPath.split('/').at(-1)}/${input.fileName}`) ?? ''),
      readFileBytes: vi.fn<LowcodeDesignApi['readFileBytes']>(async input => options.readback
        ? options.readback(input)
        : new TextEncoder().encode(remote.get(`${input.customPath.split('/').at(-1)}/${input.fileName}`) ?? '')),
    } satisfies Pick<LowcodeDesignApi, 'listFiles' | 'readTextFile' | 'readFileBytes'>
    const fileUpload = {
      uploadWorkingText: vi.fn<LowcodeDesignFileUpload['uploadWorkingText']>(async input => {
        if (options.upload) return options.upload(input)
        remote.set(`${input.customPath.split('/').at(-1)}/${input.fileName}`, input.text)
        return {fileName: input.fileName, state: 'success'}
      }),
    } satisfies Pick<LowcodeDesignFileUpload, 'uploadWorkingText'>
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', tables: {
      [AGENT_WORKFLOW_FILE_TABLE]: {resourceType: 'file', resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID,
        columns, views: {default: {}, directory: {}, design: {}, definition: {}}},
    }})
    const resourcePorts = {applicationId: 'APP', api: readApi, fileUpload, assertCurrent: options.assertCurrent ?? (() => undefined)}
    const resource = new AgentWorkflowFileResource(resourcePorts)
    const table = dataSet.getTable(AGENT_WORKFLOW_FILE_TABLE)!
    for (const view of table.viewList) view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID}})
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, 'design')!
    view.queryContext = {...view.queryContext, workflowId: 'agent.workflow.alpha'}
    return {api: readApi, fileUpload, dataSet, resource, view}
  }

  it.each(['workflowId', 'fileName', 'timestamp'])('keeps %s read-only while allowing only document content edits', async field => {
    const {dataSet, view} = writableFixture()
    try {
      const loaded = await view.requestRefresh()
      expect(loaded.success).toBe(true)
      const row = view.rows[0]!
      expect(view.fieldAccess(row, field)).toMatchObject({write: 'denied'})
      expect(view.fieldAccess(row, 'content')).toMatchObject({read: 'visible', write: 'allowed'})
    } finally {dataSet.destroy()}
  })

  it.each([['design', 'design.json'], ['definition', 'definition.json']] as const)(
    'saves only the selected %s row through DataSet and confirms exact working-file bytes', async (viewId, fileName) => {
    const {api, fileUpload, dataSet} = writableFixture()
    const view = dataSet.getView(AGENT_WORKFLOW_FILE_TABLE, viewId)!
    view.queryContext = {...view.queryContext, workflowId: 'agent.workflow.alpha'}
    try {
      await view.requestRefresh()
      const row = view.rows[0]!
      const id = view.getPkKey(row)!
      await view.editRowById(id, {content: '{"version":2}'})
      const saved = await dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId, ids: [id]}]})
      expect(saved.success).toBe(true)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledWith({customPath: 'APP/workflow-designs/agent.workflow.alpha', fileName, text: '{"version":2}'})
      expect(api.readFileBytes).toHaveBeenCalledWith({appType: 'designfile', customPath: 'APP/workflow-designs/agent.workflow.alpha', fileName})
      expect(view.dirtyTracking.hasPendingChanges(id)).toBe(false)
      expect(view.hasUnconfirmedSave).toBe(false)
    } finally {dataSet.destroy()}
  })

  it('rejects a changed remote baseline before upload and retains the DataView edit', async () => {
    let reads = 0
    const {fileUpload, dataSet, view} = writableFixture({readText: async _input => {
      reads++
      return reads === 1 ? '{"kind":"agent.workflow.design","version":1}' : '{"kind":"agent.workflow.design","version":"remote"}'
    }})
    try {
      await view.requestRefresh()
      const row = view.rows[0]!
      const id = view.getPkKey(row)!
      await view.editRowById(id, {content: '{"version":2}'})
      await expect(dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'design', ids: [id]}]})).rejects.toThrow(/CONFLICT|冲突/)
      expect(reads).toBe(2)
      expect(fileUpload.uploadWorkingText).not.toHaveBeenCalled()
      expect(view.dirtyTracking.hasPendingChanges(id)).toBe(true)
    } finally {dataSet.destroy()}
  })

  it('keeps the original save unconfirmed when upload outcome is unknown and verifies without replay', async () => {
    const {api, fileUpload, dataSet, view} = writableFixture({upload: async () => {throw unknownReceiptError()}})
    try {
      await view.requestRefresh()
      const id = view.getPkKey(view.rows[0]!)!
      await view.editRowById(id, {content: '{"version":2}'})
      const target = {views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'design', ids: [id]}]}
      await expect(dataSet.saveChanges(target)).rejects.toThrow('response lost')
      expect(view.hasUnconfirmedSave).toBe(true)
      const readbacksBeforeVerification = api.readFileBytes.mock.calls.length
      await expect(dataSet.saveChanges(target)).rejects.toThrow(/未应用|未确认|unknown/i)
      expect(api.readFileBytes.mock.calls.length).toBeGreaterThan(readbacksBeforeVerification)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      expect(view.dirtyTracking.hasPendingChanges(id)).toBe(true)
    } finally {dataSet.destroy()}
  })

  it('confirms an unknown upload from the original target bytes without issuing a second upload', async () => {
    let remote = '{"version":1}'
    const {api, fileUpload, dataSet, view} = writableFixture({
      upload: async input => {remote = input.text; throw unknownReceiptError()},
      readback: async () => new TextEncoder().encode(remote),
    })
    try {
      await view.requestRefresh()
      const id = view.getPkKey(view.rows[0]!)!
      await view.editRowById(id, {content: '{"version":2}'})
      const target = {views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'design', ids: [id]}]}
      await expect(dataSet.saveChanges(target)).rejects.toThrow('response lost')
      const readsBeforeVerification = api.readFileBytes.mock.calls.length
      const saved = await dataSet.saveChanges(target)
      expect(saved.success).toBe(true)
      expect(api.readFileBytes.mock.calls.length).toBeGreaterThan(readsBeforeVerification)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      expect(view.dirtyTracking.hasPendingChanges(id)).toBe(false)
      expect(view.hasUnconfirmedSave).toBe(false)
    } finally {dataSet.destroy()}
  })

  it.each(['scope', 'readback'])('does not accept or clean the edit when %s changes during save', async kind => {
    let current = true
    const {fileUpload, dataSet, view} = writableFixture({
      assertCurrent: () => {if (!current) throw new Error('SPARK_EXECUTION_SCOPE_STALE')},
      ...(kind === 'readback' ? {readback: async () => new TextEncoder().encode('different')} : {}),
    })
    try {
      await view.requestRefresh()
      const id = view.getPkKey(view.rows[0]!)!
      await view.editRowById(id, {content: '{"version":2}'})
      if (kind === 'scope') vi.mocked(fileUpload.uploadWorkingText).mockImplementationOnce(async () => {current = false; return {state: 'success'}})
      await expect(dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'design', ids: [id]}]})).rejects.toThrow(kind === 'scope' ? 'SPARK_EXECUTION_SCOPE_STALE' : /回读不一致/)
      expect(view.dirtyTracking.hasPendingChanges(id)).toBe(true)
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(view.rows[0]?.['content']).toBe('{"version":2}')
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


import {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow-file-owner'

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
      readTextFile: async (input: {fileName: string}) => input.fileName === 'definition.json' ? '{"workflow":{}}' : '{"kind":"agent.workflow.design"}',
      readFileBytes: async () => new TextEncoder().encode('{"workflow":{}}')}
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
      expect(owner.documentView.fieldAccess(owner.documentView.rows[0]!, 'content')).toMatchObject({read: 'visible', write: 'allowed'})
    } finally {owner.dispose(); token = 'scope-2'}
  })

  it('does not load any target when the formal catalog name is ambiguous', async () => {
    const calls: string[] = []
    await expect(createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [], readTextFile: async () => '', readFileBytes: async () => new Uint8Array()}, catalogScenarioId: 'CATALOG',
      loadScenario: async ({scenarioId}) => {calls.push(scenarioId); return modelSet('CATALOG', [
        {rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}, {rowid: 'SPACE-2', Name: 'Agent工作流文件资源'},
      ])}})).rejects.toThrow('唯一')
    expect(calls).toEqual(['CATALOG'])
  })

  it('rejects scope changes before exposing the target DataView', async () => {
    let token = 'scope-1'
    const calls: string[] = []
    await expect(createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token, headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [], readTextFile: async () => '', readFileBytes: async () => new Uint8Array()}, catalogScenarioId: 'CATALOG',
      loadScenario: async ({scenarioId}) => {calls.push(scenarioId); const result = modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]); token = 'scope-2'; return result}})).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(calls).toEqual(['CATALOG'])
  })

  it('keeps selected document content on the page-owned bound DataView currentRow', async () => {
    const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [{name: 'agent.workflow.alpha', lastModified: null}], readTextFile: async () => '{"kind":"agent.workflow.design"}',
        readFileBytes: async () => new TextEncoder().encode('{"kind":"agent.workflow.design"}')},
      catalogScenarioId: 'CATALOG', loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG'
        ? modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]) : workflowSet(scenarioId)})
    try {
      expect(owner.loadDocument).toBeTypeOf('function')
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      expect(owner.designView.currentRow).toMatchObject({workflowId: 'agent.workflow.alpha', fileName: 'design.json', content: '{"kind":"agent.workflow.design"}'})
      expect(owner.designView.fieldAccess(owner.designView.currentRow!, 'content')).toMatchObject({read: 'visible', write: 'allowed'})
    } finally {owner.dispose()}
  })

  it('updates an existing design file through its page DataSet and confirms its exact bytes', async () => {
    let content = '{"kind":"agent.workflow.design","version":1}'
    const api = {
      listFiles: vi.fn(async () => [{name: 'agent.workflow.alpha', lastModified: 1}]),
      readTextFile: vi.fn(async () => content),
      readFileBytes: vi.fn(async () => new TextEncoder().encode(content)),
    }
    const fileUpload = {uploadWorkingText: vi.fn(async (command: {customPath: string; fileName: string; text: string}) => {
      content = command.text
      return {fileName: command.fileName, state: 'success'}
    })}
    const ownerInput = {applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}), api, fileUpload,
      catalogScenarioId: 'CATALOG', loadScenario: async ({scenarioId}: {scenarioId: string}) => scenarioId === 'CATALOG'
        ? modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]) : workflowSet(scenarioId)}
    const owner = await createAgentWorkflowFileDataViewOwner(ownerInput)
    try {
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      const row = owner.designView.currentRow!
      const id = owner.designView.getPkKey(row)!
      expect(owner.designView.fieldAccess(row, 'workflowId')).toMatchObject({write: 'denied'})
      expect(owner.designView.fieldAccess(row, 'fileName')).toMatchObject({write: 'denied'})
      expect(owner.designView.fieldAccess(row, 'content')).toMatchObject({read: 'visible', write: 'allowed'})
      owner.designView.updateEditingValue(id, 'content', '{"kind":"agent.workflow.design","version":2}')

      const saved = await owner.dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'design', ids: [id]}]})

      expect(saved.success).toBe(true)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledWith({customPath: 'APP/workflow-designs/agent.workflow.alpha',
        fileName: 'design.json', text: '{"kind":"agent.workflow.design","version":2}'})
      expect(api.readFileBytes).toHaveBeenCalledOnce()
      expect(content).toBe('{"kind":"agent.workflow.design","version":2}')
      expect(owner.designView.dirtyTracking.hasPendingChanges(id)).toBe(false)
    } finally {owner.dispose()}
  })

  it('cancels a dirty design row through its DataView baseline and keeps switching views independent', async () => {
    const files = new Map([
      ['design.json', '{"kind":"agent.workflow.design","version":1}'],
      ['definition.json', '{"kind":"agent.workflow","version":1}'],
    ])
    const fileUpload = {uploadWorkingText: vi.fn(async (command: {fileName: string; text: string}) => {
      files.set(command.fileName, command.text)
      return {fileName: command.fileName, state: 'success' as const}
    })}
    const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [{name: 'agent.workflow.alpha', lastModified: 1}], readTextFile: async input => files.get(input.fileName) ?? '',
        readFileBytes: async input => new TextEncoder().encode(files.get(input.fileName) ?? '')}, fileUpload,
      catalogScenarioId: 'CATALOG', loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG'
        ? modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]) : workflowSet(scenarioId)})
    try {
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      const designId = owner.designView.getPkKey(owner.designView.currentRow!)!
      owner.designView.updateEditingValue(designId, 'content', '{"kind":"agent.workflow.design","version":2}')
      expect(owner.designView.hasEditingChanges()).toBe(true)
      owner.designView.discardPendingChanges([designId])
      expect(owner.designView.hasEditingChanges()).toBe(false)
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      expect(owner.designView.currentRow?.['content']).toBe(files.get('design.json'))

      await owner.loadDocument('agent.workflow.alpha', 'definition.json')
      expect(owner.definitionView.currentRow).toMatchObject({fileName: 'definition.json', content: files.get('definition.json')})
      expect(owner.designView.currentRow?.['content']).toBe(files.get('design.json'))
      expect(fileUpload.uploadWorkingText).not.toHaveBeenCalled()
    } finally {owner.dispose()}
  })

  it('submits a definition-only edit through the definition DataView row', async () => {
    const files = new Map([
      ['design.json', '{"kind":"agent.workflow.design","version":1}'],
      ['definition.json', '{"kind":"agent.workflow","version":1}'],
    ])
    const fileUpload = {uploadWorkingText: vi.fn(async (command: {fileName: string; text: string}) => {
      files.set(command.fileName, command.text)
      return {fileName: command.fileName, state: 'success' as const}
    })}
    const owner = await createAgentWorkflowFileDataViewOwner({applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}),
      api: {listFiles: async () => [{name: 'agent.workflow.alpha', lastModified: 1}], readTextFile: async input => files.get(input.fileName) ?? '',
        readFileBytes: async input => new TextEncoder().encode(files.get(input.fileName) ?? '')}, fileUpload,
      catalogScenarioId: 'CATALOG', loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG'
        ? modelSet('CATALOG', [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]) : workflowSet(scenarioId)})
    try {
      await owner.loadDocument('agent.workflow.alpha', 'design.json')
      await owner.loadDocument('agent.workflow.alpha', 'definition.json')
      const definitionId = owner.definitionView.getPkKey(owner.definitionView.currentRow!)!
      owner.definitionView.updateEditingValue(definitionId, 'content', '{"kind":"agent.workflow","version":2}')
      const saved = await owner.dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'definition', ids: [definitionId]}]})
      expect(saved.success).toBe(true)
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledOnce()
      expect(fileUpload.uploadWorkingText).toHaveBeenCalledWith({customPath: 'APP/workflow-designs/agent.workflow.alpha',
        fileName: 'definition.json', text: '{"kind":"agent.workflow","version":2}'})
      expect(owner.designView.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(files.get('design.json')).toBe('{"kind":"agent.workflow.design","version":1}')
    } finally {owner.dispose()}
  })
})
