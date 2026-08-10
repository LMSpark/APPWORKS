/**
 * @module app:services/project-planning/project-planning-agent-workflow-binding
 * 职责：承载 projectPlanning Agent Workflow 的应用侧领域 binding，连接 ProjectModel、输入构造、prompt 和 gate。
 * 边界：不手写 workflow definition，不直接注册 AiAgentHost；只提供解释器所需 app 能力与领域纯函数。
 * AI用途：排查 projectPlanning AI 输入、prompt、gate 或 editorSource 接线时，用本模块确认迁移后的业务逻辑。
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentRuntimeContext,
} from '@spark-appworks/spark-ai/agent'
import type { ClassModelKnowledgeProvider } from '@spark-appworks/spark-ai/class-model'
import type {
  ProjectModel,
  ProjectWorkspace,
} from '@spark-appworks/spark-project-model'

export const PROJECT_PLANNING_MODULE_ID = 'projectPlanning'

/** Project Planning Run Input 的输入数据。 */
export type ProjectPlanningRunInput = Readonly<{
  /** 租户标识；用于后端附件读取 scope 校验。 */
  tenantId?: string
  /** 项目唯一标识。 */
  projectId: string
  /** 项目级短需求；来自 readProjectPlanningInput().requirement。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 当前项目蓝图节点的策划输入。 */
  blueprintNodes: readonly BlueprintPlanningRunInput[]
}>

/** Host inputContract 用可变数组，满足 JsonParams。 */
export type ProjectPlanningAgentInput = Readonly<{
  /** 租户标识；用于后端附件读取 scope 校验。 */
  tenantId?: string
  /** Agent 输入的身份键（通常等于 projectId）。 */
  projectScopeKey: string
  /** 项目唯一标识。 */
  projectId: string
  /** 项目级策划短需求文本。 */
  requirement: string
  /** 项目级策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 各项目蓝图节点的策划输入列表。 */
  blueprintNodes: BlueprintPlanningAgentInput[]
}>

/** Blueprint Planning Agent Input 的输入数据。 */
export type BlueprintPlanningAgentInput = Readonly<{
  /** 蓝图节点 id。 */
  nodeId: string
  /** 节点显示标题。 */
  title: string
  /** 蓝图业务类型。 */
  blueprintKind: string
  /** 可选运行交付投影类型。 */
  nodeKind: string
  /** 节点短需求。 */
  requirement: string
  /** 节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
}>

/** Blueprint Planning Run Input 的输入数据。 */
export type BlueprintPlanningRunInput = Readonly<{
  /** 蓝图节点 id。 */
  nodeId: string
  /** 节点显示标题。 */
  title: string
  /** 蓝图业务类型。 */
  blueprintKind: string
  /** 可选运行交付投影类型。 */
  nodeKind: string
  /** 节点短需求。 */
  requirement: string
  /** 节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
}>

/** Resolve Project Planning Run Input Options 的调用配置。 */
export type ResolveProjectPlanningRunInputOptions = Readonly<{
  /** Agent Run 可注入一次性需求，不写回 ProjectModel。 */
  requirementOverride?: string
  /** Agent Run 或导入入口可注入一次性附件引用，不写回 ProjectModel。 */
  planningAttachmentRef?: string
}>

/** Filter Blueprint Planning Nodes Options 的调用配置。 */
export type FilterBlueprintPlanningNodesOptions = Readonly<{
  /** 仅包含这些 nodeId；未传则按 includeEmptyRequirement 规则过滤。 */
  scopeNodeIds?: readonly string[]
  /** 默认 false：跳过 requirement 与 planningAttachmentRef 均为空的节点。 */
  includeEmptyRequirement?: boolean
}>

/** Resolve Scoped Project Planning Run Input Options 的调用配置。 */
export type ResolveScopedProjectPlanningRunInputOptions =
  ResolveProjectPlanningRunInputOptions & FilterBlueprintPlanningNodesOptions

/** Project Planning Agent Workflow Binding Options 的调用配置。 */
export type ProjectPlanningAgentWorkflowBindingOptions = Readonly<{
  /** 按 moduleInstanceId 获取 ProjectWorkspace 编辑器。 */
  getProjectPlanningEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
}>

export function resolveProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const planning = project.readProjectPlanningInput()
  const overrideRequirement = options.requirementOverride?.trim()
  const attachmentRefOverride = options.planningAttachmentRef?.trim()
  const planningAttachmentRef = attachmentRefOverride !== undefined && attachmentRefOverride.length > 0
    ? attachmentRefOverride
    : planning.planningAttachmentRef
  const requirement = overrideRequirement !== undefined && overrideRequirement.length > 0
    ? overrideRequirement
    : (planning.requirement.trim().length > 0
      ? planning.requirement.trim()
      : (planningAttachmentRef === undefined
        ? ''
        : '请读取项目策划附件，基于附件内容生成项目模块与页面策划概要。'))
  if (requirement.length === 0 && planningAttachmentRef === undefined) {
    throw new Error('projectPlanning: requirement is empty; set blueprint root description, project.description, or planningAttachmentRef.')
  }
  const blueprintNodes = project.readBlueprintPlanningInputs().map((node) => {
    return {
      nodeId: node.nodeId,
      title: node.title,
      blueprintKind: node.blueprintKind,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    }
  })

  return {
    ...(project.tenantId === undefined ? {} : { tenantId: project.tenantId }),
    projectId: project.projectId,
    requirement,
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    blueprintNodes,
  }
}

export function resolveBlueprintPlanningRunInput(
  project: ProjectModel,
  nodeId: string,
): BlueprintPlanningRunInput {
  const node = project.readBlueprintNodePlanningInput(nodeId)
  return {
    nodeId: node.nodeId,
    title: node.title,
    blueprintKind: node.blueprintKind,
    nodeKind: node.nodeKind,
    requirement: node.requirement,
    ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
  }
}

export function formatProjectPlanningPromptContext(input: ProjectPlanningRunInput): string {
  const lines = [
    '项目策划输入（短需求 + 附件详细说明）：',
    '策划阶段不涉及页面四文件，只产出完整项目蓝图。',
    ...(input.tenantId === undefined ? [] : [`tenantId: ${input.tenantId}`]),
    `projectId: ${input.projectId}`,
    'projectRequirement:',
    input.requirement,
  ]
  if (input.planningAttachmentRef !== undefined) {
    lines.push(`projectPlanningAttachmentRef: ${input.planningAttachmentRef}`)
  }
  if (input.blueprintNodes.length > 0) {
    lines.push('', 'blueprintNodes:')
    for (const node of input.blueprintNodes) {
      lines.push(`- ${node.nodeId} (${node.blueprintKind}; delivery=${node.nodeKind}) ${node.title}`)
      if (node.requirement.length > 0) lines.push(`  requirement: ${node.requirement}`)
      if (node.planningAttachmentRef !== undefined) {
        lines.push(`  planningAttachmentRef: ${node.planningAttachmentRef}`)
      }
    }
  }
  lines.push('', '输出目标见 DTS ClassModel 知识索引与本轮 requirement。')
  return lines.join('\n')
}

export function filterBlueprintPlanningRunNodes(
  nodes: readonly BlueprintPlanningRunInput[],
  options: FilterBlueprintPlanningNodesOptions = {},
): readonly BlueprintPlanningRunInput[] {
  const scopeNodeIds = options.scopeNodeIds
  if (scopeNodeIds !== undefined && scopeNodeIds.length > 0) {
    const allowed = new Set(scopeNodeIds)
    return nodes.filter(node => allowed.has(node.nodeId))
  }
  if (options.includeEmptyRequirement === true) {
    return nodes
  }
  return nodes.filter((node) => {
    if (node.requirement.trim().length > 0) return true
    if (node.planningAttachmentRef !== undefined) return true
    return false
  })
}

export function resolveScopedProjectPlanningRunInput(
  project: ProjectModel,
  options: ResolveScopedProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const base = resolveProjectPlanningRunInput(project, options)
  return {
    ...base,
    blueprintNodes: filterBlueprintPlanningRunNodes(base.blueprintNodes, options),
  }
}

export function buildProjectPlanningAgentInput(
  project: ProjectModel,
  options: ResolveScopedProjectPlanningRunInputOptions = {},
): ProjectPlanningAgentInput {
  const scoped = resolveScopedProjectPlanningRunInput(project, options)
  return {
    ...(scoped.tenantId === undefined ? {} : { tenantId: scoped.tenantId }),
    projectScopeKey: scoped.projectId,
    projectId: scoped.projectId,
    requirement: scoped.requirement,
    ...(scoped.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: scoped.planningAttachmentRef }),
    blueprintNodes: scoped.blueprintNodes.map((node) => ({
      nodeId: node.nodeId,
      title: node.title,
      blueprintKind: node.blueprintKind,
      nodeKind: node.nodeKind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    })),
  }
}

export function resolveProjectPlanningDomainRoot(
  options: ProjectPlanningAgentWorkflowBindingOptions,
  ctx: AiAgentRuntimeContext,
): ProjectModel {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('projectPlanning ProjectModel requires host.moduleInstanceId.')
  }
  const editor = options.getProjectPlanningEditor({ moduleInstanceId })
  if (editor.project.projectId !== moduleInstanceId) {
    throw new Error(
      `projectPlanning editor mismatch: expected "${moduleInstanceId}", got "${editor.project.projectId}".`,
    )
  }
  return editor.project
}

export function createProjectPlanningSystemPrompt(input: ProjectPlanningAgentInput): string {
  const context = formatProjectPlanningPromptContext({
    ...input,
    blueprintNodes: input.blueprintNodes,
  })
  return [
    `当前 projectPlanning 项目: ${input.projectId}`,
    context,
    '附件规则: 如果上下文出现 projectPlanningAttachmentRef，后端会在本轮 LLM 调用前临时解析 Word 并追加 [projectPlanningAttachmentText]；策划必须优先基于该正文，前端和项目模型只保存附件引用。',
    '知识索引: DTS ClassModel（ProjectModel 根模型）；只把 ClassModel 当作模型知识索引，项目策划语义只在 App 层本业务内编排。',
    '职责边界: LLM 只负责发出 model_script({ script }) tool_call；script 必须是 JavaScript async function body；禁止 TS/TSX/JSX、类型注解、import/export、函数包裹；运行时负责把 this 绑定到 ProjectModel 并执行脚本。',
    '执行规则: 不要把脚本写成普通文本回答；最终必须通过 model_script 的 script 字符串调用 this.xxx。',
    '知识查询规则: action 只用 model_action_guide({ kind: "ProjectModel", actionName }) 查询；attribute 才用 model_attribute_guide；replaceBlueprintChildren/readProjectPlanningInput/readBlueprintPlanningInputs 都是 action。',
    '参数契约规则: 不要查询 ProjectBlueprintTreeNodeData 当作 attribute；children 的结构来自 model_action_guide({ kind: "ProjectModel", actionName: "replaceBlueprintChildren" }) 的 paramsSchema.children。',
    '执行前查询: model_action_guide({ kind: "ProjectModel", actionName: "readProjectPlanningInput" }) + model_action_guide({ kind: "ProjectModel", actionName: "readBlueprintPlanningInputs" }) + model_action_guide({ kind: "ProjectModel", actionName: "replaceBlueprintChildren" })，然后 model_script 读取输入并写入 blueprint children。',
    '蓝图结构规则: 按真实产品语义生成 requirement/prototype/data-space/page/sub-page/report/workflow/integration/action/external/permission-management 等节点；module 可任意分级，不强制每个 module 直接包含 page。',
    '完成自检: agent_complete 会调用 ProjectModel.completeProjectPlanning({ summary })；如果返回失败，按 tool result 的 missingFacts/requiredCapabilities/知识恢复提示补查或补执行后再次 agent_complete。',
    '不要在 model_script 中直接调用 completeProjectPlanning；完成只通过 agent_complete FC 触发。',
    ...projectPlanningScriptSopLines(input.projectId),
    '输出要求: children 节点使用稳定英文 id/path，title/description 承载本轮产品需求的模块与页面概要；不调用 openPageDesign/writePageFile/readPageFileText。',
    '模型来源: generated/dts-class-model。',
  ].join('\n')
}

export function createProjectPlanningToolLoopNudge(context: {
  reason: 'plan_without_tool' | 'execution_phase' | 'model_script_retry'
  moduleInstanceId: string
}): string | undefined {
  const projectId = context.moduleInstanceId.trim()
  if (projectId.length === 0) return undefined
  switch (context.reason) {
    case 'plan_without_tool':
      return `projectId="${projectId}"；禁止只输出计划，下一回合必须发起 tool_call（见 model_action_guide / RECOVERY_HINT）。`
    case 'execution_phase':
      return `projectId="${projectId}"；目录/指南阶段已完成，直接 model_script：根对象是 this（ProjectModel），先 await this.readProjectPlanningInput() / await this.readBlueprintPlanningInputs()，完成后 await this.replaceBlueprintChildren({ children })；每个节点必须声明真实 blueprintKind，nodeKind 只用于可选运行交付投影。`
    case 'model_script_retry':
      return `projectId="${projectId}"；按 RECOVERY_HINT 修正后重试 model_script；项目蓝图必须包含至少一个有明确 blueprintKind 的业务节点。`
    default:
      return undefined
  }
}

export function evaluateProjectPlanningBeforeFunctionCall(
  options: AiAgentBeforeFunctionCallOptions,
): AiAgentBeforeFunctionCallDirective {
  const gate = evaluateProjectPlanningToolGate(options)
  if (gate.ok) {
    return { status: 'allow' }
  }
  return {
    status: 'reject',
    reason: gate.reason ?? 'projectPlanning gate rejected tool call.',
    ...(gate.fix === undefined ? {} : { fix: gate.fix }),
  }
}

/** Project Planning Gate Validation Result 的返回结果。 */
export type ProjectPlanningGateValidationResult = Readonly<{
  /** 是否通过 tool gate 校验。 */
  ok: boolean
  /** 拒绝原因（ok 为 false 时）。 */
  reason?: string
  /** 给 LLM 的修正建议（ok 为 false 时）。 */
  fix?: string
}>

const FORBIDDEN_SCRIPT_MARKERS = [
  'openPageDesign',
  'writePageFile',
  'setFileText',
  'getFileText',
  'editNodeTree',
  'editDataSet',
  'getNodeTree',
  'getDataSetTool',
] as const

const PROJECT_ACTION_NAMES = [
  'readProjectPlanningInput',
  'readBlueprintPlanningInputs',
  'replaceBlueprintChildren',
] as const

const PROJECT_PARAM_TYPE_NAMES = [
  'ProjectBlueprintTreeNodeData',
] as const

export function evaluateProjectPlanningToolGate(
  options: Pick<AiAgentBeforeFunctionCallOptions, 'toolName' | 'args'>,
): ProjectPlanningGateValidationResult {
  const toolName = normalizeProjectPlanningToolName(options.toolName)
  const actionLookupGate = evaluateProjectActionLookupGate(toolName, options.args)
  if (!actionLookupGate.ok) return actionLookupGate
  if (toolName !== 'model_script') {
    return { ok: true }
  }
  const script = readProjectPlanningModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenProjectPlanningScriptMarker(script)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: model_script 禁止调用 ${marker}；本阶段只处理项目蓝图策划，不涉及四文件或 openPageDesign。`,
    fix: '改用 readProjectPlanningInput / readBlueprintPlanningInputs / replaceBlueprintChildren 等 ProjectModel action；完成概要后 agent_complete。',
  }
}

function projectPlanningScriptSopLines(projectId: string): readonly string[] {
  return [
    'model_script 标准写法：以下内容必须作为 tool_call 参数 script 的 JavaScript 函数体交给运行时执行；不要作为自然语言回答。',
    '根对象就是 this（ProjectModel）；通过 this.replaceBlueprintChildren({ children }) 写入项目蓝图。',
    '每个节点必须写 blueprintKind；nodeKind 仅表达该节点是否投影为 module/page/system-page/action/external 等运行交付表面。',
    'const projectInput = await this.readProjectPlanningInput()',
    'const existingNodes = await this.readBlueprintPlanningInputs()',
    'const children = [',
    '  {',
    '    id: "core-module",',
    '    title: "核心模块",',
    '    blueprintKind: "module",',
    '    nodeKind: "module",',
    '    path: "/core",',
    '    description: projectInput.requirement,',
    '    children: [',
    '      { id: "core-requirement", title: "核心需求", blueprintKind: "requirement", nodeKind: "module", description: projectInput.requirement },',
    '      { id: "core-scenario", title: "核心数据空间", blueprintKind: "data-space", nodeKind: "module", description: "核心业务场景与前端模型边界" },',
    '      { id: "core-overview", title: "核心总览", blueprintKind: "page", nodeKind: "page", path: "/core/overview", description: "核心模块总览与关键任务入口" }',
    '    ]',
    '  }',
    ']',
    'const blueprintTree = await this.replaceBlueprintChildren({ children })',
    'if (!JSON.stringify(blueprintTree.children).includes(\'"blueprintKind"\')) throw new Error("projectPlanning requires typed blueprint nodes")',
    `return { kind: "projectPlanningResult", projectId: "${projectId}", blueprintTree, previousNodeCount: existingNodes.length }`,
  ]
}

function evaluateProjectActionLookupGate(
  toolName: string,
  args: AiAgentBeforeFunctionCallOptions['args'],
): ProjectPlanningGateValidationResult {
  if (toolName !== 'model_attribute_guide') return { ok: true }
  const kind = readProjectPlanningTextArg(args, 'kind')
  if (kind !== 'project') return { ok: true }
  const attributeName = readProjectPlanningTextArg(args, 'attributeName')
  if (attributeName === undefined || !isProjectActionName(attributeName)) {
    if (attributeName !== undefined && isProjectParamTypeName(attributeName)) {
      return {
        ok: false,
        reason: `projectPlanning: ${attributeName} 是参数结构名，不是 project attribute。`,
        fix: '改用 model_action_guide({ kind: "project", actionName: "replaceBlueprintChildren" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。',
      }
    }
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: ${attributeName} 是 ProjectModel action，不是 attribute。`,
    fix: `改用 model_action_guide({ kind: "project", actionName: "${attributeName}" })，然后在 model_script 中通过 this.${attributeName}(...) 调用。`,
  }
}

function readProjectPlanningModelScriptBody(args: AiAgentBeforeFunctionCallOptions['args']): string | undefined {
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenProjectPlanningScriptMarker(script: string): string | undefined {
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    if (script.includes(marker)) return marker
  }
  return undefined
}

function readProjectPlanningTextArg(args: AiAgentBeforeFunctionCallOptions['args'], key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isProjectActionName(value: string): value is typeof PROJECT_ACTION_NAMES[number] {
  return PROJECT_ACTION_NAMES.some(actionName => actionName === value)
}

function isProjectParamTypeName(value: string): value is typeof PROJECT_PARAM_TYPE_NAMES[number] {
  return PROJECT_PARAM_TYPE_NAMES.some(typeName => typeName === value)
}

function normalizeProjectPlanningToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}
