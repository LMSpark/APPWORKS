/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-type-schema
 * 职责：把 `.d.ts` TypeNode 语法结构投影为轻量 JSON Schema。
 * 边界：只读取声明文本和 AST，不创建语义求值器、不做符号解析、不执行类型求值。
 * AI用途：排查 .d.ts 字符串类型如何进入 paramsSchema / returnSchema / attribute.schema 时，用本模块定位语法映射规则。
 */
import ts from 'typescript'

import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { extractConstOrSingleEnumValue } from './json-schema-emit'

/** 将 `.d.ts` 类型节点按语法结构投影为 JSON Schema。 */
export function typeNodeToJsonSchema(
  node: ts.Node | undefined,
  sourceFile?: ts.SourceFile,
): JsonSchema {
  if (node === undefined || !ts.isTypeNode(node)) return true
  if (ts.isParenthesizedTypeNode(node)) return typeNodeToJsonSchema(node.type, sourceFile)
  if (ts.isRestTypeNode(node)) return typeNodeToJsonSchema(node.type, sourceFile)
  if (ts.isArrayTypeNode(node)) {
    return {
      type: 'array',
      items: typeNodeToJsonSchema(node.elementType, sourceFile),
    }
  }
  if (ts.isTupleTypeNode(node)) {
    return {
      type: 'array',
      prefixItems: node.elements.map(element => typeNodeToJsonSchema(element, sourceFile)),
    }
  }
  if (ts.isUnionTypeNode(node)) {
    return combineUnionSchemas(
      node.types
        .filter(item => !isUndefinedLikeTypeNode(item))
        .map(item => typeNodeToJsonSchema(item, sourceFile)),
    )
  }
  if (ts.isIntersectionTypeNode(node)) {
    const schemas = node.types.map(item => typeNodeToJsonSchema(item, sourceFile))
    if (schemas.length === 0) return true
    if (schemas.length === 1) return schemas[0] ?? true
    return { allOf: schemas }
  }
  if (ts.isTypeReferenceNode(node)) return typeReferenceNodeToJsonSchema(node, sourceFile)
  if (ts.isTypeLiteralNode(node)) return typeLiteralNodeToJsonSchema(node, sourceFile)
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) {
    return { type: 'object', title: node.getText(sourceFile) }
  }
  if (ts.isLiteralTypeNode(node)) return literalTypeNodeToJsonSchema(node, sourceFile)
  if (ts.isIndexedAccessTypeNode(node)) return true
  if (ts.isConditionalTypeNode(node)) return true
  if (ts.isMappedTypeNode(node)) return { type: 'object', title: node.getText(sourceFile) }
  if (ts.isTypeOperatorNode(node)) return typeNodeToJsonSchema(node.type, sourceFile)
  if (ts.isImportTypeNode(node)) return { type: 'object', title: node.getText(sourceFile) }

  const intrinsic = intrinsicSchemaFromKeywordTypeNode(node)
  if (intrinsic !== undefined) return intrinsic
  return true
}

/** 按声明参数列表生成 executable paramsSchema；不做语义签名展开。 */
export function paramsSchemaFromParameters(
  parameters: readonly ts.ParameterDeclaration[],
  sourceFile: ts.SourceFile,
): JsonSchemaObject {
  const properties: Record<string, JsonSchema> = {}
  for (const parameter of parameters) {
    if (ts.isObjectBindingPattern(parameter.name) && parameter.type !== undefined) {
      const schema = typeNodeToJsonSchema(parameter.type, sourceFile)
      if (isJsonSchemaObject(schema) && schema.properties !== undefined) {
        for (const [name, propertySchema] of Object.entries(schema.properties)) {
          properties[name] = propertySchema
        }
        continue
      }
    }
    properties[parameter.name.getText(sourceFile)] = typeNodeToJsonSchema(parameter.type, sourceFile)
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

function typeLiteralNodeToJsonSchema(
  node: ts.TypeLiteralNode,
  sourceFile: ts.SourceFile | undefined,
): JsonSchemaObject {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const member of node.members) {
    if (!ts.isPropertySignature(member)) continue
    const name = readPropertyName(member.name)
    if (name === undefined) continue
    properties[name] = typeNodeToJsonSchema(member.type, sourceFile)
    if (member.questionToken === undefined) required.push(name)
  }
  return {
    type: 'object',
    ...(Object.keys(properties).length === 0 ? {} : { properties }),
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  }
}

function typeReferenceNodeToJsonSchema(
  node: ts.TypeReferenceNode,
  sourceFile: ts.SourceFile | undefined,
): JsonSchema {
  const typeName = node.typeName.getText(sourceFile)
  const firstTypeArgument = node.typeArguments?.[0]
  if ((typeName === 'Array' || typeName === 'ReadonlyArray') && firstTypeArgument !== undefined) {
    return {
      type: 'array',
      items: typeNodeToJsonSchema(firstTypeArgument, sourceFile),
    }
  }
  if (
    (typeName === 'Readonly' || typeName === 'Required')
    && firstTypeArgument !== undefined
  ) {
    return typeNodeToJsonSchema(firstTypeArgument, sourceFile)
  }
  if (typeName === 'Partial' && firstTypeArgument !== undefined) {
    const schema = typeNodeToJsonSchema(firstTypeArgument, sourceFile)
    return isJsonSchemaObject(schema) ? withoutRequired(schema) : schema
  }
  return {
    type: 'object',
    title: node.getText(sourceFile),
  }
}

function literalTypeNodeToJsonSchema(
  node: ts.LiteralTypeNode,
  sourceFile: ts.SourceFile | undefined,
): JsonSchema {
  const value = literalTypeNodeValue(node, sourceFile)
  if (value === undefined) return true
  if (value === null) return { type: 'null' }
  return { type: jsonSchemaTypeForLiteralValue(value), enum: [value] }
}

function jsonSchemaTypeForLiteralValue(value: string | number | boolean): 'string' | 'number' | 'boolean' {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  return 'boolean'
}

function literalTypeNodeValue(
  node: ts.LiteralTypeNode,
  sourceFile: ts.SourceFile | undefined,
): string | number | boolean | null | undefined {
  const literal = node.literal
  if (ts.isStringLiteral(literal)) return literal.text
  if (ts.isNumericLiteral(literal)) return Number(literal.text)
  if (literal.kind === ts.SyntaxKind.TrueKeyword) return true
  if (literal.kind === ts.SyntaxKind.FalseKeyword) return false
  if (literal.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isPrefixUnaryExpression(literal)
    && literal.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(literal.operand)
  ) {
    return -Number(literal.operand.text)
  }
  const text = literal.getText(sourceFile)
  if (text.length === 0) return undefined
  return undefined
}

function intrinsicSchemaFromKeywordTypeNode(node: ts.TypeNode): JsonSchema | undefined {
  if (node.kind === ts.SyntaxKind.StringKeyword) return { type: 'string' }
  if (node.kind === ts.SyntaxKind.NumberKeyword) return { type: 'number' }
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return { type: 'boolean' }
  if (node.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' }
  if (node.kind === ts.SyntaxKind.NeverKeyword) return false
  if (
    node.kind === ts.SyntaxKind.AnyKeyword
    || node.kind === ts.SyntaxKind.UnknownKeyword
    || node.kind === ts.SyntaxKind.VoidKeyword
    || node.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return true
  }
  if (node.kind === ts.SyntaxKind.ObjectKeyword) return { type: 'object' }
  return undefined
}

function combineUnionSchemas(schemas: readonly JsonSchema[]): JsonSchema {
  if (schemas.length === 0) return true
  if (schemas.some(schema => schema === true)) return true
  if (schemas.length === 1) return schemas[0] ?? true

  const literalEnum = mergeLiteralUnionToEnum(schemas)
  if (literalEnum !== undefined) return literalEnum

  return { anyOf: schemas }
}

/** 同质字面量 union -> { enum: [...] }，避免 Draft 2020-12 不推荐的 anyOf 字面量分支链。 */
function mergeLiteralUnionToEnum(
  schemas: readonly JsonSchema[],
): JsonSchemaObject | undefined {
  const values: Array<string | number | boolean | null> = []
  for (const schema of schemas) {
    const value = extractConstOrSingleEnumValue(schema)
    if (value === undefined) return undefined
    values.push(value)
  }
  return values.length === schemas.length ? { enum: values } : undefined
}

function isUndefinedLikeTypeNode(node: ts.TypeNode): boolean {
  return node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.VoidKeyword
}

function readPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  if (ts.isNumericLiteral(name)) return name.text
  return undefined
}

function isJsonSchemaObject(schema: JsonSchema): schema is JsonSchemaObject {
  return schema !== true && schema !== false && typeof schema === 'object' && !Array.isArray(schema)
}

function withoutRequired(schema: JsonSchemaObject): JsonSchemaObject {
  const { required: _required, ...rest } = schema
  return rest
}
