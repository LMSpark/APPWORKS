/**
 * @module app:lowcode/resources/pdf-inspect/lowcode-pdf-inspect
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../structured-config/structured-config-catalog'
import {attachPdfInspectDesignEdit} from './pdf-inspect-design-ops'

export class LowcodePdfInspect {
  static readonly navigationScenarioId = 'D0A6B3C4E5F6789012CDEF0123456789'
  static readonly catalogMetaName = '_Base_PdfInspectRule'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('PDF 识别')
    return loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'rowid', direction: 'asc'}]},
        {metaName: 'Base_UserInfo'},
      ],
    })
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('PDF 识别')
    const dataSet = await this.loadCatalog(scenarioId)
    attachPdfInspectDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
