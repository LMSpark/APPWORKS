import {expect,it,vi} from 'vitest'
import {authorityScenarioViews} from '@/views/features/application/smart-bid/authority/authority-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {createBidResourceVersionHost} from '@/views/features/application/smart-bid/authority/resource-version-reader'
import script from '@/views/features/application/smart-bid/authority/page05/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('shows only the requested original metadata and suppresses unauthorized provenance',async()=>{
 const row={id:'VER-ID',resourceId:'RESOURCE',version:'V1',typeVersion:'LICENSE-V3',
  validFrom:null,validTo:'2026-12-31',sourceTerms:{issuer:'ISSUER'},rights:'EXTERNAL',files:[{id:'FILE-1'}],
  createdAt:'2026-11-18T10:00:00+08:00'}
 const scenarioViews=authorityScenarioViews({AuthorityGrant:'id',ResourceVersion:'id',ResourceUseDecision:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ResourceVersion:{
  modelBinding:{modelName:'ResourceVersion',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scenarioViews.ResourceVersion},
 }}})
 try{
  const view=ds.getView('ResourceVersion','originalVersion')
  const history=ds.getView('ResourceVersion','versionHistory')
  if(!view||!history)throw Error('TEST_RESOURCE_VERSION_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ResourceVersion'})
  let hidden:string[]=[],originalId=row.id
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'version',readScope:()=> 'version',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,id:originalId,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
  })})
  const historyTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ResourceVersion'})
  let historyCount=2
  history.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:historyTable.identity,scope:'history',readScope:()=> 'history',snapshot:historyTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:historyCount,Items:[row,{...row,id:'OLD-ID',version:'V0'}].map(item=>({
     ...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false},
    }))}}}),
  })})
  const runtime={resolveView:(key:string)=>key==='S@ResourceVersion@originalVersion'?view:
   key==='S@ResourceVersion@versionHistory'?history:undefined,generation:1,
   isLoaded:true,destroyed:false}
  const page=createBidResourceVersionHost(runtime,{scenarioId:'S',resourceId:'RESOURCE',assertCurrent:()=>{}})
  const signal=new AbortController().signal,showAlert=vi.fn<(message:string,title:string)=>Promise<void>>(async()=>{}),showMessage=vi.fn()
  const {__init__,openResourceVersion,openHistoricalResourceVersion,bindResourceVersionHistory,bindResourceVersionHistoryStatus}=compileFunctions(script,{$route:{query:{resourceVersion:'V1'}},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),resolveView:runtime.resolveView,showAlert,showMessage,
  }} as unknown as PageContext)
  if(!__init__||!openResourceVersion||!openHistoricalResourceVersion||!bindResourceVersionHistory||!bindResourceVersionHistoryStatus)
   throw Error('TEST_RESOURCE_VERSION_HANDLER_REQUIRED')
  await __init__()
  expect(bindResourceVersionHistory()).toEqual({dataViewKey:'S@ResourceVersion@versionHistory'})
  expect(bindResourceVersionHistoryStatus()).toEqual({status:'可读版本 2 项'})
  expect(history.queryContext).toMatchObject({resourceId:'RESOURCE'})
  await openResourceVersion()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith([
   '资料 RESOURCE · 版本 V1 · 原版编号 VER-ID','资料类型版本 LICENSE-V3 · 披露类别 对外','有效截止 2026-12-31',
   '出处 {"issuer":"ISSUER"}','原版附件 1 项','实际用途许可请核原使用决定',
  ].join('\n'),'企业资料原版')
  expect(view.queryContext).toMatchObject({resourceId:'RESOURCE',version:'V1'})
  await openHistoricalResourceVersion(history.rows[0])
  expect(showAlert).toHaveBeenCalledTimes(2)
  await openHistoricalResourceVersion({...history.rows[0],version:'OTHER'})
  expect(showAlert).toHaveBeenCalledTimes(2)
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('所选资料原版无法核验','warning')
  expect(view.queryContext).toMatchObject({resourceId:'RESOURCE',version:'V1'})
  showMessage.mockClear()
  originalId='DIFFERENT-ID'
  await openHistoricalResourceVersion(history.rows[0])
  expect(showAlert).toHaveBeenCalledTimes(2)
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('所选资料原版无法核验','warning')
  showMessage.mockClear()
  originalId=row.id
  await expect(page.invoke('bid.resources.readVersion',{version:'V2'},signal)).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  hidden=['files']
  await openResourceVersion()
  expect(showAlert.mock.lastCall?.[0]).toContain('原版附件待核')
  expect(showAlert.mock.lastCall?.[0]).not.toContain('FILE-1')
  hidden=['sourceTerms']
  await openResourceVersion()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('所选资料原版无法核验','warning')
  historyCount=3
  await __init__()
  expect(bindResourceVersionHistory()).toEqual({visible:false})
  expect(bindResourceVersionHistoryStatus()).toEqual({error:'资料版本历史无法核验'})
 }finally{ds.destroy()}
})
