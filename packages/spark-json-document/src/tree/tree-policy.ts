/**
 * @module @spark-appworks/spark-json-document:tree/tree-policy
 * 职责：提供 JSON Document/schema 处理中的 tree policy 能力，支撑 schema 标准化、审计和元数据保留。
 * 边界：只处理 JSON schema/document 结构，不耦合应用页面、Vue 组件或 AI 会话状态。
 * AI用途：校验或标准化配置 schema 时，用本模块确认 JSON 文档层的规则来源。
 */
/**
 * ═══════════════════════════════════════════════════════════════
 * tree/tree-policy.ts — 策略解析与默认实现
 * ═══════════════════════════════════════════════════════════════
 */

import type { JsonTreePolicy } from './tree-types'
import { ensureUniqueObjectKey } from './tree-utils'

/** Resolved Policy 的语义模型。 */
type ResolvedPolicy = Required<JsonTreePolicy>

const DEFAULT_POLICY: ResolvedPolicy = {
  rootLabel: '$',
  isProtected: () => false,
  canEditKey: (path) => path.length > 0 && typeof path[path.length - 1] === 'string',
  canEditType: (path) => path.length > 0,
  canAddChild: () => true,
  suggestChildKey: (target) => ensureUniqueObjectKey(target, 'newKey'),
  createDefaultArrayItem: () => '',
  createDefaultObjectValue: () => '',
  getValueOptions: () => undefined,
  getValueLabels: () => undefined,
  getAutoPopulate: () => undefined,
}

export function resolvePolicy(partial?: Partial<JsonTreePolicy>): ResolvedPolicy {
  if (!partial) return DEFAULT_POLICY
  return {
    rootLabel: partial.rootLabel ?? DEFAULT_POLICY.rootLabel,
    isProtected: partial.isProtected ?? DEFAULT_POLICY.isProtected,
    canEditKey: partial.canEditKey ?? DEFAULT_POLICY.canEditKey,
    canEditType: partial.canEditType ?? DEFAULT_POLICY.canEditType,
    canAddChild: partial.canAddChild ?? DEFAULT_POLICY.canAddChild,
    suggestChildKey: partial.suggestChildKey ?? DEFAULT_POLICY.suggestChildKey,
    createDefaultArrayItem: partial.createDefaultArrayItem ?? DEFAULT_POLICY.createDefaultArrayItem,
    createDefaultObjectValue: partial.createDefaultObjectValue ?? DEFAULT_POLICY.createDefaultObjectValue,
    getValueOptions: partial.getValueOptions ?? DEFAULT_POLICY.getValueOptions,
    getValueLabels: partial.getValueLabels ?? DEFAULT_POLICY.getValueLabels,
    getAutoPopulate: partial.getAutoPopulate ?? DEFAULT_POLICY.getAutoPopulate,
  }
}
