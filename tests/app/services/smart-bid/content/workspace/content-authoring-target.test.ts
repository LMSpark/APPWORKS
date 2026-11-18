import {expect,it} from 'vitest'
import {resolveContentAuthoringTarget,resolvePublishedContentAuthoringTarget,type ContentAuthoringRoute} from '@/views/features/application/smart-bid/authoring/ui/entry/content-authoring-target'

const app='D8490EC99436A8B9AFDE205BE3153802',space='D3BBA1F0780056C837AC35E9825CAD5A'
const route=():ContentAuthoringRoute=>({path:`/apps/${app}/features/application/smart-bid/authoring/entry/content-authoring-page`,
 meta:{type:'config-page',nodeId:'NAV11',pageId:'TOOL11',tool:{projectId:app,pageId:'TOOL11'}},query:{scenarioId:space,projectId:'P',draftId:'D'}})
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
