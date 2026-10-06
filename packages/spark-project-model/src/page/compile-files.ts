/**
 * @module @spark-appworks/spark-project-model:page/compile-files
 * 职责：提供项目模型和页面配置域中的 compile files 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */

import { getSparkNodeChildren, isSparkNode, normalizeSparkNode, SparkNodeTree, type SparkNode } from '@spark-appworks/spark-data'

/**
 * rule.json 原始字符串 → 规范化 SparkNode[]（页面顶层组件数组）。
 *
 * 规范化内容：
 * - 顶层可以是单个 SparkNode，也可以是 SparkNode[]
 * - 每条规则必须是合法 SparkNode
 * - 节点定位只接受顶层 `id`
 * - 不自动补齐缺失组件 id（fillMissingComponentId: false）
 */
export function compileRule(raw: string): SparkNode[] {
  if (raw.trim() === '') return []
  const tree = SparkNodeTree.fromRuleJson(raw, {
    fillMissingComponentId: false,
    historyLimit: 0,
  })
  return getSparkNodeChildren(tree.root.children)
}

/** 将未知值归一化为 SparkNode；类型不合法时 fail-fast。 */
export function normalizeRuleNode(node: unknown): SparkNode {
  if (!isSparkNode(node)) {
    throw new Error('rule.json 节点必须是 SparkNode：需要非空字符串 type')
  }
  return normalizeSparkNode(node)
}

/** script.js 原始字符串 → 脚本文本（当前透传；后续可加语法检查、沙箱包装）。 */
export function parseScript(raw: string): string {
  return raw
}

/** style.css 原始字符串 → 样式文本（当前透传；后续可加 CSS 变量提取、作用域前缀）。 */
export function parseCss(raw: string): string {
  return raw
}
