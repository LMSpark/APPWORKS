/**
 * @module app:lowcode/resources/database/lowcode-database-directory
 * 职责：按数据库维护页面的正式 DataSet 身份装配服务器与数据库目录 DataView。
 * AI用途：为数据库目录列表提供真实主键、权限、分页、查询与暂存保存链。
 */
import type {DataSet, DataView, SparkNode} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'
import {attachCatalogCommandViews} from './lowcode-database-dataset-extensions'
import {DATABASE_SERVER_TYPE_OPTIONS} from './database-server-catalog-metadata'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'
import {DATABASE_CATALOG_DB_MODEL} from './lowcode-database-table-view'
import {resolveDatabaseCatalogScenarioId} from './database-catalog-scenario'

export const DATABASE_DIRECTORY_COMMAND_INPUT_TABLE = 'DatabaseDirectoryCommandInput'
export const DATABASE_DIRECTORY_UNREGISTERED_DATABASES_TABLE = 'DatabaseDirectoryUnregisteredDatabaseNames'

const DATABASE_DIRECTORY_META_NAMES = [DATABASE_SERVER_MODEL, DATABASE_CATALOG_DB_MODEL] as const

/** 数据库目录公开字段；不自动展示连接账号、密码等未用于列表消费的字段。 */
export const DATABASE_DIRECTORY_LIST_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称'}},
  {type: 'r-text', props: {field: 'ServerName', label: '服务器'}},
  {type: 'r-select', props: {field: 'Type', label: '类型', options: [...DATABASE_SERVER_TYPE_OPTIONS]}},
  {type: 'r-text', props: {field: 'SchemaName', label: 'Schema'}},
  {type: 'r-text', props: {field: 'State', label: '状态'}},
  {type: 'r-text', props: {field: 'Remark', label: '备注'}},
]

/** 单行新增/编辑数据库的可见表单字段，避免自动生成暴露连接账号与密码。 */
export const DATABASE_DIRECTORY_FORM_FIELDS: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '数据库名称'}},
  {type: 'r-select', props: {field: 'Type', label: '类型', options: [...DATABASE_SERVER_TYPE_OPTIONS]}},
  {type: 'r-text', props: {field: 'SchemaName', label: 'Schema'}},
  {type: 'r-text', props: {field: 'Remark', label: '备注'}},
]

function directoryView(model: Awaited<ReturnType<typeof lowcodeApi.dataSpace.design.readModel>>): Record<string, unknown> {
  return {
    autoLoad: false,
    autoCurrentFirst: false,
    autoSelectFirst: false,
    commitMode: 'staged',
    pageSize: 20,
    queryConfig: {allPages: false, autoQuery: true},
    sortExpression: [{field: model.primaryKey, direction: 'asc'}],
  }
}

/** 数据库主列表仅装配本页正式服务器/数据库模型；不扫描其他空间或默认选择服务器。 */
export class LowcodeDatabaseDirectory {
  public static async loadCatalog(dataSpaceIdInput: string): Promise<DataSet> {
    const dataSpaceId = dataSpaceIdInput.trim()
    if (!dataSpaceId) throw new Error('数据库管理页面缺少正式数据空间 ID')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      const current = lowcodeApi.readRequestScope()
      if (current.token !== scope.token || current.headers['X-AppId'] !== scope.headers['X-AppId']) {
        throw new Error('数据库目录请求所属应用或登录身份已变化')
      }
    }
    const exactId = await resolveDatabaseCatalogScenarioId({
      preferredScenarioId: dataSpaceId,
      metaNames: DATABASE_DIRECTORY_META_NAMES,
      assertCurrent,
    })
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: exactId, assertCurrent}
    const [space, server, database] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      lowcodeApi.dataSpace.design.readModel({...input, metaName: DATABASE_SERVER_MODEL}),
      lowcodeApi.dataSpace.design.readModel({...input, metaName: DATABASE_CATALOG_DB_MODEL}),
    ])
    assertCurrent()
    const config = new ScenarioViewConfig(exactId, JSON.stringify({
      scenarioId: exactId,
      tables: {
        [DATABASE_SERVER_MODEL]: {
          modelBinding: {modelId: server.id, modelName: server.metaName},
          views: {default: directoryView(server)},
        },
        [DATABASE_CATALOG_DB_MODEL]: {
          modelBinding: {modelId: database.id, modelName: database.metaName},
          views: {default: directoryView(database)},
        },
      },
      resourceRelations: [],
      viewCascades: [],
    }))
    const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({
      config,
      space,
      models: [server, database],
      relations: [],
    })
    try {
      attachCatalogCommandViews({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        tables: {
          commandInput: DATABASE_DIRECTORY_COMMAND_INPUT_TABLE,
          unregisteredDbNames: DATABASE_DIRECTORY_UNREGISTERED_DATABASES_TABLE,
        },
      })
      const serverView = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
      const databaseView = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
      if (!serverView || !databaseView) throw new Error('数据库目录缺少正式服务器或数据库视图')
      await Promise.all([serverView.refresh(), databaseView.refresh()])
      assertCurrent()
      if (serverView.loadingError) throw serverView.loadingError
      if (databaseView.loadingError) throw databaseView.loadingError
      return dataSet
    } catch (error) {
      dataSet.destroy()
      throw error
    }
  }

  public static requireViews(dataSet: DataSet): Readonly<{servers: DataView; databases: DataView}> {
    const servers = dataSet.getView(DATABASE_SERVER_MODEL, 'default')
    const databases = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    if (!servers || !databases) throw new Error('数据库目录缺少正式视图')
    return {servers, databases}
  }
}
