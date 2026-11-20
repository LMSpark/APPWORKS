/**
 * @module @spark-appworks/spark-component:components/fields/data-components/picker/FieldTransfer/FieldTransfer.props
 * 职责：定义 FieldTransfer（r-transfer）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field transfer 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../../../shared-types'

/** Transfer 已选值数组；每一项对应穿梭框选项的 value。 */
export type TransferValue = Array<string | number>

/** RTransfer Props 的属性契约。 */
export type RTransferProps = SparkNodeProps & SparkOptionFieldProps<TransferValue> & {
  /** 左右面板标题。 */
    titles?: [string, string]
    /** 候选项过滤输入框占位文案。 */
    filterPlaceholder?: string
    /** 目标面板排序策略。 */
    targetOrder?: 'original' | 'push' | 'unshift'}
