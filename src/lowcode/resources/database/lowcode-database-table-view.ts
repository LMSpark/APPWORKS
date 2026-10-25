/**
 * @module app:lowcode/resources/database/lowcode-database-table-view
 * 职责：按正式数据空间 ID（Base_DataSet.rowid = DataSet.scenarioId = x-FormKey）装配库/表/视图目录 DataSet。
 */
import {DataViewFilter, RequestState, type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'
import {DATABASE_SERVER_MODEL} from './lowcode-database-server'
import {
  attachCatalogCommandViews,
  attachTableRegisterCommandView,
  attachTableSyncMetaDataView,
  attachViewRegisterCommandView,
} from './lowcode-database-dataset-extensions'
import {applyDatabaseCatalogFieldMetadata} from './database-catalog-field-metadata'
import {applyDatabaseCatalogObjectDesignMetadata} from './database-catalog-object-design-metadata'
import {attachDatabaseCatalogTablePreviewView, attachDatabaseCatalogViewPreviewView} from './database-catalog-preview-view-ops'
import {type DatabaseCatalogLoadOptions, resolveDatabaseCatalogDataSpaceId} from './database-catalog-scenario'

export const DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL = 'Base_Desensitization_Rule'
export const DATABASE_CATALOG_ENCRYPTION_DICT_MODEL = 'Dict_encryption_rule'
export const DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL = 'TblField_type'
export const DATABASE_CATALOG_RELATION_MODEL = 'Base_TblRln'
export const DATABASE_CATALOG_RELATION_TABLE_VIEW = 'forTable'
export const DATABASE_CATALOG_RELATION_PEER_VIEW = 'relationPeers'
export const DATABASE_CATALOG_RELATION_ENDPOINT_VIEW = 'relationEndpoints'
export const DATABASE_CATALOG_RELATION_FIELD_VIEW = 'relationEndpointFields'
export const DATABASE_CATALOG_TABLE_REGISTER_VERIFY_VIEW = 'registrationVerify'
export const DATABASE_CATALOG_VIEW_REGISTER_VERIFY_VIEW = 'registrationVerify'
export const DATABASE_CATALOG_WORKFLOW_MODEL = 'Base_WorkflowDefinition'
export const DATABASE_CATALOG_WORKFLOW_TABLE_VIEW = 'forTable'
export const DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL = 'workflowStatus'
export const DATABASE_CATALOG_APP_SYSTEM_MODEL = 'Base_AppSystemList'

const CATALOG_TEXT_VALUE_DICT_MODELS = new Set<string>([
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
  DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL,
])

/** 表和视图目录的可选功能扩展模型；单独读取，不参与四个核心模型的身份核验。 */
export const DATABASE_CATALOG_OPTION_META_NAMES = [
  DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL,
  DATABASE_CATALOG_ENCRYPTION_DICT_MODEL,
  DATABASE_CATALOG_FIELD_TYPE_DICT_MODEL,
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_STATUS_DICT_MODEL,
  DATABASE_CATALOG_APP_SYSTEM_MODEL,
] as const

export const DATABASE_CATALOG_COMMAND_INPUT_TABLE = 'DatabaseCatalogCommandInput'
export const DATABASE_UNREGISTERED_TABLE_NAMES_TABLE = 'DatabaseUnregisteredTables'
export const DATABASE_UNREGISTERED_VIEW_NAMES_TABLE = 'DatabaseUnregisteredViews'
export const DATABASE_TABLE_SYNC_META_TABLE = 'DatabaseTableSyncMetaData'
export const DATABASE_TABLE_REGISTER_TABLE = 'DatabaseTableRegister'
export const DATABASE_VIEW_REGISTER_TABLE = 'DatabaseViewRegister'

export const DATABASE_CATALOG_DB_MODEL = '_base_dbInfo'
export {DATABASE_SERVER_MODEL as DATABASE_CATALOG_SERVER_MODEL}
export const DATABASE_CATALOG_TABLE_MODEL = '_Base_TblList'
export const DATABASE_CATALOG_VIEW_MODEL = '_Base_ViewList'
export const DATABASE_CATALOG_FIELD_MODEL = 'Base_TblField'
export const DATABASE_CATALOG_FIELD_TABLE_VIEW = 'tableFields'
export const DATABASE_CATALOG_FIELD_VIEW_VIEW = 'viewFields'

export const DATABASE_CATALOG_SCENARIO_META_NAMES = [
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
] as const

const catalogModels = DATABASE_CATALOG_SCENARIO_META_NAMES

function defaultView(model: Awaited<ReturnType<typeof lowcodeApi.dataSpace.design.readModel>>): Record<string, unknown> {
  return {
    autoLoad: false,
    autoCurrentFirst: false,
    autoSelectFirst: false,
    ...(model.metaName === DATABASE_CATALOG_DB_MODEL ? {selectionDelimiter: ''} : {}),
    commitMode: 'staged',
    pageSize: 20,
    queryConfig: {allPages: false, ...(model.metaName === DATABASE_CATALOG_DB_MODEL ? {autoQuery: true} : {})},
    sortExpression: [{field: model.primaryKey, direction: 'asc'}],
  }
}

/** 库→表/视图只读专题：装配 DataSet 并 bind runtime query owner；页面只消费 spark-data。 */
export class LowcodeDatabaseTableView {
  public static async loadCatalog(scenarioId: string, options: DatabaseCatalogLoadOptions = {}): Promise<DataSet> {
    if (!scenarioId.trim()) throw new Error('表和视图管理入口缺少导航绑定的数据空间 ID（Base_DataSet.rowid）')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      const current = lowcodeApi.readRequestScope()
      if (current.token !== scope.token || current.headers['X-AppId'] !== scope.headers['X-AppId']) {
        throw new Error('表和视图目录请求所属应用或登录身份已变化')
      }
    }
    const dataSpaceId = await resolveDatabaseCatalogDataSpaceId({preferredScenarioId: scenarioId, metaNames: catalogModels, options, assertCurrent})
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId, assertCurrent}
    const [space, ...models] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      ...catalogModels.map(metaName => lowcodeApi.dataSpace.design.readModel({...input, metaName})),
    ])
    assertCurrent()
    const byName = new Map(models.map(model => [model.metaName, model]))
    for (const name of catalogModels) {
      if (!byName.has(name)) throw new Error(`表和视图目录缺少正式模型: ${name}`)
    }
    const optionModels: Array<Awaited<ReturnType<typeof lowcodeApi.dataSpace.design.readModel>>> = []
    for (const metaName of DATABASE_CATALOG_OPTION_META_NAMES) {
      try {
        optionModels.push(await lowcodeApi.dataSpace.design.readModel({...input, metaName}))
      } catch {
        // 未登记脱敏规则模型时仍装配核心目录模型；字段网格降级为只读 DesenID 列。
      }
    }
    assertCurrent()
    const assemblyModelNames = [...catalogModels, ...optionModels.map(model => model.metaName)]
    for (const model of optionModels) byName.set(model.metaName, model)
    const fieldModel = byName.get(DATABASE_CATALOG_FIELD_MODEL)
    if (!fieldModel) throw new Error('目录字段模型未装配')
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
      {
        kind: 'query',
        cascadeId: 'table-fields',
        parentTable: DATABASE_CATALOG_TABLE_MODEL,
        parentViewId: 'default',
        childTable: DATABASE_CATALOG_FIELD_MODEL,
        childViewId: DATABASE_CATALOG_FIELD_TABLE_VIEW,
        autoLoad: false,
        filterBindings: [{targetField: 'tblid'}],
      },
      {
        kind: 'query',
        cascadeId: 'view-fields',
        parentTable: DATABASE_CATALOG_VIEW_MODEL,
        parentViewId: 'default',
        childTable: DATABASE_CATALOG_FIELD_MODEL,
        childViewId: DATABASE_CATALOG_FIELD_VIEW_VIEW,
        autoLoad: false,
        filterBindings: [{targetField: 'tblid'}],
      },
    ]
    const outputFields = DataSpaceDesignApi.resolveOutputFields(fieldModel)
    const outputFieldNames = new Set(outputFields.map(field => field.canonicalName))
    const ordinalSortField = outputFields.find(field => field.name === 'ordIdx')?.canonicalName
    const fieldSort = [
      ...(ordinalSortField ? [{field: ordinalSortField, direction: 'asc'}] : []),
      ...(outputFieldNames.has(fieldModel.primaryKey) ? [{field: fieldModel.primaryKey, direction: 'asc'}] : []),
    ]
    const config = new ScenarioViewConfig(dataSpaceId, JSON.stringify({
      scenarioId: dataSpaceId,
      tables: Object.fromEntries(assemblyModelNames.map(name => {
        const model = byName.get(name)
        if (!model) throw new Error(`目录模型 ${name} 未装配`)
        if (name === DATABASE_CATALOG_FIELD_MODEL) {
          const fieldView = defaultView(model)
          fieldView['sortExpression'] = fieldSort
          const relationFieldsView = defaultView(model)
          relationFieldsView['pageSize'] = 100
          relationFieldsView['queryConfig'] = {allPages: true}
          relationFieldsView['sortExpression'] = fieldSort
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {
            default: {...fieldView},
            [DATABASE_CATALOG_FIELD_TABLE_VIEW]: {...fieldView},
            [DATABASE_CATALOG_FIELD_VIEW_VIEW]: {...fieldView},
            [DATABASE_CATALOG_RELATION_FIELD_VIEW]: {...relationFieldsView},
          }}]
        }
        if (name === DATABASE_CATALOG_TABLE_MODEL) {
          const tableView = defaultView(model)
          const relationPeersView = defaultView(model)
          const relationEndpointsView = defaultView(model)
          const registrationVerifyView = defaultView(model)
          registrationVerifyView['pageSize'] = 2
          registrationVerifyView['queryConfig'] = {allPages: false}
          registrationVerifyView['autoLoad'] = false
          relationPeersView['valueField'] = 'rowid'
          relationPeersView['labelField'] = 'tblname'
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {
            default: {...tableView},
            [DATABASE_CATALOG_TABLE_REGISTER_VERIFY_VIEW]: {...registrationVerifyView},
            [DATABASE_CATALOG_RELATION_PEER_VIEW]: {...relationPeersView},
            [DATABASE_CATALOG_RELATION_ENDPOINT_VIEW]: {...relationEndpointsView},
          }}]
        }
        if (name === DATABASE_CATALOG_VIEW_MODEL) {
          const catalogView = defaultView(model)
          const registrationVerifyView = defaultView(model)
          registrationVerifyView['pageSize'] = 2
          registrationVerifyView['queryConfig'] = {allPages: false}
          registrationVerifyView['autoLoad'] = false
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {
            default: {...catalogView},
            [DATABASE_CATALOG_VIEW_REGISTER_VERIFY_VIEW]: {...registrationVerifyView},
          }}]
        }
        if (name === DATABASE_CATALOG_RELATION_MODEL) {
          const relationView = defaultView(model)
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {
            default: {...relationView},
            [DATABASE_CATALOG_RELATION_TABLE_VIEW]: {...relationView},
          }}]
        }
        if (name === DATABASE_CATALOG_WORKFLOW_MODEL) {
          const workflowView = defaultView(model)
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {
            default: {...workflowView},
            [DATABASE_CATALOG_WORKFLOW_TABLE_VIEW]: {...workflowView},
          }}]
        }
        if (name === DATABASE_CATALOG_DESENSITIZATION_RULE_MODEL) {
          const rulesView = defaultView(model)
          rulesView['autoLoad'] = true
          rulesView['valueField'] = 'rowid'
          rulesView['labelField'] = 'name'
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: rulesView}}]
        }
        if (CATALOG_TEXT_VALUE_DICT_MODELS.has(name)) {
          const dictView = defaultView(model)
          dictView['autoLoad'] = true
          dictView['valueField'] = 'val'
          dictView['labelField'] = 'txt'
          dictView['sortExpression'] = [{field: 'ordIdx', direction: 'asc'}, {field: model.primaryKey, direction: 'asc'}]
          return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: dictView}}]
        }
        return [name, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: defaultView(model)}}]
      })),
      resourceRelations: [],
      viewCascades,
    }))
    const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({
      config,
      space,
      models: [...models, ...optionModels],
      relations: [],
    })
    try {
      attachCatalogCommandViews({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        tables: {
          commandInput: DATABASE_CATALOG_COMMAND_INPUT_TABLE,
          unregisteredTableNames: DATABASE_UNREGISTERED_TABLE_NAMES_TABLE,
          unregisteredViewNames: DATABASE_UNREGISTERED_VIEW_NAMES_TABLE,
        },
      })
      attachTableSyncMetaDataView({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        sync: DATABASE_TABLE_SYNC_META_TABLE,
        fieldModel: DATABASE_CATALOG_FIELD_MODEL,
        fieldTableView: DATABASE_CATALOG_FIELD_TABLE_VIEW,
        tableCatalogModel: DATABASE_CATALOG_TABLE_MODEL,
      })
      attachTableRegisterCommandView({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        register: DATABASE_TABLE_REGISTER_TABLE,
        catalogModel: DATABASE_CATALOG_TABLE_MODEL,
      })
      attachViewRegisterCommandView({
        dataSet,
        http: lowcodeHttp,
        assertScope: assertCurrent,
        register: DATABASE_VIEW_REGISTER_TABLE,
        catalogModel: DATABASE_CATALOG_VIEW_MODEL,
      })
      attachDatabaseCatalogTablePreviewView(dataSet, lowcodeHttp, assertCurrent)
      attachDatabaseCatalogViewPreviewView(dataSet, lowcodeHttp, assertCurrent)
      applyDatabaseCatalogFieldMetadata(dataSet)
      applyDatabaseCatalogObjectDesignMetadata(dataSet)
      for (const metaName of DATABASE_CATALOG_OPTION_META_NAMES) {
        if (metaName === DATABASE_CATALOG_RELATION_MODEL) continue
        const optionView = dataSet.getView(metaName, 'default')
        if (optionView?.rows.length === 0 && optionView.requestState !== RequestState.Loaded) {
          await optionView.refresh()
          assertCurrent()
          if (optionView.loadingError) throw optionView.loadingError
        }
      }
      const dbView = dataSet.getView(DATABASE_CATALOG_DB_MODEL, 'default')
      if (!dbView) throw new Error('表和视图目录缺少数据库视图')
      const databaseId = options.databaseId?.trim()
      if (databaseId) {
        dbView.configure({filterExpression: DataViewFilter.condition({
          field: dbView.primaryKey,
          operator: 'eq',
          value: databaseId,
        }).toJSON()})
      }
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
