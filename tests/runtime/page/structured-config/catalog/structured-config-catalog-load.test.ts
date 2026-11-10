import catalogText from '../../../../../config/pages/structured-config/data-code-catalog/pagedata.json?raw'
import logicCatalog from '../../../../../config/pages/structured-config/logic-view-catalog/pagedata.json'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import {LowcodeLogicView} from '@/lowcode/resources/structured-config/logic-view/resource'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'
import {buildFormalModels, StructuredCatalogHttp} from './structured-config-catalog.fixture'
import {WORKFLOW, topicModels, topicTexts} from './formal-topic.fixture'

const service = vi.hoisted(() => ({readSpaceDefinition: vi.fn(), readModel: vi.fn(), readRequestScope: vi.fn()}))
let http: StructuredCatalogHttp, runtime: DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return http},
  lowcodeDesignFileUpload: async () => {throw new Error('unexpected file upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => id===LowcodeLogicView.navigationScenarioId?JSON.stringify(logicCatalog):topicTexts[id] ?? catalogText}}),
  lowcodeApi: {readRequestScope: service.readRequestScope, dataSpace: {design: {...service, readRelations: async () => [], readModelBatch: async (input: {dataSpaceId: string; metaNames: string[]}) => input.dataSpaceId === WORKFLOW ? topicModels(WORKFLOW) : Promise.all(input.metaNames.map(metaName => service.readModel({...input, metaName})))}, get runtime() {return runtime}}},
}))

beforeEach(() => {
  http = new StructuredCatalogHttp({
    Base_DataViewList: [{rowid: 'V1', sysid: 'APP', name: 'A', createuser: 'U-ROW'}],
    Base_WorkflowDefinition: [{rowid: 'W1', name: 'B', workflow_key: 'B', status: '1'}],
    workflowStatus: [],
    Base_UserInfo: [{ID: 'U-PK', ROWID: 'U-ROW', UserName: '张三'}],
  })
  service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
  service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
    buildFormalModels({
      Base_DataViewList: ['rowid', 'sysid', 'name', 'description', 'createuser', 'createtime'],
      Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
      Base_UserInfo: ['ID', 'ROWID', 'UserName'],
    }).map(model=>{const table=Object.entries(logicCatalog.tables).find(([name])=>name===model.metaName)?.[1];return {...model,id:table&&'modelBinding' in table?table.modelBinding.modelId:model.id}}).find(m => m.metaName === metaName),
  ))
  runtime = new DataSpaceRuntimeApi({http, readScope: service.readRequestScope})
})

describe('structured-config catalog loaders', () => {
  it('LowcodeDataCode.loadCatalog returns code rows', async () => {
    http.rowsByTable['Base_CodeDesign'] = [{rowid: 'C9', AppID: 'TARGET', Name: '批号', createuser: 'U-ROW'}]
    http.rowsByTable['Base_AppSystemList'] = [{rowid: 'TARGET', AppName: '目标应用'}]
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeDataCode.navigationScenarioId, name: 'code', raw: {}})
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
      buildFormalModels({
        Base_CodeDesign: ['rowid', 'AppID', 'Name', 'CodeDescription', 'CodeExample', 'createuser', 'createtime'],
        Base_AppSystemList: ['rowid', 'AppName'],
        Base_UserInfo: ['ID', 'ROWID', 'UserName'],
        Base_StructureType: ['rowid', 'Mrowid', 'Name'],
      }).map(model => ({...model, id: `${LowcodeDataCode.navigationScenarioId}p${({Base_CodeDesign: '000', Base_AppSystemList: '002', Base_UserInfo: '003'} as Record<string, string>)[model.metaName] ?? '001'}`})).find(m => m.metaName === metaName),
    ))
    const ds = await LowcodeDataCode.loadCatalog(LowcodeDataCode.navigationScenarioId)
    ds.triggerAutoLoad()
    const apps = ds.getView('Base_AppSystemList')!
    await vi.waitFor(() => expect(apps.rows.length).toBe(1))
    apps.setSelectedRows([apps.rows[0]!])
    await vi.waitFor(() => expect(ds.getView(LowcodeDataCode.catalogMetaName)!.rows[0]).toMatchObject({Name: '批号', AppID: 'TARGET'}))
    ds.destroy()
  })

  it('LowcodeLogicView.loadCatalog loads through the formal DataView owner', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeLogicView.navigationScenarioId, name: 'lv', raw: {}})
    const ds = await LowcodeLogicView.loadCatalog(LowcodeLogicView.navigationScenarioId)
    expect(ds.getView(LowcodeLogicView.catalogMetaName, 'default')?.rows).toHaveLength(0)
    await ds.getView(LowcodeLogicView.catalogMetaName, 'default')!.refresh()
    expect(ds.getView(LowcodeLogicView.catalogMetaName, 'default')?.rows[0]).toMatchObject({name: 'A'})
    ds.destroy()
  })
  it('LowcodeWorkflowDefinition.loadCatalog loads through the formal DataView owner', async () => {
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: LowcodeWorkflowDefinition.navigationScenarioId, name: 'wf', raw: {}})
    const ds = await LowcodeWorkflowDefinition.loadCatalog(LowcodeWorkflowDefinition.navigationScenarioId)
    ds.triggerAutoLoad()
    await vi.waitFor(() => expect(ds.getView(LowcodeWorkflowDefinition.catalogMetaName, 'default')?.rows[0]).toMatchObject({name: 'B'}))
    ds.destroy()
  })

  it('loads JSON catalog models without an AppId output field and keeps X-AppId on the SPARK data request', async () => {
    const navigationScenarioId = 'FFDEF2AED3E19A38C0FCDDC748CF939B'
    http.rowsByTable['Base_JsonData'] = [{rowid: 'J1', name: '样例JSON', updater: 'U-ROW', path: '/sample.json', createuser: 'U-ROW'}]
    service.readSpaceDefinition.mockResolvedValue({dataSpaceId: navigationScenarioId, name: 'json', raw: {}})
    service.readModel.mockImplementation(({metaName}: {metaName: string}) => Promise.resolve(
      topicModels(navigationScenarioId).find(model => model.metaName === metaName),
    ))

    const dataSet = await LowcodeJsonData.loadCatalog(navigationScenarioId)
    const catalog = dataSet.getView(LowcodeJsonData.catalogMetaName, 'default')!
    dataSet.triggerAutoLoad()
    await vi.waitFor(() => expect(catalog.rows[0]).toMatchObject({rowid: 'J1', name: '样例JSON', path: '/sample.json'}))
    expect(http.requests.some(request => request.headers?.['X-AppId'] === 'APP')).toBe(true)
    expect(http.requests.some(request => JSON.stringify(request.data).includes('AppId'))).toBe(false)
    dataSet.destroy()
  })
})
