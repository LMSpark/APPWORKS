/**
 * @module @spark-appworks/spark-ai:class-model/knowledge/class-model-knowledge-service
 * 职责：把 DtsTypeDeclarationModel surface 转成 query、modelGuide、attributeGuide 和 methodGuide 的可读知识结果。
 * 边界：只做知识检索和文本投影，不执行工具、不修改模型实例，也不读取生成文件系统。
 * AI用途：LLM 需要按 kind/action/attribute 获取模型知识时，用本模块理解查询如何收敛到可见上下文。
 */
import type { JsonSchema, JsonValue } from '@spark-appworks/spark-json-document'
import type {
  AttributeMeta,
  DtsTypeDeclarationModel,
  ClassModelDeclarationRelation,
  ClassModelDocument,
  ConstructorMeta,
  MethodMeta,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
} from '../class-model/types'
import type { DtsClassModelSurfaceDocument } from '../class-model/dts-surface-types'
import type { DtsTypeMeta } from '../class-model/types'
import { resolveMethodReturnType, visitDtsTypeMeta } from '../class-model/dts-type-meta-ops'
import { jsonSchemaToTypeText } from '../class-model/json-schema-to-type'
import {
  listAttributeReachableKinds,
  projectClassModelForGuide,
} from '../class-model/model-projection'
import {
  renderAttributeTypeText,
  renderConstructorSignature,
  renderMethodSignature,
  renderMethodSignatureFromMeta,
} from '../class-model/signature-renderer'
import {
  renderAttributeGuide,
  renderMethodGuide,
  renderModelGuide,
} from '../projection'

/** Class Model Knowledge Query Input 的输入数据。 */
export type ClassModelKnowledgeQueryInput = Readonly<{
  /** 限定查询的 DtsTypeDeclarationModel kind；省略则查可达闭包。 */
  kind?: string
  /** 关键词过滤，匹配名称、摘要与成员文本。 */
  keyword?: string
  /** 限定 SPARK 组件名。 */
  componentName?: string
  /** 限定 SPARK 组件 type，如 r-table / r-text。 */
  componentType?: string
  /** 限定 SPARK 组件层级，如 table-level / row-level / field-level。 */
  componentLevel?: ComponentClassModelLevel
  /** 限定 SPARK 组件架构分层，如 data-view-container / row-scope / data-field。 */
  componentLayer?: ComponentClassModelLayer
  /** 限定 SPARK 组件目录，如 containers/data-views。 */
  componentDirectory?: string
  /** true 时在结果中包含 constructor/attributes/methods 摘要。 */
  includeMembers: boolean
}>

/** Class Model Model Guide Input 的输入数据。 */
export type ClassModelModelGuideInput = Readonly<{
  /** 目标模型的 kind（className）。 */
  kind: string
}>

/** Class Model Attribute Guide Input 的输入数据。 */
export type ClassModelAttributeGuideInput = Readonly<{
  /** 属性所属模型的 kind。 */
  kind: string
  /** 目标属性名。 */
  attributeName: string
}>

/** Class Model Method Guide Input 的输入数据。 */
export type ClassModelMethodGuideInput = Readonly<{
  /** 方法所属模型的 kind。 */
  kind: string
  /** 目标方法名（action 名）。 */
  methodName: string
}>

/** Class Model Knowledge Provider 的语义模型。 */
export type ClassModelKnowledgeProvider = Readonly<{
  /** 可选刷新钩子，重新加载 surface 或 bundle。 */
  refresh?: (requestedClassName?: string) => Promise<void>
  /** 按 kind/keyword 查询可达模型知识。 */
  query(input: ClassModelKnowledgeQueryInput): JsonValue | Promise<JsonValue>
  /** 返回单个模型的完整 guide 文本。 */
  modelGuide(input: ClassModelModelGuideInput): string | Promise<string>
  /** 返回单个属性的 guide 文本。 */
  attributeGuide(input: ClassModelAttributeGuideInput): string | Promise<string>
  /** 返回单个方法的 guide 文本。 */
  methodGuide(input: ClassModelMethodGuideInput): string | Promise<string>
}>

/** Class Model Knowledge Service Options 的调用配置。 */
export type ClassModelKnowledgeServiceOptions = Readonly<{
  /** 内存 ClassModelDocument 后端；与 surface 二选一。 */
  document?: ClassModelDocument
  /** 预加载的 surface 文档后端；与 document 二选一。 */
  surface?: DtsClassModelSurfaceDocument
  /** surface 模式的根 className，决定可达闭包起点。 */
  rootClassName?: string
}>

type KnowledgeBackend =
  | Readonly<{ mode: 'document'; document: ClassModelDocument }>
  | Readonly<{ mode: 'surface'; surface: DtsClassModelSurfaceDocument; rootClassName: string }>

/** Class Model Knowledge Service 的语义模型。 */
export class ClassModelKnowledgeService implements ClassModelKnowledgeProvider {
  private readonly backend: KnowledgeBackend

    /** 创建 Class Model Knowledge Service 实例。 */
public constructor(options: ClassModelKnowledgeServiceOptions) {
    this.backend = resolveBackend(options)
  }

    /** 查询参数。 */
public query(input: ClassModelKnowledgeQueryInput): JsonValue {
    const keyword = input.keyword?.toLowerCase()
    if (this.backend.mode === 'surface') {
      const { surface, rootClassName } = this.backend
      const candidateClassNames = hasComponentQuery(input)
        ? Object.keys(surface.models)
        : listReachableSurfaceClassNames(surface, rootClassName)
      const models = candidateClassNames
        .filter(kind => input.kind === undefined || kind === input.kind)
        .map(kind => readSurfaceModel(surface, kind))
        .filter(model => modelMatchesComponentQuery(model, input))
        .filter(model => keyword === undefined || modelMatchesKeyword(model, keyword))
        .map(model => ({
          kind: model.name,
          name: model.name,
          jsdoc: model.jsdoc,
          summary: summarizeJsDoc(model.jsdoc),
          ...declarationRelationsProperty(model),
          ...componentProfileProperty(model),
          ...(input.includeMembers
            ? {
                ...constructorQueryProperty(model),
                attributes: knowledgeAttributes(model).map(attribute => ({
                  name: attribute.name,
                  jsdoc: attribute.jsdoc,
                  summary: summarizeJsDoc(attribute.jsdoc),
                  typeText: jsonSchemaToTypeText(attribute.schema ?? true),
                })),
                methods: knowledgeMethods(model).map(method => ({
                  name: method.name,
                  jsdoc: method.jsdoc,
                  summary: summarizeJsDoc(method.jsdoc),
                  signature: renderMethodSignatureFromMeta(method),
                })),
              }
            : {}),
        }))
      return {
        rootKind: rootClassName,
        models,
      }
    }

    const document = this.backend.document
    const models = listAttributeReachableKinds(document)
      .filter(kind => input.kind === undefined || kind === input.kind)
      .map(kind => projectClassModelForGuide(document, kind))
      .filter(model => modelMatchesComponentQuery(model, input))
      .filter(model => keyword === undefined || modelMatchesKeyword(model, keyword))
      .map(model => ({
        kind: model.name,
        name: model.name,
        jsdoc: model.jsdoc,
        summary: summarizeJsDoc(model.jsdoc),
        ...componentProfileProperty(model),
        ...(input.includeMembers
          ? {
              ...constructorQueryProperty(model),
              attributes: knowledgeAttributes(model).map(attribute => ({
                name: attribute.name,
                jsdoc: attribute.jsdoc,
                summary: summarizeJsDoc(attribute.jsdoc),
                  typeText: renderAttributeTypeText(document, model.name, attribute),
              })),
              methods: knowledgeMethods(model).map(method => ({
                name: method.name,
                jsdoc: method.jsdoc,
                summary: summarizeJsDoc(method.jsdoc),
                signature: renderMethodSignature(document, model.name, method),
              })),
            }
          : {}),
      }))

    return {
      rootKind: document.rootKind,
      models,
    }
  }

    /** 执行 model Guide 操作。 */
public modelGuide(input: ClassModelModelGuideInput): string {
    if (this.backend.mode === 'surface') {
      return renderSurfaceClassModel(readSurfaceModel(this.backend.surface, input.kind))
    }
    return renderModelGuide({
      document: this.backend.document,
      kind: input.kind,
    }).text
  }

    /** 执行 attribute Guide 操作。 */
public attributeGuide(input: ClassModelAttributeGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const attribute = knowledgeAttributes(model).find(candidate => candidate.name === input.attributeName)
      if (attribute === undefined) throw new Error(`DtsTypeDeclarationModel attribute not found: ${input.kind}.${input.attributeName}`)
      return [
        renderComponentProfile(model),
        model.jsdoc.trim(),
        `${modelDeclarationHeader(model)} {`,
        indent(`${attribute.writable ? '' : 'readonly '}${attribute.name}: ${jsonSchemaToTypeText(attribute.schema ?? true)}`),
        '}',
      ].filter(line => line.length > 0).join('\n')
    }
    return renderAttributeGuide({
      document: this.backend.document,
      kind: input.kind,
      attributeName: input.attributeName,
    }).text
  }

    /** 执行 method Guide 操作。 */
public methodGuide(input: ClassModelMethodGuideInput): string {
    if (this.backend.mode === 'surface') {
      const model = readSurfaceModel(this.backend.surface, input.kind)
      const method = knowledgeMethods(model).find(candidate => candidate.name === input.methodName)
      if (method === undefined) throw new Error(`DtsTypeDeclarationModel method not found: ${input.kind}.${input.methodName}`)
      const chunks = [
        renderComponentProfile(model),
        model.jsdoc.trim(),
        `${modelDeclarationHeader(model)} {`,
        indent(renderSurfaceMethod(method)),
        '}',
      ]
      return chunks.filter(line => line.length > 0).join('\n')
    }
    return renderMethodGuide({
      document: this.backend.document,
      kind: input.kind,
      methodName: input.methodName,
    }).text
  }
}

function resolveBackend(options: ClassModelKnowledgeServiceOptions): KnowledgeBackend {
  if (options.surface !== undefined) {
    const rootClassName = options.rootClassName
    if (rootClassName === undefined || rootClassName.length === 0) {
      throw new Error('ClassModelKnowledgeService surface mode requires rootClassName.')
    }
    return { mode: 'surface', surface: options.surface, rootClassName }
  }
  if (options.document !== undefined) return { mode: 'document', document: options.document }
  throw new Error('ClassModelKnowledgeService requires document or surface+rootClassName.')
}

function readSurfaceModel(surface: DtsClassModelSurfaceDocument, className: string): DtsTypeDeclarationModel {
  const model = surface.models[className]
  if (model === undefined) throw new Error(`DtsTypeDeclarationModel not found: ${className}`)
  return model
}

function listReachableSurfaceClassNames(
  surface: DtsClassModelSurfaceDocument,
  rootClassName: string,
): readonly string[] {
  const visited = new Set<string>()
  const queue = [rootClassName]
  while (queue.length > 0) {
    const className = queue.shift()
    if (className === undefined || visited.has(className)) continue
    const model = surface.models[className]
    if (model === undefined) continue
    visited.add(className)
    for (const linked of listSurfaceLinkedClassNames(surface, model)) {
      if (!visited.has(linked)) queue.push(linked)
    }
  }
  return [...visited]
}

function listSurfaceLinkedClassNames(surface: DtsClassModelSurfaceDocument, model: DtsTypeDeclarationModel): readonly string[] {
  const linked = new Set<string>()
  for (const relation of knowledgeDeclarationRelations(model)) {
    collectTypeRefs(surface, linked, relation.targetName ?? relation.typeText)
  }
  const constructorMeta = knowledgeConstructor(model)
  if (constructorMeta !== undefined) {
    collectTypeRefs(surface, linked, constructorMeta.signatureText)
    for (const parameter of constructorMeta.parameters ?? []) {
      collectDtsTypeRefs(surface, linked, parameter.type)
    }
    if (constructorMeta.paramsSchema !== undefined) {
      for (const schema of Object.values(constructorMeta.paramsSchema.properties ?? {})) {
        collectSchemaTypeRefs(surface, linked, schema)
      }
    }
  }
  for (const attribute of knowledgeAttributes(model)) collectSchemaTypeRefs(surface, linked, attribute.schema ?? true)
  for (const method of knowledgeMethods(model)) {
    collectTypeRefs(surface, linked, method.signatureText)
    for (const parameter of method.parameters ?? []) {
      collectDtsTypeRefs(surface, linked, parameter.type)
    }
    collectDtsTypeRefs(surface, linked, resolveMethodReturnType(method))
    collectSchemaTypeRefs(surface, linked, method.returnSchema)
    if (method.paramsSchema !== undefined) {
      for (const schema of Object.values(method.paramsSchema.properties ?? {})) {
        collectSchemaTypeRefs(surface, linked, schema)
      }
    }
  }
  return [...linked]
}

function collectDtsTypeRefs(
  surface: DtsClassModelSurfaceDocument,
  linked: Set<string>,
  typeMeta: DtsTypeMeta | undefined,
): void {
  visitDtsTypeMeta(typeMeta, (node) => {
    if (node.type !== 'reference' || node.refersToTypeParameter === true) return
    if (surface.models[node.name] !== undefined) {
      linked.add(node.name)
      return
    }
    collectTypeRefs(surface, linked, node.name)
  })
}

function collectTypeRefs(surface: DtsClassModelSurfaceDocument, linked: Set<string>, text: string | undefined): void {
  if (text === undefined) return
  for (const className of Object.keys(surface.models)) {
    const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'u').test(text)) linked.add(className)
  }
}

function collectSchemaTypeRefs(
  surface: DtsClassModelSurfaceDocument,
  linked: Set<string>,
  schema: JsonSchema | undefined,
): void {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return
  if (typeof schema.$ref === 'string') collectTypeRefs(surface, linked, schema.$ref)
  if (typeof schema.title === 'string') collectTypeRefs(surface, linked, schema.title)
  if (schema.items !== undefined) collectSchemaTypeRefs(surface, linked, schema.items)
  for (const child of Object.values(schema.properties ?? {})) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.anyOf ?? []) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.oneOf ?? []) collectSchemaTypeRefs(surface, linked, child)
  for (const child of schema.allOf ?? []) collectSchemaTypeRefs(surface, linked, child)
}

function renderSurfaceClassModel(model: DtsTypeDeclarationModel): string {
  const constructorMeta = knowledgeConstructor(model)
  const parts = [
    renderComponentProfile(model),
    renderDeclarationRelations(model),
    model.jsdoc.trim(),
    `${modelDeclarationHeader(model)} {`,
    ...(constructorMeta === undefined
      ? []
      : [indent(renderSurfaceConstructor(constructorMeta))]),
    ...knowledgeAttributes(model).map(attribute => indent(`${attribute.writable ? '' : 'readonly '}${attribute.name}: ${jsonSchemaToTypeText(attribute.schema ?? true)}`)),
    ...knowledgeMethods(model).map(method => indent(renderSurfaceMethod(method))),
    '}',
  ]
  return parts.filter(part => part.length > 0).join('\n')
}

function declarationRelationsProperty(
  model: DtsTypeDeclarationModel,
): { declarationRelations?: DeclarationRelationQueryRecord[] } {
  const relations = knowledgeDeclarationRelations(model)
  return relations.length === 0
    ? {}
    : {
        declarationRelations: relations.map(relation => ({
          kind: relation.kind,
          typeText: relation.typeText,
          ...(relation.targetName === undefined ? {} : { targetName: relation.targetName }),
        })),
      }
}

type DeclarationRelationQueryRecord = Readonly<{
  kind: string
  typeText: string
  targetName?: string
}>

function renderDeclarationRelations(model: DtsTypeDeclarationModel): string {
  const lines: string[] = []
  const declarationTypeText = knowledgeDeclarationTypeText(model)
  if (declarationTypeText !== undefined) {
    lines.push(`DTS declaration: ${model.name} = ${declarationTypeText}`)
  }
  for (const relation of knowledgeDeclarationRelations(model)) {
    lines.push(`DTS relation: ${relation.kind} ${relation.typeText}`)
  }
  if (lines.length === 0) return ''
  return [
    '/**',
    ...lines.map(line => ` * ${line}`),
    ' */',
  ].join('\n')
}

type ComponentProfile = Readonly<{
  name?: string
  type?: string
  level?: string
  layer?: string
  directory?: string
}>

function componentProfileProperty(
  model: Pick<DtsTypeDeclarationModel, 'component' | 'provenance'>,
): { component?: ComponentProfile } {
  const component = componentProfile(model)
  return component === undefined ? {} : { component }
}

function componentProfile(
  model: Pick<DtsTypeDeclarationModel, 'component' | 'provenance'>,
): ComponentProfile | undefined {
  if (model.component !== undefined && Object.keys(model.component).length > 0) return model.component
  const provenance = model.provenance
  if (provenance === undefined) return undefined
  const component: ComponentProfile = {
    ...(provenance.componentName === undefined ? {} : { name: provenance.componentName }),
    ...(provenance.componentType === undefined ? {} : { type: provenance.componentType }),
    ...(provenance.componentLevel === undefined ? {} : { level: provenance.componentLevel }),
    ...(provenance.componentLayer === undefined ? {} : { layer: provenance.componentLayer }),
    ...(provenance.componentDirectory === undefined ? {} : { directory: provenance.componentDirectory }),
  }
  return Object.keys(component).length === 0 ? undefined : component
}

function hasComponentQuery(input: ClassModelKnowledgeQueryInput): boolean {
  return input.componentName !== undefined
    || input.componentType !== undefined
    || input.componentLevel !== undefined
    || input.componentLayer !== undefined
    || input.componentDirectory !== undefined
}

function modelMatchesComponentQuery(
  model: Pick<DtsTypeDeclarationModel, 'component' | 'provenance'>,
  input: ClassModelKnowledgeQueryInput,
): boolean {
  if (!hasComponentQuery(input)) return true
  const component = componentProfile(model)
  if (component === undefined) return false
  return (input.componentName === undefined || component.name === input.componentName)
    && (input.componentType === undefined || component.type === input.componentType)
    && (input.componentLevel === undefined || component.level === input.componentLevel)
    && (input.componentLayer === undefined || component.layer === input.componentLayer)
    && (input.componentDirectory === undefined || component.directory === input.componentDirectory)
}

function renderComponentProfile(model: Pick<DtsTypeDeclarationModel, 'component' | 'provenance'>): string {
  const component = componentProfile(model)
  if (component === undefined) return ''
  const parts = [
    component.type === undefined ? undefined : `type=${component.type}`,
    component.name === undefined ? undefined : `name=${component.name}`,
    component.level === undefined ? undefined : `level=${component.level}`,
    component.layer === undefined ? undefined : `layer=${component.layer}`,
    component.directory === undefined ? undefined : `directory=${component.directory}`,
  ].filter(part => part !== undefined)
  return `/** SPARK component ${parts.join('; ')} */`
}

function constructorQueryProperty(
  model: DtsTypeDeclarationModel,
): { constructorSignature?: { summary: string; jsdoc: string; signature: string } } {
  const constructorMeta = knowledgeConstructor(model)
  return constructorMeta === undefined
    ? {}
    : {
        constructorSignature: {
          summary: summarizeJsDoc(constructorMeta.jsdoc),
          jsdoc: constructorMeta.jsdoc,
          signature: renderConstructorSignature(constructorMeta),
        },
      }
}

function renderSurfaceConstructor(constructorMeta: ConstructorMeta): string {
  return [
    constructorMeta.jsdoc.trim(),
    renderConstructorSignature(constructorMeta),
  ].filter(part => part.length > 0).join('\n')
}

function renderSurfaceMethod(method: MethodMeta): string {
  return [
    method.jsdoc.trim(),
    renderMethodSignatureFromMeta(method),
  ].filter(part => part.length > 0).join('\n')
}

type ProjectedModel = ReturnType<typeof projectClassModelForGuide>

function modelMatchesKeyword(model: ProjectedModel, keyword: string): boolean {
  const constructorMeta = knowledgeConstructor(model)
  const component = componentProfile(model)
  const haystacks = [
    model.name,
    model.name,
    summarizeJsDoc(model.jsdoc),
    component?.name ?? '',
    component?.type ?? '',
    component?.level ?? '',
    component?.layer ?? '',
    component?.directory ?? '',
    summarizeJsDoc(constructorMeta?.jsdoc ?? ''),
    constructorMeta === undefined ? '' : renderConstructorSignature(constructorMeta),
    ...knowledgeAttributes(model).flatMap(attribute => [attribute.name, summarizeJsDoc(attribute.jsdoc)]),
    ...knowledgeMethods(model).flatMap(method => [method.name, summarizeJsDoc(method.jsdoc)]),
  ]
  return haystacks.some(value => value.toLowerCase().includes(keyword))
}

function modelDeclarationHeader(model: DtsTypeDeclarationModel): string {
  if (model.declarationKind === 'typeAlias') return `type ${model.name}`
  return `${model.declarationKind} ${model.name}`
}

function knowledgeConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

function knowledgeAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function knowledgeMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

function knowledgeDeclarationRelations(model: DtsTypeDeclarationModel): readonly ClassModelDeclarationRelation[] {
  if (model.declarationKind === 'class') return model.classDecl.declarationRelations ?? []
  if (model.declarationKind === 'interface') return model.interfaceDecl.declarationRelations ?? []
  if (model.declarationKind === 'typeAlias') return model.typeAlias.declarationRelations ?? []
  return []
}

function knowledgeDeclarationTypeText(model: DtsTypeDeclarationModel): string | undefined {
  return model.declarationKind === 'typeAlias' ? model.typeAlias.declarationTypeText : undefined
}

function summarizeJsDoc(jsdoc: string): string {
  const lines = jsdoc
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('@'))
  return lines[0] ?? ''
}

function indent(text: string): string {
  return text
    .split(/\r?\n/u)
    .map(line => (line.length === 0 ? line : `  ${line}`))
    .join('\n')
}
