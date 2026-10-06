/**
 * @module @spark-appworks/spark-component:components/internal
 * 职责：提供 internal 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * components 内部桥接层。
 *
 * 供 `components/containers/` 与 `components/fields/` 共享使用，
 * 统一收口组件层允许依赖的 core 层符号。
 *
 * 只重导出 core 层的具名符号，不做命名空间聚合。
 */

// ── Composable ──
export { useSparkComponent, useSparkConsume, useSparkPageComponent, useSparkContextScope } from '../core/index.js'
export type {
  UseSparkComponentReturn,
  UseSparkPageComponentReturn,
  UseSparkCapabilityReaderReturn,
  UseSparkComponentOptions,
  SparkNodeInput,
} from '../core/index.js'

// ── 递归渲染器 ──
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'

// ── 能力键 ──
export {
  PAGE_SERVICE,
  PAGE_RUNTIME,
  DATA_SOURCE,
  DATA_ROW,
  PAGE_COMPONENT_REGISTRY,
  MODULE_CONTEXT,
} from '../core/index.js'
export type {
  PageServiceCapability,
  PageMessageType,
  PageDialogResult,
  PageDialogOptions,
  PageBrowseFilesOptions,
  PageUploadFilesOptions,
  PageSelectEntitiesOptions,
  PageSelectorOption,
  PageSelectedFile,
  PageUploadedFile,
  PageComponentRegistry,
  PageComponentApiEntry,
  ModuleContextCapability,
} from '../core/index.js'

// ── 事件控制 ──
export { createCancellableControl, isCancellableControl, type CancellableControl } from './containers/support/interactionControl.js'
