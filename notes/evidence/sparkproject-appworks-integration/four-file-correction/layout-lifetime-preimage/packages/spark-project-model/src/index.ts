/**
 * @module @spark-appworks/spark-project-model:index
 * 职责：提供项目蓝图和页面配置域的公共入口，支撑 blueprint、page content、project session 与远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * @spark-appworks/spark-project-model
 *
 * 领域模型：class 层级为主语。
 * 运行态页面加载与 ProjectWorkspace 均从根入口导出。
 */

// ── 项目根 ────────────────────────────────────────────────────

export { ProjectBlueprint } from './project/project-blueprint'
export { ProjectWorkspace } from './project/project-workspace'
export type {
  ProjectBlueprintInitOptions,
  ProjectBlueprintEvent,
  ProjectBlueprintEventListener,
  ProjectActivePageProjection,
  ProjectDirtyProjection,
  ProjectBlueprintProjection,
  ProjectBlueprintDirtyScope,
  ProjectInfo,
  ProjectInfoInput,
  ProjectPlanningInput,
  ProjectPlanningCompletionInput,
  ProjectPlanningCompletionResult,
  BlueprintPlanningInput,
} from './project/project-types'
export type {
  ProjectWorkspaceOptions,
  ProjectPageLoadOptions,
} from './project/project-workspace'
export type { ProjectPageFileGateway } from './io/page-file-api'
export type { ProjectBlueprintGateway } from './io/project-blueprint-client'
export type { ProjectReferenceGateway } from './io/project-reference-client'
export type {
  ProjectPageReference,
  ProjectSummary,
} from './io/project-reference-client'
export type {
  BlueprintNodeDraftApplyResult,
  BlueprintNodeDraft,
} from './blueprint/project-blueprint-edit'

// ── 项目蓝图节点与 DTO ──────────────────────────────────────

export {
  isProjectBlueprintTreeNodeData,
  projectNodeDeliveryKind,
} from './blueprint/project-blueprint-node'

export {
  isConfigNodeKind,
  isConfigFilesPageSurface,
  resolvePageNodePageId,
  findPageNodeByPageId,
  findNodeById,
  findNodeLocation,
  normalizePageIdFromPath,
  normalizeBlueprintTree,
} from './blueprint/project-blueprint-tree'

export type {
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
  ProjectBlueprintNodePatch,
  ProjectBlueprintTreeNodeLocation,
  ProjectBlueprintImplGate,
  ProjectPageSurface,
  ProjectPageNodeSummary,
} from './blueprint/project-blueprint-node'

// ── 配置页 ──────────────────────────────────────────────────

export { PageTool } from './page/page-tool'
export type { PageToolOptions, PageToolDefinition } from './page/page-tool'
export type { PageToolLoadOptions } from './page/page-file'
export { PAGE_TOOL_FILE_NAMES } from './page/page-file'

export type {
  PageToolFileName,
  PageToolFileVersionSummary,
} from './page/page-file'

export { PageContentLoader } from './io/page-content-loader'
export type {
  PageContentLoaderOptions,
  PageFileReadCommand,
  PageFileReader,
} from './io/page-content-loader'
export { PageRuntime } from './page/runtime-page'
export type { PageRuntimeOptions, PageRuntimeCall } from './page/runtime-page'
export { ScenarioViewFile } from './scenario/scenario-view-file'
export { ScenarioViewConfig } from './scenario/scenario-view-config'

export {
  compileRule,
  normalizeRuleNode,
  parseScript,
  parseCss,
} from './page/compile-files'
