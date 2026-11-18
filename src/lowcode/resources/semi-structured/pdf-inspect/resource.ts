/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'
import type {APPLICATION_CATALOG_PROJECT_ID} from '@/services/application-scope'

export class LowcodePdfInspect {
  static readonly navigationScenarioId = PDF_INSPECTION_SCENARIO_ID
  static readonly catalogMetaName = 'Base_FileInspectConfig'

  static async loadCatalog(scenarioId: string, catalogProjectId?: typeof APPLICATION_CATALOG_PROJECT_ID): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('PDF目录场景身份不匹配')
    const projectId = catalogProjectId ?? lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    return this.loadCatalog(scenarioId)
  }
}
