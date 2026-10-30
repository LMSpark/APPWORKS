import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'
import {buildFormalModels, StructuredCatalogHttp} from './structured-config-catalog.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: service, get runtime() {return runtime}}},
}))

beforeEach(() => {
  http = new StructuredCatalogHttp({
    Base_DataViewList: [{rowid: 'V1', AppId: 'APP', name: 'A', createuser: 'U-ROW'}],
    _Base_DataWorkFlow: [{rowid: 'W1', AppId: 'APP', FlowName: 'B', createuser: 'U-ROW'}],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
    buildFormalModels({
      Base_DataViewList: ['rowid', 'AppId', 'name', 'description', 'createuser', 'crttime'],
      _Base_DataWorkFlow: ['rowid', 'AppId', 'FlowName', 'functiondesc', 'createuser', 'crttime'],
      Base_UserInfo: ['ID', 'ROWID', 'UserName'],
    }).find(m => m.metaName === metaName),
  ))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})

describe('structured-config catalog loaders', () => {
  it('LowcodeDataCode.loadCatalog returns code rows', async () => {
    http.rowsByTable['_Base_CodeDesign'] = [{rowid: 'C9', AppId: 'APP', CodeName: '批号', createuser: 'U-ROW'}]
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeDataCode.navigationScenarioId, name: 'code', raw: {}})
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
      buildFormalModels({
        _Base_CodeDesign: ['rowid', 'AppId', 'CodeName', 'functiondesc', 'createuser', 'crttime'],
        Base_UserInfo: ['ID', 'ROWID', 'UserName'],
        Base_StructureType: ['rowid', 'Mrowid', 'Name'],
      }).find(m => m.metaName === metaName),
    ))
    const ds = await LowcodeDataCode.loadCatalog(LowcodeDataCode.navigationScenarioId)
    expect(ds.getView(LowcodeDataCode.catalogMetaName, 'default')?.rows[0]).toMatchObject({CodeName: '批号'})
    ds.destroy()
  })

  it('LowcodeLogicView.loadCatalog loads through the formal DataView owner', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeLogicView.navigationScenarioId, name: 'lv', raw: {}})
    const ds = await LowcodeLogicView.loadCatalog(LowcodeLogicView.navigationScenarioId)
    expect(ds.getView(LowcodeLogicView.catalogMetaName, 'default')?.rows[0]).toMatchObject({name: 'A'})
    ds.destroy()
  })
  it('LowcodeWorkflowDefinition.loadCatalog loads through the formal DataView owner', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeWorkflowDefinition.navigationScenarioId, name: 'wf', raw: {}})
    const ds = await LowcodeWorkflowDefinition.loadCatalog(LowcodeWorkflowDefinition.navigationScenarioId)
    expect(ds.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')?.rows[0]).toMatchObject({FlowName: 'B'})
    ds.destroy()
  })

  it('loads JSON catalog models without an AppId output field and keeps X-AppId on the SPARK data request', async () => {
    const navigationScenarioId = 'FFDEF2AED3E19A38C0FCDDC748CF939B'
    http.rowsByTable['Base_JsonData'] = [{rowid: 'J1', name: '样例JSON', updater: 'U-ROW', path: '/sample.json', createuser: 'U-ROW'}]
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: navigationScenarioId, name: 'json', raw: {}})
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
      buildFormalModels({
        Base_JsonData: ['rowid', 'name', 'updater', 'path', 'createuser'],
        Base_UserInfo: ['ID', 'ROWID', 'UserName'],
      }).find(model => model.metaName === metaName),
    ))

    const dataSet = await LowcodeJsonData.loadCatalog(navigationScenarioId)
    const catalog = dataSet.getView(LowcodeJsonData.catalogMetaName, 'default')!
    expect(catalog.rows[0]).toMatchObject({rowid: 'J1', name: '样例JSON', path: '/sample.json'})
    expect(http.requests.some(request => request.headers?.['X-AppId'] === 'APP')).toBe(true)
    expect(http.requests.some(request => JSON.stringify(request.data).includes('AppId'))).toBe(false)
    dataSet.destroy()
  })
})
