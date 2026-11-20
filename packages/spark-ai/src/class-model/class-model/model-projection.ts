/**
 * @module @spark-appworks/spark-ai:class-model/class-model/model-projection
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 model-projection 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/model-projection 这一段如何生成、加载或投影时，用本模块定位职责。
 */
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiSourceProvenanceMetadata,
  AiRuntimeApiMetadataJson,
} from '../metadata'
import type {
  AttributeMeta,
  DtsTypeDeclarationModel,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'

/**
 * 按 kind 从 DtsTypeDeclarationModel module 取完整 API 元数据（apiRegistry 优先）。
 * 不在 ClassModelDocument 上预存 models；guide 投影时按需调用。
 */
export function resolveModuleApi(document: ClassModelDocument, kind: string): AiApiObjectMetadata {
  const api = resolveModuleApiOrUndefined(document, kind)
  if (api === undefined) {
    throw new Error(`DtsTypeDeclarationModel module API not found for kind "${kind}".`)
  }
  return api
}

export function resolveModuleApiOrUndefined(
  document: ClassModelDocument,
  kind: string,
): AiApiObjectMetadata | undefined {
  if (document.module.rootApi.kind === kind) return document.module.rootApi
  return document.module.apiRegistry?.[kind]
}

/**
 * 从 root 沿 attribute.api 属性链可达的 kind（LLM 发现索引）。
 *
 * attribute.api 统一指向子 model kind：标量对象直接挂接；`T[]` / `Iterable<T>` 挂接元素 T 的 kind，
 * 集合语义由 attribute.schema.type === 'array' 表达，BFS 不区分标量/数组边。
 */
export function listAttributeReachableKinds(document: ClassModelDocument): readonly string[] {
  const kinds: string[] = []
  const visited = new Set<string>()
  const queue = [document.module.rootApi]
  while (queue.length > 0) {
    const api = queue.shift()
    if (api === undefined || visited.has(api.kind)) continue
    visited.add(api.kind)
    kinds.push(api.kind)
    for (const attribute of api.attributes ?? []) {
      const childKind = readAttributeLinkedKind(attribute)
      if (childKind === undefined) continue
      const childApi = resolveModuleApiOrUndefined(document, childKind)
      if (childApi !== undefined) queue.push(childApi)
    }
  }
  return kinds
}

/** LLM guide 投影：仅当 kind 在属性链上（或为 root）时返回 DtsTypeDeclarationModel。 */
export function projectClassModelForGuide(document: ClassModelDocument, kind: string): DtsTypeDeclarationModel {
  const reachable = new Set(listAttributeReachableKinds(document))
  if (!reachable.has(kind)) {
    throw new Error(
      `DtsTypeDeclarationModel kind "${kind}" is not reachable from root "${document.rootKind}" via attribute.api; fix native planning model / DtsTypeDeclarationModel attribute reflection.`,
    )
  }
  return projectClassModelFromApi(resolveModuleApi(document, kind))
}

export function projectClassModelFromApi(api: AiApiObjectMetadata): DtsTypeDeclarationModel {
  const constructorMeta = createConstructorMeta(api)
  return {
    name: apiClassName(api),
    jsdoc: jsdocFromMetadata(api.jsdoc, api.description),
    declarationKind: 'class',
    ...provenanceProperty(api.provenance),
    classDecl: {
      constructorMeta: constructorMeta ?? createDefaultConstructorMeta(api),
      members: {
        attributes: (api.attributes ?? []).map(attribute => createAttributeMeta(attribute)),
        methods: api.actions.map(action => createMethodMeta(action)),
      },
    },
  }
}

export function classNameForKind(document: ClassModelDocument, kind: string): string {
  const api = resolveModuleApiOrUndefined(document, kind)
  return api === undefined ? kind : apiClassName(api)
}

export function findNestedAttributeApi(
  document: ClassModelDocument,
  ownerKind: string,
  attributeName: string,
): AiApiObjectMetadata | undefined {
  const owner = resolveModuleApiOrUndefined(document, ownerKind)
  const attribute = owner?.attributes?.find(item => item.name === attributeName)
  if (attribute?.api === undefined) return undefined
  const childKind = readAttributeLinkedKind(attribute)
  if (childKind === undefined) return undefined
  return resolveModuleApiOrUndefined(document, childKind)
}

export function collectModuleApiKinds(module: AiRuntimeApiMetadataJson): readonly string[] {
  const kinds = new Set<string>()
  const pending: AiApiObjectMetadata[] = [module.rootApi, ...Object.values(module.apiRegistry ?? {})]
  while (pending.length > 0) {
    const api = pending.shift()
    if (api === undefined || kinds.has(api.kind)) continue
    kinds.add(api.kind)
    for (const attribute of api.attributes ?? []) {
      const childKind = readAttributeLinkedKind(attribute)
      if (childKind !== undefined) {
        const childApi = resolveModuleApiFromRegistry(module, childKind)
        if (childApi !== undefined) pending.push(childApi)
        continue
      }
      if (attribute.api !== undefined && 'kind' in attribute.api) {
        pending.push(attribute.api)
      }
    }
    for (const action of api.actions) {
      for (const ref of action.resultApis ?? []) {
        if (ref.api !== undefined) pending.push(ref.api)
      }
    }
  }
  return [...kinds].sort()
}

function createConstructorMeta(api: AiApiObjectMetadata): ConstructorMeta | undefined {
  if (api.constructorSignature === undefined) return undefined
  return {
    paramsSchema: api.constructorSignature.paramsSchema,
    jsdoc: jsdocFromMetadata(api.constructorSignature.jsdoc, api.constructorSignature.description),
    ...provenanceProperty(api.constructorSignature.provenance),
  }
}

function createDefaultConstructorMeta(api: AiApiObjectMetadata): ConstructorMeta {
  return {
    signatureText: 'constructor()',
    parameterStyle: 'positional',
    parameters: [],
    paramsSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    jsdoc: `/** 创建 ${apiClassName(api)} 实例。 */`,
    ...provenanceProperty(api.provenance),
  }
}

function createAttributeMeta(attribute: AiApiAttributeMetadata): AttributeMeta {
  return {
    name: attribute.name,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    jsdoc: jsdocFromMetadata(attribute.jsdoc, attribute.description),
    ...provenanceProperty(attribute.provenance),
  }
}

function createMethodMeta(action: AiApiActionMetadata): MethodMeta {
  return {
    name: action.name,
    ...(action.signatureText === undefined ? {} : { signatureText: action.signatureText }),
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { returnSchema: action.resultSchema }),
    ...(action.takesContext === undefined ? {} : { takesContext: action.takesContext }),
    jsdoc: jsdocFromAction(action),
    ...provenanceProperty(action.provenance),
  }
}

function jsdocFromAction(action: AiApiActionMetadata): JsDocMeta {
  if (action.jsdoc !== undefined) return jsdocFromMetadata(action.jsdoc, action.description)
  return renderJsDoc([
    action.description,
    ...tagLines('requiredBeforeCall', action.requiredBeforeCall ?? []),
    ...tagLines('usageRule', action.usageRules ?? []),
    ...tagLines('failureMode', (action.failureModes ?? []).map(mode => `${mode.code} ${mode.when} => ${mode.fix}`)),
  ])
}

function jsdocFromMetadata(jsdoc: AiApiJsDocMetadata | undefined, fallbackSummary: string): JsDocMeta {
  return typeof jsdoc === 'string' && jsdoc.trim().length > 0 ? jsdoc : renderJsDoc([fallbackSummary])
}

function provenanceProperty(
  provenance: AiApiSourceProvenanceMetadata | undefined,
): { provenance?: SourceProvenanceMeta } {
  if (provenance === undefined) return {}
  return {
    provenance: {
      file: provenance.file,
      line: provenance.line,
      className: provenance.className,
      ...(provenance.memberName === undefined ? {} : { memberName: provenance.memberName }),
      ...(provenance.typeEntryFile === undefined ? {} : { typeEntryFile: provenance.typeEntryFile }),
    },
  }
}

function tagLines(name: string, values: readonly string[]): readonly string[] {
  return values.map(text => `@${name}${text.length === 0 ? '' : ` ${text}`}`)
}

function renderJsDoc(lines: readonly string[]): string {
  const normalized = lines.filter(line => line.trim().length > 0)
  if (normalized.length === 0) return ''
  if (normalized.length === 1) return `/** ${normalized[0]} */`
  return [
    '/**',
    ...normalized.map(line => ` * ${line}`),
    ' */',
  ].join('\n')
}

function apiClassName(api: AiApiObjectMetadata): string {
  const className: unknown = Reflect.get(api, 'className')
  return typeof className === 'string' && className.length > 0 ? className : api.name
}

/** bundle 分片 attribute.api 可能是 { $ref: kind } 紧凑引用。 */
function readAttributeLinkedKind(attribute: AiApiAttributeMetadata): string | undefined {
  const api = attribute.api
  if (api === undefined) return undefined
  if ('kind' in api && typeof api.kind === 'string' && api.kind.length > 0) return api.kind
  if (!('kind' in api)) {
    const ref: unknown = Reflect.get(api, '$ref')
    if (typeof ref === 'string' && ref.trim().length > 0) return ref.trim()
  }
  return undefined
}

function resolveModuleApiFromRegistry(
  module: AiRuntimeApiMetadataJson,
  kind: string,
): AiApiObjectMetadata | undefined {
  if (module.rootApi.kind === kind) return module.rootApi
  return module.apiRegistry?.[kind]
}
