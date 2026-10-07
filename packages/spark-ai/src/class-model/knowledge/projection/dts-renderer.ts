/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/projection/dts-renderer
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 dts-renderer 能力，围绕 ModelGuideRenderInput、ModelGuide、AttributeGuideRenderInput 等 6 个公开契约 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/projection/dts-renderer 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type { AttributeMeta, DtsTypeDeclarationModel, ClassModelDocument, ConstructorMeta, JsDocMeta, MethodMeta } from '../../class-model/types'
import { projectClassModelForGuide } from '../../class-model/model-projection'
import {
  renderAttributeDeclarationLine,
  renderConstructorSignature,
  renderMethodDeclarationLine,
} from '../../class-model/signature-renderer'

/** Model Guide Render Input 的输入数据。 */
export type ModelGuideRenderInput = Readonly<{
  /** 完整 ClassModelDocument，供类型解析与签名渲染。 */
  document: ClassModelDocument
  /** 目标模型的 kind（className）。 */
  kind: string
}>

/** Model Guide 的语义模型。 */
export type ModelGuide = Readonly<{
  /** 模型 kind 标识。 */
  kind: string
  /** 模型声明头行（class/interface/type 前缀）。 */
  declaration: string
  /** 含 JSDoc 与成员的完整 guide 文本。 */
  text: string
}>

/** Attribute Guide Render Input 的输入数据。 */
export type AttributeGuideRenderInput = Readonly<{
  /** 完整 ClassModelDocument，供类型解析与签名渲染。 */
  document: ClassModelDocument
  /** 属性所属模型的 kind。 */
  kind: string
  /** 目标属性名。 */
  attributeName: string
}>

/** Attribute Guide 的语义模型。 */
export type AttributeGuide = Readonly<{
  /** 属性所属模型的 kind。 */
  kind: string
  /** 目标属性名。 */
  attributeName: string
  /** 属性单行声明（含 readonly 与类型）。 */
  declaration: string
  /** 含模型 JSDoc 与属性声明的 guide 文本。 */
  text: string
}>

/** Method Guide Render Input 的输入数据。 */
export type MethodGuideRenderInput = Readonly<{
  /** 完整 ClassModelDocument，供类型解析与签名渲染。 */
  document: ClassModelDocument
  /** 方法所属模型的 kind。 */
  kind: string
  /** 目标方法名。 */
  methodName: string
}>

/** Method Guide 的语义模型。 */
export type MethodGuide = Readonly<{
  /** 方法所属模型的 kind。 */
  kind: string
  /** 目标方法名。 */
  methodName: string
  /** 方法单行签名声明。 */
  declaration: string
  /** 含模型 JSDoc 与方法声明的 guide 文本。 */
  text: string
}>

export function renderClassModelDeclaration(
  document: ClassModelDocument,
  model: DtsTypeDeclarationModel,
): string {
  const parts: string[] = []
  parts.push(renderJsDocMeta(model.jsdoc))
  parts.push(`${modelDeclarationHeader(model)} {`)
  const constructorMeta = declarationConstructor(model)
  if (constructorMeta !== undefined) {
    parts.push(indent(renderJsDocMeta(constructorMeta.jsdoc)))
    parts.push(indent(renderConstructorSignature(constructorMeta)))
  }
  for (const attribute of declarationAttributes(model)) {
    parts.push(indent(renderAttributeDeclaration(document, model.name, attribute)))
  }
  for (const method of declarationMethods(model)) {
    parts.push(indent(renderMethodDeclaration(document, model.name, method)))
  }
  parts.push('}')
  return parts.filter(part => part.length > 0).join('\n')
}

export function renderModelGuide(input: ModelGuideRenderInput): ModelGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const text = renderClassModelDeclaration(input.document, model)
  return {
    kind: input.kind,
    declaration: modelDeclarationHeader(model),
    text,
  }
}

export function renderAttributeGuide(input: AttributeGuideRenderInput): AttributeGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const attribute = declarationAttributes(model).find(candidate => candidate.name === input.attributeName)
  if (attribute === undefined) throw new Error(`DtsTypeDeclarationModel attribute not found: ${input.kind}.${input.attributeName}`)

  const declarationLine = renderAttributeDeclarationLine(input.document, input.kind, attribute)
  const text = [
    renderJsDocMeta(model.jsdoc),
    `${modelDeclarationHeader(model)} {`,
    indent(renderAttributeDeclaration(input.document, input.kind, attribute)),
    '}',
  ].join('\n')

  return {
    kind: input.kind,
    attributeName: input.attributeName,
    declaration: declarationLine,
    text,
  }
}

export function renderMethodGuide(input: MethodGuideRenderInput): MethodGuide {
  const model = projectClassModelForGuide(input.document, input.kind)
  const method = declarationMethods(model).find(candidate => candidate.name === input.methodName)
  if (method === undefined) throw new Error(`DtsTypeDeclarationModel method not found: ${input.kind}.${input.methodName}`)

  const declarationLine = renderMethodDeclarationLine(input.document, input.kind, method)
  const text = [
    renderJsDocMeta(model.jsdoc),
    `${modelDeclarationHeader(model)} {`,
    indent(renderMethodDeclaration(input.document, input.kind, method)),
    '}',
  ].join('\n')
  return {
    kind: input.kind,
    methodName: input.methodName,
    declaration: declarationLine,
    text,
  }
}

function modelDeclarationHeader(model: DtsTypeDeclarationModel): string {
  if (model.declarationKind === 'typeAlias') return `type ${model.name}`
  return `${model.declarationKind} ${model.name}`
}

function declarationConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

function declarationAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function declarationMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

export function renderMethodDeclaration(
  document: ClassModelDocument,
  ownerKind: string,
  method: MethodMeta,
): string {
  return [
    renderJsDocMeta(method.jsdoc),
    renderMethodDeclarationLine(document, ownerKind, method),
  ].filter(part => part.length > 0).join('\n')
}

export function renderAttributeDeclaration(
  document: ClassModelDocument,
  ownerKind: string,
  attribute: AttributeMeta,
): string {
  return [
    renderJsDocMeta(attribute.jsdoc),
    renderAttributeDeclarationLine(document, ownerKind, attribute),
  ].filter(part => part.length > 0).join('\n')
}

function renderJsDocMeta(jsdoc: JsDocMeta): string {
  return jsdoc.trim()
}

function indent(value: string): string {
  return value.split('\n').map(line => (line.length === 0 ? line : `  ${line}`)).join('\n')
}
