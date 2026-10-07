import { describe, expect, it } from 'vitest'

import { DefaultAiAgentSessionStore } from '../../agent/conversation/session/default-session-store'
import {
  AiAgentRegistration,
  type AiAgentRegistrationOptions,
} from '../../agent/business/registration-types'
import { AiAgentRuntimeContext } from '../../agent/business/scope-types'
import {
  resolvePlanWithoutToolNudge,
  resolveToolLoopNudge,
} from '../../agent/tool-loop/tool-loop-runner'
import { AiAgentToolResult } from '../../agent/tool-runtime'

describe('tool-loop nudge hooks', () => {
  const runtimeContext = new AiAgentRuntimeContext('pageDesign', 'leave-page', 'leave-page')

  function createBareRegistrationOptions(): AiAgentRegistrationOptions {
    return {
      moduleId: 'demo',
      name: 'demo',
      description: 'demo',
      runtime: {
        getTools: () => [],
        executeTool: async () => AiAgentToolResult.ok({ ok: true }),
        inspect: () => ({
          status: 'ok',
          rootKinds: [],
          moduleCount: 0,
          findings: [],
        }),
        projectKnowledge: () => ({ promptSnapshot: '' }),
      },
      sessionStore: new DefaultAiAgentSessionStore(),
    }
  }

  function createBareRegistration(): AiAgentRegistration {
    return new AiAgentRegistration(createBareRegistrationOptions())
  }

  it('does not emit business nudges when registration hooks are absent', () => {
    const registration = createBareRegistration()

    expect(resolvePlanWithoutToolNudge(registration, runtimeContext)).toBeUndefined()
    expect(resolveToolLoopNudge(registration, runtimeContext, 'execution_phase')).toBeUndefined()
    expect(resolveToolLoopNudge(registration, runtimeContext, 'model_script_retry')).toBeUndefined()
  })

  it('merges generic and business plan-without-tool nudges when hook is provided', () => {
    const registration = new AiAgentRegistration({
      ...createBareRegistrationOptions(),
      toolLoopNudge: () => '立即 model_script 沿 ProjectModel 字段链执行。',
    })

    const nudge = resolvePlanWithoutToolNudge(registration, runtimeContext)
    expect(nudge).toContain('没有真实 OpenAI tool_calls')
    expect(nudge).toContain('ProjectModel')
  })

  it('returns execution-phase nudge only from registration hook', () => {
    const registration = new AiAgentRegistration({
      ...createBareRegistrationOptions(),
      toolLoopNudge: ({ reason, moduleInstanceId }) => (
        reason === 'execution_phase'
          ? `执行阶段 pageId=${moduleInstanceId}`
          : undefined
      ),
    })

    expect(resolveToolLoopNudge(registration, runtimeContext, 'execution_phase')).toBe('执行阶段 pageId=leave-page')
    expect(resolveToolLoopNudge(registration, runtimeContext, 'model_script_retry')).toBeUndefined()
  })
})
