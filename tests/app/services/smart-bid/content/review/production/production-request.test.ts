import {expect,it} from 'vitest'
import {prepareProductionRequest} from '@/services/smart-bid/content/review/production/production-request'

const scope={projectId:'P',documentId:'D',revisionId:'R',baselineId:'B'}
const version={...scope,state:'ADOPTED' as const,rootHash:'a'.repeat(64),assertCurrent:()=>{}}
const evidence={...scope,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:['F1'],
 formRequired:true,formVersionRef:'FORM-V1',requiredAttachmentRefs:['ATT-V1'],attachmentRefs:['ATT-V1'],assertCurrent:()=>{}}
const input={...scope,requestKey:'Q',purpose:'FORMAL' as const,toolVersionRef:'TOOL',outputOptions:{format:'DOCX'}}

it('fixes production inputs and checks a required original form and attachment independently',async()=>{
 const {request}=await prepareProductionRequest(input,version,evidence)
 expect(request).toMatchObject({revisionId:'R',formVersionRef:'FORM-V1',attachmentRefs:['ATT-V1']})
 expect((await prepareProductionRequest({...input,outputOptions:{format:'PDF'}},version,evidence)).request.inputDigest)
  .not.toBe(request.inputDigest)
 await expect(prepareProductionRequest(input,{...version,state:'CANDIDATE'},evidence)).rejects.toThrow('BID_PRODUCTION_SCOPE')
 await expect(prepareProductionRequest(input,version,{...evidence,formVersionRef:null})).rejects.toThrow('BID_PRODUCTION_EVIDENCE')
 await expect(prepareProductionRequest(input,version,{...evidence,attachmentRefs:[]})).rejects.toThrow('BID_PRODUCTION_EVIDENCE')
})
