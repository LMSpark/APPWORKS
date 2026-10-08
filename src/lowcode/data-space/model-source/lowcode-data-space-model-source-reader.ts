import { DataViewFilter } from '@spark-appworks/spark-data'
import type { PageRuntimeServicesCapability } from '@spark-appworks/spark-component'
import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'

type SourceContext = Awaited<ReturnType<typeof lowcodeApi.dataSpace.runtime.query>>
type PageDataSpaceModelSourceReader = NonNullable<ReturnType<NonNullable<PageRuntimeServicesCapability['dataSpaceDesign']>['createReader']>['modelSources']>
type PageDataSpaceModelSourceQuery = Parameters<PageDataSpaceModelSourceReader['query']>[0]
type PageDataSpaceModelSource = Parameters<PageDataSpaceModelSourceReader['prepare']>[0]
type PageDataSpaceModelSourcePrepared = Awaited<ReturnType<PageDataSpaceModelSourceReader['prepare']>>
type PageDataSpaceModelSourceField = PageDataSpaceModelSourcePrepared['fields'][number]
type PageDataSpaceModelSourceType = PageDataSpaceModelSource['type']
type SourceConfig = Readonly<{ metaName: string; label: string; name: string; description: string;
  dbid?: string; databaseName?: string; providerId?: string }>
type VisibleField = Readonly<{context: SourceContext; row: Readonly<Record<string, unknown>>;
  fieldName: string; optionalPresentation?: boolean}>
type SourceRead = Readonly<{metaName: string; fields: readonly string[];
  filter: ReturnType<typeof DataViewFilter.condition> | undefined; page?: Readonly<{index: number; size: number}>}>

const sourceConfigs: Record<PageDataSpaceModelSourceType, SourceConfig> = {
  table: { metaName: 'View_TblList', label: '数据库表', name: 'tblname', description: 'tbldesc', dbid: 'dbid', databaseName: 'DbName' },
  dict: { metaName: '_Base_DictType', label: '字典', name: 'TypeName', description: 'functiondesc' },
  interface: { metaName: 'Base_DataServiceInterface', label: '接口', name: 'Name', description: 'Desc', providerId: 'ProviderID' },
  json: { metaName: 'Base_JsonData', label: 'JSON', name: 'name', description: 'description' },
  logicView: { metaName: 'Base_DataViewList', label: '视图', name: 'name', description: 'description' },
  databaseView: { metaName: 'View_ViewList', label: '数据库视图', name: 'vewname', description: 'vewdesc', dbid: 'dbid', databaseName: 'DbName' },
}

function config(type: PageDataSpaceModelSourceType): SourceConfig {
  const result = Object.hasOwn(sourceConfigs, type) ? sourceConfigs[type] : undefined
  if (!result) throw new Error('模型来源类型不受支持')
  return result
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('模型来源字段不是标量值')
  }
  return String(value).trim()
}

function visible({context, row, fieldName, optionalPresentation}: VisibleField): string {
  if (context.readFieldAccess(row, fieldName) !== 'visible') {
    if (!optionalPresentation) throw new Error(`模型来源字段 ${fieldName} 不可读`)
    return ''
  }
  return scalar(row[fieldName])
}

function sourceFromRow(type: PageDataSpaceModelSourceType, context: SourceContext,
  row: Readonly<Record<string, unknown>>): PageDataSpaceModelSource {
  const spec = config(type)
  const id = visible({context, row, fieldName: 'rowid'})
  const name = visible({context, row, fieldName: spec.name})
  if (!id || !name) throw new Error('模型来源缺少稳定身份或名称')
  const dbid = spec.dbid ? visible({context, row, fieldName: spec.dbid}) : ''
  const databaseName = spec.databaseName ? visible({context, row, fieldName: spec.databaseName}) : ''
  const providerId = spec.providerId ? visible({context, row, fieldName: spec.providerId}) : ''
  return Object.freeze({ type, id, name, description: visible({context, row, fieldName: spec.description, optionalPresentation: true}),
    dbid, databaseName, providerId })
}

function field(values: Partial<PageDataSpaceModelSourceField> & Pick<PageDataSpaceModelSourceField, 'Name' | 'description' | 'FieldType'>): PageDataSpaceModelSourceField {
  return Object.freeze({ type: 'dataModel', IsPKey: 0, IsOutput: 1, AsName: '', ValueFun: '', Expression: '', allowAIAdd: 0,
    OrderType: '', Order: 0, Group: 0, ...values })
}

const staticFields: Readonly<Partial<Record<PageDataSpaceModelSourceType, readonly PageDataSpaceModelSourceField[]>>> = {
  dict: Object.freeze([
    field({ Name: 'rowid', description: '唯一值（ID）', FieldType: 'varchar' }),
    field({ Name: 'val', description: '值', FieldType: 'varchar' }),
    field({ Name: 'txt', description: '文本', FieldType: 'varchar' }),
    field({ Name: 'ordIdx', description: '排序字段', FieldType: 'int', OrderType: 'ascending', Order: 1 }),
  ]),
  json: Object.freeze([
    field({ Name: 'id', description: '主键（记录路径）', FieldType: 'varchar' }),
    field({ Name: 'pid', description: '记录父级id', FieldType: 'varchar' }),
    field({ Name: 'name', description: '属性名称', FieldType: 'varchar' }),
    field({ Name: 'type', description: '属性类型', FieldType: 'varchar' }),
    field({ Name: 'haschild', description: '是否包含子项', FieldType: 'bool' }),
    field({ Name: 'value', description: '属性值（值函数）', FieldType: 'varchar' }),
  ]),
}

/** Fixed six-source reader bound to the current application query scope. */
export class LowcodeDataSpaceModelSourceReader implements PageDataSpaceModelSourceReader {
  readonly #scopeToken: string

  public constructor() { this.#scopeToken = lowcodeApi.readRequestScope().token }

  private assertCurrent(): void {
    if (lowcodeApi.readRequestScope().token !== this.#scopeToken) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 模型来源读取身份已失效')
    }
  }

  private async read({metaName, fields, filter, page}: SourceRead): Promise<SourceContext> {
    this.assertCurrent()
    const context = await lowcodeApi.dataSpace.runtime.query(
      { scenarioId: LowcodePlatform.DATA_SPACE_DESIGN_FORM_KEY, metaName },
      { fields, ...(filter ? { filter } : {}), ...(page ? {page} : { allPages: true, page: {index: 1, size: 500}, maxRows: 50000 }) },
    )
    this.assertCurrent()
    if (!context.countReported || (!page && context.rows.length !== context.total)) {
      throw new Error(`${metaName} 模型来源查询未返回完整服务端结果`)
    }
    return context
  }

  public async query(input: PageDataSpaceModelSourceQuery): Promise<Readonly<{rows: readonly PageDataSpaceModelSource[]; total: number}>> {
    const spec = config(input.type)
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 10
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('模型来源页码或页大小无效')
    }
    const filters = [
      scalar(input.keyword) ? {field: spec.name, operator: 'contains' as const, value: scalar(input.keyword)} : undefined,
      scalar(input.description) ? {field: spec.description, operator: 'contains' as const, value: scalar(input.description)} : undefined,
      scalar(input.databaseName) && spec.databaseName
        ? {field: spec.databaseName, operator: 'contains' as const, value: scalar(input.databaseName)} : undefined,
    ].filter(item => item !== undefined)
    const filter = filters.length > 1 ? DataViewFilter.group({logic: 'and', filters})
      : filters[0] ? DataViewFilter.condition(filters[0]) : undefined
    const fields = ['rowid', spec.name, spec.description, spec.dbid, spec.databaseName, spec.providerId]
      .filter((value): value is string => Boolean(value))
    const context = await this.read({metaName: spec.metaName, fields, filter, page: {index: page, size: pageSize}})
    const rows = context.rows.map(row => sourceFromRow(input.type, context, row))
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('模型来源列表身份重复')
    return Object.freeze({rows: Object.freeze(rows), total: context.total})
  }

  public async prepare(source: PageDataSpaceModelSource): Promise<PageDataSpaceModelSourcePrepared> {
    const spec = config(source.type)
    const id = scalar(source.id)
    if (!id) throw new Error('模型来源身份缺失')
    const context = await this.read({metaName: spec.metaName,
      fields: ['rowid', spec.name, spec.description, spec.dbid, spec.databaseName, spec.providerId].filter((value): value is string => Boolean(value)),
      filter: DataViewFilter.condition({field: 'rowid', operator: 'eq', value: id})})
    if (context.rows.length !== 1 || context.total !== 1) throw new Error('模型来源身份不存在或不唯一')
    const selected = context.rows[0]
    if (!selected) throw new Error('模型来源身份不存在或不唯一')
    const current = sourceFromRow(source.type, context, selected)
    if (current.type !== source.type || current.id !== source.id || current.name !== source.name
      || current.description !== source.description || current.dbid !== source.dbid
      || current.databaseName !== source.databaseName || current.providerId !== source.providerId) {
      throw new Error('模型来源已变化，请重新选择')
    }
    if (spec.dbid && (!current.dbid || !current.databaseName)) {
      throw new Error('数据库来源缺少数据库身份（dbid/DbName），无法创建模型')
    }
    const fields: PageDataSpaceModelSourceField[] = [...(staticFields[source.type] ?? [])]
    if (!staticFields[source.type]) {
      const fieldContext = await this.read({metaName: 'Base_TblField',
        fields: ['rowid', 'tblid', 'enname', 'cnname', 'description', 'DataType', 'IsPKey'],
        filter: DataViewFilter.condition({field: 'tblid', operator: 'eq', value: id})})
      const ids = new Set<string>()
      const names = new Set<string>()
      for (const row of fieldContext.rows) {
        const fieldId = visible({context: fieldContext, row, fieldName: 'rowid'})
        if (!fieldId || ids.has(fieldId) || visible({context: fieldContext, row, fieldName: 'tblid'}) !== id) throw new Error('来源字段身份或归属不唯一')
        ids.add(fieldId)
        const name = visible({context: fieldContext, row, fieldName: 'enname'})
        const fieldType = visible({context: fieldContext, row, fieldName: 'DataType'})
        if (!name || !fieldType || names.has(name)) throw new Error('来源字段名称或类型缺失、重复')
        names.add(name)
        const pkey = visible({context: fieldContext, row, fieldName: 'IsPKey'})
        if (!['0', '1', 'true', 'false'].includes(pkey)) throw new Error('来源字段主键标记无效')
        const primary = pkey === '1' || pkey === 'true' ? 1 : 0
        fields.push(field({Name: name, description: visible({context: fieldContext, row, fieldName: 'cnname', optionalPresentation: true})
          || visible({context: fieldContext, row, fieldName: 'description', optionalPresentation: true}), FieldType: fieldType,
        IsPKey: primary, IsOutput: primary}))
      }
    }
    if (source.type === 'interface' || source.type === 'logicView') {
      const params = await this.read({metaName: '_Base_ParamList', fields: ['parid', 'pid', 'parname', 'pardesc', 'parzdtype'],
        filter: DataViewFilter.condition({field: 'pid', operator: 'eq', value: id})})
      const ids = new Set<string>()
      const names = new Set<string>()
      for (const row of params.rows) {
        const paramId = visible({context: params, row, fieldName: 'parid'})
        if (!paramId || ids.has(paramId) || visible({context: params, row, fieldName: 'pid'}) !== id) throw new Error('来源参数身份或归属不唯一')
        ids.add(paramId)
        const name = visible({context: params, row, fieldName: 'parname'})
        if (!name || names.has(name)) throw new Error('来源参数名缺失或重复')
        names.add(name)
        fields.push(field({type: 'inputParams', Name: name,
          description: visible({context: params, row, fieldName: 'pardesc', optionalPresentation: true}),
          FieldType: visible({context: params, row, fieldName: 'parzdtype'}) || 'varchar',
          IsPKey: 0, IsOutput: 0}))
      }
    }
    this.assertCurrent()
    return Object.freeze({ source: current, model: Object.freeze({ Type: spec.label, MetaName: current.name,
      description: current.description, DbId: spec.dbid ? current.dbid : source.type === 'interface' ? current.providerId || id : id,
      DbName: current.databaseName, JoinType: '', ForeignKeyFields: '', JoinFilter: '', PId: '' }),
    fields: Object.freeze(fields) })
  }
}
