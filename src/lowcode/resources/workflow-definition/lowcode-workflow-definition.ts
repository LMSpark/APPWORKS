/**
 * @module app:lowcode/resources/workflow-definition/lowcode-workflow-definition
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../structured-config/structured-config-catalog'
import {attachWorkflowDesignEdit} from './workflow-design-ops'

export class LowcodeWorkflowDefinition {
  static readonly navigationScenarioId = '5E9676B1E38860B023921F48FB4370DE'
  static readonly catalogMetaName = '_Base_DataWorkFlow'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('数据工作流')
    return loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'crttime', direction: 'desc'}, {field: 'rowid', direction: 'asc'}]},
        {metaName: 'Base_UserInfo'},
      ],
    })
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('数据工作流')
    const dataSet = await this.loadCatalog(scenarioId)
    attachWorkflowDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
