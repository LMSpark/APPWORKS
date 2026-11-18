import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentApproval} from '@/views/features/application/smart-bid/authoring/model/review/content-approval-reader'
import {readApprovalCoverageEvidence} from '@/views/features/application/smart-bid/authoring/model/content-approval-coverage'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads the original approval by exact identity and refuses an unreadable authority record',async()=>{
 const row={id:'A',projectId:'P',nodeId:'D',scope:'DOCUMENT',effectiveHash:'a'.repeat(64),revisionId:'R',approverId:'U',
  note:'',createdAt:'2026-11-18',actorKind:'HUMAN',authorityRef:'AUTH',decisionTraceRef:'TRACE'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{Approval:{modelBinding:{modelId:'M',modelName:'Approval'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},
   selectedContentApproval:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
    filters:[['projectId','projectId'],['id','approvalId']].map(([field,param])=>({
     field:field!,operator:'eq',value:{Type:'GetInputParam',ParamName:param},
    }))}}}}}})
 const view=ds.getView('Approval','selectedContentApproval')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'Approval'})
 let hidden=false
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
   {...row,lingma_sys_params:{r:[],e:[],h:hidden?['authorityRef']:[],m:[],d:false}},
  ]}}})})})
 const host={runtime:{resolveView:(key:string)=>key==='S@Approval@selectedContentApproval'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const approval=await readContentApproval(host,'A')
  expect(view.queryContext).toMatchObject({projectId:'P',approvalId:'A'})
  expect(approval).toMatchObject({revisionId:'R',nodeId:'D',effectiveHash:row.effectiveHash,requiresCurrentCoverageCheck:true})
  const original=async (decisionTraceRef:string)=>({projectId:'P',revisionId:'R',approvalRef:'A',authorityRef:'AUTH',decisionTraceRef,
   approvedTargets:[{kind:'FILE',targetId:'FILE-1',effectiveHash:'b'.repeat(64)}],assertCurrent:()=>{}})
  const coverage=await readApprovalCoverageEvidence(approval,original)
  expect(coverage.evidence).toEqual([{kind:'FILE',targetId:'FILE-1',effectiveHash:'b'.repeat(64),approvalRef:'A'}])
  await expect(readApprovalCoverageEvidence(approval,async ref=>({...await original(ref),authorityRef:'OTHER'})))
   .rejects.toThrow('CONTENT_APPROVAL_TRACE_MISMATCH')
  await expect(readApprovalCoverageEvidence(approval,async ref=>({...await original(ref),
   approvedTargets:[{kind:'FIELD',targetId:'F',effectiveHash:'b'.repeat(64)}]}))).rejects.toThrow('CONTENT_APPROVAL_TRACE_SCOPE')
  hidden=true
  await expect(readContentApproval(host,'A')).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>approval.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>coverage.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(save).not.toHaveBeenCalled()
 }finally{ds.destroy()}
})
