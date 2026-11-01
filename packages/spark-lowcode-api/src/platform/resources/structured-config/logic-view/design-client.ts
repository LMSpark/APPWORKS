/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/logic-view/design-client
 * 职责：逻辑视图设计 JSON 的 read/write（ViewData 合同）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {DesignResourceRejection, unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type LogicViewDesignPayload = Readonly<{viewId: string; data: unknown}>

export class LogicViewDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(viewId: string): Promise<LogicViewDesignPayload> {
    const id = viewId.trim()
    if (!id) throw new Error('逻辑视图 viewId 不能为空')
    let result: unknown
    try {
      result = unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/GetView', undefined, {params: {viewId: id}}))
    } catch (error) {
      // 目录记录存在但从未保存过设计 JSON 时，后端把文件服务的“文件不存在”业务失败层层包装后返回；
      // 这是合法的“尚未设计”状态（对照 JsonDataServiceImpl 对同一场景的处理），不是真实故障。
      if (error instanceof DesignResourceRejection && error.message.includes('文件不存在')) return {viewId: id, data: {}}
      throw error
    }
    if (result === null || typeof result !== 'object') throw new Error('逻辑视图设计读取结果无效')
    const data = 'data' in result ? (result).data : result
    return {viewId: id, data}
  }

  public async write(payload: LogicViewDesignPayload): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/SaveView', {viewId: payload.viewId, data: payload.data}))
  }
}
