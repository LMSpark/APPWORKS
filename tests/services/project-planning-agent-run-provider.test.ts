import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import { prepareProjectPlanningAgentRun } from '@/services/project-planning/project-planning-agent-run-provider'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'

const mocks = vi.hoisted(() => {
  const createHeadlessProjectPlanningEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  return {
    createHeadlessProjectPlanningEditor,
    delegateHost,
    activateProjectPlanningAgentWorkflow: vi.fn(async () => delegateHost),
  }
})

vi.mock('@/services/project-planning/project-planning-headless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/project-planning/project-planning-headless')>()
  return {
    ...actual,
    createHeadlessProjectPlanningEditor: mocks.createHeadlessProjectPlanningEditor,
  }
})

vi.mock('@/services/ai/agent-workflow-bindings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {
    ...actual,
    activateProjectPlanningAgentWorkflow: mocks.activateProjectPlanningAgentWorkflow,
  }
})

function createEditor(projectId = 'hr-enterprise-planning-smoke'): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId,
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ children: [] }) },
  })
  editor.project.replaceBlueprintTree({
    id: 'root',
    title: 'Root',
    blueprintKind: 'project',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '默认项目需求',
    children: [
      {
        id: 'people',
        title: 'People',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ],
  })
  vi.spyOn(editor, 'loadBlueprint').mockResolvedValue(editor.project.blueprintTree)
  vi.spyOn(editor, 'saveAll').mockResolvedValue()
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'projectPlanning',
        businessInstanceId: 'lmspark:hr-enterprise-planning-smoke',
      },
    } as never,
  }
}

function createDryRunResult(): AiAgentHostDryRunResult {
  return {
    ok: true,
    alias: 'projectPlanning',
    moduleId: 'projectPlanning',
    normalizedInput: {},
    scope: {} as never,
    orchestration: { userMessage: '需求', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('prepareProjectPlanningAgentRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('normalizes tenant-scoped Agent Run args into app tool input', async () => {
    const editor = createEditor()
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    const args = {
      tenantId: 'lmspark',
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      saveBlueprintAfterRun: false,
    }

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-1',
      alias: 'projectPlanning',
      args,
    }, {} as AiAgentHost)

    host.dryRun('projectPlanning', args as AiJsonParams)

    expect(mocks.createHeadlessProjectPlanningEditor).toHaveBeenCalledWith({
      tenantId: 'lmspark',
      projectId: 'hr-enterprise-planning-smoke',
    })
    expect(mocks.delegateHost.dryRun).toHaveBeenCalledWith('projectPlanning', {
      projectScopeKey: 'lmspark:hr-enterprise-planning-smoke:request-1',
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      blueprintNodes: [
        {
          nodeId: 'root',
          title: 'Root',
          blueprintKind: 'project',
          nodeKind: 'module',
          requirement: '默认项目需求',
        },
        {
          nodeId: 'people',
          title: 'People',
          blueprintKind: 'page',
          nodeKind: 'page',
          requirement: 'People page',
        },
      ],
    })
  })

  it('does not save the blueprint unless Agent Run args explicitly request it', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        id: 'people',
        title: 'People',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-2',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
      },
    }, {} as AiAgentHost)

    const result = await host.run('projectPlanning', {} as AiJsonParams)

    expect(editor.saveAll).not.toHaveBeenCalled()
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'project-blueprint', name: 'project-blueprint', status: 'skipped' }],
    })
  })

  it('saves the blueprint only when saveBlueprintAfterRun is true', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        id: 'people',
        title: 'People',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-3',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveBlueprintAfterRun: true,
      },
    }, {} as AiAgentHost)

    const result = await host.run('projectPlanning', {} as AiJsonParams)

    expect(editor.saveAll).toHaveBeenCalledOnce()
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'saved',
      artifacts: [{ kind: 'project-blueprint', name: 'project-blueprint', status: 'saved' }],
    })
    expect(result.resultExtras?.['projectPlanning']).toEqual(expect.objectContaining({
      savedBlueprint: true,
    }))
  })

  it('rolls back delivery metadata when run fails', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        id: 'people',
        title: 'People',
        blueprintKind: 'page',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValue(new Error('run failed'))

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-rollback',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveBlueprintAfterRun: true,
      },
    }, {} as AiAgentHost)

    let thrown: unknown
    try {
      await host.run('projectPlanning', {} as AiJsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(editor.saveAll).not.toHaveBeenCalled()
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toEqual({
      mode: 'auto',
      status: 'rolledBack',
      artifacts: [{ kind: 'project-blueprint', name: 'project-blueprint', status: 'rolledBack' }],
      message: 'run failed',
    })
  })

  it('fails fast when tenantId is missing', async () => {
    await expect(prepareProjectPlanningAgentRun({
      requestId: 'request-4',
      alias: 'projectPlanning',
      args: {
        projectId: 'hr-enterprise-planning-smoke',
      },
    }, {} as AiAgentHost)).rejects.toThrow(/tenantId/u)
  })
})
