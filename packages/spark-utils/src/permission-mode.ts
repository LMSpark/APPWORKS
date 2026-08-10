/**
 * @module @spark-appworks/spark-utils:permission-mode
 * 职责：页面/蓝图/运行导航共用的权限展示三态（PermissionMode）唯一字面量 SSOT。
 * 边界：只放跨包共享的三态契约；不含权限快照、字段策略或平台 wire。
 * AI用途：新增/修改权限展示态时只改本文件，消费方直连 utils，禁止各包再定义同形别名。
 */

/** 权限未匹配或过渡态时的展示模式字面量表。 */
export const PERMISSION_MODES = ['none', 'masked', 'invisible'] as const

/** 权限展示三态：完整展示 / 掩码 / 不可见。 */
export type PermissionMode = (typeof PERMISSION_MODES)[number]

const PERMISSION_MODE_SET: ReadonlySet<string> = new Set(PERMISSION_MODES)

/** 运行时判定未知 PermissionMode。 */
export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === 'string' && PERMISSION_MODE_SET.has(value)
}
