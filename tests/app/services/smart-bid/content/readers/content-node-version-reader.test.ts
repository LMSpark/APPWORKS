import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentNodeVersion} from '@/views/features/application/smart-bid/authoring/model/content-node-version-reader'
import {hashContentNode} from '@/services/smart-bid/content-node-hash'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

beforeEach(()=>vi.stubGlobal('crypto',webcrypto));afterEach(()=>vi.unstubAllGlobals())
const node=()=>({nodeId:'N',parentId:'C',index:1,type:'paragraph',class:[],value:'投标承诺',data:{}})
async function fixture(options:{count?:number|null;duplicate?:boolean;hidden?:boolean;wrongPayload?:boolean;wrongHash?:boolean}={}){
 const hash=await hashContentNode(node()),q=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentNodeVersion'})
 const scope={logic:'and' as const,filters:['projectId','nodeId','nodeHash'].map(field=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName:field}}))}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentNodeVersion:{modelBinding:{modelId:'MODEL',modelName:'ContentNodeVersion'},
  columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'nodeId'},{name:'nodeHash'},{name:'payload',type:'object'}],
  views:{default:{},selectedVersion:{scopeFilter:scope,commitMode:'staged'}}}}})
 const view=ds.getView('ContentNodeVersion','selectedVersion')!,save=vi.fn(async()=>{throw Error('UNEXPECTED_WRITE')})
 const query=vi.fn(async()=>{
  const rows=[{id:'ROW',projectId:'P',nodeId:'N',nodeHash:hash,payload:options.wrongPayload?{...node(),nodeId:'OTHER'}:options.wrongHash?{...node(),value:'被改写'}:node()}]
  if(options.duplicate)rows.push({...rows[0]!,id:'OTHER_ROW'})
  return new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{primaryKeyField:'id',data:{
   ...(options.count===null?{}:{Count:options.count??rows.length}),Items:rows.map(row=>({...row,lingma_sys_params:{r:[],e:[],h:options.hidden?['payload']:[],m:[],d:false}}))}}})})
 })
 view.bindQueryExecutor({executeQuery:query,save})
 let current=true
 const host={runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {host,view,query,save,selection:{nodeId:'N',nodeHash:hash},expire:()=>{current=false}}
}
it('uses the exact original view and recomputes the payload digest without writes',async()=>{
 const f=await fixture(),result=await readContentNodeVersion(f.host,f.selection)
 expect(result.dataViewKey).toBe('S@ContentNodeVersion@selectedVersion')
 expect(f.view.queryContext).toMatchObject({projectId:'P',...f.selection})
 expect(result.requiresSnapshotMembershipCheck).toBe(true)
 result.assertCurrent();expect(f.save).not.toHaveBeenCalled()
})
it.each([{count:2},{count:null},{duplicate:true}])('rejects incomplete, unreported or duplicate semantic results %j',async options=>{
 const f=await fixture(options)
 await expect(readContentNodeVersion(f.host,f.selection)).rejects.toThrow('CONTENT_NODE_VERSION_NOT_UNIQUE')
})
it('rejects unreadable payload and mismatching payload identity or recomputed hash',async()=>{
 for(const options of [{hidden:true},{wrongPayload:true},{wrongHash:true}]){const f=await fixture(options)
  await expect(readContentNodeVersion(f.host,f.selection)).rejects.toThrow()
  expect(f.save).not.toHaveBeenCalled()}
})
it('invalidates the returned proof on same-valued requery and host expiry',async()=>{
 const f=await fixture(),result=await readContentNodeVersion(f.host,f.selection)
 await f.view.refresh();expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 f.expire();expect(()=>result.assertCurrent()).toThrow('HOST_STALE')
})
it('refuses weakened scope before any query',async()=>{
 const f=await fixture();f.view.configure({scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}})
 await expect(readContentNodeVersion(f.host,f.selection)).rejects.toThrow('CONTENT_NODE_VERSION_SCOPE_REQUIRED')
 expect(f.query).not.toHaveBeenCalled()
})
it('refuses empty identities and malformed digests before querying',async()=>{
 const f=await fixture()
 await expect(readContentNodeVersion({...f.host,projectId:''},f.selection)).rejects.toThrow('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 await expect(readContentNodeVersion({...f.host,scenarioId:''},f.selection)).rejects.toThrow('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 await expect(readContentNodeVersion(f.host,{...f.selection,nodeId:''})).rejects.toThrow('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 await expect(readContentNodeVersion(f.host,{...f.selection,nodeHash:'digest'})).rejects.toThrow('CONTENT_NODE_VERSION_IDENTITY_REQUIRED')
 expect(f.query).not.toHaveBeenCalled()
})
it('rejects a payload altered while its original digest is being computed',async()=>{
 const f=await fixture(),digest=webcrypto.subtle.digest.bind(webcrypto.subtle)
 const spy=vi.spyOn(webcrypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{
  const payload=f.view.rows[0]?.['payload']
  if(payload&&typeof payload==='object')Object.defineProperty(payload,'value',{value:'摘要期间被替换',enumerable:true})
  return digest(algorithm,data)
 })
 try{await expect(readContentNodeVersion(f.host,f.selection)).rejects.toThrow('DATA_VIEW_READ_ROW')}
 finally{spy.mockRestore()}
 expect(f.save).not.toHaveBeenCalled()
})
