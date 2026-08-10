/**
 * @module @spark-appworks/spark-component:permission/PermissionResolver
 * 职责：提供 Permission Resolver 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 权限动作解析器 — 纯函数集
 *
 * 统一的动作级权限判断 + 字段权限状态解析。
 * 合并了动作权限相关的模型/行级判断。
 */

import type {
  DataRow,
  DataPermissionSnapshot,
  PermissionActionContext as ScriptPermissionActionContext,
} from '@spark-appworks/spark-data'
import type { PagePermissionMode } from '../core/capability-keys.js'
import type { SparkNode } from '../core/types'
import { nodeInputProp } from '../core/types'
import { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } from './PermissionChecker'
import { computeFieldState } from './FieldRenderHelper'
import type { FieldRenderConfig, FieldRenderState } from './FieldRenderHelper'

// ── 动作权限上下文 ──

/** Permission Action Context 的运行上下文。 */
export type PermissionActionContext = ScriptPermissionActionContext & {
    /** 导航权限模式：none=不控制，masked=可见+脱敏，invisible=后端控制导航可见性。 */
permissionMode?: PagePermissionMode | undefined
}

/** Permission Action Name 的语义模型。 */
export type PermissionActionName =
  | 'create'
  | 'import'
  | 'export'
  | 'create-child'
  | 'delete'
  | 'edit'

/** Permission Action 的语义模型。 */
export type PermissionAction = PermissionActionName | (string & {})

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

// ── 核心动作判断 ──

/**
 * 判断指定动作在权限上下文中是否被允许。
 *
 * 语义：effective = max(基线允许, 权限快照)。缺少快照 = 基线允许。
 * 缺少后端最终快照或行级五集合时一律拒绝。
 */
export function isPermittedAction(
  action: PermissionAction | undefined,
  context: PermissionActionContext,
): boolean {
  if (action === undefined) return true

  const mode = context.permissionMode
  if (mode === 'none') return true

  const row = context.row ?? null

  switch (action) {
    case 'create':
      return canCreate(context.permissionSnapshot, mode)
    case 'import':
      return canImport(context.permissionSnapshot, mode)
    case 'export':
      return canExport(context.permissionSnapshot, mode)
    case 'create-child':
      return row !== null
        && canCreate(context.permissionSnapshot, mode)
        && canCreateChild(row, context.permissionSnapshot, mode)
    case 'delete':
      return row ? canDelete(row, mode) : false
    case 'edit':
      return row ? canEdit(row, mode) : false
    default:
      return context.permissionSnapshot?.authorizedFeatureTags.includes(action) === true
  }
}

// ── 字段权限状态解析 ──

/** Resolve Field Permission State Input 的输入数据。 */
export type ResolveFieldPermissionStateInput = Readonly<{
  /** 待判断权限状态的字段名。 */
  field: string | undefined
  /** 数据行（需包含后端返回的 lingma_sys_params 五个稀疏权限集合）。 */
  row: DataRow | null | undefined
  /** 字段渲染配置（如 editable / visible），与 FieldRenderConfig 合并判断。 */
  config?: Omit<FieldRenderConfig, 'field'> | undefined
  /** 权限模式：none=不控制，masked=可见+脱敏，invisible=后端控制导航可见性。 */
  permissionMode?: PagePermissionMode | undefined
}>

export function resolveFieldPermissionState(input: ResolveFieldPermissionStateInput): FieldRenderState | null {
  const { field, row, config = {}, permissionMode } = input
  if (!field || !row) return null
  return computeFieldState({ field, ...config }, row, permissionMode)
}

// ── SparkNode 动作分类 + 判断 ──

/** 是否为模型级权限动作（create/import/export/create-child） */
export function isModelScopedPermAction(action: PermissionAction | undefined): boolean {
  return action === 'create' || action === 'import' || action === 'export' || action === 'create-child'
}

/** 是否为行级权限动作（edit/delete/create-child） */
export function isRowScopedPermAction(action: PermissionAction | undefined): boolean {
  return action === 'edit' || action === 'delete' || action === 'create-child'
}

/** 判断 SparkNode 的模型级动作（create/import/export）是否被权限允许 */
export function isModelActionAllowed(action: SparkNode, snapshot: DataPermissionSnapshot | null | undefined, permissionMode?: PagePermissionMode): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isModelScopedPermAction(permAction)) return true
  return isPermittedAction(permAction, { permissionSnapshot: snapshot ?? null, permissionMode })
}

/** 判断 SparkNode 的行级动作（edit/delete/create-child）是否被权限允许 */
export function isRowActionAllowed(action: SparkNode, row: DataRow | undefined, permissionMode?: PagePermissionMode): boolean {
  const permAction = resolveNodePermAction(action).action
  if (!isRowScopedPermAction(permAction)) return true

  return isPermittedAction(permAction, { row: row ?? null, permissionMode })
}
