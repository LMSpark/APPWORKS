/**
 * @module app:services/workflow-designs
 * 职责：解析 workflow design.json、由设计稿派生 AgentWorkflowDefinition、生成新节点/连线的默认数据，并只读 definition.json。
 * 边界：设计稿与 definition 的编辑和保存走 AgentWorkflowFiles 投影 DataView，本模块不写文件、不执行 Agent workflow 运行时。
 * AI用途：排查 workflow design、业务节点、ClassModel model context 或边投影时，用本模块确认前端接线。
 */
import {
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
} from '@spark-appworks/spark-ai/agent'
import type * as SparkAgent from '@spark-appworks/spark-ai/agent'
import {createAgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'

export type JsonRecord = Record<string, unknown>

export type WorkflowDefinitionReadResult = {
  workflowId: string
  filename: string
  timestamp: string
  definition?: SparkAgent.AgentWorkflowDefinition
  notModified?: boolean
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

export type CreateAgentWorkflowDefinitionFromDesignOptions = {
  publishedAt?: string
}

type CreateWorkflowDefinitionNodeCommand<
  TType extends SparkAgent.AgentWorkflowGraphNodeType,
  TData extends SparkAgent.AgentWorkflowJsonRecord,
> = Readonly<{
  id: string
  type: TType
  data: TData
  position: WorkflowDesignGraphNode['position']
}>

type PublishNodeView = Readonly<{id: string; scopePath: string; node: WorkflowDesignGraphNode}>

const PLACEHOLDER_MODEL_ROOT_CLASS_NAME = 'spark.placeholder.RootModel'
const PLACEHOLDER_MODEL_CLASS_NAME = 'spark.placeholder.Model'
const PLACEHOLDER_MODEL_ID = 'spark.placeholder.model'
const PLACEHOLDER_VALIDATION_ACTION_NAME = 'spark.placeholder.validate'
const PLACEHOLDER_RUNTIME_ID = 'spark.placeholder.workflow'

export async function readWorkflowDefinition(workflowId: string): Promise<WorkflowDefinitionReadResult> {
  const owner = await createAgentWorkflowFileDataViewOwner()
  try {
    const content = await owner.readDocument(workflowId, 'definition.json')
    const definition: unknown = JSON.parse(content)
    assertAgentWorkflowDefinition(definition)
    return {workflowId, filename: 'definition.json', timestamp: '', definition}
  } finally {owner.dispose()}
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

export function parseWorkflowDesignJson(text: string): WorkflowDesignDocument {
  const parsed: unknown = JSON.parse(text)
  assertWorkflowDesignDocument(parsed)
  return parsed
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

export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
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
  for (const view of publishNodeViews(document.workflow.graph, 'workflow.graph')) {
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

function publishNodeViews(graph: WorkflowDesignGraph, scopePath: string): PublishNodeView[] {
  return graph.nodes.flatMap(node => [{id: node.id, scopePath, node}, ...(['loop', 'iteration'] as const).flatMap(carrier => {
    const subGraph = node.data?.[carrier]?.subGraph
    return subGraph === undefined ? [] : publishNodeViews(subGraph, `${scopePath}.${node.id}.${carrier}.subGraph`)
  })])
}

function validateBusinessNodePublishReadiness(
  view: PublishNodeView,
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
