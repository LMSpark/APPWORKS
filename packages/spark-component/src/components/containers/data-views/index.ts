/**
 * @module @spark-appworks/spark-component:components/containers/data-views/index
 * 职责：作为 data-views（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 table-level/data-view-container 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 data views 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as RendererTable } from './RendererTable/index.js'
export type { RendererTableApi, RendererTreePath, RTableProps } from './RendererTable/index.js'
export { default as RendererForm } from './RendererForm/index.js'
export type { RendererFormApi, RFormProps } from './RendererForm/index.js'
export { default as RendererDetail } from './RendererDetail/index.js'
export type { RendererDetailApi, RDetailProps } from './RendererDetail/index.js'
export { default as RendererTree } from './RendererTree/index.js'
export { default as RendererGraph } from './RendererGraph/index.js'
export {GraphLayout} from './RendererGraph/index.js'
export type { RGraphProps, GraphSelection, GraphNodeMove, GraphArrange, RendererGraphApi } from './RendererGraph/index.js'
export type { RendererTreeApi, RTreeProps } from './RendererTree/index.js'
export { default as RendererList } from './RendererList/index.js'
export type { RendererListApi, RListProps } from './RendererList/index.js'
export { default as RendererVirtualCard } from './RendererVirtualCard/index.js'
export type { RendererVirtualCardApi, RVirtualCardProps } from './RendererVirtualCard/index.js'
