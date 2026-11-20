import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import organizationConfig from '../../../../config/pages/organization/organization-structure/pagedata.json?raw'
import {ApiBackend, createApiService, pagedata} from '../../page/api-provider/api-provider.fixture'

export const ORGANIZATION_SCENARIO = '4138A7C47ECB96EA85CA61A8A8B7191F'
export const ORGANIZATION_PATH = '/features/organization/organization-structure/ui/organization-structure-page'
export const api = createApiService()
pagedata[ORGANIZATION_SCENARIO] = organizationConfig

class OrganizationBackend extends ApiBackend {
  failNextRead = false

  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await super.executeRequest(request)
    if (request.url !== '/api/DataOperation/GetData') return response
    if (this.failNextRead) {
      this.failNextRead = false
      return {...response, data: {Code: 500, Message: '机构查询失败', Result: null}}
    }
    if (!isRecord(request.data) || !isRecord(request.data['PageParam'])
      || !isRecord(response.data) || !isRecord(response.data['Result'])
      || !isRecord(response.data['Result']['data']) || !Array.isArray(response.data['Result']['data']['Items'])) {
      throw new Error('机构夹具缺少正式分页请求或结果')
    }
    const page = request.data['PageParam']
    if (typeof page['index'] !== 'number' || typeof page['size'] !== 'number') throw new Error('机构夹具分页无效')
    const items = response.data['Result']['data']['Items']
    response.data['Result']['data']['Items'] = items.slice((page['index'] - 1) * page['size'], page['index'] * page['size'])
    return response
  }
}

export function resetOrganizationFixture(): OrganizationBackend {
  api.reset({})
  const http = new OrganizationBackend()
  http.records['Base_DepartInfo'] = Array.from({length: 23}, (_, index) => ({
    rowid: `row-${index + 1}`,
    DepName: `机构${index + 1}`,
    DepID: index === 1 ? '' : `D${index + 1}`,
    Prowid: `P${index + 1}`,
    DepLevel: `L${index + 1}`,
    CSR: `path-${index + 1}`,
  }))
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
