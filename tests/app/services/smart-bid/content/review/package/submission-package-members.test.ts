import {expect,it} from 'vitest'
import {compareSubmissionPackageMembers} from '@/services/smart-bid/content/review/submission-package-members'

const record={position:'商务/投标函.pdf',fileVersionId:'NEW',fileHash:'a'.repeat(64)}
it('rejects an old packed file even when its observed bytes agree with the packing record',()=>{
 const old={...record,fileVersionId:'OLD',fileHash:'b'.repeat(64)}
 const result=compareSubmissionPackageMembers({expected:[record],packed:[old],observed:[old]})
 expect(result.members[0]?.issues).toEqual(['PACKED_VERSION_MISMATCH'])
 expect(result.membershipMatches).toBe(false)
 expect(compareSubmissionPackageMembers({expected:[record],packed:[record],observed:[record]}).membershipMatches).toBe(true)
})
it('reports an extra position, missing member and actual-byte mismatch independently',()=>{
 const other={...record,position:'技术/投标函.pdf'}
 const result=compareSubmissionPackageMembers({expected:[record,other],packed:[record,other],observed:[
  {...record,fileHash:'b'.repeat(64)},{...record,position:'重复/投标函.pdf'},
 ]})
 expect(result.members.flatMap(item=>item.issues)).toEqual(expect.arrayContaining([
  'OBSERVED_HASH_MISMATCH','MEMBER_MISSING','UNPLANNED','PACKING_RECORD_MISSING',
 ]))
 expect(()=>compareSubmissionPackageMembers({expected:[record],packed:[record],observed:[record,record]}))
  .toThrow('SUBMISSION_PACKAGE_MEMBER_SCOPE')
})
