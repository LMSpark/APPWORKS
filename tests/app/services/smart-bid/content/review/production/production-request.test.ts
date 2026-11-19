import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'
import {prepareExportRegistration} from '@/services/smart-bid/content/review/production/production-output-registration'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {prepareSignedOutputRegistration} from '@/services/smart-bid/content/review/production/signed-output-registration'
import {preparePaperOutputRegistration} from '@/services/smart-bid/content/review/production/paper-output-registration'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {recoverSignatureRequest} from '@/services/smart-bid/content/review/submission/signature-request'
import {prepareNativePriceRegistration} from '@/services/smart-bid/content/review/production/native-price-registration'
import {recalculatePriceLines} from '@/services/smart-bid/content/references/commercial/price-sheet-recalculation'
import {prepareDisclosedOutputRegistration} from '@/services/smart-bid/content/review/production/disclosed-output-registration'

const scope={projectId:'P',documentId:'D',revisionId:'R',baselineId:'B'}
const version={...scope,state:'ADOPTED' as const,rootHash:'a'.repeat(64),assertCurrent:()=>{}}
const evidence={...scope,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:['F1'],
 formRequired:true,formVersionRef:'FORM-V1',requiredAttachmentRefs:['ATT-V1'],attachmentRefs:['ATT-V1'],assertCurrent:()=>{}}
const input={...scope,requestKey:'Q',purpose:'FORMAL' as const,toolVersionRef:'TOOL',outputOptions:{format:'DOCX'}}

it('matches numbered paper copies and page order against independent observation',async()=>{
 const prepared=await prepareProductionRequest({...input,outputOptions:{format:'PAPER'}},version,evidence)
 const paper={...prepared.request,productionRequestRef:'PRINT',paperRef:'PAPER',assertCurrent:()=>{},
  copies:[{copyRef:'C1',pageRefs:['P1','P2']},{copyRef:'C2',pageRefs:['P1','P2']}]}
 const observed={...paper,complete:true,witnessRef:'W'}
 const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
 const row={...preparePaperOutputRegistration(prepared,paper,observed).record,id:'REG'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelName:'ProducedFile',modelId:'PAPER-M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedPaperRegistration:producedFileScenarioViews().selectedPaperRegistration},
 }}})
 try{
  const view=ds.getView('ProducedFile','selectedPaperRegistration')!
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
  let found=false
  view.bindQueryExecutor({save:unused,executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'p',readScope:()=> 'p',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:found?1:0,Items:found?[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
  })})
  const host=createContentReviewScriptHost({resolveView:()=>view,generation:1,isLoaded:true,destroyed:false},
   {scenarioId:'S',projectId:'P',assertCurrent:()=>{}},{readSelection:unused,readField:unused,readDecision:unused,
    readCompleted:unused,openFile:unused,readPaperRegistrationSelection:async()=>({selectionRef:'PAPER-REF',prepared,paper,observed})})
  const controller=new AbortController()
  const command='content.review.preparePaperRegistration'
  await expect(host.invoke(command,{selectionRef:'OTHER'},controller.signal)).rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  const result=await host.invoke(command,{selectionRef:'PAPER-REF'},controller.signal)
  expect(result).toMatchObject({registrationRef:null,record:{paperRef:'PAPER',witnessRef:'W',copies:paper.copies}})
  found=true
  await expect(host.invoke(command,{selectionRef:'PAPER-REF'},controller.signal)).resolves.toMatchObject({registrationRef:'REG'})
  row.witnessRef='OTHER'
  await expect(host.invoke(command,{selectionRef:'PAPER-REF'},controller.signal)).rejects.toThrow('CONTENT_PAPER_REGISTRATION_CONFLICT')
  controller.abort()
  expect(()=>result.assertCurrent()).toThrow('CONTENT_REVIEW_PAGE_STALE')
 }finally{ds.destroy()}
 expect(preparePaperOutputRegistration(prepared,paper,observed).record).toMatchObject({paperRef:'PAPER',witnessRef:'W',copies:paper.copies})
 expect(()=>preparePaperOutputRegistration(prepared,paper,{...observed,copies:paper.copies.slice(0,1)}))
  .toThrow('BID_PAPER_OUTPUT_COPIES')
 expect(()=>preparePaperOutputRegistration(prepared,paper,{...observed,copies:[
  {copyRef:'C1',pageRefs:['P2','P1']},paper.copies[1]!,
 ]})).toThrow('BID_PAPER_OUTPUT_PAGES')
 const retained=preparePaperOutputRegistration(prepared,paper,observed)
 observed.witnessRef='OTHER-WITNESS'
 expect(()=>retained.assertCurrent()).toThrow('BID_PAPER_OUTPUT_STALE')
 observed.witnessRef='W'
 paper.copies[0]?.pageRefs.reverse()
 expect(()=>retained.assertCurrent()).toThrow('BID_PAPER_OUTPUT_STALE')
})

it('keeps the actual disclosed member tied to its original subject and package for read-only use',async()=>{
 const bytes=new TextEncoder().encode('disclosed member').buffer
 const fileHash=await hashContentBytes(bytes),assertCurrent=()=>{}
 const publication={projectId:'P',publicationRef:'PUB',subjectId:'SUBJECT',packageRef:'PACKAGE',assertCurrent}
 const member={...publication,memberRef:'MEMBER',resourceVersionId:'V1',fileHash,bytes}
 await expect(prepareDisclosedOutputRegistration(publication,'MEMBER',async()=>member))
  .resolves.toMatchObject({record:{subjectId:'SUBJECT',packageRef:'PACKAGE',memberRef:'MEMBER',fileHash,usage:'READ_ONLY'}})
 await expect(prepareDisclosedOutputRegistration(publication,'outer-attachment.pdf',async()=>member))
  .rejects.toThrow('BID_DISCLOSED_OUTPUT_MEMBER')
 await expect(prepareDisclosedOutputRegistration(publication,'MEMBER',async()=>({...member,subjectId:'OTHER'})))
  .rejects.toThrow('BID_DISCLOSED_OUTPUT_MEMBER')
})

it('keeps a native price file attached to its original approved calculation version',async()=>{
 const bytes=new TextEncoder().encode('native price file').buffer
 const fileHash=await hashContentBytes(bytes),assertCurrent=()=>{}
 const source={projectId:'P',scopeRef:'LOT',pricingVersion:'PRICE-V1',importRef:'IMPORT',resourceVersionId:'FILE',fileHash,assertCurrent}
 const approval={scopeRef:'LOT',pricingVersion:'PRICE-V1',approvalRef:'APPROVAL',version:'1',detailRef:'DETAIL',
  value:'2.00',unit:'CNY',assertCurrent}
 const calculation=recalculatePriceLines({pricingVersion:'PRICE-V1',currency:'CNY',precision:2,rounding:'HALF_UP',
  lines:[{lineRef:'1',unit:'项',sourceRef:'IMPORT',quantity:'2',unitPrice:'1',reportedAmount:'2'}],assertCurrent})
 const open=async()=>({projectId:'P',resourceVersionId:'FILE',bytes,assertCurrent})
 const result=await prepareNativePriceRegistration(source,{approval,calculation,open})
 expect(result.record).toMatchObject({importRef:'IMPORT',pricingVersion:'PRICE-V1',approvalRef:'APPROVAL',fileHash})
 await expect(prepareNativePriceRegistration(source,{approval:{...approval,pricingVersion:'PRICE-V2'},calculation,open}))
  .rejects.toThrow('BID_NATIVE_PRICE_REGISTRATION_SCOPE')
 await expect(prepareNativePriceRegistration(source,{approval:{...approval,value:'3.00'},calculation,open}))
  .rejects.toThrow('BID_NATIVE_PRICE_REGISTRATION_APPROVAL')
})

it('keeps a signed file attached to its original file and signing operation',async()=>{
 const bytes=new TextEncoder().encode('signed file').buffer
 const fileHash=await hashContentBytes(bytes)
 const original={...scope,producedFileId:'BEFORE',objectVersion:'V1',versionHash:'b'.repeat(64),assertCurrent:()=>{}}
 const receipt={...scope,signatureOperationRef:'SIGN',signatureRecordId:'SR',originalFileId:'BEFORE',
  originalHash:original.versionHash,signedObjectRef:'SIGNED-FILE',resourceVersionId:'AFTER',fileHash,assertCurrent:()=>{}}
 const request={projectId:'P',objectKind:'FILE' as const,objectRef:'BEFORE',objectVersion:'V1',objectHash:original.versionHash,
  positionRef:'SEAL',signerRef:'SIGNER',requestKey:'REQ',requestDigest:'a'.repeat(64)}
 const recovered=await recoverSignatureRequest(request,{assertCurrent:original.assertCurrent,lookup:async()=>({
  request,state:'SIGNED',operationRef:'SIGN',signatureRecordId:'SR',signedObjectRef:'SIGNED-FILE',signedObjectHash:fileHash,
  assertCurrent:original.assertCurrent,
 })})
 if(recovered.state!=='SIGNED')throw Error('TEST_SIGNATURE_RESULT_REQUIRED')
 const open=async()=>({projectId:'P',resourceVersionId:'AFTER',bytes,assertCurrent:()=>{}})
 const signed=await prepareSignedOutputRegistration(original,receipt,{recovered,open})
 expect(signed.record).toMatchObject({originalFileId:'BEFORE',signatureOperationRef:'SIGN',resourceVersionId:'AFTER',fileHash,
  signing:{requestKey:'REQ',requestDigest:request.requestDigest,objectVersion:'V1',signerRef:'SIGNER',positionRef:'SEAL'}})
 await expect(prepareSignedOutputRegistration({...original,producedFileId:'OTHER'},receipt,{recovered,open}))
  .rejects.toThrow('BID_SIGNED_OUTPUT_SCOPE')
 await expect(prepareSignedOutputRegistration(original,receipt,{recovered,open:async()=>({...await open(),resourceVersionId:'OTHER'})}))
  .rejects.toThrow('BID_SIGNED_OUTPUT_RESOURCE')
 await expect(prepareSignedOutputRegistration(original,{...receipt,signatureOperationRef:'OTHER'},{recovered,open}))
  .rejects.toThrow('BID_SIGNED_OUTPUT_SCOPE')
 await expect(prepareSignedOutputRegistration(original,receipt,{recovered,open:async()=>({...await open(),bytes:new ArrayBuffer(1)})}))
  .rejects.toThrow('BID_SIGNED_OUTPUT_HASH')
})

it('fixes production inputs and checks a required original form and attachment independently',async()=>{
 const {request}=await prepareProductionRequest(input,version,evidence)
 expect(request).toMatchObject({revisionId:'R',formVersionRef:'FORM-V1',attachmentRefs:['ATT-V1']})
 expect((await prepareProductionRequest({...input,outputOptions:{format:'PDF'}},version,evidence)).request.inputDigest)
  .not.toBe(request.inputDigest)
 await expect(prepareProductionRequest(input,{...version,state:'CANDIDATE'},evidence)).rejects.toThrow('BID_PRODUCTION_SCOPE')
 await expect(prepareProductionRequest(input,version,{...evidence,formVersionRef:null})).rejects.toThrow('BID_PRODUCTION_EVIDENCE')
 await expect(prepareProductionRequest(input,version,{...evidence,attachmentRefs:[]})).rejects.toThrow('BID_PRODUCTION_EVIDENCE')
})

it('registers only bytes independently reopened from the original export resource version',async()=>{
 const prepared=await prepareProductionRequest(input,version,evidence)
 const bytes=new TextEncoder().encode('exported document').buffer
 const fileHash=await hashContentBytes(bytes)
 const receipt={...prepared.request,productionRequestRef:'RUN',outputRef:'DOCX',resourceVersionId:'FILE-V1',fileHash,assertCurrent:()=>{}}
 let current=true
 const reopen=async({projectId,resourceVersionId}:{projectId:string;resourceVersionId:string})=>({
  projectId,resourceVersionId,bytes,assertCurrent:()=>{if(!current)throw Error('TEST_EXPORT_STALE')},
 })
 const result=await prepareExportRegistration(prepared,receipt,reopen)
 expect(result.record).toMatchObject({requestKey:'Q',productionRequestRef:'RUN',outputRef:'DOCX',resourceVersionId:'FILE-V1',
  revisionId:'R',fileHash,templateVersionRef:'T1',formVersionRef:'FORM-V1'})
 await expect(prepareExportRegistration(prepared,{...receipt,requestKey:'OTHER'},reopen)).rejects.toThrow('BID_EXPORT_REGISTRATION_SCOPE')
 await expect(prepareExportRegistration(prepared,{...receipt,fileHash:'b'.repeat(64)},reopen)).rejects.toThrow('BID_EXPORT_REGISTRATION_HASH')
 current=false
 expect(()=>result.assertCurrent()).toThrow('TEST_EXPORT_STALE')
})
