import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createAppAgentWorkflowRuntimeBindings } from '@/services/ai/agent-workflow-bindings'
import { createAgentWorkflowDefinitionFromDesign } from '@/services/workflow-designs'
import { evaluateProjectPlanningToolGate, resolveProjectPlanningDomainRoot } from '@/services/project-planning/project-planning-agent-workflow-binding'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { normalizeLowcodeProjectBlueprintRecords } from '@spark-appworks/spark-lowcode-api'

describe('projectPlanning formal node input', () => {
  it('commits two existing leaf name and memo updates as one DataView batch and verifies both readbacks', async () => {
    const projectId='APP-A'
    const first={nodeId:'first',parentNodeId:'root',projectId,kind:'page' as const,capability:{name:'First'},source:{rowid:'first',SysId:projectId,prowid:'root',name:'First',memo:'',conType:'Navitem'}}
    const second={nodeId:'second',parentNodeId:'root',projectId,kind:'page' as const,capability:{name:'Second'},source:{rowid:'second',SysId:projectId,prowid:'root',name:'Second',memo:'',conType:'Navitem'}}
    const root={nodeId:'root',parentNodeId:'',projectId,kind:'module' as const,capability:{name:'Root'},source:{},children:[first,second]}
    const editor=new ProjectWorkspace({projectId,pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>root}})
    editor.project.replaceBlueprintTree(root);editor.project.markBlueprintClean('root')
    let readback=root
    const owner={projectId,hasTreeProjection:true,dirty:false,hasPendingChildCreate:false,hasUnconfirmedSave:false,hasPendingBlueprintCommand:false,
      treeProjection:()=>readback,hasOutput:()=>true,load:vi.fn(async()=>{}),
      updateNodeDataBatch:vi.fn((prepared:readonly {node:typeof first}[])=>{readback={...root,children:prepared.map(({node})=>({...node,source:{...node.source,name:node.capability.name,memo:String(('description' in node.capability?node.capability.description:undefined)??'')}}))}}),
      saveNodes:vi.fn(async()=>{}),preflightNodeDataBatch:vi.fn(async(updates:readonly typeof first[])=>updates.map((node,index)=>({nodeId:node.nodeId,key:node.nodeId,patch:{memo:`updated ${index+1}`},node})))}
    const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner as never},{moduleInstanceId:projectId} as never)
    const requested=[{...first,capability:{name:'First revised',description:'one'}},{...second,capability:{name:'Second revised',description:'two'}}]
    const result=await Promise.resolve(facade.replaceBlueprintChildren({children:requested}))
    expect(owner.preflightNodeDataBatch).toHaveBeenCalledOnce()
    expect(owner.updateNodeDataBatch).toHaveBeenCalledOnce()
    expect(owner.saveNodes).toHaveBeenCalledOnce()
    expect(result.children.map(node=>[node.nodeId,node.capability.name,node.source['memo']])).toEqual([['first','First revised','one'],['second','Second revised','two']])
  })

  it('keeps replaceBlueprintChildren in the formal action guide after async DataView adaptation', () => {
    const shard = JSON.parse(readFileSync('generated/dts-class-model/files/src/services/project-planning/project-planning-agent-workflow-binding.ts.json', 'utf8')) as {
      $defs?: Record<string, { properties?: Record<string, unknown>; $defs?: Record<string, unknown> }>
    }
    const facade = shard.$defs?.['ProjectPlanningBlueprintFacade']

    expect(facade?.properties).toHaveProperty('replaceBlueprintChildren')
  })

  it('commits one added leaf through the supplied live blueprint DataView and returns its readback', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({
      projectId,
      pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
    })
    editor.project.replaceBlueprintTree({
      nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {},
      children: [{ nodeId: 'existing', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Existing' }, source: {} }],
    })
    editor.project.markBlueprintClean('root')
    let readback = editor.project.blueprintTree
    const addChildNode = vi.fn(async (parentId: string, fields: Record<string, unknown>, id?: string) => {
      readback = { ...readback, children: [...readback.children, { nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Planned' }, source: { ...fields, rowid: id, prowid: parentId, SysId: projectId } }] }
      return id ?? 'owner-id'
    })
    const owner = {
      projectId,
      hasTreeProjection: true,
      dirty: false,
      treeProjection: () => readback,
      addChildNode,
      view: { queryColumns: [{ name: 'name' }, { name: 'conType' }, { name: 'FunName' }, { name: 'FunOrderValue' }] },
      hasOutput: (field: string) => ['name', 'conType', 'FunName', 'FunOrderValue', 'prowid'].includes(field),
    }
    let completionSnapshot: { projectId: string; result: ReturnType<NonNullable<Parameters<typeof resolveProjectPlanningDomainRoot>[0]['getDataViewCompletionResult']>> } | undefined
    const getCompletion = (id: string) => completionSnapshot?.projectId === id ? completionSnapshot.result : undefined
    const onCompletion = (id: string, result: NonNullable<ReturnType<typeof getCompletion>>) => { completionSnapshot = { projectId: id, result } }
    const binding = { getProjectPlanningEditor: () => editor, blueprintDataView: owner as never, getDataViewCompletionResult: getCompletion, onDataViewCompletionConfirmed: onCompletion }
    const planningRoot = resolveProjectPlanningDomainRoot(binding, { moduleInstanceId: projectId } as never)

    const result = await Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [
      ...readback.children,
      { nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Planned' }, source: {} },
    ] }))

    expect(addChildNode).toHaveBeenCalledOnce()
    expect(addChildNode).toHaveBeenCalledWith('root', expect.objectContaining({ name: 'Planned', conType: 'Navitem' }), 'planned')
    expect(result.children.map(child => child.nodeId)).toEqual(['existing', 'planned'])
    expect(editor.project.blueprintDirty).toBe(false)
    const agentCompleteFacade = resolveProjectPlanningDomainRoot(binding, { moduleInstanceId: projectId } as never)
    expect(agentCompleteFacade.completeProjectPlanning()).toMatchObject({ ok: true, completed: true })

    const nextRunFacade = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor }, { moduleInstanceId: projectId } as never)
    expect(nextRunFacade.completeProjectPlanning()).toMatchObject({ ok: false, code: 'PROJECT_PLANNING_BLUEPRINT_NOT_WRITTEN' })
    const otherProject = new ProjectWorkspace({ projectId: 'APP-B', pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root-b', parentNodeId: '', projectId: 'APP-B', kind: 'module', capability: { name: 'Root B' }, source: {}, children: [] }) } })
    otherProject.project.replaceBlueprintTree({ nodeId: 'root-b', parentNodeId: '', projectId: 'APP-B', kind: 'module', capability: { name: 'Root B' }, source: {}, children: [{ nodeId: 'b-node', parentNodeId: 'root-b', projectId: 'APP-B', kind: 'page', capability: { name: 'B' }, source: {} }] })
    otherProject.project.markBlueprintClean('root')
    const otherProjectFacade = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => otherProject, getDataViewCompletionResult: getCompletion }, { moduleInstanceId: 'APP-B' } as never)
    expect(otherProjectFacade.completeProjectPlanning()).toMatchObject({ ok: false, code: 'PROJECT_PLANNING_BLUEPRINT_NOT_WRITTEN' })
  })

  it('commits one existing leaf description update through the original DataView owner', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [{ nodeId: 'existing', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Existing' }, source: {} }] })
    editor.project.markBlueprintClean('root')
    let current = { ...editor.project.blueprintTree, children: [{ ...editor.project.blueprintTree.children[0]!, source: { rowid: 'existing', SysId: projectId, prowid: 'root', name: 'Existing', memo: '', conType: 'Navitem' } }] }
    const updateNodeData = vi.fn()
    const saveSelectedNode = vi.fn(async () => {
      current = { ...current, children: [{ ...current.children[0]!, capability: { ...current.children[0]!.capability, description: 'New description' }, source: { ...current.children[0]!.source, memo: 'New description' } }] }
    })
    const owner = { projectId, hasTreeProjection: true, dirty: false, treeProjection: () => current, load: vi.fn(async () => {}), updateNodeData, saveSelectedNode, view: { queryColumns: [] }, hasOutput: () => true }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)
    const changed = { ...current.children[0]!, capability: { ...current.children[0]!.capability, description: 'New description' } }

    const result = await Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [changed] }))

    expect(owner.load).toHaveBeenCalledWith('existing')
    expect(updateNodeData).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'existing', capability: expect.objectContaining({ description: 'New description' }) }))
    expect(saveSelectedNode).toHaveBeenCalledOnce()
    expect(result.children[0]?.capability.description).toBe('New description')
    expect(editor.project.blueprintDirty).toBe(false)
    await expect(planningRoot.replaceBlueprintChildren({ children: [{ ...changed, capability: { ...changed.capability, description: 'Second description' } }] })).rejects.toThrow(/one DataView command per AI run/iu)
    expect(saveSelectedNode).toHaveBeenCalledOnce()
  })

  it('keeps an unknown single-leaf update on the original owner and rejects a second command', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [{ nodeId: 'existing', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Existing' }, source: {} }] })
    editor.project.markBlueprintClean('root')
    const current = { ...editor.project.blueprintTree, children: [{ ...editor.project.blueprintTree.children[0]!, source: { rowid: 'existing', SysId: projectId, prowid: 'root', name: 'Existing', memo: '', conType: 'Navitem' } }] }
    let staged = false
    const updateNodeData = vi.fn(() => { staged = true })
    const saveSelectedNode = vi.fn(async () => { throw new Error('receipt unknown') })
    const owner = { projectId, hasTreeProjection: true, get dirty() { return staged }, get hasUnconfirmedSave() { return staged }, treeProjection: () => current, load: vi.fn(async () => {}), updateNodeData, saveSelectedNode, view: { queryColumns: [] }, hasOutput: () => true }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)
    const originalTree = editor.project.blueprintTree
    const changed = { ...current.children[0]!, capability: { ...current.children[0]!.capability, description: 'Unknown description' } }

    await expect(planningRoot.replaceBlueprintChildren({ children: [changed] })).rejects.toThrow(/未确认.*保留原 DataView command/iu)
    expect(editor.project.blueprintTree).toEqual(originalTree)
    await expect(planningRoot.replaceBlueprintChildren({ children: [changed] })).rejects.toThrow(/one DataView command per AI run/iu)
    expect(saveSelectedNode).toHaveBeenCalledOnce()
  })

  it('rejects non-leaf updates, parent changes, and mixed commands before calling the DataView owner', async()=>{
    const projectId='APP-A'
    const leaf={nodeId:'leaf',parentNodeId:'parent-a',projectId,kind:'page' as const,capability:{name:'Leaf'},source:{}}
    const parentA={nodeId:'parent-a',parentNodeId:'root',projectId,kind:'module' as const,capability:{name:'A'},source:{},children:[leaf]}
    const parentB={nodeId:'parent-b',parentNodeId:'root',projectId,kind:'module' as const,capability:{name:'B'},source:{},children:[]}
    const root={nodeId:'root',parentNodeId:'',projectId,kind:'module' as const,capability:{name:'Root'},source:{},children:[parentA,parentB]}
    const editor=new ProjectWorkspace({projectId,pageFiles:{readPageFile:async()=>''},blueprint:{loadRoot:async()=>root}})
    editor.project.replaceBlueprintTree(root);editor.project.markBlueprintClean('root')
    const load=vi.fn(),updateNodeData=vi.fn(),saveSelectedNode=vi.fn()
    const owner={projectId,hasTreeProjection:true,dirty:false,treeProjection:()=>root,load,updateNodeData,saveSelectedNode,view:{queryColumns:[]},hasOutput:()=>true}
    const facade=resolveProjectPlanningDomainRoot({getProjectPlanningEditor:()=>editor,blueprintDataView:owner as never},{moduleInstanceId:projectId} as never)
    const originalProjectTree=editor.project.blueprintTree

    await expect(facade.replaceBlueprintChildren({children:[{...parentA,capability:{name:'A updated'}} ,parentB]})).rejects.toThrow(/既有叶节点同父/iu)
    await expect(facade.replaceBlueprintChildren({children:[{...parentA,children:[{...leaf,projectId:'APP-B'}]},parentB]})).rejects.toThrow(/其他项目/iu)
    const moved={...leaf,parentNodeId:'parent-b'}
    await expect(facade.replaceBlueprintChildren({children:[{...parentA,children:[]},{...parentB,children:[moved]}]})).rejects.toThrow(/移动、删除/iu)
    const added={nodeId:'added',parentNodeId:'parent-a',projectId,kind:'page' as const,capability:{name:'Added'},navigation:{title:'Added',order:1,publishInMenu:false,showChildren:false,beginGroup:false},source:{}}
    await expect(facade.replaceBlueprintChildren({children:[{...parentA,children:[{...leaf,capability:{name:'Leaf updated'}},added]},parentB]})).rejects.toThrow(/移动、删除/iu)
    expect(load).not.toHaveBeenCalled();expect(updateNodeData).not.toHaveBeenCalled();expect(saveSelectedNode).not.toHaveBeenCalled()
    expect(editor.project.blueprintTree).toEqual(originalProjectTree)
  })

  it('preflights every command in a mixed tree plan before the first DataView write', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [{ nodeId: 'existing', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Existing' }, source: {} }] })
    editor.project.markBlueprintClean('root')
    const current = editor.project.blueprintTree
    const addChildNode = vi.fn()
    const owner = { projectId, hasTreeProjection: true, dirty: false, treeProjection: () => current, addChildNode,
      view: { queryColumns: [] }, hasOutput: (field: string) => field !== 'memo' }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)
    const updated = { ...current.children[0]!, capability: { name: 'Existing', description: 'new description' } }
    const created = { nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page' as const, capability: { name: 'Planned' }, source: {} }

    await expect(planningRoot.replaceBlueprintChildren({ children: [updated, created] })).rejects.toThrow(/未正式输出.*memo/iu)
    expect(addChildNode).not.toHaveBeenCalled()
    expect(editor.project.blueprintDirty).toBe(false)
  })

  it('marks the AI run partial when a later plan is rejected after the first DataView command', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] })
    editor.project.markBlueprintClean('root')
    let readback = editor.project.blueprintTree
    let completion: { projectId: string; result: { ok: boolean; completed?: boolean; code?: string } } | undefined
    const owner = {
      projectId, hasTreeProjection: true, dirty: false, treeProjection: () => readback,
      hasOutput: () => true,
      addChildNode: vi.fn(async (parentId: string, fields: Record<string, unknown>, id?: string) => {
        const record = normalizeLowcodeProjectBlueprintRecords([{ ...fields, rowid: id, prowid: parentId, SysId: projectId }])[0]!
        readback = { ...readback, children: [...readback.children, {
          nodeId: record.nodeId, parentNodeId: record.parentNodeId, projectId: record.projectId, kind: record.kind,
          capability: record.capability, ...(record.navigation === undefined ? {} : { navigation: record.navigation }),
          ...(record.dataSpace === undefined ? {} : { dataSpace: record.dataSpace }),
          ...(record.prototype === undefined ? {} : { prototype: record.prototype }), source: record.source,
        }] }
        return id ?? ''
      }),
    }
    const planningRoot = resolveProjectPlanningDomainRoot({
      getProjectPlanningEditor: () => editor,
      blueprintDataView: owner as never,
      getDataViewCompletionResult: (id) => completion?.projectId === id ? completion.result as never : undefined,
      onDataViewCompletionConfirmed: (id, result) => { completion = { projectId: id, result } },
      onRepeatedDataViewBlueprintWrite: (id) => {
        completion = { projectId: id, result: { ok: false, code: 'PROJECT_PLANNING_BLUEPRINT_PARTIAL' } }
      },
    }, { moduleInstanceId: projectId } as never)

    await Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [{
      nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Planned' }, source: {},
    }] }))
    await expect(planningRoot.replaceBlueprintChildren({ children: [{
      nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Renamed' }, source: {},
    }] })).rejects.toThrow(/one DataView command per AI run/iu)

    expect(owner.addChildNode).toHaveBeenCalledOnce()
    expect(planningRoot.completeProjectPlanning()).toMatchObject({ ok: false, code: 'PROJECT_PLANNING_BLUEPRINT_PARTIAL' })
  })

  it('rejects blueprint payloads that the formal NavigationInfo wire cannot preserve', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] })
    editor.project.markBlueprintClean('root')
    let current = editor.project.blueprintTree
    const addChildNode = vi.fn(async (parentId: string, fields: Record<string, unknown>, id?: string) => {
      const record = normalizeLowcodeProjectBlueprintRecords([{ ...fields, rowid: id, prowid: parentId, SysId: projectId }])[0]!
      current = { ...current, children: [...current.children, {
        nodeId: record.nodeId, parentNodeId: record.parentNodeId, projectId: record.projectId, kind: record.kind,
        capability: record.capability, ...(record.navigation === undefined ? {} : { navigation: record.navigation }),
        ...(record.dataSpace === undefined ? {} : { dataSpace: record.dataSpace }),
        ...(record.prototype === undefined ? {} : { prototype: record.prototype }), source: record.source,
      }] }
      return id ?? ''
    })
    const owner = { projectId, hasTreeProjection: true, dirty: false, treeProjection: () => current, addChildNode,
      view: { queryColumns: [] }, hasOutput: () => true }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)

    await expect(Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [{
      nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Planned' }, source: {},
      dataSpace: { scenarioId: 'SCENE-1', models: [{ metaName: 'Orders' }] },
    }] }))).rejects.toThrow(/models.*DataView|DataView.*models|不能持久化/iu)
    expect(addChildNode).not.toHaveBeenCalled()
    expect(planningRoot.completeProjectPlanning()).toMatchObject({ ok: false })
  })

  it('rejects non-empty source payloads before the DataView command starts', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] })
    editor.project.markBlueprintClean('root')
    const addChildNode = vi.fn(async (_parentId: string, _fields: Record<string, unknown>, id?: string) => id ?? '')
    const owner = { projectId, hasTreeProjection: true, dirty: false, treeProjection: () => editor.project.blueprintTree, addChildNode,
      view: { queryColumns: [] }, hasOutput: () => true }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)

    await expect(Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [{
      nodeId: 'planned', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Planned' }, source: { generatedBy: 'AI' },
    }] }))).rejects.toThrow(/wire.*不承接.*source/iu)
    expect(addChildNode).not.toHaveBeenCalled()
  })

  it('rejects duplicated existing node IDs instead of treating a missing node as unchanged', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({ projectId, pageFiles: { readPageFile: async () => '' }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) } })
    const existing = [
      { nodeId: 'a', parentNodeId: 'root', projectId, kind: 'page' as const, capability: { name: 'A' }, source: {} },
      { nodeId: 'b', parentNodeId: 'root', projectId, kind: 'page' as const, capability: { name: 'B' }, source: {} },
    ]
    editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: existing })
    editor.project.markBlueprintClean('root')
    const current = editor.project.blueprintTree
    const addChildNode = vi.fn()
    const owner = { projectId, hasTreeProjection: true, dirty: false, treeProjection: () => current, addChildNode, view: { queryColumns: [] }, hasOutput: () => true }
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor, blueprintDataView: owner as never }, { moduleInstanceId: projectId } as never)

    await expect(Promise.resolve(planningRoot.replaceBlueprintChildren({ children: [
      existing[0]!, existing[0]!, { nodeId: 'c', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'C' }, source: {} },
    ] }))).rejects.toThrow(/重复.*nodeId|nodeId.*重复/iu)
    expect(addChildNode).not.toHaveBeenCalled()
  })

  it('blocks blueprint replacement before it can mutate the project tree', async () => {
    const projectId = 'APP-A'
    const editor = new ProjectWorkspace({
      projectId,
      pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
    })
    editor.project.replaceBlueprintTree({
      nodeId: 'root', parentNodeId: '', projectId, kind: 'module', capability: { name: 'Root' }, source: {},
      children: [{ nodeId: 'existing', parentNodeId: 'root', projectId, kind: 'page', capability: { name: 'Existing' }, source: {} }],
    })
    editor.project.markBlueprintClean('root')
    const originalTree = editor.project.blueprintTree
    const planningRoot = resolveProjectPlanningDomainRoot({ getProjectPlanningEditor: () => editor }, { moduleInstanceId: projectId } as never)

    await expect(planningRoot.replaceBlueprintChildren({ children: [] })).rejects.toThrow(/DataView/iu)
    expect(Object.getPrototypeOf(planningRoot)).toBeNull()
    expect(Object.getOwnPropertyDescriptor(planningRoot, 'design')).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(planningRoot, 'session')).toBeUndefined()
    expect(Reflect.get(Object.getPrototypeOf(planningRoot) ?? {}, 'replaceBlueprintChildren')).toBeUndefined()
    const detachedTree = Object.getOwnPropertyDescriptor(planningRoot, 'blueprintTree')?.get?.call(planningRoot) as {
      children: unknown[]
    }
    expect(() => detachedTree.children.pop()).toThrow()
    expect(editor.project.blueprintTree).toEqual(originalTree)
    expect(editor.project.blueprintDirty).toBe(false)
  })

  it('interpolates the formal kind and teaches the bounded single-batch sibling write contract', () => {
    const prompt = createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '订单与库存管理',
        blueprintNodes: [{ nodeId: 'orders', title: '订单', kind: 'page', requirement: '订单查询' }],
      },
    })
    expect(prompt).toContain('orders (page) 订单')
    expect(prompt).toContain('capability: { name:')
    expect(prompt).toContain('每次 AI run 最多发起一个 Base_NavigationInfo DataView/DataSet 保存批次')
    expect(prompt).toContain('批量更新多个原树现存叶节点的正式 name/memo')
    expect(prompt).toContain('父子节点不得同批')
    expect(prompt).toContain('parentNodeId,')
    expect(prompt).not.toContain('nodeId: "core-service"')
    expect(prompt).not.toContain('blueprintKind')
    expect(prompt).not.toContain('nodeKind')
  })

  it('rejects the retired planning fields instead of inferring kind', () => {
    expect(() => createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '需求',
        blueprintNodes: [{ nodeId: 'old', title: 'Old', blueprintKind: 'page', nodeKind: 'page', requirement: '需求' }],
      },
    })).toThrow('kind')
  })

  it('accepts an explicitly included node with an empty requirement', () => {
    const prompt = createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '项目需求',
        blueprintNodes: [{ nodeId: 'empty', title: '待策划', kind: 'module', requirement: '' }],
      },
    })
    expect(prompt).toContain('empty (module) 待策划')
  })

  it('routes ProjectBlueprint actions to the action guide', () => {
    expect(evaluateProjectPlanningToolGate({
      toolName: 'model_attribute_guide', args: { kind: 'ProjectBlueprint', attributeName: 'replaceBlueprintChildren' },
    })).toEqual(expect.objectContaining({ ok: false, fix: expect.stringContaining('kind: "ProjectBlueprint"') }))
  })

  it('keeps the saved planning definition equal to the design projection', () => {
    const base = 'config/agent-workflows/lmspark/homepage/agent.workflow.projectPlanning/'
    const design = JSON.parse(readFileSync(`${base}design.json`, 'utf8'))
    const definition = JSON.parse(readFileSync(`${base}definition.json`, 'utf8'))
    const projection = createAgentWorkflowDefinitionFromDesign(design, { publishedAt: definition.x_spark.publishedAt })
    expect(projection).toEqual(definition)
    expect(definition.workflow.runtimeBinding.inputContract.paramsSchema.properties.blueprintNodes.items.required)
      .toEqual(['nodeId', 'title', 'kind', 'requirement'])
  })
})
