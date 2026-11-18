import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readSubmissionPackageMembers} from '@/views/features/application/smart-bid/authoring/model/review/content-package-review'

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
 await expect(readSubmissionPackageMembers({...source,packageHash:'a'.repeat(64)},enumerate)).rejects.toThrow('SUBMISSION_PACKAGE_HASH_MISMATCH')
 expect(enumerate).toHaveBeenCalledOnce()
 await expect(readSubmissionPackageMembers(source,async()=>({complete:false,members:[]}))).rejects.toThrow('SUBMISSION_PACKAGE_INVENTORY_INCOMPLETE')
 current=false
 expect(()=>result.assertCurrent()).toThrow('PACKAGE_STALE')
})
