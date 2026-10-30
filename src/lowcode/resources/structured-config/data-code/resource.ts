/**
 * @module app:lowcode/resources/structured-config/data-code/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../catalog'
import {attachDataCodeDesignEdit} from './design-ops'

export class LowcodeDataCode {
  static readonly navigationScenarioId = 'A133D679691178F192D7E9DA06829506'
  static readonly catalogMetaName = '_Base_CodeDesign'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('编码')
    return loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'crttime', direction: 'desc'}, {field: 'rowid', direction: 'asc'}]},
        {metaName: 'Base_UserInfo'},
        {metaName: 'Base_StructureType', treeSelect: true},
      ],
    })
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('编码')
    const dataSet = await this.loadCatalog(scenarioId)
    attachDataCodeDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
