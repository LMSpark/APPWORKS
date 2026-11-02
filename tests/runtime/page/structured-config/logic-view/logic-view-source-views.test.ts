import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LogicViewSourceViews} from '@/lowcode/resources/structured-config/logic-view/source-views'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
const state=vi.hoisted(()=>({readModel:vi.fn(),readRequestScope:vi.fn()}))
let http:ApiBackend,owner:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return http},lowcodeApi:{readRequestScope:state.readRequestScope,
  dataSpace:{design:state,get runtime(){return owner}}}}))
const sets:DataSet[]=[]
beforeEach(()=>{state.readModel.mockReset();state.readRequestScope.mockReset();http=new ApiBackend();owner=new DataSpaceRuntimeApi({http,readScope:state.readRequestScope})
  state.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
  const models=buildFormalModels({View_TblList:['rowid','tblname','tbldesc','dbid','DbName']})
  state.readModel.mockImplementation(({metaName}:{metaName:string})=>Promise.resolve(models.find(model=>model.metaName===metaName)))
})
afterEach(()=>{sets.splice(0).forEach(ds=>ds.destroy());vi.restoreAllMocks()})
function metadata(){const ds=DataSet.fromJson({scenarioId:'8D1AB14DD8277F3E7017CD38F77B09FD',dataSetName:'metadata',tables:{
  _Base_ParamList:{resourceType:'static-data',modelBinding:{modelId:'PARAM',modelName:'_Base_ParamList'},columns:[{name:'parid',type:'string',isPrimaryKey:true},{name:'testvalue',type:'string'}],
    views:{default:{commitMode:'staged',rows:[{parid:'P',testvalue:'original'}]}}}}});sets.push(ds);return ds}
describe('logic view lazy source views',()=>{
  it('adds a formal candidate table to the existing metadata instance without querying rows or losing parameter drafts',async()=>{
    const ds=metadata(),params=ds.getView('_Base_ParamList')!;params.updateEditingValue('P','testvalue','draft')
    const sources=new LogicViewSourceViews(ds),candidate=await sources.candidate('table')
    expect(candidate.dataSet).toBe(ds);expect(candidate.viewId).toBe('sourceCandidates')
    expect(candidate.dataTable?.modelBinding?.modelName).toBe('View_TblList')
    expect(candidate.pageSize).toBe(10)
    expect(params.getEditingRow('P')?.['testvalue']).toBe('draft');expect(ds.getView('_Base_ParamList')).toBe(params)
    expect(http.reads).toHaveLength(0)
    expect(await sources.candidate('table')).toBe(candidate);expect(state.readModel).toHaveBeenCalledTimes(1)
    http.records['View_TblList']=[{rowid:'T',tblname:'Orders',tbldesc:'订单',dbid:'DB',DbName:'Business'}]
    await candidate.refresh();expect(candidate.loadingError).toBeNull();expect(candidate.rows[0]?.['rowid']).toBe('T')
    expect(http.saves).toHaveLength(0)
  })
  it('uses a separate auxiliary view on an existing model and retains its original query owner and draft',async()=>{
    const ds=metadata(),params=ds.getView('_Base_ParamList')!;params.updateEditingValue('P','testvalue','draft')
    const detail=await new LogicViewSourceViews(ds).details('_Base_ParamList')
    expect(detail.dataTable).toBe(params.dataTable);expect(detail).not.toBe(params)
    expect(detail.rows).toHaveLength(0);expect(detail.hasEditingChanges()).toBe(false)
    expect(detail.queryContext).toEqual({});expect(params.getEditingRow('P')?.['testvalue']).toBe('draft')
    expect(state.readModel).not.toHaveBeenCalled()
  })
  it('does not attach the late model after the application changes',async()=>{
    const ds=metadata(),sources=new LogicViewSourceViews(ds)
    let release:()=>void=()=>{};const wait=new Promise<void>(resolve=>{release=resolve})
    const original=state.readModel.getMockImplementation()!
    state.readModel.mockImplementation(async input=>{await wait;return original(input)})
    const pending=sources.candidate('table')
    state.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'OTHER'}});release()
    await expect(pending).rejects.toThrow(/STALE/);expect(ds.getTable('View_TblList')).toBeUndefined()
  })
})
