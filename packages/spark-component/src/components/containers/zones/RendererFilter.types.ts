/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererFilter.types
 * 职责：集中定义 RendererFilter（r-filter）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/zone-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer filter 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { SparkNodeProps } from '../../shared-types'
import type { SparkNode, DataViewFilterFunctionContext } from '@spark-appworks/spark-data'

/**
 * `r-filter` / `RendererFilter` 完整属性定义。
 *
 * 容器统一过滤入口：通过 `dataViewKey` 绑定 DataView，未指定时继承父级 DATA_SOURCE。
 * 完整表达式编辑器使用 DataViewFilterTree / DataView.executeFilter；
 * 可选的常用筛选子组件通过同一 useFilterPanel / DataView.setFilter 同步。
 * 过滤属于绑定视图，表格、树、列表共享视图时消费同一结果；容器不另建过滤或查询逻辑。
 */
export type RFilterProps = SparkNodeProps & {
  /** 组件类型固定为 `r-filter`。 */
    type?: 'r-filter'
    /** 节点标识。 */
    id?: string
    /** 常用筛选子组件；带 field 的子组件生成筛选条件。未配置时仍可使用绑定视图的完整表达式编辑器。 */
    children?: SparkNode[]
  
    // ── 组件配置（rule.json 或原生 Vue） ─────────────────────────────────────
    /**
     * 筛选区附加 CSS class。
     * @remarks 由 RendererFilter 应用到筛选面板和完整表达式编辑器各自的根区域。
     */
    class?: string
    /**
     * DataView 定位键（dataViewKey）。
     * @remarks RendererFilter 通过该 key 解析 DataView，并写入 filterExpression。
     * 未提供时退回到向上注入的 DATA_SOURCE 能力（如 r-table 内嵌时）。
     */
    dataViewKey?: string
    /** 输入改变后是否立即查询。缺省沿用DataView.queryConfig.autoQuery，视图缺省true；false等待查询按钮。显式值只在当前绑定期间覆盖该视图的查询级联与常用筛选时机。 */
    autoQuery?: boolean | undefined
    /** 完整表达式的呈现方式。默认dialog由按钮打开；inline直接显示同一编辑器，取消恢复已应用条件，应用仍走DataView过滤链。 */
    expressionDisplay?: 'dialog' | 'inline'
    /** 值函数的明确编辑上下文；不从页面表名猜后端模型名称。 */
    filterFunctionContext?: DataViewFilterFunctionContext
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
