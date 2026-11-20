/**
 * @module @spark-appworks/spark-ai:class-model/index
 * 职责：维护 DTS DtsTypeDeclarationModel 知识链路中的 class-model 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 DtsTypeDeclarationModel 在 class-model/index 这一段如何生成、加载或投影时，用本模块定位职责。
 *
 * 浏览器 / Worker 公开入口：禁止 re-export `./class-model` barrel（会拉入编译期 node:path 模块）。
 * 编译期 API 见 `./class-model/build-index.ts`。
 */
export type {
  ClassModelDocument,
} from './class-model/types'

export {
  AiApiObjectMetadataValidationError,
  collectNestedApiRecords,
  resolveRuntimeApiMetadataJson,
  validateApiObjectMetadata,
  walkAiApiMetadataGraph,
} from './metadata'

export type {
  AiApiActionAntiExample,
  AiApiActionExample,
  AiApiActionFailureMode,
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiConstructorMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiApiSourceProvenanceMetadata,
  AiRuntimeApiMetadataJson,
  AiApiMetadataGraphEdge,
  AiApiMetadataGraphNode,
  AiApiNestedApiRecord,
  ApiObjectValidationFinding,
} from './metadata'

export { CLASS_MODEL_DOCUMENT_VERSION } from './class-model/types'

export {
  createClassModelDocumentFromRuntimeApiMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from './class-model/from-runtime-metadata'

export {
  collectModuleApiKinds,
  listAttributeReachableKinds,
  projectClassModelForGuide,
  projectClassModelFromApi,
  resolveModuleApi,
  resolveModuleApiOrUndefined,
} from './class-model/model-projection'

export { auditClassModelReflectionConnectivity } from './class-model/declaration/reflection-connectivity'

export { jsonSchemaToTypeText } from './class-model/schema/json-schema-to-type'

export {
  dtsSourcePathToBundleRelativeJson,
  resolveDtsBundleRelativeUrl,
} from './class-model/bundle/dts-bundle-url'

export { DtsClassModelBundleLoader } from './class-model/bundle/dts-class-model-bundle-loader'
export { createRuntimeApiMetadataFromSurface } from './class-model/dts-surface-to-runtime-api'

export {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './class-model/bundle/dts-bundle-types'

export { renderMethodSignature } from './class-model/signature-renderer'

export type {
  ClassModelReflectionConnectivityIssue,
} from './class-model/declaration/reflection-connectivity'

export type {
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
} from './class-model/bundle/dts-bundle-types'

export type {
  DtsClassModelSurfaceDocument,
} from './class-model/dts-surface-types'

export {
  renderAttributeDeclaration,
  renderAttributeGuide,
  renderClassModelDeclaration,
  renderMethodDeclaration,
  renderMethodGuide,
  renderModelGuide,
} from './knowledge/projection'

export type {
  AttributeGuide,
  AttributeGuideRenderInput,
  MethodGuide,
  MethodGuideRenderInput,
  ModelGuide,
  ModelGuideRenderInput,
} from './knowledge/projection'

export {
  ClassModelKnowledgeService,
  createDtsBundleClassModelKnowledgeProvider,
  createClassModelKnowledgeWorkerApi,
  createWorkerDtsClassModelKnowledgeProvider,
  DtsBundleClassModelKnowledgeService,
  exposeClassModelKnowledgeWorker,
  WorkerClassModelKnowledgeProvider,
} from './knowledge'

export type {
  ClassModelKnowledgeServiceOptions,
  CreateDtsBundleClassModelKnowledgeProviderOptions,
  CreateClassModelKnowledgeWorkerApiOptions,
  CreateWorkerDtsClassModelKnowledgeProviderOptions,
  DtsBundleClassModelKnowledgeRefreshFunction,
  DtsBundleClassModelKnowledgeRefreshInput,
  DtsBundleClassModelKnowledgeRefreshPolicy,
  DtsBundleClassModelKnowledgeServiceOptions,
  ClassModelAttributeGuideInput,
  ClassModelKnowledgeProvider,
  ClassModelKnowledgeWorkerApi,
  ClassModelKnowledgeWorkerInitInput,
  ClassModelKnowledgeWorkerRefreshInput,
  ClassModelKnowledgeQueryInput,
  ClassModelMethodGuideInput,
  ClassModelModelGuideInput,
} from './knowledge'

export {
  collectClassModelFailureModeRecoveryHints,
} from './recovery'

export type {
  ClassModelFailureModeRecoveryCommand,
  ClassModelFailureModeRecoveryContext,
} from './recovery'

export {
  CLASS_MODEL_TOOL_NAMES,
  buildClassModelToolSchemaRecoveryHint,
  findClassModelToolSpec,
  isClassModelToolName,
  listClassModelToolSpecs,
} from './tools'

export type {
  ClassModelToolName,
  ClassModelToolSpec,
} from './tools'

export {
  ClassModelRuntime,
} from './runtime'

export type {
  ClassModelRuntimeOptions,
  ClassModelScriptCommand,
  ClassModelScriptExecutor,
  ClassModelScriptExecutorResult,
  ClassModelToolArgs,
  ClassModelToolCheck,
  ClassModelToolResult,
} from './runtime'
