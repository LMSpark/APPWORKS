import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {configurationReleaseReadView,readRegisteredConfigurationRelease} from '@/views/features/application/smart-bid/configuration/configuration-release-reader'
import {createConfigurationReleaseScriptHost} from '@/views/features/application/smart-bid/configuration/configuration-release-script-host'
import script from '@/views/features/application/smart-bid/configuration/page19/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
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
 type Impact=Parameters<typeof assessConfigurationDisableImpact>
 expect(()=>assessConfigurationDisableImpact({...stop,stopScope:'UNRECOGNIZED'} as unknown as Impact[0],refs))
  .toThrow('CONFIGURATION_DISABLE_IMPACT_SCOPE')
 expect(()=>assessConfigurationDisableImpact(stop,{...refs,uses:[{...use,permission:'UNRECOGNIZED'}]} as unknown as Impact[1]))
  .toThrow('CONFIGURATION_DISABLE_IMPACT_SCOPE')
 expect(()=>assessConfigurationDisableImpact(stop,{...refs,uses:[{...use,state:'UNRECOGNIZED'}]} as unknown as Impact[1]))
  .toThrow('CONFIGURATION_DISABLE_IMPACT_SCOPE')
 const row={id:'ROW',...scope,requestKey:request.requestKey,requestDigest:disabled.requestDigest,action:'DISABLE',
  versionId:version.versionId,versionDigest:version.digest,expectedPointerVersion:'P1',status:'APPLIED',releaseRef:'STOP',
  resultPointerVersion:'P2',state:'DISABLED',terminalRef:'TERMINAL'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ConfigurationRelease:{
  modelBinding:{modelName:'ConfigurationRelease',modelId:'M'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},originalRelease:configurationReleaseReadView('id')},
 }}})
 try{
  const view=ds.getView('ConfigurationRelease','originalRelease')
  if(!view)throw Error('TEST_CONFIGURATION_RELEASE_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ConfigurationRelease'})
  let hidden=false
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'release',readScope:()=> 'release',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['resultPointerVersion']:[],m:[],d:false}}]}}}),
  })})
  const host={scopeId:scope.scopeId,scenarioId:'S',
   runtime:{resolveView:(key:string)=>key==='S@ConfigurationRelease@originalRelease'?view:undefined},assertCurrent:source.assertCurrent}
  const original={...disabled.record,requestDigest:disabled.requestDigest}
  const proved=await readRegisteredConfigurationRelease(host,original)
  expect(proved).toMatchObject({status:'APPLIED',state:'DISABLED',resultPointerVersion:'P2'})
  let impactCurrent=true,expireImpactAfterRead=false
  const readDisableImpact=vi.fn(async()=>({stop:{...stop,assertCurrent:()=>{if(!impactCurrent)throw Error('IMPACT_STALE')}},uses:refs}))
  const page=createConfigurationReleaseScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,readDisableImpact)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  const {openConfigurationRelease}=compileFunctions(script,{$route:{query:{
   configurationKind:scope.kind,configurationKey:scope.key,releaseRequestKey:request.requestKey,releaseRequestDigest:disabled.requestDigest,
   configurationVersionId:version.versionId,configurationVersionDigest:version.digest,releaseAction:'DISABLE',expectedPointerVersion:'P1',
  }},$page:{invokeHostCommand:async(name:string,input:unknown)=>{
   const result=await page.invoke(name,input,signal)
   if(expireImpactAfterRead)impactCurrent=false
   return result
  },showAlert}} as unknown as PageContext)
  if(!openConfigurationRelease)throw Error('TEST_CONFIGURATION_RELEASE_HANDLER_REQUIRED')
  expect(()=>page.invoke('configuration.release.readOriginal',{scopeId:'OTHER'},signal)).toThrow('CONFIGURATION_RELEASE_PAGE_REQUEST')
  await openConfigurationRelease()
  expect(showAlert).toHaveBeenLastCalledWith([
   '原停用已生效 · 原回执 STOP · 当次指针 P2 · 配置版本 V1','停用影响尚未核全',
   'RUN · 原锁可续办 · 跟踪人 OWNER','UNKNOWN · 待查原操作 · 跟踪人 OWNER','SENT · 保留已执行记录 · 跟踪人 OWNER',
  ].join('\n'),'配置启停回查')
  expect(readDisableImpact).toHaveBeenCalledExactlyOnceWith({...scope,...version,releaseRef:'STOP'},signal)
  row.status='NOT_APPLIED'
  await openConfigurationRelease()
  expect(showAlert).toHaveBeenLastCalledWith('原停用未生效 · 凭据 TERMINAL','配置启停回查')
  row.status='UNKNOWN'
  await openConfigurationRelease()
  expect(showAlert).toHaveBeenLastCalledWith('原停用结果未知','配置启停回查')
  expect(readDisableImpact).toHaveBeenCalledTimes(1)
  row.status='APPLIED'
  readDisableImpact.mockResolvedValueOnce({stop:{...stop,releaseRef:'DIFFERENT'},uses:refs})
  await openConfigurationRelease()
  expect(showAlert).toHaveBeenLastCalledWith(
   '原停用已生效 · 原回执 STOP · 当次指针 P2 · 配置版本 V1\n停用影响证据无法核验','配置启停回查')
  expireImpactAfterRead=true
  await openConfigurationRelease()
  expect(showAlert).toHaveBeenLastCalledWith(
   '原停用已生效 · 原回执 STOP · 当次指针 P2 · 配置版本 V1\n停用影响证据无法核验','配置启停回查')
  await expect(readRegisteredConfigurationRelease(host,{...original,expectedPointerVersion:'OTHER'}))
   .rejects.toThrow('CONFIGURATION_RELEASE_REGISTERED_READ')
  hidden=true
  await expect(readRegisteredConfigurationRelease(host,original)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>proved.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
