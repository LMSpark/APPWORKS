import {expect,it,vi} from 'vitest'
import {preparePaperPackingRecord,reviewPaperSubmissionPackage} from '@/services/smart-bid/content/review/paper-submission-package'
import {DataSet} from '@spark-appworks/spark-data'
import {assessSubmissionPackageRelease,bindPackageSignatureCoverage,readPackageSignatureChecks} from '@/views/features/application/smart-bid/authoring/model/review/package/content-package-release'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import script from '@/views/features/application/smart-bid/authoring/page13/script.js?raw'
import {reviewRegisteredPaperSubmissionPackage} from '@/views/features/application/smart-bid/authoring/model/review/package/content-paper-submission-package-reader'
import {contentDeliveryPackageScenarioViews,contentPackageSignatureScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
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
  views:{default:{},originalPackedPaper:SubmissionPackage.originalPackedPaper,
   originalPackedPaperByRequest:SubmissionPackage.originalPackedPaperByRequest},
 }}})
 const view=ds.getView('SubmissionPackage','originalPackedPaper')
 const requestView=ds.getView('SubmissionPackage','originalPackedPaperByRequest')
 if(!view||!requestView)throw Error('TEST_PAPER_PACKAGE_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionPackage'})
 const hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'paper',readScope:()=> 'paper',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['packed']:[],m:[],d:false}}]}}}),
 })})
 const found=false
 requestView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>{
  expect(requestView.queryContext).toMatchObject({projectId:'P',packingRequestRef:'Q',format:'PAPER'})
  return new DataSpaceQueryContext({
  identity:table.identity,scope:'paper-request',readScope:()=> 'paper-request',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:found?1:0,Items:found?[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
  })
 }})
 const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionPackage@originalPackedPaper'?view:
  key==='S@SubmissionPackage@originalPackedPaperByRequest'?requestView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const input={packageId:'PKG',packingRequestRef:'Q'}
 const readWitness=vi.fn(async()=>({...scope,witnessRef:'W',complete:true,members,assertCurrent:host.assertCurrent}))
 const readFrozen=vi.fn(async()=>({...scope,members,assertCurrent:host.assertCurrent}))
 const requirements=[{kind:'SELECTION_USE',targetId:'SELECTION'},{kind:'APPROVAL',targetId:'APPROVAL'},
  {kind:'SIGNATURE',targetId:'SIGNATURE'}] as const
 const rules={...scope,packageHash:row.packageHash,requirements,assertCurrent:host.assertCurrent}
 const evidence=requirements.map(requirement=>({...requirement,...scope,packageHash:row.packageHash,
  evidenceRef:requirement.targetId,accepted:true,assertCurrent:host.assertCurrent}))
 const readPackageRelease=vi.fn(async()=>({rules,evidence}))
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   paperEvidence:{readFrozen,readWitness},readPackageRelease,
   readPaperPackingSelection:async()=>({selectionRef:'PAPER',state:'RECOVER',frozen:{...scope,members,assertCurrent:host.assertCurrent},
    packingRequestRef:input.packingRequestRef}),
  })
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  await expect(page.invoke('content.submission.preparePaperPacking',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('SUBMISSION_PAGE_PACKING_SCOPE')
})
