import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentSnapshotIndex} from '@/views/features/application/smart-bid/authoring/model/hashes/content-snapshot-reader'
import {readAdoptionSnapshot} from '@/views/features/application/smart-bid/authoring/model/adoption/content-adoption-snapshot-reader'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function fixture(options:{count?:number|null;hidden?:boolean;wrongProject?:boolean;wrongHash?:boolean;wrongRoot?:boolean}={}){
 const q=new DataSpaceQueryTable({scenarioId:'S',metaName:'RevisionSnapshot'})
 const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:options.wrongProject?'OTHER':'P',stageRef:{decisionId:'S'},baselineId:'BASE',templateRefs:[],nodes:[],
  requirementPins:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]}
 const hash=options.wrongHash?'a'.repeat(64):await hashRevisionSnapshot(manifest)
 const baseline={id:'BASE',projectId:'P',stageRef:manifest.stageRef,factVersions:[{factId:'PRICE',version:2}]}
 const rootHash=options.wrongRoot?'b'.repeat(64):await hashRevisionContentRoot({manifest,baseline:{...baseline,projectId:manifest.projectId}})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{RevisionSnapshot:{modelBinding:{modelId:'SM',modelName:'RevisionSnapshot'},
  columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'snapshotHash'},{name:'manifest',type:'object'}],views:{default:{},
   ...Object.fromEntries(['selectedSnapshot','selectedBasisSnapshot','selectedHeadSnapshot','selectedAdoptionSnapshot'].map(key=>[key,{commitMode:'staged',
    scopeFilter:{logic:'and',filters:['projectId','snapshotHash'].map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))}}]))}},
  ContentRevision:{modelBinding:{modelId:'RM',modelName:'ContentRevision'},
   columns:['id','projectId','snapshotHash','rootHash','baselineId','stageRef','templateRefs'].map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{},selectedAdoptionRevision:{commitMode:'staged'}}},
  Baseline:{modelBinding:{modelId:'BM',modelName:'Baseline'},columns:Object.keys(baseline).map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{},selectedBaseline:{commitMode:'staged',scopeFilter:{logic:'and',filters:[
    {field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'id',operator:'eq',value:{Type:'GetInputParam',ParamName:'baselineId'}},
   ]}}}},
 }})
 const view=ds.getView('RevisionSnapshot','selectedSnapshot')!,save=vi.fn(async()=>{throw Error('NO_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{primaryKeyField:'id',data:{
  ...(options.count===null?{}:{Count:options.count??1}),Items:[{id:'ROW',projectId:'P',snapshotHash:hash,manifest,lingma_sys_params:{r:[],e:[],h:options.hidden?['manifest']:[],m:[],d:false}}]}}})}))
 for(const configured of Object.values(ds.tables['RevisionSnapshot']!.views))configured.bindQueryExecutor({executeQuery:query,save})
 const mergeView=ds.getView('ContentRevision','selectedAdoptionRevision')!,mergeTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentRevision'})
 mergeView.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({identity:mergeTable.identity,scope:'q',readScope:()=> 'q',
  snapshot:mergeTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{id:'R',projectId:'P',snapshotHash:hash,rootHash,
   baselineId:'BASE',stageRef:manifest.stageRef,templateRefs:[],lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}})})})
 const baselineView=ds.getView('Baseline','selectedBaseline')!,baselineTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
 baselineView.bindQueryExecutor({save,executeQuery:async()=>new DataSpaceQueryContext({identity:baselineTable.identity,scope:'q',readScope:()=> 'q',
  snapshot:baselineTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
   {...baseline,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
  ]}}})})})
 let current=true
 const host={runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},scenarioId:'S',projectId:'P',
  assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {ds,host,view,hash,query,save,mergeView,baselineView,expire:()=>{current=false}}
}
it('reopens a historical merge snapshot independently of candidate reads',async()=>{
 const f=await fixture()
 try{
  const candidate=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash})
  await f.mergeView.refresh()
  const assertCurrent=f.mergeView.captureReadResult()
  const merge=await readAdoptionSnapshot(f.host,{dataViewKey:'S@ContentRevision@selectedAdoptionRevision',assertCurrent})
  expect(merge.snapshot.dataViewKey).toBe('S@RevisionSnapshot@selectedAdoptionSnapshot')
  expect(merge.nodes.dataViewKey).toBeNull()
  merge.assertCurrent();candidate.assertCurrent()
  await f.mergeView.refresh()
  expect(()=>merge.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  candidate.assertCurrent()
 }finally{f.ds.destroy()}
})
it('verifies the recorded historical root against the exact baseline and refuses stale proof',async()=>{
 const f=await fixture(),wrong=await fixture({wrongRoot:true})
 try{
  await f.mergeView.refresh()
  const result=await readAdoptionSnapshot(f.host,{dataViewKey:'S@ContentRevision@selectedAdoptionRevision',assertCurrent:f.mergeView.captureReadResult()})
  const root=await result.verifyRootHash(CONTENT_ROOT_HASH_CONTRACT)
  expect(root.rootHashVerified).toBe(true)
  expect(f.baselineView.queryContext).toMatchObject({projectId:'P',baselineId:'BASE'})
  await f.baselineView.refresh()
  expect(()=>root.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await wrong.mergeView.refresh()
  const wrongResult=await readAdoptionSnapshot(wrong.host,{dataViewKey:'S@ContentRevision@selectedAdoptionRevision',assertCurrent:wrong.mergeView.captureReadResult()})
  await expect(wrongResult.verifyRootHash(CONTENT_ROOT_HASH_CONTRACT)).rejects.toThrow('CONTENT_ROOT_HASH_MISMATCH')
 }finally{f.ds.destroy();wrong.ds.destroy()}
})
it('keeps basis, current head and candidate snapshot proofs independent',async()=>{
 const f=await fixture()
 try{
  const basis=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash},'basis')
  const head=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash},'head')
  const candidate=await readContentSnapshotIndex(f.host,{snapshotHash:f.hash})
  expect([basis.dataViewKey,head.dataViewKey,candidate.dataViewKey]).toEqual([
   'S@RevisionSnapshot@selectedBasisSnapshot','S@RevisionSnapshot@selectedHeadSnapshot','S@RevisionSnapshot@selectedSnapshot',
  ])
  basis.assertCurrent();head.assertCurrent();candidate.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedHeadSnapshot')!.refresh()
  expect(()=>head.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  basis.assertCurrent();candidate.assertCurrent()
 }finally{f.ds.destroy()}
})
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
