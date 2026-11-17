import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentTenderRecord} from '@/views/features/application/smart-bid/authoring/model/content-tender-record-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const ref={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
function fixture(override:Readonly<Record<string,unknown>>={}){
 const row={id:'R',projectId:'P',...ref,payload:{text:'原文'},sourceSpan:{page:1},parseQuality:'LOCATED',confirmStatus:'CONFIRMED',...override}
 const fields=['projectId',...Object.keys(ref)]
 const ds=DataSet.fromJson({scenarioId:'S',tables:{TenderRecord:{modelBinding:{modelId:'M',modelName:'TenderRecord'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id',...(name==='ordinal'?{type:'number' as const}:{})})),
  views:{default:{},selectedTenderRecord:{commitMode:'staged',scopeFilter:{logic:'and',filters:fields.map(field=>({
   field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}
  }))}}}}}})
 const view=ds.getView('TenderRecord','selectedTenderRecord')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'TenderRecord'})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}})}))
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.bindQueryExecutor({executeQuery:query,save})
 const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>key==='S@TenderRecord@selectedTenderRecord'?view:undefined},assertCurrent:()=>{}}
 return {ds,view,host,save}
}
it('reads the exact confirmed record and withdraws the binding after refresh',async()=>{
 const f=fixture()
 try{
  const result=await readContentTenderRecord(f.host,ref)
  expect(result.dataViewKey).toBe('S@TenderRecord@selectedTenderRecord')
  expect(f.view.queryContext).toMatchObject({projectId:'P',...ref})
  expect(f.view.rows[0]?.['payload']).toEqual({text:'原文'})
  result.assertCurrent()
  await f.view.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it.each([{confirmStatus:'REJECTED'},{recordVersion:'2'},{recordHash:'b'.repeat(64)},{parseQuality:'UNUSABLE'}])('rejects unavailable evidence %j',async override=>{
 const f=fixture(override)
 try{await expect(readContentTenderRecord(f.host,ref)).rejects.toThrow('CONTENT_TENDER_RECORD_UNAVAILABLE')}finally{f.ds.destroy()}
})
