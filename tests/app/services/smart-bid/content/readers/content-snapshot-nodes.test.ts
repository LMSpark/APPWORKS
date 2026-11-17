import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey,type DataView,type QueryParams} from '@spark-appworks/spark-data'
import {hashContentNode} from '@/services/smart-bid/content-node-hash'
import {readContentSnapshotNodes} from '@/views/features/application/smart-bid/authoring/model/content-snapshot-nodes'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function fixture(mode='normal'){
 const nodes=[{nodeId:'D',parentId:'P',index:0,type:'document',class:[],value:'',data:{}},
  {nodeId:'C',parentId:mode==='tree'?'MISSING':'D',index:0,type:'chapter',class:[],value:'',data:{}},
  {nodeId:'H',parentId:'C',index:0,type:'heading',class:[],value:mode==='link'?'{{missing}}':'标题',
   data:mode==='link'?{missing:{type:'xref',nodeId:'MISSING',show:'title'}}:{}}]
 const entries=await Promise.all(nodes.map(async payload=>({nodeId:payload.nodeId,nodeHash:await hashContentNode(payload),payload})))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentNodeVersion:{modelBinding:{modelId:'M',modelName:'ContentNodeVersion'},
  columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'nodeId'},{name:'nodeHash'},{name:'payload',type:'object'}],views:{default:{},snapshotMembers:{
   commitMode:'staged',queryConfig:{allPages:true,pagination:'paged'},scopeFilter:{logic:'and',filters:[
    {field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'nodeHash',operator:'in',value:{Type:'GetInputParam',ParamName:'nodeHashes'}}]}}}}}})
 const view=ds.getView('ContentNodeVersion','snapshotMembers')!,q=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentNodeVersion'})
 const query=vi.fn(async(_view:DataView,_params:QueryParams)=>{
  let rows=entries.map((entry,i)=>({id:String(i),projectId:'P',...entry}))
  if(mode==='missing')rows=rows.slice(0,-1)
  if(mode==='replacement')rows[2]={...rows[2]!,nodeId:'OTHER'}
  if(mode==='duplicate')rows[2]={...rows[0]!,id:'OTHER_ROW'}
  if(mode==='hash')rows[2]={...rows[2]!,payload:{...rows[2]!.payload,value:'被改写'}}
  return new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{primaryKeyField:'id',data:{
   ...(mode==='unknown'?{}:{Count:rows.length}),Items:rows.map(row=>({...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}})})
 })
 const save=vi.fn(async()=>{throw Error('NO_WRITE')});view.bindQueryExecutor({executeQuery:query,save})
 const assertCurrent=vi.fn()
 const snapshot={dataViewKey:'S@RevisionSnapshot@selectedSnapshot',index:{projectId:'P',baselineId:'B',hashContract:'spark-bid.revision-snapshot/1' as const,
  nodes:mode==='empty'?[]:entries.map(({nodeId,nodeHash})=>({nodeId,nodeHash})).sort((a,b)=>a.nodeId<b.nodeId?-1:1),requiresBusinessSectionChecks:true as const},
  manifestHashVerified:true as const,requiresRevisionMatchCheck:true as const,assertCurrent}
 const host={runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},scenarioId:'S',projectId:'P',assertCurrent:vi.fn()}
 return {view,query,save,snapshot,host}
}
it('reads the exact full member set in one view and keeps all original proofs alive',async()=>{
 const f=await fixture(),result=await readContentSnapshotNodes(f.host,f.snapshot)
 expect(result.dataViewKey).toBe('S@ContentNodeVersion@snapshotMembers')
 expect(result.subtreeHashContract).toBe('spark-bid.content-subtree/1')
 expect(result.subtreeHashes.map(item=>item.nodeId)).toEqual(['C','D','H'])
 expect(result.subtreeHashes.every(item=>/^[a-f0-9]{64}$/u.test(item.subtreeHash))).toBe(true)
 expect(f.query).toHaveBeenCalledTimes(1);expect(f.view.queryConfig.maxRows).toBe(4)
 expect(f.query.mock.calls[0]?.[1]).toMatchObject({allPages:true,maxRows:4,context:{projectId:'P',nodeHashes:f.snapshot.index.nodes.map(node=>node.nodeHash)}})
 expect(f.view.queryContext['nodeHashes']).toEqual(f.snapshot.index.nodes.map(node=>node.nodeHash))
 result.assertCurrent();expect(f.save).not.toHaveBeenCalled()
 await f.view.refresh();expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
})
it('skips an explicitly empty node set without an empty-IN or project-wide query',async()=>{
 const f=await fixture('empty'),result=await readContentSnapshotNodes(f.host,f.snapshot)
 expect(result.dataViewKey).toBeNull();expect(f.query).not.toHaveBeenCalled();result.assertCurrent()
 expect(result.subtreeHashes).toEqual([])
 expect(f.snapshot.assertCurrent).toHaveBeenCalled()
})
it.each(['missing','replacement','duplicate','unknown','hash','tree','link'])('rejects incomplete or inconsistent member set: %s',async mode=>{
 const f=await fixture(mode);await expect(readContentSnapshotNodes(f.host,f.snapshot)).rejects.toThrow()
 expect(f.save).not.toHaveBeenCalled()
})
it.each(['refresh','expire'])('rejects original proof invalidation during subtree hashing: %s',async mode=>{
 const f=await fixture(),digest=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
 let calls=0
 const spy=vi.spyOn(globalThis.crypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{
  if(++calls===4){
   if(mode==='refresh')await f.view.refresh()
   else f.host.assertCurrent.mockImplementation(()=>{throw Error('HOST_STALE')})
  }
  return digest(algorithm,data)
 })
 try{
  await expect(readContentSnapshotNodes(f.host,f.snapshot)).rejects.toThrow(mode==='refresh'?'DATA_VIEW_READ_RESULT':'HOST_STALE')
  expect(f.save).not.toHaveBeenCalled()
 }finally{spy.mockRestore()}
})
it('invalidates derived bindings when local tree configuration changes without a new query',async()=>{
 const f=await fixture(),result=await readContentSnapshotNodes(f.host,f.snapshot)
 f.view.setTreeConfig({...f.view.treeConfig,idField:'nodeId',parentIdField:{field:'payload',path:['parentId'],format:'native'},rootParentValue:'OTHER'})
 expect(()=>result.assertCurrent()).toThrow('CONTENT_SNAPSHOT_NODES_STALE')
 expect(f.query).toHaveBeenCalledTimes(1);expect(f.save).not.toHaveBeenCalled()
})
