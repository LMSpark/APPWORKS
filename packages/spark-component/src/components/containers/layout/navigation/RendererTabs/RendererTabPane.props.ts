/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererTabs/RendererTabPane.props
 * 职责：声明标准标签页面板的身份、布局和数据上下文。
 * 边界：配置 children 按网格跨度排列，原生默认 slot 作为完整内容区；数据交互由绑定的 DataView 承接。
 * AI用途：从 r-tab-pane 查询面板属性，沿 LayoutDataContextProps 查询标准数据绑定。
 */
import type {LayoutDataContextProps} from '../../../runtime/layout-data-context'

/** r-tabs 内的独立面板；无显式数据绑定时继承父布局的视图和行上下文。 */
export type RTabPaneProps = LayoutDataContextProps & {
  /** 标签页唯一标识。 */
  name?: string | number
  /** 标签页标题。 */
  label?: string
  /** 禁用标签切换。 */
  disabled?: boolean
  /** 首次激活时才挂载内容，之后保留编辑状态。 */
  lazy?: boolean
  /** 是否允许关闭。 */
  closable?: boolean
  /** 内容区附加 class。 */
  bodyClass?: string
  /** 配置 children 的 CSS Grid 列数；原生 slot 始终占完整行。 */
  gridColumns?: number | string
  /** 网格自动行高。 */
  gridAutoRows?: string
  /** 网格间距。 */
  gridGap?: number | string
  /** 在父容器中的位置，用于未命名标签的默认身份。 */
  index: number
}
