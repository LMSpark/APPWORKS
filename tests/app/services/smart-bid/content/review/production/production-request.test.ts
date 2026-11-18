import {expect,it} from 'vitest'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'
import {prepareExportRegistration} from '@/services/smart-bid/content/review/production/production-output-registration'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {prepareSignedOutputRegistration} from '@/services/smart-bid/content/review/production/signed-output-registration'
import {prepareNativePriceRegistration} from '@/services/smart-bid/content/review/production/native-price-registration'
import {recalculatePriceLines} from '@/services/smart-bid/content/references/commercial/price-sheet-recalculation'
import {prepareDisclosedOutputRegistration} from '@/services/smart-bid/content/review/production/disclosed-output-registration'

const scope={projectId:'P',documentId:'D',revisionId:'R',baselineId:'B'}
const version={...scope,state:'ADOPTED' as const,rootHash:'a'.repeat(64),assertCurrent:()=>{}}
const evidence={...scope,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:['F1'],
 formRequired:true,formVersionRef:'FORM-V1',requiredAttachmentRefs:['ATT-V1'],attachmentRefs:['ATT-V1'],assertCurrent:()=>{}}
const input={...scope,requestKey:'Q',purpose:'FORMAL' as const,toolVersionRef:'TOOL',outputOptions:{format:'DOCX'}}

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
 const result=await prepareNativePriceRegistration(source,approval,calculation,open)
 expect(result.record).toMatchObject({importRef:'IMPORT',pricingVersion:'PRICE-V1',approvalRef:'APPROVAL',fileHash})
 await expect(prepareNativePriceRegistration(source,{...approval,pricingVersion:'PRICE-V2'},calculation,open))
  .rejects.toThrow('BID_NATIVE_PRICE_REGISTRATION_SCOPE')
 await expect(prepareNativePriceRegistration(source,{...approval,value:'3.00'},calculation,open))
  .rejects.toThrow('BID_NATIVE_PRICE_REGISTRATION_APPROVAL')
})

it('keeps a signed file attached to its original file and signing operation',async()=>{
 const bytes=new TextEncoder().encode('signed file').buffer
 const fileHash=await hashContentBytes(bytes)
 const original={...scope,producedFileId:'BEFORE',versionHash:'b'.repeat(64),assertCurrent:()=>{}}
 const receipt={...scope,signatureOperationRef:'SIGN',signatureRecordId:'SR',originalFileId:'BEFORE',
  originalHash:original.versionHash,resourceVersionId:'AFTER',fileHash,assertCurrent:()=>{}}
 const open=async()=>({projectId:'P',resourceVersionId:'AFTER',bytes,assertCurrent:()=>{}})
 const signed=await prepareSignedOutputRegistration(original,receipt,open)
 expect(signed.record).toMatchObject({originalFileId:'BEFORE',signatureOperationRef:'SIGN',resourceVersionId:'AFTER',fileHash})
 await expect(prepareSignedOutputRegistration({...original,producedFileId:'OTHER'},receipt,open))
  .rejects.toThrow('BID_SIGNED_OUTPUT_SCOPE')
 await expect(prepareSignedOutputRegistration(original,receipt,async()=>({...await open(),resourceVersionId:'OTHER'})))
  .rejects.toThrow('BID_SIGNED_OUTPUT_RESOURCE')
 await expect(prepareSignedOutputRegistration(original,{...receipt,fileHash:'c'.repeat(64)},open))
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
