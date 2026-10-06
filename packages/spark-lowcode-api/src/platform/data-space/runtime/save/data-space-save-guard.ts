/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/save/data-space-save-guard
 * 职责：拒绝空输入与无实际效果的显式变更。
 * 边界：有效数量必须是正安全整数，不把无操作报告为保存成功。
 * AI用途：在统一保存前核对变更输入与实际差异。
 */
/** 显式数据变更动作名称，用于报告空输入或无实际效果。 */
type DataSpaceMutationOperation = '新增' | '保存' | '更新' | '删除'

function mutationLabel(operation: DataSpaceMutationOperation, target: string): string {
  const normalized = target.trim()
  return normalized ? `${normalized} ${operation}` : operation
}

export function requireDataSpaceMutationInput(operation: DataSpaceMutationOperation, itemCount: number, target = ''): void {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) {
    throw new Error(`SPARK API ${mutationLabel(operation, target)}至少需要一项有效输入`)
  }
}

export function failDataSpaceMutationWithoutEffect(operation: DataSpaceMutationOperation, target = ''): never {
  throw new Error(`SPARK API ${mutationLabel(operation, target)}未产生实际变更`)
}
