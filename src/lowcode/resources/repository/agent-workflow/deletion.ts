/**
 * @module app:lowcode/resources/repository/agent-workflow/deletion
 * 职责：整工作流资产删除命令——先列目录、再删 definition.json、再删 design.json，逐步回列确认。
 * 边界：无目录删除 API；未知删除结果保留原命令核验，不自动重放。
 */
import type {BindCommandSubmitOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError, type LowcodeDesignApi, type LowcodeFileEntry} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'
import {AGENT_WORKFLOW_SCENARIO} from './creation'
import {agentWorkflowDirectory, agentWorkflowId} from './agent-workflow-file-resource'

export const AGENT_WORKFLOW_DELETION_TABLE = 'AgentWorkflowDeletion'
export const AGENT_WORKFLOW_DELETION_RESOURCE = 'agent-workflow-deletion'

type Input = Readonly<{
  config: ScenarioViewConfig
  applicationId: string
  api: Pick<LowcodeDesignApi, 'listFiles' | 'removeFile' | 'readTextFile'>
  assertCurrent: () => void
}>

type Attempt = Readonly<{row: DataRow; customPath: string; steps: readonly ('definition' | 'design')[]}>

function uncertain(cause: unknown): Error {
  return Object.assign(new Error(`AGENT_WORKFLOW_DELETION_UNKNOWN: 删除结果尚未确认（${cause instanceof Error ? cause.message : String(cause)}）`, {cause}),
    {agentWorkflowDeletionMayHaveApplied: true})
}

function isUncertain(error: unknown): boolean {
  return error instanceof Error && 'agentWorkflowDeletionMayHaveApplied' in error
    && error.agentWorkflowDeletionMayHaveApplied === true
}

function workflowStillListed(entries: readonly LowcodeFileEntry[], workflowId: string): boolean {
  return entries.some(entry => entry.name === workflowId)
}

function commandOptions(view: DataView, input: Input): BindCommandSubmitOptions {
  const dataSet = view.dataSet, table = view.dataTable, folder = agentWorkflowDirectory(input.applicationId)
  const attempts = new Map<string, Attempt>()
  const declaration = JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection])
  const guard = () => {
    input.assertCurrent()
    if (!dataSet || !table || dataSet.destroyed || view.destroyed || dataSet.scenarioId !== input.config.scenarioId
      || dataSet.getTable(table.tableName) !== table || table.getView(view.viewId) !== view
      || table.tableName !== AGENT_WORKFLOW_DELETION_TABLE || view.viewId !== 'default'
      || JSON.stringify([view.queryConfig, view.queryContext, view.fieldProjection]) !== declaration
      || table.resourceType !== 'command' || table.resourceId !== AGENT_WORKFLOW_DELETION_RESOURCE
      || table.modelBinding !== undefined || view.primaryKey !== 'commandId') {
      throw new Error('AGENT_WORKFLOW_DELETION_BINDING: 原命令实例或声明已失效')
    }
  }
  const receipt = (attempt: Attempt): DataRow => ({...attempt.row, status: 'deleted'})
  const locator = (workflowId: string, fileName: 'design.json' | 'definition.json') => ({
    appType: 'designfile' as const, customPath: `${folder}/${workflowId}`, fileName,
  })
  const listDirectory = async (): Promise<readonly LowcodeFileEntry[]> => {
    const entries = await input.api.listFiles({appType: 'designfile', folderPath: folder})
    guard()
    return entries
  }
  const assertListed = async (workflowId: string): Promise<void> => {
    const entries = await listDirectory()
    if (!workflowStillListed(entries, workflowId)) throw new Error('AGENT_WORKFLOW_DELETION_NOT_FOUND: 目录中不存在该工作流')
  }
  const assertNotListed = async (workflowId: string): Promise<void> => {
    const entries = await listDirectory()
    if (workflowStillListed(entries, workflowId)) throw new Error('AGENT_WORKFLOW_DELETION_VERIFY: 工作流目录项仍在')
  }
  guard()
  return {
    resource: {resourceType: 'command', resourceId: AGENT_WORKFLOW_DELETION_RESOURCE},
    guard,
    inputFields: ['workflowId'],
    createKey: () => crypto.randomUUID(),
    allowAbandonUnconfirmed: false,
    retainConfirmedOnRefresh: true,
    submit: async row => {
      guard()
      const commandId = row['commandId'], workflowId = agentWorkflowId(row['workflowId'])
      if (typeof commandId !== 'string' || !commandId) throw new Error('AGENT_WORKFLOW_DELETION_INPUT: 缺少原命令键')
      if (attempts.has(commandId)) throw uncertain(new Error('原删除命令已经派发，不能重传'))
      const original: DataRow = {commandId, workflowId: row['workflowId']}
      await assertListed(workflowId)
      const attempt: Attempt = {row: original, customPath: `${folder}/${workflowId}`, steps: []}
      const steps: Attempt['steps'][number][] = []
      for (const fileName of ['definition.json', 'design.json'] as const) {
        guard()
        try {
          await input.api.readTextFile(locator(workflowId, fileName))
        } catch (error) {
          guard()
          if (error instanceof LowcodeApiError && error.code === 404) continue
          throw error
        }
        steps.push(fileName === 'definition.json' ? 'definition' : 'design')
        try {
          await input.api.removeFile(locator(workflowId, fileName))
        } catch (error) {
          throw uncertain(error)
        }
        guard()
      }
      if (steps.length === 0) throw new Error('AGENT_WORKFLOW_DELETION_NOT_FOUND: 没有可删除的设计或定义文件')
      attempts.set(commandId, {...attempt, steps})
      guard()
      await assertNotListed(workflowId)
      return receipt({...attempt, steps})
    },
    isUnconfirmed: isUncertain,
    verify: async row => {
      guard()
      const id = row['commandId'], attempt = typeof id === 'string' ? attempts.get(id) : undefined
      if (!attempt || attempt.row['workflowId'] !== row['workflowId']) throw new Error('AGENT_WORKFLOW_DELETION_VERIFY: 缺少原派发身份')
      const workflowId = agentWorkflowId(row['workflowId'])
      await assertNotListed(workflowId)
      for (const step of attempt.steps) {
        const fileName = step === 'definition' ? 'definition.json' : 'design.json'
        try {
          await input.api.readTextFile(locator(workflowId, fileName))
          guard()
          throw new Error('AGENT_WORKFLOW_DELETION_VERIFY: 文件仍存在')
        } catch (error) {
          guard()
          if (error instanceof LowcodeApiError && error.code === 404) continue
          if (error instanceof Error && error.message.startsWith('AGENT_WORKFLOW_DELETION_VERIFY')) throw error
          throw error
        }
      }
      return receipt(attempt)
    },
  }
}

export function createAgentWorkflowDeletionBindings(input: Input): Pick<LowcodeDataSpaceAssemblerInput, 'commandBindings'> {
  if (input.config.scenarioId !== AGENT_WORKFLOW_SCENARIO) return {}
  input.assertCurrent()
  return {commandBindings: {[AGENT_WORKFLOW_DELETION_TABLE]: view => commandOptions(view, input)}}
}