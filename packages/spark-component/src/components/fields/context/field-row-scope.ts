/**
 * @module @spark-appworks/spark-component:components/fields/context/field-row-scope
 * 职责：解析标准字段绑定与其父数据容器提供的行作用域。
 * 边界：只有 DataView 身份相同时才把容器行用于显式字段绑定，不查询、不授权、不写入。
 * AI用途：需要理解显式 DataViewKey 与列表/表格行上下文如何相交时，从本模块核实身份判定。
 */
import { toRaw } from 'vue'
import type { DataRow, DataView } from '@spark-appworks/spark-data'

/** 显式字段绑定只继承相同 DataView 提供的行；其他场景使用既有 currentRow 回退。 */
export function selectFieldContextRow(input: {
  source: DataView | null | undefined
  inheritedSource: DataView | null | undefined
  inheritedRow: DataRow | null | undefined
  currentRow: DataRow | null | undefined
  explicit: boolean
}): DataRow | null {
  const sameView = input.source !== null && input.source !== undefined
    && input.inheritedSource !== null && input.inheritedSource !== undefined
    && toRaw(input.source) === toRaw(input.inheritedSource)
  if (input.explicit) return sameView ? input.inheritedRow ?? input.currentRow ?? null : input.currentRow ?? null
  return input.inheritedRow ?? input.currentRow ?? null
}
