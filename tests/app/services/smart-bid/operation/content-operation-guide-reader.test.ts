import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {discoverRegisteredOperationGuides} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-guide-reader'
import {DataSpaceQueryTable} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('discovers only the complete scoped directory and retains the original publication and permission proof',async()=>{
 const row={id:'G',projectId:'P',directoryRef:'DIR',state:'EFFECTIVE',source:'PUBLIC',publicationRef:'PUB',
  guideRef:'GUIDE',versionRef:'V1',guideDigest:'a'.repeat(64),kind:'OperationRoute',actionName:'verify',
  pathRefs:['DIR'],materialRefs:['MATERIAL']}
 const filters=['projectId','directoryRef'].map(field=>({field,operator:'eq' as const,
  value:{Type:'GetInputParam',ParamName:field}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{KnowledgeGuide:{
  modelBinding:{modelId:'GUIDES',modelName:'KnowledgeGuide'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},effectiveDirectory:{commitMode:'staged',queryConfig:{autoQuery:false},
   scopeFilter:{logic:'and',filters:[...filters,{field:'state',operator:'eq',value:'EFFECTIVE'}]}}},
 }}})
 const view=ds.getView('KnowledgeGuide','effectiveDirectory')!
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'KnowledgeGuide'})
 let publicationRef='PUB',hidden:string[]=[],count=1,projectId='P'
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:count,Items:[{...row,projectId,publicationRef,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@KnowledgeGuide@effectiveDirectory'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const executeTool=vi.fn(async()=>({ok:true,data:{rootKind:'OperationRoute',models:[{kind:'OperationRoute',methods:[{name:'verify'}]}]}}))
 const discover=()=>discoverRegisteredOperationGuides(host,{executeTool},{rootKind:'OperationRoute',directoryRef:'DIR'})
 try{
  const result=await discover()
  expect(result.items).toMatchObject([{state:'REACHABLE',guideRef:'GUIDE',versionRef:'V1',materialRefs:['MATERIAL']}])
  expect(executeTool).toHaveBeenCalledExactlyOnceWith('model_query',{includeMembers:true})
  expect(view.queryContext).toMatchObject({projectId:'P',directoryRef:'DIR'})
  publicationRef=''
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  publicationRef='PUB'
  hidden=['materialRefs']
  await expect(discover()).rejects.toThrow('DATA_VIEW_READ_ROW')
  hidden=[]
  count=2
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_INCOMPLETE')
  count=1
  projectId='OTHER'
  await expect(discover()).rejects.toThrow('OPERATION_GUIDE_DIRECTORY_SCOPE')
  expect(executeTool).toHaveBeenCalledTimes(1)
 }finally{ds.destroy()}
})
