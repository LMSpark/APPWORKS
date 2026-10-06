/**
 * @module @spark-appworks/spark-component:page/actions/action-data
 * 职责：提供 action data 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 数据变更动作执行器
 *
 * 负责执行所有涉及 DataView CRUD 操作的动作描述符：
 * append-row / delete / patch / move / message-row / refresh / clear-rows / set-field / submit-current-form
 *
 * 单一真源：BuiltinAction（内置按钮）与 bind-normalize（on 事件）均通过此模块执行。
 *
 * ## 公共约定
 * - 每个执行器首先通过 `ensureView` 确保 DataView 就绪，否则 fail-fast 返回
 * - 批量操作（selected）使用 `for...of` 逐行调用 CRUD，汇总成功数量
 * - UI 消息通过 `ActionNotifier` 统一发送，`silent=true` 时自动吞掉成功/警告消息
 * - `confirmIfNeeded` 实现统一确认弹窗，`confirmMessage=''` 表示有意跳过确认
 */

import type { DataView, DataRow, CrudResult, DataSetSaveChangesOptions } from '@spark-appworks/spark-data'
import type {
  ActionExecutionContext,
  ActionExecutionScope,
  ActionRowTarget,
  ActionUiDecorator,
  AppendRowAction,
  ClearRowsAction,
  DeleteAction,
  MessageRowAction,
  MoveAction,
  PatchAction,
  RefreshAction,
  SaveDataSetAction,
  SetFieldAction,
  SubmitCurrentFormAction,
} from './action-types'
import {
  inferNextRowId,
  resolveRowId,
  resolveRowLabel,
  getSelectedRows,
  interpolate,
  asRecord,
  resolveActionDataCapabilities,
  confirmIfNeeded,
  createActionNotifier,
  type ActionNotifier,
} from './executor-helpers'
import { isCrudResult, isCrudSuccess, getCrudErrorMessage } from '../../components/containers/support/crud-result-helpers.js'

// ── 目标行解析 ────────────────────────────────────────────────────────────

/** 目标行解析结果：单行操作用 primary，批量操作用 rows。 */
type TargetRows = {
  /** 操作目标行列表 */
  rows: DataRow[]
  /**
   * 单行场景（scope/current）的代表行；
   * selected 批量场景时为 null（直接迭代 rows）
   */
  primary: DataRow | null}

type AppendOperation = {
  view: DataView
  payload: Record<string, unknown>
  idField: string
  desc: AppendRowAction
  notifier: ActionNotifier}

type UpdateOperation = {
  view: DataView
  id: string | number
  patch: Partial<DataRow>
  decorator: ActionUiDecorator
  notifier: ActionNotifier
  successFallback: string
  failureFallback: string}

/**
 * 按 target 语义从 DataView 和执行作用域中解析操作目标行。
 * - `scope`：使用 scope.row（行内动作注入的当前行）
 * - `current`：使用 view.currentRow（视图当前选中行）
 * - `selected`：使用 view.selectedRows（复选框勾选的行集合）
 */
function resolveTargetRows(
  view: DataView,
  target: ActionRowTarget,
  scope: ActionExecutionScope | undefined,
): TargetRows {
  if (target === 'scope') {
    const row = scope?.row ?? null
    return { rows: row ? [row] : [], primary: row }
  }
  if (target === 'current') {
    const row = view.currentRow ?? null
    return { rows: row ? [row] : [], primary: row }
  }
  // selected
  return { rows: getSelectedRows(view), primary: null }
}

/** 当目标行为空时的标准警告文案（区分 selected 批量和单行场景）。 */
function targetEmptyFallback(target: ActionRowTarget): string {
  return target === 'selected' ? '请先选择记录' : '请先选择当前行'
}

function canRefreshRemoteList(view: DataView): boolean {
  const table = view.dataTable
  return table?.resourceType !== 'static-data' && table?.api?.list !== undefined
}

// ── DataView 就绪保护 ─────────────────────────────────────────────────────

/**
 * 确保 DataView 就绪并返回；不就绪时发出警告并返回 null（fail-fast 前置守卫）。
 *
 * 优先从 ctx.getDataSource() 获取作用域 DataView（容器注入），
 * 若无 dataSource 则通过 resolveActionDataCapabilities 按 dataViewKey 解析。
 * 未就绪时发出 `emptyMessage`（默认"数据视图未就绪"）警告并返回 null。
 */
function ensureView(
  desc: { dataViewKey?: string } & ActionUiDecorator,
  ctx: ActionExecutionContext,
  notifier: ActionNotifier,
): DataView | null {
  const { dataSource } = resolveActionDataCapabilities(desc.dataViewKey, ctx)
  if (!dataSource) {
    const fallback = desc.emptyMessage ?? '数据视图未就绪'
    if (fallback.length > 0) notifier.notify('warning', fallback)
    return null
  }
  return dataSource
}

// ── append-row 辅助 ──────────────────────────────────────────────────────

/**
 * 将父行（scope.row）的指定字段值合并到 payload 中，实现父行字段继承。
 *
 * - `inheritFields`：直接复制同名字段（如将父行 deptId 继承给子行）
 * - `inheritFieldMap`：重命名复制（如 `{ childParentId: 'id' }` 将父行 id 赋给子行 childParentId）
 *
 * 若 scope.row 不存在（非行内动作触发）则直接返回原 payload，不修改。
 */
type InheritFieldInput = Readonly<{
  payload: Record<string, unknown>,
  scope: ActionExecutionScope | undefined,
  inheritFields: string[] | undefined,
  inheritFieldMap: Record<string, string> | undefined
}>

function applyInheritFields(input: InheritFieldInput): Record<string, unknown> {
  const { payload, scope, inheritFields, inheritFieldMap } = input
  const scopeRow = scope?.row
  if (!scopeRow) return payload
  if (inheritFields) {
    for (const field of inheritFields) {
      if (scopeRow[field] !== undefined) payload[field] = scopeRow[field]
    }
  }
  if (inheritFieldMap) {
    for (const [target, source] of Object.entries(inheritFieldMap)) {
      if (typeof source !== 'string' || source.trim().length === 0) continue
      const v = scopeRow[source]
      if (v !== undefined) payload[target] = v
    }
  }
  return payload
}

/**
 * 从 CRUD 结果中提取实际的行数据。
 * - CrudResult<DataRow>：取 result.data（失败时返回 null）
 * - 直接是 DataRow：直接返回
 */
function resolveCreatedRow(result: DataRow | CrudResult<DataRow>): DataRow | null {
  if (isCrudResult(result)) return result.success && result.data ? result.data : null
  return result
}

// ── append-row 执行器 ────────────────────────────────────────────────────

/**
 * 执行新增行动作。
 *
 * 执行流程：
 * 1. 确保 DataView 就绪
 * 2. 若配置了 prompt，先弹输入框由用户填写指定字段
 * 3. 合并 appendPayload + inheritFields/inheritFieldMap
 * 4. 自动补充 idField（若未提供则用 inferNextRowId 生成）
 * 5. 调用 view.addRow()，根据结果展示成功/失败消息
 * 6. 若 setCurrentRowOnSuccess=true，将新行设为当前行
 */
export async function executeAppendRow(
  desc: AppendRowAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const idField = desc.idField ?? view.primaryKey

  // prompt 模式：弹窗输入字段值后再追加
  if (desc.prompt) {
    const ps = ctx.getPageService()
    if (!ps) return
    const promptOpts: { defaultValue?: string; placeholder?: string } = {}
    if (desc.prompt.defaultValue !== undefined) promptOpts.defaultValue = desc.prompt.defaultValue
    if (desc.prompt.placeholder !== undefined) promptOpts.placeholder = desc.prompt.placeholder
    const result = await ps.showPrompt(
      desc.prompt.message ?? `请输入${desc.prompt.field}`,
      desc.prompt.title ?? '新增',
      promptOpts,
    )
    if (result === null) return

    const payload = applyInheritFields({
      payload: { ...(desc.appendPayload ?? {}) },
      scope,
      inheritFields: desc.inheritFields,
      inheritFieldMap: desc.inheritFieldMap,
    })
    payload[desc.prompt.field] = result
    await doAppend({ view, payload, idField, desc, notifier })
    return
  }

  const payload = applyInheritFields({
    payload: { ...(desc.appendPayload ?? {}) },
    scope,
    inheritFields: desc.inheritFields,
    inheritFieldMap: desc.inheritFieldMap,
  })
  await doAppend({ view, payload, idField, desc, notifier })
}

/**
 * doAppend 内部实现：补充 idField + 调用 view.addRow() + 处理结果。
 * 从 executeAppendRow 中分离，方便 prompt 模式和普通模式复用。
 */
async function doAppend(operation: AppendOperation): Promise<void> {
  const { view, payload, idField, desc, notifier } = operation
  if (view.dataSet?.scenarioId === undefined && (!(idField in payload) || payload[idField] === undefined || payload[idField] === null)) {
    payload[idField] = inferNextRowId(view, idField)
  }
  const result = await view.addRow(payload)
  if (isCrudResult(result) && !result.success) {
    notifier.notify('warning', desc.failureMessage
      ? interpolate(desc.failureMessage, {}, null)
      : getCrudErrorMessage(result, '新增失败'))
    return
  }

  const created = resolveCreatedRow(result)
  if (desc.setCurrentRowOnSuccess === true && created) {
    const id = resolveRowId(created, idField)
    if (id !== null) view.setCurrentRowById(id)
    else view.setCurrentRow(created)
  }
  notifier.notify('success', desc.successMessage ?? '新增成功')
}

// ── delete 执行器 ────────────────────────────────────────────────────────

/**
 * 执行删除行动作。
 *
 * 两种分支：
 * - `selected` 批量删除：显示确认弹窗（文案含 {count} 插值）→ 逐行调用 removeRow → 汇报成功数
 * - `scope/current` 单行删除：显示含行标签的确认弹窗 → 调用 removeRow → 处理结果
 */
export async function executeDelete(
  desc: DeleteAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const { rows, primary } = resolveTargetRows(view, desc.target, scope)
  if (rows.length === 0) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? view.primaryKey
  const count = rows.length

  if (desc.target === 'selected') {
    const decoratorOverride: ActionUiDecorator = { ...desc }
    if (desc.confirmMessage !== undefined) {
      decoratorOverride.confirmMessage = interpolate(desc.confirmMessage, { count }, null)
    }
    const allowed = await confirmIfNeeded(ctx, decoratorOverride, {
      fallbackMessage: `确认删除已选择的 ${count} 条记录吗？`,
      fallbackTitle: desc.confirmTitle ?? '批量删除确认',
    })
    if (!allowed) return

    let removed = 0
    for (const row of rows) {
      const id = resolveRowId(row, idField)
      if (id === null) continue
      const r = await view.removeRow(id)
      if (isCrudSuccess(r)) removed += 1
    }
    if (removed > 0) {
      notifier.notify(
        'success',
        desc.successMessage
          ? interpolate(desc.successMessage, { count: removed }, null)
          : `已删除 ${removed} 条记录`,
      )
    } else {
      notifier.notify('warning', desc.failureMessage ?? '未删除任何记录')
    }
    return
  }

  // single row (scope / current)
  const row = primary
  if (!row) return
  const label = resolveRowLabel(row, idField)
  const allowed = await confirmIfNeeded(ctx, desc, {
    fallbackMessage: `确认删除 ${label} 吗？`,
    fallbackTitle: desc.confirmTitle ?? '删除确认',
  })
  if (!allowed) return

  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }
  const result = await view.removeRow(id)
  if (isCrudSuccess(result)) {
    notifier.notify('success', desc.successMessage ?? `已删除 ${label}`)
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, desc.failureMessage ?? '删除失败：记录不存在或已删除')
      : (desc.failureMessage ?? '删除失败：记录不存在或已删除'),
  )
}

// ── patch 执行器 ─────────────────────────────────────────────────────────

/** 合并 desc.patch 和 desc.field/value 为统一的 patch 对象。 */
function resolveStaticPatch(desc: PatchAction): Partial<DataRow> {
  const out: Record<string, unknown> = { ...(desc.patch ?? {}) }
  if (desc.field !== undefined) out[desc.field] = desc.value
  return out
}

/**
 * 执行更新行字段动作。
 *
 * 三种模式：
 * 1. `prompt` 模式（仅 scope/current）：弹输入框，用当前字段值作为 defaultValue
 * 2. `selected` 批量更新：逐行调用 editRowById，汇报成功数
 * 3. `scope/current` 单行更新：调用 editRowById，处理 CrudResult
 */
export async function executePatch(
  desc: PatchAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const { rows, primary } = resolveTargetRows(view, desc.target, scope)
  if (rows.length === 0) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? view.primaryKey

  // prompt 模式：弹窗输入字段值
  if (desc.prompt) {
    if (desc.target === 'selected') {
      notifier.notifyError('prompt 模式不支持 selected target')
      return
    }
    const row = primary
    if (!row) return
    const ps = ctx.getPageService()
    if (!ps) return
    const id = resolveRowId(row, idField)
    if (id === null) {
      notifier.notifyError(`当前行缺少主键字段: ${idField}`)
      return
    }
    const currentVal = row[desc.prompt.field]
    const defaultVal = typeof currentVal === 'string'
      ? currentVal
      : (typeof currentVal === 'number' ? String(currentVal) : '')
    const promptOpts: { defaultValue: string; placeholder?: string } = { defaultValue: defaultVal }
    if (desc.prompt.placeholder !== undefined) promptOpts.placeholder = desc.prompt.placeholder
    const result = await ps.showPrompt(
      desc.prompt.message ?? `请输入${desc.prompt.field}`,
      desc.prompt.title ?? '编辑',
      promptOpts,
    )
    if (result === null) return
    await doUpdate({
      view,
      id,
      patch: { [desc.prompt.field]: result },
      decorator: desc,
      notifier,
      successFallback: '更新成功',
      failureFallback: '更新失败',
    })
    return
  }

  const patch = resolveStaticPatch(desc)
  if (Object.keys(patch).length === 0) {
    notifier.notify('warning', '缺少 patch/field 配置，无法更新')
    return
  }

  if (desc.target === 'selected') {
    let updated = 0
    for (const row of rows) {
      const id = resolveRowId(row, idField)
      if (id === null) continue
      const r = await view.editRowById(id, patch)
      if (isCrudSuccess(r)) updated += 1
    }
    if (updated > 0) {
      notifier.notify(
        'success',
        desc.successMessage
          ? interpolate(desc.successMessage, { count: updated }, null)
          : `已更新 ${updated} 条记录`,
      )
    } else {
      notifier.notify('warning', desc.failureMessage ?? '未更新任何记录')
    }
    return
  }

  const row = primary
  if (!row) return
  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }
  await doUpdate({
    view,
    id,
    patch,
    decorator: desc,
    notifier,
    successFallback: '更新成功',
    failureFallback: '更新失败：记录不存在或已删除',
  })
}

/** doUpdate 内部实现：调用 editRowById 并统一处理成功/失败消息。 */
async function doUpdate(operation: UpdateOperation): Promise<void> {
  const { view, id, patch, decorator, notifier, successFallback, failureFallback } = operation
  const result = await view.editRowById(id, patch)
  if (isCrudSuccess(result)) {
    notifier.notify('success', decorator.successMessage ?? successFallback)
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, decorator.failureMessage ?? failureFallback)
      : (decorator.failureMessage ?? failureFallback),
  )
}

// ── move 执行器（树节点移动） ─────────────────────────────────────────────

/**
 * 解析移动目标的新父节点 ID。
 *
 * 优先级：
 * 1. `newParentId` 静态值（含 null，表示移到根节点）
 * 2. `targetParentSource='field'`：从 scope.row 或 currentRow 的指定字段读取
 * 3. `targetParentSource='scope'`：使用 scope.row 的主键作为目标父 ID
 * 4. 默认：使用 view.currentRow 的主键
 */
type MoveTargetParentInput = Readonly<{
  view: DataView,
  desc: MoveAction,
  scope: ActionExecutionScope | undefined,
  idField: string
}>

function resolveMoveTargetParentId(input: MoveTargetParentInput): string | number | null {
  const { view, desc, scope, idField } = input
  if (Object.prototype.hasOwnProperty.call(desc, 'newParentId')) {
    const literal = desc.newParentId
    return typeof literal === 'string' || typeof literal === 'number' ? literal : null
  }
  if (desc.targetParentSource === 'field') {
    const field = desc.targetParentField
    const row = scope?.row ?? view.currentRow
    if (!field || !row) return null
    const v = row[field]
    return typeof v === 'string' || typeof v === 'number' ? v : null
  }
  if (desc.targetParentSource === 'scope') {
    return scope?.row ? resolveRowId(scope.row, idField) : null
  }
  return view.currentRow ? resolveRowId(view.currentRow, idField) : null
}

/**
 * 执行树节点移动动作。
 *
 * 要求 DataView 实现了 `moveTreeNode(nodeId, newParentId, index?)` 方法，
 * 否则发出警告并返回（不抛异常）。
 * 目标父节点 ID 由 resolveMoveTargetParentId 根据配置解析。
 */
export async function executeMove(
  desc: MoveAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const row = desc.target === 'scope' ? scope?.row : view.currentRow
  if (!row) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const idField = desc.idField ?? view.primaryKey
  const id = resolveRowId(row, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }

  const newParentId = resolveMoveTargetParentId({ view, desc, scope, idField })
  await view.moveTreeNode(id, newParentId, desc.index)
  notifier.notify('success', desc.successMessage ?? '移动成功')
}

// ── message-row 执行器 ───────────────────────────────────────────────────

/**
 * 执行展示行数据消息动作（只读，不修改数据）。
 *
 * 消息文案优先级：
 * 1. `desc.message` + `{field}` 插值
 * 2. `desc.messageFields` 列举字段（格式：`字段: 值 | 字段: 值`）
 * 3. 自动取行数据前 6 个字段的 JSON 快照（调试用）
 */
export function executeMessageRow(
  desc: MessageRowAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): void {
  const notifier = createActionNotifier(ctx, desc)
  const { dataSource } = resolveActionDataCapabilities(desc.dataViewKey, ctx)
  if (!dataSource) {
    if (desc.emptyMessage) notifier.notify('warning', desc.emptyMessage)
    return
  }

  const row = desc.target === 'scope' ? scope?.row : dataSource.currentRow
  if (!row) {
    notifier.notify('warning', targetEmptyFallback(desc.target))
    return
  }

  const text = formatRowMessage(dataSource, row, desc)
  notifier.notify(desc.messageType ?? 'info', text)
}

function formatRowMessage(view: DataView, row: DataRow, desc: MessageRowAction): string {
  const permittedRow = permissionSafeMessageRow(view, row)
  if (desc.message) return interpolate(desc.message, {}, permittedRow)
  if (desc.messageFields && desc.messageFields.length > 0) {
    return desc.messageFields
      .filter(field => !field.startsWith('lingma_sys_') && view.fieldAccess(row, field).read !== 'invisible')
      .map(field => `${field}: ${permittedRow[field] ?? '-'}`)
      .join(' | ')
  }
  const compact = Object.fromEntries(
    Object.entries(permittedRow)
      .filter(([field]) => !field.startsWith('lingma_sys_') && permittedRow[field] !== '')
      .slice(0, 6),
  )
  return JSON.stringify(compact)
}

function permissionSafeMessageRow(view: DataView, row: DataRow): DataRow {
  const permitted: DataRow = {}
  for (const [field, value] of Object.entries(row)) {
    if (field.startsWith('lingma_sys_')) continue
    const read = view.fieldAccess(row, field).read
    if (read === 'invisible') {
      permitted[field] = ''
    } else if (read === 'masked') {
      permitted[field] = '••••'
    } else {
      permitted[field] = value
    }
  }
  return permitted
}

// ── refresh / clear-rows 执行器 ───────────────────────────────────────────

/**
 * 执行刷新数据视图动作：调用 `view.refresh()` 重新加载远程数据。
 * 适用于用户手动刷新或条件变化后需要重新加载的场景。
 */
export async function executeRefresh(
  desc: RefreshAction,
  ctx: ActionExecutionContext,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  if (!canRefreshRemoteList(view)) return

  await view.refresh()
  notifier.notify('success', desc.successMessage ?? '刷新完成')
}

/**
 * 执行清空行列表动作：替换为空数组，同步清除 currentRow 和 selectedRows。
 * 为本地操作，不发送远程删除请求；常用于"重新选择"等交互场景。
 */
export async function executeClearRows(
  desc: ClearRowsAction,
  ctx: ActionExecutionContext,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const view = ensureView(desc, ctx, notifier)
  if (!view) return

  const allowed = await confirmIfNeeded(ctx, desc, {
    fallbackMessage: '确认清空当前列表吗？',
    fallbackTitle: desc.confirmTitle ?? '清空确认',
  })
  if (!allowed) return

  view.replaceRows([])
  view.selection.setCurrentRow(null)
  view.selection.clearSelectedRows()
  notifier.notify('success', desc.successMessage ?? '已清空当前列表')
}

// ── set-field 执行器（静默字段赋值） ────────────────────────────────────

/**
 * 静默更新当前行的单个字段值，不弹任何成功/失败消息。
 *
 * 与 patch 的区别：set-field 无 ActionUiDecorator，语义是"配置驱动的字段联动赋值"，
 * 适用于表单字段变化时自动更新其他字段的零代码交互。
 * 操作失败（无 currentRow 或无 idField）时静默返回，不上报错误。
 */
export async function executeSetField(desc: SetFieldAction, ctx: ActionExecutionContext): Promise<void> {
  const { dataSource, currentRow } = resolveActionDataCapabilities(desc.dataViewKey, ctx)
  if (!dataSource || !currentRow) return
  const idField = desc.idField ?? dataSource.primaryKey
  const id = resolveRowId(currentRow, idField)
  if (id === null) return
  await dataSource.editRowById(id, { [desc.field]: desc.value })
}

// ── submit-current-form 执行器 ───────────────────────────────────────────

/**
 * 执行提交当前表单动作。
 *
 * 执行流程：
 * 1. 从 scope.formApi 获取表单 API（未注入则报警告）
 * 2. 确保 DataView 就绪
 * 3. 获取目标行（优先 formApi.getCurrentRow()，降级为 dataSource.currentRow）
 * 4. 若 formApi.validate 存在，触发校验；校验失败则中止并提示 validateMessage
 * 5. 调用 formApi.getFormData() 获取草稿数据
 * 6. 调用 view.editRowById() 持久化，处理 CrudResult
 */
export async function executeSubmitCurrentForm(
  desc: SubmitCurrentFormAction,
  ctx: ActionExecutionContext,
  scope: ActionExecutionScope | undefined,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  const formApi = scope?.formApi
  if (!formApi) {
    notifier.notify('warning', desc.emptyMessage ?? '表单 API 未就绪')
    return
  }

  const { dataSource } = resolveActionDataCapabilities(desc.dataViewKey, ctx)
  if (!dataSource) {
    notifier.notify('warning', desc.emptyMessage ?? '数据视图未就绪')
    return
  }

  const idField = desc.idField ?? dataSource.primaryKey
  const formRow = formApi.getCurrentRow()
  const targetRow = formRow ?? dataSource.currentRow
  if (!targetRow) {
    notifier.notify('warning', '请先选择当前行')
    return
  }
  const id = resolveRowId(targetRow, idField)
  if (id === null) {
    notifier.notifyError(`当前行缺少主键字段: ${idField}`)
    return
  }

  if (typeof formApi.validate === 'function') {
    const valid = await formApi.validate()
    if (!valid) {
      notifier.notify('warning', desc.validateMessage ?? '请先修正表单校验错误')
      return
    }
  }

  const draft = asRecord(formApi.getFormData())
  if (!draft) {
    notifier.notify('warning', '当前表单数据不可用')
    return
  }

  const result = await dataSource.editRowById(id, draft)
  if (isCrudSuccess(result)) {
    notifier.notify('success', desc.successMessage ?? '保存成功')
    return
  }
  notifier.notify(
    'warning',
    isCrudResult(result)
      ? getCrudErrorMessage(result, desc.failureMessage ?? '保存失败')
      : (desc.failureMessage ?? '保存失败'),
  )
}

function createAutoRequestId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function executeSaveDataSet(
  desc: SaveDataSetAction,
  ctx: ActionExecutionContext,
): Promise<void> {
  const notifier = createActionNotifier(ctx, desc)
  if (!desc.scenarioId.trim()) throw new Error('save-dataset 必须指定场景 scenarioId')
  const dataSet = ctx.getDataSet(desc.scenarioId)
  if (!dataSet) {
    notifier.notify('warning', desc.emptyMessage ?? 'DataSet 未就绪')
    return
  }

  const options: DataSetSaveChangesOptions = {}
  if (desc.mode !== undefined) options.mode = desc.mode
  if (desc.applyEditingRows !== undefined) options.applyEditingRows = desc.applyEditingRows
  if (desc.views !== undefined) options.views = desc.views
  const requestId = desc.requestId ?? (desc.requestIdStrategy === 'auto' ? createAutoRequestId() : undefined)
  if (requestId !== undefined) options.transaction = { requestId }

  const result = await dataSet.saveChanges(options)
  if (result.success) {
    notifier.notify('success', desc.successMessage ?? result.message ?? '保存成功')
    return
  }
  notifier.notify('warning', desc.failureMessage ?? result.message ?? '保存失败')
}
