/**
 * @module @spark-appworks/spark-app:router/cross-project-ref-route
 * 职责：提供应用壳层 cross-project-ref-route 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
 * 边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
 * AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 router/cross-project-ref-route。
 */
export const CROSS_PROJECT_REF_HOST_ROUTE_NAME = 'spark-cross-project-ref-host'
