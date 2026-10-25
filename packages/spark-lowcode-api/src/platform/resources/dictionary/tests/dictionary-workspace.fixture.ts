import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceRuntimeApi} from '../../../data-space/runtime/data-space-runtime-api'
import type {DataSpaceDesignApi} from '../../../data-space/design/data-space-design-api'
import {DictionarySchema} from '../dictionary-schema'
import {DictionaryWorkspace} from '../dictionary-workspace'

const definitionFields = ['rowid', 'AppId', 'TypeName', 'dictionaryType', 'functiondesc', 'crttime', ...DictionarySchema.fields.map(field => field.titleField)]
const entryFields = ['rowid', 'typeid', 'ordIdx', 'crttime', 'createuser', ...DictionarySchema.fields.map(field => field.name)]
const aiEntryFields = new Set(['ordIdx', 'createuser', 'exVal_4', 'val', 'txt'])
export const initialDefinition = {rowid: 'D1', AppId: 'APP', TypeName: '配色', dictionaryType: '0', val: '代码', txt: '名称',
  secondValue: '色号', thirdValue: '类别', fourthvalue: '用途', fiveValue: '说明', functiondesc: ''}
export const initialEntry = {rowid: 'E1', typeid: 'D1', ordIdx: 1, val: '00', txt: '白', exVal_1: '#fff', exVal_2: '基础', exVal_3: '', exVal_4: null}
type Row = Record<string, unknown>
export class DictionaryHttp extends HttpClientBase {
  records: Record<string, Row[]> = {_Base_DictType: [{...initialDefinition}], _Base_DictData: [{...initialEntry}]}
  appRows: Row[] = [{rowid: 'APP', AppDesc: '应用说明', AppName: '应用名称'}]
  saves: RequestConfig[] = []
  reads: RequestConfig[] = []
  denied: string[] = []
  deniedByRow: Record<string, string[]> = {}
  hidden: string[] = []
  masked: string[] = []
  denyDeleteIds: string[] = []
  allowAdd = true
  scopeToken = 'scope'
  responseLimit?: number
  failBeforeWrite = false
  failAfterWrite = false
  rejectWrite?: {code: number; message: string}
  failReads = false
  failReadAt?: number
  beforeRead?: (config: RequestConfig) => Promise<void>
  afterWriteBeforeFailure?: (config: RequestConfig) => void
  afterResponse?: (config: RequestConfig) => Promise<void>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    let result: unknown
    if (config.url === '/api/DataOperation/GetData') {
      this.reads.push(config)
      await this.beforeRead?.(config)
      if (this.failReads || this.failReadAt === this.reads.length) throw new Error('读取失败')
      const body = config.data as {Table: Array<{Name: string}>}
      const name = body.Table[0]!.Name
      const table = body.Table[0] as {Fields?: Array<{Name?: string; OrderType?: string | null; Order?: number}>}
      const rows = [...(name === 'Base_AppSystemList' ? this.appRows : this.records[name] ?? [])]
      const orderedFields = (table.Fields ?? []).filter(field => field.Name && field.OrderType
        && typeof field.Order === 'number' && field.Order > 0).sort((left, right) => right.Order! - left.Order!)
      rows.sort((left, right) => {
        for (const field of orderedFields) {
          const a = left[field.Name!], b = right[field.Name!]
          const comparison = typeof a === 'number' && typeof b === 'number'
            ? a - b : String(a ?? '').localeCompare(String(b ?? ''))
          if (comparison) return field.OrderType === 'descending' ? -comparison : comparison
        }
        return 0
      })
      result = {primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: `table-${name}`,
        data: {Items: (this.responseLimit === undefined ? rows : rows.slice(0, this.responseLimit)).map(row => ({...row, lingma_sys_key: `row-${row['rowid']}`, lingma_sys_params: {
          r: [], e: (name === '_Base_DictType' ? definitionFields : name === '_Base_DictData' ? entryFields : ['rowid', 'AppDesc', 'AppName'])
            .filter(field => !this.denied.includes(field) && !this.deniedByRow[String(row['rowid'])]?.includes(field)),
          h: this.hidden, m: this.masked, d: !this.denyDeleteIds.includes(String(row['rowid'])),
        }})), Count: rows.length}}
    } else if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saves.push(config)
      if (this.rejectWrite) return {data: {Code: this.rejectWrite.code, Message: this.rejectWrite.message}, status: 200,
        statusText: 'OK', headers: {}}
      if (this.failBeforeWrite) throw new Error('请求发出前失败')
      const buckets: Record<string, Array<Record<string, Row[]>>> = {maplistadd: [], maplistedit: [], maplistdelete: []}
      for (const group of config.data as Array<{TableName: string; CrudModel: {Added: Row[]; Changed: Row[]; Deleted: Row[]}}>) {
        const rows = this.records[group.TableName] ?? []
        for (const [kind, bucket] of [['Added', 'maplistadd'], ['Changed', 'maplistedit'], ['Deleted', 'maplistdelete']] as const) {
          const output: Row[] = []
          for (const raw of group.CrudModel[kind]) {
            const row = {...raw}; delete row['lingma_sys_key']; delete row['lingma_sys_params']
            const index = rows.findIndex(item => item['rowid'] === row['rowid'])
            if (kind === 'Added') rows.push(row)
            else if (kind === 'Changed') rows[index] = {...rows[index], ...row}
            else rows.splice(index, 1)
            output.push(kind === 'Changed' ? {...rows[index]} : row)
          }
          if (output.length) buckets[bucket]!.push({[group.TableName]: output})
        }
        this.records[group.TableName] = rows
      }
      if (this.failAfterWrite) {this.afterWriteBeforeFailure?.(config); throw new Error('回执中断')}
      result = buckets
    } else throw new Error(`Unexpected ${config.url}`)
    await this.afterResponse?.(config)
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}
export function fixture(http = new DictionaryHttp(), create = false, scenarioId = 'SCENE', requiredFields: readonly string[] = [],
  ordIdxBounds: Readonly<{min?: number; max?: number}> = {},
  columnOverrides: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {}) {
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: http.scopeToken, headers: {'X-AppId': 'APP'}})})
  const models = Object.entries({_Base_DictType: definitionFields, _Base_DictData: entryFields}).map(([modelName, fields]) => ({
    id: `${modelName}-id`, name: modelName, metaName: modelName, sourceType: 'table', sourceId: 'DB', sourceName: modelName,
    primaryKey: 'rowid', businessMain: false, raw: {}, fields: fields.map((fieldName, order) => ({id: fieldName,
      modelId: `${modelName}-id`, name: fieldName, canonicalName: fieldName, primaryKey: fieldName === 'rowid', description: fieldName,
      type: columnOverrides[fieldName]?.['type'] === 'number' ? 'number' : columnOverrides[fieldName]?.['type'] === 'string' ? 'string'
        : fieldName === 'ordIdx' ? 'tinyint' : 'string', output: true, computed: false, order, orderType: '',
      allowAIAdd: columnOverrides[fieldName]?.['allowAIAdd'] === false ? false : modelName === '_Base_DictData' && aiEntryFields.has(fieldName), raw: {}})),
  })) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
  const dataSet = DataSet.fromJson({scenarioId, tables: Object.fromEntries(models.map(model => [model.metaName, {
    modelBinding: {modelId: model.id, modelName: model.metaName},
    columns: model.fields.map(field => ({name: field.name, type: field.type, isPrimaryKey: field.primaryKey,
      allowAIAdd: field.allowAIAdd === true,
      ...(field.name === 'ordIdx' ? ordIdxBounds : {}),
      ...(columnOverrides[field.name] ?? {}),
      ...(requiredFields.includes(`${model.metaName}.${field.name}`) ? {required: true} : {})})),
    views: {default: {autoCurrentFirst: false, autoSelectFirst: false}},
  }]))})
  for (const model of models) runtime.bindModelView(dataSet.getView(model.metaName, 'default')!, model)
  const workspace = new DictionaryWorkspace({dataSet, dictionaryId: 'D1', create})
  return {dataSet, workspace, http}
}

/** Separate application option space with real DataView query permissions for page integration tests. */
export async function applicationOptionsFixture(http: DictionaryHttp, scenarioId: string) {
  const fields = ['rowid', 'AppDesc', 'AppName']
  const model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>> = {id: 'Base_AppSystemList-model', name: 'Base_AppSystemList', metaName: 'Base_AppSystemList',
    sourceType: 'table', sourceId: 'DB', sourceName: 'Base_AppSystemList', primaryKey: 'rowid', businessMain: false, raw: {},
    fields: fields.map((name, order) => ({id: name, modelId: 'Base_AppSystemList-model', name, canonicalName: name,
      primaryKey: name === 'rowid', description: name, type: 'string', output: true, computed: false, order, orderType: '', raw: {}}))}
  const dataSet = DataSet.fromJson({scenarioId, tables: {Base_AppSystemList: {
    modelBinding: {modelId: model.id, modelName: model.metaName},
    columns: model.fields.map(field => ({name: field.name, type: field.type, isPrimaryKey: field.primaryKey})),
    views: {default: {valueField: 'rowid', labelField: 'AppDesc', queryConfig: {allPages: true}}},
  }}})
  const view = dataSet.getView('Base_AppSystemList', 'default')!
  new DataSpaceRuntimeApi({http, readScope: () => ({token: http.scopeToken, headers: {'X-AppId': 'APP'}})}).bindModelView(view, model)
  await view.refresh()
  if (view.loadingError) {dataSet.destroy(); throw view.loadingError}
  return dataSet
}

