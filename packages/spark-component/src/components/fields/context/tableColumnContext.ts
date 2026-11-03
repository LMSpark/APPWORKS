/**
 * @module @spark-appworks/spark-component:components/fields/context/tableColumnContext
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/tableColumnContext 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/tableColumnContext 的声明、导出和使用边界时，从本模块开始。
 */
import type { ComputedRef, InjectionKey } from 'vue'

export const TABLE_COLUMN_RESIZABLE_KEY: InjectionKey<ComputedRef<boolean>> = Symbol('spark-table-column-resizable')

/** 表格查询排序能力；标准字段在最终列渲染时收窄显式 sortable。 */
export const TABLE_COLUMN_SORTING_KEY: InjectionKey<ComputedRef<boolean>> = Symbol('spark-table-column-sorting')
