/**
 * @module app:services/page-design-ai-runner
 * 职责：提供应用层 pageDesign 的 page-design-ai-runner 能力，围绕 PageDesignAiRunOptions、PageDesignAiRunEvents、PageDesignAiRunCommand 等 4 个公开契约 接线 AI runner、业务门禁、知识服务或编辑器状态。
 * 边界：只编排 app 层页面设计流程，不替代 spark-ai Host，也不直接实现底层组件渲染器。
 * AI用途：排查 pageDesign 会话、工具门禁或页面四文件生成链路时，用本模块定位 services/page-design-ai-runner。
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
import { AI_AGENT_HOST } from '@spark-appworks/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import {
  PAGE_NODE_FILE_NAMES,
  type PageNodeFileName,
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
import { createAiDeliveryFailureError } from '@/services/ai/ai-delivery-port'
import { createPageDesignInlineDeliveryPort } from '@/services/page-design/page-design-agent-run-provider'
import {
  bindPageDesignRunContext,
  clearPageDesignRunContext,
} from '@/services/page-design/page-design-gates'

/** Page Design Ai Run Options 的调用配置。 */
export type PageDesignAiRunOptions = {
    /** description 字段。 */
description: string
    /** mode 字段。 */
mode?: PageDesignRunMode
    /** allowed Operations 字段。 */
allowedOperations?: PageDesignAllowedOperations
    /** preserve Existing Interactions 字段。 */
preserveExistingInteractions?: boolean
  /** 未声明 implGate 时 fail-fast；生产 runner 建议 true。 */
  strictImplGate?: boolean
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
    /** consume Capability 字段。 */
consumeCapability: SparkCapabilityConsumer | null
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
  /** 仅 commit 指定 dirty 页面文件；未传则 save 全部 dirty 四文件。 */
  deliverySaveFileNames?: readonly PageNodeFileName[]
}

/** Page Design Ai Run Result 的返回结果。 */
export type PageDesignAiRunResult = {
    /** saw Tool Call 字段。 */
sawToolCall: boolean
    /** files 字段。 */
files: ProjectActivePageProjection
    /** dirty File Names 字段。 */
dirtyFileNames: PageNodeFileName[]
    /** saved Dirty File Names 字段。 */
savedDirtyFileNames: PageNodeFileName[]
}

export async function runPageDesignAiSession(command: PageDesignAiRunCommand): Promise<PageDesignAiRunResult> {
  const pageId = command.pageId.trim()
  const description = command.description.trim()
  if (!pageId) throw new Error('pageDesign AI requires a pageId.')
  if (!description) throw new Error('pageDesign AI requires a description.')

  const aiAgentHost = command.consumeCapability?.(AI_AGENT_HOST) ?? null
  if (aiAgentHost === null) {
    throw new Error('AI Host 未注册，无法启动 pageDesign。')
  }

  assertActivePageNodeLoaded(command.editor, pageId)

  const planning = resolvePageDesignPlanningContext(command.editor.project, pageId)
  const summary = command.editor.project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  assertPageDesignRunGateAllowed(summary, command.mode, {
    strictImplGate: command.strictImplGate === true,
  })

  const pageDesignHost = await activatePageDesignAgentWorkflow({
    host: aiAgentHost,
    getPageDesignEditor: (context) => {
      if (context.moduleInstanceId !== pageId) {
        throw new Error(`pageDesign editor mismatch: expected "${pageId}", got "${context.moduleInstanceId}".`)
      }
      return command.editor
    },
  })

  bindPageDesignRunContext(pageId, {
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
      pageId,
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
    clearPageDesignRunContext(pageId)
  }

  const delivery = createPageDesignInlineDeliveryPort({
    autoSave: command.saveDirtyFilesAfterRun === true,
    ...(command.deliverySaveFileNames === undefined
      ? {}
      : { saveFileNames: command.deliverySaveFileNames }),
  })
  const deliveryResult = await delivery.save({ editor: command.editor, pageId })
  await delivery.trace({ editor: command.editor, pageId }, deliveryResult)
  if (deliveryResult.status === 'failed') {
    throw createAiDeliveryFailureError(
      deliveryResult.message ?? 'pageDesign delivery failed.',
      deliveryResult,
    )
  }
  const savedDirtyFileNames = deliveryResult.artifacts
    .filter(artifact => artifact.kind === 'page-file' && artifact.status === 'saved')
    .map(artifact => artifact.name)
    .filter(isPageNodeFileName)

  return {
    sawToolCall,
    files: command.editor.project.readActivePageProjection(),
    dirtyFileNames: readDirtyFileNames(command.editor),
    savedDirtyFileNames,
  }
}

function isPageNodeFileName(value: string): value is PageNodeFileName {
  return PAGE_NODE_FILE_NAMES.some(fileName => fileName === value)
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

function assertActivePageNodeLoaded(editor: ProjectWorkspace, pageId: string): void {
  const activePage = editor.project.getActivePage()
  if (activePage === null) {
    throw new Error('pageDesign AI requires the current PageNode to be opened before editing.')
  }
  if (activePage.pageId !== pageId) {
    throw new Error(`pageDesign AI active PageNode mismatch: expected "${pageId}", got "${activePage.pageId}".`)
  }
  if (!activePage.isLoaded) {
    throw new Error(`pageDesign AI requires PageNode "${pageId}" to be loaded before editing.`)
  }
}

function readDirtyFileNames(editor: ProjectWorkspace): PageNodeFileName[] {
  return Array.from(editor.project.readDirtyProjection().dirtyFiles)
}

type BuildPageDesignRunInputCommand = Readonly<{
  pageId: string
  projectId: string
  options: PageDesignAiRunOptions
  planning: Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'>
}>

function buildPageDesignRunInput(command: BuildPageDesignRunInputCommand): PageDesignRunInput {
  const { pageId, projectId, options, planning } = command
  const input: PageDesignRunInput = {
    pageId,
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
  if (options.strictImplGate !== undefined) input.strictImplGate = options.strictImplGate
  return input
}
