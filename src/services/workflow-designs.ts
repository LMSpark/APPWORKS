/**
 * @module app:services/workflow-designs
 * 职责：提供 workflow 设计稿的 JSON 文件读写与 Dify-like graph 节点解析能力。
 * 边界：只处理编辑态 workflow design，不执行 Agent workflow 运行时。
 * AI用途：排查 workflow design、业务节点、ClassModel model context 或边投影时，用本模块确认前端接线。
 */
import {
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
} from '@spark-appworks/spark-ai/agent'
import type * as SparkAgent from '@spark-appworks/spark-ai/agent'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

export type JsonRecord = Record<string, unknown>

export type WorkflowDesignSummary = {
  workflowId: string
  filename: string
  timestamp: string
  title?: string
  version?: number
  status?: string
  error?: string
}

export type WorkflowDesignWriteResult = {
  ok: boolean
  workflowId: string
  filename: string
  timestamp: string
}

export type WorkflowDesignReadResult = {
  workflowId: string
  filename: string
  timestamp: string
  document?: WorkflowDesignDocument
  notModified?: boolean
}

export type WorkflowDefinitionReadResult = {
  workflowId: string
  filename: string
  timestamp: string
  definition?: SparkAgent.AgentWorkflowDefinition
  notModified?: boolean
}

export type WorkflowDesignDeleteResult = {
  ok: boolean
  workflowId: string
  deleted: string[]
}

export type WorkflowDesignDocument = {
  kind: 'agent.workflow.design'
  version: number
  id: string
  workflow: {
    id: string
    version: number
    variables?: WorkflowDesignVariable[]
    capabilities?: WorkflowDesignCapability[]
    runtimeBinding?: SparkAgent.AgentWorkflowNodeRuntimeBinding
    graph: WorkflowDesignGraph
    [key: string]: unknown
  }
  x_spark: {
    schema?: string
    designer?: JsonRecord
    draft?: JsonRecord
    validation?: JsonRecord
    history?: JsonRecord
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type WorkflowDesignVariable = {
  name: string
  title?: string
  required?: boolean
  schema?: JsonRecord
  defaultValue?: unknown
  [key: string]: unknown
}

export type WorkflowDesignCapability = {
  id: string
  title: string
  scope: string
  description: string
  inputs?: JsonRecord
  outputs?: JsonRecord
  constraints?: string[]
  [key: string]: unknown
}

export type WorkflowDesignGraph = {
  id?: string
  nodes: WorkflowDesignGraphNode[]
  lines: WorkflowDesignGraphLine[]
  viewport?: {
    x?: number
    y?: number
    zoom?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type WorkflowDesignGraphNode = {
  id: string
  type: string
  position?: {
    x?: number
    y?: number
    [key: string]: unknown
  }
  data?: WorkflowDesignNodeData
  [key: string]: unknown
}

export type WorkflowDesignLineEndpoint = {
  nodeId: string
  modelId: string
  memberName: string
  dock?: number
  [key: string]: unknown
}

export type WorkflowDesignLineType = 'orthogonal' | 'straight' | 'bezier'

export type WorkflowDesignLineControlPoint = Readonly<{
  x: number
  y: number
}>

export type WorkflowDesignLineVisual = {
  lineType?: WorkflowDesignLineType
  controlPoints?: WorkflowDesignLineControlPoint[]
  [key: string]: unknown
}

export type WorkflowDesignLineData = {
  visual?: WorkflowDesignLineVisual
  [key: string]: unknown
}

export type WorkflowDesignGraphLine = {
  id?: string
  from: WorkflowDesignLineEndpoint
  to: WorkflowDesignLineEndpoint
  type?: string
  data?: WorkflowDesignLineData
  [key: string]: unknown
}

export type WorkflowDesignNodeData = {
  type?: string
  title?: string
  desc?: string
  inputs?: JsonRecord
  outputs?: JsonRecord
  capabilities?: WorkflowDesignCapability[]
  models?: JsonRecord[]
  llm?: JsonRecord
  validation?: JsonRecord
  state?: JsonRecord
  result?: JsonRecord
  loop?: WorkflowDesignNestedGraphCarrier
  iteration?: WorkflowDesignNestedGraphCarrier
  x_spark?: WorkflowDesignSparkNodeMeta
  [key: string]: unknown
}

export type WorkflowDesignNestedGraphCarrier = {
  mode?: string
  maxLoopCount?: number
  exitNodeId?: string
  subGraph?: WorkflowDesignGraph
  [key: string]: unknown
}

export type WorkflowDesignSparkNodeMeta = {
  nodeRole?: string
  [key: string]: unknown
}

export type WorkflowDesignNodeView = {
  key: string
  id: string
  title: string
  nodeType: string
  depth: number
  scopePath: string
  ancestry: string[]
  node: WorkflowDesignGraphNode
  graph: WorkflowDesignGraph
  isBusinessNode: boolean
  isBoundaryNode: boolean
  isWorkflowNode: boolean
  isSingleModelEditTool: boolean
  isProcessStageNode: boolean
}

export type WorkflowDesignGraphView = {
  key: string
  id: string
  title: string
  depth: number
  scopePath: string
  graph: WorkflowDesignGraph
  carrier: 'root' | 'loop' | 'iteration'
  ownerNodeId?: string
  ownerNode?: WorkflowDesignGraphNode
}

export type WorkflowDesignLineView = {
  key: string
  id: string
  from: WorkflowDesignLineEndpoint
  to: WorkflowDesignLineEndpoint
  fromNodeId: string
  toNodeId: string
  depth: number
  scopePath: string
  graph: WorkflowDesignGraph
  line: WorkflowDesignGraphLine
  fromNode?: WorkflowDesignGraphNode
  toNode?: WorkflowDesignGraphNode
}

export type WorkflowDesignNodeCreateKind = 'node' | 'start' | 'output'

export type WorkflowDesignNodeCreateInput = {
  nodeKind: WorkflowDesignNodeCreateKind
  id?: string
  title?: string
  desc?: string
  position?: {
    x?: number
    y?: number
  }
}

export type WorkflowDesignNodeRemoveResult = {
  removed: boolean
  removedLines: WorkflowDesignGraphLine[]
}

export type WorkflowDesignLinePatch = {
  from?: WorkflowDesignLineEndpoint
  to?: WorkflowDesignLineEndpoint
  type?: string
  relation?: string
  lineType?: WorkflowDesignLineType
  controlPoints?: readonly WorkflowDesignLineControlPoint[]
}

export type WorkflowDesignAutoLayoutGraphResult = {
  scopePath: string
  changedNodePositions: boolean
  changedViewport: boolean
}

export type WorkflowDesignAutoLayoutResult = {
  changed: boolean
  graphs: WorkflowDesignAutoLayoutGraphResult[]
}

export type CreateAgentWorkflowDefinitionFromDesignOptions = {
  publishedAt?: string
}

type WorkflowDesignAutoLayoutNodePosition = Readonly<{
  node: WorkflowDesignGraphNode
  x: number
  y: number
}>

type WorkflowDesignAutoLayoutNode = {
  node: WorkflowDesignGraphNode
  originalIndex: number
  rank: number
  lane: number
  mainPath: boolean
  preferredLane: number | null
}

type WorkflowDesignAutoLayoutLineCandidate = Readonly<{
  line: WorkflowDesignGraphLine
  originalIndex: number
  fromIndex: number
  toIndex: number
}>

type CollectWorkflowDesignNodeCommand = Readonly<{
  graph: WorkflowDesignGraph
  scopePath: string
  depth: number
  ancestry: string[]
}>

type CollectWorkflowDesignNestedNodeCommand = Readonly<{
  node: WorkflowDesignGraphNode
  scopePath: string
  depth: number
  ancestry: string[]
}>

type CreateWorkflowDefinitionNodeCommand<
  TType extends SparkAgent.AgentWorkflowGraphNodeType,
  TData extends SparkAgent.AgentWorkflowJsonRecord,
> = Readonly<{
  id: string
  type: TType
  data: TData
  position: WorkflowDesignGraphNode['position']
}>

const PLACEHOLDER_MODEL_ROOT_CLASS_NAME = 'spark.placeholder.RootModel'
const PLACEHOLDER_MODEL_CLASS_NAME = 'spark.placeholder.Model'
const PLACEHOLDER_MODEL_ID = 'spark.placeholder.model'
const PLACEHOLDER_VALIDATION_ACTION_NAME = 'spark.placeholder.validate'
const PLACEHOLDER_RUNTIME_ID = 'spark.placeholder.workflow'
const WORKFLOW_AUTO_LAYOUT_START_X = 40
const WORKFLOW_AUTO_LAYOUT_START_Y = 40
const WORKFLOW_AUTO_LAYOUT_STEP_X = 340
const WORKFLOW_AUTO_LAYOUT_STEP_Y = 210

export async function listWorkflowDesigns(): Promise<WorkflowDesignSummary[]> {
  const entries = await lowcodeApi.design.listFiles({
    appType: 'designfile',
    folderPath: workflowDesignRoot(),
  })
  return entries.map((entry) => ({
    workflowId: entry.name,
    filename: 'design.json',
    timestamp: entry.lastModified === null ? '' : String(entry.lastModified),
  }))
}

export function createWorkflowDesign(input: {
  workflowId: string
  title?: string
}): Promise<WorkflowDesignWriteResult> {
  void input
  return Promise.reject(workflowMutationUnavailable())
}

export async function readWorkflowDesign(
  workflowId: string,
  timestamp?: string,
): Promise<WorkflowDesignReadResult> {
  void timestamp
  const content = await readWorkflowText(workflowId, 'design.json')
  return {
    workflowId,
    filename: 'design.json',
    timestamp: '',
    document: parseWorkflowDesignJson(content),
  }
}

export function saveWorkflowDesign(
  workflowId: string,
  document: WorkflowDesignDocument,
): Promise<WorkflowDesignWriteResult> {
  void workflowId
  void document
  return Promise.reject(workflowMutationUnavailable())
}

export async function readWorkflowDefinition(
  workflowId: string,
  timestamp?: string,
): Promise<WorkflowDefinitionReadResult> {
  void timestamp
  const content = await readWorkflowText(workflowId, 'definition.json')
  const definition: unknown = JSON.parse(content)
  assertAgentWorkflowDefinition(definition)
  return {
    workflowId,
    filename: 'definition.json',
    timestamp: '',
    definition,
  }
}

export function saveWorkflowDefinition(
  workflowId: string,
  definition: SparkAgent.AgentWorkflowDefinition,
): Promise<WorkflowDesignWriteResult> {
  void workflowId
  void definition
  return Promise.reject(workflowMutationUnavailable())
}

export function publishWorkflowDefinition(
  workflowId: string,
  definition: SparkAgent.AgentWorkflowDefinition,
): Promise<WorkflowDesignWriteResult> {
  void workflowId
  void definition
  return Promise.reject(workflowMutationUnavailable())
}

export function deleteWorkflowDesign(workflowId: string): Promise<WorkflowDesignDeleteResult> {
  void workflowId
  return Promise.reject(workflowMutationUnavailable())
}

export function createAgentWorkflowDefinitionFromDesign(
  document: WorkflowDesignDocument,
  options: CreateAgentWorkflowDefinitionFromDesignOptions = {},
): SparkAgent.AgentWorkflowDefinition {
  const issues = collectDefinitionPublishIssues(document)
  const validation = createAgentWorkflowDefinitionValidation(issues)
  const workflowExtras = normalizeDefinitionWorkflowExtras(document.workflow)
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: document.workflow.id,
    source: {
      designKind: document.kind,
      designId: document.id,
      designVersion: document.version,
    },
    workflow: {
      ...workflowExtras,
      variables: normalizeDefinitionVariables(document.workflow.variables),
      capabilities: normalizeDefinitionCapabilities(document.workflow.capabilities),
      runtimeBinding: normalizeWorkflowRuntimeBinding(document.workflow.runtimeBinding),
      graph: {
        nodes: document.workflow.graph.nodes.map(toDefinitionNode),
        lines: document.workflow.graph.lines.map(toDefinitionLine),
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: options.publishedAt ?? new Date().toISOString(),
      validation,
    },
  }
}

export function parseAgentWorkflowDefinitionJson(text: string): SparkAgent.AgentWorkflowDefinition {
  const parsed: unknown = JSON.parse(text)
  assertAgentWorkflowDefinition(parsed)
  return parsed
}

export function parseWorkflowDesignJson(text: string): WorkflowDesignDocument {
  const parsed: unknown = JSON.parse(text)
  assertWorkflowDesignDocument(parsed)
  return parsed
}

export function isWorkflowDefinitionNotFoundError(error: unknown): boolean {
  const status = readErrorStatus(error)
  if (status === 404) return true

  const message = error instanceof Error ? error.message : String(error)
  return message.includes('No static resource')
    && message.includes('workflow-designs')
    && message.includes('definition.json')
}

export function collectWorkflowDesignNodes(document: WorkflowDesignDocument): WorkflowDesignNodeView[] {
  return collectGraphNodes({
    graph: document.workflow.graph,
    scopePath: 'workflow.graph',
    depth: 0,
    ancestry: [],
  })
}

export function collectWorkflowDesignGraphs(document: WorkflowDesignDocument): WorkflowDesignGraphView[] {
  const root: WorkflowDesignGraphView = {
    key: 'workflow.graph',
    id: typeof document.workflow.graph.id === 'string' && document.workflow.graph.id.length > 0
      ? document.workflow.graph.id
      : `${document.workflow.id}.graph`,
    title: 'Main Graph',
    depth: 0,
    scopePath: 'workflow.graph',
    graph: document.workflow.graph,
    carrier: 'root',
  }
  return [root, ...collectNestedGraphViews(document.workflow.graph, 'workflow.graph', 0)]
}

export function collectWorkflowDesignLines(document: WorkflowDesignDocument): WorkflowDesignLineView[] {
  return collectWorkflowDesignGraphs(document).flatMap(view => collectGraphLines(view))
}

export function autoLayoutWorkflowDesignGraphs(document: WorkflowDesignDocument): WorkflowDesignAutoLayoutResult {
  const graphs = collectWorkflowDesignGraphs(document).map(view => autoLayoutWorkflowDesignGraph(view))
  return {
    changed: graphs.some(graph => graph.changedNodePositions || graph.changedViewport),
    graphs,
  }
}

export function isSingleModelEditToolNode(_node: WorkflowDesignGraphNode): boolean {
  return false
}

export function isProcessStageNode(_node: WorkflowDesignGraphNode): boolean {
  return false
}

export function getSingleModelEditValue(node: WorkflowDesignGraphNode): unknown {
  return node.data?.inputs ?? {}
}

export function setSingleModelEditValue(node: WorkflowDesignGraphNode, value: unknown): void {
  const data = ensureNodeData(node)
  data.inputs = isJsonRecord(value) ? value : {}
}

export function ensureWorkflowDraft(document: WorkflowDesignDocument): JsonRecord {
  const spark = ensureDocumentSpark(document)
  return ensureRecord(spark, 'draft')
}

export function markWorkflowDesignDirty(document: WorkflowDesignDocument, dirtyPath: string): void {
  const draft = ensureWorkflowDraft(document)
  draft['status'] = 'dirty'
  const dirtyPaths = Array.isArray(draft['dirtyPaths']) ? dirtyPathsFromDraft(draft) : []
  if (!dirtyPaths.includes(dirtyPath)) {
    dirtyPaths.push(dirtyPath)
  }
  draft['dirtyPaths'] = dirtyPaths
}

export function markWorkflowDesignSaved(document: WorkflowDesignDocument): void {
  const draft = ensureWorkflowDraft(document)
  draft['status'] = 'saved'
  draft['dirtyPaths'] = []
}

export function addWorkflowDesignLine(
  graph: WorkflowDesignGraph,
  fromNodeId: string,
  toNodeId: string,
): WorkflowDesignGraphLine {
  const line: WorkflowDesignGraphLine = {
    id: nextLineId(graph, fromNodeId, toNodeId),
    from: createDefaultLineEndpoint(fromNodeId, 'out'),
    to: createDefaultLineEndpoint(toNodeId, 'in'),
    type: 'custom',
    data: {
      branch: {
        label: 'default',
        default: true,
      },
      validation: {},
      visual: {
        lineType: 'orthogonal',
        controlPoints: [],
      },
    },
  }
  graph.lines.push(line)
  return line
}

export function createWorkflowDesignNode(
  graph: WorkflowDesignGraph,
  input: WorkflowDesignNodeCreateInput,
): WorkflowDesignGraphNode {
  const nodeId = nextNodeId(graph, input.id ?? defaultNodeId(input.nodeKind))
  const position = normalizePosition(input.position, graph.nodes.length)
  const node: WorkflowDesignGraphNode = {
    id: nodeId,
    type: resolveCreatedGraphNodeType(input.nodeKind),
    position,
    data: createNodeData(input),
  }
  graph.nodes.push(node)
  return node
}

export function removeWorkflowDesignNode(
  graph: WorkflowDesignGraph,
  nodeId: string,
): WorkflowDesignNodeRemoveResult {
  const index = graph.nodes.findIndex(node => node.id === nodeId)
  if (index < 0) return { removed: false, removedLines: [] }

  graph.nodes.splice(index, 1)
  const removedLines: WorkflowDesignGraphLine[] = []
  graph.lines = graph.lines.filter((line) => {
    if (line.from.nodeId === nodeId || line.to.nodeId === nodeId) {
      removedLines.push(line)
      return false
    }
    return true
  })
  return { removed: true, removedLines }
}

export function removeWorkflowDesignLine(graph: WorkflowDesignGraph, line: WorkflowDesignGraphLine): boolean {
  const index = graph.lines.indexOf(line)
  if (index < 0) return false
  graph.lines.splice(index, 1)
  return true
}

export function updateWorkflowDesignLine(line: WorkflowDesignGraphLine, patch: WorkflowDesignLinePatch): void {
  if (patch.from !== undefined) line.from = patch.from
  if (patch.to !== undefined) line.to = patch.to
  if (patch.type !== undefined) line.type = patch.type
  if (patch.relation !== undefined) {
    line.data ??= {}
    line.data['relation'] = patch.relation
  }
  if (patch.lineType !== undefined) ensureWorkflowDesignLineVisual(line).lineType = patch.lineType
  if (patch.controlPoints !== undefined) {
    ensureWorkflowDesignLineVisual(line).controlPoints = patch.controlPoints.map(point => ({ ...point }))
  }
}

export function workflowDesignLineType(line: WorkflowDesignGraphLine): WorkflowDesignLineType {
  const value = line.data?.visual?.lineType
  return value === 'straight' || value === 'bezier' ? value : 'orthogonal'
}

export function workflowDesignLineControlPoints(
  line: WorkflowDesignGraphLine,
): readonly WorkflowDesignLineControlPoint[] {
  const value = line.data?.visual?.controlPoints
  if (!Array.isArray(value)) return []
  return value.filter(isWorkflowDesignLineControlPoint).map(point => ({ x: point.x, y: point.y }))
}

export function normalizeWorkflowDesignLineState(document: WorkflowDesignDocument): void {
  for (const graphView of collectWorkflowDesignGraphs(document)) {
    for (const line of graphView.graph.lines) {
      line.from = normalizeWorkflowDesignLineEndpoint(line.from)
      line.to = normalizeWorkflowDesignLineEndpoint(line.to)
      const visual = ensureWorkflowDesignLineVisual(line)
      visual.lineType = workflowDesignLineType(line)
      visual.controlPoints = workflowDesignLineControlPoints(line).map(point => ({ ...point }))
    }
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

function workflowDesignRoot(): string {
  const applicationId = lowcodeApi.application.get()?.application.id
  if (applicationId === undefined) throw new Error('缺少 lowcode 应用上下文，无法读取工作流设计')
  return `${applicationId}/workflow-designs`
}

async function readWorkflowText(workflowId: string, fileName: string): Promise<string> {
  const normalizedWorkflowId = workflowId.trim()
  if (!normalizedWorkflowId) throw new Error('workflowId 不能为空')
  return lowcodeApi.design.readTextFile({
    appType: 'designfile',
    customPath: `${workflowDesignRoot()}/${normalizedWorkflowId}`,
    fileName,
  })
}

function workflowMutationUnavailable(): Error {
  return new Error('lowcode 工作流文件写接口不满足写前镜像、journal、readback 与补偿门禁')
}

function collectDefinitionPublishIssues(document: WorkflowDesignDocument): SparkAgent.AgentWorkflowDefinitionValidationIssue[] {
  const issues: SparkAgent.AgentWorkflowDefinitionValidationIssue[] = []
  const record: JsonRecord = document
  for (const field of ['app', 'factory', 'process'] as const) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_DESIGN_FIELD',
        message: `design.${field} is not allowed in workflow design.`,
        path: `design.${field}`,
      })
    }
  }
  validateWorkflowRuntimeBindingPublishReadiness(document, issues)
  for (const view of collectWorkflowDesignNodes(document)) {
    const data = view.node.data
    if (data === undefined) continue
    const nodeType = typeof data.type === 'string' ? data.type : view.node.type
    if (!isDefinitionNodeType(nodeType)) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE_TYPE',
        message: `Structural node type "${nodeType}" is not allowed on "${view.id}".`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.type`,
      })
    }
    if (Object.prototype.hasOwnProperty.call(data, 'tool_name') || data['toolName'] === 'single_model_edit') {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE',
        message: `Legacy single_model_edit node "${view.id}" is not allowed.`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data`,
      })
    }
    for (const field of ['provider', 'toolName', 'workflowRef', 'toolParameters', 'inputMapping', 'outputMapping'] as const) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        issues.push({
          severity: 'error',
          code: 'AGENT_WORKFLOW_LEGACY_NODE_FIELD',
          message: `Legacy node field "${field}" is not allowed on "${view.id}".`,
          nodeId: view.id,
          path: `${view.scopePath}.${view.id}.data.${field}`,
        })
      }
    }
    if (isJsonRecord(data.x_spark) && Object.prototype.hasOwnProperty.call(data.x_spark, 'classModel')) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_CLASS_MODEL_META',
        message: `Legacy ClassModel node metadata is not allowed on "${view.id}".`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data.x_spark.classModel`,
      })
    }
    if (data.type === 'process-step' || data.x_spark?.nodeRole === 'process-stage') {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE',
        message: `Legacy process-stage node "${view.id}" is not allowed.`,
        nodeId: view.id,
        path: `${view.scopePath}.${view.id}.data`,
      })
    }
    if (nodeType === 'node') {
      validateBusinessNodePublishReadiness(view, data, issues)
    }
  }
  return issues
}

function validateWorkflowRuntimeBindingPublishReadiness(
  document: WorkflowDesignDocument,
  issues: SparkAgent.AgentWorkflowDefinitionValidationIssue[],
): void {
  const binding = document.workflow.runtimeBinding
  if (!isJsonRecord(binding)) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_RUNTIME_BINDING_MISSING',
      message: 'Workflow must bind workflow.runtimeBinding before publishing.',
      path: 'workflow.runtimeBinding',
    })
    return
  }
  const registration = isJsonRecord(binding['registration']) ? binding['registration'] : undefined
  const projectionRef = isJsonRecord(binding['modelProjectionRef']) ? binding['modelProjectionRef'] : undefined
  const alias = readNonBlankText(registration?.['alias'])
  const moduleId = readNonBlankText(registration?.['moduleId'])
  const rootClassName = readNonBlankText(projectionRef?.['rootClassName'])
  if (alias === undefined || alias === PLACEHOLDER_RUNTIME_ID) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_RUNTIME_ALIAS_MISSING',
      message: 'Workflow runtimeBinding.registration.alias must be a real workflow alias before publishing.',
      path: 'workflow.runtimeBinding.registration.alias',
    })
  }
  if (moduleId === undefined || moduleId === PLACEHOLDER_RUNTIME_ID) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_RUNTIME_MODULE_MISSING',
      message: 'Workflow runtimeBinding.registration.moduleId must be a real module id before publishing.',
      path: 'workflow.runtimeBinding.registration.moduleId',
    })
  }
  if (rootClassName === undefined || rootClassName === PLACEHOLDER_MODEL_ROOT_CLASS_NAME) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_RUNTIME_ROOT_MISSING',
      message: 'Workflow runtimeBinding.modelProjectionRef.rootClassName must be a real ClassModel root before publishing.',
      path: 'workflow.runtimeBinding.modelProjectionRef.rootClassName',
    })
  }
}

function validateBusinessNodePublishReadiness(
  view: WorkflowDesignNodeView,
  data: WorkflowDesignNodeData,
  issues: SparkAgent.AgentWorkflowDefinitionValidationIssue[],
): void {
  const models = Array.isArray(data.models) ? data.models.filter(isJsonRecord) : []
  const primaryModel = models[0]
  const rootClassName = readNonBlankText(primaryModel?.['rootClassName'])
  const className = readNonBlankText(primaryModel?.['className'])
  const completion = isJsonRecord(primaryModel?.['completion']) ? primaryModel['completion'] : undefined
  const completionMemberName = readNonBlankText(completion?.['memberName'])
  if (Object.prototype.hasOwnProperty.call(data, 'model')) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_LEGACY_MODEL_FIELD',
      message: `Business node "${view.id}" must use models[] instead of legacy model.`,
      nodeId: view.id,
      path: `${view.scopePath}.${view.id}.data.model`,
    })
  }
  if (models.length === 0) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_MODELS_MISSING',
      message: `Business node "${view.id}" must bind at least one models[] entry before publishing.`,
      nodeId: view.id,
      path: `${view.scopePath}.${view.id}.data.models`,
    })
  }
  if (rootClassName === undefined || rootClassName === PLACEHOLDER_MODEL_ROOT_CLASS_NAME) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_MODEL_ROOT_MISSING',
      message: `Business node "${view.id}" must bind a real models[0].rootClassName before publishing.`,
      nodeId: view.id,
      path: `${view.scopePath}.${view.id}.data.models[0].rootClassName`,
    })
  }
  if (className === undefined || className === PLACEHOLDER_MODEL_CLASS_NAME) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_MODEL_CLASS_MISSING',
      message: `Business node "${view.id}" must bind a real models[0].className before publishing.`,
      nodeId: view.id,
      path: `${view.scopePath}.${view.id}.data.models[0].className`,
    })
  }
  if (completionMemberName === undefined) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_MODEL_COMPLETION_MISSING',
      message: `Business node "${view.id}" must bind a projected models[0].completion.memberName before publishing.`,
      nodeId: view.id,
      path: `${view.scopePath}.${view.id}.data.models[0].completion.memberName`,
    })
  }
}

function normalizeDefinitionWorkflowExtras(workflow: WorkflowDesignDocument['workflow']): JsonRecord {
  const extras: JsonRecord = {}
  for (const [key, value] of Object.entries(workflow)) {
    if (
      key === 'id'
      || key === 'version'
      || key === 'variables'
      || key === 'capabilities'
      || key === 'runtimeBinding'
      || key === 'graph'
    ) continue
    extras[key] = value
  }
  return extras
}

function normalizeDefinitionVariables(value: WorkflowDesignVariable[] | undefined): readonly SparkAgent.AgentWorkflowVariable[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(variable => typeof variable.name === 'string' && variable.name.trim().length > 0)
    .map((variable): SparkAgent.AgentWorkflowVariable => ({
      name: variable.name.trim(),
      ...(typeof variable.title === 'string' && variable.title.trim().length > 0
        ? { title: variable.title.trim() }
        : {}),
      ...(typeof variable.required === 'boolean' ? { required: variable.required } : {}),
      ...(isJsonRecord(variable.schema) ? { schema: variable.schema } : {}),
      ...(Object.prototype.hasOwnProperty.call(variable, 'defaultValue') ? { defaultValue: variable.defaultValue } : {}),
    }))
}

function normalizeDefinitionCapabilities(value: WorkflowDesignCapability[] | undefined): readonly SparkAgent.AgentWorkflowCapability[] {
  return normalizeCapabilities(value, 'workflow')
}

function toDefinitionNode(node: WorkflowDesignGraphNode): SparkAgent.AgentWorkflowGraphNode {
  const type = resolveDefinitionNodeType(node)
  if (type === 'start') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  if (type === 'output') {
    return createWorkflowDefinitionNode({
      id: node.id,
      type,
      data: normalizeNodeDataForDefinition(type, node.data),
      position: node.position,
    })
  }
  return createWorkflowDefinitionNode({
    id: node.id,
    type: 'node',
    data: normalizeNodeDataForDefinition('node', node.data),
    position: node.position,
  })
}

function toDefinitionLine(line: WorkflowDesignGraphLine): SparkAgent.AgentWorkflowGraphLine {
  const data = definitionWorkflowDesignLineData(line.data)
  return {
    id: line.id ?? `${line.from.nodeId}-${line.to.nodeId}`,
    from: line.from,
    to: line.to,
    ...(line.type === undefined ? {} : { type: line.type }),
    ...(data === undefined ? {} : { data }),
  }
}

function normalizeWorkflowRuntimeBinding(
  value: SparkAgent.AgentWorkflowNodeRuntimeBinding | undefined,
): SparkAgent.AgentWorkflowNodeRuntimeBinding {
  if (value !== undefined) return value
  return {
    registration: {
      alias: PLACEHOLDER_RUNTIME_ID,
      moduleId: PLACEHOLDER_RUNTIME_ID,
      businessId: PLACEHOLDER_RUNTIME_ID,
    },
    inputContract: {
      identityField: 'input',
      messageField: 'input',
      paramsSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      readonlySteps: [],
    },
    systemPrompt: {
      template: 'spark.placeholder.prompt',
      conditionalHints: [],
    },
    modelProjectionRef: {
      kind: 'dts-class-model',
      rootClassName: PLACEHOLDER_MODEL_ROOT_CLASS_NAME,
      manifestUrlRef: 'dts-class-model',
    },
    executableRef: {
      kind: 'js-module',
      moduleSpecifier: 'spark.placeholder.module',
      exportName: PLACEHOLDER_MODEL_CLASS_NAME,
    },
    resolveInstance: {
      editorSource: PLACEHOLDER_RUNTIME_ID,
      identityField: 'input',
    },
  }
}

function normalizeDefinitionNodePosition(
  position: WorkflowDesignGraphNode['position'],
): SparkAgent.AgentWorkflowNodePosition | undefined {
  const x = position?.x
  const y = position?.y
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  return { x, y }
}

function createWorkflowDefinitionNode<
  TType extends SparkAgent.AgentWorkflowGraphNodeType,
  TData extends SparkAgent.AgentWorkflowJsonRecord,
>(
  command: CreateWorkflowDefinitionNodeCommand<TType, TData>,
): SparkAgent.AgentWorkflowGraphNodeBase<TType, TData> {
  const position = normalizeDefinitionNodePosition(command.position)
  if (position === undefined) {
    return {
      id: command.id,
      type: command.type,
      data: command.data,
    }
  }
  return {
    id: command.id,
    type: command.type,
    data: command.data,
    position,
  }
}

function normalizeNodeDataForDefinition(
  type: 'start',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowStartNodeData
function normalizeNodeDataForDefinition(
  type: 'node',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowBusinessNodeData
function normalizeNodeDataForDefinition(
  type: 'output',
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowOutputNodeData
function normalizeNodeDataForDefinition(
  type: SparkAgent.AgentWorkflowGraphNodeType,
  value: WorkflowDesignNodeData | undefined,
): SparkAgent.AgentWorkflowGraphNode['data'] {
  const data = value === undefined ? {} : { ...value }
  delete data.loop
  delete data.iteration
  delete data['toolParameters']
  delete data['inputMapping']
  delete data['outputMapping']
  delete data['provider']
  delete data['toolName']
  delete data['workflowRef']
  delete data.x_spark
  const title = readTitle(data, defaultNodeTitleForType(type))
  const optionalCapabilities = normalizeOptionalCapabilities(data['capabilities'], 'node')
  if (type === 'start') {
    return {
      type,
      title,
      ...(isJsonRecord(data['inputs']) ? { inputs: data['inputs'] } : {}),
      ...(isJsonRecord(data['projection']) ? { projection: data['projection'] } : {}),
      ...(isJsonRecord(data['validation']) ? { validation: data['validation'] } : {}),
      ...(isJsonRecord(data['state']) ? { state: data['state'] } : {}),
      ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
    }
  }
  if (type === 'node') {
    const models = normalizeBusinessNodeModels(data['models'])
    const primaryModel = models[0] ?? createPlaceholderBusinessNodeModel()
    return {
      type,
      title,
      models,
      inputs: isJsonRecord(data['inputs']) ? data['inputs'] : {},
      outputs: isJsonRecord(data['outputs']) ? data['outputs'] : {},
      llm: normalizeBusinessNodeLlm(data['llm'], primaryModel),
      validation: normalizeBusinessNodeValidation(data['validation'], primaryModel.className),
      ...(isJsonRecord(data['state']) ? { state: data['state'] } : {}),
      ...(isJsonRecord(data['result']) ? { result: data['result'] } : {}),
      ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
    }
  }
  return {
    type,
    title,
    outputs: isJsonRecord(data['outputs']) ? data['outputs'] : {},
    ...(isJsonRecord(data['upstreamValidation']) ? { upstreamValidation: data['upstreamValidation'] } : {}),
    ...(isJsonRecord(data['validation']) ? { validation: data['validation'] } : {}),
    ...(isJsonRecord(data['state']) ? { state: data['state'] } : {}),
    ...(isJsonRecord(data['result']) ? { result: data['result'] } : {}),
    ...(optionalCapabilities === undefined ? {} : { capabilities: optionalCapabilities }),
  }
}

function normalizeBusinessNodeModels(value: unknown): readonly SparkAgent.AgentWorkflowModelContext[] {
  if (!Array.isArray(value)) return [createPlaceholderBusinessNodeModel()]
  const models = value
    .filter(isJsonRecord)
    .map(normalizeBusinessNodeModel)
  return models.length === 0 ? [createPlaceholderBusinessNodeModel()] : models
}

function normalizeBusinessNodeModel(model: JsonRecord): SparkAgent.AgentWorkflowModelContext {
  const id = readNonBlankText(model['id']) ?? PLACEHOLDER_MODEL_ID
  const sourceRef = readNonBlankText(model['sourceRef'])
  const role = readNonBlankText(model['role'])
  const completion = isJsonRecord(model['completion']) ? model['completion'] : undefined
  const completionMemberName = readNonBlankText(completion?.['memberName'])
  return {
    id,
    rootClassName: readNonBlankText(model['rootClassName']) ?? PLACEHOLDER_MODEL_ROOT_CLASS_NAME,
    className: readNonBlankText(model['className']) ?? PLACEHOLDER_MODEL_CLASS_NAME,
    ...(sourceRef === undefined ? {} : { sourceRef }),
    ...(Array.isArray(model['via'])
      ? { via: model['via'].filter(isJsonRecord).map(normalizeBusinessNodeModelVia) }
      : {}),
    ...(role === undefined ? {} : { role }),
    ...(completionMemberName === undefined
      ? {}
      : {
        completion: {
          memberName: completionMemberName,
          ...(completion?.['returnContract'] === 'boolean-or-reason'
            ? { returnContract: 'boolean-or-reason' as const }
            : {}),
        },
      }),
  }
}

function createPlaceholderBusinessNodeModel(): SparkAgent.AgentWorkflowModelContext {
  return {
    id: PLACEHOLDER_MODEL_ID,
    rootClassName: PLACEHOLDER_MODEL_ROOT_CLASS_NAME,
    className: PLACEHOLDER_MODEL_CLASS_NAME,
    sourceRef: '$',
  }
}

function normalizeBusinessNodeModelVia(value: JsonRecord): SparkAgent.AgentWorkflowModelVia {
  const sourceRef = readNonBlankText(value['sourceRef'])
  return {
    memberName: readNonBlankText(value['memberName']) ?? '',
    ...(value['kind'] === 'attribute' || value['kind'] === 'method' ? { kind: value['kind'] } : {}),
    ...(sourceRef === undefined ? {} : { sourceRef }),
  }
}

function normalizeBusinessNodeLlm(
  value: unknown,
  model: SparkAgent.AgentWorkflowModelContext,
): SparkAgent.AgentWorkflowLlmWork {
  const llm = isJsonRecord(value) ? value : {}
  return {
    task: isJsonRecord(llm['task']) ? llm['task'] : {
      goal: '',
      requirements: {},
      contextInputs: {},
    },
    knowledge: isJsonRecord(llm['knowledge']) ? llm['knowledge'] : {
      rootClassName: model.rootClassName,
      className: model.className,
      allowedActions: [],
      readableAttributes: [],
    },
    functionCalling: isJsonRecord(llm['functionCalling']) ? llm['functionCalling'] : {
      mode: 'freeWithinModelContext',
      constraints: [],
    },
    output: isJsonRecord(llm['output']) ? llm['output'] : {
      structuredResult: {},
      handoffToValidation: true,
    },
  }
}

function normalizeBusinessNodeValidation(
  value: unknown,
  fallbackClassName: string,
): SparkAgent.AgentWorkflowNodeValidation {
  const validation = isJsonRecord(value) ? value : {}
  const action = isJsonRecord(validation['action']) ? validation['action'] : {}
  const status = readNonBlankText(validation['status'])
  return {
    action: {
      className: readNonBlankText(action['className']) ?? fallbackClassName,
      actionName: readNonBlankText(action['actionName']) ?? PLACEHOLDER_VALIDATION_ACTION_NAME,
      inputProjection: isJsonRecord(action['inputProjection']) ? action['inputProjection'] : {},
      expectedResult: isJsonRecord(action['expectedResult']) ? action['expectedResult'] : {},
    },
    ...(status === undefined ? {} : { status }),
    ...(Array.isArray(validation['issues'])
      ? { issues: validation['issues'].filter(isJsonRecord) }
      : {}),
  }
}

function resolveDefinitionNodeType(node: WorkflowDesignGraphNode): SparkAgent.AgentWorkflowGraphNodeType {
  const dataType = node.data?.type
  if (isDefinitionNodeType(dataType)) return dataType
  if (isDefinitionNodeType(node.type)) return node.type
  return 'node'
}

function resolveCreatedGraphNodeType(kind: WorkflowDesignNodeCreateKind): string {
  return kind
}

function createNodeData(input: WorkflowDesignNodeCreateInput): WorkflowDesignNodeData {
  const normalizedTitle = input.title?.trim()
  const title = normalizedTitle === undefined || normalizedTitle.length === 0
    ? defaultNodeTitle(input.nodeKind)
    : normalizedTitle
  const desc = input.desc?.trim()
  if (input.nodeKind === 'node') {
    return createDefaultBusinessNodeData(title, desc)
  }
  if (input.nodeKind === 'output') {
    return {
      type: 'output',
      title,
      ...(desc === undefined || desc.length === 0 ? {} : { desc }),
      outputs: {},
      upstreamValidation: {},
      validation: {},
      state: {},
      result: {},
      capabilities: [],
    }
  }
  return {
    type: 'start',
    title,
    ...(desc === undefined || desc.length === 0 ? {} : { desc }),
    inputs: {},
    projection: {},
    validation: {},
    state: {},
  }
}

function createDefaultBusinessNodeData(title: string, desc: string | undefined): WorkflowDesignNodeData {
  return {
    type: 'node',
    title,
    ...(desc === undefined || desc.length === 0 ? {} : { desc }),
    models: [createPlaceholderBusinessNodeModel()],
    inputs: {},
    outputs: {},
    llm: {
      task: {
        goal: '',
        requirements: {},
        contextInputs: {},
      },
      knowledge: {
        rootClassName: PLACEHOLDER_MODEL_ROOT_CLASS_NAME,
        className: PLACEHOLDER_MODEL_CLASS_NAME,
        allowedActions: [],
        readableAttributes: [],
      },
      functionCalling: {
        mode: 'freeWithinModelContext',
        constraints: [],
      },
      output: {
        structuredResult: {},
        handoffToValidation: true,
      },
    },
    validation: {
      action: {
        className: PLACEHOLDER_MODEL_CLASS_NAME,
        actionName: PLACEHOLDER_VALIDATION_ACTION_NAME,
        inputProjection: {},
        expectedResult: {},
      },
      status: 'draft',
      issues: [],
    },
    state: {},
    result: {},
    capabilities: [],
  }
}

function collectGraphNodes(command: CollectWorkflowDesignNodeCommand): WorkflowDesignNodeView[] {
  const { graph, scopePath, depth, ancestry } = command
  const result: WorkflowDesignNodeView[] = []
  for (const node of graph.nodes) {
    const nodeType = typeof node.data?.type === 'string' ? node.data.type : node.type
    const title = typeof node.data?.title === 'string' && node.data.title.length > 0 ? node.data.title : node.id
    const isBusinessNode = nodeType === 'node'
    const view: WorkflowDesignNodeView = {
      key: `${scopePath}:${node.id}`,
      id: node.id,
      title,
      nodeType,
      depth,
      scopePath,
      ancestry,
      node,
      graph,
      isBusinessNode,
      isBoundaryNode: nodeType === 'start' || nodeType === 'output',
      isWorkflowNode: false,
      isSingleModelEditTool: false,
      isProcessStageNode: false,
    }
    result.push(view)
    result.push(...collectNestedNodes({ node, scopePath, depth, ancestry }))
  }
  return result
}

function collectNestedNodes(command: CollectWorkflowDesignNestedNodeCommand): WorkflowDesignNodeView[] {
  const { node, scopePath, depth, ancestry } = command
  const result: WorkflowDesignNodeView[] = []
  const nextAncestry = [...ancestry, node.id]
  const loopGraph = node.data?.loop?.subGraph
  if (loopGraph !== undefined) {
    result.push(...collectGraphNodes({
      graph: loopGraph,
      scopePath: `${scopePath}.${node.id}.loop.subGraph`,
      depth: depth + 1,
      ancestry: nextAncestry,
    }))
  }
  const iterationGraph = node.data?.iteration?.subGraph
  if (iterationGraph !== undefined) {
    result.push(...collectGraphNodes({
      graph: iterationGraph,
      scopePath: `${scopePath}.${node.id}.iteration.subGraph`,
      depth: depth + 1,
      ancestry: nextAncestry,
    }))
  }
  return result
}

function collectNestedGraphViews(
  graph: WorkflowDesignGraph,
  scopePath: string,
  depth: number,
): WorkflowDesignGraphView[] {
  const result: WorkflowDesignGraphView[] = []
  for (const node of graph.nodes) {
    const loopGraph = node.data?.loop?.subGraph
    if (loopGraph !== undefined) {
      const nextScopePath = `${scopePath}.${node.id}.loop.subGraph`
      result.push({
        key: nextScopePath,
        id: loopGraph.id ?? `${node.id}.loop`,
        title: `${node.id} / loop`,
        depth: depth + 1,
        scopePath: nextScopePath,
        graph: loopGraph,
        carrier: 'loop',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(loopGraph, nextScopePath, depth + 1))
    }
    const iterationGraph = node.data?.iteration?.subGraph
    if (iterationGraph !== undefined) {
      const nextScopePath = `${scopePath}.${node.id}.iteration.subGraph`
      result.push({
        key: nextScopePath,
        id: iterationGraph.id ?? `${node.id}.iteration`,
        title: `${node.id} / iteration`,
        depth: depth + 1,
        scopePath: nextScopePath,
        graph: iterationGraph,
        carrier: 'iteration',
        ownerNodeId: node.id,
        ownerNode: node,
      })
      result.push(...collectNestedGraphViews(iterationGraph, nextScopePath, depth + 1))
    }
  }
  return result
}

function collectGraphLines(view: WorkflowDesignGraphView): WorkflowDesignLineView[] {
  return view.graph.lines.map((line, index) => {
    const fromNode = view.graph.nodes.find(node => node.id === line.from.nodeId)
    const toNode = view.graph.nodes.find(node => node.id === line.to.nodeId)
    return {
      key: `${view.scopePath}:line:${line.id ?? index}`,
      id: line.id ?? `${line.from.nodeId}-${line.to.nodeId}`,
      from: line.from,
      to: line.to,
      fromNodeId: line.from.nodeId,
      toNodeId: line.to.nodeId,
      depth: view.depth,
      scopePath: view.scopePath,
      graph: view.graph,
      line,
      ...(fromNode === undefined ? {} : { fromNode }),
      ...(toNode === undefined ? {} : { toNode }),
    }
  })
}

function autoLayoutWorkflowDesignGraph(view: WorkflowDesignGraphView): WorkflowDesignAutoLayoutGraphResult {
  const layoutPositions = layoutWorkflowDesignGraphWithLayers(view.graph)
  let changedNodePositions = false

  for (const layoutPosition of layoutPositions) {
    const position = layoutPosition.node.position
    if (position?.x !== layoutPosition.x || position.y !== layoutPosition.y) {
      changedNodePositions = true
    }
    layoutPosition.node.position = { ...position, x: layoutPosition.x, y: layoutPosition.y }
  }

  const viewport = view.graph.viewport
  const changedViewport = layoutPositions.length > 0
    && (viewport?.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1)
  if (layoutPositions.length > 0) {
    view.graph.viewport = { ...viewport, x: 0, y: 0, zoom: 1 }
  }

  return {
    scopePath: view.scopePath,
    changedNodePositions,
    changedViewport,
  }
}

function layoutWorkflowDesignGraphWithLayers(graph: WorkflowDesignGraph): WorkflowDesignAutoLayoutNodePosition[] {
  const layoutNodes = graph.nodes.map((node, originalIndex): WorkflowDesignAutoLayoutNode => ({
    node,
    originalIndex,
    rank: 0,
    lane: 0,
    mainPath: false,
    preferredLane: null,
  }))
  if (layoutNodes.length === 0) return []

  const nodesById = new Map<string, WorkflowDesignAutoLayoutNode>()
  const incomingNodesById = new Map<string, WorkflowDesignAutoLayoutNode[]>()
  const outgoingNodesById = new Map<string, WorkflowDesignAutoLayoutNode[]>()
  const incomingCountsById = new Map<string, number>()
  for (const layoutNode of layoutNodes) {
    nodesById.set(layoutNode.node.id, layoutNode)
    incomingNodesById.set(layoutNode.node.id, [])
    outgoingNodesById.set(layoutNode.node.id, [])
    incomingCountsById.set(layoutNode.node.id, 0)
  }

  const acceptedNodePairKeys = new Set<string>()
  for (const line of workflowLayoutForwardLines(graph)) {
    const fromNode = nodesById.get(line.from.nodeId)
    const toNode = nodesById.get(line.to.nodeId)
    if (fromNode === undefined || toNode === undefined) continue
    const nodePairKey = workflowDesignLayoutNodePairKey(fromNode.node.id, toNode.node.id)
    if (acceptedNodePairKeys.has(nodePairKey)) continue
    acceptedNodePairKeys.add(nodePairKey)
    outgoingNodesById.get(fromNode.node.id)?.push(toNode)
    incomingNodesById.get(toNode.node.id)?.push(fromNode)
    incomingCountsById.set(toNode.node.id, (incomingCountsById.get(toNode.node.id) ?? 0) + 1)
  }

  rankWorkflowDesignLayoutNodes(layoutNodes, outgoingNodesById, incomingCountsById)
  markWorkflowDesignMainPathNodes(layoutNodes, outgoingNodesById, incomingNodesById)
  assignWorkflowDesignBranchRootLanes(layoutNodes, outgoingNodesById)
  assignWorkflowDesignLayoutLanes(layoutNodes, incomingNodesById)

  const minLane = layoutNodes.reduce((min, layoutNode) => Math.min(min, layoutNode.lane), Number.POSITIVE_INFINITY)
  return layoutNodes.map(layoutNode => ({
    node: layoutNode.node,
    x: Math.round(WORKFLOW_AUTO_LAYOUT_START_X + (layoutNode.lane - minLane) * WORKFLOW_AUTO_LAYOUT_STEP_X),
    y: WORKFLOW_AUTO_LAYOUT_START_Y + layoutNode.rank * WORKFLOW_AUTO_LAYOUT_STEP_Y,
  }))
}

function rankWorkflowDesignLayoutNodes(
  layoutNodes: WorkflowDesignAutoLayoutNode[],
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
  incomingCountsById: ReadonlyMap<string, number>,
): void {
  const remainingIncomingCountsById = new Map(incomingCountsById)
  const queue = layoutNodes
    .filter(layoutNode => (remainingIncomingCountsById.get(layoutNode.node.id) ?? 0) === 0)
    .sort(compareWorkflowDesignLayoutNodes)
  const rankedNodeIds = new Set<string>()

  while (queue.length > 0) {
    queue.sort(compareWorkflowDesignLayoutNodesByRank)
    const currentNode = queue.shift()
    if (currentNode === undefined || rankedNodeIds.has(currentNode.node.id)) continue
    rankedNodeIds.add(currentNode.node.id)

    const nextNodes = [...(outgoingNodesById.get(currentNode.node.id) ?? [])]
      .sort(compareWorkflowDesignLayoutNodes)
    for (const nextNode of nextNodes) {
      nextNode.rank = Math.max(nextNode.rank, currentNode.rank + 1)
      const nextIncomingCount = (remainingIncomingCountsById.get(nextNode.node.id) ?? 0) - 1
      remainingIncomingCountsById.set(nextNode.node.id, nextIncomingCount)
      if (nextIncomingCount <= 0) queue.push(nextNode)
    }
  }

  let fallbackRank = layoutNodes.reduce((rank, layoutNode) => Math.max(rank, layoutNode.rank), 0) + 1
  for (const layoutNode of [...layoutNodes].sort(compareWorkflowDesignLayoutNodes)) {
    if (rankedNodeIds.has(layoutNode.node.id)) continue
    layoutNode.rank = Math.max(layoutNode.rank, fallbackRank)
    fallbackRank = layoutNode.rank + 1
  }
}

function markWorkflowDesignMainPathNodes(
  layoutNodes: readonly WorkflowDesignAutoLayoutNode[],
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
  incomingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): void {
  const mainPathNodeIds = workflowDesignShortestPathNodeIds(layoutNodes, outgoingNodesById)
  refineWorkflowDesignMainPathNodeIds(mainPathNodeIds, outgoingNodesById, incomingNodesById)
  for (const layoutNode of layoutNodes) {
    layoutNode.mainPath = mainPathNodeIds.has(layoutNode.node.id)
    layoutNode.preferredLane = layoutNode.mainPath ? 0 : null
  }
}

function workflowDesignShortestPathNodeIds(
  layoutNodes: readonly WorkflowDesignAutoLayoutNode[],
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): Set<string> {
  const startNode = layoutNodes.find(layoutNode => workflowDesignNodeType(layoutNode.node) === 'start')
    ?? [...layoutNodes].sort(compareWorkflowDesignLayoutNodes)[0]
  const outputNodeIds = new Set(
    layoutNodes
      .filter(layoutNode => workflowDesignNodeType(layoutNode.node) === 'output')
      .map(layoutNode => layoutNode.node.id),
  )
  if (startNode === undefined || outputNodeIds.size === 0) {
    return new Set(layoutNodes.map(layoutNode => layoutNode.node.id))
  }

  const queue: WorkflowDesignAutoLayoutNode[] = [startNode]
  const previousNodeIdById = new Map<string, string | null>([[startNode.node.id, null]])
  let foundOutputNodeId: string | null = null
  while (queue.length > 0) {
    const currentNode = queue.shift()
    if (currentNode === undefined) continue
    if (outputNodeIds.has(currentNode.node.id)) {
      foundOutputNodeId = currentNode.node.id
      break
    }
    for (const nextNode of uniqueWorkflowDesignLayoutNodes(outgoingNodesById.get(currentNode.node.id) ?? [])) {
      if (previousNodeIdById.has(nextNode.node.id)) continue
      previousNodeIdById.set(nextNode.node.id, currentNode.node.id)
      queue.push(nextNode)
    }
  }

  if (foundOutputNodeId === null) return new Set([startNode.node.id])
  const pathNodeIds = new Set<string>()
  let currentNodeId: string | null = foundOutputNodeId
  while (currentNodeId !== null) {
    pathNodeIds.add(currentNodeId)
    currentNodeId = previousNodeIdById.get(currentNodeId) ?? null
  }
  return pathNodeIds
}

function refineWorkflowDesignMainPathNodeIds(
  mainPathNodeIds: Set<string>,
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
  incomingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): void {
  for (const mainPathNodeId of [...mainPathNodeIds]) {
    const successors = uniqueWorkflowDesignLayoutNodes(outgoingNodesById.get(mainPathNodeId) ?? [])
    if (successors.length < 2) continue
    const mainSuccessors = successors.filter(successor => mainPathNodeIds.has(successor.node.id))
    if (mainSuccessors.length !== 1) continue
    const mainSuccessor = mainSuccessors[0]
    if (mainSuccessor === undefined) continue
    const successorIncomingCount = uniqueWorkflowDesignLayoutNodes(
      incomingNodesById.get(mainSuccessor.node.id) ?? [],
    ).length
    if (successorIncomingCount > 1) continue
    const branchSuccessors = successors.filter(successor => !mainPathNodeIds.has(successor.node.id))
    if (branchSuccessors.some(successor => workflowDesignNodeReachesMainPath(successor, mainPathNodeIds, outgoingNodesById))) {
      mainPathNodeIds.delete(mainSuccessor.node.id)
    }
  }
}

function workflowDesignNodeReachesMainPath(
  startNode: WorkflowDesignAutoLayoutNode,
  mainPathNodeIds: ReadonlySet<string>,
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): boolean {
  const stack = [...uniqueWorkflowDesignLayoutNodes(outgoingNodesById.get(startNode.node.id) ?? [])]
  const visitedNodeIds = new Set<string>([startNode.node.id])
  while (stack.length > 0) {
    const currentNode = stack.pop()
    if (currentNode === undefined || visitedNodeIds.has(currentNode.node.id)) continue
    if (mainPathNodeIds.has(currentNode.node.id)) return true
    visitedNodeIds.add(currentNode.node.id)
    stack.push(...uniqueWorkflowDesignLayoutNodes(outgoingNodesById.get(currentNode.node.id) ?? []))
  }
  return false
}

function assignWorkflowDesignBranchRootLanes(
  layoutNodes: readonly WorkflowDesignAutoLayoutNode[],
  outgoingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): void {
  for (const layoutNode of [...layoutNodes].sort(compareWorkflowDesignLayoutNodesByRank)) {
    if (!layoutNode.mainPath) continue
    const branchNodes = uniqueWorkflowDesignLayoutNodes(outgoingNodesById.get(layoutNode.node.id) ?? [])
      .filter(nextNode => !nextNode.mainPath)
      .sort(compareWorkflowDesignLayoutNodes)
    for (let index = 0; index < branchNodes.length; index += 1) {
      const branchNode = branchNodes[index]
      if (branchNode?.preferredLane !== null) continue
      branchNode.preferredLane = workflowDesignBranchLaneOffset(index, branchNodes.length)
    }
  }
}

function assignWorkflowDesignLayoutLanes(
  layoutNodes: readonly WorkflowDesignAutoLayoutNode[],
  incomingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): void {
  const rankGroups = new Map<number, WorkflowDesignAutoLayoutNode[]>()
  for (const layoutNode of layoutNodes) {
    const group = rankGroups.get(layoutNode.rank)
    if (group === undefined) {
      rankGroups.set(layoutNode.rank, [layoutNode])
    } else {
      group.push(layoutNode)
    }
  }

  const sortedRanks = [...rankGroups.keys()].sort((left, right) => left - right)
  for (const rank of sortedRanks) {
    const rankNodes = rankGroups.get(rank)
    if (rankNodes === undefined) continue
    assignWorkflowDesignRankLanes(rankNodes, incomingNodesById)
  }
}

function assignWorkflowDesignRankLanes(
  rankNodes: readonly WorkflowDesignAutoLayoutNode[],
  incomingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): void {
  const nodesByPreferredLane = new Map<string, WorkflowDesignAutoLayoutNode[]>()
  for (const layoutNode of [...rankNodes].sort(compareWorkflowDesignLayoutNodes)) {
    const preferredLane = workflowDesignPreferredLayoutLane(layoutNode, incomingNodesById)
    const laneKey = workflowDesignLayoutLaneKey(preferredLane)
    const laneNodes = nodesByPreferredLane.get(laneKey)
    if (laneNodes === undefined) {
      nodesByPreferredLane.set(laneKey, [layoutNode])
    } else {
      laneNodes.push(layoutNode)
    }
  }

  const usedLaneKeys = new Set<string>()
  const laneGroups = [...nodesByPreferredLane.entries()]
    .sort((left, right) => Number(left[0]) - Number(right[0]))
  for (const [preferredLaneKey, laneNodes] of laneGroups) {
    const preferredLane = Number(preferredLaneKey)
    const sortedLaneNodes = [...laneNodes].sort(compareWorkflowDesignLayoutNodes)
    for (let index = 0; index < sortedLaneNodes.length; index += 1) {
      const layoutNode = sortedLaneNodes[index]
      if (layoutNode === undefined) continue
      const targetLane = preferredLane + workflowDesignCenteredLayoutOffset(index, sortedLaneNodes.length)
      layoutNode.lane = reserveWorkflowDesignLayoutLane(targetLane, usedLaneKeys)
    }
  }
}

function workflowDesignPreferredLayoutLane(
  layoutNode: WorkflowDesignAutoLayoutNode,
  incomingNodesById: ReadonlyMap<string, readonly WorkflowDesignAutoLayoutNode[]>,
): number {
  if (layoutNode.preferredLane !== null) return layoutNode.preferredLane
  const previousNodes = (incomingNodesById.get(layoutNode.node.id) ?? [])
    .filter(incomingNode => incomingNode.rank < layoutNode.rank)
  if (previousNodes.length === 0) return 0
  return previousNodes.reduce((total, incomingNode) => total + incomingNode.lane, 0) / previousNodes.length
}

function workflowDesignBranchLaneOffset(index: number, count: number): number {
  if (count === 2) return index === 0 ? -0.5 : 0.5
  const lane = Math.floor(index / 2) + 1
  return index % 2 === 0 ? -lane : lane
}

function workflowDesignCenteredLayoutOffset(index: number, count: number): number {
  return index - (count - 1) / 2
}

function uniqueWorkflowDesignLayoutNodes(
  layoutNodes: readonly WorkflowDesignAutoLayoutNode[],
): WorkflowDesignAutoLayoutNode[] {
  const seenNodeIds = new Set<string>()
  const uniqueNodes: WorkflowDesignAutoLayoutNode[] = []
  for (const layoutNode of layoutNodes) {
    if (seenNodeIds.has(layoutNode.node.id)) continue
    seenNodeIds.add(layoutNode.node.id)
    uniqueNodes.push(layoutNode)
  }
  return uniqueNodes.sort(compareWorkflowDesignLayoutNodes)
}

function workflowDesignNodeType(node: WorkflowDesignGraphNode): SparkAgent.AgentWorkflowGraphNodeType {
  return resolveDefinitionNodeType(node)
}

function reserveWorkflowDesignLayoutLane(preferredLane: number, usedLaneKeys: Set<string>): number {
  const step = 0.5
  for (let offset = 0; offset <= usedLaneKeys.size + 2; offset += step) {
    const leftLane = preferredLane - offset
    if (reserveWorkflowDesignLayoutLaneKey(leftLane, usedLaneKeys)) return leftLane
    if (offset === 0) continue
    const rightLane = preferredLane + offset
    if (reserveWorkflowDesignLayoutLaneKey(rightLane, usedLaneKeys)) return rightLane
  }
  return preferredLane
}

function reserveWorkflowDesignLayoutLaneKey(lane: number, usedLaneKeys: Set<string>): boolean {
  const laneKey = workflowDesignLayoutLaneKey(lane)
  if (usedLaneKeys.has(laneKey)) return false
  usedLaneKeys.add(laneKey)
  return true
}

function workflowDesignLayoutLaneKey(lane: number): string {
  return lane.toFixed(3)
}

function workflowDesignLayoutNodePairKey(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}\u0000${toNodeId}`
}

function compareWorkflowDesignLayoutNodes(
  left: WorkflowDesignAutoLayoutNode,
  right: WorkflowDesignAutoLayoutNode,
): number {
  return left.originalIndex - right.originalIndex
}

function compareWorkflowDesignLayoutNodesByRank(
  left: WorkflowDesignAutoLayoutNode,
  right: WorkflowDesignAutoLayoutNode,
): number {
  return left.rank - right.rank || compareWorkflowDesignLayoutNodes(left, right)
}

function workflowLayoutForwardLines(graph: WorkflowDesignGraph): WorkflowDesignGraphLine[] {
  const acceptedLines: WorkflowDesignGraphLine[] = []
  const nodeIndexById = new Map<string, number>()
  for (const [index, node] of graph.nodes.entries()) {
    nodeIndexById.set(node.id, index)
  }
  const lineCandidates = graph.lines
    .map((line, originalIndex): WorkflowDesignAutoLayoutLineCandidate => ({
      line,
      originalIndex,
      fromIndex: nodeIndexById.get(line.from.nodeId) ?? Number.MAX_SAFE_INTEGER,
      toIndex: nodeIndexById.get(line.to.nodeId) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(compareWorkflowDesignLayoutLineCandidates)

  for (const { line } of lineCandidates) {
    if (line.from.nodeId === line.to.nodeId) continue
    if (workflowLayoutCreatesCycle(acceptedLines, line.from.nodeId, line.to.nodeId)) continue
    acceptedLines.push(line)
  }
  return acceptedLines
}

function compareWorkflowDesignLayoutLineCandidates(
  left: WorkflowDesignAutoLayoutLineCandidate,
  right: WorkflowDesignAutoLayoutLineCandidate,
): number {
  return workflowDesignLayoutLineDirection(left) - workflowDesignLayoutLineDirection(right)
    || left.fromIndex - right.fromIndex
    || left.toIndex - right.toIndex
    || left.originalIndex - right.originalIndex
}

function workflowDesignLayoutLineDirection(candidate: WorkflowDesignAutoLayoutLineCandidate): number {
  return candidate.fromIndex <= candidate.toIndex ? 0 : 1
}

function workflowLayoutCreatesCycle(
  acceptedLines: readonly WorkflowDesignGraphLine[],
  fromNodeId: string,
  toNodeId: string,
): boolean {
  const stack = [toNodeId]
  const visitedNodeIds = new Set<string>()
  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (nodeId === undefined || visitedNodeIds.has(nodeId)) continue
    if (nodeId === fromNodeId) return true
    visitedNodeIds.add(nodeId)
    for (const line of acceptedLines) {
      if (line.from.nodeId === nodeId) stack.push(line.to.nodeId)
    }
  }
  return false
}

function ensureDocumentSpark(document: WorkflowDesignDocument): JsonRecord {
  const spark = document.x_spark
  if (isJsonRecord(spark)) return spark
  document.x_spark = {}
  return document.x_spark
}

function ensureNodeData(node: WorkflowDesignGraphNode): WorkflowDesignNodeData {
  node.data ??= {}
  return node.data
}

function ensureRecord(parent: JsonRecord, key: string): JsonRecord {
  const existing = parent[key]
  if (isJsonRecord(existing)) return existing
  const created: JsonRecord = {}
  parent[key] = created
  return created
}

function dirtyPathsFromDraft(draft: JsonRecord): string[] {
  const value = draft['dirtyPaths']
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nextNodeId(graph: WorkflowDesignGraph, baseId: string): string {
  const used = new Set(graph.nodes.map(node => node.id))
  if (!used.has(baseId)) return baseId
  let index = 2
  while (used.has(`${baseId}-${index}`)) {
    index += 1
  }
  return `${baseId}-${index}`
}

function nextLineId(graph: WorkflowDesignGraph, fromNodeId: string, toNodeId: string): string {
  const baseId = `line.${fromNodeId}.${toNodeId}`.replace(/[^a-zA-Z0-9_.-]/gu, '-')
  const used = new Set(graph.lines.map(line => line.id).filter((id): id is string => typeof id === 'string'))
  if (!used.has(baseId)) return baseId
  let index = 2
  while (used.has(`${baseId}-${index}`)) {
    index += 1
  }
  return `${baseId}-${index}`
}

function createDefaultLineEndpoint(nodeId: string, memberName: string): WorkflowDesignLineEndpoint {
  return {
    nodeId,
    modelId: nodeId === 'start' || nodeId === 'output' ? '$workflow' : PLACEHOLDER_MODEL_ID,
    memberName,
    dock: 0,
  }
}

function ensureWorkflowDesignLineVisual(line: WorkflowDesignGraphLine): WorkflowDesignLineVisual {
  line.data ??= {}
  const visual = line.data.visual
  if (visual !== undefined && isJsonRecord(visual)) return visual
  const created: WorkflowDesignLineVisual = {}
  line.data.visual = created
  return created
}

function normalizeWorkflowDesignLineEndpoint(
  endpoint: WorkflowDesignLineEndpoint,
): WorkflowDesignLineEndpoint {
  const dock = endpoint.dock
  return {
    ...endpoint,
    dock: typeof dock === 'number' && Number.isInteger(dock) && dock >= 0 && dock <= 12 ? dock : 0,
  }
}

function isWorkflowDesignLineControlPoint(value: unknown): value is WorkflowDesignLineControlPoint {
  return isJsonRecord(value)
    && typeof value['x'] === 'number'
    && Number.isFinite(value['x'])
    && typeof value['y'] === 'number'
    && Number.isFinite(value['y'])
}

function definitionWorkflowDesignLineData(data: WorkflowDesignLineData | undefined): JsonRecord | undefined {
  if (data === undefined) return undefined
  const { visual: _visual, ...definitionData } = data
  return Object.keys(definitionData).length === 0 ? undefined : definitionData
}

function defaultNodeId(kind: WorkflowDesignNodeCreateKind): string {
  switch (kind) {
    case 'node':
      return 'node.model'
    case 'start':
      return 'start'
    case 'output':
      return 'output'
  }
}

function defaultNodeTitle(kind: WorkflowDesignNodeCreateKind): string {
  switch (kind) {
    case 'node':
      return 'Business Node'
    case 'start':
      return 'Start'
    case 'output':
      return 'Output'
  }
}

function defaultNodeTitleForType(type: SparkAgent.AgentWorkflowGraphNodeType): string {
  if (type === 'node') return 'Business Node'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function normalizePosition(
  input: WorkflowDesignNodeCreateInput['position'],
  index: number,
): NonNullable<WorkflowDesignGraphNode['position']> {
  return {
    x: typeof input?.x === 'number' ? input.x : 120 + index * 220,
    y: typeof input?.y === 'number' ? input.y : 120,
  }
}

function readErrorStatus(error: unknown): number | null {
  if (!isJsonRecord(error)) return null
  const status = error['status']
  if (typeof status === 'number') return status
  const response = error['response']
  if (!isJsonRecord(response)) return null
  const responseStatus = response['status']
  return typeof responseStatus === 'number' ? responseStatus : null
}

function readTitle(data: JsonRecord, fallback: string): string {
  const title = readNonBlankText(data['title'])
  return title ?? fallback
}

function normalizeOptionalCapabilities(value: unknown, fallbackScope: string): readonly SparkAgent.AgentWorkflowCapability[] | undefined {
  if (value === undefined) return undefined
  return normalizeCapabilities(value, fallbackScope)
}

function normalizeCapabilities(value: unknown, fallbackScope: string): readonly SparkAgent.AgentWorkflowCapability[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((capability): SparkAgent.AgentWorkflowCapability | null => {
      const id = readNonBlankText(capability['id'])
      const title = readNonBlankText(capability['title'])
      const description = readNonBlankText(capability['description'])
      if (id === undefined || title === undefined || description === undefined) return null
      const scope = readNonBlankText(capability['scope']) ?? fallbackScope
      return {
        id,
        title,
        scope,
        description,
        ...(isJsonRecord(capability['inputs']) ? { inputs: capability['inputs'] } : {}),
        ...(isJsonRecord(capability['outputs']) ? { outputs: capability['outputs'] } : {}),
        ...(Array.isArray(capability['constraints'])
          ? { constraints: capability['constraints'].filter((item): item is string => typeof item === 'string' && item.trim().length > 0) }
          : {}),
      }
    })
    .filter((capability): capability is SparkAgent.AgentWorkflowCapability => capability !== null)
}

function readNonBlankText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function assertWorkflowDesignDocument(value: unknown): asserts value is WorkflowDesignDocument {
  if (!isJsonRecord(value)
    || value['kind'] !== 'agent.workflow.design'
    || typeof value['version'] !== 'number'
    || readNonBlankText(value['id']) === undefined
    || !isJsonRecord(value['workflow'])
    || !isJsonRecord(value['x_spark'])) {
    throw new Error('Invalid workflow design document')
  }

  const workflow = value['workflow']
  const graph = workflow['graph']
  if (readNonBlankText(workflow['id']) === undefined
    || typeof workflow['version'] !== 'number'
    || !isJsonRecord(graph)
    || !Array.isArray(graph['nodes'])
    || !Array.isArray(graph['lines'])) {
    throw new Error('Invalid workflow design document')
  }
}

function isDefinitionNodeType(value: unknown): value is SparkAgent.AgentWorkflowGraphNodeType {
  return value === 'start'
    || value === 'node'
    || value === 'output'
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
