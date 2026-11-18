import {expect,it,vi} from 'vitest'
import {reviewPaperSubmissionPackage} from '@/services/smart-bid/content/review/paper-submission-package'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/entry/content-submission-script-host'
import script from '@/views/features/application/smart-bid/authoring/page13/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {reviewRegisteredPaperSubmissionPackage} from '@/views/features/application/smart-bid/authoring/model/review/package/content-paper-submission-package-reader'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('checks the actual seal, version and number of copies while retaining partial observations',()=>{
 let witnessCurrent=true
 const scope={projectId:'P',packageId:'PKG',sealRef:'SEAL',selectionHash:'a'.repeat(64)}
 const members=[{position:'商务册',paperRef:'BOOK',versionRef:'V1',copies:2},
  {position:'技术册',paperRef:'TECH',versionRef:'V1',copies:1}]
 const source={frozen:{...scope,members,assertCurrent:()=>{}},packed:{...scope,packingRef:'PACK',members,assertCurrent:()=>{}},
  observed:{...scope,witnessRef:'WITNESS',complete:true,members,assertCurrent:()=>{if(!witnessCurrent)throw Error('WITNESS_STALE')}}}
 expect(reviewPaperSubmissionPackage(scope,source)).toMatchObject({membershipMatches:true,packingRef:'PACK',witnessRef:'WITNESS'})
 const observed={...source.observed,complete:false,members:[{...members[0],position:'商务册',paperRef:'BOOK',versionRef:'V2',copies:1}]}
 const partial=reviewPaperSubmissionPackage(scope,{...source,observed})
 expect(partial).toMatchObject({membershipMatches:false,members:[
  {position:'商务册',issues:['OBSERVED_VERSION_MISMATCH','COPY_COUNT_MISMATCH'],observed:{copies:1}},
  {position:'技术册',issues:['COUNT_PENDING'],observed:null},
 ]})
 expect(reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,complete:true}}).members[1]?.issues)
  .toEqual(['MEMBER_MISSING'])
 expect(()=>reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,sealRef:'OTHER'}}))
  .toThrow('PAPER_SUBMISSION_PACKAGE_SCOPE')
 witnessCurrent=false
 expect(()=>partial.assertCurrent()).toThrow('WITNESS_STALE')
})

it('opens the original paper packing record before asking for same-seal witness evidence',async()=>{
 const scope={projectId:'P',packageId:'PKG',sealRef:'SEAL',selectionHash:'a'.repeat(64)}
 const members=[{position:'册',paperRef:'BOOK',versionRef:'V1',copies:1}]
 const row={id:'PKG',projectId:'P',packingRequestRef:'Q',format:'PAPER',sealRef:scope.sealRef,
  selectionHash:scope.selectionHash,packingRef:'PACK',packed:members}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionPackage:{
  modelBinding:{modelId:'M',modelName:'SubmissionPackage'},
  columns:Object.keys(row).map(name=>({name,type:name==='packed'?'object':'string',isPrimaryKey:name==='id'})),
  views:{default:{},originalPackedPaper:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:([['id','packageId'],['projectId','projectId'],['packingRequestRef','packingRequestRef']] as const)
    .map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('SubmissionPackage','originalPackedPaper')
 if(!view)throw Error('TEST_PAPER_PACKAGE_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionPackage'})
 let hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'paper',readScope:()=> 'paper',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['packed']:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionPackage@originalPackedPaper'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const input={packageId:'PKG',packingRequestRef:'Q'}
 const readWitness=vi.fn(async()=>({...scope,witnessRef:'W',complete:true,members,assertCurrent:host.assertCurrent}))
 const readFrozen=vi.fn(async()=>({...scope,members,assertCurrent:host.assertCurrent}))
 try{
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   paperEvidence:{readFrozen,readWitness},
  })
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  const {openPaperPackage,bindOriginalSubmission}=compileFunctions(script,{$route:{query:{paperPackageId:'PKG',paperPackingRequestRef:'Q'}},
   $page:{invokeHostCommand:(name:string,params:unknown)=>page.invoke(name,params,signal),showAlert}} as unknown as PageContext)
  if(!openPaperPackage||!bindOriginalSubmission)throw Error('TEST_PAPER_PACKAGE_HANDLERS_REQUIRED')
  expect(bindOriginalSubmission()).toEqual({visible:false})
  await openPaperPackage()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('封装 SEAL · 见证 W\n册 · 实见 1 份 · 一致','纸件清点')
  expect(readWitness).toHaveBeenCalledExactlyOnceWith(scope)
  expect(readFrozen).toHaveBeenCalledExactlyOnceWith(scope)
  hidden=true
  await expect(reviewRegisteredPaperSubmissionPackage(host,input,{readFrozen,readWitness})).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(readWitness).toHaveBeenCalledTimes(1)
 }finally{ds.destroy()}
})
