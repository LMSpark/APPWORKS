/**
 * @module @spark-appworks/spark-component:components/fields/non-data-components/index
 * 职责：作为 non-data-components（未注册组件类型）目录的公开导出入口，汇聚渲染器、props、类型和 zero-code 能力。
 * 边界：只维护 field-level/field-support 的模块出口，不新增业务行为，也不绕过具体实现文件的契约。
 * AI用途：需要发现 non data components 对外暴露哪些子模块时，从本模块进入，再跳到具体 props、Vue 或 zero-code 文件。
 */
export { default as FieldContextRenderer } from './FieldContextRenderer.vue'
export { default as FieldTreeNodeSummary } from './TreeNodeSummary.vue'

// ── Props 类型 ──
export type { RTreeNodeSummaryProps } from './TreeNodeSummary.props'