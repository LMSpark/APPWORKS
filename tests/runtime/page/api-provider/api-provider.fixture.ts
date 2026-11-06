import {vi} from 'vitest'
import {DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import navigation from '../../../../config/pages/integration/api-provider/pagedata.json?raw'
import configuration from '../../../../config/pages/integration/api-config/pagedata.json?raw'
import interfaces from '../../../../config/pages/integration/api-interface/pagedata.json?raw'
import metadata from '../../../../config/pages/data-platform/data-space-design/pagedata.json?raw'

export const NAV = '8CBB62EBC873A38DB9E6EEF177AFC731', CONFIG = '446B5D94A71587E9BD4D325A4DF5F6F8', API = 'EC84BD89BDBDF46B1FE5132DD53836E5'
export const META='8D1AB14DD8277F3E7017CD38F77B09FD'
const metadataTables=(JSON.parse(metadata) as {tables:Record<string,Table>}).tables
const modelMetadata=metadataTables['Base_DataModel']!,sourceFieldMetadata=metadataTables['Base_TblField']!
export const pagedata: Record<string, string> = {[NAV]: navigation, [CONFIG]: configuration, [API]: interfaces,
 [META]:JSON.stringify({scenarioId:META,tables:{Base_DataModel:{modelBinding:modelMetadata.modelBinding,views:{default:{autoLoad:false,queryConfig:{fields:['rowid','Type','DbId','MetaName'],allPages:true}}}},
 Base_TblField:{modelBinding:sourceFieldMetadata.modelBinding,views:{default:{autoLoad:false,queryConfig:{fields:['rowid','tblid','enname','DataType','IsPKey'],allPages:true}}}}}})}
type Row = Record<string, unknown>
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type Table = {modelBinding: {modelId: string; modelName: string}; columns?: Array<{name: string}>; views: Record<string, {queryConfig?: {fields?: string[]}; filterExpression?: unknown}>}

const keys: Record<string, string> = {Base_UserInfo: 'ID', _Base_ParamList: 'parid'}
const extra: Record<string, string[]> = {Base_UserInfo: ['ROWID'], Base_InterfaceProvider_Account: ['ProviderID'],
  Base_TblField: ['DataType', 'IsPKey', 'tblname', 'Memo', 'description'],
  Base_Interface_PublicParam: ['providerId', 'paramName', 'interfaceId', 'outputfield', 'interfaceName', 'accessPath', 'desc']}

/** 按正式pagedata推导各空间的正式模型：字段取视图投影、列规则与过滤引用的并集。 */
export function models(scenarioId: string): FormalModel[] {
  const tables = (JSON.parse(pagedata[scenarioId]!) as {tables: Record<string, Table>}).tables
  return Object.entries(tables).map(([name, table]) => {
    const formalName=table.modelBinding.modelName
    const fields = new Set<string>([keys[formalName] ?? 'rowid', ...(extra[formalName] ?? [])])
    for (const column of table.columns ?? []) fields.add(column.name)
    for (const view of Object.values(table.views)) {
      for (const field of view.queryConfig?.fields ?? []) fields.add(field)
      for (const match of JSON.stringify(view.filterExpression ?? {}).matchAll(/"field":"([^"]+)"/g)) fields.add(match[1]!)
    }
    const pk = keys[formalName] ?? 'rowid', modelId = table.modelBinding.modelId
    return {id: modelId, name, metaName: formalName, sourceType: 'table', sourceId: 'DB', sourceName: formalName, primaryKey: pk, businessMain: false, raw: {},
      fields: [...fields].map((field, order) => ({id: `${modelId}-${field}`, modelId, name: field, canonicalName: field, primaryKey: field === pk,
        description: field, type: ['requiresAuth', 'IsPKey'].includes(field) ? 'number' : 'string', output: true, computed: false, order, orderType: '', raw: {}}))}
  })
}

/** 内存后端：按表保存记录，查询按过滤及调用参数筛选，保存写入记录并可模拟回执中断。 */
export class ApiBackend extends HttpClientBase {
  primaryKeys: Record<string, string> = {...keys}
  records: Record<string, Row[]> = {}
  reads: Array<{table: string; data: unknown}> = []
  saves: Array<{table: string; added: Row[]; changed: Row[]; deleted: Row[]}> = []
  denyDelete = new Set<string>()
  denyAdd = new Set<string>()
  failAfterWrite = false
  rejectNextSave = false
  hiddenFields:Record<string,string[]> = {}
  maskedFields:Record<string,string[]> = {}
  beforeSave?: () => Promise<void>
  beforeDefinitionRead?: (table:string)=>Promise<void>
  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    let result: unknown
    if (request.url === '/api/DataOperation/GetData') {
      const body = request.data as {Table: Array<{Name: string; Filter?: unknown; Fields: Array<{Name: string}>}>; InputParams?: Row; Params?: Row}
      const table = body.Table[0]!
      this.reads.push({table: table.Name, data: request.data})
      await this.beforeDefinitionRead?.(table.Name)
      let rows = this.records[table.Name] ?? []
      if (table.Filter) {
        const context = {...body.Params, ...body.InputParams}
        const resolved = JSON.parse(JSON.stringify(table.Filter, (_key, value: unknown) =>
          value && typeof value === 'object' && (value as Row)['Type'] === 'GetInputParam'
            ? {Type: 'GetConstValue', Value: context[String((value as Row)['ParamName'])] ?? null} : value)) as unknown
        const filter = new DataViewFilterLocal(DataViewFilterCodec.decode(resolved))
        rows = rows.filter(row => filter.matches(row))
      }
      const fields = table.Fields.map(field => field.Name)
      result = {primaryKeyField: this.primaryKeys[table.Name] ?? 'rowid', allowAdd: !this.denyAdd.has(table.Name), lingma_sys_key: 'table-key',
        data: {Items: rows.map(row => ({...Object.fromEntries(fields.map(field => [field, row[field]])), lingma_sys_key: 'row-key',
          lingma_sys_params: {r: [], e: fields, h: this.hiddenFields[table.Name]??[], m: this.maskedFields[table.Name]??[], d: !this.denyDelete.has(table.Name)}})), Count: rows.length}}
    } else if (request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      if(this.rejectNextSave){this.rejectNextSave=false;return{data:{Code:500,Message:'Rejected before write',Result:null},status:200,statusText:'OK',headers:{}}}
      await this.beforeSave?.()
      const maplistadd: Record<string, Row[]>[] = [], maplistedit: Record<string, Row[]>[] = [], maplistdelete: Record<string, Row[]>[] = []
      for (const group of request.data as Array<{TableName: string; CrudModel: {Added: Row[]; Changed: Row[]; Deleted: Row[]}}>) {
        const clean = (raw: Row) => {const row = {...raw}; delete row['lingma_sys_key']; delete row['lingma_sys_params']; return row}
        const pk = this.primaryKeys[group.TableName] ?? 'rowid', rows = this.records[group.TableName] ??= []
        const added = group.CrudModel.Added.map(clean), changed = group.CrudModel.Changed.map(clean), deleted = group.CrudModel.Deleted.map(clean)
        this.saves.push({table: group.TableName, added, changed, deleted})
        rows.push(...added.map(row => ({...row})))
        for (const row of changed) Object.assign(rows.find(item => item[pk] === row[pk])!, row)
        this.records[group.TableName] = rows.filter(item => !deleted.some(row => row[pk] === item[pk]))
        if (added.length) maplistadd.push({[group.TableName]: added})
        if (changed.length) maplistedit.push({[group.TableName]: changed})
        if (deleted.length) maplistdelete.push({[group.TableName]: deleted})
      }
      if (this.failAfterWrite) {this.failAfterWrite = false; throw new Error('回执中断')}
      result = {maplistadd, maplistedit, maplistdelete}
    } else throw new Error(`Unexpected ${request.url}`)
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}

/** 所有页面经同一个mock的lowcode-runtime读取正式pagedata与模型；返回的状态由各测试文件持有。 */
export function createApiService() {
  const service = {readSpaceDefinition: vi.fn(), readModelBatch: vi.fn(), readRequestScope: vi.fn(), readRelations: vi.fn()}
  const state: {http: ApiBackend; runtime: DataSpaceRuntimeApi} = {http: new ApiBackend(), runtime: undefined as never}
  const reset = (seed: Record<string, Row[]>) => {
    state.http = new ApiBackend()
    state.http.records = structuredClone(seed)
    service.readRequestScope.mockReturnValue({token: 'scope', headers: {'X-AppId': 'APP'}})
    service.readSpaceDefinition.mockImplementation(({dataSpaceId}: {dataSpaceId: string}) => Promise.resolve({dataSpaceId, name: dataSpaceId, raw: {}}))
    service.readModelBatch.mockImplementation(({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
      Promise.resolve(models(dataSpaceId).filter(model => metaNames.includes(model.metaName))))
    service.readRelations.mockResolvedValue([])
    state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: service.readRequestScope})
  }
  return {service, state, reset}
}

export const seed: Record<string, Row[]> = {
  Base_InterfaceProvider: [{rowid: 'P1', Name: '服务甲', BaseURL: 'https://a.test', TokenPrefix: 'Bearer ', updateuser: 'U1'},
    {rowid: 'P2', Name: '服务乙', BaseURL: 'https://b.test', TokenPrefix: ''}],
  Base_UserInfo: [{ID: 'U-PK', ROWID: 'U1', UserName: '修改人甲'}],
  Base_InterfaceProvider_Headers: [{rowid: 'H1', proId: 'P1', paramName: 'Authorization', paramValue: 'plain', type: 'auth'},
    {rowid: 'H2', proId: 'P2', paramName: 'Other', paramValue: '', type: 'all'}],
  Base_Interface_PublicParam: [{rowid: 'Q1', providerId: 'P1', paramName: 'access_token', desc: '令牌', interfaceId: 'I1', outputfield: 'token', interfaceName: '取令牌', accessPath: '/token'},
    {rowid: 'Q2', providerId: 'P2', paramName: 'other', desc: '', interfaceId: 'I3', outputfield: 'x'}],
  接口公共头部信息使用类型: [{rowid: 'T1', val: 'all', txt: '固定使用'}, {rowid: 'T2', val: 'auth', txt: '认证使用'}],
  Base_DataServiceInterface: [{rowid: 'I1', ProviderID: 'P1', Name: '取令牌', LinkUrl: '/token', request: 'POST', requiresAuth: 0},
    {rowid: 'I2', ProviderID: 'P1', Name: '查询', LinkUrl: '/query', request: 'GET', requiresAuth: 1},
    {rowid: 'I3', ProviderID: 'P2', Name: '其他', LinkUrl: '/other', request: 'GET', requiresAuth: 0}],
  Base_TblField: [{rowid: 'F1', tblid: 'I1', enname: 'token', cnname: '令牌', DataTypeName: 'string', DataType: 'string', IsPKey: 0, tblname: '取令牌', Memo: null, description: null},
    {rowid: 'F2', tblid: 'I2', enname: 'data', cnname: '数据', DataTypeName: 'string', DataType: 'string', IsPKey: 0, tblname: '查询', Memo: null, description: null}],
  _Base_ParamList: [{parid: 'A1', pid: 'I1', parname: 'user', pardesc: '用户', parzdtype: 'string'},
    {parid: 'A2', pid: 'I2', parname: 'keyword', pardesc: '关键词', parzdtype: 'string'}],
  Base_InterfaceApi_Headers: [{rowid: 'X1', interfaceId: 'I2', ParamName: 'X-Token', ParamDesc: '', ValueFun: 'plain'}],
  Base_InterfaceProvider_Account: [{rowid: 'C1', ProviderID: 'P1', UserName: 'acc'}],
  request: [{rowid: 'R1', val: 'GET', txt: 'GET'}, {rowid: 'R2', val: 'POST', txt: 'POST'}],
  ContentType: [{rowid: 'CT1', val: 'application/json', txt: 'json'}],
  接口参数类型: [{rowid: 'PT1', val: 'json', txt: 'JSON'}],
  ParamType: [{rowid: 'K1', val: 'string', txt: '文本'}, {rowid: 'K2', val: 'int', txt: '整数'}],
}
