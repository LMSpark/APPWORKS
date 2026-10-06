/**
 * @module @spark-appworks/spark-component:page/actions/executor-helpers
 * 职责：提供 executor helpers 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * Action 执行器内部辅助工具集
 *
 * 按功能分区组织，仅供 action-data.ts 和 action-executor.ts 内部使用：
 *
 * 1. 值解析工具    — asRecord / readString / readBoolean 等
 * 2. 文案插值      — interpolate / pickText
 * 3. 行辅助        — isRowLike / resolveRowId / inferNextRowId / resolveRowLabel / getSelectedRows
 * 4. 错误处理      — extractErrorMessage
 * 5. 内置动作 props — readOptionalStringArray / readOptionalMessageType / getActionProps
 * 6. 消息通知器    — ActionNotifier / createActionNotifier
 * 7. 统一确认      — confirmIfNeeded
 * 8. 数据能力解析  — resolveActionDataCapabilities
 * 9. BuiltinAction 元数据 — BUILTIN_ACTION_META / isBuiltinActionName 等
 * 10. ActionDescriptor 禁用判断 — isActionDescriptorDisabled
 */

import {
  isDataRow,
  nodeInputProps,
  type DataView,
  type DataRow,
  type SparkNode,
} from '@spark-appworks/spark-data'
import type { PageMessageType } from '../../components/internal'
import type {
  ActionDescriptor,
  ActionExecutionContext,
  ActionExecutionScope,
  ActionRowTarget,
  ActionUiDecorator,
} from './action-types'
import { Logger } from '@spark-appworks/spark-utils'
import { copyOwnEnumerableProperties } from '@spark-appworks/spark-utils/internal'

const _notifierLogger = Logger('action-executor')

// ── 值解析（轻量基础工具） ──────────────────────────────────────────────────

/**
 * 将任意值安全转为普通对象类型；数组、null、基础类型返回 null。
 * 适用于从 SparkNode props 中读取配置对象（appendPayload、patch 等）。
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return copyOwnEnumerableProperties(value)
}

/**
 * 读取非空字符串值，自动 trim；空字符串或非字符串类型返回 undefined。
 * 用于从 SparkNode props 中读取可选字符串配置（dataViewKey、idField 等）。
 */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

// ── 文案：插值 + 装饰回退 ────────────────────────────────────────────────

const INTERPOLATION = /\{(\w+(?:\.\w+)*)\}/g

/** Pick Action Text Input 的输入数据。 */
export type PickActionTextInput = {
    /** decorator 字段。 */
decorator: ActionUiDecorator | undefined
    /** 定位键。 */
key: keyof ActionUiDecorator
    /** fallback 字段。 */
fallback: string
    /** vars 字段。 */
vars?: Record<string, string | number | undefined>
    /** 当前行数据。 */
row?: DataRow | null}

/**
 * 模板插值：`{count}` `{row.name}` 等。
 * - vars 直接命中 → 用 vars 值
 * - vars 未命中且 row 存在 → 尝试 row[name] 或 row[a.b]
 * - 都没命中 → 保留原始 `{name}`
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | undefined> = {},
  row: DataRow | null = null,
): string {
  return template.replace(INTERPOLATION, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      const v = vars[name]
      return v === undefined ? '' : String(v)
    }
    if (row) {
      const segments = name.split('.')
      let cur: unknown = row
      for (const seg of segments) {
        const record = asRecord(cur)
        if (!record) { cur = undefined; break }
        cur = record[seg]
      }
      if (cur !== undefined && cur !== null) return String(cur)
    }
    return `{${name}}`
  })
}

/**
 * 从 ActionUiDecorator 中读取指定装饰文案并插值；若未配置则使用 fallback。
 *
 * - 显式设置为 `''` 视为有意清空：返回空字符串，调用方据此跳过提示展示。
 * - 调用方负责检查返回值是否为空，再决定是否调用 `notifier.notify()`。
 */
export function pickText(input: PickActionTextInput): string {
  const { decorator, key, fallback, vars, row } = input
  const raw = decorator?.[key]
  if (typeof raw !== 'string') return interpolate(fallback, vars, row ?? null)
  if (raw.length === 0) return ''
  return interpolate(raw, vars, row ?? null)
}

// ── 行辅助工具 ───────────────────────────────────────────────────────────────

/**
 * 判断值是否"类行"：非 null 的普通对象（非数组）。
 * 用于从 eventArgs 中安全识别行数据，避免误判基础类型或数组。
 */
export function isRowLike(value: unknown): value is DataRow {
  return isDataRow(value)
}

/**
 * 安全读取行主键值；主键必须是字符串或数字类型，否则返回 null（fail-fast）。
 * 返回 null 时调用方应报 error 并中止操作，不应使用 0 / '' 作为兜底。
 */
export function resolveRowId(row: DataRow, idField: string): string | number | null {
  const raw = row[idField]
  return typeof raw === 'string' || typeof raw === 'number' ? raw : null
}

/**
 * 为新行生成本地主键值（仅在 appendPayload 未提供 idField 时使用）。
 *
 * 策略（按优先级）：
 * 1. 视图已有数字类型 ID → 取最大值 +1
 * 2. 视图已有字符串 ID → 生成 `row-{timestamp}`，若冲突则自增后缀
 * 3. 视图为空 → 返回 `row-{timestamp}`
 *
 * 注意：此 ID 仅为客户端临时主键，远程持久化后应以服务端 ID 为准。
 */
export function inferNextRowId(view: DataView, idField: string): string | number {
  const numericIds = view.rows
    .map(row => row[idField])
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
  if (numericIds.length > 0) {
    return Math.max(...numericIds) + 1
  }
  const existing = new Set(
    view.rows
      .map(row => row[idField])
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )
  const base = `row-${Date.now()}`
  if (!existing.has(base)) return base
  let index = 1
  let candidate = `${base}-${index}`
  while (existing.has(candidate)) {
    index += 1
    candidate = `${base}-${index}`
  }
  return candidate
}

const ROW_LABEL_CANDIDATES = ['orderNo', 'name', 'title']

/**
 * 从行数据中提取可读的显示标签，用于确认弹窗等人性化提示（如"确认删除 张三 吗？"）。
 * 候选字段顺序：orderNo → name → title → idField；都为空时返回 `'当前记录'`。
 */
export function resolveRowLabel(row: DataRow, idField: string): string {
  for (const key of [...ROW_LABEL_CANDIDATES, idField]) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return '当前记录'
}

/** 获取视图当前选中行的快照副本（浅拷贝数组，防止后续操作影响迭代）。 */
export function getSelectedRows(view: DataView): DataRow[] {
  return view.selectedRows.slice()
}

/**
 * 从任意 error 值中提取可读的错误消息字符串。
 * - Error 实例 → `.message`
 * - 非空字符串 → 直接返回（trim 后）
 * - 其他 → 返回空字符串（调用方自行提供兜底文案）
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error.trim()
  return ''
}

// ── SparkNode props 类型读取工具 ─────────────────────────────────────────────
// 从 SparkNode.props（Record<string,unknown>）中安全提取各类型值，
// 用于 node-to-descriptor.ts 将 props 翻译为强类型 ActionDescriptor 字段。

/** 读取布尔值；非布尔类型返回 undefined（不做隐式转换）。 */
export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * 读取非空字符串数组；过滤掉空字符串。
 * 若 value 不是数组或过滤后为空，返回 undefined 而非空数组（便于条件赋值）。
 */
export function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const filtered = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return filtered.length > 0 ? filtered : undefined
}

/**
 * 读取合法的 PageMessageType 枚举值；非法字符串返回 undefined。
 * 枚举范围：`'success' | 'error' | 'warning' | 'info'`。
 */
export function readOptionalMessageType(value: unknown): PageMessageType | undefined {
  const text = readString(value)
  if (!text) return undefined

  switch (text) {
    case 'success':
    case 'error':
    case 'warning':
    case 'info':
      return text
    default:
      return undefined
  }
}

/** 获取 SparkNode 按钮节点的 input props（props 中非事件绑定的普通属性）。 */
export function getActionProps(action: SparkNode): Record<string, unknown> {
  return nodeInputProps(action)
}

// ── 消息通知器 ────────────────────────────────────────────────────────────

/**
 * 动作执行通知接口（由 createActionNotifier 创建）。
 *
 * - `notify`：受 `silent` 控制，静默模式下吞掉非 error 消息
 * - `notifyError`：始终展示 error（无视 silent），用于运行时异常
 */
export type ActionNotifier = {
  /** 发送成功/警告/info 类型消息；`silent=true` 时静默忽略 */
  notify(type: PageMessageType, message: string): void
  /** 发送 error 消息（无视 silent，始终展示） */
  notifyError(message: string): void}

export function createActionNotifier(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
): ActionNotifier {
  const silent = decorator?.silent === true

  function send(type: PageMessageType, message: string): void {
    if (message.trim().length === 0) return
    const ps = ctx.getPageService()
    if (ps) {
      ps.showMessage(message, type)
      return
    }
    if (import.meta.env.DEV) {
      _notifierLogger.warn(`PAGE_SERVICE 不可用，消息未展示: ${message}`)
    }
  }

  return {
    notify(type, message) {
      if (silent) return
      send(type, message)
    },
    notifyError(message) {
      send('error', message)
    },
  }
}

/**
 * 统一确认弹窗：返回 true 表示用户确认或无需确认（直通）。
 *
 * 直通条件（跳过弹窗）：
 * - `pageService` 不可用
 * - `confirmMessage` 显式设为 `''`（有意取消确认）
 * - `confirmMessage` 未设置且 `fallbackMessage` 为空字符串
 *
 * `fallbackMessage` 为内置默认确认语（如"确认删除 XX 吗？"），由调用方构造。
 */
export type ConfirmationInput = Readonly<{
  /** 确认弹窗正文的内置兜底文案（如"确认删除 张三 吗？"），decorator.confirmMessage 未设置时使用 */
  fallbackMessage: string
  /** 确认弹窗标题的内置兜底文案（如"操作确认"），decorator.confirmTitle 未设置时使用 */
  fallbackTitle: string
}>

export async function confirmIfNeeded(
  ctx: ActionExecutionContext,
  decorator: ActionUiDecorator | undefined,
  input: ConfirmationInput,
): Promise<boolean> {
  const { fallbackMessage, fallbackTitle } = input
  const ps = ctx.getPageService()
  if (!ps) return true

  const rawMessage = decorator?.confirmMessage
  if (rawMessage === '') return true
  const message = rawMessage ?? fallbackMessage
  if (message.trim().length === 0) return true

  const title = decorator?.confirmTitle ?? fallbackTitle
  const opts: { type?: PageMessageType } = {}
  if (decorator?.confirmType) opts.type = decorator.confirmType
  return await ps.showConfirm(message, title, opts)
}

// ── 数据能力解析 ──────────────────────────────────────────────────────────

/**
 * 数据能力解析结果：执行器从此结构中读取操作目标。
 */
export type ResolvedActionDataCapabilities = {
  /** 解析到的目标 DataView；未就绪时为 null */
  dataSource: DataView | null
  /** DataView 当前行（currentRow）；无当前行时为 null */
  currentRow: DataRow | null
  /** DataView 当前选中行列表（快照副本） */
  selectedRows: DataRow[]}

/**
 * 根据 dataViewKey 和执行上下文解析数据能力三元组。
 *
 * 解析优先级：
 * 1. 无 dataViewKey → 使用 `ctx.getDataSource()` 作用域 DataView（容器注入）
 * 2. 有 dataViewKey → 从 DataSet 查找所属 DataView
 *
 * 任何环节不满足都返回全 null/空 的空结果，调用方负责 fail-fast。
 */
export function resolveActionDataCapabilities(
  dataViewKey: string | undefined,
  ctx: ActionExecutionContext,
): ResolvedActionDataCapabilities {
  const empty: ResolvedActionDataCapabilities = { dataSource: null, currentRow: null, selectedRows: [] }
  const scopedView = ctx.getDataSource?.() ?? null

  if (dataViewKey === undefined) {
    if (!scopedView) return empty
    return {
      dataSource: scopedView,
      currentRow: isRowLike(scopedView.currentRow) ? scopedView.currentRow : null,
      selectedRows: getSelectedRows(scopedView),
    }
  }

  const dataSource = ctx.resolveView(dataViewKey)
  if (!dataSource) return empty

  return {
    dataSource,
    currentRow: isRowLike(dataSource.currentRow) ? dataSource.currentRow : null,
    selectedRows: getSelectedRows(dataSource),
  }
}

// ── BuiltinAction 元数据注册表 ──────────────────────────────────────────────
// 内置动作名称枚举 + 默认标签，是 node-to-descriptor.ts 和 button-templates.ts 的共同来源。
// 新增 BuiltinAction 时在此注册，TypeScript 会自动推断 BuiltinActionName 联合类型。

type BuiltinActionMeta = {
  /** 动作的默认按钮标签（可被 r-button 的 label prop 覆盖） */
  label: string}

export const BUILTIN_ACTION_META = {
  'append-row': { label: '新增' },
  'prompt-append': { label: '新增' },
  'prompt-edit': { label: '编辑' },
  'submit-current-form': { label: '保存当前' },
  'clear-rows': { label: '清空' },
  'move-row': { label: '移动' },
  'move-current': { label: '移动当前' },
  'refresh': { label: '刷新' },
  'delete-row': { label: '删除' },
  'delete-current': { label: '删除当前' },
  'delete-selected': { label: '删除选择' },
  'patch-row': { label: '更新' },
  'patch-current': { label: '更新当前' },
  'patch-selected': { label: '批量更新' },
  'message-row': { label: '查看' },
  'message-current': { label: '查看当前' },
  'save-dataset': { label: '保存全部' },
} satisfies Record<string, BuiltinActionMeta>

/** Builtin Action Name 的语义模型。 */
export type BuiltinActionName = keyof typeof BUILTIN_ACTION_META

/** 判断字符串是否为已注册的内置动作名（BuiltinActionName 类型守卫）。 */
export function isBuiltinActionName(value: string): value is BuiltinActionName {
  return value in BUILTIN_ACTION_META
}

/** 通过动作名直接获取默认标签（已知类型，无需 SparkNode）。 */
export function getBuiltinActionLabelByName(name: BuiltinActionName): string {
  return BUILTIN_ACTION_META[name].label
}

/**
 * 从 SparkNode（r-button 等）的 `action` prop 中读取并验证内置动作名。
 * 非内置动作名（如自定义 onClick）返回 null，由调用方走 onClick 路径。
 */
export function getBuiltinActionName(action: SparkNode): BuiltinActionName | null {
  const propsMap = nodeInputProps(action)
  const actionName = readString(propsMap['action'])
  if (!actionName) return null
  return isBuiltinActionName(actionName) ? actionName : null
}

/** 判断 SparkNode 是否声明了内置 action（快捷布尔判断）。 */
export function isBuiltinAction(action: SparkNode): boolean {
  return getBuiltinActionName(action) !== null
}

/**
 * 获取 SparkNode（r-button）的按钮显示标签：
 * 1. 优先使用 `label` prop（用户显式配置）
 * 2. 降级到内置动作默认标签
 * 3. 非内置动作且无 label → 返回 `'执行'`
 */
export function getBuiltinActionLabel(action: SparkNode): string {
  const propsMap = nodeInputProps(action)
  const explicit = readString(propsMap['label'])
  if (explicit) return explicit

  const actionName = getBuiltinActionName(action)
  if (!actionName) return '执行'
  return getBuiltinActionLabelByName(actionName)
}

// ── ActionDescriptor 语义禁用判断 ─────────────────────────────────────────
// 根据动作类型和当前数据状态推断按钮是否应禁用。
// 渲染器在 r-button 等组件中调用此函数驱动 `disabled` prop，
// 实现"无选中行时删除按钮禁用"等零代码交互。

/**
 * 将字段值规范化后用于比较：空字符串和 null/undefined 都视为"无值"。
 * 避免 disabledWhenRow 中 `{ status: null }` 与 `{ status: '' }` 语义不一致。
 */
function _normalizeComparable(value: unknown): unknown {
  if (value === '') return null
  return value ?? null
}

/** 判断行数据是否满足禁用条件（所有字段全部相等才匹配）。 */
function _matchesRowCondition(
  row: DataRow | null | undefined,
  condition: Record<string, unknown>,
): boolean {
  if (!row) return false
  for (const [field, expected] of Object.entries(condition)) {
    if (_normalizeComparable(row[field]) !== _normalizeComparable(expected)) return false
  }
  return true
}

function _targetRows(
  descriptor: Extract<ActionDescriptor, { target: ActionRowTarget }>,
  view: DataView,
  scope: ActionExecutionScope | undefined,
): DataRow[] {
  if (descriptor.target === 'scope') return scope?.row ? [scope.row] : []
  if (descriptor.target === 'current') return view.currentRow ? [view.currentRow] : []
  return getSelectedRows(view)
}

function _patchFields(descriptor: Extract<ActionDescriptor, { action: 'patch' }>): string[] {
  const fields = new Set(Object.keys(descriptor.patch ?? {}))
  if (descriptor.field) fields.add(descriptor.field)
  if (descriptor.prompt?.field) fields.add(descriptor.prompt.field)
  return [...fields]
}

function _canEditFields(view: DataView, row: DataRow, fields: readonly string[]): boolean {
  return view.editActionState(row) === 'enabled'
    && fields.every(field => view.fieldAccess(row, field).write === 'allowed')
}

export type DataViewSavePermissionInput = Readonly<{
  view: DataView
  ids?: ReadonlyArray<string | number>
  applyEditingRows?: boolean
}>

export function createDataViewSavePermissionInput(
  view: DataView,
  ids: ReadonlyArray<string | number> | undefined,
  applyEditingRows: boolean | undefined,
): DataViewSavePermissionInput {
  const input: { view: DataView; ids?: ReadonlyArray<string | number>; applyEditingRows?: boolean } = { view }
  if (ids !== undefined) input.ids = ids
  if (applyEditingRows !== undefined) input.applyEditingRows = applyEditingRows
  return input
}

/**
 * 按 DataView 同次查询的集中权限入口呈现实际待提交操作的可用状态。
 * 所有目标操作必须同时可用；不读取公开行权限或旧快照，真正接纳仍由后端验证。
 */
export function isDataViewSavePermitted(input: DataViewSavePermissionInput): boolean {
  const { view } = input
  const allowedIds = input.ids ? new Set(input.ids) : null
  const includesId = (id: string | number): boolean => allowedIds === null || allowedIds.has(id)

  if (input.applyEditingRows !== false) {
    for (const row of view.editingRows) {
      const id = view.getPkKey(row)
      if (id === undefined || !includesId(id)) continue
      const patch = view.getEditingPatch(id)
      if (!patch || !_canEditFields(view, row, Object.keys(patch))) return false
    }
  }

  for (const id of view.dirtyTracking.pendingCreateIds) {
    if (includesId(id) && view.addActionState() !== 'enabled') return false
  }

  for (const id of view.dirtyTracking.dirtyRowIds) {
    if (!includesId(id)) continue
    const row = view.rows.find(candidate => view.getPkKey(candidate) === id)
    const fields = Object.keys(view.getDirtyChanges(id))
    if (!row || fields.length === 0 || !_canEditFields(view, row, fields)) return false
  }

  for (const id of view.dirtyTracking.pendingDeleteIds) {
    if (!includesId(id)) continue
    const row = view.dirtyTracking.getPendingDeleteSnapshot(id)
    if (!row || view.deleteActionState(row) !== 'enabled') return false
  }

  return true
}

/**
 * 判断一个声明式动作在当前视图和行作用域中是否获得后端最终权限。
 * UI 动作与只读刷新不制造数据 mutation；所有数据 mutation 均失败关闭。
 */
export function isActionDescriptorPermitted(
  descriptor: ActionDescriptor,
  view: DataView | null | undefined,
  scope?: ActionExecutionScope,
): boolean {
  switch (descriptor.action) {
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'message-row':
    case 'refresh':
      return true
    case 'set-field': {
      const row = view?.currentRow
      return row !== null && row !== undefined && view?.fieldAccess(row, descriptor.field).write === 'allowed'
    }
    case 'append-row':
      return view?.addActionState() === 'enabled'
    case 'delete': {
      if (!view) return false
      const rows = _targetRows(descriptor, view, scope)
      return rows.length > 0 && rows.every(row => view.deleteActionState(row) === 'enabled')
    }
    case 'patch': {
      if (!view) return false
      const rows = _targetRows(descriptor, view, scope)
      const fields = _patchFields(descriptor)
      return rows.length > 0 && fields.length > 0 && rows.every(row => _canEditFields(view, row, fields))
    }
    case 'move': {
      if (!view) return false
      const rows = _targetRows(descriptor, view, scope)
      return rows.length > 0 && rows.every(row => view.editActionState(row) === 'enabled')
    }
    case 'clear-rows':
      return view !== null && view !== undefined
        && view.rows.length > 0
        && view.rows.every(row => view.deleteActionState(row) === 'enabled')
    case 'submit-current-form': {
      if (!view) return false
      const row = scope?.formApi?.getCurrentRow() ?? view.currentRow
      if (!row) return false
      const draft = scope?.formApi?.getFormData()
      const idField = descriptor.idField ?? view.primaryKey
      const fields = draft
        ? Object.entries(draft)
          .filter(([field, value]) => (
            field !== idField
            && field !== '_pk'
            && !field.startsWith('lingma_sys_')
            && !Object.is(row[field], value)
          ))
          .map(([field]) => field)
        : []
      return fields.length > 0 && _canEditFields(view, row, fields)
    }
    case 'save-dataset':
      return view !== null && view !== undefined && isDataViewSavePermitted(
        createDataViewSavePermissionInput(view, undefined, descriptor.applyEditingRows),
      )
    default:
      return false
  }
}

/**
 * 根据 descriptor 动作语义、DataView 当前状态及执行作用域，判断按钮是否应禁用。
 *
 * 禁用规则（优先级从高到低）：
 * 1. `disabledWhenRow` 条件匹配 scope.row 或 currentRow → 禁用
 * 2. 动作语义规则：
 *    - `clear-rows` → 视图行数为 0
 *    - `submit-current-form` → currentRow 为 null
 *    - `delete/patch/message-row` scope/current/selected 分别检查对应数据
 *    - `move` scope/current 分别检查
 *    - 其余动作（show-message/navigate/append-row 等）→ 始终不禁用
 */
export function isActionDescriptorDisabled(
  descriptor: ActionDescriptor,
  view: DataView | null | undefined,
  scope?: ActionExecutionScope,
): boolean {
  if (!isActionDescriptorPermitted(descriptor, view, scope)) return true
  if (!view) return false

  const disabledWhenRow = 'disabledWhenRow' in descriptor ? descriptor.disabledWhenRow : undefined
  if (disabledWhenRow) {
    const checkRow = scope?.row ?? view.currentRow ?? null
    if (_matchesRowCondition(checkRow, disabledWhenRow)) return true
  }

  switch (descriptor.action) {
    case 'show-message':
    case 'confirm':
    case 'alert':
    case 'navigate':
    case 'open':
    case 'refresh':
      return false

    case 'set-field':
    case 'append-row':
    case 'save-dataset':
      return false

    case 'clear-rows':
      return view.rows.length === 0

    case 'submit-current-form':
      return view.currentRow === null

    case 'delete':
    case 'patch':
    case 'message-row': {
      const { target } = descriptor
      if (target === 'scope') return scope?.row === undefined
      if (target === 'current') return view.currentRow === null
      return getSelectedRows(view).length === 0
    }

    case 'move': {
      const { target } = descriptor
      if (target === 'scope') return scope?.row === undefined
      return view.currentRow === null
    }

    default:
      return false
  }
}
