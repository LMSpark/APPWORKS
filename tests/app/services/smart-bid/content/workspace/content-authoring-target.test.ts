import {expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveContentAuthoringTarget,resolvePublishedContentAuthoringTarget,type ContentAuthoringRoute} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'
import {preparePublishedBidClassModelCatalogCall,preparePublishedKnowledgeDirectoryCall,preparePublishedBidFindingsCall,preparePublishedContentDeadlineCall,preparePublishedContentReviewCall,preparePublishedContentSubmissionCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-target'

const auth=vi.hoisted(()=>({token:'SESSION',appId:'D8490EC99436A8B9AFDE205BE3153802'}))
vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'ACTOR'}})},
 readRequestScope:()=>({token:auth.token,headers:{'X-AppId':auth.appId}}),
}}))

const app='D8490EC99436A8B9AFDE205BE3153802',space='D3BBA1F0780056C837AC35E9825CAD5A'
const route=():ContentAuthoringRoute=>({path:`/apps/${app}/features/application/smart-bid/authoring/entry/content-authoring-page`,
 meta:{type:'config-page',nodeId:'NAV11',pageId:'TOOL11',tool:{projectId:app,pageId:'TOOL11'}},query:{scenarioId:space,projectId:'P',draftId:'D'}})
it.each([
 {number:12,prepareCall:preparePublishedContentReviewCall},
 {number:13,prepareCall:preparePublishedContentSubmissionCall},
 {number:14,prepareCall:preparePublishedContentDeadlineCall},
 {number:15,prepareCall:preparePublishedBidFindingsCall},
 {number:16,prepareCall:preparePublishedKnowledgeDirectoryCall},
 {number:17,prepareCall:preparePublishedBidClassModelCatalogCall},
])('prepares published page $number inputs for the authorized route and invalidates stale sessions',({number,prepareCall})=>{
 const nodeId=`NAV${number}`,pageId=`TOOL${number}`
 const entry={applicationId:app,scenarioId:space,nodeId,pageId}
 const reviewRoute={...route(),path:`/apps/${app}/page${number}`,meta:{type:'config-page',nodeId,pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId}},query:{projectId:'P',scenarioId:space}}
 const createSources=vi.fn(()=>{throw Error('NO_RUNTIME_YET')})
 expect(prepareCall(route(),entry,createSources)).toBeUndefined()
 expect(()=>prepareCall({...reviewRoute,query:{...reviewRoute.query,userId:'OTHER'}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>prepareCall({...reviewRoute,meta:{...reviewRoute.meta,blueprintScenarioId:'OTHER'}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>prepareCall({...reviewRoute,meta:{...reviewRoute.meta,tool:{projectId:app,pageId:'OTHER'}}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>prepareCall({...reviewRoute,query:{...reviewRoute.query,rootKind:'OTHER'}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 const prepared=prepareCall(reviewRoute,entry,createSources)
 expect(prepared?.scenarioInputs).toEqual({[space]:{projectId:'P',currentUserId:'ACTOR'}})
 expect(createSources).not.toHaveBeenCalled()
 auth.token='NEXT'
 try{expect(()=>prepared?.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')}
 finally{auth.token='SESSION'}
})
it('binds the deadline host to the published page runtime and active session',async()=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV14',pageId:'TOOL14'}
 const publishedRoute={path:`/apps/${app}/page14`,meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId:entry.pageId}},query:{projectId:'P',scenarioId:space}}
 const readDeadline=vi.fn(async()=>{throw Error('UNEXPECTED_DEADLINE_SOURCE')})
 const createSources=vi.fn(()=>({readDeadline}))
 const prepared=preparePublishedContentDeadlineCall(publishedRoute,entry,createSources)
 if(!prepared)throw Error('TEST_DEADLINE_ENTRY_REQUIRED')
 const loadScenario=async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}
 const runtime=new PageRuntime({pageId:entry.pageId,scenarioIds:[space],deferredScenarioIds:[space],loadScenario})
 const wrongRuntime=new PageRuntime({pageId:entry.pageId,scenarioIds:[],loadScenario})
 try{
  expect(()=>prepared.createHost(wrongRuntime)).toThrow('CONTENT_REVIEW_PUBLICATION_RUNTIME_CONFLICT')
  await runtime.load()
  const host=prepared.createHost(runtime)
  expect(host.runtime).toBe(runtime)
  expect(createSources).toHaveBeenCalledExactlyOnceWith(runtime,expect.objectContaining({projectId:'P',scenarioId:space}))
  auth.token='NEXT'
  await expect(host.invoke('content.submission.readDeadline',{deadlineRef:'D'},new AbortController().signal))
   .rejects.toThrow('CONTENT_AUTHORING_STALE')
  expect(readDeadline).not.toHaveBeenCalled()
 }finally{auth.token='SESSION';runtime.dispose();wrongRuntime.dispose()}
})
it('binds page 17 to the model root supplied by the published runtime',async()=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV17',pageId:'TOOL17'}
 const publishedRoute={path:`/apps/${app}/page17`,meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId:entry.pageId}},query:{projectId:'P',scenarioId:space}}
 const executeTool=vi.fn(async()=>({ok:true as const,data:{rootKind:'OperationRoute',models:[]}}))
 let rootCurrent=true
 const bindRoot=vi.fn(()=>({classModel:{executeTool},rootKind:'OperationRoute',
  assertCurrent:()=>{if(!rootCurrent)throw Error('ROOT_CHANGED')}}))
 const prepared=preparePublishedBidClassModelCatalogCall(publishedRoute,entry,bindRoot)
 if(!prepared)throw Error('TEST_MODEL_CATALOG_ENTRY_REQUIRED')
 const runtime=new PageRuntime({pageId:entry.pageId,scenarioIds:[space],deferredScenarioIds:[space],
  loadScenario:async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}})
 try{
  await runtime.load()
  const host=prepared.createHost(runtime)
  expect(bindRoot).toHaveBeenCalledExactlyOnceWith(runtime,expect.objectContaining({projectId:'P',scenarioId:space}))
  const signal=new AbortController().signal
  const catalog=await host.invoke('bid.models.readCatalog',{},signal)
  expect(catalog.rootKind).toBe('OperationRoute')
  rootCurrent=false
  expect(()=>catalog.assertCurrent()).toThrow('ROOT_CHANGED')
  await expect(host.invoke('bid.models.readCatalog',{},signal)).rejects.toThrow('ROOT_CHANGED')
  expect(executeTool).toHaveBeenCalledOnce()
 }finally{runtime.dispose()}
})
it('dispatches only the published node and tool pair in the declared space',()=>{
 const entry={nodeId:'NAV11',pageId:'TOOL11'}
 expect(resolvePublishedContentAuthoringTarget(route(),entry)?.draftId).toBe('D')
 expect(resolvePublishedContentAuthoringTarget(route(),{...entry,nodeId:'OTHER'})).toBeUndefined()
 expect(()=>resolvePublishedContentAuthoringTarget(route(),{...entry,pageId:'OTHER'})).toThrow('PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>resolvePublishedContentAuthoringTarget({...route(),query:{...route().query,additionalScenarioIds:'OTHER'}},entry))
  .toThrow('PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>resolvePublishedContentAuthoringTarget({...route(),meta:{...route().meta,blueprintScenarioId:'OTHER'}},entry))
  .toThrow('CONTENT_AUTHORING_ENTRY_IDENTITY_CONFLICT')
 expect(resolvePublishedContentAuthoringTarget({...route(),meta:{...route().meta,blueprintScenarioId:space}},entry)?.scenarioId).toBe(space)
})
it('takes page and space identity from resolved navigation while keeping explicit project/draft',()=>{
 const target=resolveContentAuthoringTarget(route())
 expect(target).toEqual({applicationId:app,pageId:'TOOL11',scenarioId:space,projectId:'P',draftId:'D'})
 expect(Object.hasOwn(target,'actorUserId')).toBe(false)
})
it('distinguishes the formal navigation node from its bound tool page identity',()=>{
 const target=resolveContentAuthoringTarget({path:`/apps/${app}/page11`,meta:{type:'config-page',nodeId:'NAV11',pageId:'TOOL11',tool:{projectId:app,pageId:'TOOL11'}},
  query:{scenarioId:space,projectId:'P',draftId:'D'}})
 expect(target.pageId).toBe('TOOL11')
 expect(target.scenarioId).toBe(space)
})
it.each([
 {path:'/apps/OLD/features/application/smart-bid/authoring/entry/content-authoring-page'},
 {path:'/platform/features/application/smart-bid/authoring/entry/content-authoring-page'},
 {meta:{...route().meta,type:'system-page'}},
 {meta:{...route().meta,tool:{projectId:'OTHER',pageId:'TOOL11'}}},
 {meta:{...route().meta,nodeId:undefined}},
 {meta:{...route().meta,pageId:'NAV11'}},
 {meta:{...route().meta,programmaticTool:true}},
 {meta:{nodeId:'NAV11',blueprintScenarioId:space,systemPageIdentityState:'resolved'}},
 {query:{scenarioId:space,projectId:['P','OTHER'],draftId:'D'}},
 {query:{scenarioId:space,projectId:' P',draftId:'D'}},
 {query:{scenarioId:space,projectId:'P'}},
 {query:{projectId:'P',draftId:'D',scenarioId:'OTHER'}},
 {query:{scenarioId:space,projectId:'P',draftId:'D',actorUserId:'ROUTE_USER'}},
 {query:{scenarioId:space,projectId:'P',draftId:'D',scenarioInputs:JSON.stringify({[space]:{currentUserId:'ROUTE_USER'}})}},
])('rejects incomplete or conflicting entry identity %j',patch=>{
 expect(()=>resolveContentAuthoringTarget({...route(),...patch})).toThrow()
})
