/**
 * @module @spark-appworks/spark-component:runtime/index
 * 职责：维护 @spark-appworks/spark-component 中 runtime/index 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 runtime/index 的声明、导出和使用边界时，从本模块开始。
 */
export {
  PAGE_RUNTIME_SERVICES,
} from './app-services'

export type {
  PageDialogOptions,
  PageDialogResult,
  PageMessageType,
  PageRouterService,
  PageRuntimeServicesCapability,
  PageServiceCapability,
} from './app-services'

export type {
  PageBrowseFilesOptions,
  PageSelectedFile,
  PageUploadFilesOptions,
  PageUploadedFile,
} from './app-services'

export type {
  PageSelectEntitiesOptions,
  PageSelectorOption,
} from './app-services'

export type {
  PageComponentAccessInScript,
  PageRoute,
  ScriptContext,
} from './script-context-types'
