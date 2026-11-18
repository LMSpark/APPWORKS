import {expect,it} from 'vitest'
import {readPlatformFieldReviewVersion} from '@/views/features/application/smart-bid/authoring/model/review/content-platform-field-review'

it('pins approved proposed value to the exact adopted response and platform field',async()=>{
 const selection={projectId:'P',revisionId:'R',assignmentId:'A',fieldId:'F'}
 let current=true
 const original={...selection,responseId:'RESP',fieldRuleRef:'RULE',approvalRef:'APPROVAL',value:false,unit:null,
  assertCurrent:()=>{if(!current)throw Error('FIELD_SOURCE_STALE')}}
 const read=()=>readPlatformFieldReviewVersion(selection,async input=>{expect(input).toEqual(selection);return original})
 const version=await read()
 expect(version.versionHash).toMatch(/^[a-f0-9]{64}$/)
 expect((await read()).versionHash).toBe(version.versionHash)
 const changed=await readPlatformFieldReviewVersion(selection,async()=>({...original,approvalRef:'OTHER'}))
 expect(changed.versionHash).not.toBe(version.versionHash)
 await expect(readPlatformFieldReviewVersion(selection,async()=>({...original,revisionId:'OTHER'})))
  .rejects.toThrow('CONTENT_PLATFORM_FIELD_SCOPE')
 current=false
 expect(()=>version.assertCurrent()).toThrow('FIELD_SOURCE_STALE')
})
