/**
 * @module app:lowcode/resources/structured-config/logic-view/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../catalog'
import {attachLogicViewDesignEdit} from './design-ops'

export class LowcodeLogicView {
  static readonly navigationScenarioId = 'EB720370EF06A5A656838F87E0716D6B'
  static readonly catalogMetaName = 'Base_DataViewList'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
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
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
    const dataSet = await this.loadCatalog(scenarioId)
    attachLogicViewDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
