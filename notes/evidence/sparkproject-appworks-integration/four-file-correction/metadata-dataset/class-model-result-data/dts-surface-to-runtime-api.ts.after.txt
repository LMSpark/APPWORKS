/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-surface-to-runtime-api
 * 职责：把 guide bundle 已加载的 DtsClassModelSurfaceDocument 映射为 AiRuntimeApiMetadataJson，供 model_script 与 guide 共用同一份 JSON shard。
 * 边界：只做 JSON surface → runtime API metadata 的薄映射，不访问语义求值器，也不读取 runtime/manifest.json。
 * AI用途：确认 script 执行契约是否直接来自 guide manifest shard 中的 paramsSchema / returnSchema。
 */
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import type {
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiObjectMetadata,
  AiRuntimeApiMetadataJson,
} from '../metadata'
import { resolveMethodReturnType } from './declaration/dts-type-meta-ops'
import { parseModelJsonSchemaRef } from './schema/model-json-schema-ref'
import { ClassModelRuntimeSchema } from './schema/class-model-runtime-schema'
import type { DtsClassModelSurfaceDocument } from './dts-surface-types'
import type { AttributeMeta, DtsTypeDeclarationModel, ConstructorMeta, DtsTypeMeta, MethodMeta } from './types'

type MutableAiApiObjectMetadata = {
  className: string
  kind: string
  name: string
  description: string
  jsdoc?: string
  provenance?: NonNullable<AiApiObjectMetadata['provenance']>
  constructorSignature?: NonNullable<AiApiObjectMetadata['constructorSignature']>
  actions: AiApiActionMetadata[]
  attributes?: AiApiAttributeMetadata[]
}

/** 从 guide surface（同一 manifest shard）构建 script 可用的 runtime API metadata。 */
export function createRuntimeApiMetadataFromSurface(
  surface: DtsClassModelSurfaceDocument,
  rootClassName: string,
): AiRuntimeApiMetadataJson {
  const rootApi = createApiObjectMetadataFromSurface(surface, rootClassName)
  return {
    schemaVersion: 2,
    rootApi,
    apiRegistry: collectApiRegistry(rootApi),
  }
}

function createApiObjectMetadataFromSurface(
  surface: DtsClassModelSurfaceDocument,
  rootClassName: string,
): AiApiObjectMetadata {
  const cache = new Map<string, MutableAiApiObjectMetadata>()
  const schemas = new ClassModelRuntimeSchema(surface)
  return toApi(rootClassName)

  function toApi(className: string): AiApiObjectMetadata {
    const cached = cache.get(className)
    if (cached !== undefined) return cached

    const model = surface.models[className]
    if (model === undefined) {
      throw new Error(`DTS DtsTypeDeclarationModel surface missing class "${className}".`)
    }

    const constructorMeta = runtimeConstructor(model)
    const api: MutableAiApiObjectMetadata = {
      className: model.name,
      kind: model.name,
      name: model.name,
      description: summarizeJsDoc(model.jsdoc),
      ...(model.jsdoc.trim().length === 0 ? {} : { jsdoc: model.jsdoc }),
      ...(model.provenance === undefined ? {} : { provenance: model.provenance }),
      ...(constructorMeta === undefined
        ? {}
        : {
            constructorSignature: {
              description: summarizeJsDoc(constructorMeta.jsdoc),
              ...(constructorMeta.jsdoc.trim().length === 0 ? {} : { jsdoc: constructorMeta.jsdoc }),
              ...(constructorMeta.provenance === undefined ? {} : { provenance: constructorMeta.provenance }),
              paramsSchema: schemas.bind(requiredConstructorParamsSchema(model.name, constructorMeta)),
            },
          }),
      actions: [],
      attributes: [],
    }
    cache.set(className, api)

    api.attributes = runtimeAttributes(model).map(attribute => ({
      name: attribute.name,
      description: summarizeJsDoc(attribute.jsdoc),
      ...(attribute.jsdoc.trim().length === 0 ? {} : { jsdoc: attribute.jsdoc }),
      ...(attribute.provenance === undefined ? {} : { provenance: attribute.provenance }),
      schema: attribute.schema ?? true,
      readable: attribute.readable,
      writable: attribute.writable,
      ...apiRefProperty(surface, attribute.schema ?? true, toApi),
    }))

    api.actions = runtimeMethods(model)
      .filter(method => !method.name.startsWith('static '))
      .map((method) => {
        const paramsSchema = schemas.bind(requiredMethodParamsSchema(model.name, method))
        return {
          name: method.name,
          methodName: method.name,
          ...(method.signatureText === undefined ? {} : { signatureText: method.signatureText }),
          description: summarizeJsDoc(method.jsdoc),
          ...(method.jsdoc.trim().length === 0 ? {} : { jsdoc: method.jsdoc }),
          ...(method.provenance === undefined ? {} : { provenance: method.provenance }),
          paramsSchema,
          takesContext: false,
          ...(method.returnSchema === undefined ? {} : { resultSchema: method.returnSchema }),
          ...resultApiProperty(surface, method, toApi),
        }
      })

    return api
  }
}

function collectApiRegistry(rootApi: AiApiObjectMetadata): Readonly<Record<string, AiApiObjectMetadata>> {
  const registry: Record<string, AiApiObjectMetadata> = {}
  const visited = new Set<string>()
  const visit = (api: AiApiObjectMetadata): void => {
    if (visited.has(api.kind)) return
    visited.add(api.kind)
    if (api.kind !== rootApi.kind) registry[api.kind] = api
    for (const attribute of api.attributes ?? []) {
      if (attribute.api !== undefined) visit(attribute.api)
    }
    for (const action of api.actions) {
      for (const resultApi of action.resultApis ?? []) {
        if (resultApi.api !== undefined) visit(resultApi.api)
      }
    }
  }
  visit(rootApi)
  return registry
}

function apiRefProperty(
  surface: DtsClassModelSurfaceDocument,
  schema: JsonSchema,
  toApi: (className: string) => AiApiObjectMetadata,
): { api?: AiApiObjectMetadata } {
  const className = resolveSchemaClassName(surface, schema)
  return className === undefined || !isRuntimeApiModel(surface, className)
    ? {} : { api: toApi(className) }
}

function resultApiProperty(
  surface: DtsClassModelSurfaceDocument,
  method: MethodMeta,
  toApi: (className: string) => AiApiObjectMetadata,
): { resultApis?: ReadonlyArray<{ resultPath: readonly string[]; api: AiApiObjectMetadata }> } {
  const className = resolveMethodReturnClassName(surface, method)
  return className === undefined || !isRuntimeApiModel(surface, className)
    ? {}
    : { resultApis: [{ resultPath: [], api: toApi(className) }] }
}

function isRuntimeApiModel(
  surface: DtsClassModelSurfaceDocument,
  className: string,
  visited = new Set<string>(),
): boolean {
  if (visited.has(className)) return false
  const model = surface.models[className]
  if (model === undefined) return false
  visited.add(className)
  if (model.declarationKind === 'class' || runtimeMethods(model).some(method => !method.name.startsWith('static '))) return true
  const relations = model.declarationKind === 'interface' ? model.interfaceDecl.declarationRelations
    : model.declarationKind === 'typeAlias' ? model.typeAlias.declarationRelations : []
  return (relations ?? []).some(relation => relation.targetName !== undefined
      && isRuntimeApiModel(surface, relation.targetName, visited))
    || runtimeAttributes(model).some(attribute => schemaRequiresApi(surface, attribute.schema, visited))
    || schemaRequiresApi(surface, model.jsonSchema, visited)
}

function schemaRequiresApi(
  surface: DtsClassModelSurfaceDocument,
  schema: JsonSchema | undefined,
  visited: Set<string>,
): boolean {
  if (schema === undefined || typeof schema === 'boolean') return false
  const reference = resolveClassNameFromSchemaRef(surface, schema.$ref)
    ?? resolveClassNameFromTypeText(surface, schema.title)
  if (reference !== undefined && isRuntimeApiModel(surface, reference, visited)) return true
  return schemaRequiresApi(surface, schema.items, visited)
    || schemaRequiresApi(surface, schema.additionalProperties, visited)
    || Object.values(schema.properties ?? {}).some(child => schemaRequiresApi(surface, child, visited))
    || [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? []), ...(schema.prefixItems ?? [])]
      .some(child => schemaRequiresApi(surface, child, visited))
}

function requiredMethodParamsSchema(className: string, method: MethodMeta): JsonSchemaObject {
  if (method.paramsSchema === undefined) {
    throw new Error(
      `DTS method "${className}.${method.name}" must preserve executable paramsSchema in the guide bundle shard.`,
    )
  }
  return method.paramsSchema
}

function requiredConstructorParamsSchema(
  className: string,
  constructorMeta: ConstructorMeta,
): JsonSchemaObject {
  if (constructorMeta.paramsSchema === undefined) {
    throw new Error(
      `DTS constructor "${className}" must preserve executable paramsSchema in the guide bundle shard.`,
    )
  }
  return constructorMeta.paramsSchema
}

function resolveMethodReturnClassName(
  surface: DtsClassModelSurfaceDocument,
  method: MethodMeta,
): string | undefined {
  return resolveClassNameFromDtsType(surface, resolveMethodReturnType(method))
    ?? resolveSchemaClassName(surface, method.returnSchema)
}

function runtimeConstructor(model: DtsTypeDeclarationModel): ConstructorMeta | undefined {
  return model.declarationKind === 'class' ? model.classDecl.constructorMeta : undefined
}

function runtimeAttributes(model: DtsTypeDeclarationModel): readonly AttributeMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.attributes
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.attributes
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.attributes
  return model.enumDecl.members
}

function runtimeMethods(model: DtsTypeDeclarationModel): readonly MethodMeta[] {
  if (model.declarationKind === 'class') return model.classDecl.members.methods
  if (model.declarationKind === 'interface') return model.interfaceDecl.members.methods
  if (model.declarationKind === 'typeAlias') return model.typeAlias.members.methods
  return []
}

function resolveClassNameFromDtsType(
  surface: DtsClassModelSurfaceDocument,
  typeMeta: DtsTypeMeta | undefined,
): string | undefined {
  if (typeMeta === undefined) return undefined
  if (typeMeta.type === 'reference') {
    return surface.models[typeMeta.name] === undefined
      ? firstDefined(typeMeta.typeArguments?.map(typeArgument => resolveClassNameFromDtsType(surface, typeArgument)) ?? [])
      : typeMeta.name
  }
  if (typeMeta.type === 'array' || typeMeta.type === 'optional' || typeMeta.type === 'rest') {
    return resolveClassNameFromDtsType(surface, typeMeta.elementType)
  }
  if (typeMeta.type === 'union' || typeMeta.type === 'intersection') {
    return firstDefined(typeMeta.types.map(item => resolveClassNameFromDtsType(surface, item)))
  }
  return undefined
}

function firstDefined<T>(items: ReadonlyArray<T | undefined>): T | undefined {
  return items.find(item => item !== undefined)
}

function resolveSchemaClassName(
  surface: DtsClassModelSurfaceDocument,
  schema: JsonSchema | undefined,
): string | undefined {
  if (schema === undefined || schema === true || schema === false || typeof schema !== 'object') return undefined
  return resolveClassNameFromSchemaRef(surface, schema.$ref)
    ?? resolveClassNameFromTypeText(surface, schema.title)
    ?? resolveClassNameFromSchema(surface, schema.items)
    ?? firstDefined(Object.values(schema.properties ?? {}).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.anyOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.oneOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
    ?? firstDefined((schema.allOf ?? []).map(child => resolveClassNameFromSchema(surface, child)))
}

function resolveClassNameFromSchema(
  surface: DtsClassModelSurfaceDocument,
  schema: JsonSchema | undefined,
): string | undefined {
  return resolveSchemaClassName(surface, schema)
}

function resolveClassNameFromSchemaRef(
  surface: DtsClassModelSurfaceDocument,
  ref: unknown,
): string | undefined {
  if (typeof ref !== 'string' || ref.length === 0) return undefined
  const fromModelRef = parseModelJsonSchemaRef(ref)
  if (fromModelRef !== undefined && surface.models[fromModelRef] !== undefined) {
    return fromModelRef
  }
  const marker = '#/$defs/'
  const markerIndex = ref.indexOf(marker)
  if (markerIndex < 0) return undefined
  const className = decodeJsonPointerToken(ref.slice(markerIndex + marker.length))
  return surface.models[className] === undefined ? undefined : className
}

function resolveClassNameFromTypeText(
  surface: DtsClassModelSurfaceDocument,
  typeText: unknown,
): string | undefined {
  if (typeof typeText !== 'string' || typeText.length === 0) return undefined
  const classNames = Object.keys(surface.models).sort((left, right) => right.length - left.length)
  return classNames.find(className => containsTypeReference(typeText, className))
}

function containsTypeReference(typeText: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'u').test(typeText)
}

function decodeJsonPointerToken(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
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
