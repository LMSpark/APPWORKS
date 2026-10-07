/**
 * @module app:services/page-design-ai-runner
 * 职责：提供应用层 pageDesign 的 page-design-ai-runner 能力，围绕 PageDesignAiRunOptions、PageDesignAiRunEvents、PageDesignAiRunCommand 等 4 个公开契约 接线 AI runner、业务门禁、知识服务或编辑器状态。
 * 边界：只编排 app 层页面设计流程，不替代 spark-ai Host，也不直接实现底层组件渲染器。
 * AI用途：排查 pageDesign 会话、工具门禁或页面三文件生成链路时，用本模块定位 services/page-design-ai-runner。
 */
/**
 * DevSystem 面板内 pageDesign AI — 使用 DevSystem 当前 ProjectWorkspace。
 *
 * `command.editor` 必须与手动编辑同一 `editor.project`，保存/撤销语义一致。
 * 隔离式 SSE Agent Run 见 `page-design-agent-run-provider.ts`（headless 临时门面）。
 */
import { createAiRunAdapter, noopTraceSink } from '@spark-appworks/spark-app'
import type {
  AiRunAbortHandler,
  AiRunAdapterState,
  AiRunBeforeFunctionCall,
  AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type { AiAgentToolCallRecord } from '@spark-appworks/spark-ai/agent'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import {
  PAGE_TOOL_FILE_NAMES,
  type PageToolFileName,
  type ProjectActivePageProjection,
  type ProjectWorkspace,
} from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  assertPageDesignRunGateAllowed,
  resolvePageDesignPlanningContext,
  type PageDesignAllowedOperations,
  type PageDesignRunInput,
  type PageDesignRunMode,
} from '@/services/page-design/page-design-agent-workflow-binding'
import { activatePageDesignAgentWorkflow } from '@/services/ai/agent-workflow-bindings'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'
import { createAiDeliveryFailureError, type AiDeliveryResult } from '@/services/ai/ai-delivery-port'
import { createPageDesignInlineDeliveryPort } from '@/services/page-design/page-design-agent-run-provider'
import {
  bindPageDesignRunContext,
  clearPageDesignRunContext,
  readPageDesignRunContext,
} from '@/services/page-design/page-design-gates'

/** Page Design Ai Run Options 的调用配置。 */
export type PageDesignAiRunOptions = {
    /** description 字段。 */
description: string
  requestId?: string
  scenarioId?: string
    /** mode 字段。 */
mode?: PageDesignRunMode
    /** allowed Operations 字段。 */
allowedOperations?: PageDesignAllowedOperations
    /** preserve Existing Interactions 字段。 */
preserveExistingInteractions?: boolean
}

/**
 * DevSystem 侧 channel：仅转发 tool call 状态，不承载 stream/delta/reasoning（见 trace / spark-ai）。
 */
export type PageDesignAiRunEvents = {
    /** on Tool Call 事件回调。 */
onToolCall?: (record: AiAgentToolCallRecord) => void
}

/** Page Design Ai Run Command 的命令参数。 */
export type PageDesignAiRunCommand = PageDesignAiRunOptions & {
    /** page Id 标识。 */
pageId: string
    /** editor 字段。 */
editor: ProjectWorkspace

    /** events 字段。 */
events?: PageDesignAiRunEvents
    /** trace 字段。 */
trace?: AiRunTraceSink
    /** adapter 字段。 */
adapter?: AiRunAdapterState
    /** before Function Call 字段。 */
beforeFunctionCall?: AiRunBeforeFunctionCall
    /** on Abort 事件回调。 */
onAbort?: AiRunAbortHandler
    /** user Message 字段。 */
userMessage?: string
  /** 自动化/headless 调用可打开；DevSystem 默认保持手动保存语义。 */
  saveDirtyFilesAfterRun?: boolean
  /** 仅 commit 指定 dirty 页面文件；未传则 save 全部 dirty 三文件。 */
  deliverySaveFileNames?: readonly PageToolFileName[]
}

/** Page Design Ai Run Result 的返回结果。 */
export type PageDesignAiRunResult = {
  requestId: string
  scenarioId?: string
  delivery: AiDeliveryResult
    /** saw Tool Call 字段。 */
sawToolCall: boolean
    /** files 字段。 */
files: ProjectActivePageProjection
    /** dirty File Names 字段。 */
dirtyFileNames: PageToolFileName[]
    /** saved Dirty File Names 字段。 */
savedDirtyFileNames: PageToolFileName[]
}

export async function runPageDesignAiSession(command: PageDesignAiRunCommand): Promise<PageDesignAiRunResult> {
  const requestId = command.requestId?.trim() ?? crypto.randomUUID()
  if (!requestId) throw new Error('pageDesign requires requestId')
  if (readPageDesignRunContext(requestId) !== undefined) throw new Error('PAGE_DESIGN_REQUEST_ACTIVE: requestId 已被占用')
  const pageId = command.pageId.trim()
  const description = command.description.trim()
  if (!pageId) throw new Error('pageDesign AI requires a pageId.')
  if (!description) throw new Error('pageDesign AI requires a description.')

  assertActivePageToolLoaded(command.editor, pageId)

  const planning = resolvePageDesignPlanningContext(command.editor.project, pageId)
  const summary = command.editor.project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  assertPageDesignRunGateAllowed(summary, command.mode)

  if (command.scenarioId !== undefined) await command.editor.loadScenarioViews({ scenarioId: command.scenarioId })
  const pageDesignHost = await activatePageDesignAgentWorkflow({
    host: createAiAgentHost({ turnCallbacks: createAiAgentTurnCallbacks(), maxToolRounds: 16 }),
    getPageDesignEditor: (context) => {
      if (context.moduleInstanceId !== requestId) {
        throw new Error(`pageDesign editor mismatch: expected "${requestId}", got "${context.moduleInstanceId}".`)
      }
      return command.editor
    },
  })

  if (readPageDesignRunContext(requestId) !== undefined) throw new Error('PAGE_DESIGN_REQUEST_ACTIVE: requestId 已被占用')
  bindPageDesignRunContext(requestId, {
    pageId,
    ...(command.scenarioId === undefined ? {} : { scenarioId: command.scenarioId }),
    ...(command.allowedOperations === undefined ? {} : { allowedOperations: command.allowedOperations }),
    ...(command.deliverySaveFileNames === undefined ? {} : { deliverySaveFileNames: command.deliverySaveFileNames }),
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  try {
    await adapter.run({
    host: pageDesignHost,
    alias: PAGE_DESIGN_MODULE_ID,
    input: buildPageDesignRunInput({
      requestId, pageId,
      projectId: command.editor.project.projectId,
      options: command,
      planning,
    }),
    ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
    ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
    trace: createPageDesignTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.userMessage ?? description,
    })
  } finally {
    clearPageDesignRunContext(requestId)
  }

  const delivery = createPageDesignInlineDeliveryPort({
    ...(command.allowedOperations === undefined ? {} : { allowedOperations: command.allowedOperations }),
    autoSave: command.saveDirtyFilesAfterRun === true,
    ...(command.deliverySaveFileNames === undefined
      ? {}
      : { saveFileNames: command.deliverySaveFileNames }),
  })
  const deliveryResult = { ...await delivery.save({ editor: command.editor, pageId, requestId, ...(command.scenarioId === undefined ? {} : { scenarioId: command.scenarioId }) }), requestId, pageId, ...(command.scenarioId === undefined ? {} : { scenarioId: command.scenarioId }) }
  await delivery.trace({ editor: command.editor, pageId, requestId, ...(command.scenarioId === undefined ? {} : { scenarioId: command.scenarioId }) }, deliveryResult)
  if (deliveryResult.status === 'failed') {
    throw createAiDeliveryFailureError(
      deliveryResult.message ?? 'pageDesign delivery failed.',
      deliveryResult,
    )
  }
  const savedDirtyFileNames = deliveryResult.artifacts
    .filter(artifact => artifact.kind === 'page-file' && artifact.status === 'saved')
    .map(artifact => artifact.name)
    .filter(isPageToolFileName)

  return {
    requestId,
    ...(command.scenarioId === undefined ? {} : { scenarioId: command.scenarioId }),
    delivery: deliveryResult,
    sawToolCall,
    files: command.editor.project.readActivePageProjection(),
    dirtyFileNames: readDirtyFileNames(command.editor),
    savedDirtyFileNames,
  }
}

function isPageToolFileName(value: string): value is PageToolFileName {
  return PAGE_TOOL_FILE_NAMES.some(fileName => fileName === value)
}

type CreatePageDesignTraceSinkOptions = Readonly<{
  trace: AiRunTraceSink | undefined
  events: PageDesignAiRunEvents | undefined
  onToolCall(record: AiAgentToolCallRecord): void
}>

function createPageDesignTraceSink(options: CreatePageDesignTraceSinkOptions): AiRunTraceSink {
  const trace = options.trace ?? noopTraceSink

  return {
    appendUserMessage: (content) => trace.appendUserMessage(content),
    appendEvent: (event) => {
      trace.appendEvent(event)
    },
    appendDelta: (delta) => {
      trace.appendDelta(delta)
    },
    appendReasoning: (reasoning) => {
      trace.appendReasoning(reasoning)
    },
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

function assertActivePageToolLoaded(editor: ProjectWorkspace, pageId: string): void {
  const activePage = editor.project.getActivePage()
  if (activePage === null) {
    throw new Error('pageDesign AI requires the current PageTool to be opened before editing.')
  }
  if (activePage.pageId !== pageId) {
    throw new Error(`pageDesign AI active PageTool mismatch: expected "${pageId}", got "${activePage.pageId}".`)
  }
  if (!activePage.isLoaded) {
    throw new Error(`pageDesign AI requires PageTool "${pageId}" to be loaded before editing.`)
  }
}

function readDirtyFileNames(editor: ProjectWorkspace): PageToolFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

type BuildPageDesignRunInputCommand = Readonly<{
  requestId: string
  pageId: string
  projectId: string
  options: PageDesignAiRunOptions
  planning: Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'>
}>

function buildPageDesignRunInput(command: BuildPageDesignRunInputCommand): PageDesignRunInput {
  const { requestId, pageId, projectId, options, planning } = command
  const input: PageDesignRunInput = {
    requestId, pageId,
    ...(options.scenarioId === undefined ? {} : { scenarioId: options.scenarioId }),
    description: options.description.trim(),
    effectiveDescription: planning.effectiveDescription,
    projectId,
  }
  if (planning.planningTitle !== undefined) input.planningTitle = planning.planningTitle
  if (planning.planningPath !== undefined) input.planningPath = planning.planningPath
  if (options.mode !== undefined) input.mode = options.mode
  if (options.allowedOperations !== undefined) input.allowedOperations = options.allowedOperations
  if (options.preserveExistingInteractions !== undefined) {
    input.preserveExistingInteractions = options.preserveExistingInteractions
  }
  return input
}
