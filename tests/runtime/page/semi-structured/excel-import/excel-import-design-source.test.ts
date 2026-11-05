import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataSet} from '@spark-appworks/spark-data'
const state = vi.hoisted(() => ({load: vi.fn(), scope: vi.fn()}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({loadLowcodeRuntimeScenario: state.load}))
vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {readRequestScope: state.scope}, lowcodeHttp: {}}))
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
const DESIGN = '0F93B82141CF40852021D704B0E30BF4', loaded: DataSet[] = []
beforeEach(() => {
  state.scope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'EXECUTION_APP'}})
  state.load.mockReset(); state.load.mockImplementation(async ({scenarioId}: {scenarioId: string}) => {
    const ds = SparkData.fromJson({scenarioId, dataSetName: 'Excel配置', tables: {Base_Import_Transform_Rule:{modelBinding:{modelId:'b3ca28c2-432c-4374-ac20-bb98a85c2098',modelName:'Base_Import_Transform_Rule'},columns:[{name:'id',type:'string',isPrimaryKey:true},...['rule_type','source_field','target_field','sort_order','enabled','on_error','condition_json','config_json'].map(name=>({name,type:['sort_order','enabled'].includes(name)?'int':'string'}))],views:{default:{commitMode:'staged'}}}}}); loaded.push(ds); return ds
  })
})
afterEach(() => loaded.splice(0).forEach(ds => ds.destroy()))
describe('Excel independent design source', () => {
  it('loads the independent scene without attaching a synthetic file-design table', async () => {
    const ds = await LowcodeExcelImport.loadEditor(DESIGN)
    expect(state.load).toHaveBeenCalledExactlyOnceWith({projectId: 'EXECUTION_APP', scenarioId: DESIGN})
    expect(Object.keys(ds.tables)).toEqual(['Base_Import_Transform_Rule'])
    expect(ds.getView('Base_Import_Transform_Rule')?.dataTable?.querySaveRule?.fields).toEqual(['rule_type','source_field','target_field','sort_order','enabled','on_error','condition_json','config_json'])
  })
  it('rejects the catalog scene as the editor source', async () => {
    await expect(LowcodeExcelImport.loadEditor(LowcodeExcelImport.navigationScenarioId)).rejects.toThrow(/设计.*场景/)
    expect(state.load).not.toHaveBeenCalled()
  })
  it('rejects a rule table with an unrelated formal model identity',async()=>{
    const ds=SparkData.fromJson({scenarioId:DESIGN,tables:{Base_Import_Transform_Rule:{modelBinding:{modelId:'WRONG',modelName:'Base_Import_Transform_Rule'},columns:[],views:{default:{}}}}});loaded.push(ds)
    state.load.mockResolvedValue(ds)
    await expect(LowcodeExcelImport.loadEditor(DESIGN)).rejects.toThrow('正式模型身份')
  })

})
