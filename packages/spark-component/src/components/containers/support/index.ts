/**
 * @module @spark-appworks/spark-component:components/containers/support/index
 * 职责：维护 @spark-appworks/spark-component 中 components/containers/support/index 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/containers/support/index 的声明、导出和使用边界时，从本模块开始。
 */
export {
  runControlledInteraction,
  createCancellableControl,
  isCancellableControl,
  createCancelledCrudResult,
} from './interactionControl.js'
export type {
  CancellableControl,
  InteractionControl,
  CancelableHandler,
  AddRowHandler,
  EditRowHandler,
  RemoveRowHandler,
  RowClickHandler,
  CurrentRowChangeHandler,
  RowSelectionHandler,
} from './interactionControl.js'

export {
  useEventDefaults,
} from './useEventDefaults.js'
export type {
  EventDefaultDeclaration,
  EventDispatcher,
} from './useEventDefaults.js'

export {
  isCrudResult,
  isCrudSuccess,
  getCrudErrorMessage,
} from './crud/crud-result-helpers.js'

export { createCrudEventDefaults, createCrudDispatcher } from './crud/crud-defaults.js'

export type {
  BaseCrudContainerApi,
  BaseContainerApi,
  VisibilityContainerApi,
} from './crud/base-container-api.js'

export { createBaseCrudMethods } from './crud/base-crud-methods.js'

export { createToolbarScope, createRowScope, createCurrentRowScope } from './scope/scopeFactories.js'
