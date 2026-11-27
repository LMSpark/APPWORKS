import type { DataSpaceQueryPage } from '../formal-table-contract'
import { DEFAULT_DATA_VIEW_MAX_ROWS } from '../data-view-query'

export const DATA_SPACE_MAX_PAGE_SIZE = 1000

type DataSpacePageResponse<T> = Readonly<{rows?: readonly T[]; total?: unknown}>
type DataSpacePageCollection<T> = Readonly<{rows: readonly T[]; total: number}>
type DataSpacePageCollectionOptions<T> = Readonly<{
  pageSize?: number
  maxRows?: number
  signal?: AbortSignal
  assertCurrent?: () => void
  key?: (row: T) => unknown
}>
type DataSpacePageFetcher<T> = (page: DataSpaceQueryPage) => Promise<DataSpacePageResponse<T>>

function isPageRows<T>(value: readonly T[] | undefined): value is readonly T[] {
  return Array.isArray(value)
}

export async function collectDataSpaceQueryPages<T>(
  fetchPage: DataSpacePageFetcher<T>,
  options: DataSpacePageCollectionOptions<T> = {},
): Promise<DataSpacePageCollection<T>> {
  const pageSize = options.pageSize ?? DATA_SPACE_MAX_PAGE_SIZE
  const maxRows = options.maxRows ?? DEFAULT_DATA_VIEW_MAX_ROWS
  requireDataSpaceQueryPage({index: 1, size: pageSize})
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0) throw new RangeError('SPARK 批量查询 maxRows 必须是正整数')
  const assertActive = () => {options.signal?.throwIfAborted(); options.assertCurrent?.()}
  const rows: T[] = []
  const keys = new Set<string | number>()
  let expectedTotal: number | undefined
  let index = 0
  do {
    assertActive()
    const page = await fetchPage({index: ++index, size: pageSize})
    assertActive()
    const rawTotal = page.total
    const total = typeof rawTotal === 'number' || (typeof rawTotal === 'string' && /^\d+$/.test(rawTotal))
      ? Number(rawTotal) : Number.NaN
    if (!Number.isSafeInteger(total) || total < 0 || total > maxRows) {
      throw new Error('SPARK 批量查询返回了无效或超限的 total 元数据')
    }
    if (expectedTotal !== undefined && total !== expectedTotal) {
      throw new Error('SPARK 批量查询期间 total 已变化，不能返回部分统计')
    }
    expectedTotal = total
    if (!isPageRows(page.rows) || page.rows.length !== Math.min(pageSize, total - rows.length)) {
      throw new Error('SPARK 批量查询返回缺页或超出页边界的记录')
    }
    for (const row of page.rows) {
      if (options.key) {
        const identity = options.key(row)
        if (!((typeof identity === 'string' && identity.trim())
          || (typeof identity === 'number' && Number.isSafeInteger(identity)))) {
          throw new Error('SPARK 批量查询记录主键无效')
        }
        if (keys.has(identity)) throw new Error('SPARK 批量查询记录主键重复')
        keys.add(identity)
      }
      rows.push(row)
    }
    assertActive()
  } while (rows.length < expectedTotal)
  return Object.freeze({rows: Object.freeze(rows), total: expectedTotal})
}

export function requireDataSpaceQueryPage(page: DataSpaceQueryPage): Readonly<{pageIndex: number; pageSize: number}> {
  const index = Number(page.index)
  const size = Number(page.size)
  if (!Number.isSafeInteger(index) || index <= 0) throw new RangeError('SPARK query page index must be a positive integer')
  if (!Number.isSafeInteger(size) || size <= 0 || size > DATA_SPACE_MAX_PAGE_SIZE) {
    throw new RangeError(`SPARK query page size must be between 1 and ${DATA_SPACE_MAX_PAGE_SIZE}`)
  }
  return {pageIndex: index, pageSize: size}
}
