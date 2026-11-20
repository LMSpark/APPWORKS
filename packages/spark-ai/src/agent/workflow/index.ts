/**
 * @module @spark-appworks/spark-ai:agent/workflow
 * 职责：汇总 Agent Workflow definition graph、校验和运行时适配器公共 API。
 * 边界：只导出 workflow 子域稳定契约，不导入 APP 层或具体业务实现。
 * AI用途：应用层需要引用 workflow definition、节点/边契约或运行时消费 helper 时，从本模块确认公共出口。
 */

export {
  AGENT_WORKFLOW_DEFINITION_KIND,
  AGENT_WORKFLOW_DEFINITION_SCHEMA,
  AGENT_WORKFLOW_DEFINITION_VERSION,
  AGENT_WORKFLOW_GRAPH_NODE_TYPES,
} from './agent-workflow-definition'

export {
  assertAgentWorkflowDefinition,
  createAgentWorkflowDefinitionValidation,
  validateAgentWorkflowDefinition,
} from './agent-workflow-validation'

export {
  activateAgentWorkflowDefinition,
  dryRunAgentWorkflowDefinition,
  resolveAgentWorkflowActivation,
} from './agent-workflow-dry-run'

export {
  activateAgentWorkflowFromDefinition,
  interpretAgentWorkflowDefinition,
} from './agent-workflow-runtime'

export type {
  AgentWorkflowDefinition,
  AgentWorkflowDefinitionKind,
  AgentWorkflowDefinitionSchema,
  AgentWorkflowDefinitionSource,
  AgentWorkflowDefinitionSparkMeta,
  AgentWorkflowDefinitionValidation,
  AgentWorkflowDefinitionValidationIssue,
  AgentWorkflowDefinitionValidationSeverity,
  AgentWorkflowDefinitionValidationStatus,
  AgentWorkflowDefinitionVersion,
  AgentWorkflowBody,
  AgentWorkflowBusinessNode,
  AgentWorkflowBusinessNodeData,
  AgentWorkflowCapability,
  AgentWorkflowGraph,
  AgentWorkflowGraphLine,
  AgentWorkflowGraphLineData,
  AgentWorkflowGraphNode,
  AgentWorkflowGraphNodeBase,
  AgentWorkflowGraphNodeType,
  AgentWorkflowJsonRecord,
  AgentWorkflowLineBranch,
  AgentWorkflowLineEndpoint,
  AgentWorkflowLineValidation,
  AgentWorkflowLlmWork,
  AgentWorkflowModelCompletion,
  AgentWorkflowModelCompletionReturnContract,
  AgentWorkflowModelContext,
  AgentWorkflowModelVia,
  AgentWorkflowNodeBeforeFunctionCall,
  AgentWorkflowNodeConditionalHint,
  AgentWorkflowNodeExecutableRef,
  AgentWorkflowNodeGateRule,
  AgentWorkflowNodeInputContract,
  AgentWorkflowNodeModelProjectionRef,
  AgentWorkflowNodeResolveInstance,
  AgentWorkflowNodeRuntimeBinding,
  AgentWorkflowNodeRuntimeRegistration,
  AgentWorkflowNodeSystemPrompt,
  AgentWorkflowNodeToolLoopNudge,
  AgentWorkflowNodeValidation,
  AgentWorkflowNodeValidationAction,
  AgentWorkflowNodePosition,
  AgentWorkflowOutputNode,
  AgentWorkflowOutputNodeData,
  AgentWorkflowStartNode,
  AgentWorkflowStartNodeData,
  AgentWorkflowVariable,
} from './agent-workflow-definition'

export type {
  ActivateAgentWorkflowDefinitionCommand,
  AgentWorkflowActivation,
  AgentWorkflowBindings,
  AgentWorkflowDryRunCommand,
  AgentWorkflowDryRunResult,
  AgentWorkflowRuntimeBinding,
  ResolveAgentWorkflowActivationCommand,
} from './agent-workflow-dry-run'

export type {
  AgentWorkflowInterpretedRegistration,
  AgentWorkflowRuntimeBindings,
  AgentWorkflowRuntimeGateCommand,
  AgentWorkflowRuntimeGateResult,
  AgentWorkflowRuntimeSystemPromptCommand,
} from './agent-workflow-runtime'
