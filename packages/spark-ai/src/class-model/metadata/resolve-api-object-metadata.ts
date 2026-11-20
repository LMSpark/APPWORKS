/**
 * @module @spark-appworks/spark-ai:class-model/metadata/resolve-api-object-metadata
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/metadata/resolve-api-object-metadata 的 ResolveRuntimeApiMetadataJsonOptions 语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */
/**
 * Resolve compact runtime API metadata (apiRegistry + action result $ref) into inline API trees.
 *
 * JSON Schema $ref 默认保留给运行时 AJV + schemaDefs；仅显式 inline 调用方可 inlineSchemaRefs。
 */

import type { JsonSchemaDefs } from '@spark-appworks/spark-json-document'
import type {
  AiApiActionMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiRuntimeApiMetadataJson,
} from './ai-api-object-metadata-schema'
import { dereferenceRuntimeApiMetadataSchemas } from './json-schema-dereference'

/** Resolve Runtime API Metadata Json Options 的调用配置。 */
export type ResolveRuntimeApiMetadataJsonOptions = Readonly<{
  /** 可供 $ref 内联的外部 JSON Schema 定义集；键为 $ref 路径（如 "#/$defs/Foo"），值为对应 Schema 对象。仅在 inlineSchemaRefs=true 时消费 */
  schemaDefs?: JsonSchemaDefs
  /** @default false — true 时在注册前 inline #/$defs/*；false 时留给 AJV 2020 解析。 */
  inlineSchemaRefs?: boolean
}>

type CompactResultApiRef = Readonly<{
  resultPath: readonly string[]
  $ref: string
  api?: never
}>

export function resolveRuntimeApiMetadataJson(
  module: AiRuntimeApiMetadataJson,
  options: ResolveRuntimeApiMetadataJsonOptions = {},
): AiRuntimeApiMetadataJson {
  const withSchemas: AiRuntimeApiMetadataJson =
    options.inlineSchemaRefs === true
      && options.schemaDefs !== undefined
      && Object.keys(options.schemaDefs).length > 0
      ? dereferenceRuntimeApiMetadataSchemas(module, options.schemaDefs)
      : module

  if (withSchemas.schemaVersion !== 2 || withSchemas.apiRegistry === undefined) {
    return withSchemas.schemaVersion === 2
      ? { schemaVersion: 1, rootApi: withSchemas.rootApi }
      : withSchemas
  }
  return {
    schemaVersion: 1,
    rootApi: resolveApiObjectMetadata(withSchemas.rootApi, withSchemas.apiRegistry, new Set()),
  }
}

type CompactAttributeApiRef = Readonly<{
  $ref: string
  kind?: never
  actions?: never
}>

function resolveApiObjectMetadata(
  api: AiApiObjectMetadata,
  registry: Readonly<Record<string, AiApiObjectMetadata>>,
  resolving: Set<string>,
): AiApiObjectMetadata {
  return {
    ...api,
    ...(api.attributes === undefined
      ? {}
      : {
          attributes: api.attributes.map(attribute => ({
            ...attribute,
            ...(attribute.api === undefined
              ? {}
              : { api: resolveAttributeApi(attribute.api, registry, resolving) }),
          })),
        }),
    actions: api.actions.map(action => resolveActionMetadata(action, registry, resolving)),
  }
}

function resolveAttributeApi(
  api: unknown,
  registry: Readonly<Record<string, AiApiObjectMetadata>>,
  resolving: Set<string>,
): AiApiObjectMetadata {
  if (isCompactAttributeApiRef(api)) {
    const kind = api.$ref.trim()
    if (kind.length === 0) {
      throw new Error('attribute.api $ref requires non-empty kind.')
    }
    const target = registry[kind]
    if (target === undefined) {
      throw new Error(`attribute.api $ref "${kind}" is missing from apiRegistry.`)
    }
    return resolveApiObjectMetadata(target, registry, new Set(resolving))
  }
  if (isInlineApiObjectMetadata(api)) {
    return resolveApiObjectMetadata(api, registry, new Set(resolving))
  }
  throw new Error('attribute.api must be a compact $ref or inline API metadata.')
}

function isCompactAttributeApiRef(api: unknown): api is CompactAttributeApiRef {
  if (api === null || typeof api !== 'object' || Array.isArray(api)) return false
  return !('kind' in api) && typeof Reflect.get(api, '$ref') === 'string'
}

function isInlineApiObjectMetadata(api: unknown): api is AiApiObjectMetadata {
  if (api === null || typeof api !== 'object' || Array.isArray(api)) return false
  return typeof Reflect.get(api, 'kind') === 'string' && Array.isArray(Reflect.get(api, 'actions'))
}

function resolveActionMetadata(
  action: AiApiActionMetadata,
  registry: Readonly<Record<string, AiApiObjectMetadata>>,
  resolving: Set<string>,
): AiApiActionMetadata {
  if (action.resultApis === undefined) return action
  return {
    ...action,
    resultApis: action.resultApis.map(ref => resolveResultApiRef(ref, registry, resolving)),
  }
}

function resolveResultApiRef(
  ref: AiApiResultApiRef | CompactResultApiRef,
  registry: Readonly<Record<string, AiApiObjectMetadata>>,
  resolving: Set<string>,
): AiApiResultApiRef {
  if ('$ref' in ref) {
    const kind = ref.$ref.trim()
    if (kind.length === 0) {
      throw new Error('resultApi ref requires non-empty $ref kind.')
    }
    const target = registry[kind]
    if (target === undefined) {
      throw new Error(`resultApi $ref "${kind}" is missing from apiRegistry.`)
    }
    if (resolving.has(kind)) {
      return {
        resultPath: [...ref.resultPath],
        api: stripNestedResultApis(target),
      }
    }

    resolving.add(kind)
    try {
      return {
        resultPath: [...ref.resultPath],
        api: resolveApiObjectMetadata(target, registry, resolving),
      }
    } finally {
      resolving.delete(kind)
    }
  }

  if (ref.api !== undefined) {
    return {
      resultPath: [...ref.resultPath],
      api: resolveApiObjectMetadata(ref.api, registry, new Set(resolving)),
    }
  }

  throw new Error('resultApi ref must include either $ref or api.')
}

function stripNestedResultApis(api: AiApiObjectMetadata): AiApiObjectMetadata {
  return {
    ...api,
    actions: api.actions.map(({ resultApis: _ignored, ...action }) => action),
  }
}
