/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-pagination
 * 职责：收集并核对后端原始查询页。
 * 边界：先核对原 rows/total，再发布全量结果；禁止预先过滤原行。
 * AI用途：配置页大小、总量上限与执行域检查。
 */
import type { DataSpaceQueryPage } from '../data-space-runtime-contract'

export const DATA_SPACE_MAX_PAGE_SIZE = 1000

/** 未经筛选的原始页及后端 total；缺少或非法元数据会拒绝全量收集。 */
type DataSpacePageResponse<T> = Readonly<{ rows?: readonly T[]; total?: unknown }>
/** 全部页通过数量与总数校验后的冻结原行集合。 */
type DataSpacePageCollection<T> = Readonly<{ rows: readonly T[]; total: number }>
/** 分页上限、取消和执行域检查；可选 key 用于检查原行身份重复。 */
type DataSpacePageCollectionOptions<T> = Readonly<{
  pageSize?: number
  maxRows?: number
  signal?: AbortSignal
  assertCurrent?: () => void
  key?: (row: T) => unknown
}>
/** 按显式页码读取原行与 total 的异步页读取器。 */
type DataSpacePageFetcher<T> = (page: DataSpaceQueryPage) => Promise<DataSpacePageResponse<T>>

function isPageRows<T>(value: readonly T[] | undefined): value is readonly T[] {
  return Array.isArray(value)
}

/** API 内部完整分页；保留原行，结果权限由查询 owner 在所有页通过后统一登记。 */
export async function collectDataSpaceQueryPages<T>(
  fetchPage: DataSpacePageFetcher<T>,
  options: DataSpacePageCollectionOptions<T> = {},
): Promise<DataSpacePageCollection<T>> {
  const pageSize = options.pageSize ?? DATA_SPACE_MAX_PAGE_SIZE
  const maxRows = options.maxRows ?? 50_000
  requireDataSpaceQueryPage({ index: 1, size: pageSize })
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0) throw new RangeError('SPARK 批量查询 maxRows 必须是正整数')
  const assertActive = () => { options.signal?.throwIfAborted(); options.assertCurrent?.() }
  const rows: T[] = []
  const keys = new Set<string | number>()
  let expectedTotal: number | undefined
  let index = 0
  do {
    assertActive()
    const page = await fetchPage({ index: ++index, size: pageSize })
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
  return Object.freeze({ rows: Object.freeze(rows), total: expectedTotal })
}

/** 显式页码从 1 开始；0 及越界大小不表示查询全部。 */
export function requireDataSpaceQueryPage(page: DataSpaceQueryPage): Readonly<{ pageIndex: number; pageSize: number }> {
  const index = Number(page.index)
  const size = Number(page.size)
  if (!Number.isSafeInteger(index) || index <= 0) throw new RangeError('SPARK query page index must be a positive integer')
  if (!Number.isSafeInteger(size) || size <= 0 || size > DATA_SPACE_MAX_PAGE_SIZE) {
    throw new RangeError(`SPARK query page size must be between 1 and ${DATA_SPACE_MAX_PAGE_SIZE}`)
  }
  return { pageIndex: index, pageSize: size }
}
