/**
 * @module @spark-appworks/spark-data:query/data-view-query-cache
 * 职责：查询适配器共用的有界内存结果缓存；不解释后端权限，不序列化结果。
 * 边界：适配器提供完整请求键与有效身份检查；清除后旧在途结果不得回填。
 * AI用途：为数据资源查询适配器复用页面或浏览器会话结果，保持身份检查和存储协议在原适配器内。
 */
export type DataViewQueryCacheQueryInput<T> = Readonly<{
  key: string
  page?: object | undefined
  load: () => Promise<T>
  isCurrent: () => boolean
}>

/** 数据资源适配器持有的结果缓存；页面使用对象身份分区，浏览器缓存仅内存持有。 */
export class DataViewQueryCache<T> {
  private browser = new Map<string, {value: T}>()
  private pages = new WeakMap<object, Map<string, {value: T}>>()
  private generation = 0

  /** 丢弃结果引用；不撤销正在使用的查询上下文或已经确认的编辑。 */
  clear(): void {
    this.generation++
    this.browser.clear()
    this.pages = new WeakMap()
  }

  /** 页面释放时立即丢弃其结果引用；浏览器会话缓存由身份责任方清除。 */
  release(page: object): void {this.pages.delete(page)}

  /** page省略表示浏览器会话；最多保留每个作用域128个最近查询，失败不缓存。 */
  async query(input: DataViewQueryCacheQueryInput<T>): Promise<T> {
    const {key, page, load, isCurrent} = input
    let entries = page === undefined ? this.browser : this.pages.get(page)
    if (!entries) {
      entries = new Map()
      if (page !== undefined) this.pages.set(page, entries)
    }
    const cached = entries.get(key)
    if (cached !== undefined) {
      entries.delete(key); entries.set(key, cached)
      return cached.value
    }
    const generation = this.generation
    const value = await load()
    if (generation === this.generation && isCurrent()
      && (page === undefined || this.pages.get(page) === entries)) {
      entries.set(key, {value})
      const oldest = entries.keys().next()
      if (entries.size > 128 && !oldest.done) entries.delete(oldest.value)
    }
    return value
  }
}
