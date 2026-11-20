/**
 * @module @spark-appworks/spark-ai:class-model/class-model/declaration/dts-enum-schema
 * 职责：从 TypeScript enum 成员 AST 提取 const JSON Schema，补足 .d.ts 中不会保留的 enum initializer 语义。
 * 边界：只处理 enum 成员 initializer 到 schema 的映射，不创建 Program、不写 bundle、不处理非 enum 声明。
 * AI用途：排查 enum 产物的 const/自增数值为什么这样生成时，用本模块确认 AST 到 JSON Schema 的规则。
 */
import ts from 'typescript'

import type { JsonSchema } from '@spark-appworks/spark-json-document'
import { readMemberName } from './dts-ast-utils'

/** Enum Member Const Schema 的提取结果。 */
export type EnumMemberConstSchemaResult = Readonly<{
  /** 成员的 JSON Schema：有 initializer 时为 { const: value }，无 initializer 时数字 enum 自增为 { const: autoIndex }，名称无法解析时降级为 { type: 'string' }。 */
  schema: JsonSchema
  /** 下一个成员的自增起始值；数字 enum 每次递增 1，字符串/布尔/null enum 保持不变。 */
  nextAutoIndex: number
}>

/**
 * 从 enum 成员 AST 提取 { const: value } schema。
 * autoIndex 用于无 initializer 的数字 enum 自增（0, 1, 2…）。
 */
export function enumMemberConstSchema(
  member: ts.EnumMember,
  autoIndex: number,
): EnumMemberConstSchemaResult {
  const initializer = member.initializer
  if (initializer === undefined) {
    const memberName = readMemberName(member.name)
    if (memberName !== undefined) {
      return { schema: { const: autoIndex }, nextAutoIndex: autoIndex + 1 }
    }
    return { schema: { type: 'string' }, nextAutoIndex: autoIndex + 1 }
  }

  if (ts.isNumericLiteral(initializer)) {
    const value = Number(initializer.text)
    return { schema: { const: value }, nextAutoIndex: value + 1 }
  }

  if (
    ts.isPrefixUnaryExpression(initializer)
    && initializer.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(initializer.operand)
  ) {
    const value = -Number(initializer.operand.text)
    return { schema: { const: value }, nextAutoIndex: value + 1 }
  }

  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return { schema: { const: initializer.text }, nextAutoIndex: autoIndex }
  }

  if (initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return { schema: { const: true }, nextAutoIndex: autoIndex }
  }
  if (initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return { schema: { const: false }, nextAutoIndex: autoIndex }
  }
  if (initializer.kind === ts.SyntaxKind.NullKeyword) {
    return { schema: { const: null }, nextAutoIndex: autoIndex }
  }

  return { schema: { title: initializer.getText(member.getSourceFile()) }, nextAutoIndex: autoIndex }
}
