/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererMenu/RendererMenu.props
 * 职责：定义 RendererMenu（r-menu）的配置属性契约，描述导航菜单项树、方向、折叠、激活与选择事件。
 * 边界：只描述菜单呈现与选择回调；菜单项由调用方给出，激活与当前页由调用方判定，组件不创建导航数据或路由。
 * AI用途：生成侧栏/顶部导航配置时，用本模块判断 r-menu 允许的 props 与菜单项字段。
 */
import type { SparkNodeProps } from '../../../../shared-types'

/** 菜单项：index 在整棵菜单内唯一；children 非空时为子菜单，group 为 true 时按带标题分组平铺。 */
export type MenuItem = {
  /** 菜单项唯一标识，select 事件回传此值 */
  index: string
  /** 菜单项文本 */
  label: string
  /** 图标名称，按 DisplayIcon 规则解析 */
  icon?: string
  /** 徽标文本或数字；空值不显示 */
  badge?: string | number
  /** 是否禁用 */
  disabled?: boolean
  /** 调用方判定的激活高亮（可与 activeIndex 不同，例如父级目录随子页面高亮） */
  active?: boolean
  /** 是否为当前页面，用于 aria-current="page" */
  current?: boolean
  /** 之后显示分隔 */
  dividerAfter?: boolean
  /** children 按带标题分组平铺，而不是折叠子菜单 */
  group?: boolean
  /** 子菜单标题点击时也触发 select（标题本身对应可导航目标） */
  titleSelectable?: boolean
  /** 子菜单或分组的子项 */
  children?: MenuItem[]}

/** RMenu Props 的属性契约。 */
export type RMenuProps = SparkNodeProps & {
  /** 菜单项树 */
    items?: MenuItem[]
    /** 方向；默认 vertical */
    mode?: 'vertical' | 'horizontal'
    /** 纵向折叠：顶层只显示图标 */
    collapse?: boolean
    /** 当前激活菜单项 index */
    activeIndex?: string
    /** 横向空间不足时把溢出项收进“更多”子菜单；默认 true */
    ellipsis?: boolean
    /** 子菜单展开方式 */
    menuTrigger?: 'hover' | 'click'
    /** 子菜单展开延迟（毫秒） */
    showTimeout?: number
    /** 子菜单收起延迟（毫秒） */
    hideTimeout?: number
    /** 弹出子菜单的 popper 类名 */
    popperClass?: string
    /** 背景色 */
    backgroundColor?: string
    /** 文字颜色 */
    textColor?: string
    /** 激活项文字颜色 */
    activeTextColor?: string
    /** 选择菜单项回调；参数为菜单项 index 与菜单项 */
    onSelect?: (index: string, item: MenuItem) => void}
