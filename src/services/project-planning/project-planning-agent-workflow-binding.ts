/**
 * @module app:services/project-planning/project-planning-agent-workflow-binding
 * 职责：承载 projectPlanning Agent Workflow 的应用侧领域 binding，连接 ProjectBlueprint、输入构造、prompt 和 gate。
 * 边界：不手写 workflow definition，不直接注册 AiAgentHost；只提供解释器所需 app 能力与领域纯函数。
 * AI用途：排查 projectPlanning AI 输入、prompt、gate 或 editorSource 接线时，用本模块确认迁移后的业务逻辑。
 */

import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentRuntimeContext,
} from '@spark-appworks/spark-ai/agent'
import type { ClassModelKnowledgeProvider } from '@spark-appworks/spark-ai/class-model'
import { deepClone, PROJECT_BLUEPRINT_NODE_KINDS } from '@spark-appworks/spark-utils'
import type {
  ProjectBlueprint,
  ProjectPlanningCompletionResult,
  ProjectWorkspace,
  ProjectBlueprintTreeNodeData,
} from '@spark-appworks/spark-project-model'
import { lowcodeProjectBlueprintFields, normalizeLowcodeProjectBlueprintRecords } from '@spark-appworks/spark-lowcode-api'
import type { BlueprintWorkspaceDataView } from '@/views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview'
import { planProjectBlueprintReplacement } from './project-planning-blueprint-diff'

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
  kind: string
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
  kind: string
  /** 节点短需求。 */
  requirement: string
  /** 节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
}>

/** Resolve Project Planning Run Input Options 的调用配置。 */
export type ResolveProjectPlanningRunInputOptions = Readonly<{
  /** Agent Run 可注入一次性需求，不写回 ProjectBlueprint。 */
  requirementOverride?: string
  /** Agent Run 或导入入口可注入一次性附件引用，不写回 ProjectBlueprint。 */
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
  /** 当前 inline DevSystem PageRuntime owner；headless run 不提供该能力。 */
  blueprintDataView?: BlueprintWorkspaceDataView
  /** 本次 AI run 内，按项目身份读取已确认的 DataView completion result；作用域不跨 run。 */
  getDataViewCompletionResult?: (projectId: string) => ProjectPlanningCompletionResult | undefined
  /** 仅在 DataView receipt 与正式树回读确认后记录本次 completion result。 */
  onDataViewCompletionConfirmed?: (projectId: string, result: ProjectPlanningCompletionResult) => void
  /** 在本次 run 发出唯一 DataView 写命令前原子占用写入位。 */
  tryBeginDataViewBlueprintWrite?: (projectId: string) => boolean
  /** 后续写入尝试被拒绝时通知当前 run，使 delivery 返回失败/部分完成。 */
  onRepeatedDataViewBlueprintWrite?: (projectId: string) => void
  /** Node/E2E 可注入非 Worker knowledge provider；浏览器生产默认使用 Worker provider。 */
  knowledge?: ClassModelKnowledgeProvider
}>

/** Read-only ProjectBlueprint surface exposed to dynamic planning scripts. */
export type ProjectPlanningBlueprintFacade = Readonly<{
  projectId: string
  blueprintTree: ProjectBlueprint['blueprintTree']
  flatRows: readonly unknown[]
  readProjectPlanningInput: ProjectBlueprint['readProjectPlanningInput']
  readBlueprintPlanningInputs: ProjectBlueprint['readBlueprintPlanningInputs']
  readBlueprintNodePlanningInput: ProjectBlueprint['readBlueprintNodePlanningInput']
  readPlanningProjection: ProjectBlueprint['readPlanningProjection']
  getChildNodes: (nodeId?: string) => readonly unknown[]
  findNodeById: (nodeId: string) => unknown
  completeProjectPlanning: ProjectBlueprint['completeProjectPlanning']
  replaceBlueprintChildren: ProjectBlueprint['replaceBlueprintChildren']
}> & Readonly<Record<string, unknown>>

type ProjectPlanningBlueprintGuardOptions = Pick<ProjectPlanningAgentWorkflowBindingOptions,
  'blueprintDataView' | 'getDataViewCompletionResult' | 'onDataViewCompletionConfirmed'
  | 'tryBeginDataViewBlueprintWrite' | 'onRepeatedDataViewBlueprintWrite'>

export function resolveProjectPlanningRunInput(
  project: ProjectBlueprint,
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
      kind: node.kind,
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
  project: ProjectBlueprint,
  nodeId: string,
): BlueprintPlanningRunInput {
  const node = project.readBlueprintNodePlanningInput(nodeId)
  return {
    nodeId: node.nodeId,
    title: node.title,
    kind: node.kind,
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
      lines.push(`- ${node.nodeId} (${node.kind}) ${node.title}`)
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
  project: ProjectBlueprint,
  options: ResolveScopedProjectPlanningRunInputOptions = {},
): ProjectPlanningRunInput {
  const base = resolveProjectPlanningRunInput(project, options)
  return {
    ...base,
    blueprintNodes: filterBlueprintPlanningRunNodes(base.blueprintNodes, options),
  }
}

export function buildProjectPlanningAgentInput(
  project: ProjectBlueprint,
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
      kind: node.kind,
      requirement: node.requirement,
      ...(node.planningAttachmentRef === undefined ? {} : { planningAttachmentRef: node.planningAttachmentRef }),
    })),
  }
}

export function resolveProjectPlanningDomainRoot(
  options: ProjectPlanningAgentWorkflowBindingOptions,
  ctx: AiAgentRuntimeContext,
): ProjectPlanningBlueprintFacade {
  const moduleInstanceId = ctx.moduleInstanceId.trim()
  if (moduleInstanceId.length === 0) {
    throw new Error('projectPlanning ProjectBlueprint requires host.moduleInstanceId.')
  }
  const editor = options.getProjectPlanningEditor({ moduleInstanceId })
  if (editor.project.projectId !== moduleInstanceId) {
    throw new Error(
      `projectPlanning editor mismatch: expected "${moduleInstanceId}", got "${editor.project.projectId}".`,
    )
  }
  return guardProjectPlanningBlueprint(editor.project, {
    ...(options.blueprintDataView === undefined ? {} : { blueprintDataView: options.blueprintDataView }),
    ...(options.getDataViewCompletionResult === undefined ? {} : { getDataViewCompletionResult: options.getDataViewCompletionResult }),
    ...(options.onDataViewCompletionConfirmed === undefined ? {} : { onDataViewCompletionConfirmed: options.onDataViewCompletionConfirmed }),
    ...(options.tryBeginDataViewBlueprintWrite === undefined ? {} : { tryBeginDataViewBlueprintWrite: options.tryBeginDataViewBlueprintWrite }),
    ...(options.onRepeatedDataViewBlueprintWrite === undefined ? {} : { onRepeatedDataViewBlueprintWrite: options.onRepeatedDataViewBlueprintWrite }),
  })
}

/** Make the already-authorized DataView row set the planning input source for this run. */
export function synchronizeProjectPlanningTreeFromDataView(project: ProjectBlueprint, owner: BlueprintWorkspaceDataView): void {
  if (owner.projectId !== project.projectId || !owner.hasTreeProjection || owner.dirty || owner.hasPendingChildCreate
    || owner.hasUnconfirmedSave || project.blueprintDirty) {
    throw new Error('项目策划 DataView 绑定要求同项目、完整已加载且无待保存修改的当前蓝图')
  }
  const authoritativeTree = owner.treeProjection()
  if (authoritativeTree.nodeId.startsWith('project-blueprint:')) throw new Error('项目策划 DataView 当前项目存在多个根节点，拒绝推断单一蓝图根')
  project.replaceBlueprintTree(authoritativeTree)
  project.markBlueprintClean('root')
}

const PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER =
  '项目蓝图策划暂不能提交：稳定 nodeId 尚不能由获准的 Base_NavigationInfo DataView rowid 表达。请保留策划结果，待正式身份合同支持后再提交。'

/**
 * Keep planning inputs readable through a detached, frozen facade. The live
 * ProjectBlueprint instance is never exposed to dynamic model_script code.
 */
function guardProjectPlanningBlueprint(
  project: ProjectBlueprint,
  options: ProjectPlanningBlueprintGuardOptions,
): ProjectPlanningBlueprintFacade {
  const owner = options.blueprintDataView
  if (owner) synchronizeProjectPlanningTreeFromDataView(project, owner)
  const snapshot = <T>(value: T): T => cloneFrozenPlanningValue(value)
  let confirmedDataViewCompletion: ReturnType<ProjectBlueprint['completeProjectPlanning']> | undefined
  let dataViewCommandStarted = false
  const tree = (): ProjectBlueprint['blueprintTree'] => owner?.treeProjection() ?? project.blueprintTree
  const flatten = (root: ProjectBlueprintTreeNodeData): ProjectBlueprintTreeNodeData[] => [root, ...(root.children ?? []).flatMap(flatten)]
  const addSingleChild = async (input: Parameters<ProjectBlueprint['replaceBlueprintChildren']>[0]): Promise<ProjectBlueprint['blueprintTree']> => {
    if (!owner) throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER)
    const alreadyCompleted = options.getDataViewCompletionResult?.(project.projectId)?.ok === true
    if (dataViewCommandStarted || alreadyCompleted) {
      options.onRepeatedDataViewBlueprintWrite?.(project.projectId)
      throw new Error('one DataView command per AI run is allowed; the additional blueprint plan change was rejected after the first DataView command started')
    }
    if (project.blueprintDirty || owner.dirty || owner.hasPendingChildCreate || owner.hasUnconfirmedSave || !owner.hasTreeProjection) {
      throw new Error('项目策划 DataView 命令要求干净且已完整加载的当前蓝图行集')
    }
    const requestedChildren = Array.isArray(input) ? input : input.children
    const before = owner.treeProjection()
    const plan = planProjectBlueprintReplacement(before, requestedChildren, { projectId: owner.projectId })
    for (const planned of plan.commands) {
      const missingFields = Object.entries(planned.fields).filter(([field, value]) => !owner.hasOutput(field)
        && !(planned.kind === 'create' && (value === '' || value === 0)))
      if (missingFields.length > 0) {
        throw new Error(`项目策划完整 DataView 计划字段未正式输出：${missingFields.map(([field]) => field).join(', ')}`)
      }
    }
    if (plan.commands.length !== 1 || plan.commands[0]?.kind !== 'create') {
      throw new Error('当前 DataView 仅支持一个完整预检后的单叶新增命令；更新、移动、删除、多节点或父子同批计划保持拒绝')
    }
    const createCommand = plan.commands[0]
    const added = plan.expectedTree.children.find(node => node.nodeId === createCommand.nodeId)
    if (!added || (added.children !== undefined && added.children.length > 0) || added.parentNodeId !== before.nodeId
      || createCommand.siblingIndex !== before.children.length || added.projectId !== owner.projectId) {
      throw new Error('当前 DataView 单节点规划命令只允许在现存项目根末尾新增一个同项目叶子节点')
    }
    const fields = Object.fromEntries(Object.entries(createCommand.fields)
      .filter(([field]) => field !== 'prowid' && owner.hasOutput(field)))
    if (options.tryBeginDataViewBlueprintWrite !== undefined && !options.tryBeginDataViewBlueprintWrite(project.projectId)) {
      options.onRepeatedDataViewBlueprintWrite?.(project.projectId)
      throw new Error('one DataView command per AI run is allowed; the additional blueprint plan change was rejected after the first DataView command started')
    }
    dataViewCommandStarted = true
    let id: string | number
    try {
      id = await owner.addChildNode(added.parentNodeId, fields, added.nodeId)
    } catch (error: unknown) {
      const pendingError = error instanceof Error ? error.message : String(error)
      const ownerState = owner
      if (Boolean(ownerState.hasUnconfirmedSave)) throw new Error(`项目策划 DataView 新增回执未知；保留原 DataView command，请沿工作台 Save All 核验：${pendingError}`)
      if (Boolean(ownerState.hasPendingChildCreate)) throw new Error(`项目策划 DataView 新增命令仍待回读；保留原 DataView command，请沿工作台 Save All 核验：${pendingError}`)
      throw error
    }
    if (String(id) !== added.nodeId) throw new Error('项目策划新增回执身份与稳定 nodeId 不一致')
    const confirmed = owner.treeProjection()
    const confirmedNode = flatten(confirmed).find(node => node.nodeId === added.nodeId && node.parentNodeId === added.parentNodeId)
    if (!confirmedNode) throw new Error('项目策划新增命令完成后，当前 DataView 树回读缺少目标节点')
    const confirmedRecord = normalizeLowcodeProjectBlueprintRecords([confirmedNode.source])[0]
    if (!confirmedRecord) throw new Error('项目策划新增回读不能还原为正式 Base_NavigationInfo 记录')
    const confirmedWire = lowcodeProjectBlueprintFields(confirmedRecord)
    const wireMismatches = Object.entries(fields).filter(([field, value]) => String(confirmedWire[field]) !== String(value))
    if (wireMismatches.length > 0) {
      throw new Error(`项目策划 DataView 正式回读与提交字段不一致：${wireMismatches.map(([field]) => field).join(', ')}`)
    }
    project.replaceBlueprintChildren(confirmed.children)
    confirmedDataViewCompletion = project.completeProjectPlanning()
    options.onDataViewCompletionConfirmed?.(project.projectId, confirmedDataViewCompletion)
    project.markBlueprintClean('root')
    return snapshot(project.blueprintTree)
  }
  const facade: ProjectPlanningBlueprintFacade = {
    __proto__: null,
    projectId: project.projectId,
    blueprintTree: snapshot(tree()),
    flatRows: snapshot(flatten(tree())),
    readProjectPlanningInput: () => snapshot(project.readProjectPlanningInput()),
    readBlueprintPlanningInputs: () => snapshot(project.readBlueprintPlanningInputs()),
    readBlueprintNodePlanningInput: (nodeId: string) => snapshot(project.readBlueprintNodePlanningInput(nodeId)),
    readPlanningProjection: () => snapshot(project.readPlanningProjection()),
    getChildNodes: (nodeId?: string) => {
      const root = tree()
      if (nodeId === undefined || nodeId === '') return snapshot([root])
      return snapshot(flatten(root).find(node => node.nodeId === nodeId)?.children ?? [])
    },
    findNodeById: (nodeId: string) => snapshot(flatten(tree()).find(node => node.nodeId === nodeId) ?? null),
    completeProjectPlanning: (input?: Parameters<ProjectBlueprint['completeProjectPlanning']>[0]) => {
      const completion = options.getDataViewCompletionResult?.(project.projectId) ?? confirmedDataViewCompletion
      if (completion?.ok !== true) {
        return snapshot(completion ?? project.completeProjectPlanning(input))
      }
      const summary = input?.summary?.trim()
      return snapshot({
        ...completion,
        ...(summary ? { summary } : {}),
      })
    },
    replaceBlueprintChildren: () => { throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER) },
  }
  // Keep the formal ProjectBlueprint action property in the declared facade;
  // install its async DataView implementation before exposing/freezing it.
  Object.defineProperty(facade, 'replaceBlueprintChildren', {
    configurable: true,
    enumerable: true,
    value: addSingleChild,
    writable: true,
  })
  Object.freeze(facade)
  return new Proxy(facade, {
    get(target, property) {
      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(target, property)) return target[property]
      if (typeof property === 'string') throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER)
      return undefined
    },
    set() { throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER) },
    deleteProperty() { throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER) },
    defineProperty() { throw new Error(PROJECT_PLANNING_BLUEPRINT_WRITE_BLOCKER) },
  })
}

function cloneFrozenPlanningValue<T>(value: T): T {
  return freezePlanningValue(deepClone(value))
}

function freezePlanningValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return value
    seen.add(value)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor !== undefined && 'value' in descriptor) freezePlanningValue(descriptor.value, seen)
    }
    Object.freeze(value)
  }
  return value
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
    '知识索引: DTS ClassModel（ProjectBlueprint 根模型）；只把 ClassModel 当作模型知识索引，项目策划语义只在 App 层本业务内编排。',
    '职责边界: LLM 只负责发出 model_script({ script }) tool_call；script 必须是 JavaScript async function body；禁止 TS/TSX/JSX、类型注解、import/export、函数包裹；运行时负责把 this 绑定到 ProjectBlueprint 并执行脚本。',
    '执行规则: 不要把脚本写成普通文本回答；最终必须通过 model_script 的 script 字符串调用 this.xxx。',
    '知识查询规则: action 只用 model_action_guide({ kind: "ProjectBlueprint", actionName }) 查询；attribute 才用 model_attribute_guide；replaceBlueprintChildren/readProjectPlanningInput/readBlueprintPlanningInputs 都是 action。',
    '参数契约规则: 不要查询 ProjectBlueprintTreeNodeData 当作 attribute；children 的结构来自 model_action_guide({ kind: "ProjectBlueprint", actionName: "replaceBlueprintChildren" }) 的 paramsSchema.children。',
    '执行前查询: model_action_guide({ kind: "ProjectBlueprint", actionName: "readProjectPlanningInput" }) + model_action_guide({ kind: "ProjectBlueprint", actionName: "readBlueprintPlanningInputs" }) + model_action_guide({ kind: "ProjectBlueprint", actionName: "replaceBlueprintChildren" })，然后 model_script 读取输入并写入 blueprint children。当前正式 DataView 命令仅支持原树不变时新增一个现存根下的叶子；任何更新、移动、删除、多节点或父子同批计划必须保留结果并停止，不能拆批或降级。',
    `蓝图结构规则: 正式节点种类仅为 ${PROJECT_BLUEPRINT_NODE_KINDS.join('/')}；unknown 仅用于读入草稿诊断，不得作为策划完成结果。module 可任意分级，不强制每个 module 直接包含 page。`,
    '完成自检: agent_complete 会调用 ProjectBlueprint.completeProjectPlanning({ summary })；如果返回失败，按 tool result 的 missingFacts/requiredCapabilities/知识恢复提示补查或补执行后再次 agent_complete。',
    '不要在 model_script 中直接调用 completeProjectPlanning；完成只通过 agent_complete FC 触发。',
    ...projectPlanningScriptSopLines(input.projectId),
    '输出要求: children 节点使用稳定英文 nodeId；parentNodeId/projectId 明确归属，kind 表达业务种类，capability.name/description 承载需求；navigation/dataSpace/prototype 按真实事实填写，source 保留后端源字段。场景 ID 仅放 dataSpace.scenarioId，不推导工具或物理模型身份。',
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
      return `projectId="${projectId}"；目录/指南阶段已完成，直接 model_script：根对象是 this（ProjectBlueprint），先 await this.readProjectPlanningInput() / await this.readBlueprintPlanningInputs()，再 await this.replaceBlueprintChildren({ children })。当前正式 DataView 命令仅支持原树不变时新增一个现存根下的叶子；更新、移动、删除、多节点或父子同批计划必须保持结果并停止，不能拆批或降级。每个节点必须声明真实 kind 与 capability，交付资源只写 navigation.target。`
    case 'model_script_retry':
      return `projectId="${projectId}"；按 RECOVERY_HINT 修正后重试 model_script；项目蓝图必须包含至少一个有明确 kind 的业务节点。`
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
    fix: '改用 readProjectPlanningInput / readBlueprintPlanningInputs / replaceBlueprintChildren 等 ProjectBlueprint action；完成概要后 agent_complete。',
  }
}

function projectPlanningScriptSopLines(projectId: string): readonly string[] {
  return [
    'model_script 标准写法：以下内容必须作为 tool_call 参数 script 的 JavaScript 函数体交给运行时执行；不要作为自然语言回答。',
    '根对象就是 this（ProjectBlueprint）；通过 this.replaceBlueprintChildren({ children }) 写入项目蓝图。',
    '每个节点必须写 nodeId/parentNodeId/projectId/kind/capability/source；navigation/dataSpace/prototype 是可选正式分组，不把旧平铺字段写入蓝图。',
    '当前运行时每次 AI run 最多提交一个新增叶子，且原树节点、顺序与拓扑必须完整保留；需要多节点、改动旧节点、移动或删除时不要调用写命令，也不要报告完整完成。',
    'const projectInput = await this.readProjectPlanningInput()',
    'const existingNodes = await this.readBlueprintPlanningInputs()',
    'const parentNodeId = this.blueprintTree.nodeId',
    'const children = [...this.blueprintTree.children, {',
    '  nodeId: "core-overview",',
    '  parentNodeId,',
    `  projectId: "${projectId}",`,
    '  kind: "page",',
    '  capability: { name: "核心总览", description: projectInput.requirement },',
    '  source: {},',
    '}]',
    'const blueprintTree = await this.replaceBlueprintChildren({ children })',
    'if (!blueprintTree.children.some(node => node.kind && node.kind !== "unknown")) throw new Error("projectPlanning requires typed blueprint nodes")',
    `return { kind: "projectPlanningResult", projectId: "${projectId}", blueprintTree, previousNodeCount: existingNodes.length }`,
  ]
}

function evaluateProjectActionLookupGate(
  toolName: string,
  args: AiAgentBeforeFunctionCallOptions['args'],
): ProjectPlanningGateValidationResult {
  if (toolName !== 'model_attribute_guide') return { ok: true }
  const kind = readProjectPlanningTextArg(args, 'kind')
  if (kind !== 'ProjectBlueprint') return { ok: true }
  const attributeName = readProjectPlanningTextArg(args, 'attributeName')
  if (attributeName === undefined || !isProjectActionName(attributeName)) {
    if (attributeName !== undefined && isProjectParamTypeName(attributeName)) {
      return {
        ok: false,
        reason: `projectPlanning: ${attributeName} 是参数结构名，不是 project attribute。`,
        fix: '改用 model_action_guide({ kind: "ProjectBlueprint", actionName: "replaceBlueprintChildren" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。',
      }
    }
    return { ok: true }
  }
  return {
    ok: false,
    reason: `projectPlanning: ${attributeName} 是 ProjectBlueprint action，不是 attribute。`,
    fix: `改用 model_action_guide({ kind: "ProjectBlueprint", actionName: "${attributeName}" })，然后在 model_script 中通过 this.${attributeName}(...) 调用。`,
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
