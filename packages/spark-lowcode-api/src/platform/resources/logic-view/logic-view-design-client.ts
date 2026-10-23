/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/logic-view/logic-view-design-client
 * 职责：逻辑视图设计 JSON 的 read/write（ViewData 合同）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {unwrapAjaxResult} from '../shared/http-record-guards.js'

export type LogicViewDesignPayload = Readonly<{viewId: string; data: unknown}>

export class LogicViewDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(viewId: string): Promise<LogicViewDesignPayload> {
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/GetView', {viewId}))
    if (result === null || typeof result !== 'object') throw new Error('逻辑视图设计读取结果无效')
    const data = 'data' in result ? (result).data : result
    return {viewId, data}
  }

  public async write(payload: LogicViewDesignPayload): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/ViewData/SaveView', {viewId: payload.viewId, data: payload.data}))
  }
}
