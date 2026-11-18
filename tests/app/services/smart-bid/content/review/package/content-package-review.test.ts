import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readSubmissionPackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/package/content-package-review'
import {reconcileDeadlinePackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-package-reconciliation'
import {attachDeadlinePackageDisposition,reconcileDeadlineContents,reconcileDeadlineDelivery} from '@/views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-reconciliation'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {reconcileSubmissionDeadline} from '@/services/smart-bid/content/review/submission-reconciliation'

it('verifies the sealed bytes before enumerating and compares independently read member bytes',async()=>{
 const bytes=new TextEncoder().encode('sealed archive'),member=new TextEncoder().encode('current file')
 const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex')
 const record={position:'商务/投标函.pdf',fileVersionId:'V1',fileHash:hash(member)}
 let current=true
 const source={projectId:'P',packageId:'PKG',packageHash:hash(bytes),expected:[record],packed:[record],
  reopen:async()=>bytes.buffer,assertCurrent:()=>{if(!current)throw Error('PACKAGE_STALE')}}
 const enumerate=vi.fn(async(input:ArrayBuffer)=>{
  expect([...new Uint8Array(input)]).toEqual([...bytes])
  return {complete:true,members:[{position:record.position,bytes:member.buffer}]}
 })
 const result=await readSubmissionPackageMembers(source,enumerate)
 expect(result.membershipMatches).toBe(true)
 const at='2026-11-18T10:00:00+08:00'
 const deadline=reconcileSubmissionDeadline({cutoffAt:at,knownAt:at,obligationIds:['O'],effects:[
  {kind:'RECEIVED',eventRef:'REC',obligationId:'O',attemptRef:'SEND',effectiveAt:at,knownAt:at},
 ]})
 const link={obligationId:'O',attemptRef:'SEND',packageId:'PKG',packageHash:source.packageHash,position:record.position,assertCurrent:()=>{}}
 const reconcile=(selected:typeof link)=>reconcileDeadlinePackageMembers({
  projectId:'P',deadline,requiredMembers:[{obligationId:'O',position:record.position}],links:[selected],assertCurrent:()=>{},
 },[result])
 expect(reconcile(link).items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'MATCHED'})
 expect(reconcile({...link,attemptRef:'OTHER'}).items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'PENDING'})
 expect(reconcile({...link,packageHash:'a'.repeat(64)}).items[0]?.contentState).toBe('PENDING')
 const mixed=reconcileDeadlinePackageMembers({projectId:'P',deadline,links:[link],assertCurrent:()=>{},requiredMembers:[
  {obligationId:'O',position:record.position},{obligationId:'O',position:'经济/分项表.pdf'},
 ]},[result])
 expect(mixed.items[0]).toMatchObject({contentState:'PENDING',members:[{state:'MATCHED'},{state:'PENDING'}]})
 const combined=reconcileDeadlineContents({projectId:'P',deadline,links:[link],assertCurrent:()=>{},
  requiredMembers:[{obligationId:'O',position:record.position}],requiredFields:[{obligationId:'O',assignmentId:'A',fieldId:'F'}],
 },{packages:[result],batches:[]})
 expect(combined.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'PENDING',
  members:[{state:'MATCHED'}],fields:[{state:'PENDING'}]})
 const extra=await readSubmissionPackageMembers(source,async()=>({complete:true,members:[
  {position:record.position,bytes:member.buffer},{position:'未列入清单.pdf',bytes:member.buffer},
 ]}))
 const combinedSource={projectId:'P',deadline,links:[link],assertCurrent:()=>{},
  requiredMembers:[{obligationId:'O',position:record.position}],requiredFields:[],
 }
 const actual=reconcileDeadlineContents(combinedSource,{packages:[extra],batches:[]})
 const scope={projectId:'P',lotId:'L',subjectId:'ORG',channelId:'PORTAL'}
 const receipt=pairOriginalChannelReceipt(scope,[{...scope,eventRef:'REC',operationRef:'OP',objectRef:'PKG',
  sourceRef:'ISSUER',eventAt:at,knownAt:at,kind:'RECEIVED'}],[{...scope,attemptRef:'SEND',operationRef:'OP',objectRef:'PKG'}])
 const receiptSource={scope,receipts:[receipt],decisions:[{eventRef:'REC',attemptRef:'SEND',kind:'RECEIVED' as const,
  obligationId:'O',ruleRef:'RULE',effectiveAt:at,knownAt:at,assertCurrent:()=>{}}],assertCurrent:()=>{}}
 const checked=reconcileDeadlineDelivery({cutoffAt:at,knownAt:at,obligationIds:['O'],roundId:'R'},receiptSource,
  {contents:combinedSource,proofs:{packages:[extra],batches:[]}})
 expect(checked.items[0]).toMatchObject({attemptRef:'SEND',contentState:'MATCHED'})
 expect(checked.evidence).toMatchObject([{eventRef:'REC',ruleRef:'RULE'}])
 expect(checked.packageChecks).toEqual(actual.packageChecks)
 const openingScope={projectId:'P',lotId:'L',roundId:'R',attemptRef:'SEND',objectRef:'PKG'}
 const later='2026-11-18T11:00:00+08:00'
 const dispositionSource={knownAt:later,assertCurrent:()=>{},records:[{...openingScope,
  eventRef:'OPEN',issuerRef:'ISSUER',eventAt:later,knownAt:later,stage:'OPENING' as const,
  state:'OPEN_FAILED' as const,assertCurrent:()=>{}}]}
 const binding={...openingScope,packageHash:link.packageHash,assertCurrent:()=>{}}
 const linked=attachDeadlinePackageDisposition(checked,binding,dispositionSource)
 expect(linked).toMatchObject({delivery:{knownAt:at,items:[{state:'EFFECTIVE_ATTEMPT'}]},
  disposition:{knownAt:later,opening:{state:'OPEN_FAILED'},admissibility:{state:'PENDING'}}})
 expect(()=>attachDeadlinePackageDisposition(checked,{...binding,attemptRef:'OTHER'},dispositionSource))
  .toThrow('SUBMISSION_DEADLINE_DISPOSITION_SCOPE')
 expect(()=>attachDeadlinePackageDisposition(checked,{...binding,roundId:'OTHER_ROUND'},
  {...dispositionSource,records:dispositionSource.records.map(record=>({...record,roundId:'OTHER_ROUND'}))}))
  .toThrow('SUBMISSION_DEADLINE_DISPOSITION_SCOPE')
 expect(actual.items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'MATCHED'})
 expect(actual.packageChecks).toMatchObject([{attemptRef:'SEND',packageId:'PKG',membershipMatches:false,
  issues:[{position:'未列入清单.pdf',issues:['UNPLANNED','PACKING_RECORD_MISSING']}]}])
 expect(reconcileDeadlineContents({...combinedSource,links:[{...link,attemptRef:'OTHER'}]},
  {packages:[extra],batches:[]}).packageChecks).toEqual([])
 await expect(readSubmissionPackageMembers({...source,packageHash:'a'.repeat(64)},enumerate)).rejects.toThrow('SUBMISSION_PACKAGE_HASH_MISMATCH')
 expect(enumerate).toHaveBeenCalledOnce()
 await expect(readSubmissionPackageMembers(source,async()=>({complete:false,members:[]}))).rejects.toThrow('SUBMISSION_PACKAGE_INVENTORY_INCOMPLETE')
 current=false
 expect(()=>result.assertCurrent()).toThrow('PACKAGE_STALE')
})
