import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareResourceUseDecision,readOriginalResourceUseRegistration} from '@/services/smart-bid/content/references/resource-use/resource-use-decision'
import {checkApplicableResourceUse,checkRegisteredResourceUse} from '@/services/smart-bid/content/references/resource-use/resource-use-coverage'
import {readRegisteredResourceUseRegistration,resourceUseRegistrationView} from '@/views/features/application/smart-bid/authority/resource-use-registration-reader'
import {createResourceUseScriptHost} from '@/views/features/application/smart-bid/authority/resource-use-script-host'
import script from '@/views/features/application/smart-bid/authority/page06/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('requires an original decision from the source enterprise for exact recipient uses and resource version',async()=>{
 const input={sourceEnterpriseId:'SOURCE',recipientEnterpriseId:'RECIPIENT',projectId:'P',applicationRef:'APPLICATION',
  resourceVersionId:'FILE-V1',decisionChainId:'CHAIN',requestKey:'Q',decisionRef:'DEC',expectedVersion:null,intent:'ALLOW' as const}
 const use={purposeId:'TENDER',recipientId:'USER',fieldIds:['TITLE','ID'],expiresAt:'2026-11-19T10:00:00+08:00'}
 const source={...input,decisionEnterpriseId:'SOURCE',decisionMakerId:'ISSUER',authorityRef:'AUTH',
  effectiveAt:'2026-11-18T10:00:00+08:00',knownAt:'2026-11-18T11:00:00+08:00',uses:[use],assertCurrent:()=>{}}
 const prepared=await prepareResourceUseDecision(input,source)
 expect(prepared.record.uses).toEqual([{...use,fieldIds:['ID','TITLE']}])
 const additional={...use,purposeId:'ARCHIVE',recipientId:'AUDITOR',fieldIds:['TITLE']}
 const multiUse=await prepareResourceUseDecision(input,{...source,uses:[use,additional]})
 const reordered=await prepareResourceUseDecision(input,{...source,uses:[additional,{...use,fieldIds:['ID','TITLE']}]})
 expect(multiUse.requestDigest).toBe(reordered.requestDigest)
 expect(multiUse.record.uses.map(item=>item.purposeId)).toEqual(['ARCHIVE','TENDER'])
 expect((await prepareResourceUseDecision(input,{...source,uses:[use,{...additional,recipientId:'OTHER'}]})).requestDigest)
  .not.toBe(multiUse.requestDigest)
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
 const validUse={...coverage,useAt:source.knownAt,knownAt:source.knownAt}
 const requirement={start:source.knownAt,end:later,units:1,assertCurrent:()=>{}}
 const allocation={...requirement,enterpriseId:'RECIPIENT',projectId:'P',resourceVersionId:'FILE-V1',
  allocationRef:'ALLOC',effectiveAt:source.effectiveAt,knownAt:source.knownAt}
 expect(checkApplicableResourceUse(validUse,evidence,requirement).allowed).toBe(false)
 expect(checkApplicableResourceUse(validUse,evidence,{...requirement,decision:allocation}))
  .toMatchObject({allowed:true,allocationRef:'ALLOC'})
 expect(checkApplicableResourceUse(validUse,evidence,{...requirement,decision:{...allocation,knownAt:later}}).allowed).toBe(false)
 expect(checkApplicableResourceUse(coverage,evidence,{...requirement,decision:allocation}).allowed).toBe(false)
 expect(()=>checkApplicableResourceUse(validUse,evidence,{...requirement,decision:{...allocation,projectId:'OTHER'}}))
  .toThrow('RESOURCE_USE_ALLOCATION_SCOPE')
 expect(()=>checkRegisteredResourceUse(coverage,{...evidence,versions:versions.slice(1)})).toThrow('RESOURCE_USE_VERSION_CHAIN')
 const changeRequest={...revokeRequest,intent:'CHANGE' as const,decisionRef:'CHANGE'}
 const change=await prepareResourceUseDecision(changeRequest,{...source,...changeRequest,effectiveAt:later,knownAt:later,
  uses:[{...use,fieldIds:['TITLE']}]})
 const changed={...evidence,versions:[{...prepared,versionId:'V1'},{...change,versionId:'V2'}]}
 expect(checkRegisteredResourceUse(coverage,changed)).toMatchObject({allowed:false,fields:[
  {fieldId:'ID',state:'REVOKED',decisionRef:'CHANGE'},{fieldId:'TITLE',state:'ALLOWED',decisionRef:'CHANGE'},
 ]})
 expect(checkRegisteredResourceUse({...coverage,useAt:source.knownAt},changed).allowed).toBe(true)
 const deny={...input,intent:'DENY' as const}
 const denied=await prepareResourceUseDecision(deny,{...source,...deny})
 const {sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId,requestKey}=deny
 const original={sourceEnterpriseId,recipientEnterpriseId,projectId,applicationRef,resourceVersionId,decisionChainId,requestKey,
  requestDigest:denied.requestDigest}
 let current=true
 const assertCurrent=()=>{if(!current)throw Error('RESULT_STALE')}
 const registered={...original,status:'REGISTERED' as const,versionId:'DENIED-V1',record:denied.record,assertCurrent}
 type Outcome=Awaited<ReturnType<Parameters<typeof readOriginalResourceUseRegistration>[1]['lookup']>>
 const lookup=(outcome?:Outcome)=>readOriginalResourceUseRegistration(original,{
  lookup:async request=>{expect(request).toEqual(original);return outcome},assertCurrent:()=>{},
 })
 await expect(lookup()).resolves.toMatchObject({status:'UNKNOWN'})
 await expect(lookup({...original,status:'REJECTED',receiptRef:'ERR',assertCurrent}))
  .resolves.toMatchObject({status:'REJECTED',receiptRef:'ERR'})
 await expect(lookup({...registered,resourceVersionId:'OTHER'})).rejects.toThrow('RESOURCE_USE_REGISTRATION_SCOPE')
 await expect(lookup({...registered,record:{...registered.record,authorityRef:'OTHER'}}))
  .rejects.toThrow('RESOURCE_USE_REGISTRATION_SCOPE')
 const recovered=await lookup(registered)
 expect(recovered).toMatchObject({status:'REGISTERED',versionId:'DENIED-V1',record:{intent:'DENY'}})
 const row={id:'DENIED-V1',...original,status:'REGISTERED',versionId:'DENIED-V1',receiptRef:'RECEIPT',decisionRecord:denied.record}
 const scenarioId='S',model='ResourceUseDecision'
 const ds=DataSet.fromJson({scenarioId,tables:{ResourceUseDecision:{
  modelBinding:{modelName:model,modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRegistration:resourceUseRegistrationView('id')},
 }}})
 try{
  const view=ds.getView(model,'originalRegistration')
  if(!view)throw Error('TEST_RESOURCE_USE_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId,metaName:model})
  let hidden=false
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'use',readScope:()=> 'use',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['decisionRecord']:[],m:[],d:false}}]}}}),
  })})
  const host={scenarioId,projectId,enterpriseId:recipientEnterpriseId,
   runtime:{resolveView:(key:string)=>key==='S@ResourceUseDecision@originalRegistration'?view:undefined},assertCurrent:()=>{}}
  expect(()=>readRegisteredResourceUseRegistration({...host,enterpriseId:'OTHER'},original)).toThrow('RESOURCE_USE_REGISTRATION_READ')
  const registeredUse=await readRegisteredResourceUseRegistration(host,original)
  expect(registeredUse).toMatchObject({status:'REGISTERED',versionId:'DENIED-V1',record:{intent:'DENY'}})
  expect(view.queryContext).toMatchObject(original)
  const runtime={...host.runtime,generation:1,isLoaded:true,destroyed:false}
  const page=createResourceUseScriptHost(runtime,host)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const {openResourceUseRegistration}=compileFunctions(script,{$route:{query:original},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
  }} as unknown as PageContext)
  if(!openResourceUseRegistration)throw Error('TEST_RESOURCE_USE_PAGE_HANDLER_REQUIRED')
  expect(()=>page.invoke('authority.resourceUse.readRegistration',original,signal)).toThrow('RESOURCE_USE_PAGE_REQUEST')
  await openResourceUseRegistration()
  expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining('原登记已确认 · 拒绝使用 · 版本 DENIED-V1'),'资料使用决定回查')
  row.status='REJECTED'
  await openResourceUseRegistration()
  expect(showAlert).toHaveBeenLastCalledWith('原登记请求被拒 · 凭据 RECEIPT','资料使用决定回查')
  row.status='UNKNOWN'
  await openResourceUseRegistration()
  expect(showAlert).toHaveBeenLastCalledWith('原登记结果未知','资料使用决定回查')
  row.status='REGISTERED'
  hidden=true
  await expect(readRegisteredResourceUseRegistration(host,original)).rejects.toThrow('DATA_VIEW_READ_ROW')
  await openResourceUseRegistration()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('原资料使用决定无法核验','warning')
  expect(()=>registeredUse.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
 current=false
 expect(()=>recovered.assertCurrent()).toThrow('RESULT_STALE')
})
