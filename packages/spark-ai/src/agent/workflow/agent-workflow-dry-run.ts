/**
 * @module @spark-appworks/spark-ai:agent/workflow/agent-workflow-dry-run
 * 职责：作为运行时承载适配器消费 AgentWorkflowDefinition，按 workflowId 绑定 Host 并执行 dryRun 验收链。
 * 边界：definition 不保存注册信息；本模块只在运行时把 workflowId 解析到 Host 可执行对象。
 * AI用途：需要验证运行时是否能承载 workflow definition 时，用本模块确认链路。
 */

import type { JsonParams } from '@spark-appworks/spark-json-document'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
} from '../business/ai-host'
import type { AiAgentRegistration } from '../business/registration-types'
import type { AgentWorkflowDefinition } from './agent-workflow-definition'
import { assertAgentWorkflowDefinition } from './agent-workflow-validation'

export type AgentWorkflowActivation = Readonly<{
  workflowId: string
  alias: string
  moduleId: string
  rootClassName?: string
}>

export type AgentWorkflowRuntimeBinding<TInput extends JsonParams = JsonParams> = Readonly<{
  alias: string
  moduleId: string
  rootClassName?: string
  create: () => AiAgentRegistration<TInput>
}>

export type AgentWorkflowBindings<TInput extends JsonParams = JsonParams> = Readonly<{
  workflows: Readonly<Record<string, AgentWorkflowRuntimeBinding<TInput>>>
}>

export type ResolveAgentWorkflowActivationCommand<TInput extends JsonParams = JsonParams> = Readonly<{
  definition: AgentWorkflowDefinition
  bindings: AgentWorkflowBindings<TInput>
}>

export type ActivateAgentWorkflowDefinitionCommand<TInput extends JsonParams = JsonParams> =
  ResolveAgentWorkflowActivationCommand<TInput> & Readonly<{
    host: AiAgentHost
  }>

export type AgentWorkflowDryRunCommand<TInput extends JsonParams = JsonParams> =
  ActivateAgentWorkflowDefinitionCommand<TInput> & Readonly<{
    input: TInput
  }>

export type AgentWorkflowDryRunResult = Readonly<{
  host: AiAgentHost
  activation: AgentWorkflowActivation
  dryRun: AiAgentHostDryRunResult
}>

export function resolveAgentWorkflowActivation<TInput extends JsonParams>(
  command: ResolveAgentWorkflowActivationCommand<TInput>,
): AgentWorkflowActivation {
  assertAgentWorkflowDefinition(command.definition)
  const binding = command.bindings.workflows[command.definition.workflowId]
  if (binding === undefined) {
    throw new Error(`Agent workflow runtime binding not found: ${command.definition.workflowId}`)
  }

  return {
    workflowId: command.definition.workflowId,
    alias: binding.alias,
    moduleId: binding.moduleId,
    ...(binding.rootClassName === undefined ? {} : { rootClassName: binding.rootClassName }),
  }
}

export function activateAgentWorkflowDefinition<TInput extends JsonParams>(
  command: ActivateAgentWorkflowDefinitionCommand<TInput>,
): AiAgentHost {
  const activation = resolveAgentWorkflowActivation(command)
  const binding = command.bindings.workflows[activation.workflowId]
  if (binding === undefined) {
    throw new Error(`Agent workflow runtime binding not found: ${activation.workflowId}`)
  }
  if (binding.moduleId !== activation.moduleId) {
    throw new Error(
      `Agent workflow binding moduleId mismatch: expected "${activation.moduleId}", got "${binding.moduleId}".`,
    )
  }

  return command.host.ensure(activation.alias, {
    moduleId: activation.moduleId,
    create: binding.create,
  })
}

export function dryRunAgentWorkflowDefinition<TInput extends JsonParams>(
  command: AgentWorkflowDryRunCommand<TInput>,
): AgentWorkflowDryRunResult {
  const activation = resolveAgentWorkflowActivation(command)
  const host = activateAgentWorkflowDefinition(command)
  return {
    host,
    activation,
    dryRun: host.dryRun(activation.alias, command.input),
  }
}
