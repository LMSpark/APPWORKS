/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/dictionary/application-query
 * 职责：复用应用级GetData字典合同读取完整原行，供DataView资源及既有设计读取适配。
 * 边界：不是场景模型，不伪造模型身份或写权限；保留真实rowid，不由代码值生成主键。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../../core/lowcode-client'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract'
import {collectDataSpaceQueryPages} from '../../../data-space/runtime/protocol/data-space-pagination'

type Row = Readonly<Record<string, unknown>>
/** 应用字典来源和宿主执行域；不接受场景/模型身份。 */
export type ApplicationDictionaryResourceOptions = Readonly<{
  http: HttpClientBase; readScope: () => DataSpaceRequestScope; name: string; assertCurrent?: () => void
}>
export function captureApplicationDictionaryQuery(options: ApplicationDictionaryResourceOptions): Readonly<{readRows: () => Promise<readonly Row[]>; assertCurrent: () => void}> {
  return captureDictionaryQuery(options, true)
}

/** 企业目录只读字典：由宿主捕获登录身份，不伪造应用头或场景模型。 */
export function captureAuthenticatedDictionaryQuery(options: ApplicationDictionaryResourceOptions): ReturnType<typeof captureApplicationDictionaryQuery> {
  return captureDictionaryQuery(options, false)
}

function captureDictionaryQuery(options: ApplicationDictionaryResourceOptions, applicationRequired: boolean): Readonly<{readRows: () => Promise<readonly Row[]>; assertCurrent: () => void}> {
  options.assertCurrent?.()
  const name = options.name.trim(), scope = options.readScope()
  if (!name || !scope.token.trim() || applicationRequired && !Object.entries(scope.headers).some(([key, value]) => key.toLowerCase() === 'x-appid' && typeof value === 'string' && value.trim().length > 0)) throw Error('SPARK_EXECUTION_SCOPE_REQUIRED: 应用字典需要名称及当前应用身份')
  const assertCurrent = () => {
    options.assertCurrent?.()
    if (options.readScope().token !== scope.token) throw Error('SPARK_EXECUTION_SCOPE_STALE: 原应用字典查询身份已失效')
  }
  const headers = Object.fromEntries(Object.entries(scope.headers).filter(([key]) => key.toLowerCase() !== 'x-formkey'))
  headers['x-FormKey'] = ''
  const client = new LowcodeClient(options.http)
  return {assertCurrent, readRows: async () => {
    const collection = await collectDataSpaceQueryPages(async page => {
      assertCurrent()
      const result = await client.requestResult({path: '/api/DataOperation/GetData', method: 'POST', headers,
        data: {Table: [{Name: name, Type: '字典', PrimaryKeyFields: 'rowid', OutputType: 'Table', Filter: null, inputParams: [], DISTINCT: false, IsBusinessMain: 1}], PageParam: page}})
      assertCurrent()
      const data = isRecord(result) ? result['data'] ?? result['Data'] : undefined
      if (!isRecord(data)) throw Error('应用字典响应缺少data')
      const rows = data['Items'] ?? data['items'] ?? data['List'] ?? data['list']
      if (!Array.isArray(rows) || !rows.every(isRecord)) throw Error('应用字典Items不是对象数组')
      return {rows, total: data['Count'] ?? data['Total'] ?? data['TotalCount'] ?? data['count'] ?? data['total'] ?? data['totalCount']}
    }, {pageSize: 500, maxRows: 50_000, assertCurrent, key: row => row['rowid']})
    assertCurrent()
    return collection.rows
  }}
}
