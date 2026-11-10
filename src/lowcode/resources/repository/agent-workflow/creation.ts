/**
 * @module app:lowcode/resources/repository/agent-workflow/creation
 * 职责：为正式场景声明的创建首稿命令提供一次提交及原目标未知核验。
 * 边界：不覆盖已有design或definition；派发后只读核验，不删除旁名、不保证服务原子创建。
 */
import type {BindCommandSubmitOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError, type LowcodeDesignApi, type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'
import {createAgentWorkflowScaffold} from './creation-scaffold'
import {agentWorkflowDirectory, agentWorkflowId} from './agent-workflow-file-resource'

export const AGENT_WORKFLOW_CREATE_TABLE = 'AgentWorkflowCreation'
export const AGENT_WORKFLOW_CREATE_RESOURCE = 'agent-workflow-create'
export const AGENT_WORKFLOW_SCENARIO = '01000B6C7F84B4F1A85C91C4FC28E875'
/** 既有正式文件SDK与本次应用作用域；不增加HTTP协议。 */
type Input = Readonly<{config: ScenarioViewConfig; applicationId: string;
  api: Pick<LowcodeDesignApi, 'readTextFile' | 'readFileBytes'>;
  fileUpload: Pick<LowcodeDesignFileUpload, 'uploadTextVersion'>; assertCurrent: () => void}>
type Attempt = {row: DataRow; text: string; customPath: string}

function uncertain(cause: unknown): Error {
  return Object.assign(new Error(`AGENT_WORKFLOW_CREATE_UNKNOWN: 首稿结果尚未确认（${cause instanceof Error ? cause.message : String(cause)}）`, {cause}), {workflowCreateMayHaveApplied: true})
}
function isUncertain(error: unknown): boolean {return error instanceof Error && 'workflowCreateMayHaveApplied' in error && error.workflowCreateMayHaveApplied === true}

function options(view: DataView, input: Input): BindCommandSubmitOptions {
  const ds = view.dataSet, table = view.dataTable, directory = agentWorkflowDirectory(input.applicationId)
  const attempts = new Map<string, Attempt>()
  const declaration = JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection])
  const guard = () => {
    input.assertCurrent()
    if (!ds || !table || ds.destroyed || view.destroyed || ds.scenarioId !== input.config.scenarioId || ds.getTable(table.tableName) !== table
      || table.getView(view.viewId) !== view || table.tableName !== AGENT_WORKFLOW_CREATE_TABLE || view.viewId !== 'default'
      || JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection]) !== declaration
      || table.resourceType !== 'command' || table.resourceId !== AGENT_WORKFLOW_CREATE_RESOURCE || table.modelBinding !== undefined || view.primaryKey !== 'commandId') {
      throw new Error('AGENT_WORKFLOW_CREATE_BINDING: 原命令实例或声明已失效')
    }
    if (table.columns.filter(column => column.isPrimaryKey === true).length !== 1 || !table.columns.some(column => column.isPrimaryKey === true && column.name === 'commandId')) throw new Error('AGENT_WORKFLOW_CREATE_BINDING: 原命令键不唯一')
    for (const name of ['commandId', 'workflowId', 'title', 'status']) {
      const projected = view.fieldProjection.filter(field => field.viewField === name)
      if (view.fieldProjection.length > 0 && (projected.length !== 1 || projected[0]?.source !== 'resource'
        || projected[0].resourceField !== name || projected[0].type !== 'string' || projected[0].output !== true
        || projected[0].primaryKey !== (name === 'commandId'))) throw new Error('AGENT_WORKFLOW_CREATE_BINDING: 原命令字段投影不符')
      const column = table.columns.filter(field => field.name === name)
      if (column.length !== 1 || column[0]?.type !== 'string' || column[0].isComputed === true || column[0].computeExpression !== undefined) throw new Error('AGENT_WORKFLOW_CREATE_BINDING: 原命令字段不符')
    }
  }
  const receipt = (attempt: Attempt): DataRow => ({...attempt.row, status: 'created'})
  guard()
  return {resource: {resourceType: 'command', resourceId: AGENT_WORKFLOW_CREATE_RESOURCE}, guard,
    inputFields: ['workflowId', 'title'], createKey: () => crypto.randomUUID(), allowAbandonUnconfirmed: false, retainConfirmedOnRefresh: true,
    submit: async row => {
      guard()
      const commandId = row['commandId'], workflowId = agentWorkflowId(row['workflowId']), title = row['title'] === undefined ? '' : row['title']
      if (typeof commandId !== 'string' || !commandId || typeof title !== 'string') throw new Error('AGENT_WORKFLOW_CREATE_INPUT: 缺少原命令键或标题')
      if (attempts.has(commandId)) throw uncertain(new Error('原命令已经派发，不能重传'))
      const original: DataRow = {commandId, workflowId, title: row['title']}, text = createAgentWorkflowScaffold({commandId, workflowId, title})
      const attempt: Attempt = {row: original, text, customPath: `${directory}/${workflowId}`}
      const assertInput = () => {
        guard()
        const current = view.getEditingRow(commandId)
        if (!current || ['commandId', 'workflowId', 'title'].some(field => current[field] !== original[field])) throw new Error('AGENT_WORKFLOW_CREATE_INPUT: 原创建输入已变化')
      }
      for (const fileName of ['design.json', 'definition.json']) {
        assertInput()
        try {await input.api.readTextFile({appType: 'designfile', customPath: attempt.customPath, fileName})}
        catch (error) {guard(); if (error instanceof LowcodeApiError && error.code === 404) continue; throw error}
        assertInput(); throw new Error('AGENT_WORKFLOW_CREATE_CONFLICT: 工作流设计或发布定义已存在')
      }
      assertInput(); attempts.set(commandId, attempt)
      try {
        await input.fileUpload.uploadTextVersion({customPath: attempt.customPath, fileName: 'design.json', text})
        guard()
        return receipt(attempt)
      } catch (error) {throw uncertain(error)}
    },
    isUnconfirmed: isUncertain,
    verify: async row => {
      guard()
      const id = row['commandId'], attempt = typeof id === 'string' ? attempts.get(id) : undefined
      if (!attempt || ['commandId', 'workflowId', 'title'].some(field => row[field] !== attempt.row[field])) throw new Error('AGENT_WORKFLOW_CREATE_VERIFY: 缺少原派发身份')
      const bytes = await input.api.readFileBytes({appType: 'designfile', customPath: attempt.customPath, fileName: 'design.json'})
      guard()
      const expected = new TextEncoder().encode(attempt.text)
      if (bytes.length !== expected.length || bytes.some((byte, index) => byte !== expected[index])) throw new Error('AGENT_WORKFLOW_CREATE_VERIFY: 原命令字节未确认，保留未知')
      return receipt(attempt)
    },
  }
}

/** 只有精确工作流文件场景提供创建命令；不匹配不覆盖其他场景工厂。 */
export function createAgentWorkflowCreationBindings(input: Input): Pick<LowcodeDataSpaceAssemblerInput, 'commandBindings'> {
  if (input.config.scenarioId !== AGENT_WORKFLOW_SCENARIO) return {}
  input.assertCurrent()
  return {commandBindings: {[AGENT_WORKFLOW_CREATE_TABLE]: view => options(view, input)}}
}
