/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/logic-view/design-client
 * 职责：逻辑视图对象数组的 read/write（ViewData 合同），保存须有正式成功回执。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {DesignResourceRejection, unwrapAjaxResult} from '../../shared/http-record-guards.js'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract.js'

export type LogicViewDesignPayload = Readonly<{viewId: string; data: unknown}>

/** 只核传输结构，保留节点、字段、子树和未知业务成员，不重建设计。 */
function parseLogicViewDesign(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new DesignResourceRejection('逻辑视图设计必须是对象数组')
  const rows: Array<Record<string, unknown>> = []
  const items: readonly unknown[] = value
  for (const item of items) {
    if (!isDesignRecord(item)) throw new DesignResourceRejection('逻辑视图设计必须是对象数组')
    rows.push(item)
  }
  return rows
}

function isDesignRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export class LogicViewDesignClient {
  /** 本次正式DataSet的场景及当前执行域；不借用目录外的应用或身份。 */
  public constructor(private readonly http: HttpClientBase,
    private readonly context: Readonly<{scenarioId: string; readScope: () => DataSpaceRequestScope}>) {}

  private captureScope() {
    const scope = this.context.readScope(), scenarioId = this.context.scenarioId.trim(), applicationId = scope.headers['X-AppId']
    if (!scope.token.trim() || !scenarioId || !applicationId?.trim()) throw new Error('逻辑视图缺少正式应用、场景或执行域')
    const headers = Object.fromEntries(Object.entries(scope.headers).filter(([key]) => key.toLowerCase() !== 'x-formkey'))
    return {token: scope.token, applicationId, headers: {...headers, 'X-FormKey': scenarioId}}
  }

  private assertCurrent(scope: ReturnType<LogicViewDesignClient['captureScope']>): void {
    const current = this.context.readScope()
    if (current.token !== scope.token || current.headers['X-AppId'] !== scope.applicationId) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 逻辑视图执行域已变化')
    }
  }

  public async read(viewId: string): Promise<LogicViewDesignPayload> {
    const id = viewId.trim()
    if (!id) throw new Error('逻辑视图 viewId 不能为空')
    const scope = this.captureScope()
    let result: unknown
    try {
      result = unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/GetView', undefined, {params: {viewId: id}, headers: scope.headers}))
      this.assertCurrent(scope)
    } catch (error) {
      this.assertCurrent(scope)
      // 目录记录存在但从未保存过设计 JSON 时，后端把文件服务的“文件不存在”业务失败层层包装后返回；
      // 这是合法的“尚未设计”状态（对照 JsonDataServiceImpl 对同一场景的处理），不是真实故障。
      if (error instanceof DesignResourceRejection && error.message.includes('文件不存在')) return {viewId: id, data: []}
      throw error
    }
    if (result === null || typeof result !== 'object') throw new Error('逻辑视图设计读取结果无效')
    const data = 'data' in result ? (result).data : result
    return {viewId: id, data: parseLogicViewDesign(data)}
  }

  public async write(payload: LogicViewDesignPayload): Promise<void> {
    const id = payload.viewId.trim()
    if (!id) throw new Error('逻辑视图 viewId 不能为空')
    const data = parseLogicViewDesign(payload.data)
    const scope = this.captureScope()
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/SaveView', {viewId: id, data}, {headers: scope.headers}))
    this.assertCurrent(scope)
    if (result !== '保存成功') throw new Error('逻辑视图保存回执无效，须通过原保存入口核验结果')
  }
}
