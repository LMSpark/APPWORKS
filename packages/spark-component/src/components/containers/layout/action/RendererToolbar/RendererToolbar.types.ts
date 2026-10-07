/**
 * @module @spark-appworks/spark-component:components/containers/layout/action/RendererToolbar/RendererToolbar.types
 * 职责：集中定义 RendererToolbar（r-toolbar）内部共享的类型契约，描述渲染器状态、事件载荷和运行时数据形态。
 * 边界：只提供 container/layout-container 的类型层语义，不创建组件实例、不执行 IO，也不承载具体 UI 渲染。
 * AI用途：需要判断 renderer toolbar 的状态结构、事件参数或 zero-code API 形状时，用本模块作为类型入口。
 */
import type { SparkTableModelProps, SparkNodeProps } from '../../../../shared-types'
import type { RTailProps } from '../../../zones/RendererTail.types'
import type { ToolbarPosition } from '../../../runtime/container-ui'

/** 工具栏交叉轴对齐方式。 */
export type InlineAlign = 'start' | 'center' | 'end' | 'stretch'

/** 工具栏主轴分布方式。 */
export type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

/**
 * `RendererToolbar` Vue 组件公开属性。
 */
export type RToolbarProps = SparkNodeProps & SparkTableModelProps & {
  /** 尾部动作区（通常放次要按钮） */
    tail?: RTailProps
    /** 工具栏停靠位置 */
    position?: ToolbarPosition
    /** 工具栏附加 class */
    class?: string
    /** 主区内元素间距 */
    gap?: number | string
    /** 主区与尾区间距 */
    zoneGap?: number | string
    /** 交叉轴对齐 */
    align?: InlineAlign
    /** 主轴分布 */
    justify?: InlineJustify}
