import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentAdoption} from '@/views/features/application/smart-bid/authoring/model/content-adoption-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const request={candidateRevisionId:'C',requestKey:'K',requestDigest:'D',previewRef:'PV'}
function fixture(options:{count?:number;requestDigest?:string}={}){
 const record={id:'A',projectId:'P',...request,mergeRevisionId:'R',commitCheckRef:null,requestDigest:options.requestDigest??request.requestDigest}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentAdoption:{modelBinding:{modelId:'M',modelName:'ContentAdoption'},
  columns:Object.keys(record).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},selectedAdoption:{commitMode:'staged',
   scopeFilter:{logic:'and',filters:['projectId','candidateRevisionId','requestKey'].map(field=>({field,operator:'eq',
    value:{Type:'GetInputParam',ParamName:field}}))}}}}}})
 const view=ds.getView('ContentAdoption','selectedAdoption')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentAdoption'})
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:options.count??1,Items:options.count===0?[]:
   [{...record,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}})}))
 view.bindQueryExecutor({executeQuery:query,save})
 const host={scenarioId:'S',projectId:'P',assertCurrent:()=>{},runtime:{resolveView:(key:string)=>key==='S@ContentAdoption@selectedAdoption'?view:undefined}}
 return {host,view,ds,query,save}
}
it('binds the original record without claiming the request outcome',async()=>{
 const f=fixture()
 try{
  const result=await readContentAdoption(f.host,request)
  expect(result).toMatchObject({dataViewKey:'S@ContentAdoption@selectedAdoption',recordFound:true,requiresOriginalResultEvidence:true})
  expect(f.view.queryContext).toEqual({projectId:'P',candidateRevisionId:'C',requestKey:'K'})
  result.assertCurrent()
  await f.view.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('distinguishes a complete empty result from a mismatched request or incomplete result',async()=>{
 const empty=fixture({count:0}),wrong=fixture({requestDigest:'OTHER'}),multiple=fixture({count:2})
 try{
  expect(await readContentAdoption(empty.host,request)).toMatchObject({recordFound:false,requiresOriginalResultEvidence:true})
  await expect(readContentAdoption(wrong.host,request)).rejects.toThrow('CONTENT_ADOPTION_REQUEST_MISMATCH')
  await expect(readContentAdoption(multiple.host,request)).rejects.toThrow('CONTENT_ADOPTION_NOT_UNIQUE')
 }finally{empty.ds.destroy();wrong.ds.destroy();multiple.ds.destroy()}
})
