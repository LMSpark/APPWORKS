/**
 * @module app:lowcode/resources/repository/agent-workflow/publication
 * 职责：为缺失的 Agent 工作流 definition.json 提供非覆盖首发命令和原 attempt 核验。
 * 边界：已有 Definition 的更新仍由原文件 DataView 负责；本命令只消费已保存设计的精确快照。
 */
import type {BindCommandSubmitOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError, type LowcodeDesignApi, type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'
import {AGENT_WORKFLOW_SCENARIO} from './creation'

export const AGENT_WORKFLOW_PUBLICATION_TABLE = 'AgentWorkflowPublication'
export const AGENT_WORKFLOW_PUBLICATION_RESOURCE = 'agent-workflow-publication'

type Input = Readonly<{
  config: ScenarioViewConfig
  applicationId: string
  api: Pick<LowcodeDesignApi, 'readTextFile' | 'readFileBytes'>
  fileUpload: Pick<LowcodeDesignFileUpload, 'uploadTextVersion'>
  assertCurrent: () => void
}>
type Attempt = Readonly<{row: DataRow; customPath: string; designContent: string; definitionContent: string}>

function exactSegment(value: unknown): string {
  if (typeof value !== 'string' || value === '' || value !== value.trim() || value.length > 255
    || /[.\\/%\u0000-\u001f\u007f?#]/.test(value) || value === 'unknown') {
    throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 当前正式文件服务不支持此精确目录身份')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertDefinitionIdentity(designText: string, definitionText: string): void {
  let design: unknown, definition: unknown
  try {design = JSON.parse(designText)} catch (error) {throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 已保存设计不是有效 JSON', {cause: error})}
  try {definition = JSON.parse(definitionText)} catch (error) {throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 派生 Definition 不是有效 JSON', {cause: error})}
  if (!isRecord(design) || !isRecord(design['workflow']) || typeof design['id'] !== 'string'
    || typeof design['workflow']['id'] !== 'string' || !isRecord(definition) || definition['kind'] !== 'agent.workflow'
    || definition['version'] !== 1 || definition['workflowId'] !== design['workflow']['id'] || !isRecord(definition['source'])
    || definition['source']['designId'] !== design['id'] || definition['source']['designVersion'] !== design['version']
    || definition['source']['designKind'] !== design['kind']) {
    throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 设计和 Definition 的工作流身份不一致')
  }
}

function unknown(cause: unknown): Error {
  return Object.assign(new Error(`AGENT_WORKFLOW_PUBLICATION_UNKNOWN: 首次发布结果尚未确认（${cause instanceof Error ? cause.message : String(cause)}）`, {cause}),
    {agentWorkflowPublicationMayHaveApplied: true})
}

function isUnknown(error: unknown): boolean {
  return error instanceof Error && 'agentWorkflowPublicationMayHaveApplied' in error
    && error.agentWorkflowPublicationMayHaveApplied === true
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function commandOptions(view: DataView, input: Input): BindCommandSubmitOptions {
  const dataSet = view.dataSet, table = view.dataTable, applicationId = exactSegment(input.applicationId)
  const attempts = new Map<string, Attempt>()
  const declaration = JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection])
  const guard = () => {
    input.assertCurrent()
    if (!dataSet || !table || dataSet.destroyed || view.destroyed || dataSet.scenarioId !== input.config.scenarioId
      || dataSet.getTable(table.tableName) !== table || table.getView(view.viewId) !== view
      || table.tableName !== AGENT_WORKFLOW_PUBLICATION_TABLE || view.viewId !== 'default'
      || JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection]) !== declaration
      || table.resourceType !== 'command' || table.resourceId !== AGENT_WORKFLOW_PUBLICATION_RESOURCE
      || table.modelBinding !== undefined || view.primaryKey !== 'commandId') {
      throw new Error('AGENT_WORKFLOW_PUBLICATION_BINDING: 原命令实例或声明已失效')
    }
    if (table.columns.filter(column => column.isPrimaryKey === true).length !== 1
      || !table.columns.some(column => column.isPrimaryKey === true && column.name === 'commandId')) {
      throw new Error('AGENT_WORKFLOW_PUBLICATION_BINDING: 原命令键不唯一')
    }
    for (const name of ['commandId', 'workflowId', 'designContent', 'definitionContent', 'status']) {
      const projected = view.fieldProjection.filter(field => field.viewField === name)
      if (view.fieldProjection.length > 0 && (projected.length !== 1 || projected[0]?.source !== 'resource'
        || projected[0].resourceField !== name || projected[0].output !== true || projected[0].primaryKey !== (name === 'commandId'))) {
        throw new Error('AGENT_WORKFLOW_PUBLICATION_BINDING: 原命令字段投影不符')
      }
      const columns = table.columns.filter(column => column.name === name)
      if (columns.length !== 1 || columns[0]?.type !== 'string' || columns[0].isComputed === true
        || columns[0].computeExpression !== undefined) throw new Error(`AGENT_WORKFLOW_PUBLICATION_BINDING: ${name} 字段不符`)
    }
  }
  const receipt = (attempt: Attempt): DataRow => ({...attempt.row, status: 'published'})
  const locator = (workflowId: string, fileName: 'design.json' | 'definition.json') => ({
    appType: 'designfile', customPath: `${applicationId}/workflow-designs/${workflowId}`, fileName,
  })
  const readDesign = async (attempt: Attempt): Promise<void> => {
    const text = await input.api.readTextFile(locator(String(attempt.row['workflowId']), 'design.json'))
    guard()
    if (text !== attempt.designContent) throw new Error('AGENT_WORKFLOW_PUBLICATION_CONFLICT: 已保存设计与发布捕获不同')
  }
  const assertDefinitionMissing = async (attempt: Attempt): Promise<void> => {
    try {await input.api.readTextFile(locator(String(attempt.row['workflowId']), 'definition.json'))}
    catch (error) {
      guard()
      if (error instanceof LowcodeApiError && error.code === 404) return
      throw error
    }
    guard()
    throw new Error('AGENT_WORKFLOW_PUBLICATION_CONFLICT: definition.json 已存在，拒绝覆盖')
  }

  guard()
  return {
    resource: {resourceType: 'command', resourceId: AGENT_WORKFLOW_PUBLICATION_RESOURCE},
    guard,
    inputFields: ['workflowId', 'designContent', 'definitionContent'],
    createKey: () => crypto.randomUUID(),
    allowAbandonUnconfirmed: false,
    submit: async row => {
      guard()
      const commandId = row['commandId'], workflowId = exactSegment(row['workflowId'])
      const designContent = row['designContent'], definitionContent = row['definitionContent']
      if (typeof commandId !== 'string' || !commandId || typeof designContent !== 'string' || typeof definitionContent !== 'string') {
        throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 缺少原命令键或发布内容')
      }
      if (attempts.has(commandId)) throw unknown(new Error('原命令已经派发，不能重传'))
      assertDefinitionIdentity(designContent, definitionContent)
      const original: DataRow = {commandId, workflowId, designContent, definitionContent}
      const current = view.getEditingRow(commandId)
      if (!current || ['commandId', 'workflowId', 'designContent', 'definitionContent'].some(field => current[field] !== original[field])) {
        throw new Error('AGENT_WORKFLOW_PUBLICATION_INPUT: 原命令输入已变化')
      }
      const attempt: Attempt = {row: original, customPath: `${applicationId}/workflow-designs/${workflowId}`, designContent, definitionContent}
      await readDesign(attempt)
      await assertDefinitionMissing(attempt)
      guard()
      attempts.set(commandId, attempt)
      try {
        await input.fileUpload.uploadTextVersion({customPath: attempt.customPath, fileName: 'definition.json', text: definitionContent})
        guard()
        const bytes = await input.api.readFileBytes(locator(workflowId, 'definition.json'))
        guard()
        if (!sameBytes(bytes, new TextEncoder().encode(definitionContent))) {
          throw new Error('definition.json 上传后字节回读不一致')
        }
        return receipt(attempt)
      } catch (error) {throw unknown(error)}
    },
    isUnconfirmed: isUnknown,
    verify: async row => {
      guard()
      const commandId = row['commandId'], attempt = typeof commandId === 'string' ? attempts.get(commandId) : undefined
      if (!attempt || ['commandId', 'workflowId', 'designContent', 'definitionContent'].some(field => row[field] !== attempt.row[field])) {
        throw new Error('AGENT_WORKFLOW_PUBLICATION_VERIFY: 缺少原发布 attempt')
      }
      await readDesign(attempt)
      const bytes = await input.api.readFileBytes(locator(String(attempt.row['workflowId']), 'definition.json'))
      guard()
      if (!sameBytes(bytes, new TextEncoder().encode(attempt.definitionContent))) {
        throw unknown(new Error('原 Definition 字节仍未确认'))
      }
      return receipt(attempt)
    },
  }
}

/** 仅正式工作流场景注册 Definition 首发命令；其他场景不增加命令资源。 */
export function createAgentWorkflowPublicationBindings(input: Input): Pick<LowcodeDataSpaceAssemblerInput, 'commandBindings'> {
  if (input.config.scenarioId !== AGENT_WORKFLOW_SCENARIO) return {}
  input.assertCurrent()
  return {commandBindings: {[AGENT_WORKFLOW_PUBLICATION_TABLE]: view => commandOptions(view, input)}}
}