/**
 * @module app:lowcode/resources/structured-config/workflow-definition/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi, lowcodeHttp} from '../../../lowcode-runtime'
import {readStructuredConfigScope} from '../catalog'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {attachWorkflowDesignEdit} from './design-ops'

export class LowcodeWorkflowDefinition {
  static readonly navigationScenarioId = '5E9676B1E38860B023921F48FB4370DE'
  static readonly catalogMetaName = 'Base_WorkflowDefinition'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('工作流目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('数据工作流')
    const dataSet = await this.loadCatalog(scenarioId)
    attachWorkflowDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
