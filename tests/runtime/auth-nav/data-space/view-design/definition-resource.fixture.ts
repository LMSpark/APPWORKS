import {readFileSync} from 'node:fs'
import {DataSet, RequestState, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import type {ViewDesignAssembleInput} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
type DefinitionBindings = Pick<ViewDesignAssembleInput,'fileExecutors'|'projectionBindings'>

/** Return the target model identity from the formal data-space design page config. */
export function formalBaseDataSetModelBinding(): {modelId: string; modelName: string} {
  const config = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
  const binding = config.tables?.Base_DataSet?.modelBinding
  if (typeof binding?.modelId !== 'string' || binding.modelName !== 'Base_DataSet') {
    throw new Error('missing formal Base_DataSet model binding in pagedata')
  }
  return {modelId: binding.modelId, modelName: binding.modelName}
}

/** Formal metadata fixture with a query-authorized target row and optional database tables. */
export function createConfirmedMetadataFixture(targetId: string, tables: Record<string, unknown> = {}, scenarioId = 'META'): DataSet {
  const config = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
  const modelBinding = formalBaseDataSetModelBinding()
  return DataSet.fromJson({scenarioId, dataSetName: 'metadata', tables: {
    Base_DataSet: {modelBinding,
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}],
      views: {default: {autoLoad: false, queryContext: {dataSpaceId: targetId}}}},
    ...tables,
  }})
}

/** 测试元数据装配同样读取正式配置声明，不复制一套文件模型字段。 */
export async function assembleDefinitionFixtures(dataSet: DataSet, targetId: string,
  bindings?: DefinitionBindings): Promise<DataSet> {
  const executors=bindings?.fileExecutors
  if (!executors) throw new Error('missing definition resource executors')
  const config = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
  const baseTable = dataSet.getTable('Base_DataSet'), officialBinding = config.tables.Base_DataSet.modelBinding
  if (!baseTable || baseTable.modelBinding?.modelId !== officialBinding.modelId
    || baseTable.modelBinding?.modelName !== 'Base_DataSet') {
    dataSet.destroy()
    throw new Error('missing formal Base_DataSet fixture binding')
  }
  const target = dataSet.getView('Base_DataSet', 'default')
  if (!target) {dataSet.destroy(); throw new Error('missing formal Base_DataSet fixture view')}
  if (target.queryContext['dataSpaceId'] !== targetId) {
    target.configure({queryContext: {...target.queryContext, dataSpaceId: targetId}})
  }
  if (target.requestState !== RequestState.Loaded) {
    target.bindQueryExecutor({executeQuery: async () => ({rows: [{rowid: targetId}], total: 1,
      rowKey: row => String(row['rowid']),
      assertIdentity: identity => {if (identity.scenarioId !== dataSet.scenarioId || identity.metaName !== 'Base_DataSet') throw new Error('formal Base_DataSet fixture identity mismatch')},
      fieldAccess: (_key, field) => ({read: field === 'rowid' ? 'visible' : 'invisible', write: 'denied',
        component: field === 'rowid' ? 'readonly' : 'hidden', required: false, writeMode: 'readonly'}),
      readFieldAccess: (_row, field) => field === 'rowid' ? 'visible' : 'invisible',
      addActionState: () => 'disabled', editActionState: () => 'disabled', deleteActionState: () => 'disabled',
      createChildActionState: () => 'disabled', viewActionState: () => 'enabled',
    })})
    await target.requestData()
    if (target.loadingError) {const error = target.loadingError; dataSet.destroy(); throw error}
  }
  const templates = DataSet.fromJson({scenarioId: dataSet.scenarioId, dataSetName: 'definitions', tables:
    Object.fromEntries(Object.entries(config.tables).filter(([, value]) => ['file','logical-view'].includes((value as {resourceType?: string}).resourceType??'')))})
  try {
    for (const definition of Object.values(templates.tables)) {
      const resourceType=definition.resourceType
      if(resourceType!=='file'&&resourceType!=='logical-view')throw new Error('invalid definition fixture resource')
      const existing = dataSet.getTable(definition.tableName)
      if (existing && existing.resourceType !== definition.resourceType) throw new Error('definition table already exists with a different resource')
      const table = existing ?? dataSet.addTable(definition.tableName, definition.columns.filter(column => column.name !== '_pk'))
      table.resourceType = resourceType; table.resourceId = definition.resourceId!
      for (const source of definition.viewList) {
        const view = table.getOrCreateView(source.viewId)
        view.configure({...source.toJson(), queryContext: table.resourceType==='file'?{...source.queryContext, dataSpaceId: targetId}:source.queryContext})
        if(table.resourceType==='logical-view'){
          const factory=bindings?.projectionBindings?.[table.tableName]
          if(!factory)throw new Error('missing projection fixture binding')
          bindDataSetReadonlyCommandQuery(view,factory(view))
        }else view.bindQueryExecutor(executors[table.tableName]!, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
      }
    }
  } catch (error) {dataSet.destroy(); throw error} finally {templates.destroy()}
  return dataSet
}

/** 自制数据库夹具补装同一配置中的文件声明；真正的生产加载器自行完成装配。 */
export function withDefinitionResources(load: (id: string, bindings?: DefinitionBindings) => Promise<DataSet>) {
  return async (id: string, bindings?: DefinitionBindings): Promise<DataSet> =>
    await assembleDefinitionFixtures(await load(id, bindings), id, bindings)
}
