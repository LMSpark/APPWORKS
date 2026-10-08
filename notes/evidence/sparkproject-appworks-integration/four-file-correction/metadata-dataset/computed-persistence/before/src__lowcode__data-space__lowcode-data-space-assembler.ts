/**
 * @module app:lowcode/data-space/lowcode-data-space-assembler
 * 职责：将单场景视图配置与正式模型、关系装配为独立 DataSet。边界：场景文件不覆盖模型字段，每个命名视图绑定既有 query/save owner；AI 可用此入口装配 PageRuntime 的场景空间。
 */
import { DataSpaceDesignApi, type DataSpaceRuntimeApi } from '@spark-appworks/spark-lowcode-api'
import { DataSet, type DataColumn } from '@spark-appworks/spark-data'
import { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { isRecord, type HttpClientBase } from '@spark-appworks/spark-utils'
import { LowcodeModelRelationAdapter } from './lowcode-model-relation-adapter'

/** readModel 返回的正式模型定义，持有模型身份及规范输出字段。 */
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
/** 装配输入：同场景视图配置与后端正式模型、关系，不从物理资源猜定义。 */
export type LowcodeDataSpaceAssemblerInput = Readonly<{
 config: ScenarioViewConfig
 models: readonly FormalModel[]
 relations: Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>
}>
/** 独立场景运行空间及无法解析结构关系的诊断；空间生命周期归调用方。 */
export type LowcodeDataSpaceAssembly = Readonly<{ dataSet: DataSet; diagnostics: readonly string[] }>

function record(value: unknown, path: string): Record<string, unknown> {
 if (!isRecord(value)) throw new Error(`${path} 必须是对象`)
 return value
}
function columns(model: FormalModel, configured: unknown, tableName: string): DataColumn[] {
 const outputs = DataSpaceDesignApi.resolveOutputFields(model)
 const names = new Set<string>()
 for (const field of outputs) {
  if (names.has(field.canonicalName)) throw new Error(`${tableName} 正式输出字段名重复: ${field.canonicalName}`)
  names.add(field.canonicalName)
 }
 const rules = new Map<string, Record<string, unknown>>()
 if (configured !== undefined) {
  if (!Array.isArray(configured)) throw new Error(`${tableName}.columns 必须是数组`)
  for (const input of configured) {
   const rule = record(input, `${tableName}.columns`)
   const fieldName = rule['name']
   if (typeof fieldName !== 'string' || !names.has(fieldName) || rules.has(fieldName)) {
    throw new Error(`${tableName}.columns 未解析到唯一正式输出字段: ${String(fieldName)}`)
   }
   rules.set(fieldName, rule)
  }
 }
 return outputs.map(field => {
  const rule = rules.get(field.canonicalName)
  const validation = rule ? Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'name')) : {}
  return { name: field.canonicalName, type: field.type || 'string', label: field.description || field.canonicalName,
   isPrimaryKey: field.canonicalName === model.primaryKey, ...validation }
 })
}

function validateProjection(view: Record<string, unknown>, model: FormalModel, path: string): void {
 const projection = view['fieldProjection']
 if (projection === undefined) return
 if (!Array.isArray(projection) || projection.length === 0) throw new Error(`${path} 正式模型输出投影必须是非空数组`)
 const seen = new Set<string>()
 for (const input of projection) {
  const field = record(input, `${path}.fieldProjection`)
  const matches = model.fields.filter(candidate => candidate.id === field['fieldId'] && candidate.output)
  const formal = matches[0]
  if (!formal || matches.length !== 1 || formal.canonicalName !== field['resourceField'] || formal.canonicalName !== field['viewField']
    || formal.primaryKey !== field['primaryKey'] || (formal.type || 'string') !== field['type']
    || field['expression'] !== '' || field['valueFunction'] !== '' || field['value'] !== ''
    || field['group'] !== 0 || field['distinct'] !== false || seen.has(formal.canonicalName)) {
   throw new Error(`${path} 投影不得覆盖正式模型字段身份或计算定义`)
  }
  seen.add(formal.canonicalName)
 }
}

/** 正式模型负责字段定义；场景文件只配置稳定表名和视图。 */
export class LowcodeDataSpaceAssembler {
 /** 注入已有模型查询保存 owner 和共享请求客户端；装配器不创建应用或租户 scope。 */
 public constructor(private readonly runtime: DataSpaceRuntimeApi, private readonly http: HttpClientBase) {}
 /** 模型关系只生成结构映射；只有场景明确配置 viewCascades 才装配前端输入级联。 */
 public assemble(input: LowcodeDataSpaceAssemblerInput): LowcodeDataSpaceAssembly {
  if (!(input.config instanceof ScenarioViewConfig)) throw new Error('SCENARIO_VIEW_CONFIG_INSTANCE: 必须使用已校验的场景配置')
  const config = input.config.toJSON()
  const tables: Record<string, unknown> = {}
  const bindings = new Map<string, FormalModel>()
  for (const [tableName, value] of Object.entries(record(config['tables'], 'tables'))) {
   const table = record(value, tableName)
   const binding = record(table['modelBinding'], `${tableName}.modelBinding`)
   const matches = input.models.filter(model => model.id === binding['modelId'] && model.metaName === binding['modelName'])
   const model = matches[0]
   if (!model || matches.length !== 1) throw new Error(`场景表 ${tableName} 未解析到唯一正式模型`)
   bindings.set(tableName, model)
   const views: Record<string, unknown> = {}
   for (const [viewId, viewInput] of Object.entries(record(table['views'], `${tableName}.views`))) {
    const view = record(viewInput, `${tableName}@${viewId}`)
    validateProjection(view, model, `${tableName}@${viewId}`)
    views[viewId] = { page: 1, pageSize: 20, ...view }
   }
   tables[tableName] = { tableName, modelBinding: {modelId: model.id, modelName: model.metaName}, columns: columns(model, table['columns'], tableName), views }
  }
  const relations = new LowcodeModelRelationAdapter().adapt(input.relations, bindings)
  const explicit = config['viewCascades']
  const dataSet = DataSet.fromJson({ scenarioId: input.config.scenarioId, dataSetName: input.config.scenarioId, tables,
   resourceRelations: relations.resourceRelations,
   viewCascades: explicit === undefined ? [] : explicit })
  try {
   dataSet.setSharedHttpClient(this.http)
   for (const [tableName, model] of bindings) {
    const table = dataSet.getTable(tableName)
    if (!table) throw new Error(`场景表缺失: ${tableName}`)
    table.forEachView(view => { view.primaryKey = model.primaryKey; this.runtime.bindModelView(view, model) })
   }
   return {dataSet, diagnostics: relations.diagnostics}
  } catch (error) { dataSet.destroy(); throw error }
 }
}
