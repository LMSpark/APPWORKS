import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readProducedFileReviewVersion,readRegisteredProducedFileReviewVersion} from '@/views/features/application/smart-bid/authoring/model/review/content-produced-file-review'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reopens exactly the fixed production output and independently verifies its bytes',async()=>{
 const selection={projectId:'P',producedFileId:'FILE',productionRequestRef:'REQUEST'}
 const bytes=new TextEncoder().encode('标书实件')
 const fileHash=createHash('sha256').update(bytes).digest('hex')
 let current=true
 const original={...selection,revisionId:'R',documentId:'D',fileHash,
  assertCurrent:()=>{if(!current)throw Error('PRODUCTION_STALE')},reopen:vi.fn(async()=>bytes.buffer)}
 const verified=await readProducedFileReviewVersion(selection,async input=>{expect(input).toEqual(selection);return original})
 expect(verified).toMatchObject({revisionId:'R',documentId:'D',versionHash:fileHash})
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,productionRequestRef:'OTHER'})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
 expect(original.reopen).toHaveBeenCalledOnce()
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,reopen:async()=>new TextEncoder().encode('异版').buffer})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_HASH_MISMATCH')
 current=false
 expect(()=>verified.assertCurrent()).toThrow('PRODUCTION_STALE')
})

it('opens only the original registered resource version read through SPARK data',async()=>{
 const bytes=new TextEncoder().encode('registered file')
 const selection={producedFileId:'F',productionRequestRef:'REQUEST'}
 const row={id:'F',projectId:'P',productionRequestRef:'REQUEST',revisionId:'R',documentId:'D',
  fileHash:createHash('sha256').update(bytes).digest('hex'),resourceVersionId:'RESOURCE-V1'}
 const filters=([['projectId','projectId'],['id','producedFileId'],['productionRequestRef','productionRequestRef']] as const)
  .map(([field,ParamName])=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedReviewFile:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('ProducedFile','selectedReviewFile')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 let current=true
 const open=vi.fn(async()=>({projectId:'P',resourceVersionId:'RESOURCE-V1',bytes:bytes.buffer,
  assertCurrent:()=>{if(!current)throw Error('RESOURCE_STALE')}}))
 try{
  const result=await readRegisteredProducedFileReviewVersion(host,selection,open)
  expect(open).toHaveBeenCalledWith({...selection,projectId:'P',resourceVersionId:'RESOURCE-V1'})
  expect(result.versionHash).toBe(row.fileHash)
  current=false
  expect(()=>result.assertCurrent()).toThrow('RESOURCE_STALE')
  current=true
  await expect(readRegisteredProducedFileReviewVersion(host,{...selection,productionRequestRef:'OTHER'},open))
   .rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
  expect(open).toHaveBeenCalledOnce()
  await expect(readRegisteredProducedFileReviewVersion(host,selection,async()=>({...await open(),resourceVersionId:'OTHER'})))
   .rejects.toThrow('CONTENT_PRODUCED_FILE_RESOURCE_MISMATCH')
  expect(()=>result.assertCurrent()).toThrow()
 }finally{ds.destroy()}
})
