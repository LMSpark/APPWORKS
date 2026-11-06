import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import type {DataView} from '@spark-appworks/spark-data'
import type {RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {LogicViewPublication} from '@/lowcode/resources/structured-config/logic-view/output/publication'
import {DataSpaceDefinitionSave} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {LOGIC_VIEW_DESIGN_INPUT,LOGIC_VIEW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/logic-view/design-ops'
import {setDesignScopeValue} from '@/lowcode/resources/repository/staged-design-file-view'
import {configureLogicFixture,LogicViewHttp} from '../logic-view.fixture'
const service=vi.hoisted(()=>({readSpaceDefinition:vi.fn(),readModel:vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),readRequestScope:vi.fn(),createGateways:vi.fn()}))
let http:PublicationHttp,owner:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return http},createLowcodeProjectGateways:(...args:unknown[])=>service.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({}),lowcodeApi:{design:{},readRequestScope:service.readRequestScope,dataSpace:{design:service,get runtime(){return owner}}}}))
class PublicationHttp extends LogicViewHttp{
 fileUnconfirmed=false
 onFile?:()=>void
 override async post<T>(url:string,data?:unknown,config?:Partial<RequestConfig>):Promise<T>{
  if(url.includes('ViewData/SaveView')&&this.fileUnconfirmed){this.posts.push({url,data});return {Code:200,Result:'保存成功'} as T}
  const result=await super.post<T>(url,data,config)
  if(url.includes('ViewData/SaveView'))this.onFile?.()
  return result
 }
}
const pages:PageRuntime[]=[],commands:LogicViewPublication[]=[]
const design=(description:string)=>[{Name:'Orders',MetaName:'Orders',Type:'数据库表',DbId:'DB',DbName:'Business',OutputType:'Table',PrimaryKeyFields:'id',
 Fields:[{Name:'id',Description:description,FieldType:'int',IsPKey:1,IsOutput:1}],ChildTables:[]}]
beforeEach(()=>{
 vi.clearAllMocks();http=new PublicationHttp();owner=new DataSpaceRuntimeApi({http,readScope:service.readRequestScope})
 service.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
 http.records={Base_DataViewList:[{rowid:'V1',sysid:'APP',name:'View One',description:'视图'}],
  View_TblList:[{rowid:'T',tblname:'Orders',tbldesc:'订单',dbid:'DB',DbName:'Business'}],
  Base_TblField:[{rowid:'SF',tblid:'T',enname:'id',cnname:'编号',description:'编号',DataType:'int',IsPKey:1},
   {rowid:'F1',tblid:'V1',enname:'id',cnname:'old',description:'old',DataType:'int',IsPKey:1},
   {rowid:'OLD',tblid:'V1',enname:'obsolete',cnname:'旧字段',description:'旧字段',DataType:'varchar',IsPKey:0}],
  _Base_ParamList:[{parid:'P1',pid:'V1',parname:'arg',testvalue:'original'}]}
 http.logicDesigns['V1']=design('old');configureLogicFixture(service,http)
})
afterEach(()=>{commands.splice(0).forEach(command=>command.dispose());pages.splice(0).forEach(page=>page.dispose());vi.restoreAllMocks()})
async function workspace(){
 const page=new PageRuntime({...LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId:'V1'}),pageId:'publication-test'})
 pages.push(page);await page.load();await LowcodeLogicView.prepareEditor(page)
 const ds=page.getDataSet(LowcodeLogicView.navigationScenarioId)!
 setDesignScopeValue({dataSet:ds,tableName:LOGIC_VIEW_DESIGN_INPUT,field:'viewId',scopeId:'V1'})
 const file=ds.getView(LOGIC_VIEW_DESIGN_VIEW)!
 await file.refresh();if(file.loadingError)throw file.loadingError
 file.updateEditingValue('V1','designJson',JSON.stringify(design('新编号')))
 const command=new LogicViewPublication({page,viewId:'V1',assertCurrent:()=>{}});commands.push(command)
 return{page,file,command}
}
async function invalidOutputReceipt(afterSave?:(view:DataView)=>void){
 const state=await workspace(),metadata=await LowcodeLogicView.ensureOutputFields(state.page)
 const save=metadata.saveChanges.bind(metadata)
 vi.spyOn(metadata,'saveChanges').mockImplementationOnce(async options=>{
  const result=await save(options)
  if(!result.data)throw Error('missing actual SDK receipt')
  afterSave?.(metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!)
  return{...result,data:{...result.data,viewCount:result.data.viewCount+1}}
 })
 await expect(state.command.save()).rejects.toThrow('回执')
 return{...state,metadata,outputs:metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!}
}
describe('logic view two-source publication through original DataSets',()=>{
 it.each(['undefined','missing'] as const)('preserves a nullable native member changed to %s after an invalid receipt',async change=>{
  const {command,outputs}=await invalidOutputReceipt(view=>{view.rows.find(row=>view.getPkKey(row)==='F1')!['description']=null})
  const row=outputs.rows.find(row=>outputs.getPkKey(row)==='F1')!
  if(change==='missing')delete row['description']
  else row['description']=undefined
  const reads=http.reads.length
  await expect(command.acceptCurrentAndRetire()).rejects.toThrow('变化')
  expect(row['description']).toBeUndefined();expect(Object.hasOwn(row,'description')).toBe(change!=='missing')
  expect(http.reads).toHaveLength(reads);expect(command.finished).toBe(false)
 })
 it('explicitly adopts current output results after an invalid receipt without claiming the original publication succeeded',async()=>{
  const {command,metadata}=await invalidOutputReceipt()
  const params=await LowcodeLogicView.ensureParameters(pages[0]!)
  params.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!.updateEditingValue('P1','testvalue','keep')
  const dispatched=http.saves.length
  expect(command.needsVerification).toBe(true)
  await command.acceptCurrentAndRetire()
  expect(command.finished).toBe(true);expect(command.fileConfirmed).toBe(true)
  expect(command.published).toBe(false);expect(command.needsVerification).toBe(false)
  expect(http.saves).toHaveLength(dispatched)
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(1)
  expect(metadata.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)?.getEditingRow('P1')?.['testvalue']).toBe('keep')
 })
 it('preserves later native output changes instead of adopting current results after an invalid receipt',async()=>{
  const {command,outputs}=await invalidOutputReceipt()
  const row=outputs.rows.find(row=>outputs.getPkKey(row)==='F1')!
  row['cnname']='later native value'
  const beforeReads=http.reads.length
  await expect(command.acceptCurrentAndRetire()).rejects.toThrow('变化')
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('later native value')
  expect(http.reads).toHaveLength(beforeReads);expect(command.finished).toBe(false)
 })
 it('preserves outside output drafts when explicitly adopting an invalid receipt',async()=>{
  const {command,outputs}=await invalidOutputReceipt()
  await outputs.addRow({tblid:'V1',enname:'outside',cnname:'outside',DataType:'varchar',IsPKey:0})
  const beforeReads=http.reads.length
  await expect(command.acceptCurrentAndRetire()).rejects.toThrow('范围外')
  expect(outputs.rows.some(row=>row['enname']==='outside')).toBe(true)
  expect(http.reads).toHaveLength(beforeReads);expect(command.finished).toBe(false)
 })
 it('preserves native output input that arrives while an explicit current-result query is pending',async()=>{
  const {command,outputs}=await invalidOutputReceipt()
  let release!:()=>void,entered!:()=>void
  const waiting=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
  http.beforeRead=async()=>{entered();await gate}
  const adopting=command.acceptCurrentAndRetire()
  await waiting
  const row=outputs.rows.find(row=>outputs.getPkKey(row)==='F1')!
  row['cnname']='native input during read'
  release()
  await expect(adopting).rejects.toThrow()
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('native input during read')
  expect(command.finished).toBe(false)
 })
 it('retires only its original output ids after verification proves the output write was not applied',async()=>{
  const {command,page}=await workspace(),metadata=await LowcodeLogicView.ensureParameters(page)
  const params=metadata.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
  params.updateEditingValue('P1','testvalue','keep')
  http.beforeSave=()=>Promise.reject(Error('failed before storage'))
  await expect(command.save()).rejects.toThrow()
  expect(command.needsVerification).toBe(true)
  delete http.beforeSave
  await command.verify()
  expect(command.finished).toBe(false)
  await expect(command.save()).rejects.toThrow('原输出')
  expect(http.saves).toHaveLength(0)
  await command.retireNotAppliedOutputs()
  expect(command.finished).toBe(true);expect(command.fileConfirmed).toBe(true)
  expect(http.saves).toHaveLength(0)
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(1)
  const outputs=metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('old')
  expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
  expect(params.getEditingRow('P1')?.['testvalue']).toBe('keep')
 })
 it('refuses to retire verified unapplied output ids when they contain later input',async()=>{
  const {command,page}=await workspace()
  http.beforeSave=()=>Promise.reject(Error('failed before storage'))
  await expect(command.save()).rejects.toThrow()
  delete http.beforeSave;await command.verify()
  const outputs=page.getDataSet(LowcodeLogicView.parameterScenarioId)!.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!
  outputs.updateEditingValue('F1','cnname','later output')
  await expect(command.retireNotAppliedOutputs()).rejects.toThrow('新修改')
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('later output')
  expect(command.finished).toBe(false);expect(http.saves).toHaveLength(0)
 })
 it('identifies each independent save by its owning space and formal root model',async()=>{
  const {command,page}=await workspace(),seen:Array<{targetId:string;modelId:string}>=[]
  const run=DataSpaceDefinitionSave.run.bind(DataSpaceDefinitionSave)
  vi.spyOn(DataSpaceDefinitionSave,'run').mockImplementation(async parts=>{seen.push(...parts.map(({targetId,modelId})=>({targetId,modelId})));await run(parts)})
  await command.save()
  const fileDs=page.getDataSet(LowcodeLogicView.navigationScenarioId)!,metadata=page.getDataSet(LowcodeLogicView.parameterScenarioId)!
  expect(seen).toEqual([
   {targetId:fileDs.scenarioId,modelId:fileDs.getView('Base_DataViewList','editorTarget')?.dataTable?.modelBinding?.modelId},
   {targetId:metadata.scenarioId,modelId:metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)?.dataTable?.modelBinding?.modelId},
  ])
 })
 it('retains the original intent while asynchronous preparation has not returned an output edit',async()=>{
  const {command}=await workspace()
  const prepare=LowcodeLogicView.prepareOutputPublication.bind(LowcodeLogicView)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  vi.spyOn(LowcodeLogicView,'prepareOutputPublication').mockImplementation(async input=>{await gate;return prepare(input)})
  const saving=command.save()
  const pending=command.pending
  release();await saving
  expect(pending).toBe(true)
 })
 it('retires only unsubmitted outputs after the file is confirmed and preserves parameter input',async()=>{
  const {command,page}=await workspace(),metadata=await LowcodeLogicView.ensureParameters(page)
  const params=metadata.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
  params.updateEditingValue('P1','testvalue','keep')
  http.onFile=()=>{http.records['Base_DataModel']=[{rowid:'LATE',dataSetId:'OTHER',Type:'视图',DbId:'V1',MetaName:'drifted'}]}
  await expect(command.save()).rejects.toThrow('消费者')
  expect(()=>command.cancelBeforeDispatch()).not.toThrow()
  expect(command.pending).toBe(false);expect(command.finished).toBe(true)
  expect(command.fileConfirmed).toBe(true)
  expect(http.logicDesigns['V1']).toEqual(design('新编号'))
  expect(http.saves).toHaveLength(0)
  const outputs=metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('old')
  expect(outputs.dirtyTracking.hasPendingChanges()).toBe(false)
  expect(params.getEditingRow('P1')?.['testvalue']).toBe('keep')
 })
 it('can cancel its output delta when new design input arrives during native output application',async()=>{
  const {command,page,file}=await workspace(),metadata=await LowcodeLogicView.ensureOutputFields(page)
  const outputs=metadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)!
  const apply=outputs.applyEditingRows.bind(outputs)
  vi.spyOn(outputs,'applyEditingRows').mockImplementation(async ids=>{
   const result=await apply(ids)
   file.updateEditingValue('V1','designJson',JSON.stringify(design('later input')))
   return result
  })
  await expect(command.save()).rejects.toThrow()
  expect(()=>command.cancelBeforeDispatch()).not.toThrow()
  expect(outputs.getEditingRow('F1')?.['cnname']).toBe('old')
  expect(file.getEditingRow('V1')?.['designJson']).toContain('later input')
  expect(http.saves).toHaveLength(0)
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(0)
 })
 it('confirms the design first, then saves stable output identities and preserves parameter drafts',async()=>{
  const {page,file,command}=await workspace(),metadata=await LowcodeLogicView.ensureParameters(page)
  const params=metadata.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
  params.updateEditingValue('P1','testvalue','keep')
  await command.save()
  expect(command.pending).toBe(false);expect(command.finished).toBe(true)
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(1)
  expect(http.saves.map(save=>save.table)).toEqual(['Base_TblField'])
  expect(http.records['Base_TblField']?.filter(row=>row['tblid']==='V1')).toEqual([{rowid:'F1',tblid:'V1',enname:'id',cnname:'新编号',description:'新编号',DataType:'int',IsPKey:1}])
  expect(params.getEditingRow('P1')?.['testvalue']).toBe('keep');expect(file.hasEditingChanges()).toBe(false)
  const reopened=new PageRuntime({...LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId:'V1'}),pageId:'publication-readback'})
  pages.push(reopened);await reopened.load();await LowcodeLogicView.prepareEditor(reopened)
  const reopenedMetadata=await LowcodeLogicView.ensureOutputFields(reopened),reopenedDs=reopened.getDataSet(LowcodeLogicView.navigationScenarioId)!
  setDesignScopeValue({dataSet:reopenedDs,tableName:LOGIC_VIEW_DESIGN_INPUT,field:'viewId',scopeId:'V1'})
  const reopenedFile=reopenedDs.getView(LOGIC_VIEW_DESIGN_VIEW)!
  await reopenedFile.refresh();if(reopenedFile.loadingError)throw reopenedFile.loadingError
  expect(reopenedDs).not.toBe(file.dataSet)
  expect(JSON.parse(String(reopenedFile.getEditingRow('V1')?.['designJson']))).toEqual(design('新编号'))
  expect(reopenedMetadata.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)?.rows).toMatchObject([{rowid:'F1',tblid:'V1',cnname:'新编号'}])
 })
 it('keeps an unconfirmed design on its original capture and never submits output fields',async()=>{
  const {command,file}=await workspace();http.fileUnconfirmed=true
  await expect(command.save()).rejects.toThrow()
  expect(command.pending).toBe(true);expect(command.needsVerification).toBe(true);expect(file.hasUnconfirmedSave).toBe(true)
  expect(http.saves).toHaveLength(0)
  await command.verify()
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(1);expect(http.saves).toHaveLength(0)
 })
 it('rechecks consumers after confirmed file save and keeps the partial publication dirty',async()=>{
  const {command}=await workspace()
  http.onFile=()=>{http.records['Base_DataModel']=[{rowid:'LATE',dataSetId:'OTHER',Type:'视图',DbId:'V1',MetaName:'drifted'}]}
  await expect(command.save()).rejects.toThrow('消费者')
  expect(command.pending).toBe(true);expect(command.fileConfirmed).toBe(true);expect(http.saves).toHaveLength(0)
 })
 it('preserves new file input after file confirmation and stops output submission',async()=>{
  const {command,file}=await workspace()
  http.onFile=()=>file.updateEditingValue('V1','designJson',JSON.stringify(design('later input')))
  await expect(command.save()).rejects.toThrow()
  expect(command.pending).toBe(true);expect(command.fileConfirmed).toBe(true);expect(http.saves).toHaveLength(0)
  expect(file.getEditingRow('V1')?.['designJson']).toContain('later input')
  expect(()=>command.cancelBeforeDispatch()).not.toThrow()
  expect(command.fileConfirmed).toBe(true);expect(command.finished).toBe(true)
  expect(file.getEditingRow('V1')?.['designJson']).toContain('later input')
 })
 it('verifies only the original output capture after a lost output receipt without replaying SaveView',async()=>{
  const {command}=await workspace();http.onFile=()=>{http.failAfterWrite=true}
  await expect(command.save()).rejects.toThrow()
  expect(command.needsVerification).toBe(true);expect(command.fileConfirmed).toBe(true)
  const dispatched=http.saves.length;http.failAfterWrite=false
  await command.verify()
  expect(command.finished).toBe(true);expect(http.saves).toHaveLength(dispatched)
  expect(http.posts.filter(post=>post.url.includes('SaveView'))).toHaveLength(1)
 })
})
