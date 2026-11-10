import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import applicationManagerScenario from '../../../../config/pages/application/application-manager/pagedata.json'
import {ApiBackend, createApiService, models, pagedata} from '../../page/api-provider/api-provider.fixture'

export const APPLICATION_MANAGER_SCENARIO = '0C70F74793F9E858B71E0DBDEC784D57'
export const APPLICATION_MANAGER_PATH = '/features/application/application-manager/ui/application-manager-page'

const config = JSON.stringify(applicationManagerScenario)
pagedata[APPLICATION_MANAGER_SCENARIO] = config

const records = Array.from({length: 23}, (_, index) => ({
  rowid: `APP-${index + 1}`,
  lingma_sys_ent: `TENANT-${index + 1}`,
  EntShortName: `enterprise ${index + 1}`,
  AppName: index === 1 ? 'beta needle' : index % 2 === 0 ? 'alpha' : 'beta',
  AppDesc: index === 0 ? 'needle description' : `fixture record ${index + 1}`,
  WebUrl: `/apps/APP-${index + 1}`,
  AppType: String(index % 6 + 1),
  DeveloperName: `developer ${index + 1}`,
  publisher_ent: `publisher ${index + 1}`,
  CreateTime: `2025-01-${String(index % 28 + 1).padStart(2, '0')}`,
}))
const statusRecords = ['策划', '开发', '测试', '运行', '维护', '停用'].map((txt, index) => ({
  rowid: `STATUS-${index + 1}`,
  val: String(index + 1),
  txt,
  ordIdx: index + 1,
}))
const relationRecords = records.map((application, index) => ({
  rowid: `RELATION-${index + 1}`,
  sysid: application.rowid,
  type: 'database',
  conid: `DATABASE-${index + 1}`,
  conName: `database ${index + 1}`,
  isRef: 0,
}))
const databaseRecords = relationRecords.map((relation, index) => ({
  Id: relation.conid,
  Name: `database name ${index + 1}`,
}))
const ownerRecords = [{rowid: 'OWNER-1', EntityPKValue: 'APP-1', UserIdField: 'USER-1'}]

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
    if (!isRecord(page) || typeof page['index'] !== 'number' || typeof page['size'] !== 'number'
      || !isRecord(response.data) || !isRecord(response.data['Result'])
      || !isRecord(response.data['Result']['data']) || !Array.isArray(response.data['Result']['data']['Items'])) {
      throw new Error('应用管理夹具缺少正式分页请求或结果')
    }
    const queryResult = response.data['Result']['data']
    const items = queryResult['Items']
    if (!Array.isArray(items)) throw new Error('应用管理夹具缺少正式分页行')
    queryResult['Items'] = items.slice((page['index'] - 1) * page['size'], page['index'] * page['size'])
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
  pagedata[APPLICATION_MANAGER_SCENARIO] = config
  const data = {
    Base_AppSystemList: records,
    应用系统状态: statusRecords,
    Base_AppAndSource_Relation: relationRecords,
    _base_dbInfo: databaseRecords,
    Base_MainBody_RoleUser: ownerRecords,
  }
  api.reset(data)
  api.service.readModelBatch.mockImplementation(({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) =>
    Promise.resolve(models(dataSpaceId).filter(model => metaNames.includes(model.metaName)).map(model =>
      model.metaName !== '_base_dbInfo' ? model : {...model, primaryKey: 'Id', fields: model.fields
        .filter(field => field.name !== 'rowid').map(field => ({...field, primaryKey: field.name === 'Id'}))})))
  const http = new ApplicationManagerBackend()
  http.primaryKeys['_base_dbInfo'] = 'Id'
  http.records = structuredClone(data)
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
