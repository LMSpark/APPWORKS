/**
 * @module app:lowcode/resources/semi-structured/excel-import/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'

export class LowcodeExcelImport {
  static readonly navigationScenarioId = '36B01771C627B9BF5CD493DC75B996A1'
  static readonly catalogMetaName = 'Base_Import_solution'
  static readonly designScenarioId = '0F93B82141CF40852021D704B0E30BF4'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('Excel目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.designScenarioId) throw new Error('Excel设计场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }
}
