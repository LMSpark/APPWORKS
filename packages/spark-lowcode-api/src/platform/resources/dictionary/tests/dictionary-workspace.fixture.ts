import {DataSet} from '@spark-appworks/spark-data'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {DataSpaceRuntimeApi} from '../../../data-space/runtime/data-space-runtime-api'
import type {DataSpaceDesignApi} from '../../../data-space/design/data-space-design-api'
import {DictionarySchema} from '../dictionary-schema'
import {DictionaryWorkspace} from '../dictionary-workspace'

const definitionFields = ['rowid', 'AppId', 'TypeName', 'dictionaryType', 'functiondesc', ...DictionarySchema.fields.map(field => field.titleField)]
const entryFields = ['rowid', 'typeid', 'ordIdx', ...DictionarySchema.fields.map(field => field.name)]
export const initialDefinition = {rowid: 'D1', AppId: 'APP', TypeName: '配色', dictionaryType: '0', val: '代码', txt: '名称',
  secondValue: '色号', thirdValue: '类别', fourthvalue: '用途', fiveValue: '说明', functiondesc: ''}
export const initialEntry = {rowid: 'E1', typeid: 'D1', ordIdx: 1, val: '00', txt: '白', exVal_1: '#fff', exVal_2: '基础', exVal_3: '', exVal_4: null}
type Row = Record<string, unknown>
export class DictionaryHttp extends HttpClientBase {
  records: Record<string, Row[]> = {_Base_DictType: [{...initialDefinition}], _Base_DictData: [{...initialEntry}]}
  saves: RequestConfig[] = []
  reads: RequestConfig[] = []
  denied: string[] = []
  hidden: string[] = []
  masked: string[] = []
  denyDeleteIds: string[] = []
  allowAdd = true
  failAfterWrite = false
  afterResponse?: (config: RequestConfig) => Promise<void>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    let result: unknown
    if (config.url === '/api/DataOperation/GetData') {
      this.reads.push(config)
      const body = config.data as {Table: Array<{Name: string}>}
      const name = body.Table[0]!.Name
      const rows = this.records[name] ?? []
      result = {primaryKeyField: 'rowid', allowAdd: this.allowAdd, lingma_sys_key: `table-${name}`,
        data: {Items: rows.map(row => ({...row, lingma_sys_key: `row-${row['rowid']}`, lingma_sys_params: {
          r: [], e: (name === '_Base_DictType' ? definitionFields : entryFields).filter(field => !this.denied.includes(field)),
          h: this.hidden, m: this.masked, d: !this.denyDeleteIds.includes(String(row['rowid'])),
        }})), Count: rows.length}}
    } else if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      this.saves.push(config)
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
      if (this.failAfterWrite) throw new Error('回执中断')
      result = buckets
    } else throw new Error(`Unexpected ${config.url}`)
    await this.afterResponse?.(config)
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}
export function fixture(http = new DictionaryHttp(), create = false, scenarioId = 'SCENE') {
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const models = Object.entries({_Base_DictType: definitionFields, _Base_DictData: entryFields}).map(([name, fields]) => ({
    id: `${name}-id`, name, metaName: name, sourceType: 'table', sourceId: 'DB', sourceName: name,
    primaryKey: 'rowid', businessMain: false, raw: {}, fields: fields.map((name, order) => ({id: name,
      modelId: `${name}-id`, name, canonicalName: name, primaryKey: name === 'rowid', description: name,
      type: name === 'ordIdx' ? 'tinyint' : 'string', output: true, computed: false, order, orderType: '', raw: {}})),
  })) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
  const dataSet = DataSet.fromJson({scenarioId, tables: Object.fromEntries(models.map(model => [model.metaName, {
    modelBinding: {modelId: model.id, modelName: model.metaName},
    columns: model.fields.map(field => ({name: field.name, type: field.type, isPrimaryKey: field.primaryKey})),
    views: {default: {autoCurrentFirst: false, autoSelectFirst: false}},
  }]))})
  for (const model of models) runtime.bindModelView(dataSet.getView(model.metaName, 'default')!, model)
  const workspace = new DictionaryWorkspace({dataSet, dictionaryId: 'D1', applicationId: 'APP', create})
  return {dataSet, workspace, http}
}

