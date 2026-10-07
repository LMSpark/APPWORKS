/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDropdown/RendererDropdown.props
 * 职责：定义 RendererDropdown（r-dropdown）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer dropdown 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkFloatingLayerProps, SparkNodeProps } from '../../../../shared-types'

/** Dropdown Item 的语义模型。 */
export type DropdownItem = {
  /** 菜单项文本 */
  label: string
  /** 菜单命令值 */
  command?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示分割线 */
  divided?: boolean
  /** 图标名称 */
  icon?: string}

/** RDropdown Props 的属性契约。 */
export type RDropdownProps = SparkNodeProps & SparkFloatingLayerProps & {
  /** 菜单项列表 */
    items?: DropdownItem[]
    /** 触发方式 */
    trigger?: 'hover' | 'click' | 'contextmenu'
    /** 点击菜单项后是否自动收起 */
    hideOnClick?: boolean
    /** 展开延迟（毫秒） */
    showTimeout?: number
    /** 收起延迟（毫秒） */
    hideTimeout?: number
    /** 是否使用分裂按钮 */
    splitButton?: boolean
    /** 菜单最大高度 */
    maxHeight?: number | string}
