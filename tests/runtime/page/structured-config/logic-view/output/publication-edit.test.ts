import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {LogicViewOutputEdit} from '@/lowcode/resources/structured-config/logic-view/output/publication-edit'
import {configureLogicFixture} from '../logic-view.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {isRecord} from '@spark-appworks/spark-utils'
const service=vi.hoisted(()=>({readSpaceDefinition:vi.fn(),readModel:vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),readRequestScope:vi.fn(),createGateways:vi.fn()}))
let http:ApiBackend,owner:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return http},createLowcodeProjectGateways:(...args:unknown[])=>service.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({}),lowcodeApi:{design:{},readRequestScope:service.readRequestScope,dataSpace:{design:service,get runtime(){return owner}}}}))
const pages:PageRuntime[]=[]
const field=(enname:string,cnname=enname)=>({enname,cnname,description:cnname,DataType:enname==='id'?'int':'varchar',IsPKey:enname==='id'?1:0})
beforeEach(()=>{
 vi.clearAllMocks();http=new ApiBackend();owner=new DataSpaceRuntimeApi({http,readScope:service.readRequestScope})
 service.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
 http.records={'Base_TblField':[{rowid:'F1',tblid:'V1',...field('id')},{rowid:'OLD',tblid:'V1',...field('obsolete')},{rowid:'OTHER',tblid:'V2',...field('other')}],_Base_ParamList:[{parid:'P1',pid:'V1',parname:'arg',testvalue:'original'}]}
 configureLogicFixture(service,http)
})
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
async function workspace(){
 const page=new PageRuntime({...LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId:'V1'}),pageId:'output-edit-test'})
 pages.push(page);await page.load();const dataSet=await LowcodeLogicView.ensureOutputFields(page)
 return{page,dataSet,view:dataSet.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!}
}
describe('logical-view output original DataView staging',()=>{
 it('keeps same-name row identity and cancels only its native updates, additions and deletions',async()=>{
  const {page,dataSet,view}=await workspace();await LowcodeLogicView.ensureParameters(page)
  const params=dataSet.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!;params.updateEditingValue('P1','testvalue','keep')
  const edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('new')],assertCurrent:()=>{}})
  await edit.stage()
  expect(view.getEditingRow('F1')?.['cnname']).toBe('编号');expect(view.dirtyTracking.pendingDeleteIds.has('OLD')).toBe(true)
  expect(view.dirtyTracking.pendingCreateIds.size).toBe(1)
  const created=[...view.dirtyTracking.pendingCreateIds][0]!
  expect(created).not.toBe('F1');expect(view.rows.find(row=>view.getPkKey(row)===created)).toMatchObject({tblid:'V1',enname:'new',IsPKey:0})
  expect(http.saves).toHaveLength(0);edit.cancel()
  expect(view.rows.map(row=>row['rowid']).sort()).toEqual(['F1','OLD']);expect(view.hasEditingChanges()).toBe(false)
  expect(view.dirtyTracking.hasPendingChanges()).toBe(false);expect(params.getEditingRow('P1')?.['testvalue']).toBe('keep')
  expect(http.records['Base_TblField']?.find(row=>row['rowid']==='OTHER')).toBeDefined()
 })
 it('preserves another row draft and avoids consumer queries for title-only changes',async()=>{
  const {dataSet,view}=await workspace();view.updateEditingValue('OLD','cnname','outside draft')
  const edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('obsolete')],assertCurrent:()=>{}})
  await edit.stage();expect(edit.ids).toEqual(['F1'])
  expect(http.reads.filter(read=>read.table==='Base_DataModel')).toHaveLength(0)
  edit.cancel();expect(view.getEditingRow('OLD')?.['cnname']).toBe('outside draft')
 })
 it('rejects a draft on a touched identity before any staging',async()=>{
  const {dataSet,view}=await workspace();view.updateEditingValue('F1','cnname','existing')
  const edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('obsolete'),field('new')],assertCurrent:()=>{}})
  await expect(edit.stage()).rejects.toThrow('草稿');expect(edit.ids).toEqual([]);expect(view.dirtyTracking.pendingCreateIds.size).toBe(0)
 })
 it('blocks destructive changes for a consumer in another space even when its model name drifted',async()=>{
  http.records['Base_DataModel']=[{rowid:'M',dataSetId:'OTHER-SPACE',Type:'视图',DbId:'V1',MetaName:'old-name'}]
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id')],assertCurrent:()=>{}})
  await expect(edit.stage()).rejects.toThrow('消费者');expect(edit.ids).toEqual([]);expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  expect(http.reads.filter(read=>read.table==='Base_DataModel')).toHaveLength(1)
 })
 it('rechecks formal consumers after staging rather than reusing the original empty result',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id')],assertCurrent:()=>{}})
  await edit.stage();expect(view.dirtyTracking.pendingDeleteIds.has('OLD')).toBe(true)
  http.records['Base_DataModel']=[{rowid:'LATE',dataSetId:'OTHER-SPACE',Type:'视图',DbId:'V1',MetaName:'drifted'}]
  await expect(edit.verify()).rejects.toThrow('消费者')
  expect(http.reads.filter(read=>read.table==='Base_DataModel')).toHaveLength(2)
  expect(http.saves).toHaveLength(0);edit.cancel();expect(view.rows.some(row=>row['rowid']==='OLD')).toBe(true)
 })
 it('retains partial staging for explicit cancellation after the next native operation fails',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('obsolete'),field('new')],assertCurrent:()=>{}})
  vi.spyOn(view,'addRow').mockRejectedValueOnce(Error('new row failure'))
  await expect(edit.stage()).rejects.toThrow('new row failure');expect(edit.ids).toEqual(['F1'])
  edit.cancel();expect(view.getEditingRow('F1')?.['cnname']).toBe('id');expect(http.saves).toHaveLength(0)
 })
 it('can cancel the first member when the next member on the same row fails',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[{...field('id','编号'),description:'new description'},field('obsolete')],assertCurrent:()=>{}})
  const update=view.updateEditingValue.bind(view)
  vi.spyOn(view,'updateEditingValue').mockImplementation((id,key,value)=>{if(key==='description')throw Error('second member failed');return update(id,key,value)})
  await expect(edit.stage()).rejects.toThrow('second member failed');expect(edit.ids).toEqual(['F1'])
  edit.cancel();expect(view.hasEditingChanges('F1')).toBe(false);expect(view.getEditingRow('F1')?.['cnname']).toBe('id')
 })
 it('refuses to discard a later external edit on an owned identity',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('obsolete')],assertCurrent:()=>{}})
  await edit.stage();view.updateEditingValue('F1','description','later')
  expect(()=>edit.cancel()).toThrow('变化');expect(view.getEditingRow('F1')?.['description']).toBe('later')
 })
 it('rejects an intervening edit to the new row instead of adopting it as its own cancellation baseline',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id'),field('obsolete'),field('new')],assertCurrent:()=>{}})
  const add=view.addRow.bind(view)
  vi.spyOn(view,'addRow').mockImplementation(async values=>{
   const result=await add(values),row=view.rows.find(row=>row===result)!
   view.updateEditingValue(view.getPkKey(row)!,'cnname','external')
   return result
  })
  await expect(edit.stage()).rejects.toThrow('变化');expect(edit.ids).toHaveLength(1)
  expect(()=>edit.cancel()).toThrow('变化');expect(view.rows.some(row=>(view.getEditingRow(view.getPkKey(row)!)??row)['cnname']==='external')).toBe(true)
 })
 it('refuses deletion permission before staging otherwise permitted title edits',async()=>{
  http.denyDelete.add('Base_TblField')
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号')],assertCurrent:()=>{}})
  await expect(edit.stage()).rejects.toThrow('不允许删除');expect(edit.ids).toEqual([]);expect(view.hasEditingChanges()).toBe(false)
 })
 it('rejects a changed query contract without staging or cancelling unrelated drafts',async()=>{
  const {dataSet,view}=await workspace(),edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id','编号'),field('obsolete')],assertCurrent:()=>{}})
  view.queryContext={viewId:'V2'}
  await expect(edit.stage()).rejects.toThrow('变化');expect(edit.ids).toEqual([]);expect(http.saves).toHaveLength(0)
 })
 it('rejects a narrowed consumer filter instead of accepting its misleading empty result',async()=>{
  http.records['Base_DataModel']=[{rowid:'M',dataSetId:'OTHER-SPACE',Type:'视图',DbId:'V1',MetaName:'drifted'}]
  const {dataSet,view}=await workspace(),consumers=dataSet.getView('Base_DataModel','logicViewConsumers')!
  consumers.filterExpression={field:'MetaName',operator:'eq',value:'not-the-consumer'}
  const edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id')],assertCurrent:()=>{}})
  await expect(edit.stage()).rejects.toThrow('消费者');expect(edit.ids).toEqual([])
  expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
 })
 it('does not treat a superseded consumer read as an empty confirmed dependency set',async()=>{
  http.records['Base_DataModel']=[{rowid:'M',dataSetId:'OTHER-SPACE',Type:'视图',DbId:'V1',MetaName:'drifted'}]
  const {dataSet,view}=await workspace(),consumers=dataSet.getView('Base_DataModel','logicViewConsumers')!
  let calls=0,releaseFirst=()=>{},releaseSecond=()=>{}
  const firstGate=new Promise<void>(resolve=>{releaseFirst=resolve}),secondGate=new Promise<void>(resolve=>{releaseSecond=resolve})
  http.interceptors.request.use({onRequest:async request=>{
   const body=request.data
   if(isRecord(body)&&Array.isArray(body['Table'])&&isRecord(body['Table'][0])&&body['Table'][0]['Name']==='Base_DataModel'){
    calls++;await(calls===1?firstGate:secondGate)
   }
   return request
  }})
  const edit=new LogicViewOutputEdit({dataSet,viewId:'V1',fields:[field('id')],assertCurrent:()=>{}})
  const result=edit.stage().then(()=>({success:true,error:''}),cause=>({success:false,error:String(cause)}))
  await vi.waitFor(()=>expect(calls).toBe(1))
  const second=consumers.refresh()
  try{
   await vi.waitFor(()=>expect(calls).toBe(2));releaseFirst()
   expect((await result).success).toBe(false);expect(edit.ids).toEqual([])
   expect(view.dirtyTracking.pendingDeleteIds.size).toBe(0)
  }finally{releaseFirst();releaseSecond();await second;await result}
 })
})
