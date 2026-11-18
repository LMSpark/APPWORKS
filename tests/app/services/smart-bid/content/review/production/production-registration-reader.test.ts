import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readOriginalExportRegistration} from '@/views/features/application/smart-bid/authoring/model/review/production/production-registration-reader'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads the original registration, rejects a different hash and keeps an empty result unknown',async()=>{
 const record={projectId:'P',documentId:'D',revisionId:'R',requestKey:'Q',inputDigest:'a'.repeat(64),productionRequestRef:'RUN',
  outputRef:'DOCX',resourceVersionId:'NEW',fileHash:'b'.repeat(64),templateVersionRef:'T',ruleVersionRef:'RULE',formVersionRef:null}
 const row={...record,id:'ORIGINAL',resourceVersionId:'V1',lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}
 let rows=[row]
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalExportRegistration:{commitMode:'staged',queryConfig:{autoQuery:false},
   scopeFilter:{logic:'and',filters:['projectId','requestKey','outputRef'].map(field=>({
    field,operator:'eq',value:{Type:'GetInputParam',ParamName:field},
   }))}}},
 }}})
 const view=ds.getView('ProducedFile','originalExportRegistration')!
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 view.bindQueryExecutor({save:async()=>{throw Error('UNEXPECTED_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:rows.length,Items:rows}}}),
 })})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const read=()=>readOriginalExportRegistration(host,{record,assertCurrent:()=>{}})
 try{
  const original=await read()
  expect(original).toMatchObject({state:'REGISTERED',producedFileId:'ORIGINAL',resourceVersionId:'V1'})
  rows=[{...row,fileHash:'c'.repeat(64)}]
  await expect(read()).rejects.toThrow('BID_EXPORT_REGISTRATION_HASH_CONFLICT')
  expect(()=>original.assertCurrent()).toThrow()
  rows=[]
  await expect(read()).resolves.toMatchObject({state:'UNKNOWN'})
 }finally{ds.destroy()}
})
