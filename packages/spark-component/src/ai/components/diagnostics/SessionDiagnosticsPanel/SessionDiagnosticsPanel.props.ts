/**
 * @module @spark-appworks/spark-component:ai/components/diagnostics/SessionDiagnosticsPanel/SessionDiagnosticsPanel.props
 * 职责：维护 @spark-appworks/spark-component 中 ai/components/SessionDiagnosticsPanel.props 的模块能力，围绕 SessionDiagnosticsPanelProps 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 ai/components/SessionDiagnosticsPanel.props 的声明、导出和使用边界时，从本模块开始。
 */
import type { SessionDiagnosticsData } from '../../../types'

/** Session Diagnostics Panel Props 的属性契约。 */
export type SessionDiagnosticsPanelProps = Readonly<{
  /** 诊断数据投影（永远非 null，由外部 runtime 生成）；loading 期间内容可能不完整 */
  data: SessionDiagnosticsData
  /** 诊断数据仍在加载或刷新中；true 时 UI 应显示加载指示器，data 仍可用但不完整 */
  loading?: boolean
}>
