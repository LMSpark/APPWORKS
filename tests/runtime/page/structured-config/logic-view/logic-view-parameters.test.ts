import {PageRuntime} from '@spark-appworks/spark-project-model'
import {configureLogicFixture} from './logic-view.fixture'
import {afterEach,beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi, DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn(),readModelBatch:vi.fn(),readRelations:vi.fn(),createGateways:vi.fn()}))
let http: ApiBackend, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({get lowcodeHttp() {return http},
  createLowcodeProjectGateways:(...args:unknown[])=>service.createGateways(...args),lowcodeDesignFileUpload:undefined,createPageToolFilesIo:()=>({readText:()=>{throw Error('Unexpected tool file read')},writeText:()=>{throw Error('Unexpected tool file write')}}), lowcodeApi: {
  design:{},readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}},
}}))
beforeEach(() => {
  vi.clearAllMocks()
  http = new ApiBackend(); http.primaryKeys['_Base_ParamList'] = 'parid'
  http.records = {_Base_ParamList: [{parid: 'P1', pid: 'V1', parname: 'first', pardesc: '原描述', testvalue: '1'},
    {parid: 'P2', pid: 'V2', parname: 'other', pardesc: '其它目标', testvalue: '2'}]}
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: 'Metadata', raw: {}}))
  const base = buildFormalModels({_Base_ParamList: ['parid', 'pid', 'parname', 'pardesc', 'testvalue']})[0]!
  service.readModel.mockResolvedValue({...base, primaryKey: 'parid', fields: base.fields.map(field => ({...field, primaryKey: field.name === 'parid'}))})
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
  configureLogicFixture(service,http,[base])
})
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
async function parameters(viewId:string){const page=new PageRuntime({...LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId}),pageId:'parameter-test'});pages.push(page);await page.load();return LowcodeLogicView.ensureParameters(page)}
describe('logical-view formal parameter resource', () => {
  it.each(['scope','changed-token'])('rejects a deferred metadata load after application changes with token %s',async token=>{
    const page=new PageRuntime({...LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId:'V1'}),pageId:'stale-parameter-test'})
    pages.push(page);await page.load()
    const reads=http.reads.length,batches=service.readModelBatch.mock.calls.length
    service.readRequestScope.mockReturnValue({token,headers:{'X-AppId':'APP-B'}})
    await expect(LowcodeLogicView.ensureParameters(page)).rejects.toThrow('身份已变化')
    expect(page.getDataSet(DATA_SPACE_DESIGN_FORM_KEY)).toBeUndefined()
    expect(http.reads).toHaveLength(reads);expect(service.readModelBatch).toHaveBeenCalledTimes(batches)
  })
  it('keeps parid as the current-row and save identity when a parameter name used by options is renamed',async()=>{
    const ds=await parameters('V1')
    try {
      const view=ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!;view.setCurrentRowById('P1')
      view.updateEditingValue('P1','parname','renamed')
      const result=await ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:['P1']}]})
      expect(result.success).toBe(true);expect(view.currentRow?.['parid']).toBe('P1')
      expect(view.currentRow?.['parname']).toBe('renamed')
      expect(http.saves[0]).toMatchObject({table:'_Base_ParamList',changed:[{parid:'P1',parname:'renamed'}]})
    }finally{ds.destroy()}
  })
  it('loads only the target pid using the formal parid primary key', async () => {
    const ds = await parameters('V1')
    try {
      expect(ds.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
      const view = ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
      expect(view.primaryKey).toBe('parid')
      expect(view.valueField).toBe('parname')
      expect(view.labelField).toBe('parname')
      expect(view.rows.map(row => row['parid'])).toEqual(['P1'])
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })
  it('inherits pid for a new row and saves only parameters through the native owner', async () => {
    const ds = await parameters('V1')
    try {
      const view = ds.getView('_Base_ParamList',LowcodeLogicView.parameterViewId)!
      await view.addRow({parname: ' newParam ', pardesc: '新增', testvalue: ''})
      const id = [...view.dirtyTracking.pendingCreateIds][0]
      if (id === undefined) throw new Error('expected a staged parameter row')
      expect(view.rows.find(row => view.getPkKey(row) === id)?.['pid']).toBe('V1')
      const result = await ds.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
      expect(result.success).toBe(true)
      expect(http.saves[0]).toMatchObject({table: '_Base_ParamList', added: [{parid: id, pid: 'V1', parname: 'newParam'}]})
      expect(http.records['_Base_ParamList']?.find(item => item['parid'] === 'P2')?.['pid']).toBe('V2')
    } finally {ds.destroy()}
  })
  it('rejects a missing target before loading or querying metadata', async () => {
    expect(()=>LowcodeLogicView.editorRuntimeOptions({scenarioId:LowcodeLogicView.navigationScenarioId,viewId:' '})).toThrow('目标')
    expect(service.readModelBatch).not.toHaveBeenCalled();expect(service.createGateways).not.toHaveBeenCalled();expect(http.reads).toHaveLength(0)
    expect(service.readModel).not.toHaveBeenCalled()
  })
})
