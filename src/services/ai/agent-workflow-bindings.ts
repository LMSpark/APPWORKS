/**
 * @module app:services/ai/agent-workflow-bindings
 * 职责：组合 app 领域 binding 并把落盘 Agent Workflow Definition 激活到 spark-ai Host。
 * 边界：只做薄组合和解释器调用，不承载 pageDesign/projectPlanning 领域实现。
 * AI用途：排查 app 层如何从 workflow definition 注册 AI Host 时，用本模块确认统一入口。
 */

import {
  activateAgentWorkflowFromDefinition,
  type AgentWorkflowDefinition,
  type AgentWorkflowRuntimeBindings,
  type AgentWorkflowRuntimeGateCommand,
  type AgentWorkflowRuntimeGateResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams, JsonValue } from '@spark-appworks/spark-json-document'
import {
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { ProjectBlueprint, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { AiAgentHost } from '@spark-appworks/spark-ai/agent'
import { getDtsClassModelManifestUrl } from '@/services/class-model-artifacts/artifact-urls'
import { readWorkflowDefinition } from '@/services/workflow-designs'
import {
  evaluatePageDesignBeforeFunctionCall,
  formatPageDesignSystemPrompt,
  PAGE_DESIGN_MODULE_ID,
  resolvePageDesignProject,
  type PageDesignAllowedOperations,
  type PageDesignAgentWorkflowBindingOptions,
  type PageDesignRunInput,
} from '@/services/page-design/page-design-agent-workflow-binding'
import { guardPageDesignEditor } from '@/services/page-design/page-design-operation-guard'
import { readPageDesignRunContext } from '@/services/page-design/page-design-gates'
import {
  createProjectPlanningSystemPrompt,
  evaluateProjectPlanningBeforeFunctionCall,
  PROJECT_PLANNING_MODULE_ID,
  resolveProjectPlanningDomainRoot,
  type ProjectPlanningAgentInput,
  type ProjectPlanningAgentWorkflowBindingOptions,
} from '@/services/project-planning/project-planning-agent-workflow-binding'

const PAGE_DESIGN_WORKFLOW_ID = 'agent.workflow.pageDesign'
const PROJECT_PLANNING_WORKFLOW_ID = 'agent.workflow.projectPlanning'
const PAGE_DESIGN_EDITOR_SOURCE = 'pageDesign'
const PROJECT_PLANNING_EDITOR_SOURCE = 'projectPlanning'
const DTS_CLASS_MODEL_MANIFEST_REF = 'dts-class-model'
const PROJECT_MODEL_MODULE_SPECIFIER = '@spark-appworks/spark-project-model'

const PAGE_DESIGN_GATE_RULE_KINDS = new Set([
  'pageDesignMutationGate',
  'allowedOperations',
  'forbiddenScriptMarkers',
])

const PROJECT_PLANNING_GATE_RULE_KINDS = new Set([
  'projectPlanningToolGate',
  'projectActionLookup',
  'forbiddenScriptMarkers',
])

export type ActivatePageDesignAgentWorkflowOptions =
  PageDesignAgentWorkflowBindingOptions & Readonly<{
    host: AiAgentHost
  }>

export type ActivateProjectPlanningAgentWorkflowOptions =
  ProjectPlanningAgentWorkflowBindingOptions & Readonly<{
    host: AiAgentHost
  }>

export type CreateAppAgentWorkflowRuntimeBindingsOptions = Readonly<{
  pageDesign?: PageDesignAgentWorkflowBindingOptions
  projectPlanning?: ProjectPlanningAgentWorkflowBindingOptions
}>

export async function activatePageDesignAgentWorkflow(
  options: ActivatePageDesignAgentWorkflowOptions,
): Promise<AiAgentHost> {
  const definition = await readRequiredAgentWorkflowDefinition(PAGE_DESIGN_WORKFLOW_ID)
  return activateAgentWorkflowFromDefinition({
    host: options.host,
    definition,
    bindings: createAppAgentWorkflowRuntimeBindings({
      pageDesign: options,
    }),
  })
}

export async function activateProjectPlanningAgentWorkflow(
  options: ActivateProjectPlanningAgentWorkflowOptions,
): Promise<AiAgentHost> {
  const definition = await readRequiredAgentWorkflowDefinition(PROJECT_PLANNING_WORKFLOW_ID)
  return activateAgentWorkflowFromDefinition({
    host: options.host,
    definition,
    bindings: createAppAgentWorkflowRuntimeBindings({
      projectPlanning: options,
    }),
  })
}

export function createAppAgentWorkflowRuntimeBindings(
  options: CreateAppAgentWorkflowRuntimeBindingsOptions,
): AgentWorkflowRuntimeBindings<ProjectBlueprint | ProjectWorkspace> {
  return {
    manifestUrlResolver: (ref) => {
      if (ref !== DTS_CLASS_MODEL_MANIFEST_REF) {
        throw new Error(`Agent workflow modelProjectionRef.manifestUrlRef is not supported: ${ref}`)
      }
      return getDtsClassModelManifestUrl()
    },
    executableRegistry: {
      [`${PROJECT_MODEL_MODULE_SPECIFIER}#ProjectWorkspace`]: ProjectWorkspace,
      [`${PROJECT_MODEL_MODULE_SPECIFIER}#ProjectBlueprint`]: ProjectBlueprint,
    },
    editorGetterRegistry: {
      [PAGE_DESIGN_EDITOR_SOURCE]: context => guardPageDesignEditor(
        resolvePageDesignProject(requirePageDesignOptions(options), context),
        readPageDesignRunContext(context.moduleInstanceId.trim())?.allowedOperations,
      ),
      [PROJECT_PLANNING_EDITOR_SOURCE]: context => resolveProjectPlanningDomainRoot(
        requireProjectPlanningOptions(options),
        context,
      ),
    },
    knowledgeProviderFactory: modelProjectionRef => createAgentWorkflowKnowledgeProvider(
      modelProjectionRef.rootClassName,
      options.pageDesign?.knowledge ?? options.projectPlanning?.knowledge,
    ),
    gateExecutor: command => executeAgentWorkflowGate(command, options),
    systemPromptInterpolator: command => {
      switch (command.editorSource) {
        case PAGE_DESIGN_EDITOR_SOURCE:
          return formatPageDesignSystemPrompt(createPageDesignPromptInput(command.input))
        case PROJECT_PLANNING_EDITOR_SOURCE:
          return createProjectPlanningSystemPrompt(createProjectPlanningPromptInput(command.input))
        default:
          throw new Error(`Agent workflow system prompt editorSource is not supported: ${command.editorSource}`)
      }
    },
  }
}

function createPageDesignPromptInput(input: JsonParams): PageDesignRunInput {
  const promptInput: PageDesignRunInput = {
    requestId: readRequiredStringInput(input, 'requestId'),
    pageId: readRequiredStringInput(input, 'pageId'),
    description: readRequiredStringInput(input, 'description'),
    effectiveDescription: readRequiredStringInput(input, 'effectiveDescription'),
  }
  const scenarioId = readOptionalStringInput(input, 'scenarioId')
  if (scenarioId !== undefined) promptInput.scenarioId = scenarioId
  const projectId = readOptionalStringInput(input, 'projectId')
  const planningTitle = readOptionalStringInput(input, 'planningTitle')
  const planningPath = readOptionalStringInput(input, 'planningPath')
  const mode = readOptionalPageDesignRunMode(input, 'mode')
  const allowedOperations = readPageDesignAllowedOperations(input['allowedOperations'])
  const preserveExistingInteractions = readOptionalBooleanInput(input, 'preserveExistingInteractions')
  if (projectId !== undefined) promptInput.projectId = projectId
  if (planningTitle !== undefined) promptInput.planningTitle = planningTitle
  if (planningPath !== undefined) promptInput.planningPath = planningPath
  if (mode !== undefined) promptInput.mode = mode
  if (allowedOperations !== undefined) promptInput.allowedOperations = allowedOperations
  if (preserveExistingInteractions !== undefined) {
    promptInput.preserveExistingInteractions = preserveExistingInteractions
  }
  return promptInput
}

function createProjectPlanningPromptInput(input: JsonParams): ProjectPlanningAgentInput {
  const blueprintNodesValue = input['blueprintNodes']
  if (!Array.isArray(blueprintNodesValue)) {
    throw new Error('projectPlanning prompt input requires blueprintNodes array.')
  }
  const tenantId = readOptionalStringInput(input, 'tenantId')
  const planningAttachmentRef = readOptionalStringInput(input, 'planningAttachmentRef')
  return {
    ...(tenantId === undefined ? {} : { tenantId }),
    projectScopeKey: readRequiredStringInput(input, 'projectScopeKey'),
    projectId: readRequiredStringInput(input, 'projectId'),
    requirement: readRequiredStringInput(input, 'requirement'),
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
    blueprintNodes: blueprintNodesValue.map((node, index) => readBlueprintPlanningAgentInput(node, index)),
  }
}

function readBlueprintPlanningAgentInput(value: JsonValue, index: number): ProjectPlanningAgentInput['blueprintNodes'][number] {
  if (!isJsonRecord(value)) {
    throw new Error(`projectPlanning prompt input blueprintNodes[${index}] must be an object.`)
  }
  const planningAttachmentRef = readOptionalStringInput(value, 'planningAttachmentRef')
  const requirement = value['requirement']
  if (typeof requirement !== 'string') throw new Error(`projectPlanning prompt input blueprintNodes[${index}] requires string requirement.`)
  return {
    nodeId: readRequiredStringInput(value, 'nodeId'),
    title: readRequiredStringInput(value, 'title'),
    kind: readRequiredStringInput(value, 'kind'),
    requirement,
    ...(planningAttachmentRef === undefined ? {} : { planningAttachmentRef }),
  }
}

function readPageDesignAllowedOperations(value: JsonValue | undefined): PageDesignAllowedOperations | undefined {
  if (!isJsonRecord(value)) return undefined
  const allowedOperations: {
    nodeTree?: boolean
    dataSet?: boolean
    script?: boolean
    style?: boolean
    blueprint?: boolean
  } = {}
  for (const key of ['nodeTree', 'dataSet', 'script', 'style', 'blueprint'] as const) {
    const field = value[key]
    if (typeof field === 'boolean') allowedOperations[key] = field
  }
  return Object.keys(allowedOperations).length === 0 ? undefined : allowedOperations
}

function readOptionalPageDesignRunMode(
  input: JsonParams,
  field: string,
): PageDesignRunInput['mode'] | undefined {
  const value = readOptionalStringInput(input, field)
  if (value === undefined) return undefined
  if (value === 'create' || value === 'update' || value === 'fix') return value
  throw new Error(`pageDesign prompt input ${field} is not supported: ${value}`)
}

function readRequiredStringInput(input: JsonParams, field: string): string {
  const value = readOptionalStringInput(input, field)
  if (value === undefined) {
    throw new Error(`Agent workflow prompt input requires string field "${field}".`)
  }
  return value
}

function readOptionalStringInput(input: JsonParams, field: string): string | undefined {
  const value = input[field]
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readOptionalBooleanInput(input: JsonParams, field: string): boolean | undefined {
  const value = input[field]
  return typeof value === 'boolean' ? value : undefined
}

function isJsonRecord(value: JsonValue | undefined): value is JsonParams {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function readRequiredAgentWorkflowDefinition(workflowId: string): Promise<AgentWorkflowDefinition> {
  const result = await readWorkflowDefinition(workflowId)
  if (result.definition === undefined) {
    throw new Error(`Agent workflow definition not found: ${workflowId}`)
  }
  return result.definition
}

function createAgentWorkflowKnowledgeProvider(
  rootClassName: string,
  injectedKnowledge: ClassModelKnowledgeProvider | undefined,
): Readonly<{
  provider: ClassModelKnowledgeProvider
}> {
  const dtsClassModelManifestUrl = getDtsClassModelManifestUrl()
  return {
    provider: injectedKnowledge ?? createWorkerDtsClassModelKnowledgeProvider({
      workerUrl: new URL('../class-model-knowledge.worker.ts', import.meta.url),
      dtsClassModelManifestUrl,
      rootClassName,
    }),
  }
}

function executeAgentWorkflowGate(
  command: AgentWorkflowRuntimeGateCommand,
  options: CreateAppAgentWorkflowRuntimeBindingsOptions,
): AgentWorkflowRuntimeGateResult {
  switch (command.editorSource) {
    case PAGE_DESIGN_EDITOR_SOURCE:
      assertKnownGateRules(command, PAGE_DESIGN_GATE_RULE_KINDS)
      return beforeFunctionCallDirectiveToGateResult(evaluatePageDesignBeforeFunctionCall(
        resolvePageDesignProject(requirePageDesignOptions(options), command.options),
        command.options,
      ))
    case PROJECT_PLANNING_EDITOR_SOURCE:
      assertKnownGateRules(command, PROJECT_PLANNING_GATE_RULE_KINDS)
      return beforeFunctionCallDirectiveToGateResult(evaluateProjectPlanningBeforeFunctionCall(command.options))
    default:
      throw new Error(`Agent workflow gate editorSource is not supported: ${command.editorSource}`)
  }
}

function assertKnownGateRules(
  command: AgentWorkflowRuntimeGateCommand,
  knownKinds: ReadonlySet<string>,
): void {
  for (const rule of command.rules) {
    if (!knownKinds.has(rule.kind)) {
      throw new Error(`Agent workflow gate rule is not supported for ${command.editorSource}: ${rule.kind}`)
    }
  }
}

function beforeFunctionCallDirectiveToGateResult(
  directive: Readonly<{
    status: 'allow' | 'reject' | 'abort'
    reason?: string
    fix?: string
  }>,
): AgentWorkflowRuntimeGateResult {
  if (directive.status === 'allow') return { ok: true }
  return {
    ok: false,
    ...(directive.reason === undefined ? {} : { reason: directive.reason }),
    ...(directive.fix === undefined ? {} : { fix: directive.fix }),
  }
}

function requirePageDesignOptions(
  options: CreateAppAgentWorkflowRuntimeBindingsOptions,
): PageDesignAgentWorkflowBindingOptions {
  if (options.pageDesign === undefined) {
    throw new Error('pageDesign agent workflow binding options are required.')
  }
  return options.pageDesign
}

function requireProjectPlanningOptions(
  options: CreateAppAgentWorkflowRuntimeBindingsOptions,
): ProjectPlanningAgentWorkflowBindingOptions {
  if (options.projectPlanning === undefined) {
    throw new Error('projectPlanning agent workflow binding options are required.')
  }
  return options.projectPlanning
}

export {
  PAGE_DESIGN_MODULE_ID,
  PROJECT_PLANNING_MODULE_ID,
}
