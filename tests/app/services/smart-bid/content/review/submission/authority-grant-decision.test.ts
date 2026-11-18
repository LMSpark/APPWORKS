import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareAuthorityGrantDecision,readOriginalAuthorityGrantRegistration} from '@/services/smart-bid/content/review/submission/authority-grant-decision'
import {checkRegisteredAuthorityGrant} from '@/services/smart-bid/content/review/submission/authority-grant-coverage'
import {authorityGrantRegistrationView,readRegisteredAuthorityGrantRegistration} from '@/views/features/application/smart-bid/authority/authority-grant-registration-reader'
import {createAuthorityGrantScriptHost} from '@/views/features/application/smart-bid/authority/authority-grant-script-host'
import script from '@/views/features/application/smart-bid/authority/page04/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

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
 const original={enterpriseId:request.enterpriseId,grantId:request.grantId,requestKey:request.requestKey,requestDigest:prepared.requestDigest}
 const result={...original,status:'REGISTERED' as const,versionId:'V2',record:prepared.record,assertCurrent:prepared.assertCurrent}
 type Response=Awaited<ReturnType<Parameters<typeof readOriginalAuthorityGrantRegistration>[1]['lookup']>>
 const lookup=(response?:Response)=>
  readOriginalAuthorityGrantRegistration(original,{lookup:async input=>{expect(input).toEqual(original);return response},assertCurrent:()=>{}})
 await expect(lookup()).resolves.toMatchObject({status:'UNKNOWN'})
 await expect(lookup({...original,status:'REJECTED',decisionRef:'REJECT',assertCurrent:()=>{}}))
  .resolves.toMatchObject({status:'REJECTED',decisionRef:'REJECT'})
 await expect(lookup({...result,record:{...result.record,representativeId:'OTHER'}})).rejects.toThrow('AUTHORITY_GRANT_REGISTRATION_SCOPE')
 const recovered=await lookup(result)
 expect(recovered).toMatchObject({status:'REGISTERED',versionId:'V2',record:prepared.record})
 const row={id:'V2',...original,status:'REGISTERED',versionId:'V2',decisionRef:request.decisionRef,decisionRecord:prepared.record}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{AuthorityGrant:{
  modelBinding:{modelId:'G',modelName:'AuthorityGrant'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalRegistration:authorityGrantRegistrationView('id')},
 }}})
 try{
  const view=ds.getView('AuthorityGrant','originalRegistration')
  if(!view)throw Error('TEST_AUTHORITY_REGISTRATION_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'AuthorityGrant'})
  let hidden=false
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'grant',readScope:()=> 'grant',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['decisionRecord']:[],m:[],d:false}}]}}}),
  })})
  const host={enterpriseId:'ORG',scenarioId:'S',runtime:{resolveView:(key:string)=>key==='S@AuthorityGrant@originalRegistration'?view:undefined},
   assertCurrent:()=>{}}
  const read=await readRegisteredAuthorityGrantRegistration(host,original)
  expect(read).toMatchObject({status:'REGISTERED',versionId:'V2',record:prepared.record})
  expect(view.queryContext).toMatchObject(original)
  const page=createAuthorityGrantScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const {openOriginalGrantRegistration}=compileFunctions(script,{$route:{query:original},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
  }} as unknown as PageContext)
  if(!openOriginalGrantRegistration)throw Error('TEST_AUTHORITY_REGISTRATION_HANDLER_REQUIRED')
  expect(()=>page.invoke('authority.grant.readRegistration',original,signal)).toThrow('AUTHORITY_GRANT_PAGE_REQUEST')
  await openOriginalGrantRegistration()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith([
   '原登记已确认 · 撤销 · 版本 V2','决定 DECISION · 代表 REP',`生效 ${source.effectiveAt} · 获知 ${source.knownAt}`,
  ].join('\n'),'代表委托登记回查')
  hidden=true
  await expect(readRegisteredAuthorityGrantRegistration(host,original)).rejects.toThrow('DATA_VIEW_READ_ROW')
  await openOriginalGrantRegistration()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('原委托登记无法核验','warning')
  expect(()=>read.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
 current=false
 expect(()=>prepared.assertCurrent()).toThrow('AUTH_STALE')
 expect(()=>recovered.assertCurrent()).toThrow('AUTH_STALE')
})
