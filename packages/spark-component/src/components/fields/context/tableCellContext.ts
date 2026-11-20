/**
 * @module @spark-appworks/spark-component:components/fields/context/tableCellContext
 * 职责：标识标准字段当前处于表格单元格呈现宿主。
 * 边界：只控制呈现，原视图和原行身份由FIELD_ROW_CONTEXT承接。
 * AI用途：标准控件避免重复创建单元格宿主时使用此标记。
 */
import type {InjectionKey} from 'vue'

export const TABLE_FIELD_CELL: InjectionKey<true> = Symbol('spark-field-cell')
