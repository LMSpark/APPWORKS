import {vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {AGENT_WORKFLOW_DESIGN_TABLES} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-resource'
import type {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'
import {createLowcodeFileResourceExecutors} from '@/lowcode/resources/repository/file-resource-registry'

type RegisteredFileResourceInput = Parameters<typeof createLowcodeFileResourceExecutors>[0]
/** Test file API: only the reads the workflow resources use; other registry resources fail if touched. */
export type WorkflowFileTestApi = Pick<RegisteredFileResourceInput['api'], 'listFiles' | 'readTextFile' | 'readFileBytes'>

/** Scenario table declarations for the five design projection tables, as the data-space designer stores them. */
export function agentWorkflowDesignTables(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(AGENT_WORKFLOW_DESIGN_TABLES.map(table => [table.tableName, {
    resourceType: 'file', resourceId: table.resourceId, columns: table.columns.map(column => ({...column})),
    views: Object.fromEntries(Object.entries(table.views).map(([viewId, config]) => [viewId, structuredClone({...config})])),
  }]))
}

/** Binds registered file tables the way scenario assembly does, so owner tests exercise the production executors. */
export function bindRegisteredFileResources(dataSet: DataSet, input: Readonly<{api: WorkflowFileTestApi;
  fileUpload?: Pick<NonNullable<RegisteredFileResourceInput['fileUpload']>, 'uploadWorkingText'>; assertCurrent?: () => void}>): DataSet {
  const unexpected = () => Promise.reject(new Error('Unexpected file API call'))
  const executors = createLowcodeFileResourceExecutors({applicationId: 'APP', assertCurrent: input.assertCurrent ?? (() => undefined),
    api: {...input.api, listFileVersions: unexpected, removeFile: unexpected},
    ...(input.fileUpload ? {fileUpload: {uploadWorkingText: input.fileUpload.uploadWorkingText, uploadTextVersion: unexpected}} : {})})
  for (const table of Object.values(dataSet.tables)) {
    const executor = executors[table.tableName]
    if (table.resourceType !== 'file' || !executor || !table.resourceId) continue
    for (const view of table.viewList) view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId: table.resourceId}})
  }
  return dataSet
}

function catalogSet(): DataSet {
  const rows = [{rowid: 'SPACE-1', Name: 'Agent工作流文件资源'}]
  const dataSet = DataSet.fromJson({scenarioId: 'CATALOG', tables: {Base_DataSet: {
    modelBinding: {modelId: 'M', modelName: 'Base_DataSet'},
    columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}], views: {default: {}, catalog: {}},
  }}})
  dataSet.getView('Base_DataSet', 'catalog')?.bindQueryExecutor({executeQuery: async () => ({rows, total: rows.length, rowKey: row => row['rowid'],
    assertIdentity: () => undefined, fieldAccess: () => ({read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}),
    readFieldAccess: () => 'visible', addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
    createChildActionState: () => 'disabled', viewActionState: () => 'enabled'})})
  return dataSet
}

/** In-memory files of one workflow plus the owner dependencies that read and upload them. */
export function agentWorkflowOwnerInput(files: Map<string, string>, options: Readonly<{readback?: (text: string) => string}> = {}) {
  const fileUpload = {uploadWorkingText: vi.fn(async (command: {fileName: string; text: string}) => {
    files.set(command.fileName, command.text)
    return {fileName: command.fileName, state: 'success' as const}
  })}
  const api: WorkflowFileTestApi = {listFiles: async () => [{name: 'alpha', lastModified: 1}], readTextFile: async command => {
    const text = files.get(command.fileName)
    if (text === undefined) throw new Error(`missing ${command.fileName}`)
    return text
  }, readFileBytes: async command => new TextEncoder().encode((options.readback ?? (text => text))(files.get(command.fileName) ?? ''))}
  const input: NonNullable<Parameters<typeof createAgentWorkflowFileDataViewOwner>[0]> = {
    applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}), catalogScenarioId: 'CATALOG',
    loadScenario: async ({scenarioId}) => scenarioId === 'CATALOG' ? catalogSet() : bindRegisteredFileResources(DataSet.fromJson({scenarioId, tables: {
      AgentWorkflowFiles: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
        {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'},
        {name: 'timestamp', type: 'string'}, {name: 'content', type: 'string'}], views: {default: {}, directory: {}, design: {}, definition: {}}},
      ...agentWorkflowDesignTables(),
    }}), {api, fileUpload})}
  return {input, fileUpload}
}
