import { describe, expect, it } from 'vitest'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '../src/blueprint/project-blueprint-node'
import { ProjectBlueprintNode } from '../src/blueprint/project-blueprint-node'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import * as ProjectBlueprintApi from '@spark-appworks/spark-project-model'

describe('ProjectBlueprint', () => {
  function createRoot(children: ProjectBlueprintTreeNodeData[]): ProjectBlueprintTreeData { return {nodeId:'homepage_root',parentNodeId:'',projectId:'crm',kind:'module',capability:{name:'CRM'},navigation:{title:'CRM',order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{},children} }

  function createWorkspace(): ProjectWorkspace {
    return new ProjectWorkspace({
      projectId: 'crm',
      pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => createRoot([]) },
    })
  }

  it.each(['rule.json', 'script.js', 'style.css'] as const)(
    'keeps edits after submitting %s dirty and recognizes undo to the saved value',
    async (fileName) => {
      let finishSave: () => void = () => { throw new Error('save has not started') }
      const submitted: string[] = []
      const workspace = new ProjectWorkspace({
        projectId: 'crm',
        pageFiles: {
          readPageFile: async () => '',
          saveFileContent: async (_pageId, _fileName, text) => {
            submitted.push(text)
            await new Promise<void>((resolve) => { finishSave = resolve })
          },
        },
        blueprint: { loadRoot: async () => createRoot([]) },
      })
      const page = workspace.project.openPageDesign('orders')
      workspace.project.setActivePage('orders')
      const textA = fileName === 'rule.json' ? '[{"id":"a","type":"text"}]' : 'A'
      const textB = fileName === 'rule.json' ? '[{"id":"b","type":"text"}]' : 'B'
      page.setFileText(fileName, textA)
      const savedText = page.getFileText(fileName)
      const saving = workspace.savePageFile(fileName)
      expect(submitted).toEqual([savedText])
      page.setFileText(fileName, textB)
      finishSave()
      await saving

      expect(page.getDirtyFileNames()).toContain(fileName)
      expect(page.undoFile(fileName)).toBe(true)
      expect(page.getFileText(fileName)).toBe(savedText)
      expect(page.getDirtyFileNames()).not.toContain(fileName)
      expect(page.redoFile(fileName)).toBe(true)
      expect(page.getDirtyFileNames()).toContain(fileName)
    },
  )

  it('preserves edits made while a tool file is loading and refuses dirty reload',async()=>{
    let finish:(text:string)=>void=()=>{}
    const workspace=new ProjectWorkspace({projectId:'crm',pageFiles:{readPageFile:()=>new Promise(resolve=>{finish=resolve})},blueprint:{loadRoot:async()=>createRoot([])}})
    workspace.project.setActivePage('orders');const page=workspace.project.getActivePage()!
    const loading=workspace.loadPageFile('script.js');const rejection=expect(loading).rejects.toThrow('EDIT_DURING_LOAD')
    page.setFileText('script.js','local');finish('remote');await rejection
    expect(page.script.text).toBe('local');await expect(workspace.loadPageFile('script.js',{forceReload:true})).rejects.toThrow('PAGE_TOOL_DIRTY')
  })

  it('saves dirty tools retained outside the current selection',async()=>{
    const writes:string[]=[]
    const workspace=new ProjectWorkspace({projectId:'crm',pageFiles:{readPageFile:async()=>'',saveFileContent:async(id,name)=>{writes.push(`${id}/${name}`)}},blueprint:{loadRoot:async()=>createRoot([])}})
    workspace.project.setActivePage('first');workspace.project.writePageFile({fileName:'script.js',text:'first'})
    workspace.project.setActivePage('second');workspace.project.writePageFile({fileName:'style.css',text:'second'})
    workspace.project.clearActivePage();expect(workspace.project.readDirtyProjection().hasAnyDirty).toBe(true)
    await workspace.saveAll();expect(writes).toEqual(['first/script.js','second/style.css']);expect(workspace.project.readDirtyProjection().hasAnyDirty).toBe(false)
  })

  it('keeps a failed working-file submission dirty', async () => {
    const workspace = new ProjectWorkspace({
      projectId: 'crm',
      pageFiles: {
        readPageFile: async () => '',
        saveFileContent: async () => { throw new Error('write rejected') },
      },
      blueprint: { loadRoot: async () => createRoot([]) },
    })
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    page.setFileText('script.js', 'A')

    await expect(workspace.savePageFile('script.js')).rejects.toThrow('write rejected')
    expect(page.script.isDirty).toBe(true)
    expect(page.script.text).toBe('A')
  })

  it('rejects a working-file read invalidated by a completed save without restoring stale content', async () => {
    let finishRead: (text: string) => void = () => { throw new Error('read has not started') }
    let reads = 0
    let remoteText = 'old'
    const workspace = new ProjectWorkspace({
      projectId: 'crm',
      pageFiles: {
        readPageFile: async () => {
          reads += 1
          return reads === 1 ? new Promise<string>((resolve) => { finishRead = resolve }) : remoteText
        },
        saveFileContent: async (_pageId, _fileName, text) => { remoteText = text },
      },
      blueprint: { loadRoot: async () => createRoot([]) },
    })
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    const loading = workspace.loadPageFile('script.js')
    const rejected = expect(loading).rejects.toThrow('PAGE_FILE_READ_STALE')
    page.setFileText('script.js', 'saved')
    await workspace.savePageFile('script.js')
    finishRead('old')
    await rejected

    expect(page.script.text).toBe('saved')
    expect(page.script.isDirty).toBe(false)
    await workspace.loadPageFile('script.js')
    expect(reads).toBe(2)
    expect(page.script.text).toBe('saved')
  })

  it.each(['file', 'page', 'all'] as const)('does not refill cleared %s content from an in-flight read', async (scope) => {
    let finishRead: (text: string) => void = () => { throw new Error('read has not started') }
    const loader = new ProjectBlueprintApi.PageContentLoader({ projectId: 'crm',
      readPageFile: async ({ pageId }) => pageId === 'orders'
        ? new Promise<string>((resolve) => { finishRead = resolve }) : 'reports' })
    await loader.loadPageFileContent('reports', 'script.js')
    const loading = loader.loadPageFileContent('orders', 'script.js')
    if (scope === 'file') loader.clearCache('/orders/script.js')
    else if (scope === 'page') loader.clearPageCache('orders')
    else loader.clearAllCache()
    finishRead('old')

    expect(await loading).toMatchObject({ success: false, error: expect.stringContaining('PAGE_FILE_READ_STALE') })
    expect(loader.getCacheStats().keys).toEqual(scope === 'all' ? [] : ['crm/reports/script.js'])
  })

  it('keeps a successor read valid when the invalidated predecessor settles', async () => {
    const completions: Array<(text: string) => void> = []
    const loader = new ProjectBlueprintApi.PageContentLoader({ projectId: 'crm',
      readPageFile: async () => new Promise<string>((resolve) => { completions.push(resolve) }) })
    const oldRead = loader.loadPageFileContent('orders', 'script.js')
    loader.clearPageCache('orders')
    const currentRead = loader.loadPageFileContent('orders', 'script.js')
    completions[0]!('old')
    expect(await oldRead).toMatchObject({ success: false })
    completions[1]!('current')
    expect(await currentRead).toMatchObject({ success: true, data: 'current' })
    expect(await loader.loadPageFileContent('orders', 'script.js')).toMatchObject({ data: 'current', fromCache: true })
    expect(completions).toHaveLength(2)
  })

  it('rejects an in-flight file result after the injected project identity changes', async () => {
    let projectId = 'crm'
    let finishRead: (text: string) => void = () => { throw new Error('read has not started') }
    const loader = new ProjectBlueprintApi.PageContentLoader({ getProjectId: () => projectId,
      readPageFile: async () => new Promise<string>((resolve) => { finishRead = resolve }) })
    const loading = loader.loadPageFileContent('orders', 'script.js')
    projectId = 'erp'
    finishRead('crm content')
    expect(await loading).toMatchObject({ success: false, error: expect.stringContaining('PAGE_FILE_READ_STALE') })
    expect(loader.getCacheStats()).toEqual({ size: 0, keys: [] })
  })

  it('constructs a ProjectBlueprint root distinct from nodes and tools',()=>{ const workspace=createWorkspace(); expect(workspace.project).toBeInstanceOf(ProjectBlueprintApi.ProjectBlueprint); expect(workspace.project.openPageDesign('orders')).not.toBeInstanceOf(ProjectBlueprintNode) })
  it('keeps one shared tool definition and distinct formal node identities across reloads',()=>{const workspace=createWorkspace();const a=node('a'),b=node('b');a.navigation!.target='cfg:shared';b.navigation!.target='cfg:shared';a.dataSpace={scenarioId:'s-a',models:[]};b.dataSpace={scenarioId:'s-b',models:[]};workspace.project.replaceBlueprintTree(createRoot([a,b]));const first=workspace.project.findNodeById('a');const tool=workspace.project.openPageDesign('shared');tool.setFileText('script.js','dirty');workspace.project.replaceBlueprintTree(createRoot([a,b]));expect(workspace.project.findNodeById('a')).toBe(first);expect(workspace.project.findNodeById('b')?.toNodeData().dataSpace?.scenarioId).toBe('s-b');expect(workspace.project.openPageDesign('shared')).toBe(tool);expect(tool.script.isDirty).toBe(true)})
  it('preserves four groups and keeps ability name separate from menu title',()=>{const workspace=createWorkspace();const item=node('a');item.navigation!.title='菜单';item.prototype={htmlDescription:'原型'};item.dataSpace={scenarioId:'scene',models:[{metaName:'Orders'}]};workspace.project.replaceBlueprintTree(createRoot([item]));const model=workspace.project.findNodeById('a')!;expect(model.name).toBe('a');expect(model.title).toBe('菜单');const snap=model.toNodeData();snap.capability.name='changed';expect(model.name).toBe('a');expect(model.toNodeData()).toMatchObject({nodeId:'a',kind:'page',prototype:{htmlDescription:'原型'},dataSpace:{scenarioId:'scene'}});expect(model.toNodeData()).not.toHaveProperty('title')})
  it('edits grouped navigation without changing capability or scenario',()=>{const workspace=createWorkspace();const item=node('a');item.dataSpace={scenarioId:'scene',models:[]};workspace.project.replaceBlueprintTree(createRoot([item]));workspace.project.selectNode('a');const draft=workspace.project.beginBlueprintDraft();draft.node.navigation!.title='new menu';workspace.project.applyBlueprintNodeEdit(draft);expect(workspace.project.findNodeById('a')?.toNodeData()).toMatchObject({capability:{name:'a'},navigation:{title:'new menu'},dataSpace:{scenarioId:'scene'}});expect(workspace.project.blueprintDirty).toBe(true)})
  it.each(['module','page','embedded','service','content'] as const)('completes formal planning kind %s',kind=>{const workspace=createWorkspace();workspace.project.replaceBlueprintTree(createRoot([]));workspace.project.replaceBlueprintChildren([{...node('a'),kind}]);expect(workspace.project.completeProjectPlanning()).toMatchObject({ok:true,blueprintKinds:[kind]})})
  it('rejects unresolved planning kind and duplicate node identities',()=>{const workspace=createWorkspace();workspace.project.replaceBlueprintTree(createRoot([]));workspace.project.replaceBlueprintChildren([{...node('a'),kind:'unknown'}]);expect(workspace.project.completeProjectPlanning()).toMatchObject({ok:false,code:'PROJECT_PLANNING_BLUEPRINT_KIND_UNRESOLVED'});expect(()=>workspace.project.replaceBlueprintTree(createRoot([node('a'),node('a')]))).toThrow('重复')})
  it('uses only three tool files',()=>{expect(ProjectBlueprintApi.PAGE_TOOL_FILE_NAMES).toEqual(['rule.json','script.js','style.css']);const tool=createWorkspace().project.openPageDesign('orders');expect(tool).not.toHaveProperty('dataSet');expect(tool).not.toHaveProperty('toNodeData')})
})
function node(id:string):ProjectBlueprintTreeNodeData { return {nodeId:id,parentNodeId:'homepage_root',projectId:'crm',kind:'page',capability:{name:id,description:'需求'},navigation:{title:id,target:`cfg:${id}`,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}} }
