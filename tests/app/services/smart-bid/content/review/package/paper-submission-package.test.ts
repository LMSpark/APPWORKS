import {expect,it,vi} from 'vitest'
import {preparePaperPackingRecord,reviewPaperSubmissionPackage} from '@/services/smart-bid/content/review/paper-submission-package'
import {DataSet} from '@spark-appworks/spark-data'
import {assessSubmissionPackageRelease} from '@/views/features/application/smart-bid/authoring/model/review/package/content-package-release'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import script from '@/views/features/application/smart-bid/authoring/page13/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {reviewRegisteredPaperSubmissionPackage} from '@/views/features/application/smart-bid/authoring/model/review/package/content-paper-submission-package-reader'
import {contentDeliveryPackageScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('checks the actual seal, version and number of copies while retaining partial observations',()=>{
 let witnessCurrent=true
 const scope={projectId:'P',packageId:'PKG',sealRef:'SEAL',selectionHash:'a'.repeat(64)}
 const members=[{position:'商务册',paperRef:'BOOK',versionRef:'V1',copies:2},
  {position:'技术册',paperRef:'TECH',versionRef:'V1',copies:1}]
 const source={frozen:{...scope,members,assertCurrent:()=>{}},packed:{...scope,packingRef:'PACK',members,assertCurrent:()=>{}},
  observed:{...scope,witnessRef:'WITNESS',complete:true,members,assertCurrent:()=>{if(!witnessCurrent)throw Error('WITNESS_STALE')}}}
 expect(preparePaperPackingRecord(source.frozen,source.packed).record).toEqual({...scope,packingRef:'PACK',members})
 expect(()=>preparePaperPackingRecord(source.frozen,{...source.packed,members:members.slice(1)}))
  .toThrow('PAPER_PACKING_MEMBERS')
 expect(()=>preparePaperPackingRecord(source.frozen,{...source.packed,selectionHash:'b'.repeat(64)}))
  .toThrow('PAPER_PACKING_SCOPE')
 expect(reviewPaperSubmissionPackage(scope,source)).toMatchObject({membershipMatches:true,packingRef:'PACK',witnessRef:'WITNESS'})
 const observed={...source.observed,complete:false,members:[{...members[0],position:'商务册',paperRef:'BOOK',versionRef:'V2',copies:1}]}
 const partial=reviewPaperSubmissionPackage(scope,{...source,observed})
 expect(partial).toMatchObject({membershipMatches:false,members:[
  {position:'商务册',issues:['OBSERVED_VERSION_MISMATCH','COPY_COUNT_MISMATCH'],observed:{copies:1}},
  {position:'技术册',issues:['COUNT_PENDING'],observed:null},
 ]})
 expect(reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,complete:true}}).members[1]?.issues)
  .toEqual(['MEMBER_MISSING'])
 expect(reviewPaperSubmissionPackage(scope,{...source,packed:{...source.packed,members:[]},observed}).members[0]?.issues)
  .toEqual(['PACKING_RECORD_MISSING','OBSERVED_VERSION_MISMATCH','COPY_COUNT_MISMATCH'])
 expect(()=>reviewPaperSubmissionPackage(scope,{...source,observed:{...observed,sealRef:'OTHER'}}))
  .toThrow('PAPER_SUBMISSION_PACKAGE_SCOPE')
 witnessCurrent=false
 expect(()=>partial.assertCurrent()).toThrow('WITNESS_STALE')
})

it('opens the original paper packing record before asking for same-seal witness evidence',async()=>{
 const scope={projectId:'P',packageId:'PKG',sealRef:'SEAL',selectionHash:'a'.repeat(64)}
 const members=[{position:'册',paperRef:'BOOK',versionRef:'V1',copies:1}]
 const row={id:'PKG',projectId:'P',packingRequestRef:'Q',format:'PAPER',sealRef:scope.sealRef,packageHash:'b'.repeat(64),
  selectionHash:scope.selectionHash,packingRef:'PACK',packed:members}
 const {SubmissionPackage}=contentDeliveryPackageScenarioViews({DeliveryManifest:'id',SubmissionPackage:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionPackage:{
  modelBinding:{modelId:'M',modelName:'SubmissionPackage'},
  columns:Object.keys(row).map(name=>({name,type:name==='packed'?'object':'string',isPrimaryKey:name==='id'})),
  views:{default:{},originalPackedPaper:SubmissionPackage.originalPackedPaper},
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
 const requirements=[{kind:'SELECTION_USE',targetId:'SELECTION'},{kind:'APPROVAL',targetId:'APPROVAL'},
  {kind:'SIGNATURE',targetId:'SIGNATURE'}] as const
 const rules={...scope,packageHash:row.packageHash,requirements,assertCurrent:host.assertCurrent}
 const evidence=requirements.map(requirement=>({...requirement,...scope,packageHash:row.packageHash,
  evidenceRef:requirement.targetId,accepted:true,assertCurrent:host.assertCurrent}))
 const readPackageRelease=vi.fn(async()=>({rules,evidence:evidence.slice(0,2)}))
 try{
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   paperEvidence:{readFrozen,readWitness},readPackageRelease,
   readPaperPackingSelection:async()=>({selectionRef:'PAPER',state:'REGISTERED',frozen:{...scope,members,assertCurrent:host.assertCurrent},
    target:input}),
  })
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  await expect(page.invoke('content.submission.preparePaperPacking',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('SUBMISSION_PAGE_PACKING_SCOPE')
  const packingAlert=vi.fn(async()=>{})
  const {openPaperPacking}=compileFunctions(script,{$route:{query:{paperPackingSelectionRef:'PAPER'}},
   $page:{invokeHostCommand:(name:string,params:unknown)=>page.invoke(name,params,signal),showAlert:packingAlert}} as unknown as PageContext)
  if(!openPaperPacking)throw Error('TEST_PAPER_PACKING_HANDLER_REQUIRED')
  await openPaperPacking()
  expect(packingAlert).toHaveBeenCalledExactlyOnceWith('封条 SEAL · 装封 PACK\n册 · 版本 V1 · 1 份','纸包装封核验')
  expect(readWitness).not.toHaveBeenCalled()
  const {openPaperPackage,bindOriginalSubmission}=compileFunctions(script,{$route:{query:{paperPackageId:'PKG',paperPackingRequestRef:'Q'}},
   $page:{invokeHostCommand:(name:string,params:unknown)=>page.invoke(name,params,signal),showAlert}} as unknown as PageContext)
  if(!openPaperPackage||!bindOriginalSubmission)throw Error('TEST_PAPER_PACKAGE_HANDLERS_REQUIRED')
  expect(bindOriginalSubmission()).toEqual({visible:false})
  await openPaperPackage()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith(
   ['封装 SEAL · 见证 W','册 · 应装 BOOK / V1 / 1 份 · 实装 BOOK / V1 / 1 份 · 实见 BOOK / V1 / 1 份 · 一致',
    '放行条件未满足','选件适用 SELECTION · 通过','批准覆盖 APPROVAL · 通过','签署覆盖 SIGNATURE · 缺证据'].join('\n'),'纸件清点')
  expect(readPackageRelease).toHaveBeenCalledExactlyOnceWith(
   {projectId:'P',packageId:'PKG',packageHash:row.packageHash,selectionHash:scope.selectionHash},signal)
  expect(readWitness).toHaveBeenCalledExactlyOnceWith(scope)
  expect(readFrozen).toHaveBeenCalledExactlyOnceWith(scope)
  const proof=await reviewRegisteredPaperSubmissionPackage(host,input,{readFrozen,readWitness})
  expect(assessSubmissionPackageRelease(proof,rules,evidence.slice(0,2)).deliverable).toBe(false)
  const released=assessSubmissionPackageRelease(proof,rules,evidence)
  expect(released).toMatchObject({deliverable:true,packageHash:row.packageHash})
  expect(()=>assessSubmissionPackageRelease(proof,{...rules,packageId:'OLDER_PACKAGE'},evidence))
   .toThrow('SUBMISSION_PACKAGE_RELEASE_SCOPE')
  expect(()=>assessSubmissionPackageRelease(proof,rules,evidence.map(item=>({...item,packageHash:'c'.repeat(64)}))))
   .toThrow('SUBMISSION_PACKAGE_RELEASE_SCOPE')
  hidden=true
  await expect(reviewRegisteredPaperSubmissionPackage(host,input,{readFrozen,readWitness})).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(readWitness).toHaveBeenCalledTimes(2)
  expect(()=>released.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
