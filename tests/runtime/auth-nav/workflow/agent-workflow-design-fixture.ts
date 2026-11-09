import {vi} from 'vitest'
import {DataSet, bindDataSetCommandSubmit} from '@spark-appworks/spark-data'
import {AGENT_WORKFLOW_DESIGN_TABLES} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-resource'
import type {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'
import {createLowcodeFileResourceExecutors} from '@/lowcode/resources/repository/file-resource-registry'

import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import config from '../../../../config/pages/shared/agent-workflow-files/pagedata.json'
import {createAgentWorkflowCreationBindings, AGENT_WORKFLOW_CREATE_TABLE} from '@/lowcode/resources/repository/agent-workflow/creation'

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

function catalogSet(id = 'SPACE-1'): DataSet {
  const rows = [{rowid: id, Name: 'Agent工作流文件资源'}]
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
export function agentWorkflowOwnerInput(files: Map<string, string>, options: Readonly<{readback?: (text: string) => string; creation?: boolean; afterCreate?: () => void | Promise<void>; directoryError?: () => Error | undefined; readError?: (path: string) => Error | undefined}> = {}) {
  const key = (command: {fileName: string; customPath: string}) => {
    const id = command.customPath.split('/').at(-1)
    return id === 'alpha' ? command.fileName : `${id}/${command.fileName}`
  }
  const fileUpload = {uploadTextVersion: vi.fn(async (command: {customPath: string; fileName: string; text: string}) => {
    files.set(key(command), command.text); await options.afterCreate?.()
    return {fileName: command.fileName, state: 'success' as const}
  }), uploadWorkingText: vi.fn(async (command: {customPath: string; fileName: string; text: string}) => {
    files.set(key(command), command.text)
    return {fileName: command.fileName, state: 'success' as const}
  })}
  const api: WorkflowFileTestApi = {listFiles: async () => {
    const error = options.directoryError?.(); if (error) throw error
    return [...new Set(['alpha', ...[...files.keys()].filter(name => name.includes('/')).map(name => name.split('/')[0] ?? '')])].filter(Boolean).map(name => ({name, lastModified: 1}))
  }, readTextFile: async command => {
    const error = options.readError?.(command.customPath); if (error) throw error
    const text = files.get(key(command))
    if (text === undefined) throw new LowcodeApiError(404, `missing ${command.fileName}`)
    return text
  }, readFileBytes: async command => new TextEncoder().encode((options.readback ?? (text => text))(files.get(key(command)) ?? ''))}
  const input: NonNullable<Parameters<typeof createAgentWorkflowFileDataViewOwner>[0]> = {
    applicationId: 'APP', readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}}), catalogScenarioId: 'CATALOG',
    loadScenario: async ({scenarioId}) => {
      if (scenarioId === 'CATALOG') return catalogSet(options.creation ? config.scenarioId : undefined)
      const scenario = new ScenarioViewConfig(config.scenarioId, JSON.stringify(config))
      const ds = bindRegisteredFileResources(DataSet.fromJson(options.creation ? scenario.toJSON() : {scenarioId, tables: {
        AgentWorkflowFiles: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
          {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'fileName', type: 'string'},
          {name: 'timestamp', type: 'string'}, {name: 'content', type: 'string'}], views: {default: {}, directory: {}, design: {}, definition: {}}},
        ...agentWorkflowDesignTables(),
      }}), {api, fileUpload})
      if (options.creation) {
        const bindings = createAgentWorkflowCreationBindings({config: scenario, applicationId: 'APP', api, fileUpload, assertCurrent: () => undefined})
        const view = ds.getView(AGENT_WORKFLOW_CREATE_TABLE), factory = bindings.commandBindings?.[AGENT_WORKFLOW_CREATE_TABLE]
        if (!view || !factory) throw new Error('missing creation binding')
        bindDataSetCommandSubmit(view, factory(view))
      }
      return ds
    }}

  return {input, fileUpload}
}
