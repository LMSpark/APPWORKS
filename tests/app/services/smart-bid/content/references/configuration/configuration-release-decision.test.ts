import {expect,it} from 'vitest'
import {prepareConfigurationRelease,resolveActiveConfiguration} from '@/services/smart-bid/content/references/configuration/configuration-release-decision'
import {readOriginalConfigurationRelease} from '@/services/smart-bid/content/references/configuration/configuration-release-recovery'
import {assessConfigurationDisableImpact} from '@/services/smart-bid/content/references/configuration/configuration-disable-impact'

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
 const recover=(lookup:Parameters<typeof readOriginalConfigurationRelease>[1]['lookup'])=>
  readOriginalConfigurationRelease({...disabled.record,requestDigest:disabled.requestDigest},{lookup,assertCurrent:source.assertCurrent})
 expect(await recover(async()=>undefined)).toMatchObject({status:'UNKNOWN'})
 expect(await recover(async original=>({...original,status:'APPLIED',state:'DISABLED',releaseRef:'STOP',
  resultPointerVersion:'P2',assertCurrent:source.assertCurrent}))).toMatchObject({status:'APPLIED',state:'DISABLED',resultPointerVersion:'P2'})
 await expect(recover(async original=>({...original,status:'APPLIED',state:'ENABLED',releaseRef:'LATER',
  resultPointerVersion:'P3',assertCurrent:source.assertCurrent}))).rejects.toThrow('CONFIGURATION_RELEASE_RECOVERY_SCOPE')
 const stop={...scope,...version,releaseRef:'STOP',stopScope:'NEW_SELECTION' as const,assertCurrent:source.assertCurrent}
 const use={...scope,...version,operationRef:'RUN',lockRef:'LOCK',ownerId:'OWNER',state:'UNEXECUTED' as const,
  permission:'ALLOWED' as const,permissionRef:'CURRENT-AUTH',assertCurrent:source.assertCurrent}
 const refs={complete:false,assertCurrent:source.assertCurrent,uses:[use,{...use,operationRef:'UNKNOWN',state:'UNKNOWN' as const},
  {...use,operationRef:'SENT',state:'EXECUTED' as const}]}
 expect(assessConfigurationDisableImpact(stop,refs)).toMatchObject({assessmentComplete:false,items:[
  {action:'MAY_CONTINUE'},{action:'CHECK_ORIGINAL'},{action:'PRESERVE_HISTORY'},
 ]})
 expect(assessConfigurationDisableImpact({...stop,stopScope:'UNEXECUTED'},refs).items[0]?.action).toBe('HOLD')
 expect(assessConfigurationDisableImpact(stop,{...refs,uses:[{...use,permission:'DENIED'}]}).items[0]?.action).toBe('HOLD')
})
