/**
 * @module @spark-appworks/spark-component:page/actions/index
 * 职责：汇总导出 page/actions 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * Action 模块入口
 *
 * 单一动作真源：descriptor 类型 + executor + node 翻译器。
 */

export type {
  ActionDescriptor,
  ActionDescriptorActionName,
  ActionExecutionContext,
  ActionExecutionControl,
  ActionExecutionScope,
  ActionFormApi,
  ActionPromptConfig,
  ActionRowTarget,
  ActionUiDecorator,
  RouterLike,
  ShowMessageAction,
  ShowConfirmAction,
  ShowAlertAction,
  NavigateAction,
  OpenAction,
  SetFieldAction,
  AppendRowAction,
  DeleteAction,
  PatchAction,
  MoveAction,
  MessageRowAction,
  RefreshAction,
  ClearRowsAction,
  SubmitCurrentFormAction,
  HostCommandAction,
  DiscardChangesAction,
} from './action-types'

export { isActionDescriptor } from './action-types'
export { executeActionDescriptor } from './action-executor'
export type { ActionExecutionOptions } from './action-executor'
export { extractActionExecutionControl } from './action-executor'

export { nodeToActionDescriptor } from './node-to-descriptor'
export { getSelectedRows } from './executor-helpers'

export { isActionDescriptorDisabled } from './executor-helpers'
export { resolveButtonStyle } from './button-templates'
export type { ButtonTemplateProps, ResolvedButtonStyle } from './button-templates'

export {
  BUILTIN_ACTION_META,
  isBuiltinActionName,
  getBuiltinActionLabelByName,
  getBuiltinActionName,
  isBuiltinAction,
  getBuiltinActionLabel,
} from './executor-helpers'
export type { BuiltinActionName } from './executor-helpers'
