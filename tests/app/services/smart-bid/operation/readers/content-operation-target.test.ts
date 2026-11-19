import {expect,it,vi} from 'vitest'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {preparePublishedContentOperationCall,resolvePublishedContentOperationTarget} from '@/views/features/application/smart-bid/authoring/ui/entry/content-operation-target'

vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'USER'}})},readRequestScope:()=>({token:'TOKEN',headers:{'X-AppId':'APP'}}),
}}))

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
 const bindRoot=vi.fn(()=>({classModel:{executeTool:async()=>({ok:true})},rootKind:'OperationRoute',assertCurrent:()=>{}}))
 expect(()=>preparePublishedContentOperationCall({...route,query:{projectId:'P'}},entry,bindRoot))
  .toThrow('OPERATION_PAGE_PUBLICATION_SCENARIO_REQUIRED')
 const prepared=preparePublishedContentOperationCall(route,entry,bindRoot)
 if(!prepared)throw Error('TEST_PREPARED_OPERATION_REQUIRED')
 const runtime=new PageRuntime({tool:new PageTool({pageId:'TOOL'}),scenarioIds:['OTHER'],loadScenario:async()=>{throw Error('UNEXPECTED_SCENARIO_LOAD')}})
 try{
  expect(()=>prepared.createHost(runtime)).toThrow('OPERATION_PAGE_PUBLICATION_RUNTIME_CONFLICT')
  expect(bindRoot).not.toHaveBeenCalled()
 }finally{runtime.dispose()}
})
