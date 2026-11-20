/**
 * @module @spark-appworks/spark-component:components/fields/context/row/fieldRowContext
 * 职责：传递标准字段的原视图与原行身份，不携带表格呈现语义。
 * 边界：仅定位同一DataView中的原对象，不查询、复制草稿或修改行指针。
 */
import type {InjectionKey} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'

/** 原行作用域；返回undefined表示该作用域不约束当前来源，null表示身份已失效。 */
export const FIELD_ROW_CONTEXT: InjectionKey<{
  /** 按字段实际来源解析原行。 */
  row(source: DataView | null | undefined): DataRow | null | undefined
}> = Symbol('spark-field-row-context')
