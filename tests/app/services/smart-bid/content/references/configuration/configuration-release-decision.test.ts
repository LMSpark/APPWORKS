import {expect,it} from 'vitest'
import {prepareConfigurationRelease,resolveActiveConfiguration} from '@/services/smart-bid/content/references/configuration/configuration-release-decision'

it('binds enablement evidence and stops parent inheritance for explicit disablement',async()=>{
 const scope={kind:'TEMPLATE',key:'PROPOSAL',scopeId:'ORG'}
 const version={versionId:'V1',digest:'a'.repeat(64)}
 const source={...scope,decisionRef:'DEC',authorityRef:'AUTH',assertCurrent:()=>{}}
 const enable={...source,action:'ENABLE' as const,candidate:version,typeCheckRef:'TYPE',closureCheckRef:'LINKS',reviewRef:'REVIEW'}
 const request={requestKey:'Q',expectedPointerVersion:'P1'}
 const prepared=await prepareConfigurationRelease(scope,request,enable)
 expect(prepared.record).toMatchObject({expectedPointerVersion:'P1',version,targetState:'ENABLED'})
 await expect(prepareConfigurationRelease(scope,request,{...enable,reviewRef:''})).rejects.toThrow('CONFIGURATION_RELEASE_EVIDENCE')
 const disabled=await prepareConfigurationRelease(scope,request,{...source,action:'DISABLE',original:version,
  effectiveAt:'2026-11-18T10:00:00+08:00',stopScope:'NEW_SELECTION'})
 expect(disabled.record).toMatchObject({targetState:'DISABLED',version})
 const parent={...scope,scopeId:'GLOBAL',pointerVersion:'G1',state:'ENABLED' as const,version}
 const local={...scope,pointerVersion:'P2',state:'DISABLED' as const}
 const read={scopeIds:['ORG','GLOBAL'],assertCurrent:()=>{}}
 expect(resolveActiveConfiguration(scope,{...read,pointers:[parent]})).toMatchObject({state:'ENABLED',scopeId:'GLOBAL'})
 expect(resolveActiveConfiguration(scope,{...read,pointers:[parent,local]})).toMatchObject({state:'DISABLED',scopeId:'ORG'})
})
