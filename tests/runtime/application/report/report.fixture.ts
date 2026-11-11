import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

const fields = {
  Base_ReportInfo: ['rowid', 'RptName', 'modid', 'modname', 'RptDesc', 'version_id'],
  Base_Report: ['rowid', 'RptID', 'Version', 'State', 'isMerg', 'isDashboards'],
  Base_AppSystemList: ['rowid', 'AppDesc'],
}

export async function createReportRuntime(scenario: string) {
  const http = new ApiBackend()
  http.records = {
    Base_ReportInfo: [],
    Base_Report: [],
    Base_AppSystemList: [{rowid: 'APP', AppDesc: '应用'}],
  }
  const tables = Object.fromEntries(Object.entries(fields).map(([name, names]) => [name, {
    modelBinding: {modelId: `${name}-model`, modelName: name},
    views: {default: {commitMode: 'staged', valueField: 'rowid',
      ...(name === 'Base_AppSystemList' ? {labelField: 'AppDesc'} : {}),
      queryConfig: {fields: names, allPages: true}}},
  }]))
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const config = new ScenarioViewConfig(scenario, JSON.stringify({scenarioId: scenario, tables}))
  const dataSet = new LowcodeDataSpaceAssembler(api, http).assemble({
    config, space: {dataSpaceId: scenario, name: 'Report'}, models: buildFormalModels(fields), relations: [],
  }).dataSet
  const runtime = new PageRuntime({pageId: 'report-test', scenarioIds: [scenario], loadScenario: async () => dataSet})
  await runtime.load()
  const info = dataSet.getView('Base_ReportInfo')
  const report = dataSet.getView('Base_Report')
  const apps = dataSet.getView('Base_AppSystemList')
  if (!info || !report || !apps) throw new Error('报表测试视图缺失')
  await Promise.all([info.refresh(), report.refresh(), apps.refresh()])
  return {http, dataSet, runtime, info, report, apps}
}
