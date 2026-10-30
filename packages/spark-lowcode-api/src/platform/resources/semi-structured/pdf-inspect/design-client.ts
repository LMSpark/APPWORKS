/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/pdf-inspect/design-client
 * PDF 规则设计（矩阵页；参考未进 inventory，URL 登记 api-gaps）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requireRecord, unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type PdfInspectRuleDocument = Readonly<{ruleId: string; rule: unknown}>

export class PdfInspectDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(ruleId: string): Promise<PdfInspectRuleDocument> {
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/PdfInspect/ReadRule', {ruleId}))
    const record = requireRecord(result, 'PDF 规则读取结果无效')
    return {ruleId, rule: record['rule'] ?? {}}
  }

  public async write(document: PdfInspectRuleDocument): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/PdfInspect/WriteRule', document))
  }
}
