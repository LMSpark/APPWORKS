import {expect,it} from 'vitest'
import {authorityScenarioViews} from '@/views/features/application/smart-bid/authority/authority-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {createBidResourceVersionHost} from '@/views/features/application/smart-bid/authority/resource-version-reader'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

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
  const view=ds.getView('ResourceVersion','originalVersion'),history=ds.getView('ResourceVersion','versionHistory')
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
   key==='S@ResourceVersion@versionHistory'?history:undefined,generation:1,isLoaded:true,destroyed:false}
  const page=createBidResourceVersionHost(runtime,{scenarioId:'S',resourceId:'RESOURCE',assertCurrent:()=>{}})
  const signal=new AbortController().signal
  const historyResult=await page.invoke('bid.resources.readHistory',{},signal)
  expect(historyResult).toMatchObject({dataViewKey:'S@ResourceVersion@versionHistory',count:2})
  if(!('readVersion' in historyResult)||typeof historyResult.readVersion!=='function')
   throw Error('TEST_RESOURCE_HISTORY_REQUIRED')
  const historyRow=history.rows[0]
  if(!historyRow)throw Error('TEST_RESOURCE_HISTORY_ROW_REQUIRED')
  const historyKey=history.getPkKey(historyRow)
  if(typeof historyKey!=='string'&&typeof historyKey!=='number')throw Error('TEST_RESOURCE_HISTORY_KEY_REQUIRED')
  await expect(historyResult.readVersion(historyKey,historyRow)).resolves.toMatchObject({
   state:'READ',versionId:'VER-ID',attachmentCount:1,
  })
  await expect(historyResult.readVersion(historyKey,{...historyRow,version:'OTHER'}))
   .rejects.toThrow('BID_RESOURCE_VERSION_SCOPE')
  originalId='DIFFERENT-ID'
  await expect(historyResult.readVersion(historyKey,historyRow))
   .rejects.toThrow('BID_RESOURCE_VERSION_SCOPE')
  originalId=row.id
  hidden=['files']
  const concealed=await page.invoke('bid.resources.readVersion',{version:'V1'},signal)
  expect(concealed).toMatchObject({state:'READ',versionId:'VER-ID'})
  expect(concealed).not.toHaveProperty('files')
  hidden=['sourceTerms']
  await expect(page.invoke('bid.resources.readVersion',{version:'V1'},signal)).rejects.toThrow('DATA_VIEW_READ_ROW')
  historyCount=3
  await expect(page.invoke('bid.resources.readHistory',{},signal)).rejects.toThrow('BID_RESOURCE_HISTORY_INCOMPLETE')
 }finally{ds.destroy()}
})
