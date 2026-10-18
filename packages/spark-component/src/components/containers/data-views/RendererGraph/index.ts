/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/index
 * 职责：暴露标准DataView关系图及绑定/选择合同。
 * 边界：纯公共出口，没有运行状态或独立查询通道。
 * AI用途：通过RGraphProps选择绑定属性及事件。
 */
export {default} from './RendererGraph.vue'
export {GraphLayout} from './GraphLayout'
export type {RGraphProps, GraphSelection, GraphNodeMove, GraphArrange, RendererGraphApi} from './RendererGraph.props'
