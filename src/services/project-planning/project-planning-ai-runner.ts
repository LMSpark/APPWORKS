/**
 * @module app:services/project-planning-ai-runner
 * 职责：提供应用层 projectPlanning 的 project-planning-ai-runner 能力，围绕 ProjectPlanningAiRunOptions、ProjectPlanningAiRunEvents、ProjectPlanningAiRunCommand 等 4 个公开契约编排项目需求、蓝图规划和 AI 业务注册。
 * 边界：只停留在项目规划阶段，不生成页面 rule/pagedata/script/template，也不越界进入 pageDesign。
 * AI用途：规划模块/页面概要或排查项目策划 Agent 时，用本模块理解 services/project-planning-ai-runner。
 */
/**
 * projectPlanning inline AI runner — 与 DevSystem 共享正式 DataView owner。
 *
 * 统一入口：`runProjectPlanningAiSession` → `AiAgentHost.run('projectPlanning', input)`。
 * 调用方注入 `ProjectWorkspace` 与 Base_NavigationInfo DataView owner。
 */
import { createAiRunAdapter, noopTraceSink } from '@spark-appworks/spark-app'
import type {
  AiRunAbortHandler,
  AiRunAdapterState,
  AiRunBeforeFunctionCall,
  AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type { AiAgentHost, AiAgentToolCallRecord } from '@spark-appworks/spark-ai/agent'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import type { ProjectBlueprint, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import {
  buildProjectPlanningAgentInput,
  PROJECT_PLANNING_MODULE_ID,
  synchronizeProjectPlanningTreeFromDataView,
  type ProjectPlanningAgentInput,
  type ResolveScopedProjectPlanningRunInputOptions,
} from '@/services/project-planning/project-planning-agent-workflow-binding'
import { activateProjectPlanningAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import { createAiDeliveryFailureError } from '@/services/ai/ai-delivery-port'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import { createProjectPlanningInlineDeliveryPort } from '@/services/project-planning/project-planning-inline-delivery'

/** Project Planning Ai Run Options 的调用配置。 */
export type ProjectPlanningAiRunOptions = ResolveScopedProjectPlanningRunInputOptions & Readonly<{
  /** inline 宿主显式启用后在 run 结束时保存蓝图；默认 false。 */
  saveBlueprintAfterRun?: boolean
  /** DevSystem inline only: the live, already loaded PageRuntime DataView owner. */
  blueprintDataView?: BlueprintWorkspaceDataView
}>

/** Project Planning Ai Run Events 的语义模型。 */
export type ProjectPlanningAiRunEvents = Readonly<{
  /** tool call 发生时的回调。 */
  onToolCall?: (record: AiAgentToolCallRecord) => void
}>

/** Project Planning Ai Run Command 的命令参数。 */
export type ProjectPlanningAiRunCommand = ProjectPlanningAiRunOptions & Readonly<{
  /** 项目工作区编辑器实例。 */
  editor: ProjectWorkspace
  /** 测试或编排层可注入 Host；省略时每次运行新建独立 Host。 */
  host?: AiAgentHost
  /** 运行期事件回调集合。 */
  events?: ProjectPlanningAiRunEvents
  /** trace 输出 sink。 */
  trace?: AiRunTraceSink
  /** AI run 适配器状态（跨轮次复用）。 */
  adapter?: AiRunAdapterState
  /** tool call 前置拦截钩子。 */
  beforeFunctionCall?: AiRunBeforeFunctionCall
  /** 运行被中止时的回调。 */
  onAbort?: AiRunAbortHandler
  /** 默认使用 requirement 作为 user turn 文本。 */
  userMessage?: string
}>

/** Project Planning Ai Run Result 的返回结果。 */
export type ProjectPlanningAiRunResult = Readonly<{
  /** 本次运行是否观察到至少一次 tool call。 */
  sawToolCall: boolean
  /** 注入 Agent 的完整输入契约。 */
  input: ProjectPlanningAgentInput
  /** 运行结束后项目蓝图是否有未保存变更。 */
  blueprintDirty: boolean
  /** 是否已成功保存项目蓝图变更。 */
  savedBlueprint: boolean
}>

export async function runProjectPlanningAiSession(
  command: ProjectPlanningAiRunCommand,
): Promise<ProjectPlanningAiRunResult> {
  const editor = command.editor
  const dataViewOwner = command.blueprintDataView
  const projectId = editor.project.projectId.trim()
  if (projectId.length === 0) {
    throw new Error('projectPlanning AI requires a projectId on editor.project.')
  }

  // 每次运行独立 Host：全局 Host 的 ensure 幂等会保留首次 editor 闭包，切换项目后失配。
  const aiAgentHost = command.host ?? createAiAgentHost({ turnCallbacks: createAiAgentTurnCallbacks(), maxToolRounds: 16 })

  if (dataViewOwner) synchronizeProjectPlanningTreeFromDataView(editor.project, dataViewOwner)
  const input = buildProjectPlanningAgentInput(editor.project, command)
  let dataViewBlueprintSaved: boolean | undefined
  let dataViewCompletionSnapshot: Readonly<{
    projectId: string
    result: ReturnType<ProjectBlueprint['completeProjectPlanning']>
  }> | undefined
  let dataViewCommandStarted = false
  let dataViewRepeatedWriteRejected = false
  const projectPlanningHost = await activateProjectPlanningAgentWorkflow({
    host: aiAgentHost,
    getProjectPlanningEditor: (context) => {
      if (context.moduleInstanceId !== projectId) {
        throw new Error(
          `projectPlanning editor mismatch: expected "${projectId}", got "${context.moduleInstanceId}".`,
        )
      }
      return editor
    },
    ...(dataViewOwner === undefined ? {} : { blueprintDataView: dataViewOwner }),
    getDataViewCompletionResult: (completionProjectId) => dataViewCompletionSnapshot?.projectId === completionProjectId
      ? dataViewCompletionSnapshot.result
      : undefined,
    onDataViewCompletionConfirmed: (completionProjectId, result) => {
      if (completionProjectId !== projectId) throw new Error('项目策划 DataView completion snapshot 项目身份不匹配')
      dataViewCompletionSnapshot = { projectId: completionProjectId, result }
      dataViewBlueprintSaved = true
    },
    tryBeginDataViewBlueprintWrite: (writeProjectId) => {
      if (writeProjectId !== projectId) throw new Error('项目策划 DataView 写入命令项目身份不匹配')
      if (dataViewCommandStarted) return false
      dataViewCommandStarted = true
      return true
    },
    onRepeatedDataViewBlueprintWrite: (writeProjectId) => {
      if (writeProjectId !== projectId) throw new Error('项目策划重复 DataView 命令项目身份不匹配')
      dataViewRepeatedWriteRejected = true
      dataViewCompletionSnapshot = {
        projectId,
        result: {
          ok: false,
          code: 'PROJECT_PLANNING_BLUEPRINT_PARTIAL',
          msg: '本次 AI 运行已确认一个蓝图 DataView 命令；后续计划变更遭拒，不能将整个策划报告为完成。',
          fix: '保留未提交计划；待支持多命令的可恢复提交合同后继续。',
          requiredCapabilities: ['replaceBlueprintChildren'],
          missingFacts: ['后续计划变更未提交'],
          nextStep: '停止本次策划完成报告，保留已保存节点及剩余计划。',
        },
      }
    },
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  await adapter.run({
    host: projectPlanningHost,
    alias: PROJECT_PLANNING_MODULE_ID,
    input,
    ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
    ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
    trace: createProjectPlanningTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.userMessage ?? input.requirement,
  })

  const blueprintDirty = editor.project.blueprintDirty
  const delivery = createProjectPlanningInlineDeliveryPort()
  const deliveryContext = {
    editor,
    saveBlueprintAfterRun: command.saveBlueprintAfterRun === true,
    ...(dataViewBlueprintSaved === undefined ? {} : { dataViewBlueprintSaved }),
    dataViewBlueprintPending: dataViewOwner !== undefined && dataViewBlueprintSaved !== true && (
      dataViewOwner.dirty || dataViewOwner.hasPendingChildCreate || dataViewOwner.hasUnconfirmedSave
    ),
    dataViewBlueprintRepeatRejected: dataViewRepeatedWriteRejected,
  }
  const deliveryResult = await delivery.save(deliveryContext)
  await delivery.trace(deliveryContext, deliveryResult)
  if (deliveryResult.status === 'failed') {
    throw createAiDeliveryFailureError(
      deliveryResult.message ?? 'projectPlanning delivery failed.',
      deliveryResult,
    )
  }

  return {
    sawToolCall,
    input,
    blueprintDirty,
    savedBlueprint: deliveryResult.status === 'saved',
  }
}

type CreateProjectPlanningTraceSinkOptions = Readonly<{
  trace: AiRunTraceSink | undefined
  events: ProjectPlanningAiRunEvents | undefined
  onToolCall(record: AiAgentToolCallRecord): void
}>

function createProjectPlanningTraceSink(
  options: CreateProjectPlanningTraceSinkOptions,
): AiRunTraceSink {
  const trace = options.trace ?? noopTraceSink
  return {
    appendUserMessage: (content) => trace.appendUserMessage(content),
    appendEvent: (event) => trace.appendEvent(event),
    appendDelta: (delta) => trace.appendDelta(delta),
    appendReasoning: (reasoning) => trace.appendReasoning(reasoning),
    appendToolCall: (record) => {
      trace.appendToolCall(record)
      options.onToolCall(record)
    },
    appendError: (message) => trace.appendError(message),
    markAborted: (message) => trace.markAborted(message),
    finish: () => trace.finish(),
    reset: () => trace.reset(),
  }
}
