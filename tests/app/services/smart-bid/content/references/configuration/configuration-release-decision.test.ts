import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {configurationReleaseReadView,readRegisteredConfigurationRelease} from '@/views/features/application/smart-bid/configuration/configuration-release-reader'
import {configurationChannelReadView,configurationVersionReadView} from '@/views/features/application/smart-bid/configuration/configuration-channel-reader'
import {createConfigurationReleaseScriptHost} from '@/views/features/application/smart-bid/configuration/configuration-release-script-host'
import script from '@/views/features/application/smart-bid/configuration/page19/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {prepareConfigurationRelease,resolveActiveConfiguration} from '@/services/smart-bid/content/references/configuration/configuration-release-decision'
import {readOriginalConfigurationRelease} from '@/services/smart-bid/content/references/configuration/configuration-release-recovery'
import {assessConfigurationDisableImpact} from '@/services/smart-bid/content/references/configuration/configuration-disable-impact'

it('reads the current channel in the trusted scope without reusing any historical release',async()=>{
 const row={id:'CHANNEL',kind:'template',key:'PROPOSAL',scope:'ENTERPRISE',scopeId:'ORG',version:'P3',state:'ACTIVE',hash:'a'.repeat(64)}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ConfigChannel:{
  modelBinding:{modelId:'C',modelName:'ConfigChannel'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},currentChannel:configurationChannelReadView('id')},
 }}})
 try{
  const view=ds.getView('ConfigChannel','currentChannel')!
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ConfigChannel'})
  const save=vi.fn(async()=>{throw Error('NO_WRITE')})
  view.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'channel',readScope:()=> 'channel',snapshot:table.applyResult({Result:{
    primaryKeyField:'id',data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]},
   }}),
  })})
  const page=createConfigurationReleaseScriptHost({resolveView:()=>view,generation:1,isLoaded:true,destroyed:false},
   {scenarioId:'S',scopeId:'ORG',configurationScope:'ENTERPRISE',assertCurrent:()=>{}})
  const selection={kind:row.kind,key:row.key},signal=new AbortController().signal
  const active=await page.invoke('configuration.release.readCurrentChannel',selection,signal)
  expect(active).toMatchObject({state:'ACTIVE',pointerVersion:'P3',versionDigest:row.hash})
  expect(view.queryContext).toMatchObject({...selection,scope:'ENTERPRISE',scopeId:'ORG'})
  row.state='DISABLED';row.version='P4'
  const disabled=await page.invoke('configuration.release.readCurrentChannel',selection,signal)
  expect(disabled).toMatchObject({state:'DISABLED',pointerVersion:'P4'})
  expect(disabled).not.toHaveProperty('versionDigest')
  expect(()=>active.assertCurrent()).toThrow()
  expect(()=>page.invoke('configuration.release.readCurrentChannel',{...selection,scopeId:'OTHER'},signal)).toThrow()
  expect(save).not.toHaveBeenCalled()
 }finally{ds.destroy()}
})

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
 const parent={...scope,scopeId:'GLOBAL',pointerVersion:'G1',state:'ACTIVE' as const,version}
 const local={...scope,pointerVersion:'P2',state:'DISABLED' as const}
 const read={scopeIds:['ORG','GLOBAL'],assertCurrent:()=>{}}
 expect(resolveActiveConfiguration(scope,{...read,pointers:[parent]})).toMatchObject({state:'ACTIVE',scopeId:'GLOBAL'})
 expect(resolveActiveConfiguration(scope,{...read,pointers:[parent,local]})).toMatchObject({state:'DISABLED',scopeId:'ORG'})
 const malformed={...local,state:'UNKNOWN'} as unknown as typeof local
 expect(()=>resolveActiveConfiguration(scope,{...read,pointers:[parent,malformed]})).toThrow('CONFIGURATION_POINTER_SCOPE')
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
 const channelRow={id:'CHANNEL',...scope,scope:'ENTERPRISE',state:'ACTIVE',version:'P1',hash:version.digest}
 const versionRow={id:'VERSION',kind:scope.kind,key:scope.key,hash:version.digest}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ConfigurationRelease:{
  modelBinding:{modelName:'ConfigurationRelease',modelId:'M'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},originalRelease:configurationReleaseReadView('id')},
 },ConfigChannel:{
  modelBinding:{modelName:'ConfigChannel',modelId:'C'},
  columns:Object.keys(channelRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},currentChannel:configurationChannelReadView('id')},
 },ConfigVersion:{
  modelBinding:{modelName:'ConfigVersion',modelId:'V'},
  columns:Object.keys(versionRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalVersion:configurationVersionReadView('id')},
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
  const channel=ds.getView('ConfigChannel','currentChannel')
  if(!channel)throw Error('TEST_CONFIGURATION_CHANNEL_VIEW_REQUIRED')
  const channelTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ConfigChannel'})
  channel.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:channelTable.identity,scope:'channel',readScope:()=> 'channel',snapshot:channelTable.applyResult({Result:{
    primaryKeyField:'id',data:{Count:1,Items:[{...channelRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]},
   }}),
  })})
  const versionView=ds.getView('ConfigVersion','originalVersion')
  if(!versionView)throw Error('TEST_CONFIGURATION_VERSION_VIEW_REQUIRED')
  const versionTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ConfigVersion'})
  let versionExists=true
  versionView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:versionTable.identity,scope:'version',readScope:()=> 'version',snapshot:versionTable.applyResult({Result:{
    primaryKeyField:'id',data:{Count:Number(versionExists),Items:versionExists?
     [{...versionRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]},
   }}),
  })})
  const host={scopeId:scope.scopeId,scenarioId:'S',configurationScope:'ENTERPRISE' as const,
   runtime:{resolveView:(key:string)=>key==='S@ConfigurationRelease@originalRelease'?view:
    key==='S@ConfigChannel@currentChannel'?channel:key==='S@ConfigVersion@originalVersion'?versionView:undefined},
   assertCurrent:source.assertCurrent}
  const original={...disabled.record,requestDigest:disabled.requestDigest}
  const proved=await readRegisteredConfigurationRelease(host,original)
  expect(proved).toMatchObject({status:'APPLIED',state:'DISABLED',resultPointerVersion:'P2'})
  let impactCurrent=true,expireImpactAfterRead=false
  const readDisableImpact=vi.fn(async()=>({stop:{...stop,assertCurrent:()=>{if(!impactCurrent)throw Error('IMPACT_STALE')}},uses:refs}))
  let pointerCurrent=true
  const oldVersion={versionId:'V0',digest:'b'.repeat(64)}
  const pointer={...scope,pointerVersion:'P1',version:oldVersion,assertCurrent:()=>{if(!pointerCurrent)throw Error('POINTER_STALE')}}
  const readCandidate=vi.fn(async()=>({decision:enable,pointer}))
  const disableDecision={...source,action:'DISABLE' as const,original:version,effectiveAt:'2026-11-18T10:00:00+08:00',
   stopScope:'NEW_SELECTION' as const}
  const readDisableDecision=vi.fn(async()=>({decision:disableDecision}))
  const page=createConfigurationReleaseScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,
   readDisableImpact,readCandidate,readDisableDecision)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const query={
   configurationKind:scope.kind,configurationKey:scope.key,candidateRequestKey:'Q',releaseRequestKey:request.requestKey,releaseRequestDigest:disabled.requestDigest,
   configurationVersionId:version.versionId,configurationVersionDigest:version.digest,releaseAction:'DISABLE',expectedPointerVersion:'P1',
   disableRequestKey:request.requestKey,disableDecisionRef:source.decisionRef,
  }
  let changeSelectionAfterRead:(()=>void)|undefined
  let rejectAfterSelectionChange=false
  const {openConfigurationRelease,openConfigurationCandidate,openConfigurationDisable}=compileFunctions(script,{$route:{query},
   $page:{invokeHostCommand:async(name:string,input:unknown)=>{
   const result=await page.invoke(name,input,signal)
   if(expireImpactAfterRead)impactCurrent=false
   changeSelectionAfterRead?.()
   if(rejectAfterSelectionChange)throw Error('OLD_QUERY_FAILED')
   return result
  },showAlert,showMessage}} as unknown as PageContext)
  if(!openConfigurationRelease||!openConfigurationCandidate||!openConfigurationDisable)throw Error('TEST_CONFIGURATION_RELEASE_HANDLER_REQUIRED')
  await openConfigurationDisable()
  expect(readDisableDecision).toHaveBeenCalledWith({...scope,versionId:version.versionId,decisionRef:source.decisionRef},signal)
  expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining(disabled.requestDigest),'配置停用核验')
  expect(versionView.queryContext).toMatchObject({kind:scope.kind,key:scope.key,hash:version.digest})
  versionExists=false
  await expect(page.invoke('configuration.release.prepareDisable',{
   kind:scope.kind,key:scope.key,requestKey:request.requestKey,versionId:version.versionId,decisionRef:source.decisionRef,
  },signal)).rejects.toThrow('CONFIGURATION_RELEASE_VERSION_MISSING')
  versionExists=true
  channelRow.hash=oldVersion.digest
  await openConfigurationDisable()
  expect(showMessage).toHaveBeenLastCalledWith('原停用决定或当前版本无法核验','warning')
  channelRow.hash=version.digest
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
  await expect(readRegisteredConfigurationRelease(host,{...original,requestDigest:'c'.repeat(64)}))
   .rejects.toThrow('CONFIGURATION_RELEASE_REGISTERED_READ')
  expect(view.queryContext).toMatchObject({...scope,requestKey:'Q'})
  expect(view.queryContext).not.toHaveProperty('requestDigest')
  await expect(readRegisteredConfigurationRelease(host,{...original,expectedPointerVersion:'OTHER'}))
   .rejects.toThrow('CONFIGURATION_RELEASE_REGISTERED_READ')
  channelRow.hash=oldVersion.digest
  await openConfigurationCandidate()
  expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining(
   `当前启用版 V0 · 摘要 ${oldVersion.digest}\n候选 V1 · 摘要 ${version.digest}\n预期指针 P1`),'配置候选核验')
  expect(readCandidate).toHaveBeenCalledWith({...scope,versionId:'V1'},signal)
  showAlert.mockClear()
  changeSelectionAfterRead=()=>{query.candidateRequestKey='OTHER'}
  await openConfigurationCandidate()
  expect(showAlert).not.toHaveBeenCalled()
  changeSelectionAfterRead=()=>{query.releaseRequestKey='OTHER'}
  await openConfigurationRelease()
  expect(showAlert).not.toHaveBeenCalled()
  query.candidateRequestKey='Q'
  rejectAfterSelectionChange=true
  changeSelectionAfterRead=()=>{query.candidateRequestKey='OTHER'}
  showMessage.mockClear()
  await openConfigurationCandidate()
  expect(query.candidateRequestKey).toBe('OTHER')
  expect(showMessage).not.toHaveBeenCalled()
  rejectAfterSelectionChange=false
  changeSelectionAfterRead=undefined
  const candidate=await page.invoke('configuration.release.prepareEnable',{kind:scope.kind,key:scope.key,versionId:'V1',requestKey:'Q'},signal)
  expect(candidate).toMatchObject({record:{expectedPointerVersion:'P1',typeCheckRef:'TYPE',closureCheckRef:'LINKS',reviewRef:'REVIEW'},
   requestDigest:prepared.requestDigest})
  channelRow.version='P2'
  await expect(page.invoke('configuration.release.prepareEnable',{kind:scope.kind,key:scope.key,versionId:'V1',requestKey:'Q'},signal))
   .rejects.toThrow('CONFIGURATION_RELEASE_CANDIDATE_SCOPE')
  channelRow.version='P1'
  await expect(page.invoke('configuration.release.prepareEnable',{kind:scope.kind,key:scope.key,versionId:'OTHER',requestKey:'Q'},signal))
   .rejects.toThrow('CONFIGURATION_RELEASE_CANDIDATE_SCOPE')
  pointerCurrent=false
  expect(()=>candidate.assertCurrent()).toThrow('POINTER_STALE')
  pointerCurrent=true
  versionExists=false
  await expect(page.invoke('configuration.release.prepareEnable',{kind:scope.kind,key:scope.key,versionId:'V1',requestKey:'Q'},signal))
   .rejects.toThrow('CONFIGURATION_RELEASE_VERSION_MISSING')
  hidden=true
  await expect(readRegisteredConfigurationRelease(host,original)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>proved.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
