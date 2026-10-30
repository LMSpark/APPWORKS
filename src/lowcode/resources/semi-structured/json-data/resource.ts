/**
 * @module app:lowcode/resources/semi-structured/json-data/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeHttp} from '../../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../../structured-config/catalog'
import {attachJsonContentEdit} from './content-ops'

export class LowcodeJsonData {
  static readonly navigationScenarioId = 'B8E4F1A2C3D4567890ABCDEF01234567'
  static readonly catalogMetaName = 'Base_JsonData'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('JSON 数据')
    return loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'name', direction: 'asc'}]},
        {metaName: 'Base_UserInfo'},
      ],
    })
  }

  /** 目录 + 内容编辑视图（页面唯一 DataSet 入口）。 */
  static async loadPage(scenarioId: string): Promise<DataSet> {
    const dataSet = await this.loadCatalog(scenarioId)
    const {assertCurrent} = readStructuredConfigScope('JSON 数据')
    attachJsonContentEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
