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
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { ProjectModel } from '@spark-appworks/spark-project-model'
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
  if (isPageDesignDataSetOnlyMode(allowedOperations)) {
    switch (reason) {
      case 'plan_without_tool':
        return `pageId="${pageId}"；pageDataDesign preset：禁止只输出计划，下一回合必须 model_script 调用 editDataSet。`
      case 'execution_phase':
        return `pageId="${pageId}"；只改 pagedata.json：const page = this.openPageDesign("${pageId}"); await page.editDataSet(async tool => …)；禁止 nodeTree / setFileText 变更。script 只写函数体，不要包 async function/function。`
      case 'model_script_retry':
        return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script，仍只通过 const page = this.openPageDesign("${pageId}"); await page.editDataSet(async tool => …) 变更 DataSet。`
      default:
        return undefined
    }
  }
  switch (reason) {
    case 'plan_without_tool':
      return `pageId="${pageId}"；禁止只输出计划，下一回合必须发起真实 tool_call。优先查询 model_action_guide({ kind: "ProjectModel", actionName: "openPageDesign" })，然后进入 model_script。`
    case 'execution_phase':
      return `pageId="${pageId}"；目录/指南阶段已完成，直接 model_script：script 只写函数体，不要包 async function/function；const page = this.openPageDesign("${pageId}"); 通过 page.setFileText("pagedata.json"|"rule.json"|"script.js"|"style.css", text) 写入四文件。`
    case 'model_script_retry':
      return `pageId="${pageId}"；按 RECOVERY_HINT 修正后重试 model_script；script 只写函数体，不要包 async function/function；openPageDesign 接收字符串 pageId，不是对象。`
    default:
      return undefined
  }
}

/** Page Design Run Input 的输入数据。 */
export type PageDesignRunInput = {
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
  project: ProjectModel,
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
  if (isPageDesignDataSetOnlyMode(input.allowedOperations)) {
    return [
      `当前 pageDataDesign preset（pageDesign 数据域）: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
      ...sharedHeader,
      '能力边界: 只修改 pagedata.json（DataSet）；禁止 editNodeTree、rule.json、script.js、style.css。',
      '知识索引: DTS ClassModel（ProjectModel → openPageDesign → editDataSet / DataSetCrudTool）。',
      '工具参数: model_query 只用 kind / keyword / includeMembers；model_action_guide 只用 kind / actionName；禁止 member / select / query 旧参数。',
      '执行规则: 先 model_action_guide 查 editDataSet 与 DataSetCrudTool，再 model_script 通过 editDataSet 回调变更表/视图/绑定。',
      '脚本规则: model_script.script 只写 JavaScript async function body；不要写 TS/TSX/JSX、类型注解、import/export、async function(){} / function(){} 包裹。',
      '交付: 仅 commit pagedata.json；nodeTree / rule / script / style 即使 dirty 也不落盘。',
      '模型来源: generated/dts-class-model。',
    ].join('\n')
  }
  return [
    `当前 pageDesign 页面: ${input.pageId}（${planningTitle}，path=${planningPath}）`,
    ...sharedHeader,
    '知识索引: DTS ClassModel（ProjectModel → ConfigPageNode）；用 model_query / model_action_guide 读取契约后 model_script 执行。',
    '工具参数: model_query 只用 kind / keyword / includeMembers；model_action_guide 只用 kind / actionName；禁止 member / select / query 旧参数。',
    ...pageDesignScriptSopLines(input),
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

function pageDesignScriptSopLines(input: PageDesignRunInput): readonly string[] {
  return [
    'model_script 标准写法: script 是 JavaScript async function body；不要写 TS/TSX/JSX、类型注解、import/export、async function(){} / function(){} / return (async function...) 包裹。',
    `四文件写入闭环: const page = this.openPageDesign("${input.pageId}"); page.setFileText("pagedata.json", JSON.stringify(data, null, 2)); page.setFileText("rule.json", JSON.stringify(rule, null, 2)); page.setFileText("script.js", scriptText); page.setFileText("style.css", cssText); return { pageId: page.pageId }。`,
    '四文件名只允许 rule.json / pagedata.json / script.js / style.css；不要使用 style.json 或 script.json。',
    '表单页交付底线: pagedata.json 必须建业务表与 default view；rule.json 必须有 r-form、字段 prop 绑定、列表区域、提交按钮；枚举字段必须提供可用 options。',
    '绑定格式: dataViewKey 使用 TableName@default；字段绑定使用 dataMember + dataField/prop，不使用旧点号路径。',
    ...leaveRequestPageDesignHintLines(input),
  ]
}

function leaveRequestPageDesignHintLines(input: PageDesignRunInput): readonly string[] {
  const text = `${input.description}\n${input.effectiveDescription}\n${input.planningTitle ?? ''}`.toLowerCase()
  if (!text.includes('请假') && !text.includes('leave')) return []
  return [
    '本轮请假申请页验收字段: LeaveRequest 表至少包含 applicantName、leaveType、startDate、endDate、reason、status，以及 days/duration/dayCount 之一。',
    '请假类型必须给静态 options，例如 年假、事假、病假、婚假、产假、丧假、其他。',
    'rule.json 至少包含绑定 LeaveRequest@default 的 r-form、这些字段的 r-form-item、提交申请按钮和请假记录 r-table。',
  ]
}

/** pageDesign gate 规则 kind 白名单——未知 kind fail-fast。 */
const PAGE_DESIGN_GATE_RULE_KINDS = new Set([
  'pageDesignMutationToolGate',
])

/** Page Design Editor Getter Options 的调用配置。 */
export type PageDesignEditorGetterOptions = Readonly<{
  /** 按 moduleInstanceId（即 pageId）返回 pageDesign 编辑器。 */
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
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId
  if (moduleInstanceId.trim().length === 0) {
    throw new Error('pageDesign ProjectModel requires host.moduleInstanceId.')
  }
  const host = options.getPageDesignEditor({ moduleInstanceId })
  host.project.openPageDesign(moduleInstanceId)
  return host.project
}

export function evaluatePageDesignBeforeFunctionCall(
  project: ProjectModel,
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const pageId = options.moduleInstanceId.trim()
  if (pageId.length === 0) {
    return { status: 'allow' }
  }
  const summary = project.readPlanningProjection().find(item => item.pageId === pageId)
  if (summary === undefined) {
    return {
      status: 'reject',
      reason: `pageDesign: no planning projection for pageId "${pageId}".`,
      fix: '先 readPlanningProjection，确认 pageId 存在于 pageDeliveries。',
    }
  }
  const runContext = readPageDesignRunContext(pageId)
  const gate = evaluatePageDesignMutationToolGate({
    toolName: options.toolName,
    summary,
    ...(runContext?.allowedOperations === undefined
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
 * 创建 pageDesign editorGetter 片段——解释器 resolveInstance 据此拿 ProjectModel。
 * editorSource=pageDesign 时，薄组合入口把此 getter 注入 editorGetterRegistry。
 */
export function createPageDesignEditorGetter(
  options: PageDesignEditorGetterOptions,
): (context: AiAgentRuntimeContext) => ProjectModel {
  return (context) => {
    const moduleInstanceId = context.moduleInstanceId
    if (moduleInstanceId.trim().length === 0) {
      throw new Error('pageDesign ProjectModel requires host.moduleInstanceId.')
    }
    const host = options.getPageDesignEditor({ moduleInstanceId })
    host.project.openPageDesign(moduleInstanceId)
    return host.project
  }
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
  const allowedOperations = runContext?.allowedOperations
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
  const pageId = context.moduleInstanceId.trim()
  if (pageId.length === 0) return undefined
  const runContext = readPageDesignRunContext(pageId)
  return buildPageDesignToolLoopNudge(
    context.reason,
    pageId,
    runContext?.allowedOperations,
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
  'editdataset',
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
 * pageDesign moduleClassResolver 片段——返回 ProjectModel 构造器。
 * 解释器据此 new ProjectModel() 实例（或 resolveInstance 直接拿编辑器实例）。
 */
export function resolvePageDesignModuleClass(): typeof ProjectModel {
  return ProjectModel
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
