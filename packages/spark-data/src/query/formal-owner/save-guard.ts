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
