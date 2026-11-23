/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/runtime-bindings
 * 职责：把正式 PDF 场景的限制、历史、结果与恢复投影接入 SPARK Data。
 * 边界：沿当前应用作用域读取原任务，运行时只读绑定不创建任务。
 * AI用途：核对 PDF 查询视图的授权、资源身份和生命周期。
 */
import { PdfInspectionApi, pdfInspectionReadonlyBinding } from '@/platform-adapters/api'
import type { ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { isRecord } from '@spark-appworks/spark-utils'
import type { LowcodeDataSpaceAssemblerInput } from '@/platform-adapters/data-space/lowcode-data-space-assembler'

export const PDF_INSPECTION_SCENARIO_ID = 'A2D63AB2AAEF156E7727094A23AEA433'
export const PDF_INSPECTION_HISTORY_TABLE = 'PdfInspectionHistory'
const projections = {
  [PDF_INSPECTION_HISTORY_TABLE]: 'history',
  PdfInspectionLimits: 'limits',
  PdfInspectionResult: 'result',
  PdfInspectionRecovery: 'recover',
} as const

/** 只给正式场景已声明的 PDF 资源装配绑定。 */
export function createPdfInspectionProjectionBindings(input: ConstructorParameters<typeof PdfInspectionApi>[0] & Readonly<{
  config: ScenarioViewConfig
  assertCurrent: () => void
}>): NonNullable<LowcodeDataSpaceAssemblerInput['projectionBindings']> {
  if (input.config.scenarioId !== PDF_INSPECTION_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  if (!isRecord(tables)) return {}
  const bindings: Record<string, NonNullable<LowcodeDataSpaceAssemblerInput['projectionBindings']>[string]> = {}
  for (const [table, kind] of Object.entries(projections)) {
    if (!Object.hasOwn(tables, table)) continue
    const declared = tables[table]
    if (!isRecord(declared) || declared['resourceType'] !== 'logical-view' ||
      declared['resourceId'] !== `pdf-inspect:${kind}` || Object.hasOwn(declared, 'modelBinding')) {
      throw Error(`PDF_INSPECTION_PROJECTION_BINDING: ${table} 资源声明不匹配`)
    }
    bindings[table] = view => {
      const api = new PdfInspectionApi(input)
      const assertCurrent = () => {
        input.assertCurrent()
        if (view.destroyed || view.dataSet?.getView(table) !== view) {
          throw Error('PDF_INSPECTION_PROJECTION_STALE: 查询视图已失效')
        }
      }
      return pdfInspectionReadonlyBinding({api, kind, assertCurrent})
    }
  }
  return bindings
}
