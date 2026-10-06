/**
 * @module @spark-appworks/spark-project-model:page/page-file
 * 职责：提供项目模型和页面配置域中的 page file 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** 页面三文件：路径常量、IO 类型、文本 parse/serialize。 */
import { getSparkNodeChildren, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'

export function assertNonEmptyPageId(pageId: string): string {
  const normalized = pageId.trim()
  if (normalized.length === 0) {
    throw new Error('pageId must be a non-empty string')
  }
  return normalized
}

export const PAGE_TOOL_FILE_NAMES: readonly ['rule.json', 'script.js', 'style.css'] = [
  'rule.json',
  'script.js',
  'style.css',
]

/** 页面工具只允许rule.json、script.js、style.css三文件。 */
export type PageToolFileName = typeof PAGE_TOOL_FILE_NAMES[number]

/** Page Tool Load Options 的调用配置。 */
export type PageToolLoadOptions = {
    /** force Reload 字段。 */
forceReload?: boolean
}

export function pageFilePath(pageId: string, filename: string): string {
  return `/${encodeURIComponent(pageId)}/${encodeURIComponent(filename)}`
}

export function pageFilePaths(pageId: string): readonly string[] {
  return PAGE_TOOL_FILE_NAMES.map(filename => pageFilePath(pageId, filename))
}

/** Page Content Load Result 的返回结果。 */
export type PageContentLoadResult<T = unknown> = {
    /** success 字段。 */
success: boolean
    /** 业务数据载荷。 */
data?: T
    /** 错误对象或错误信息。 */
error?: string
    /** reason 字段。 */
reason?: string
    /** 来源对象。 */
source?: 'remote'
    /** 事件时间戳。 */
timestamp?: number
    /** source Timestamp 字段。 */
sourceTimestamp?: string
    /** from Cache 字段。 */
fromCache?: boolean
    /** not Modified 字段。 */
notModified?: boolean
}

/** N__filename快照摘要；缺少修改时间为null，编号不代表发布引用。 */
export type PageToolFileVersionSummary = {
  version: number
  fileName: string
  lastModified: number | null
}

/** Page File Create Options 的调用配置。 */
export type PageFileCreateOptions = {
    /** 显示标题。 */
title?: string
    /** icon 字段。 */
icon?: string
}

export function tryParseRuleTextError(rawText: string): string | null {
  try {
    parseRuleText(rawText)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function parseRuleText(rawText: string): SparkNode {
  if (!rawText.trim()) {
    return SparkNodeTree.fromPageChildren([]).root
  }
  return SparkNodeTree.fromRuleJson(rawText).root
}

export function serializeRuleTree(rule: SparkNode): string {
  const children = getSparkNodeChildren(rule.children)
  const firstChild = children[0]
  const rootValue: SparkNode | SparkNode[] = children.length === 1 && firstChild !== undefined
    ? firstChild
    : children
  return `${JSON.stringify(rootValue, null, 2)}\n`
}
