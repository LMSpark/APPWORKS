/**
 * @module @spark-appworks/spark-component:components/fields/data-components/choice/FieldSegmented/FieldSegmented.props
 * 职责：定义 FieldSegmented（r-segmented）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field segmented 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps, SparkOptionFieldProps } from '../../../../shared-types'

/** 分段控件候选项直接使用原生联合类型，不再额外导出基础类型包装。 */

export type RSegmentedProps = SparkNodeProps & SparkOptionFieldProps<string | number, string | number | { label: string; value: string | number; disabled?: boolean }> & {
  /** 尺寸 */
    size?: 'large' | 'default' | 'small'
    /** 是否占满容器宽度 */
    block?: boolean}
