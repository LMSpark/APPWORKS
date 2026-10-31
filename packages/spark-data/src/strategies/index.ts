/**
 * @module @spark-appworks/spark-data:strategies/index
 * 职责：提供 spark-data 数据管线中的 index 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * strategies barrel export
 */
export { CrudDelegate } from './crud/crud-delegate'
export { CascadeDelegate } from './cascade/cascade-delegate'
export { SelectionDelegate } from './selection/selection-delegate'
export { LocalMutationDelegate } from './crud/local-mutation-delegate'
export { createCrudLifecycleEvent } from './crud/types'
export type { CrudOperation, CrudLifecycleEvent } from './crud/types'
