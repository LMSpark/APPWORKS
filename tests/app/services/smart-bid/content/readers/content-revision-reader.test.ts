import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey,type DataView,type QueryParams} from '@spark-appworks/spark-data'
import {readContentRevisionBasis,readContentRevisions} from '@/views/features/application/smart-bid/authoring/model/content-revision-reader'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

const param=(name:string)=>({Type:'GetInputParam',ParamName:name})
function fixture(head:string|null='H',incompleteView?:string,basisRevisionId:string|null='B') {
 const scope=(name:string,status:string)=>({logic:'and' as const,filters:[
  {field:'projectId',operator:'eq' as const,value:param('projectId')},
  {field:'id',operator:'eq' as const,value:param(name)},
  {field:'status',operator:'eq' as const,value:status}]})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ContentProject:{modelBinding:{modelId:'PM',modelName:'ContentProject'},columns:[{name:'projectId',isPrimaryKey:true},{name:'headRevisionId'}],
  views:{default:{},selectedProject:{scopeFilter:{field:'projectId',operator:'eq',value:param('projectId')}}}},ContentRevision:{modelBinding:{modelId:'RM',modelName:'ContentRevision'},
  columns:[{name:'id',isPrimaryKey:true},{name:'projectId'},{name:'status'},{name:'snapshotHash'},{name:'basisRevisionId'}],views:{default:{},
   selectedCandidate:{scopeFilter:scope('candidateRevisionId','CANDIDATE'),commitMode:'staged'},
   selectedHead:{scopeFilter:scope('expectedHead','ADOPTED'),commitMode:'staged'},
   selectedBasis:{scopeFilter:scope('basisRevisionId','ADOPTED'),commitMode:'staged'}}}}})
 let hidden=false,wrong=false,current=true
 const query=vi.fn(async(view:DataView,params:QueryParams)=>{
  const isProject=view.dataTable?.tableName==='ContentProject',candidate=view.viewId==='selectedCandidate'
  const parameter=candidate?'candidateRevisionId':view.viewId==='selectedBasis'?'basisRevisionId':'expectedHead'
  const rows=isProject?[{projectId:'P',headRevisionId:head}]:[{id:wrong?'OTHER':params.context?.[parameter],projectId:'P',
   status:candidate?'CANDIDATE':'ADOPTED',snapshotHash:'digest',basisRevisionId}]
  const q=new DataSpaceQueryTable({scenarioId:'S',metaName:isProject?'ContentProject':'ContentRevision'})
  return new DataSpaceQueryContext({identity:q.identity,scope:'q',readScope:()=> 'q',snapshot:q.applyResult({Result:{
   primaryKeyField:isProject?'projectId':'id',data:{Count:view.viewId===incompleteView?2:1,Items:rows.map(row=>({...row,lingma_sys_params:{r:[],e:isProject?['headRevisionId']:[],h:hidden?['snapshotHash']:[],m:[],d:false}}))}}})})
 })
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 for(const table of Object.values(ds.tables))for(const view of Object.values(table.views))view.bindQueryExecutor({executeQuery:query,save})
 ds.getView('ContentProject','selectedProject')!.queryContext={projectId:'P'}
 const input={runtime:{resolveView:(key:string)=>{const keyParts=parseDataViewKey(key);return keyParts?ds.getView(keyParts.tableName,keyParts.viewId):undefined}},scenarioId:'S',projectId:'P',
  assertCurrent:()=>{if(!current)throw Error('STALE_HOST')}}
 return {ds,input,query,save,hide:()=>{hidden=true},wrong:()=>{wrong=true},expire:()=>{current=false}}
}
it('reads exact named revision views from the original runtime without writes or snapshot substitution',async()=>{
 const f=fixture(),result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
 expect(result.candidateDataViewKey).toBe('S@ContentRevision@selectedCandidate')
 expect(result.headDataViewKey).toBe('S@ContentRevision@selectedHead')
 expect(f.query).toHaveBeenCalledTimes(3)
 result.assertCurrent();expect(f.save).not.toHaveBeenCalled()
})
it('uses an explicit null head for a first candidate and never queries the head view',async()=>{
 const f=fixture(null),result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:null})
 expect(result.headDataViewKey).toBeNull();expect(f.query).toHaveBeenCalledTimes(2)
})
it('reads the basis pinned by the candidate while retaining the separate head evidence',async()=>{
 const f=fixture()
 try{
  const revisions=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
  const basis=await readContentRevisionBasis(f.input,revisions)
  expect(basis.dataViewKey).toBe('S@ContentRevision@selectedBasis')
  expect(f.ds.getView('ContentRevision','selectedBasis')!.queryContext).toMatchObject({basisRevisionId:'B',projectId:'P'})
  basis.assertCurrent();revisions.assertCurrent()
  await f.ds.getView('ContentRevision','selectedBasis')!.refresh()
  expect(()=>basis.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  revisions.assertCurrent()
 }finally{f.ds.destroy()}
})
it.each([null,'H'])('accepts the empty basis only for a verified empty head %s',async expectedHead=>{
 const f=fixture(expectedHead,undefined,null)
 try{
  const revisions=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead})
  if(expectedHead===null)expect((await readContentRevisionBasis(f.input,revisions)).dataViewKey).toBeNull()
  else await expect(readContentRevisionBasis(f.input,revisions)).rejects.toThrow('CONTENT_REVISION_BASIS_REQUIRED')
  expect(f.query.mock.calls.some(([view])=>view.viewId==='selectedBasis')).toBe(false)
 }finally{f.ds.destroy()}
})
it.each(['selectedProject','selectedCandidate','selectedHead'])('rejects a partial result for %s even if one row matches',async viewId=>{
 const f=fixture('H',viewId)
 try{
  await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'}))
   .rejects.toThrow(viewId==='selectedProject'?'CONTENT_REVISION_HEAD_CHANGED':'CONTENT_REVISION_UNAVAILABLE')
  if(viewId==='selectedProject')expect(f.query).toHaveBeenCalledTimes(1)
 }finally{f.ds.destroy()}
})
it.each([{table:'ContentProject',view:'selectedProject'},{table:'ContentRevision',view:'selectedCandidate'},{table:'ContentRevision',view:'selectedHead'}])(
 'invalidates original revision evidence after same-valued refresh of $table@$view',async({table,view})=>{
 const f=fixture(),result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
 await f.ds.getView(table,view)!.refresh()
 expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 expect(f.save).not.toHaveBeenCalled()
})
it('refuses a project proof replaced while candidate queries are in flight',async()=>{
 const f=fixture(),execute=f.query.getMockImplementation()!
 f.query.mockImplementation(async(view,params)=>{
  if(view.viewId==='selectedCandidate')await f.ds.getView('ContentProject','selectedProject')!.refresh()
  return execute(view,params)
 })
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('DATA_VIEW_READ_RESULT')
 expect(f.save).not.toHaveBeenCalled()
})
it.each(['S@ContentProject@selectedProject','S@ContentRevision@selectedCandidate','S@ContentRevision@selectedHead'])(
 'withdraws the revision proof when the runtime detaches %s',async key=>{
 const f=fixture()
 try{
  const result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
  const resolveView=f.input.runtime.resolveView
  f.input.runtime.resolveView=value=>value===key?undefined:resolveView(value)
  expect(()=>result.assertCurrent()).toThrow('CONTENT_REVISION_STALE')
 }finally{f.ds.destroy()}
})
it('refuses a changed project head before dispatching revision queries',async()=>{
 const f=fixture('NEXT')
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('CONTENT_REVISION_HEAD_CHANGED')
 expect(f.query).toHaveBeenCalledTimes(1)
})
it('rejects a missing exact scope before querying revisions',async()=>{
 const f=fixture();f.ds.getView('ContentRevision','selectedCandidate')!.configure({scopeFilter:{field:'projectId',operator:'eq',value:param('projectId')}})
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('CONTENT_REVISION_SCOPE_REQUIRED')
 expect(f.query.mock.calls.every(([view])=>view.dataTable?.tableName==='ContentProject')).toBe(true)
})
it('refuses wrong identities and unreadable snapshot indexes',async()=>{
 for(const kind of ['wrong','hide'] as const){const f=fixture();f[kind]()
  await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('CONTENT_REVISION_UNAVAILABLE')
  expect(f.save).not.toHaveBeenCalled()}
})
it('invalidates returned bindings when the host expires or exact query parameters change',async()=>{
 const f=fixture(),result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
 const view=f.ds.getView('ContentRevision','selectedCandidate')!
 view.queryContext={...view.queryContext,candidateRevisionId:'OTHER'}
 expect(()=>result.assertCurrent()).toThrow('CONTENT_REVISION_STALE')
 f.expire();expect(()=>result.assertCurrent()).toThrow('STALE_HOST')
})
it('rejects late revision responses after the original host expires',async()=>{
 const f=fixture(),execute=f.query.getMockImplementation()!
 f.query.mockImplementation(async(view,params)=>{
  const result=await execute(view,params)
  if(view.dataTable?.tableName==='ContentRevision')f.expire()
  return result
 })
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('STALE_HOST')
 expect(f.save).not.toHaveBeenCalled()
})
it('does not broaden an OR scope that contains the required individual conditions',async()=>{
 const f=fixture(),view=f.ds.getView('ContentRevision','selectedHead')!
 view.configure({scopeFilter:{logic:'or',filters:[{field:'projectId',operator:'eq',value:param('projectId')},
  {field:'id',operator:'eq',value:param('expectedHead')},{field:'status',operator:'eq',value:'ADOPTED'}]}})
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('CONTENT_REVISION_SCOPE_REQUIRED')
 expect(f.query).toHaveBeenCalledTimes(1)
})
it('preserves pending project-head edits and refuses to refresh them as authoritative input',async()=>{
 const f=fixture(),project=f.ds.getView('ContentProject','selectedProject')!
 await project.refresh();project.updateEditingValue('P','headRevisionId','LOCAL');f.query.mockClear()
 await expect(readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
 expect(f.query).not.toHaveBeenCalled();expect(project.hasEditingChanges()).toBe(true)
})
it('invalidates a result when the project head gains local edits after reading',async()=>{
 const f=fixture(),result=await readContentRevisions(f.input,{candidateRevisionId:'C',expectedHead:'H'})
 f.ds.getView('ContentProject','selectedProject')!.updateEditingValue('P','headRevisionId','LOCAL')
 expect(()=>result.assertCurrent()).toThrow('CONTENT_REVISION_STALE')
})
