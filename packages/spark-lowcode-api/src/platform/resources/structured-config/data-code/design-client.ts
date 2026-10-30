/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/data-code/design-client
 * 职责：编码方案设计 detail/save 的 HTTP 适配（参考 DataCodeEdit，路径以实服为准）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requireRecord, unwrapAjaxResult} from '../../shared/http-record-guards.js'

export class DataCodeDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async readDetail(codeDesignId: string): Promise<Record<string, unknown>> {
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/Codeing/GetCodeDesignDetail', {codeDesignId}))
    return requireRecord(result, '编码方案读取结果无效')
  }

  public async saveDetail(codeDesignId: string, detail: Record<string, unknown>): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/Codeing/SaveCodeDesign', {codeDesignId, ...detail}))
  }
}
