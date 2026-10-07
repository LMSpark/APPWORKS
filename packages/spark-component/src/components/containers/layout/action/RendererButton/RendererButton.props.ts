/**
 * @module @spark-appworks/spark-component:components/containers/layout/action/RendererButton/RendererButton.props
 * 职责：定义 RendererButton（r-button）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 container/layout-container 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 renderer button 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkNodeProps } from '../../../../shared-types'
import type { ActionDescriptor, BuiltinActionName } from '../../../../../page/actions'

/** RButton Props 的属性契约。 */
export type RButtonProps = SparkNodeProps & {
  /**
   * CRUD 或页面动作名，由宿主内置 action runner 接管执行。
   * 新建申请、提交新单据等“创建一条新记录”的按钮优先使用 append-row，并用 dataViewKey 指向目标列表/待处理视图。
   * append-row/prompt-append 会读取按钮当前作用域行、appendPayload、inheritFields 和 inheritFieldMap。
   */
  action?: BuiltinActionName

  /**
   * 目标 DataViewKey；不写时使用按钮所在容器提供的数据视图。
   * append-row/patch/delete/refresh 等动作会优先作用于这个 DataView。
   * 格式示例：table@viewId。
   */
  dataViewKey?: string

  /**
   * 目标行主键字段名。
   * @default "id"
   */
  idField?: string

  /**
   * append-row/prompt-append 新行初始字段值。
   * 适合写入固定状态，例如 {"status":"pending"}。
   * @default {}
   */
  appendPayload?: Record<string, unknown>

  /**
   * append-row/prompt-append 从当前作用域行复制到新行的字段名。
   * 表单提交到待处理列表时，用它把 currentRow 中的申请人、日期、事由等字段复制到目标视图。
   * @default []
   */
  inheritFields?: string[]

  /**
   * append-row/prompt-append 从当前作用域行复制并重命名的字段映射。
   * key 是源字段，value 是新行目标字段。
   * @default {}
   */
  inheritFieldMap?: Record<string, string>

  /**
   * 新增成功后是否将新行设为目标视图 currentRow。
   * @default false
   */
  setCurrentRowOnSuccess?: boolean

  /**
   * patch-row/patch-current/patch-selected 的静态更新字段。
   * 用于批量写入固定值，例如 {"status":"approved"}。
   * @default {}
   */
  patch?: Record<string, unknown>

  /**
   * prompt/patch/set-field 使用的单字段名。
   * field/value 成对出现时，只更新一个字段。
   */
  field?: string

  /**
   * patch/set-field 使用的单字段值。
   * 与 field 配合使用。
   */
  value?: unknown

  /**
   * 当前内置动作成功后的链式动作。
   * 例如 append-row 成功后再 patch-current 清空草稿表单。
   */
  then?: ActionDescriptor

  /**
   * 操作成功后的提示文案。
   * @default ""
   */
  successMessage?: string

  /**
   * 操作失败后的提示文案。
   * @default ""
   */
  failureMessage?: string

  /**
   * 数据源为空或目标行不存在时的提示文案。
   * @default ""
   */
  emptyMessage?: string

  /**
   * 运行时异常时的提示文案。
   * @default ""
   */
  errorMessage?: string

  /**
   * 表单校验失败时的提示文案。
   * @default ""
   */
  validateMessage?: string

  /**
   * 操作前确认文案；空字符串表示跳过确认。
   * @default ""
   */
  confirmMessage?: string

  /**
   * 操作前确认标题。
   * @default ""
   */
  confirmTitle?: string

  /**
   * 操作前确认类型。
   * 由 UI 消息组件解释，常见值为 warning、info、success、error。
   * @default "warning"
   */
  confirmType?: string

  /**
   * 静默模式；成功/失败提示不展示。
   * @default false
   */
  silent?: boolean

  /**
   * 当前行字段值匹配此对象时禁用按钮。
   * 常用于 status 等字段控制操作可用性。
   * @default {}
   */
  disabledWhenRow?: Record<string, unknown>

  /**
   * 样式模板名。
   * 常见值如 primary、toolbar-danger、icon-add。
   */
  template?: string

  /**
   * 按钮文本。
   * @default ""
   */
  label?: string

  /**
   * 按钮类型。
   * 传给底层按钮组件的视觉类型。
   */
  buttonType?: string

  /**
   * 按钮尺寸。
   * Element Plus 按钮尺寸只允许 default、small、large。
   * @default "default"
   */
  buttonSize?: string

  /**
   * 是否朴素按钮。
   * @default false
   */
  plain?: boolean

  /**
   * 是否文本按钮。
   * @default false
   */
  text?: boolean

  /**
   * 文本按钮是否显示背景。
   * @default false
   */
  bg?: boolean

  /**
   * 是否链接风格。
   * @default false
   */
  link?: boolean

  /**
   * 是否圆角。
   * @default false
   */
  round?: boolean

  /**
   * 是否圆形按钮。
   * @default false
   */
  circle?: boolean

  /**
   * 是否加载中。
   * @default false
   */
  loading?: boolean

  /**
   * 图标名称。
   * 使用当前图标注册表中的图标名。
   */
  icon?: string

  /**
   * 中文按钮文案是否自动插空格。
   * @default false
   */
  autoInsertSpace?: boolean

  /**
   * 自定义颜色。
   * 传给底层按钮组件的颜色值。
   */
  color?: string

  /**
   * 是否使用深色主题。
   * @default false
   */
  dark?: boolean
}

