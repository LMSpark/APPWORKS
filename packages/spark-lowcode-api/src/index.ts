/**
 * `spark-lowcode-api` 公共导出入口。
 * 聚合平台会话、目录、设计资产、数据空间、蓝图、权限与实时通道等门面；调用方应从此处 import，避免依赖内部路径。
 */
export { LowcodeApi } from './lowcode-api.js'
export type { LowcodeApiOptions } from './lowcode-api.js'
export { LowcodeApiError } from './core/lowcode-api-error.js'
export { LowcodeCatalogApi } from './catalog/lowcode-catalog-api.js'
export type {
  LowcodeDatabase,
  LowcodeDatabaseCatalog,
  LowcodeDatabaseField,
  LowcodeDatabaseResource,
  LowcodeDatabaseResourceSelector,
  LowcodeDatabaseServer,
  LowcodeDatabaseTable,
  LowcodeDatabaseView,
  LowcodeCatalogSourceError,
} from './catalog/lowcode-catalog-api.js'
export { LowcodeDesignApi } from './design/lowcode-design-api.js'
export { LowcodeDesignFileUpload } from './design/lowcode-design-file-upload.js'
export type {
  LowcodeFileDirectory,
  LowcodeFileEntry,
  LowcodeFileLocator,
} from './design/lowcode-design-api.js'
export type {
  LowcodeDesignFileUploadCommand,
  LowcodeDesignFileUploadResult,
} from './design/lowcode-design-file-upload.js'
export { DataSpaceApi } from './platform/data-space/data-space-api.js'
export { DataSpaceDesignApi, DATA_SPACE_DESIGN_FORM_KEY } from './platform/data-space/design/data-space-design-api.js'
export type {
  DataSpaceDesignSnapshot,
  DataSpaceDesignReadInput,
  DataSpaceInputParameter,
} from './platform/data-space/design/data-space-design-api.js'
export type {
  DataSpaceDesignMutationCommand,
  DataSpaceDesignMutationInput,
} from './platform/data-space/design/data-space-design-mutation.js'
export { DataSpaceFrontendModel } from './platform/data-space/data-space.js'
export type {
  DataSpaceFieldReference,
  DataSpaceFrontendModelQuery,
  DataSpaceFrontendModelSnapshot,
  LowcodeModelRelationRecord,
  DataSpaceResourceField,
  DataSpaceResourceReference,
  DataSpaceResourceType,
  DataSpaceDatabaseResourceType,
} from './platform/data-space/data-space.js'
export { DataSpaceRuntimeApi } from './platform/data-space/runtime/data-space-runtime-api.js'
export type {
  DataSpaceRuntimeFilter,
  DataSpaceRuntimeInputParameter,
  DataSpaceRuntimeQuery,
  DataSpaceRuntimePreparedQuery,
  DataSpaceRuntimeRow,
  DataSpaceRuntimeSort,
  DataSpaceRuntimeSnapshot,
  DataSpaceSparsePermission,
} from './platform/data-space/runtime/data-space-runtime-api.js'
export type {
  DataSpaceAddedRow,
  DataSpaceChangedRow,
  DataSpaceDeletedRow,
  DataSpaceRuntimeChanges,
  DataSpaceRuntimeMutationCommand,
  DataSpaceRuntimeMutationInput,
} from './platform/data-space/runtime/data-space-runtime-mutation.js'
export { LowcodePlatformApi } from './platform/lowcode-platform-api.js'
export { PermissionApi } from './platform/permission/permission-api.js'
export { PermissionDesignApi } from './platform/permission/design/permission-design-api.js'
export type {
  PermissionDataObjectPolicy,
  PermissionDesignSnapshot,
  PermissionFeatureTag,
  PermissionGrantOrganizationScope,
  PermissionGrantSubjectKind,
  PermissionObjectGrant,
} from './platform/permission/design/permission-design-api.js'
export type {
  PermissionDesignMutationCommand,
  PermissionDesignMutationInput,
} from './platform/permission/design/permission-design-mutation.js'
export { PermissionRuntimeApi } from './platform/permission/runtime/permission-runtime-api.js'
export type { PermissionRuntimeSnapshot } from './platform/permission/runtime/permission-runtime-api.js'
export { PERMISSION_DESIGN_FORM_KEY } from './platform/permission/permission-wire.js'
export { LowcodeProjectBlueprintApi } from './platform/project-blueprint/project-blueprint-api.js'
export {
  createLowcodeProjectBlueprintRecord,
  validateLowcodeProjectBlueprintRecords,
} from './platform/project-blueprint/project-blueprint.js'
export type { LowcodeProjectBlueprintRecord } from './platform/project-blueprint/project-blueprint.js'
export {
  LOWCODE_BLUEPRINT_FILE_NAMES,
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  lowcodeBlueprintVersionedFileName,
  nextLowcodeBlueprintFileVersions,
  parseLowcodeBlueprintFileVersions,
} from './platform/project-blueprint/project-blueprint-file-version.js'
export type {
  LowcodeBlueprintFileName,
  LowcodeBlueprintFileVersionKey,
  LowcodeBlueprintFileVersions,
} from './platform/project-blueprint/project-blueprint-file-version.js'
export type {
  LowcodeNavigationAuthorizationContext,
  LowcodeNavigationAuthorizationEvidence,
  LowcodeNavigationAuthorizationItem,
  LowcodeNavigationTargetKind,
} from './platform/lowcode-navigation.js'
export type {
  LowcodeProjectBlueprintDocumentCoverage,
  LowcodeProjectBlueprintDocumentKind,
  LowcodeProjectBlueprintDocumentSubmitOptions,
  LowcodeProjectBlueprintDocumentTask,
} from './platform/project-blueprint/outputs/document/project-blueprint-document.js'
export { LowcodeRealtimeApi } from './realtime/lowcode-realtime-api.js'
export { LowcodeApplicationStore } from './platform/lowcode-application-store.js'
export { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from './platform/lowcode-application.js'
export { LowcodeSessionStore } from './platform/lowcode-session-store.js'
export type {
  LowcodeCacheStats,
  LowcodeEnterprise,
  LowcodeIdentity,
  LowcodeLoginCredentials,
  LowcodeEnterpriseRegistration,
  LowcodeRegistrationResult,
  LowcodeSession,
  LowcodeUserRegistration,
  LowcodeVerificationRequest,
  LowcodeVerificationScene,
} from './platform/lowcode-platform-api.js'
export type { SendCodeType, SendCodeScene } from './contracts/lowcode-send-code.js'
export type { OrderType, WireFilterOperator, GroupFunType } from './contracts/lowcode-wire-query.js'
export type { LowcodeApplication } from './platform/lowcode-application.js'
export type {
  LowcodeEnterpriseCatalogItem,
  LowcodeEnterpriseInfo,
  LowcodeEnterprisePolicy,
} from './platform/lowcode-enterprise.js'
export type {
  LowcodeApplicationContext,
  LowcodeApplicationStoreOptions,
} from './platform/lowcode-application-store.js'
export type {
  LowcodeAgentEvent,
  LowcodeAgentToolAppendInput,
  LowcodeAgentToolResult,
  LowcodeAgentTurnAck,
  LowcodeAgentTurnInput,
  LowcodeAiChatInput,
  LowcodeFetch,
  LowcodeRealtimeConnectOptions,
  LowcodeRealtimeEvent,
  LowcodeRealtimeSubscription,
  LowcodeSystemDownload,
  LowcodeSparkEnvelope,
} from './realtime/lowcode-realtime-api.js'
export type {
  LowcodeSessionStorage,
  LowcodeSessionStoreOptions,
} from './platform/lowcode-session-store.js'
