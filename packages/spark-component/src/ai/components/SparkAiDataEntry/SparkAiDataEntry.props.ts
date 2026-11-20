/**
 * @module @spark-appworks/spark-component:ai/components/SparkAiDataEntry/SparkAiDataEntry.props
 * 职责：定义通用AI批量新增renderer允许的页面配置属性。
 * 边界：只接收目标视图、标题和禁用态；Agent ID、系统提示词和字段schema由应用host及正式模型提供。
 * AI用途：页面配置只声明完整DataView绑定，不复制模型字段或AI配置。
 */
import type {SparkNodeProps} from '../../../components/shared-types'

/** 通用AI批量新增renderer的页面属性。 */
export type SparkAiDataEntryProps = SparkNodeProps & Readonly<{
  /** 必须是当前PageRuntime可解析的完整数据空间ID@模型名称@视图名称绑定。 */
  dataViewKey: string
  /** 录入区域标题；不包含Agent配置或系统提示词。 */
  title?: string
  /** 暂时禁用本组件交互，不改变DataView数据权限。 */
  disabled?: boolean
}>
