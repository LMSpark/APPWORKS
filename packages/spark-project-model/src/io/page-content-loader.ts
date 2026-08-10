/**
 * @module @spark-appworks/spark-project-model:io/page-content-loader
 * 职责：按项目与页面身份读取四文件，并维护当前前端会话内的内容缓存。
 * 边界：只依赖注入的语义读取器，不拥有任何服务器 URL 或认证协议。
 */

import type { PageContentLoadResult, PageNodeLoadOptions } from '../page/page-file'
import { pageFilePath, pageFilePaths, type PageNodeFileName } from '../page/page-file'

export type PageFileReadCommand = Readonly<{
  projectId: string
  pageId: string
  fileName: PageNodeFileName
}>

export type PageFileReader = (command: PageFileReadCommand) => Promise<string>

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

/** 页面四文件加载器；远端合同由宿主注入，缓存不跨应用身份。 */
export class PageContentLoader {
  private readonly cache = new Map<string, string>()
  private readonly getProjectIdOption: (() => string) | undefined
  private readonly projectId: string | undefined
  private readonly reader: PageFileReader | undefined

  public constructor(options: PageContentLoaderOptions = {}) {
    this.getProjectIdOption = options.getProjectId
    this.projectId = options.projectId
    this.reader = options.readPageFile
  }

  public async loadPageFileContent(
    pageId: string,
    filename: PageNodeFileName,
    options?: PageNodeLoadOptions,
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
    try {
      const data = await this.reader({ projectId, pageId: normalizedPageId, fileName: filename })
      this.cache.set(cacheKey, data)
      return { success: true, data, source: 'remote', fromCache: false }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  public clearCache(key?: string): void {
    if (key === undefined) {
      this.cache.clear()
      return
    }
    const projectId = this.resolveProjectId()
    const normalizedKey = key.startsWith('/') ? key : `/${key}`
    this.cache.delete(`${projectId}${normalizedKey}`)
  }

  public clearAllCache(): { size: number; keys: string[] } {
    this.cache.clear()
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

  private cacheKey(projectId: string, pageId: string, fileName: PageNodeFileName): string {
    return `${projectId}${pageFilePath(pageId, fileName)}`
  }
}
