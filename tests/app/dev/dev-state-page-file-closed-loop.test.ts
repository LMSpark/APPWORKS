import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { effectScope, nextTick, watchEffect } from 'vue'
import { DataSet, type DataRow } from '@spark-appworks/spark-data'
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
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type { RuntimeNavigation } from '@spark-appworks/spark-app'
import { refreshRoutes } from '@spark-appworks/spark-app'
import { lowcodeHttp as http } from '@/lowcode/lowcode-runtime'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import {guardPageDesignEditor} from '@/services/page-design/page-design-operation-guard'
import {readPageDesignRunContext} from '@/services/page-design/page-design-gates'
import { getBuiltinScenarioResource } from '@/registries/builtin-application-registry'
import { BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME, BuiltinBlueprintNodeResource } from '@/lowcode/resources/shared/builtin-blueprint-node-resource'
import applicationPageData from '../../../config/pages/application/project-blueprint/pagedata.json'

const httpFns = vi.hoisted(() => ({
  get: vi.fn(),
  requestFull: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  clearCache: vi.fn(),
  scopeToken: 'fixture-token',
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))
const pageFiles=vi.hoisted(()=>({files:new Map<string,string>(),readFailures:0,legacyReads:[] as Array<{pageId:string;fileName:string}>,upload:vi.fn(async(command:{pageId:string;fileName:string;text:string})=>{pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)}),restoreWorkingFile:vi.fn(async(command:{pageId:string;fileName:string;text:string})=>{pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)}),remove:vi.fn(async(_app:string,page:string,name:string)=>{pageFiles.files.delete(`${page}/${name}`)})}))
const pageDesignAiRun=vi.hoisted(()=>({run:vi.fn(async()=> 'completed' as const)}))

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectBlueprintTreeData | null,
}))
const blueprintRuntime = vi.hoisted(() => ({load:vi.fn()}))
const blueprintRuntimeTrees = new Map<string,ProjectBlueprintTreeData>()
const DATA_SPACE_CATALOG_SCENARIO_ID='90A82E287930A234FEC3E687C94A93EA'
const builtinBlueprintRecords=JSON.parse(readFileSync('notes/evidence/workbench-tool-mapping-20261029/builtin-blueprint-business-records.json','utf8')) as {
  applicationId:string
  businessFields:string[]
  rows:Array<Record<string,unknown>>
}
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
function mockBlueprintScenarioFixture(dataSet:DataSet,reopenedDataSet?:()=>DataSet):void{
  let firstBlueprintLoad=true
  blueprintRuntime.load.mockImplementation(async ({scenarioId}:{scenarioId:string})=>{
    if(scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID)return createDataSpaceCatalogRuntimeDataSet()
    if(firstBlueprintLoad){firstBlueprintLoad=false;return dataSet}
    return reopenedDataSet?.()??dataSet
  })
}
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',async importOriginal=>({
  ...await importOriginal<typeof import('@/lowcode/data-space/lowcode-data-space-runtime')>(),
  loadLowcodeRuntimeScenario:blueprintRuntime.load,
}))

const pageDesignWorkflow=vi.hoisted(()=>({activate:vi.fn(async(options:{host:unknown})=>options.host)}))
vi.mock('@/services/ai/agent-workflow-bindings',async importOriginal=>({
  ...await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>(),
  activatePageDesignAgentWorkflow:pageDesignWorkflow.activate,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  noopTraceSink: {
    appendUserMessage:vi.fn(),appendEvent:vi.fn(),appendDelta:vi.fn(),appendReasoning:vi.fn(),appendToolCall:vi.fn(),
    appendError:vi.fn(),markAborted:vi.fn(),finish:vi.fn(),reset:vi.fn(),
  },
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    if (navTreeState.tree) return navTreeState.tree
    throw new Error('refreshRoutes: no nav tree')
  }),
  createAiRunAdapter: vi.fn(() => ({
    isRunning: vi.fn(() => false),
    abort: vi.fn(),
    run: pageDesignAiRun.run,
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
    readRequestScope: () => ({token:httpFns.scopeToken,headers:{'X-AppId':'APP-A'}}),
  },
  createLowcodeProjectGateways: (projectId: string) => {
    const blueprintKey = `project-blueprint:${projectId}`
    const pageFileKey = `designfile:${projectId}`
    return {
      pageFiles: {
        readPageFile: async (command: { pageId: string; fileName: string }) => {
          pageFiles.legacyReads.push(command)
          const stored=pageFiles.files.get(`${command.pageId}/${command.fileName}`)
          if(stored!==undefined)return stored
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
      },
      blueprint: {},
      projectReferences: {
        listProjects: async () => [],
        loadProjectBlueprint: async () => ({ children: [] }),
      },
    }
  },
  createPageToolFilesIo: (projectId:string) => ({
    list:async(_app:string,page:string)=>[...pageFiles.files.keys()].filter(key=>key.startsWith(`${page}/`)).map(key=>key.slice(page.length+1)),
    read:async(_app:string,page:string,name:string)=>{if(pageFiles.readFailures>0){pageFiles.readFailures--;throw Object.assign(new Error('accepted upload readback unavailable'),{status:503,response:{status:503}})}return pageFiles.files.get(`${page}/${name}`)??null},
    upload:pageFiles.upload,restoreWorkingFile:pageFiles.restoreWorkingFile,remove:pageFiles.remove,
    listVersions:async({customPath,fileName}:{customPath:string;fileName:string})=>{
      const page=customPath.split('/').at(-1)??''
      return [...pageFiles.files.keys()].flatMap(key=>{
        const name=key.slice(page.length+1)
        const separator=name.indexOf('__'),versionText=name.slice(0,separator)
        return key.startsWith(`${page}/`)&&separator>0&&name.slice(separator+2)===fileName&&/^\d+$/.test(versionText)
          ?[{version:Number(versionText),fileName:name,lastModified:null}]:[]
      })
    },
    uploadVersion:async({customPath,fileName,version,text}:{customPath:string;fileName:string;version:number;text:string})=>{
      const page=customPath.split('/').at(-1)??'';pageFiles.files.set(`${page}/${version}__${fileName}`,text)
    },
    readVersion:async({customPath,fileName,version}:{customPath:string;fileName:string;version:number})=>{
      const page=customPath.split('/').at(-1)??'';return pageFiles.files.get(`${page}/${version}__${fileName}`)??null
    },
  }),
}))


function node(nodeId:string,title:string,target:string,projectId='homepage',description=''):ProjectBlueprintTreeNodeData { return {nodeId,parentNodeId:`${projectId}_root`,projectId,kind:'page',capability:{name:title,description},navigation:{title,target,icon:'Document',order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{}} }
function blueprintRoot(children:ProjectBlueprintTreeNodeData[],projectId='homepage'):ProjectBlueprintTreeData { return {nodeId:`${projectId}_root`,parentNodeId:'',projectId,kind:'module',capability:{name:projectId},navigation:{title:projectId,order:0,publishInMenu:true,showChildren:true,beginGroup:false},source:{},children} }

const httpMock = vi.mocked(http)

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
  const tables:Record<string,unknown>={ProjectToolFile:applicationPageData.tables.ProjectToolFile,Base_NavigationInfo:{
    modelBinding:{modelId:`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`,modelName:'Base_NavigationInfo'},
    columns:fields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid',...(access.requiredFields?.includes(name)?{required:true}:{})})),views:{default:{autoLoad:false}},
  }}
  const builtinScenarioId=getBuiltinScenarioResource('projectBlueprint').scenarioId
  if(projectId===builtinBlueprintRecords.applicationId)tables[BUILTIN_BLUEPRINT_NODE_TABLE_NAME]={
    resourceType:'file',resourceId:BUILTIN_BLUEPRINT_NODE_RESOURCE_ID,
    columns:builtinBlueprintRecords.businessFields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'})),views:{default:{autoLoad:false}},
  }
  const dataSet=DataSet.fromJson({scenarioId:projectId===builtinBlueprintRecords.applicationId?builtinScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables})
  let allPagesRequested=false
  let queryCount=0
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
      queryCount++
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
  if(projectId===builtinBlueprintRecords.applicationId){
    const repositoryView=dataSet.getView(BUILTIN_BLUEPRINT_NODE_TABLE_NAME)!
    new BuiltinBlueprintNodeResource({applicationId:projectId,scenarioId:builtinScenarioId,assertCurrent:()=>undefined}).bind(repositoryView)
  }
  return {dataSet,readAllPages:()=>allPagesRequested,readQueryCount:()=>queryCount,save}
}

function createDynamicBlueprintDataSetFromFullScenario(){
  const scenario=JSON.parse(readFileSync('config/pages/application/project-blueprint/pagedata.json','utf8')) as {tables:Record<string,Record<string,unknown>>}
  const tables=JSON.parse(JSON.stringify(scenario.tables)) as Record<string,Record<string,unknown>>
  for(const table of Object.values(tables)){
    if(!Array.isArray(table['columns']))table['columns']=[]
    if(typeof table['views']!=='object'||table['views']===null||Array.isArray(table['views']))table['views']={default:{autoLoad:false}}
    else if(!Object.hasOwn(table['views'],'default'))(table['views'] as Record<string,unknown>)['default']={autoLoad:false}
  }
  const fields=['rowid','SysId','prowid','FunOrderValue','name','FunName','funCode','NavigationUrl','NavigationImageWxz','MobileUrl',
    'NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup',
    'conid','conType','memo','htmlDesc','VersionId','DifficultyFactor','Manhour','Number','Sum','Total','personCharge','status']
  const base=tables['Base_NavigationInfo']!
  base['columns']=fields.map(name=>({name,type:'string',isPrimaryKey:name==='rowid'}))
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables})
  const view=dataSet.getView('Base_NavigationInfo','default')!
  const rows:DataRow[]=[{...Object.fromEntries(fields.map(field=>[field,''])),rowid:'DYNAMIC-ROOT',SysId:'APP-A',
    prowid:'000000',FunOrderValue:0,name:'动态应用',FunName:'动态应用',conType:'Model'}]
  let queryCount=0
  const result=(selected:DataRow[])=>({rows:selected,total:selected.length,countReported:true,resultPrimaryKey:'rowid',
    assertIdentity(identity:{scenarioId:string;metaName:string}){if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('dynamic blueprint identity mismatch')},
    rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    fieldAccess:(key:unknown,field:string)=>selected.some(row=>row['rowid']===key&&Object.hasOwn(row,field))
      ? {read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}
      : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
    readFieldAccess:(row:Readonly<DataRow>,field:string)=>Object.hasOwn(row,field)?'visible' as const:'invisible' as const,
    addActionState:()=>'enabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'enabled' as const,
    createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const})
  const save=vi.fn(async(command:Parameters<NonNullable<Parameters<typeof view.bindQueryExecutor>[0]['save']>>[0])=>command.changes.map(change=>{
    const changed=[...(change.changes.changed??[])]
    for(const patch of changed){const row=rows.find(item=>item['rowid']===patch['rowid']);if(row)Object.assign(row,patch)}
    return {metaName:change.identity.metaName,added:[],changed,deleted:[],changedFields:changed.map(row=>Object.keys(row)),context:result(rows)}
  }))
  view.bindQueryExecutor({queryColumns:current=>current.columns,executeQuery:async()=>{queryCount++;return result(rows)},save})
  return {dataSet,view,save,readQueryCount:()=>queryCount,rootId:'DYNAMIC-ROOT'}
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
    pageDesignAiRun.run.mockReset()
    pageDesignAiRun.run.mockImplementation(async ()=>'completed')
    pageDesignWorkflow.activate.mockReset()
    pageDesignWorkflow.activate.mockImplementation(async options=>options.host)
    httpFns.scopeToken='fixture-token'
    pageFiles.files.clear()
    pageFiles.readFailures=0
    pageFiles.legacyReads.length=0
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

  it('selecting a cfg node binds its page without eager reads through the legacy page-file gateway', async () => {
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try {
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      pageFiles.files.set('demo/rule.json','{"rule":"active"}')
      pageFiles.files.set('demo/script.js','script')
      pageFiles.files.set('demo/style.css','style')

      await state.selectNode(state.treeData.value[0]!)

      expect(state.activePageId.value).toBe('demo')
      expect(state.project.getActivePage()?.pageId).toBe('demo')
      expect(pageFiles.legacyReads).toEqual([])
      expect(state.project.getActivePage()?.isLoaded).toBe(false)

      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'rule.json'})
      expect(view.currentRow?.['text']).toBe('{"rule":"active"}')
      expect(pageFiles.legacyReads).toEqual([])
    } finally { scope.stop() }
  })

  it('builtin Dev 主树使用完整仓内记录且不查询冲突的 Base_NavigationInfo 数据库树',async()=>{
    const applicationId=builtinBlueprintRecords.applicationId
    const conflict=blueprintRoot([{...node('DB-CONFLICT','数据库冲突节点','cfg:db-conflict',applicationId)}],applicationId)
    conflict.nodeId=applicationId
    conflict.parentNodeId='000000'
    conflict.capability.name='数据库冲突根'
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:applicationId},{force:true})
      const fixture=createBlueprintRuntimeDataSet(applicationId,conflict)
      blueprintRuntime.load.mockImplementation(async ({scenarioId}:{scenarioId:string})=>
        scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID?createDataSpaceCatalogRuntimeDataSet()
          :scenarioId===LowcodeDictionary.editorScenarioId?createDictionaryRuntimeDataSet():fixture.dataSet)
      const owner=await state.loadBlueprintWorkspaceDataView()
      const tree=await owner.loadProjectTree()
      const nodes:ProjectBlueprintTreeNodeData[]=[]
      const collect=(item:ProjectBlueprintTreeNodeData):void=>{nodes.push(item);item.children?.forEach(collect)}
      collect(tree)
      expect.soft(fixture.readQueryCount()).toBe(0)
      expect.soft(nodes).toHaveLength(builtinBlueprintRecords.rows.length)
      expect.soft(new Set(nodes.map(item=>item.nodeId))).toEqual(new Set(builtinBlueprintRecords.rows.map(row=>String(row['rowid']))))
      expect.soft(owner.view.rows.find(row=>row['rowid']===applicationId)).toMatchObject({
        rowid:applicationId,SysId:applicationId,name:builtinBlueprintRecords.rows.find(row=>row['rowid']===applicationId)?.['name'],
        conType:builtinBlueprintRecords.rows.find(row=>row['rowid']===applicationId)?.['conType'],
      })
    }finally{ownerScope.stop()}
  })

  it('完整7AB场景含仓内节点声明时动态Dev仍沿正式Base_NavigationInfo查询保存',async()=>{
    const fixture=createDynamicBlueprintDataSetFromFullScenario()
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,'APP-A',()=>undefined)
    try{
      expect(owner.view).toBe(fixture.view)
      expect(owner.view.tableName).toBe('Base_NavigationInfo')
      expect((await owner.loadProjectTree()).nodeId).toBe('DYNAMIC-ROOT')
      expect(fixture.readQueryCount()).toBe(1)
      await owner.load(fixture.rootId)
      owner.update('memo','dynamic owner saved')
      await owner.save()
      expect(fixture.save).toHaveBeenCalledOnce()
      expect(owner.value('memo')).toBe('dynamic owner saved')
      expect(fixture.dataSet.getTable(BUILTIN_BLUEPRINT_NODE_TABLE_NAME)?.resourceId).toBe(BUILTIN_BLUEPRINT_NODE_RESOURCE_ID)
    }finally{owner.dispose();fixture.dataSet.destroy()}
  })

  it('保留动态 Base_NavigationInfo 节点的 BeginGroup 投影字段',async()=>{
    const grouped={...node('GROUPED-PAGE','分组页面','cfg:grouped','APP-A'),
      navigation:{...node('GROUPED-PAGE','分组页面','cfg:grouped','APP-A').navigation!,beginGroup:true}}
    const fixture=createBlueprintRuntimeDataSet('APP-A',blueprintRoot([grouped],'APP-A'))
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView()
      const tree=await owner.loadProjectTree()
      expect(tree.children?.find(item=>item.nodeId==='GROUPED-PAGE')?.navigation?.beginGroup).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('节点基本信息通过共享 Base_NavigationInfo DataView 保存而不调用 ProjectWorkspace gateway', async () => {
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope()
    const state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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

  it('mixed create and leaf name/memo update use one DataSet request and read back both rows',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),root=state.treeData.value[0]!
      await owner.loadProjectTree()
      const formalRoot=owner.treeProjection(),leaf=formalRoot.children[0]!
      const updated={...leaf,capability:{...leaf.capability,name:'Child revised',description:'Updated memo'}}
      await owner.addAndUpdateChildNodes([{nodeId:'MIXED-CREATE',parentNodeId:formalRoot.nodeId,fields:{name:'Mixed created',FunName:'Mixed created',funCode:'MIXED-CREATE',conType:'Navitem',FunOrderValue:'1',NavigationUrl:'cfg:mixed-create'}}],[updated])
      expect(fixture.save).toHaveBeenCalledTimes(1)
      const sent=fixture.save.mock.calls[0]?.[0].changes
      expect(sent).toHaveLength(1)
      expect(sent?.[0]?.changes.added?.map(row=>row['rowid'])).toEqual(['MIXED-CREATE'])
      expect(sent?.[0]?.changes.changed?.map(row=>row['rowid'])).toEqual([leaf.nodeId])
      expect(owner.view.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({rowid:'MIXED-CREATE',SysId:'APP-A',prowid:formalRoot.nodeId,name:'Mixed created'}),
        expect.objectContaining({rowid:leaf.nodeId,SysId:'APP-A',prowid:leaf.parentNodeId,name:'Child revised',memo:'Updated memo'}),
      ]))
      expect(owner.hasPendingBlueprintCommand).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('mixed unknown receipt resolves only the DataSet captured IDs and keeps partial results blocked',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true,false,0,1)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView();await owner.loadProjectTree()
      const root=owner.treeProjection(),leaf=root.children[0]!,updated={...leaf,capability:{...leaf.capability,name:'Partial revised',description:'Partial memo'}}
      const creates=[
        {nodeId:'MIXED-UNKNOWN-A',parentNodeId:root.nodeId,fields:{name:'Mixed unknown A',FunName:'Mixed unknown A',funCode:'MIXED-UNKNOWN-A',conType:'Navitem',FunOrderValue:'1',NavigationUrl:'cfg:mixed-unknown-a'}},
        {nodeId:'MIXED-UNKNOWN-B',parentNodeId:root.nodeId,fields:{name:'Mixed unknown B',FunName:'Mixed unknown B',funCode:'MIXED-UNKNOWN-B',conType:'Navitem',FunOrderValue:'2',NavigationUrl:'cfg:mixed-unknown-b'}},
      ]
      await expect(owner.addAndUpdateChildNodes(creates,[updated])).rejects.toThrow('transport timeout')
      const first=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])
      expect(owner.hasPendingBlueprintCommand).toBe(true)
      await expect(owner.save()).rejects.toThrow(/SPARK_SAVE_UNVERIFIABLE|partial|unknown/iu)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])).toEqual(first)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.changed?.map(row=>row['rowid'])).toEqual([leaf.nodeId])
      expect(owner.hasPendingBlueprintCommand).toBe(true)
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(owner.view.dirtyTracking.pendingCreateIds).toEqual(new Set(['MIXED-UNKNOWN-A','MIXED-UNKNOWN-B']))
    }finally{ownerScope.stop()}
  })

  it('mixed update validator failure leaves no create or update overlay and does not save',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView();await owner.loadProjectTree()
      const root=owner.treeProjection(),leaf=root.children[0]!
      vi.spyOn(owner.view.validator!,'validateColumns').mockImplementation(row=>row['memo']==='REJECT-MIXED'?{valid:false,errors:[{message:'validator rejects mixed memo'}]} as never:{valid:true,errors:[]} as never)
      const updated={...leaf,capability:{...leaf.capability,description:'REJECT-MIXED'}}
      await expect(owner.addAndUpdateChildNodes([{nodeId:'MIXED-REJECT',parentNodeId:root.nodeId,fields:{name:'Mixed reject',FunName:'Mixed reject',funCode:'MIXED-REJECT',conType:'Navitem',FunOrderValue:'1',NavigationUrl:'cfg:mixed-reject'}}],[updated])).rejects.toThrow('validator rejects mixed memo')
      expect(owner.view.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(owner.view.hasEditingChanges()).toBe(false)
      expect(owner.hasPendingBlueprintCommand).toBe(false)
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('mixed unknown receipt confirms through the original captured DataSet request',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView();await owner.loadProjectTree()
      const root=owner.treeProjection(),leaf=root.children[0]!,updated={...leaf,capability:{...leaf.capability,name:'Confirmed revised',description:'Confirmed memo'}}
      await expect(owner.addAndUpdateChildNodes([{nodeId:'MIXED-CONFIRMED',parentNodeId:root.nodeId,fields:{name:'Mixed confirmed',FunName:'Mixed confirmed',funCode:'MIXED-CONFIRMED',conType:'Navitem',FunOrderValue:'1',NavigationUrl:'cfg:mixed-confirmed'}}],[updated])).rejects.toThrow('transport timeout')
      const firstAdded=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])
      await owner.save()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added?.map(row=>row['rowid'])).toEqual(firstAdded)
      expect(owner.hasPendingBlueprintCommand).toBe(false)
      expect(owner.view.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({rowid:'MIXED-CONFIRMED',name:'Mixed confirmed'}),
        expect.objectContaining({rowid:leaf.nodeId,name:'Confirmed revised',memo:'Confirmed memo'}),
      ]))
    }finally{ownerScope.stop()}
  })

  it('策划多父叶子由 Base_NavigationInfo DataView 一次提交并逐行回读稳定身份与父映射',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',blueprintRoot([
      node('PARENT-A','Parent A','','APP-A'),node('PARENT-B','Parent B','','APP-A'),
    ],'APP-A'),{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),[parentA,parentB]=state.treeData.value
      await owner.loadProjectTree()
      const fields=(title:string,id:string)=>({name:title,FunName:title,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})
      const ids=await owner.addChildNodesAcrossParents([
        {nodeId:'MULTI-ROOT',parentNodeId:parentA!.nodeId,fields:fields('Multi Root','MULTI-ROOT')},
        {nodeId:'MULTI-CHILD',parentNodeId:parentB!.nodeId,fields:fields('Multi Child','MULTI-CHILD')},
      ])

      expect(ids).toEqual(['MULTI-ROOT','MULTI-CHILD'])
      expect(fixture.save).toHaveBeenCalledTimes(1)
      const saved=fixture.save.mock.calls[0]?.[0].changes
      expect(saved).toHaveLength(1)
      expect(saved?.[0]?.changes.added?.map(row=>[row['rowid'],row['prowid']])).toEqual([
        ['MULTI-ROOT',parentA!.nodeId],['MULTI-CHILD',parentB!.nodeId],
      ])
      expect(owner.view.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({rowid:'MULTI-ROOT',SysId:'APP-A',prowid:parentA!.nodeId,name:'Multi Root'}),
        expect.objectContaining({rowid:'MULTI-CHILD',SysId:'APP-A',prowid:parentB!.nodeId,name:'Multi Child'}),
      ]))
      expect(owner.hasPendingChildCreate).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('RendererTree 相对移动按同一 Base_NavigationInfo DataView 的新鲜行排序并只暂存当前树 patch',async()=>{
    const root=blueprintRoot([
      {...node('MOVE-A','A','','APP-A'),navigation:{title:'A',order:0,publishInMenu:true,showChildren:true,beginGroup:false}},
      {...node('MOVE-B','B','','APP-A'),navigation:{title:'B',order:1,publishInMenu:true,showChildren:true,beginGroup:false}},
      {...node('MOVE-C','C','','APP-A'),navigation:{title:'C',order:2,publishInMenu:true,showChildren:true,beginGroup:false}},
    ],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      await owner.load('MOVE-A')
      const selected=owner.view.currentRow
      const rawBefore=owner.view.rows.map(row=>({rowid:row['rowid'],prowid:row['prowid'],FunOrderValue:row['FunOrderValue']}))
      const refresh=vi.spyOn(owner.view,'refresh')

      await owner.moveNodeRelative({nodeId:'MOVE-C',targetNodeId:'MOVE-A',position:'before'})

      expect(refresh).toHaveBeenCalledOnce()
      expect(owner.treeProjection().children.map(child=>child.nodeId)).toEqual(['MOVE-C','MOVE-A','MOVE-B'])
      expect(owner.view.editingRows.map(row=>row['rowid'])).toEqual(expect.arrayContaining(['MOVE-A','MOVE-C']))
      expect(owner.view.editingRows.find(row=>row['rowid']==='MOVE-C')?.['FunOrderValue']).toBe(0)
      expect(owner.view.editingRows.find(row=>row['rowid']==='MOVE-A')?.['FunOrderValue']).toBe(1)
      expect(owner.view.rows.map(row=>({rowid:row['rowid'],prowid:row['prowid'],FunOrderValue:row['FunOrderValue']}))).toEqual(rawBefore)
      expect(owner.view.currentRow?.['rowid']).toBe(selected?.['rowid'])
      expect(fixture.save).not.toHaveBeenCalled()
      await expect(owner.moveNodeRelative({nodeId:'MOVE-B',targetNodeId:'MOVE-A',position:'after'})).rejects.toThrow('未保存修改')
      expect(refresh).toHaveBeenCalledOnce()
    }finally{ownerScope.stop()}
  })

  it('RendererTree 相对移动缺失目标或任一受影响行无排序写权限时不留下 DataView patch',async()=>{
    const root=blueprintRoot([
      {...node('MOVE-A','A','','APP-A'),navigation:{title:'A',order:0,publishInMenu:true,showChildren:true,beginGroup:false}},
      {...node('MOVE-B','B','','APP-A'),navigation:{title:'B',order:1,publishInMenu:true,showChildren:true,beginGroup:false}},
      {...node('MOVE-C','C','','APP-A'),navigation:{title:'C',order:2,publishInMenu:true,showChildren:true,beginGroup:false}},
    ],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{readonlyFields:['FunOrderValue']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      await owner.load('MOVE-A')
      const selected=owner.view.currentRow

      await expect(owner.moveNodeRelative({nodeId:'MOVE-C',targetNodeId:'MISSING',position:'before'})).rejects.toThrow('未返回相对移动目标')
      expect(owner.view.editingRows).toEqual([])
      await expect(owner.moveNodeRelative({nodeId:'MOVE-C',targetNodeId:'MOVE-A',position:'before'})).rejects.toThrow('权限拒绝移动行')
      expect(owner.view.editingRows).toEqual([])
      expect(owner.view.currentRow?.['rowid']).toBe(selected?.['rowid'])
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('多父批次任一父行 c 权限不足时完整预检拒绝且不留下部分草稿',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',blueprintRoot([
      node('PARENT-A','Parent A','','APP-A'),node('PARENT-B','Parent B','','APP-A'),
    ],'APP-A'),{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),[parentA,parentB]=state.treeData.value
      await owner.loadProjectTree()
      const action=owner.view.createChildActionState.bind(owner.view)
      vi.spyOn(owner.view,'createChildActionState').mockImplementation(parent=>parent?.['rowid']===parentB!.nodeId?'disabled':action(parent))
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})

      await expect(owner.addChildNodesAcrossParents([
        {nodeId:'DENY-ROOT',parentNodeId:parentA!.nodeId,fields:fields('DENY-ROOT')},
        {nodeId:'DENY-CHILD',parentNodeId:parentB!.nodeId,fields:fields('DENY-CHILD')},
      ])).rejects.toThrow(`父节点 ${parentB!.nodeId}`)

      expect(owner.view.dirtyTracking.pendingCreateIds.size).toBe(0)
      expect(owner.hasPendingChildCreate).toBe(false)
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('多父未知部分回执保留原 ID 与父映射并拒绝创建第二批',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',blueprintRoot([
      node('PARENT-A','Parent A','','APP-A'),node('PARENT-B','Parent B','','APP-A'),
    ],'APP-A'),{addAllowed:true,childAllowed:true},true,false,0,1)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),[parentA,parentB]=state.treeData.value
      await owner.loadProjectTree()
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})
      const commands=[
        {nodeId:'MULTI-PART-A',parentNodeId:parentA!.nodeId,fields:fields('MULTI-PART-A')},
        {nodeId:'MULTI-PART-B',parentNodeId:parentB!.nodeId,fields:fields('MULTI-PART-B')},
      ]
      await expect(owner.addChildNodesAcrossParents(commands)).rejects.toThrow('transport timeout')
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.hasUnconfirmedSave).toBe(true)
      await expect(owner.save()).rejects.toThrow(/SPARK_SAVE_UNVERIFIABLE|partial|unknown/iu)
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(owner.hasPendingChildCreate).toBe(true)
      expect(owner.view.dirtyTracking.pendingCreateIds).toEqual(new Set(['MULTI-PART-A','MULTI-PART-B']))
      expect(owner.view.rows.find(row=>row['rowid']==='MULTI-PART-A')?.['prowid']).toBe(parentA!.nodeId)
      expect(owner.view.rows.find(row=>row['rowid']==='MULTI-PART-B')?.['prowid']).toBe(parentB!.nodeId)
    }finally{ownerScope.stop()}
  })

  it('批次已受理但正式回读失败时仍阻止 DevSystem 项目切换',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      expect(await state.openEditingProject({projectId:'APP-B'},{force:true})).toBe(false)
      expect(state.blueprintWorkspaceDataView.value?.projectId).toBe('APP-A')
    }finally{ownerScope.stop()}
  })

  it('同父叶子批次完整预检失败时不暂存任何新增行',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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

  it('多父批次 rollback 返回 false 时保留 blocked 原命令和可追踪草稿',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',blueprintRoot([
      node('PARENT-A','Parent A','','APP-A'),node('PARENT-B','Parent B','','APP-A'),
    ],'APP-A'),{addAllowed:true,childAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await state.loadBlueprintWorkspaceDataView(),[parentA,parentB]=state.treeData.value
      await owner.loadProjectTree()
      const add=owner.view.addChildRow.bind(owner.view),remove=owner.view.removeRow.bind(owner.view)
      let calls=0
      vi.spyOn(owner.view,'addChildRow').mockImplementation(async input=>{
        const row=await add(input)
        calls++
        if(calls===2&&row!==null&&typeof row==='object'&&!('success' in row))row['SysId']='OTHER-APP'
        return row
      })
      vi.spyOn(owner.view,'removeRow').mockImplementation(async id=>id==='ROLLBACK-B'?false:remove(id))
      const fields=(id:string)=>({name:id,FunName:id,funCode:id,conType:'Navitem',FunOrderValue:'1',NavigationUrl:`cfg:${id.toLowerCase()}`})

      await expect(owner.addChildNodesAcrossParents([
        {nodeId:'ROLLBACK-A',parentNodeId:parentA!.nodeId,fields:fields('ROLLBACK-A')},
        {nodeId:'ROLLBACK-B',parentNodeId:parentB!.nodeId,fields:fields('ROLLBACK-B')},
      ])).rejects.toThrow(/回滚未确认|原命令已锁定/iu)

      expect(owner.hasPendingChildCreate).toBe(true)
      expect(owner.view.dirtyTracking.pendingCreateIds).toEqual(new Set(['ROLLBACK-B']))
      expect(owner.view.rows.find(row=>row['rowid']==='ROLLBACK-B')).toMatchObject({rowid:'ROLLBACK-B',prowid:parentB!.nodeId})
      expect(fixture.save).not.toHaveBeenCalled()
    }finally{ownerScope.stop()}
  })

  it('批量未知回执核验部分写入时保留原ID集合并拒绝第二批重放',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{addAllowed:true,childAllowed:true},true,false,0,1)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.put.mockClear()
      pageFiles.legacyReads.length=0
      const created=await state.createPageForSelectedNode({pageId:'new-tool',title:'New tool',icon:'Document'})
      expect(created,state.statusMessages.value.map(message=>message.text).join('\n')).toBe(true)
      const changed=fixture.save.mock.calls[0]?.[0].changes[0]?.changes.changed?.find(row=>row['rowid']==='CHILD-A')
      expect(changed).toMatchObject({conType:'page',NavigationUrl:'cfg:new-tool',FunName:'New tool',NavigationImageWxz:'Document'})
      expect(httpFns.put.mock.calls.some(([url])=>String(url).startsWith('project-blueprint:'))).toBe(false)
      expect(httpFns.post).not.toHaveBeenCalledWith('designfile:APP-A/new-tool/create')
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect(pageFiles.legacyReads).toEqual([])
      expect(fixture.dataSet.getTable('ProjectToolFile')?.viewList.some(view=>view.queryContext['pageId']==='new-tool')).toBe(true)
      expect(fixture.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(fixture.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
      await expect(state.createPageForSelectedNode({pageId:'new-tool',title:'Duplicate',icon:'Document'})).resolves.toBe(false)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
    }finally{ownerScope.stop()}
  })

  it('创建工具在 DataView 列权限预检失败时不创建任何页面文件',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['NavigationUrl']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!)
      httpFns.post.mockClear();httpFns.delete.mockClear()
      const dataSetSave=vi.spyOn(fixture.dataSet,'saveChanges')
      await expect(state.createPageForSelectedNode({pageId:'binding-fail',title:'Binding fail',icon:'Document'})).resolves.toBe(false)
      expect(dataSetSave.mock.calls.some(([request])=>request?.views?.some(view=>view.tableName==='ProjectToolFile'))).toBe(true)
      expect(fixture.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(fixture.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      httpFns.post.mockClear();httpFns.delete.mockClear()
      await expect(state.createPageForSelectedNode({pageId:'uncertain-tool',title:'Uncertain tool',icon:'Document'})).resolves.toBe(false)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(httpFns.post).not.toHaveBeenCalledWith('designfile:APP-A/uncertain-tool/create')
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      const pageFileViews=fixture.dataSet.getTable('ProjectToolFile')?.viewList.filter(view=>view.queryContext['pageId']==='uncertain-tool'&&view.queryContext['fileName']!==undefined)??[]
      expect(pageFileViews).toHaveLength(3)
      expect(pageFileViews.some(view=>view.hasUnconfirmedSave)).toBe(false)
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.dataSet.getView('Base_NavigationInfo')?.hasUnconfirmedSave).toBe(true)
      expect(state.statusMessages.value.map(message=>message.text).join('\n')).toContain('工具绑定回执未知')
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
    }finally{ownerScope.stop()}
  })

  it('文件创建回执未知时 Save All 核验原 DataView attempt 后继续创建并保存蓝图绑定',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      const node=state.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
      await state.selectNode(node)
      pageFiles.upload.mockImplementationOnce(async(command)=>{
        pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)
        const error=Object.assign(new Error('timeout after accept'),{name:'RequestError',config:{url:'/file-upload'}})
        throw error
      })
      await expect(state.createPageForSelectedNode({pageId:'file-unknown',title:'File unknown',icon:'Document'})).resolves.toBe(false)
      const fileView=fixture.dataSet.getTable('ProjectToolFile')?.viewList.find(view=>view.queryContext['pageId']==='file-unknown'&&view.queryContext['fileName']==='rule.json')
      expect(fileView?.hasUnconfirmedSave).toBe(true)
      expect(fixture.save).not.toHaveBeenCalled()
      expect(pageFiles.upload).toHaveBeenCalledTimes(1)
      await expect(state.openEditingProject({projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(fileView?.hasUnconfirmedSave).toBe(false)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect([...pageFiles.files.keys()].filter(key=>key.startsWith('file-unknown/'))).toHaveLength(3)
    }finally{ownerScope.stop()}
  })

  it('unknown 文件创建跨 scope teardown 保留 page-binding saga 与原 command ID',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A')
    mockBlueprintScenarioFixture(fixture.dataSet)
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    const node=first.treeData.value.find(candidate=>candidate.nodeId==='CHILD-A')!
    await first.selectNode(node)
    pageFiles.upload.mockImplementationOnce(async(command)=>{
      pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)
      const error=Object.assign(new Error('timeout after accept'),{name:'RequestError',config:{url:'/file-upload'}})
      throw error
    })
    await expect(first.createPageForSelectedNode({pageId:'scope-create-page',title:'Scope create',icon:'Document'})).resolves.toBe(false)
    const fileView=fixture.dataSet.getTable('ProjectToolFile')?.viewList.find(view=>view.queryContext['pageId']==='scope-create-page'&&view.queryContext['fileName']==='rule.json')
    expect(fileView?.hasUnconfirmedSave,JSON.stringify({views:fixture.dataSet.getTable('ProjectToolFile')?.viewList.map(view=>({id:view.viewId,context:view.queryContext,unknown:view.hasUnconfirmedSave})),status:first.statusMessages.value})).toBe(true)
    const originalOwner=await first.loadBlueprintWorkspaceDataView(),runtime=first.blueprintPageRuntime.value
    firstScope.stop()

    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try{
      await expect(second.openEditingProject({projectId:'APP-A'},{force:true})).resolves.toBe(true)
      const recovered=await second.loadBlueprintWorkspaceDataView()
      expect(recovered).toBe(originalOwner)
      expect(second.blueprintPageRuntime.value).toBe(runtime)
      expect(fileView?.hasUnconfirmedSave).toBe(true)
      await second.saveAll()
      await second.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(fileView?.hasUnconfirmedSave).toBe(false)
      expect(pageFiles.upload).toHaveBeenCalledTimes(3)
      expect([...pageFiles.files.keys()].filter(key=>key.startsWith('scope-create-page/'))).toHaveLength(3)
    }finally{secondScope.stop()}
  })

  it('节点字段代理不暴露无读取权限值，也拒绝只读字段setter',async()=>{
    const fixture=createBlueprintRuntimeDataSet('APP-A',undefined,{hiddenFields:['name'],readonlyFields:['memo']})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
      await expect(state.openEditingProject({projectId:'APP-A'},{force:true})).resolves.toBe(true)
      expect(blueprintRuntime.load).toHaveBeenCalledWith({projectId:'APP-A',scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY})
      expect(fixture.readAllPages()).toBe(true)
      expect(state.blueprintWorkspaceDataView.value?.hasTreeProjection).toBe(true)
      expect(state.project.rootNode?.id).toBe('ROOT-A')
      expect(state.treeData.value[0]).toMatchObject({nodeId:'CHILD-A',capability:{code:'CHILD-CODE'}})
      expect(httpFns.get).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('首载 DataView 失败时隐藏缓存树且不回退 ProjectWorkspace gateway', async () => {
    const cached=getAppProjectBlueprintWorkspace({projectId:'APP-A'})
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
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
    await state.openEditingProject({projectId:'homepage'},{force:true})
    await state.selectNode(state.selectedNode.value!)
    state.blueprintDraft.navigation!.title='尚未保存的基本信息'
    state.markBlueprintDirty()
    try {
      expect(state.blueprintDraft.navigation?.title).toBe('尚未保存的基本信息')
      state.addRootNode()
      state.removeNodeById(root.children![0]!.nodeId)
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeById(leaf.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除')||item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalled()
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeById(deniedRoot.children![0]!.nodeId)
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeById(parent.nodeId)
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('普通节点删除拒绝目标项目身份错配且不部分提交', async () => {
    const leaf={...node('LEAF-MISMATCH','身份错配','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeById('OTHER-PROJECT')
      await nextTick()
      expect(fixture.save).not.toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('普通叶子删除保存失败或结果未知时保留待核验状态且不回退旧 gateway', async () => {
    const leaf={...node('LEAF-A','普通叶子','', 'APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      state.removeNodeById(leaf.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除')||item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalled()
      expect(owner.hasUnconfirmedSave).toBe(true)
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['LEAF-A'])
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true)
      await owner.save()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['LEAF-A'])
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.added).toEqual([])
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.changed).toEqual([])
      expect(owner.hasUnconfirmedSave).toBe(false)
      const refreshed=await owner.loadProjectTree()
      expect(refreshed.children?.some(item=>item.nodeId==='LEAF-A')).toBe(false)
    } finally {ownerScope.stop()}
  })

  it('effectScope teardown 后同项目重新 acquire 复用未知 Base_NavigationInfo owner 并沿原命令完成读回', async () => {
    const leaf={...node('LEAF-SCOPE-RECOVERY','作用域恢复叶子','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    const firstOwner=await first.loadBlueprintWorkspaceDataView()
    const runtime=first.blueprintPageRuntime.value
    await firstOwner.loadProjectTree()
    await expect(firstOwner.removeLeafNode(leaf.nodeId,'APP-A',leaf.parentNodeId)).rejects.toThrow('transport timeout')
    expect(firstOwner.hasUnconfirmedSave).toBe(true)
    firstScope.stop()

    expect(runtime?.destroyed).toBe(false)
    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try {
      await expect(second.openEditingProject({projectId:'APP-A'},{force:true})).resolves.toBe(true)
      httpFns.scopeToken='different-auth-context'
      expect((await import('@/lowcode/lowcode-runtime')).lowcodeApi.readRequestScope().token).toBe('different-auth-context')
      await expect(second.loadBlueprintWorkspaceDataView()).rejects.toThrow('认证请求作用域已变化')
      httpFns.scopeToken='fixture-token'
      const recoveredOwner=await second.loadBlueprintWorkspaceDataView()
      expect(recoveredOwner).toBe(firstOwner)
      expect(second.blueprintPageRuntime.value).toBe(runtime)
      expect(recoveredOwner.dataSet).toBe(fixture.dataSet)
      expect(recoveredOwner.hasUnconfirmedSave).toBe(true)
      expect(fixture.save).toHaveBeenCalledTimes(1)
      await recoveredOwner.save()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(recoveredOwner.hasUnconfirmedSave).toBe(false)
      expect((await recoveredOwner.loadProjectTree()).children?.some(item=>item.nodeId===leaf.nodeId)).toBe(false)
    } finally {secondScope.stop()}
  })

  it('删除请求未 settle 时 teardown 保留 owner，回执未知后新 scope 只核验原命令',async()=>{
    const leaf={...node('LEAF-INFLIGHT-SCOPE','in-flight 删除叶子','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const nativeSave=fixture.save.getMockImplementation()!
    let accepted!:()=>void,settle!:()=>void
    const acceptedPromise=new Promise<void>(resolve=>{accepted=resolve})
    const settlePromise=new Promise<void>(resolve=>{settle=resolve})
    fixture.save.mockImplementation(async command=>{
      try{return await nativeSave(command)}catch(error){accepted();await settlePromise;throw error}
    })
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    const owner=await first.loadBlueprintWorkspaceDataView(),runtime=first.blueprintPageRuntime.value
    await owner.loadProjectTree()
    const deletion=owner.removeLeafNode(leaf.nodeId,'APP-A',leaf.parentNodeId)
    await acceptedPromise
    expect(owner.isBusy).toBe(true)
    // Model the narrow acceptance window where mutation state is active before
    // pending/dirty receipt bookkeeping becomes visible to the shell.
    vi.spyOn(owner,'dirty','get').mockReturnValue(false)
    vi.spyOn(owner,'hasPendingBlueprintCommand','get').mockReturnValue(false)
    firstScope.stop()
    expect(runtime?.destroyed).toBe(false)

    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try{
      await second.openEditingProject({projectId:'APP-A'},{force:true})
      const recovered=await second.loadBlueprintWorkspaceDataView()
      expect(recovered).toBe(owner)
      expect(second.blueprintPageRuntime.value).toBe(runtime)
      expect(recovered.isBusy).toBe(true)
      expect(fixture.save).toHaveBeenCalledOnce()
      settle()
      await expect(deletion).rejects.toThrow('transport timeout')
      expect(recovered.hasUnconfirmedSave).toBe(true)
      await recovered.save()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls.map(call=>call[0].changes[0]?.changes.deleted?.map(row=>row['rowid']))).toEqual([
        ['LEAF-INFLIGHT-SCOPE'],['LEAF-INFLIGHT-SCOPE'],
      ])
      expect(recovered.hasUnconfirmedSave).toBe(false)
      expect((await recovered.loadProjectTree()).children?.some(item=>item.nodeId===leaf.nodeId)).toBe(false)
    }finally{settle();secondScope.stop()}
  })

  it('clean scope teardown 释放 owner，且不同项目 acquire 不串用 DataSet',async()=>{
    const opened:DataSet[]=[]
    blueprintRuntime.load.mockImplementation(async ({projectId,scenarioId}:{projectId:string;scenarioId:string})=>{
      if(scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID)return createDataSpaceCatalogRuntimeDataSet()
      const next=createBlueprintRuntimeDataSet(projectId).dataSet;opened.push(next);return next
    })
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    const firstOwner=await first.loadBlueprintWorkspaceDataView(),firstRuntime=first.blueprintPageRuntime.value
    firstScope.stop()
    expect(firstRuntime?.destroyed).toBe(true)

    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try{
      await second.openEditingProject({projectId:'APP-A'},{force:true})
      const sameProjectOwner=await second.loadBlueprintWorkspaceDataView()
      expect(sameProjectOwner).not.toBe(firstOwner)
      expect(second.blueprintPageRuntime.value).not.toBe(firstRuntime)
      expect(sameProjectOwner.dataSet).not.toBe(opened[0])
      await expect(second.openEditingProject({projectId:'APP-B'},{force:true})).resolves.toBe(true)
      const otherProjectOwner=await second.loadBlueprintWorkspaceDataView()
      expect(otherProjectOwner.projectId).toBe('APP-B')
      expect(otherProjectOwner).not.toBe(sameProjectOwner)
      expect(otherProjectOwner.dataSet).not.toBe(sameProjectOwner.dataSet)
    }finally{secondScope.stop()}
  })

  it('同项目 SPA scope 重叠时拒绝第二个活动 owner lease，旧 scope 清理后可重新 acquire',async()=>{
    const ownerScope=effectScope(),ownerState=ownerScope.run(()=>useDevState())!
    await ownerState.openEditingProject({projectId:'APP-A'},{force:true})
    const original=await ownerState.loadBlueprintWorkspaceDataView()
    const overlappingScope=effectScope(),overlapping=overlappingScope.run(()=>useDevState())!
    try{
      await overlapping.openEditingProject({projectId:'APP-A'},{force:true})
      await expect(overlapping.loadBlueprintWorkspaceDataView()).rejects.toThrow('DEV_SYSTEM_OWNER_LEASE_ACTIVE')
    }finally{overlappingScope.stop()}
    ownerScope.stop()
    const nextScope=effectScope(),next=nextScope.run(()=>useDevState())!
    try{
      await next.openEditingProject({projectId:'APP-A'},{force:true})
      const acquired=await next.loadBlueprintWorkspaceDataView()
      expect(acquired).not.toBe(original)
    }finally{nextScope.stop()}
  })

  it('普通叶子删除明确保存失败时保留 pending-delete 并可沿同一 DataSet 重试', async () => {
    const leaf={...node('LEAF-FAIL','保存失败叶子','','APP-A'),kind:'module' as const}
    const root=blueprintRoot([leaf],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true},false,true)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try {
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      const owner=await state.loadBlueprintWorkspaceDataView()
      await owner.loadProjectTree()
      state.removeNodeById(leaf.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true))
      expect(fixture.save).toHaveBeenCalledTimes(1)
      expect(owner.view.dirtyTracking.hasPendingChanges('LEAF-FAIL')).toBe(true)
      expect(owner.dirty).toBe(true)

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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprint()
      pageFiles.files.set('mounted-page/rule.json','[]')
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      state.removeNodeById(mounted.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除'))).toBe(true))
      expect('deleteNode' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      expect(httpFns.delete).not.toHaveBeenCalled()
      expect(fixture.save).toHaveBeenCalled()
    } finally {ownerScope.stop()}
  })

  it('mounted page delete commits every listed filename through formal ProjectToolFile views',async()=>{
    const mounted=node('MOUNTED-COMPLETE','完整目录挂载页','cfg:complete-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    for(const [name,text] of [['rule.json','{}'],['script.js','script'],['style.css','style'],['4__script.js','snapshot'],['extra-template.txt','extra']] as const){
      pageFiles.files.set(`complete-page/${name}`,text)
    }
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      const dataSet=fixture.dataSet,save=vi.spyOn(dataSet,'saveChanges')
      state.removeNodeById(mounted.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('已删除'))).toBe(true))
      const fileCommits=save.mock.calls.flatMap(([request])=>request?.views??[]).filter(view=>view.tableName==='ProjectToolFile')
      expect(fileCommits,JSON.stringify(state.statusMessages.value)).toHaveLength(5)
      expect(dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('complete-page/'))).toBe(false)
    }finally{ownerScope.stop()}
  })

  it.each([
    ['权限不足',false,false,'APP-A'],
    ['目标有子节点',true,true,'APP-A'],
    ['项目身份错配',true,false,'OTHER-PROJECT'],
  ])('挂载页面删除在%s时拒绝且不删除文件',async(_label,deleteAllowed,hasChild,targetProject)=>{
    const child={...node('MOUNTED-CHILD','子页面','','APP-A'),kind:'module' as const}
    const mounted={...node('MOUNTED-GUARD','挂载页面','cfg:guard-page',targetProject),kind:'module' as const,...(hasChild?{children:[child]}:{})}
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed})
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('guard-page/rule.json','{}')
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      state.removeNodeById('OTHER-PROJECT')
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      state.removeNodeById(mounted.nodeId)
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      state.removeNodeById(mounted.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>/部分成功|蓝图.*已删除.*文件/.test(item.text))).toBe(true))
      const fileViews=fixture.dataSet.getTable('ProjectToolFile')?.viewList.filter(view=>view.queryContext['pageId']==='partial-page')??[]
      expect(fileViews.length).toBeGreaterThan(0)
      expect(fixture.save).toHaveBeenCalled()
      expect(state.statusMessages.value.some(item=>item.text.includes('部分成功'))).toBe(true)
      await expect(state.openEditingProject({projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(pageFiles.remove.mock.calls,JSON.stringify(state.statusMessages.value)).toHaveLength(2)
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
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.loadBlueprintWorkspaceDataView().then(owner=>owner.loadProjectTree())
      expect('removeMountedPage' in getAppProjectBlueprintWorkspace({projectId:'APP-A'})).toBe(false)
      state.removeNodeById(mounted.nodeId)
      await vi.waitFor(()=>expect(state.statusMessages.value.some(item=>item.text.includes('删除节点失败'))).toBe(true))
      expect([...pageFiles.files.keys()]).toContain('unknown-page/rule.json')
      expect(pageFiles.remove).not.toHaveBeenCalled()
      expect(fixture.save.mock.calls[0]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['MOUNTED-UNKNOWN'])
      await expect(state.openEditingProject({projectId:'OTHER-PROJECT'},{force:true})).resolves.toBe(false)
      await state.saveAll()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(fixture.save.mock.calls[1]?.[0].changes[0]?.changes.deleted?.map(row=>row['rowid'])).toEqual(['MOUNTED-UNKNOWN'])
      expect(pageFiles.remove).toHaveBeenCalledTimes(1)
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('unknown-page/'))).toBe(false)
    }finally{ownerScope.stop()}
  })

  it('挂载删除跨 scope teardown 保留原双阶段 saga 与文件命令 owner',async()=>{
    const mounted=node('MOUNTED-SCOPE-RECOVERY','待恢复挂载页','cfg:scope-delete-page','APP-A')
    const root=blueprintRoot([mounted],'APP-A'),fixture=createBlueprintRuntimeDataSet('APP-A',root,{deleteAllowed:true})
    mockBlueprintScenarioFixture(fixture.dataSet)
    pageFiles.files.set('scope-delete-page/rule.json','{}')
    pageFiles.remove.mockRejectedValueOnce(Error('temporary file delete failure'))
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    const owner=await first.loadBlueprintWorkspaceDataView(),runtime=first.blueprintPageRuntime.value
    await owner.loadProjectTree()
    first.removeNodeById(mounted.nodeId)
    await vi.waitFor(()=>expect(first.statusMessages.value.some(item=>item.text.includes('部分成功'))).toBe(true))
    const directoryView=fixture.dataSet.getTable('ProjectToolFile')?.viewList.find(view=>String(view.viewId).startsWith('directory-'))
    expect(directoryView).toBeDefined()
    firstScope.stop()
    expect(runtime?.destroyed).toBe(false)

    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try{
      await second.openEditingProject({projectId:'APP-A'},{force:true})
      const recovered=await second.loadBlueprintWorkspaceDataView()
      expect(recovered).toBe(owner)
      expect(second.blueprintPageRuntime.value).toBe(runtime)
      expect(fixture.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(fixture.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
      await second.saveAll()
      expect(pageFiles.remove).toHaveBeenCalledTimes(2)
      expect([...pageFiles.files.keys()].some(key=>key.startsWith('scope-delete-page/'))).toBe(false)
    }finally{secondScope.stop()}
  })

  it('缺失 script/style 时 fail-fast，不静默写入空文档', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    pageFiles.files.set('demo/rule.json','[]')

    await expect(ensureDevStateActivePageLoaded(state, { forceReload: true })).rejects.toThrow('FILE_RESOURCE_MISSING')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('缺失 rule/pagedata 时 fail-fast，不创建占位模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    pageFiles.files.set('demo/script.js','script')
    pageFiles.files.set('demo/style.css','style')

    await expect(ensureDevStateActivePageLoaded(state)).rejects.toThrow('FILE_RESOURCE_MISSING')

    expect(state.project.getActivePage()?.isLoaded).toBe(false)
  })

  it('通过正式 ProjectToolFile DataView 恢复版本并回读同一文件行', async () => {
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','working baseline');pageFiles.files.set('demo/style.css','.restored { color: red; }')
      await ensureDevStateActivePageLoaded(state)
      const page=state.project.getActivePage()!
      expect(page.pageId).toBe('demo')
      page.hydrateFileText('script.js','working baseline')
      const fileView=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'}),fileRow=fileView.currentRow,fileId=fileRow&&fileView.getPkKey(fileRow)
      if(fileId===null||fileId===undefined)throw new Error('fixture file row has no DataView identity')
      pageFiles.files.set('demo/4__script.js','restored text')
      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!
      const save=vi.spyOn(dataSet,'saveChanges')
      await expect(state.restorePageToolVersion({projectId:'APP-A',pageId:'demo',customPath:'APP-A/demo',fileName:'script.js',version:4,assertCurrent:()=>{}}))
        .resolves.toBe('restored text')
      expect(save).toHaveBeenCalledWith({views:[{tableName:'ProjectToolFile',viewId:'page-demo-script.js',ids:[fileId]}]})
      expect(state.readPageToolFileDataViewText('demo','script.js')).toBe('restored text')
      expect(pageFiles.files.get('demo/script.js')).toBe('restored text')
      expect(isDevStatePageDocumentDirty(state,'script.js')).toBe(false)
      expect(pageFiles.files.get('demo/4__script.js')).toBe('restored text')
      expect('restoreRemotePageVersion' in state.editor).toBe(false)
      pageFiles.files.set('demo/5__script.js','second restored text')
      pageFiles.upload.mockImplementationOnce(async(command:{pageId:string;fileName:string;text:string})=>{
        pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)
        await fileView.editRowById(fileId,{text:'new local edit'})
        state.stagePageToolFileDataView({pageId:'demo',fileName:'script.js',text:'new local edit'})
      })
      await expect(state.restorePageToolVersion({projectId:'APP-A',pageId:'demo',customPath:'APP-A/demo',fileName:'script.js',version:5,assertCurrent:()=>{}}))
        .rejects.toThrow('PAGE_TOOL_RESTORE_REMOTE_CONFIRMED_LOCAL_CHANGED')
      expect(pageFiles.files.get('demo/script.js')).toBe('second restored text')
      expect(state.readPageToolFileDataViewText('demo','script.js')).toBe('new local edit')
      expect(isDevStatePageDocumentDirty(state,'script.js')).toBe(true)
    }finally{ownerScope.stop()}
  })

  it('确认后 UI 目标变更时保留恢复回执，SPA 重开后回读原文件 DataView', async () => {
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet,()=>createBlueprintRuntimeDataSet('APP-A',root).dataSet)
    const firstScope=effectScope(),first=firstScope.run(()=>useDevState())!
    await first.openEditingProject({projectId:'APP-A'},{force:true})
    await first.selectNode(first.treeData.value[0]!)
    pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
    pageFiles.files.set('demo/script.js','working baseline');pageFiles.files.set('demo/style.css','')
    await ensureDevStateActivePageLoaded(first)
    const page=first.project.getActivePage()!,runtime=first.blueprintPageRuntime.value!
    page.hydrateFileText('script.js','working baseline');pageFiles.files.set('demo/4__script.js','restored text')
    const dataSet=runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!,save=dataSet.saveChanges.bind(dataSet)
    let uiCurrent=true
    vi.spyOn(dataSet,'saveChanges').mockImplementation(async command=>{
      const result=await save(command)
      if(command?.views?.some(view=>view.tableName==='ProjectToolFile'))uiCurrent=false
      return result
    })
    const input={projectId:'APP-A',pageId:'demo',customPath:'APP-A/demo',fileName:'script.js' as const,version:4,
      assertCurrent:()=>{if(!uiCurrent)throw new Error('UI target switched')}}
    await expect(first.restorePageToolVersion(input)).rejects.toThrow('UI target switched')
    expect(first.readPageToolFileDataViewText('demo','script.js')).toBe('restored text')
    expect(pageFiles.files.get('demo/script.js')).toBe('restored text')
    expect(first.hasPendingDevSystemWrite()).toBe(false)
    firstScope.stop()
    expect(runtime.destroyed).toBe(true)

    const secondScope=effectScope(),second=secondScope.run(()=>useDevState())!
    try{
      await second.openEditingProject({projectId:'APP-A'},{force:true})
      const owner=await second.loadBlueprintWorkspaceDataView()
      expect(owner.dataSet).not.toBe(dataSet)
      await second.selectNode(second.treeData.value[0]!)
      expect(second.project.getActivePage()).toBe(page)
      await second.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      expect(second.readPageToolFileDataViewText('demo','script.js')).toBe('restored text')
      expect(pageFiles.files.get('demo/script.js')).toBe('restored text')
      expect(second.hasPendingDevSystemWrite()).toBe(false)
    }finally{secondScope.stop()}
  })

  it('拒绝恢复到脏文件或保存回执未知的文件', async () => {
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const ownerScope=effectScope(),state=ownerScope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','.restored { color: red; }')
      await ensureDevStateActivePageLoaded(state)
      const page=state.project.getActivePage()!
      page.hydrateFileText('script.js','baseline');pageFiles.files.set('demo/1__script.js','snapshot')
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'}),row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture file row has no DataView identity')
      await view.editRowById(id,{text:'dirty'})
      state.stagePageToolFileDataView({pageId:'demo',fileName:'script.js',text:'dirty'})
      await expect(state.restorePageToolVersion({projectId:'APP-A',pageId:'demo',customPath:'APP-A/demo',fileName:'script.js',version:1,assertCurrent:()=>{}}))
        .rejects.toThrow('PAGE_TOOL_RESTORE_LOCAL_PENDING')
      pageFiles.upload.mockImplementationOnce(async(command:{pageId:string;fileName:string;text:string})=>{
        pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)
        const error=Object.assign(new Error('timeout after accept'),{name:'RequestError',config:{url:'/upload'}})
        throw error
      })
      await expect(state.savePageToolFile({pageId:'demo',fileName:'script.js'})).rejects.toThrow('timeout after accept')
      await expect(state.restorePageToolVersion({projectId:'APP-A',pageId:'demo',customPath:'APP-A/demo',fileName:'script.js',version:1,assertCurrent:()=>{}}))
        .rejects.toThrow('PAGE_TOOL_RESTORE_LOCAL_PENDING')
      expect(pageFiles.upload).toHaveBeenCalledOnce()
    }finally{ownerScope.stop()}
  })

  it('uses the DataView and DataSet save chain without a PageTool file owner facade',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','before');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const page=state.project.getActivePage()!;page.hydrateFileText('script.js','before')
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture file row has no DataView identity')
      await view.editRowById(id,{text:'submitted'})
      state.stagePageToolFileDataView({pageId:'demo',fileName:'script.js',text:'submitted'})
      expect(state.readPageToolFileDataViewText('demo','script.js')).toBe('submitted')
      expect(view.dirtyTracking.getOriginal(id)?.['text']).toBe('before')
      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!,save=vi.spyOn(dataSet,'saveChanges')
      await state.savePageToolFile({pageId:'demo',fileName:'script.js'})
      expect(save).toHaveBeenCalledWith({views:[{tableName:'ProjectToolFile',viewId:'page-demo-script.js',ids:[id]}]})
      expect(pageFiles.files.get('demo/script.js')).toBe('submitted')
      expect(state.readPageToolFileDataViewText('demo','script.js')).toBe('submitted')
    }finally{scope.stop()}
  })

  it('keeps script and style drafts in separate file DataViews and saves each exact change',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','script baseline');pageFiles.files.set('demo/style.css','style baseline')
      await ensureDevStateActivePageLoaded(state)
      const page=state.project.getActivePage()!
      page.hydrateFileText('script.js','script baseline');page.hydrateFileText('style.css','style baseline')

      const scriptView=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const scriptRow=scriptView.currentRow,scriptId=scriptRow&&scriptView.getPkKey(scriptRow)
      if(scriptId===null||scriptId===undefined)throw new Error('fixture script row has no DataView identity')
      await scriptView.editRowById(scriptId,{text:'script edited'})
      state.stagePageToolFileDataView({pageId:'demo',fileName:'script.js',text:'script edited'})

      const styleView=await state.loadPageToolFileDataView({pageId:'demo',fileName:'style.css'})
      const styleRow=styleView.currentRow,styleId=styleRow&&styleView.getPkKey(styleRow)
      if(styleId===null||styleId===undefined)throw new Error('fixture style row has no DataView identity')
      await styleView.editRowById(styleId,{text:'style edited'})
      state.stagePageToolFileDataView({pageId:'demo',fileName:'style.css',text:'style edited'})

      expect(scriptView).not.toBe(styleView)
      expect(scriptView.viewId).toBe('page-demo-script.js')
      expect(styleView.viewId).toBe('page-demo-style.css')
      expect(scriptView.getEditingRow(scriptId)?.['text']).toBe('script edited')
      expect(styleView.getEditingRow(styleId)?.['text']).toBe('style edited')
      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!,save=vi.spyOn(dataSet,'saveChanges')
      await state.savePageToolFile({pageId:'demo',fileName:'script.js'})
      await state.savePageToolFile({pageId:'demo',fileName:'style.css'})
      expect(save).toHaveBeenNthCalledWith(1,{views:[{tableName:'ProjectToolFile',viewId:'page-demo-script.js',ids:[scriptId]}]})
      expect(save).toHaveBeenNthCalledWith(2,{views:[{tableName:'ProjectToolFile',viewId:'page-demo-style.css',ids:[styleId]}]})
      expect(pageFiles.files.get('demo/script.js')).toBe('script edited')
      expect(pageFiles.files.get('demo/style.css')).toBe('style edited')
    }finally{scope.stop()}
  })

  it('Save All independently submits a node DataView draft and the changed file DataView only',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','before');pageFiles.files.set('demo/style.css','unchanged')
      await ensureDevStateActivePageLoaded(state)
      const owner=await state.loadBlueprintWorkspaceDataView()
      owner.update('memo','node change')
      state.markBlueprintDirty()
      const fileView=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const fileId=fileView.currentRow&&fileView.getPkKey(fileView.currentRow)
      if(fileId===null||fileId===undefined)throw new Error('fixture file row has no DataView identity')
      await fileView.editRowById(fileId,{text:'file change'})
      state.stagePageToolFileDataView({pageId:'demo',fileName:'script.js',text:'file change'})
      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!,save=vi.spyOn(dataSet,'saveChanges')
      await state.saveAll()
      expect(save.mock.calls.some(([command])=>command?.views?.some(view=>view.tableName==='ProjectToolFile'&&view.viewId==='page-demo-script.js'))).toBe(true)
      expect(pageFiles.files.get('demo/script.js')).toBe('file change')
      expect(pageFiles.upload.mock.calls.filter(([command])=>command.fileName==='script.js')).toHaveLength(1)
      expect(pageFiles.upload.mock.calls.some(([command])=>command.fileName==='rule.json'||command.fileName==='style.css')).toBe(false)
      expect(state.statusMessages.value[0]?.text,JSON.stringify({dirty:state.project.readDirtyProjection(),scenarios:state.editor.dirtyScenarioIds,files:dataSet.getTable('ProjectToolFile')?.viewList.map(view=>({id:view.viewId,dirty:view.dirtyTracking.hasPendingChanges(),editing:view.hasEditingChanges(),unknown:view.hasUnconfirmedSave}))})).toBe('全部保存已确认')
    }finally{scope.stop()}
  })

  it('未绑定的 PageTool 仅保留已确认投影且不能产生本地草稿',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','saved baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const page=state.project.getActivePage()!
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!,save=vi.spyOn(dataSet,'saveChanges')
      page.unbindCleanFileDataViews()

      expect(()=>page.setFileText('script.js','unbound draft')).toThrow('PAGE_TOOL_FILE_VIEW_REQUIRED')

      const row=view.currentRow,id=row&&view.getPkKey(row)
      expect(id).toBeDefined()
      expect(view.hasEditingChanges()).toBe(false)
      expect(save).not.toHaveBeenCalled()
      expect(pageFiles.files.get('demo/script.js')).toBe('saved baseline')
      expect(page.getFileText('script.js')).toBe('saved baseline')
    }finally{scope.stop()}
  })

  it('每次 AI setFileText 都先进入正式文件 DataView，并由 Save All 提交后重开读回',async()=>{
    const pageNode=node('demo-node','Demo','cfg:demo','APP-A','AI planning')
    pageNode.source={implGate:'open',upstreamContractsSatisfied:true}
    const root=blueprintRoot([pageNode],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    let releaseRun:()=>void=()=>undefined
    let releaseUpload:()=>void=()=>undefined
    let running:Promise<void>|undefined
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      state.project.replaceBlueprintTree(root,{selectedNodeId:'demo-node'})
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture script row has no DataView identity')
      let signalEdit:()=>void=()=>undefined
      const editReached=new Promise<void>(resolve=>{signalEdit=resolve})
      const runGate=new Promise<void>(resolve=>{releaseRun=resolve})
      pageDesignAiRun.run.mockImplementationOnce(async()=>{
        state.project.openPageDesign('demo').setFileText('script.js','AI script')
        signalEdit()
        await runGate
        return 'completed'
      })

      running=state.runPageDesignAi({description:'更新脚本'})
      await Promise.race([editReached,running.then(()=>{
        throw new Error(`PageDesign run ended before the adapter edit: ${state.statusMessages.value.map(message=>message.text).join(' | ')}`)
      })])
      expect(view.getEditingRow(id)?.['text']).toBe('AI script')
      expect(view.hasEditingChanges(id)).toBe(true)
      releaseRun()
      await running

      const dataSet=state.blueprintPageRuntime.value!.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!
      const save=vi.spyOn(dataSet,'saveChanges')
      let signalUpload:()=>void=()=>undefined
      const uploadStarted=new Promise<void>(resolve=>{signalUpload=resolve})
      const uploadGate=new Promise<void>(resolve=>{releaseUpload=resolve})
      pageFiles.upload.mockImplementationOnce(async command=>{signalUpload();await uploadGate;pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text)})
      const firstSave=state.saveAll()
      await uploadStarted
      state.project.openPageDesign('demo').setFileText('script.js','AI next script')
      releaseUpload()
      await firstSave
      expect(pageFiles.upload.mock.calls.filter(([command])=>command.pageId==='demo'&&command.fileName==='script.js')).toHaveLength(1)
      expect(save.mock.calls.some(([command])=>command?.views?.some(target=>target.tableName==='ProjectToolFile'&&target.viewId==='page-demo-script.js'))).toBe(true)
      expect(pageFiles.files.get('demo/script.js')).toBe('AI script')
      expect(view.getEditingRow(id)?.['text']).toBe('AI next script')
      expect(view.hasEditingChanges(id)).toBe(true)
      await state.saveAll()
      expect(pageFiles.upload.mock.calls.filter(([command])=>command.pageId==='demo'&&command.fileName==='script.js')).toHaveLength(2)
      const reopened=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js',forceReload:true})
      expect(reopened.currentRow?.['text']).toBe('AI next script')
      expect(pageFiles.files.get('demo/script.js')).toBe('AI next script')
    }finally{
      releaseUpload()
      releaseRun()
      await running
      scope.stop()
    }
  })

  it('AI 文件上传已接受但回读未知时，Save All 重试核验原 DataView attempt 且不重复上传',async()=>{
    const pageNode=node('demo-node','Demo','cfg:demo','APP-A','AI planning')
    pageNode.source={implGate:'open',upstreamContractsSatisfied:true}
    const root=blueprintRoot([pageNode],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!);state.project.replaceBlueprintTree(root,{selectedNodeId:'demo-node'})
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture script row has no DataView identity')
      pageDesignAiRun.run.mockImplementationOnce(async()=>{state.project.openPageDesign('demo').setFileText('script.js','AI script');return 'completed'})
      await state.runPageDesignAi({description:'更新脚本'})
      expect(view.hasEditingChanges(id)).toBe(true)
      pageFiles.upload.mockImplementationOnce(async command=>{pageFiles.files.set(`${command.pageId}/${command.fileName}`,command.text);pageFiles.readFailures=1})

      await state.saveAll()

      expect(pageFiles.upload.mock.calls.filter(([command])=>command.pageId==='demo'&&command.fileName==='script.js'),JSON.stringify({calls:pageFiles.upload.mock.calls,status:state.statusMessages.value.map(item=>item.text)})).toHaveLength(1)
      expect(pageFiles.files.get('demo/script.js')).toBe('AI script')
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id)).toBe(true)
      expect(state.project.openPageDesign('demo').isFileDirty('script.js')).toBe(true)
      const adapterRuns=pageDesignAiRun.run.mock.calls.length

      await state.saveAll()

      expect(pageDesignAiRun.run).toHaveBeenCalledTimes(adapterRuns)
      expect(pageFiles.upload.mock.calls.filter(([command])=>command.pageId==='demo'&&command.fileName==='script.js')).toHaveLength(1)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(view.hasEditingChanges(id)).toBe(false)
      expect(state.project.openPageDesign('demo').isFileDirty('script.js')).toBe(false)
      expect(state.project.openPageDesign('demo').getFileText('script.js')).toBe('AI script')
    }finally{scope.stop()}
  })

  it('退出再回到相同 app/page 后，旧 AI 运行不能借新绑定写入',async()=>{
    const pageNode=node('demo-node','Demo','cfg:demo','APP-A','AI planning')
    pageNode.source={implGate:'open',upstreamContractsSatisfied:true}
    const root=blueprintRoot([pageNode],'APP-A')
    blueprintRuntimeTrees.set('APP-A',root)
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet,()=>createBlueprintRuntimeDataSet('APP-A',root).dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    let getRunEditor:((context:{moduleInstanceId:string})=>ProjectWorkspace)|undefined
    let signalRun:()=>void=()=>undefined,releaseRun:()=>void=()=>undefined
    const runReached=new Promise<void>(resolve=>{signalRun=resolve})
    const runGate=new Promise<void>(resolve=>{releaseRun=resolve})
    let runError:unknown
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      state.project.replaceBlueprintTree(root,{selectedNodeId:'demo-node'})
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      pageDesignWorkflow.activate.mockImplementationOnce(async options=>{
        getRunEditor=(options as typeof options & {getPageDesignEditor:(context:{moduleInstanceId:string})=>ProjectWorkspace}).getPageDesignEditor
        return options.host
      })
      pageDesignAiRun.run.mockImplementationOnce(async()=>{
        const editor=getRunEditor?.({moduleInstanceId:'request-aba'})
        const context=readPageDesignRunContext('request-aba')
        if(!editor||!context?.assertCurrent)throw new Error('PageDesign run context did not capture its editor guard')
        const guarded=guardPageDesignEditor(editor,context.allowedOperations,context.assertCurrent)
        try{await guarded.project.editNodeTree(async tree=>{
          signalRun()
          await runGate
          tree.replaceRoot({type:'spark-page',id:'spark-page-root',children:[{type:'r-text',id:'stale-ai-node',props:{label:'stale'}}]})
        })}
        catch(error){runError=error}
        return 'completed'
      })
      const running=state.runPageDesignAi({requestId:'request-aba',description:'编辑脚本'})
      await runReached
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      state.project.setActivePage('demo')
      const currentView=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const currentRow=currentView.currentRow,currentId=currentRow&&currentView.getPkKey(currentRow)
      if(currentId===null||currentId===undefined)throw new Error('reopened script row has no DataView identity')
      releaseRun()
      await running

      expect(runError).toBeInstanceOf(Error)
      expect(String(runError)).toMatch(/PAGE_TOOL_FILE_VIEW_STALE/)
      expect(currentView.hasEditingChanges(currentId)).toBe(false)
      expect(currentView.getEditingRow(currentId)?.['text']).toBe('baseline')
    }finally{releaseRun();scope.stop()}
  })

  it('editNodeTree 成功时把序列化规则写入正式文件 DataView 行',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'rule.json'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture rule row has no DataView identity')

      await state.project.editNodeTree(tree=>tree.replaceRoot({type:'spark-page',id:'spark-page-root',children:[
        {type:'r-text',id:'ai-node',props:{label:'AI rule'}},
      ]}))

      expect(JSON.parse(String(view.getEditingRow(id)?.['text']))).toMatchObject({type:'r-text',props:{label:'AI rule'}})
      expect(view.hasEditingChanges(id)).toBe(true)
    }finally{scope.stop()}
  })

  it('editNodeTree 回调抛错时不污染正式文件 DataView 行',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'rule.json'})
      const row=view.currentRow,id=row&&view.getPkKey(row),baseline=row?.['text']
      if(id===null||id===undefined||typeof baseline!=='string')throw new Error('fixture rule row has no DataView identity')
      const page=state.project.openPageDesign('demo')
      const pageBaseline=JSON.parse(page.getFileText('rule.json')) as unknown

      await expect(state.project.editNodeTree(tree=>{
        tree.replaceRoot({type:'spark-page',id:'spark-page-root',children:[{type:'r-text',props:{label:'rejected'}}]})
        throw new Error('tree edit rejected')
      })).rejects.toThrow('tree edit rejected')

      expect(view.getEditingRow(id)?.['text']??view.currentRow?.['text']).toBe(baseline)
      expect(view.hasEditingChanges(id)).toBe(false)
      expect(JSON.parse(page.getFileText('rule.json'))).toEqual(pageBaseline)
    }finally{scope.stop()}
  })

  it('editNodeTree 无语义变化时保留规则文件原文且不产生编辑覆盖',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      const original='[ ]'
      pageFiles.files.set('demo/rule.json',original);pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'rule.json'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture rule row has no DataView identity')

      await state.project.editNodeTree(()=>undefined)

      expect(view.getEditingRow(id)?.['text']).toBe(original)
      expect(view.currentRow?.['text']).toBe(original)
      expect(view.hasEditingChanges(id)).toBe(false)
      expect(state.project.openPageDesign('demo').getFileText('rule.json')).toBe(original)
    }finally{scope.stop()}
  })

  it('AI 文件字段只读时拒绝编辑且不留下 DataView 草稿',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture script row has no DataView identity')
      const originalFieldAccess=view.fieldAccess.bind(view)
      vi.spyOn(view,'fieldAccess').mockImplementation((target,field)=>field==='text'
        ?{...originalFieldAccess(target,field),read:'invisible',write:'denied'}
        :originalFieldAccess(target,field))

      const page=state.project.openPageDesign('demo')
      expect(()=>page.getFileText('script.js')).toThrow(/FIELD|READ|可读|隐藏/i)
      expect(()=>page.setFileText('script.js','unauthorized edit')).toThrow(/FIELD|WRITE|授权|只读/i)
      page.unbindCleanFileDataViews()
      expect(()=>page.getFileText('script.js')).toThrow(/FIELD|READ|可读|隐藏/i)
      expect(view.getEditingRow(id)?.['text']).toBe('baseline')
      expect(view.hasEditingChanges(id)).toBe(false)
    }finally{scope.stop()}
  })

  it('绑定身份失效时不把仍存在的 DataView 编辑覆盖报告为 clean',async()=>{
    const root=blueprintRoot([node('demo-node','Demo','cfg:demo','APP-A')],'APP-A')
    const fixture=createBlueprintRuntimeDataSet('APP-A',root)
    mockBlueprintScenarioFixture(fixture.dataSet)
    const scope=effectScope(),state=scope.run(()=>useDevState())!
    try{
      await state.openEditingProject({projectId:'APP-A'},{force:true})
      await state.selectNode(state.treeData.value[0]!)
      pageFiles.files.set('demo/rule.json','[]');pageFiles.files.set('demo/pagedata.json','{"dataSetName":"TestDS","tables":{}}')
      pageFiles.files.set('demo/script.js','baseline');pageFiles.files.set('demo/style.css','')
      await ensureDevStateActivePageLoaded(state)
      const view=await state.loadPageToolFileDataView({pageId:'demo',fileName:'script.js'})
      const row=view.currentRow,id=row&&view.getPkKey(row)
      if(id===null||id===undefined)throw new Error('fixture script row has no DataView identity')
      const page=state.project.openPageDesign('demo')
      page.setFileText('script.js','pending edit')
      expect(view.hasEditingChanges(id)).toBe(true)
      view.queryContext={...view.queryContext,pageId:'other-page'}

      expect(()=>page.isDirty()).toThrow(/IDENTITY|身份|target/i)
      expect(view.hasEditingChanges(id)).toBe(true)
    }finally{scope.stop()}
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

  it('可打开其他应用模型编辑，保存时不刷新当前 APP 导航', async () => {
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

        state.projectPicker.projectId = 'delegated-app'

    await expect(state.openProjectPickerScope()).resolves.toBe(true)
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
