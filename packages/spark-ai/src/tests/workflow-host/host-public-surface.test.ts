import { describe, expect, it } from 'vitest'

describe('@spark-appworks/spark-ai/agent public surface', () => {
  it('exports only the stable runtime symbols from the host barrel', async () => {
    const hostModule = await import('../../agent')

    expect(Object.keys(hostModule).sort()).toEqual([
      'AGENT_WORKFLOW_DEFINITION_KIND',
      'AGENT_WORKFLOW_DEFINITION_SCHEMA',
      'AGENT_WORKFLOW_DEFINITION_VERSION',
      'AGENT_WORKFLOW_GRAPH_NODE_TYPES',
      'AI_AGENT_HOST',
      'AiApiScriptActionFailure',
      'AiAgentHost',
      'AiAgentRegistration',
      'AiAgentRuntimeContext',
      'AiAgentScope',
      'AiAgentSession',
      'AiAgentSessionStore',
      'AiAgentTask',
      'AiAgentTarget',
      'AiAgentToolCheck',
      'AiAgentToolLoopRunner',
      'AiAgentToolResult',
      'DefaultAiAgentSessionStore',
      'ClassModelAgentAdapter',
      'activateAgentWorkflowFromDefinition',
      'activateAgentWorkflowDefinition',
      'assertAgentWorkflowDefinition',
      'createAgentWorkflowDefinitionValidation',
      'createAiApiScriptContext',
      'createAiAgentHost',
      'createAiAgentRunTrace',
      'createAiAgentScope',
      'createAiAgentSession',
      'createAiAgentTask',
      'createAiAgentSessionTranscript',
      'createAiAgentTransportTurn',
      'createAiNativeApiScriptContext',
      'createAiNativeScriptContext',
      'createSimpleInputContract',
      'createTurnEventCollector',
      'dryRunAgentWorkflowDefinition',
      'executeAiApiAction',
      'executeAiNativeScript',
      'interpretAgentWorkflowDefinition',
      'previewAiAgentDiagnosticValue',
      'resolveAgentWorkflowActivation',
      'runAiAgent',
      'sparkAgUi',
      'startAiAgentRegistrationSession',
      'summarizeAiAgentSessionRecord',
      'toAiAgentRuntimeScope',
      'validateAgentWorkflowDefinition',
    ].sort())
  }, 60000)

  it('keeps host implementation helpers out of the public barrel', async () => {
    const hostModule = await import('../../agent')
    const exposed = new Set(Object.keys(hostModule))

    expect(exposed.has('latestUserInput')).toBe(false)
    expect(exposed.has('normalizeTurn')).toBe(false)
    expect(exposed.has('toCurrentTurnMessages')).toBe(false)
    expect(exposed.has('AiAgentMessageSender')).toBe(false)
    expect(exposed.has('createAiAgentSessionId')).toBe(false)
    expect(exposed.has('createAiAgentBusinessStorageKey')).toBe(false)
    expect(exposed.has('AiAgentRegistry')).toBe(false)
    expect(exposed.has('createAiAgentRegistration')).toBe(false)
    expect(exposed.has('AiAgentDefinition')).toBe(false)
    expect(exposed.has('AiAgent')).toBe(false)
    expect(exposed.has('createAiAgent')).toBe(false)
    expect(exposed.has('createAiAgentStreamKey')).toBe(false)
    expect(exposed.has('normalizeAiAgentTarget')).toBe(false)
    expect(exposed.has('emitAiAgentDiagnosticEvent')).toBe(false)
    expect(exposed.has('eventModuleIdFromProtocolCall')).toBe(false)
    expect(exposed.has('stringifyAiAgentPayload')).toBe(false)
  }, 60000)
})
