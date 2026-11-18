import {expect,it,vi} from 'vitest'
import {authorityScenarioViews} from '@/views/features/application/smart-bid/authority/authority-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareAuthorityGrantDecision,readOriginalAuthorityGrantRegistration} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {checkRegisteredAuthorityGrant} from '@/services/smart-bid/content/review/submission/authority-grant-coverage'
import {prepareSignatureRequest,recoverSignatureRequest} from '@/services/smart-bid/content/review/submission/signature-request'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {contentPackageSignatureScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {readRegisteredAuthorityGrantRegistration} from '@/views/features/application/smart-bid/authority/authority-grant-registration-reader'
import {createAuthorityGrantScriptHost} from '@/views/features/application/smart-bid/authority/authority-grant-script-host'
import script from '@/views/features/application/smart-bid/authority/page04/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('binds a revocation to its authority, affected scope and original version',async()=>{
 const request={enterpriseId:'ORG',grantId:'GRANT',requestKey:'Q',expectedVersion:'V1',intent:'REVOKE' as const,decisionRef:'DECISION'}
 let current=true
 const source={...request,decisionMakerId:'ISSUER',decisionAuthorityRef:'AUTH',representativeId:'REP',
  projectId:'P',actions:['WITHDRAW','SUBMIT'],objectRefs:['LOT'],effectiveAt:'2026-11-18T10:00:00+08:00',
  knownAt:'2026-11-18T11:00:00+08:00',expiresAt:'2026-11-19T10:00:00+08:00',
  assertCurrent:()=>{if(!current)throw Error('AUTH_STALE')}}
 const prepared=await prepareAuthorityGrantDecision(request,source)
 expect(prepared.record).toMatchObject({expectedVersion:'V1',intent:'REVOKE',decisionAuthorityRef:'AUTH'})
 expect((await prepareAuthorityGrantDecision(request,{...source,actions:['SUBMIT','WITHDRAW']})).requestDigest)
  .toBe(prepared.requestDigest)
 await expect(prepareAuthorityGrantDecision({...request,expectedVersion:null},source)).rejects.toThrow('AUTHORITY_GRANT_SCOPE')
 await expect(prepareAuthorityGrantDecision(request,{...source,enterpriseId:'OTHER'})).rejects.toThrow('AUTHORITY_GRANT_SCOPE')
 const earlier='2026-11-18T09:00:00+08:00'
 const first={...request,expectedVersion:null,intent:'REGISTER' as const,decisionRef:'FIRST'}
 const registered=await prepareAuthorityGrantDecision(first,{...source,...first,effectiveAt:earlier,knownAt:earlier})
 const versions=[{...registered,versionId:'V1'},{...prepared,versionId:'V2'}]
 const scope={enterpriseId:'ORG',grantId:'GRANT',representativeId:'REP',projectId:'P',action:'SUBMIT',
  objectRef:'LOT',actionAt:earlier,knownAt:source.knownAt}
 const evidence={versions,assertCurrent:()=>{}}
 const signature={...scope,signerRef:scope.representativeId,requestKey:'SIGN-1',objectKind:'PACKAGE' as const,
  objectVersion:'PACK-V1',objectHash:'a'.repeat(64),positionRef:'SEAL'}
 const signatureBasis={...signature,requirementRef:'RULE',coverageRef:'COVERAGE',approved:true,assertCurrent:()=>{}}
 const permitted={...evidence,versions:[{...versions[0]!,record:{...registered.record,actions:['SIGN']}},versions[1]!]}
 const signing=await prepareSignatureRequest(signature,signatureBasis,permitted)
 const originalSigning={...signature,requestDigest:signing.requestDigest}
 const signReceipt={request:originalSigning,state:'SIGNED' as const,operationRef:'OP',signatureRecordId:'SIG',
  signedObjectRef:'SIGNED-PACK',signedObjectHash:'c'.repeat(64),assertCurrent:evidence.assertCurrent}
 await expect(recoverSignatureRequest(originalSigning,{...evidence,lookup:async()=>undefined}))
  .resolves.toMatchObject({state:'UNKNOWN'})
 await expect(recoverSignatureRequest(originalSigning,{...evidence,lookup:async()=>signReceipt}))
  .resolves.toMatchObject({state:'SIGNED',signatureRecordId:'SIG',signedObjectRef:'SIGNED-PACK'})
 await expect(recoverSignatureRequest(originalSigning,{...evidence,lookup:async()=>({...signReceipt,
  request:{...originalSigning,objectVersion:'OTHER'},
 })})).rejects.toThrow('BID_SIGNATURE_RECOVERY_SCOPE')
 expect(signing.record).toMatchObject({authorityVersionId:'V1',objectVersion:'PACK-V1',positionRef:'SEAL'})
 const signRow={...originalSigning,objectKind:'PACKAGE' as 'PACKAGE'|'FILE',id:'SIG',state:'SIGNED',operationRef:'OP',signedObjectRef:'SIGNED-PACK',
  signedObjectHash:signReceipt.signedObjectHash,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}
 const signatures=DataSet.fromJson({scenarioId:'S',tables:{SignatureRecord:{
  modelBinding:{modelId:'SIGN-M',modelName:'SignatureRecord'},columns:Object.keys(signRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...contentPackageSignatureScenarioViews('id')},
 },ProducedFile:{modelBinding:{modelId:'FILE-M',modelName:'ProducedFile'},
  columns:['id','projectId','documentId','revisionId','fileHash','resourceVersionId','signatureOperationRef','signedObjectRef',
   'signatureRecordId','originalFileId','originalHash','signing'].map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalSignedRegistration:producedFileScenarioViews().originalSignedRegistration},
 }}})
 try{
  const signatureView=signatures.getView('SignatureRecord','originalSignatureRequest')!
  const signatureTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'SignatureRecord'})
  let found=false
  let selectedRow=signRow
  signatureView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:signatureTable.identity,scope:'sign',readScope:()=> 'sign',
   snapshot:signatureTable.applyResult({Result:{primaryKeyField:'id',data:{Count:found?1:0,Items:found?[selectedRow]:[]}}}),
  })})
  const page=createContentSubmissionScriptHost({resolveView:key=>key==='S@SignatureRecord@originalSignatureRequest'?signatureView:undefined,
   generation:1,isLoaded:true,destroyed:false},
   {scenarioId:'S',projectId:'P',assertCurrent:()=>{}},{
    readSignatureSelection:async()=>({selectionRef:'SIGNING',request:signature,basis:signatureBasis,authority:permitted}),
    readOriginalSignatureSelection:async()=>({selectionRef:'ORIGINAL',request:originalSigning,
     assertCurrent:evidence.assertCurrent}),
   })
  const signal=new AbortController()
  await expect(page.invoke('content.submission.prepareSignature',{selectionRef:'OTHER'},signal.signal))
   .rejects.toThrow('SUBMISSION_PAGE_SIGNATURE_SCOPE')
  const pageSigning=await page.invoke('content.submission.prepareSignature',{selectionRef:'SIGNING'},signal.signal)
  expect(pageSigning).toMatchObject({requestDigest:signing.requestDigest})
  await expect(page.invoke('content.submission.recoverSignature',{selectionRef:'OTHER'},signal.signal))
   .rejects.toThrow('SUBMISSION_PAGE_SIGNATURE_SCOPE')
  await expect(page.invoke('content.submission.recoverSignature',{selectionRef:'ORIGINAL'},signal.signal))
   .resolves.toMatchObject({state:'UNKNOWN'})
  found=true
  const pageRecovered=await page.invoke('content.submission.recoverSignature',{selectionRef:'ORIGINAL'},signal.signal)
  expect(pageRecovered).toMatchObject({state:'SIGNED',operationRef:'OP',signedObjectRef:'SIGNED-PACK'})
  signal.abort()
  expect(()=>pageSigning.assertCurrent()).toThrow('SUBMISSION_PAGE_STALE')
  expect(()=>pageRecovered.assertCurrent()).toThrow('SUBMISSION_PAGE_STALE')
  const bytes=new TextEncoder().encode('signed file').buffer
  const fileHash=await hashContentBytes(bytes)
  const fileRequest={...originalSigning,objectKind:'FILE' as const,objectRef:'ORIGINAL-FILE'}
  selectedRow={...signRow,...fileRequest,signedObjectRef:'SIGNED-FILE',signedObjectHash:fileHash}
  const fileScope={projectId:'P',documentId:'DOC',revisionId:'REV'}
  const receipt={...fileScope,signatureOperationRef:'OP',signatureRecordId:'SIG',originalFileId:fileRequest.objectRef,
   originalHash:fileRequest.objectHash,signedObjectRef:'SIGNED-FILE',resourceVersionId:'RESOURCE',fileHash}
  const registrationView=signatures.getView('ProducedFile','originalSignedRegistration')!
  const fileTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
  let registered=false
  let registeredSigner=fileRequest.signerRef
  registrationView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:fileTable.identity,scope:'produced',readScope:()=> 'produced',
   snapshot:fileTable.applyResult({Result:{primaryKeyField:'id',data:{Count:registered?1:0,
    Items:registered?[{...receipt,id:'REGISTERED',resourceVersionId:'REGISTERED-RESOURCE',
     signing:{requestKey:fileRequest.requestKey,requestDigest:fileRequest.requestDigest,objectVersion:fileRequest.objectVersion,
      signerRef:registeredSigner,positionRef:fileRequest.positionRef},
     lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
  })})
  let invalidRegisteredBytes=false
  const open=vi.fn(async({resourceVersionId}:{resourceVersionId:string})=>({projectId:'P',resourceVersionId,
   bytes:invalidRegisteredBytes&&resourceVersionId==='REGISTERED-RESOURCE'?new ArrayBuffer(1):bytes,
   assertCurrent:evidence.assertCurrent}))
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const review=createContentReviewScriptHost({resolveView:key=>key==='S@ProducedFile@originalSignedRegistration'?registrationView:signatureView,
   generation:1,isLoaded:true,destroyed:false},
   {scenarioId:'S',projectId:'P',assertCurrent:evidence.assertCurrent},{readSelection:unused,readField:unused,
    readDecision:unused,readCompleted:unused,openFile:unused,readSignedRegistrationSelection:async()=>({
     selectionRef:'FILE',request:fileRequest,assertCurrent:evidence.assertCurrent,open,
     original:{...fileScope,producedFileId:fileRequest.objectRef,objectVersion:fileRequest.objectVersion,
      versionHash:fileRequest.objectHash,assertCurrent:evidence.assertCurrent},
     receipt:{...receipt,assertCurrent:evidence.assertCurrent},
    })})
  const reviewSignal=new AbortController().signal
  found=false
  await expect(review.invoke('content.review.prepareSignedRegistration',{selectionRef:'FILE'},reviewSignal))
   .resolves.toMatchObject({state:'UNKNOWN'})
  expect(open).not.toHaveBeenCalled()
  found=true
  await expect(review.invoke('content.review.prepareSignedRegistration',{selectionRef:'FILE'},reviewSignal))
   .resolves.toMatchObject({state:'PREPARED',record:{signedObjectRef:'SIGNED-FILE',fileHash}})
  expect(open).toHaveBeenCalledOnce()
  registered=true
  await expect(review.invoke('content.review.prepareSignedRegistration',{selectionRef:'FILE'},reviewSignal))
   .resolves.toMatchObject({state:'SIGNED_REGISTERED',producedFileId:'REGISTERED',resourceVersionId:'REGISTERED-RESOURCE'})
  expect(open).toHaveBeenLastCalledWith({projectId:'P',resourceVersionId:'REGISTERED-RESOURCE'})
  registeredSigner='OTHER'
  await expect(review.invoke('content.review.prepareSignedRegistration',{selectionRef:'FILE'},reviewSignal))
   .rejects.toThrow('BID_SIGNED_REGISTRATION_REQUEST_MISMATCH')
  registeredSigner=fileRequest.signerRef
  invalidRegisteredBytes=true
  await expect(review.invoke('content.review.prepareSignedRegistration',{selectionRef:'FILE'},reviewSignal))
   .rejects.toThrow('BID_SIGNED_OUTPUT_HASH')
 }finally{signatures.destroy()}
 await expect(prepareSignatureRequest({...signature,actionAt:source.knownAt},signatureBasis,permitted))
  .rejects.toThrow('BID_SIGNATURE_AUTHORITY_REQUIRED')
 await expect(prepareSignatureRequest({...signature,objectHash:'b'.repeat(64)},signatureBasis,permitted))
  .rejects.toThrow('BID_SIGNATURE_TARGET_SCOPE')
 expect(checkRegisteredAuthorityGrant(scope,evidence)).toMatchObject({state:'COVERED',versionId:'V1'})
 expect(checkRegisteredAuthorityGrant({...scope,actionAt:source.knownAt},evidence)).toMatchObject({state:'REVOKED',versionId:'V2'})
 expect(checkRegisteredAuthorityGrant({...scope,action:'SIGN'},evidence)).toMatchObject({state:'OUTSIDE_SCOPE'})
 expect(()=>checkRegisteredAuthorityGrant(scope,{...evidence,versions:versions.slice(1)})).toThrow('AUTHORITY_GRANT_VERSION_CHAIN')
 const original={enterpriseId:request.enterpriseId,grantId:request.grantId,requestKey:request.requestKey,requestDigest:prepared.requestDigest}
 const result={...original,status:'REGISTERED' as const,versionId:'V2',record:prepared.record,assertCurrent:prepared.assertCurrent}
 type Response=Awaited<ReturnType<Parameters<typeof readOriginalAuthorityGrantRegistration>[1]['lookup']>>
 const lookup=(response?:Response)=>
  readOriginalAuthorityGrantRegistration(original,{lookup:async input=>{expect(input).toEqual(original);return response},assertCurrent:()=>{}})
 await expect(lookup()).resolves.toMatchObject({status:'UNKNOWN'})
 await expect(lookup({...original,status:'REJECTED',decisionRef:'REJECT',assertCurrent:()=>{}}))
  .resolves.toMatchObject({status:'REJECTED',decisionRef:'REJECT'})
 await expect(lookup({...result,record:{...result.record,representativeId:'OTHER'}})).rejects.toThrow('AUTHORITY_GRANT_REGISTRATION_SCOPE')
 const recovered=await lookup(result)
 expect(recovered).toMatchObject({status:'REGISTERED',versionId:'V2',record:prepared.record})
 const row={id:'V2',...original,status:'REGISTERED',versionId:'V2',decisionRef:request.decisionRef,decisionRecord:prepared.record}
 const scenarioViews=authorityScenarioViews({AuthorityGrant:'id',ResourceVersion:'id',ResourceUseDecision:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{AuthorityGrant:{
  modelBinding:{modelId:'G',modelName:'AuthorityGrant'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scenarioViews.AuthorityGrant},
 }}})
 try{
  const view=ds.getView('AuthorityGrant','originalRegistration')
  if(!view)throw Error('TEST_AUTHORITY_REGISTRATION_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'AuthorityGrant'})
  let hidden=false
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'grant',readScope:()=> 'grant',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['decisionRecord']:[],m:[],d:false}}]}}}),
  })})
  const host={enterpriseId:'ORG',scenarioId:'S',runtime:{resolveView:(key:string)=>key==='S@AuthorityGrant@originalRegistration'?view:undefined},
   assertCurrent:()=>{}}
  const read=await readRegisteredAuthorityGrantRegistration(host,original)
  expect(read).toMatchObject({status:'REGISTERED',versionId:'V2',record:prepared.record})
  expect(view.queryContext).toMatchObject({requestKey:original.requestKey})
  expect(view.queryContext).not.toHaveProperty('requestDigest')
  await expect(readRegisteredAuthorityGrantRegistration(host,{...original,requestDigest:'c'.repeat(64)}))
   .rejects.toThrow('AUTHORITY_GRANT_REGISTRATION_READ')
  const page=createAuthorityGrantScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const {openOriginalGrantRegistration}=compileFunctions(script,{$route:{query:original},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
  }} as unknown as PageContext)
  if(!openOriginalGrantRegistration)throw Error('TEST_AUTHORITY_REGISTRATION_HANDLER_REQUIRED')
  expect(()=>page.invoke('authority.grant.readRegistration',original,signal)).toThrow('AUTHORITY_GRANT_PAGE_REQUEST')
  await openOriginalGrantRegistration()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith([
   '原登记已确认 · 撤销 · 版本 V2','决定 DECISION · 代表 REP',`生效 ${source.effectiveAt} · 获知 ${source.knownAt}`,
  ].join('\n'),'代表委托登记回查')
  hidden=true
  await expect(readRegisteredAuthorityGrantRegistration(host,original)).rejects.toThrow('DATA_VIEW_READ_ROW')
  await openOriginalGrantRegistration()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('原委托登记无法核验','warning')
  expect(()=>read.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
 current=false
 expect(()=>prepared.assertCurrent()).toThrow('AUTH_STALE')
 expect(()=>recovered.assertCurrent()).toThrow('AUTH_STALE')
})
