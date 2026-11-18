import {expect,it} from 'vitest'
import {resolvePublishedContentOperationTarget} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-target'

it('keeps the published navigation, page, scenario and selected project together',()=>{
 const entry={applicationId:'APP',pageId:'TOOL',nodeId:'NODE',scenarioId:'SPACE'}
 const route={path:'/apps/APP/page18',meta:{type:'config-page',nodeId:'NODE',pageId:'TOOL',blueprintScenarioId:'SPACE',
  tool:{projectId:'APP',pageId:'TOOL'}},query:{scenarioId:'SPACE',projectId:'P',directoryRef:'DIR'}}
 expect(resolvePublishedContentOperationTarget(route,entry))
  .toEqual({applicationId:'APP',pageId:'TOOL',scenarioId:'SPACE',projectId:'P'})
 expect(resolvePublishedContentOperationTarget({...route,query:{projectId:'P'}},entry)?.scenarioId).toBe('SPACE')
 expect(()=>resolvePublishedContentOperationTarget({...route,meta:{type:'config-page',nodeId:'NODE',pageId:'TOOL',
  tool:route.meta.tool}},entry)).toThrow('OPERATION_PAGE_PUBLICATION_CONFLICT')
 expect(()=>resolvePublishedContentOperationTarget({...route,query:{...route.query,scenarioId:'OTHER'}},entry))
  .toThrow('OPERATION_PAGE_PUBLICATION_CONFLICT')
 expect(resolvePublishedContentOperationTarget({...route,path:'/apps/OTHER/page18'},entry)).toBeUndefined()
 expect(resolvePublishedContentOperationTarget({...route,meta:{...route.meta,nodeId:'OTHER'}},entry)).toBeUndefined()
 expect(()=>resolvePublishedContentOperationTarget({...route,meta:{...route.meta,blueprintScenarioId:'OTHER'}},entry))
  .toThrow('OPERATION_PAGE_PUBLICATION_CONFLICT')
 expect(()=>resolvePublishedContentOperationTarget({...route,query:{...route.query,rootKind:'Injected'}},entry))
  .toThrow('OPERATION_PAGE_PUBLICATION_CONFLICT')
 expect(()=>resolvePublishedContentOperationTarget({...route,query:{...route.query,currentUserId:'OTHER'}},entry))
  .toThrow('OPERATION_PAGE_PUBLICATION_CONFLICT')
})
