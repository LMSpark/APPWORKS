import {expect,it,vi} from 'vitest'
import {resolveContentAuthoringTarget,resolvePublishedContentAuthoringTarget,type ContentAuthoringRoute} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'
import {preparePublishedContentReviewCall,preparePublishedContentSubmissionCall} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-target'

const auth=vi.hoisted(()=>({token:'SESSION',appId:'D8490EC99436A8B9AFDE205BE3153802'}))
vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'ACTOR'}})},
 readRequestScope:()=>({token:auth.token,headers:{'X-AppId':auth.appId}}),
}}))

const app='D8490EC99436A8B9AFDE205BE3153802',space='D3BBA1F0780056C837AC35E9825CAD5A'
const route=():ContentAuthoringRoute=>({path:`/apps/${app}/features/application/smart-bid/authoring/entry/content-authoring-page`,
 meta:{type:'config-page',nodeId:'NAV11',pageId:'TOOL11',tool:{projectId:app,pageId:'TOOL11'}},query:{scenarioId:space,projectId:'P',draftId:'D'}})
it.each([preparePublishedContentReviewCall,preparePublishedContentSubmissionCall])(
 'prepares published page inputs only for the authorized route and invalidates stale sessions',prepareCall=>{
 const entry={applicationId:app,scenarioId:space,nodeId:'NAV12',pageId:'TOOL12'}
 const reviewRoute={...route(),meta:{type:'config-page',nodeId:'NAV12',pageId:'TOOL12',
  blueprintScenarioId:space,tool:{projectId:app,pageId:'TOOL12'}},query:{projectId:'P',scenarioId:space}}
 const createSources=vi.fn(()=>{throw Error('NO_RUNTIME_YET')})
 expect(prepareCall(route(),entry,createSources)).toBeUndefined()
 expect(()=>prepareCall({...reviewRoute,query:{...reviewRoute.query,userId:'OTHER'}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 expect(()=>prepareCall({...reviewRoute,meta:{...reviewRoute.meta,blueprintScenarioId:'OTHER'}},entry,createSources))
  .toThrow('CONTENT_REVIEW_PUBLICATION_IDENTITY_CONFLICT')
 const prepared=prepareCall(reviewRoute,entry,createSources)
 expect(prepared?.scenarioInputs).toEqual({[space]:{projectId:'P',currentUserId:'ACTOR'}})
 expect(createSources).not.toHaveBeenCalled()
 auth.token='NEXT'
 try{expect(()=>prepared?.assertCurrent()).toThrow('CONTENT_AUTHORING_STALE')}
 finally{auth.token='SESSION'}
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
