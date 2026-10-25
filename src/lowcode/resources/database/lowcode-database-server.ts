/**
 * @module app:lowcode/resources/database/lowcode-database-server
 * 职责：按正式数据空间 ID（Base_DataSet.rowid = DataSet.scenarioId = x-FormKey）装配 Base_serverInfo 目录 DataSet。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'
import {attachServerConnectionTestViews, attachServerRegisterView} from './lowcode-database-dataset-extensions'
import {applyDatabaseServerCatalogMetadata, DATABASE_SERVER_REGISTER_COLUMNS} from './database-server-catalog-metadata'
import {type DatabaseCatalogLoadOptions, resolveDatabaseCatalogDataSpaceId} from './database-catalog-scenario'

export const DATABASE_SERVER_MODEL = 'Base_serverInfo'
export const DATABASE_CONNECTION_TEST_INPUT_TABLE = 'DatabaseConnectionTestInput'
export const DATABASE_CONNECTION_TEST_RESULT_TABLE = 'DatabaseConnectionTestResult'
export const DATABASE_SERVER_REGISTER_TABLE = 'DatabaseServerRegister'

/** 服务器目录专题：装配 DataSet 并 bind runtime query/save owner 到 DataView；页面只消费 spark-data。 */
export class LowcodeDatabaseServer {
  public static async loadCatalog(scenarioId: string, options: DatabaseCatalogLoadOptions = {}): Promise<DataSet> {
    if (!scenarioId.trim()) throw new Error('服务器管理入口缺少导航绑定的数据空间 ID（Base_DataSet.rowid）')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      const current = lowcodeApi.readRequestScope()
      if (current.token !== scope.token || current.headers['X-AppId'] !== scope.headers['X-AppId']) {
        throw new Error('服务器目录请求所属应用或登录身份已变化')
      }
    }
    const dataSpaceId = await resolveDatabaseCatalogDataSpaceId({preferredScenarioId: scenarioId, metaNames: [DATABASE_SERVER_MODEL], options, assertCurrent})
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId, assertCurrent}
    const [space, model] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      lowcodeApi.dataSpace.design.readModel({...input, metaName: DATABASE_SERVER_MODEL}),
    ])
    assertCurrent()
    const config = new ScenarioViewConfig(dataSpaceId, JSON.stringify({
      scenarioId: dataSpaceId,
      tables: {
        [DATABASE_SERVER_MODEL]: {
          modelBinding: {modelId: model.id, modelName: model.metaName},
          views: {default: {
            autoLoad: false,
            autoCurrentFirst: false,
            autoSelectFirst: false,
            commitMode: 'staged',
            queryConfig: {allPages: true},
            sortExpression: [{field: model.primaryKey, direction: 'asc'}],
          }},
        },
      },
      resourceRelations: [],
      viewCascades: [],
    }))
    const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models: [model], relations: []})
    try {
      applyDatabaseServerCatalogMetadata(dataSet)
      attachServerConnectionTestViews({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        tables: {
          commandInput: DATABASE_CONNECTION_TEST_INPUT_TABLE,
          testResult: DATABASE_CONNECTION_TEST_RESULT_TABLE,
        },
      })
      attachServerRegisterView({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        register: DATABASE_SERVER_REGISTER_TABLE,
        catalog: DATABASE_SERVER_MODEL,
        columns: DATABASE_SERVER_REGISTER_COLUMNS,
      })
      const view = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
      if (!view) throw new Error('服务器目录视图缺失')
      await view.refresh()
      assertCurrent()
      if (view.loadingError) throw view.loadingError
      return dataSet
    } catch (error) {
      dataSet.destroy()
      throw error
    }
  }
}
