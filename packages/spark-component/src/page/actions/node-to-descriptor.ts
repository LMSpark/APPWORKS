/**
 * @module @spark-appworks/spark-component:page/actions/node-to-descriptor
 * 职责：提供 node to descriptor 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * SparkNode → ActionDescriptor 翻译器
 *
 * 将 BuiltinAction（按钮组件的 `props.action`）扁平字段映射为强类型的统一 descriptor。
 * 调用方拿到 descriptor 后由 `executeActionDescriptor` 执行，
 * 不命中内置动作名的按钮（自定义 onClick）返回 null，由调用方走 onClick 路径。
 *
 * ## 翻译流程
 * ```
 * SparkNode.props
 *   → pickDecorator()  提取 UI 装饰字段
 *   → pickDataViewKey() / pickIdField()  提取通用 CRUD 字段
 *   → mapBuiltinAction()  按 BuiltinActionName switch 映射为具体 descriptor
 * ```
 */

import { type SparkNode, nodeInputProps } from '@spark-appworks/spark-data'
import type {
  ActionDescriptor,
  ActionPromptConfig,
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
  SubmitCurrentFormAction,
} from './action-types'
import { isBuiltinActionName, type BuiltinActionName } from './executor-helpers'
import { asRecord, readString } from './executor-helpers'
import {
  readBoolean,
  readOptionalMessageType,
  readOptionalStringArray,
} from './executor-helpers'
// ── 公共字段提取工具 ──────────────────────────────────────────────────────

/**
 * 从 props 中提取所有 ActionUiDecorator 字段，用于所有 data-mutating 类型 descriptor。
 * 只写入存在的字段，不写 undefined（保持 descriptor 对象干净）。
 */
function pickDecorator(props: Record<string, unknown>): ActionUiDecorator {
  const out: ActionUiDecorator = {}
  if (readBoolean(props['silent']) === true) out.silent = true

  const successMessage = props['successMessage']
  if (typeof successMessage === 'string') out.successMessage = successMessage

  const failureMessage = props['failureMessage']
  if (typeof failureMessage === 'string') out.failureMessage = failureMessage

  const emptyMessage = props['emptyMessage']
  if (typeof emptyMessage === 'string') out.emptyMessage = emptyMessage

  const errorMessage = props['errorMessage']
  if (typeof errorMessage === 'string') out.errorMessage = errorMessage

  const confirmMessage = props['confirmMessage']
  if (typeof confirmMessage === 'string') out.confirmMessage = confirmMessage

  const confirmTitle = readString(props['confirmTitle'])
  if (confirmTitle) out.confirmTitle = confirmTitle

  const confirmType = readOptionalMessageType(props['confirmType'])
  if (confirmType) out.confirmType = confirmType

  const disabledWhenRow = asRecord(props['disabledWhenRow'])
  if (disabledWhenRow) out.disabledWhenRow = disabledWhenRow

  return out
}

/**
 * 从 props 中提取 Prompt 输入框配置。
 *
 * @param defaultMode - `'append'` 时读取 `defaultValue` prop（新增场景静态默认值）；
 *                      `'edit'` 时不读（编辑场景由执行器从 row[field] 推断）
 * 若未配置 `field` prop 则返回 undefined，表示不启用 prompt 模式。
 */
function pickPrompt(props: Record<string, unknown>, defaultMode: 'append' | 'edit'): ActionPromptConfig | undefined {
  const field = readString(props['field'])
  if (!field) return undefined
  const cfg: ActionPromptConfig = { field }
  const message = readString(props['promptMessage'])
  if (message) cfg.message = message
  const title = readString(props['promptTitle'])
  if (title) cfg.title = title
  const placeholder = readString(props['placeholder'])
  if (placeholder) cfg.placeholder = placeholder
  // append: 用 defaultValue（配置）；edit: defaultValue 由 executor 用 row[field] 推断
  if (defaultMode === 'append') {
    const dv = readString(props['defaultValue'])
    if (dv !== undefined) cfg.defaultValue = dv
  }
  return cfg
}

/** 读取 idField prop（主键字段名，默认由执行器使用 `'id'`）。 */
function pickIdField(props: Record<string, unknown>): string | undefined {
  return readString(props['idField'])
}

/** 读取 dataViewKey prop（省略时使用容器作用域 DataView）。 */
function pickDataViewKey(props: Record<string, unknown>): string | undefined {
  return readString(props['dataViewKey'])
}

function readSaveDataSetViews(value: unknown): SaveDataSetAction['views'] | undefined {
  if (!Array.isArray(value)) return undefined
  const views: NonNullable<SaveDataSetAction['views']> = []
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const tableName = readString(record['tableName'])
    if (!tableName) continue
    const view: NonNullable<SaveDataSetAction['views']>[number] = { tableName }
    const viewId = readString(record['viewId'])
    if (viewId) view.viewId = viewId
    if (Array.isArray(record['ids'])) {
      const ids = record['ids'].filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
      if (ids.length > 0) view.ids = ids
    }
    views.push(view)
  }
  return views.length > 0 ? views : undefined
}

function readNestedActionDescriptor(value: unknown): ActionDescriptor | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const rawAction = readString(record['action'])
  if (!rawAction || !isBuiltinActionName(rawAction)) return undefined
  return mapBuiltinAction(rawAction, record) ?? undefined
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const result: Record<string, string> = {}
  for (const [key, entryValue] of Object.entries(record)) {
    if (typeof entryValue === 'string') result[key] = entryValue
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function withThen<T extends ActionDescriptor>(desc: T, props: Record<string, unknown>): T {
  const then = readNestedActionDescriptor(props['then'])
  if (then) desc.then = then
  return desc
}

// ── 公开翻译入口 ──────────────────────────────────────────────────────────

/**
 * 将 SparkNode（按钮组件）翻译为 ActionDescriptor。
 *
 * @returns 对应的 ActionDescriptor；不命中内置动作名时返回 null（由调用方走 onClick 路径）
 */
export function nodeToActionDescriptor(node: SparkNode): ActionDescriptor | null {
  const props = nodeInputProps(node)
  const rawAction = readString(props['action'])
  if (!rawAction || !isBuiltinActionName(rawAction)) return null
  return mapBuiltinAction(rawAction, props)
}

// ── BuiltinActionName → ActionDescriptor 映射 ─────────────────────────────

/**
 * 按 BuiltinActionName switch 将 props 映射为强类型 descriptor。
 * 每个 case 只写入"该类型存在且非 undefined"的字段，保持 descriptor 对象干净。
 */
function mapBuiltinAction(name: BuiltinActionName, props: Record<string, unknown>): ActionDescriptor | null {
  const decorator = pickDecorator(props)
  const dataViewKey = pickDataViewKey(props)
  const idField = pickIdField(props)

  switch (name) {
    case 'append-row': {
      const desc: AppendRowAction = { action: 'append-row', ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      const payload = asRecord(props['appendPayload'])
      if (payload) desc.appendPayload = payload
      const inheritFields = readOptionalStringArray(props['inheritFields'])
      if (inheritFields) desc.inheritFields = inheritFields
      const inheritFieldMap = readStringRecord(props['inheritFieldMap'])
      if (inheritFieldMap) desc.inheritFieldMap = inheritFieldMap
      if (readBoolean(props['setCurrentRowOnSuccess']) === true) desc.setCurrentRowOnSuccess = true
      return withThen(desc, props)
    }

    case 'prompt-append': {
      const desc: AppendRowAction = { action: 'append-row', ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      const payload = asRecord(props['appendPayload'])
      if (payload) desc.appendPayload = payload
      const inheritFields = readOptionalStringArray(props['inheritFields'])
      if (inheritFields) desc.inheritFields = inheritFields
      const inheritFieldMap = readStringRecord(props['inheritFieldMap'])
      if (inheritFieldMap) desc.inheritFieldMap = inheritFieldMap
      if (readBoolean(props['setCurrentRowOnSuccess']) === true) desc.setCurrentRowOnSuccess = true
      const prompt = pickPrompt(props, 'append')
      if (prompt) desc.prompt = prompt
      return withThen(desc, props)
    }

    case 'prompt-edit': {
      const target: ActionRowTarget = readString(props['targetRow']) === 'current' ? 'current' : 'scope'
      const desc: PatchAction = { action: 'patch', target, ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      const prompt = pickPrompt(props, 'edit')
      if (prompt) desc.prompt = prompt
      return withThen(desc, props)
    }

    case 'submit-current-form': {
      const desc: SubmitCurrentFormAction = { action: 'submit-current-form', ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      const validateMessage = readString(props['validateMessage'])
      if (validateMessage) desc.validateMessage = validateMessage
      return withThen(desc, props)
    }

    case 'save-dataset': {
      const desc: SaveDataSetAction = { action: 'save-dataset', ...decorator }
      const mode = readString(props['mode'])
      if (mode === 'perView' || mode === 'transaction') desc.mode = mode
      const requestId = readString(props['requestId'])
      if (requestId) desc.requestId = requestId
      const requestIdStrategy = readString(props['requestIdStrategy'])
      if (requestIdStrategy === 'auto') desc.requestIdStrategy = requestIdStrategy
      const applyEditingRows = readBoolean(props['applyEditingRows'])
      if (applyEditingRows !== undefined) desc.applyEditingRows = applyEditingRows
      const views = readSaveDataSetViews(props['views'])
      if (views) desc.views = views
      return withThen(desc, props)
    }

    case 'clear-rows': {
      const desc: ClearRowsAction = { action: 'clear-rows', ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      return withThen(desc, props)
    }

    case 'refresh': {
      const desc: RefreshAction = { action: 'refresh', ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      return withThen(desc, props)
    }

    case 'move-row':
    case 'move-current': {
      const target = name === 'move-row' ? 'scope' : 'current'
      const desc: MoveAction = { action: 'move', target, ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      if (Object.prototype.hasOwnProperty.call(props, 'newParentId')) {
        const v = props['newParentId']
        if (typeof v === 'string' || typeof v === 'number' || v === null) desc.newParentId = v
      }
      const tps = readString(props['targetParentSource'])
      if (tps === 'field' || tps === 'scope') desc.targetParentSource = tps
      const tpf = readString(props['targetParentField'])
      if (tpf) desc.targetParentField = tpf
      const idx = props['index']
      if (typeof idx === 'number' && Number.isFinite(idx)) desc.index = idx
      return withThen(desc, props)
    }

    case 'delete-row':
    case 'delete-current':
    case 'delete-selected': {
      const target: ActionRowTarget =
        name === 'delete-row' ? 'scope' : name === 'delete-current' ? 'current' : 'selected'
      const desc: DeleteAction = { action: 'delete', target, ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      return withThen(desc, props)
    }

    case 'patch-row':
    case 'patch-current':
    case 'patch-selected': {
      const target: ActionRowTarget =
        name === 'patch-row' ? 'scope' : name === 'patch-current' ? 'current' : 'selected'
      const desc: PatchAction = { action: 'patch', target, ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      if (idField) desc.idField = idField
      const patch = asRecord(props['patch'])
      if (patch) desc.patch = patch
      const field = readString(props['field'])
      if (field) {
        desc.field = field
        if ('value' in props) desc.value = props['value']
      }
      return withThen(desc, props)
    }

    case 'message-row':
    case 'message-current': {
      const target = name === 'message-row' ? 'scope' : 'current'
      const desc: MessageRowAction = { action: 'message-row', target, ...decorator }
      if (dataViewKey) desc.dataViewKey = dataViewKey
      const message = readString(props['message'])
      if (message) desc.message = message
      const messageFields = readOptionalStringArray(props['messageFields'])
      if (messageFields) desc.messageFields = messageFields
      const messageType = readOptionalMessageType(props['messageType'])
      if (messageType) desc.messageType = messageType
      return withThen(desc, props)
    }
  }
}

