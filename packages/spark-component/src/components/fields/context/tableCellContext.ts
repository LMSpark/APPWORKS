/**
 * @module @spark-appworks/spark-component:components/fields/context/tableCellContext
 * 职责：为标准字段单元格传递原DataView及原始行身份。
 * 边界：内部上下文键，不复制数据、不改行指针；绑定层验证行归属后沿原编辑及权限链消费。
 * AI用途：扩展表格内标准字段控件时复用此身份链，不逐组件维护独立行草稿。
 */
import type {InjectionKey} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'

export const TABLE_FIELD_CELL: InjectionKey<{
  /** DataView which owns the rendered cell. */
  source(): DataView | undefined
  /** Original rendered row; membership is checked by the normal field binding. */
  row(): DataRow
}> = Symbol('spark-field-cell')
