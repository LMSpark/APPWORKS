/**
 * @module @spark-appworks/spark-component:permission/PermissionResolver
 * 职责：提供 Permission Resolver 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 权限动作解析器 — 纯函数集
 *
 * 将节点动作映射到 DataView 的原查询权限入口。
 * 合并了动作权限相关的模型/行级判断。
 */

import {
  nodeInputProp,
  type SparkNode,
  type DataView,
  type DataRow,
} from '@spark-appworks/spark-data'
/** Permission Action Name 的语义模型。 */
type PermissionActionName =
  | 'create'
  | 'import'
  | 'export'
  | 'create-child'
  | 'delete'
  | 'edit'

/** Permission Action 的语义模型。 */
type PermissionAction = PermissionActionName | (string & {})

type ResolvedPermAction = {
  action?: PermissionAction}

function resolveNodePermAction(node: SparkNode): ResolvedPermAction {
  const explicitPermAction = nodeInputProp(node, 'permAction')
  if (typeof explicitPermAction === 'string' && explicitPermAction.length > 0) {
    return { action: explicitPermAction }
  }

  const builtinAction = nodeInputProp(node, 'action')
  if (typeof builtinAction !== 'string' || builtinAction.length === 0) return {}

  switch (builtinAction) {
    case 'append-row':
    case 'prompt-append':
      return { action: 'create' }
    case 'delete-row':
    case 'delete-current':
    case 'delete-selected':
      return { action: 'delete' }
    case 'prompt-edit':
    case 'patch-row':
    case 'patch-current':
    case 'patch-selected':
    case 'move-row':
    case 'move-current':
    case 'submit-current-form':
      return { action: 'edit' }
    default:
      return {}
  }
}

/** 是否为行级权限动作（edit/delete/create-child） */
function isRowScopedPermAction(action: PermissionAction | undefined): boolean {
  return action === 'edit' || action === 'delete' || action === 'create-child'
}

/** 模型动作消费查询 owner；没有正式动作授权的标签不能从旧快照取得许可。 */
export function isModelActionAllowed(action: SparkNode, view: DataView | null | undefined): boolean {
  const permAction = resolveNodePermAction(action).action
  if (permAction === undefined || isRowScopedPermAction(permAction)) return true
  return permAction === 'create' && view?.addActionState() === 'enabled'
}

/** 判断 SparkNode 的行级动作（edit/delete/create-child）是否被权限允许 */
export function isRowActionAllowed(action: SparkNode, row: DataRow | undefined, view: DataView | null | undefined): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isRowScopedPermAction(permAction)) return true
  if (!view || !row) return false
  if (permAction === 'edit') return view.editActionState(row) === 'enabled'
  if (permAction === 'delete') return view.deleteActionState(row) === 'enabled'
  return permAction === 'create-child' && view.createChildActionState(row) === 'enabled'
}
