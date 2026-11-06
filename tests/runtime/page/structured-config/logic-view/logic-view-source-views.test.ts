import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {configureLogicFixture,LogicViewHttp} from './logic-view.fixture'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LogicViewSourceViews} from '@/lowcode/resources/structured-config/logic-view/source-views'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
const state=vi.hoisted(()=>({readModel:vi.fn(),readRequestScope:vi.fn(),readSpaceDefinition:vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),createGateways:vi.fn()}))
let http:LogicViewHttp,owner:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({createLowcodeProjectGateways:(...args:unknown[])=>state.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({}),get lowcodeHttp(){return http},lowcodeApi:{design:{},readRequestScope:state.readRequestScope,
  dataSpace:{design:state,get runtime(){return owner}}}}))
const sets:DataSet[]=[],pages:PageRuntime[]=[]
beforeEach(()=>{state.readModel.mockReset();state.readRequestScope.mockReset();http=new LogicViewHttp();owner=new DataSpaceRuntimeApi({http,readScope:state.readRequestScope})
  state.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
  const models=buildFormalModels({View_TblList:['rowid','tblname','tbldesc','dbid','DbName'],Base_DataServiceInterface:['rowid','Name','Desc','ProviderID'],
    _Base_DictType:['rowid','TypeName','functiondesc','dictionaryType','txt','val','secondValue','thirdValue','fourthvalue','fiveValue']})
  http.primaryKeys['_Base_ParamList']='parid';http.records['_Base_ParamList']=[{parid:'P',pid:'V1',parname:'first',testvalue:'original'}]
  configureLogicFixture(state,http,models)
})
afterEach(()=>{pages.splice(0).forEach(page=>page.dispose());sets.splice(0).forEach(ds=>ds.destroy());vi.restoreAllMocks()})
async function metadata(){
 const id=LowcodeLogicView.parameterScenarioId,page=new PageRuntime({pageId:'source-test',scenarioIds:[id],scenarioInputs:{[id]:{viewId:'V1'}},loadScenario:scenarioId=>loadLowcodeRuntimeScenario({projectId:'APP',scenarioId})});pages.push(page);await page.load()
 const ds=page.getDataSet(id)!,params=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
 await params.refresh();return ds
}

describe('logic view lazy source views',()=>{
  it.each(['rename','delete'])('rejects a JSON source %s between initial location and formal preparation',async change=>{
    http.records['Base_JsonData']=[{rowid:'JSON',name:'Document'}]
    const ds=await metadata(),sources=new LogicViewSourceViews(ds)
    let reads=0
    http.beforeRead=async()=>{if(++reads===2){if(change==='delete')http.records['Base_JsonData']=[];else http.records['Base_JsonData']![0]!['name']='Renamed'}}
    await expect(sources.prepareStored({Type:'JSON',DbId:'JSON',MetaName:'Document'})).rejects.toThrow('来源')
    expect(http.saves).toHaveLength(0)
  })
  it('restores a dictionary using its original definition and keeps numeric values distinct from primary keys',async()=>{
    http.records['_Base_DictType']=[{rowid:'DICT',TypeName:'Statuses',functiondesc:'状态',dictionaryType:'1',txt:'标题',val:'编码',secondValue:'扩展1',thirdValue:'扩展2',fourthvalue:'扩展3',fiveValue:'扩展4'}]
    const ds=await metadata(),sources=new LogicViewSourceViews(ds)
    const prepared=await sources.prepareStored({Type:'字典',DbId:'DICT',MetaName:'Statuses'})
    expect(prepared.source).toMatchObject({id:'DICT',type:'dict'})
    expect(prepared.fields).toHaveLength(8)
    expect(prepared.fields.find(field=>field.Name==='val')).toMatchObject({FieldType:'double',description:'编码',IsPKey:0})
    expect(prepared.fields.every(field=>field.IsPKey===0)).toBe(true)
    await expect(sources.prepareStored({Type:'字典',DbId:'DICT',MetaName:'Renamed'})).rejects.toThrow('来源')
    expect(http.saves).toHaveLength(0)
  })
  it('restores a stored JSON resource by its ID and name without inferring a primary key',async()=>{
    http.records['Base_JsonData']=[{rowid:'JSON',name:'Document'},{rowid:'OTHER',name:'Document'}]
    const ds=await metadata(),sources=new LogicViewSourceViews(ds)
    const prepared=await sources.prepareStored({Type:'JSON',DbId:'JSON',MetaName:'Document'})
    expect(prepared.source).toMatchObject({type:'json',id:'JSON',name:'Document'})
    expect(prepared.fields.map(field=>field.Name)).toEqual(['id','pid','name','type','haschild','value'])
    expect(prepared.fields.every(field=>field.IsPKey===0)).toBe(true)
    await expect(sources.prepareStored({Type:'JSON',DbId:'JSON',MetaName:'Renamed'})).rejects.toThrow('来源')
    http.records['Base_JsonData']=[]
    await expect(sources.prepareStored({Type:'JSON',DbId:'JSON',MetaName:'Document'})).rejects.toThrow('来源')
    expect(http.saves).toHaveLength(0)
  })
  it('restores the unique provider and interface name before reading fields and input parameters',async()=>{
    http.records['Base_DataServiceInterface']=[{rowid:'IF1',Name:'Orders',Desc:'orders',ProviderID:'PROVIDER'},
      {rowid:'IF2',Name:'Orders',Desc:'other',ProviderID:'OTHER'}]
    http.records['Base_TblField']=[{rowid:'F',tblid:'IF1',enname:'id',cnname:'编号',description:'编号',DataType:'int',IsPKey:1}]
    http.records['_Base_ParamList']!.push({parid:'ARG',pid:'IF1',parname:'query',pardesc:'输入',parzdtype:'varchar'})
    const ds=await metadata(),sources=new LogicViewSourceViews(ds),params=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
    params.updateEditingValue('P','testvalue','keep')
    const prepared=await sources.prepareStored({Type:'接口',DbId:'PROVIDER',MetaName:'Orders'})
    expect(prepared.source).toMatchObject({id:'IF1',providerId:'PROVIDER'})
    expect(prepared.fields).toEqual(expect.arrayContaining([expect.objectContaining({type:'dataModel',Name:'id',IsPKey:1}),expect.objectContaining({type:'inputParams',Name:'query',IsOutput:0})]))
    expect(params.getEditingRow('P')?.['testvalue']).toBe('keep')
    http.records['Base_DataServiceInterface'].push({rowid:'DUP',Name:'Orders',Desc:'duplicate',ProviderID:'PROVIDER'})
    await expect(sources.prepareStored({Type:'接口',DbId:'PROVIDER',MetaName:'Orders'})).rejects.toThrow('不唯一')
    expect(http.saves).toHaveLength(0)
  })
  it('resolves a stored database and table name independently of the current source candidate selection',async()=>{
    http.records['View_TblList']=[{rowid:'T',tblname:'Orders',tbldesc:'订单',dbid:'DB',DbName:'Business'},
      {rowid:'OTHER',tblname:'Orders',tbldesc:'同名',dbid:'OTHER-DB',DbName:'Other'}]
    http.records['Base_TblField']=[{rowid:'TF',tblid:'T',enname:'id',cnname:'编号',description:'编号',DataType:'int',IsPKey:1}]
    const ds=await metadata(),sources=new LogicViewSourceViews(ds),candidate=await sources.candidate('table')
    await candidate.refresh();candidate.setCurrentRowById('OTHER')
    const params=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!;params.updateEditingValue('P','testvalue','keep')
    const prepared=await sources.prepareStored({Type:'数据库表',DbId:'DB',MetaName:'Orders'})
    expect(prepared.source).toMatchObject({id:'T',dbid:'DB',name:'Orders',databaseName:'Business'})
    expect(prepared.fields[0]).toMatchObject({Name:'id',FieldType:'int',IsPKey:1})
    expect(candidate.currentRow?.['rowid']).toBe('OTHER');expect(params.getEditingRow('P')?.['testvalue']).toBe('keep')
    expect(http.saves).toHaveLength(0)
  })
  it('adds a formal candidate table to the existing metadata instance without querying rows or losing parameter drafts',async()=>{
    const ds=await metadata(),params=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!;params.updateEditingValue('P','testvalue','draft')
    const sources=new LogicViewSourceViews(ds),candidate=await sources.candidate('table')
    expect(candidate.dataSet).toBe(ds);expect(candidate.viewId).toBe('sourceCandidates')
    expect(candidate.dataTable?.modelBinding?.modelName).toBe('View_TblList')
    expect(candidate.pageSize).toBe(10)
    expect(params.getEditingRow('P')?.['testvalue']).toBe('draft');expect(ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)).toBe(params)
    expect(http.reads).toHaveLength(1)
    expect(await sources.candidate('table')).toBe(candidate);expect(state.readModel).not.toHaveBeenCalled()
    http.records['View_TblList']=[{rowid:'T',tblname:'Orders',tbldesc:'订单',dbid:'DB',DbName:'Business'}]
    await candidate.refresh();expect(candidate.loadingError).toBeNull();expect(candidate.rows[0]?.['rowid']).toBe('T')
    expect(http.saves).toHaveLength(0)
  })
  it('uses a separate auxiliary view on an existing model and retains its original query owner and draft',async()=>{
    const ds=await metadata(),params=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!;params.updateEditingValue('P','testvalue','draft')
    const detail=await new LogicViewSourceViews(ds).details('_Base_ParamList')
    expect(detail.dataTable).toBe(params.dataTable);expect(detail).not.toBe(params)
    expect(detail.rows).toHaveLength(0);expect(detail.hasEditingChanges()).toBe(false)
    expect(detail.queryContext['viewId']).toBe('V1');expect(params.getEditingRow('P')?.['testvalue']).toBe('draft')
    expect(state.readModel).not.toHaveBeenCalled()
  })
  it('rejects a late candidate resolution after the application changes without attaching another table',async()=>{
    const ds=await metadata(),sources=new LogicViewSourceViews(ds),table=ds.getTable('View_TblList')
    const pending=sources.candidate('table')
    state.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'OTHER'}})
    await expect(pending).rejects.toThrow(/STALE/);expect(ds.getTable('View_TblList')).toBe(table)
    expect(state.readModel).not.toHaveBeenCalled();expect(http.saves).toHaveLength(0)
  })
})
