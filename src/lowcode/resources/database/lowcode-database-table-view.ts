/**
 * @module app:lowcode/resources/database/lowcode-database-table-view
 * 职责：按导航 FormKey 动态装配库/表/视图只读目录 DataSet。
 */
import {type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'

export const DATABASE_CATALOG_DB_MODEL = '_base_dbInfo'
export const DATABASE_CATALOG_TABLE_MODEL = '_Base_TblList'
export const DATABASE_CATALOG_VIEW_MODEL = '_Base_ViewList'

const catalogModels = [DATABASE_CATALOG_DB_MODEL, DATABASE_CATALOG_TABLE_MODEL, DATABASE_CATALOG_VIEW_MODEL] as const

function defaultView(model: Awaited<ReturnType<typeof lowcodeApi.dataSpace.design.readModel>>): Record<string, unknown> {
  return {
    autoLoad: false,
    autoCurrentFirst: false,
    autoSelectFirst: false,
    commitMode: 'staged',
    queryConfig: {allPages: true},
    sortExpression: [{field: model.primaryKey, direction: 'asc'}],
  }
}

/** 库→表/视图只读专题：装配 DataSet 并 bind runtime query owner；页面只消费 spark-data。 */
export class LowcodeDatabaseTableView {
  public static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (!scenarioId.trim()) throw new Error('表和视图管理入口缺少导航绑定的数据空间ID')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      if (lowcodeApi.readRequestScope().token !== scope.token) throw new Error('表和视图目录请求所属应用或登录身份已变化')
    }
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, ...models] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      ...catalogModels.map(metaName => lowcodeApi.dataSpace.design.readModel({...input, metaName})),
    ])
    assertCurrent()
    const byName = new Map(models.map(model => [model.metaName, model]))
    for (const name of catalogModels) {
      if (!byName.has(name)) throw new Error(`表和视图目录缺少正式模型: ${name}`)
    }
    const dbModel = byName.get(DATABASE_CATALOG_DB_MODEL)!
    const viewCascades = [
      {
        kind: 'query',
        cascadeId: 'db-tables',
        parentTable: DATABASE_CATALOG_DB_MODEL,
        parentViewId: 'default',
        childTable: DATABASE_CATALOG_TABLE_MODEL,
        childViewId: 'default',
        autoLoad: false,
        filterBindings: [{targetField: 'dbid'}],
      },
      {
        kind: 'query',
        cascadeId: 'db-views',
        parentTable: DATABASE_CATALOG_DB_MODEL,
        parentViewId: 'default',
        childTable: DATABASE_CATALOG_VIEW_MODEL,
        childViewId: 'default',
        autoLoad: false,
        filterBindings: [{targetField: 'dbid'}],
      },
    ]
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({
      scenarioId,
      tables: Object.fromEntries(catalogModels.map(name => {
        const model = byName.get(name)!
        return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: defaultView(model)}}]
      })),
      resourceRelations: [],
      viewCascades,
    }))
    const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models, relations: []})
    try {
      const dbView = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
      if (!dbView) throw new Error('数据库目录视图缺失')
      await dbView.refresh()
      assertCurrent()
      if (dbView.loadingError) throw dbView.loadingError
      return dataSet
    } catch (error) {
      dataSet.destroy()
      throw error
    }
  }
}
