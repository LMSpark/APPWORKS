/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDialog/RendererDialog.props
 * 职责：定义 RendererDialog（r-dialog）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer dialog 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type {
  SparkGridLayoutProps,
  SparkVisibilityContainerProps,
} from '../../../../shared-types'
import type { RFooterProps } from '../../../zones/RendererFooter.types'
import type { RHeaderProps } from '../../../zones/RendererHeader.types'
import type { LayoutDataContextProps } from '../../../runtime/layout-data-context'
import type { DialogFullscreenOptions } from './FullscreenDialog.props'

/** RDialog Props 的属性契约。 */
export type RDialogProps = LayoutDataContextProps & SparkVisibilityContainerProps & SparkGridLayoutProps & DialogFullscreenOptions & {
  /** 结构化头部 */
    header?: RHeaderProps
    /** 结构化底部 */
    footer?: RFooterProps
    /** 对话框标题 */
    title?: string
    /** 弹窗宽度；数值按像素处理，字符串接受百分比或CSS宽度表达式。未配置时沿用底层默认宽度。 */
    width?: string | number
    /** 距视口顶部的CSS长度，默认沿用底层15vh；与数据绑定及显隐生命周期无关。 */
    top?: string
    /** 挂载到文档body，默认false；嵌套弹窗启用后避免被父窗口滚动区裁切，数据上下文仍沿原组件树继承。 */
    appendToBody?: boolean
    /** 关闭动画结束后释放弹窗内容，默认false；不自动保存或取消绑定视图的草稿。 */
    destroyOnClose?: boolean
    /** 控制显隐 */
    modelValue?: boolean
    /** 禁止用户和组件API关闭弹窗，默认false。阻止关闭按钮、遮罩、Esc、插槽close及close/toggle动作；外部modelValue=false仍可显式释放弹窗。用于草稿/在途操作保护，不代表数据权限。 */
    closeDisabled?: boolean
    /** 内容区 CSS 类名 */
    bodyClass?: string}
