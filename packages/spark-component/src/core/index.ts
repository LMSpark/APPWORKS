/**
 * @module @spark-appworks/spark-component:core/index
 * 职责：汇总导出 core 的组件、props、types 和 zero-code 能力。
 * 边界：只维护目录级公开表面，不实现具体渲染逻辑，也不创建新的运行时状态。
 * AI用途：判断某个组件能力是否应对外暴露或被注册表扫描时，用本模块确认导出入口。
 */
/**
 * core 层入口。
 *
 * 聚合 spark-component 的基础内核：
 * - useSparkComponent
 * - 核心类型
 * - capability keys
 */

export { useSparkComponent, useSparkConsume, useSparkPageComponent, resolvePlaceholderProps } from './useSparkComponent.js'
export { useSparkContextScope } from './useSparkComponent.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from './useSparkComponent.js'

export type {
  CapabilityName,
  CapabilityContext,
  SparkCapabilityContext,
  SparkNode,
  SparkNodeChildren,
  FilterItemConfig,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
} from './types.js'

export { SPARK_REGISTRY_KEY } from '../system/keys.js'

export {
  SPARK_NODE_STRUCT_KEYS,
  normalizeSparkNode,
  nodeId,
  nodeInputProp,
  nodeInputProps,
  isSparkNode,
  getSparkNodeChildren,
} from './types.js'

export type {
  PageServiceCapability,
  PageMessageType,
  PageDialogResult,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageUploadFilesOptions,
  PageSelectEntitiesOptions,
  PageSelectorOption,
  PageSelectedEntity,
  PageSelectedFile,
  PageUploadedFile,
  PagePermissionMode,
} from './capability-keys.js'

export {
  PAGE_SERVICE,
  PAGE_PERMISSION_MODE,
} from './capability-keys.js'

export type {
  ThemeMode,
  ThemeCapability,
  ModuleContextItem,
  ModuleContext,
  ModuleContextCapability,
  PageComponentInstanceEntry,
  PageComponentApiEntry,
  PageComponentRegistry,
  PageCssScopeCapability,
} from './capability-keys.js'

export {
  PAGE_DATASET,
  DATA_SOURCE,
  DATA_ROW,
  MODULE_CONTEXT,
  PAGE_COMPONENT_REGISTRY,
  CSS_SCOPE,
} from './capability-keys.js'

export {
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
  sparkConsumeFromProvider,
} from '@spark-appworks/spark-utils'
