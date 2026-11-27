import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, ref, toRaw, watch, type Component } from 'vue'
import ElementPlus from 'element-plus'
import DataPlanningPane from '@/views/features/application/application-function-management/ui/blueprint-data-space/DataPlanningPane.vue'
import DevDataSetDesigner from '@/views/features/application/application-function-management/ui/blueprint-data-space/DevDataSetDesigner.vue'
import DevPreviewTab from '@/views/features/application/application-function-management/ui/page-design/DevPreviewTab.vue'
import DevFileEditor from '@/views/features/application/application-function-management/ui/page-design/DevFileEditor.vue'
import {useDevFileEditor} from '@/views/features/application/application-function-management/ui/page-design/useDevFileEditor'
import {usePageDesign} from '@/views/features/application/application-function-management/ui/page-design/use-page-design'
import ScenarioHistoryPanel from '@/views/features/data-platform/data-set-management/design/ui/ScenarioHistoryPanel.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {buildRuntimeDataSetPlanText, DataSet, DataSpaceApiError, type DataRow, type DataView, type DataViewSourceHistoryStatus} from '@spark-appworks/spark-data'
import {DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, Spark, useSparkComponent, useSparkConsume} from '@spark-appworks/spark-component'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY, LowcodeApiError } from '@/platform-adapters/api'
import {LowcodeDictionary} from '@/platform-adapters/resources/structured-config/dictionary/resource'
import {PageRuntime, ScenarioDefinitionResource, type ProjectWorkspace} from '@spark-appworks/spark-project-model'
import metadataConfig from '../../../config/pages/data-platform/data-space-design/pagedata.json'
import appConfig from '../../../config/pages/application/project-blueprint/pagedata.json'

vi.mock('@/services/sse-events', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/sse-events')>(),
  onPageConfigChange: () => () => {},
}))

const { httpGet, httpPost, httpPut, httpRequestFull, httpClearCache, httpInterceptors, readModels, previewLoad, previewCalls, savedVersions,
  scenarioVersions, scenarioCreateCalls, loseScenarioReceipt, designVersions, designWorking, readPlan, assemblePlan } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  readModels: vi.fn(),
  previewLoad: vi.fn(),
  readPlan: vi.fn(),
  assemblePlan: vi.fn(),
  previewCalls: new Map<string, {target: string; main: string; publish?: boolean; failReadback?: boolean; loseReceipt?: boolean; rejectPointer?: boolean}>(),
  savedVersions: new Map<string,string>(),
  scenarioVersions: new Map<string,Map<number,string>>(),
  scenarioCreateCalls: new Array<string>(),
  loseScenarioReceipt: new Set<string>(),
  designVersions: new Map<string,string>(),
  designWorking: new Map<string,string>(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpRequestFull: vi.fn(),
  httpClearCache: vi.fn(),
  httpInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

// This consumer fixture supplies C; the metadata chain suite verifies the production loader against formal records.
vi.mock('@/platform-adapters/data-space/lowcode-data-space-runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('@/platform-adapters/data-space/lowcode-data-space-runtime')>()),
  loadScenarioDataSet: previewLoad,
  assembleLowcodeRuntimeScenario: async (input: {scenarioId: string}) => {
    const result = await previewLoad(input) as {dataSet: DataSet}
    return result.dataSet
  },
  assembleLowcodeRuntimeDataSetPlan: assemblePlan,
  loadLowcodeRuntimeScenario: async ({ projectId, scenarioId }: { projectId: string; scenarioId: string }) => {
    if(scenarioId==='90A82E287930A234FEC3E687C94A93EA')return DataSet.fromJson({scenarioId,tables:{Base_DataSet:{
      modelBinding:{modelId:`${scenarioId}catalog`,modelName:'Base_DataSet'},
      columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'Name',type:'string'}],
      views:{default:{},catalog:{autoLoad:false,page:1,pageSize:10}},
    }}})
    if(scenarioId===LowcodeDictionary.editorScenarioId)return DataSet.fromJson({scenarioId,tables:{_Base_DictType:{
      modelBinding:{modelId:`${scenarioId}dictionary`,modelName:'_Base_DictType'},
      columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'Name',type:'string'}],views:{default:{}},
    }}})
    const fields = ['rowid', 'SysId', 'prowid', 'FunOrderValue', 'name', 'FunName', 'funCode', 'NavigationUrl', 'NavigationImageWxz',
      'MobileUrl', 'NavigationType', 'ChildItemLocation', 'NavigationShowType', 'HorizontalAlignment', 'IsShowAtNav', 'IsShowChildItem',
      'BeginGroup', 'conid', 'conType', 'memo', 'htmlDesc', 'VersionId', 'DifficultyFactor', 'Manhour', 'Number', 'Sum', 'Total',
      'personCharge', 'status']
    const dataSet = DataSet.fromJson({scenarioId, tables: {ProjectToolFile: appConfig.tables.ProjectToolFile, Base_NavigationInfo: {
      modelBinding: {modelId: `${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`, modelName: 'Base_NavigationInfo'},
      columns: fields.map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
      views: {default: {autoLoad: false}},
    }}})
    const view = dataSet.getView('Base_NavigationInfo')!
    const rows = ['orders-page-node', 'orders-page-v2-node', 'demo-node'].map(rowid => ({rowid, SysId: projectId,
      prowid: '000000', FunOrderValue: '0', name: rowid, FunName: rowid, conType: 'Model',conid:rowid==='orders-page-node'?'scene':''}))
    let failReadback = false
    const result = (matching: typeof rows) => ({
      rows: matching.map(row => {
        const call = previewCalls.get(row.rowid)
        return {...row, NavigationUrl: call?.target ?? `cfg:${row.rowid.replace(/-node$/, '')}`,
          conid: call?.main ?? row.conid, VersionId:savedVersions.get(row.rowid) ?? ''}
      }), total: matching.length,
      assertIdentity: (identity: {scenarioId: string; metaName: string}) => {
        if (identity.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || identity.metaName !== 'Base_NavigationInfo') throw new Error('blueprint identity mismatch')
      },
      rowKey: (row: Readonly<Record<string, unknown>>) => row['rowid'],
      prepareNewRow: (row: Readonly<Record<string, unknown>>) => ({...row, rowid: `new-${Date.now()}`}),
      fieldAccess: (row: unknown, field: string) => {
        const key = typeof row === 'object' && row !== null && 'rowid' in row ? row.rowid : row
        const writable = field === 'VersionId' && previewCalls.get(String(key))?.publish === true
        return {read:'visible' as const,write:writable?'allowed' as const:'denied' as const,
          component:writable?'editable' as const:'readonly' as const,required:false,writeMode:writable?'editable' as const:'readonly' as const}
      },
      readFieldAccess: (_row: Readonly<Record<string, unknown>>, _field: string) => 'visible' as const,
      addActionState: () => 'disabled' as const,
      editActionState: (rowKey: unknown) => previewCalls.get(String(rowKey))?.publish ? 'enabled' as const : 'disabled' as const,
      deleteActionState: () => 'disabled' as const,
      createChildActionState: () => 'disabled' as const,
      viewActionState: () => 'enabled' as const,
    })
    view.bindQueryExecutor({
      queryColumns: current => current.columns,
      executeQuery: async (_current, params) => {
        if (failReadback) {
          failReadback = false
          throw new Error('publication readback interrupted')
        }
        const filter = params.filter as {filters?: Array<{field?: string; value?: unknown}>} | undefined
        const matching = rows.filter(row => row.SysId === projectId && (filter?.filters ?? []).every(condition =>
          condition.field === undefined || String(row[condition.field as keyof typeof row] ?? '') === String(condition.value ?? '')))
        return result(matching)
      },
      save: async command => command.changes.map(change => {
        const changed = change.changes.changed ?? []
        for (const row of changed) {
          const id = String(row['rowid'])
          if (!previewCalls.get(id)?.publish || typeof row['VersionId'] !== 'string') throw new Error('unexpected pointer save')
          if (previewCalls.get(id)?.rejectPointer) throw new DataSpaceApiError(409, 'fixture formal pointer rejection')
          savedVersions.set(id, row['VersionId'])
          if (previewCalls.get(id)?.loseReceipt) throw new Error('publication receipt lost')
          if (previewCalls.get(id)?.failReadback) failReadback = true
        }
        return {metaName:change.identity.metaName, added:[], deleted:[], changed,
          changedFields:changed.map(row=>Object.keys(row)), context:result(rows)}
      }),
    })
    return dataSet
  },
  loadLowcodeScenarioDefinitions: async (workspace: ProjectWorkspace, scenarioId: string, assertCurrent: () => void) => {
    const models = await readModels() ?? [{id: 'orders-model', metaName: 'Orders'}]
    const definitions = Object.fromEntries(Object.entries(metadataConfig.tables).filter(([, table]) => 'resourceId' in table && table.resourceId.startsWith('pagedata:')))
    const dataSet = DataSet.fromJson({scenarioId: metadataConfig.scenarioId, tables: {...definitions, Base_DataModel: {
      resourceType: 'static-data', columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}, {name: 'dataSetId', type: 'string'}],
      views: {default: {autoLoad: false, rows: models.map((model: {id: string; metaName: string}) => ({rowid: model.id, Name: model.metaName, dataSetId: scenarioId}))}},
    }}})
    const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: metadataConfig.scenarioId,
      targetScenarioId: scenarioId, assertCurrent, validate: async () => {}})
    for (const name of Object.keys(definitions)) {
      const table = dataSet.getTable(name)!
      for (const view of table.viewList) {
        view.queryContext = {...view.queryContext, dataSpaceId: scenarioId}
        view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
      }
    }
    return dataSet
  },
}))

vi.mock('@/platform-adapters/lowcode-runtime', () => ({
  lowcodeHttp: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
    requestFull: httpRequestFull,
    clearCache: httpClearCache,
    interceptors: httpInterceptors,
  },
  lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => null,
  lowcodeApi: {
    session:{get:()=>({enterprise:{id:'ent',shortName:'tenant'},identity:{userId:'user'}})},
    readRequestScope:()=>({token:'scope',headers:{'X-AppId':'homepage'}}),
    dataSpace:{design:{readModels}},
    design:{readTextFile: ({fileName}: {fileName: string}) => readPlan(fileName)},
    platform: {},
  },
  createLowcodeProjectGateways: () => ({
    pageFiles: {
      saveFileContent: async (pageId: string, fileName: string, content: string) => {await httpPut(`designfile:homepage/${pageId}/${fileName}`, {content})},
      readPageFile: async (command: { pageId: string; fileName: string }) => {
        const response = await httpGet(`designfile:homepage/${command.pageId}/${command.fileName}`)
        return String(response?.content ?? '')
      },
    },
    blueprint: {},
    scenarioViews: {
      readScope:()=> 'scope',
      readText:async(scenarioId:string)=>{const content=(await httpGet(`scenario:${scenarioId}`)).content;return content === null ? null : String(content)},
      writeText:async(scenarioId:string,text:string)=>{await httpPut(`scenario:${scenarioId}`,{content:text})},
      listVersions:async(scenarioId:string)=>[...(scenarioVersions.get(scenarioId)?.keys()??[])].map(version=>({
        version,fileName:`${version}__pagedata.json`,lastModified:null,
      })),
      readVersion:async(scenarioId:string,version:number)=>{
        const text=scenarioVersions.get(scenarioId)?.get(version)
        if(text===undefined)throw new Error('scenario version missing')
        return text
      },
      createVersion:async(command: {scenarioId:string;version:number;text:string;
        onAttempt(attempt: {scenarioId:string;scope:string;version:number;fileName:string;text:string;resourceId:string}):void})=>{
        command.onAttempt({scenarioId:command.scenarioId,scope:'scope',version:command.version,
          fileName:`${command.version}__pagedata.json`,text:command.text,resourceId:`scenario:${command.scenarioId}`})
        const versions=scenarioVersions.get(command.scenarioId)??new Map<number,string>()
        scenarioCreateCalls.push(`${command.scenarioId}/${command.version}`)
        versions.set(command.version,command.text);scenarioVersions.set(command.scenarioId,versions)
        if (loseScenarioReceipt.delete(command.scenarioId)) throw new Error('scenario snapshot receipt lost')
        return {version:command.version,fileName:`${command.version}__pagedata.json`,lastModified:null}
      },
    },
    projectReferences: {
      listProjects: async () => [],
      loadProjectBlueprint: async () => ({ title: 'Test Project', children: [] }),
    },
  }),
  createPageToolFilesIo: () => ({
    list:async()=>['rule.json','script.js','style.css'],
    read:async(appId:string,pageId:string,fileName:string)=>{
      if(fileName==='publication-manifest.json')return designWorking.get(`${appId}/${pageId}/${fileName}`)??null
      const result=await httpGet(`designfile:${appId}/${pageId}/${fileName}`)
      return result?.content===undefined?null:String(result.content)
    },
    upload:async(command:{appId:string;pageId:string;fileName:string;text:string})=>{
      if(command.fileName==='publication-manifest.json'){
        designWorking.set(`${command.appId}/${command.pageId}/${command.fileName}`,command.text)
        return
      }
      try {await httpPut(`designfile:${command.appId}/${command.pageId}/${command.fileName}`,{content:command.text})}
      catch(error) {
        if(error instanceof Error) {error.name='RequestError';Object.assign(error,{config:{url:`/api/File/UploadFile`}})}
        throw error
      }
    },
    restoreWorkingFile:async(command:{appId:string;pageId:string;fileName:string;text:string})=>
      httpPut(`designfile:${command.appId}/${command.pageId}/${command.fileName}`,{content:command.text}),
    listVersions:async({appId,pageId,customPath,fileName}:{appId:string;pageId?:string;customPath:string;fileName:string})=>
      [...designVersions.entries()].filter(([key])=>key.startsWith(`${appId}/${pageId??customPath}/versions/${fileName}/`)).map(([key])=>({
        version:Number(key.split('/').at(-1)),fileName:`${key.split('/').at(-1)}__${fileName}`,lastModified:null,
      })),
    uploadVersion:async({appId,customPath,fileName,version,text}:{appId:string;customPath:string;fileName:string;version:number;text:string})=>{
      designVersions.set(`${appId}/${customPath}/versions/${fileName}/${version}`,text)
    },
    readVersion:async({appId,customPath,fileName,version}:{appId:string;customPath:string;fileName:string;version:number})=>
      designVersions.get(`${appId}/${customPath}/versions/${fileName}/${version}`)??null,
    remove:async()=>{},
  }),
}))

import { createDevStateWithConfigPages, ensureDevStateActivePageLoaded, isolateAppProjectWorkspaceForTest } from './dev-state-test-fixture'
import type { ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
const fixtureText=(pageSize:number)=>JSON.stringify({scenarioId:'scene',tables:{Orders:{modelBinding:{modelId:'orders-model',modelName:'Orders'},views:{default:{pageSize},detail:{}}}}})
function sceneNode():ProjectBlueprintTreeNodeData{return {nodeId:'orders-page-node',parentNodeId:'homepage_root',projectId:'homepage',kind:'page',capability:{name:'Orders'},navigation:{title:'Orders',target:'cfg:orders-page',order:0,publishInMenu:true,showChildren:true,beginGroup:false},dataSpace:{scenarioId:'scene',models:[{metaName:'Orders'}]},source:{}}}
async function selectPreviewNode(state:ReturnType<typeof createDevStateWithConfigPages>,target?:string,publish=false):Promise<void>{
 const node=sceneNode();delete node.dataSpace
 if(target)node.navigation!.target=target
 previewCalls.set(node.nodeId, {target:node.navigation!.target!,main:'',publish})
 state.project.replaceBlueprintChildren([node]);await state.selectNode(node)
}
function mountDesigner(options:{state:ReturnType<typeof createDevStateWithConfigPages>;shallow?:boolean;stubs?:Record<string,Component|boolean>}){
 const {state}=options
 const Host=defineComponent({setup(){
  const {sparkProvide,sparkRemove}=useSparkComponent({type:'scenario-designer-test-host'})
  watch(()=>state.blueprintPageRuntime.value,runtime=>{
   if(runtime?.isLoaded)sparkProvide(PAGE_RUNTIME,runtime);else sparkRemove(PAGE_RUNTIME)
  },{immediate:true})
  return ()=>h(DevDataSetDesigner,{state})
 }})
 return (options.shallow?shallowMount:mount)(Host,{global:{stubs:{DevDataSetDesigner:false,RendererForm:false,RendererHostScope:false,...options.stubs}}})
}
describe('tool and shared scenario editing owners',()=>{
 it.each([true,false])('keeps definition commands on their own DataView and row inside a node workspace (preloaded=%s)', async preloaded=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  if(preloaded)await state.loadSelectedScenarioViews()
  const nodeView=state.blueprintWorkspaceDataView.value!.view
  const observed:Array<{label:unknown;view:DataView|null;row:DataRow|null}> = []
  const BoundButton=defineComponent({inheritAttrs:false,setup(_props,{attrs}){
    const {sparkConsume}=useSparkConsume()
    observed.push({label:attrs['label'],view:sparkConsume(DATA_SOURCE),row:sparkConsume(DATA_ROW)})
    return ()=>h('button',attrs,String(attrs['label']??''))
  }})
  const Host=defineComponent({setup(){
    const {sparkProvide}=useSparkComponent({type:'definition-context-test-host'})
    sparkProvide(PAGE_RUNTIME,state.blueprintPageRuntime.value!)
    sparkProvide(DATA_SOURCE,nodeView);sparkProvide(DATA_ROW,nodeView.currentRow!)
    return ()=>h(DevDataSetDesigner,{state})
  }})
  const wrapper=mount(Host,{global:{stubs:{RendererButton:BoundButton,SparkJsonEditor:true}}})
  try{
    await flushPromises()
    const definitionView=state.scenarioDefinitionDocument.value!.dataSet.getView('DataViewDefinition')!
    const save=observed.filter(item=>item.label==='保存场景视图').at(-1)
    expect(save).toBeDefined()
    expect(save!.view).toBe(definitionView)
    expect(save!.row?.['rowid']).not.toBe(sceneNode().nodeId)
    if(definitionView.currentRow) expect(save!.row).toMatchObject(definitionView.currentRow)
    const previousDocument=state.scenarioDefinitionDocument.value,previousBindings=observed.length
    await state.loadSelectedScenarioViews(true);await flushPromises()
    const replacement=state.scenarioDefinitionDocument.value!.dataSet.getView('DataViewDefinition')!
    expect(state.scenarioDefinitionDocument.value).not.toBe(previousDocument)
    expect(replacement).toBe(definitionView)
    expect(observed.length).toBeGreaterThan(previousBindings)
    const rebound=observed.filter(item=>item.label==='保存场景视图').at(-1)
    expect(rebound?.view).toBe(replacement)
    expect(rebound?.row?.['rowid']).not.toBe(sceneNode().nodeId)
  }finally{wrapper.unmount()}
 })
 it('loads definitions only when the selected data workspace is actually opened', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  expect(state.scenarioDefinitionDocument.value).toBeNull()
  expect(readModels).not.toHaveBeenCalled()
  const wrapper=mountDesigner({state,shallow:true})
  try {await flushPromises();expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene')}
  finally {wrapper.unmount()}
 })
 it('rejects changed history, wrong targets and intervening manual edits before restore writes', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const preview=vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))
  await expect(state.restoreScenarioVersion(0,fixtureText(51))).rejects.toThrow('PREVIEW_CHANGED')
  const wrong=fixtureText(50).replace('scene','other')
  preview.mockResolvedValueOnce(wrong)
  await expect(state.restoreScenarioVersion(0,wrong)).rejects.toThrow('当前场景')
  expect(state.pageDataDirty.value).toBe(false)
  let release!: (text:string)=>void
  const waiting=new Promise<string>(resolve=>{release=resolve})
  preview.mockReturnValueOnce(waiting)
  const restoring=state.restoreScenarioVersion(0,fixtureText(50))
  const rejection=expect(restoring).rejects.toThrow('UNSAVED')
  await state.writeScenarioViewText(fixtureText(66))
  release(fixtureText(50));await rejection
  expect(JSON.parse(state.scenarioDefinitionDocument.value!.getText()).tables.Orders.views.default.pageSize).toBe(66)
  await expect(state.restoreScenarioVersion(0,fixtureText(50))).rejects.toThrow('UNSAVED')
  expect(httpPut).not.toHaveBeenCalled()
 })
 it('stages a restored snapshot in definition DataViews until the user explicitly saves', async()=>{
  let remote=fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const document=state.scenarioDefinitionDocument.value
  expect(document?.scenarioId).toBe('scene')
  const definitionView=document!.dataSet.getView('DataViewDefinition')!
  vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))

  await state.restoreScenarioVersion(0,fixtureText(50))

  expect(httpPut).not.toHaveBeenCalled()
  expect(definitionView.hasEditingChanges()).toBe(true)
  expect(state.pageDataDirty.value).toBe(true)
  expect(JSON.parse(document!.getText()).tables.Orders.views.default.pageSize).toBe(50)
  await state.saveScenarioViewText()
  expect(httpPut).toHaveBeenCalledOnce()
  expect(JSON.parse(remote).tables.Orders.views.default.pageSize).toBe(50)
  expect(definitionView.hasEditingChanges()).toBe(false)
 })
 it('blocks history restore while any named same-source definition view has a pending draft', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const document=state.scenarioDefinitionDocument.value!, graph=document.dataSet.getView('DataResourceRelationDefinition','graph')!
  const graphRead=await graph.loadFromServer({allPages:true})
  expect(graphRead.success).toBe(true)
  await graph.addRow({definitionKey:'graph-draft',dataSetId:'scene'})
  expect(graph.dirtyTracking.pendingCreateIds).toHaveLength(1)
  vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))

  await expect(state.restoreScenarioVersion(1,fixtureText(50))).rejects.toThrow('UNSAVED')

  expect(graph.dirtyTracking.pendingCreateIds).toHaveLength(1)
  expect(graph.rows.some(row=>row['definitionKey']==='graph-draft')).toBe(true)
  expect(state.pageDataDirty.value).toBe(true)
  expect(httpPut).not.toHaveBeenCalled()
 })
 it('exposes the same accessible space-level history region in the development designer', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const Button=defineComponent({props:['disabled','label'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}<slot /></button>'})
  const wrapper=mountDesigner({state,shallow:true,stubs:{RendererButton:Button,ScenarioHistoryPanel:false,ElAlert:true,ElInput:true,ElEmpty:true}})
  await wrapper.get('[data-test="scene-history"]').trigger('click')
  expect(wrapper.find('[aria-label="场景历史"]').exists()).toBe(true)
  wrapper.unmount()
 })
 it('retains an unknown attempt in the source owner when the shared panel closes and reopens', async()=>{
  const dataSet=DataSet.fromJson({scenarioId:'scene',tables:{History:{resourceType:'file',resourceId:'history',
   columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{commitMode:'staged'}}}}})
  const view=dataSet.getView('History')!
  let status:DataViewSourceHistoryStatus={state:'unknown',version:7,fileName:'7__pagedata.json',message:'receipt lost'}
  vi.spyOn(view,'getSourceHistoryStatus').mockImplementation(()=>status)
  vi.spyOn(view,'listSourceVersions').mockResolvedValue([{version:7,label:'7__pagedata.json',lastModified:null}])
  vi.spyOn(view,'previewSourceVersion').mockResolvedValue('{"scenarioId":"scene"}')
  vi.spyOn(view,'verifySourceHistoryAttempt').mockImplementation(async()=>{
   status={state:'confirmed',version:7,fileName:'7__pagedata.json',message:'verified'}
   return status
  })
  const Button=defineComponent({props:['disabled','label'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}<slot /></button>'})
  const props={open:true,view,canCreate:false,draftDirty:false,onRestore:async()=>{}}
  const first=mount(ScenarioHistoryPanel,{props,global:{stubs:{RendererButton:Button}}})
  await flushPromises()
  expect(first.text()).toContain('原快照结果未知')
  await first.get('[data-test="scene-history-close"]').trigger('click')
  first.unmount()
  const reopened=mount(ScenarioHistoryPanel,{props,global:{stubs:{RendererButton:Button}}})
  await flushPromises()
  expect(reopened.text()).toContain('原快照结果未知')
  await reopened.findAll('button').find(button=>button.text()==='核验原快照')!.trigger('click')
  expect(status.state).toBe('confirmed')
  expect(reopened.text()).toContain('verified')
  reopened.unmount();dataSet.destroy()
 })
 it('keeps an unresolved history attempt inside the development owner leave guard after panel close', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const source=state.scenarioDefinitionDocument.value!.dataSet.getView('DataViewDefinition')!
  let attempt:DataViewSourceHistoryStatus={state:'unknown',version:3,fileName:'3__pagedata.json',message:'receipt lost'}
  vi.spyOn(source,'getSourceHistoryStatus').mockImplementation(()=>attempt)
  expect(state.hasPendingBlueprintWrite()).toBe(true)
  attempt={state:'confirmed',version:3,fileName:'3__pagedata.json',message:'verified'}
  expect(state.hasPendingBlueprintWrite()).toBe(false)
 })
 it('previews and stages through the shared panel, then saves only on its explicit save action', async()=>{
  const dataSet=DataSet.fromJson({scenarioId:'scene',tables:{History:{resourceType:'file',resourceId:'history',
   columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{commitMode:'staged'}}}}})
  const view=dataSet.getView('History')!
  vi.spyOn(view,'getSourceHistoryStatus').mockReturnValue({state:'idle',version:null,fileName:null,message:null})
  vi.spyOn(view,'listSourceVersions').mockResolvedValue([{version:5,label:'5__pagedata.json',lastModified:null}])
  vi.spyOn(view,'previewSourceVersion').mockResolvedValue('{"scenarioId":"scene","tables":{}}')
  const onRestore=vi.fn(async()=>{}),onSave=vi.fn(async()=>{})
  const Button=defineComponent({props:['disabled','label'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}<slot /></button>'})
  const wrapper=mount(ScenarioHistoryPanel,{props:{open:true,view,canCreate:false,draftDirty:false,onRestore,onSave},global:{stubs:{RendererButton:Button}}})
  await flushPromises()
  await wrapper.findAll('button').find(button=>button.text()==='预览')!.trigger('click')
  expect(wrapper.text()).toContain('恢复仅写入当前定义草稿')
  await wrapper.get('[data-test="scene-restore"]').trigger('click')
  expect(onRestore).toHaveBeenCalledOnce()
  expect(onSave).not.toHaveBeenCalled()
  await wrapper.setProps({draftDirty:true})
  await wrapper.get('[data-test="scene-save"]').trigger('click')
  expect(onSave).toHaveBeenCalledOnce()
  wrapper.unmount();dataSet.destroy()
 })
 it('provides the original history DataView as shared RendererButton data-source context',async()=>{
  const dataSet=DataSet.fromJson({scenarioId:'scene',tables:{History:{resourceType:'file',resourceId:'history',
   columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{commitMode:'staged'}}}}})
  const view=dataSet.getView('History')!
  vi.spyOn(view,'getSourceHistoryStatus').mockReturnValue({state:'idle',version:null,fileName:null,message:null})
  vi.spyOn(view,'listSourceVersions').mockResolvedValue([])
  let provided:unknown
  const Button=defineComponent({props:['disabled','label'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}<slot /></button>',setup(){
   provided=useSparkConsume().sparkConsume(DATA_SOURCE)
  }})
  const wrapper=mount(ScenarioHistoryPanel,{props:{open:true,view,canCreate:false,draftDirty:false,onRestore:async()=>{}},global:{stubs:{RendererButton:Button}}})
  await flushPromises()
  expect(toRaw(provided as typeof view)).toBe(toRaw(view))
  wrapper.unmount();dataSet.destroy()
 })
 it('previews the shared DataView draft while the storage owner remains unchanged', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  await state.writeScenarioViewText(fixtureText(92))
  const runtimeData=DataSet.fromJson({scenarioId:'scene',tables:{}})
  previewLoad.mockResolvedValue({dataSet:runtimeData})
  const wrapper=shallowMount(DevPreviewTab,{props:{state}})
  try {
    await flushPromises()
    expect(previewLoad).toHaveBeenCalledOnce()
    expect(previewLoad.mock.calls[0]?.[0].config.toJSON().tables.Orders.views.default.pageSize).toBe(92)
    expect(JSON.parse(state.editor.getScenarioViews('scene')!.getText()).tables.Orders.views.default.pageSize).toBe(20)
    expect(state.pageDataDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  } finally {wrapper.unmount()}
  expect(runtimeData.destroyed).toBe(true)
  expect(state.scenarioDefinitionDocument.value?.dataSet.destroyed).toBe(false)
 })
 it('binds text editing and standard undo/save controls to the same definition views', async()=>{
  let remote=fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const JsonEditor=defineComponent({props:['modelValue','readOnly'],emits:['update:modelValue'],
    template:'<textarea :value="modelValue" :disabled="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />'})
  const wrapper=mountDesigner({state,stubs:{SparkJsonEditor:JsonEditor}})
  const button=(label:string)=>wrapper.findAll('button').find(item=>item.text()===label)!
  try {
    await wrapper.get('textarea').setValue(fixtureText(77));await flushPromises()
    expect(state.pageDataDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
    await button('撤销').trigger('click');await flushPromises()
    expect(state.pageDataDirty.value).toBe(false)
    expect(JSON.parse(wrapper.get('textarea').element.value).tables.Orders.views.default.pageSize).toBe(20)
    await wrapper.get('textarea').setValue('{');await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
    expect(button('保存场景视图').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').setValue(fixtureText(88));await flushPromises()
    await button('保存场景视图').trigger('click');await flushPromises()
    expect(JSON.parse(remote).tables.Orders.views.default.pageSize).toBe(88)
    expect(state.pageDataDirty.value).toBe(false)
  } finally {wrapper.unmount()}
 })
 it('releases the reload lock when installing a document invalidates history work', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const previous=state.scenarioDefinitionDocument.value
  const Button=defineComponent({props:['disabled','label'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')">{{label}}<slot /></button>'})
  const wrapper=mountDesigner({state,stubs:{RendererButton:Button,ScenarioHistoryPanel:true,SparkJsonEditor:true}})
  try {
   await flushPromises()
   await wrapper.findAll('button').find(button=>button.text()==='重新加载')!.trigger('click')
   await flushPromises()
   expect(state.scenarioDefinitionDocument.value).not.toBe(previous)
   expect(wrapper.findAll('button').find(button=>button.text()==='重新加载')!.attributes('disabled')).toBeUndefined()
   expect(wrapper.get('[data-test="scene-history"]').attributes('disabled')).toBeUndefined()
  } finally {wrapper.unmount()}
 })
 it('keeps the standard save action available to verify a lost receipt without discarding the draft', async()=>{
  let remote=fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content;throw new Error('response lost')})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const wrapper=mountDesigner({state,stubs:{SparkJsonEditor:true}})
  const button=()=>wrapper.get('[data-test="scene-save"]')
  try {
   await state.writeScenarioViewText(fixtureText(77));await flushPromises()
   await button().trigger('click');await flushPromises()
   expect(wrapper.get('[role="alert"]').text()).toContain('response lost')
   expect(state.pageDataDirty.value).toBe(true)
   expect(button().text()).toBe('核验场景提交')
   expect(wrapper.get('[role="status"]').text()).toContain('新修改保留到下一次保存')
   expect(button().attributes('disabled')).toBeUndefined()
   await button().trigger('click');await flushPromises()
   expect(state.pageDataDirty.value).toBe(false)
   expect(httpPut).toHaveBeenCalledOnce()
   expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  } finally {wrapper.unmount()}
 })
 it('reports confirmed tool files and unknown definitions from the real shared workspace save, preserving later edits', async()=>{
  const remote=new Map([['scenario:scene',fixtureText(20)]])
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  httpGet.mockImplementation(async(url:string)=>({content:remote.get(url)??''}))
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{
    remote.set(url,payload.content)
    if(url==='scenario:scene'){await gate;throw new Error('response lost')}
  })
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const page=state.project.getActivePage()!
  state.project.markBlueprintClean('node')
  const fileView=await state.loadPageToolFileDataView({pageId:page.pageId,fileName:'script.js'}),fileRow=fileView.currentRow,fileId=fileRow&&fileView.getPkKey(fileRow)
  if(fileId===null||fileId===undefined)throw new Error('fixture file row has no DataView identity')
  await fileView.editRowById(fileId,{text:'console.log("first")'})
  state.stagePageToolFileDataView({pageId:page.pageId,fileName:'script.js',text:'console.log("first")'})
  expect(state.isPageToolFileDirty('script.js')).toBe(true)
  expect(state.isPageToolFileDirty('rule.json')).toBe(false)
  expect(state.hasAnyFileDirty.value).toBe(true)
  await state.writeScenarioViewText(fixtureText(77))
  const saving=state.saveAll()
  await vi.waitFor(()=>expect(httpPut.mock.calls.some(call=>call[0]==='scenario:scene')).toBe(true))
  expect(state.allSaving.value).toBe(true)
  await state.saveAll();expect(httpPut).toHaveBeenCalledTimes(2)
  const document=state.scenarioDefinitionDocument.value!, view=document.dataSet.getView('DataViewDefinition')!
  const row=view.rows.find(item=>item['viewId']==='default')!
  view.updateEditingValue(view.getPkKey(row)!,'pageSize',88)
  release();await saving
  expect(state.allSaving.value).toBe(false)
  expect(page.isDirty()).toBe(false)
  expect(state.statusMessages.value.some(item=>item.text==='工具工作文件本轮提交已确认')).toBe(true)
  expect(state.statusMessages.value[0]?.text).toContain('场景定义保存未完成')
  expect(state.pageDataDirty.value).toBe(true)
  await state.saveAll()
  expect(httpPut).toHaveBeenCalledTimes(2)
  expect(state.statusMessages.value[0]?.text).toBe('本轮提交已确认，仍有新修改待保存')
  expect(view.getEditingRow(view.getPkKey(row)!)?.['pageSize']).toBe(88)
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{remote.set(url,payload.content)})
  await state.saveAll()
  expect(httpPut).toHaveBeenCalledTimes(3)
  expect(httpPut.mock.calls.filter(call=>String(call[0]).endsWith('/script.js'))).toHaveLength(1)
  expect(httpPut.mock.calls.some(call=>String(call[0]).endsWith('/rule.json')||String(call[0]).endsWith('/style.css'))).toBe(false)
  expect(JSON.parse(remote.get('scenario:scene')!).tables.Orders.views.default.pageSize).toBe(88)
  expect(state.pageDataDirty.value).toBe(false)
  expect(state.statusMessages.value[0]?.text).toBe('全部保存已确认')
 })
 it.each(['save','cancel'] as const)('lets the undispatched scene draft %s while a tool receipt is unknown', async action=>{
  const remote=new Map([['scenario:scene',fixtureText(20)]])
  httpGet.mockImplementation(async(url:string)=>({content:remote.get(url)??''}))
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{
   remote.set(url,payload.content)
   if(url.endsWith('script.js'))throw new Error('tool receipt lost')
  })
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const page=state.project.getActivePage()!
  state.project.markBlueprintClean('node')
  const fileView=await state.loadPageToolFileDataView({pageId:page.pageId,fileName:'script.js'}),fileRow=fileView.currentRow,fileId=fileRow&&fileView.getPkKey(fileRow)
  if(fileId===null||fileId===undefined)throw new Error('fixture file row has no DataView identity')
  await fileView.editRowById(fileId,{text:'submitted'})
  state.stagePageToolFileDataView({pageId:page.pageId,fileName:'script.js',text:'submitted'})
  await state.writeScenarioViewText(fixtureText(77))
  const wrapper=mountDesigner({state,stubs:{SparkJsonEditor:true}})
  try {
   await state.verifyUnconfirmedBlueprintWrites()
   expect(httpPut).not.toHaveBeenCalled()
   await state.saveAll();await flushPromises()
   expect(httpPut).toHaveBeenCalledOnce()
   expect(state.statusMessages.value[0]?.text).toContain('后续场景定义尚未提交')
   expect(state.statusMessages.value[0]?.text).toContain('再次保存先核验原工具提交')
   await state.verifyUnconfirmedBlueprintWrites()
   expect(httpPut).toHaveBeenCalledOnce()
   expect(state.statusMessages.value[0]?.text).toContain('原提交已确认')
   expect(state.pageDataDirty.value).toBe(true)
   const label=action==='save'?'保存场景视图':'撤销'
   const button=wrapper.findAll('button').find(item=>item.text()===label)!
   expect(button.attributes('disabled')).toBeUndefined()
   await button.trigger('click');await flushPromises()
   expect(state.pageDataDirty.value).toBe(false)
   expect(JSON.parse(remote.get('scenario:scene')!).tables.Orders.views.default.pageSize).toBe(action==='save'?77:20)
   await state.saveAll()
   expect(httpPut.mock.calls.filter(call=>String(call[0]).endsWith('script.js'))).toHaveLength(1)
   expect(state.hasAnyDirty.value).toBe(false)
   expect(state.statusMessages.value[0]?.text).toBe('全部保存已确认')
  } finally {wrapper.unmount()}
 })
 it('opens vue scene planning without loading a tool and explicitly creates from formal models',async()=>{
  let remote:string|null=null
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  readModels.mockResolvedValue([{id:'REAL-ID',metaName:'RealOrders'}])
  const state=createDevStateWithConfigPages([], '')
  const node=sceneNode();if(node.navigation)node.navigation.target='vue:/features/orders'
  state.project.replaceBlueprintChildren([node]);await state.selectNode(node);await state.loadSelectedScenarioViews()
  expect(httpGet.mock.calls.every(call=>String(call[0]) === 'scenario:scene')).toBe(true)
  expect(state.pageDataError.value).toBeNull()
  expect(state.scenarioDefinitionDocument.value?.isPersisted).toBe(false)
  await state.createSelectedScenarioViews()
  expect(JSON.parse(state.scenarioDefinitionDocument.value!.getText())).toEqual({scenarioId:'scene',tables:{RealOrders:{modelBinding:{modelId:'REAL-ID',modelName:'RealOrders'},views:{default:{}}}},viewCascades:[]})
  expect(state.hasAnyDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  await state.saveScenarioViewText();expect(state.pageDataDirty.value).toBe(false)
 })
 it('does not fabricate a draft when the backend has no formal models',async()=>{
  httpGet.mockResolvedValue({content:null});readModels.mockResolvedValue([])
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  await expect(state.createSelectedScenarioViews()).rejects.toThrow('没有正式模型')
  expect(state.scenarioDefinitionDocument.value?.isPersisted).toBe(false);expect(httpPut).not.toHaveBeenCalled()
 })

 it('mounts the shared designer for the persisted scene and blocks it while conid is pending',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const Slot=defineComponent({template:'<div><slot /></div>'})
  const Button=defineComponent({props:['disabled'],template:'<button :disabled="disabled"><slot /></button>'})
  const Input=defineComponent({props:['disabled'],template:'<input :disabled="disabled" />'})
  const pending=ref(false),persistedDataSpaceId=computed(()=>'scene'),sceneBindingPending=computed(()=>pending.value)
  const paneState={...state,persistedDataSpaceId,sceneBindingPending}
  const wrapper=shallowMount(DataPlanningPane,{props:{state:paneState,fieldAccess:{read:true,write:true}},global:{stubs:{ElForm:Slot,ElFormItem:Slot,ElButton:Button,ElInput:Input}}})
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(true)
  expect(wrapper.findComponent(DevDataSetDesigner).props('state')).toBe(paneState)
  pending.value=true
  await wrapper.vm.$nextTick()
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(false)
  wrapper.unmount()
 })
 it('previews an actual scene snapshot before restoring and blocks dirty versions',async()=>{
  let remote = fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const list=vi.spyOn(state.editor,'listScenarioVersions').mockResolvedValue([{version:0,fileName:'0__pagedata.json',lastModified:null}])
  const preview=vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))
  const Button=defineComponent({props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'})
  const wrapper=mountDesigner({state,shallow:true,stubs:{RendererButton:Button,ScenarioHistoryPanel:false,ElAlert:true,ElInput:true,ElEmpty:true}})
  await wrapper.get('[data-test="scene-history"]').trigger('click');await vi.waitFor(()=>expect(wrapper.find('[data-test="scene-preview"]').exists()).toBe(true))
  expect(list).toHaveBeenCalled()
  await wrapper.get('[data-test="scene-preview"]').trigger('click');await vi.waitFor(()=>expect(wrapper.find('[data-test="scene-restore"]').exists()).toBe(true))
  expect(httpPut).not.toHaveBeenCalled()
  await wrapper.get('[data-test="scene-restore"]').trigger('click');await flushPromises()
  expect(JSON.parse(state.scenarioDefinitionDocument.value!.getText()).tables.Orders.views.default.pageSize).toBe(50)
  expect(state.pageDataDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  await wrapper.get('[data-test="scene-save"]').trigger('click');await vi.waitFor(()=>expect(JSON.parse(remote).tables.Orders.views.default.pageSize).toBe(50))
  expect(httpPut).toHaveBeenCalledOnce()
  expect(preview).toHaveBeenCalledTimes(2)
  await state.writeScenarioViewText(fixtureText(70));await wrapper.vm.$nextTick()
  expect(wrapper.get('[data-test="scene-snapshot"]').attributes()).toHaveProperty('disabled')
  wrapper.unmount()
 })
 it('discards a late scene history after the panel is closed',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  let release:((value: {version:number;fileName:string;lastModified:null}[])=>void)|undefined
  const pending=new Promise<{version:number;fileName:string;lastModified:null}[]>(resolve=>{release=resolve})
  vi.spyOn(state.editor,'listScenarioVersions').mockReturnValue(pending)
  const Button=defineComponent({props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'})
  const wrapper=mountDesigner({state,shallow:true,stubs:{RendererButton:Button,ScenarioHistoryPanel:false,ElAlert:true,ElInput:true,ElEmpty:true}})
  await wrapper.get('[data-test="scene-history"]').trigger('click')
  await wrapper.get('[data-test="scene-history-close"]').trigger('click')
  release?.([{version:4,fileName:'4__pagedata.json',lastModified:null}]);await pending;await wrapper.vm.$nextTick()
  expect(wrapper.find('[data-test="scene-preview"]').exists()).toBe(false)
  wrapper.unmount()
 })
 it('rejects a late scene version list after changing the selected node',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  let release:((value:[])=>void)|undefined
  const pending=new Promise<[]>(resolve=>{release=resolve})
  vi.spyOn(state.editor,'listScenarioVersions').mockReturnValue(pending)
  const listing=state.listScenarioVersions()
  const rejected=expect(listing).rejects.toThrow('目标已切换')
  state.project.selectNode(null)
  release?.([]);await rejected
 })
 it('loads a scene without eagerly loading cfg tool files',async()=>{
  httpGet.mockImplementation(async(url:string)=>{if(!url.startsWith('scenario:'))throw new Error('tool file missing');return {content:fixtureText(20)}})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene')
  expect(state.activePageId.value).toBe('orders-page')
  expect(state.statusMessages.value.some(item=>item.text.includes('工具 orders-page 文件加载失败'))).toBe(false)
 })
 beforeEach(()=>{isolateAppProjectWorkspaceForTest();localStorage.clear();sessionStorage.clear();httpGet.mockReset();httpPut.mockReset();httpGet.mockResolvedValue({content:''});readModels.mockReset();previewLoad.mockReset();vi.spyOn(LowcodeDictionary,'loadEditor').mockImplementation(async()=>({dataSet:DataSet.fromJson({scenarioId:LowcodeDictionary.editorScenarioId,tables:{_Base_DictType:{modelBinding:{modelId:`${LowcodeDictionary.editorScenarioId}dictionary`,modelName:'_Base_DictType'},columns:[{name:'rowid',type:'string',isPrimaryKey:true},{name:'Name',type:'string'}],views:{default:{}}}}})}))})
 afterEach(()=>{vi.useRealTimers();previewCalls.clear();savedVersions.clear();scenarioVersions.clear();scenarioCreateCalls.length=0;loseScenarioReceipt.clear();designVersions.clear();designWorking.clear()})
 it('opens the active file through its DataView without loading PageTool owner text',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':url.endsWith('/script.js')?'owner duplicate':''}))
  const state=createDevStateWithConfigPages()
  const fileViewLoad=vi.spyOn(state,'loadPageToolFileDataView')
  const wrapper=shallowMount(DevFileEditor,{props:{state},global:{stubs:{RendererForm:true,FieldJson:true,FieldCodeEditor:true,RendererButton:true,RendererTabs:true,RendererTabPane:true,DisplayEmpty:true,DisplayAlert:true,DisplayIcon:true}}})
  try{
   await flushPromises()
   expect(Reflect.has(state.editor,'ensureActivePageFilesLoaded')).toBe(false)
   await vi.waitFor(()=>expect(fileViewLoad.mock.calls.map(([input])=>input.fileName)).toEqual(['rule.json']))
   const fileView=await fileViewLoad.mock.results[0]?.value as unknown as {currentRow:Record<string,unknown>|null;tableName:string;viewId:string}
   expect(fileView.currentRow).toMatchObject({pageId:'orders-page',fileName:'rule.json'})
   expect(fileView.tableName).toBe('ProjectToolFile')
   expect(fileView.viewId).toBe('page-orders-page-rule.json')
  }finally{wrapper.unmount()}
 })
 it('reads the active editor text from the file DataView draft without requiring a PageTool mirror',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/script.js')?'saved baseline':''}))
  const state=createDevStateWithConfigPages()
  await ensureDevStateActivePageLoaded(state)
  const view=await state.loadPageToolFileDataView({pageId:state.activePageId.value,fileName:'script.js'})
  const row=view.currentRow,id=row&&view.getPkKey(row)
  if(id===null||id===undefined)throw new Error('file row missing')
  await view.editRowById(id,{text:'DataView draft'})
  const editor=useDevFileEditor(state,ref('script.js'))
  expect(editor.text.value).toBe('DataView draft')
 })
 it('builds preview content from the file DataView draft without requiring a PageTool mirror',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/script.js')?'saved baseline':''}))
  const state=createDevStateWithConfigPages()
  await selectPreviewNode(state)
  await ensureDevStateActivePageLoaded(state)
  const view=await state.loadPageToolFileDataView({pageId:state.activePageId.value,fileName:'script.js'})
  const row=view.currentRow,id=row&&view.getPkKey(row)
  if(id===null||id===undefined)throw new Error('file row missing')
  await view.editRowById(id,{text:'DataView draft'})
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  try {
   await flushPromises()
   const runtime=wrapper.findComponent(Renderer).props('pageRuntime') as PageRuntime
   expect(runtime.tool.getFileText('script.js')).toBe('DataView draft')
   expect(runtime.source).toMatchObject({mode:'preview',publicationRef:null,scenarioIds:[]})
   expect(runtime.source.sourceRevision).toMatch(/^preview:/u)
  } finally {wrapper.unmount()}
 })
 it.each(['dataViewKey','optionDataViewKey','edgeDataViewKey','additionalEdgeDataViewKey'])(
  'loads an additional scenario referenced by a structured zone %s',async property=>{
   const rule=JSON.stringify([{id:'dialog',type:'r-dialog',props:{footer:{children:[{id:'field',type:'r-select',props:{[property]:'extra@Orders@default'}}]}}}])
   httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20).replaceAll('"scene"','"extra"'):url.endsWith('/rule.json')?rule:''}))
   previewLoad.mockImplementation(async({scenarioId}:{scenarioId:string})=>({dataSet:DataSet.fromJson({scenarioId,tables:{Internal:{modelBinding:{modelId:'orders-model',modelName:'Orders'},columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{}}}}})}))
   const state=createDevStateWithConfigPages()
   await selectPreviewNode(state,'cfg:orders-page?additionalScenarioIds=extra')
   await ensureDevStateActivePageLoaded(state)
   const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
   const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
   try {
    await flushPromises()
    expect(previewLoad.mock.calls.map(([input])=>input.scenarioId)).toEqual(['extra'])
    const runtime=wrapper.findComponent(Renderer).props('pageRuntime') as PageRuntime
    expect(runtime.resolveView('extra@Orders@default')).toBe(runtime.getDataSet('extra')!.getView('Internal'))
    expect(wrapper.findComponent(Renderer).props('routeSnapshot')).toMatchObject({
      fullPath:'/apps/homepage/__page/orders-page-node?additionalScenarioIds=extra',
      query:{additionalScenarioIds:'extra'},
    })
    expect(httpPut).not.toHaveBeenCalled()
   } finally {wrapper.unmount()}
  },
 )
 describe('publication binding preflight', () => {
  const target = 'cfg:orders-page?additionalScenarioIds=extra'
  const explicitFieldsText = fixtureText(20).replace('"pageSize":20', '"pageSize":20,"queryConfig":{"fields":["id"]}')

  beforeEach(() => {
   readPlan.mockReset().mockRejectedValue(new LowcodeApiError(404, 'fixture Plan absent'))
   assemblePlan.mockReset()
  })

  function scenario(scenarioId: string) {
   return DataSet.fromJson({scenarioId, tables:{Internal:{
    modelBinding:{modelId:'orders-model', modelName:'Orders'},
    columns:[{name:'id', type:'string', isPrimaryKey:true}], views:{default:{}},
   }}})
  }

  function configurePagedataAssembly() {
   const assembled: DataSet[] = []
   previewLoad.mockImplementation(async ({scenarioId}: {scenarioId: string}) => {
    const dataSet = scenario(scenarioId)
    assembled.push(dataSet)
    return {dataSet}
   })
   return assembled
  }

  async function openPublication(rule: string, script = '') {
   httpGet.mockImplementation(async (url: string) => ({content: url.startsWith('scenario:')
    ? fixtureText(20).replaceAll('"scene"', JSON.stringify(url.slice('scenario:'.length)))
    : url.endsWith('/rule.json') ? rule : url.endsWith('/script.js') ? script : ''}))
   const state = createDevStateWithConfigPages([], '')
   const node = sceneNode()
   node.navigation!.target = target
   previewCalls.set(node.nodeId, {target, main:'scene', publish:true})
   state.project.replaceBlueprintChildren([node])
   await state.selectNode(node)
   await ensureDevStateActivePageLoaded(state)
   const owner = state.blueprintWorkspaceDataView.value!
   const save = vi.spyOn(owner, 'saveSelectedNode')
   let page!: ReturnType<typeof usePageDesign>
   const wrapper = mount(defineComponent({setup() {page = usePageDesign(state); return () => h('div')}}))
   return {page, state, save, wrapper}
  }

  it.each(['disposed', 'denied'])('holds the delivery state while a browser lock is pending and recovers after it is %s', async outcome => {
   configurePagedataAssembly()
   const {page,state,save,wrapper}=await openPublication('[]')
   let enterLock = (_granted: boolean): void => {}
   let lockFinished: Promise<void> | undefined
   const request = vi.fn((name: string, _options: LockOptions, enter: LockGrantedCallback<void>) => {
    lockFinished = new Promise<boolean>(resolve => {enterLock = resolve})
     .then(granted => enter(granted ? {name, mode:'exclusive'} : null))
    return lockFinished
   })
   vi.stubGlobal('navigator', {locks:{request}})
   let unmounted = false
   try {
    page.actions.value.saveDelivery()
    expect(request).toHaveBeenCalledOnce()
    const busyBeforeLock = page.delivering.value
    if(outcome==='disposed') {
     wrapper.unmount()
     unmounted = true
     expect(state.blueprintPageRuntime.value?.destroyed).toBe(false)
    }
    enterLock(outcome==='disposed')
    await lockFinished?.catch(() => {})
    await vi.waitFor(() => expect(page.delivering.value).toBe(false))
    expect(save).not.toHaveBeenCalled()
    expect(designVersions.size).toBe(0)
    expect(designWorking.size).toBe(0)
    expect(savedVersions.size).toBe(0)
    expect(busyBeforeLock).toBe(true)
    if(outcome==='denied') {
     page.actions.value.saveDelivery()
     expect(request).toHaveBeenCalledTimes(2)
     enterLock(true)
     await lockFinished
     await vi.waitFor(() => expect(page.delivering.value).toBe(false))
     expect(save).toHaveBeenCalledOnce()
     expect(savedVersions.has('orders-page-node')).toBe(true)
    }
   } finally {
    enterLock(false)
    await lockFinished?.catch(() => {})
    if(!unmounted)wrapper.unmount()
    vi.unstubAllGlobals()
   }
  })

  function configurePublicationSources(kind: string) {
   const createPlan = (scenarioId: string) => buildRuntimeDataSetPlanText({
    scenarioId, space:{rowid:scenarioId, Name:scenarioId, Type:'数据源'},
    models:[{rowid:'orders-model', Name:'Orders', Type:'数据库表', OutputType:'Table', IsBusiness:1, IsBusinessMain:1}],
    fields:[{rowid:'orders-id', dataModelId:'orders-model', type:'dataModel', Name:'id', FieldType:'varchar', IsOutput:1, IsPKey:1}],
    relations:[], scenarioConfig:{scenarioId, tables:{Orders:{
     modelBinding:{modelId:'orders-model', modelName:'Orders'}, views:{default:{}},
    }}},
   })
   const sources = new Map([['scene', createPlan('scene')], ['extra', createPlan('extra')]])
   if (kind === 'Dataset Plan') readPlan.mockImplementation(async (fileName: string) => sources.get(fileName.replace('.dataset.json', '')))
   const assembled = configurePagedataAssembly()
   assemblePlan.mockImplementation(async ({scenarioId}: {scenarioId: string}) => {
    const dataSet = scenario(scenarioId)
    assembled.push(dataSet)
    return dataSet
   })
   return {assembled, sources}
  }

  const unsupportedPlanDefaults = [
   {member:'queryConfig.fields',working:explicitFieldsText,error:'不支持保存显式 queryConfig.fields'},
   {member:'queryContext',working:fixtureText(20).replace('"pageSize":20','"pageSize":20,"queryContext":{"region":"north"}'),error:'不支持保存非空 queryContext'},
   {member:'sortExpression',working:fixtureText(20).replace('"pageSize":20','"pageSize":20,"sortExpression":[{"field":"id","direction":"desc"}]'),error:'不支持保存独立 sortExpression'},
   {member:'filterExpression',working:fixtureText(20).replace('"pageSize":20','"pageSize":20,"filterExpression":{"field":"id","operator":"eq","value":"ONE"}'),error:'不支持保存可替换的初始过滤'},
  ]
  it.each(unsupportedPlanDefaults.flatMap(definition=>
   (['initial','assembly','pointer'] as const).map(phase=>({...definition,phase}))
  ))('rejects the stored Plan when $member is found at $phase',async ({phase,working,error})=>{
   configurePublicationSources('Dataset Plan')
   const {page,state,save,wrapper}=await openPublication('[]')
   expect(working).not.toBe(fixtureText(20))
   httpGet.mockImplementation(async (url:string)=>({content:url==='scenario:scene'?working:url.endsWith('/rule.json')?'[]':''}))
   const observe=async()=>{
    await state.loadSelectedScenarioViews()
    const source=state.editor.getScenarioViews('scene')
    if(!source)throw Error('Missing the original loaded working scene')
    expect(source.savedText).toBe(working)
    expect(state.editor.getScenarioDefinitions('scene')?.getView('DataViewDefinition')?.hasEditingChanges()).toBe(false)
   }
   try{
    if(phase==='initial')await observe()
    else if(phase==='assembly'){
     assemblePlan.mockImplementationOnce(async ({scenarioId}: {scenarioId: string})=>{
      await observe()
      return scenario(scenarioId)
     })
    }else{
     const view=state.blueprintWorkspaceDataView.value!.view
     const apply=view.applyEditingRows.bind(view)
     vi.spyOn(view,'applyEditingRows').mockImplementationOnce(async ids=>{
      const result=await apply(ids)
      await observe()
      return result
     })
    }
    page.actions.value.saveDelivery()
    const status=()=>state.statusMessages.value.map(message=>message.text).join(' ')
    await vi.waitFor(()=>expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect(status()).toContain(`scene Orders@default ${error}`)
    expect(savedVersions.has('orders-page-node')).toBe(false)
    expect(scenarioVersions.size).toBe(0)
    expect(httpPut).not.toHaveBeenCalled()
    if(phase!=='pointer'){
     expect(save).not.toHaveBeenCalled()
     expect(designVersions.size).toBe(0)
     expect(designWorking.size).toBe(0)
    }else{
     expect(save).toHaveBeenCalledOnce()
     expect(designVersions.size).toBeGreaterThan(0)
    }
   }finally{wrapper.unmount()}
  })

  it('reads the original Plan publication receipt after the working definition declares explicit fields', async () => {
   configurePublicationSources('Dataset Plan')
   const {page,state,wrapper}=await openPublication('[]')
   const writePointer=vi.spyOn(savedVersions,'set')
   previewCalls.get('orders-page-node')!.failReadback=true
   const status=()=>state.statusMessages.value.map(message=>message.text).join(' ')
   try {
    page.actions.value.saveDelivery()
    await vi.waitFor(()=>expect(status()).toContain('publication readback interrupted'))
    const snapshots=new Map(designVersions)
    const workingFiles=new Map(designWorking)
    httpGet.mockImplementation(async (url: string) => ({content:url==='scenario:scene'?explicitFieldsText:url.endsWith('/rule.json')?'[]':''}))
    await state.loadSelectedScenarioViews()
    expect(state.editor.getScenarioViews('scene')?.savedText).toBe(explicitFieldsText)
    page.verifyPendingWrites()
    await vi.waitFor(()=>expect(status()).toContain('发布指针已一次切换并读回'))
    expect(savedVersions.get('orders-page-node')).toBe('r=1;s=1;t=1;m=1')
    expect(writePointer).toHaveBeenCalledExactlyOnceWith('orders-page-node','r=1;s=1;t=1;m=1')
    expect(designVersions).toEqual(snapshots)
    expect(designWorking).toEqual(workingFiles)
   } finally {writePointer.mockRestore();wrapper.unmount()}
  })

  it.each(['same', 'cold'] as const)('allows a new publication after the original pointer was formally rejected in a %s workspace', async kind => {
   configurePagedataAssembly()
   const nodeId = 'orders-page-node'
   let stage = await openPublication('[]')
   const first = stage.state.blueprintWorkspaceDataView.value!
   previewCalls.get(nodeId)!.rejectPointer = true
   const status = () => stage.state.statusMessages.value.map(item => item.text).join(' ')
   try {
    stage.page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(status()).toContain('fixture formal pointer rejection'))
    expect(stage.save).toHaveBeenCalledOnce()
    expect(first.hasPendingBlueprintCommand).toBe(false)
    expect(stage.page.canVerifyPendingWrites.value).toBe(false)
    expect(first.value('VersionId')).toBe('')
    expect(savedVersions.has(nodeId)).toBe(false)
    const snapshots = new Map(designVersions)
    const scenarioWrites = [...scenarioCreateCalls]
    expect(snapshots.size).toBeGreaterThan(0)
    if (kind === 'cold') {
     stage.wrapper.unmount()
     stage = await openPublication('[]')
     const reopened = stage.state.blueprintWorkspaceDataView.value!
     expect(reopened).not.toBe(first)
     expect(reopened.value('VersionId')).toBe('')
    }
    previewCalls.get(nodeId)!.rejectPointer = false
    stage.page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(status()).toContain('发布指针已一次切换并读回'))
    expect(stage.save).toHaveBeenCalledTimes(kind === 'same' ? 2 : 1)
    expect(designVersions).toEqual(snapshots)
    expect(scenarioCreateCalls).toEqual(scenarioWrites)
    expect(savedVersions.get(nodeId)).toBe('r=1;s=1;t=1;m=1')
   } finally {stage.wrapper.unmount()}
  })

  it.each([
   {scenarioId:'scene', phase:'initial'},
   {scenarioId:'extra', phase:'initial'},
   {scenarioId:'scene', phase:'assembly'},
   {scenarioId:'scene', phase:'pointer'},
  ])('does not publish a stored Plan over a draft in $scenarioId at $phase', async ({scenarioId, phase}) => {
   const {assembled} = configurePublicationSources('Dataset Plan')
   const {page, state, save, wrapper} = await openPublication('[]')
   try {
    await state.loadSelectedScenarioViews()
    const draft = (await state.editor.loadScenarioDefinitions({scenarioId})).getView('DataViewDefinition')
    if (!draft) throw new Error('The original scenario owner is absent')
    if (phase === 'pointer') {
     const view = state.blueprintWorkspaceDataView.value!.view
     const apply = view.applyEditingRows.bind(view)
     vi.spyOn(view, 'applyEditingRows').mockImplementationOnce(async ids => {
      const result = await apply(ids)
      await state.writeScenarioViewText(fixtureText(66))
      return result
     })
    } else if (phase === 'assembly') {
     assemblePlan.mockImplementationOnce(async ({scenarioId: assemblyId}: {scenarioId: string}) => {
      await state.writeScenarioViewText(fixtureText(66))
      const dataSet = scenario(assemblyId)
      assembled.push(dataSet)
      return dataSet
     })
    } else if (scenarioId === 'scene') {
     await state.writeScenarioViewText(fixtureText(66))
    } else {
     await draft.refresh()
     const row = draft.rows.find(item => item['viewId'] === 'default')
     const rowId = row ? draft.getPkKey(row) : undefined
     if (rowId === undefined) throw new Error('The original additional scenario row is absent')
     draft.updateEditingValue(rowId, 'pageSize', 66)
    }
    expect(draft.hasEditingChanges()).toBe(phase === 'initial')
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(state.statusMessages.value.map(message => message.text).join('\n'))
     .toContain(`场景 ${scenarioId} 有未保存或未确认的 pagedata 修改`))
    expect(draft.hasEditingChanges()).toBe(true)
    expect(httpPut).not.toHaveBeenCalled()
    expect(assembled.every(dataSet => dataSet.destroyed)).toBe(true)
    expect(savedVersions.has('orders-page-node')).toBe(false)
    if (phase === 'pointer') {
     expect(save).toHaveBeenCalledOnce()
     expect(designVersions.size).toBeGreaterThan(0)
    } else {
     expect(save).not.toHaveBeenCalled()
     expect(designVersions.size).toBe(0)
    }
    expect(scenarioCreateCalls).toEqual([])
   } finally {wrapper.unmount()}
  })

  it('checks an independently confirmed working source immediately before Plan pointer submission', async () => {
   configurePublicationSources('Dataset Plan')
   const {page, state, save, wrapper} = await openPublication('[]')
   const original = fixtureText(20)
   const remote = new Map([['scenario:scene', original]])
   httpGet.mockImplementation(async (url: string) => ({content: remote.get(url) ?? (url.endsWith('/rule.json') ? '[]' : '')}))
   httpPut.mockImplementation(async (url: string, payload: {content: string}) => {remote.set(url, payload.content)})
   try {
    await state.loadSelectedScenarioViews()
    const workspace = state.editor
    const design = workspace.getScenarioDefinitions('scene')?.getView('DataViewDefinition')
    const baseline = workspace.getScenarioViews('scene')
    if (!design || !baseline) throw new Error('Original loaded definition is missing')
    expect(baseline.savedText).toBe(original)
    const view = state.blueprintWorkspaceDataView.value!.view
    const apply = view.applyEditingRows.bind(view)
    vi.spyOn(view, 'applyEditingRows').mockImplementationOnce(async ids => {
     const result = await apply(ids)
     await state.writeScenarioViewText(fixtureText(66))
     await state.saveScenarioViewText()
     expect(design.hasEditingChanges()).toBe(false)
     return result
    })
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(state.statusMessages.value.map(message => message.text).join('\n'))
     .toContain('场景 scene 的工作来源在发布期间已保存变更'))
    expect(JSON.parse(remote.get('scenario:scene') ?? '')).toMatchObject({tables:{Orders:{views:{default:{pageSize:66}}}}})
    expect(httpPut.mock.calls.filter(([key]) => key === 'scenario:scene')).toHaveLength(1)
    expect(design.hasEditingChanges()).toBe(false)
    expect(save).toHaveBeenCalledOnce()
    expect(designVersions.size).toBeGreaterThan(0)
    expect(savedVersions.has('orders-page-node')).toBe(false)
   } finally {wrapper.unmount()}
  })

  it.each(['pagedata', 'Dataset Plan'])('rejects an unavailable named view before writing snapshots with %s', async kind => {
   const {assembled, sources} = configurePublicationSources(kind)
   const rule = JSON.stringify([{id:'dialog', type:'r-dialog', props:{dataViewKey:'Orders@default',
    footer:{children:[{id:'select', type:'r-select', props:{optionDataViewKey:'extra@Orders@unavailable'}}]},
   }}])
   const {page, state, save, wrapper} = await openPublication(rule)
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join('\n')
    await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect(status()).toContain('页面绑定的视图不存在: extra@Orders@unavailable')
    expect(designVersions.size).toBe(0)
    expect(scenarioVersions.size).toBe(0)
    expect(designWorking.size).toBe(0)
    expect(save).not.toHaveBeenCalled()
    expect(assembled).toHaveLength(2)
    expect(assembled.every(dataSet => dataSet.destroyed)).toBe(true)
    if (kind === 'Dataset Plan') {
     expect(assemblePlan.mock.calls.map(([input]) => [input.scenarioId, input.text])).toEqual([...sources])
     expect(previewLoad).not.toHaveBeenCalled()
    }
   } finally {wrapper.unmount()}
  })

  it.each(['pagedata', 'Dataset Plan'])('rejects an invalid captured script before writing with %s', async kind => {
   const {assembled} = configurePublicationSources(kind)
   const {page, state, save, wrapper} = await openPublication('[]', 'function broken( {')
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join('\n')
    await vi.waitFor(() => expect(status()).toContain('交付保存失败'))
    expect(status()).toContain('orders-page 的 script.js')
    expect(designVersions.size).toBe(0)
    expect(scenarioVersions.size).toBe(0)
    expect(designWorking.size).toBe(0)
    expect(assembled).toHaveLength(0)
    expect(save).not.toHaveBeenCalled()
   } finally {wrapper.unmount()}
  })

  it.each(['pagedata', 'Dataset Plan'])('checks captured script syntax without executing it before publication with %s', async kind => {
   configurePublicationSources(kind)
   const script = 'throw new Error("publication must not execute this"); function __init__() {}'
   const {page, state, save, wrapper} = await openPublication('[]', script)
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join('\n')
    await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect(status()).toContain('发布指针已一次切换并读回')
    expect([...designVersions.values()]).toContain(script)
    expect(save).toHaveBeenCalledOnce()
   } finally {wrapper.unmount()}
  })

  it('publishes a valid local binding and additional graph sources from the captured pagedata', async () => {
   const assembled = configurePagedataAssembly()
   const rule = JSON.stringify([{id:'graph', type:'r-graph', props:{
    dataViewKey:'Orders@default', edgeDataViewKey:'extra@Orders@default',
    additionalNodeSources:[{dataViewKey:'extra@Orders@default'}],
   }}])
   const {page, state, save, wrapper} = await openPublication(rule)
   try {
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(state.statusMessages.value.map(message => message.text).join('\n'))
     .toContain('发布指针已一次切换并读回'))
    expect(previewLoad.mock.calls.map(([input]) => [input.scenarioId, input.config.toJSON().tables.Orders.views.default.pageSize]))
     .toEqual([['scene', 20], ['extra', 20]])
    expect(assembled).toHaveLength(2)
    expect(assembled.every(dataSet => dataSet.destroyed)).toBe(true)
    expect([...scenarioVersions.keys()]).toEqual(['scene', 'extra'])
    expect([...designVersions.values()]).toContain(rule)
    expect(save).toHaveBeenCalledOnce()
    expect(savedVersions.get('orders-page-node')).toBe('r=1;s=1;t=1;m=1')
   } finally {wrapper.unmount()}
  })


  const missingView = 'extra@Orders@missing'
  const viewBindingCases = [
   {name:'mention trigger', node:{type:'r-mention', props:{field:'id', mentionTriggers:[
     {prefix:'@', split:' ', options:{dataViewKey:'Orders@default'}},
     {prefix:'#', split:' ', options:{dataViewKey:missingView}},
   ]}}},
   {name:'popover content', node:{type:'r-popover', props:{contentChildren:[{type:'r-form', props:{dataViewKey:missingView}}]}}},
   {name:'field header', node:{type:'r-table', props:{dataViewKey:'Orders@default'}, children:[
    {type:'r-text', props:{field:'id',header:{type:'r-form',props:{dataViewKey:missingView}}}},
   ]}},
   {name:'original simple header', node:{type:'r-form',props:{header:{dataViewKey:missingView}}}},
   {name:'nested JSON form option', node:{type:'r-json', props:{field:'id',mode:'form',schema:{
    properties:{outer:{type:'object',properties:{choice:{type:'string','x-optionDataViewKey':missingView}}}},
   }}}},
   {name:'JSON form array option', node:{type:'r-json',props:{field:'id',mode:'form',schema:{
    properties:{choices:{type:'array',items:{type:'string'},'x-optionDataViewKey':missingView}},
   }}}},
  ]
  it.each(['pagedata', 'Dataset Plan'].flatMap(kind => viewBindingCases.map(entry => ({kind,...entry}))))
   ('checks the published $name before writing with $kind', async ({kind,node}) => {
   configurePublicationSources(kind)
   const rule = JSON.stringify([{type:'r-form',props:{dataViewKey:'Orders@default'},children:[node]}])
   const {page, state, save, wrapper} = await openPublication(rule)
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join(' ')
    await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect({wrotePointer:save.mock.calls.length, toolVersions:designVersions.size, scenarioVersions:scenarioVersions.size,
     workingFiles:designWorking.size, status:status()}).toEqual({
     wrotePointer:0, toolVersions:0, scenarioVersions:0, workingFiles:0,
     status:expect.stringContaining('页面绑定的视图不存在: extra@Orders@missing'),
    })
   } finally {wrapper.unmount()}
  })

  it.each(['pagedata', 'Dataset Plan'].flatMap(kind => ['Orders@default', '', null].map(key => ({kind,key}))))
   ('checks the published JSON option requires a complete key $key with $kind', async ({kind,key}) => {
   configurePublicationSources(kind)
   const rule = JSON.stringify([{type:'r-json',props:{field:'id',mode:'form',schema:{
    properties:{choice:{type:'string','x-optionDataViewKey':key}},
   }}}])
   const {page,state,save,wrapper} = await openPublication(rule)
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join(' ')
    await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect(status()).toContain('JSON_OPTION_VIEW: 选项必须使用完整数据视图键')
    expect([designVersions.size,scenarioVersions.size,designWorking.size,save.mock.calls.length]).toEqual([0,0,0,0])
   } finally {wrapper.unmount()}
  })

  it.each(['pagedata', 'Dataset Plan'])('publishes declared view bindings and preserves ordinary business data with %s', async kind => {
   configurePublicationSources(kind)
   const trigger = {prefix:'@', split:' ', options:{dataViewKey:'extra@Orders@default'}}
   const business = {'x-optionDataViewKey':'business-value'}
   const excluded = {properties:{choice:{type:'string',...business}}}
   const rule = JSON.stringify([{type:'r-form', props:{dataViewKey:'Orders@default'}, children:[
    {type:'r-mention', props:{field:'id', mentionTriggers:[trigger]}},
    {type:'r-popover', props:{contentChildren:[{type:'r-form',props:{dataViewKey:'Orders@default'}}]}},
    {type:'r-table',props:{dataViewKey:'Orders@default'},children:[{type:'r-text',props:{field:'id',
     header:{type:'r-form',props:{dataViewKey:'extra@Orders@default'}}}}]},
    {type:'r-json',props:{mode:'form',field:'id',schema:{...business,properties:{
     outer:{type:'object',...business,properties:{choice:{type:'string','x-optionDataViewKey':'extra@Orders@default',
      default:business,examples:[business],enum:[business],oneOf:[business]}}},
     choices:{type:'array',items:{type:'string',...business},'x-optionDataViewKey':'extra@Orders@default'},
    }}}},
    {type:'r-json',props:{mode:'properties',field:'id',schema:excluded}},
    {type:'r-json',props:{mode:'form',dataMember:'rows',dataViewKey:'Orders@default',schema:excluded}},
    {type:'r-section',props:{header:{type:'r-header',props:{dataViewKey:'business-value'},
     children:[{type:'r-form',props:{dataViewKey:'extra@Orders@default'}}]}}},
    {type:'r-button', props:{action:'host-command', command:'fixture.read',
     input:{mentionTriggers:[{...trigger, options:{dataViewKey:'business-value'}}],
      header:{type:'r-form',props:{dataViewKey:'business-value'}}, schema:excluded,
      contentChildren:[{type:'r-form',props:{dataViewKey:'business-value'}}]}}},
   ]}])
   const {page, state, save, wrapper} = await openPublication(rule)
   try {
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(state.statusMessages.value.map(message => message.text).join(' '))
     .toContain('发布指针已一次切换并读回'))
    expect([...designVersions.values()]).toContain(rule)
    expect(save).toHaveBeenCalledOnce()
   } finally {wrapper.unmount()}
  })

  const uncoveredLocations = [
   {type:'r-filter-expression', property:'columnDataViewKey'},
   {type:'r-filter-expression', property:'inputParameterDataViewKey'},
   {type:'r-value-function', property:'inputParameterDataViewKey'},
   {type:'r-value-function', property:'publicParameterDataViewKey'},
   {type:'r-button', property:'resultDataViewKey'},
  ]
  const sourceKinds = ['pagedata', 'Dataset Plan']
  it.each(sourceKinds.flatMap(kind => uncoveredLocations.map(location => ({kind, ...location}))))
   ('rejects a missing $type $property before writing with $kind', async ({kind, type, property}) => {
    configurePublicationSources(kind)
    const props = {[property]:'extra@Orders@missing', ...(type === 'r-button' ? {action:'host-command', command:'fixture.read'} : {})}
    const {page, state, save, wrapper} = await openPublication(JSON.stringify([{id:'binding', type, props}]))
    try {
     page.actions.value.saveDelivery()
     const status = () => state.statusMessages.value.map(message => message.text).join('\n')
     await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
     expect(status()).toContain('页面绑定的视图不存在: extra@Orders@missing')
     expect(designVersions.size).toBe(0)
     expect(scenarioVersions.size).toBe(0)
     expect(designWorking.size).toBe(0)
     expect(save).not.toHaveBeenCalled()
    } finally {wrapper.unmount()}
   })

  it.each([
   {type:'r-button', props:{on:{click:{action:'refresh', dataViewKey:'extra@Orders@missing'}}}},
   {type:'r-button', props:{action:'show-message', message:'confirm',
     then:{action:'host-command', command:'fixture.read', resultDataViewKey:'extra@Orders@missing'}}},
  ])('rejects a missing declared event view before writing', async ({type,props}) => {
   configurePublicationSources('pagedata')
   const {page, state, save, wrapper} = await openPublication(JSON.stringify([{id:'binding',type,props}]))
   try {
    page.actions.value.saveDelivery()
    const status = () => state.statusMessages.value.map(message => message.text).join('\n')
    await vi.waitFor(() => expect(status()).toMatch(/交付保存失败|发布指针已一次切换并读回/))
    expect(status()).toContain('页面绑定的视图不存在: extra@Orders@missing')
    expect(designVersions.size).toBe(0)
    expect(scenarioVersions.size).toBe(0)
    expect(designWorking.size).toBe(0)
    expect(save).not.toHaveBeenCalled()
   } finally {wrapper.unmount()}
  })

  it.each(['landed', 'landed-with-plan', 'missing', 'mismatched', 'corrupt'] as const)('verifies the original scenario attempt after a working file change, %s',
   async outcome => {
    configurePublicationSources('pagedata')
    loseScenarioReceipt.add('scene')
    const first = await openPublication('[]', 'function previous() {}')
    const status = () => first.state.statusMessages.value.map(message => message.text).join('\n')
    first.page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(status()).toContain('scenario snapshot receipt lost'))
    const scenario = scenarioVersions.get('scene')
    const priorVersion = scenario ? [...scenario.keys()][0] : undefined
    if (scenario === undefined || priorVersion === undefined) throw Error('fixture original scenario version is absent')
    const originalToolVersions = [...designVersions]
    expect(scenarioCreateCalls).toEqual([`scene/${priorVersion}`])
    expect(designWorking.size).toBe(0)
    const key = Object.keys(sessionStorage).find(name => name.includes('spark:page-tool-publication:v1'))
    if (key === undefined) throw Error('fixture publication key is absent')
    const originalJournal = sessionStorage.getItem(key)
    if (originalJournal === null) throw Error('fixture original publication journal is absent')
    const originalScenarioText = scenario.get(priorVersion)
    if (originalScenarioText === undefined) throw Error('fixture original bytes are absent')
    if (outcome === 'missing') scenario.delete(priorVersion)
    if (outcome === 'mismatched') scenario.set(priorVersion, fixtureText(21))
    if (outcome === 'corrupt') scenario.set(priorVersion, 'invalid scenario fixture JSON')
    const originalMatches = outcome === 'landed' || outcome === 'landed-with-plan'
    try {
     httpGet.mockImplementation(async (url: string) => ({content: url.startsWith('scenario:')
      ? fixtureText(20).replaceAll('"scene"', JSON.stringify(url.slice('scenario:'.length)))
      : url.endsWith('/rule.json') ? '[]' : url.endsWith('/script.js') ? 'function newer() {}' : ''}))
     const scriptView = await first.state.loadPageToolFileDataView({pageId:'orders-page',fileName:'script.js'})
     await scriptView.refresh()
     expect(scriptView.currentRow?.['text']).toBe('function newer() {}')
     if (outcome === 'landed-with-plan') configurePublicationSources('Dataset Plan')
     const priorStatuses = new Set(first.state.statusMessages.value)
     const reopenedStatus = () => first.state.statusMessages.value.filter(message => !priorStatuses.has(message)).map(message => message.text).join('\n')
     first.page.actions.value.saveDelivery()
     await vi.waitFor(() => expect(reopenedStatus()).toMatch(/原场景快照已核验|交付保存失败|发布指针已一次切换并读回/))
     expect([...designVersions]).toEqual(originalToolVersions)
     expect(scenarioCreateCalls).toEqual([`scene/${priorVersion}`])
     expect(designWorking.size).toBe(0)
     expect(first.save).not.toHaveBeenCalled()
     if (!originalMatches) {
      expect(sessionStorage.getItem(key)).toBe(originalJournal)
      const expected = {missing:'原快照仍待核验', mismatched:'原快照与本次发布内容不符', corrupt:'JSON'}
      expect(reopenedStatus()).toContain(expected[outcome])
      return
     }
     expect(reopenedStatus()).toContain('原场景快照已核验')
     expect(sessionStorage.getItem(key)).not.toBe(originalJournal)
     first.page.actions.value.saveDelivery()
     await vi.waitFor(() => expect(reopenedStatus()).toContain('发布指针已一次切换并读回'))
     expect(first.save).toHaveBeenCalledOnce()
     expect(scenarioCreateCalls.filter(entry => entry === `scene/${priorVersion}`)).toHaveLength(1)
     if (outcome === 'landed-with-plan') expect(scenarioCreateCalls).toEqual([`scene/${priorVersion}`])
     expect([...designVersions.values()]).toContain('function newer() {}')
    } finally {
     scenario.set(priorVersion, originalScenarioText)
     const dataSet = await first.state.editor.loadScenarioDefinitions({scenarioId:'scene'})
     const view = dataSet.getView('DataViewDefinition')
     if (view?.getSourceHistoryStatus().state === 'unknown') {
      await view.verifySourceHistoryAttempt()
      view.acknowledgeSourceHistoryAttempt()
     }
     first.wrapper.unmount()
    }
   })

  it('stops before writing when the captured tool changes during assembly', async () => {
   const {page, state, save, wrapper} = await openPublication('[]')
   const ruleView = await state.loadPageToolFileDataView({pageId:'orders-page', fileName:'rule.json'})
   const row = ruleView.currentRow
   const rowId = row ? ruleView.getPkKey(row) : undefined
   if (rowId === undefined) throw new Error('fixture tool file has no row key')
   const assembled = configurePagedataAssembly()
   previewLoad.mockImplementationOnce(async ({scenarioId}: {scenarioId: string}) => {
    await ruleView.editRowById(rowId, {text:'[ ]'})
    const dataSet = scenario(scenarioId)
    assembled.push(dataSet)
    return {dataSet}
   })
   try {
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(state.statusMessages.value.map(message => message.text).join('\n'))
     .toContain('rule.json 存在未保存的文件 DataView 修改'))
    expect(assembled).toHaveLength(2)
    expect(assembled.every(dataSet => dataSet.destroyed)).toBe(true)
    expect(designVersions.size).toBe(0)
    expect(scenarioVersions.size).toBe(0)
    expect(designWorking.size).toBe(0)
    expect(save).not.toHaveBeenCalled()
   } finally {wrapper.unmount()}
  })

  it('verifies a pending original snapshot before checking the next new write', async () => {
   configurePagedataAssembly()
   const rule = JSON.stringify([{id:'table', type:'r-table', props:{dataViewKey:'Orders@default'}}])
   const {page, state, save, wrapper} = await openPublication(rule)
   const ruleView = await state.loadPageToolFileDataView({pageId:'orders-page', fileName:'rule.json'})
   const createSourceVersion = ruleView.createSourceVersion.bind(ruleView)
   const create = vi.spyOn(ruleView, 'createSourceVersion').mockImplementationOnce(async notify => {
    await createSourceVersion(notify)
    throw new Error('fixture lost original rule snapshot receipt')
   })
   const readback = vi.spyOn(ruleView, 'previewSourceVersion')
   const status = () => state.statusMessages.value.map(message => message.text).join('\n')
   try {
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(status()).toContain('fixture lost original rule snapshot receipt'))
    expect([...designVersions.values()]).toEqual([rule])
    readback.mockClear()
    previewLoad.mockImplementation(async ({scenarioId}: {scenarioId: string}) => ({dataSet:DataSet.fromJson({scenarioId, tables:{}})}))
    page.actions.value.saveDelivery()
    await vi.waitFor(() => expect(status()).toContain('页面绑定的视图不存在: scene@Orders@default'))
    expect(readback).toHaveBeenCalledWith(1)
    expect(create).toHaveBeenCalledOnce()
    expect([...designVersions.values()]).toEqual([rule])
    expect(scenarioVersions.size).toBe(0)
    expect(save).not.toHaveBeenCalled()
   } finally {wrapper.unmount()}
  })
 })
 it.each(['same','cold','cold-missing','cold-mismatch','cold-recovered'] as const)('resumes a partial publication with the original confirmed snapshot, %s workspace',async kind=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':''}))
  const writes = new Map<string, number>()
  const reads = vi.fn(async (name: string) => name === 'rule.json' ? '[]' : (name === 'script.js' && kind === 'cold-mismatch' ? 'different bytes' : ''))
  let rejectScript = true
  async function open() {
   const state=createDevStateWithConfigPages()
   await selectPreviewNode(state,undefined,true)
   await ensureDevStateActivePageLoaded(state)
   const owner=state.blueprintWorkspaceDataView.value!
   const save=vi.spyOn(owner,'saveSelectedNode')
   for (const fileName of state.pageFileNames) {
    const view=await state.loadPageToolFileDataView({pageId:'orders-page',fileName})
    vi.spyOn(view,'acknowledgeSourceHistoryAttempt').mockImplementation(()=>{})
    vi.spyOn(view,'previewSourceVersion').mockImplementation(()=>reads(fileName))
    vi.spyOn(view,'listSourceVersions').mockImplementation(async()=>kind === 'cold-missing' ? [] : [{version:1,label:`1__${fileName}`,lastModified:null}])
    vi.spyOn(view,'createSourceVersion').mockImplementation(async notify=>{
     if (fileName==='script.js' && rejectScript && (kind==='same'||kind==='cold')) {rejectScript=false;throw new Error('script upload rejected')}
     const version=(writes.get(fileName)??0)+1
     const result={version,fileName:`${version}__${fileName}`,message:null}
     notify?.({...result,state:'pending'})
     writes.set(fileName,version)
     if (fileName==='script.js' && rejectScript) {rejectScript=false;throw new Error('script receipt lost')}
     return {...result,state:'confirmed'}
    })
   }
   let page!:ReturnType<typeof usePageDesign>
   const wrapper=mount(defineComponent({setup(){page=usePageDesign(state);return ()=>h('div')}}))
   return {wrapper,state,page,save,owner}
  }
  let stage=await open()
  try {
   stage.page.actions.value.saveDelivery()
   const dispatched = kind !== 'same' && kind !== 'cold'
   await vi.waitFor(()=>expect(stage.state.statusMessages.value.map(status=>status.text).join('\n')).toContain(dispatched?'script receipt lost':'script upload rejected'))
   expect(stage.save).not.toHaveBeenCalled()
   expect(stage.owner.value('VersionId')).toBe('')
   expect(Object.fromEntries(writes)).toEqual(dispatched ? {'rule.json':1,'script.js':1} : {'rule.json':1})
   if (kind!=='same') {
    const original=stage.owner
    stage.wrapper.unmount()
    stage=await open()
    expect(stage.owner).not.toBe(original)
   }
   stage.page.actions.value.saveDelivery()
   if (kind==='cold-missing' || kind==='cold-mismatch') {
    await vi.waitFor(()=>expect(stage.state.statusMessages.value.map(status=>status.text).join('\n')).toContain(
     kind==='cold-missing'?'原快照仍待核验':'原快照与本次发布内容不符'))
    expect(Object.fromEntries(writes)).toEqual({'rule.json':1,'script.js':1})
    expect(stage.save).not.toHaveBeenCalled()
    return
   }
   await vi.waitFor(()=>expect(stage.state.statusMessages.value.map(status=>status.text).join('\n')).toContain('发布指针已一次切换并读回'))
   expect(stage.save).toHaveBeenCalledTimes(1)
   expect(stage.owner.row?.['VersionId']).toBe('r=1;s=1;t=1;m=1')
   expect(Object.fromEntries(writes)).toEqual({'rule.json':1,'script.js':1,'style.css':1})
   expect(reads).toHaveBeenCalledWith('rule.json')
  } finally {stage.wrapper.unmount()}
 })
 it('rejects an undeclared rule binding before loading any preview scenario',async()=>{
  const rule=JSON.stringify([{type:'r-select',props:{optionDataViewKey:'extra@Orders@default'}}])
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?rule:''}))
  const state=createDevStateWithConfigPages()
  await selectPreviewNode(state)
  await ensureDevStateActivePageLoaded(state)
  const wrapper=shallowMount(DevPreviewTab,{props:{state}})
  try {
   await flushPromises()
   expect(wrapper.findAllComponents({name:'DisplayAlert'}).some(alert=>
    String(alert.props('description')).includes('引用了未声明的数据空间'))).toBe(true)
   expect(previewLoad).not.toHaveBeenCalled()
  } finally {wrapper.unmount()}
 })
 it.each(['same','cold','cold-unknown'] as const)('recovers a publication pointer according to its original receipt, %s workspace',async kind=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':''}))
  const state=createDevStateWithConfigPages()
  await selectPreviewNode(state,undefined,true)
  const call=previewCalls.get('orders-page-node')!
  if(kind==='cold-unknown') call.loseReceipt=true
  else call.failReadback=true
  await ensureDevStateActivePageLoaded(state)
  const owner=state.blueprintWorkspaceDataView.value!
  for (const fileName of state.pageFileNames) {
   const view=await state.loadPageToolFileDataView({pageId:'orders-page',fileName})
   vi.spyOn(view,'acknowledgeSourceHistoryAttempt').mockImplementation(()=>{})
   vi.spyOn(view,'createSourceVersion').mockImplementation(async notify => {
    const attempt={version:1,fileName:`1__${fileName}`,message:null}
    notify?.({...attempt,state:'pending'})
    return {...attempt,state:'confirmed'}
   })
  }
  const save=vi.spyOn(owner.dataSet,'saveChanges')
  let page!:ReturnType<typeof usePageDesign>
  let wrapper=mount(defineComponent({setup(){page=usePageDesign(state);return ()=>h('div')}}))
  try {
   page.actions.value.saveDelivery()
   await vi.waitFor(()=>expect(state.statusMessages.value.map(status=>status.text).join('\n')).toContain(
    kind==='cold-unknown'?'publication receipt lost':'publication readback interrupted'))
   expect(page.canVerifyPendingWrites.value).toBe(true)
   expect(save).toHaveBeenCalledTimes(2)
   if(kind==='same'){
    page.verifyPendingWrites()
    await vi.waitFor(()=>expect(state.statusMessages.value.map(status=>status.text).join('\n')).toContain('发布指针已一次切换并读回'))
   }else{
    wrapper.unmount()
    httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':'working content changed since publication'}))
    const reopened=createDevStateWithConfigPages()
    await selectPreviewNode(reopened,undefined,true)
    await ensureDevStateActivePageLoaded(reopened)
    const fresh=reopened.blueprintWorkspaceDataView.value!
    expect(fresh).not.toBe(owner)
    expect(fresh.row?.['VersionId']).toBe('r=1;s=1;t=1;m=1')
    const newSave=vi.spyOn(fresh.dataSet,'saveChanges')
    const files=vi.spyOn(reopened,'loadPageToolFileDataView')
    const readback=vi.spyOn(fresh,'rereadSelectedNode')
    wrapper=mount(defineComponent({setup(){page=usePageDesign(reopened);return ()=>h('div')}}))
    page.actions.value.saveDelivery()
    await vi.waitFor(()=>expect(reopened.statusMessages.value.map(status=>status.text).join('\n')).toContain(
     kind==='cold-unknown'?'尚无权威回执':'发布指针已一次切换并读回'))
    expect(newSave).not.toHaveBeenCalled()
    expect(files).not.toHaveBeenCalled()
    expect(readback).toHaveBeenCalledTimes(kind==='cold-unknown'?0:1)
   }
   expect(save).toHaveBeenCalledTimes(2)
   expect(savedVersions.get('orders-page-node')).toBe('r=1;s=1;t=1;m=1')
  } finally {wrapper.unmount()}
 })
 it('keeps the preview route snapshot aligned with the main and additional runtime spaces',async()=>{
  const rule=JSON.stringify([{id:'field',type:'r-select',props:{
   dataViewKey:'Orders@default',optionDataViewKey:'extra & space@Orders@default',edgeDataViewKey:'third@Orders@default',
  }}])
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')
   ?fixtureText(20).replaceAll('"scene"',JSON.stringify(url.slice('scenario:'.length))):url.endsWith('/rule.json')?rule:''}))
  previewLoad.mockImplementation(async({scenarioId}:{scenarioId:string})=>({dataSet:DataSet.fromJson({scenarioId,tables:{Internal:{
   modelBinding:{modelId:'orders-model',modelName:'Orders'},columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{}},
  }}})}))
  const state=createDevStateWithConfigPages([], '')
  const node=sceneNode()
  node.navigation!.target='cfg:orders-page?additionalScenarioIds=extra+%26+space&additionalScenarioIds=third'
  previewCalls.set(node.nodeId, {target:node.navigation!.target,main:'scene'})
  state.project.replaceBlueprintChildren([node]);await state.selectNode(node)
  await ensureDevStateActivePageLoaded(state)
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  try {
   await flushPromises()
   const renderer=wrapper.findComponent(Renderer)
   const runtime=renderer.props('pageRuntime')
   if (!(runtime instanceof PageRuntime)) throw new Error('preview runtime missing')
   expect(runtime.call.scenarioIds).toEqual(['scene','extra & space','third'])
   const snapshot=renderer.props('routeSnapshot')
   expect(snapshot).toMatchObject({
    path:'/apps/homepage/__page/orders-page-node',
    fullPath:'/apps/homepage/__page/orders-page-node?scenarioId=scene&additionalScenarioIds=extra+%26+space&additionalScenarioIds=third',
    query:{scenarioId:'scene',additionalScenarioIds:['extra & space','third']},
   })
   expect(Object.isFrozen(snapshot.query.additionalScenarioIds)).toBe(true)
   expect(httpPut).not.toHaveBeenCalled()
  } finally {wrapper.unmount()}
 })
 it('invalidates an in-flight file preview immediately across same-page node ABA',async()=>{
  vi.useFakeTimers()
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':''}))
  const state=createDevStateWithConfigPages()
  await selectPreviewNode(state)
  await ensureDevStateActivePageLoaded(state)
  const read=state.loadPageToolFileDataView
  let release:()=>void=()=>{}
  const pending=new Promise<void>(resolve=>{release=resolve})
  vi.spyOn(state,'loadPageToolFileDataView').mockImplementationOnce(async input=>{await pending;return read(input)})
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  try {
   await flushPromises()
   const nodeId=state.selectedNode.value!.nodeId,pageId=state.activePageId.value
   state.project.selectNode(null);state.project.selectNode(nodeId)
   expect(state.activePageId.value).toBe(pageId)
   release();await flushPromises()
   expect(wrapper.findComponent(Renderer).exists()).toBe(false)
   await vi.advanceTimersByTimeAsync(600);await flushPromises()
   expect(wrapper.findComponent(Renderer).exists()).toBe(true)
  } finally {release();wrapper.unmount()}
 })
 it('destroys late scenario data when a preview target changes before the live debounce',async()=>{
  vi.useFakeTimers()
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):url.endsWith('/rule.json')?'[]':''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  await ensureDevStateActivePageLoaded(state)
  let release:(value:{dataSet:DataSet})=>void=()=>{}
  previewLoad.mockImplementationOnce(()=>new Promise<{dataSet:DataSet}>(resolve=>{release=resolve}))
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  const late=DataSet.fromJson({scenarioId:'scene',tables:{}})
  try {
   await flushPromises();expect(previewLoad).toHaveBeenCalledTimes(1)
   state.project.selectNode(null);state.project.selectNode(sceneNode().nodeId)
   release({dataSet:late});await flushPromises()
   expect(wrapper.findComponent(Renderer).exists()).toBe(false)
   expect(late.destroyed).toBe(true)
  } finally {release({dataSet:late});wrapper.unmount()}
 })
 it('keeps the dirty business preview accessible when a refresh is blocked',async()=>{
  vi.useFakeTimers()
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):url.endsWith('/rule.json')?'[]':''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  await ensureDevStateActivePageLoaded(state)
  const business=DataSet.fromJson({scenarioId:'scene',tables:{Orders:{resourceType:'static-data',
   columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'title',type:'string'}],
   views:{default:{commitMode:'staged',rows:[{id:'order',title:'saved'}]}}}}})
  previewLoad.mockResolvedValueOnce({dataSet:business}).mockImplementation(async()=>({dataSet:DataSet.fromJson({scenarioId:'scene',tables:{}})}))
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  let previewPending=()=>false
  const registerPreviewGuard=(guard:()=>boolean)=>{previewPending=guard;return ()=>{previewPending=()=>false}}
  const wrapper=mount(DevPreviewTab,{props:{state,refreshToken:0,registerPreviewGuard},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  try {
   await flushPromises()
   const runtime=wrapper.findComponent(Renderer).props('pageRuntime') as PageRuntime
   expect(wrapper.findComponent(Renderer).props('routeSnapshot')).toMatchObject({
    path:'/apps/homepage/__page/orders-page-node',
    fullPath:'/apps/homepage/__page/orders-page-node?scenarioId=scene',
    query:{scenarioId:'scene'},
   })
   const view=business.getView('Orders')!
   view.updateEditingValue('order','title','unsaved')
   expect(runtime.isDirty).toBe(true)
   expect(state.hasAnyDirty.value).toBe(true)
   await vi.advanceTimersByTimeAsync(600);await flushPromises()
   expect(runtime.configPending).toBe(false)
   expect(previewLoad).toHaveBeenCalledTimes(1)
   await wrapper.setProps({refreshToken:1});await flushPromises()
   expect(runtime.destroyed).toBe(false)
   expect(view.getEditingPatch('order')).toEqual({title:'unsaved'})
   expect(wrapper.findComponent(Renderer).exists()).toBe(true)
   expect(wrapper.findComponent(Renderer).props('pageRuntime')).toBe(runtime)
   expect(wrapper.findAllComponents({name:'DisplayAlert'}).some(alert=>String(alert.props('description')).includes('未保存'))).toBe(true)
   view.discardEditingRows()
   expect(runtime.isDirty).toBe(false)
   expect(previewPending()).toBe(false)
   view.mutating=true
   view.events.emit('mutatingChanged',true)
   expect(previewPending()).toBe(true)
   expect(state.hasAnyDirty.value).toBe(true)
   await wrapper.setProps({refreshToken:2});await flushPromises()
   expect(runtime.destroyed).toBe(false)
   view.mutating=false
   const unconfirmed=vi.spyOn(view,'hasUnconfirmedSave','get').mockReturnValue(true)
   view.events.emit('mutatingChanged',false)
   expect(runtime.isDirty).toBe(true)
   expect(previewPending()).toBe(true)
   expect(state.hasAnyDirty.value).toBe(true)
   await wrapper.setProps({refreshToken:3});await flushPromises()
   expect(runtime.destroyed).toBe(false)
   unconfirmed.mockRestore()
   view.events.emit('mutatingChanged',false)
   expect(runtime.isDirty).toBe(false)
   expect(previewPending()).toBe(false)
   await wrapper.setProps({refreshToken:4});await flushPromises()
   expect(runtime.destroyed).toBe(true)
  } finally {wrapper.unmount()}
 })
 it('previews the latest file draft when it changes during scenario loading',async()=>{
  vi.useFakeTimers()
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):url.endsWith('/rule.json')?'[]':url.endsWith('/script.js')?'console.log("old")':''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  await ensureDevStateActivePageLoaded(state)
  let release:(value:{dataSet:DataSet})=>void=()=>{}
  previewLoad.mockImplementationOnce(()=>new Promise<{dataSet:DataSet}>(resolve=>{release=resolve}))
    .mockImplementation(async()=>({dataSet:DataSet.fromJson({scenarioId:'scene',tables:{}})}))
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state},global:{stubs:{DisplayAlert:true,DisplayEmpty:true,FieldSwitch:true,RendererButton:true,SparkPageRenderer:Renderer}}})
  const late=DataSet.fromJson({scenarioId:'scene',tables:{}})
  try {
   await flushPromises();expect(previewLoad).toHaveBeenCalledTimes(1)
   const view=await state.loadPageToolFileDataView({pageId:'orders-page',fileName:'script.js'})
   view.updateEditingValue(view.getPkKey(view.currentRow!)!,'text','console.log("latest")')
   state.notifyExternalDataViewChanged()
   await vi.advanceTimersByTimeAsync(600);await flushPromises()
   release({dataSet:late});await flushPromises()
   const runtime=wrapper.findComponent(Renderer).props('pageRuntime') as PageRuntime
   expect(runtime.tool.getFileText('script.js')).toBe('console.log("latest")')
   expect(late.destroyed).toBe(true)
  } finally {release({dataSet:late});wrapper.unmount()}
 })
 it('binds real preview switches to the editor DataView and releases only its own input table',async()=>{
  vi.useFakeTimers()
  httpGet.mockImplementation(async(url:string)=>({content:url.endsWith('/rule.json')?'[]':''}))
  const state=createDevStateWithConfigPages()
  await selectPreviewNode(state)
  await ensureDevStateActivePageLoaded(state)
  const owner=state.blueprintWorkspaceDataView.value!,runtime=state.blueprintPageRuntime.value!
  const tablesBefore=Object.keys(owner.dataSet.tables).sort()
  const Renderer=defineComponent({name:'SparkPageRenderer',props:['pageRuntime','routeSnapshot'],template:'<div />'})
  const wrapper=mount(DevPreviewTab,{props:{state,refreshToken:0},global:{plugins:[ElementPlus,Spark.createPlugin({registry:Spark.createRegistry()})],stubs:{SparkPageRenderer:Renderer}}})
  try {
   await flushPromises()
   const form=wrapper.findComponent({name:'RendererForm'})
   expect(form.exists()).toBe(true)
   const view=runtime.resolveView(String(form.props('dataViewKey')))!
   expect(view.dataTable).toBe(owner.dataSet.getTable(view.tableName))
   const fields=wrapper.findAllComponents({name:'FieldSwitch'})
   expect(fields).toHaveLength(2)
   for(const field of fields){
    const name=String(field.props('dataField')),row=view.currentRow!,id=view.getPkKey(row)!
    expect((view.getEditingRow(id)??row)[name]).toBe(true)
    const control=field.findComponent({name:'ElSwitch'})
    expect(control.props('disabled')).toBe(false)
    control.vm.$emit('update:modelValue',false)
    await flushPromises()
    expect(view.getEditingRow(id)?.[name]).toBe(false)
   }
   const original=wrapper.findComponent(Renderer).props('pageRuntime')
   await wrapper.setProps({refreshToken:1});await flushPromises()
   expect(wrapper.findComponent(Renderer).props('pageRuntime')).toBe(original)
   state.projectRevision.value++
   const file=await state.loadPageToolFileDataView({pageId:'orders-page',fileName:'script.js'})
   file.updateEditingValue(file.getPkKey(file.currentRow!)!,'text','console.log("manual preview")')
   state.notifyExternalDataViewChanged()
   await vi.advanceTimersByTimeAsync(600);await flushPromises()
   const currentForm=wrapper.findComponent({name:'RendererForm'})
   expect(runtime.resolveView(String(currentForm.props('dataViewKey')))).toBe(view)
   expect(wrapper.findComponent(Renderer).props('pageRuntime')).toBe(original)
   expect(view.getEditingRow(view.getPkKey(view.currentRow!)!)?.['livePreview']).toBe(false)
   expect(httpPut).not.toHaveBeenCalled()
  } finally {wrapper.unmount()}
  expect(Object.keys(owner.dataSet.tables).sort()).toEqual(tablesBefore)
 })
 it('loads only the requested tool file DataView from the formal ProjectToolFile mapping',async()=>{const state=createDevStateWithConfigPages();const fileView=await state.loadPageToolFileDataView({pageId:'orders-page',fileName:'script.js'});expect(Reflect.has(state.editor,'ensureActivePageFilesLoaded')).toBe(false);expect(appConfig.tables.ProjectToolFile.resourceType).toBe('file');expect(appConfig.tables.ProjectToolFile.resourceId).toBe('project:tool-file');expect(appConfig.tables.ProjectToolFile.columns.map(column=>column.name)).toEqual(['fileKey','pageId','fileName','versionId','text','localDirty']);expect(fileView.tableName).toBe('ProjectToolFile');expect(fileView.dataTable?.resourceId).toBe('project:tool-file');expect(fileView.viewId).toBe('page-orders-page-script.js');expect(fileView.currentRow).toMatchObject({pageId:'orders-page',fileName:'script.js'});expect(state.pageFileNames).toEqual(['rule.json','script.js','style.css'])})
 it('loads scene views through the scene gateway and undoes to a clean shared baseline',async()=>{let remote=fixtureText(20);httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}));httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content});const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews();expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene');await state.writeScenarioViewText(fixtureText(50));expect(state.pageDataDirty.value).toBe(true);expect(await state.scenarioDefinitionDocument.value?.undo()).toBe(true);state.scenarioDefinitionRevision.value++;expect(state.pageDataDirty.value).toBe(false);await state.writeScenarioViewText(fixtureText(70));await state.saveScenarioViewText();expect(JSON.parse(remote)).toEqual(JSON.parse(fixtureText(70)));expect(state.pageDataDirty.value).toBe(false);expect(state.project.readDirtyProjection().dirtyFiles).not.toContain('pagedata.json')})
 it('rejects model structure edits and preserves the last valid scene document',async()=>{httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}));const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews();const previous=state.scenarioDefinitionDocument.value?.getText();await expect(state.writeScenarioViewText(JSON.stringify({scenarioId:'scene',tables:{Orders:{columns:[],views:{default:{}}}}}))).rejects.toThrow();expect(state.scenarioDefinitionDocument.value?.getText()).toBe(previous);expect(state.pageDataDirty.value).toBe(false)})
})
