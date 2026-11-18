import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig, type PageTool} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

const fields = {
  Base_ReportInfo: ['rowid', 'RptName', 'modid', 'modname', 'RptDesc', 'version_id', 'version_dataid', 'CreateTime', 'createuser', 'useStatus'],
  Base_Report: ['rowid', 'RptID', 'Version', 'State', 'isMerg', 'isDashboards', 'DataFormID'],
  Base_AppSystemList: ['rowid', 'AppDesc'],
  Base_DataSet: ['rowid', 'Name', 'createtime'],
  Base_UserInfo: ['ID', 'rowid', 'UserName'],
  功能导航状态字典: ['rowid', 'val', 'txt'],
}

function createReportBackend() {
  const http = new ApiBackend()
  http.records = {
    Base_ReportInfo: [],
    Base_Report: [],
    Base_AppSystemList: [{rowid: 'APP', AppDesc: '应用'}],
    Base_DataSet: [{rowid: 'D1', Name: '模型一', createtime: '2026-01-01'}, {rowid: 'D2', Name: '模型二', createtime: '2026-01-02'}],
  }
  return http
}

export async function createReportRuntime(scenario: string, http = createReportBackend(), tool?: PageTool) {
  const tables = Object.fromEntries(Object.entries(fields).map(([name, names]) => [name, {
    modelBinding: {modelId: `${name}-model`, modelName: name},
    views: {default: {commitMode: 'staged', valueField: 'rowid',
      ...(name === 'Base_AppSystemList' ? {labelField: 'AppDesc'} : {}),
      queryConfig: {fields: names, allPages: true, ...(name === 'Base_ReportInfo' ? {autoQuery: false} : {})}},
      ...(name === 'Base_Report' ? {byReport: {commitMode: 'staged', valueField: 'rowid',
        filterExpression: {field: 'RptID', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'reportId'}},
        queryConfig: {fields: names, allPages: true}}} : {}),
      ...(name === 'Base_DataSet' ? {picker: {queryConfig: {fields: names}}} : {})},
  }]))
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const config = new ScenarioViewConfig(scenario, JSON.stringify({scenarioId: scenario, tables}))
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: scenario, name: 'Report'}, models: buildFormalModels(fields), relations: [],
  }).dataSet
  const runtime = new PageRuntime({...(tool ? {tool} : {pageId: 'report-test'}), scenarioIds: [scenario], loadScenario: async () => dataSet})
  await runtime.load()
  const info = dataSet.getView('Base_ReportInfo')
  const report = dataSet.getView('Base_Report')
  const apps = dataSet.getView('Base_AppSystemList')
  if (!info || !report || !apps) throw new Error('报表测试视图缺失')
  await Promise.all([info.refresh(), report.refresh(), apps.refresh()])
  return {http, dataSet, runtime, info, report, apps}
}

export async function readPersistedReport(scenario: string, http: ApiBackend) {
  const reopened = await createReportRuntime(scenario, http)
  try {
    return {info: reopened.info.readSnapshot(), versions: reopened.report.readSnapshot()}
  } finally {reopened.runtime.dispose()}
}
