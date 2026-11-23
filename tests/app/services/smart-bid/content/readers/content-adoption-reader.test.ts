import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'
import {inspectRegisteredAdoption,readContentAdoption} from '@/views/features/application/smart-bid/authoring/model/adoption/content-adoption-reader'
import {prepareAdoptedProduction} from '@/views/features/application/smart-bid/authoring/model/adoption/adopted-production-reader'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

const request={candidateRevisionId:'C',requestKey:'K',requestDigest:'D',previewRef:'PV'}
it('recomputes the old merge root from its exact baseline and withdraws proof when the baseline reloads',async()=>{
 const f=fixture({withRoot:true})
 try{
  const result=await inspectRegisteredAdoption(f.host,request)
  expect(result).toMatchObject({revisionEvidence:'SNAPSHOT_VERIFIED',rootHashVerified:true,rootHash:await f.root})
  expect(f.baselineView.queryContext).toMatchObject({projectId:'P',baselineId:'B'})
  expect(f.baselineQuery).toHaveBeenCalledOnce()
  await f.baselineView.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('reports snapshot and revision evidence separately from original registration',async()=>{
 const f=fixture()
 try{
  const complete=await inspectRegisteredAdoption(f.host,request)
  expect(complete).toMatchObject({recordFound:true,revisionEvidence:'SNAPSHOT_VERIFIED',baselineId:'B',nodeCount:0,rootHashVerified:false})
  f.snapshotQuery.mockRejectedValueOnce(Error('SNAPSHOT_UNAVAILABLE'))
  expect(await inspectRegisteredAdoption(f.host,request)).toMatchObject({adoptionRef:'A',revisionEvidence:'REVISION_READ'})
  f.revisionQuery.mockRejectedValueOnce(Error('REVISION_UNAVAILABLE'))
  expect(await inspectRegisteredAdoption(f.host,request)).toMatchObject({adoptionRef:'A',revisionEvidence:'UNVERIFIED'})
  expect(()=>complete.assertCurrent()).toThrow()
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('will not prepare formal production from an adopted index without matching commit evidence',async()=>{
 const f=fixture()
 try{
  const original={...request,projectId:'P'}
  const production={projectId:'P',documentId:'DOC',revisionId:'R',baselineId:'B',requestKey:'MAKE',
   toolVersionRef:'TOOL',outputOptions:{format:'PDF'}}
  const readEvidence=vi.fn(async()=>{throw Error('UNEXPECTED_PRODUCTION_EVIDENCE')})
  const observation={...original,effect:'COMMITTED' as const,resultEvidenceRef:'RESULT'}
  const evidence={...original,kind:'COMMITTED' as const,resultEvidenceRef:'RESULT',adoptionRef:'A',mergeRevisionId:'R'}
  await expect(prepareAdoptedProduction(f.host,production,{adoption:[original,observation,evidence],readEvidence,assertCurrent:()=>{}}))
   .rejects.toThrow('BID_PRODUCTION_ADOPTION_REQUIRED')
  expect(f.query).not.toHaveBeenCalled()
  await expect(prepareAdoptedProduction(f.host,production,{
   adoption:[original,observation,{...evidence,commitCheckRef:'CHECK'}],readEvidence,assertCurrent:()=>{},
  })).rejects.toThrow('BID_PRODUCTION_ADOPTION_REQUIRED')
  expect(f.query).toHaveBeenCalledOnce()
  expect(f.revisionQuery).not.toHaveBeenCalled()
  expect(readEvidence).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('rejects a different original merge even when its adoption and commit references match',async()=>{
 const f=fixture({commitCheckRef:'CHECK'})
 try{
  const original={...request,projectId:'P'}
  const production={projectId:'P',documentId:'DOC',revisionId:'OTHER',baselineId:'B',requestKey:'MAKE',
   toolVersionRef:'TOOL',outputOptions:{format:'PDF'}}
  const readEvidence=vi.fn(async()=>{throw Error('UNEXPECTED_PRODUCTION_EVIDENCE')})
  await expect(prepareAdoptedProduction(f.host,production,{adoption:[
   original,{...original,effect:'COMMITTED',resultEvidenceRef:'RESULT'},
   {...original,kind:'COMMITTED',resultEvidenceRef:'RESULT',adoptionRef:'A',mergeRevisionId:'OTHER',commitCheckRef:'CHECK'},
  ],readEvidence,assertCurrent:()=>{}})).rejects.toThrow('BID_PRODUCTION_ADOPTION_REQUIRED')
  expect(f.revisionQuery).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
function fixture(options:{count?:number;requestDigest?:string;withRoot?:boolean;registeredRoot?:string;commitCheckRef?:string}={}){
 const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:'P',stageRef:{id:'ST'},baselineId:'B',
  templateRefs:[],nodes:[],requirementPins:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]}
 const hash=hashRevisionSnapshot(manifest)
 const baseline={id:'B',projectId:'P',stageRef:manifest.stageRef,factVersions:[]}
 const root=options.withRoot?hashRevisionContentRoot({manifest,baseline}):null
 const record={id:'A',projectId:'P',...request,mergeRevisionId:'R',commitCheckRef:options.commitCheckRef??null,
  requestDigest:options.requestDigest??request.requestDigest}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentAdoption:{modelBinding:{modelId:'M',modelName:'ContentAdoption'},
  columns:Object.keys(record).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},selectedAdoption:{commitMode:'staged',
   scopeFilter:{logic:'and',filters:['projectId','candidateRevisionId','requestKey'].map(field=>({field,operator:'eq',
    value:{Type:'GetInputParam',ParamName:field}}))}}}},
  ContentRevision:{modelBinding:{modelId:'RM',modelName:'ContentRevision'},columns:['id','projectId','status','snapshotHash','stageRef','baselineId','templateRefs','rootHash'].map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{},selectedAdoptionRevision:{commitMode:'staged',scopeFilter:{logic:'and',filters:[
    {field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'id',operator:'eq',value:{Type:'GetInputParam',ParamName:'mergeRevisionId'}},
    {field:'status',operator:'eq',value:'ADOPTED'},
   ]}}}},
  RevisionSnapshot:{modelBinding:{modelId:'SM',modelName:'RevisionSnapshot'},columns:['id','projectId','snapshotHash','manifest'].map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{},selectedAdoptionSnapshot:{commitMode:'staged',scopeFilter:{logic:'and',filters:['projectId','snapshotHash'].map(field=>({
    field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))}}}},
  Baseline:{modelBinding:{modelId:'BM',modelName:'Baseline'},columns:Object.keys(baseline).map(name=>({name,isPrimaryKey:name==='id'})),
   views:{default:{},selectedBaseline:{commitMode:'staged',scopeFilter:{logic:'and',filters:[
    {field:'projectId',operator:'eq',value:{Type:'GetInputParam',ParamName:'projectId'}},
    {field:'id',operator:'eq',value:{Type:'GetInputParam',ParamName:'baselineId'}},
   ]}}}},
 }})
 const view=ds.getView('ContentAdoption','selectedAdoption')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentAdoption'})
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:options.count??1,Items:options.count===0?[]:
   [{...record,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}})}))
 view.bindQueryExecutor({executeQuery:query,save})
 const revision=ds.getView('ContentRevision','selectedAdoptionRevision')!,revisionTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentRevision'})
 const revisionQuery=vi.fn(async()=>new DataSpaceQueryContext({identity:revisionTable.identity,scope:'q',readScope:()=> 'q',
  snapshot:revisionTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
   {id:'R',projectId:'P',status:'ADOPTED',snapshotHash:await hash,baselineId:'B',stageRef:manifest.stageRef,templateRefs:[],
    rootHash:options.registeredRoot??await root,
    lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
  ]}}})}))
 revision.bindQueryExecutor({executeQuery:revisionQuery,save})
 const snapshot=ds.getView('RevisionSnapshot','selectedAdoptionSnapshot')!,snapshotTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'RevisionSnapshot'})
 const snapshotQuery=vi.fn(async()=>new DataSpaceQueryContext({identity:snapshotTable.identity,scope:'q',readScope:()=> 'q',
  snapshot:snapshotTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
   {id:'SN',projectId:'P',snapshotHash:await hash,manifest,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
  ]}}})}))
 snapshot.bindQueryExecutor({executeQuery:snapshotQuery,save})
 const baselineView=ds.getView('Baseline','selectedBaseline')!,baselineTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
 const baselineQuery=vi.fn(async()=>new DataSpaceQueryContext({identity:baselineTable.identity,scope:'q',readScope:()=> 'q',
  snapshot:baselineTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
   {...baseline,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
  ]}}})}))
 baselineView.bindQueryExecutor({executeQuery:baselineQuery,save})
 const host={scenarioId:'S',projectId:'P',assertCurrent:()=>{},runtime:{resolveView:(key:string)=>
  key==='S@ContentAdoption@selectedAdoption'?view:key==='S@ContentRevision@selectedAdoptionRevision'?revision:
   key==='S@RevisionSnapshot@selectedAdoptionSnapshot'?snapshot:key==='S@Baseline@selectedBaseline'?baselineView:undefined}}
 return {host,view,ds,query,revision,revisionQuery,snapshotQuery,baselineView,baselineQuery,root,save}
}
it('keeps the recovered snapshot visible when its registered root contradicts the recomputation',async()=>{
 const f=fixture({registeredRoot:'f'.repeat(64)})
 try{
  const result=await inspectRegisteredAdoption(f.host,request)
  expect(result).toMatchObject({revisionEvidence:'SNAPSHOT_VERIFIED',rootHashVerified:false,rootHashMismatch:true})
  result.assertCurrent()
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('reads the adopted merge revision by the original record and invalidates it when that record is refreshed',async()=>{
 const f=fixture()
 try{
  const adoption=await readContentAdoption(f.host,request)
  if(!adoption.recordFound)throw Error('Expected original adoption')
  const merge=await adoption.readMergeRevision()
  expect(merge.dataViewKey).toBe('S@ContentRevision@selectedAdoptionRevision')
  expect(f.revision.queryContext).toMatchObject({projectId:'P',mergeRevisionId:'R'})
  expect(f.revisionQuery).toHaveBeenCalledTimes(1)
  merge.assertCurrent()
  const original=await merge.readSnapshot()
  expect(original.snapshot.dataViewKey).toBe('S@RevisionSnapshot@selectedAdoptionSnapshot')
  expect(f.revisionQuery).toHaveBeenCalledTimes(1)
  expect(f.snapshotQuery).toHaveBeenCalledTimes(1)
  original.assertCurrent()
  await f.view.refresh()
  expect(()=>original.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>merge.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await expect(adoption.readMergeRevision()).rejects.toThrow('DATA_VIEW_READ_RESULT')
  expect(f.revisionQuery).toHaveBeenCalledTimes(1)
 }finally{f.ds.destroy()}
})
it('binds the original record without claiming the request outcome',async()=>{
 const f=fixture()
 try{
  const result=await readContentAdoption(f.host,request)
  expect(result).toMatchObject({dataViewKey:'S@ContentAdoption@selectedAdoption',recordFound:true,requiresOriginalResultEvidence:true})
  expect(f.view.queryContext).toEqual({projectId:'P',candidateRevisionId:'C',requestKey:'K'})
  result.assertCurrent()
  const queryConfig=f.view.queryConfig
  f.view.queryConfig={...queryConfig,cacheType:'page'}
  expect(()=>result.assertCurrent()).toThrow('CONTENT_ADOPTION_STALE')
  await expect(readContentAdoption(f.host,request)).rejects.toThrow('CONTENT_ADOPTION_SCOPE_REQUIRED')
  f.view.queryConfig=queryConfig
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
