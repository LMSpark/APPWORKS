import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectBlueprint, ProjectWorkspace, type ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
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
import { runProjectPlanningAiSession } from '@/services/project-planning/project-planning-ai-runner'
import { resolveProjectPlanningDomainRoot } from '@/services/project-planning/project-planning-agent-workflow-binding'
import { BLUEPRINT_WORKSPACE_FIELD_NAMES } from '@/views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview'

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
    activateProjectPlanningAgentWorkflow: vi.fn(async (options: { host: AiAgentHost }) => projectPlanningHost),
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
    blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
  })
  seedPlanningProject(editor.project)
  return editor
}

function seedPlanningProject(project: ProjectBlueprint): void {
  project.replaceBlueprintTree({
    nodeId: 'homepage_root', parentNodeId: '', projectId: project.projectId, kind: 'module',
    capability: { name: 'Demo', description: '订单与库存管理' }, source: {},
    children: [
      {
        nodeId: 'orders', parentNodeId: 'homepage_root', projectId: project.projectId, kind: 'page',
        capability: { name: '订单', description: '订单页' }, source: {},
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
      host: aiHost,
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
          kind: 'module',
          requirement: '订单与库存管理',
        },
        {
          nodeId: 'orders',
          title: '订单',
          kind: 'page',
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
      host: aiHost,
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

  it('does not submit a dirty blueprint through ProjectWorkspace delivery', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    editor.project.replaceBlueprintChildren([
      {
        nodeId: 'orders', parentNodeId: 'homepage_root', projectId: editor.project.projectId, kind: 'page',
        capability: { name: '订单', description: '订单页' }, source: {},
      },
    ])

    await expect(runProjectPlanningAiSession({
      editor,
      host: aiHost,
      saveBlueprintAfterRun: true,
    })).rejects.toThrow(/没有获准的 Base_NavigationInfo DataView 命令上下文/iu)

    expect(saveAll).not.toHaveBeenCalled()
    expect(editor.project.blueprintDirty).toBe(true)
  })

  it('reports DataView receipt as saved and never invokes ProjectWorkspace.saveAll', async () => {
    const editor = createEditor('demo')
    editor.project.markBlueprintClean('root')
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    let current = editor.project.blueprintTree
    const owner = {
      projectId: 'demo', hasTreeProjection: true, dirty: false,
      treeProjection: () => current,
      view: { queryColumns: BLUEPRINT_WORKSPACE_FIELD_NAMES.map(name => ({ name })) },
      hasOutput: (field: string) => BLUEPRINT_WORKSPACE_FIELD_NAMES.includes(field as never),
      addChildNode: vi.fn(async (parentId: string, fields: Record<string, unknown>, id?: string) => {
        current = { ...current, children: [...current.children, { nodeId: id!, parentNodeId: current.nodeId, projectId: 'demo', kind: 'page', capability: { name: 'Planned' }, source: { ...fields, rowid: id!, prowid: parentId, SysId: 'demo' } }] }
        return id!
      }),
    }
    mocks.projectPlanningRun.mockImplementationOnce(async () => {
      const activation = mocks.activateProjectPlanningAgentWorkflow.mock.calls.at(-1)?.[0] as unknown as Parameters<typeof resolveProjectPlanningDomainRoot>[0]
      const firstFacade = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      await Promise.resolve(firstFacade.replaceBlueprintChildren({ children: [...current.children, { nodeId: 'planned', parentNodeId: current.nodeId, projectId: 'demo', kind: 'page', capability: { name: 'Planned' }, source: {} }] }))
      const secondFacade = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      expect(secondFacade.completeProjectPlanning()).toMatchObject({ ok: true, completed: true })
      let repeatedWriteError: unknown
      try {
        await Promise.resolve(secondFacade.replaceBlueprintChildren({ children: current.children.map(node =>
          node.nodeId === 'existing' ? { ...node, capability: { name: 'Updated after save' } } : node,
        ) }))
      } catch (error) { repeatedWriteError = error }
      expect(repeatedWriteError).toBeInstanceOf(Error)
      expect((repeatedWriteError as Error).message).toMatch(/one DataView command per AI run|后续.*拒绝/iu)
      expect(secondFacade.completeProjectPlanning()).toMatchObject({ ok: false, code: 'PROJECT_PLANNING_BLUEPRINT_PARTIAL' })
      expect(owner.addChildNode).toHaveBeenCalledOnce()
      return createRunResult()
    })

    await expect(runProjectPlanningAiSession({ editor, blueprintDataView: owner as never, saveBlueprintAfterRun: true }))
      .rejects.toThrow(/later plan change was refused|后续计划变更已拒绝/iu)

    expect(owner.addChildNode).toHaveBeenCalledOnce()
    expect(saveAll).not.toHaveBeenCalled()
  })

  it('submits several independent leaves under one existing parent as one DataView batch', async () => {
    const editor = createEditor('demo')
    editor.project.markBlueprintClean('root')
    let current = editor.project.blueprintTree
    const owner = {
      projectId: 'demo', hasTreeProjection: true, dirty: false,
      treeProjection: () => current,
      view: { queryColumns: BLUEPRINT_WORKSPACE_FIELD_NAMES.map(name => ({ name })) },
      hasOutput: (field: string) => BLUEPRINT_WORKSPACE_FIELD_NAMES.includes(field as never),
      addChildNodes: vi.fn(async (parentId: string, additions: readonly { nodeId: string; fields: Record<string, unknown> }[]) => {
        current = { ...current, children: [...current.children, ...additions.map(({nodeId, fields}) => ({
          nodeId, parentNodeId: parentId, projectId: 'demo', kind: 'page' as const,
          capability: { name: String(fields['name'] ?? '') }, source: {...fields, rowid: nodeId, SysId: 'demo', prowid: parentId},
        }))] }
        return additions.map(item => item.nodeId)
      }),
    }
    mocks.projectPlanningRun.mockImplementationOnce(async () => {
      const activation = mocks.activateProjectPlanningAgentWorkflow.mock.calls.at(-1)?.[0] as unknown as Parameters<typeof resolveProjectPlanningDomainRoot>[0]
      const root = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      const existing = current.children[0]!
      await Promise.resolve(root.replaceBlueprintChildren({ children: [existing,
        {nodeId: 'planned-a', parentNodeId: current.nodeId, projectId: 'demo', kind: 'page', capability: {name: 'A'}, navigation: {title: 'A', order: 1, publishInMenu: true, showChildren: true, beginGroup: false}, source: {}},
        {nodeId: 'planned-b', parentNodeId: current.nodeId, projectId: 'demo', kind: 'page', capability: {name: 'B'}, navigation: {title: 'B', order: 2, publishInMenu: true, showChildren: true, beginGroup: false}, source: {}},
      ]}))
      expect(root.completeProjectPlanning()).toMatchObject({ok: true, completed: true})
      return createRunResult()
    })

    await expect(runProjectPlanningAiSession({ editor, blueprintDataView: owner as never, saveBlueprintAfterRun: true })).resolves.toBeDefined()

    expect(owner.addChildNodes).toHaveBeenCalledOnce()
    expect(owner.addChildNodes).toHaveBeenCalledWith(current.nodeId, expect.arrayContaining([
      expect.objectContaining({nodeId: 'planned-a'}), expect.objectContaining({nodeId: 'planned-b'}),
    ]))
    expect(current.children.map(node => node.nodeId)).toEqual(['orders', 'planned-a', 'planned-b'])
  })

  it('submits leaves under multiple existing parents as one DataView batch', async () => {
    const editor = createEditor('demo')
    const existing = editor.project.blueprintTree
    const rootChild: ProjectBlueprintTreeNodeData = {
      nodeId: 'root-page', parentNodeId: existing.nodeId, projectId: 'demo', kind: 'page',
      capability: { name: 'Root page' }, source: {},
      navigation: { title: 'Root page', order: 0, publishInMenu: true, showChildren: true, beginGroup: false },
    }
    const branch: ProjectBlueprintTreeNodeData = {
      nodeId: 'branch', parentNodeId: existing.nodeId, projectId: 'demo', kind: 'module',
      capability: { name: 'Branch' }, source: {}, children: [{
        nodeId: 'branch-page', parentNodeId: 'branch', projectId: 'demo', kind: 'page',
        capability: { name: 'Branch page' }, source: {},
        navigation: { title: 'Branch page', order: 0, publishInMenu: true, showChildren: true, beginGroup: false },
      }],
      navigation: { title: 'Branch', order: 1, publishInMenu: true, showChildren: true, beginGroup: false },
    }
    const current = { ...existing, children: [rootChild, branch] }
    editor.project.replaceBlueprintTree(current)
    editor.project.markBlueprintClean('root')
    const additions: Array<{ nodeId: string; parentNodeId: string; fields: Record<string, unknown> }> = []
    let confirmed = current
    const addChildNodesAcrossParents = vi.fn(async (commands: readonly typeof additions[number][]) => {
      additions.push(...commands)
      const rootCommands = commands.filter(command => command.parentNodeId === 'root-page')
      const nestedCommands = commands.filter(command => command.parentNodeId === 'branch')
      confirmed = {
        ...current,
        children: [
          {...rootChild, children: rootCommands.map(command => ({
            nodeId: command.nodeId, parentNodeId: command.parentNodeId, projectId: 'demo', kind: 'page' as const,
            capability: {name: String(command.fields['name']??'')}, source: {...command.fields,rowid:command.nodeId,SysId:'demo',prowid:command.parentNodeId},
            navigation:{title:String(command.fields['FunName']??''),order:Number(command.fields['FunOrderValue']??0),publishInMenu:true,showChildren:true,beginGroup:false},
          }))},
          {...branch, children:[...(branch.children??[]),...nestedCommands.map(command=>({
            nodeId: command.nodeId, parentNodeId: command.parentNodeId, projectId: 'demo', kind: 'page' as const,
            capability: {name: String(command.fields['name']??'')}, source: {...command.fields,rowid:command.nodeId,SysId:'demo',prowid:command.parentNodeId},
            navigation:{title:String(command.fields['FunName']??''),order:Number(command.fields['FunOrderValue']??0),publishInMenu:true,showChildren:true,beginGroup:false},
          }))]},
        ],
      }
      return commands.map(command => command.nodeId)
    })
    const owner = {
      projectId: 'demo', hasTreeProjection: true, dirty: false,
      treeProjection: () => confirmed,
      view: { queryColumns: BLUEPRINT_WORKSPACE_FIELD_NAMES.map(name => ({ name })) },
      hasOutput: (field: string) => BLUEPRINT_WORKSPACE_FIELD_NAMES.includes(field as never),
      addChildNodesAcrossParents,
    }
    mocks.projectPlanningRun.mockImplementationOnce(async () => {
      const activation = mocks.activateProjectPlanningAgentWorkflow.mock.calls.at(-1)?.[0] as unknown as Parameters<typeof resolveProjectPlanningDomainRoot>[0]
      const root = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      const requested = [
        {...rootChild, children:[{nodeId:'root-new',parentNodeId:rootChild.nodeId,projectId:'demo',kind:'page' as const,capability:{name:'Root new'},source:{},navigation:{title:'Root new',order:1,publishInMenu:true,showChildren:true,beginGroup:false}}]},
        {...branch,children:[...(branch.children??[]),{nodeId:'branch-new',parentNodeId:branch.nodeId,projectId:'demo',kind:'page' as const,capability:{name:'Branch new'},source:{},navigation:{title:'Branch new',order:1,publishInMenu:true,showChildren:true,beginGroup:false}}]},
      ]
      await Promise.resolve(root.replaceBlueprintChildren({children:requested}))
      expect(root.completeProjectPlanning()).toMatchObject({ok:true,completed:true})
      return createRunResult()
    })

    await expect(runProjectPlanningAiSession({editor,blueprintDataView:owner as never,saveBlueprintAfterRun:true})).resolves.toBeDefined()

    expect(owner.addChildNodesAcrossParents).toHaveBeenCalledOnce()
    expect(additions.map(command=>[command.nodeId,command.parentNodeId])).toEqual([
      ['root-new','root-page'],['branch-new','branch'],
    ])
    expect(confirmed.children.find(node=>node.nodeId==='root-page')?.children?.map(node=>node.nodeId)).toEqual(['root-new'])
    expect(confirmed.children.find(node=>node.nodeId==='branch')?.children?.map(node=>node.nodeId)).toEqual(['branch-page','branch-new'])
  })

  it('builds planning inputs from the complete DataView tree rather than stale workspace rows', async () => {
    const editor = createEditor('demo')
    editor.project.markBlueprintClean('root')
    const tree = { ...editor.project.blueprintTree, children: [...editor.project.blueprintTree.children, {
      nodeId: 'data-view-only', parentNodeId: 'homepage_root', projectId: 'demo', kind: 'page' as const,
      capability: { name: 'DataView only', description: 'authoritative row' }, source: {},
    }] }
    const owner = { projectId: 'demo', hasTreeProjection: true, dirty: false, treeProjection: () => tree }

    const result = await runProjectPlanningAiSession({ editor, blueprintDataView: owner as never })

    expect(result.input.blueprintNodes.map(node => node.nodeId)).toContain('data-view-only')
    expect(editor.project.blueprintDirty).toBe(false)
  })

  it('keeps DataView receipt pending even when dirtyTracking is clear', async () => {
    const editor = createEditor('demo')
    editor.project.markBlueprintClean('root')
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    const current = editor.project.blueprintTree
    let pending = false
    const owner = {
      projectId: 'demo', hasTreeProjection: true, dirty: false,
      get hasPendingChildCreate() { return pending }, hasUnconfirmedSave: false,
      treeProjection: () => current,
      view: { queryColumns: BLUEPRINT_WORKSPACE_FIELD_NAMES.map(name => ({ name })) },
      hasOutput: (field: string) => BLUEPRINT_WORKSPACE_FIELD_NAMES.includes(field as never),
      addChildNode: vi.fn(async () => { pending = true; throw new Error('readback not confirmed') }),
    }
    mocks.projectPlanningRun.mockImplementationOnce(async () => {
      const activation = mocks.activateProjectPlanningAgentWorkflow.mock.calls.at(-1)?.[0] as unknown as Parameters<typeof resolveProjectPlanningDomainRoot>[0]
      const root = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      try {
        await Promise.resolve(root.replaceBlueprintChildren({ children: [...current.children, { nodeId: 'planned', parentNodeId: current.nodeId, projectId: 'demo', kind: 'page', capability: { name: 'Planned' }, source: {} }] }))
      } catch { /* Model script may continue; delivery must still observe the original pending command. */ }
      return createRunResult()
    })

    await expect(runProjectPlanningAiSession({ editor, blueprintDataView: owner as never, saveBlueprintAfterRun: true }))
      .rejects.toThrow(/DataView 命令仍待核验/iu)

    expect(owner.addChildNode).toHaveBeenCalledOnce()
    expect(saveAll).not.toHaveBeenCalled()
    expect(pending).toBe(true)
  })

  it('fails closed before blueprint mutation and delivery can call the legacy save path', async () => {
    const editor = createEditor('demo')
    const originalTree = editor.project.blueprintTree
    editor.project.markBlueprintClean('root')
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    mocks.projectPlanningRun.mockImplementationOnce(async () => {
      const activation = mocks.activateProjectPlanningAgentWorkflow.mock.calls.at(-1)?.[0] as unknown as {
        getProjectPlanningEditor: (context: { moduleInstanceId: string }) => ProjectWorkspace
      }
      const root = resolveProjectPlanningDomainRoot(activation, { moduleInstanceId: 'demo' } as never)
      await Promise.resolve(root.replaceBlueprintChildren({ children: [] }))
      return createRunResult()
    })

    await expect(runProjectPlanningAiSession({
      editor,
      host: createAiHost(),
      saveBlueprintAfterRun: true,
    })).rejects.toThrow(/nodeId.*DataView.*rowid/iu)

    expect(editor.project.blueprintTree).toEqual(originalTree)
    expect(editor.project.blueprintDirty).toBe(false)
    expect(saveAll).not.toHaveBeenCalled()
  })

  it('creates an isolated host per run when none is injected', async () => {
    const hosts: AiAgentHost[] = []
    mocks.activateProjectPlanningAgentWorkflow.mockImplementation(async (options: { host: AiAgentHost }) => {
      hosts.push(options.host)
      return mocks.projectPlanningHost
    })

    await runProjectPlanningAiSession({ editor: createEditor('alpha') })
    await runProjectPlanningAiSession({ editor: createEditor('beta') })

    expect(hosts).toHaveLength(2)
    expect(hosts[0]).not.toBe(hosts[1])
  })
})
