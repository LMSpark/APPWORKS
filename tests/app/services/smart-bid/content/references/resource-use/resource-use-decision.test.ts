import {expect,it} from 'vitest'
import {prepareResourceUseDecision} from '@/services/smart-bid/content/references/resource-use/resource-use-decision'
import {checkRegisteredResourceUse} from '@/services/smart-bid/content/references/resource-use/resource-use-coverage'

it('requires an original decision from the source enterprise for exact recipient uses and resource version',async()=>{
 const input={sourceEnterpriseId:'SOURCE',recipientEnterpriseId:'RECIPIENT',projectId:'P',applicationRef:'APPLICATION',
  resourceVersionId:'FILE-V1',decisionChainId:'CHAIN',requestKey:'Q',decisionRef:'DEC',expectedVersion:null,intent:'ALLOW' as const}
 const use={purposeId:'TENDER',recipientId:'USER',fieldIds:['TITLE','ID'],expiresAt:'2026-11-19T10:00:00+08:00'}
 const source={...input,decisionEnterpriseId:'SOURCE',decisionMakerId:'ISSUER',authorityRef:'AUTH',
  effectiveAt:'2026-11-18T10:00:00+08:00',knownAt:'2026-11-18T11:00:00+08:00',uses:[use],assertCurrent:()=>{}}
 const prepared=await prepareResourceUseDecision(input,source)
 expect(prepared.record.uses).toEqual([{...use,fieldIds:['ID','TITLE']}])
 await expect(prepareResourceUseDecision(input,{...source,decisionEnterpriseId:'RECIPIENT'}))
  .rejects.toThrow('RESOURCE_USE_DECISION_SCOPE')
 await expect(prepareResourceUseDecision(input,{...source,resourceVersionId:'FILE-V2'})).rejects.toThrow('RESOURCE_USE_DECISION_SCOPE')
 await expect(prepareResourceUseDecision(input,{...source,uses:[use,use]})).rejects.toThrow('RESOURCE_USE_DECISION_USES')
 const revoked={...input,intent:'REVOKE' as const}
 await expect(prepareResourceUseDecision(revoked,{...source,intent:'REVOKE'})).rejects.toThrow('RESOURCE_USE_DECISION_SCOPE')
 const later='2026-11-18T13:00:00+08:00'
 const revokeRequest={...revoked,requestKey:'REVOKE',decisionRef:'DEC-2',expectedVersion:'V1'}
 const revocation=await prepareResourceUseDecision(revokeRequest,{...source,...revokeRequest,effectiveAt:later,knownAt:later,
  uses:[{...use,fieldIds:['ID']}]})
 const versions=[{...prepared,versionId:'V1'},{...revocation,versionId:'V2'}]
 const coverage={...input,purposeId:use.purposeId,recipientId:use.recipientId,fieldIds:['ID','TITLE'],
  useAt:later,knownAt:later}
 const evidence={versions,assertCurrent:()=>{}}
 expect(checkRegisteredResourceUse(coverage,evidence)).toMatchObject({allowed:false,
  fields:[{state:'REVOKED',versionId:'V2'},{state:'ALLOWED',versionId:'V1'}]})
 expect(checkRegisteredResourceUse({...coverage,useAt:source.knownAt},evidence).allowed).toBe(true)
 expect(checkRegisteredResourceUse({...coverage,fieldIds:['TITLE']},evidence).allowed).toBe(true)
 expect(()=>checkRegisteredResourceUse(coverage,{...evidence,versions:versions.slice(1)})).toThrow('RESOURCE_USE_VERSION_CHAIN')
 const changeRequest={...revokeRequest,intent:'CHANGE' as const,decisionRef:'CHANGE'}
 const change=await prepareResourceUseDecision(changeRequest,{...source,...changeRequest,effectiveAt:later,knownAt:later,
  uses:[{...use,fieldIds:['TITLE']}]})
 const changed={...evidence,versions:[{...prepared,versionId:'V1'},{...change,versionId:'V2'}]}
 expect(checkRegisteredResourceUse(coverage,changed)).toMatchObject({allowed:false,fields:[
  {fieldId:'ID',state:'REVOKED',decisionRef:'CHANGE'},{fieldId:'TITLE',state:'ALLOWED',decisionRef:'CHANGE'},
 ]})
 expect(checkRegisteredResourceUse({...coverage,useAt:source.knownAt},changed).allowed).toBe(true)
})
