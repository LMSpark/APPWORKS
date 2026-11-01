/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'

export class LowcodePdfInspect {
  static readonly navigationScenarioId = 'A2D63AB2AAEF156E7727094A23AEA433'
  static readonly catalogMetaName = 'Base_FileInspectConfig'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('PDF目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    return this.loadCatalog(scenarioId)
  }
}
