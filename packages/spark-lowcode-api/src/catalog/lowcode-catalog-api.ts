/**
 * 数据库元数据目录只读门面：从设计态 dataSpace（FormKey）拉取服务器/库/表/视图/字段快照。
 * 多 FormKey 时逐源容错合并；单表读取失败记入 `sourceErrors` 而非整包失败，解析资源前须检查对应 source。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'

export type LowcodeDatabaseServer = Readonly<{
  id: string
  type: string
  name: string
  host: string
  port: string
  description: string
}>

export type LowcodeDatabase = Readonly<{
  id: string
  serverId: string
  name: string
  type: string
  serverName: string
  schemaName: string
  state: number | null
  remark: string
}>

export type LowcodeDatabaseTable = Readonly<{
  id: string
  databaseId: string
  name: string
  description: string
  schemaName: string
  status: number | null
  objectId: number | null
  multiTenancy: boolean | null
}>

export type LowcodeDatabaseView = Readonly<{
  id: string
  databaseId: string
  name: string
  description: string
  schemaName: string
  status: number | null
  objectId: string
}>

export type LowcodeDatabaseField = Readonly<{
  id: string
  tableId: string
  tableName: string
  name: string
  label: string
  dataTypeName: string
  dataType: string
  length: string
  nullable: boolean | null
  primaryKey: boolean | null
  unique: boolean | null
  system: boolean | null
  defaultValue: string
  memo: string
  order: number | null
}>

/** 一次目录聚合结果；`sourceErrors` 非空表示部分底层表未成功读取，下游解析可能缺项或应 fail-fast。 */
export type LowcodeDatabaseCatalog = Readonly<{
  servers: readonly LowcodeDatabaseServer[]
  databases: readonly LowcodeDatabase[]
  tables: readonly LowcodeDatabaseTable[]
  views: readonly LowcodeDatabaseView[]
  fields: readonly LowcodeDatabaseField[]
  sourceErrors: readonly LowcodeCatalogSourceError[]
  sourceDataSpaces: Readonly<Record<string, string>>
}>

/** 单张目录源表读取失败记录；`source` 为内部 CatalogTable 标识，便于与 resolve 报错对齐。 */
export type LowcodeCatalogSourceError = Readonly<{
  source: string
  message: string
}>

export type LowcodeDatabaseResourceType = 'table' | 'view'

/** 在已加载 catalog 内定位表/视图的键；databaseId 与 resourceName 均须与目录行精确匹配。 */
export type LowcodeDatabaseResourceSelector = Readonly<{
  databaseId: string
  resourceName: string
  resourceType: LowcodeDatabaseResourceType
}>

/** 解析后的表/视图资源快照，含去歧义后的字段列表。 */
export type LowcodeDatabaseResource = Readonly<{
  id: string
  databaseId: string
  name: string
  description: string
  schemaName: string
  resourceType: LowcodeDatabaseResourceType
  fields: readonly LowcodeDatabaseField[]
}>

type CatalogTable = 'Base_serverInfo' | '_base_dbInfo' | '_Base_TblList' | '_Base_ViewList' | 'Base_TblField'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function queryItems(value: unknown, table: CatalogTable): ReadonlyArray<Record<string, unknown>> {
  if (!isRecord(value)) throw new LowcodeApiError(0, `${table} Result 不是对象`)
  const data = isRecord(value['data']) ? value['data'] : isRecord(value['Data']) ? value['Data'] : value
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (items === undefined || items === null) return []
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new LowcodeApiError(0, `${table} Result.items 不是对象数组`)
  }
  return items
}

function textValue(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function requiredId(row: Record<string, unknown>, table: CatalogTable): string {
  const id = textValue(row, ['rowid', 'ROWID', 'rowId', 'Id', 'ID'])
  if (!id) throw new LowcodeApiError(0, `${table} 行缺少主键`)
  return id
}

function nullableNumber(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (value === undefined || value === null || value === '') continue
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) throw new LowcodeApiError(0, `字段 ${key} 不是数字`)
    return number
  }
  return null
}

function nullableBoolean(row: Record<string, unknown>, keys: readonly string[]): boolean | null {
  const value = nullableNumber(row, keys)
  if (value === null) return null
  if (value === 0) return false
  if (value === 1) return true
  throw new LowcodeApiError(0, `字段 ${keys[0] ?? ''} 不是 0/1 布尔值`)
}

function field(name: string): Readonly<Record<string, unknown>> {
  return { Name: name, AsName: name, IsOutput: true }
}

function catalogQuery(table: CatalogTable, fields: readonly string[]): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: table,
      Type: '数据库表',
      Fields: fields.map(field),
    }],
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : String(error)
}

/** 数据库设计目录 API；所有读操作经 GetBaseData，依赖 x-FormKey 绑定 dataSpace。 */
export class LowcodeCatalogApi {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  /** 并行拉取五张目录表并归一化；FormKey 去重后逐个尝试，直至某源成功或全部失败。 */
  public async getDatabaseCatalog(dataSpaceIds: string | readonly string[]): Promise<LowcodeDatabaseCatalog> {
    const formKeys = [...new Set((typeof dataSpaceIds === 'string' ? [dataSpaceIds] : dataSpaceIds)
      .map((item) => item.trim())
      .filter(Boolean))]
    if (formKeys.length === 0) throw new LowcodeApiError(0, '数据库目录 dataSpaceId/FormKey 不能为空')
    const sources = await Promise.all([
      this.readSafe(formKeys, 'Base_serverInfo', ['rowid', 'Type', 'ServerName', 'ip_address', 'Port', 'description']),
      this.readSafe(formKeys, '_base_dbInfo', ['Id', 'serverId', 'Name', 'Type', 'ServerName', 'SchemaName', 'State', 'Remark']),
      this.readSafe(formKeys, '_Base_TblList', ['rowid', 'dbid', 'tblname', 'tbldesc', 'schemaName', 'status', 'object_id', 'multiTenancy']),
      this.readSafe(formKeys, '_Base_ViewList', ['rowid', 'dbid', 'vewname', 'vewdesc', 'SchemaName', 'status', 'object_id']),
      this.readSafe(formKeys, 'Base_TblField', [
        'rowid', 'tblid', 'tblname', 'enname', 'cnname', 'DataTypeName', 'DataType', 'DataLen',
        'IsNill', 'IsPKey', 'IsUQ', 'IsSys', 'DefaultValue', 'Memo', 'ordIdx',
      ]),
    ])
    const servers = sources[0].rows
    const databases = sources[1].rows
    const tables = sources[2].rows
    const views = sources[3].rows
    const fields = sources[4].rows
    return {
      servers: servers.map((row) => ({
        id: requiredId(row, 'Base_serverInfo'),
        type: textValue(row, ['Type']),
        name: textValue(row, ['ServerName']),
        host: textValue(row, ['ip_address']),
        port: textValue(row, ['Port']),
        description: textValue(row, ['description']),
      })),
      databases: databases.map((row) => ({
        id: requiredId(row, '_base_dbInfo'),
        serverId: textValue(row, ['serverId']),
        name: textValue(row, ['Name']),
        type: textValue(row, ['Type']),
        serverName: textValue(row, ['ServerName']),
        schemaName: textValue(row, ['SchemaName']),
        state: nullableNumber(row, ['State']),
        remark: textValue(row, ['Remark']),
      })),
      tables: tables.map((row) => ({
        id: requiredId(row, '_Base_TblList'),
        databaseId: textValue(row, ['dbid']),
        name: textValue(row, ['tblname']),
        description: textValue(row, ['tbldesc']),
        schemaName: textValue(row, ['schemaName']),
        status: nullableNumber(row, ['status']),
        objectId: nullableNumber(row, ['object_id']),
        multiTenancy: nullableBoolean(row, ['multiTenancy']),
      })),
      views: views.map((row) => ({
        id: requiredId(row, '_Base_ViewList'),
        databaseId: textValue(row, ['dbid']),
        name: textValue(row, ['vewname']),
        description: textValue(row, ['vewdesc']),
        schemaName: textValue(row, ['SchemaName', 'schemaName']),
        status: nullableNumber(row, ['status']),
        objectId: textValue(row, ['object_id']),
      })),
      fields: fields.map((row) => ({
        id: requiredId(row, 'Base_TblField'),
        tableId: textValue(row, ['tblid']),
        tableName: textValue(row, ['tblname']),
        name: textValue(row, ['enname']),
        label: textValue(row, ['cnname']),
        dataTypeName: textValue(row, ['DataTypeName']),
        dataType: textValue(row, ['DataType']),
        length: textValue(row, ['DataLen']),
        nullable: nullableBoolean(row, ['IsNill']),
        primaryKey: nullableBoolean(row, ['IsPKey']),
        unique: nullableBoolean(row, ['IsUQ']),
        system: nullableBoolean(row, ['IsSys']),
        defaultValue: textValue(row, ['DefaultValue']),
        memo: textValue(row, ['Memo']),
        order: nullableNumber(row, ['ordIdx']),
      })),
      sourceErrors: sources.flatMap((source) => source.error === null
        ? []
        : [{ source: source.table, message: source.error }]),
      sourceDataSpaces: Object.fromEntries(sources.flatMap((source) => source.formKey === null
        ? []
        : [[source.table, source.formKey]])),
    }
  }

  /**
   * 在内存 catalog 中解析单张表/视图及其字段；要求候选唯一且字段 id/name 无歧义。
   * 相关 source 曾失败或匹配不唯一时抛 `LowcodeApiError`，避免静默返回不完整资源。
   */
  public resolveDatabaseResource(
    catalog: LowcodeDatabaseCatalog,
    selector: LowcodeDatabaseResourceSelector,
  ): LowcodeDatabaseResource {
    const databaseId = selector.databaseId.trim()
    const resourceName = selector.resourceName.trim()
    if (!databaseId) throw new LowcodeApiError(0, '数据库资源 databaseId 不能为空')
    if (!resourceName) throw new LowcodeApiError(0, '数据库资源 resourceName 不能为空')
    const source = selector.resourceType === 'table' ? '_Base_TblList' : '_Base_ViewList'
    const sourceError = catalog.sourceErrors.find((item) => item.source === source)
    if (sourceError !== undefined) {
      throw new LowcodeApiError(0, `数据资源目录 ${source} 读取失败: ${sourceError.message}`)
    }
    const candidates = (selector.resourceType === 'table' ? catalog.tables : catalog.views)
      .filter((item) => item.databaseId === databaseId && item.name === resourceName)
    if (candidates.length === 0) {
      throw new LowcodeApiError(0, `数据资源未解析: ${databaseId}/${resourceName}`)
    }
    if (candidates.length > 1) {
      throw new LowcodeApiError(0, `数据资源目录存在歧义: ${databaseId}/${resourceName}`)
    }
    const resource = candidates[0]
    if (resource === undefined) throw new LowcodeApiError(0, '数据资源解析失败')
    const fieldsError = catalog.sourceErrors.find((item) => item.source === 'Base_TblField')
    if (fieldsError !== undefined) {
      throw new LowcodeApiError(0, `数据资源字段目录 Base_TblField 读取失败: ${fieldsError.message}`)
    }
    const fields = catalog.fields.filter((item) => item.tableId === resource.id)
    const fieldIds = fields.map((item) => item.id)
    const fieldNames = fields.map((item) => item.name)
    if (new Set(fieldIds).size !== fieldIds.length || new Set(fieldNames).size !== fieldNames.length) {
      throw new LowcodeApiError(0, `数据资源字段目录存在歧义: ${resource.id}`)
    }
    return {
      id: resource.id,
      databaseId: resource.databaseId,
      name: resource.name,
      description: resource.description,
      schemaName: resource.schemaName,
      resourceType: selector.resourceType,
      fields,
    }
  }

  private async readSafe(
    formKeys: readonly string[],
    table: CatalogTable,
    fields: readonly string[],
  ): Promise<Readonly<{
    table: CatalogTable
    rows: ReadonlyArray<Record<string, unknown>>
    error: string | null
    formKey: string | null
  }>> {
    const errors: string[] = []
    for (const formKey of formKeys) {
      try {
        return { table, rows: await this.read(formKey, table, fields), error: null, formKey }
      } catch (error) {
        errors.push(`${formKey}: ${errorMessage(error)}`)
      }
    }
    return { table, rows: [], error: errors.join('；'), formKey: null }
  }

  private async read(
    formKey: string,
    table: CatalogTable,
    fields: readonly string[],
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetBaseData',
      method: 'POST',
      data: catalogQuery(table, fields),
      headers: { 'x-FormKey': formKey },
    })
    return queryItems(result, table)
  }
}
