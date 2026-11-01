/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/json-data/content-client
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {unwrapAjaxResult} from '../../shared/http-record-guards.js'

/** 既有JSON树接口的传输适配；业务JSON文档与六字段树行之间的转换不在HTTP层猜测。 */
export class JsonDataContentClient {
  public constructor(private readonly http: HttpClientBase) {}

  /** 只接受服务端真实树行数组；null、对象或提示文本都不是空文档。 */
  public async read(jsonId: string): Promise<readonly unknown[]> {
    const url = `/api/JsonData/GetJson?jsonId=${encodeURIComponent(jsonId)}`
    const tree = unwrapAjaxResult(await this.http.post<unknown>(url, {}))
    if (!Array.isArray(tree)) throw new Error('JSON_CONTENT_TREE_REQUIRED: JSON内容读取未返回真实树行数组')
    return Array.from<unknown>(tree)
  }

  /** 提交完整树行数组；普通JSON文档必须先由语义层转换，非法形状在请求前拒绝。 */
  public async save(jsonId: string, payload: unknown): Promise<void> {
    if (!Array.isArray(payload)) throw new SyntaxError('JSON_CONTENT_TREE_REQUIRED: JSON内容保存必须提交树行数组')
    const url = `/api/JsonData/SaveJsonData?jsonId=${encodeURIComponent(jsonId)}`
    unwrapAjaxResult(await this.http.post<unknown>(url, payload))
  }
}
