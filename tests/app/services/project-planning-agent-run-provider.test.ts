import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { prepareProjectPlanningAgentRun } from '@/services/project-planning/project-planning-agent-run-provider'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'

const mocks = vi.hoisted(() => {
  const createHeadlessProjectPlanningEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  const blueprintTree = { nodeId: 'root', parentNodeId: '', projectId: 'hr-enterprise-planning-smoke', kind: 'module', capability: { name: 'Root', description: '默认项目需求' }, source: {}, children: [{ nodeId: 'people', parentNodeId: 'root', projectId: 'hr-enterprise-planning-smoke', kind: 'page', capability: { name: 'People', description: 'People page' }, source: {} }] }
  let runtimeOptions: { scenarioIds: string[]; loadScenario: (scenarioId: string) => Promise<unknown> } | undefined
  const runtime = { destroyed: false, isLoaded: true, load: vi.fn(async () => { if (runtimeOptions) await runtimeOptions.loadScenario(runtimeOptions.scenarioIds[0]!) }), getDataSet: vi.fn(() => ({})), dispose: vi.fn(() => { runtime.destroyed = true }) }
  return {
    createHeadlessProjectPlanningEditor,
    delegateHost,
    activateProjectPlanningAgentWorkflow: vi.fn(async () => delegateHost),
    blueprintTree,
    runtime,
    setRuntimeOptions: (value: typeof runtimeOptions) => { runtimeOptions = value },
    loadScenario: vi.fn(async () => ({})),
    loadProjectTree: vi.fn(async () => blueprintTree),
    ownerDispose: vi.fn(),
    synchronize: vi.fn((project: ProjectWorkspace['project']) => project.replaceBlueprintTree(blueprintTree as never)),
  }
})

vi.mock('@spark-appworks/spark-project-model', async importOriginal => {
  const actual = await importOriginal<typeof import('@spark-appworks/spark-project-model')>()
  return { ...actual, PageRuntime: class { constructor(options: never) { mocks.setRuntimeOptions(options as never); return mocks.runtime as never } } }
})
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({ loadLowcodeRuntimeScenario: mocks.loadScenario }))
vi.mock('@/services/project/blueprint-workspace-dataview', () => ({
  BlueprintWorkspaceDataView: class { projectId = 'hr-enterprise-planning-smoke'; hasTreeProjection = true; dirty = false; hasPendingChildCreate = false; hasUnconfirmedSave = false; loadProjectTree = mocks.loadProjectTree; treeProjection = () => mocks.blueprintTree; dispose = mocks.ownerDispose },
}))
vi.mock('@/services/project-planning/project-planning-agent-workflow-binding', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/project-planning/project-planning-agent-workflow-binding')>()
  return { ...actual, synchronizeProjectPlanningTreeFromDataView: mocks.synchronize }
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
    blueprint: {},
  })
  editor.project.replaceBlueprintTree({
    nodeId: 'root', parentNodeId: '', projectId, kind: 'module',
    capability: { name: 'Root', description: '默认项目需求' }, source: {},
    children: [
      {
        nodeId: 'people', parentNodeId: 'root', projectId, kind: 'page',
        capability: { name: 'People', description: 'People page' }, source: {},
      },
    ],
  })
  expect('loadBlueprint' in editor).toBe(false)
  expect('saveAll' in editor).toBe(false)
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'projectPlanning',
        businessInstanceId: 'hr-enterprise-planning-smoke',
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
    mocks.runtime.destroyed = false
    mocks.setRuntimeOptions(undefined)
    mocks.runtime.load.mockClear()
    mocks.runtime.dispose.mockClear()
    mocks.runtime.getDataSet.mockClear()
    mocks.loadScenario.mockClear()
    mocks.loadProjectTree.mockClear()
    mocks.ownerDispose.mockClear()
    mocks.synchronize.mockClear()
  })

  it('normalizes application-scoped Agent Run args into app tool input', async () => {
    const editor = createEditor()
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    const args = {
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      saveBlueprintAfterRun: false,
    }

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-1',
      alias: 'projectPlanning',
      args,
    }, {} as AiAgentHost)
    host.dryRun('projectPlanning', args as JsonParams)

    expect(mocks.createHeadlessProjectPlanningEditor).toHaveBeenCalledWith({
      projectId: 'hr-enterprise-planning-smoke',
    })
    expect(mocks.delegateHost.dryRun).toHaveBeenCalledWith('projectPlanning', {
      projectScopeKey: 'hr-enterprise-planning-smoke:request-1',
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      blueprintNodes: [
        {
          nodeId: 'root',
          title: 'Root',
          kind: 'module',
          requirement: '默认项目需求',
        },
        {
          nodeId: 'people',
          title: 'People',
          kind: 'page',
          requirement: 'People page',
        },
      ],
    })
    expect('loadBlueprint' in editor).toBe(false)
    expect(mocks.loadScenario).toHaveBeenCalledWith({ projectId: 'hr-enterprise-planning-smoke', scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY })
    expect(mocks.loadProjectTree).toHaveBeenCalledOnce()
    expect(mocks.synchronize).toHaveBeenCalledOnce()
    expect(mocks.ownerDispose).toHaveBeenCalledOnce()
    expect(mocks.runtime.dispose).toHaveBeenCalledOnce()
  })

  it('does not save the blueprint unless Agent Run args explicitly request it', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page',
        capability: { name: 'People', description: 'People page' }, source: {},
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-2',
      alias: 'projectPlanning',
      args: {
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
      },
    }, {} as AiAgentHost)
    editor.project.replaceBlueprintChildren([{ nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page', capability: { name: 'People', description: 'Changed' }, source: {} }])

    const result = await host.run('projectPlanning', {} as JsonParams)

    expect('saveAll' in editor).toBe(false)
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'project-blueprint', name: 'project-blueprint', status: 'skipped' }],
    })
  })

  it('fails closed instead of saving through ProjectWorkspace when saveBlueprintAfterRun is true', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page',
        capability: { name: 'People', description: 'People page' }, source: {},
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-3',
      alias: 'projectPlanning',
      args: {
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveBlueprintAfterRun: true,
      },
    }, {} as AiAgentHost)
    editor.project.replaceBlueprintChildren([{ nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page', capability: { name: 'People', description: 'Changed' }, source: {} }])

    await expect(host.run('projectPlanning', {} as JsonParams)).rejects.toThrow(/没有获准的 Base_NavigationInfo DataView 命令上下文/iu)

    expect('saveAll' in editor).toBe(false)
  })

  it('rolls back delivery metadata when run fails', async () => {
    const editor = createEditor()
    editor.project.replaceBlueprintChildren([
      {
        nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page',
        capability: { name: 'People', description: 'People page' }, source: {},
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValue(new Error('run failed'))

    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-rollback',
      alias: 'projectPlanning',
      args: {
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveBlueprintAfterRun: true,
      },
    }, {} as AiAgentHost)
    editor.project.replaceBlueprintChildren([{ nodeId: 'people', parentNodeId: 'root', projectId: editor.project.projectId, kind: 'page', capability: { name: 'People', description: 'Changed' }, source: {} }])

    let thrown: unknown
    try {
      await host.run('projectPlanning', {} as JsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect('saveAll' in editor).toBe(false)
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toEqual({
      mode: 'auto',
      status: 'rolledBack',
      artifacts: [{ kind: 'project-blueprint', name: 'project-blueprint', status: 'rolledBack' }],
      message: 'run failed',
    })
  })

  it('derives project planning run identity from projectId and requestId without tenant input', async () => {
    const editor = createEditor()
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    const args = { projectId: 'hr-enterprise-planning-smoke', requirement: '产品需求' }
    const host = await prepareProjectPlanningAgentRun({
      requestId: 'request-4',
      alias: 'projectPlanning',
      args,
    }, {} as AiAgentHost)
    host.dryRun('projectPlanning', args as JsonParams)

    expect(mocks.createHeadlessProjectPlanningEditor).toHaveBeenCalledWith({projectId:'hr-enterprise-planning-smoke'})
    expect(mocks.delegateHost.dryRun).toHaveBeenCalledWith('projectPlanning', expect.objectContaining({
      projectScopeKey: 'hr-enterprise-planning-smoke:request-4',
      projectId: 'hr-enterprise-planning-smoke',
    }))
    expect(mocks.delegateHost.dryRun.mock.calls.at(-1)?.[1]).not.toHaveProperty('tenantId')
    const result = await host.run('projectPlanning', {} as JsonParams)
    expect(result.resultExtras?.['projectPlanning']).not.toHaveProperty('tenantId')
    expect(result.resultExtras?.['projectPlanning']).toMatchObject({projectScopeKey:'hr-enterprise-planning-smoke'})
  })

  it('releases the DataView owner and runtime when the formal tree query fails closed', async () => {
    const editor = createEditor()
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    mocks.loadProjectTree.mockRejectedValueOnce(new Error('正式蓝图查询失败'))

    await expect(prepareProjectPlanningAgentRun({
      requestId: 'request-query-failure',
      alias: 'projectPlanning',
      args: { projectId: 'hr-enterprise-planning-smoke' },
    }, {} as AiAgentHost)).rejects.toThrow('正式蓝图查询失败')

    expect(mocks.ownerDispose).toHaveBeenCalledOnce()
    expect(mocks.runtime.dispose).toHaveBeenCalledOnce()
    expect(mocks.activateProjectPlanningAgentWorkflow).not.toHaveBeenCalled()
    expect('loadBlueprint' in editor).toBe(false)
  })
})
