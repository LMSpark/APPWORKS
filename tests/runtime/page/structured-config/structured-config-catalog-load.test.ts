import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataCode} from '@/lowcode/resources/data-code/lowcode-data-code'
import {LowcodeLogicView} from '@/lowcode/resources/logic-view/lowcode-logic-view'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/workflow-definition/lowcode-workflow-definition'
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

  it('LowcodeLogicView.loadCatalog scopes by AppId', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeLogicView.navigationScenarioId, name: 'lv', raw: {}})
    const ds = await LowcodeLogicView.loadCatalog(LowcodeLogicView.navigationScenarioId)
    expect(ds.getView(LowcodeLogicView.catalogMetaName, 'default')?.rows[0]).toMatchObject({name: 'A'})
    ds.destroy()
  })
  it('LowcodeWorkflowDefinition.loadCatalog scopes by AppId', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeWorkflowDefinition.navigationScenarioId, name: 'wf', raw: {}})
    const ds = await LowcodeWorkflowDefinition.loadCatalog(LowcodeWorkflowDefinition.navigationScenarioId)
    expect(ds.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')?.rows[0]).toMatchObject({FlowName: 'B'})
    ds.destroy()
  })
})
