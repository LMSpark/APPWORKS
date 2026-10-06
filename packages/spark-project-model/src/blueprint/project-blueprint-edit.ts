/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-edit
 * 职责：正式四组节点草稿与补丁转换。
 * 边界：只编辑领域内存，不提交远端。
 * AI用途：生成或应用节点草稿时确认身份与组边界。
 */
import { deepClone } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodePatch, ProjectBlueprintTreeNodeData } from './project-blueprint-node'

/** 以node包裹一个正式节点的编辑草稿。 */
export type BlueprintNodeDraft = { node: ProjectBlueprintTreeNodeData }
/** 草稿应用的正式组补丁和诊断，不代表远端保存回执。 */
export type BlueprintNodeDraftApplyResult = { patch: ProjectBlueprintNodePatch; warnings: string[] }
/** 可应用正式分组补丁的内存节点边界。 */
type BlueprintNodePatchTarget = { applyBlueprintPatch(patch: ProjectBlueprintNodePatch): void }
export function blueprintDraftContentKey(draft: BlueprintNodeDraft): string { return JSON.stringify(draft) }
export function createBlueprintNodeDraft(node: ProjectBlueprintTreeNodeData): BlueprintNodeDraft { const copy = deepClone(node); delete copy.children; return { node: copy } }
export function createBlueprintNodePatch(input: BlueprintNodeDraft): BlueprintNodeDraftApplyResult {
  const { kind, capability, navigation, dataSpace, prototype, source } = deepClone(input.node)
  return { patch: { kind, capability, ...(navigation ? {navigation} : {}), ...(dataSpace ? {dataSpace} : {}), ...(prototype ? {prototype} : {}), source }, warnings: [] }
}
export function applyBlueprintNodeDraftToNode(target: BlueprintNodePatchTarget, input: BlueprintNodeDraft): BlueprintNodeDraftApplyResult { const result = createBlueprintNodePatch(input); target.applyBlueprintPatch(result.patch); return result }
