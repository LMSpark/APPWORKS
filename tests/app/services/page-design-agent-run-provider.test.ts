import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageRuntime, ProjectWorkspace, ScenarioDefinitionResource, type PageToolFileName } from '@spark-appworks/spark-project-model'
import {DataSet} from '@spark-appworks/spark-data'
import definitionConfig from '../../../config/pages/data-platform/data-space-design/pagedata.json'
import { AiAgentRegistration, createAiAgentHost, createSimpleInputContract, DefaultAiAgentSessionStore, AiAgentToolResult } from '@spark-appworks/spark-ai/agent'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import { createPageDesignInlineDeliveryPort, preparePageDesignAgentRun } from '@/services/page-design/page-design-agent-run-provider'
import type { AiAgentRunTarget } from '@/services/ai/ai-agent-run'
import type { ActivatePageDesignAgentWorkflowOptions } from '@/services/ai/agent-workflow-bindings'
import { readAiDeliveryErrorExtras } from '@/services/ai/ai-delivery-port'
import { resolvePageDesignProject } from '@/services/page-design/page-design-agent-workflow-binding'
import { readPageDesignRunContext } from '@/services/page-design/page-design-gates'
import {guardPageDesignEditor} from '@/services/page-design/page-design-operation-guard'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',()=>({loadLowcodeRuntimeScenario:vi.fn()}))

type PageDesignTestActivationOptions = Pick<ActivatePageDesignAgentWorkflowOptions, 'host' | 'getPageDesignEditor'>
type PageDesignTestActivation = (options: PageDesignTestActivationOptions) => Promise<AiAgentRunTarget>

/** Storage adapter is real; formal model validation is covered by the metadata chain suite. */
async function loadDefinitions(workspace: ProjectWorkspace, scenarioId: string, assertCurrent: () => void): Promise<DataSet> {
  const tables = Object.fromEntries(Object.entries(definitionConfig.tables).filter(([, table]) => 'resourceId' in table && table.resourceId.startsWith('pagedata:')))
  const dataSet = DataSet.fromJson({scenarioId: definitionConfig.scenarioId, dataSetName: 'Definitions', tables})
  const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: definitionConfig.scenarioId, targetScenarioId: scenarioId,
    assertCurrent, validate: async () => {}})
  for (const table of Object.values(dataSet.tables)) for (const view of table.viewList) {
    view.queryContext = {...view.queryContext, dataSpaceId: scenarioId}
    view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
  }
  return dataSet
}

function createBlueprintRuntimeDataSet(options:{fail?:boolean}={}):DataSet{
  const scenarioId='7AB874097A1E8711A42FD845939A6E05'
  const fields=['rowid','SysId','prowid','FunOrderValue','name','memo','FunName','NavigationUrl','IsShowAtNav','NavigationType']
  const dataSet=DataSet.fromJson({scenarioId,tables:{Base_NavigationInfo:{modelBinding:{modelId:'formal-model',modelName:'Base_NavigationInfo'},columns:fields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{autoLoad:false}}}}})
  dataSet.getView('Base_NavigationInfo','default')!.bindQueryExecutor({executeQuery:async()=>{
    if(options.fail)throw new Error('formal view query failed')
    return {rows:[{rowid:'ROOT',SysId:'demo',prowid:'000000',FunOrderValue:0,name:'Root',memo:'Root description',FunName:'Root',NavigationUrl:'',IsShowAtNav:0,NavigationType:'Model'},
      {rowid:'orders',SysId:'demo',prowid:'ROOT',FunOrderValue:1,name:'Orders',memo:'Orders description',FunName:'Orders',NavigationUrl:'cfg:orders',IsShowAtNav:1,NavigationType:'Page'}],total:2,countReported:true,resultPrimaryKey:'rowid',
      assertIdentity:actual=>{if(actual.scenarioId!==scenarioId||actual.metaName!=='Base_NavigationInfo')throw new Error('formal query identity mismatch')},rowKey:row=>row['rowid'],
      fieldAccess:()=>({read:'visible',write:'denied',component:'readonly',required:false,writeMode:'readonly'}),readFieldAccess:()=> 'visible',addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> 'hidden',createChildActionState:()=> 'hidden',viewActionState:()=> 'hidden'}
  }})
  return dataSet
}

async function editScene(editor: ProjectWorkspace) {
  const scene = await editor.loadScenarioDefinitions({scenarioId: 'SCENE-A'})
  const view = scene.getView('DataSpaceLayoutDefinition')!
  await view.refresh()
  view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'modelPositions', {M: {x: 25, y: 30}})
  return {scene, view}
}

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
    activatePageDesignAgentWorkflow: vi.fn<PageDesignTestActivation>(async () => delegateHost),
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

function createEditor(dirtyFileNames: readonly PageToolFileName[] = ['rule.json']): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) },
  })
  editor.project.openPageDesign('orders')
  editor.project.getActivePage()?.markLoaded()
  editor.project.setActivePage('orders')
  vi.spyOn(editor, 'selectPage').mockResolvedValue()
  vi.spyOn(editor.project, 'readDirtyProjection').mockReturnValue({
    dirtyFiles: new Set(dirtyFileNames),
    hasAnyFileDirty: dirtyFileNames.length > 0,
    blueprintDirty: false,
    hasAnyDirty: dirtyFileNames.length > 0,
  })
  return editor
}

function dataViewFileSaver(editor:ProjectWorkspace,run?:(name:PageToolFileName,text:string)=>Promise<void>){
  return async(pageId:string,name:PageToolFileName,text:string)=>{
    const page=editor.project.findPageTool(pageId)
    if(!page||editor.project.getActivePage()!==page)throw new Error('test DataView page scope mismatch')
    await (run?.(name,text)??Promise.resolve())
    page.markFileSaved(name,text)
  }
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

describe('pageDesign actual working-file delivery', () => {
  it.each(['script.js', 'style.css'] as const)('preserves successful receipts when %s fails', async (failedName) => {
    const remoteFiles = new Map<string, string>()
    const editor = new ProjectWorkspace({ projectId: 'demo',
      pageFiles: { readPageFile: async () => '', saveFileContent: async (_pageId, fileName, text) => {
        if (fileName === failedName) throw new Error(`write rejected: ${fileName}`)
        remoteFiles.set(fileName, text)
      } }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const page = editor.project.openPageDesign('orders')
    page.markLoaded()
    editor.project.setActivePage('orders')
    page.setFileText('script.js', 'script A')
    page.setFileText('style.css', 'style A')
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders',savePageFile:dataViewFileSaver(editor,async(name,text)=>{if(name===failedName)throw Error(`write rejected: ${name}`);remoteFiles.set(name,text)}) })

    expect(result).toEqual({ mode: 'auto', status: 'failed', message: `write rejected: ${failedName}`,
      artifacts: ['script.js', 'style.css'].map(name => ({ kind: 'page-file', name,
        status: name === failedName ? 'dirty' : 'saved' })) })
    expect(Array.from(editor.project.readDirtyProjection().dirtyFiles)).toEqual([failedName])
    expect(remoteFiles.size).toBe(1)
  })

  it('waits for a successful file after another fails and retains edits made during its save', async () => {
    let finishSave: () => void = () => { throw new Error('save has not started') }
    const saved: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: { readPageFile: async () => '',
      saveFileContent: async (_pageId, fileName, text) => {
        if (fileName === 'style.css') throw new Error('style rejected')
        saved.push(text)
        await new Promise<void>((resolve) => { finishSave = resolve })
      } }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const page = editor.project.openPageDesign('orders')
    page.markLoaded()
    editor.project.setActivePage('orders')
    page.setFileText('script.js', 'script A')
    page.setFileText('style.css', 'style A')
    const saving = createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders',savePageFile:dataViewFileSaver(editor,async(name,text)=>{if(name==='style.css')throw Error('style rejected');saved.push(text);await new Promise<void>(resolve=>{finishSave=resolve})}) })
    let settled = false
    void saving.then(() => { settled = true })
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    const settledBeforeCompletion = settled
    page.setFileText('script.js', 'script B')
    finishSave()
    const result = await saving

    expect(settledBeforeCompletion).toBe(false)
    expect(result.artifacts).toEqual([{ kind: 'page-file', name: 'script.js', status: 'dirty' },
      { kind: 'page-file', name: 'style.css', status: 'dirty' }])
    expect(saved).toEqual(['script A'])
    expect(page.script.text).toBe('script B')
    expect(page.script.isDirty).toBe(true)
  })
})

describe('preparePageDesignAgentRun', () => {
  it('loads planning blueprint from the formal DataView before planning and releases runtime on success and query failure', async()=>{
    const dataSet=createBlueprintRuntimeDataSet(); vi.mocked(loadLowcodeRuntimeScenario).mockResolvedValue(dataSet)
    const editor=createEditor(); mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const dispose=vi.spyOn(BlueprintWorkspaceDataView.prototype,'dispose')
    const runtimeDispose=vi.spyOn(PageRuntime.prototype,'dispose')
    const read=vi.spyOn(lowcodeApi.blueprint,'readRecords')
    mocks.activatePageDesignAgentWorkflow.mockImplementationOnce(async options=>{expect(editor.project.blueprintTree.children[0]?.nodeId).toBe('orders');return mocks.delegateHost})
    await preparePageDesignAgentRun({requestId:'dv-success',alias:'pageDesign',args:{pageId:'orders'}},{} as AiAgentHost)
    expect(loadLowcodeRuntimeScenario).toHaveBeenCalledWith({projectId:'demo',scenarioId:'7AB874097A1E8711A42FD845939A6E05'})
    expect(read).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1)
    expect(runtimeDispose).toHaveBeenCalledTimes(1)
    await expect(dataSet.getView('Base_NavigationInfo','default')!.refresh()).rejects.toThrow('destroyed')
  })
  it('releases the formal owner and PageRuntime after DataView query failure',async()=>{
    vi.mocked(loadLowcodeRuntimeScenario).mockResolvedValue(createBlueprintRuntimeDataSet({fail:true}))
    const editor=createEditor();mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const ownerDispose=vi.spyOn(BlueprintWorkspaceDataView.prototype,'dispose')
    const runtimeDispose=vi.spyOn(PageRuntime.prototype,'dispose')
    await expect(preparePageDesignAgentRun({requestId:'dv-failure',alias:'pageDesign',args:{pageId:'orders'}},{} as AiAgentHost)).rejects.toThrow('formal view query failed')
    expect(ownerDispose).toHaveBeenCalledTimes(1)
    expect(runtimeDispose).toHaveBeenCalledTimes(1)
  })
  it('reports a recovered scene as still dirty until later edits are explicitly delivered', async () => {
    let remote = JSON.stringify({scenarioId:'SCENE-A',tables:{}}), writes = 0
    const editor = new ProjectWorkspace({projectId:'demo',pageFiles:{readPageFile:async()=>''},
      blueprint:{loadRoot:async()=>({children:[]})},scenarioDefinitions:loadDefinitions,
      scenarioViews:{readScope:()=> 'tenant-A',readText:async()=>remote,writeText:async(_id,text)=>{
        remote=text; if(++writes===1)throw new Error('receipt lost')
      }}})
    await editor.selectPage('orders')
    const {view}=await editScene(editor), port=createPageDesignInlineDeliveryPort({autoSave:true})
    const target={editor,pageId:'orders',scenarioId:'SCENE-A',savePageFile:dataViewFileSaver(editor)}
    expect((await port.save(target)).status).toBe('failed')
    view.updateEditingValue(view.getPkKey(view.rows[0]!)!,'modelPositions',{M:{x:55,y:60}})
    const verified=await port.save(target)
    expect(verified.status).toBe('failed')
    expect(verified.artifacts).toEqual([{kind:'scenario-view',name:'SCENE-A',status:'dirty'}])
    expect(verified.message).toContain('仍有修改待保存')
    expect(writes).toBe(1)
    expect((await port.save(target)).status).toBe('saved')
    expect(writes).toBe(2);expect(JSON.parse(remote).layout.modelPositions.M.x).toBe(55)
    editor.dispose()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadLowcodeRuntimeScenario).mockImplementation(async()=>createBlueprintRuntimeDataSet())
    vi.spyOn(lowcodeApi,'readRequestScope').mockReturnValue({token:'test-scope',headers:{'X-AppId':'demo'}} as ReturnType<typeof lowcodeApi.readRequestScope>)
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('keeps confirmed page writes when scenario save fails and reports the remaining scene dirty', async () => {
    let remote = JSON.stringify({ scenarioId: 'SCENE-A', tables: {} })
    let writes = 0
    const editor = new ProjectWorkspace({ projectId: 'demo',
      pageFiles: { readPageFile: async () => '', saveFileContent: async () => {} },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
      scenarioViews: { readScope: () => 'tenant-A', readText: async () => remote,
        writeText: async (_id, text) => { writes++; remote = text; throw new Error('scene write unconfirmed') } },
      scenarioDefinitions: loadDefinitions,
    })
    await editor.selectPage('orders')
    const {scene, view} = await editScene(editor)
    editor.project.writePageFile({ fileName: 'script.js', text: 'script A' })
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders', requestId: 'A', scenarioId: 'SCENE-A',savePageFile:dataViewFileSaver(editor) })
    expect(result.status).toBe('failed')
    expect(result.artifacts).toEqual([{ kind: 'page-file', name: 'script.js', status: 'saved' }, { kind: 'scenario-view', name: 'SCENE-A', status: 'dirty' }])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect(editor.project.getActivePage()?.script.isDirty).toBe(false)
    const verification = await createPageDesignInlineDeliveryPort({autoSave: true}).save({editor, pageId: 'orders', scenarioId: 'SCENE-A',savePageFile:dataViewFileSaver(editor)})
    expect(verification.status).toBe('saved')
    expect(writes).toBe(1)
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    scene.destroy()
  })

  it('shares manual and guarded AI DataView edits and confirms only explicit delivery by storage readback', async () => {
    let remote = JSON.stringify({ scenarioId: 'SCENE-A', tables: {Orders: {modelBinding: {modelId: 'ORDER-ID', modelName: 'Orders'}, views: {default: {}}}} })
    const writes: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: { readPageFile: async () => '' },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
      scenarioViews: { readScope: () => 'tenant-A', readText: async () => remote,
        writeText: async (_id, text) => { writes.push(text); remote = text } },
      scenarioDefinitions: loadDefinitions,
    })
    await editor.selectPage('orders')
    const {scene, view} = await editScene(editor)
    const guarded = guardPageDesignEditor(editor, {dataSet: true})
    const aiDefinitions = await guarded.loadScenarioDefinitions({scenarioId: 'SCENE-A'})
    const aiView = aiDefinitions.getView('DataSpaceLayoutDefinition')!
    expect(aiView.getEditingRow(view.getPkKey(view.rows[0]!)!)?.['modelPositions']).toEqual({M: {x: 25, y: 30}})
    aiView.updateEditingValue(aiView.getPkKey(aiView.rows[0]!)!, 'tablePositions', {Orders: {x: 40, y: 50}})
    const manual = await createPageDesignInlineDeliveryPort({autoSave: false}).save({editor, pageId: 'orders', scenarioId: 'SCENE-A'})
    expect(manual.artifacts).toEqual([{kind: 'scenario-view', name: 'SCENE-A', status: 'dirty'}])
    expect(writes).toHaveLength(0)
    const result = await createPageDesignInlineDeliveryPort({ autoSave: true }).save({ editor, pageId: 'orders', scenarioId: 'SCENE-A',savePageFile:dataViewFileSaver(editor) })
    expect(result).toEqual({ mode: 'auto', status: 'saved', artifacts: [{ kind: 'scenario-view', name: 'SCENE-A', status: 'saved' }] })
    expect(writes).toEqual([remote])
    expect(JSON.parse(remote)).toMatchObject({layout: {modelPositions: {M: {x: 25, y: 30}}, tablePositions: {Orders: {x: 40, y: 50}}}})
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(view.hasEditingChanges()).toBe(false)
    scene.destroy()
  })

  it('isolates real Host.ensure factories, same-page editors, request contexts and A/B release', async () => {
    const editorA = createEditor(['script.js'])
    const editorB = createEditor(['style.css'])
    mocks.createHeadlessPageDesignEditor.mockReturnValueOnce(editorA).mockReturnValueOnce(editorB)
    const getters: Array<(id: string) => ProjectWorkspace> = []
    const factoryCalls: string[] = []
    const hosts: AiAgentHost[] = []
    let releaseA = () => {}
    let releaseB = () => {}
    const doneA = new Promise<void>(resolve => { releaseA = resolve })
    const doneB = new Promise<void>(resolve => { releaseB = resolve })
    const activation: PageDesignTestActivation = async options => {
      const index = hosts.length
      hosts.push(options.host)
      getters.push(id => options.getPageDesignEditor({ moduleInstanceId: id }))
      const registered = options.host.ensure('pageDesign', { moduleId: 'pageDesign', create: () => {
        factoryCalls.push(index === 0 ? 'A' : 'B')
        return new AiAgentRegistration({ moduleId: 'pageDesign', name: 'Page Design', description: 'test request owner',
          runtime: { getTools: () => [], executeTool: async () => AiAgentToolResult.ok({}),
            projectKnowledge: () => ({ promptSnapshot: '' }), inspect: () => ({ status: 'ok', rootKinds: ['ProjectWorkspace'], moduleCount: 1, findings: [] }) },
          inputContract: createSimpleInputContract({ businessId: 'pageDesign', identityField: 'requestId', messageField: 'description',
            paramsSchema: { type: 'object', properties: { requestId: { type: 'string' }, pageId: { type: 'string' }, description: { type: 'string' } }, required: ['requestId', 'pageId', 'description'], additionalProperties: true }, systemPrompt: '' }),
          sessionStore: new DefaultAiAgentSessionStore(),
        })
      } })
      return { has: (alias: string) => registered.has(alias), dryRun: (alias: string, args: unknown) => registered.dryRun(alias, args),
        run: async (_alias: string, input: JsonParams) => {
          const requestId = input['requestId']
          if (typeof requestId !== 'string') throw new Error('requestId missing')
          const editor = resolvePageDesignProject(options, { moduleId: 'pageDesign', moduleInstanceId: requestId, instanceId: requestId })
          expect(editor).toBe(index === 0 ? editorA : editorB)
          await (index === 0 ? doneA : doneB)
          expect(resolvePageDesignProject(options, { moduleId: 'pageDesign', moduleInstanceId: requestId, instanceId: requestId })).toBe(editor)
          return createRunResult()
        },
      }
    }
    mocks.activatePageDesignAgentWorkflow.mockImplementationOnce(activation).mockImplementationOnce(activation)
    const sharedHost = createAiAgentHost({ turnCallbacks: { executeTurn: async () => ({ text: '', toolCalls: [] }), appendMessages: async () => {} } })
    const a = await preparePageDesignAgentRun({ requestId: 'A', alias: 'pageDesign', args: { pageId: 'orders', description: 'A' } }, sharedHost)
    const b = await preparePageDesignAgentRun({ requestId: 'B', alias: 'pageDesign', args: { pageId: 'orders', description: 'B' } }, sharedHost)
    expect(hosts[0]).not.toBe(hosts[1])
    expect(hosts.every(host => host !== sharedHost)).toBe(true)
    expect(factoryCalls).toEqual(['A', 'B'])
    const runA = a.run('pageDesign', {})
    const runB = b.run('pageDesign', {})
    expect(readPageDesignRunContext('A')?.pageId).toBe('orders')
    expect(readPageDesignRunContext('B')?.pageId).toBe('orders')
    await expect(a.run('pageDesign', {})).rejects.toThrow('PAGE_DESIGN_REQUEST_RUNNING')
    releaseA()
    await expect(runA).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')
    expect(readPageDesignRunContext('A')).toBeUndefined()
    expect(() => getters[0]?.('A')).toThrow('not prepared')
    expect(getters[1]?.('B')).toBe(editorB)
    expect(readPageDesignRunContext('B')?.pageId).toBe('orders')
    expect('savePageFile' in editorB).toBe(false)
    releaseB()
    await expect(runB).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')
    expect('savePageFile' in editorA).toBe(false)
    expect('savePageFile' in editorB).toBe(false)
    expect(readPageDesignRunContext('B')).toBeUndefined()
    expect(() => getters[1]?.('B')).toThrow('not prepared')
  })

  it('fails closed when headless Agent Run has no active DevSystem file DataView owner', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDesignAgentRun({
      requestId: 'request-1',
      alias: 'pageDesign',
      args: { pageId: 'orders', description: '生成订单页' },
    }, {} as AiAgentHost)

    await expect(host.run('pageDesign', {} as JsonParams)).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')

    expect(editor.selectPage).toHaveBeenCalledWith('orders', { forceReload: true })
    expect('savePageFile' in editor).toBe(false)
  })

  it.each([[], ['unknown.json'], ['script.js', 'unknown.json'], [17], ['script.js', null],
    null, 'script.js', { file: 'script.js' }].map(value => ({ value })))('rejects invalid save scope $value before running or writing', async ({ value }) => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const host = await preparePageDesignAgentRun({ requestId: 'invalid-scope', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    await expect(host.run('pageDesign', { deliverySaveFileNames: value })).rejects.toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
    expect(mocks.delegateHost.run).not.toHaveBeenCalled()
    expect('savePageFile' in editor).toBe(false)
    expect(readPageDesignRunContext('orders')).toBeUndefined()
  })

  it('fails closed for valid file delivery scope without the active DataView owner', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    const host = await preparePageDesignAgentRun({ requestId: 'valid-scope', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    await expect(host.run('pageDesign', { deliverySaveFileNames: ['script.js'] })).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')
    expect('savePageFile' in editor).toBe(false)
  })

  it('rejects an explicit empty inline delivery scope without writing', async () => {
    const editor = createEditor(['rule.json', 'script.js'])
    const port = createPageDesignInlineDeliveryPort({ autoSave: true, saveFileNames: [] })
    await expect(port.save({ editor, pageId: 'orders' })).rejects.toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
    expect('savePageFile' in editor).toBe(false)
  })

  it('fails closed for inline autoSave when no active file DataView callback is bound',async()=>{
    const editor=createEditor(['script.js'])
    expect('saveDirtyPageFiles' in editor).toBe(false)
    await expect(createPageDesignInlineDeliveryPort({autoSave:true}).save({editor,pageId:'orders'})).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')
    expect('savePageFile' in editor).toBe(false)
  })

  it('does not save and reports dirty artifacts when Agent Run fails', async () => {
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
      await host.run('pageDesign', {} as JsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect('savePageFile' in editor).toBe(false)
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toMatchObject({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'rule.json', status: 'dirty' }],
      message: 'run failed',
    })

    await expect(host.run('pageDesign', {})).rejects.toThrow('PAGE_DESIGN_REQUEST_RELEASED')
  })

  it('retains actual edits and the original error without claiming a rollback', async () => {
    const writes: string[] = []
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: {
      readPageFile: async ({ fileName }) => fileName === 'script.js' ? 'script A' : '',
      saveFileContent: async (_pageId, _fileName, text) => { writes.push(text) },
    }, blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root', description: '需求' }, source: {}, children: [{ nodeId: 'orders', parentNodeId: 'root', projectId: 'demo', kind: 'page', capability: { name: 'Orders', description: '订单页' }, navigation: { title: 'Orders', target: 'cfg:orders', order: 0, publishInMenu: true, showChildren: false, beginGroup: false }, source: { implGate: 'open', upstreamContractsSatisfied: true } }] }) } })
    const failure = new Error('run rejected')
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockImplementationOnce(async () => {
      editor.project.writePageFile({ fileName: 'script.js', text: 'script B' })
      throw failure
    })
    const host = await preparePageDesignAgentRun({ requestId: 'actual-failure', alias: 'pageDesign',
      args: { pageId: 'orders' } }, {} as AiAgentHost)
    let caught: unknown
    try { await host.run('pageDesign', {}) } catch (error: unknown) { caught = error }

    expect(caught).toBe(failure)
    expect(readAiDeliveryErrorExtras(caught)?.delivery).toMatchObject({ mode: 'auto', status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'script.js', status: 'dirty' }], message: 'run rejected' })
    expect(editor.project.getActivePage()?.script.text).toBe('script B')
    expect(editor.project.getActivePage()?.script.isDirty).toBe(true)
    expect(writes).toEqual([])
  })
})
