import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectModel, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createAiRunAdapter,
  type AiRunAdapterState,
  type AiRunSnapshot,
  type AiRunBeforeFunctionCall,
  type AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentToolCallRecord,
  AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import { runProjectPlanningAiSession } from '@/services/project-planning/project-planning-ai-runner'

const mocks = vi.hoisted(() => {
  const projectPlanningRun = vi.fn()
  const projectPlanningHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: projectPlanningRun,
  }
  return {
    projectPlanningRun,
    projectPlanningHost,
    activateProjectPlanningAgentWorkflow: vi.fn(async () => projectPlanningHost),
  }
})

vi.mock('@/services/ai/agent-workflow-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {
    ...actual,
    activateProjectPlanningAgentWorkflow: mocks.activateProjectPlanningAgentWorkflow,
  }
})

function createEditor(projectId = 'demo'): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId,
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ children: [] }) },
  })
  seedPlanningProject(editor.project)
  return editor
}

function seedPlanningProject(project: ProjectModel): void {
  project.replaceBlueprintTree({
    id: 'homepage_root',
    title: 'Demo',
    blueprintKind: 'project',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '订单与库存管理',
    children: [
      {
        id: 'orders',
        title: '订单',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/orders',
        description: '订单页',
      },
    ],
  })
}

function createAiHost(): AiAgentHost {
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  return createAiAgentHost({ turnCallbacks })
}

function createCapabilityConsumer(host: AiAgentHost): SparkCapabilityConsumer {
  return (name) => name.read(host)
}

function createRunResult(sessionId = 'session-1'): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: { id: sessionId } as never,
  }
}

function createToolCallRecord(): AiAgentToolCallRecord {
  return {
    toolName: 'model_query',
    args: { kind: 'project' },
    turnId: 'turn-1',
    round: 1,
    status: 'success',
    result: { ok: true, summary: 'ok' },
    durationMs: 8,
  }
}

function emptyAiRunSnapshot(): AiRunSnapshot {
  return {
    trace: {
      streamText: '',
      reasoningText: '',
      isStreaming: false,
      isReasoning: false,
      entries: [],
      toolCalls: [],
    },
    agUiEvents: [],
    timeline: [],
  }
}

function createTraceSink(): AiRunTraceSink {
  return {
    appendUserMessage: vi.fn(),
    appendEvent: vi.fn(),
    appendDelta: vi.fn(),
    appendReasoning: vi.fn(),
    appendToolCall: vi.fn(),
    appendError: vi.fn(),
    markAborted: vi.fn(),
    finish: vi.fn(),
    reset: vi.fn(),
  }
}

describe('runProjectPlanningAiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.projectPlanningRun.mockResolvedValue(createRunResult())
  })

  it('runs headless projectPlanning through host.run with scoped navigation input', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()

    const result = await runProjectPlanningAiSession({
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
    })

    expect(result.sawToolCall).toBe(false)
    expect(result.blueprintDirty).toBe(false)
    expect(result.savedBlueprint).toBe(false)
    expect(result.input).toEqual({
      projectScopeKey: 'demo',
      projectId: 'demo',
      requirement: '订单与库存管理',
      blueprintNodes: [
        {
          nodeId: 'homepage_root',
          title: 'Demo',
          blueprintKind: 'project',
          nodeKind: 'module',
          requirement: '订单与库存管理',
        },
        {
          nodeId: 'orders',
          title: '订单',
          blueprintKind: 'page',
          nodeKind: 'page',
          requirement: '订单页',
        },
      ],
    })
    expect(mocks.activateProjectPlanningAgentWorkflow).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
    expect(mocks.projectPlanningRun).toHaveBeenCalledWith('projectPlanning', result.input, expect.any(Object))
  })

  it('wires trace and tool call callbacks through the headless adapter', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const toolCall = createToolCallRecord()
    const trace = createTraceSink()
    mocks.projectPlanningRun.mockImplementation(async (_alias: string, _input: unknown, chat: {
      onDelta?: (value: string) => void
      onToolCall?: (value: AiAgentToolCallRecord) => void
    }) => {
      chat.onDelta?.('delta')
      chat.onToolCall?.(toolCall)
      return createRunResult()
    })

    const result = await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      trace,
    })

    expect(result.sawToolCall).toBe(true)
    expect(trace.appendUserMessage).toHaveBeenCalledWith('订单与库存管理')
    expect(trace.appendDelta).toHaveBeenCalledWith('delta')
    expect(trace.appendToolCall).toHaveBeenCalledWith(toolCall)
  })

  it('accepts injected adapter without rebinding business registration hooks', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const beforeFunctionCall = vi.fn<AiRunBeforeFunctionCall>(() => ({ status: 'allow' }))
    const adapter: AiRunAdapterState = {
      isRunning: vi.fn(() => false),
      abort: vi.fn(),
      snapshot: vi.fn(emptyAiRunSnapshot),
      subscribe: vi.fn(() => () => {}),
      run: vi.fn(async () => 'completed' as const),
    }

    await runProjectPlanningAiSession({
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
      adapter,
      beforeFunctionCall,
    })

    expect(adapter.run).toHaveBeenCalledOnce()
    expect(mocks.activateProjectPlanningAgentWorkflow).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
  })

  it('can inject host directly without capability lookup', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()

    await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      adapter: createAiRunAdapter(),
    })

    expect(mocks.projectPlanningRun).toHaveBeenCalledOnce()
  })

  it('saves the blueprint through delivery when saveBlueprintAfterRun is true', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    editor.project.replaceBlueprintChildren([
      {
        id: 'orders',
        title: '订单',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/orders',
        description: '订单页',
      },
    ])

    const result = await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      saveBlueprintAfterRun: true,
    })

    expect(saveAll).toHaveBeenCalledOnce()
    expect(result.blueprintDirty).toBe(true)
    expect(result.savedBlueprint).toBe(true)
  })
})
