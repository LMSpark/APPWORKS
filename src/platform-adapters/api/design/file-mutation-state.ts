import { isRequestError } from '@spark-appworks/spark-utils'

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
