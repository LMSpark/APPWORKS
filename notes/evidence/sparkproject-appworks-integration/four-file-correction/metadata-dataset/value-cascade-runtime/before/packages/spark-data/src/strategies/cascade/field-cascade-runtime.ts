import type { DataSet } from '../../dataset'
import type { DataView } from '../../data-view'
import { RequestState } from '../../types'
import type { DataViewFieldCascade, DataViewFieldCascadeAddress, DataViewFieldCascadeState } from '../../types'
import { Logger } from '@spark-appworks/spark-utils'

const logger = Logger('DataView:FieldCascade')

type Entry = {
  address: DataViewFieldCascadeAddress
  state: DataViewFieldCascadeState
  generation: number
  parents?: readonly unknown[]
  targetRevision: number
}

const idle: DataViewFieldCascadeState = { status: 'idle', options: [], valueStatus: 'unverified' }

function scalar(value: unknown, label: string): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value
  throw new Error(`FIELD_CASCADE_VALUE: ${label} 必须是标量`)
}

function copyState(state: DataViewFieldCascadeState): DataViewFieldCascadeState {
  return Object.freeze({ ...state, options: Object.freeze(state.options.map(row => Object.freeze({ ...row }))) })
}

/** 一个 DataSet 内字段输入选项和目标编辑值的生命周期 owner。 */
export class DataViewFieldCascadeRuntime {
  readonly #definitions = new Map<string, DataViewFieldCascade>()
  readonly #entries = new Map<string, Entry>()
  readonly #listeners = new Set<(address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void>()
  readonly #unsubscribe: () => void
  #disposed = false

  constructor(private readonly dataSet: DataSet, definitions: readonly DataViewFieldCascade[]) {
    for (const definition of definitions) this.#definitions.set(this.definitionKey(definition), definition)
    this.#unsubscribe = dataSet.onAnyViewChange({
      editingFieldChanged: (tableName, viewId, event) => {
        for (const definition of definitions) {
          if (definition.tableName !== tableName || definition.viewId !== viewId) continue
          const address = { tableName, viewId, rowId: event.rowId, field: definition.targetField }
          const entry = this.#entries.get(this.addressKey(address))
          if (event.field === definition.targetField) {
            if (entry) {
              entry.targetRevision++
              this.recomputeValueStatus(entry, definition)
            }
          } else if (definition.parents.some(parent => parent.field === event.field)) {
            void this.run(address, true).catch(error => this.fail(address, error))
          }
        }
      },
      editingChanged: (tableName, viewId) => this.invalidateChangedRows(tableName, viewId),
      editingDiscarded: (tableName, viewId, ids) => this.invalidateDiscarded(tableName, viewId, ids),
      rowsChanged: (tableName, viewId) => this.invalidateView(tableName, viewId),
      cleared: (tableName, viewId) => this.invalidateView(tableName, viewId),
      requestStateChanged: (tableName, viewId, state) => {
        if (state === RequestState.Loading) this.invalidateView(tableName, viewId)
      },
    })
  }

  private definitionKey(value: Pick<DataViewFieldCascade, 'tableName' | 'viewId' | 'targetField'>): string {
    return JSON.stringify([value.tableName, value.viewId, value.targetField])
  }

  private addressKey(value: DataViewFieldCascadeAddress): string {
    return JSON.stringify([value.tableName, value.viewId, value.rowId, value.field])
  }

  private definition(address: DataViewFieldCascadeAddress): DataViewFieldCascade {
    const definition = this.#definitions.get(this.definitionKey({ ...address, targetField: address.field }))
    if (!definition || this.#disposed || this.dataSet.destroyed) {
      throw new Error('FIELD_CASCADE_ADDRESS: 定义不存在或空间已销毁')
    }
    return definition
  }

  getState(address: DataViewFieldCascadeAddress): DataViewFieldCascadeState {
    const definition = this.definition(address)
    const entry = this.#entries.get(this.addressKey(address))
    if (entry?.parents) {
      const view = this.dataSet.getView(address.tableName, address.viewId)
      try {
        if (!view || view.destroyed || !this.sameParents(entry.parents,
          this.parentValues(view, definition, address.rowId))) this.invalidate(entry)
        else this.recomputeValueStatus(entry, definition)
      } catch { this.invalidate(entry) }
    }
    return copyState(entry?.state ?? idle)
  }

  onChange(listener: (address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void): () => void {
    if (this.#disposed) throw new Error('FIELD_CASCADE_DISPOSED')
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  refresh(address: DataViewFieldCascadeAddress): Promise<DataViewFieldCascadeState> {
    return this.run(address, false)
  }

  private publish(entry: Entry, state: DataViewFieldCascadeState): DataViewFieldCascadeState {
    entry.state = copyState(state)
    for (const listener of this.#listeners) {
      try { listener(Object.freeze({ ...entry.address }), copyState(entry.state)) } catch (error) {
        logger.warn(`字段级联状态订阅回调失败 (${error instanceof Error ? 'Error' : typeof error})`)
      }
    }
    return copyState(entry.state)
  }

  private fail(address: DataViewFieldCascadeAddress, error: unknown): DataViewFieldCascadeState {
    const key = this.addressKey(address)
    const entry = this.#entries.get(key)
    if (!entry || this.#disposed) return copyState(idle)
    return this.publish(entry, { status: 'error', options: [], valueStatus: 'unverified',
      error: error instanceof Error ? error.message : String(error) })
  }

  private parentValues(view: DataView, definition: DataViewFieldCascade, rowId: string | number): readonly unknown[] {
    const row = view.getEditingRow(rowId)
    if (!row || view.getPkKey(row) === undefined) throw new Error('FIELD_CASCADE_ROW: 目标编辑行不存在或无主键')
    return definition.parents.map(parent => {
      if (!Object.hasOwn(row, parent.field) || row[parent.field] === undefined) {
        throw new Error(`FIELD_CASCADE_PARENT: 缺少父字段 ${parent.field}`)
      }
      if (view.fieldAccess(row, parent.field).read !== 'visible') {
        throw new Error(`FIELD_CASCADE_PARENT: 父字段不可读 ${parent.field}`)
      }
      return scalar(row[parent.field], parent.field)
    })
  }

  private sameParents(left: readonly unknown[], right: readonly unknown[]): boolean {
    return left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  }

  private invalidate(entry: Entry): void {
    entry.generation++
    delete entry.parents
    this.publish(entry, idle)
  }

  private invalidateView(tableName: string, viewId: string): void {
    for (const entry of this.#entries.values()) {
      if (entry.address.tableName === tableName && entry.address.viewId === viewId) this.invalidate(entry)
    }
  }

  private invalidateDiscarded(tableName: string, viewId: string, ids: ReadonlyArray<string | number> | undefined): void {
    if (ids?.length === 0) return
    const selected = ids === undefined ? undefined : new Set(ids)
    for (const entry of this.#entries.values()) {
      if (entry.address.tableName === tableName && entry.address.viewId === viewId
        && (selected === undefined || selected.has(entry.address.rowId))) this.invalidate(entry)
    }
  }

  private invalidateChangedRows(tableName: string, viewId: string): void {
    for (const entry of this.#entries.values()) {
      if (entry.address.tableName !== tableName || entry.address.viewId !== viewId || !entry.parents) continue
      const definition = this.#definitions.get(this.definitionKey({ ...entry.address, targetField: entry.address.field }))
      const view = this.dataSet.getView(tableName, viewId)
      if (!definition || !view) { this.invalidate(entry); continue }
      try {
        if (!this.sameParents(entry.parents, this.parentValues(view, definition, entry.address.rowId))) this.invalidate(entry)
        else this.recomputeValueStatus(entry, definition)
      } catch { this.invalidate(entry) }
    }
  }

  private recomputeValueStatus(entry: Entry, definition: DataViewFieldCascade): void {
    if (entry.state.status !== 'ready') return
    const view = this.dataSet.getView(definition.tableName, definition.viewId)
    const row = view?.getEditingRow(entry.address.rowId)
    if (!view || !row || view.fieldAccess(row, definition.targetField).read !== 'visible') {
      this.invalidate(entry)
      return
    }
    let value: string | number | boolean | null
    try { value = scalar(row[definition.targetField], definition.targetField) }
    catch (error) { this.fail(entry.address, error); return }
    const valueStatus = value === null ? 'empty'
      : entry.state.options.some(option => Object.is(option[definition.optionsView.valueField], value)) ? 'valid' : 'invalid'
    if (valueStatus !== entry.state.valueStatus) this.publish(entry, { ...entry.state, valueStatus })
  }

  private async run(address: DataViewFieldCascadeAddress, automatic: boolean): Promise<DataViewFieldCascadeState> {
    const definition = this.definition(address)
    const key = this.addressKey(address)
    let entry = this.#entries.get(key)
    if (!entry) {
      entry = { address: { ...address }, state: idle, generation: 0, targetRevision: 0 }
      this.#entries.set(key, entry)
    }
    const generation = ++entry.generation
    const targetRevision = entry.targetRevision
    const target = this.dataSet.getView(definition.tableName, definition.viewId)
    const optionsView = this.dataSet.getView(definition.optionsView.tableName, definition.optionsView.viewId)
    try {
      if (!target || !optionsView || target.destroyed || optionsView.destroyed) throw new Error('FIELD_CASCADE_VIEW: 视图已失效')
      const rowsIdentity = target.rows
      const parents = this.parentValues(target, definition, address.rowId)
      const initialRow = target.getEditingRow(address.rowId)
      if (!initialRow || target.fieldAccess(initialRow, definition.targetField).read !== 'visible') {
        throw new Error(`FIELD_CASCADE_TARGET: 目标字段不可读 ${definition.targetField}`)
      }
      entry.parents = parents
      const context = Object.fromEntries(definition.parents.map((parent, index) => [parent.parameter, parents[index]]))
      this.publish(entry, { status: 'loading', options: [], valueStatus: 'unverified' })
      const fields = [...new Set([definition.optionsView.valueField, definition.optionsView.labelField])]
      const options = await optionsView.queryOptionRows({ fields, context })
      if (this.#disposed || this.dataSet.destroyed || entry.generation !== generation
        || this.dataSet.getView(definition.tableName, definition.viewId) !== target
        || this.dataSet.getView(definition.optionsView.tableName, definition.optionsView.viewId) !== optionsView
        || target.isDestroyed() || optionsView.isDestroyed() || target.rows !== rowsIdentity
        || !this.sameParents(parents, this.parentValues(target, definition, address.rowId))) {
        return copyState(idle)
      }
      const row = target.getEditingRow(address.rowId)
      if (!row) throw new Error('FIELD_CASCADE_ROW: 编辑行已失效')
      if (target.fieldAccess(row, definition.targetField).read !== 'visible') {
        throw new Error(`FIELD_CASCADE_TARGET: 目标字段不可读 ${definition.targetField}`)
      }
      const current = scalar(row[definition.targetField], definition.targetField)
      const valid = options.some(option => Object.is(option[definition.optionsView.valueField], current))
      let valueStatus: DataViewFieldCascadeState['valueStatus'] = current === null ? 'empty' : valid ? 'valid' : 'invalid'
      if (automatic && entry.targetRevision === targetRevision) {
        const policy = definition.valuePolicy
        const clear = policy.mode === 'clear' || (policy.mode === 'retain-valid' && current !== null && !valid)
        if (clear) {
          if (target.fieldAccess(row, definition.targetField).write !== 'allowed') {
            throw new Error(`FIELD_CASCADE_WRITE: 目标字段不可写 ${definition.targetField}`)
          }
          target.updateEditingValue(address.rowId, definition.targetField, policy.clearValue)
          valueStatus = policy.clearValue === null ? 'empty'
            : options.some(option => Object.is(option[definition.optionsView.valueField], policy.clearValue)) ? 'valid' : 'invalid'
        }
      }
      return this.publish(entry, { status: 'ready', options, valueStatus })
    } catch (error) {
      if (entry.generation !== generation || this.#disposed) return copyState(idle)
      return this.fail(address, error)
    }
  }

  destroy(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribe()
    for (const entry of this.#entries.values()) entry.generation++
    this.#entries.clear()
    this.#listeners.clear()
  }
}
