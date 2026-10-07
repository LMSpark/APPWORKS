import { describe, expect, it } from 'vitest'

import {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentToolCheck,
  AiAgentToolLoopRunner,
  AiAgentToolResult,
  ClassModelAgentAdapter,
  DefaultAiAgentSessionStore,
  type AiAgentFunctionCallHistoryEntry,
  type AiAgentTransportToolCall,
  type AiAgentTurnCallbacks,
} from '../../agent'
import { CLASS_MODEL_TOOL_NAMES, type AiRuntimeApiMetadataJson } from '../../class-model'

class PlanningDomain {
  public ready = false
  public completeCalls = 0
  public completionResult: unknown = true

  public checkCompletion(): unknown {
    this.completeCalls += 1
    return this.completionResult
  }

  public write(): { ready: boolean } {
    this.ready = true
    return { ready: this.ready }
  }

  public completeProjectPlanning(input: { summary?: string }) {
    this.completeCalls += 1
    if (!this.ready) {
      return {
        ok: false,
        code: 'PROJECT_PLANNING_NOT_READY',
        msg: 'projectPlanning is not ready.',
        fix: '需要先写入领域数据。',
        requiredCapabilities: [
          'write',
        ],
        missingFacts: ['ready'],
        nextStep: '写入 ready 状态后再次请求完成。',
      }
    }
    return {
      ok: true,
      completed: true,
      summary: input.summary ?? 'done',
      data: { ready: this.ready },
    }
  }
}

const metadata = {
  schemaVersion: 1,
  rootApi: {
    kind: 'planningdomain',
    name: 'PlanningDomain',
    description: 'Planning domain for agent_complete tests.',
    actions: [
      {
        name: 'write',
        methodName: 'write',
        description: 'Write domain state before completion.',
        paramsSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  },
} satisfies AiRuntimeApiMetadataJson

describe('agent_complete domain action', () => {
  it('rejects completion when no domain verifier is bound', async () => {
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: PlanningDomain,
      metadata,
      options: {},
    })

    const result = await registration.runtime.executeTool(
      CLASS_MODEL_TOOL_NAMES.agentComplete,
      { summary: 'I have finished everything.' },
      { moduleId: 'planningdomain', moduleInstanceId: 'demo', instanceId: 'demo' },
    )

    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.code).toBe('AGENT_COMPLETE_METHOD_NOT_CONFIGURED')
    expect(result.data).toBeUndefined()
  })

  it('returns the domain rejection reason without treating it as successful data', async () => {
    const result = await executeCompletion('  页面缺少数据绑定。  ')

    expect(result.ok).toBe(false)
    expect(result.checks?.[0]).toMatchObject({
      code: 'AGENT_COMPLETE_REJECTED',
      message: '页面缺少数据绑定。',
    })
    expect(result.state).toMatchObject({ agentComplete: 'rejected' })
    expect(result.data).toBeUndefined()
  })

  it.each([undefined, null, '', '  ', 0, 1, [], {}, { ready: true }].map(value => ({ value })))(
    'rejects a verifier result without explicit acceptance: $value',
    async ({ value }) => {
      const result = await executeCompletion(value)
      expect(result.ok).toBe(false)
      expect(result.checks?.[0]?.code).toBe('AGENT_COMPLETE_INVALID_RESULT')
    },
  )

  it.each([
    false,
    { ok: false },
    { ok: true, completed: false },
    { ok: true, data: { completed: false } },
    AiAgentToolResult.ok({ completed: false }),
    AiAgentToolResult.ok({ ok: false }),
  ])('does not accept a negative verdict inside a success envelope: %j', async value => {
    const result = await executeCompletion(value)
    expect(result.ok).toBe(false)
    expect(result.data).toBeUndefined()
  })

  it.each(['record', 'tool-result'])('honors blocking checks in a positive %s', async shape => {
    const checks = [AiAgentToolCheck.error('DATA_BINDING_MISSING', '数据绑定缺失。', '补齐数据绑定。')]
    const value = shape === 'record'
      ? { ok: true, completed: true, checks, requiredCapabilities: ['write'] }
      : AiAgentToolResult.ok({ completed: true }, checks, { revision: 3 })
    const result = await executeCompletion(value)

    expect(result.ok).toBe(false)
    expect(result.checks?.[0]).toMatchObject({
      code: 'DATA_BINDING_MISSING',
      message: '数据绑定缺失。',
      hint: '补齐数据绑定。',
    })
    if (shape === 'record') {
      expect(result.state).toMatchObject({ requiredCapabilities: ['write'] })
    } else {
      expect(result.state).toMatchObject({ revision: 3 })
    }
  })

  it.each([
    true,
    { ok: true },
    { completed: true },
    { ok: true, data: { recordId: 'private-record', value: 0 } },
    AiAgentToolResult.ok({ recordId: 'private-record', value: 0 }),
  ])('accepts explicit positive verdicts: %j', async value => {
    const result = await executeCompletion(value)
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ completed: true, summary: 'done' })
  })

  it('keeps the verifier data and warning checks in accepted results', async () => {
    const result = await executeCompletion({
      ok: true,
      summary: '已核验数据库记录。',
      data: { recordId: 'private-record', value: 0 },
      checks: [AiAgentToolCheck.warn('OPTIONAL_LABEL', '缺少可选标签。')],
    })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      completed: true,
      summary: '已核验数据库记录。',
      recordId: 'private-record',
      value: 0,
    })
    expect(result.checks?.[0]?.code).toBe('OPTIONAL_LABEL')
  })

  it('preserves an explicitly accepted tool result summary and state', async () => {
    const result = await executeCompletion(AiAgentToolResult.ok(
      { summary: '已核验私域记录。', recordId: 'private-record', value: 0 },
      [AiAgentToolCheck.info('SOURCE_READ', '已回读。')],
      { revision: 3 },
    ))

    expect(result.data).toEqual({
      completed: true,
      summary: '已核验私域记录。',
      recordId: 'private-record',
      value: 0,
    })
    expect(result.state).toEqual({ revision: 3 })
    expect(result.checks?.[0]?.code).toBe('SOURCE_READ')
  })

  it('accepts an explicit tool verdict without a data payload', async () => {
    const result = await executeCompletion(AiAgentToolResult.ok())
    expect(result.data).toEqual({ completed: true, summary: 'done' })
  })

  it('preserves nested rejection details and capability recovery in a tool envelope', async () => {
    const result = await executeCompletion(AiAgentToolResult.ok({
      completed: false,
      message: '真实记录尚未写入。',
      requiredCapabilities: ['write'],
      missingFacts: ['ready'],
    }))

    expect(result.ok).toBe(false)
    expect(result.checks?.[0]?.message).toBe('真实记录尚未写入。')
    expect(result.state).toMatchObject({
      requiredCapabilities: ['write'],
      missingFacts: ['ready'],
      knowledgeLookups: ['model_action_guide({ kind: "planningdomain", actionName: "write" })'],
    })
  })

  it('executes the configured domain model completion method', async () => {
    const instance = new PlanningDomain()
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: PlanningDomain,
      metadata,
      options: {
        instance,
        agentCompleteMethodName: 'completeProjectPlanning',
      },
    })

    const host = {
      moduleId: 'planningdomain',
      moduleInstanceId: 'demo',
      instanceId: 'demo',
    }
    const rejected = await registration.runtime.executeTool(
      CLASS_MODEL_TOOL_NAMES.agentComplete,
      { summary: 'done' },
      host,
    )

    expect(rejected.ok).toBe(false)
    expect(rejected.checks?.[0]?.code).toBe('PROJECT_PLANNING_NOT_READY')
    expect(rejected.state).toMatchObject({
      requiredCapabilities: ['write'],
      missingFacts: ['ready'],
      knowledgeLookups: [
        'model_action_guide({ kind: "planningdomain", actionName: "write" })',
      ],
    })
    expect(JSON.stringify(rejected.state)).not.toContain('requiredQueries')
    expect(rejected.checks?.some(check =>
      check.code === 'AGENT_COMPLETE_KNOWLEDGE_LOOKUP'
        && check.message.includes('model_action_guide({ kind: "planningdomain", actionName: "write" })'),
    )).toBe(true)
    expect(instance.completeCalls).toBe(1)

    instance.ready = true
    const accepted = await registration.runtime.executeTool(
      CLASS_MODEL_TOOL_NAMES.agentComplete,
      { summary: 'done' },
      host,
    )

    expect(accepted.ok).toBe(true)
    expect(accepted.data).toMatchObject({
      completed: true,
      summary: 'done',
      ready: true,
    })
    expect(instance.completeCalls).toBe(2)
  })

  it.each(['structured', 'reason', 'blocking-check'])(
    'keeps the tool loop alive until the domain verifier accepts after a %s rejection', async shape => {
    const instance = new PlanningDomain()
    const sessionStore = new DefaultAiAgentSessionStore()
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: PlanningDomain,
      metadata,
      options: {
        instance,
        agentCompleteMethodName: 'completeProjectPlanning',
        ...(shape === 'structured' ? {} : {
          agentCompleteAction: (domain: PlanningDomain) => {
            domain.completeCalls += 1
            if (shape === 'reason') return domain.ready ? true : 'projectPlanning is not ready.'
            return AiAgentToolResult.ok({ completed: true }, domain.ready ? [] : [
              AiAgentToolCheck.error('PROJECT_PLANNING_NOT_READY', 'projectPlanning is not ready.'),
            ])
          },
        }),
        sessionStore,
      },
    })
    const scope = new AiAgentScope('planningdomain', 'demo', 'demo', 'demo')
    const runtimeContext = new AiAgentRuntimeContext('planningdomain', 'demo', 'demo')
    sessionStore.startSession(runtimeContext)

    const toolCalls = [
      toolCall('call-1', CLASS_MODEL_TOOL_NAMES.agentComplete, { summary: 'done' }),
      toolCall('call-2', CLASS_MODEL_TOOL_NAMES.actionGuide, { kind: 'planningdomain', actionName: 'write' }),
      toolCall('call-3', CLASS_MODEL_TOOL_NAMES.script, { script: 'return await this.write({})' }),
      toolCall('call-4', CLASS_MODEL_TOOL_NAMES.agentComplete, { summary: 'done' }),
    ]
    let round = 0
    const appendedToolResults: string[] = []
    const callbacks: AiAgentTurnCallbacks = {
      executeTurn: async () => ({
        text: '',
        toolCalls: [toolCalls[round++]!],
      }),
      appendMessages: async input => {
        appendedToolResults.push(...input.messages
          .filter(message => message.role === 'tool')
          .map(message => message.content))
      },
    }

    await new AiAgentToolLoopRunner(callbacks, 8).runToolLoop({
      registration,
      scope,
      request: { historyMsgs: [{ role: 'user', content: 'finish planning' }] },
      turn: {
        turnId: 'turn-1',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-06-13T00:00:00.000Z',
        startedAt: '2026-06-13T00:00:00.000Z',
        maxParallelTurns: 1,
      },
      clearSelected: () => {},
    })

    const history = sessionStore.getSessionHistory(runtimeContext)
    const completeCalls = history.filter((entry): entry is AiAgentFunctionCallHistoryEntry =>
      entry.kind === 'functionCall' && entry.toolName === CLASS_MODEL_TOOL_NAMES.agentComplete)

    expect(round).toBe(4)
    expect(instance.ready).toBe(true)
    expect(instance.completeCalls).toBe(2)
    expect(completeCalls.map(entry => entry.status)).toEqual(['failed', 'completed'])
    expect(sessionStore.getSession(runtimeContext)?.status).toBe('Stopped')
    expect(appendedToolResults.some(content => content.includes('projectPlanning is not ready.'))).toBe(true)
  })
})

async function executeCompletion(value: unknown) {
  const instance = new PlanningDomain()
  instance.completionResult = value
  const registration = ClassModelAgentAdapter.createRegistration({
    moduleClass: PlanningDomain,
    metadata,
    options: { instance, agentCompleteMethodName: 'checkCompletion' },
  })
  return registration.runtime.executeTool(
    CLASS_MODEL_TOOL_NAMES.agentComplete,
    { summary: 'done' },
    { moduleId: 'planningdomain', moduleInstanceId: 'demo', instanceId: 'demo' },
  )
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
): AiAgentTransportToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}
