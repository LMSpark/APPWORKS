/**
 * @module @spark-appworks/spark-utils:index
 * 职责：提供框架无关的 index 基础工具能力，支撑日志、HTTP、capability、克隆或快照等通用场景。
 * 边界：必须保持纯 TypeScript 基础层，不依赖 Vue、spark-data、spark-component 或应用运行时。
 * AI用途：需要复用底层工具或判断包边界是否被破坏时，用本模块确认最底层能力语义。
 */
/**
 * SPARK Utils - 纯基础设施工具库
 *
 * 提供日志、HTTP 客户端、能力系统等核心工具
 */

// ==================== 类型守卫 ====================

export { isRecord, isObject, isCallable } from './internal/guards'

// ==================== AI 可编辑模型协议 ====================

export { SparkAIModel } from './ai-model'

// ==================== 页面脚本共享类型 ====================

export type { FieldRenderConfig, ComponentInstanceSnapshot, ContextItem, ContextSnapshot } from './script-types'

// ==================== 日志系统 ====================

export { Logger, addLogTransport, removeLogTransport, clearLogTransports, parseLogArgs } from './logger'

export type { LogLevel, LoggerApi, LogTransport } from './logger'

// ==================== 能力系统核心 ====================

export {
  defineCapability,
  sparkProvide,
  sparkRemove,
  sparkConsume,
  createSparkCapabilityContext,
  consumeSparkCapability,
  createSparkCapabilityConsumer,
  getSparkCapabilityProvider,
} from './capability/index'

export type {
  CapabilityKey,
  CapabilityName,
  SparkCapabilityConsumer,
  CapabilityTypeMap,
  CapabilityContext,
} from './capability/index'

// ==================== HTTP 模块 ====================

export {
  createFileLoader,
  createHttpClient,
  createRequest,
  FileLoader,
  HttpClientBase,
  isRequestError,
  Request,
  sendBeacon,
  TransformedFileLoader,
} from './http/index.js'

export type {
  ApiEnvelope,
  ApiEnvelopeContext,
  ApiEnvelopeError,
  ApiEnvelopeEvent,
  CacheEntry,
  CacheExpirationTier,
  FileLoaderEventMap,
  FileLoadOptions,
  FileLoadResult,
  HttpClientFactoryOptions,
  HttpResponse,
  JsonLoadOptions,
  LoadOptions,
  Method,
  RequestConfig,
  RequestError,
  RequestInterceptor,
  ResponseInterceptor,
  TextLoadOptions,
  TransformLoadOptions,
  TransformedFileLoadOptions,
} from './http/index.js'

// ==================== 错误工具 ====================

export { toErrorMessage, toError } from './error-utils'

export { SANDBOX_BLOCKED_KEYS, createSafeProxy } from './sandbox'

// ==================== 克隆工具 ====================

export { deepClone } from './clone'


// ==================== 快照历史 ====================

export { SnapshotHistory } from './snapshot-history'

// ==================== 项目蓝图共享契约 ====================

export {
  PROJECT_BLUEPRINT_NODE_KINDS,
  isProjectBlueprintNodeKind,
} from './project-blueprint-node-kind'

export type { ProjectBlueprintNodeKind } from './project-blueprint-node-kind'

// ==================== 权限展示三态 ====================

export {
  PERMISSION_MODES,
  isPermissionMode,
} from './permission-mode'

export type { PermissionMode } from './permission-mode'

// ==================== 运行导航表面共享契约 ====================

export {
  RUNTIME_NAVIGATION_ITEM_KINDS,
  isRuntimeNavigationItemKind,
  NAVIGATION_PLACEMENTS,
  isNavigationPlacement,
  NAVIGATION_ROOT_PLACEMENTS,
  isNavigationRootPlacement,
  NAVIGATION_LINK_TARGETS,
  isNavigationLinkTarget,
} from './navigation-surface'

export type {
  RuntimeNavigationItemKind,
  NavigationPlacement,
  NavigationRootPlacement,
  NavigationLinkTarget,
  NavigationContextConfig,
} from './navigation-surface'

// ==================== 能力树遍历辅助（公开基础设施） ====================

export {
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
  sparkConsumeFromProvider,
} from './capability/helpers.js'
