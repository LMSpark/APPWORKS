/**
 * @module @spark-appworks/spark-json-document:schema/with-meta
 * 职责：提供 JSON 文档和 schema 处理中的 with-meta 能力，围绕 JsonSchemaNode 管理 schema 标准化、解析、校验或树策略。
 * 边界：只处理 JSON/schema/tree 抽象，不依赖 SPARK 页面运行时，也不直接操作业务 DataSet。
 * AI用途：生成或校验 JSON 配置结构时，用本模块确认 schema/with-meta 的 schema 语义。
 */
/**
 * schema/with-meta.ts — JSON Schema 节点添加 title/description 元数据
 */

type JsonSchemaNode = {
  [key: string]: unknown
}

/** 为 JSON Schema 节点合并 title 和 description 元数据 */
export function withMeta<T extends JsonSchemaNode>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string } {
  return { title, description, ...schema }
}
