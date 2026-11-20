import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readPlatformSubmissionReceipt} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-receipt-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('uses only the original channel reception event and its explicitly covered observations',async()=>{
 const row={id:'REC',projectId:'P',revisionId:'R',attemptRef:'SEND',eventKind:'RECEIVED',observationRefs:['OBS']}
 const filters=([['projectId','projectId'],['id','receiptRef'],['attemptRef','attemptRef']] as const)
  .map(([field,ParamName])=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ChannelReceipt:{
  modelBinding:{modelId:'M',modelName:'ChannelReceipt'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedPlatformReceipt:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('ChannelReceipt','selectedPlatformReceipt')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ChannelReceipt'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const selection={receiptRef:'REC',attemptRef:'SEND',revisionId:'R'}
 try{
  const receipt=await readPlatformSubmissionReceipt(host,selection)
  expect(receipt.observationRefs).toEqual(['OBS'])
  const config=view.queryConfig
  view.queryConfig={...config,cacheType:'page'}
  expect(()=>receipt.assertCurrent()).toThrow('CONTENT_PLATFORM_RECEIPT_STALE')
  await expect(readPlatformSubmissionReceipt(host,selection)).rejects.toThrow('CONTENT_PLATFORM_RECEIPT_VIEW')
  view.queryConfig=config
  row.eventKind='WITHDRAWN'
  await expect(readPlatformSubmissionReceipt(host,selection)).rejects.toThrow('CONTENT_PLATFORM_RECEIPT_NOT_ACCEPTED')
  expect(()=>receipt.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
