/**
 * @module @spark-appworks/spark-component:components/shared-types
 * 职责：提供 shared types 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 组件层共享类型——容器 & 字段均可引用。
 *
 * ValueRef<T> 是 Vue Ref<T> 的最小结构约束，
 * 用于纯 TS 文件中接受 ref-like 对象而无需 import vue。
 */
import type { DataMember, DataView } from '@spark-appworks/spark-data'
import type { SparkNodeChildren } from '@spark-appworks/spark-data'
import type {
  AddRowHandler,
  EditRowHandler,
  RemoveRowHandler,
  RowClickHandler,
  RowSelectionHandler,
  CurrentRowChangeHandler,
} from './containers/support'

/** Value Ref 的引用结构。 */
export type ValueRef<T> = {
  /**
   * 当前持有的值。
   *
   * 约定：
   * - 调用方可以像操作 Vue ref 一样读取 `value`
   * - 也可以直接覆写 `value`，用于在纯 TS 工具中完成状态同步
   */
  value: T}

/**
 * SPARK 组件共享基类（第一层）：所有 SPARK 组件 props 的统一起点。
 *
 * 说明：
 * - type 由渲染器路由与组件默认值共同决定
 * - id 对应 SparkNode.id 的运行时映射
 * - children 必须对齐 `SparkNode.children` 的真实运行时形态
 * - registry 分支会直接把 `node.children` 透传给目标组件
 * - `children` 允许包含文本子节点，因此不能错误收窄成 `SparkNode[]`
 * - 只消费结构子节点的容器，应在本地使用 `getSparkNodeChildren()` 再收窄
 */
export type SparkNodeProps = {
  /**
   * 组件类型标识。
   *
   * 来源通常是 `SparkNode.type`，也可能在运行时由组件默认值补齐，
   * 主要用于渲染器路由、调试信息展示，以及少量组件内部的类型分支判断。
   */
  type?: string
  /**
   * 组件实例的稳定标识。
   *
    * 它通常对应 `SparkNode.id`，可用于：
   * - 页面脚本按名称查询节点
   * - 事件回调、日志、调试面板定位具体组件
   * - 某些容器对子节点做稳定 key 推导
   */
  id?: string
  /**
   * 原始子节点载荷，必须严格对齐 `SparkNode.children` 的运行时形态。
   *
   * 注意：
   * - 这里不只会出现结构化 `SparkNode`
   * - 还可能出现字符串、数字等文本子节点
   * - 只接受结构节点的组件，必须在本地显式收窄，而不能在共享层提前写死为 `SparkNode[]`
   */
  children?: SparkNodeChildren
  /**
   * 权限不足时的呈现策略。
   * - `disable`：保留可见但禁用（默认）
   * - `hide`：直接隐藏组件
   */
  permissionDeniedMode?: 'disable' | 'hide'}

/**
 * 标题 + 内容文本语义（容器/展示组件复用）。
 */
export type SparkTitleContentProps = {
  /**
   * 标题位文本。
   * 通常用于卡片头、统计标题、面板标题等“主说明”区域。
   */
  title?: string
  /**
   * 主内容文本。
   * 通常用于正文、摘要、补充说明，和 `title` 形成“标题 + 内容”的基础展示模型。
   */
  content?: string}

/**
 *
 * 作为容器 props 的命名中间层，承接 page-header、popover 这类
 * 既保留 `SparkNodeProps` 根层，又复用标题/正文语义的场景。
 */

/**
 * 展示组件值语义。
 *
 * 适用于只读 display 组件：
 * - 可以直接接收显式 `value`
 * - 也可以通过 `field` 从当前上下文数据读取值
 *
 * 注意：
 * - 这里只描述“值来源”语义，不包含字段编辑语义
 * - 组件自身仍应显式 `extends SparkNodeProps`，保持 props 入口可读
 */
export type SparkDataDisplayProps<TValue = unknown> = {
  /**
   * 显式展示值。
   *
   * 适用于不依赖运行时上下文、直接由配置或外层受控传入的只读展示场景。
   */
  value?: TValue
  /** DataView 定位键，用于从页面数据空间读取展示值。 */
  dataViewKey?: string
  /** DataView 成员枚举值。 */
  dataMember?: DataMember | `${DataMember}`
  /** DataView 成员内部业务字段或点路径。 */
  dataField?: string
  /**
   * 数据字段绑定键。
   *
   * 常见语义是从当前上下文数据中读取 `currentRow[field]`，
   * 用于详情展示、只读文本渲染或行内展示等场景。
   */
  field?: string}

/**
 * 字段语义层（无根）。
 *
 * 只描述 field 组件自己的值/标签/占位等编辑语义，
 * 不引入 `SparkNodeProps`，以便具体组件能够显式挂在根层上而不形成重复继承。
 */
export type SparkFieldSemanticProps<TValue = unknown> = {
  /**
   * 字段宽度。
   *
   * 主要用于输入类、选择类、文件类字段的控件宽度控制。
   * 这里统一约定为数值宽度，由具体组件决定如何映射到样式层。
   */
  width?: number
  /**
   * 表格列是否允许拖动列宽。
   *
   * 字段作为 r-table 列渲染时映射到 `el-table-column` 的 `resizable`。
   */
  resizable?: boolean
  /**
   * 是否允许清空当前值。
   *
   * 适用于输入类、选择类、时间类、文件类等可回到“空值”状态的字段。
   * 具体组件可按自身能力决定是否真正消费该配置。
   */
  clearable?: boolean
  /**
   * 直接传入的受控字段值。
   *
   * 对应 Vue v-model 标准命名，支持 `v-model="xxx"` 写法。
   */
  modelValue?: TValue
  /**
   * 跨框架配置模型值。
   *
   * 页面配置可继续使用 `value` 表达字段当前值；Vue 渲染适配层会在下发组件前映射为 `modelValue`。
   */
  value?: TValue
  /**
   * 字段绑定名。
   *
   * 常见语义是从当前上下文数据中读取 `currentRow[field]`，
   * 也可作为表单写回、明细展示、列渲染时的字段定位键。
   */
  field?: string
  /**
   * 展示标签。
   * 常用于表单项标题、详情项名称、字段说明等“人类可读”的字段名展示。
   */
  label?: string
  /**
   * 只读状态。
   *
   * 表示组件仍可见、通常仍参与布局，但不允许用户修改值；
   * 它与完全禁用或隐藏是不同层级的语义。
   */
  readonly?: boolean
  /**
   * 占位文案。
   * 当组件无值且支持 placeholder 时，用来提示用户预期输入或显示内容格式。
   */
  placeholder?: string
  /**
   * 字段值变更回调。
   *
   * 统一由字段控制层透传给事件分发器，替代隐式监听提取。
   */
  onChange?: (...args: unknown[]) => void | Promise<void>
  /**
   * 表头/详情标题对齐方向。
   * 用于表格表头及详情项标题的水平对齐控制。
   */
  titleAlign?: 'left' | 'center' | 'right'
  /**
   * 值区对齐方向。
   * 用于表格单元格及详情项值区的水平对齐控制。
   */
  valueAlign?: 'left' | 'center' | 'right'
  /**
   * 表格表头单元格 CSS 类名。
   * 直接映射到 `el-table-column` 的 `label-class-name`。
   */
  headerCellClassName?: string
  /**
   * 表格单元格 CSS 类名。
   * 直接映射到 `el-table-column` 的 `class-name`。
   */
  cellClassName?: string
  /**
   * 详情/表单标题 CSS 类名。
   */
  titleClassName?: string
  /**
   * 详情/表格值区 CSS 类名。
   */
  valueClassName?: string
  /**
   * 是否允许排序。
   * - true: 前端排序
   * - 'custom': 服务端排序
   * - false: 禁用排序
   */
  sortable?: boolean | 'custom'}

/**
 * 主动作按钮文案。
 *
 * 适用于带显式主操作按钮的字段，
 * 例如“选择”“上传”“浏览文件”。
 */
export type SparkPrimaryActionTextProps = {
  /**
   * 主动作按钮文案。
   */
  buttonText?: string}

/**
 * 只读/查看类动作按钮文案。
 *
 * 适用于字段在可编辑与只读模式之间切换时，
 * 主动作按钮文本也需要跟随切换的场景。
 */
export type SparkReadonlyActionTextProps = {
  /**
   * 只读或查看模式下的主动作按钮文案。
   */
  readonlyButtonText?: string}

/**
 * 多行输入可见行数语义。
 *
 * 适用于 textarea、mention 的多行输入模式、
 * 以及带源码编辑区的 html-editor 这类“以文本区显示行数”为主的输入组件。
 */
export type SparkMultilineRowsProps = {
  /**
   * 多行输入的可见行数。
   *
   * 该值通常直接映射到底层 textarea 类组件的 `rows` 属性。
   */
  rows?: number}

/**
 * 多行字段语义。
 *
 * 适用于 textarea、mention、html-editor 这类建立在字段语义之上，
 * 同时复用多行行数配置的输入组件。
 */
export type SparkMultilineFieldProps<TValue = string> = SparkFieldSemanticProps<TValue> & SparkMultilineRowsProps

/**
 * 数值上界语义。
 *
 * 适用于评分、数字输入、滑块等需要声明“最大允许值”或“最大档位”的数值字段。
 */
export type SparkNumericMaxProps = {
  /**
   * 最大值。
   */
  max?: number}

/**
 * 数值区间边界语义。
 *
 * 适用于同时需要声明最小值和最大值的数值字段，
 * 例如 number / slider 这类连续区间输入组件。
 */
export type SparkNumericBoundsProps = SparkNumericMaxProps & {
  /**
     * 最小值。
     */
    min?: number}

/**
 * 有上限的数值字段语义。
 *
 * 适用于 rate 这类只声明最大档位、但不要求最小值边界的数值字段。
 */
export type SparkMaxNumericFieldProps<TValue = number> = SparkFieldSemanticProps<TValue> & SparkNumericMaxProps

/**
 * 有上下界的数值字段语义。
 *
 * 适用于 slider、number 这类需要共同声明最小值和最大值的字段组件。
 */
export type SparkBoundedFieldProps<TValue = number> = SparkFieldSemanticProps<TValue> & SparkNumericBoundsProps

/**
 * 支持区间筛选的数值字段语义。
 *
 * 适用于在普通数值输入与范围筛选之间切换的 number 类组件。
 */
export type SparkRangeNumericFieldProps<TValue = number | [number | undefined, number | undefined]> = SparkBoundedFieldProps<TValue> & SparkRangeFilterProps

/**
 * 文件字段核心语义。
 *
 * 用于“字段值本身是文件路径/文件名字符串”的场景，
 * 统一收口文件类型过滤、字符串拼接规则，以及主动作按钮文案。
 */
export type SparkFileFieldProps<TValue = string> = SparkFieldSemanticProps<TValue> & SparkPrimaryActionTextProps & {
  /**
     * 文件类型过滤条件。
     *
     * 一般透传给文件浏览/上传能力，例如 `image/*`、`.pdf,.docx`。
     */
    accept?: string
    /**
     * 多文件字符串分隔符。
     *
     * 当一个字段以单个字符串承载多个文件值时，用它拼接文件名或路径。
     */
    separator?: string}

/** 文件上传/浏览动作地址（例如上传接口 URL 或 '#'）。 */
// 这里不再为 JS 基础类型保留导出别名，上传动作地址直接使用 string。

/**
 * 文件上传/浏览切换动作语义。
 *
 * 适用于既可能上传，也可能只读浏览的文件字段。
 */
export type SparkFileUploadActionProps = SparkReadonlyActionTextProps & {
  /**
     * 上传目标地址。
     *
     * 当值为空或 `#` 时，字段通常会退化为纯浏览模式。
     */
  action?: string}

/**
 * 上传类文件字段语义。
 *
 * 适用于值仍是文件字段，但交互上需要上传目标地址与文件字段本体同时存在的组件。
 */
export type SparkUploadFieldProps<TValue = string> = SparkFileFieldProps<TValue> & SparkFileUploadActionProps

/**
 * 可选择多个文件，并支持上传/浏览双动作的文件字段语义。
 *
 * 适用于文件路径选择器、图片选择器这类“值仍是字符串，
 * 但交互上同时支持上传与浏览”的文件字段。
 */
export type SparkFilePickerFieldProps<TValue = string> = SparkFileFieldProps<TValue> & SparkFileUploadActionProps & {
  /**
     * 是否允许一次选择多个文件。
     */
    multiple?: boolean}

/**
 * 时间类选择器的通用交互语义。
 *
 * 适用于 date-picker / time-picker 这类既可能选择单值，
 * 也可能选择范围值的时间输入组件。
 */
export type SparkTemporalPickerProps<TValue = unknown> = SparkFieldSemanticProps<TValue> & {
  /**
     * 显示格式。
     *
     * 只影响控件展示层，不直接决定底层实际写回值的格式。
     */
    format?: string
    /**
     * 范围起点占位文案。
     */
    startPlaceholder?: string
    /**
     * 范围终点占位文案。
     */
    endPlaceholder?: string
    /**
     * 范围值中间的展示分隔文案。
     */
    rangeSeparator?: string}

/**
 * 范围过滤字段语义。
 *
 * 适用于既可作为普通输入字段，也可切换到“区间筛选”模式的组件，
 * 例如 number/date 这类在查询表单里支持单值与范围值两种交互的字段。
 */
export type SparkRangeFilterProps = {
  /**
   * 过滤模式。
   * 当值为 `range` 时，组件通常切换到范围筛选 UI。
   */
  filterMode?: 'range' | undefined}

/**
 * 支持范围筛选的时间字段语义。
 *
 * 适用于 date/date-range 一类既保留时间选择器能力，
 * 又能切换到范围筛选模式的字段组件。
 */
export type SparkRangeTemporalFieldProps<TValue = unknown> = SparkTemporalPickerProps<TValue> & SparkRangeFilterProps

/**
 * 选项按钮样式语义。
 *
 * 适用于同一组选项既可以普通项渲染，
 * 也可以切换成“按钮式选项”渲染的字段组件。
 */
export type SparkOptionButtonStyleProps = {
  /**
   * 是否启用按钮样式。
   *
   * 例如把 radio 渲染成 `el-radio-button`，
   * 或把 checkbox-group 渲染成 `el-checkbox-button`。
   */
  buttonStyle?: boolean}

/**
 * 层级选择严格模式语义。
 *
 * 适用于树形/级联类选择组件，用来声明父子节点是否保持联动选择。
 */
export type SparkHierarchicalSelectionProps = {
  /**
   * 是否启用严格选择。
   *
   * 开启后，父子节点通常不再自动联动，
   * 组件会把每个节点视作独立可选项。
   */
  checkStrictly?: boolean}

/**
 * 选项字段主值持久化模式。
 *
 * - `auto`：尽量保持当前宿主字段已有的值形态
 * - `array`：始终以数组值持久化
 * - `separated-string`：始终以分隔字符串持久化，分隔规则由 `valueSeparator` 决定
 */
export type SparkOptionValueMode = 'auto' | 'array' | 'separated-string'

/**
 * 带选项字段属性（第三层）：
 * 为具备 field 语义的“选项类字段组件”统一收口静态选项、动态选项解析和常见行为开关。
 *
 * 适用范围：
 * - select / multi-select / radio / checkbox-group
 * - cascader / tree-select / transfer
 * - entity-picker / icon-picker 等基于候选项选择值的字段组件
 *
 * 说明：
 * - `options / optionLabelField / optionValueField / optionDisabledField / optionChildrenField` 继承自 `SparkOptionSourceProps`
 * - `options` 表示本地静态候选项入口；若组件同时提供 `optionDataViewKey`，运行时通常先解析动态数据源，再在缺失时回退到本地 `options`
 * - `optionDataViewKey` 负责指向动态选项数据源，而不是选项对象内部的主键字段
 * - 某些组件可通过为 `SparkOptionFieldProps<TValue, TOption>` 传入更具体的 `TOption` 收窄本地 `options` 类型，无需在组件 props 中重复声明 `options`
 * - 如果某组件只有“候选项结构”语义，而没有 field/value/placeholder 等字段语义，可直接复用 `SparkOptionSourceProps`
 */
export type SparkOptionFieldProps<TValue = unknown, TOption = unknown> = SparkFieldSemanticProps<TValue> & SparkOptionSourceProps<TOption> & {
  /**
     * @internal 运行时数据线，由框架注入，不属于页面配置。
     *
     * 作用：
     * - 为字段组件提供当前 DataView 上下文
     * - 让组件可以结合 `optionDataViewKey` 等配置解析出真实选项列表
     */
    dataSource?: DataView
    /**
     * 选项 DataView 定位键。
     *
     * 通常指向某个 DataView，例如 `Categories@default`，
     * 组件可据此从运行时数据中动态生成候选项，而不是写死静态枚举。
     */
    optionDataViewKey?: string
    /** 选项来源 DataView 成员，默认 rows。 */
    optionDataMember?: DataMember | `${DataMember}`
    /** 选项来源成员内部字段或路径。 */
    optionDataField?: string
    /**
     * 值分隔符。
     *
     * 当组件处于多选语义，但主字段 `field` 选择以单个字符串而不是数组形式持久化时，
     * 使用该分隔符把多个候选值序列化到主字段中。
     *
     * 示例：
     * - 当前选中值为 `[101, 102]`
     * - `valueSeparator` 为 `,`
     * - 最终写入 `field` 为 `101,102`
     */
    valueSeparator?: string
    /**
     * 主值持久化模式。
     *
     * 用于声明当前选项字段把选中结果写回 `field` 时，应保留数组，
     * 还是按 `valueSeparator` 序列化成单个字符串。
     */
    valueMode?: SparkOptionValueMode
    /**
     * 文本分隔符。
     *
     * 当组件把候选项文本额外写入 `textStorageField`，且当前选择包含多个候选项时，
     * 使用该分隔符拼接展示文本。
     */
    textSeparator?: string
    /**
     * 文本储存字段。
     *
     * 主字段 `field` 仍负责持久化候选值；`textStorageField` 仅用于额外保存候选项文本，
     * 例如把选中的 ID 存到 `userIds`，同时把姓名串存到 `userNames`。
     */
    textStorageField?: string
    /**
     * 是否允许在候选项中搜索。
     * 一般用于候选集较大、需要关键字过滤的组件。
     */
    filterable?: boolean
    /**
     * 是否启用多选模式。
     * 开启后，组件的值语义通常从单值切换为数组值。
     */
    multiple?: boolean}

/**
 * 按钮化选项字段语义。
 *
 * 适用于 radio / checkbox-group 这类既是选项字段，
 * 又支持按钮式渲染的组件。
 */
export type SparkButtonOptionFieldProps<TValue = unknown, TOption = unknown> = SparkOptionFieldProps<TValue, TOption> & SparkOptionButtonStyleProps

/**
 * 层级选项字段语义。
 *
 * 适用于 cascader / tree-select 这类既是选项字段，
 * 又需要父子选择联动控制的组件。
 */
export type SparkHierarchicalOptionFieldProps<TValue = unknown, TOption = unknown> = SparkOptionFieldProps<TValue, TOption> & SparkHierarchicalSelectionProps

/**
 * 选项源配置（源层通用）：
 * 只描述“候选项本身的结构”，不包含 field 语义，也不负责动态 DataViewKey 绑定。
 *
 * 适合：
 * - 静态枚举
 * - 小规模本地 options
 * - 构建期即可确定的树形/级联候选项
 *
 * 注意：
 * - 这里的 `options` 只是在类型层描述“本地直接传入的候选项”
 * - 若具体字段组件还支持 `optionDataViewKey`，动态候选项会在运行时由共享解析链补进来，而不是受这里的静态类型声明限制
 */
export type SparkOptionSourceProps<TOption = unknown> = {
  /**
   * 可选项数组。
   * 通常用于静态枚举场景，例如状态、性别、开关类型等固定候选列表。
   */
  options?: TOption[]
  /**
   * 选项显示字段。
   * 指定从选项对象的哪个字段读取展示文本。
   */
  optionLabelField?: string
  /**
   * 选项值字段。
    * 指定从选项对象的哪个字段读取最终写入字段主值的值。
   */
  optionValueField?: string
  /**
   * 选项禁用字段。
   * 指定从选项对象的哪个字段读取“当前候选项是否不可选”的布尔状态。
   */
  optionDisabledField?: string
  /**
   * 子级字段名。
   * 用于树形选择、级联选择等嵌套选项结构，指定子节点数组所在字段。
   */
  optionChildrenField?: string}

/**
 * 浮层行为配置（容器层通用）：
 * 提供 popover、tooltip、dropdown 一类“挂载到目标元素附近”的浮层组件共通行为。
 */
export type SparkFloatingLayerProps = {
  /**
   * 浮层位置。
   * 一般透传给底层 UI 库的 placement 语义，例如 top / bottom-start / right-end。
   */
  placement?: string
  /**
   * 浮层主题。
   * 通常对应浅色或深色两套视觉风格。
   */
  effect?: 'dark' | 'light'
  /**
   * 浮层与锚点之间的偏移量。
   * 用于微调视觉距离，避免贴边或遮挡。
   */
  offset?: number
  /**
   * 显示延迟，单位毫秒。
   * 常用于 hover 浮层，避免鼠标轻扫时频繁闪现。
   */
  showAfter?: number
  /**
   * 隐藏延迟，单位毫秒。
   * 常用于改善 hover 离开时的交互容错。
   */
  hideAfter?: number
  /**
   * 是否显示箭头。
   * 用于增强浮层与目标元素之间的视觉指向关系。
   */
  showArrow?: boolean
  /**
   * 浮层根节点附加 class。
   * 供页面或主题层覆盖局部样式时使用。
   */
  popperClass?: string}

/**
 *
 * 适用于 tooltip、popover 这类以浮层配置为主的容器组件。
 */

/**
 * Grid 布局容器语义。
 *
 * 适用于 form、detail、dialog、section 等需要统一声明内容区 CSS Grid 布局的容器。
 */
export type SparkGridLayoutProps = {
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string}

/**
 * 表级模型属性（第五层）：
 * 用于 DataView 驱动的数据容器，描述它们和页面数据空间的连接点。
 */
export type SparkTableModelProps = {
  /**
   * @internal 运行时数据线，由框架注入，不属于页面配置。
   *
   * 它代表当前容器实际绑定到的 DataView。
   */
  dataSource?: DataView
  /**
   * DataView 定位键。
   * 固定格式为 `table@viewId` 或 `#scope@table@viewId`，用于把表级容器绑定到页面 DataSet 的某个视图。
   */
  dataViewKey?: string
  /** DataView 成员枚举值，用于读取 DataView 输出成员。 */
  dataMember?: DataMember | `${DataMember}`
  /** DataView 成员内部业务字段或点路径。 */
  dataField?: string
  /** 是否显示 DataView 元信息栏。 */
  showDataViewMeta?: boolean
  /** 是否显示全量聚合摘要。 */
  showAggregateSummary?: boolean
  /** 是否显示选区聚合摘要。 */
  showSelectionSummary?: boolean}

/**
 * 数据容器 CRUD 事件（统一命名层）。
 * 为表格、列表等可编辑容器提供统一命名的增删改动作入口。
 */
export type SparkCrudEventProps = {
  /**
   * 新增动作回调。
   * 常由工具栏“新增”按钮、空态入口或快捷动作触发。
   */
  onAddRow?: AddRowHandler
  /**
   * 编辑动作回调。
   * 通常用于编辑当前行、双击行编辑或弹出编辑表单。
   */
  onEditRow?: EditRowHandler
  /**
   * 删除动作回调。
   * 常用于删除当前行、批量删除所选行，或触发删除确认流程。
   */
  onRemoveRow?: RemoveRowHandler}

/**
 * 行交互事件（统一命名层）。
 * 用于承接用户对数据行的常见交互行为，并向上层暴露稳定的事件名。
 */
export type SparkRowInteractionEventProps = {
  /**
   * 行点击回调。
   * 用户点击某一行时触发，常用于详情联动、主子表级联或进入编辑态。
   */
  onRowClick?: RowClickHandler
  /**
   * 选中集合变化回调。
   * 多选表格或勾选容器在选中项增减后触发。
   */
  onSelectionChange?: RowSelectionHandler
  /**
   * 当前行变化回调。
   * 当前高亮行、焦点行或主选择行切换时触发。
   */
  onCurrentChange?: CurrentRowChangeHandler}

/**
 *
 * 作为 DataView 驱动容器的命名中间层，统一表达它们与页面数据空间的绑定关系。
 */

/**
 *
 * 在数据容器基础上增加统一 CRUD 动作入口，适用于 form、detail、list、tree、table。
 */
export type SparkCrudDataContainerProps = SparkTableModelProps & SparkCrudEventProps

/**
 *
 * 在可编辑数据容器基础上继续收口行点击、选中集合变化、当前行变化等交互事件。
 */
export type SparkInteractiveDataContainerProps = SparkCrudDataContainerProps & SparkRowInteractionEventProps

/**
 * 可见性生命周期事件（统一命名层）。
 * 适用于 dialog、drawer、popover 等具备显隐状态的组件。
 */
export type SparkVisibilityEventProps = {
  /**
   * 打开动作触发时回调。
   * 一般用于进入显示流程前准备数据或记录埋点。
   */
  onOpen?: () => void
  /**
   * 关闭动作触发时回调。
   * 一般用于执行关闭确认、清理临时状态或通知外层。
   */
  onClose?: () => void
  /**
   * 打开完成后回调。
   * 适合执行依赖 DOM 已稳定可见的逻辑，例如 autofocus 或尺寸测量。
   */
  onOpened?: () => void
  /**
   * 关闭完成后回调。
   * 适合做最终清理、销毁临时资源或恢复外层页面状态。
   */
  onClosed?: () => void}

/**
 * 显隐容器语义。
 *
 * 适用于 dialog、drawer 这类公开显隐生命周期事件的容器组件。
 */
export type SparkVisibilityContainerProps = SparkVisibilityEventProps & {
  /**
     * 跨框架显隐配置值。
     *
     * 页面配置可继续使用 `value` 表达容器显隐；Vue 渲染适配层会在下发组件前映射为 `modelValue`。
     */
    value?: boolean}
