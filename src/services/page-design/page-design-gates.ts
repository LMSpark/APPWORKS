/**
 * @module app:services/page-design-gates
 * 职责：提供应用运行时 service 层的 page design gates 能力，连接项目模型、AI Agent、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * pageDesign 人工闸门：从 readPlanningProjection 读取 effectiveDescription / implGate，fail-fast 拒绝未放行页面。
 * allowedOperations 非空时，对 model_script 做操作域 marker 硬拦截。
 */
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type {
  PageNodeFileName,
  ProjectBlueprintImplGate,
  ProjectPageNodeSummary,
} from '@spark-appworks/spark-project-model'

/** 页面设计允许的操作域：每项 true=放行 / false=硬拦截 / undefined=不限制 */
export type PageDesignAllowedOperations = Readonly<{
  /** 是否允许读写节点树（editNodeTree / getNodeTree） */
  nodeTree?: boolean
  /** 是否允许读写数据集（editDataSet / getDataSetTool） */
  dataSet?: boolean
  /** 是否允许读写脚本（setFileText / getFileText / writePageFile） */
  script?: boolean
  /** 是否允许读写样式（setFileText / getFileText / writePageFile） */
  style?: boolean
  /** 是否允许读写项目蓝图（replaceBlueprintChildren / readBlueprintPlanningInputs） */
  blueprint?: boolean
}>

const PAGE_DESIGN_OPERATION_KEYS: ReadonlyArray<keyof PageDesignAllowedOperations> = [
  'nodeTree',
  'dataSet',
  'script',
  'style',
  'blueprint',
]

/** 页面设计运行上下文：绑定到 pageId，控制本次 run 的操作域与输出约束 */
export type PageDesignRunContext = Readonly<{
  /** 操作域白名单，非空时 model_script 中的 API 调用受 marker 硬拦截 */
  allowedOperations?: PageDesignAllowedOperations
  /** 交付阶段允许保存的文件名列表；为空时不限制输出文件范围 */
  deliverySaveFileNames?: readonly PageNodeFileName[]
}>

export function isPageDesignDataSetOnlyMode(
  allowedOperations?: PageDesignAllowedOperations,
): boolean {
  if (allowedOperations === undefined) return false
  return allowedOperations.dataSet === true
    && allowedOperations.nodeTree === false
    && allowedOperations.script === false
    && allowedOperations.style === false
    && allowedOperations.blueprint === false
}

const pageDesignRunContexts = new Map<string, PageDesignRunContext>()

export function bindPageDesignRunContext(pageId: string, context: PageDesignRunContext): void {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageDesign run context requires a non-empty pageId.')
  }
  pageDesignRunContexts.set(normalized, context)
}

export function clearPageDesignRunContext(pageId: string): void {
  pageDesignRunContexts.delete(pageId.trim())
}

export function readPageDesignRunContext(pageId: string): PageDesignRunContext | undefined {
  return pageDesignRunContexts.get(pageId.trim())
}

export function bindPageDesignRunContextFromAgentArgs(
  pageId: string,
  args: Record<string, unknown>,
): void {
  const patch = readPageDesignRunContextFromAgentArgs(args)
  if (patch === undefined) return
  const existing = readPageDesignRunContext(pageId)
  bindPageDesignRunContext(pageId, {
    ...(existing ?? {}),
    ...patch,
  })
}

function readPageDesignRunContextFromAgentArgs(
  args: Record<string, unknown>,
): PageDesignRunContext | undefined {
  const allowedOperations = readAllowedOperationsFromAgentArgs(args)
  const deliverySaveFileNames = readDeliverySaveFileNamesFromAgentArgs(args)
  if (allowedOperations === undefined && deliverySaveFileNames === undefined) return undefined
  return {
    ...(allowedOperations === undefined ? {} : { allowedOperations }),
    ...(deliverySaveFileNames === undefined ? {} : { deliverySaveFileNames }),
  }
}

function readAllowedOperationsFromAgentArgs(
  args: Record<string, unknown>,
): PageDesignAllowedOperations | undefined {
  const value = args['allowedOperations']
  if (!isJsonRecord(value)) return undefined
  const record = value
  const allowedOperations: {
    -readonly [K in keyof PageDesignAllowedOperations]?: boolean
  } = {}
  let hasExplicitField = false
  for (const key of PAGE_DESIGN_OPERATION_KEYS) {
    const field = record[key]
    if (typeof field !== 'boolean') continue
    hasExplicitField = true
    allowedOperations[key] = field
  }
  return hasExplicitField ? allowedOperations : undefined
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readDeliverySaveFileNamesFromAgentArgs(
  args: Record<string, unknown>,
): readonly PageNodeFileName[] | undefined {
  const value = args['deliverySaveFileNames']
  if (!Array.isArray(value)) return undefined
  const names = value.filter((item): item is PageNodeFileName => typeof item === 'string')
  return names.length > 0 ? names : undefined
}

/** Page Design Run Mode 的语义模型。 */
export type PageDesignRunMode = 'create' | 'update' | 'fix'

/** 页面设计闸门状态：三重校验（策划就绪 + 实现闸门 + 上游契约），全部通过才允许运行 */
export type PageDesignGateState = Readonly<{
  /** 页面 ID，对应 ProjectPageNodeSummary.pageId */
  pageId: string
  /** effectiveDescription 非空即视为策划就绪。 */
  planningReady: boolean
  /** 实现闸门：closed=人工尚未放行 / open=已放行可执行；未声明时由 strictImplGate 决定默认值 */
  implGate: ProjectBlueprintImplGate
  /** 上游数据契约（iPaaS / pagedata）是否已就绪；未声明时默认 true（过渡兼容） */
  upstreamContractsSatisfied: boolean
}>

/** Read Page Design Gate State Options 的调用配置。 */
export type ReadPageDesignGateStateOptions = Readonly<{
  /** 未声明 implGate 时是否视为 closed；默认 false（过渡兼容）。 */
  strictImplGate?: boolean
}>

/** 闸门校验结果：ok=true 放行，ok=false 附带 code / reason / fix 供诊断 */
export type PageDesignGateValidationResult = Readonly<{
  /** 是否通过闸门校验 */
  ok: boolean
  /** 闸门拒绝代码：PLANNING_DRAFT / IMPL_GATE_CLOSED / UPSTREAM_CONTRACTS_UNSATISFIED，通过时为空 */
  code?: string
  /** 人类可读拒绝原因 */
  reason?: string
  /** 人类可读修复建议 */
  fix?: string
}>

const MUTATION_TOOL_NAMES = new Set([
  'model_script',
  'writepagefile',
  'openpagedesign',
])

export function readPageDesignGateState(
  summary: ProjectPageNodeSummary,
  options: ReadPageDesignGateStateOptions = {},
): PageDesignGateState {
  const planningReady = summary.effectiveDescription.trim().length > 0
  const implGate = readImplGate(summary, options.strictImplGate === true)
  const upstreamContractsSatisfied = readUpstreamContractsSatisfied(summary)

  return {
    pageId: summary.pageId,
    planningReady,
    implGate,
    upstreamContractsSatisfied,
  }
}

export function validatePageDesignRunGate(
  state: PageDesignGateState,
  _mode: PageDesignRunMode = 'update',
): PageDesignGateValidationResult {
  if (!state.planningReady) {
    return {
      ok: false,
      code: 'PLANNING_DRAFT',
      reason: `page "${state.pageId}" effectiveDescription 为空，策划尚未定稿。`,
      fix: '补全项目蓝图节点 description / descriptionContext，使 effectiveDescription 非空后再运行 pageDesign。',
    }
  }

  if (state.implGate !== 'open') {
    return {
      ok: false,
      code: 'IMPL_GATE_CLOSED',
      reason: `page "${state.pageId}" implGate=closed，实现闸门未放行。`,
      fix: '人工确认数据流与上游契约后，将项目蓝图节点 meta.implGate 设为 open，再运行 pageDesign。',
    }
  }

  if (!state.upstreamContractsSatisfied) {
    return {
      ok: false,
      code: 'UPSTREAM_CONTRACTS_UNSATISFIED',
      reason: `page "${state.pageId}" upstreamContractsSatisfied=false，上游数据契约未就绪。`,
      fix: '补齐 iPaaS / pagedata 契约或等待联调通过，再将 upstreamContractsSatisfied 设为 true。',
    }
  }

  return { ok: true }
}

export function assertPageDesignRunGateAllowed(
  summary: ProjectPageNodeSummary,
  mode: PageDesignRunMode = 'update',
  options: ReadPageDesignGateStateOptions = {},
): void {
  const state = readPageDesignGateState(summary, options)
  const result = validatePageDesignRunGate(state, mode)
  if (result.ok) return
  throw new Error(formatPageDesignGateFailure(result))
}

const OPERATION_FALSE_SCRIPT_MARKERS = {
  nodeTree: ['editNodeTree', 'getNodeTree'],
  dataSet: ['editDataSet', 'getDataSetTool'],
  script: ['setFileText', 'getFileText', 'writePageFile'],
  style: ['setFileText', 'getFileText', 'writePageFile'],
  blueprint: [
    'replaceBlueprintChildren',
    'readBlueprintPlanningInputs',
    'readProjectPlanningInput',
  ],
} as const satisfies Record<keyof PageDesignAllowedOperations, readonly string[]>

/** 变更类工具闸门评估参数 */
export type EvaluatePageDesignMutationToolGateOptions = Readonly<{
  /** 待评估的工具名（如 model_script / writepagefile / openpagedesign） */
  toolName: string
  /** 页面摘要，用于读取闸门状态 */
  summary: ProjectPageNodeSummary
  /** 运行模式：create=首次创建 / update=迭代更新 / fix=修复，当前仅影响语义标注 */
  mode?: PageDesignRunMode
  /** 读取闸门状态时的配置项 */
  gateOptions?: ReadPageDesignGateStateOptions
  /** 操作域白名单，非空时对 model_script 做 marker 硬拦截 */
  allowedOperations?: PageDesignAllowedOperations
  /** 工具调用参数，用于提取 model_script 的 script 体做 marker 扫描 */
  toolArgs?: JsonParams
}>

export function evaluatePageDesignMutationToolGate(
  options: EvaluatePageDesignMutationToolGateOptions,
): PageDesignGateValidationResult {
  if (!isPageDesignMutationTool(options.toolName)) {
    return { ok: true }
  }
  const state = readPageDesignGateState(options.summary, options.gateOptions)
  const runGate = validatePageDesignRunGate(state, options.mode ?? 'update')
  if (!runGate.ok) return runGate
  return evaluatePageDesignScriptOperationGate({
    toolName: options.toolName,
    ...(options.toolArgs === undefined ? {} : { args: options.toolArgs }),
    ...(options.allowedOperations === undefined ? {} : { allowedOperations: options.allowedOperations }),
  })
}

/** model_script 操作域闸门评估参数（仅针对 model_script 工具的 script 体 marker 扫描） */
export type EvaluatePageDesignScriptOperationGateOptions = Readonly<{
  /** 工具名，仅 normalize 后为 model_script 时才执行 marker 扫描 */
  toolName: string
  /** 工具调用参数，用于提取 script 字段做 marker 扫描 */
  args?: JsonParams
  /** 操作域白名单，非空时对 script 中的 API 调用做 marker 硬拦截 */
  allowedOperations?: PageDesignAllowedOperations
}>

export function evaluatePageDesignScriptOperationGate(
  options: EvaluatePageDesignScriptOperationGateOptions,
): PageDesignGateValidationResult {
  if (options.allowedOperations === undefined) {
    return { ok: true }
  }
  if (normalizeToolName(options.toolName) !== 'model_script') {
    return { ok: true }
  }
  const script = readModelScriptBody(options.args)
  if (script === undefined) {
    return { ok: true }
  }
  const marker = findForbiddenScriptMarker(script, options.allowedOperations)
  if (marker === undefined) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: `pageDesign: model_script 禁止调用 ${marker}；当前 allowedOperations 未放行该操作域。`,
    fix: '调整 allowedOperations，或改写 script 只调用已放行的 API（如 editDataSet / editNodeTree）。',
  }
}

export function isPageDesignMutationTool(toolName: string): boolean {
  return MUTATION_TOOL_NAMES.has(normalizeToolName(toolName))
}

function readImplGate(summary: ProjectPageNodeSummary, strictImplGate: boolean): ProjectBlueprintImplGate {
  if (summary.implGate === 'closed' || summary.implGate === 'open') {
    return summary.implGate
  }
  return strictImplGate ? 'closed' : 'open'
}

function readUpstreamContractsSatisfied(summary: ProjectPageNodeSummary): boolean {
  const value = summary.upstreamContractsSatisfied
  if (typeof value === 'boolean') return value
  return true
}

function readModelScriptBody(args: JsonParams | undefined): string | undefined {
  if (args === undefined) return undefined
  const script = args['script']
  if (typeof script !== 'string') return undefined
  const trimmed = script.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function findForbiddenScriptMarker(
  script: string,
  allowedOperations: PageDesignAllowedOperations,
): string | undefined {
  for (const operation of PAGE_DESIGN_OPERATION_KEYS) {
    if (allowedOperations[operation] !== false) continue
    for (const marker of OPERATION_FALSE_SCRIPT_MARKERS[operation]) {
      if (script.includes(marker)) return marker
    }
  }
  return undefined
}

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/[^a-z0-9_]/gu, '')
}

function formatPageDesignGateFailure(result: PageDesignGateValidationResult): string {
  const reason = result.reason ?? 'pageDesign gate rejected.'
  const fix = result.fix === undefined ? '' : ` ${result.fix}`
  return `${reason}${fix}`
}
