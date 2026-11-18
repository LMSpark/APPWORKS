import {expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveContentAuthoringTarget,resolvePublishedContentAuthoringTarget,type ContentAuthoringRoute} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'
import {preparePublishedBidHandoffCall,preparePublishedTenderFollowupCall,preparePublishedBidResponseCall,preparePublishedResourceAllocationCall,preparePublishedConfigurationReleaseCall,preparePublishedBidClassModelCatalogCall,preparePublishedKnowledgeDirectoryCall,preparePublishedBidFindingsCall,preparePublishedContentDeadlineCall,preparePublishedContentReviewCall,preparePublishedContentSubmissionCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-target'

const auth=vi.hoisted(()=>({token:'SESSION',appId:'D8490EC99436A8B9AFDE205BE3153802'}))
vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'ACTOR'}})},
 readRequestScope:()=>({token:auth.token,headers:{'X-AppId':auth.appId}}),
}}))

const app='D8490EC99436A8B9AFDE205BE3153802',space='D3BBA1F0780056C837AC35E9825CAD5A'
const route=():ContentAuthoringRoute=>({path:`/apps/${app}/features/application/smart-bid/authoring/entry/content-authoring-page`,
 meta:{type:'config-page',nodeId:'NAV11',pageId:'TOOL11',tool:{projectId:app,pageId:'TOOL11'}},query:{scenarioId:space,projectId:'P',draftId:'D'}})
it.each([
 {number:7,prepareCall:preparePublishedResourceAllocationCall},
 {number:8,prepareCall:preparePublishedBidHandoffCall},
 {number:9,prepareCall:preparePublishedTenderFollowupCall},
 {number:10,prepareCall:preparePublishedBidResponseCall},
 {number:12,prepareCall:preparePublishedContentReviewCall},
 {number:13,prepareCall:preparePublishedContentSubmissionCall},
 {number:14,prepareCall:preparePublishedContentDeadlineCall},
 {number:15,prepareCall:preparePublishedBidFindingsCall},
 {number:16,prepareCall:preparePublishedKnowledgeDirectoryCall},
 {number:17,prepareCall:preparePublishedBidClassModelCatalogCall},
])('prepares published page $number inputs for the authorized route and invalidates stale sessions',({number,prepareCall})=>{
 const pageNumber=String(number).padStart(2,'0'),nodeId=`NAV${pageNumber}`,pageId=`TOOL${pageNumber}`
 const entry={applicationId:app,scenarioId:space,nodeId,pageId}
 const reviewRoute={...route(),path:`/apps/${app}/page${pageNumber}`,meta:{type:'config-page',nodeId,pageId,
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
it('binds page 19 to the current configuration scope and rejects route scope overrides',async()=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV19',pageId:'TOOL19'}
 const publishedRoute={path:`/apps/${app}/page19`,meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId:entry.pageId}},query:{projectId:'P',scenarioId:space}}
 let scopeCurrent=true
 const bindScope=vi.fn(()=>({scopeId:'AUTHORIZED',assertCurrent:()=>{if(!scopeCurrent)throw Error('SCOPE_STALE')}}))
 const runtime=new PageRuntime({pageId:entry.pageId,scenarioIds:[space],deferredScenarioIds:[space],
  loadScenario:async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}})
 try{
  expect(()=>preparePublishedConfigurationReleaseCall({...publishedRoute,query:{...publishedRoute.query,scopeId:'OTHER'}},entry,bindScope))
   .toThrow('CONFIGURATION_RELEASE_PAGE_SCOPE')
  expect(bindScope).not.toHaveBeenCalled()
  const host=preparePublishedConfigurationReleaseCall(publishedRoute,entry,bindScope)?.createHost(runtime)
  expect(host?.runtime).toBe(runtime)
  expect(bindScope).toHaveBeenCalledExactlyOnceWith(runtime,expect.objectContaining({projectId:'P',scenarioId:space}))
  scopeCurrent=false
  expect(()=>host?.assertCurrent()).toThrow('SCOPE_STALE')
 }finally{runtime.dispose()}
})
it('requires page 10 evidence sources to match the published project',()=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV10',pageId:'TOOL10'}
 const publishedRoute={path:`/apps/${app}/page10`,meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId:entry.pageId}},query:{projectId:'P',scenarioId:space}}
 let projectId='OTHER'
 const read=vi.fn(async()=>{throw Error('UNEXPECTED_COMMITMENT_READ')})
 const context={scopeRef:'LOT',purposeRef:'USE',rateOnly:false,asOf:10,assertCurrent:()=>{}}
 const bind=()=>({context,sources:{commitmentBasis:{projectId,read,assertCurrent:context.assertCurrent},
  readPriceEvidence:read,readSecurityReceipts:async()=>[]}})
 const runtime=new PageRuntime({pageId:entry.pageId,scenarioIds:[space],deferredScenarioIds:[space],
  loadScenario:async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}})
 try{
  expect(()=>preparePublishedBidResponseCall({...publishedRoute,query:{...publishedRoute.query,purposeRef:'OTHER'}},entry,bind))
   .toThrow('BID_RESPONSE_PUBLICATION_SCOPE')
  const prepared=preparePublishedBidResponseCall(publishedRoute,entry,bind)
  expect(()=>prepared?.createHost(runtime)).toThrow('BID_RESPONSE_PUBLICATION_SCOPE')
  projectId='P'
  expect(prepared?.createHost(runtime).runtime).toBe(runtime)
  expect(read).not.toHaveBeenCalled()
 }finally{runtime.dispose()}
})
it('rejects a different handoff project or a route-provided round at the published entry',()=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV08',pageId:'TOOL08'}
 const publishedRoute={path:`/apps/${app}/page08`,meta:{type:'config-page',nodeId:entry.nodeId,pageId:entry.pageId,
  blueprintScenarioId:space,tool:{projectId:app,pageId:entry.pageId}},query:{projectId:'P',scenarioId:space}}
 const readReceipts=vi.fn(async()=>{throw Error('UNEXPECTED_RECEIPTS')})
 const bind=()=>({projectId:'OTHER',assertCurrent:()=>{},options:{selection:{lotId:'LOT',roundId:'R',stageId:'STAGE'},readReceipts}})
 const runtime=new PageRuntime({pageId:entry.pageId,scenarioIds:[space],deferredScenarioIds:[space],
  loadScenario:async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}})
 try{
  expect(()=>preparePublishedBidHandoffCall({...publishedRoute,query:{...publishedRoute.query,roundId:'OTHER'}},entry,bind))
   .toThrow('BID_TENDER_PUBLICATION_SCOPE')
  const prepared=preparePublishedBidHandoffCall(publishedRoute,entry,bind)
  expect(()=>prepared?.createHost(runtime)).toThrow('BID_TENDER_PUBLICATION_SCOPE')
  expect(readReceipts).not.toHaveBeenCalled()
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
