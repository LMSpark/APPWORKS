/**
 * @module app:lowcode/resources/repository/file-resource-registry
 * 职责：登记数据空间可选的文件资源表、视图、查询参数及其查询/保存执行器。
 * 边界：只汇总各文件资源的正式定义，执行逻辑留在各资源自己的模块。
 * AI用途：数据空间设计或装配需要列出、绑定文件资源时，用本模块定位唯一注册表。
 */
import {WORKFLOW_LAYOUT_TABLE,WORKFLOW_LAYOUT_RESOURCE_ID,WORKFLOW_LAYOUT_COLUMNS,WORKFLOW_LAYOUT_VIEWS,WORKFLOW_LAYOUT_QUERY_PARAMETERS,createWorkflowLayoutExecutor} from '../structured-config/workflow-definition/layout/layout-resource'
import {JSON_DOCUMENT_TABLE,JSON_DOCUMENT_RESOURCE_ID,JSON_DOCUMENT_COLUMNS,JSON_DOCUMENT_VIEWS,JSON_DOCUMENT_QUERY_PARAMETERS,createJsonDocumentExecutor} from '../semi-structured/json-data/document-resource'
import type {DataColumn, DataView} from '@spark-appworks/spark-data'
import type {LowcodeDesignApi, LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {PROJECT_TOOL_VERSION_COLUMNS, PROJECT_TOOL_VERSION_QUERY_PARAMETERS, PROJECT_TOOL_VERSION_RESOURCE_ID, PROJECT_TOOL_VERSION_TABLE,
  PROJECT_TOOL_VERSION_VIEWS, ProjectToolVersionResource} from './project-tool-version-resource'
import {AGENT_WORKFLOW_DATA_SPACE_NAME, AGENT_WORKFLOW_FILE_COLUMNS, AGENT_WORKFLOW_FILE_RESOURCE_ID, AGENT_WORKFLOW_FILE_TABLE,
  AGENT_WORKFLOW_FILE_VIEWS, AGENT_WORKFLOW_FILE_QUERY_PARAMETERS, AgentWorkflowFileResource} from './agent-workflow/agent-workflow-file-resource'
import {AGENT_WORKFLOW_DESIGN_RESOURCE_ID, AGENT_WORKFLOW_DESIGN_TABLES, AgentWorkflowDesignResource} from './agent-workflow/agent-workflow-design-resource'
import {FILE_DATA_COLUMNS, FILE_DATA_QUERY_PARAMETERS, FILE_DATA_RESOURCE_ID, FILE_DATA_TABLE, FILE_DATA_VIEWS, FileDataResource} from '../semi-structured/file-data/file-data-resource'

/** 文件资源执行器使用的设计文件读取接口。 */
type LowcodeFileResourceApi = Pick<LowcodeDesignApi, 'listFiles' | 'readTextFile' | 'readFileBytes' | 'listFileVersions' | 'removeFile'>
/** 一次装配传给全部文件执行器的应用身份、文件接口和会话校验。 */
type LowcodeFileResourceInput = Readonly<{
  /** 当前应用 ID，决定文件目录。 */
  applicationId: string
  /** 设计文件读取接口。 */
  api: LowcodeFileResourceApi
  /** 正式文件上传适配器；缺省时保存显式失败。 */
  fileUpload?: Pick<LowcodeDesignFileUpload,'uploadWorkingText'|'uploadTextVersion'|'uploadBinaryVersion'|'verifyBinaryVersion'>
  /** 应用或会话已切换时抛错。 */
  assertCurrent: () => void
}>

/** 数据空间可选的一张文件资源表：表结构、视图、查询参数和执行器工厂。 */
export type LowcodeFileResourceDefinition = Readonly<{
  /** 数据空间里的表名。 */
  tableName: string
  /** 表的文件资源身份；一次保存里不同表不能共用。 */
  resourceId: string
  /** 设计页显示的资源名称。 */
  label: string
  /** 表字段。 */
  columns: readonly DataColumn[]
  /** 命名视图及其默认配置。 */
  views: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  /** 各视图的查询参数声明。 */
  queryParameters: Readonly<Record<string, ReadonlyArray<Readonly<{name: string; type: string; label?: string; required?: boolean}>>>>
  /** 同组表在一次装配中共用执行器。 */
  executorGroup?: string
  /** 为一次装配创建该表的查询/保存执行器。 */
  createExecutor(input: LowcodeFileResourceInput): Parameters<DataView['bindQueryExecutor']>[0]
}>

function missingUpload(code: string): Pick<LowcodeDesignFileUpload, 'uploadWorkingText'> {
  return {uploadWorkingText: () => Promise.reject(new Error(`${code}: 未注入正式文件上传适配器`))}
}

function missingBinaryUpload(): Pick<LowcodeDesignFileUpload, 'uploadBinaryVersion' | 'verifyBinaryVersion'> {
  const reject = () => Promise.reject(new Error('FILE_DATA_SAVE_OWNER: 未注入正式文件上传适配器'))
  return {uploadBinaryVersion: reject, verifyBinaryVersion: reject}
}

function agentWorkflowDesignExecutor(input: LowcodeFileResourceInput): AgentWorkflowDesignResource {
  return new AgentWorkflowDesignResource({applicationId: input.applicationId, api: input.api,
    fileUpload: input.fileUpload ?? missingUpload('AGENT_WORKFLOW_DESIGN_SAVE_OWNER'), assertCurrent: input.assertCurrent})
}

/** 绑定到文件资源视图的查询/保存执行器。 */
type LowcodeFileResourceExecutor = ReturnType<LowcodeFileResourceDefinition['createExecutor']>

/** 一次装配的全部文件执行器；同一 executorGroup 的表共用一个实例，DataSet 保存时才合成同一批变更。 */
export function createLowcodeFileResourceExecutors(input: LowcodeFileResourceInput): Record<string, LowcodeFileResourceExecutor> {
  const groups = new Map<string, LowcodeFileResourceExecutor>()
  return Object.fromEntries(LOWCODE_FILE_RESOURCE_REGISTRY.map(definition => {
    if (definition.executorGroup === undefined) return [definition.tableName, definition.createExecutor(input)]
    const shared = groups.get(definition.executorGroup) ?? definition.createExecutor(input)
    groups.set(definition.executorGroup, shared)
    return [definition.tableName, shared]
  }))
}

/** Only file resources with a concrete query executor are offered by the data-space designer. */
export const LOWCODE_FILE_RESOURCE_REGISTRY: readonly LowcodeFileResourceDefinition[] = Object.freeze([
  Object.freeze({tableName:JSON_DOCUMENT_TABLE,resourceId:JSON_DOCUMENT_RESOURCE_ID,label:'JSON文档原文件',columns:JSON_DOCUMENT_COLUMNS,
    views:JSON_DOCUMENT_VIEWS,queryParameters:JSON_DOCUMENT_QUERY_PARAMETERS,
    createExecutor:(input:LowcodeFileResourceInput)=>createJsonDocumentExecutor({api:input.api,assertCurrent:input.assertCurrent,
      fileUpload:input.fileUpload??{uploadWorkingText:()=>Promise.reject(new Error('JSON_DOCUMENT_SAVE_OWNER: 未注入文件上传适配器')),uploadTextVersion:()=>Promise.reject(new Error('JSON_DOCUMENT_SAVE_OWNER: 未注入文件上传适配器'))}}),
  }),
  Object.freeze({
    tableName:WORKFLOW_LAYOUT_TABLE,resourceId:WORKFLOW_LAYOUT_RESOURCE_ID,label:'数据工作流布局',columns:WORKFLOW_LAYOUT_COLUMNS,
    views:WORKFLOW_LAYOUT_VIEWS,queryParameters:WORKFLOW_LAYOUT_QUERY_PARAMETERS,
    createExecutor:(input:LowcodeFileResourceInput)=>createWorkflowLayoutExecutor({api:input.api,assertCurrent:input.assertCurrent,fileUpload:input.fileUpload??{uploadWorkingText:()=>Promise.reject(new Error('WORKFLOW_LAYOUT_SAVE_OWNER: 未注入文件上传适配器'))}}),
  }),
  Object.freeze({
    tableName: AGENT_WORKFLOW_FILE_TABLE,
    resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID,
    label: AGENT_WORKFLOW_DATA_SPACE_NAME,
    columns: AGENT_WORKFLOW_FILE_COLUMNS,
    views: AGENT_WORKFLOW_FILE_VIEWS,
    queryParameters: AGENT_WORKFLOW_FILE_QUERY_PARAMETERS,
    createExecutor: (input: LowcodeFileResourceInput) =>
      new AgentWorkflowFileResource({...input, fileUpload: input.fileUpload ?? missingUpload('AGENT_WORKFLOW_FILE_SAVE_OWNER')}),
  }),
  ...AGENT_WORKFLOW_DESIGN_TABLES.map(table => Object.freeze({
    tableName: table.tableName,
    resourceId: table.resourceId,
    label: table.label,
    columns: table.columns,
    views: table.views,
    queryParameters: table.queryParameters,
    executorGroup: AGENT_WORKFLOW_DESIGN_RESOURCE_ID,
    createExecutor: agentWorkflowDesignExecutor,
  })),
  Object.freeze({
    tableName: PROJECT_TOOL_VERSION_TABLE,
    resourceId: PROJECT_TOOL_VERSION_RESOURCE_ID,
    label: '工具文件版本目录',
    columns: PROJECT_TOOL_VERSION_COLUMNS,
    views: PROJECT_TOOL_VERSION_VIEWS,
    queryParameters: PROJECT_TOOL_VERSION_QUERY_PARAMETERS,
    createExecutor: (input: LowcodeFileResourceInput) =>
      new ProjectToolVersionResource({applicationId: input.applicationId, api: input.api, assertCurrent: input.assertCurrent}),
  }),
  Object.freeze({
    tableName: FILE_DATA_TABLE,
    resourceId: FILE_DATA_RESOURCE_ID,
    label: '数据文件',
    columns: FILE_DATA_COLUMNS,
    views: FILE_DATA_VIEWS,
    queryParameters: FILE_DATA_QUERY_PARAMETERS,
    createExecutor: (input: LowcodeFileResourceInput) =>
      new FileDataResource({api: input.api, fileUpload: input.fileUpload ?? missingBinaryUpload(), assertCurrent: input.assertCurrent}),
  }),
])
