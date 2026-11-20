/**
 * @module @spark-appworks/spark-ai:class-model/class-model/index
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 class-model 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/class-model/index 这一段如何生成、加载或投影时，用本模块定位职责。
 */
export {
  CLASS_MODEL_DOCUMENT_VERSION,
} from './types'

export type {
  AttributeMeta,
  DtsTypeDeclarationModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ClassModelDocument,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  ConstructorMeta,
  DtsTypeMeta,
  JsDocMeta,
  DtsReflectionSignature,
  DtsReflectionTypeMeta,
  MethodMeta,
  MethodParameterMeta,
  MethodParameterStyle,
  SourceProvenanceMeta,
} from './types'

export {
  createClassModelDocumentFromRuntimeApiMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from './from-runtime-metadata'

export {
  classNameForKind,
  collectModuleApiKinds,
  listAttributeReachableKinds,
  projectClassModelForGuide,
  projectClassModelFromApi,
  resolveModuleApi,
  resolveModuleApiOrUndefined,
} from './model-projection'

export {
  compareClassModelDocumentsForBuildConsistency,
} from './consistency'

export {
  auditClassModelReflectionConnectivity,
} from './declaration/reflection-connectivity'

export type {
  ClassModelBuildConsistencyIssue,
} from './consistency'

export type {
  ClassModelReflectionConnectivityIssue,
} from './declaration/reflection-connectivity'

export {
  jsonSchemaToTypeText,
} from './schema/json-schema-to-type'

export {
  dtsSourcePathToBundleRelativeJson,
  resolveDtsBundleRelativeUrl,
} from './bundle/dts-bundle-url'

export {
  DtsClassModelBundleLoader,
} from './bundle/dts-class-model-bundle-loader'

export {
  createRuntimeApiMetadataFromSurface,
} from './dts-surface-to-runtime-api'

export {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './bundle/dts-bundle-types'

export {
  DTS_CLASS_MODEL_SURFACE_VERSION,
} from './dts-surface-types'

export type {
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
} from './bundle/dts-bundle-types'

export type {
  DtsClassModelBundleLoaderOptions,
} from './bundle/dts-class-model-bundle-loader'

export type {
  DtsClassModelSurfaceDocument,
  ProjectDtsClassModelSurfaceOptions,
} from './dts-surface-types'

export {
  canRenderMethodSignatureFromTypeTree,
  collectDtsTypeReferenceNames,
  resolveMethodReturnType,
  visitDtsTypeMeta,
} from './declaration/dts-type-meta-ops'

export {
  renderMethodSignature,
} from './signature-renderer'

export {
  classModelToJsonSchema,
  projectDtsRootFilesToJsonSchemas,
  shardToJsonSchemas,
} from './schema/class-model-to-json-schema'

export type {
  DtsFileJsonSchemasResult,
  ProjectDtsRootFilesToJsonSchemasOptions,
} from './schema/class-model-to-json-schema'
