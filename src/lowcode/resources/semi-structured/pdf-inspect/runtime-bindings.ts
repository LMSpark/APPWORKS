/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/runtime-bindings
 * 职责：把正式 PDF 场景的历史投影接入 SPARK Data。
 * 边界：沿当前应用作用域读取服务端分页，运行时绑定不创建任务。
 * AI用途：核对 PDF 历史视图的授权、资源身份和生命周期。
 */
import { PdfInspectionApi, pdfInspectionReadonlyBinding } from '@spark-appworks/spark-lowcode-api'
import type { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { isRecord } from '@spark-appworks/spark-utils'
import type { LowcodeDataSpaceAssemblerInput } from '@/lowcode/data-space/lowcode-data-space-assembler'

export const PDF_INSPECTION_SCENARIO_ID = 'A2D63AB2AAEF156E7727094A23AEA433'
export const PDF_INSPECTION_HISTORY_TABLE = 'PdfInspectionHistory'

/** 只给已声明历史资源的正式场景装配绑定。 */
export function createPdfInspectionProjectionBindings(input: ConstructorParameters<typeof PdfInspectionApi>[0] & Readonly<{
  config: ScenarioViewConfig
  assertCurrent: () => void
}>): NonNullable<LowcodeDataSpaceAssemblerInput['projectionBindings']> {
  if (input.config.scenarioId !== PDF_INSPECTION_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  if (!isRecord(tables) || !Object.hasOwn(tables, PDF_INSPECTION_HISTORY_TABLE)) return {}
  const history = tables[PDF_INSPECTION_HISTORY_TABLE]
  if (!isRecord(history) || history['resourceType'] !== 'logical-view' ||
    history['resourceId'] !== 'pdf-inspect:history' || Object.hasOwn(history, 'modelBinding')) {
    throw Error('PDF_INSPECTION_HISTORY_BINDING: 历史资源声明不匹配')
  }
  return {
    [PDF_INSPECTION_HISTORY_TABLE]: view => {
      const api = new PdfInspectionApi(input)
      const assertCurrent = () => {
        input.assertCurrent()
        if (view.destroyed || view.dataSet?.getView(PDF_INSPECTION_HISTORY_TABLE) !== view) {
          throw Error('PDF_INSPECTION_HISTORY_STALE: 历史视图已失效')
        }
      }
      return pdfInspectionReadonlyBinding({api, kind: 'history', assertCurrent})
    },
  }
}
