/**
 * @module @spark-appworks/spark-component:components/containers/layout/action/RendererToolbar/RendererToolbar.types
 * 职责：定义所有容器 toolbar 和表格/树/列表 actions 共用的标准工具栏属性。
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
 * `RendererToolbar` 公开合同。容器工具栏及行/节点/列表项动作均复用它，
 * 由 children 和 tail.children 编排标准子组件，不另建操作列或按钮数组合同。
 * 未显式绑定时继承父 DataView 和行上下文；dataViewKey/dataMember/dataField 沿标准数据绑定解析。
 * 容器负责区域位置，RendererToolbar 负责子组件渲染、尾区、间距和 beforeRender。
 */
export type RToolbarProps = SparkNodeProps & SparkTableModelProps & {
  /** 尾部动作区（通常放次要按钮） */
    tail?: RTailProps
    /** 工具栏停靠位置；行/列表项 actions 由父容器限定为左或右，默认右侧。
     * @default "top"
     */
    position?: ToolbarPosition
    /** 主区、尾区及其子组件均按可用宽度换行，尾区保持末端对齐；默认false保持两区单行。窄工作区可显式启用。
     * @default false
     */
    wrap?: boolean
    /** 工具栏附加 class */
    class?: string
    /** 子组件间距；数字为像素，字符串为 CSS 长度。
     * @default 8
     */
    gap?: number | string
    /** 主区与尾区间距；数字为像素，字符串为 CSS 长度。
     * @default 12
     */
    zoneGap?: number | string
    /** 交叉轴对齐，使用 InlineAlign 枚举。
     * @default "center"
     */
    align?: InlineAlign
    /** 主轴分布，使用 InlineJustify 枚举；尾区固定靠末端。
     * @default "start"
     */
    justify?: InlineJustify}
