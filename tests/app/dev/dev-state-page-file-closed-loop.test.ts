import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, watchEffect } from 'vue'
import { DataSet } from '@spark-appworks/spark-data'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { useDevState } from '@/views/app/dev-system/useDevState'
import {
  createDevStateWithConfigPages,
  DEMO_PAGE_FIXTURE,
  ensureDevStateActivePageLoaded,
  isolateAppProjectWorkspaceForTest,
  isDevStatePageDocumentDirty,
} from './dev-state-test-fixture'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { refreshRoutes } from '@spark-appworks/spark-app'
import { lowcodeHttp as http } from '@/lowcode/lowcode-runtime'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'

const httpFns = vi.hoisted(() => ({
  get: vi.fn(),
  requestFull: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  clearCache: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectBlueprintTreeData | null,
}))
const blueprintRuntime = vi.hoisted(() => ({load:vi.fn()}))
const blueprintRuntimeTrees = new Map<string,ProjectBlueprintTreeData>()
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',async importOriginal=>({
  ...await importOriginal<typeof import('@/lowcode/data-space/lowcode-data-space-runtime')>(),
  loadLowcodeRuntimeScenario:blueprintRuntime.load,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    if (navTreeState.tree) return navTreeState.tree
    throw new Error('refreshRoutes: no nav tree')
  }),
  createAiRunAdapter: vi.fn(() => ({
    isRunning: vi.fn(() => false),
    abort: vi.fn(),
    run: vi.fn(async () => 'completed' as const),
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({
      trace: { messages: [], entries: [], toolCalls: [] },
      agUiEvents: [],
      timeline: [],
    })),
  })),
  createAiToolApprovalBridge: vi.fn(() => ({
    beforeFunctionCall: vi.fn(async () => ({ status: 'allow' })),
    cancelPending: vi.fn(() => 0),
    decide: vi.fn(() => false),
    listPending: vi.fn(() => []),
    subscribe: vi.fn((listener: (snapshot: { pending: [] }) => void) => {
      listener({ pending: [] })
      return vi.fn()
    }),
  })),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: httpFns,
  lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => null,
  lowcodeApi: {
    platform: {
      listApplications: async () => httpFns.get('application-catalog:tenant-b'),
    },
  },
  createLowcodeProjectGateways: (projectId: string) => {
    const blueprintKey = `project-blueprint:${projectId}`
    const pageFileKey = `designfile:${projectId}`
    return {
      pageFiles: {
        readPageFile: async (command: { pageId: string; fileName: string }) => {
          const response = await httpFns.get(`${pageFileKey}/${command.pageId}/${command.fileName}`)
          return String(response?.content ?? '')
        },
        createFiles: async (params: {pageId:string}) => {await httpFns.post(`${pageFileKey}/${params.pageId}/create`);return {pageId:params.pageId}},
        deleteFiles: async (pageId:string) => {await httpFns.delete(`${pageFileKey}/${pageId}`)},
        saveFileContent: async (pageId: string, fileName: string, content: string) => {
          await httpFns.put(`${pageFileKey}/${pageId}/${fileName}`, { content })
        },
        listVersions: async (pageId: string, fileName: string) => {
          const rows = await httpFns.get(`${pageFileKey}/${pageId}/${fileName}/versions`)
          return Array.isArray(rows)
            ? rows
            : []
        },
        restoreVersion: async (pageId: string, fileName: string, version: number) => {
          await httpFns.post(`${pageFileKey}/${pageId}/${fileName}/versions/${version}/restore`)
        },
      },
      blueprint: {
        loadRoot: async () => httpFns.get(blueprintKey),
        updateNode: async (id: string, patch: unknown) => {
          const response = await httpFns.put(`${blueprintKey}:nodes:${id}`, patch)
          return response.node ?? response
        },
      },
      projectReferences: {
        listProjects: async () => [],
        loadProjectBlueprint: async () => ({ children: [] }),
      },
    }
  },
}))


function node(nodeId:string,title:string,target:string,projectId='homepage',description=''):ProjectBlueprintTreeNodeData { return {nodeId,parentNodeId:`${projectId}_root`,projectId,kind:'page',capability:{name:title,description},navigation:{title,target,icon:'Document',order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}} }
function blueprintRoot(children:ProjectBlueprintTreeNodeData[],projectId='homepage'):ProjectBlueprintTreeData { return {nodeId:`${projectId}_root`,parentNodeId:'',projectId,kind:'module',capability:{name:projectId},navigation:{title:projectId,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{},children} }

const httpMock = vi.mocked(http)

function notFound(): Error & { response: { status: number } } {
  return Object.assign(new Error('not found'), { response: { status: 404 } })
}

function pageFileResponse(url: string): Record<string, unknown> {
  if (url.endsWith('/rule.json')) return { content: '[]' }
  if (url.endsWith('/pagedata.json')) return { content: '{"dataSetName":"TestDS","tables":{}}' }
  if (url.endsWith('/script.js')) return { content: 'console.log("restored")' }
  if (url.endsWith('/style.css')) return { content: '.restored { color: red; }' }
  return { content: '' }
}

function createBlueprintRuntimeDataSet(projectId:string,root:ProjectBlueprintTreeData={...blueprintRoot([
  {...node('CHILD-A','Child','',projectId),capability:{name:'Child',code:'CHILD-CODE'}},
],projectId),nodeId:'ROOT-A'},access:{hiddenFields?:string[];readonlyFields?:string[]}={},unknownSave=false){
  const fields=['rowid','SysId','prowid','FunOrderValue','name','FunName','funCode','NavigationUrl','NavigationImageWxz','MobileUrl',
    'NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup',
    'conid','conType','memo','htmlDesc','VersionId','DifficultyFactor','Manhour','Number','Sum','Total','personCharge','status']
  const rows:Array<Record<string,unknown>>=[]
  const collect=(item:ProjectBlueprintTreeNodeData,parentId:string,order:number):void=>{
    rows.push({rowid:item.nodeId,SysId:projectId,prowid:parentId,FunOrderValue:item.navigation?.order??order,
      name:item.capability.name,FunName:item.navigation?.title??'',funCode:item.capability.code??'',conType:item.kind,
      NavigationUrl:item.navigation?.target??'',NavigationImageWxz:item.navigation?.icon??'',MobileUrl:item.navigation?.mobileTarget??'',
      NavigationType:item.navigation?.openMode??'',ChildItemLocation:item.navigation?.placement??'',NavigationShowType:item.navigation?.displayMode??'',
      HorizontalAlignment:item.navigation?.horizontalAlignment??'',IsShowAtNav:item.navigation?.publishInMenu?1:0,
      IsShowChildItem:item.navigation?.showChildren?1:0,BeginGroup:item.navigation?.beginGroup?1:0,
      conid:item.dataSpace?.scenarioId??'',memo:item.capability.description??'',htmlDesc:item.prototype?.htmlDescription??'',VersionId:'',
      DifficultyFactor:0,Manhour:0,Number:0,Sum:0,Total:0,personCharge:item.capability.ownerId??'',status:item.capability.deliveryStatus??''})
    item.children?.forEach((child,index)=>collect(child,item.nodeId,index))
  }
  collect(root,'000000',0)
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`,modelName:'Base_NavigationInfo'},
    columns:fields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{autoLoad:false}},
  }}})
  let allPagesRequested=false
  const hiddenFields=new Set(access.hiddenFields??[]),readonlyFields=new Set(access.readonlyFields??[])
  const view=dataSet.getView('Base_NavigationInfo')!
  const result=(selected:Record<string,unknown>[])=>({
    rows:selected,total:selected.length,
    assertIdentity(identity:{scenarioId:string;metaName:string}){if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('blueprint identity mismatch')},
    rowKey:(row:Readonly<Record<string,unknown>>)=>row['rowid'],
    fieldAccess:(key:unknown,field:string)=>selected.some(row=>row['rowid']===key&&Object.hasOwn(row,field))&&!hiddenFields.has(field)
      ? {read:'visible' as const,write:readonlyFields.has(field)?'denied' as const:'allowed' as const,component:readonlyFields.has(field)?'readonly' as const:'editable' as const,required:false,writeMode:readonlyFields.has(field)?'readonly' as const:'editable' as const}
      : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
    readFieldAccess:(row:Readonly<Record<string,unknown>>,field:string)=>Object.hasOwn(row,field)&&!hiddenFields.has(field)?'visible' as const:'invisible' as const,
    addActionState:()=>'disabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'disabled' as const,
    createChildActionState:()=>'disabled' as const,viewActionState:()=>'enabled' as const,
  })
  type SaveCommand=Parameters<NonNullable<Parameters<typeof view.bindQueryExecutor>[0]['save']>>[0]
  let unknownReceipt=false
  const save=vi.fn(async(command:SaveCommand)=>{
    if(unknownSave&&!unknownReceipt){unknownReceipt=true;throw new Error('transport timeout')}
    const receipts=command.changes.map(change=>{
    const changed=[...(change.changes.changed??[])]
    for(const patch of changed){const current=rows.find(row=>row['rowid']===patch['rowid']);if(current)Object.assign(current,patch)}
    return {metaName:change.identity.metaName,added:[],changed,deleted:[],changedFields:changed.map(row=>Object.keys(row)),context:result(rows.filter(row=>row['SysId']===projectId))}
    })
    unknownReceipt=false
    return receipts
  })
  view.bindQueryExecutor({
    queryColumns:current=>current.columns,
    executeQuery:async(current,params)=>{
      allPagesRequested=params.allPages===true
      const matches=(row:Record<string,unknown>,filter:unknown):boolean=>{
        if(filter===null||typeof filter!=='object')return true
        const condition=filter as Record<string,unknown>
        if(Array.isArray(condition['filters']))return condition['filters'].every(item=>matches(row,item))
        const field=condition['field'],value=condition['value']
        return typeof field!=='string'||condition['operator']!=='eq'||String(row[field]??'')===String(value??'')
      }
      const selected=rows.filter(row=>row['SysId']===projectId&&matches(row,params.filter))
      return result(selected)
    },
    save,hasUnconfirmedSave:()=>unknownReceipt,
  })
  return {dataSet,readAllPages:()=>allPagesRequested,save}
}

async function requestFullFromGet(config: { url: string }): Promise<Record<string, unknown>> {
  try {
    const data = await httpFns.get(config.url)
    const content = data !== null && typeof data === 'object'
      ? Object.getOwnPropertyDescriptor(data, 'content')?.value
      : ''
    return {
      data: {
        protocolVersion: 4,
        ok: true,
        data: {
          content: String(content ?? ''),
          timestamp: '1',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  } catch (error) {
    if (
      isErrorLike(error) &&
      error.status === undefined &&
      typeof error.response?.status === 'number'
    ) {
      error.status = error.response.status
    }
    throw error
  }
}

function isErrorLike(value: unknown): value is { status?: unknown; response?: { status?: unknown } } {
  return value !== null && typeof value === 'object'
}

describe('DevState 页面文件闭环', () => {
  beforeEach(() => {
    isolateAppProjectWorkspaceForTest()
    vi.clearAllMocks()
    httpFns.requestFull.mockImplementation(requestFullFromGet)
    httpFns.clearCache.mockImplementation(() => undefined)
    httpFns.interceptors.request.use.mockImplementation(() => () => undefined)
    httpFns.interceptors.response.use.mockImplementation(() => () => undefined)
    blueprintRuntime.load.mockReset()
    blueprintRuntimeTrees.clear()
    blueprintRuntime.load.mockImplementation(async ({projectId}:{projectId:string})=>createBlueprintRuntimeDataSet(projectId,blueprintRuntimeTrees.get(projectId)).dataSet)
  })

  it('节点基本信息通过共享 Base_NavigationInfo DataView 保存而不调用 ProjectWorkspace gateway', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope()
    const state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const selected=state.selectedNode.value!
      const owner=await state.loadBlueprintWorkspaceDataView()
      await state.selectNode(selected)
      state.blueprintDraft.capability.name='DataView 名称'
      state.markBlueprintDirty()
      expect(httpFns.put).not.toHaveBeenCalled()
      await expect(state.saveNodeChanges()).resolves.toBe(true)
      expect(owner.value('name')).toBe('DataView 名称')
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.map(row=>row['rowid'])).toEqual([selected.nodeId])
    } finally {ownerScope.stop()}
  })

  it('创建并绑定工具只写页面文件 owner 与节点 DataView，不调用 ProjectWorkspace 蓝图 writer',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.put.mockClear()
      const created=await state.createPageForSelectedNode({pageId:'new-tool',title:'New tool',icon:'Document'})
      expect(created,state.statusMessages.value.map(message=>message.text).join('\n')).toBe(true)
      const changed=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.find(row=>row['rowid']==='CHILD-A')
      expect(changed).toMatchObject({conType:'page',NavigationUrl:'cfg:new-tool',FunName:'New tool',NavigationImageWxz:'Document'})
      expect(httpFns.put.mock.calls.some(([url])=>String(url).startsWith('project-blueprint:'))).toBe(false)
      expect(httpFns.post).toHaveBeenCalledWith('designfile:APP-A/new-tool/create')
    }finally{ownerScope.stop()}
  })

  it('创建工具在 DataView 列权限预检失败时不创建任何页面文件',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['NavigationUrl']})
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.put.mockClear()
      await expect(state.createPageForSelectedNode({pageId:'denied-tool',title:'Denied tool',icon:'Document'})).resolves.toBe(false)
      expect(httpFns.put).not.toHaveBeenCalled()
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('工具绑定保存回执未知时保留页面文件并等待原 DataView 核验',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{},true)
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.post.mockClear();httpFns.delete.mockClear()
      await expect(state.createPageForSelectedNode({pageId:'uncertain-tool',title:'Uncertain tool',icon:'Document'})).resolves.toBe(false)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(httpFns.post).toHaveBeenCalledWith('designfile:APP-A/uncertain-tool/create')
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.hasUnconfirmedSave).toBe(true)
      expect(state.statusMessages.value.map(message=>message.text).join('\n')).toContain('工具绑定回执未知，已保留页面文件')
    }finally{ownerScope.stop()}
  })

  it('节点字段代理不暴露无读取权限值，也拒绝只读字段setter',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['name'],readonlyFields:['memo']})
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.selectNode(state.selectedNode.value!)
      expect(state.blueprintDraft.capability.name).toBeUndefined()
      expect(()=>{state.blueprintDraft.capability.name='Should not write'}).toThrow(/权限|字段|不能编辑/)
      expect(state.blueprintDraft.capability.description).toBe('')
      expect(()=>{state.blueprintDraft.capability.description='readonly'}).toThrow(/权限|字段|不能编辑/)
    }finally{ownerScope.stop()}
  })

  it('首载项目树由共享 Base_NavigationInfo DataView allPages 查询投影提供', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope()
    const state=ownerScope.run(()=>useDevState())!
    try {
      await expect(state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})).resolves.toBe(true)
      expect(blueprintRuntime.load).toHaveBeenCalledWith({projectId:'APP-A',scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY})
      expect(fixture.readAllPages()).toBe(true)
      expect(state.blueprintWorkspaceDataView.value?.hasTreeProjection).toBe(true)
      expect(state.project.rootNode?.id).toBe('ROOT-A')
      expect(state.treeData.value[0]).toMatchObject({nodeId:'CHILD-A',capability:{code:'CHILD-CODE'}})
      expect(httpFns.get).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('首载 DataView 失败时隐藏缓存树且不回退 ProjectWorkspace gateway', async () => {
    const cached=getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'})
    cached.project.replaceBlueprintTree(blueprintRoot([node('STALE-NODE','缓存节点','cfg:stale','APP-A')],'APP-A'))
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    blueprintRuntime.load.mockRejectedValueOnce(new Error('fixture DataView unavailable')).mockResolvedValueOnce(fixture.dataSet)
    const ownerScope=effectScope()
    const state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      expect(state.treeData.value).toEqual([])
      expect(httpFns.get).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('fixture DataView unavailable'))).toBe(true)
      await state.loadBlueprint()
      expect(state.treeData.value[0]).toMatchObject({nodeId:'CHILD-A',capability:{code:'CHILD-CODE'}})
      expect(blueprintRuntime.load).toHaveBeenCalledTimes(2)
      expect(httpFns.get).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('DataView dirty/unknown 回执阻断旧树写入口并保护 NodeBasicInfo 草稿', async () => {
    vi.useFakeTimers()
    const root=blueprintRoot([node('node-a','原名称','cfg:page-a')])
    const fixture=createBlueprintRuntimeDataSet('homepage',root)
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    await state.openEditingProject({tenantId:'tenant-a',projectId:'homepage'},{force:true})
    await state.selectNode(state.selectedNode.value!)
    state.blueprintDraft.navigation!.title='尚未保存的基本信息'
    state.markBlueprintDirty()
    try {
      expect(state.blueprintDraft.navigation?.title).toBe('尚未保存的基本信息')
      state.addRootNode()
      state.removeNodeFromTree({parent:{data:root}},{...root.children![0]!})
      await state.addChildNode(root)
      expect(fixture.save).not.toHaveBeenCalled()
      expect(httpFns.put).not.toHaveBeenCalled()
      expect(httpFns.post).not.toHaveBeenCalled()
      expect(state.blueprintDraft.navigation?.title).toBe('尚未保存的基本信息')
      expect(state.statusMessages.value.some(item=>item.text.includes('DataView'))).toBe(true)
    } finally {ownerScope.stop(); vi.useRealTimers()}
  })

  it('缺失 script/style 时 fail-fast，不静默写入空文档', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/script.js') || url.endsWith('/style.css')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state, { forceReload: true })).rejects.toThrow('not found')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('缺失 rule/pagedata 时 fail-fast，不创建占位模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw notFound()
      if (url.endsWith('/pagedata.json')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state)).rejects.toThrow('not found')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('版本摘要保留编号文件名和可空修改时间', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockResolvedValueOnce([
      {version:1,fileName:'1__script.js',lastModified:1710000000000},
    ])

    state.project.setActivePage(state.activePageId.value)
    const versions = await state.editor.listRemotePageVersions('script.js')

    expect(versions).toEqual([
      {
        version: 1,
        fileName:'1__script.js',
        lastModified:1710000000000,
      },
    ])
  })

  it('restore 后立即强制重读并回填文档模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    state.project.getActivePage()?.hydrateFileText('script.js', 'console.log("old")')
    httpMock.post.mockResolvedValueOnce({ ok: true })
    httpMock.get.mockImplementation(async (url: string) => pageFileResponse(url))

    state.project.setActivePage('demo')
    await state.editor.restoreRemotePageVersion(1, 'script.js')
    expect(state.project.readPageFileText('script.js')).toBe('console.log("restored")')
    expect(isDevStatePageDocumentDirty(state, 'script.js')).toBe(false)
    expect(state.projectRevision.value).toBeGreaterThan(0)
  })

  it('切换左侧节点时触发右侧 blueprintDraft 订阅刷新', async () => {
    const state = useDevState()
    const root=blueprintRoot([node('alpha-node','Alpha','cfg:alpha'),node('beta-node','Beta','cfg:beta')])
    blueprintRuntimeTrees.set('homepage',root)
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') {
        return {
          ...blueprintRoot([]),
          children: [
            node('alpha-node','Alpha','cfg:alpha'),
            node('beta-node','Beta','cfg:beta'),
          ],
        }
      }
      return pageFileResponse(url)
    })

    await state.loadBlueprint()
    const observedEditDtoIds: string[] = []
    const stop = watchEffect(() => {
      observedEditDtoIds.push(state.blueprintDraft.nodeId)
    })

    await state.selectNode(state.treeData.value[1]!)
    await nextTick()
    stop()

    expect(state.selectedNode.value?.nodeId).toBe('beta-node')
    expect(state.activePageId.value).toBe('beta')
    expect(observedEditDtoIds.at(-1)).toBe('beta-node')
  })

  it('初始化页面列表从项目蓝图派生，不请求页面文件清单', async () => {
    const state = useDevState()
    blueprintRuntimeTrees.set('homepage',blueprintRoot([
      node('alpha-node','Alpha','cfg:alpha','homepage','Alpha 页面需求'),node('sys-node','System','/system'),
    ]))
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') {
        return {
          ...blueprintRoot([]),
          children: [
            node('alpha-node','Alpha','cfg:alpha','homepage','Alpha 页面需求'),
            node('sys-node','System','/system'),
          ],
        }
      }
      if (url.includes(':__list')) {
        throw new Error(`unexpected GET ${url}`)
      }
      return pageFileResponse(url)
    })

    await state.initialize()

    expect(state.pageList.value).toEqual([
      expect.objectContaining({
        pageId: 'alpha',
        path: 'cfg:alpha',
        title: 'Alpha',
        nodeId: 'alpha-node',
        description: 'Alpha 页面需求',
        designSurface: 'config-files',
      }),
      expect.objectContaining({
        pageId: 'system',
        path: '/system',
        title: 'System',
        nodeId: 'sys-node',
        designSurface: 'system-page',
      }),
    ])
    expect(httpMock.get).not.toHaveBeenCalledWith('designfile:homepage/__list')
  })

  it('header 保存蓝图属性时只提交选中节点 patch，不整树保存', async () => {
    const state = useDevState()
    const root: ProjectBlueprintTreeData = {
      ...blueprintRoot([]),
      children: [
        node('alpha-node','Alpha','cfg:alpha'),
      ],
    }
    navTreeState.tree = root
    blueprintRuntimeTrees.set('homepage',root)
    const fixture=createBlueprintRuntimeDataSet('homepage',root)
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)

    vi.mocked(refreshRoutes).mockImplementation(async (): Promise<RuntimeNavigation> => {
      const updated: ProjectBlueprintTreeData = {
        ...root,
        children: [
          node('alpha-node','Alpha updated','cfg:alpha'),
        ],
      }
      navTreeState.tree = updated
      return {
        title: updated.capability.name,
        childPlacement:'header',
        items: [{ id: 'alpha-node', title: 'Alpha updated', itemKind: 'page', path: '/alpha' }],
      }
    })

    await state.loadBlueprint()
    await state.selectNode(state.selectedNode.value!)
    state.blueprintDraft.navigation!.title = 'Alpha updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length

    await state.saveAll()

    expect(vi.mocked(refreshRoutes).mock.calls.length - refreshCallsBeforeSave).toBe(1)
    expect(navTreeState.tree?.children?.[0]?.navigation?.title).toBe('Alpha updated')
    expect(state.project.readBlueprintProjection().tree[0]?.navigation?.title).toBe('Alpha updated')

    expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.map(row=>row['rowid'])).toEqual(['alpha-node'])
    expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.[0]).toMatchObject({FunName:'Alpha updated'})
    expect(httpMock.put).not.toHaveBeenCalledWith('project-blueprint:homepage:nodes:alpha-node:move', expect.anything())
    expect(httpMock.put).not.toHaveBeenCalledWith('project-blueprint:homepage', expect.anything())
    expect(httpMock.post).not.toHaveBeenCalledWith('project-blueprint:homepage', expect.anything())
  })

  it('可打开其他租户项目模型编辑，保存时不刷新当前 APP 导航', async () => {
    const state = useDevState()
    const delegatedRoot: ProjectBlueprintTreeData = {
      ...blueprintRoot([], 'delegated-app'),
      children: [
        node('delegated-node','Delegated','cfg:delegated-page','delegated-app'),
      ],
    }
    blueprintRuntimeTrees.set('delegated-app',delegatedRoot)
    const fixture=createBlueprintRuntimeDataSet('delegated-app',delegatedRoot)
    blueprintRuntime.load.mockResolvedValue(fixture.dataSet)

    await state.loadEditableProjects('tenant-b')
    state.projectPicker.tenantId = 'tenant-b'
    state.projectPicker.projectId = 'delegated-app'

    await expect(state.openProjectPickerScope()).resolves.toBe(true)

    expect(state.tenantId).toBe('tenant-b')
    expect(state.projectId).toBe('delegated-app')
    expect(state.treeData.value[0]?.nodeId).toBe('delegated-node')
    expect(state.activePageId.value).toBe('delegated-page')

    await state.selectNode(state.selectedNode.value!)
    state.blueprintDraft.navigation!.title = 'Delegated updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length
    await state.saveAll()

    expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.map(row=>row['rowid'])).toEqual(['delegated-node'])
    expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.[0]).toMatchObject({FunName:'Delegated updated'})
    expect(vi.mocked(refreshRoutes).mock.calls.length).toBe(refreshCallsBeforeSave)
  })
})
