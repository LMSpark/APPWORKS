import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {configureLogicFixture} from './logic-view.fixture'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LogicViewSourceViews} from '@/lowcode/resources/structured-config/logic-view/source-views'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
const state=vi.hoisted(()=>({readModel:vi.fn(),readRequestScope:vi.fn(),readSpaceDefinition:vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),createGateways:vi.fn()}))
let http:ApiBackend,owner:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({createLowcodeProjectGateways:(...args:unknown[])=>state.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({}),get lowcodeHttp(){return http},lowcodeApi:{design:{},readRequestScope:state.readRequestScope,
  dataSpace:{design:state,get runtime(){return owner}}}}))
const sets:DataSet[]=[],pages:PageRuntime[]=[]
beforeEach(()=>{state.readModel.mockReset();state.readRequestScope.mockReset();http=new ApiBackend();owner=new DataSpaceRuntimeApi({http,readScope:state.readRequestScope})
  state.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
  const models=buildFormalModels({View_TblList:['rowid','tblname','tbldesc','dbid','DbName']})
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
