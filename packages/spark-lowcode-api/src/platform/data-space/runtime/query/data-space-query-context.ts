/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-context
 * 职责：持有原查询快照、行身份与保存基线。
 * 边界：消费者不能替换凭据；保存回执创建独立基线，_pk 不提交。
 * AI用途：从实际查询行消费权限并构造可验证的保存请求。
 */
import { DataSpaceDesignApi } from '../../design/data-space-design-api'
import type { DataSpaceQueryIdentity } from '../data-space-runtime-contract'
import { DataSpaceRowPermission } from '../protocol/data-space-permission'
import type { DataSpaceFieldAccess, DataSpaceMissingAuthPolicy } from '../protocol/data-space-permission'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import { snapshotDataSpaceSaveActionOrder } from '../save/data-space-save-order'
import type { readDataSpaceSaveReceipt } from '../save/data-space-save-result'

/** 操作入口的隐藏、禁用或可用状态；业务可用性不扩大权限。 */
type DataSpaceActionState = 'hidden' | 'disabled' | 'enabled'
/** 只读业务行；公开行不包含私有系统权限凭据。 */
type DataSpaceRow = Readonly<Record<string, unknown>>
/** 保存请求或回执的可写行副本，封包前排除 _pk 与消费者伪造凭据。 */
type DataSpaceSaveRow = Record<string, unknown>
/** 按动作分组的候选行变更；更新和删除必须对应唯一原查询行。 */
type DataSpaceSaveChanges = Readonly<{
  added?: readonly DataSpaceRow[]
  changed?: readonly DataSpaceRow[]
  deleted?: readonly DataSpaceRow[]
  actionOrder?: ReturnType<typeof snapshotDataSpaceSaveActionOrder>
}>
/** 单模型 CRUD 协议分组；系统凭据从私有原查询基线重新附入。 */
type DataSpaceSaveRequest = Readonly<{
  TableName: string
  CrudModel: Readonly<{ Added: DataSpaceSaveRow[]; Changed: DataSpaceSaveRow[]; Deleted: DataSpaceSaveRow[] }>
}>
/** 后端实际动作行回执，尚需上下文核对模型与行身份。 */
type DataSpaceSaveReceipt = ReturnType<typeof readDataSpaceSaveReceipt>[number]
/** 提交范围与实际回执的配对，用于核对动作数量和原行身份。 */
type DataSpaceSaveReceiptCommand = Readonly<{
  requested: DataSpaceSaveChanges
  receipt: DataSpaceSaveReceipt
}>
/** 逐更新回执行的实际字段名，用于消费者确认已返回的字段。 */
type DataSpaceSaveChangedFields = ReadonlyArray<readonly string[]>
/** 核对后的动作回执、新独立上下文及实际更新字段；原上下文不被就地改写。 */
type DataSpaceSaveAcceptedReceipt = DataSpaceSaveReceipt & Readonly<{
  context: DataSpaceQueryContext
  changedFields: DataSpaceSaveChangedFields
}>
/** 原结果快照及执行域读取器；scope 非空且后续访问必须仍然匹配。 */
type DataSpaceQueryContextOptions = Readonly<{
  identity: DataSpaceQueryIdentity
  snapshot: ReturnType<DataSpaceQueryTable['applyResult']>
  scope: string
  readScope: () => string
  missingAuthPolicy?: DataSpaceMissingAuthPolicy
}>

function canonicalKey(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

const denied = Object.freeze({ read: 'invisible', write: 'denied', component: 'hidden',
  required: false, writeMode: 'readonly' } as const)

/** 本次查询拥有唯一行身份和双通道权限；消费者不得取得底层权限字段或替换基线。 */
export class DataSpaceQueryContext {
  readonly #identity: DataSpaceQueryIdentity
  readonly #snapshot: DataSpaceQueryContextOptions['snapshot']
  readonly #scope: string
  readonly #readScope: () => string
  readonly #missingAuthPolicy: DataSpaceQueryContextOptions['missingAuthPolicy']
  readonly #rows: readonly DataSpaceRow[]
  readonly #permissions = new Map<string, DataSpaceRowPermission | null>()
  readonly #rowPermissions = new WeakMap<DataSpaceRow, DataSpaceRowPermission>()
  #invalid = false
  #model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>> | undefined

  /** 保留原快照并登记唯一行权限；公开冻结行移除系统凭据，重复身份不授予权限。 */
  public constructor(options: DataSpaceQueryContextOptions) {
    if (!options.scope.trim()) throw new Error('SPARK_QUERY_CONTEXT_STALE: scope 不能为空')
    this.#identity = Object.freeze({ ...options.identity })
    this.#snapshot = options.snapshot
    this.#scope = options.scope
    this.#readScope = options.readScope
    this.#missingAuthPolicy = options.missingAuthPolicy
    this.#rows = Object.freeze(options.snapshot.rows.map(row => {
      const permission = new DataSpaceRowPermission({ row,
        ...(options.missingAuthPolicy === undefined ? {} : { missingAuthPolicy: options.missingAuthPolicy }) })
      const key = canonicalKey(this.rowKeyValue(row))
      if (key) this.#permissions.set(key, this.#permissions.has(key) ? null : permission)
      const consumer: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(row)) {
        if (field !== 'lingma_sys_key' && field !== 'lingma_sys_params') consumer[field] = value
      }
      const publicRow = Object.freeze(consumer)
      this.#rowPermissions.set(publicRow, permission)
      return publicRow
    }))
    this.assertCurrent()
  }

  public bindFormalModel(model: Awaited<ReturnType<DataSpaceDesignApi['readModel']>>): void {
    this.assertIdentity({scenarioId: this.#identity.scenarioId, metaName: model.metaName})
    const key = model.primaryKey === '' ? undefined : DataSpaceDesignApi.resolveOutputFields(model)
      .find(field => field.canonicalName === model.primaryKey && field.primaryKey)
    if (model.primaryKey !== '' && (!key || ![key.name, key.canonicalName].includes(this.#snapshot.primaryKey))) {
      throw new Error('SPARK_MODEL_PRIMARY_KEY: 原查询主键与正式模型不一致')
    }
    if (this.#model && JSON.stringify(this.#model) !== JSON.stringify(model)) {
      throw new Error('SPARK_MODEL_CONTEXT_CONFLICT: 同一原查询上下文不能替换正式模型')
    }
    this.#model = model
    this.#permissions.clear()
    for (const row of this.#snapshot.rows) {
      const rowKey = canonicalKey(this.rowKeyValue(row))
      if (rowKey) this.#permissions.set(rowKey, this.#permissions.has(rowKey) ? null
        : new DataSpaceRowPermission({row, ...(this.#missingAuthPolicy === undefined ? {} : {missingAuthPolicy: this.#missingAuthPolicy})}))
    }
  }

  private get keyField(): string { return this.#model?.primaryKey ?? this.#snapshot.primaryKey }

  public get rows(): readonly DataSpaceRow[] { this.assertCurrent(); return this.#rows }
  public get total(): number { this.assertCurrent(); return this.#snapshot.total }
  public get countReported(): boolean { this.assertCurrent(); return this.#snapshot.countReported }
  public get allowAdd(): boolean { this.assertCurrent(); return this.#model?.primaryKey === '' ? false : this.#snapshot.allowAdd }

  public prepareNewRow(input: DataSpaceRow): Record<string, unknown> {
    this.assertCurrent()
    const keyField = this.keyField
    if (!keyField || keyField === '_pk' || /[,+]/.test(keyField)) throw new Error('SPARK_NEW_ROW_KEY: 新增缺少唯一正式 keyField')
    const row = {...input}
    delete row['_pk']
    delete row['lingma_sys_key']
    delete row['lingma_sys_params']
    if (!canonicalKey(row[keyField])) {
      const bytes = new Uint8Array(16)
      globalThis.crypto.getRandomValues(bytes)
      row[keyField] = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    }
    return row
  }

  public rowKey(row: DataSpaceRow): unknown { this.assertCurrent(); return this.rowKeyValue(row) }

  public invalidate(): void { this.#invalid = true }

  public assertIdentity(identity: DataSpaceQueryIdentity): void {
    this.assertCurrent()
    if (identity.scenarioId !== this.#identity.scenarioId || identity.metaName !== this.#identity.metaName) {
      throw new Error('SPARK_QUERY_CONTEXT_IDENTITY: 查询上下文不属于目标场景模型')
    }
  }

  public addActionState(available = true): DataSpaceActionState {
    this.assertCurrent()
    return this.allowAdd ? available ? 'enabled' : 'disabled' : 'hidden'
  }

  public editActionState(rowKey: unknown, available = true): DataSpaceActionState {
    return this.rowAction(rowKey, available, 'edit')
  }

  public deleteActionState(rowKey: unknown, available = true): DataSpaceActionState {
    return this.rowAction(rowKey, available, 'delete')
  }

  public createChildActionState(rowKey: unknown, available = true): DataSpaceActionState {
    return this.rowAction(rowKey, available, 'child')
  }

  public viewActionState(rowKey: unknown, available = true): DataSpaceActionState {
    this.assertCurrent()
    const key = canonicalKey(rowKey)
    return available && key && this.#permissions.get(key) ? 'enabled' : 'disabled'
  }

  public fieldAccess(rowKey: unknown, fieldName: string): DataSpaceFieldAccess {
    this.assertCurrent()
    const permission = this.#permissions.get(canonicalKey(rowKey))
    return permission ? permission.fieldAccess(fieldName) : denied
  }

  /** Read only the captured read state for the exact public row returned by this query context. */
  public readFieldAccess(row: DataSpaceRow, fieldName: string): DataSpaceFieldAccess['read'] {
    this.assertCurrent()
    return this.#rowPermissions.get(row)?.fieldAccess(fieldName).read ?? 'invisible'
  }

  /** 原查询强引用基线决定更新差异和删除原行；业务候选值交后端强验证。 */
  public prepareSaveChanges(changes: DataSpaceSaveChanges): DataSpaceSaveChanges {
    this.assertCurrent()
    this.assertModelSaveAllowed(changes)
    const changed = (changes.changed ?? []).flatMap(row => {
      const original = this.originalMutationRow(row)
      const keyField = this.keyField
      const patch: DataSpaceSaveRow = { [keyField]: original[keyField] }
      for (const [field, value] of Object.entries(row)) {
        if (field === keyField || field === '_pk' || field.startsWith('lingma_sys_') || value === undefined) continue
        if (!this.sameSaveValue(original[field], value)) patch[field] = value
      }
      return Object.keys(patch).length > 1 ? [patch] : []
    })
    const selected = new Set<string>()
    const deleted = (changes.deleted ?? []).map(row => {
      const original = this.originalMutationRow(row)
      const key = canonicalKey(this.rowKeyValue(original))
      if (selected.has(key)) throw new Error(`SPARK 删除行标识重复: ${key}`)
      selected.add(key)
      return structuredClone(original)
    })
    this.assertCurrent()
    return { ...changes, changed, deleted }
  }

  private originalMutationRow(row: DataSpaceRow): DataSpaceRow {
    const key = canonicalKey(this.rowKeyValue(row))
    if (!key || this.keyField === '_pk') throw new Error('SPARK 保存缺少正式主键查询基线')
    const originals = this.#rows.filter(item => canonicalKey(this.rowKeyValue(item)) === key)
    const original = originals[0]
    if (originals.length !== 1 || original === undefined) throw new Error(`SPARK 保存未找到唯一原查询基线: ${key}`)
    return original
  }

  private sameSaveValue(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    try { return JSON.stringify(left) === JSON.stringify(right) } catch { return false }
  }

  public resolveSaveReceipt(command: DataSpaceSaveReceiptCommand): DataSpaceSaveReceipt {
    this.assertCurrent()
    const requested = command.requested
    const receipt = {...command.receipt, added: command.receipt.added.map(row => this.canonicalReceiptRow(row)),
      changed: command.receipt.changed.map(row => this.canonicalReceiptRow(row)), deleted: command.receipt.deleted.map(row => this.canonicalReceiptRow(row))}
    if (receipt.metaName !== this.#identity.metaName) throw new Error('SPARK 保存回执行身份不匹配')
    for (const action of ['added', 'changed', 'deleted'] as const) {
      if (receipt[action].length !== (requested[action]?.length ?? 0)) throw new Error('SPARK 保存回执行身份数量不匹配')
    }
    const keyField = this.keyField
    const resolveExisting = (action: 'changed' | 'deleted'): DataSpaceSaveRow[] => {
      const selected = new Set((requested[action] ?? []).map(row => canonicalKey(this.rowKeyValue(row))))
      const received = new Set<string>()
      return receipt[action].map((row, index) => {
        const actualKey = canonicalKey(this.rowKeyValue(row))
        const fallback = action === 'changed' ? requested.changed?.[index] : undefined
        const key = actualKey || canonicalKey(fallback === undefined ? undefined : this.rowKeyValue(fallback))
        if (!key || !selected.has(key) || received.has(key)) throw new Error('SPARK 保存回执行身份缺失、重复或超出提交范围')
        received.add(key)
        const original = this.originalMutationRow({ [keyField]: key })
        return action === 'changed'
          ? { ...this.consumerSaveRow(original), ...this.consumerSaveRow(row), [keyField]: original[keyField] }
          : this.consumerSaveRow(row)
      })
    }
    const result = { metaName: receipt.metaName, added: receipt.added.map(row => this.consumerSaveRow(row)),
      changed: resolveExisting('changed'), deleted: resolveExisting('deleted') }
    this.assertCurrent()
    return result
  }

  private canonicalReceiptRow(row: DataSpaceRow): DataSpaceSaveRow {
    if (!this.#model) return this.consumerSaveRow(row)
    const outputFields = DataSpaceDesignApi.resolveOutputFields(this.#model)
    const result: DataSpaceSaveRow = {}
    for (const [name, value] of Object.entries(row)) {
      if (name === '_pk' || name.startsWith('lingma_sys_')) continue
      const matches = outputFields.filter(candidate => candidate.name === name)
      if (matches.length > 1) throw new Error(`SPARK_MODEL_RECEIPT_FIELD: ${name}`)
      const field = matches[0]
      result[field?.canonicalName ?? name] = value
    }
    return result
  }

  private consumerSaveRow(row: DataSpaceRow): DataSpaceSaveRow {
    const copy: DataSpaceSaveRow = structuredClone(row)
    delete copy['_pk']
    delete copy['lingma_sys_key']
    delete copy['lingma_sys_params']
    return copy
  }

  /** 回执推进独立基线；原上下文及其权限不被共享视图的保存就地改写。 */
  public acceptSaveReceipt(command: DataSpaceSaveReceiptCommand): DataSpaceSaveAcceptedReceipt {
    const receipt = this.resolveSaveReceipt(command)
    const deleted = new Set(receipt.deleted.map(row => canonicalKey(this.rowKeyValue(row))))
    const changed = new Map(receipt.changed.map(row => [canonicalKey(this.rowKeyValue(row)), row]))
    const retained = this.#snapshot.rows.filter(row => !deleted.has(canonicalKey(this.rowKeyValue(row))))
      .map(row => ({ ...row, ...changed.get(canonicalKey(this.rowKeyValue(row))) }))
    const keys = new Set(retained.map(row => canonicalKey(this.rowKeyValue(row))))
    const added = receipt.added.map(row => {
      const key = canonicalKey(this.rowKeyValue(row))
      if (!key || this.keyField === '_pk' || keys.has(key)) throw new Error('SPARK 新增回执行身份缺失或重复')
      keys.add(key)
      return this.#snapshot.systemKey ? { ...row, lingma_sys_key: this.#snapshot.systemKey } : { ...row }
    })
    const total = Math.max(0, this.#snapshot.total + added.length - deleted.size)
    const snapshot = new DataSpaceQueryTable(this.#identity).applyResult({ Result: {
      data: { Items: [...retained, ...added], Count: total }, primaryKeyField: this.#snapshot.primaryKey,
      allowAdd: this.#snapshot.allowAdd, lingma_sys_key: this.#snapshot.systemKey,
    } })
    const context = new DataSpaceQueryContext({ identity: this.#identity,
      snapshot: Object.freeze({ ...snapshot, countReported: this.#snapshot.countReported }),
      scope: this.#scope, readScope: this.#readScope,
      ...(this.#missingAuthPolicy === undefined ? {} : { missingAuthPolicy: this.#missingAuthPolicy }) })
    if (this.#model) context.bindFormalModel(this.#model)
    this.assertCurrent()
    const changedFields = Object.freeze(command.receipt.changed.map(row =>
      Object.freeze(Object.keys(this.canonicalReceiptRow(row)))))
    return { ...receipt, context, changedFields }
  }

  /** API 保存边界使用私有原查询凭据封包；不按前端权限集合裁剪业务值。 */
  public buildSaveRequest(changes: DataSpaceSaveChanges): DataSpaceSaveRequest[] {
    this.assertCurrent()
    this.assertModelSaveAllowed(changes)
    const order = Object.hasOwn(changes, 'actionOrder') ? snapshotDataSpaceSaveActionOrder(changes.actionOrder) : undefined
    const added = (changes.added ?? []).map(row => this.prepareSaveRow(row, 'add'))
    const changed = (changes.changed ?? []).map(row => this.prepareSaveRow(row, 'change'))
    const deleted = (changes.deleted ?? []).map(row => this.prepareSaveRow(row, 'delete'))
    const groups: DataSpaceSaveRow[][] = []
    let previous: string | undefined
    for (const row of added) {
      const key = JSON.stringify(Object.keys(row).filter(field => field !== 'lingma_sys_key'
        && row[field] !== undefined && row[field] !== null).sort())
      if (previous !== key) groups.push([])
      groups.at(-1)?.push(row)
      previous = key
    }
    const insertGroups = groups.length > 1 ? groups : [added]
    const request = (crud: DataSpaceSaveRequest['CrudModel']): DataSpaceSaveRequest => ({
      TableName: this.#identity.metaName, CrudModel: crud,
    })
    const result = order ? order.flatMap(action => {
      if (action === 'added') return added.length ? insertGroups.map(Added => request({ Added, Changed: [], Deleted: [] })) : []
      if (action === 'changed') return changed.length ? [request({ Added: [], Changed: changed, Deleted: [] })] : []
      return deleted.length ? [request({ Added: [], Changed: [], Deleted: deleted })] : []
    }) : insertGroups.map((Added, index) => request({ Added,
      Changed: index === insertGroups.length - 1 ? changed : [], Deleted: index === 0 ? deleted : [] }))
    this.assertCurrent()
    return result
  }

  private assertModelSaveAllowed(changes: DataSpaceSaveChanges): void {
    if (this.#model?.primaryKey === '' && ((changes.added?.length ?? 0) > 0
      || (changes.changed?.length ?? 0) > 0 || (changes.deleted?.length ?? 0) > 0)) {
      throw new Error('SPARK_MODEL_KEYLESS_READONLY: 无正式主键模型不可保存行变更')
    }
  }

  private prepareSaveRow(row: DataSpaceRow, mode: 'add' | 'change' | 'delete'): DataSpaceSaveRow {
    const copy: DataSpaceSaveRow = structuredClone(row)
    delete copy['_pk']
    delete copy['lingma_sys_key']
    delete copy['lingma_sys_params']
    let token: unknown = mode === 'add' ? this.addCredential(copy) : this.#snapshot.systemKey
    if (mode !== 'add') {
      const key = canonicalKey(this.rowKeyValue(copy))
      if (!key) return copy
      const originals = this.#snapshot.rows.filter(item => canonicalKey(this.rowKeyValue(item)) === key)
      if (originals.length > 1) throw new Error(`SPARK 保存行主键在原查询结果中不唯一: ${key}`)
      token = originals[0]?.['lingma_sys_key']
    }
    const wire: DataSpaceSaveRow = {}
    const outputFields = this.#model ? DataSpaceDesignApi.resolveOutputFields(this.#model) : undefined
    for (const [name, value] of Object.entries(copy)) {
      if (!this.#model) { wire[name] = value; continue }
      const field = outputFields?.find(candidate => candidate.canonicalName === name)
      if (!field || field.computed) {
        if (mode === 'delete') continue
        throw new Error(`SPARK_MODEL_SAVE_FIELD: ${name}`)
      }
      wire[field.name] = value
    }
    if (Boolean(token)) wire['lingma_sys_key'] = token
    return wire
  }

  private rowKeyValue(row: DataSpaceRow): unknown {
    return this.keyField ? row[this.keyField] : undefined
  }

  /** 正式自引用父字段决定根/子新增；子行只回放唯一原父行的 c 凭据，不用表令牌兼容分支。 */
  private addCredential(row: DataSpaceRow): unknown {
    const model = this.#model
    if (model === undefined) return this.#snapshot.systemKey
    const read = (name: string): unknown => {
      const key = Object.keys(model.raw).find(fieldName => fieldName.toLowerCase() === name.toLowerCase())
      return key === undefined ? undefined : model.raw[key]
    }
    const declared = canonicalKey(read('ParentField'))
    if (!declared) return this.#snapshot.systemKey
    const parents = DataSpaceDesignApi.resolveOutputFields(model)
      .filter(field => field.name.toLowerCase() === declared.toLowerCase())
    const parentField = parents[0]
    if (parents.length !== 1 || parentField === undefined || !parentField.output || parentField.computed
      || parentField.canonicalName === this.keyField) {
      throw new Error('SPARK_CHILD_ADD_PARENT: 正式自引用父字段无法唯一解析')
    }
    const parentValue = row[parentField.canonicalName]
    const topValue = read('TopValue')
    if (parentValue === undefined || parentValue === null || String(parentValue).trim() === ''
      || (topValue !== undefined && topValue !== null && String(parentValue) === String(topValue))) {
      return this.#snapshot.systemKey
    }
    const key = canonicalKey(parentValue)
    if (canonicalKey(this.rowKeyValue(row)) === key) throw new Error('SPARK_CHILD_ADD_PARENT: 新增行不能以自身为父行')
    const originals = this.#snapshot.rows.filter(parent => canonicalKey(this.rowKeyValue(parent)) === key)
    const parent = originals[0]
    if (originals.length !== 1 || parent === undefined || this.#permissions.get(key)?.allowAddChild() !== true) {
      throw new Error('SPARK_CHILD_ADD_PARENT: 未找到唯一且明确允许新增子行的原查询父行')
    }
    const token = parent['lingma_sys_key']
    if (typeof token !== 'string' || !token.trim()) throw new Error('SPARK_CHILD_ADD_PARENT: 原查询父行缺少凭据')
    return token
  }

  private rowAction(keyValue: unknown, available: boolean, action: 'edit' | 'delete' | 'child'): DataSpaceActionState {
    this.assertCurrent()
    if (this.#model?.primaryKey === '') return 'hidden'
    const key = canonicalKey(keyValue)
    if (!key) return 'disabled'
    const permission = this.#permissions.get(key)
    const authorized = permission && (action === 'edit' ? permission.allowEdit()
      : action === 'delete' ? permission.allowDelete() : permission.allowAddChild())
    return authorized ? available ? 'enabled' : 'disabled' : 'hidden'
  }

  private assertCurrent(): void {
    if (this.#invalid || this.#readScope() !== this.#scope) {
      throw new Error('SPARK_QUERY_CONTEXT_STALE: 查询上下文已失效')
    }
  }
}
