import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentSnapshotIndex} from '@/views/features/application/smart-bid/authoring/model/content-snapshot-reader'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function fixture(options:{count?:number|null;hidden?:boolean;wrongProject?:boolean;wrongHash?:boolean}={}){
 const q=new DataSpaceQueryTable({scenarioId:'S',metaName:'RevisionSnapshot'})
 const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:options.wrongProject?'OTHER':'P',stageRef:{decisionId:'S'},baselineId:'BASE',templateRefs:[],nodes:[],
  requirementPins:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]}
 const hash=options.wrongHash?'a'.repeat(64):await hashRevisionSnapshot(manifest)
 const ds=DataSet.fromJson({scenarioId:'S',tables:{RevisionSnapshot:{modelBinding:{modelId:'SM',modelName:'RevisionSnapshot'},
  columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'snapshotHash'},{name:'manifest',type:'object'}],views:{default:{},selectedSnapshot:{commitMode:'staged',
   scopeFilter:{logic:'and',filters:['projectId','snapshotHash'].map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))}}}}}})
 const view=ds.getView('RevisionSnapshot','selectedSnapshot')!,save=vi.fn(async()=>{throw Error('NO_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{primaryKeyField:'id',data:{
  ...(options.count===null?{}:{Count:options.count??1}),Items:[{id:'ROW',projectId:'P',snapshotHash:hash,manifest,lingma_sys_params:{r:[],e:[],h:options.hidden?['manifest']:[],m:[],d:false}}]}}})}))
 view.bindQueryExecutor({executeQuery:query,save})
 let current=true
 const host={runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},scenarioId:'S',projectId:'P',
  assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {host,view,hash,query,save,expire:()=>{current=false}}
}
it('verifies the full manifest digest while keeping business closure and revision matching pending',async()=>{
 const f=await fixture(),result=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash})
 expect(result.dataViewKey).toBe('S@RevisionSnapshot@selectedSnapshot')
 expect(result.index.baselineId).toBe('BASE');expect(result.manifestHashVerified).toBe(true)
 expect(result.requiresRevisionMatchCheck).toBe(true);result.assertCurrent()
 expect(f.view.queryContext).toMatchObject({projectId:'P',snapshotHash:f.hash});expect(f.save).not.toHaveBeenCalled()
})
it.each([{count:null},{count:2}])('rejects unreported or incomplete semantic matches %j',async options=>{
 const f=await fixture(options);await expect(readContentSnapshotIndex(f.host,{snapshotHash:f.hash})).rejects.toThrow('CONTENT_SNAPSHOT_NOT_UNIQUE')
})
it('rejects hidden manifests and inconsistent manifest project identity',async()=>{
 for(const options of [{hidden:true},{wrongProject:true}]){const f=await fixture(options)
  await expect(readContentSnapshotIndex(f.host,{snapshotHash:f.hash})).rejects.toThrow();expect(f.save).not.toHaveBeenCalled()}
})
it('invalidates a returned binding on same-valued query replacement and host expiry',async()=>{
 const f=await fixture(),result=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash})
 await f.view.refresh();expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 f.expire();expect(()=>result.assertCurrent()).toThrow('HOST_STALE')
})
it('refuses an unscoped view before querying',async()=>{
 const f=await fixture();f.view.configure({scopeFilter:{field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}}})
 await expect(readContentSnapshotIndex(f.host,{snapshotHash:f.hash})).rejects.toThrow('CONTENT_SNAPSHOT_SCOPE_REQUIRED')
 expect(f.query).not.toHaveBeenCalled()
})
it('rejects a self-reported snapshot key that does not match the actual full manifest',async()=>{
 const f=await fixture({wrongHash:true})
 await expect(readContentSnapshotIndex(f.host,{snapshotHash:f.hash})).rejects.toThrow('CONTENT_SNAPSHOT_HASH_MISMATCH')
 expect(f.save).not.toHaveBeenCalled()
})
