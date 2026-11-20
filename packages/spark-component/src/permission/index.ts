/**
 * @module @spark-appworks/spark-component:permission/index
 * 职责：汇总导出 permission 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * 组件权限渲染入口
 *
 * ## 定位
 * 字段和动作消费绑定 DataView 的原查询权限，不建立另一份授权模型。
 *
 * ## 设计原则
 * - usePermission 是 Vue composable 桥接，内部消费 DATA_SOURCE 和本地输入策略
 * - 其他 composable 只能通过 usePermission() 访问权限数据，不允许直接 sparkConsume 权限能力
 */

// ── 页面权限模型（能力键，仅 SparkPageRenderer 应 import） ──
export { SUBTREE_FIELD_POLICY, PAGE_PERMISSION_MODE } from '../core/capability-keys.js'

// ── 动作权限解析 ──
export {
  isModelActionAllowed, isRowActionAllowed,
} from './PermissionResolver'

// ── Vue composable 桥接 ──
export { usePermission } from './usePermission'

// ── 类型（FieldRender* 定义在 utils/data，勿从此包再导出）──
export type { UsePermissionReturn } from './usePermission'
