/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererForm/index
 * 职责：作为 RendererForm（r-form）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 table-level/data-view-container 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 renderer form 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default } from './RendererForm.vue'
export type { RendererFormApi } from './types.js'
export type { RFormProps } from './RendererForm.props.js'
