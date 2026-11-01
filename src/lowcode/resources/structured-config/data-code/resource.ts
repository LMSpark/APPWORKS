/**
 * @module app:lowcode/resources/structured-config/data-code/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'

export class LowcodeDataCode {
  static readonly navigationScenarioId = 'A133D679691178F192D7E9DA06829506'
  static readonly catalogMetaName = 'Base_CodeDesign'
  static readonly designScenarioId = '868E62F90DB8118C74CDC9F6BCA61157'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('编码目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.designScenarioId) throw new Error('编码设计场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }
}
