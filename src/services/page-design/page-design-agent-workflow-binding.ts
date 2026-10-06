/**
 * @module app:services/page-design/page-design-agent-workflow-binding
 * 职责：承载 pageDesign 领域的 AI workflow binding 能力——合法业务逻辑（MODULE_ID、类型、resolve/build、SOP、gate）+ binding 片段（editorGetter / gateExecutor / systemPromptInterpolator）。
 * 边界：只做 pageDesign 领域能力注入，不手写 workflow definition（definition 由设计器落盘 JSON 承载），也不承载解释器组合（由 agent-workflow-bindings.ts 薄组合入口完成）。
 * AI用途：排查 pageDesign AI 注册如何从 definition + binding 解释而来时，用本模块定位领域 binding 片段。
 */
import {
  CLASS_MODEL_TOOL_NAMES,
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AgentWorkflowRuntimeGateCommand,
  AgentWorkflowRuntimeGateResult,
  AiAgentRuntimeContext,
  AiAgentToolLoopNudgeContext,
  AiAgentToolLoopNudgeReason,
} from '@spark-appworks/spark-ai/agent'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { ProjectBlueprint } from '@spark-appworks/spark-project-model'
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'
import {
  evaluatePageDesignMutationToolGate,
  evaluatePageDesignScriptOperationGate,
  isPageDesignDataSetOnlyMode,
  readPageDesignRunContext,
  type PageDesignAllowedOperations,
  type PageDesignRunMode,
} from '@/services/page-design/page-design-gates'

export type { PageDesignAllowedOperations, PageDesignRunMode }

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

/** pageDesign editorSource — 薄组合入口据此路由 editorGetter。 */
export const PAGE_DESIGN_EDITOR_SOURCE = 'pageDesign'

/** pageDesign SOP：toolLoopNudge 触发时机与 pageId / allowedOperations 上下文。 */
export function buildPageDesignToolLoopNudge(
  reason: AiAgentToolLoopNudgeReason,
  pageId: string,
  allowedOperations?: PageDesignAllowedOperations,
): string | undefined {
  switch (reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；下一回合必须真实 tool_call，先查询 ProjectWorkspace / PageTool / ScenarioViewFile 契约。`
    case 'execution_phase':
      if (isPageDesignDataSetOnlyMode(allowedOperations)) {
        return `pageId="${pageId}"；model_script 只写函数体；仅通过显式 scenarioId 的 this.loadScenarioViews({scenarioId}) 获取 ScenarioViewFile 后 setText；页面三文件本轮禁止修改。`
      }
      return `pageId="${pageId}"；model_script 只写函数体；const page = this.project.openPageDesign("${pageId}"); 只写 rule.json / script.js / style.css。场景配置仅通过显式 scenarioId 的 this.loadScenarioViews({scenarioId}) 获取 ScenarioViewFile 后 setText。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试，this.project.openPageDesign 接收字符串 pageId；页面三文件与场景视图分开操作。`
    default:
      return undefined
  }
}

/** Page Design Run Input 的输入数据。 */
export type PageDesignRunInput = {
  requestId: string
  scenarioId?: string
    /** page Id 标识。 */
pageId: string
    /** description 字段。 */
description: string
  /** readPlanningProjection 的 effectiveDescription；runner 必填。 */
  effectiveDescription: string
  /** 项目根 path 段 id；用于 systemPrompt 给出 concrete /project[id] 示例。 */
  projectId?: string
    /** planning Title 字段。 */
planningTitle?: string
    /** planning Path 路径。 */
planningPath?: string
    /** mode 字段。 */
mode?: PageDesignRunMode
    /** allowed Operations 字段。 */
allowedOperations?: PageDesignAllowedOperations
    /** preserve Existing Interactions 字段。 */
preserveExistingInteractions?: boolean
}

/** Resolve Page Design Planning Context Options 的调用配置。 */
export type ResolvePageDesignPlanningContextOptions = {
  /** 仅 e2e/脚手架：投影为空时用本轮 description 兜底。生产 runner 勿传。 */
  fallbackDescription?: string
}

export function resolvePageDesignPlanningContext(
  project: ProjectBlueprint,
  pageId: string,
  options: ResolvePageDesignPlanningContextOptions = {},
): Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'> {
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    throw new Error(`pageDesign: no planning projection for pageId "${pageId}".`)
  }
  let effectiveDescription = summary.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    const fallback = options.fallbackDescription?.trim() ?? ''
    if (fallback.length === 0) {
      throw new Error(
        `pageDesign: page "${pageId}" has empty effectiveDescription; set blueprint node description before AI run.`,
      )
    }
    effectiveDescription = fallback
  }
  const planningTitle = summary.title.trim()
  const planningPath = summary.path.trim()
  return {
    effectiveDescription,
    planningTitle: planningTitle.length > 0 ? planningTitle : pageId,
    planningPath: planningPath.length > 0 ? planningPath : `/${pageId}`,
  }
}

/** 供 inputContract 与单测使用的 systemPrompt 格式化。 */
export function formatPageDesignSystemPrompt(input: PageDesignRunInput): string {
  const effectiveDescription = input.effectiveDescription.trim()
  if (effectiveDescription.length === 0) {
    throw new Error('pageDesign systemPrompt requires effectiveDescription from readPlanningProjection.')
  }
  const planningTitle = input.planningTitle?.trim() ?? input.pageId
  const planningPath = input.planningPath?.trim() ?? `/${input.pageId}`
  const projectId = input.projectId?.trim() ?? 'homepage'
  const sharedHeader = [
    `projectId=${projectId}；pageId=${input.pageId}。`,
    '策划约束（readPlanningProjection.effectiveDescription）:',
    effectiveDescription,
    `用户本轮目标: ${input.description}`,
  ]
  if (isPageDesignDataSetOnlyMode(input.allowedOperations) && !input.scenarioId?.trim()) {
    throw new Error('pageDesign scenario operations require explicit scenarioId.')
  }
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    ...sharedHeader,
    '知识索引: DTS ClassModel（ProjectWorkspace → project.openPageDesign → PageTool；loadScenarioViews → ScenarioViewFile）。用 model_query / model_action_guide 读取正式契约后执行。',
    '工具参数: model_query 只用 kind / keyword / includeMembers；model_action_guide 只用 kind / actionName；禁止 member / select / query 旧参数。',
    ...pageDesignScriptSopLines(input),
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function pageDesignScriptSopLines(input: PageDesignRunInput): readonly string[] {
  return [
    'model_script.script 是 JavaScript async function body；禁止 TS/JSX、import/export 和 function 包裹。',
    `页面三文件: const page = this.project.openPageDesign("${input.pageId}"); page.setFileText("rule.json", ruleText); page.setFileText("script.js", scriptText); page.setFileText("style.css", cssText)。仅修改 allowedOperations 放行的操作域。`,
    ...(input.scenarioId === undefined ? ['本轮未提供 scenarioId，禁止推断场景身份或读写场景配置。'] : [
      `场景视图: const views = await this.loadScenarioViews({ scenarioId: "${input.scenarioId}" }); views.setText(validScenarioViewText)。ScenarioViewConfig 校验数据模型引用、视图及关系；不得自造物理模型或用 pageId 当 scenarioId。`,
      '交付阶段通过 saveScenarioViews({scenarioId}) 保存，保留原文、并发冲突与回读确认；禁止把场景配置写入页面文件。',
    ]),
    '绑定按实际场景视图配置构造为 #scenarioId@table@view；只有页面调用明确声明 mainScenarioId 才允许局部 table@view。禁止推断主场景、旧点号路径及不存在的 DataSetCrudTool。',
    ...leaveRequestPageDesignHintLines(input),
  ]
}

function leaveRequestPageDesignHintLines(input: PageDesignRunInput): readonly string[] {
  const text = `${input.description}\n${input.effectiveDescription}\n${input.planningTitle ?? ''}`.toLowerCase()
  if (!text.includes('请假') && !text.includes('leave')) return []
  return [
    '本轮请假申请页验收字段: LeaveRequest 表至少包含 applicantName、leaveType、startDate、endDate、reason、status，以及 days/duration/dayCount 之一。',
    '请假类型必须给静态 options，例如 年假、事假、病假、婚假、产假、丧假、其他。',
    'rule.json 使用实际场景视图绑定的 r-form、字段 r-form-item、提交申请按钮和请假记录 r-table。',
  ]
}

/** pageDesign gate 规则 kind 白名单——未知 kind fail-fast。 */
const PAGE_DESIGN_GATE_RULE_KINDS = new Set([
  'pageDesignMutationToolGate',
])

/** Page Design Editor Getter Options 的调用配置。 */
export type PageDesignEditorGetterOptions = Readonly<{
  /** 按 moduleInstanceId（即 requestId）返回 pageDesign 编辑器。 */
  getPageDesignEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
}>

/** Page Design Agent Workflow Binding Options 的调用配置。 */
export type PageDesignAgentWorkflowBindingOptions = PageDesignEditorGetterOptions & Readonly<{
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
}>

export function resolvePageDesignProject(
  options: PageDesignAgentWorkflowBindingOptions,
  ctx: AiAgentRuntimeContext,
): ProjectWorkspace {
  const requestId = ctx.moduleInstanceId.trim()
  const runContext = readPageDesignRunContext(requestId)
  if (!requestId || runContext === undefined) throw new Error('PAGE_DESIGN_REQUEST_MISSING: 请求工作区上下文不存在')
  const editor = options.getPageDesignEditor({ moduleInstanceId: requestId })
  if (editor.project.getActivePage()?.pageId !== runContext.pageId) throw new Error('PAGE_DESIGN_REQUEST_MISMATCH: 活动页面已改变')
  return editor
}

export function evaluatePageDesignBeforeFunctionCall(
  editor: ProjectWorkspace,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const requestId = options.moduleInstanceId.trim()
  const runContext = readPageDesignRunContext(requestId)
  if (runContext === undefined) return { status: 'reject', reason: 'PAGE_DESIGN_REQUEST_MISSING' }
  const pageId = runContext.pageId
  if (pageId.length === 0) {
    return { status: 'allow' }
  }
  const summary = editor.project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    return {
      status: 'reject',
      reason: `pageDesign: no planning projection for pageId "${pageId}".`,
      fix: '先 readPlanningProjection，确认 pageId 存在于 pageDeliveries。',
    }
  }
  const gate = evaluatePageDesignMutationToolGate({
    toolName: options.toolName,
    summary,
    ...(runContext.allowedOperations === undefined
      ? {}
      : { allowedOperations: runContext.allowedOperations }),
    toolArgs: options.args,
  })
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'pageDesign gate rejected mutation tool.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

/**
 * 创建 pageDesign editorGetter 片段——解释器 resolveInstance 据此拿 ProjectWorkspace。
 * editorSource=pageDesign 时，薄组合入口把此 getter 注入 editorGetterRegistry。
 */
export function createPageDesignEditorGetter(
  options: PageDesignEditorGetterOptions,
): (context: AiAgentRuntimeContext) => ProjectWorkspace {
  return context => resolvePageDesignProject(options, context)
}

/**
 * pageDesign gateExecutor 片段——读运行时上下文，复用 evaluatePageDesignMutationToolGate。
 * 未知 rule kind fail-fast。
 */
export function executePageDesignGate(
  command: AgentWorkflowRuntimeGateCommand,
): AgentWorkflowRuntimeGateResult {
  for (const rule of command.rules) {
    if (!PAGE_DESIGN_GATE_RULE_KINDS.has(rule.kind)) {
      throw new Error(`pageDesign gateExecutor: unknown gate rule kind "${rule.kind}".`)
    }
  }
  const pageId = command.options.moduleInstanceId.trim()
  if (pageId.length === 0) {
    return { ok: true }
  }
  const runContext = readPageDesignRunContext(pageId)
  if (runContext === undefined) return { ok: false, reason: 'PAGE_DESIGN_REQUEST_MISSING' }
  const allowedOperations = runContext.allowedOperations
  const gate = evaluatePageDesignScriptOperationGate({
    toolName: command.options.toolName,
    ...(allowedOperations === undefined ? {} : { allowedOperations }),
    args: command.options.args,
  })
  if (gate.ok) return { ok: true }
  return {
    ok: false,
    reason: gate.reason ?? 'pageDesign gate rejected mutation tool.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

/** pageDesign toolLoopNudge 上下文读取——复用 buildPageDesignToolLoopNudge。 */
export function createPageDesignToolLoopNudge(
  context: AiAgentToolLoopNudgeContext,
): string | undefined {
  const requestId = context.moduleInstanceId.trim()
  const runContext = readPageDesignRunContext(requestId)
  if (runContext === undefined) return undefined
  const pageId = runContext.pageId
  return buildPageDesignToolLoopNudge(
    context.reason,
    pageId,
    runContext.allowedOperations,
  )
}

/** pageDesign executionToolNames——视为已进入执行阶段的工具名。 */
export const PAGE_DESIGN_EXECUTION_TOOL_NAMES = new Set<string>([
  CLASS_MODEL_TOOL_NAMES.script,
])

/** pageDesign planWithoutToolMarkers——扩展 plan-without-tool 检测关键词。 */
export const PAGE_DESIGN_PLAN_WITHOUT_TOOL_MARKERS = [
  'openpagedesign',
  'editnodetree',
  'loadscenarioviews',
  'settext',
] as const

/**
 * pageDesign 知识 provider 工厂——Worker URL 在 app 层，rootClassName 来自 definition 声明。
 */
export function createPageDesignKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName,
  })
}

/**
 * pageDesign moduleClassResolver 片段——返回 ProjectWorkspace 构造器。
 * 解释器 resolveInstance 直接拿本次请求编辑器实例。
 */
export function resolvePageDesignModuleClass(): typeof ProjectWorkspace {
  return ProjectWorkspace
}

export {
  assertPageDesignRunGateAllowed,
  evaluatePageDesignMutationToolGate,
  readPageDesignGateState,
  validatePageDesignRunGate,
} from '@/services/page-design/page-design-gates'

export type {
  PageDesignGateState,
  PageDesignGateValidationResult,
} from '@/services/page-design/page-design-gates'
