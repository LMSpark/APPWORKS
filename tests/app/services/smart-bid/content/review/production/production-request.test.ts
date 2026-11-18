import {expect,it} from 'vitest'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'
import {prepareExportRegistration} from '@/services/smart-bid/content/review/production/production-output-registration'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'
import {prepareSignedOutputRegistration} from '@/services/smart-bid/content/review/production/signed-output-registration'

const scope={projectId:'P',documentId:'D',revisionId:'R',baselineId:'B'}
const version={...scope,state:'ADOPTED' as const,rootHash:'a'.repeat(64),assertCurrent:()=>{}}
const evidence={...scope,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:['F1'],
 formRequired:true,formVersionRef:'FORM-V1',requiredAttachmentRefs:['ATT-V1'],attachmentRefs:['ATT-V1'],assertCurrent:()=>{}}
const input={...scope,requestKey:'Q',purpose:'FORMAL' as const,toolVersionRef:'TOOL',outputOptions:{format:'DOCX'}}

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
