import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi, DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {buildFormalModels} from '../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: ApiBackend, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({get lowcodeHttp() {return http}, lowcodeApi: {
  readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}},
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
})
describe('logical-view formal parameter resource', () => {
  it('keeps parid as the current-row and save identity when a parameter name used by options is renamed',async()=>{
    const ds=await LowcodeLogicView.loadParameters('V1')
    try {
      const view=ds.getView('_Base_ParamList')!;view.setCurrentRowById('P1')
      view.updateEditingValue('P1','parname','renamed')
      const result=await ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:['P1']}]})
      expect(result.success).toBe(true);expect(view.currentRow?.['parid']).toBe('P1')
      expect(view.currentRow?.['parname']).toBe('renamed')
      expect(http.saves[0]).toMatchObject({table:'_Base_ParamList',changed:[{parid:'P1',parname:'renamed'}]})
    }finally{ds.destroy()}
  })
  it('loads only the target pid using the formal parid primary key', async () => {
    const ds = await LowcodeLogicView.loadParameters('V1')
    try {
      expect(ds.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
      const view = ds.getView('_Base_ParamList')!
      expect(view.primaryKey).toBe('parid')
      expect(view.valueField).toBe('parname')
      expect(view.labelField).toBe('parname')
      expect(view.rows.map(row => row['parid'])).toEqual(['P1'])
      expect(http.saves).toHaveLength(0)
    } finally {ds.destroy()}
  })
  it('inherits pid for a new row and saves only parameters through the native owner', async () => {
    const ds = await LowcodeLogicView.loadParameters('V1')
    try {
      const view = ds.getView('_Base_ParamList')!
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
    await expect(LowcodeLogicView.loadParameters(' ')).rejects.toThrow('目标')
    expect(service.readModel).not.toHaveBeenCalled()
  })
})
