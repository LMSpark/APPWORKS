/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-resource
 * 职责：拥有查询分页与结果上下文生命周期。
 * 边界：全部原始页核对通过才发布上下文，旧代次或 scope 不得继续使用。
 * AI用途：执行模型查询并保留原查询强引用基线。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions, DataSpaceRequestScope } from '../data-space-runtime-contract'
import { collectDataSpaceQueryPages } from '../protocol/data-space-pagination'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { DataSpaceRequest } from '../protocol/data-space-request'
import { DataSpaceQueryContext } from './data-space-query-context'

/** 查询请求的 HTTP 与 scope 来源，执行域包含资源失效代次。 */
type DataSpaceQueryResourceOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>

/** 拥有模型查询的分页收集与结果上下文生命周期；全部页通过后才发布上下文。 */
export class DataSpaceQueryResource {
  readonly #request: DataSpaceRequest
  readonly #readScope: () => DataSpaceRequestScope
  #generation = 0
  #disposed = false

  /** 建立本资源的请求 owner，查询与上下文读取使用同一 scope 来源。 */
  public constructor(options: DataSpaceQueryResourceOptions) {
    this.#readScope = options.readScope
    this.#request = new DataSpaceRequest(options)
  }

  public invalidate(): void {
    this.#generation += 1
    this.#request.invalidate()
  }

  public dispose(): void {
    this.#disposed = true
    this.#generation += 1
    this.#request.dispose()
  }

  public async query(identity: DataSpaceQueryIdentity, options: DataSpaceQueryOptions = {}): Promise<DataSpaceQueryContext> {
    const scope = this.contextScope()
    const assertCurrent = () => {
      if (this.#disposed || this.contextScope() !== scope) {
        throw new Error('SPARK_EXECUTION_SCOPE_STALE: 模型查询所属执行域已失效')
      }
    }
    assertCurrent()
    const table = new DataSpaceQueryTable(identity)
    const { filter, ...values } = options
    const captured: DataSpaceQueryOptions = { ...structuredClone(values), ...(filter === undefined ? {} : { filter }) }
    const allPages = captured.allPages === true
    const maxRows = captured.maxRows ?? 50_000
    if (allPages && (!Number.isSafeInteger(maxRows) || maxRows <= 0)) {
      throw new TypeError('数据资源全量查询 maxRows 必须是正整数')
    }
    table.buildRequest(captured)
    const pageSize = captured.page?.size ?? (allPages ? 500 : undefined)
    const firstPageIndex = allPages ? 1 : captured.page?.index ?? 1
    const queryPage = async (index: number) => {
      assertCurrent()
      const result = await this.#request.query({ table, options: {
        ...captured, ...(pageSize === undefined ? {} : { page: { index, size: pageSize } }),
      } }).finally(assertCurrent)
      assertCurrent()
      const snapshot = table.applyResult(result)
      if ((pageSize !== undefined || allPages) && !snapshot.countReported) {
        throw new Error(`数据资源分页缺少后端总数: ${table.identity.metaName}`)
      }
      return snapshot
    }
    const first = await queryPage(firstPageIndex)
    let snapshot = first
    if (allPages) {
      const collection = await collectDataSpaceQueryPages(async ({ index }) => {
        snapshot = index === firstPageIndex ? first : await queryPage(index)
        assertCurrent()
        return { rows: snapshot.rows, total: snapshot.total }
      }, { pageSize: pageSize ?? 500, maxRows, assertCurrent })
      snapshot = Object.freeze({ ...snapshot, rows: collection.rows, total: collection.total })
    }
    assertCurrent()
    return new DataSpaceQueryContext({ identity: table.identity, snapshot, scope,
      readScope: () => this.contextScope() })
  }

  private contextScope(): string {
    const token = this.#readScope().token
    if (!token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求层未提供有效 scope token')
    return JSON.stringify([this.#generation, token])
  }
}
