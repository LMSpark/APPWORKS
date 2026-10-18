/**
 * @module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDialog/FullscreenDialog.props
 * 职责：声明弹窗全屏行为。边界：纯窗口状态，不改变绑定数据、编辑或保存。
 * AI用途：标准弹窗与过滤专题共用的显示合同。
 */
/** 全屏只改变显示尺寸；窄屏强制全屏时保留手动状态，恢复宽屏后继续使用手动状态。 */
export type DialogFullscreenOptions = {
  /** 手动全屏状态；省略为false，切换通过update:fullscreen通知调用方。 */
  fullscreen?: boolean
  /** 是否显示手动全屏入口；标准r-dialog默认false，过滤专题启用。 */
  fullscreenable?: boolean
  /** 视口宽度小于等于此像素值时自动全屏；省略或非正数不启用。 */
  autoFullscreenBelow?: number
  /** 关闭时复位手动全屏；不重置窗口中的业务草稿。默认false。 */
  resetFullscreenOnClose?: boolean
}

/** 内部弹窗外观输入；正式业务组件的数据上下文由r-dialog等外层组件提供。 */
export type FullscreenDialogProps = DialogFullscreenOptions & {
  /** 显隐由调用方控制；关闭时发出update:modelValue，不隐式处置业务数据。 */
  modelValue?: boolean
  /** 默认标题；调用方可用header插槽替换标题区域。 */
  title?: string
  /** 常规宽度；省略或undefined沿用底层默认值，全屏时忽略。 */
  width?: string | number | undefined
  /** 常规顶部间距；省略或undefined沿用底层默认值，全屏时归零。 */
  top?: string | undefined
  /** 挂到文档body以支持嵌套窗口，不改变Vue上下文继承。 */
  appendToBody?: boolean
  /** 原调用方的关闭守卫；只有调用done后才能关闭，窗口尺寸切换不触发它。 */
  beforeClose?: (done: () => void) => void
}
