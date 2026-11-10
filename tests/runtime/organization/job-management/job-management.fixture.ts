import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import jobConfig from '../../../../config/pages/organization/job-management/pagedata.json?raw'
import {ApiBackend, createApiService, pagedata} from '../../page/api-provider/api-provider.fixture'

export const JOB_SCENARIO = '0A835EB88AAC2BDFBDE344477C6827BB'
export const JOB_PATH = '/features/organization/job-management/ui/job-management-page'
export const api = createApiService()
pagedata[JOB_SCENARIO] = jobConfig

class JobBackend extends ApiBackend {
  failNextTable = ''

  protected override async executeRequest(request: RequestConfig): Promise<HttpResponse<unknown>> {
    const response = await super.executeRequest(request)
    if (request.url !== '/api/DataOperation/GetData') return response
    const last = this.reads[this.reads.length - 1]
    if (last?.table === this.failNextTable) {
      this.failNextTable = ''
      return {...response, data: {Code: 500, Message: '目录查询失败', Result: null}}
    }
    if (!isRecord(request.data) || !isRecord(request.data['PageParam'])
      || !isRecord(response.data) || !isRecord(response.data['Result'])
      || !isRecord(response.data['Result']['data']) || !Array.isArray(response.data['Result']['data']['Items'])) {
      throw new Error('岗位夹具缺少正式分页请求或结果')
    }
    const page = request.data['PageParam']
    if (typeof page['index'] !== 'number' || typeof page['size'] !== 'number') throw new Error('岗位夹具分页无效')
    const items = response.data['Result']['data']['Items']
    response.data['Result']['data']['Items'] = items.slice((page['index'] - 1) * page['size'], page['index'] * page['size'])
    return response
  }
}

export function resetJobFixture(): JobBackend {
  api.reset({})
  const http = new JobBackend()
  http.records['Base_JobInfo'] = Array.from({length: 23}, (_, index) => ({
    rowid: `job-${index + 1}`,
    JobName: `岗位${index + 1}`,
    JobCode: `J${index + 1}`,
    DepName: index % 2 === 0 ? '机构甲' : '',
    Depid: index % 2 === 0 ? 'D1' : 'D2',
    DepLevel: `L${index + 1}`,
  }))
  http.records['Base_DepartInfo'] = [
    {rowid: 'dep-1', DepID: 'D1', DepName: '机构甲'},
    {rowid: 'dep-2', DepID: 'D2', DepName: ''},
    {rowid: 'dep-empty', DepID: '', DepName: '空标识机构'},
  ]
  api.state.http = http
  api.state.runtime = new DataSpaceRuntimeApi({http, readScope: api.service.readRequestScope})
  return http
}
