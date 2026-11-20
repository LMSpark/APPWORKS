import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import organizationConfig from '../../../../config/pages/organization/organization-structure/pagedata.json?raw'
import {ApiBackend, createApiService, pagedata} from '../../page/api-provider/api-provider.fixture'

export const USER_NAVIGATION = '1B7FD70E326717B8E4B611D0431FFCBA'
export const ORGANIZATION_SCENARIO = '4138A7C47ECB96EA85CA61A8A8B7191F'
export const USER_PATH = '/features/organization/user-management/ui/user-management-page'
export const api = createApiService()
pagedata[ORGANIZATION_SCENARIO] = organizationConfig

class UserBackend extends ApiBackend {
  failNextTable = ''

  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await super.executeRequest(request)
    if (request.url !== '/api/DataOperation/GetData') return response
    const own = this.reads.find(read => read.data === request.data)
    if (own?.table === this.failNextTable) {
      this.failNextTable = ''
      return {...response, data: {Code: 500, Message: '目录查询失败', Result: null}}
    }
    if (!isRecord(request.data) || !isRecord(request.data['PageParam'])
      || !isRecord(response.data) || !isRecord(response.data['Result'])
      || !isRecord(response.data['Result']['data']) || !Array.isArray(response.data['Result']['data']['Items'])) {
      throw new Error('人员夹具缺少正式分页请求或结果')
    }
    const page = request.data['PageParam']
    if (typeof page['index'] !== 'number' || typeof page['size'] !== 'number') throw new Error('人员夹具分页无效')
    const items = response.data['Result']['data']['Items']
    response.data['Result']['data']['Items'] = items.slice((page['index'] - 1) * page['size'], page['index'] * page['size'])
    return response
  }
}

export function resetUserFixture(): UserBackend {
  api.reset({})
  const http = new UserBackend()
  http.records['View_UserDJAndDepCSR'] = Array.from({length: 14}, (_, index) => ({
    rowid: `dj-${index + 1}`,
    UserName: `人员${index + 1}`,
    UserID: `U${index + 1}`,
    DepName: index % 2 === 0 ? '机构甲' : '机构乙',
    DepID: index % 2 === 0 ? 'D1' : 'D2',
    JobName: `岗位${index + 1}`,
  }))
  http.records['Base_DepartInfo'] = [
    {rowid: 'dep-1', DepID: 'D1', DepName: '机构甲'},
    {rowid: 'dep-2', DepID: 'D2', DepName: '机构乙'},
    {rowid: 'dep-empty', DepID: '', DepName: '空标识机构'},
  ]
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
