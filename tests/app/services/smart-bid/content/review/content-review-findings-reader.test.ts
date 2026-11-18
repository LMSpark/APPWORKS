import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentReviewFindings,readFindingsForCompletedCoverage} from '@/views/features/application/smart-bid/authoring/model/review/content-review-findings-reader'
import {readContentReviewCoverageFromFindings} from '@/views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('accepts complete zero findings and rejects findings from a different checker version',async()=>{
 const selection={targetHash:'a'.repeat(64),checkerHash:'b'.repeat(64)}
 const row={id:'F',projectId:'P',...selection,anchor:{nodeId:'N'},code:'V8',severity:'BLOCK',status:'OPEN',message:'缺证'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{CheckFinding:{
  modelBinding:{modelId:'M',modelName:'CheckFinding'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedReviewFindings:{commitMode:'staged',queryConfig:{autoQuery:false,allPages:true,pagination:'paged'},
   scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}}},
 }}})
 const view=ds.getView('CheckFinding','selectedReviewFindings')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 let rows:Array<typeof row>=[]
 const executeQuery=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:rows.length,Items:rows.map(item=>({
   ...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false},
  }))}}})}))
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.bindQueryExecutor({save,executeQuery})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const result=await readContentReviewFindings(host,[selection])
  expect(result.records).toEqual([])
  expect(view.filterExpression).toMatchObject({logic:'or',filters:[{logic:'and',filters:[
   {field:'targetHash',operator:'eq',value:selection.targetHash},{field:'checkerHash',operator:'eq',value:selection.checkerHash},
  ]}]})
  rows=[row]
  expect((await readContentReviewFindings(host,[selection])).records[0]).toMatchObject({id:'F',severity:'BLOCK'})
  let coverageCurrent=true
  const coverage={projectId:'P',revisionId:'R',completed:[{...selection,kind:'FILE' as const,targetId:'D',
   effectiveHash:'d'.repeat(64),versionHash:'e'.repeat(64),checkRef:'CHECK',checkedUses:[]}],
  assertCurrent:()=>{if(!coverageCurrent)throw Error('COVERAGE_STALE')},
  resolveAnchor:(anchor:unknown)=>{expect(anchor).toEqual({nodeId:'N'});return {kind:'FILE' as const,targetId:'D'}}}
  const combined=await readFindingsForCompletedCoverage(host,coverage)
  expect(combined.findings).toEqual([{id:'F',kind:'FILE',targetId:'D',effectiveHash:'d'.repeat(64),status:'OPEN',severity:'BLOCK'}])
  coverageCurrent=false
  expect(()=>combined.assertCurrent()).toThrow('COVERAGE_STALE')
  coverageCurrent=true
  const target={kind:'FILE' as const,targetId:'D',effectiveHash:'d'.repeat(64),versionHash:'e'.repeat(64),requiredUseIds:[]}
  const request={projectId:'P',revisionId:'R',targets:[target],assertCurrent:()=>{}}
  const review=await readContentReviewCoverageFromFindings(host,request,{approvals:[],readCompleted:async()=>coverage})
  expect(review.items[0]?.state).toBe('BLOCKED')
  const calls=executeQuery.mock.calls.length
  await expect(readContentReviewCoverageFromFindings(host,request,{approvals:[],readCompleted:async()=>({...coverage,revisionId:'OLD'})}))
   .rejects.toThrow('CONTENT_REVIEW_CHECK_REVISION')
  await expect(readContentReviewCoverageFromFindings(host,{...request,targets:[{...target,targetId:'OTHER'}]},
   {approvals:[],readCompleted:async()=>coverage}))
   .rejects.toThrow('CONTENT_REVIEW_COVERAGE_SCOPE')
  expect(executeQuery).toHaveBeenCalledTimes(calls)
  await expect(readFindingsForCompletedCoverage(host,{...coverage,resolveAnchor:()=>({kind:'FILE',targetId:'OTHER'})}))
   .rejects.toThrow('CONTENT_REVIEW_FINDINGS_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  rows=[{...row,checkerHash:'c'.repeat(64)}]
  await expect(readContentReviewFindings(host,[selection])).rejects.toThrow('CONTENT_REVIEW_FINDINGS_SCOPE')
  expect(save).not.toHaveBeenCalled()
 }finally{ds.destroy()}
})
