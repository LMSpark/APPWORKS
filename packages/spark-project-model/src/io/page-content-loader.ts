/**
 * @module @spark-appworks/spark-project-model:io/page-content-loader
 * 职责：按项目与页面身份读取三文件，并维护当前前端会话内的内容缓存。
 * 边界：只依赖注入的语义读取器，不拥有任何服务器 URL 或认证协议。
 * AI用途：经Workspace读取工具工作副本并确认缓存身份与失效规则。
 */

import type { PageContentLoadResult, PageToolLoadOptions } from '../page/page-file'
import { pageFilePath, pageFilePaths, type PageToolFileName } from '../page/page-file'

/** 以项目和pageId读取一个工具文件；versionId发布指针省略时读取工作副本。 */
export type PageFileReadCommand = Readonly<{
  versionId?: string
  projectId: string
  pageId: string
  fileName: PageToolFileName
}>

/** 宿主提供的真实文本读取能力，失败不得回退本地空文件。 */
export type PageFileReader = (command: PageFileReadCommand) => Promise<string>

/** 注入项目身份读取器与三文件文本能力，缓存由本loader持有。 */
export type PageContentLoaderOptions = Readonly<{
  getProjectId?: () => string
  projectId?: string
  readPageFile?: PageFileReader
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} 不能为空`)
  return normalized
}

/** 页面三文件加载器；远端合同由宿主注入，缓存不跨应用身份。 */
export class PageContentLoader {
  private readonly cache = new Map<string, string>()
  private readonly pendingReads = new Map<string, Set<symbol>>()
  private readonly getProjectIdOption: (() => string) | undefined
  private readonly projectId: string | undefined
  private readonly reader: PageFileReader | undefined
  /** 注入项目身份和真实读取能力，缓存不跨项目或失效请求。 */

  public constructor(options: PageContentLoaderOptions = {}) {
    this.getProjectIdOption = options.getProjectId
    this.projectId = options.projectId
    this.reader = options.readPageFile
  }

  public async loadPageFileContent(
    pageId: string,
    filename: PageToolFileName,
    options?: PageToolLoadOptions,
  ): Promise<PageContentLoadResult<string>> {
    const projectId = this.resolveProjectId()
    const normalizedPageId = requiredText(pageId, 'pageId')
    const cacheKey = this.cacheKey(projectId, normalizedPageId, filename)
    if (options?.forceReload !== true && this.cache.has(cacheKey)) {
      return { success: true, data: this.cache.get(cacheKey) ?? '', source: 'remote', fromCache: true }
    }
    if (this.reader === undefined) {
      return { success: false, error: '未注入页面文件读取器' }
    }
    const token = Symbol()
    let reads = this.pendingReads.get(cacheKey)
    if (reads === undefined) {
      reads = new Set()
      this.pendingReads.set(cacheKey, reads)
    }
    reads.add(token)
    try {
      const data = await this.reader({ projectId, pageId: normalizedPageId, fileName: filename })
      if (this.pendingReads.get(cacheKey) !== reads || this.resolveProjectId() !== projectId) {
        throw new Error('PAGE_FILE_READ_STALE: 页面文件读取已失效')
      }
      this.cache.set(cacheKey, data)
      return { success: true, data, source: 'remote', fromCache: false }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      reads.delete(token)
      if (reads.size === 0 && this.pendingReads.get(cacheKey) === reads) this.pendingReads.delete(cacheKey)
    }
  }

  public clearCache(key?: string): void {
    if (key === undefined) {
      this.cache.clear()
      this.pendingReads.clear()
      return
    }
    const projectId = this.resolveProjectId()
    const normalizedKey = key.startsWith('/') ? key : `/${key}`
    this.cache.delete(`${projectId}${normalizedKey}`)
    this.pendingReads.delete(`${projectId}${normalizedKey}`)
  }

  public clearAllCache(): { size: number; keys: string[] } {
    this.clearCache()
    return this.getCacheStats()
  }

  public getCacheStats(): { size: number; keys: string[] } {
    return { size: this.cache.size, keys: [...this.cache.keys()] }
  }

  public clearPageCache(pageId: string): void {
    const normalized = pageId.trim()
    if (!normalized) return
    for (const path of pageFilePaths(normalized)) this.clearCache(path)
  }

  public getPageFileReader(): PageFileReader | undefined {
    return this.reader
  }

  private resolveProjectId(): string {
    return requiredText(this.getProjectIdOption?.() ?? this.projectId ?? '', 'projectId')
  }

  private cacheKey(projectId: string, pageId: string, fileName: PageToolFileName): string {
    return `${projectId}${pageFilePath(pageId, fileName)}`
  }
}
