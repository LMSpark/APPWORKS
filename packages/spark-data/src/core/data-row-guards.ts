/**
 * @module @spark-appworks/spark-data:core/data-row-guards
 * 职责：提供数据层 data-row-guards 能力，围绕 模块入口、副作用注册或内部组合逻辑 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 core/data-row-guards 的数据语义。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { DataRow } from '../types'

export function isDataRow(value: unknown): value is DataRow {
  return isRecord(value)
}
