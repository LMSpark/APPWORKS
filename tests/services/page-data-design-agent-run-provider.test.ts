import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace, type PageNodeFileName } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { PAGE_DESIGN_MODULE_ID } from '@/services/page-design/page-design-agent-workflow-binding'
import { preparePageDataDesignAgentRun } from '@/services/page-data-design/page-data-design-agent-run-provider'
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

function createEditor(dirtyFileNames: readonly PageNodeFileName[] = ['pagedata.json']): ProjectWorkspace {
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
    orchestration: { userMessage: '补数据表', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 4, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('preparePageDataDesignAgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('routes pageDataDesign alias to pageDesign run and saves only pagedata.json', async () => {
    const editor = createEditor(['pagedata.json', 'rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDataDesignAgentRun({
      requestId: 'request-1',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: '补 CRUD 表', effectiveDescription: '订单列表需要主从表' },
    }, {} as AiAgentHost)

    const result = await host.run('pageDataDesign', {
      pageId: 'orders',
      description: '补 CRUD 表',
      effectiveDescription: '订单列表需要主从表',
    } as JsonParams)

    expect(mocks.activatePageDesignAgentWorkflow).toHaveBeenCalledOnce()
    expect(mocks.delegateHost.run).toHaveBeenCalledWith(
      PAGE_DESIGN_MODULE_ID,
      expect.objectContaining({
        pageId: 'orders',
        allowedOperations: { dataSet: true, nodeTree: false, script: false, style: false, blueprint: false },
      }),
      undefined,
    )
    expect(editor.savePageFile).toHaveBeenCalledOnce()
    expect(editor.savePageFile).toHaveBeenCalledWith('pagedata.json')
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'saved',
      artifacts: [{ kind: 'page-file', name: 'pagedata.json', status: 'saved' }],
    })
  })

  it('skips save when pagedata.json is not dirty', async () => {
    const editor = createEditor(['rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDataDesignAgentRun({
      requestId: 'request-2',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: 'noop', effectiveDescription: 'x' },
    }, {} as AiAgentHost)

    const result = await host.run('pageDataDesign', {
      pageId: 'orders',
      description: 'noop',
      effectiveDescription: 'x',
    } as JsonParams)
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'pagedata.json', status: 'skipped' }],
    })
  })

  it('rolls back delivery extras when pageDesign run fails', async () => {
    const editor = createEditor(['pagedata.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValue(new Error('tool loop failed'))

    const host = await preparePageDataDesignAgentRun({
      requestId: 'request-3',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: 'fail', effectiveDescription: 'x' },
    }, {} as AiAgentHost)

    let caught: unknown
    try {
      await host.run('pageDataDesign', {
        pageId: 'orders',
        description: 'fail',
        effectiveDescription: 'x',
      } as JsonParams)
    } catch (error: unknown) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(editor.savePageFile).not.toHaveBeenCalled()
    const extras = readAiDeliveryErrorExtras(caught)
    expect(extras?.delivery.status).toBe('rolledBack')
    expect(extras?.delivery.artifacts).toEqual([
      { kind: 'page-file', name: 'pagedata.json', status: 'rolledBack' },
    ])
  })

  it('passes through unrelated alias without wrapping host', async () => {
    const host = await preparePageDataDesignAgentRun({
      requestId: 'request-4',
      alias: 'pageDesign',
      args: { pageId: 'orders' },
    }, mocks.delegateHost as unknown as AiAgentHost)

    expect(host).toBe(mocks.delegateHost)
    expect(mocks.activatePageDesignAgentWorkflow).not.toHaveBeenCalled()
  })
})
