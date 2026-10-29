/**
 * @module app:lowcode/data-space/lowcode-data-space-assembler
 * 职责：将单场景视图配置与正式模型、关系装配为独立 DataSet。边界：场景文件不覆盖模型字段，每个命名视图绑定既有 query/save owner；AI 可用此入口装配 PageRuntime 的场景空间。
 */
import { DataSpaceDesignApi, LOWCODE_APPLICATION_CATALOG_FORM_KEY, type DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import { DataSet, DataViewQuery, type DataResourceRelation, type DataView, type DataViewFilterTree } from '@spark-appworks/spark-data'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import { LowcodeModelRelationAdapter } from './lowcode-model-relation-adapter'
import { LowcodeDataSpaceViewFields } from './view-design/lowcode-data-space-view-fields'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'

/** readModel 返回的正式模型定义，持有模型身份及规范输出字段。 */
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalSpace = Readonly<{dataSpaceId: string; name: string}>
/** 装配输入：同场景视图配置与后端正式模型、关系，不从物理资源猜定义。 */
export type LowcodeDataSpaceAssemblerInput = Readonly<{
 config: ScenarioViewConfig
 space: FormalSpace
 models: readonly FormalModel[]
 relations: Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>
 /** 显式文件表的既有资源owner，按配置表键注入；缺失即拒绝装配，不生成权限或另选HTTP接口。 */
 fileExecutors?: Readonly<Record<string, Parameters<DataView['bindQueryExecutor']>[0]>>
}>
/** 独立场景运行空间及无法解析结构关系的诊断；空间生命周期归调用方。 */
export type LowcodeDataSpaceAssembly = Readonly<{ dataSet: DataSet; diagnostics: readonly string[] }>

function record(value: unknown, path: string): Record<string, unknown> {
 if (!isRecord(value)) throw new Error(`${path} 必须是对象`)
 return value
}

function validateRemoteReferences(view: Record<string, unknown>, localNames: ReadonlySet<string>, path: string): void {
 const check = (field: unknown, source: string): void => {
  if (typeof field === 'string' && localNames.has(field)) throw new Error(`${path}.${source} 本地计算列不能用于远端查询: ${field}`)
 }
 const sort = view['sortExpression']
 if (Array.isArray(sort)) for (const entry of sort) check(record(entry, `${path}.sortExpression`)['field'], 'sortExpression')
 const filter = view['filterExpression']
 if (filter !== undefined) {
  const walk = (node: Record<string, unknown>): void => {
   if (Array.isArray(node['filters'])) node['filters'].forEach(child => walk(record(child, `${path}.filterExpression`)))
   else check(node['field'], 'filterExpression')
  }
  walk(record(filter, `${path}.filterExpression`))
 }
 const tree = view['treeConfig']
 if (tree !== undefined) for (const key of ['idField', 'parentIdField']) {
  check(record(tree, `${path}.treeConfig`)[key], `treeConfig.${key}`)
 }
}


/** 校验文件原生关系中的明确字段引用；不解析不透明表达式，也不改写旧来源关系。 */
function validateRelationFields(relation: DataResourceRelation, dataSet: DataSet): void {
 const field = (input: unknown, defaultTable: string, fixedTable = false): void => {
  if (typeof input !== 'string' || !input) throw new Error(`resourceRelations ${relation.relationId} 字段引用无效`)
  const separator = input.lastIndexOf('.')
  const tableName = separator < 0 ? defaultTable : input.slice(0, separator)
  const fieldName = separator < 0 ? input : input.slice(separator + 1)
  if ((fixedTable && tableName !== defaultTable)
   || !dataSet.getTable(tableName)?.columns.some(column => column.name === fieldName)) {
   throw new Error(`resourceRelations ${relation.relationId} 字段引用不存在或端点不匹配: ${tableName}.${fieldName}`)
  }
 }
 const walk = (node: DataViewFilterTree): void => {
  if ('logic' in node) { node.filters.forEach(walk); return }
  field(node.field, relation.childTable, true)
  const value = node.value
  if (!isRecord(value)) return
  if (value['Type'] === 'GetTableField') field(value['Field'], relation.parentTable, true)
  const checkTableFields = (tableKey: string, fields: readonly string[]): void => {
   const tableName = value[tableKey]
   if (typeof tableName !== 'string' || !dataSet.getTable(tableName)) {
    throw new Error(`resourceRelations ${relation.relationId} 表引用不存在: ${String(tableName)}`)
   }
   for (const key of fields) field(value[key], tableName, true)
  }
  if (value['Type'] === 'GetRefData') checkTableFields('RefTableName', ['RefFieldName', 'FkFieldName'])
  if (value['Type'] === 'GetGroupData') checkTableFields('GroupTableName', ['GroupField', 'Field'])
  if (value['Type'] === 'GetExpData') checkTableFields('refTableName', [])
 }
 walk(relation.filterExpression)
}

/** 后端模型提供正式字段，显式文件表使用配置列及注入的资源owner；两者装配到同一DataSet。 */
export class LowcodeDataSpaceAssembler {
 /** 注入已有模型查询保存 owner 和共享请求客户端；装配器不创建应用或租户 scope。 */
 public constructor(private readonly runtime: DataSpaceRuntimeApi, private readonly http: HttpClientBase) {}
 /** 模型关系只生成结构映射；只有场景明确配置 viewCascades 才装配前端输入级联。 */
 public assemble(input: LowcodeDataSpaceAssemblerInput): LowcodeDataSpaceAssembly {
  if (!(input.config instanceof ScenarioViewConfig)) throw new Error('SCENARIO_VIEW_CONFIG_INSTANCE: 必须使用已校验的场景配置')
  if (input.space.dataSpaceId !== input.config.scenarioId || typeof input.space.name !== 'string'
   || !input.space.name.trim()) throw new Error('SCENARIO_SPACE_DEFINITION: 正式空间身份或名称无效')
  const config = input.config.toJSON()
  const tables: Record<string, unknown> = {}
  const bindings = new Map<string, FormalModel>()
  for (const [tableName, value] of Object.entries(record(config['tables'], 'tables'))) {
   const table = record(value, tableName)
   if (table['resourceType'] === 'file') {
    const executor = input.fileExecutors && Object.hasOwn(input.fileExecutors, tableName) ? input.fileExecutors[tableName] : undefined
    const deferredToolFile = input.config.scenarioId === LOWCODE_APPLICATION_CATALOG_FORM_KEY
     && tableName === 'ProjectToolFile' && table['resourceId'] === 'project:tool-file'
    if ((!executor || typeof executor.executeQuery !== 'function') && !deferredToolFile) throw new Error(`SCENARIO_FILE_OWNER: ${tableName} 缺少文件查询owner`)
    tables[tableName] = {tableName, ...structuredClone(table)}
    continue
   }
   const binding = record(table['modelBinding'], `${tableName}.modelBinding`)
   const matches = input.models.filter(model => model.id === binding['modelId'] && model.metaName === binding['modelName'])
   const model = matches[0]
   if (!model || matches.length !== 1) throw new Error(`场景表 ${tableName} 未解析到唯一正式模型`)
   const resource = DataSpaceDesignApi.resolveTableResource(model)
   bindings.set(tableName, model)
   const tableColumns = LowcodeDataSpaceViewFields.columns(model, table['columns'], tableName)
   const views: Record<string, unknown> = {}
   for (const [viewId, viewInput] of Object.entries(record(table['views'], `${tableName}.views`))) {
    const view = record(viewInput, `${tableName}@${viewId}`)
    LowcodeDataSpaceViewFields.validateProjection(view, model, `${tableName}@${viewId}`)
    views[viewId] = { page: 1, pageSize: 20, fieldProjection: DataSpaceDesignApi.createFieldProjection(model), ...view }
   }
   tables[tableName] = { tableName, ...resource, modelBinding: {modelId: model.id, modelName: model.metaName},
    ...('api' in table ? {api: structuredClone(table['api'])} : {}),
    ...('crudConfig' in table ? {crudConfig: structuredClone(table['crudConfig'])} : {}),
    ...('businessCategory' in table ? {businessCategory: table['businessCategory']} : {}), columns: tableColumns, views }
  }
  const relations = input.config.usesNativeResourceRelations ? {resourceRelations: [], diagnostics: []}
   : new LowcodeModelRelationAdapter().adapt(input.relations, bindings)
  const explicit = config['viewCascades']
  const dataSet = DataSet.fromJson({ scenarioId: input.config.scenarioId, dataSetName: input.space.name, tables,
   resourceRelations: input.config.resolveResourceRelations(relations.resourceRelations),
   viewCascades: explicit === undefined ? [] : explicit,
   ...('schemaVersion' in config ? {schemaVersion: config['schemaVersion']} : {}),
   ...('version' in config ? {version: config['version']} : {}),
   ...('saveChanges' in config ? {saveChanges: structuredClone(config['saveChanges'])} : {}),
   ...('layout' in config ? {layout: structuredClone(config['layout'])} : {}) })
  try {
   for (const relation of dataSet.resourceRelations ?? []) {
    if (input.config.usesNativeResourceRelations || relation.sourceRelationId === undefined) validateRelationFields(relation, dataSet)
   }
   dataSet.setSharedHttpClient(this.http)
   for (const table of Object.values(dataSet.tables)) {
    if (table.resourceType !== 'file' || table.modelBinding) continue
    const resourceId = table.resourceId, executor = input.fileExecutors?.[table.tableName]
    const deferredToolFile = input.config.scenarioId === LOWCODE_APPLICATION_CATALOG_FORM_KEY
     && table.tableName === 'ProjectToolFile' && resourceId === 'project:tool-file'
    if (!resourceId || !executor && !deferredToolFile) throw new Error(`SCENARIO_FILE_OWNER: ${table.tableName} 文件身份不完整`)
    table.forEachView(view => {
     DataViewQuery.validateFields(view.queryConfig, new Set(table.columns.filter(column => !column.computeExpression && column.name !== '_pk').map(column => column.name)))
     LowcodeDataSpaceViewFields.validateSelection({...view.toJson()}, new Set(view.columns.filter(column => column.name !== '_pk').map(column => column.name)))
     if (executor) view.bindQueryExecutor(executor, {resource: {resourceType: 'file', resourceId}})
    })
   }
   for (const [tableName, model] of bindings) {
    const table = dataSet.getTable(tableName)
    if (!table) throw new Error(`场景表缺失: ${tableName}`)
    let arrayRows: Array<Record<string, unknown>> | undefined
    if (model.sourceType === '数组') {
     const raw = model.raw['items']
     if (typeof raw !== 'string') throw new Error(`数组 ${model.metaName} 缺少可读取的items文本`)
     const rows = parseJsonDocument(raw)
     if (!Array.isArray(rows) || !rows.every(isRecord)) throw new Error(`数组 ${model.metaName} 的items必须是对象数组`)
     const outputs = DataSpaceDesignApi.resolveOutputFields(model)
     arrayRows = rows.map(row => {
      if (!isRecord(row)) throw new Error(`数组 ${model.metaName} 的items包含非对象`)
      return Object.fromEntries(outputs.filter(field => Object.hasOwn(row, field.name)).map(field => [field.canonicalName, row[field.name]]))
     })
    }
    table.forEachView(view => {
     view.primaryKey = model.primaryKey
     const outputNames = new Set(DataSpaceDesignApi.resolveOutputFields(model).map(field => field.canonicalName))
     // 装配后还包含框架注入的计算列（如_pk）；不能只校验文件声明的本地计算列。
     validateRemoteReferences({...view.toJson()}, new Set(table.columns
      .filter(column => column.isComputed === true || Boolean(column.computeExpression)).map(column => column.name)), `${tableName}@${view.viewId}`)
     LowcodeDataSpaceViewFields.validateReferences({...view.toJson()},
      outputNames,
      new Set(table.columns.filter(column => Boolean(column.computeExpression) && column.name !== '_pk').map(column => column.name)))
     LowcodeDataSpaceViewFields.validateSelection({...view.toJson()},
      new Set(LowcodeDataSpaceViewFields.selectionColumns(view, outputNames).map(column => column.name)))
     this.runtime.bindModelView(view, model, arrayRows)
    })
   }
   return {dataSet, diagnostics: relations.diagnostics}
  } catch (error) { dataSet.destroy(); throw error }
 }
}
