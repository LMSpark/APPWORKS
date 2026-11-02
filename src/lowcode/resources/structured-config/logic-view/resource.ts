/**
 * @module app:lowcode/resources/structured-config/logic-view/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi, lowcodeHttp} from '../../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../catalog'
import {attachLogicViewDesignEdit} from './design-ops'

export class LowcodeLogicView {
  static readonly navigationScenarioId = 'EB720370EF06A5A656838F87E0716D6B'
  static readonly catalogMetaName = 'Base_DataViewList'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
    const dataSet = await loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'rowid', direction: 'asc'}]},
        {metaName: 'Base_UserInfo', fields: ['ID', 'ROWID', 'UserName']},
        {metaName: 'Base_AppSystemList', fields: ['rowid', 'AppDesc', 'AppName']},
      ],
    })
    try {
    const catalog = dataSet.getView(this.catalogMetaName, 'default'), apps = dataSet.getView('Base_AppSystemList', 'default')
    const table = dataSet.getTable(this.catalogMetaName)
    if (!catalog || !apps || !table) throw new Error('逻辑视图目录缺少正式视图')
    catalog.commitMode = 'staged'; catalog.lockCurrentWhilePending = true
    table.updateColumn('name', {required: true, immutable: true, trim: 'normalize'})
    table.updateColumn('sysid', {required: true, immutable: true})
    apps.valueField = 'rowid'; apps.labelField = 'AppDesc'
    return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
    const dataSet = await this.loadCatalog(scenarioId)
    attachLogicViewDesignEdit({dataSet, http: lowcodeHttp, guard: assertCurrent, readScope: () => lowcodeApi.readRequestScope()})
    return dataSet
  }
}
