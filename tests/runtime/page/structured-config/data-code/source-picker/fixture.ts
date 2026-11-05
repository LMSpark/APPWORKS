import {readFile} from 'node:fs/promises'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {buildFormalModels} from '../../catalog/structured-config-catalog.fixture'
export const SOURCE_SCENE = '34BDBE645F461A3D83282A941D6037F4'
export function sourceRecords() {
  return {Base_AppSystemList: [{rowid: 'A1', AppName: '应用一'}, {rowid: 'A2', AppName: '应用二'}],
    Base_AppAndSource_Relation: [{rowid: 'R1', sysid: 'A1', conid: 'D1', conName: '数据库一'}, {rowid: 'R2', sysid: 'A2', conid: 'D2', conName: '数据库二'}],
    _Base_TblList: [{rowid: 'T1', dbid: 'D1', tblname: 'table_one'}, {rowid: 'T3', dbid: 'D1', tblname: 'table_three'}, {rowid: 'T2', dbid: 'D2', tblname: 'table_two'}],
    Base_TblField: [{rowid: 'F1', tblid: 'T1', enname: 'id', cnname: '编号', DataType: 'int', ordIdx: 1}, {rowid: 'F2', tblid: 'T1', enname: 'name', cnname: '名称', DataType: 'varchar', ordIdx: 2},
      {rowid: 'F3', tblid: 'T3', enname: 'code', cnname: '编码'}, {rowid: 'F4', tblid: 'T2', enname: 'other', cnname: '其它'}]}
}
export async function sourceModels() {
  const text = await readFile('config/pages/shared/business-table-selector/pagedata.json', 'utf8'), config = JSON.parse(text)
  const specs = {Base_AppSystemList: ['rowid', 'AppName'], Base_AppAndSource_Relation: ['rowid', 'sysid', 'conid', 'conName'],
    _Base_TblList: ['rowid', 'dbid', 'tblname', 'tbldesc'], Base_TblField: ['rowid', 'tblid', 'enname', 'cnname', 'DataType', 'ordIdx']}
  return buildFormalModels(specs).map(model => ({...model, id: config.tables[model.name].modelBinding.modelId,
    fields: model.fields.map(field => ({...field, output: !(model.name === '_Base_TblList' && field.name === 'dbid')}))}))
}
export async function createSourceDataSet(http: ApiBackend) {
  const text = await readFile('config/pages/shared/business-table-selector/pagedata.json', 'utf8'), models = await sourceModels()
  const api = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const assembly = new LowcodeDataSpaceAssembler(api, http).assemble({config: new ScenarioViewConfig(SOURCE_SCENE, text),
    space: {dataSpaceId: SOURCE_SCENE, name: '引用来源'}, models, relations: []})
  if (assembly.diagnostics.length) throw new Error(assembly.diagnostics.join(';'))
  return assembly.dataSet
}
export async function createSourceFixture() {
  const http = new ApiBackend(); http.records = sourceRecords()
  const dataSet = await createSourceDataSet(http)
  const runtime = new PageRuntime({pageId: 'source-contract', scenarioIds: [SOURCE_SCENE], loadScenario: async () => dataSet})
  await runtime.load(); dataSet.triggerAutoLoad()
  return {dataSet, runtime, http}
}
