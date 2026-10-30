/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/json-data/content-client
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {unwrapAjaxResult} from '../../shared/http-record-guards.js'

export class JsonDataContentClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(jsonId: string): Promise<unknown> {
    const url = `/api/JsonData/GetJson?jsonId=${encodeURIComponent(jsonId)}`
    return unwrapAjaxResult(await this.http.post<unknown>(url, {}))
  }

  public async save(jsonId: string, payload: unknown): Promise<void> {
    const url = `/api/JsonData/SaveJsonData?jsonId=${encodeURIComponent(jsonId)}`
    unwrapAjaxResult(await this.http.post<unknown>(url, payload))
  }
}
