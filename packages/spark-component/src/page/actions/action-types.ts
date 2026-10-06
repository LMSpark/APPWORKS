/**
 * @module @spark-appworks/spark-component:page/actions/action-types
 * 职责：提供 action types 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * Action Descriptor — 声明式行为描述符
 *
 * 单一动作真源：rule.json 的 `on` 事件、容器区域子节点（如 `r-toolbar`）、
 * 内置按钮的 `props.action` 全部统一通过此 descriptor 声明，
 * 由 `executeActionDescriptor` 单一执行器消费。
 *
 * ## 分层结构
 * ```
 * ActionDescriptor（联合类型，14 种动作）
 *   ├─ UI 类：show-message / confirm / alert / navigate / open
 *   ├─ 字段操作：set-field
 *   └─ 数据变更类（含 ActionUiDecorator 装饰）：
 *        append-row / delete / patch / move / message-row /
 *        refresh / clear-rows / submit-current-form / save-dataset
 * ```
 */

import type { DataView, DataRow, DataSetContract, DataSetSaveChangesMode, DataSetSaveChangesViewSelector } from '@spark-appworks/spark-data'
import type { PageServiceCapability, PageMessageType } from '../../core/capability-keys.js'
import type { CancellableControl } from '../../components/containers/support/interactionControl.js'

// ── 通用 UI 装饰（data-mutating 动作共享） ────────────────────────────────

/**
 * UI 装饰：与具体动作语义无关，统一控制消息/确认/静默行为。
 *
 * 所有 data-mutating 动作（append-row / delete / patch / move 等）都继承此接口，
 * 执行器会在适当时机使用这些文案替代内置兜底文案。
 *
 * ### 文案插值语法
 * 支持 `{var}` 占位符，执行器会在调用 `interpolate()` 时注入上下文变量：
 * - `{count}` — 批量操作影响的行数
 * - `{row.fieldName}` — 当前行的字段值（例如 `{row.name}`）
 */
export type ActionUiDecorator = {
  /** 静默模式：设为 true 时所有成功/失败消息都不展示（errorMessage 除外） */
  silent?: boolean
  /** 操作成功后的提示文案；支持插值（如 `已删除 {count} 条`） */
  successMessage?: string
  /** 操作失败后的警告文案（例如 CRUD 返回失败） */
  failureMessage?: string
  /** 数据源为空或目标行不存在时的警告文案 */
  emptyMessage?: string
  /** 运行时异常时的 error 文案（无视 silent） */
  errorMessage?: string
  /** 操作前的确认弹窗文案；留空字符串 `''` 表示有意跳过确认 */
  confirmMessage?: string
  /** 确认弹窗标题 */
  confirmTitle?: string
  /** 确认弹窗类型（warning / danger 等） */
  confirmType?: PageMessageType
  /** 当目标行字段值匹配此条件时，按钮禁用（所有字段全相等才触发） */
  disabledWhenRow?: Record<string, unknown>}

// ── 行作用域与表单 API ────────────────────────────────────────────────────

/**
 * 表单 API 接口（submit-current-form 动作专用）。
 *
 * 由包含表单的容器（如 r-form）在渲染期注入到 `ActionExecutionScope.formApi`，
 * 让动作执行器能够读取表单数据并触发校验。
 */
export type ActionFormApi = {
  /** 获取表单当前绑定的数据行（未绑定时返回 null） */
  getCurrentRow(): DataRow | null
  /** 获取表单当前填写的字段数据（不含主键） */
  getFormData(): Record<string, unknown>
  /** 可选：触发表单校验；返回 false 则执行器中止提交 */
  validate?(): Promise<boolean>}

/**
 * 动作执行作用域：调用方（容器/渲染器）在触发动作时按需挂入。
 *
 * - `row`：行内动作（`target='scope'`）的触发行，由行渲染器注入
 * - `index`：行索引（移动等需要位置信息的动作使用）
 * - `formApi`：仅 submit-current-form 动作需要，由表单容器注入
 */
export type ActionExecutionScope = {
    /** 当前行数据。 */
row?: DataRow
    /** index 字段。 */
index?: number
    /** form Api 字段。 */
formApi?: ActionFormApi}

// ── ActionDescriptor 联合类型（判别联合，14 种动作） ──────────────────────

/**
 * ActionDescriptor 判别联合。
 *
 * 每种动作通过 `action` 字段（字符串字面量）区分，TypeScript 可利用
 * 此字段做详尽的 switch/if 窄化。所有 data-mutating 类型还继承 `ActionUiDecorator`。
 */
export type ActionDescriptor =
  | ShowMessageAction
  | ShowConfirmAction
  | ShowAlertAction
  | NavigateAction
  | OpenAction
  | SetFieldAction
  | AppendRowAction
  | DeleteAction
  | PatchAction
  | MoveAction
  | MessageRowAction
  | RefreshAction
  | ClearRowsAction
  | SubmitCurrentFormAction
  | SaveDataSetAction

/** ActionDescriptor 的统一动作名集合（用于类型约束和穷举检查）。 */
export type ActionDescriptorActionName =
  | 'show-message'
  | 'confirm'
  | 'alert'
  | 'navigate'
  | 'open'
  | 'set-field'
  | 'append-row'
  | 'delete'
  | 'patch'
  | 'move'
  | 'message-row'
  | 'refresh'
  | 'clear-rows'
  | 'submit-current-form'
  | 'save-dataset'

/**
 * 行目标语义：区分动作操作的目标行来源。
 * - `scope`：由行渲染器注入的"当前行"（行内动作默认）
 * - `current`：视图的 `currentRow`（鼠标点击选中的行）
 * - `selected`：视图的 `selectedRows`（复选框勾选的行集合）
 */
export type ActionRowTarget = 'scope' | 'current' | 'selected'

/** 所有 ActionDescriptor 的公共基础字段（不直接使用，通过具体类型继承）。 */
type ActionDescriptorBase = {
  /** 动作标识（判别字段，唯一确定 descriptor 子类型） */
  action: ActionDescriptorActionName
  /** 链式执行：当前动作成功后自动执行下一个 descriptor */
  then?: ActionDescriptor
  /**
   * 取消容器默认行为。
   * 执行器在运行 descriptor 之前会将传入的 `ActionExecutionControl.cancel` 置 true，
   * 通知容器跳过其内置处理逻辑（如内联编辑行确认）。
   */
  cancelDefault?: boolean}

// ── UI 类动作（不涉及数据变更） ──────────────────────────────────────────

/** 展示一条消息通知（不阻塞，立即返回）。 */
export type ShowMessageAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'show-message'
    /** 消息文案（不支持插值） */
    message: string
    /** 消息类型，默认 `'info'` */
    messageType?: PageMessageType}

/** 展示确认对话框（阻塞，等待用户选择后执行对应分支）。 */
export type ShowConfirmAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'confirm'
    /** 确认对话框正文 */
    message: string
    /** 对话框标题 */
    title?: string
    /** 对话框类型 */
    confirmType?: PageMessageType
    /** 用户点击"确认"后执行的子动作 */
    onConfirm?: ActionDescriptor
    /** 用户点击"取消"后执行的子动作 */
    onCancel?: ActionDescriptor}

/** 展示 Alert 对话框（只有"确认"按钮，阻塞）。 */
export type ShowAlertAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'alert'
        /** 用户可读消息。 */
message: string
        /** 显示标题。 */
title?: string}

/** 路由跳转（通过 RouterLike 接口，不直接依赖 vue-router）。 */
export type NavigateAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'navigate'
    /**
     * 目标路径。
     * 支持 `{field}` 从触发事件的 row 插值，例如 `/detail/{id}`。
     */
    path: string}

/** 发射自定义事件，触发容器（如 Drawer/Dialog）打开指定目标。 */
export type OpenAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'open'
    /** 容器标识，由容器的 `name` prop 匹配 */
    target: string}

// ── 字段操作（静默，无 UI 装饰） ─────────────────────────────────────────

/**
 * 静默更新当前行的单个字段，不弹任何消息。
 * 与 patch 的区别：不带 ActionUiDecorator，语义上是"配置驱动的字段赋值"。
 */
export type SetFieldAction = ActionDescriptorBase & {
    /** action 字段。 */
action: 'set-field'
    /** 可选 DataViewKey，省略时使用容器作用域 DataView 的 currentRow */
    dataViewKey?: string
    /** 目标字段名 */
    field: string
    /** 新值 */
    value: unknown
    /** 主键字段名，默认 `'id'` */
    idField?: string}

// ── 数据变更类动作（均继承 ActionUiDecorator） ───────────────────────────

/**
 * Prompt 输入框配置。
 * append-row 和 patch（prompt 模式）动作在执行前弹出输入框让用户填写某个字段。
 */
export type ActionPromptConfig = {
  /** 要写入/更新的字段名 */
  field: string
  /** 输入框正文提示，默认 `请输入{field}` */
  message?: string
  /** 弹窗标题，默认 `新增` 或 `编辑` */
  title?: string
  /** 输入框默认值（append 使用；edit 时由执行器从 row[field] 自动推断） */
  defaultValue?: string
  /** 输入框占位符文案 */
  placeholder?: string}

/** 追加新行动作。 */
export type AppendRowAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'append-row'
    /** 目标 DataViewKey；省略时使用容器作用域 DataView */
    dataViewKey?: string
    /** 新行初始字段值（会与 inheritFields 合并，idField 不足时自动生成） */
    appendPayload?: Record<string, unknown>
    /** 主键字段名，默认 `'id'` */
    idField?: string
    /** 从父行继承的字段名列表（适用于树/子表追加场景） */
    inheritFields?: string[]
    /** 父行字段映射：`{ 新行字段: 父行字段 }`（支持字段重命名） */
    inheritFieldMap?: Record<string, string>
    /** 新增成功后将新行设为 currentRow */
    setCurrentRowOnSuccess?: boolean
    /** Prompt 模式配置；设置后执行器先弹输入框再追加 */
    prompt?: ActionPromptConfig}

/** 删除行动作（支持单行/当前行/选中行批量）。 */
export type DeleteAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'delete'
    /** 删除目标：`scope`=行内当前行，`current`=视图 currentRow，`selected`=批量删除 */
    target: ActionRowTarget
        /** DataView 定位键。 */
dataViewKey?: string
        /** id Field 字段。 */
idField?: string}

/** 更新行字段动作（支持静态 patch、单字段赋值、Prompt 输入三种模式）。 */
export type PatchAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'patch'
        /** 目标对象。 */
target: ActionRowTarget
        /** DataView 定位键。 */
dataViewKey?: string
        /** id Field 字段。 */
idField?: string
    /** 静态 patch 对象（多字段批量赋值，与 field/value 互斥） */
    patch?: Record<string, unknown>
    /** 单字段名（与 value 搭配，优先级低于 patch） */
    field?: string
    /** 单字段新值 */
    value?: unknown
    /** Prompt 模式（仅支持 scope/current，不支持 selected） */
    prompt?: ActionPromptConfig}

/** 移动树节点动作（要求 DataView 是树视图并实现 moveTreeNode API）。 */
export type MoveAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'move'
    /** 移动目标：`scope`=行内当前行，`current`=视图 currentRow */
    target: 'scope' | 'current'
        /** DataView 定位键。 */
dataViewKey?: string
        /** id Field 字段。 */
idField?: string
    /** 静态目标父节点 ID（null 表示移到根节点） */
    newParentId?: string | number | null
    /** 目标父节点来源：`field`=从 row 字段读，`scope`=用 scope.row 作为父节点 */
    targetParentSource?: 'field' | 'scope'
    /** targetParentSource='field' 时读取的字段名 */
    targetParentField?: string
    /** 目标位置索引（可选，不传则追加到末尾） */
    index?: number}

/** 展示行数据消息（适合调试/只读信息场景）。 */
export type MessageRowAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'message-row'
        /** 目标对象。 */
target: 'scope' | 'current'
        /** DataView 定位键。 */
dataViewKey?: string
    /** 自定义消息模板，支持 `{field}` 插值（优先于 messageFields） */
    message?: string
    /** 展示哪些字段（格式：`字段: 值 | 字段: 值`） */
    messageFields?: string[]
    /** 消息类型，默认 `'info'` */
    messageType?: PageMessageType}

/** 刷新数据视图（重新触发远程加载）。 */
export type RefreshAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'refresh'
        /** DataView 定位键。 */
dataViewKey?: string}

/** 清空数据视图的所有行（本地操作，不发远程请求）。 */
export type ClearRowsAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'clear-rows'
        /** DataView 定位键。 */
dataViewKey?: string}

/** 提交当前表单（读取 formApi 数据，调用 editRowById 保存）。 */
export type SubmitCurrentFormAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'submit-current-form'
        /** DataView 定位键。 */
dataViewKey?: string
        /** id Field 字段。 */
idField?: string
    /** 表单校验失败时的提示文案 */
    validateMessage?: string}

/** 提交当前 DataSet 范围内的 staged/editing 变更。 */
export type SaveDataSetAction = ActionDescriptorBase & ActionUiDecorator & {
    /** action 字段。 */
action: 'save-dataset'
scenarioId: string
        /** mode 字段。 */
mode?: DataSetSaveChangesMode
        /** request Id 标识。 */
requestId?: string
        /** request Id Strategy 字段。 */
requestIdStrategy?: 'auto'
        /** apply Editing Rows 字段。 */
applyEditingRows?: boolean
        /** views 字段。 */
views?: DataSetSaveChangesViewSelector[]}

// ── 类型守卫 ──────────────────────────────────────────────────────────────

/**
 * 判断任意值是否为合法的 ActionDescriptor。
 * 只检查结构（非数组对象且有字符串 action 字段），不验证 action 值是否在枚举内。
 * 调用方在 switch 分发时会做穷举窄化，非法 action 会走 default 分支打 warn。
 */
export function isActionDescriptor(value: unknown): value is ActionDescriptor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return 'action' in value && typeof value.action === 'string'
}

// ── 运行时上下文 ──────────────────────────────────────────────────────────

/**
 * 动作执行上下文：执行器与调用方（容器/渲染器）之间的依赖注入接口。
 *
 * 执行器不直接持有 Vue 组件或 DataSet 引用，而是通过此接口的工厂函数按需获取，
 * 从而保持执行器框架无关性并支持懒解析。
 */
export type ActionExecutionContext = {
  /** 获取当前页面的 DataSet 实例（用于 DataViewKey 解析）；页面未就绪时返回 null */
  getDataSet: (scenarioId: string) => DataSetContract | null
  resolveView: (binding: string) => DataView | null
  /**
   * 可选：获取容器作用域 DataView（调用方已确定 DataView 时提供）。
   *
   * 适用于容器明确持有 DataView 的场景（如 r-table 内置按钮），
   * 此时可省略 descriptor 上的 DataViewKey，避免误报"数据视图未就绪"。
   */
  getDataSource?: () => DataView | null
  /** 获取页面服务能力（消息/确认/弹窗等 UI 交互）；未注册时返回 null */
  getPageService: () => PageServiceCapability | null
  /** 获取路由器（navigate 动作使用）；非路由环境返回 null */
  getRouter: () => RouterLike | null}

/**
 * 执行流程控制信号（= CancellableControl）。
 * 执行器在 `cancelDefault: true` 时将 `control.cancel` 置 true，
 * 通知容器跳过其内置处理（例如内联编辑的行确认）。
 */
export type ActionExecutionControl = {
    /** cancel 字段。 */
cancel: CancellableControl['cancel']}

/**
 * 路由器最小接口，隔离对 vue-router 的直接依赖。
 * spark-component 通过能力系统注入具体实现。
 */
export type RouterLike = {
  /** 执行路由跳转；支持路径字符串或带 query 的路径对象，由注入的实现决定实际导航行为（如 vue-router push 或内存跳转） */
  push(to: string | { path: string; query?: Record<string, string> }): unknown}

