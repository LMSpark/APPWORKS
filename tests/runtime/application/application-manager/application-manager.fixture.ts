import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import applicationManagerScenario from '../../../../config/pages/application/application-manager/pagedata.json'
import databaseRelationsScenario from '../../../../config/pages/application/database-relations/pagedata.json'
import reportScenario from '../../../../config/pages/integration/report-management/pagedata.json'
import {ApiBackend, createApiService, models, pagedata} from '../../page/api-provider/api-provider.fixture'

export const APPLICATION_MANAGER_SCENARIO = '0C70F74793F9E858B71E0DBDEC784D57'
export const DATABASE_RELATIONS_SCENARIO = '93DF05182084B1F0E8DA7283E83BBE0C'
export const USER_SCENARIO = 'FB291E325272007AEED8921C28B93CFD'
export const APPLICATION_MANAGER_PATH = '/features/application/application-manager/ui/application-manager-page'
export const OWNER_ROLE = 'C80FF642A38841FF91D2953C4103E917'

/** 线上元数据的数字列类型（含 tinyint 与大写 INT）；其余沿通用夹具按字符串声明。 */
const NUMERIC_FIELDS = new Map([['isRef', 'INT'], ['isdel', 'int'], ['IsSys', 'int'], ['IsProjectRelation', 'int'],
  ['isSass', 'tinyint'], ['isWeChat', 'int'], ['IsShowAtNav', 'int'], ['NavigationOrderValue', 'int'],
  ['NavigationShowType', 'int'], ['NavigationType', 'int'], ['Port', 'int']])
const scenarios = {
  [APPLICATION_MANAGER_SCENARIO]: JSON.stringify(applicationManagerScenario),
  [DATABASE_RELATIONS_SCENARIO]: JSON.stringify(databaseRelationsScenario),
  [USER_SCENARIO]: JSON.stringify(reportScenario),
}

const records = Array.from({length: 23}, (_, index) => ({
  rowid: `APP-${index + 1}`,
  lingma_sys_ent: `TENANT-${index + 1}`,
  AppName: index === 1 ? 'beta needle' : index % 2 === 0 ? 'alpha' : 'beta',
  AppDesc: index === 0 ? 'needle description' : `fixture record ${index + 1}`,
  WebUrl: `/apps/APP-${index + 1}`,
  AppType: String(index % 6 + 1),
  DeveloperName: `developer ${index + 1}`,
  CreateTime: `2025-01-${String(index % 28 + 1).padStart(2, '0')} 08:00:00`,
  Memo: '', IsProjectRelation: 0, isSass: 0, isWeChat: 0, Icon: '', WeChatUrl: '', WeChartimg: '',
  CreateUser: 'USER-1', EntId: 'ENT-1', isdel: 0, IsSys: 1,
}))
const statusRecords = ['策划', '开发', '测试', '运行', '维护', '停用'].map((txt, index) => ({
  rowid: `STATUS-${index + 1}`, val: String(index + 1), txt, ordIdx: index + 1,
}))
const relationRecords = records.map((application, index) => ({
  rowid: `RELATION-${index + 1}`, sysid: application.rowid, type: 'database',
  conid: `DATABASE-${index + 1}`, conName: `database ${index + 1}`, cnName: `数据库 ${index + 1}`, isRef: 0,
}))
const databaseRecords = Array.from({length: 3}, (_, index) => ({
  Id: `DATABASE-${index + 1}`, Name: `database ${index + 1}`, ServerName: `server ${index + 1}`, Port: 3306 + index,
  Type: 'MySql', SchemaName: '', Remark: `数据库 ${index + 1}`,
}))
const ownerRecords = [{rowid: 'OWNER-1', EntityPKValue: 'APP-1', sysId: 'APP-1', UserIdField: 'USER-1', RoleIdField: OWNER_ROLE, CategoryID: '1'}]
const navigationRecords = [
  {rowid: 'APP-6', modid: 'APP-6', prowid: '000000', SysId: 'APP-6', FunName: 'fixture record 6'},
  {rowid: 'APP-12', modid: 'APP-12', prowid: '000000', SysId: 'APP-12', FunName: 'fixture record 12'},
  {rowid: 'NAV-CHILD-12', modid: 'NAV-CHILD-12', prowid: 'APP-12', SysId: 'APP-12', FunName: 'child'},
]
const userRecords = [{ID: 'USER-1', rowid: 'USER-1', UserName: '张三'}, {ID: 'USER-2', rowid: 'USER-2', UserName: '李四'}]

class ApplicationManagerBackend extends ApiBackend {
  failNextTable = ''
  private nextReadHold: {table: string; promise: Promise<void>} | undefined

  holdNextRead(table: string): () => void {
    let release = () => {}
    const promise = new Promise<void>(resolve => {release = resolve})
    this.nextReadHold = {table, promise}
    return release
  }

  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await super.executeRequest(request)
    if (request.url !== '/api/DataOperation/GetData' || !isRecord(request.data)) return response
    const tableList = request.data['Table']
    if (!Array.isArray(tableList) || !isRecord(tableList[0]) || typeof tableList[0]['Name'] !== 'string') {
      throw new Error('应用管理夹具缺少正式查询表身份')
    }
    const tableName = tableList[0]['Name']
    if (this.failNextTable === tableName) {
      this.failNextTable = ''
      return {...response, data: {Code: 500, Message: '应用目录查询失败', Result: null}}
    }
    const page = request.data['PageParam']
    if (isRecord(page) && typeof page['index'] === 'number' && typeof page['size'] === 'number'
      && isRecord(response.data) && isRecord(response.data['Result']) && isRecord(response.data['Result']['data'])) {
      const queryResult = response.data['Result']['data']
      const items = queryResult['Items']
      if (Array.isArray(items)) queryResult['Items'] = items.slice((page['index'] - 1) * page['size'], page['index'] * page['size'])
    }
    const hold = this.nextReadHold
    if (hold?.table === tableName) {
      this.nextReadHold = undefined
      await hold.promise
    }
    return response
  }
}

export const api = createApiService()

export function resetApplicationManagerFixture(): ApplicationManagerBackend {
  Object.assign(pagedata, scenarios)
  const data = {
    Base_AppSystemList: records,
    应用系统状态: statusRecords,
    Base_AppAndSource_Relation: relationRecords,
    _base_dbInfo: databaseRecords,
    db_relation_sel: databaseRecords,
    Base_MainBody_RoleUser: ownerRecords,
    Base_NavigationInfo: navigationRecords,
    Base_UserInfo: userRecords,
  }
  api.reset(data)
  api.service.readModelBatch.mockImplementation(({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
    Promise.resolve(models(dataSpaceId).filter(model => metaNames.includes(model.metaName)).map(model => ({...model, fields: model.fields
      .map(field => ({...field, type: NUMERIC_FIELDS.get(field.name) ?? field.type}))})).map(model =>
      !['_base_dbInfo', 'db_relation_sel'].includes(model.metaName) ? model : {...model, primaryKey: 'Id', fields: model.fields
        .filter(field => field.name !== 'rowid').map(field => ({...field, primaryKey: field.name === 'Id'}))})))
  const http = new ApplicationManagerBackend()
  http.primaryKeys['_base_dbInfo'] = 'Id'
  http.primaryKeys['db_relation_sel'] = 'Id'
  http.records = structuredClone(data)
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
