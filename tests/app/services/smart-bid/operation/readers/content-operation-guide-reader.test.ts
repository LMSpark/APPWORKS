import {expect,it,vi} from 'vitest'
import {config,mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {Spark,SparkPageRenderer,registerAllRenderers} from '@spark-appworks/spark-component'
import {createMemoryHistory,createRouter} from 'vue-router'
import {DataSet} from '@spark-appworks/spark-data'
import {discoverRegisteredOperationGuides} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-guide-reader'
import {preparePublishedContentOperationCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-target'
import {openContentOperationWorkspace} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-workspace'
import {createContentOperationScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-script-host'
import {createKnowledgeDirectoryScriptHost} from '@/views/features/application/smart-bid/knowledge/knowledge-directory-script-host'
import {createBidClassModelCatalogHost} from '@/views/features/application/smart-bid/knowledge/class-model-catalog-script-host'
import catalogScript from '@/views/features/application/smart-bid/knowledge/page17/script.js?raw'
import knowledgeScript from '@/views/features/application/smart-bid/knowledge/page16/script.js?raw'
import {hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import rule from '@/views/features/application/smart-bid/authoring/page18/rule.json?raw'
import script from '@/views/features/application/smart-bid/authoring/page18/script.js?raw'
import style from '@/views/features/application/smart-bid/authoring/page18/style.css?raw'
import {PageRuntimePool} from '../../../../../../packages/spark-app/src/router/page-runtime-pool'

vi.mock('@/platform-adapters/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'USER'}})},readRequestScope:()=>({token:'TOKEN',headers:{'X-AppId':'APP'}}),
}}))

it('discovers only the complete scoped directory and retains the original publication and permission proof',async()=>{
 const guideText='### 核路线候选',guideDigest=await hashCanonicalSnapshotText(guideText)
 const row={guideRef:'OperationRoute.verify',versionRef:guideDigest,guideDigest,kind:'OperationRoute',
  actionName:'verify',pathRefs:['DIR'],materialRefs:['OperationRoute.verify']}
 const host={runtime:{resolveView:()=>undefined},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const executeTool=vi.fn(async(name:string,_input?:unknown)=>name==='model_action_guide'?{ok:true,data:guideText}:
  {ok:true,data:{rootKind:'OperationRoute',models:[{kind:'OperationRoute',attributes:[{name:'status',typeText:'string'}],
   methods:[{name:'verify',signature:'verify(target: string): boolean'}]}]}})
 const discover=()=>discoverRegisteredOperationGuides(host,{executeTool},{rootKind:'OperationRoute',directoryRef:'DIR'})
 try{
  const result=await discover()
  expect(result.items).toMatchObject([{state:'REACHABLE',guideRef:'OperationRoute.verify',
   versionRef:guideDigest,materialRefs:['OperationRoute.verify']}])
  expect(executeTool).toHaveBeenCalledWith('model_query',{includeMembers:true})
  expect(executeTool).toHaveBeenCalledWith('model_action_guide',{kind:'OperationRoute',actionName:'verify'})
  const controller=new AbortController()
  const tools={executeTool:async(name:string,input?:unknown)=>['model_action_guide','model_attribute_guide'].includes(name)
   ?{ok:true,data:guideText}:executeTool(name,input)}
  const scriptHost=createContentOperationScriptHost({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   tools,{...host,rootKind:'OperationRoute'})
  const directory=await scriptHost.invoke('content.operation.discover',{directoryRef:'DIR'},controller.signal)
  if(!('readGuide' in directory)||typeof directory.readGuide!=='function')throw Error('TEST_DIRECTORY_REQUIRED')
  expect(directory).toMatchObject({count:1,reachable:1})
  await expect(directory.readGuide(row)).resolves.toMatchObject({versionRef:guideDigest,guide:guideText,origin:{source:'CLASSMODEL'}})
  await expect(directory.readGuide({...row,guideRef:'UNKNOWN'})).rejects.toThrow('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
  const beforeStaleRow=executeTool.mock.calls.length
  await expect(directory.readGuide({...row,versionRef:'OLD'})).rejects.toThrow('OPERATION_PAGE_GUIDE_ROW_REQUIRED')
  expect(executeTool).toHaveBeenCalledTimes(beforeStaleRow)
  const knowledge=createKnowledgeDirectoryScriptHost({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   tools,{...host,rootKind:'OperationRoute'})
  expect(()=>knowledge.invoke('content.operation.prepareRework',{},controller.signal)).toThrow('KNOWLEDGE_DIRECTORY_COMMAND_REQUIRED')
  const knowledgeDirectory=await knowledge.invoke('knowledge.directory.read',{directoryRef:'DIR'},controller.signal)
  if(!('readGuide' in knowledgeDirectory)||typeof knowledgeDirectory.readGuide!=='function')
   throw Error('TEST_KNOWLEDGE_DIRECTORY_REQUIRED')
  await expect(knowledgeDirectory.readGuide(row)).resolves.toMatchObject({
   guide:guideText,guideRef:'OperationRoute.verify',versionRef:guideDigest,origin:{source:'CLASSMODEL'},
  })
  expect(knowledgeScript.trim()).toBe('')
  const runtime={generation:1,isLoaded:true,destroyed:false}
  const catalogTools={executeTool:vi.fn(async(name:string,input?:unknown)=>['model_action_guide','model_attribute_guide'].includes(name)
   ?{ok:true,data:guideText}:executeTool(name,input))}
  const catalog=createBidClassModelCatalogHost(runtime,catalogTools,{rootKind:'OperationRoute',assertCurrent:host.assertCurrent})
  const catalogResult=await catalog.invoke('bid.models.readCatalog',{},controller.signal)
  await expect(catalogResult.readGuide('OperationRoute','verify')).resolves.toMatchObject({guide:guideText})
  expect(catalogTools.executeTool).toHaveBeenCalledWith('model_action_guide',{kind:'OperationRoute',actionName:'verify'})
  await expect(catalogResult.readAttributeGuide('OperationRoute','status')).resolves.toMatchObject({guide:guideText})
  expect(catalogTools.executeTool).toHaveBeenCalledWith('model_attribute_guide',{kind:'OperationRoute',attributeName:'status'})
  expect(catalogScript.trim()).toBe('')
  await expect(catalog.invoke('bid.models.readCatalog',{rootKind:'OTHER'},controller.signal))
   .rejects.toThrow('BID_CLASS_MODEL_CATALOG_SCOPE')
  const evidence=await catalog.invoke('bid.models.readCatalog',{},controller.signal)
  expect(evidence.models[0]?.attributes).toEqual([{name:'status',typeText:'string'}])
  expect(evidence.models[0]?.methods).toEqual([{name:'verify',signature:'verify(target: string): boolean'}])
  catalogTools.executeTool.mockResolvedValueOnce({ok:true,data:{rootKind:'OperationRoute',
   models:[{kind:'OperationRoute',attributes:[{name:'status',typeText:'string'}],methods:[{name:'verify',signature:''}]}]}})
  await expect(catalog.invoke('bid.models.readCatalog',{},controller.signal)).rejects.toThrow('BID_CLASS_MODEL_CATALOG_SCOPE')
  catalogTools.executeTool.mockResolvedValueOnce({ok:true,data:{rootKind:'OperationRoute',
   models:[{kind:'Other',attributes:[],methods:[]}]}})
  await expect(catalog.invoke('bid.models.readCatalog',{},controller.signal)).rejects.toThrow('BID_CLASS_MODEL_CATALOG_SCOPE')
  const callCount=catalogTools.executeTool.mock.calls.length
  await expect(evidence.readGuide('OperationRoute','unknown')).rejects.toThrow('BID_CLASS_MODEL_CATALOG_SCOPE')
  await expect(evidence.readAttributeGuide('OperationRoute','missing')).rejects.toThrow('BID_CLASS_MODEL_CATALOG_SCOPE')
  expect(catalogTools.executeTool).toHaveBeenCalledTimes(callCount)
  runtime.generation++
  expect(()=>evidence.assertCurrent()).toThrow('BID_CLASS_MODEL_CATALOG_STALE')
  const workspace=openContentOperationWorkspace({...host.runtime,generation:1,destroyed:false,isLoaded:true},
   tools,
   {...host,rootKind:'OperationRoute',signal:controller.signal})
  const discovery=await workspace.discover('DIR'),guide=await workspace.readGuide(discovery,row)
  directory.assertCurrent()
  const attempt={projectId:'P',runId:'R',attemptRef:'A',requestKey:'Q',targetDigest:'b'.repeat(64),configurationLockHash:'c'.repeat(64)}
  const definition={versionRef:guideDigest,guideDigest,configurationLockHash:attempt.configurationLockHash,
   createdAt:'2026-11-18T10:00:00+08:00',slots:[{slotId:'target',required:true}],assertCurrent:host.assertCurrent}
  await expect(workspace.freeze(attempt,{...guide},{definition,sources:[]})).rejects.toThrow('OPERATION_WORKSPACE_GUIDE_SCOPE')
  await expect(workspace.freeze(attempt,guide,{definition:{...definition,versionRef:'OTHER'},sources:[]})).rejects.toThrow('OPERATION_WORKSPACE_GUIDE_SCOPE')
  const incomplete=await workspace.freeze(attempt,guide,{definition,sources:[]})
  expect(incomplete).toMatchObject({usable:false,inputDigest:null})
  const frozen=await workspace.freeze(attempt,guide,{definition,sources:[{slotId:'target',state:'ALLOWED',
   sourceRef:'REF',versionRef:'V',useRef:'USE',value:'TARGET',assertCurrent:host.assertCurrent}]})
  expect(frozen).toMatchObject({usable:true,inputJson:'{"target":"TARGET"}',guideDigest})
  registerAllRenderers()
  const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentProject:{
   modelBinding:{modelId:'PROJECT',modelName:'ContentProject'},columns:[{name:'id',isPrimaryKey:true}],
   views:{default:{},projects:{}},
  }}})
  const path='/apps/APP/page18',tool={projectId:'APP',pageId:'PAGE18'}
  const published={applicationId:'APP',nodeId:'NODE18',pageId:'PAGE18',scenarioId:'S'}
  const router=createRouter({history:createMemoryHistory(),routes:[{path,component:SparkPageRenderer,
   meta:{type:'config-page',nodeId:'NODE18',pageId:'PAGE18',blueprintScenarioId:'S',tool}}]})
  const readPageFiles=vi.fn(async(commands:ReadonlyArray<{fileName:string}>)=>
   commands.map(({fileName})=>fileName==='rule.json'
    ? rule.replace('D3BBA1F0780056C837AC35E9825CAD5A@ContentProject@projects','S@ContentProject@projects')
    :fileName==='script.js'?script:style))
  const executePageTool=vi.fn(tools.executeTool)
  const pool=new PageRuntimePool({pageComponent:SparkPageRenderer,readPageFile:undefined,readPageFiles,
   preparePageCall:route=>preparePublishedContentOperationCall(route,published,()=>({
    classModel:{executeTool:executePageTool},rootKind:'OperationRoute',assertCurrent:host.assertCurrent})),
   loadScenario:async()=>ds,readNavTree:()=>({title:'Fixture',childPlacement:'header',
    items:[{id:'NODE18',title:'工艺',itemKind:'page',blueprintScenarioId:'S',tool}]}),refreshRoutes:async()=>{}})
  const originalStubs={...config.global.stubs},stubs={...originalStubs}
  for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
  config.global.stubs=stubs
  try{
   await router.push({path,query:{scenarioId:'S',projectId:'P',directoryRef:'DIR'}})
   const component=pool.getPageRuntimeView(router.currentRoute.value)
   if(!component)throw Error('TEST_OPERATION_PAGE_REQUIRED')
   const rendered=mount(component,{global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}})
   try{
   await vi.waitFor(()=>expect(rendered.text()).toContain('读取操作目录'),{timeout:3000})
   expect(rendered.text()).not.toContain('页面加载失败')
   }finally{rendered.unmount()}
  }finally{config.global.stubs=originalStubs;pool.disposePageRuntimes()}
 }finally{}
})
