/**
 * @module @spark-appworks/spark-data:strategies/crud/types
 * 职责：提供数据层 types 能力，围绕 CrudOperation、CrudLifecycleEvent、CrudLifecycleEventInput 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 strategies/types 的数据语义。
 */
import type { CrudResult } from '../../types'

// ─────────────────────────────────────────────
// CRUD 生命周期事件
// ─────────────────────────────────────────────

/** CRUD 操作类型 */
export type CrudOperation =
  | 'retrieve' | 'create' | 'update' | 'delete'
  | 'batchCreate' | 'batchUpdate' | 'batchDelete'
  | 'import'

/**
 * CRUD 生命周期事件
 *
 * - `before` 阶段：业务脚本可调用 `cancel()` 取消操作（如弹窗确认、权限二次校验）
 * - `after` 阶段：业务脚本可根据 result 执行联动（如刷新关联表、弹出提示）
 */
export type CrudLifecycleEvent = {
    /** CRUD 操作类型。 */
readonly operation: CrudOperation
    /** 生命周期阶段：before=可取消，after=可读取结果执行联动。 */
readonly phase: 'before' | 'after'
  /** 提交的数据（before 阶段为原始入参，after 阶段同前） */
  readonly data: unknown
  /** 操作结果（仅 after 阶段） */
  result?: CrudResult | undefined
  /** 是否已取消（仅 before 阶段有效） */
  cancelled: boolean
  /** 取消操作（仅 before 阶段调用） */
  cancel(): void}

/** Crud Lifecycle Event Input 的输入数据。 */
export type CrudLifecycleEventInput = Readonly<{
  /** CRUD 操作类型：retrieve / create / update / delete / batchCreate / batchUpdate / batchDelete / import。 */
  operation: CrudOperation
  /** 生命周期阶段：before=可取消，after=可读取结果执行联动。 */
  phase: 'before' | 'after'
  /** 提交的数据载荷（before 阶段为原始入参，after 阶段同前）。 */
  data: unknown
  /** 操作结果（仅 after 阶段有效）。 */
  result?: CrudResult | undefined
}>

/** 创建 CRUD 生命周期事件实例 */
export function createCrudLifecycleEvent(input: CrudLifecycleEventInput): CrudLifecycleEvent {
  const { operation, phase, data, result } = input
  const event: CrudLifecycleEvent = {
    operation,
    phase,
    data,
    result,
    cancelled: false,
    cancel() { event.cancelled = true },
  }
  return event
}
