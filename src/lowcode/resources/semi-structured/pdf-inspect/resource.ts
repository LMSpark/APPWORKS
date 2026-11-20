/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'
import {APPLICATION_CATALOG_PROJECT_ID} from '@/services/application-scope'

export class LowcodePdfInspect {
  static readonly navigationScenarioId = PDF_INSPECTION_SCENARIO_ID
  static readonly catalogMetaName = 'Base_FileInspectConfig'

  static async loadCatalog(scenarioId: string, expectedProjectId?: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('PDF目录场景身份不匹配')
    const projectId = expectedProjectId === APPLICATION_CATALOG_PROJECT_ID
      ? APPLICATION_CATALOG_PROJECT_ID : lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    if (expectedProjectId !== undefined && expectedProjectId !== projectId) throw new Error('PDF目录导航与当前执行应用不一致')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string, expectedProjectId?: string): Promise<DataSet> {
    if (expectedProjectId === APPLICATION_CATALOG_PROJECT_ID) throw new Error('请进入已授权应用后设计 PDF 规则')
    return this.loadCatalog(scenarioId, expectedProjectId)
  }
}
