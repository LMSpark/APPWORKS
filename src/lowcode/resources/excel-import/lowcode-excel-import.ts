/**
 * @module app:lowcode/resources/excel-import/lowcode-excel-import
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../structured-config/structured-config-catalog'
import {attachExcelImportDesignEdit} from './excel-import-design-ops'

export class LowcodeExcelImport {
  static readonly navigationScenarioId = 'C9F5A2B3D4E5678901BCDEF012345678'
  static readonly catalogMetaName = '_Base_ImportConfig'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('Excel 导入')
    return loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'crttime', direction: 'desc'}]},
        {metaName: 'Base_UserInfo'},
      ],
    })
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('Excel 导入')
    const dataSet = await this.loadCatalog(scenarioId)
    attachExcelImportDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
