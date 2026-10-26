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
],projectId),nodeId:'ROOT-A'}){
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
  const view=dataSet.getView('Base_NavigationInfo')!
  view.bindQueryExecutor({
    queryColumns:current=>current.columns,
    executeQuery:async(current,params)=>{
      allPagesRequested=params.allPages===true
      const selected=rows.filter(row=>row['SysId']===projectId)
      return {
        rows:selected,total:selected.length,
        assertIdentity(identity:{scenarioId:string;metaName:string}){if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('blueprint identity mismatch')},
        rowKey:(row:Readonly<Record<string,unknown>>)=>row['rowid'],
        fieldAccess:(key:unknown,field:string)=>selected.some(row=>row['rowid']===key&&Object.hasOwn(row,field))
          ? {read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}
          : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
        readFieldAccess:(row:Readonly<Record<string,unknown>>,field:string)=>Object.hasOwn(row,field)?'visible' as const:'invisible' as const,
        addActionState:()=>'disabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'disabled' as const,
        createChildActionState:()=>'disabled' as const,viewActionState:()=>'enabled' as const,
      }
    },
  })
  return {dataSet,readAllPages:()=>allPagesRequested}
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
    const state = useDevState()
    const root=blueprintRoot([node('node-a','原名称','cfg:page-a')])
    state.project.replaceBlueprintTree(root)
    state.loadNodeToForm(root.children![0]!)
    state.blueprintDraft.navigation!.title='尚未保存的基本信息'
    state.markBlueprintDirty()
    const unregister=state.registerExternalDataViewSession({isDirty:()=>false,hasUnconfirmedSave:()=>true,save:vi.fn()})
    try {
      state.refreshBlueprintTreeProjection({isDirty:()=>true,hasUnconfirmedSave:()=>true,save:vi.fn(async()=>{}),
        treeProjection:()=>blueprintRoot([node('node-a','DataView 名称','cfg:page-a')]),hasTreeProjection:()=>true})
      expect(state.blueprintDraft.navigation?.title).toBe('尚未保存的基本信息')
      expect(await state.saveNodeChanges()).toBe(false)
      state.addRootNode()
      state.removeNodeFromTree({parent:{data:root}},{...root.children![0]!})
      await state.addChildNode(root)
      expect(httpFns.put).not.toHaveBeenCalled()
      expect(httpFns.post).not.toHaveBeenCalled()
      expect(state.blueprintDraft.navigation?.title).toBe('尚未保存的基本信息')
      expect(state.statusMessages.value.some(item=>item.text.includes('DataView'))).toBe(true)
    } finally {unregister(); vi.useRealTimers()}
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
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'project-blueprint:homepage') return root
      return pageFileResponse(url)
    })
    httpMock.put.mockResolvedValueOnce({
      node: {...node('alpha-node','Alpha updated','cfg:alpha'),capability:{name:'Alpha',description:''}},
    })

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
    state.blueprintDraft.navigation!.title = 'Alpha updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length

    await state.saveAll()

    expect(vi.mocked(refreshRoutes).mock.calls.length - refreshCallsBeforeSave).toBe(1)
    expect(navTreeState.tree?.children?.[0]?.navigation?.title).toBe('Alpha updated')
    expect(state.project.readBlueprintProjection().tree[0]?.navigation?.title).toBe('Alpha updated')

    expect(httpMock.put).toHaveBeenCalledWith(
      'project-blueprint:homepage:nodes:alpha-node',
      expect.objectContaining({navigation:expect.objectContaining({title:'Alpha updated',order:0})}),
    )
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
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === 'application-catalog:tenant-b') {
        return [
          { projectId: 'delegated-app', name: 'Delegated App', icon: 'Box', description: '' },
        ]
      }
      if (url === 'project-blueprint:delegated-app') {
        return delegatedRoot
      }
      return pageFileResponse(url)
    })
    httpMock.put.mockResolvedValueOnce({
      node: {...node('delegated-node','Delegated updated','cfg:delegated-page','delegated-app'),capability:{name:'Delegated',description:''}},
    })

    await state.loadEditableProjects('tenant-b')
    state.projectPicker.tenantId = 'tenant-b'
    state.projectPicker.projectId = 'delegated-app'

    await expect(state.openProjectPickerScope()).resolves.toBe(true)

    expect(state.tenantId).toBe('tenant-b')
    expect(state.projectId).toBe('delegated-app')
    expect(state.treeData.value[0]?.nodeId).toBe('delegated-node')
    expect(state.activePageId.value).toBe('delegated-page')

    state.blueprintDraft.navigation!.title = 'Delegated updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length
    await state.saveAll()

    expect(httpMock.put).toHaveBeenCalledWith(
      'project-blueprint:delegated-app:nodes:delegated-node',
      expect.objectContaining({navigation:expect.objectContaining({title:'Delegated updated'})}),
    )
    expect(vi.mocked(refreshRoutes).mock.calls.length).toBe(refreshCallsBeforeSave)
  })
})
