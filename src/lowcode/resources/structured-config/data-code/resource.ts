/**
 * @module app:lowcode/resources/structured-config/data-code/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi, lowcodeHttp} from '../../../lowcode-runtime'
import {readStructuredConfigScope} from '../catalog'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {attachDataCodeDesignEdit} from './design-ops'

export class LowcodeDataCode {
  static readonly navigationScenarioId = 'A133D679691178F192D7E9DA06829506'
  static readonly catalogMetaName = 'Base_CodeDesign'

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('编码目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('编码')
    const dataSet = await this.loadCatalog(scenarioId)
    attachDataCodeDesignEdit(dataSet, lowcodeHttp, assertCurrent)
    return dataSet
  }
}
