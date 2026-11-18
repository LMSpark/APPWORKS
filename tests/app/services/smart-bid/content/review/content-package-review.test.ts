import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readSubmissionPackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/content-package-review'
import {reconcileDeadlinePackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/content-deadline-package-reconciliation'
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
  projectId:'P',deadline,links:[selected],assertCurrent:()=>{},
 },[result])
 expect(reconcile(link).items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'MATCHED'})
 expect(reconcile({...link,attemptRef:'OTHER'}).items[0]).toMatchObject({state:'EFFECTIVE_ATTEMPT',contentState:'PENDING'})
 expect(reconcile({...link,packageHash:'a'.repeat(64)}).items[0]?.contentState).toBe('PENDING')
 await expect(readSubmissionPackageMembers({...source,packageHash:'a'.repeat(64)},enumerate)).rejects.toThrow('SUBMISSION_PACKAGE_HASH_MISMATCH')
 expect(enumerate).toHaveBeenCalledOnce()
 await expect(readSubmissionPackageMembers(source,async()=>({complete:false,members:[]}))).rejects.toThrow('SUBMISSION_PACKAGE_INVENTORY_INCOMPLETE')
 current=false
 expect(()=>result.assertCurrent()).toThrow('PACKAGE_STALE')
})
