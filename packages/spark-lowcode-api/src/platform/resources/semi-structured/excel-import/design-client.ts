/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/excel-import/design-client
 * Excel 设计 JSON（参考 ExcelImportConfigConfigSet；URL 待实服核）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requireRecord, unwrapAjaxResult} from '../../shared/http-record-guards.js'

export type ExcelImportDesignDocument = Readonly<{importConfigId: string; layout: unknown; rules: unknown}>

export class ExcelImportDesignClient {
  public constructor(private readonly http: HttpClientBase) {}

  public async read(importConfigId: string): Promise<ExcelImportDesignDocument> {
    const result = unwrapAjaxResult(await this.http.post<unknown>('/api/ExcelImport/ReadDesign', {importConfigId}))
    const record = requireRecord(result, 'Excel 导入设计读取结果无效')
    return {
      importConfigId,
      layout: record['layout'] ?? [],
      rules: record['rules'] ?? [],
    }
  }

  public async write(document: ExcelImportDesignDocument): Promise<void> {
    unwrapAjaxResult(await this.http.post<unknown>('/api/ExcelImport/WriteDesign', document))
  }
}
