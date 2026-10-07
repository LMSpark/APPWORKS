/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-runtime
 * 职责：把 Agent Workflow Definition 的 runtimeBinding 声明与 app 注入能力解释成可注册的 Agent registration。
 * 边界：不导入 app 层模型、编辑器或 UI；只通过泛型 binding 接口组合 ClassModel runtime。
 * AI用途：需要从设计器发布 definition 激活 AI host 时，用本模块确认解释器接线。
 */

import type { ClassModelKnowledgeProvider } from '../../class-model'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { ClassModelAgentAdapter } from '../business/class-model-agent-adapter'
import type { AiAgentHost } from '../business/host/ai-host'
import { createSimpleInputContract } from '../business/business-kit'
import type {
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
} from '../business/lifecycle-types'
import type { AiAgentRegistration, AiAgentToolLoopNudgeContext } from '../business/registration-types'
import type { AiAgentRuntimeContext } from '../business/scope-types'
import type {
  AgentWorkflowDefinition,
  AgentWorkflowNodeConditionalHint,
  AgentWorkflowNodeExecutableRef,
  AgentWorkflowNodeGateRule,
  AgentWorkflowNodeModelProjectionRef,
  AgentWorkflowNodeRuntimeBinding,
} from './agent-workflow-definition'
import { assertAgentWorkflowDefinition } from './agent-workflow-validation'

export type AgentWorkflowModuleConstructor<TInstance> = new (...args: never[]) => TInstance

export type AgentWorkflowRuntimeKnowledge = Readonly<{
  provider: ClassModelKnowledgeProvider
}>

export type AgentWorkflowRuntimeGateResult = Readonly<{
  ok: boolean
  reason?: string
  fix?: string
}>

export type AgentWorkflowRuntimeGateCommand = Readonly<{
  editorSource: string
  rules: readonly AgentWorkflowNodeGateRule[]
  options: AiAgentBeforeFunctionCallOptions
}>

export type AgentWorkflowRuntimeSystemPromptCommand = Readonly<{
  editorSource: string
  template: string
  hints: readonly AgentWorkflowNodeConditionalHint[]
  input: JsonParams
}>

export type AgentWorkflowRuntimeBindings<TInstance> = Readonly<{
  manifestUrlResolver: (ref: string) => string
  /** 宿主允许的可执行类白名单，键为 `moduleSpecifier#exportName`；definition 不能据此加载任意模块。 */
  executableRegistry: Readonly<Record<string, AgentWorkflowModuleConstructor<TInstance>>>
  editorGetterRegistry: Readonly<Record<string, (context: AiAgentRuntimeContext) => TInstance>>
  knowledgeProviderFactory: (config: AgentWorkflowNodeModelProjectionRef) => AgentWorkflowRuntimeKnowledge
  gateExecutor?: (command: AgentWorkflowRuntimeGateCommand) => AgentWorkflowRuntimeGateResult
  systemPromptInterpolator: (command: AgentWorkflowRuntimeSystemPromptCommand) => string
}>

export type InterpretAgentWorkflowDefinitionCommand<TInstance> = Readonly<{
  definition: AgentWorkflowDefinition
  bindings: AgentWorkflowRuntimeBindings<TInstance>
}>

export type ActivateAgentWorkflowFromDefinitionCommand<TInstance> =
  InterpretAgentWorkflowDefinitionCommand<TInstance> & Readonly<{
  host: AiAgentHost
}>

export type AgentWorkflowInterpretedRegistration = Readonly<{
  workflowId: string
  alias: string
  moduleId: string
  rootClassName: string
  registration: AiAgentRegistration
}>

export function interpretAgentWorkflowDefinition<TInstance>(
  command: InterpretAgentWorkflowDefinitionCommand<TInstance>,
): Promise<AgentWorkflowInterpretedRegistration> {
  return Promise.resolve().then(() => interpretAgentWorkflowDefinitionNow(command))
}

function interpretAgentWorkflowDefinitionNow<TInstance>(
  command: InterpretAgentWorkflowDefinitionCommand<TInstance>,
): AgentWorkflowInterpretedRegistration {
  assertAgentWorkflowDefinition(command.definition)
  const runtimeBinding = command.definition.workflow.runtimeBinding
  const moduleClass = resolveExecutableClass(command.bindings, runtimeBinding.executableRef)
  const editorGetter = resolveEditorGetter(command.bindings, runtimeBinding)
  const knowledge = command.bindings.knowledgeProviderFactory(runtimeBinding.modelProjectionRef)
  const dtsClassModelManifestUrl = normalizeRequiredText(
    command.bindings.manifestUrlResolver(runtimeBinding.modelProjectionRef.manifestUrlRef),
    'modelProjectionRef.manifestUrlRef',
  )
  const rootClassName = normalizeRequiredText(
    runtimeBinding.modelProjectionRef.rootClassName,
    'modelProjectionRef.rootClassName',
  )
  const beforeFunctionCall = createBeforeFunctionCall({
    runtimeBinding,
    bindings: command.bindings,
  })

  const registration = ClassModelAgentAdapter.createRegistration<TInstance>({
    moduleClass,
    options: {
      moduleId: runtimeBinding.registration.moduleId,
      rootClassName,
      dtsClassModelManifestUrl,
      knowledge: knowledge.provider,
      inputContract: createSimpleInputContract({
        businessId: runtimeBinding.registration.businessId,
        identityField: runtimeBinding.inputContract.identityField,
        messageField: runtimeBinding.inputContract.messageField,
        paramsSchema: runtimeBinding.inputContract.paramsSchema,
        systemPrompt: input => command.bindings.systemPromptInterpolator({
          editorSource: runtimeBinding.resolveInstance.editorSource,
          template: runtimeBinding.systemPrompt.template,
          hints: runtimeBinding.systemPrompt.conditionalHints ?? [],
          input,
        }),
        ...(runtimeBinding.inputContract.readonlySteps === undefined
          ? {}
          : { readonlySteps: runtimeBinding.inputContract.readonlySteps }),
      }),
      resolveInstance: context => editorGetter(context),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(runtimeBinding.agentCompleteMethodName === undefined
        ? {}
        : { agentCompleteMethodName: runtimeBinding.agentCompleteMethodName }),
      ...(runtimeBinding.executionToolNames === undefined
        ? {}
        : { executionToolNames: new Set(runtimeBinding.executionToolNames) }),
      ...(runtimeBinding.planWithoutToolMarkers === undefined
        ? {}
        : { planWithoutToolMarkers: runtimeBinding.planWithoutToolMarkers }),
      ...(runtimeBinding.toolLoopNudge === undefined
        ? {}
        : { toolLoopNudge: createToolLoopNudge(runtimeBinding) }),
    },
  })

  return {
    workflowId: command.definition.workflowId,
    alias: runtimeBinding.registration.alias,
    moduleId: runtimeBinding.registration.moduleId,
    rootClassName,
    registration,
  }
}

export async function activateAgentWorkflowFromDefinition<TInstance>(
  command: ActivateAgentWorkflowFromDefinitionCommand<TInstance>,
): Promise<AiAgentHost> {
  const interpreted = await interpretAgentWorkflowDefinition(command)
  return command.host.ensure(interpreted.alias, {
    moduleId: interpreted.moduleId,
    create: () => interpreted.registration,
  })
}

function resolveExecutableClass<TInstance>(
  bindings: AgentWorkflowRuntimeBindings<TInstance>,
  ref: AgentWorkflowNodeExecutableRef,
): AgentWorkflowModuleConstructor<TInstance> {
  const moduleSpecifier = normalizeRequiredText(ref.moduleSpecifier, 'executableRef.moduleSpecifier')
  const exportName = normalizeRequiredText(ref.exportName, 'executableRef.exportName')
  const key = `${moduleSpecifier}#${exportName}`
  const registry = bindings.executableRegistry
  const executable = Object.hasOwn(registry, key) ? registry[key] : undefined
  if (executable === undefined) {
    const registered = Object.keys(registry).join(', ') || '(none)'
    throw new Error(`Agent workflow executable is not registered: ${key}. Registered: ${registered}`)
  }
  return executable
}

function resolveEditorGetter<TInstance>(
  bindings: AgentWorkflowRuntimeBindings<TInstance>,
  runtimeBinding: AgentWorkflowNodeRuntimeBinding,
): (context: AiAgentRuntimeContext) => TInstance {
  const editorSource = runtimeBinding.resolveInstance.editorSource
  const getter = bindings.editorGetterRegistry[editorSource]
  if (getter === undefined) {
    throw new Error(`Agent workflow editor getter not found: ${editorSource}`)
  }
  return getter
}

function createBeforeFunctionCall<TInstance>(
  command: Readonly<{
    runtimeBinding: AgentWorkflowNodeRuntimeBinding
    bindings: AgentWorkflowRuntimeBindings<TInstance>
  }>,
): ((instance: TInstance, options: AiAgentBeforeFunctionCallOptions) => AiAgentBeforeFunctionCallDirective) | undefined {
  const beforeFunctionCall = command.runtimeBinding.beforeFunctionCall
  if (beforeFunctionCall === undefined) return undefined
  const gateExecutor = command.bindings.gateExecutor
  if (gateExecutor === undefined) {
    throw new Error('Agent workflow beforeFunctionCall requires gateExecutor binding.')
  }
  return (_instance, options) => {
    const gate = gateExecutor({
      editorSource: command.runtimeBinding.resolveInstance.editorSource,
      rules: beforeFunctionCall.gateRules,
      options,
    })
    if (gate.ok) return { status: 'allow' }
    return {
      status: 'reject',
      ...(gate.reason === undefined ? {} : { reason: gate.reason }),
      ...(gate.fix === undefined ? {} : { fix: gate.fix }),
    }
  }
}

function createToolLoopNudge(
  runtimeBinding: AgentWorkflowNodeRuntimeBinding,
): (context: AiAgentToolLoopNudgeContext) => string | undefined {
  const toolLoopNudge = runtimeBinding.toolLoopNudge
  return context => {
    if (toolLoopNudge === undefined) return undefined
    const template = toolLoopNudge.templates[context.reason]
    if (template === undefined) return undefined
    return interpolateRuntimeTemplate(template, {
      reason: context.reason,
      moduleId: context.runtimeContext.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.runtimeContext.instanceId,
      'runtimeContext.moduleId': context.runtimeContext.moduleId,
      'runtimeContext.moduleInstanceId': context.runtimeContext.moduleInstanceId,
      'runtimeContext.instanceId': context.runtimeContext.instanceId,
    })
  }
}

function interpolateRuntimeTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu, (_match, key: string) => values[key] ?? '')
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`Agent workflow runtime ${field} must not be empty.`)
  }
  return normalized
}
