import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {BlobWriter,TextReader,ZipWriter} from '@zip.js/zip.js'
import {createHash} from 'node:crypto'
import {computeDeliverySelectionDigests} from '@/services/smart-bid/content/review/delivery-selection-digest'
import {reviewRegisteredDeliveryZipPackage} from '@/views/features/application/smart-bid/authoring/model/review/package/content-package-review'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {prepareRegisteredDeliveryZipPackage} from '@/views/features/application/smart-bid/authoring/model/review/package/content-delivery-package-preparation'
import {verifyRegisteredPackingCandidate} from '@/views/features/application/smart-bid/authoring/model/review/package/content-submission-package-reader'
import {readRegisteredDeliveryFreeze} from '@/views/features/application/smart-bid/authoring/model/review/package/content-delivery-freeze-reader'
import {contentDeliveryPackageScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('preserves unknown on a complete empty original read and requires readable terminal evidence',async()=>{
 const groupScope={enterpriseId:'ORG',projectId:'P',lotId:'L',roundId:'R',stageId:'D',obligationGroupId:'G'}
 const request={groupScope,requestKey:'Q',requestDigest:'a'.repeat(64)}
 const original={...request,id:'FREEZE',projectId:'P',status:'NOT_EFFECTIVE',terminalRef:'STOP',frozenResult:null}
 const packageColumns=['id','projectId','packingRequestRef','format','packageHash','resourceVersionId',
  'selectionId','selectionVersion','selectionHash','requiredPositions','packed']
 const {DeliveryManifest,SubmissionPackage}=contentDeliveryPackageScenarioViews({DeliveryManifest:'id',SubmissionPackage:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{DeliveryManifest:{
  modelBinding:{modelId:'M',modelName:'DeliveryManifest'},columns:Object.keys(original).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalFreeze:DeliveryManifest.originalFreeze},
 },SubmissionPackage:{
  modelBinding:{modelId:'PKG-M',modelName:'SubmissionPackage'},columns:packageColumns.map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalPackedZip:SubmissionPackage.originalPackedZip},
 }}})
 const view=ds.getView('DeliveryManifest','originalFreeze')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'DeliveryManifest'})
 let items:Array<Omit<typeof original,'frozenResult'>&{frozenResult:unknown}>=[],hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:items.length,Items:items.map(item=>({...item,lingma_sys_params:{r:[],e:[],h:hidden?['terminalRef']:[],m:[],d:false}}))}}}),
 })})
 const packageView=ds.getView('SubmissionPackage','originalPackedZip')!
 const host={runtime:{resolveView:(key:string)=>key==='S@DeliveryManifest@originalFreeze'?view:
  key==='S@SubmissionPackage@originalPackedZip'?packageView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const unknown=await readRegisteredDeliveryFreeze(host,request)
  expect(unknown.status).toBe('UNKNOWN')
  items=[original]
  const result=await readRegisteredDeliveryFreeze(host,request)
  expect(result).toMatchObject({status:'NOT_EFFECTIVE',terminalRef:'STOP'})
  expect(()=>unknown.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=true
  await expect(readRegisteredDeliveryFreeze(host,request)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
  const text='冻结标书内容',position='标书.txt'
  const writer=new ZipWriter(new BlobWriter(),{useWebWorkers:false})
  await writer.add(position,new TextReader(text))
  const bytes=await (await writer.close()).arrayBuffer()
  const member={position,fileVersionId:'FILE1',fileHash:digest(new TextEncoder().encode(text))}
  const frozen={...request,selectionId:'SET',selectionVersion:'V1',expectedSelectionVersion:null,
   targetBasisRefs:['BASIS'],compatibilityRefs:['VERIFY'],checkedStateRefs:['APPROVAL'],
   members:[{...member,manifestId:'MANIFEST',manifestVersion:'M1'}]}
  const hashes=await computeDeliverySelectionDigests(frozen)
  const openAuthorized=vi.fn(async()=>({projectId:'P',resourceVersionId:'RESOURCE',bytes,assertCurrent:()=>{}}))
  const pack={projectId:'P',id:'PKG',packingRequestRef:'PACKING',format:'ZIP',resourceVersionId:'RESOURCE',packageHash:digest(new Uint8Array(bytes)),
   selectionId:frozen.selectionId,selectionVersion:frozen.selectionVersion,selectionHash:hashes.selectionHash,
   requiredPositions:[position],packed:[member]}
  const packageTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionPackage'})
  const executePackage=vi.fn(async()=>new DataSpaceQueryContext({
   identity:packageTable.identity,scope:'pkg',readScope:()=> 'pkg',snapshot:packageTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...pack,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  }))
  packageView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:executePackage})
  const reviewOptions={package:{packageId:'PKG',packingRequestRef:'PACKING'},openAuthorized,limits:{maxEntries:1,maxExpandedBytes:128}}
  items=[]
  expect(await reviewRegisteredDeliveryZipPackage(host,request,reviewOptions)).toMatchObject({status:'UNKNOWN'})
  expect(executePackage).not.toHaveBeenCalled()
  expect(openAuthorized).not.toHaveBeenCalled()
  items=[{...original,status:'FROZEN',frozenResult:{...frozen,...hashes}}]
  const requirements=[{kind:'SELECTION_USE',targetId:'USE'},{kind:'APPROVAL',targetId:'APPROVAL'}] as const
  const releaseScope={projectId:'P',packageId:'PKG',packageHash:pack.packageHash,selectionHash:hashes.selectionHash}
  const readPackageRelease=vi.fn(async()=>({rules:{...releaseScope,requirements,assertCurrent:host.assertCurrent},
   evidence:requirements.map(requirement=>({...releaseScope,...requirement,evidenceRef:requirement.targetId,
    accepted:true,assertCurrent:host.assertCurrent}))}))
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readPackingSelection:async()=>({selectionRef:'PACK',request,assertCurrent:host.assertCurrent,
    options:{...options,readCurrentUse:async()=>use}}),
   readFreezeSelection:async()=>({selectionRef:'FIXED',selection:frozen,assertCurrent:host.assertCurrent,
    uses:[{...member,projectId:'P',evidenceRef:'APPROVAL',usage:null,allowed:true,assertCurrent:host.assertCurrent}]}),
   readPackageSelection:async()=>({request,options:reviewOptions,assertCurrent:host.assertCurrent}),
   readPackageRelease,
  })
  const signal=new AbortController().signal
  await expect(page.invoke('content.submission.prepareFreeze',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('SUBMISSION_PAGE_FREEZE_SCOPE')
  await expect(page.invoke('content.submission.prepareFreeze',{selectionRef:'FIXED'},signal))
   .resolves.toMatchObject({record:{selectionHash:hashes.selectionHash}})
  await expect(page.invoke('content.submission.reviewPackage',{...reviewOptions.package,packingRequestRef:'OTHER'},signal))
   .rejects.toThrow('SUBMISSION_PAGE_PACKAGE_SCOPE')
  const checked=await page.invoke('content.submission.reviewPackage',reviewOptions.package,signal)
  expect(checked).toMatchObject({status:'FROZEN',proof:{membershipMatches:true},release:{deliverable:true}})
  expect(readPackageRelease).toHaveBeenCalledExactlyOnceWith(releaseScope,signal)
  expect(openAuthorized).toHaveBeenCalledWith({projectId:'P',packageId:'PKG',packingRequestRef:'PACKING',resourceVersionId:'RESOURCE'})
  await view.refresh()
  expect(()=>checked.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  const openOriginal=vi.fn(async()=>({projectId:'P',fileVersionId:'FILE1',bytes:new TextEncoder().encode(text).buffer,
   assertCurrent:()=>{}}))
  const options={positions:[position],maxMemberBytes:128,openOriginal}
  const memberUse={position,fileVersionId:'FILE1',usage:null}
  const use={allowed:true,selectionHash:hashes.selectionHash,positions:[position],members:[memberUse],assertCurrent:()=>{}}
  await expect(prepareRegisteredDeliveryZipPackage(host,request,{...options,readCurrentUse:async()=>({...use,allowed:false})}))
   .rejects.toThrow('DELIVERY_PACK_CURRENT_USE_REQUIRED')
  expect(openOriginal).not.toHaveBeenCalled()
  await expect(prepareRegisteredDeliveryZipPackage(host,request,{...options,
   readCurrentUse:async()=>({...use,members:[{...memberUse,usage:'READ_ONLY'}]})}))
   .rejects.toThrow('DELIVERY_PACK_MEMBER_USE_REQUIRED')
  expect(openOriginal).not.toHaveBeenCalled()
  const prepared=await prepareRegisteredDeliveryZipPackage(host,request,{...options,readCurrentUse:async scope=>{
   expect(scope.selectionHash).toBe(hashes.selectionHash)
   return use
  }})
  expect(prepared.status).toBe('PREPARED')
  expect(openOriginal).toHaveBeenCalledOnce()
  await expect(page.invoke('content.submission.preparePacking',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('SUBMISSION_PAGE_PACKING_SCOPE')
  const latest=await page.invoke('content.submission.preparePacking',{selectionRef:'PACK'},signal)
  expect(latest).toMatchObject({status:'PREPARED',candidate:{selectionHash:hashes.selectionHash,packed:[member]}})
  expect(openOriginal).toHaveBeenCalledTimes(2)
  if(!('candidate' in latest))throw Error('TEST_PACKING_REQUIRED')
  const registered={packageId:pack.id,packingRequestRef:pack.packingRequestRef}
  await expect(verifyRegisteredPackingCandidate(host,registered,latest.candidate,openAuthorized))
   .rejects.toThrow('SUBMISSION_ORIGINAL_PACKAGE_SCOPE')
  pack.packageHash=latest.candidate.packageHash
  const openRegistered=async()=>({...await openAuthorized(),bytes:latest.candidate.bytes})
  const verified=await verifyRegisteredPackingCandidate(host,registered,latest.candidate,openRegistered)
  expect(verified).toMatchObject({packageId:pack.id,packageHash:pack.packageHash,selectionHash:hashes.selectionHash})
  await expect(verifyRegisteredPackingCandidate(host,registered,latest.candidate,openAuthorized))
   .rejects.toThrow('SUBMISSION_ORIGINAL_PACKAGE_HASH')
 }finally{ds.destroy()}
})
