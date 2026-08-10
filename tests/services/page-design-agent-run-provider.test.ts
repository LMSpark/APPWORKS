import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace, type PageNodeFileName } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import { preparePageDesignAgentRun } from '@/services/page-design/page-design-agent-run-provider'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'

const mocks = vi.hoisted(() => {
  const createHeadlessPageDesignEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  return {
    createHeadlessPageDesignEditor,
    delegateHost,
    activatePageDesignAgentWorkflow: vi.fn(async () => delegateHost),
  }
})

vi.mock('@/services/page-design/page-design-headless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/page-design/page-design-headless')>()
  return {
    ...actual,
    createHeadlessPageDesignEditor: mocks.createHeadlessPageDesignEditor,
  }
})

vi.mock('@/services/ai/agent-workflow-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {
    ...actual,
    activatePageDesignAgentWorkflow: mocks.activatePageDesignAgentWorkflow,
  }
})

function createEditor(dirtyFileNames: readonly PageNodeFileName[] = ['rule.json']): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ children: [] }) },
  })
  vi.spyOn(editor, 'selectPage').mockResolvedValue()
  vi.spyOn(editor, 'savePageFile').mockResolvedValue()
  vi.spyOn(editor.project, 'readDirtyProjection').mockReturnValue({
    dirtyFiles: new Set(dirtyFileNames),
    hasAnyFileDirty: dirtyFileNames.length > 0,
    blueprintDirty: false,
    hasAnyDirty: dirtyFileNames.length > 0,
  })
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'pageDesign',
        businessInstanceId: 'orders',
      },
    } as never,
  }
}

function createDryRunResult(): AiAgentHostDryRunResult {
  return {
    ok: true,
    alias: 'pageDesign',
    moduleId: 'pageDesign',
    normalizedInput: {},
    scope: {} as never,
    orchestration: { userMessage: '需求', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('preparePageDesignAgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('saves dirty page files and returns delivery artifacts after Agent Run succeeds', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDesignAgentRun({
      requestId: 'request-1',
      alias: 'pageDesign',
      args: { pageId: 'orders', description: '生成订单页' },
    }, {} as AiAgentHost)

    const result = await host.run('pageDesign', {} as AiJsonParams)

    expect(editor.selectPage).toHaveBeenCalledWith('orders', { forceReload: true })
    expect(editor.savePageFile).toHaveBeenCalledTimes(2)
    expect(editor.savePageFile).toHaveBeenCalledWith('rule.json')
    expect(editor.savePageFile).toHaveBeenCalledWith('script.js')
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'saved',
      artifacts: [
        { kind: 'page-file', name: 'rule.json', status: 'saved' },
        { kind: 'page-file', name: 'script.js', status: 'saved' },
      ],
    })
  })

  it('does not save and attaches rollback delivery when Agent Run fails', async () => {
    const editor = createEditor(['rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValueOnce(new Error('run failed'))

    const host = await preparePageDesignAgentRun({
      requestId: 'request-2',
      alias: 'pageDesign',
      args: { pageId: 'orders', description: '生成订单页' },
    }, {} as AiAgentHost)

    let thrown: unknown
    try {
      await host.run('pageDesign', {} as AiJsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(editor.savePageFile).not.toHaveBeenCalled()
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toEqual({
      mode: 'auto',
      status: 'rolledBack',
      artifacts: [{ kind: 'page-file', name: 'rule.json', status: 'rolledBack' }],
      message: 'run failed',
    })

    mocks.delegateHost.run.mockResolvedValueOnce(createRunResult())
    const secondResult = await host.run('pageDesign', {} as AiJsonParams)
    expect(secondResult.resultExtras?.['delivery']).toBeUndefined()
  })
})
