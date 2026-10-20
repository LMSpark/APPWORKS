/**
 * @module app:lowcode/resources/database/lowcode-database-server
 * 职责：按导航 FormKey 动态装配 Base_serverInfo 目录 DataSet。
 */
import {type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'

export const DATABASE_SERVER_MODEL = 'Base_serverInfo'

/** 服务器目录专题：装配 DataSet 并 bind runtime query/save owner 到 DataView；页面只消费 spark-data。 */
export class LowcodeDatabaseServer {
  public static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (!scenarioId.trim()) throw new Error('服务器管理入口缺少导航绑定的数据空间ID')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      if (lowcodeApi.readRequestScope().token !== scope.token) throw new Error('服务器目录请求所属应用或登录身份已变化')
    }
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, model] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      lowcodeApi.dataSpace.design.readModel({...input, metaName: DATABASE_SERVER_MODEL}),
    ])
    assertCurrent()
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({
      scenarioId,
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
