import {expect,it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredOriginalContentDraftSave} from '@/views/features/application/smart-bid/authoring/model/content-draft-save-reader'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

it('reads only the original authorized save result and keeps a missing result unknown',async()=>{
 const input={requestKey:'Q',requestDigest:'a'.repeat(64),contentDigest:'b'.repeat(64),expectedDraftVersion:'V1'}
 const row={...input,id:'R',projectId:'P',draftId:'D',authorId:'U',state:'SAVED',draftVersion:'V2',receiptRef:'RC'}
 const filters=['projectId','draftId','authorId','requestKey','requestDigest'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SaveReceipt:{
  modelBinding:{modelId:'R',modelName:'SaveReceipt'},columns:Object.keys(row).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},originalDraftSave:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('SaveReceipt','originalDraftSave')
 if(!view)throw Error('TEST_RECEIPT_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SaveReceipt'})
 let authorId='U',hidden:string[]=[],missing=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:missing?0:1,Items:missing?[]:[{...row,authorId,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
 })})
 const receiptDataViewKey='S@SaveReceipt@originalDraftSave'
 const host={runtime:{resolveView:(key:string)=>key===receiptDataViewKey?view:undefined},scenarioId:'S',projectId:'P',
  draftId:'D',actorUserId:'U',receiptDataViewKey,assertCurrent:()=>{}}
 try{
  const saved=await readRegisteredOriginalContentDraftSave(host,input)
  expect(saved).toMatchObject({state:'SAVED',draftVersion:'V2',receiptRef:'RC'})
  expect(view.queryContext).toMatchObject({projectId:'P',draftId:'D',authorId:'U',requestKey:'Q',requestDigest:input.requestDigest})
  hidden=['receiptRef']
  await expect(readRegisteredOriginalContentDraftSave(host,input)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(()=>saved.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=[];authorId='OTHER'
  await expect(readRegisteredOriginalContentDraftSave(host,input)).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
  missing=true
  await expect(readRegisteredOriginalContentDraftSave(host,input)).resolves.toMatchObject({state:'UNKNOWN'})
  const mismatched={...host,receiptDataViewKey:'S@OtherReceipt@originalDraftSave',runtime:{resolveView:()=>view}}
  await expect(readRegisteredOriginalContentDraftSave(mismatched,input)).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
  view.queryConfig={...view.queryConfig,cacheType:'page'}
  await expect(readRegisteredOriginalContentDraftSave(host,input)).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
 }finally{ds.destroy()}
})
