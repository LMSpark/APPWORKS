/**
 * @module @spark-appworks/spark-data:script-types
 * 职责：提供 spark-data 数据管线中的 script types 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 页面脚本共享类型 — 依赖 spark-data 类型的数据结构
 *
 * 这些类型原是 spark-project-model 中 `script-context-types.ts` 的 InScript 类型，
 * 提取到 spark-data 以在正确层级复用。
 */

import type { DataPermissionSnapshot, DataRow, FieldVisibility } from './types'

/** 权限动作上下文（脚本可用） */
export type PermissionActionContext = {
    /** model Permission 字段。 */
permissionSnapshot?: DataPermissionSnapshot | null
    /** 当前行数据。 */
row?: DataRow | null
}

/** 字段渲染状态（脚本可用） */
export type FieldRenderState = {
    /** field 字段。 */
field: string
    /** visibility 字段。 */
visibility: FieldVisibility
    /** readable 字段。 */
readable: boolean
    /** editable 字段。 */
editable: boolean
    /** display Value 字段。 */
displayValue: string | undefined
    /** 是否 should Render。 */
shouldRender: boolean
}
