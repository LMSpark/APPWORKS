/**
 * @module @spark-appworks/spark-app:navigation/page-cache
 * 职责：提供应用壳层 page-cache 能力，围绕 PageCacheSource、PageCacheHandle 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 navigation/page-cache。
 */
/**
 * 页面配置缓存管理（spark-app 内聚）
 */

import { PAGE_NODE_FILE_NAMES } from '@spark-appworks/spark-project-model'

type PageCacheSource = {
  /** 清除指定页面的内存缓存，同时由 handle 清除 localStorage 中对应的四文件条目 */
  clearPageCache(pageId: string): void
  /** 清除所有页面的内存与 localStorage 缓存，返回清除前统计（size + keys） */
  clearAllCache(): { size: number; keys: string[] }
  /** 返回当前缓存条目统计，不含 localStorage 条目 */
  getCacheStats(): { size: number; keys: string[] }}

/** Page Cache Handle 的语义模型。 */
export type PageCacheHandle = {
  /** 清除指定页面的内存缓存及 localStorage 中 spark_page_ 前缀的四文件条目 */
  clearPageCache(pageId: string): void
  /** 清除所有页面的内存与 localStorage 缓存，返回清除前统计 */
  clearAllCache(): { size: number; keys: string[] }
  /** 返回当前缓存条目统计（条目数 + key 列表） */
  getCacheStats(): { size: number; keys: string[] }}

export function createPageCache(source: PageCacheSource): PageCacheHandle {
  return {
    clearPageCache(pageId: string): void {
      source.clearPageCache(pageId)
      if (typeof localStorage === 'undefined') return
      for (const file of PAGE_NODE_FILE_NAMES) {
        const base = `${CACHE_PREFIX}/${pageId}/${file}`
        localStorage.removeItem(base)
        localStorage.removeItem(`${base}:raw`)
        localStorage.removeItem(`${base}:transform`)
      }
    },

    clearAllCache(): { size: number; keys: string[] } {
      const stats = source.clearAllCache()
      if (typeof localStorage !== 'undefined') {
        const toRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key)
        }
        for (const key of toRemove) localStorage.removeItem(key)
      }
      return stats
    },

    getCacheStats(): { size: number; keys: string[] } {
      return source.getCacheStats()
    },
  }
}

const CACHE_PREFIX = 'spark_page_'
