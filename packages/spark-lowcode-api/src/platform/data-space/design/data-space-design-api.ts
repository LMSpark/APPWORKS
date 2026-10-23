/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/design/data-space-design-api
 * 职责：读取场景正式模型与关系，提供元数据的纯解析和投影。
 * 边界：活动设计读取使用原元数据DataView，初始化读取复用runtime query；不执行设计写入。
 * AI用途：装配场景视图或创建草稿时核对真实模型 Name、输出字段和关系归属。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import { DataViewFilter, type DataSet, type DataView, type DataViewFieldProjection, type TableResourceType } from '@spark-appworks/spark-data'
import type { DataSpaceRuntimeApi } from '../runtime/data-space-runtime-api.js'
import type { DataSpaceRequestScope, DataSpaceQueryOptions } from '../runtime/data-space-runtime-contract.js'
import { collectDataSpaceQueryPages } from '../runtime/protocol/data-space-pagination.js'
import { DataViewFilterCodec } from '@spark-appworks/spark-data'
import { parseDataSpaceValueFunction } from '../runtime/protocol/data-space-value-function.js'
import type { DataSpaceSourceInputBinding } from '../runtime/query/data-space-source-input.js'
import type { DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import { DataSpaceInputParameters, type InputParameterRowAdapter } from './data-space-input-parameters.js'

import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../../core/lowcode-client.js'
import type { LowcodeModelRelationRecord } from '../data-space.js'
import { parseNativeDataSpaceResourceType } from '../data-space-resource-type-wire.js'

/** 设计态 GetData 固定 FormKey；与权限/目录等设计读共用，变更须全链路回归。 */
export const DATA_SPACE_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'

const DATA_SPACE_TABLE = 'Base_DataSet'
const MODEL_TABLE = 'Base_DataModel'
const FIELD_TABLE = 'Base_DataModel_Field'
const RELATION_TABLE = 'Base_DataModel_Relation'
const RELATION_DEPENDENCY_DICTIONARY = '数据关系依赖'
const DICTIONARY_PAGE_SIZE = 500

/** 正式元数据查询的消费行；保留字段原值，不包含可由调用方替换的查询凭据。 */
type DataSpaceFormalRow = Readonly<Record<string, unknown>>
/** designScenarioId 查询元数据，dataSpaceId 校验模型归属；二者不从菜单或请求应用推导。 */
type DataSpaceFormalReadInput = Readonly<{
  designScenarioId: string
  dataSpaceId: string
  metaName: string
  assertCurrent?: () => void
}>
/** name 是正式字段 Name，canonicalName 是输出别名；type 是原 FieldType，未知时保持空值。
 * computed 仅表示 ValueFun 派生输出；Expression 是脱敏规则ID，原值保留在raw，不产生计算或写入权限。
 */
type DataSpaceFormalField = Readonly<{
  id: string; modelId: string; name: string; canonicalName: string; type: string
  primaryKey: boolean; description: string; output: boolean; computed: boolean
  order: number; orderType: string; raw: DataSpaceFormalRow
}>
/** 正式模型输出合同；来源名与查询模型 Name 分离，primaryKey 空字符串表示无键只读。 */
type DataSpaceFormalModel = Readonly<{
  id: string; metaName: string; name: string; sourceName: string; sourceId: string
  sourceType: string; primaryKey: string; businessMain: boolean
  fields: readonly DataSpaceFormalField[]; raw: DataSpaceFormalRow
  /** 接口/逻辑视图的正式输入映射，与输出字段分开；缺省表示没有配置记录。 */
  sourceInputBindings?: readonly DataSpaceSourceInputBinding[]
}>
type DataSpaceFormalTableResource = Readonly<{ resourceType: TableResourceType; resourceId: string }>
/** 单场景模型目录或关系读取身份；调用方 guard 与请求 scope 共同拒绝迟到结果。 */
type DataSpaceFormalScenarioReadInput = Omit<DataSpaceFormalReadInput, 'metaName'>
/** 同一空间中明确命名的正式模型集合；空集合不查询，返回顺序按名称排序。 */
type DataSpaceFormalBatchReadInput = DataSpaceFormalScenarioReadInput & Readonly<{
  /** 已绑定模型的注册Name集合，去重后查询，不按来源名或表别名匹配。 */
  metaNames: readonly string[]
}>
type DataSpaceFormalSpaceDefinition = Readonly<{ dataSpaceId: string; name: string }>
/** 正式关系消费合同；过滤由唯一 codec 解码，视图和字段引用由场景装配验证。 */
type DataSpaceFormalRelation = Omit<LowcodeModelRelationRecord, 'filterExpression'> & Readonly<{
  filterExpression: DataViewFilter
}>
/** 注入既有 HTTP、共享 query/save owner 与实时应用登录 scope，不另造身份来源。 */
type DataSpaceDesignApiOptions = Readonly<{
  http: HttpClientBase
  runtime: DataSpaceRuntimeApi
  readScope: () => DataSpaceRequestScope
}>
type DataSpaceFormalQueryCommand = Readonly<{
  designScenarioId: string
  metaName: string
  filter: DataViewFilter
  assertCurrent: () => void
  metadata?: DataSet | undefined
}>
type FormalQueryResult = Parameters<NonNullable<DataView['validateQueryResult']>>[0]
type FormalQueryOptions = Pick<DataSpaceQueryOptions, 'filter' | 'sort' | 'page' | 'allPages'> & Readonly<{fields?: readonly string[]}>

function formalText(row: DataSpaceFormalRow, keys: readonly string[]): string {
  for (const key of keys) {
    if (typeof row[key] === 'boolean') continue
    const value = text(row[key])
    if (value) return value
  }
  return ''
}

function formalRowId(row: DataSpaceFormalRow): string {
  return formalText(row, ['rowid', 'ROWID', 'RowID', 'rowId', 'id', 'Id'])
}

function formalComputedValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value !== 'string') return true
  try { const parsed: unknown = JSON.parse(value); return parsed !== null && parsed !== '' } catch { return Boolean(value.trim()) }
}

function formalDatabaseTable(row: DataSpaceFormalRow): boolean {
  return ['数据库表', '表', 'table'].includes(formalText(row, ['Type', 'type']))
}

function formalField(row: DataSpaceFormalRow, sourcePrimaryKey: string): DataSpaceFormalField {
  const name = requiredText(formalText(row, ['Name', 'name']), '正式字段 Name')
  const order = Number(row['Order'] ?? row['order'])
  return Object.freeze({ id: requiredText(formalRowId(row), '正式字段 ID'),
    modelId: formalText(row, ['dataModelId', 'DataModelId', 'datamodelid']), name,
    canonicalName: formalText(row, ['AsName', 'asName', 'asname']) || name,
    type: formalText(row, ['FieldType', 'fieldType', 'fieldtype']),
    primaryKey: sourcePrimaryKey ? name === sourcePrimaryKey : binary(row['IsPKey'] ?? row['isPKey']),
    description: formalText(row, ['description', 'Description']),
    output: binary(row['IsOutput'] ?? row['isOutput']),
    computed: formalComputedValue(row['ValueFun'] ?? row['valueFun']),
    order: Number.isSafeInteger(order) && order >= 0 ? order : 0,
    orderType: formalText(row, ['OrderType', 'orderType', 'ordertype']), raw: row })
}

function sameSemanticValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameSemanticValue(value, right[index]))
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]
    && sameSemanticValue(left[key], right[key]))
}

function sameFormalOutput(left: DataSpaceFormalField, right: DataSpaceFormalField): boolean {
  return left.name === right.name && left.canonicalName === right.canonicalName && left.type === right.type
    && left.primaryKey === right.primaryKey && left.description === right.description && left.output === right.output
    && left.computed === right.computed && left.order === right.order && left.orderType === right.orderType
    && ['Group', 'Value', 'ValueFun', 'Expression', 'Distinct'].every(key => {
      const read = (row: DataSpaceFormalRow) => Object.keys(row).find(name => name.toLowerCase() === key.toLowerCase())
      const leftKey = read(left.raw); const rightKey = read(right.raw)
      return leftKey === undefined || rightKey === undefined
        ? leftKey === rightKey
        : sameSemanticValue(left.raw[leftKey], right.raw[rightKey])
    })
}

function projectFormalModel(row: DataSpaceFormalRow, fieldRows: readonly DataSpaceFormalRow[], sourcePrimaryKey: string): DataSpaceFormalModel {
  const id = requiredText(formalRowId(row), '正式模型 ID')
  const metaName = requiredText(formalText(row, ['Name', 'name']), '正式模型 Name')
  const fields = Object.freeze(fieldRows.map(field => formalField(field, sourcePrimaryKey)))
  const declared = formalText(row, ['PrimaryKeyFields', 'primaryKeyFields', 'primarykeyfields'])
  const candidates = sourcePrimaryKey ? fields.filter(field => field.name === sourcePrimaryKey)
    : fields.filter(field => declared ? field.name === declared || field.canonicalName === declared : field.primaryKey)
  const key = candidates[0]
  const keyless = !formalDatabaseTable(row) && sourcePrimaryKey === '' && declared === ''
    && fields.every(field => !field.primaryKey)
  const declaredMatches = fields.filter(field => field.name === declared || field.canonicalName === declared)
  if ((!key && !keyless) || (key && sourcePrimaryKey === '' && candidates.length !== 1)
    || (key && candidates.some(field => !sameFormalOutput(key, field) || !field.primaryKey || !field.output || field.computed
      || field.name.toLowerCase() === 'lingma_sys_ent'))
    || (key && fields.some(field => field.canonicalName === key.canonicalName && !candidates.includes(field)))
    || (sourcePrimaryKey && declared && (!declaredMatches.length || declaredMatches.some(field => field.name !== sourcePrimaryKey)))) {
    throw new LowcodeApiError(0, `数据空间模型 ${metaName} 的正式主键无法映射到唯一有效输出字段`)
  }
  return Object.freeze({ id, metaName, name: metaName,
    sourceName: requiredText(formalText(row, ['MetaName', 'metaName', 'metaname']), '正式模型来源名'),
    sourceId: formalText(row, ['DbId', 'dbId', 'DBID', 'dbid', 'PId', 'pid']),
    sourceType: formalText(row, ['Type', 'type']), primaryKey: key?.canonicalName ?? '',
    businessMain: binary(row['IsBusinessMain'] ?? row['isBusinessMain']), fields, raw: row })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function requiredText(value: unknown, name: string): string {
  const normalized = text(value)
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function binary(value: unknown): boolean {
  return value === true || Number(value) === 1
}

function serializedText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function dictionaryPage(result: unknown): Readonly<{ rows: readonly DataSpaceFormalRow[]; total: unknown }> {
  if (!isRecord(result)) throw new LowcodeApiError(0, '数据关系依赖字典响应不是对象')
  const data = result['data'] ?? result['Data']
  if (!isRecord(data)) throw new LowcodeApiError(0, '数据关系依赖字典响应缺少 data')
  const rows = data['Items'] ?? data['items'] ?? data['List'] ?? data['list']
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    throw new LowcodeApiError(0, '数据关系依赖字典 Items 不是对象数组')
  }
  const total = data['Count'] ?? data['Total'] ?? data['TotalCount'] ?? data['count'] ?? data['total'] ?? data['totalCount']
  return { rows, total }
}

function isDictionaryScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function relationDependencyOptions(rows: readonly DataSpaceFormalRow[]): ReadonlyArray<Readonly<{ label: string; value: string }>> {
  const orders = rows.map(row => {
    const raw = row['ordIdx']
    if (raw === undefined || raw === null || raw === '') return undefined
    const order = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(order)) throw new LowcodeApiError(0, '数据关系依赖字典 ordIdx 不是有效数值')
    return order
  })
  const orderedRows = orders.some(order => order === undefined) ? rows
    : rows.map((row, index) => ({ row, order: orders[index], index }))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.index - right.index)
      .map(item => item.row)
  return Object.freeze(orderedRows.map((row, index) => {
    const rawLabel = row['label'] ?? row['txt'] ?? row['Label'] ?? row['Text'] ?? row['name'] ?? row['Name']
    const rawValue = row['value'] ?? row['val'] ?? row['Value'] ?? row['code'] ?? row['Code']
    if (!isDictionaryScalar(rawLabel)) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项 label 不是标量`)
    if (!isDictionaryScalar(rawValue)) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项 value 不是标量`)
    const label = String(rawLabel).trim()
    if (!label) throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项缺少 label`)
    if (String(rawValue).trim() === '') {
      throw new LowcodeApiError(0, `数据关系依赖字典第 ${index + 1} 项缺少 value`)
    }
    return Object.freeze({ label, value: String(rawValue) })
  }))
}

function dataSpaceRelations(
  rows: readonly DataSpaceFormalRow[],
): readonly LowcodeModelRelationRecord[] {
  return rows.map((row) => {
    return {
      sourceRelationId: requiredText(formalRowId(row), 'relation rowid'),
      dataSpaceId: requiredText(formalText(row, ['dataSetId', 'DataSetId', 'datasetid']), 'relation dataSetId'),
      parentModelId: requiredText(formalText(row, ['parentModId', 'ParentModId', 'parentmodid']), 'relation parentModId'),
      childModelId: requiredText(formalText(row, ['childModId', 'ChildModId', 'childmodid']), 'relation childModId'),
      parentResourceName: requiredText(formalText(row, ['parentTable', 'ParentTable', 'parenttable']), 'relation parentTable'),
      childResourceName: requiredText(formalText(row, ['childTable', 'ChildTable', 'childtable']), 'relation childTable'),
      filterExpression: serializedText(row['filter'] ?? row['Filter']),
      dependencyType: formalText(row, ['depType', 'DepType', 'deptype', 'dependencyType']),
      cascadeDelete: binary(row['cascadeDel'] ?? row['cascadeDelete']),
    }
  })
}

/** 正式元数据读取与纯解析门面；设计编辑、取消及提交由绑定的DataView/DataSet承接。 */
export class DataSpaceDesignApi {
  private readonly client: LowcodeClient
  private readonly runtime: DataSpaceRuntimeApi
  private readonly readScope: () => DataSpaceRequestScope

  /** 读取空间声明原文的副本；editable 校验编辑结构，不解析调用值或系统值。 */
  public static readInputParameters(input: Readonly<{value: unknown; editable?: boolean}>): Array<Record<string, unknown>> {
    return DataSpaceInputParameters.read(input.value, input.editable)
  }

  /** 对原声明校验拟保存内容；changed=false 时保留原文，不自动迁移引用或派发保存。 */
  public static prepareInputParameters(input: Readonly<{value: unknown; original: unknown}>): {items: Array<Record<string, unknown>>; changed: boolean} {
    return DataSpaceInputParameters.prepare(input.value, input.original)
  }

  /** 参数对象数组的纯行编辑兼容；标准组件绑定原inputParams，适配不执行查询或保存。 */
  public static inputParameterRowAdapter(): InputParameterRowAdapter {
    return DataSpaceInputParameters.rowAdapter()
  }

  /** 绑定宿主请求与共享运行 owner；正式读取校验 scope，不建立第二套设计写入口。 */
  public constructor(options: DataSpaceDesignApiOptions) {
    this.client = new LowcodeClient(options.http)
    this.runtime = options.runtime
    this.readScope = options.readScope
  }

  /** Decodes the stored SPARK wire filter for structured model metadata editing. */
  public static parseFilter(serialized: string | null | undefined): DataViewFilter | undefined {
    return DataViewFilterCodec.parseStored(serialized)
  }

  /** Encodes a structured model filter using the established SPARK wire contract. */
  public static serializeFilter(filter: DataViewFilter | undefined): string {
    return DataViewFilterCodec.serializeStored(filter)
  }

  /** Parses one serialized model-field ValueFun object without a filter wire envelope. */
  public static parseValueFunction(serialized: string | null | undefined): DataViewFilterValueFunction | undefined {
    if (serialized === null || serialized === undefined || serialized.trim() === '') return undefined
    return parseDataSpaceValueFunction(serialized, 'ValueFun')
  }

  /** Resolves consumable output columns while preserving the complete formal field list. */
  public static resolveOutputFields(model: DataSpaceFormalModel): readonly DataSpaceFormalField[] {
    return this.resolveFieldsByName(model, true)
  }

  /** 完整模型字段归属DataTable.columns；输出开关不删除模型结构，等价重复只合并投影、不改正式记录。 */
  public static resolveFields(model: DataSpaceFormalModel): readonly DataSpaceFormalField[] {
    return this.resolveFieldsByName(model, false)
  }

  private static resolveFieldsByName(model: DataSpaceFormalModel, outputOnly: boolean): readonly DataSpaceFormalField[] {
    const outputs: DataSpaceFormalField[] = []
    const byCanonicalName = new Map<string, DataSpaceFormalField>()
    for (const field of model.fields) {
      if (outputOnly && !field.output) continue
      const existing = byCanonicalName.get(field.canonicalName)
      if (existing === undefined) {
        byCanonicalName.set(field.canonicalName, field)
        outputs.push(field)
      } else if (!sameFormalOutput(existing, field)) {
        throw new LowcodeApiError(0, `正式模型${outputOnly ? '输出' : ''}字段重复: ${model.metaName}`)
      }
    }
    return Object.freeze(outputs)
  }

  /**
   * 从正式模型派生原生字段投影；不持久化、不复制字段真源，也不授予读取或写入权限。
   * @param model 已读取的正式定义；包括非输出字段，防止全不输出时空投影退回全列。
   * @returns 可用于缺省DataView的独立投影；显式视图配置保持优先，查询覆盖值不改模型定义。
   */
  public static createFieldProjection(model: DataSpaceFormalModel): DataViewFieldProjection[] {
    return this.resolveFields(model).map(field => ({
      fieldId: field.id, source: 'resource', resourceFieldId: field.id, resourceField: field.canonicalName,
      viewField: field.canonicalName, type: field.type || 'string', label: field.description || field.canonicalName,
      output: field.output, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: field.primaryKey,
      value: '', valueFunction: '', expression: '',
    }))
  }

  /**
   * 将已读取的正式元记录投影为模型；与readModel使用同一主键及输出验证。
   * @param row 正式模型记录或显式拟保存的定义，不代表已获得查询权限。
   * @param fields 所属模型的完整dataModel字段记录，不包含来源入参。
   * @param sourcePrimaryKey 数据库表须使用正式来源目录确认的字段名，其他来源为空。
   * @returns 校验后的定义投影；不读取、不保存，也不授予数据权限。
   */
  public static projectModel(row: DataSpaceFormalRow, fields: readonly DataSpaceFormalRow[], sourcePrimaryKey: string): DataSpaceFormalModel {
    const model = projectFormalModel(row, fields, sourcePrimaryKey)
    this.resolveOutputFields(model)
    return model
  }

  /** 正式来源名与原标签构成原生表资源语义，不替代查询模型绑定或来源调度身份。 */
  public static resolveTableResource(model: Pick<DataSpaceFormalModel, 'sourceType' | 'sourceName'>): DataSpaceFormalTableResource {
    if (typeof model.sourceName !== 'string' || !model.sourceName.trim()) {
      throw new LowcodeApiError(0, '正式模型来源名不能为空')
    }
    return Object.freeze({resourceType: parseNativeDataSpaceResourceType(model.sourceType), resourceId: model.sourceName})
  }

  /** 仅读取正式空间名称，不扩展模型、目录或输入参数。 */
  public async readSpaceDefinition(input: DataSpaceFormalScenarioReadInput): Promise<DataSpaceFormalSpaceDefinition> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式空间读取身份已失效')
    }
    assertCurrent()
    const result = await this.runtime.query({ scenarioId: designScenarioId, metaName: DATA_SPACE_TABLE }, {
      filter: DataViewFilter.condition({ field: 'rowid', operator: 'eq', value: dataSpaceId }),
      fields: ['rowid', 'Name'], page: { index: 1, size: 2 },
    })
    assertCurrent()
    const row = result.rows[0]
    if (!result.countReported || result.total !== 1 || result.rows.length !== 1 || row?.['rowid'] !== dataSpaceId
      || typeof row['Name'] !== 'string' || !row['Name'].trim()
      || result.readFieldAccess(row, 'rowid') !== 'visible' || result.readFieldAccess(row, 'Name') !== 'visible') {
      throw new LowcodeApiError(0, `正式数据空间名称必须唯一且可读: ${dataSpaceId}`)
    }
    assertCurrent()
    return Object.freeze({ dataSpaceId, name: row['Name'] })
  }

  /** 以真实场景模型目录发现 Name，再复用正式单模型读取；不借物理 catalog 猜测字段。 */
  public async readModels(input: DataSpaceFormalScenarioReadInput): Promise<readonly DataSpaceFormalModel[]> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式模型列表读取身份已失效')
    }
    const rows = await this.readFormalRows({ designScenarioId, metaName: MODEL_TABLE, assertCurrent,
      filter: DataViewFilter.condition({ field: 'dataSetId', operator: 'eq', value: dataSpaceId }) })
    if (rows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId)) {
      throw new LowcodeApiError(0, `正式数据空间模型列表归属不一致: ${dataSpaceId}`)
    }
    const names = rows.map(row => requiredText(formalText(row, ['Name', 'name']), '正式模型 Name'))
    if (new Set(names).size !== names.length) throw new LowcodeApiError(0, '正式数据空间模型 Name 不能重复')
    const models: DataSpaceFormalModel[] = []
    for (let index = 0; index < names.length; index++) {
      const metaName = names[index]
      const row = rows[index]
      if (!metaName || !row) throw new LowcodeApiError(0, '正式模型列表身份缺失')
      const model = await this.readModel({ designScenarioId, dataSpaceId, metaName, assertCurrent })
      if (model.id !== formalRowId(row)) throw new LowcodeApiError(0, `正式模型列表读回身份改变: ${metaName}`)
      models.push(model)
    }
    assertCurrent()
    return Object.freeze(models)
  }

  /**
   * 仅读取明确选择的正式模型；完整字段与来源主键验证通过后交付，不查询全物理目录。
   * @param input 元空间身份、目标空间及正式模型名；调用方守卫拒绝过期结果。
   * @param metadata 活动设计必须提供当前元数据DataSet；复用其查询视图并在读取后释放，不覆盖工作区草稿。仅装配前引导可省略。
   */
  public async readModel(input: DataSpaceFormalReadInput, metadata?: DataSet): Promise<DataSpaceFormalModel> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const metaName = requiredText(input.metaName, 'metaName')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式模型读取身份已失效')
      if (metadata && (metadata.destroyed || metadata.scenarioId !== designScenarioId)) throw new Error('正式模型元数据视图所属空间已失效')
    }
    assertCurrent()
    const model = await this.readFormalQuery({designScenarioId, metaName: MODEL_TABLE, assertCurrent, metadata}, {
      filter: DataViewFilter.group({ logic: 'and', filters: [
        { field: 'dataSetId', operator: 'eq', value: dataSpaceId }, { field: 'Name', operator: 'eq', value: metaName },
      ] }), page: { index: 1, size: 2 },
    }, result => {
      const models = result.rows, row = models[0]
      if (result.total !== models.length || models.length !== 1 || !row || !formalRowId(row)
        || formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
        || formalText(row, ['Name', 'name']) !== metaName || !formalText(row, ['MetaName', 'metaName', 'metaname'])) {
        throw new LowcodeApiError(0, `正式数据空间模型必须唯一且属于当前数据空间: ${metaName}`)
      }
      if (Object.keys(row).some(field => result.readFieldAccess(row, field) !== 'visible')) {
        throw new LowcodeApiError(0, `${MODEL_TABLE} 正式定义存在不可读取或脱敏字段`)
      }
      return row
    })
    const modelId = formalRowId(model)
    return this.readFormalModelDetails({
      input: {designScenarioId, dataSpaceId, metaName, assertCurrent, metadata},
      model,
      fieldsPromise: this.readFormalRows({ designScenarioId, metaName: FIELD_TABLE, assertCurrent, metadata,
        filter: DataViewFilter.group({ logic: 'and', filters: [
          { field: 'dataSetId', operator: 'eq', value: dataSpaceId },
          { field: 'dataModelId', operator: 'eq', value: modelId }, { field: 'type', operator: 'eq', value: 'dataModel' },
        ] }) }, true),
    })
  }

  /** 批量读取一个空间的指定模型及完整字段；来源按数据库/表名精确集合读取，共用主键校验，不缓存完成结果。 */
  public async readModelBatch(input: DataSpaceFormalBatchReadInput): Promise<readonly DataSpaceFormalModel[]> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const names = [...new Set(input.metaNames.map(name => requiredText(name, 'metaName')))].sort()
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式模型批量读取身份已失效')
    }
    assertCurrent()
    if (!names.length) return Object.freeze([])
    const rows = await this.readFormalRows({designScenarioId, metaName: MODEL_TABLE, assertCurrent,
      filter: DataViewFilter.group({logic: 'and', filters: [
        {field: 'dataSetId', operator: 'eq', value: dataSpaceId}, {field: 'Name', operator: 'in', value: names},
      ]})}, true)
    const byName = new Map(rows.map(row => [formalText(row, ['Name', 'name']), row]))
    if (rows.length !== names.length || byName.size !== rows.length || names.some(name => !byName.has(name))
      || rows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
        || !formalText(row, ['MetaName', 'metaName', 'metaname']))) {
      throw new LowcodeApiError(0, '正式模型集合不完整、身份重复或空间归属不一致')
    }
    const orderedModels = names.map(metaName => {
      const model = byName.get(metaName)
      if (!model) throw new LowcodeApiError(0, `正式模型未返回: ${metaName}`)
      return {metaName, model}
    })
    const ids = rows.map(formalRowId).sort()
    const modelIds = new Set(ids)
    const fields = this.readFormalRows({designScenarioId, metaName: FIELD_TABLE, assertCurrent,
      filter: DataViewFilter.group({logic: 'and', filters: [
        {field: 'dataSetId', operator: 'eq', value: dataSpaceId}, {field: 'dataModelId', operator: 'in', value: ids},
        {field: 'type', operator: 'eq', value: 'dataModel'},
      ]})}, true).then(fieldRows => {
      if (fieldRows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
        || !modelIds.has(formalText(row, ['dataModelId', 'DataModelId', 'datamodelid']))
        || (formalText(row, ['type', 'Type']) || 'dataModel') !== 'dataModel')) {
        throw new LowcodeApiError(0, '正式模型字段集合归属或类型不一致')
      }
      return fieldRows
    })
    const sourceKeys = this.readFormalSourceKeys({designScenarioId, assertCurrent}, orderedModels.map(({model}) => model))
    const outcomes = await Promise.allSettled(orderedModels.map(({metaName, model}) => {
      return this.readFormalModelDetails({
        input: {designScenarioId, dataSpaceId, metaName, assertCurrent},
        model,
        fieldsPromise: fields.then(fieldRows => fieldRows.filter(row => formalText(row, ['dataModelId', 'DataModelId', 'datamodelid']) === formalRowId(model))),
        sourceKeyPromise: sourceKeys.then(keys => keys.get(formalRowId(model)) ?? ''),
      })
    }))
    assertCurrent()
    return Object.freeze(outcomes.map(outcome => {
      if (outcome.status === 'rejected') throw outcome.reason
      return outcome.value
    }))
  }

  /** 单模型和批量读取共用来源主键验证、字段投影及接口/逻辑视图入参读取。 */
  private async readFormalModelDetails(details: Readonly<{
    input: DataSpaceFormalReadInput & Readonly<{metadata?: DataSet | undefined}>
    model: DataSpaceFormalRow
    fieldsPromise: Promise<readonly DataSpaceFormalRow[]>
    sourceKeyPromise?: Promise<string>
  }>): Promise<DataSpaceFormalModel> {
    const {input, model, fieldsPromise, sourceKeyPromise} = details
    const {designScenarioId, dataSpaceId, metaName, metadata} = input
    const assertCurrent = () => input.assertCurrent?.()
    const modelId = formalRowId(model)
    // Both reads depend on the verified model identity, not on one another.
    const [fieldResult, sourceResult] = await Promise.allSettled([
      fieldsPromise,
      sourceKeyPromise ?? this.readFormalSourceKeys({designScenarioId, assertCurrent, metadata}, [model]).then(keys => keys.get(modelId) ?? ''),
    ])
    assertCurrent()
    if (fieldResult.status === 'rejected') throw fieldResult.reason
    if (sourceResult.status === 'rejected') throw sourceResult.reason
    const fields = fieldResult.value
    const sourceOutputKey = sourceResult.value
    if (fields.some(field => formalText(field, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId
      || formalText(field, ['dataModelId', 'DataModelId', 'datamodelid']) !== modelId
      || (formalText(field, ['type', 'Type']) || 'dataModel') !== 'dataModel')) {
      throw new LowcodeApiError(0, `正式数据空间模型字段归属或类型不一致: ${metaName}`)
    }
    const formal = projectFormalModel(model, fields, sourceOutputKey)
    const nativeResourceType = DataSpaceDesignApi.resolveTableResource(formal).resourceType
    if (nativeResourceType !== 'third-party-api' && nativeResourceType !== 'logical-view') return formal
    const sourceInputBindings = await this.readSourceInputBindings({designScenarioId, dataSpaceId, modelId, assertCurrent, metadata})
    assertCurrent()
    return sourceInputBindings.length ? Object.freeze({...formal, sourceInputBindings}) : formal
  }

  /** 来源入参的正式记录只读入口；按真实查询权限校验，不投影成模型输出列。 */
  private async readSourceInputBindings(input: Readonly<{
    designScenarioId: string; dataSpaceId: string; modelId: string; assertCurrent: () => void; metadata?: DataSet | undefined
  }>): Promise<readonly DataSpaceSourceInputBinding[]> {
    input.assertCurrent()
    const fields = ['rowid', 'dataSetId', 'dataModelId', 'type', 'Name', 'ValueFun']
    return this.readFormalQuery({...input, metaName: FIELD_TABLE}, {
      fields, filter: DataViewFilter.group({logic: 'and', filters: [
        {field: 'dataSetId', operator: 'eq', value: input.dataSpaceId},
        {field: 'dataModelId', operator: 'eq', value: input.modelId},
        {field: 'type', operator: 'eq', value: 'inputParams'},
      ]}), sort: [{field: 'rowid', direction: 'asc'}], allPages: true, page: {index: 1, size: 500},
    }, context => {
      if (!context.countReported || context.rows.length !== context.total) throw new LowcodeApiError(0, '来源入参记录未完整读取')
      const ids = new Set<string>()
      const names = new Set<string>()
      const bindings = context.rows.map(row => {
        if (fields.some(field => !Object.hasOwn(row, field) || context.readFieldAccess(row, field) !== 'visible')) {
          throw new LowcodeApiError(0, '来源入参身份和取值配置必须完整且可读')
        }
        if (row['dataSetId'] !== input.dataSpaceId || row['dataModelId'] !== input.modelId || row['type'] !== 'inputParams') {
          throw new LowcodeApiError(0, '来源入参归属或类型不一致')
        }
        const id = requiredText(row['rowid'], '来源入参 ID')
        const name = requiredText(row['Name'], '来源入参 Name')
        if (ids.has(id) || names.has(name)) throw new LowcodeApiError(0, '来源入参 ID 或名称重复')
        ids.add(id); names.add(name)
        const valueFunction = DataSpaceDesignApi.parseValueFunction(serializedText(row['ValueFun']))
        return Object.freeze({id, name, ...(valueFunction === undefined ? {} : {valueFunction})})
      })
      return Object.freeze(bindings)
    })
  }

  /**
   * 将正式关系行解码为来源合同；HTTP读取和元空间DataView消费共用此映射。
   * @param rows 已由调用方核定归属、完整性和数据权限的正式行；不执行查询或推导前端级联。
   * @returns 保留来源身份、资源端点、完整过滤及删除配置的只读关系。
   */
  public static decodeRelations(rows: readonly DataSpaceFormalRow[]): readonly DataSpaceFormalRelation[] {
    return Object.freeze(dataSpaceRelations(rows).map(relation => Object.freeze({...relation,
      filterExpression: DataViewFilterCodec.decode(relation.filterExpression)})))
  }

  /** 完整读取单场景关系；过滤经唯一 codec 保留完整树，模型与视图引用由场景装配核对。 */
  public async readRelations(input: DataSpaceFormalScenarioReadInput): Promise<readonly DataSpaceFormalRelation[]> {
    const designScenarioId = requiredText(input.designScenarioId, 'designScenarioId')
    const dataSpaceId = requiredText(input.dataSpaceId, 'dataSpaceId')
    const scope = this.readScope().token
    const assertCurrent = () => {
      input.assertCurrent?.()
      if (this.readScope().token !== scope) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 正式关系读取身份已失效')
    }
    const rows = await this.readFormalRows({ designScenarioId, metaName: RELATION_TABLE, assertCurrent,
      filter: DataViewFilter.condition({ field: 'dataSetId', operator: 'eq', value: dataSpaceId }) })
    if (rows.some(row => formalText(row, ['dataSetId', 'DataSetId', 'datasetid']) !== dataSpaceId)) {
      throw new LowcodeApiError(0, `正式数据空间关系归属不一致: ${dataSpaceId}`)
    }
    const relations = DataSpaceDesignApi.decodeRelations(rows)
    assertCurrent()
    return relations
  }

  /** 读取应用级关系依赖字典；该资源不是场景注册模型，不携带 scenarioId。 */
  public async readRelationDependencyOptions(): Promise<ReadonlyArray<Readonly<{ label: string; value: string }>>> {
    const scope = this.readScope()
    if (!scope.token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 关系依赖字典读取需要有效执行域')
    if (!Object.entries(scope.headers).some(([key, value]) => key.toLowerCase() === 'x-appid'
      && typeof value === 'string' && value.trim().length > 0)) {
      throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 关系依赖字典读取需要明确选中应用')
    }
    const assertCurrent = () => {
      if (this.readScope().token !== scope.token) {
        throw new Error('SPARK_EXECUTION_SCOPE_STALE: 关系依赖字典读取身份已失效')
      }
    }
    const headers = Object.fromEntries(Object.entries(scope.headers).filter(([key]) => key.toLowerCase() !== 'x-formkey'))
    headers['x-FormKey'] = ''
    const collection = await collectDataSpaceQueryPages(async page => {
      assertCurrent()
      const result = await this.client.requestResult({
        path: '/api/DataOperation/GetData',
        method: 'POST',
        data: { Table: [{ Name: RELATION_DEPENDENCY_DICTIONARY, Type: '字典', PrimaryKeyFields: 'rowid',
          OutputType: 'Table', Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1 }],
          PageParam: page },
        headers,
      })
      assertCurrent()
      return dictionaryPage(result)
    }, { pageSize: DICTIONARY_PAGE_SIZE, maxRows: 50_000, assertCurrent })
    assertCurrent()
    if (collection.rows.length === 0) throw new LowcodeApiError(0, `数据关系依赖字典 ${RELATION_DEPENDENCY_DICTIONARY} 为空`)
    return relationDependencyOptions(collection.rows)
  }

  private async readFormalRows(command: DataSpaceFormalQueryCommand, requireReadable = false): Promise<readonly DataSpaceFormalRow[]> {
    command.assertCurrent()
    return this.readFormalQuery(command, {
      filter: command.filter, sort: [{ field: 'rowid', direction: 'asc' }],
      allPages: true, page: { index: 1, size: 500 },
    }, result => {
      const rows = result.rows
      if (requireReadable && rows.some(row => Object.keys(row).some(field => result.readFieldAccess(row, field) !== 'visible'))) {
        throw new LowcodeApiError(0, `${command.metaName} 正式定义存在不可读取或脱敏字段`)
      }
      const ids = rows.map(row => requiredText(formalRowId(row), `${command.metaName} 正式记录 ID`))
      if (new Set(ids).size !== ids.length) throw new LowcodeApiError(0, `${command.metaName} 正式记录 ID 不能重复`)
      return rows
    })
  }

  /** 本次模型集合的来源主键；同一来源共读，不缓存结果，也不把不同数据库的同名表合并。 */
  private async readFormalSourceKeys(command: Pick<DataSpaceFormalQueryCommand, 'designScenarioId' | 'assertCurrent' | 'metadata'>,
    models: readonly DataSpaceFormalRow[]): Promise<ReadonlyMap<string, string>> {
    command.assertCurrent()
    const sources = new Map<string, {databaseId: string; name: string; modelIds: string[]}>()
    for (const model of models) {
      if (!formalDatabaseTable(model)) continue
      const name = requiredText(formalText(model, ['MetaName', 'metaName', 'metaname']), '来源名称')
      const databaseId = requiredText(formalText(model, ['DbId', 'dbId', 'DBID', 'dbid']), '来源数据库 ID')
      const identity = JSON.stringify([databaseId, name])
      const source = sources.get(identity) ?? {databaseId, name, modelIds: []}
      source.modelIds.push(formalRowId(model)); sources.set(identity, source)
    }
    const keys = new Map<string, string>()
    const filters = [...sources.values()].map(source => DataViewFilter.group({logic: 'and', filters: [
      {field: 'tblname', operator: 'eq', value: source.name}, {field: 'dbid', operator: 'eq', value: source.databaseId},
    ]}))
    const firstFilter = filters[0]
    if (!firstFilter) return keys
    let rows: readonly DataSpaceFormalRow[]
    if (filters.length === 1) {
      rows = await this.readFormalQuery({...command, metaName: 'View_TblList'}, {
        filter: firstFilter, page: {index: 1, size: 2},
      }, result => {
        if (result.total !== result.rows.length || result.rows.length !== 1) {
          throw new LowcodeApiError(0, '数据库表来源不唯一或归属不一致，无法读取正式主键')
        }
        return result.rows
      })
    } else {
      rows = await this.readFormalRows({...command, metaName: 'View_TblList',
        filter: DataViewFilter.group({logic: 'or', filters: filters.map(filter => filter.toJSON())})})
    }
    const sourceIds = new Map<string, string>(), seen = new Set<string>()
    for (const row of rows) {
      const identity = JSON.stringify([formalText(row, ['dbid', 'DbId']), formalText(row, ['tblname', 'TblName'])])
      const id = formalRowId(row)
      if (!id || !sources.has(identity) || seen.has(identity) || sourceIds.has(id)) {
        throw new LowcodeApiError(0, '数据库表来源不唯一或归属不一致，无法读取正式主键')
      }
      seen.add(identity); sourceIds.set(id, identity)
    }
    if (seen.size !== sources.size) throw new LowcodeApiError(0, '数据库表来源不完整，无法读取正式主键')
    const ids = [...sourceIds.keys()].sort()
    const firstId = ids[0]
    if (!firstId) throw new LowcodeApiError(0, '数据库表来源缺少正式记录 ID')
    const fields = await this.readFormalRows({...command, metaName: 'Base_TblField',
      filter: DataViewFilter.condition({field: 'tblid', operator: ids.length === 1 ? 'eq' : 'in', value: ids.length === 1 ? firstId : ids})})
    const bySource = new Map<string, string[]>()
    for (const field of fields) {
      const id = formalText(field, ['tblid', 'TblId', 'tblId'])
      if (!sourceIds.has(id)) throw new LowcodeApiError(0, '数据库表来源字段归属不一致')
      const name = formalText(field, ['enname', 'EnName', 'ENNAME'])
      if (name && name.toLowerCase() !== 'lingma_sys_ent' && binary(field['IsPKey'])) {
        const candidates = bySource.get(id) ?? []
        candidates.push(name); bySource.set(id, candidates)
      }
    }
    for (const [id, identity] of sourceIds) {
      const candidates = bySource.get(id), key = candidates?.[0]
      if (!key || candidates.length !== 1) throw new LowcodeApiError(0, '正式来源必须有且仅有一个非租户主键')
      for (const modelId of sources.get(identity)?.modelIds ?? []) keys.set(modelId, key)
    }
    return keys
  }

  /** 在原查询接纳边界消费权限与行，不把查询凭据或临时视图交给业务调用方。 */
  private async readFormalQuery<T>(command: Omit<DataSpaceFormalQueryCommand, 'filter'>,
    options: FormalQueryOptions, consume: (result: FormalQueryResult) => T): Promise<T> {
    command.assertCurrent()
    const dataSet = command.metadata
    if (!dataSet) {
      const result = await this.runtime.query({scenarioId: command.designScenarioId, metaName: command.metaName}, options)
      command.assertCurrent()
      return consume(result)
    }
    const tables = Object.values(dataSet.tables).filter(table => table.modelBinding?.modelName === command.metaName)
    const table = tables.length === 1 ? tables[0] : undefined, source = table?.getView('default')
    const assertView = () => {
      command.assertCurrent()
      if (dataSet.destroyed || dataSet.scenarioId !== command.designScenarioId || !table || !source || source.destroyed
        || dataSet.getTable(table.tableName) !== table || table.getView('default') !== source
        || table.modelBinding?.modelName !== command.metaName) throw new Error(`正式模型元数据查询视图不可用: ${command.metaName}`)
    }
    assertView()
    if (!source || !table) throw new Error(`正式模型元数据查询视图不存在: ${command.metaName}`)
    const view = source.createQueryView(`formalRead_${crypto.randomUUID()}`)
    try {
      // 复用同一模型的查询owner；目录工作区的临时投影/查询偏好不改变正式定义读取范围。
      view.queryConfig = {}
      view.fieldProjection = []
      let projection: {value: T} | undefined
      view.validateQueryResult = result => {assertView(); projection = {value: consume(result)}}
      const result = await view.loadFromServer({page: options.page?.index ?? 1, pageSize: options.page?.size ?? 500,
        ...(options.filter ? {filter: options.filter.toJSON()} : {}), sort: options.sort?.map(item => `${item.field}:${item.direction}`).join(',') ?? '',
        allPages: options.allPages ?? false, ...(options.fields ? {fields: options.fields} : {}), treeMode: 'flat', outputType: 'Table'})
      assertView()
      if (!result.success || view.destroyed || table.getView(view.viewId) !== view || !projection) throw new Error(`正式模型元数据查询未完成: ${command.metaName}`)
      return projection.value
    } finally {if (table.getView(view.viewId) === view) table.destroyView(view.viewId)}
  }
}
