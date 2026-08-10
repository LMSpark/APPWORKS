/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererFilter.types
 * 职责：集中定义 RendererFilter（r-filter）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/zone-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer filter 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { SparkNodeProps } from '../../shared-types'
import type { SparkNode } from '@spark-appworks/spark-data'

/**
 * `r-filter` / `RendererFilter` 完整属性定义。
 *
 * SSOT 设计：r-filter 通过 `dataViewKey` 自治绑定 DataView，
 * 自己维护 filterModel / FilterExpression / DataView.setFilter 同步。
 * 父容器（r-table 等）不再注入桥接字段；嵌入 r-table 时可省略 dataViewKey，
 * 由 r-table 提供的 DATA_SOURCE 能力向下注入。
 */
export type RFilterProps = SparkNodeProps & {
  /** 组件类型固定为 `r-filter`。 */
    type?: 'r-filter'
    /** 节点标识。 */
    id?: string
    /** 默认筛选项节点列表（首选入口）。 */
    children?: SparkNode[]
  
    // ── 配置字段（pagedata.json 可设置） ─────────────────────────────────────
    /**
     * 筛选区附加 CSS class。
     * @remarks 由父容器（r-table 等）直接读取并应用到自身包裹层（如 `:filter-class`），
     * RendererFilter.vue 本身不消费此字段。
     */
    class?: string
    /**
     * DataView 定位键（dataViewKey）。
     * @remarks RendererFilter 通过该 key 解析 DataView，并写入 filterExpression。
     * 未提供时退回到向上注入的 DATA_SOURCE 能力（如 r-table 内嵌时）。
     */
    dataViewKey?: string
    /** 是否允许折叠。 */
    collapsible?: boolean
    /** 初始是否折叠。 */
    defaultCollapsed?: boolean
    /** 自适应最小宽度。 */
    autoFitMinWidth?: string
    /** 每个筛选项占据的栅格列数。 */
    itemSpan?: number
    /** 操作区占据的栅格列数，默认跟随 itemSpan。 */
    actionSpan?: number
    /** CSS Grid 列数。 */
    gridColumns?: number
    /** 栅格间距。 */
    gridGap?: number | string
    /** 栅格行高。 */
    gridAutoRows?: string
    /** 是否显示 DataView 元信息栏。 */
    showDataViewMeta?: boolean
    /** 是否显示全量聚合摘要。 */
    showAggregateSummary?: boolean
    /** 是否显示选区聚合摘要。 */
    showSelectionSummary?: boolean}
