import { isRequestError } from '@spark-appworks/spark-utils'

/** 本次文件请求在进入传输适配器前失败。保留原错误供调用方诊断。 */
export class FileMutationNotDispatchedError extends Error {
  public constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'FileMutationNotDispatchedError'
  }
}

export function markFileMutationMayHaveApplied(error: unknown): Error {
  return Object.assign(new Error(error instanceof Error ? error.message : String(error), {cause: error}),
    {fileResourceMutationMayHaveApplied: true})
}

export function hasFileMutationMayHaveApplied(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && ('fileResourceWriteMayHaveApplied' in error || 'fileResourceMutationMayHaveApplied' in error)
}

export function isFileMutationUnconfirmed(error: unknown): boolean {
  return isRequestError(error) && error.response === undefined || hasFileMutationMayHaveApplied(error)
}
