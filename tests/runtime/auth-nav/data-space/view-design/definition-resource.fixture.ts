import {readFileSync} from 'node:fs'
import {DataSet, type DataView} from '@spark-appworks/spark-data'

/** 测试元数据装配同样读取正式配置声明，不复制一套文件模型字段。 */
export function assembleDefinitionFixtures(dataSet: DataSet, targetId: string,
  executors?: Readonly<Record<string, Parameters<DataView['bindQueryExecutor']>[0]>>): DataSet {
  if (!executors) throw new Error('missing definition resource executors')
  const config = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
  const templates = DataSet.fromJson({scenarioId: dataSet.scenarioId, dataSetName: 'definitions', tables:
    Object.fromEntries(Object.entries(config.tables).filter(([, value]) => (value as {resourceType?: string}).resourceType === 'file'))})
  try {
    for (const definition of Object.values(templates.tables)) {
      const existing = dataSet.getTable(definition.tableName)
      if (existing && existing.resourceType !== 'file') throw new Error('definition table already exists with a different resource')
      const table = existing ?? dataSet.addTable(definition.tableName, definition.columns.filter(column => column.name !== '_pk'))
      table.resourceType = 'file'; table.resourceId = definition.resourceId!
      for (const source of definition.viewList) {
        const view = table.getOrCreateView(source.viewId)
        view.configure({...source.toJson(), queryContext: {...source.queryContext, dataSpaceId: targetId}})
        view.bindQueryExecutor(executors[table.tableName]!, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
      }
    }
  } catch (error) {dataSet.destroy(); throw error} finally {templates.destroy()}
  return dataSet
}

/** 自制数据库夹具补装同一配置中的文件声明；真正的生产加载器自行完成装配。 */
export function withDefinitionResources(load: (id: string, executors?: Readonly<Record<string, Parameters<DataView['bindQueryExecutor']>[0]>>) => Promise<DataSet>) {
  return async (id: string, executors?: Readonly<Record<string, Parameters<DataView['bindQueryExecutor']>[0]>>): Promise<DataSet> =>
    assembleDefinitionFixtures(await load(id, executors), id, executors)
}
