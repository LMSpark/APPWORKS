import {expect,it,vi} from 'vitest'
import {preparePublishedSmartBidPageCall} from '@/views/features/application/smart-bid/authoring/ui/entry/publication/smart-bid-page-call'

vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{
 session:{get:()=>({identity:{userId:'USER'}})},readRequestScope:()=>({token:'TOKEN',headers:{'X-AppId':'D8490EC99436A8B9AFDE205BE3153802'}}),
}}))

const applicationId='D8490EC99436A8B9AFDE205BE3153802'
const route={
 path:`/apps/${applicationId}/ai-operation`,
 meta:{title:'AI 作业与核验',type:'config-page',nodeId:'NODE',pageId:'TOOL',blueprintScenarioId:'SPACE',
  tool:{projectId:applicationId,pageId:'TOOL'}},
 query:{projectId:'PROJECT',scenarioId:'SPACE'},
}

it('opens only the published AI operation route and leaves unrelated tools alone',()=>{
 const prepared=preparePublishedSmartBidPageCall(route)
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:'PROJECT'}}})
 expect(preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'其他页面'}})).toBeUndefined()
 expect(()=>preparePublishedSmartBidPageCall({...route,meta:{...route.meta,pageId:undefined}}))
  .toThrow('SMART_BID_PUBLICATION_IDENTITY_REQUIRED')
})

it.each(['知识目录与指南','ClassModel 登记','配置编审与启用','制件与审定','签署与递交','任务与问题'])
('binds page title %s through the published runtime',title=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title}})
 expect(prepared).toMatchObject({scenarioInputs:{SPACE:{projectId:'PROJECT'}}})
})

it('preserves auxiliary scenario bindings for standard action pages',()=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'制件与审定'},
  query:{...route.query,additionalScenarioIds:'AUX'}})
 expect(prepared).toBeDefined()
 const host=prepared?.createHost({pageId:'TOOL',call:{instanceId:'RUNTIME',scenarioIds:['SPACE','AUX']}} as never)
 expect(host).toMatchObject({runtime:expect.anything()})
})

it('rejects blank command identities on standard action pages',async()=>{
 const prepared=preparePublishedSmartBidPageCall({...route,meta:{...route.meta,title:'制件与审定'}})
 const host=prepared?.createHost({pageId:'TOOL',call:{instanceId:'RUNTIME',scenarioIds:['SPACE']}} as never)
 await expect(host?.invoke('smart-bid.dispatch',{operationId:' ',requestKey:'',prompt:'采用',inputs:{}},
  new AbortController().signal)).rejects.toThrow('SMART_BID_PAGE_ACTION_COMMAND_REQUIRED')
})
