/**
 * @module @spark-appworks/spark-ai:class-model/class-model/bundle/read-dts-class-model-bundle-json
 * 职责：结构化校验 DTS DtsTypeDeclarationModel manifest 和 shard JSON，读取 module、model、component、attribute、method 与 relation 字段。
 * 边界：只做 JSON 协议解析和 fail-fast 校验，不生成 bundle、不访问网络，也不修复缺失语义。
 * AI用途：运行时或测试加载 generated/dts-class-model 失败时，用本模块确认是哪一层 JSON 字段不符合协议。
 */
import type { JsonSchema, JsonSchemaObject } from '@spark-appworks/spark-json-document'
import { assertDraft2020Schema } from '@spark-appworks/spark-json-document'
import type {
  AttributeMeta,
  DtsTypeDeclarationModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ConstructorMeta,
  DtsReflectionSignature,
  DtsTypeMeta,
  MethodMeta,
  MethodParameterMeta,
  MethodParameterStyle,
  SourceProvenanceMeta,
  ComponentProfileMeta,
} from '../types'
import type {
  DtsClassModelBundleClassEntry,
  DtsClassModelBundleComponentEntry,
  DtsClassModelBundleComponentIndex,
  DtsClassModelBundleFileEntry,
  DtsClassModelBundleManifest,
  DtsClassModelDuplicateRecord,
  DtsFileModuleJsDocSource,
  DtsFileModuleSemanticMeta,
  DtsFileProjectionDocument,
} from './dts-bundle-types'
import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './dts-bundle-types'
import { hydrateModelSchemasFromJsonSchema } from '../schema/class-model-schema-projection'
import { canRenderMethodSignatureFromTypeTree } from '../declaration/dts-type-meta-ops'
import { renderMethodSignatureFromMeta } from '../signature-renderer'

const DECLARATION_KINDS = new Set<NonNullable<SourceProvenanceMeta['declarationKind']>>([
  'class',
  'interface',
  'typeAlias',
  'enum',
  'function',
  'const',
  'component',
])

const TYPE_DECLARATION_KINDS = new Set<NonNullable<DtsTypeDeclarationModel['declarationKind']>>([
  'class',
  'interface',
  'typeAlias',
  'enum',
])

const COMPONENT_LEVELS = new Set<ComponentClassModelLevel>([
  'table-level',
  'row-level',
  'container',
  'field-level',
  'display',
  'infrastructure',
])

const COMPONENT_LAYERS = new Set<ComponentClassModelLayer>([
  'data-view-container',
  'row-scope',
  'layout-container',
  'zone-container',
  'data-field',
  'field-support',
  'data-display',
  'static-display',
  'editor',
  'support',
])

const DECLARATION_RELATION_KINDS = new Set<ClassModelDeclarationRelationKind>([
  'alias',
  'intersection',
  'union',
  'extends',
  'implements',
])

const MODULE_JSDOC_SOURCES = new Set<DtsFileModuleJsDocSource>([
  'leading-jsdoc',
  'source-file-jsdoc',
  'inferred',
])

const METHOD_PARAMETER_STYLES = new Set<MethodParameterStyle>([
  'positional',
  'named',
])

type DeclarationKindReadCommand<T extends string> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  allowed: ReadonlySet<T>
}>

type StringKeyedRecordReadCommand<T> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  parseEntry: (value: unknown, entryPath: string) => T
}>

type ArrayReadCommand<T> = Readonly<{
  record: Record<string, unknown>
  field: string
  path: string
  parseEntry: (value: unknown, entryPath: string) => T
}>

export function readDtsClassModelBundleManifest(value: unknown): DtsClassModelBundleManifest {
  const record = requireJsonRecord(value, 'DTS class-model manifest')
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'manifest.schemaVersion')
  if (schemaVersion !== DTS_CLASS_MODEL_BUNDLE_VERSION) {
    throw new Error(`Unsupported DTS class-model manifest schemaVersion: ${String(schemaVersion)}`)
  }
  const protocol = readRequiredString(record, 'protocol', 'manifest.protocol')
  if (protocol !== DTS_CLASS_MODEL_BUNDLE_PROTOCOL) {
    throw new Error(`Unsupported DTS class-model manifest protocol: ${protocol}`)
  }
  const duplicates = readOptionalArray({
    record,
    field: 'duplicates',
    path: 'manifest.duplicates',
    parseEntry: parseDuplicateRecord,
  })
  const componentIndex = readOptionalComponentIndex(record, 'componentIndex', 'manifest.componentIndex')
  return {
    schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
    protocol: DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
    scannedFileCount: readRequiredNumber(record, 'scannedFileCount', 'manifest.scannedFileCount'),
    files: readRequiredStringKeyedRecord({
      record,
      field: 'files',
      path: 'manifest.files',
      parseEntry: parseBundleFileEntry,
    }),
    classIndex: readRequiredStringKeyedRecord({
      record,
      field: 'classIndex',
      path: 'manifest.classIndex',
      parseEntry: parseBundleClassEntry,
    }),
    ...(componentIndex === undefined ? {} : { componentIndex }),
    ...(duplicates === undefined ? {} : { duplicates }),
  }
}

export function readDtsFileProjectionDocument(value: unknown): DtsFileProjectionDocument {
  const record = requireJsonRecord(value, 'DTS file projection')
  const schema = readRequiredString(record, '$schema', 'projection.$schema')
  if (schema !== 'https://json-schema.org/draft/2020-12/schema') {
    throw new Error(`Unsupported DTS file projection $schema: ${schema}`)
  }
  const schemaVersion = readRequiredNumber(record, 'schemaVersion', 'projection.schemaVersion')
  if (schemaVersion !== DTS_FILE_PROJECTION_VERSION) {
    throw new Error(`Unsupported DTS file projection schemaVersion: ${String(schemaVersion)}`)
  }
  const generatedAt = readOptionalString(record, 'generatedAt', 'projection.generatedAt')
  if (Object.hasOwn(record, 'sourcePath')) {
    throw new Error('projection.sourcePath is redundant in DTS projection v3; use projection.module.sourcePath.')
  }
  if (Object.hasOwn(record, 'symbols')) {
    throw new Error('projection.symbols is redundant in DTS projection v3; use projection.module.symbols.')
  }
  const schemaDefs = readRequiredSchemaDefs(record, '$defs', 'projection.$defs')
  const module = readRequiredModuleMeta(record, 'module', 'projection.module')
  const sourcePath = module.sourcePath
  const symbols = module.symbols
  const models = readRequiredStringKeyedRecord({
    record,
    field: 'models',
    path: 'projection.models',
    parseEntry: parseClassModel,
  })
  const hydratedModels: Record<string, DtsTypeDeclarationModel> = {}
  for (const [className, model] of Object.entries(models)) {
    const jsonSchema = schemaDefs[className]
    hydratedModels[className] = hydrateModelSchemasFromJsonSchema(
      jsonSchema === undefined ? model : { ...model, jsonSchema },
    )
  }
  return {
    schemaVersion: DTS_FILE_PROJECTION_VERSION,
    sourcePath,
    module,
    symbols,
    models: hydratedModels,
    ...(generatedAt === undefined ? {} : { generatedAt }),
  }
}

function readRequiredSchemaDefs(
  record: Record<string, unknown>,
  field: string,
  path: string,
): Readonly<Record<string, JsonSchemaObject>> {
  const defs = readRequiredRecord(record, field, path)
  const result: Record<string, JsonSchemaObject> = {}
  for (const [name, value] of Object.entries(defs)) {
    const schema = parseJsonSchemaObject(value, `${path}.${name}`)
    assertDraft2020Schema(schema, `${path}.${name}`)
    result[name] = schema
  }
  return result
}

function parseBundleFileEntry(value: unknown, path: string): DtsClassModelBundleFileEntry {
  const record = requireJsonRecord(value, path)
  const file = readRequiredString(record, 'file', `${path}.file`)
  return {
    file,
    module: readRequiredModuleMeta(record, 'module', `${path}.module`),
  }
}

function readRequiredModuleMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsFileModuleSemanticMeta {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  return parseModuleMeta(record[field], path)
}

function parseModuleMeta(value: unknown, path: string): DtsFileModuleSemanticMeta {
  const record = requireJsonRecord(value, path)
  const packageName = readOptionalString(record, 'packageName', `${path}.packageName`)
  const componentName = readOptionalString(record, 'componentName', `${path}.componentName`)
  const componentType = readOptionalString(record, 'componentType', `${path}.componentType`)
  const componentLevel = readOptionalDeclarationKind({
    record,
    field: 'componentLevel',
    path: `${path}.componentLevel`,
    allowed: COMPONENT_LEVELS,
  })
  const componentLayer = readOptionalDeclarationKind({
    record,
    field: 'componentLayer',
    path: `${path}.componentLayer`,
    allowed: COMPONENT_LAYERS,
  })
  const componentDirectory = readOptionalString(record, 'componentDirectory', `${path}.componentDirectory`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    sourceFile: readRequiredString(record, 'sourceFile', `${path}.sourceFile`),
    ...(packageName === undefined ? {} : { packageName }),
    modulePath: readRequiredString(record, 'modulePath', `${path}.modulePath`),
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    jsdocSource: readRequiredDeclarationKind({
      record,
      field: 'jsdocSource',
      path: `${path}.jsdocSource`,
      allowed: MODULE_JSDOC_SOURCES,
    }),
    symbols: readRequiredStringArray(record, 'symbols', `${path}.symbols`),
    ...(componentName === undefined ? {} : { componentName }),
    ...(componentType === undefined ? {} : { componentType }),
    ...(componentLevel === undefined ? {} : { componentLevel }),
    ...(componentLayer === undefined ? {} : { componentLayer }),
    ...(componentDirectory === undefined ? {} : { componentDirectory }),
  }
}

function parseBundleClassEntry(value: unknown, path: string): DtsClassModelBundleClassEntry {
  const record = requireJsonRecord(value, path)
  return {
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    file: readRequiredString(record, 'file', `${path}.file`),
  }
}

function readOptionalComponentIndex(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsClassModelBundleComponentIndex | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  const raw = requireJsonRecord(record[field], path)
  return {
    entries: readRequiredStringKeyedRecord({
      record: raw,
      field: 'entries',
      path: `${path}.entries`,
      parseEntry: parseComponentIndexEntry,
    }),
    byName: readRequiredClassNameBucketRecord(raw, 'byName', `${path}.byName`),
    byType: readRequiredClassNameBucketRecord(raw, 'byType', `${path}.byType`),
    byLevel: readRequiredClassNameBucketRecord(raw, 'byLevel', `${path}.byLevel`),
    byLayer: readRequiredClassNameBucketRecord(raw, 'byLayer', `${path}.byLayer`),
    byDirectory: readRequiredClassNameBucketRecord(raw, 'byDirectory', `${path}.byDirectory`),
  }
}

function parseComponentIndexEntry(value: unknown, path: string): DtsClassModelBundleComponentEntry {
  const record = requireJsonRecord(value, path)
  return {
    className: readRequiredString(record, 'className', `${path}.className`),
    sourcePath: readRequiredString(record, 'sourcePath', `${path}.sourcePath`),
    file: readRequiredString(record, 'file', `${path}.file`),
    component: parseComponentProfile(record['component'], `${path}.component`),
  }
}

function readRequiredClassNameBucketRecord(
  record: Record<string, unknown>,
  field: string,
  path: string,
): Record<string, readonly string[]> {
  return readRequiredStringKeyedRecord({
    record,
    field,
    path,
    parseEntry: readStringArrayEntry,
  })
}

function readStringArrayEntry(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`)
  return value.map((entry, index) => {
    if (typeof entry !== 'string') throw new Error(`${path}[${String(index)}] must be a string.`)
    return entry
  })
}

function parseDuplicateRecord(value: unknown, path: string): DtsClassModelDuplicateRecord {
  const record = requireJsonRecord(value, path)
  return {
    className: readRequiredString(record, 'className', `${path}.className`),
    keptFile: readRequiredString(record, 'keptFile', `${path}.keptFile`),
    skippedFile: readRequiredString(record, 'skippedFile', `${path}.skippedFile`),
  }
}

function parseClassModel(value: unknown, path: string): DtsTypeDeclarationModel {
  const record = requireJsonRecord(value, path)
  const name = readRequiredString(record, 'name', `${path}.name`)
  const declarationKind = readRequiredDeclarationKind({
    record,
    field: 'declarationKind',
    path: `${path}.declarationKind`,
    allowed: TYPE_DECLARATION_KINDS,
  })
  if (Object.hasOwn(record, 'rootSchema')) {
    throw new Error(`${path}.rootSchema is not part of the DTS DtsTypeDeclarationModel bundle contract; use ${path}.jsonSchema.`)
  }
  if (Object.hasOwn(record, 'kind')) {
    throw new Error(`${path}.kind is redundant in DTS projection v3; use ${path}.name.`)
  }
  if (Object.hasOwn(record, 'className')) {
    throw new Error(`${path}.className is redundant in DTS projection v3; use ${path}.name.`)
  }
  if (Object.hasOwn(record, 'shapeKind')) {
    throw new Error(`${path}.shapeKind is not an official DTS declaration discriminator; use ${path}.declarationKind.`)
  }
  if (Object.hasOwn(record, 'jsonSchema')) {
    throw new Error(`${path}.jsonSchema is duplicated; use projection.$defs.${name}.`)
  }
  for (const field of ['constructorMeta', 'attributes', 'methods', 'declarationTypeText', 'declarationRelations']) {
    if (Object.hasOwn(record, field)) {
      throw new Error(`${path}.${field} is a flat DTS projection field; use the ${declarationKind} shape payload instead.`)
    }
  }
  const jsonSchema = readOptionalJsonSchemaObject(record, 'jsonSchema', `${path}.jsonSchema`)
  if (jsonSchema !== undefined) {
    assertDraft2020Schema(jsonSchema, `${path}.jsonSchema`)
  }
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  const component = readOptionalComponentProfile(record, 'component', `${path}.component`)
    ?? componentProfileFromProvenance(provenance)
  const common = {
    name,
    jsdoc: readRequiredString(record, 'jsdoc', `${path}.jsdoc`),
    declarationKind,
    ...(jsonSchema === undefined ? {} : { jsonSchema }),
    ...(component === undefined ? {} : { component }),
    ...(provenance === undefined ? {} : { provenance }),
  }
  if (declarationKind === 'class') {
    return {
      ...common,
      declarationKind,
      classDecl: parseClassDeclarationPayload(record, 'classDecl', `${path}.classDecl`),
    }
  }
  if (declarationKind === 'interface') {
    return {
      ...common,
      declarationKind,
      interfaceDecl: parseInterfaceDeclarationPayload(record, 'interfaceDecl', `${path}.interfaceDecl`),
    }
  }
  if (declarationKind === 'typeAlias') {
    return {
      ...common,
      declarationKind,
      typeAlias: parseTypeAliasDeclarationPayload(record, 'typeAlias', `${path}.typeAlias`),
    }
  }
  return {
    ...common,
    declarationKind,
    enumDecl: parseEnumDeclarationPayload(record, 'enumDecl', `${path}.enumDecl`),
  }
}

function parseClassDeclarationPayload(
  record: Record<string, unknown>,
  field: string,
  path: string,
): NonNullable<Extract<DtsTypeDeclarationModel, { declarationKind: 'class' }>['classDecl']> {
  const payload = readRequiredRecord(record, field, path)
  rejectFlatPayloadMembers(payload, path)
  const constructorMeta = readOptionalConstructorMeta(payload, 'constructorMeta', `${path}.constructorMeta`)
  if (constructorMeta === undefined) throw new Error(`${path}.constructorMeta is required for class models.`)
  return {
    constructorMeta,
    ...declarationRelationsPayloadProperty(payload, path),
    members: readDeclarationMembers(payload, path),
  }
}

function parseInterfaceDeclarationPayload(
  record: Record<string, unknown>,
  field: string,
  path: string,
): NonNullable<Extract<DtsTypeDeclarationModel, { declarationKind: 'interface' }>['interfaceDecl']> {
  const payload = readRequiredRecord(record, field, path)
  rejectFlatPayloadMembers(payload, path)
  return {
    ...declarationRelationsPayloadProperty(payload, path),
    members: readDeclarationMembers(payload, path),
  }
}

function parseTypeAliasDeclarationPayload(
  record: Record<string, unknown>,
  field: string,
  path: string,
): NonNullable<Extract<DtsTypeDeclarationModel, { declarationKind: 'typeAlias' }>['typeAlias']> {
  const payload = readRequiredRecord(record, field, path)
  rejectFlatPayloadMembers(payload, path)
  return {
    declarationTypeText: readRequiredString(payload, 'declarationTypeText', `${path}.declarationTypeText`),
    ...declarationRelationsPayloadProperty(payload, path),
    members: readDeclarationMembers(payload, path),
  }
}

function parseEnumDeclarationPayload(
  record: Record<string, unknown>,
  field: string,
  path: string,
): NonNullable<Extract<DtsTypeDeclarationModel, { declarationKind: 'enum' }>['enumDecl']> {
  const payload = readRequiredRecord(record, field, path)
  return {
    members: readOptionalArray({
      record: payload,
      field: 'members',
      path: `${path}.members`,
      parseEntry: parseAttributeMeta,
    }) ?? [],
  }
}

function declarationRelationsPayloadProperty(
  payload: Record<string, unknown>,
  path: string,
): { declarationRelations?: readonly ClassModelDeclarationRelation[] } {
  const declarationRelations = readOptionalArray({
    record: payload,
    field: 'declarationRelations',
    path: `${path}.declarationRelations`,
    parseEntry: parseDeclarationRelation,
  })
  return declarationRelations === undefined ? {} : { declarationRelations }
}

function rejectFlatPayloadMembers(payload: Record<string, unknown>, path: string): void {
  for (const field of ['attributes', 'methods']) {
    if (Object.hasOwn(payload, field)) {
      throw new Error(`${path}.${field} is a flat declaration payload field; use ${path}.members.${field}.`)
    }
  }
}

function readDeclarationMembers(
  payload: Record<string, unknown>,
  path: string,
): { attributes: readonly AttributeMeta[]; methods: readonly MethodMeta[] } {
  const members = readRequiredRecord(payload, 'members', `${path}.members`)
  return {
    attributes: readPayloadAttributes(members, `${path}.members`),
    methods: readPayloadMethods(members, `${path}.members`),
  }
}

function readPayloadAttributes(payload: Record<string, unknown>, path: string): readonly AttributeMeta[] {
  return readOptionalArray({
    record: payload,
    field: 'attributes',
    path: `${path}.attributes`,
    parseEntry: parseAttributeMeta,
  }) ?? []
}

function readPayloadMethods(payload: Record<string, unknown>, path: string): readonly MethodMeta[] {
  return readOptionalArray({
    record: payload,
    field: 'methods',
    path: `${path}.methods`,
    parseEntry: parseMethodMeta,
  }) ?? []
}

function readRequiredRecord(
  record: Record<string, unknown>,
  field: string,
  path: string,
): Record<string, unknown> {
  if (!Object.hasOwn(record, field)) throw new Error(`${path} is required.`)
  return requireJsonRecord(record[field], path)
}

function parseDeclarationRelation(value: unknown, path: string): ClassModelDeclarationRelation {
  const record = requireJsonRecord(value, path)
  const targetName = readOptionalString(record, 'targetName', `${path}.targetName`)
  return {
    kind: readRequiredDeclarationKind({
      record,
      field: 'kind',
      path: `${path}.kind`,
      allowed: DECLARATION_RELATION_KINDS,
    }),
    typeText: readRequiredString(record, 'typeText', `${path}.typeText`),
    ...(targetName === undefined ? {} : { targetName }),
  }
}

function parseAttributeMeta(value: unknown, path: string): AttributeMeta {
  const record = requireJsonRecord(value, path)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    schema: readOptionalJsonSchema(record, 'schema', `${path}.schema`) ?? true,
    readable: readRequiredBoolean(record, 'readable', `${path}.readable`),
    writable: readRequiredBoolean(record, 'writable', `${path}.writable`),
    jsdoc: readOptionalString(record, 'jsdoc', `${path}.jsdoc`) ?? '',
    ...(provenance === undefined ? {} : { provenance }),
  }
}

function parseMethodMeta(value: unknown, path: string): MethodMeta {
  const record = requireJsonRecord(value, path)
  const paramsSchema = readOptionalJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`)
  const returnSchema = readOptionalJsonSchema(record, 'returnSchema', `${path}.returnSchema`)
  const returnTypeMeta = readOptionalDtsTypeMeta(record, 'type', `${path}.type`)
  const takesContext = readOptionalBoolean(record, 'takesContext', `${path}.takesContext`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  const core: MethodMeta = {
    name: readRequiredString(record, 'name', `${path}.name`),
    parameterStyle: readOptionalDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }) ?? 'positional',
    parameters: readOptionalArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }) ?? [],
    ...(returnTypeMeta === undefined ? {} : { type: returnTypeMeta }),
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(returnSchema === undefined ? {} : { returnSchema }),
    ...(takesContext === undefined ? {} : { takesContext }),
    jsdoc: readOptionalString(record, 'jsdoc', `${path}.jsdoc`) ?? '',
    ...(provenance === undefined ? {} : { provenance }),
  }
  const signatureText = readOptionalString(record, 'signatureText', `${path}.signatureText`)
    ?? (canRenderMethodSignatureFromTypeTree(core) ? renderMethodSignatureFromMeta(core) : undefined)
  if (signatureText === undefined) {
    throw new Error(`Missing required field signatureText at ${path}`)
  }
  return { ...core, signatureText }
}

function parseMethodParameterMeta(value: unknown, path: string): MethodParameterMeta {
  const record = requireJsonRecord(value, path)
  const flags = readOptionalParameterFlags(record, `${path}.flags`)
  const defaultValue = readOptionalDtsLiteralField(record, 'defaultValue', `${path}.defaultValue`)
  return {
    name: readRequiredString(record, 'name', `${path}.name`),
    type: readRequiredDtsTypeMeta(record, 'type', `${path}.type`),
    ...(flags === undefined ? {} : { flags }),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  }
}

function readOptionalParameterFlags(
  record: Record<string, unknown>,
  path: string,
): MethodParameterMeta['flags'] | undefined {
  if (!Object.hasOwn(record, 'flags')) return undefined
  const flagsRecord = requireJsonRecord(record['flags'], path)
  const isOptional = readOptionalBoolean(flagsRecord, 'isOptional', `${path}.isOptional`)
  if (isOptional === undefined) return undefined
  return { isOptional }
}

function readOptionalDtsTypeMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsTypeMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseDtsTypeMeta(record[field], path)
}

function readRequiredDtsTypeMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): DtsTypeMeta {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`Missing required field ${path}`)
  }
  return parseDtsTypeMeta(record[field], path)
}

function parseDtsTypeMeta(value: unknown, path: string): DtsTypeMeta {
  const record = requireJsonRecord(value, path)
  const type = readRequiredString(record, 'type', `${path}.type`)
  if (type === 'intrinsic') {
    return { type, name: readRequiredString(record, 'name', `${path}.name`) }
  }
  if (type === 'reference') {
    const sourcePath = readOptionalString(record, 'sourcePath', `${path}.sourcePath`)
    const refersToTypeParameter = readOptionalBoolean(record, 'refersToTypeParameter', `${path}.refersToTypeParameter`)
    const typeArguments = readOptionalArray({
      record,
      field: 'typeArguments',
      path: `${path}.typeArguments`,
      parseEntry: parseDtsTypeMeta,
    })
    return {
      type,
      name: readRequiredString(record, 'name', `${path}.name`),
      ...(sourcePath === undefined ? {} : { sourcePath }),
      ...(refersToTypeParameter === undefined ? {} : { refersToTypeParameter }),
      ...(typeArguments === undefined ? {} : { typeArguments }),
    }
  }
  if (type === 'array') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'union' || type === 'intersection') {
    return {
      type,
      types: readRequiredArray({
        record,
        field: 'types',
        path: `${path}.types`,
        parseEntry: parseDtsTypeMeta,
      }),
    }
  }
  if (type === 'literal') {
    return { type, value: readRequiredDtsLiteralValue(record, 'value', `${path}.value`) }
  }
  if (type === 'optional') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'rest') {
    return { type, elementType: readRequiredDtsTypeMeta(record, 'elementType', `${path}.elementType`) }
  }
  if (type === 'tuple') {
    return {
      type,
      elements: readRequiredArray({
        record,
        field: 'elements',
        path: `${path}.elements`,
        parseEntry: parseDtsTypeMeta,
      }),
    }
  }
  if (type === 'reflection') {
    const declarationRecord = requireJsonRecord(record['declaration'], `${path}.declaration`)
    return {
      type,
      declaration: {
        signatures: readRequiredArray({
          record: declarationRecord,
          field: 'signatures',
          path: `${path}.declaration.signatures`,
          parseEntry: parseDtsReflectionSignature,
        }),
      },
    }
  }
  if (type === 'unknown') {
    return { type, name: readRequiredString(record, 'name', `${path}.name`) }
  }
  throw new Error(`Invalid DTS type discriminator at ${path}.type: ${type}`)
}

function parseDtsReflectionSignature(value: unknown, path: string): DtsReflectionSignature {
  const record = requireJsonRecord(value, path)
  return {
    parameters: readRequiredArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }),
    type: readRequiredDtsTypeMeta(record, 'type', `${path}.type`),
  }
}

function readOptionalDtsLiteralField(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | number | boolean | null | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredDtsLiteralValue(record, field, path)
}

function readRequiredDtsLiteralValue(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | number | boolean | null {
  if (!Object.hasOwn(record, field)) throw new Error(`Missing required field ${path}`)
  const value = record[field]
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  throw new Error(`Expected ${path} to be a string, number, boolean, or null`)
}

function readOptionalJsonSchemaObject(
  record: Record<string, unknown>,
  field: string,
  path: string,
): JsonSchemaObject | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseJsonSchemaObject(record[field], path)
}

function readOptionalConstructorMeta(
  record: Record<string, unknown>,
  field: string,
  path: string,
): ConstructorMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseConstructorMeta(record[field], path)
}

function parseConstructorMeta(value: unknown, path: string): ConstructorMeta {
  const record = requireJsonRecord(value, path)
  const paramsSchema = readOptionalJsonSchemaObject(record, 'paramsSchema', `${path}.paramsSchema`)
  const provenance = readOptionalSourceProvenance(record, 'provenance', `${path}.provenance`)
  return {
    jsdoc: readOptionalString(record, 'jsdoc', `${path}.jsdoc`) ?? '',
    signatureText: readRequiredString(record, 'signatureText', `${path}.signatureText`),
    parameterStyle: readOptionalDeclarationKind({
      record,
      field: 'parameterStyle',
      path: `${path}.parameterStyle`,
      allowed: METHOD_PARAMETER_STYLES,
    }) ?? 'positional',
    parameters: readOptionalArray({
      record,
      field: 'parameters',
      path: `${path}.parameters`,
      parseEntry: parseMethodParameterMeta,
    }) ?? [],
    ...(paramsSchema === undefined ? {} : { paramsSchema }),
    ...(provenance === undefined ? {} : { provenance }),
  }
}

function readOptionalSourceProvenance(
  record: Record<string, unknown>,
  field: string,
  path: string,
): SourceProvenanceMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseSourceProvenance(record[field], path)
}

function readOptionalComponentProfile(
  record: Record<string, unknown>,
  field: string,
  path: string,
): ComponentProfileMeta | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  const value = record[field]
  if (value === undefined) return undefined
  const component = parseComponentProfile(value, path)
  return Object.keys(component).length === 0 ? undefined : component
}

function parseComponentProfile(value: unknown, path: string): ComponentProfileMeta {
  const record = requireJsonRecord(value, path)
  const level = readOptionalDeclarationKind({
    record,
    field: 'level',
    path: `${path}.level`,
    allowed: COMPONENT_LEVELS,
  })
  const layer = readOptionalDeclarationKind({
    record,
    field: 'layer',
    path: `${path}.layer`,
    allowed: COMPONENT_LAYERS,
  })
  return {
    ...optionalStringProperty(record, 'name', `${path}.name`),
    ...optionalStringProperty(record, 'type', `${path}.type`),
    ...(level === undefined ? {} : { level }),
    ...(layer === undefined ? {} : { layer }),
    ...optionalStringProperty(record, 'directory', `${path}.directory`),
  }
}

function componentProfileFromProvenance(provenance: SourceProvenanceMeta | undefined): ComponentProfileMeta | undefined {
  if (provenance === undefined) return undefined
  const component: ComponentProfileMeta = {
    ...(provenance.componentName === undefined ? {} : { name: provenance.componentName }),
    ...(provenance.componentType === undefined ? {} : { type: provenance.componentType }),
    ...(provenance.componentLevel === undefined ? {} : { level: provenance.componentLevel }),
    ...(provenance.componentLayer === undefined ? {} : { layer: provenance.componentLayer }),
    ...(provenance.componentDirectory === undefined ? {} : { directory: provenance.componentDirectory }),
  }
  return Object.keys(component).length === 0 ? undefined : component
}

function optionalStringProperty(
  record: Record<string, unknown>,
  field: string,
  path: string,
): Record<string, string> {
  const value = readOptionalString(record, field, path)
  return value === undefined ? {} : { [field]: value }
}

function parseSourceProvenance(value: unknown, path: string): SourceProvenanceMeta {
  const record = requireJsonRecord(value, path)
  const memberName = readOptionalString(record, 'memberName', `${path}.memberName`)
  const typeEntryFile = readOptionalString(record, 'typeEntryFile', `${path}.typeEntryFile`)
  const componentName = readOptionalString(record, 'componentName', `${path}.componentName`)
  const componentType = readOptionalString(record, 'componentType', `${path}.componentType`)
  const componentLevel = readOptionalDeclarationKind({
    record,
    field: 'componentLevel',
    path: `${path}.componentLevel`,
    allowed: COMPONENT_LEVELS,
  })
  const componentLayer = readOptionalDeclarationKind({
    record,
    field: 'componentLayer',
    path: `${path}.componentLayer`,
    allowed: COMPONENT_LAYERS,
  })
  const componentDirectory = readOptionalString(record, 'componentDirectory', `${path}.componentDirectory`)
  const declarationKind = readOptionalDeclarationKind({
    record,
    field: 'declarationKind',
    path: `${path}.declarationKind`,
    allowed: DECLARATION_KINDS,
  })
  return {
    file: readRequiredString(record, 'file', `${path}.file`),
    line: readRequiredNumber(record, 'line', `${path}.line`),
    className: readRequiredString(record, 'className', `${path}.className`),
    ...(memberName === undefined ? {} : { memberName }),
    ...(typeEntryFile === undefined ? {} : { typeEntryFile }),
    ...(componentName === undefined ? {} : { componentName }),
    ...(componentType === undefined ? {} : { componentType }),
    ...(componentLevel === undefined ? {} : { componentLevel }),
    ...(componentLayer === undefined ? {} : { componentLayer }),
    ...(componentDirectory === undefined ? {} : { componentDirectory }),
    ...(declarationKind === undefined ? {} : { declarationKind }),
  }
}

function readOptionalDeclarationKind<T extends string>(
  command: DeclarationKindReadCommand<T>,
): T | undefined {
  const { record, field } = command
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredDeclarationKind(command)
}

function readRequiredDeclarationKind<T extends string>(
  command: DeclarationKindReadCommand<T>,
): T {
  const { record, field, path, allowed } = command
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  for (const candidate of allowed) {
    if (candidate === value) return candidate
  }
  throw new Error(`${path} must be one of: ${[...allowed].join(', ')}`)
}

function readOptionalJsonSchema(
  record: Record<string, unknown>,
  field: string,
  path: string,
): JsonSchema | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return parseJsonSchema(record[field], path)
}

function parseJsonSchema(value: unknown, path: string): JsonSchema {
  if (value === true || value === false) return value
  if (isJsonRecord(value)) return value
  throw new Error(`${path} must be a JSON Schema object or boolean.`)
}

function parseJsonSchemaObject(value: unknown, path: string): JsonSchemaObject {
  if (!isJsonRecord(value)) {
    throw new Error(`${path} must be a JSON Schema object.`)
  }
  return value
}

function readRequiredStringKeyedRecord<T>(
  command: StringKeyedRecordReadCommand<T>,
): Record<string, T> {
  const { record, field, path, parseEntry } = command
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!isJsonRecord(raw)) {
    throw new Error(`${path} must be an object.`)
  }
  const result: Record<string, T> = {}
  for (const [key, entry] of Object.entries(raw)) {
    result[key] = parseEntry(entry, `${path}.${key}`)
  }
  return result
}

function readRequiredArray<T>(command: ArrayReadCommand<T>): readonly T[] {
  const { record, field, path, parseEntry } = command
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!Array.isArray(raw)) {
    throw new Error(`${path} must be an array.`)
  }
  return raw.map((entry, index) => parseEntry(entry, `${path}[${String(index)}]`))
}

function readOptionalArray<T>(command: ArrayReadCommand<T>): readonly T[] | undefined {
  const { record, field } = command
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredArray(command)
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  field: string,
  path: string,
): readonly string[] {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const raw = record[field]
  if (!Array.isArray(raw)) {
    throw new Error(`${path} must be an array.`)
  }
  return raw.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${path}[${String(index)}] must be a string.`)
    }
    return entry
  })
}

function readRequiredString(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  return value
}

function readOptionalString(
  record: Record<string, unknown>,
  field: string,
  path: string,
): string | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`)
  }
  return value
}

function readRequiredNumber(
  record: Record<string, unknown>,
  field: string,
  path: string,
): number {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`)
  }
  return value
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  field: string,
  path: string,
): boolean {
  if (!Object.hasOwn(record, field)) {
    throw new Error(`${path} is required.`)
  }
  const value = record[field]
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean.`)
  }
  return value
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  field: string,
  path: string,
): boolean | undefined {
  if (!Object.hasOwn(record, field)) return undefined
  return readRequiredBoolean(record, field, path)
}

function requireJsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isJsonRecord(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
