import {expect,it} from 'vitest'
import {responseScenarioViews} from '@/views/features/application/smart-bid/response/model/response-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareRegisteredResponseDraft,readRegisteredResponseAssignment} from '@/views/features/application/smart-bid/response/model/response-assignment-reader'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'

it('reopens only the original assignment and preserves separate duties at the same destination',async()=>{
 const row={id:'A',projectId:'P',baselineId:'B',lineageId:'L',version:'V1',assignments:[
  {kind:'FORM_CELL',targetRef:'CELL',duty:'LEAD',assigneeRef:'OWNER',dueAt:10},
  {kind:'FORM_CELL',targetRef:'CELL',duty:'EVIDENCE',assigneeRef:'PROVER',dueAt:10},
 ]}
 const scenarioViews=responseScenarioViews({ApprovedPrice:'id',BidSecurity:'id',PriceSheet:'id',ResponseAssignment:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ResponseAssignment:{modelBinding:{modelName:'ResponseAssignment',modelId:'M'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scenarioViews.ResponseAssignment},
 }}})
 try{
  const view=ds.getView('ResponseAssignment','selectedResponseAssignment')
  if(!view)throw Error('TEST_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ResponseAssignment'})
  let baselineId='B'
  view.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'assignment',readScope:()=> 'assignment',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,baselineId,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  const host={scenarioId:'S',projectId:'P',baselineId:'B',assertCurrent:()=>{},
   runtime:{resolveView:(key:string)=>key==='S@ResponseAssignment@selectedResponseAssignment'?view:undefined}}
  const result=await readRegisteredResponseAssignment(host,'A')
  expect(result).toMatchObject({state:'READ',assignmentId:'A',lineageId:'L',version:'V1',assignments:row.assignments})
  baselineId='OTHER'
  await expect(readRegisteredResponseAssignment(host,'A')).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  expect(()=>result.assertCurrent()).toThrow()
  baselineId='B'
  const runtime={...host.runtime,generation:1,isLoaded:true,destroyed:false}
  const page=createBidResponseScriptHost(runtime,{scenarioId:'S',scopeRef:'LOT',purposeRef:'BID',
   rateOnly:false,asOf:10,assertCurrent:host.assertCurrent},{
   assignmentBasis:host,readPriceEvidence:async()=>{throw Error('NO_PRICE')},readSecurityReceipts:async()=>[],
  })
  const signal=new AbortController().signal,showAlert=vi.fn()
  expect(()=>page.invoke('bid.response.readAssignment',{assignmentId:'A',baselineId:'OTHER'},signal))
   .toThrow('BID_RESPONSE_ASSIGNMENT_REQUEST')
  const {openOriginalAssignment}=compileFunctions(script,{
   $route:{query:{assignmentId:'A'}},$page:{invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert},
  } as unknown as PageContext)
  if(!openOriginalAssignment)throw Error('TEST_SCRIPT_REQUIRED')
  await openOriginalAssignment()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('要求 L · 版本 V1\n原表栏 CELL · 主答 OWNER\n原表栏 CELL · 举证 PROVER','原答复分工')
  const target={assignmentId:'A',targetRef:'CELL',kind:'FORM_CELL' as const,duty:'LEAD' as const,authorRef:'CURRENT',at:9,
   body:{statement:'填报答复',data:{}}}
  type ReadSource=Parameters<typeof prepareRegisteredResponseDraft>[2]
  const readSource=vi.fn<ReadSource>(async(assignment,destination)=>{
   const scope={projectId:assignment.projectId,baselineId:assignment.baselineId,assignmentId:assignment.assignmentId,
    lineageId:assignment.lineageId,version:assignment.version,targetRef:destination.targetRef}
   return {...scope,assertCurrent:assignment.assertCurrent,allowedNodeIds:[],requiredEvidence:[],evidence:[],
    task:{...scope,taskRef:'TASK',assignmentVersion:'A2',assigneeRef:'CURRENT',dueAt:10,state:'ACCEPTED',
     acceptance:{receiptRef:'ACCEPT',assignmentVersion:'A2',assigneeRef:'CURRENT',acceptedAt:8},assertCurrent:()=>{}}}
  })
  await expect(prepareRegisteredResponseDraft(host,target,readSource)).resolves.toMatchObject({
   authorRef:'CURRENT',assignmentVersion:'A2',acceptanceRef:'ACCEPT',
  })
  await expect(prepareRegisteredResponseDraft(host,{...target,duty:'EVIDENCE'},readSource)).rejects
   .toThrow('BID_RESPONSE_ORIGINAL_ASSIGNMENT')
  expect(readSource).toHaveBeenCalledTimes(1)
 }finally{ds.destroy()}
})
