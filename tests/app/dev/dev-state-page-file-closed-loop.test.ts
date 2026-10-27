import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, watchEffect } from 'vue'
import { DataSet } from '@spark-appworks/spark-data'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { useDevState } from '@/views/app/dev-system/useDevState'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
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
  blueprintDeleteNode: vi.fn(),
  clearCache: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))
const pageFiles=vi.hoisted(()=>({files:new Map<string,string>(),upload:vi.fn(async(command:{pageId:string;fileName:string;text:string})=>{pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)}),remove:vi.fn(async(_app:string,page:string,name:string)=>{pageFiles.files.delete(`${page}/${name}`)})}))

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectBlueprintTreeData | null,
}))
const blueprintRuntime = vi.hoisted(() => ({load:vi.fn()}))
const blueprintRuntimeTrees = new Map<string,ProjectBlueprintTreeData>()
const DATA_SPACE_CATALOG_SCENARIO_ID='90A82E287930A234FEC3E687C94A93EA'
function createDataSpaceCatalogRuntimeDataSet(){
  return DataSet.fromJson({scenarioId:DATA_SPACE_CATALOG_SCENARIO_ID,tables:{Base_DataSet:{
    modelBinding:{modelId:`${DATA_SPACE_CATALOG_SCENARIO_ID}catalog`,modelName:'Base_DataSet'},
    columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'Name',type:'string'}],
    views:{default:{},catalog:{autoLoad:false,page:1,pageSize:10}},
  }}})
}
function createDictionaryRuntimeDataSet(){
  return DataSet.fromJson({scenarioId:LowcodeDictionary.editorScenarioId,tables:{_Base_DictType:{
    modelBinding:{modelId:`${LowcodeDictionary.editorScenarioId}dictionary`,modelName:'_Base_DictType'},
    columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'Name',type:'string'}],views:{default:{}},
  }}})
}
function mockBlueprintScenarioFixture(dataSet:DataSet):void{
  blueprintRuntime.load.mockImplementation(async ({scenarioId}:{scenarioId:string})=>
    scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID?createDataSpaceCatalogRuntimeDataSet():dataSet)
}
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
    readRequestScope: () => ({token:'fixture-token',headers:{'X-AppId':'APP-A'}}),
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
        deleteNode: async (id:string) => {await httpFns.blueprintDeleteNode(id)},
      },
      projectReferences: {
        listProjects: async () => [],
        loadProjectBlueprint: async () => ({ children: [] }),
      },
    }
  },
  createPageToolFilesIo: (projectId:string) => ({
    list:async(_app:string,page:string)=>[...pageFiles.files.keys()].filter(key=>key.startsWith(`${page}/`)).map(key=>key.slice(page.length+1)),
    read:async(_app:string,page:string,name:string)=>pageFiles.files.get(`${page}/${name}`)??null,
    upload:pageFiles.upload,remove:pageFiles.remove,
  }),
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
],projectId),nodeId:'ROOT-A'},access:{hiddenFields?:string[];readonlyFields?:string[];requiredFields?:string[];addAllowed?:boolean;childAllowed?:boolean;deleteAllowed?:boolean}={},unknownSave=false,knownSaveFailure=false,additionalUnknownReceipts=0,applyUnknownReceipt:boolean|number=true){
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
    columns:fields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid',...(access.requiredFields?.includes(name)?{required:true}:{})})),views:{default:{autoLoad:false}},
  }}})
  let allPagesRequested=false
  const hiddenFields=new Set(access.hiddenFields??[]),readonlyFields=new Set(access.readonlyFields??[])
  const view=dataSet.getView('Base_NavigationInfo')!
  const result=(selected:Record<string,unknown>[])=>({
    rows:selected,total:selected.length,resultPrimaryKey:'rowid',
    assertIdentity(identity:{scenarioId:string;metaName:string}){if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('blueprint identity mismatch')},
    rowKey:(row:Readonly<Record<string,unknown>>)=>row['rowid'],
    prepareNewRow:(row:Readonly<Record<string,unknown>>)=>({...row,rowid:crypto.randomUUID()}),
    prepareNewRowWithIdentity:(row:Readonly<Record<string,unknown>>,identity:{field:string;value:string|number})=>({...row,[identity.field]:identity.value}),
    isFieldReadOnly:(field:string)=>readonlyFields.has(field),
    fieldAccess:(key:unknown,field:string)=>selected.some(row=>row['rowid']===key&&Object.hasOwn(row,field))&&!hiddenFields.has(field)
      ? {read:'visible' as const,write:readonlyFields.has(field)?'denied' as const:'allowed' as const,component:readonlyFields.has(field)?'readonly' as const:'editable' as const,required:false,writeMode:readonlyFields.has(field)?'readonly' as const:'editable' as const}
      : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
    readFieldAccess:(row:Readonly<Record<string,unknown>>,field:string)=>Object.hasOwn(row,field)&&!hiddenFields.has(field)?'visible' as const:'invisible' as const,
    addActionState:()=>(access.addAllowed?'enabled':'disabled') as 'enabled'|'disabled',editActionState:()=>'enabled' as const,deleteActionState:()=>(access.deleteAllowed?'enabled':'disabled') as 'enabled'|'disabled',
    createChildActionState:()=>(access.childAllowed?'enabled':'disabled') as 'enabled'|'disabled',viewActionState:()=>'enabled' as const,
  })
  type SaveCommand=Parameters<NonNullable<Parameters<typeof view.bindQueryExecutor>[0]['save']>>[0]
  let unknownReceipt=false
  let unknownReceiptsRemaining=(unknownSave?1:0)+additionalUnknownReceipts
  let knownFailurePending=knownSaveFailure
  const save=vi.fn(async(command:SaveCommand)=>{
    if(unknownReceipt){
      const requested=command.changes.flatMap(change=>[
        ...(change.changes.added??[]).map(row=>({kind:'added' as const,row})),
        ...(change.changes.changed??[]).map(row=>({kind:'changed' as const,row})),
        ...(change.changes.deleted??[]).map(row=>({kind:'deleted' as const,row})),
      ])
      const outcomes=requested.map(item=>{
        const existing=rows.find(row=>row['rowid']===item.row['rowid']&&row['SysId']===projectId)
        if(item.kind==='deleted')return existing===undefined?'applied':'absent'
        if(existing===undefined)return 'absent'
        return Object.entries(item.row).every(([field,value])=>existing[field]===value)?'applied':'unknown'
      })
      if(outcomes.every(outcome=>outcome==='applied'))unknownReceipt=false
      else if(outcomes.every(outcome=>outcome==='absent')){unknownReceipt=false;throw new Error('SPARK_SAVE_NOT_APPLIED: verified absent')}
      else throw new Error('SPARK_SAVE_UNVERIFIABLE: partial save remains unknown')
    }
    if(knownFailurePending){knownFailurePending=false;throw new Error('explicit save rejection')}
    const loseReceipt=unknownReceiptsRemaining>0
    if(loseReceipt)unknownReceiptsRemaining--
    const receipts=command.changes.map(change=>{
    const added=[...(change.changes.added??[])]
    const changed=[...(change.changes.changed??[])]
    const deleted=[...(change.changes.deleted??[])]
    if(!loseReceipt||applyUnknownReceipt){
      const acceptedAdds=loseReceipt&&typeof applyUnknownReceipt==='number'?added.slice(0,applyUnknownReceipt):added
      for(const row of acceptedAdds)if(!rows.some(existing=>existing['rowid']===row['rowid']))rows.push({...row})
      for(const patch of changed){const current=rows.find(row=>row['rowid']===patch['rowid']);if(current)Object.assign(current,patch)}
      for(const removed of deleted){const index=rows.findIndex(row=>row['rowid']===removed['rowid']&&row['SysId']===projectId);if(index>=0)rows.splice(index,1)}
    }
    return {metaName:change.identity.metaName,added,changed,deleted,changedFields:changed.map(row=>Object.keys(row)),context:result(rows.filter(row=>row['SysId']===projectId))}
    })
    if(loseReceipt){unknownReceipt=true;throw new Error('transport timeout')}
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
        if(typeof field!=='string')return true
        if(condition['operator']==='eq')return String(row[field]??'')===String(value??'')
        if(condition['operator']==='in')return Array.isArray(value)&&value.some(item=>String(item??'')===String(row[field]??''))
        return true
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
    pageFiles.files.clear()
    httpFns.requestFull.mockImplementation(requestFullFromGet)
    httpFns.clearCache.mockImplementation(() => undefined)
    httpFns.interceptors.request.use.mockImplementation(() => () => undefined)
    httpFns.interceptors.response.use.mockImplementation(() => () => undefined)
    blueprintRuntime.load.mockReset()
    blueprintRuntimeTrees.clear()
    blueprintRuntime.load.mockImplementation(async ({projectId,scenarioId}:{projectId:string;scenarioId:string})=>
      scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID?createDataSpaceCatalogRuntimeDataSet():createBlueprintRuntimeDataSet(projectId,blueprintRuntimeTrees.get(projectId)).dataSet)
    vi.spyOn(LowcodeDictionary,'loadEditor').mockImplementation(async()=>({dataSet:createDictionaryRuntimeDataSet()}))
  })

  it('节点基本信息通过共享 Base_NavigationInfo DataView 保存而不调用 ProjectWorkspace gateway', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
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

  it('设计器目标只来自正式读回 conid，待保存改绑时拒绝加载新目标',async()=>{
    const root=blueprintRoot([{...node('SCENE-NODE','Scene node','cfg:scene','APP-A'),dataSpace:{scenarioId:'SCENE-SAVED',models:[]}}],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const selected=state.treeData.value[0]!
      await state.selectNode(selected)
      expect(state.persistedDataSpaceId.value).toBe('SCENE-SAVED')
      expect(state.sceneBindingPending.value).toBe(false)
      state.blueprintDraft.dataSpace={scenarioId:'SCENE-DRAFT',models:[]}
      expect(state.persistedDataSpaceId.value).toBe('SCENE-SAVED')
      expect(state.sceneBindingPending.value).toBe(true)
      await expect(state.createSelectedScenarioViews()).rejects.toThrow(/尚未正式保存并回读/)
    }finally{ownerScope.stop()}
  })

  it('新增根模块通过共享 Base_NavigationInfo DataView 按正式创建权限保存', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.addRootNode()
      expect(state.statusMessages.value.map(message=>message.text).join('\n')).toContain('通过 Base_NavigationInfo DataView 保存')
      await vi.waitFor(()=>expect(fixture.save).toHaveBeenCalled())
      const added=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added
      expect(added).toHaveLength(1)
      expect(added?.[0]).toMatchObject({SysId:'APP-A',prowid:'000000',name:'新模块',FunName:'新模块'})
      expect(String(added?.[0]?.['rowid']??'')).not.toBe('')
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.some(row=>row['rowid']===added?.[0]?.['rowid'])).toBe(true)
    } finally {ownerScope.stop()}
  })

  it('新增根模块任一必需字段没有 DataView 新行写权限时不提交', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,readonlyFields:['name']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.addRootNode()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(state.statusMessages.value.map(message=>message.text).join('\n')).toContain('不允许新增字段 name')
    } finally {ownerScope.stop()}
  })

  it('子节点父级 c 权限拒绝时在文件或蓝图写入前失败',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:false})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!
      await state.addChildNode(parent)
      expect(pageFiles.upload).not.toHaveBeenCalled()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(httpFns.post).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('不允许在所选父节点下新增'))).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('子节点候选字段写权限拒绝时不创建页面文件或导航行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true,readonlyFields:['name']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.addChildNode(state.treeData.value[0]!)
      expect(pageFiles.upload).not.toHaveBeenCalled()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('不允许新增字段 name'))).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('子节点候选 DataTable validator 拒绝时不创建页面文件或导航行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true,requiredFields:['funCode']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.addChildNode(state.treeData.value[0]!)
      expect(pageFiles.upload).not.toHaveBeenCalled()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('funCode'))).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('获准的子节点经同一文件命令 DataView 与导航 DataView 保存，不调用 mounted-page gateway',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!
      await state.addChildNode(parent)
      expect(state.statusMessages.value.map(item=>item.text).join('\n')).toContain('已在')
      await vi.waitFor(()=>expect(fixture.save).toHaveBeenCalledTimes(1))
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect([...pageFiles.files.keys()]).toHaveLength(3)
      const added=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added
      expect(added).toHaveLength(1)
      expect(added?.[0]).toMatchObject({SysId:'APP-A',prowid:parent.nodeId,NavigationUrl:expect.stringMatching(/^cfg:/)})
      expect(httpFns.post).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('策划同父叶子由 Base_NavigationInfo DataView 一次提交并逐行回读 wire 身份和字段',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const fields=(title:string,order:string,id:string)=>({name:title,FunName:title,funCode:id,conType:'Navitem',conid:'',
        NavigationUrl:`cfg:${id.toLowerCase()}`,FunOrderValue:order,IsShowAtNav:'1',IsShowChildItem:'1',BeginGroup:'0'})
      const ids=await owner.addChildNodes(root.nodeId,[
        {nodeId:'PLAN-A',fields:fields('Planned A','1','PLAN-A')},
        {nodeId:'PLAN-B',fields:fields('Planned B','2','PLAN-B')},
      ])

      expect(ids).toEqual(['PLAN-A','PLAN-B'])
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(fixture.save.mock.calls[0]?.[0].changes).toHaveLength(1)
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added).toHaveLength(2)
      expect(owner.view.rows.filter(row=>row['rowid']==='PLAN-A'||row['rowid']==='PLAN-B')).toEqual(expect.arrayContaining([
        expect.objectContaining({rowid:'PLAN-A',SysId:'APP-A',prowid:root.nodeId,name:'Planned A',NavigationUrl:'cfg:plan-a'}),
        expect.objectContaining({rowid:'PLAN-B',SysId:'APP-A',prowid:root.nodeId,name:'Planned B',NavigationUrl:'cfg:plan-b'}),
      ]))
      expect(owner.hasPendingChildCreate).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('批次已受理但正式回读失败时仍阻止 DevSystem 项目切换',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const refresh=owner.view.refresh.bind(owner.view)
      vi.spyOn(owner.view,'refresh').mockRejectedValueOnce(Error('batch readback unavailable')).mockImplementation(refresh)
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})

      await expect(owner.addChildNodes(root.nodeId,[
        {nodeId:'READBACK-A',fields:fields('READBACK-A')},{nodeId:'READBACK-B',fields:fields('READBACK-B')},
      ])).rejects.toThrow('batch readback unavailable')

      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasUnconfirmedSave).toBe(false)
      expect(owner.hasPendingBlueprintCommand).toBe(true)
      expect(state.hasPendingDevSystemWrite()).toBe(true)
      expect(await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-B'},{force:true})).toBe(false)
      expect(state.blueprintWorkspaceDataView.value?.projectId).toBe('APP-A')
    }finally{ownerScope.stop()}
  })

  it('同父叶子批次完整预检失败时不暂存任何新增行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const fields={name:'New',FunName:'New',funCode:'NEW',conType:'Navitem',FunOrderValue:'1',NavigationUrl:'cfg:new'}
      await expect(owner.addChildNodes(root.nodeId,[
        {nodeId:'PLAN-DUP',fields},{nodeId:'PLAN-DUP',fields},
      ])).rejects.toThrow(/rowid 缺失或重复/iu)
      expect(owner.view.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('批次中途发现 DataView 新增行身份错配时回滚包括当前行在内的全部本地草稿',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const add=owner.view.addChildRow.bind(owner.view)
      let calls=0
      vi.spyOn(owner.view,'addChildRow').mockImplementation(async input=>{
        const row=await add(input)
        calls++
        if(calls===2&&row!==null&&typeof row==='object'&&!('success' in row))row['SysId']='OTHER-APP'
        return row
      })
      const fields=(name:string,order:string)=>({name,FunName:name,funCode:name,conType:'Navitem',FunOrderValue:order,NavigationUrl:`cfg:${name.toLowerCase()}`})
      await expect(owner.addChildNodes(root.nodeId,[
        {nodeId:'ROLL-A',fields:fields('Rollback A','1')},{nodeId:'ROLL-B',fields:fields('Rollback B','2')},
      ])).rejects.toThrow(/身份匹配|IDENTITY_MISMATCH/iu)
      expect(owner.view.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(owner.view.rows.some(row=>row['rowid']==='ROLL-A'||row['rowid']==='ROLL-B')).toBe(false)
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('批量未知回执核验部分写入时保留原ID集合并拒绝第二批重放',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true,false,0,1)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})
      const commands=[{nodeId:'PART-A',fields:fields('PART-A')},{nodeId:'PART-B',fields:fields('PART-B')}]
      await expect(owner.addChildNodes(root.nodeId,commands)).rejects.toThrow('transport timeout')
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      await expect(owner.save()).rejects.toThrow(/SPARK_SAVE_UNVERIFIABLE|partial|unknown/iu)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(owner.hasPendingChildCreate).toBe(true)
      expect(owner.view.dirtyTracking.pendingCreateIds).toEqual(new Set(['PART-A','PART-B']))
    }finally{ownerScope.stop()}
  })

  it('未知批次经同 owner 核验为全未应用后只允许重试原 ID 和原 patch',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true,false,0,false)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})
      const commands=[{nodeId:'ABSENT-A',fields:fields('ABSENT-A')},{nodeId:'ABSENT-B',fields:fields('ABSENT-B')}]
      await expect(owner.addChildNodes(root.nodeId,commands)).rejects.toThrow('transport timeout')
      expect(owner.hasUnconfirmedSave).toBe(true)
      await expect(owner.save()).rejects.toThrow('SPARK_SAVE_NOT_APPLIED')
      expect(owner.hasUnconfirmedSave).toBe(false)
      expect(owner.hasPendingChildCreate).toBe(true)
      const firstIds=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])
      const firstPatches=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added
      await expect(owner.save()).resolves.toBeUndefined()
      expect(fixture.save.mock.calls.at(-1)?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])).toEqual(firstIds)
      expect(fixture.save.mock.calls.at(-1)?.[0].changes[0]?.changes.added).toEqual(firstPatches)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(owner.view.rows.filter(row=>row['rowid']==='ABSENT-A'||row['rowid']==='ABSENT-B')).toHaveLength(2)
    }finally{ownerScope.stop()}
  })

  it('导航子行回执未知时只恢复专属 child ID，不重建文件或重复新增行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!
      await state.addChildNode(parent)
      expect(state.blueprintWorkspaceDataView.value?.hasPendingChildCreate).toBe(true)
      const firstId=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(firstId).toBeTruthy()
      await state.addChildNode(parent)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.[0]?.['rowid']).toBe(firstId)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['prowid']===parent.nodeId)).toHaveLength(1)
      expect(state.blueprintWorkspaceDataView.value?.hasPendingChildCreate).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('工作台 Save All 在同一 owner 内恢复未知子行命令并清除专属待处理状态',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!,owner=await state.loadBlueprintWorkspaceDataView()
      await state.addChildNode(parent)
      expect(owner.hasPendingChildCreate).toBe(true)
      const firstId=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(firstId).toBeTruthy()
      const otherRow=owner.view.rows.find(row=>row['rowid']==='CHILD-A')
      expect(otherRow).toBeTruthy()
      owner.view.setCurrentRow(otherRow??null)

      await state.saveAll()

      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.[0]?.['rowid']).toBe(firstId)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(owner.dirty).toBe(false)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['rowid']===firstId&&row['prowid']===parent.nodeId)).toHaveLength(1)

      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(owner.dirty).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('子行回执核验为全未应用后 Save All 保留原ID并安全重试同一批',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true,false,0,false)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!,owner=await state.loadBlueprintWorkspaceDataView()
      await state.addChildNode(parent)
      const id=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(id).toBeTruthy()

      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.[0]?.['rowid']).toBe(id)
      expect(owner.hasPendingChildCreate).toBe(true)
      expect(owner.dirty).toBe(true)

      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(3)
      expect(fixture.save.mock.calls[2]?.[0].changes[0]?.changes.added?.[0]?.['rowid']).toBe(id)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(owner.dirty).toBe(false)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['rowid']===id&&row['SysId']==='APP-A'&&row['prowid']===parent.nodeId)).toHaveLength(1)
    }finally{ownerScope.stop()}
  })

  it('子行待核验父身份不可读或不匹配时 Save All 拒绝并保留原命令',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!,owner=await state.loadBlueprintWorkspaceDataView()
      await state.addChildNode(parent)
      const id=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(id).toBeTruthy()
      const child=owner.view.rows.find(row=>row['rowid']===id)
      expect(child).toBeTruthy()
      const originalParent=child?.['prowid']

      if(child)child['prowid']='OTHER-PARENT'
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasPendingChildCreate).toBe(true)

      if(child)child['prowid']=originalParent
      const originalFieldAccess=owner.view.fieldAccess.bind(owner.view)
      const fieldAccess=vi.spyOn(owner.view,'fieldAccess').mockImplementation((row,field)=>field==='prowid'
        ? {...originalFieldAccess(row,field),read:'invisible',write:'denied'}
        : originalFieldAccess(row,field))
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasPendingChildCreate).toBe(true)
      fieldAccess.mockRestore()

      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(owner.dirty).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('子行已确认保存但刷新回读失败后只刷新原ID，不再次保存',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!,owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      const refresh=owner.view.refresh.bind(owner.view)
      vi.spyOn(owner.view,'refresh').mockRejectedValueOnce(Error('readback refresh failed')).mockImplementation(refresh)
      await state.addChildNode(parent)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasPendingChildCreate).toBe(true)
      const id=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(id).toBeTruthy()
      await state.addChildNode(parent)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['rowid']===id)).toHaveLength(1)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect([...pageFiles.files.keys()]).toHaveLength(3)
      expect(pageFiles.remove).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('导航写入明确拒绝后清理子行与文件，重试重新创建完整资源链',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},false,true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const parent=state.treeData.value[0]!
      await state.addChildNode(parent)
      expect(state.blueprintWorkspaceDataView.value?.hasPendingChildCreate).toBe(false)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['prowid']===parent.nodeId)).toHaveLength(0)
      expect([...pageFiles.files.keys()]).toHaveLength(0)
      expect(pageFiles.remove).toHaveBeenCalledTimes(3)
      await state.addChildNode(parent)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(pageFiles.upload).toHaveBeenCalledTimes(6)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['prowid']===parent.nodeId)).toHaveLength(1)
      expect(state.statusMessages.value.some(item=>item.text.includes('已在'))).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('根模块新增回执未知时沿原新增 ID 核验，不创建第二根行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.addRootNode()
      expect(state.blueprintWorkspaceDataView.value?.hasUnconfirmedSave).toBe(true)
      const firstId=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.[0]?.['rowid']
      expect(firstId).toBeTruthy()
      await state.addRootNode()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.[0]?.['rowid']).toBe(firstId)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.filter(row=>row['prowid']==='000000')).toHaveLength(2)
      expect(state.blueprintWorkspaceDataView.value?.hasUnconfirmedSave).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('创建并绑定工具只写页面文件 owner 与节点 DataView，不调用 ProjectWorkspace 蓝图 writer',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
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
      expect(httpFns.post).not.toHaveBeenCalledWith('designfile:APP-A/new-tool/create')
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect(fixture.dataSet.getView('PageToolFilesCommand')?.rows.some(row=>row['action']==='create'&&row['pageId']==='new-tool')).toBe(true)
      await expect(state.createPageForSelectedNode({pageId:'new-tool',title:'Duplicate',icon:'Document'})).resolves.toBe(false)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
    }finally{ownerScope.stop()}
  })

  it('创建工具在 DataView 列权限预检失败时不创建任何页面文件',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['NavigationUrl']})
    mockBlueprintScenarioFixture(fixture.dataSet)
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

  it('蓝图绑定明确失败时经原文件 command owner 补偿默认文件，不调用旧删除 gateway',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{},false,true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!)
      httpFns.post.mockClear();httpFns.delete.mockClear()
      const dataSetSave=vi.spyOn(fixture.dataSet,'saveChanges')
      await expect(state.createPageForSelectedNode({pageId:'binding-fail',title:'Binding fail',icon:'Document'})).resolves.toBe(false)
      const actions=fixture.dataSet.getView('PageToolFilesCommand')?.rows.map(row=>row['action'])
      expect(actions).toContain('compensate')
      expect(dataSetSave).toHaveBeenCalledTimes(3)
      expect(dataSetSave.mock.calls[0]?.[0]?.views?.[0]?.tableName).toBe('PageToolFilesCommand')
      expect(dataSetSave.mock.calls[2]?.[0]?.views?.[0]?.tableName).toBe('PageToolFilesCommand')
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect(pageFiles.remove).toHaveBeenCalledTimes(3)
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('binding-fail/'))).toBe(false)
      expect(httpFns.post).not.toHaveBeenCalled()
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.rows.find(row=>row['rowid']==='CHILD-A')?.['NavigationUrl']).toBe('')
    }finally{ownerScope.stop()}
  })

  it('工具绑定保存回执未知时保留文件与原命令并等待 DataView 核验',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.post.mockClear();httpFns.delete.mockClear()
      await expect(state.createPageForSelectedNode({pageId:'uncertain-tool',title:'Uncertain tool',icon:'Document'})).resolves.toBe(false)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(httpFns.post).not.toHaveBeenCalledWith('designfile:APP-A/uncertain-tool/create')
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect(fixture.dataSet.getView('PageToolFilesCommand')?.rows.some(row=>row['action']==='create'&&row['pageId']==='uncertain-tool')).toBe(true)
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.hasUnconfirmedSave).toBe(true)
      expect(state.statusMessages.value.map(message=>message.text).join('\n')).toContain('工具绑定回执未知，已保留原文件创建命令')
      const commandId=fixture.dataSet.getView('PageToolFilesCommand')?.rows.find(row=>row['action']==='create')?.['commandId']
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.dataSet.getView('PageToolFilesCommand')?.rows.find(row=>row['action']==='create')?.['commandId']).toBe(commandId)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
    }finally{ownerScope.stop()}
  })

  it('文件创建回执未知时 Save All 先核验原创建命令，再保存蓝图绑定',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      pageFiles.upload.mockImplementationOnce(async(command)=>{
        pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)
        const error=Object.assign(new Error('timeout after accept'),{name:'RequestError',config:{url:'/file-upload'}})
        throw error
      })
      await expect(state.createPageForSelectedNode({pageId:'file-unknown',title:'File unknown',icon:'Document'})).resolves.toBe(false)
      const fileView=fixture.dataSet.getView('PageToolFilesCommand')
      const commandId=fileView?.rows.find(row=>row['action']==='create')?.['commandId']
      expect(commandId).toBeTruthy()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(pageFiles.upload).toHaveBeenCalledTimes(1)
      await expect(state.openEditingProject({tenantId:'tenant-a',projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(fileView?.rows.find(row=>row['action']==='create')?.['commandId']).toBe(commandId)
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(fileView?.rows.find(row=>row['action']==='create')?.['commandId']).toBe(commandId)
      expect(pageFiles.upload).toHaveBeenCalledTimes(4)
      expect([...pageFiles.files.keys()].filter(key=>key.startsWith('file-unknown/'))).toHaveLength(3)
    }finally{ownerScope.stop()}
  })

  it('节点字段代理不暴露无读取权限值，也拒绝只读字段setter',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['name'],readonlyFields:['memo']})
    mockBlueprintScenarioFixture(fixture.dataSet)
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
    mockBlueprintScenarioFixture(fixture.dataSet)
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
    let failBlueprintLoad=true
    blueprintRuntime.load.mockImplementation(async ({scenarioId}:{scenarioId:string})=>{
      if(scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID)return createDataSpaceCatalogRuntimeDataSet()
      if(failBlueprintLoad){failBlueprintLoad=false;throw new Error('fixture DataView unavailable')}
      return fixture.dataSet
    })
    const ownerScope=effectScope()
    const state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      expect(state.treeData.value).toEqual([])
      expect(httpFns.get).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('fixture DataView unavailable'))).toBe(true)
      await state.loadBlueprint()
      expect(state.treeData.value[0]).toMatchObject({nodeId:'CHILD-A',capability:{code:'CHILD-CODE'}})
      expect(blueprintRuntime.load).toHaveBeenCalledTimes(4)
      expect(blueprintRuntime.load.mock.calls.filter(([input])=>input.scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID)).toHaveLength(2)
      expect(httpFns.get).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('DataView dirty/unknown 回执阻断旧树写入口并保护 NodeBasicInfo 草稿', async () => {
    vi.useFakeTimers()
    const root=blueprintRoot([node('node-a','原名称','cfg:page-a')])
    const fixture=createBlueprintRuntimeDataSet('homepage',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
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

  it('普通叶子蓝图节点删除经完整项目树 DataView 保存并正式回读', async () => {
    const leaf={...node('LEAF-A','普通叶子','', 'APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeFromTree({parent:{data:root}},{...leaf})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除')||item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalled()
      expect(deleteNode).not.toHaveBeenCalled()
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['LEAF-A'])
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('已删除'))).toBe(true)
    } finally {ownerScope.stop()}
  })

  it('普通节点删除权限不足时拒绝且不调用任何保存入口', async () => {
    const deniedRoot=blueprintRoot([{...node('DENIED-A','拒绝节点','','APP-A'),kind:'module' as const}],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',deniedRoot,{deleteAllowed:false})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeFromTree({parent:{data:deniedRoot}},{...deniedRoot.children![0]!})
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(deleteNode).not.toHaveBeenCalled()
      expect(httpFns.delete).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}

  })

  it('普通节点删除拒绝非叶子目标且不部分提交', async () => {
    const grandchild={...node('GRAND-A','孙节点','','APP-A'),kind:'module' as const}
    const parent={...node('PARENT-A','父节点','','APP-A'),kind:'module' as const,children:[grandchild]}
    const root=blueprintRoot([parent],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeFromTree({parent:{data:root}},{...parent})
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(deleteNode).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('普通节点删除拒绝目标项目身份错配且不部分提交', async () => {
    const leaf={...node('LEAF-MISMATCH','身份错配','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeFromTree({parent:{data:root}},{...leaf,projectId:'OTHER-PROJECT'})
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(deleteNode).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('普通叶子删除保存失败或结果未知时保留待核验状态且不回退旧 gateway', async () => {
    const leaf={...node('LEAF-A','普通叶子','', 'APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      state.removeNodeFromTree({parent:{data:root}},{...leaf})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除')||item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalled()
      expect(deleteNode).not.toHaveBeenCalled()
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['LEAF-A'])
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true)
      await owner.save()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['LEAF-A'])
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added).toEqual([])
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.changed).toEqual([])
      expect(deleteNode).not.toHaveBeenCalled()
      expect(owner.hasUnconfirmedSave).toBe(false)
      const refreshed=await owner.loadProjectTree()
      expect(refreshed.children?.some(item=>item.nodeId==='LEAF-A')).toBe(false)
    } finally {ownerScope.stop()}
  })

  it('普通叶子删除明确保存失败时保留 pending-delete 并可沿同一 DataSet 重试', async () => {
    const leaf={...node('LEAF-FAIL','保存失败叶子','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},false,true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      const deleteNode=vi.spyOn(getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'}),'deleteNode').mockResolvedValue(null)
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      state.removeNodeFromTree({parent:{data:root}},{...leaf})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.view.dirtyTracking.hasPendingChanges('LEAF-FAIL')).toBe(true)
      expect(owner.dirty).toBe(true)
      expect(deleteNode).not.toHaveBeenCalled()

      const refreshed=await owner.removeLeafNode(leaf.nodeId,'APP-A',leaf.parentNodeId)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(owner.dirty).toBe(false)
      expect(refreshed.children?.some(item=>item.nodeId==='LEAF-FAIL')).toBe(false)
    } finally {ownerScope.stop()}
  })

  it('挂载页面删除经蓝图与文件 DataView 保存，不调用旧组合删除 gateway', async () => {
    const mounted=node('MOUNTED-A','挂载页面','cfg:mounted-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.loadBlueprint()
      pageFiles.files.set('mounted-page/rule.json','[]')
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'})).toBe(false)
      state.removeNodeFromTree({parent:{data:root}},{...mounted})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除'))).toBe(true))
      expect(httpFns.blueprintDeleteNode).not.toHaveBeenCalled()
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.save).toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it.each([
    ['权限不足',false,false,'APP-A'],
    ['目标有子节点',true,true,'APP-A'],
    ['项目身份错配',true,false,'OTHER-PROJECT'],
  ])('挂载页面删除在%s时拒绝且不删除文件',async(_label,deleteAllowed,hasChild,targetProject)=>{
    const child={...node('MOUNTED-CHILD','子页面','','APP-A'),kind:'module' as const}
    const mounted={...node('MOUNTED-GUARD','挂载页面','cfg:guard-page','APP-A'),kind:'module' as const,...(hasChild?{children:[child]}:{})}
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed})
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('guard-page/rule.json','{}')
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'})).toBe(false)
      state.removeNodeFromTree({parent:{data:root}},{...mounted,projectId:targetProject})
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
      expect(pageFiles.remove).not.toHaveBeenCalled()
      expect([...pageFiles.files.keys()]).toContain('guard-page/rule.json')
    }finally{ownerScope.stop()}
  })

  it('挂载页面蓝图行保存失败时不启动文件删除命令',async()=>{
    const mounted=node('MOUNTED-FAIL','挂载页面','cfg:fail-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},false,true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('fail-page/rule.json','{}')
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeFromTree({parent:{data:root}},{...mounted})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(pageFiles.remove).not.toHaveBeenCalled()
      expect([...pageFiles.files.keys()]).toContain('fail-page/rule.json')
    }finally{ownerScope.stop()}
  })

  it('挂载蓝图删除成功但文件删除失败时报告部分成功，工作台 Save 沿原文件命令恢复',async()=>{
    const mounted=node('MOUNTED-PARTIAL','挂载页面','cfg:partial-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('partial-page/rule.json','{}')
    pageFiles.remove.mockRejectedValueOnce(Error('explicit file delete rejection'))
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'})).toBe(false)
      state.removeNodeFromTree({parent:{data:root}},{...mounted})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>/部分成功|蓝图.*已删除.*文件/.test(item.text))).toBe(true))
      const fileView=fixture.dataSet.getView('PageToolFilesCommand')
      const commandId=fileView?.rows.find(row=>row['action']==='delete')?.['commandId']
      expect(typeof commandId).toBe('string')
      expect(fixture.save).toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('部分成功'))).toBe(true)
      await expect(state.openEditingProject({tenantId:'tenant-a',projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(fileView?.rows.find(row=>row['action']==='delete')?.['commandId']).toBe(commandId)
      expect(pageFiles.remove).toHaveBeenCalledTimes(2)
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('partial-page/'))).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('挂载蓝图删除回执未知后 Save All 核验原节点并接续目录文件删除',async()=>{
    const mounted=node('MOUNTED-UNKNOWN','未知回执挂载页','cfg:unknown-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('unknown-page/rule.json','{}')
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({tenantId:'tenant-a',projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({tenantId:'tenant-a',projectId:'APP-A'})).toBe(false)
      state.removeNodeFromTree({parent:{data:root}},{...mounted})
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true))
      expect([...pageFiles.files.keys()]).toContain('unknown-page/rule.json')
      expect(pageFiles.remove).not.toHaveBeenCalled()
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['MOUNTED-UNKNOWN'])
      await expect(state.openEditingProject({tenantId:'tenant-a',projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['MOUNTED-UNKNOWN'])
      expect(pageFiles.remove).toHaveBeenCalledTimes(1)
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('unknown-page/'))).toBe(false)
    }finally{ownerScope.stop()}
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
    mockBlueprintScenarioFixture(fixture.dataSet)

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
    mockBlueprintScenarioFixture(fixture.dataSet)

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
