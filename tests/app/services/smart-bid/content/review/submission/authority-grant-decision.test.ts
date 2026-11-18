import {expect,it} from 'vitest'
import {prepareAuthorityGrantDecision} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {checkRegisteredAuthorityGrant} from '@/services/smart-bid/content/review/submission/authority-grant-coverage'

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
 expect(checkRegisteredAuthorityGrant(scope,evidence)).toMatchObject({state:'COVERED',versionId:'V1'})
 expect(checkRegisteredAuthorityGrant({...scope,actionAt:source.knownAt},evidence)).toMatchObject({state:'REVOKED',versionId:'V2'})
 expect(checkRegisteredAuthorityGrant({...scope,action:'SIGN'},evidence)).toMatchObject({state:'OUTSIDE_SCOPE'})
 expect(()=>checkRegisteredAuthorityGrant(scope,{...evidence,versions:versions.slice(1)})).toThrow('AUTHORITY_GRANT_VERSION_CHAIN')
 current=false
 expect(()=>prepared.assertCurrent()).toThrow('AUTH_STALE')
})
