/**
 * @module app:views/app/dev-system/project-model-dev-bindings
 * 职责：提供 DevSystem 的 project-model-dev-bindings 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/project-model-dev-bindings。
 */
export {
  isConfigFilesPageSurface,
  isConfigNodeKind,
  findNodeById,
  findPageNodeByPageId,
  findNodeLocation,
  isSystemRootDirectory,
  canUseModuleNodeKind,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  PAGE_NODE_FILE_NAMES,
} from '@spark-appworks/spark-project-model'

export type {
  ProjectModel,
  ProjectBlueprintTreeNodeLocation,
  PageNodeFileName,
  ProjectPageNodeSummary,
  BlueprintNodeDraft,
  BlueprintNodeDraftNode,
  ProjectWorkspace,
  ProjectPageReference,
  ProjectSummary,
} from '@spark-appworks/spark-project-model'
