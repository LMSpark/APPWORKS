/**
 * @module @spark-appworks/spark-ai:class-model/class-model/signature-renderer
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 signature-renderer 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/signature-renderer 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { jsonSchemaToTypeText } from './schema/json-schema-to-type'
import {
  classNameForKind,
  findNestedAttributeApi,
} from './model-projection'
import type {
  AttributeMeta,
  ClassModelDocument,
  ConstructorMeta,
  DtsTypeMeta,
  MethodMeta,
  MethodParameterMeta,
} from './types'
import { canRenderMethodSignatureFromTypeTree, resolveMethodReturnType } from './declaration/dts-type-meta-ops'

export { classNameForKind } from './model-projection'

export function renderAttributeTypeText(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  const nestedApi = findNestedAttributeApi(document, ownerKind, attribute.name)
  const schema = attribute.schema ?? true
  if (nestedApi !== undefined) {
    const elementTypeText = classNameForKind(document, nestedApi.kind)
    return isArrayAttributeSchema(document, schema) ? `${elementTypeText}[]` : elementTypeText
  }
  return jsonSchemaToTypeText(schema)
}

function isArrayAttributeSchema(
  document: ClassModelDocument,
  schema: AttributeMeta['schema'],
): boolean {
  const resolved = resolveAttributeSchemaShape(document, schema)
  if (resolved === undefined) return false
  const type = resolved.type
  if (type === 'array') return true
  return Array.isArray(type) && type.includes('array')
}

function resolveAttributeSchemaShape(
  document: ClassModelDocument,
  schema: AttributeMeta['schema'],
): Readonly<{ type?: string | readonly string[] }> | undefined {
  if (schema === true || schema === false) return undefined
  if (typeof schema !== 'object' || Array.isArray(schema)) return undefined
  const ref = schema.$ref
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const defName = ref.slice('#/$defs/'.length)
    if (defName.startsWith('ArrayOf_')) return { type: 'array' }
    const def = document.$defs?.[defName]
    if (def !== undefined) return def
  }
  return schema
}

export function renderAttributeDeclarationLine(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  const readonlyText = attribute.writable ? '' : 'readonly '
  return `${readonlyText}${attribute.name}: ${renderAttributeTypeText(document, ownerKind, attribute)}`
}

export function renderConstructorSignature(constructor: ConstructorMeta): string {
  if (constructor.signatureText !== undefined && constructor.signatureText.trim().length > 0) {
    return constructor.signatureText
  }
  if (constructor.parameters !== undefined) {
    return `constructor(${constructor.parameters.map(renderMethodParameter).join(', ')})`
  }
  if (constructor.paramsSchema === undefined) return 'constructor()'
  return `constructor(${paramsTextFromSchema(constructor.paramsSchema)})`
}

export function renderMethodReturnTypeLabel(method: MethodMeta): string {
  const returnType = resolveMethodReturnType(method)
  if (returnType !== undefined) return renderDtsTypeMeta(returnType)
  if (method.returnSchema === undefined) return 'unknown'
  return jsonSchemaToTypeText(method.returnSchema)
}

export function renderMethodParamsText(method: MethodMeta): string {
  if (method.parameters !== undefined) {
    return method.parameters.map(renderMethodParameter).join(', ')
  }
  if (method.paramsSchema === undefined) return ''
  return paramsTextFromSchema(method.paramsSchema)
}

export function renderMethodSignatureFromMeta(method: MethodMeta): string {
  if (canRenderMethodSignatureFromTypeTree(method)) {
    return `${method.name}(${renderMethodParamsText(method)}): ${renderMethodReturnTypeLabel(method)}`
  }
  if (method.signatureText !== undefined && method.signatureText.trim().length > 0) {
    return method.signatureText
  }
  return `${method.name}(${renderMethodParamsText(method)}): ${renderMethodReturnTypeLabel(method)}`
}

export function renderDtsTypeMeta(typeMeta: DtsTypeMeta): string {
  if (typeMeta.type === 'intrinsic' || typeMeta.type === 'unknown') return typeMeta.name
  if (typeMeta.type === 'literal') return typeof typeMeta.value === 'string' ? JSON.stringify(typeMeta.value) : String(typeMeta.value)
  if (typeMeta.type === 'optional') {
    const elementText = renderDtsTypeMeta(typeMeta.elementType)
    return typeMeta.elementType.type === 'union' || typeMeta.elementType.type === 'intersection'
      ? `(${elementText}) | undefined`
      : `${elementText} | undefined`
  }
  if (typeMeta.type === 'rest') return `...${renderDtsTypeMeta(typeMeta.elementType)}`
  if (typeMeta.type === 'tuple') return `[${typeMeta.elements.map(renderDtsTypeMeta).join(', ')}]`
  if (typeMeta.type === 'reflection') return renderReflectionTypeMeta(typeMeta)
  if (typeMeta.type === 'reference') {
    const typeArguments = typeMeta.typeArguments?.map(renderDtsTypeMeta).join(', ')
    return typeArguments === undefined || typeArguments.length === 0
      ? typeMeta.name
      : `${typeMeta.name}<${typeArguments}>`
  }
  if (typeMeta.type === 'array') {
    const elementText = renderDtsTypeMeta(typeMeta.elementType)
    return needsTypeParentheses(typeMeta.elementType)
      ? `(${elementText})[]`
      : `${elementText}[]`
  }
  if (typeMeta.type === 'union') return typeMeta.types.map(renderDtsTypeMeta).join(' | ')
  return typeMeta.types.map(renderDtsTypeMeta).join(' & ')
}

export function renderMethodParameter(parameter: MethodParameterMeta): string {
  const optionalMark = parameter.flags?.isOptional === true ? '?' : ''
  return `${parameter.name}${optionalMark}: ${renderDtsTypeMeta(parameter.type)}`
}

function renderReflectionTypeMeta(typeMeta: Extract<DtsTypeMeta, { type: 'reflection' }>): string {
  const signature = typeMeta.declaration.signatures[0]
  if (signature === undefined) return 'Function'
  const paramsText = signature.parameters.map(renderMethodParameter).join(', ')
  return `(${paramsText}) => ${renderDtsTypeMeta(signature.type)}`
}

function needsTypeParentheses(typeMeta: DtsTypeMeta): boolean {
  return typeMeta.type === 'union' || typeMeta.type === 'intersection' || typeMeta.type === 'optional'
}

export function renderMethodSignature(
  _document: ClassModelDocument,
  _ownerKind: string,
  method: MethodMeta,
): string {
  return renderMethodSignatureFromMeta(method)
}

export function renderMethodDeclarationLine(
  document: ClassModelDocument,
  ownerKind: string,
  method: MethodMeta,
): string {
  return renderMethodSignature(document, ownerKind, method)
}

function paramsTextFromSchema(schema: JsonSchemaObject): string {
  const properties = schema.properties
  if (properties === undefined) return ''
  const required = new Set(schema.required ?? [])
  return Object.entries(properties)
    .map(([name, childSchema]) => {
      const optional = required.has(name) ? '' : '?'
      return `${name}${optional}: ${jsonSchemaToTypeText(childSchema)}`
    })
    .join(', ')
}
