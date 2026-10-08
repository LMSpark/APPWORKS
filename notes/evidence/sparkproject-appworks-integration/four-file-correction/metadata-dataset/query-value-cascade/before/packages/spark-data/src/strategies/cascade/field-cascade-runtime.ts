import type { DataSet } from '../../dataset'
import type { DataViewFieldCascade, DataViewFieldCascadeAddress, DataViewFieldCascadeState } from '../../types'
import { Logger } from '@spark-appworks/spark-utils'
import { DataViewFieldCascadeBinding } from './field-cascade-binding'

const logger = Logger('DataView:FieldCascade')
type Entry = {
  address: DataViewFieldCascadeAddress
  binding: DataViewFieldCascadeBinding
  state: DataViewFieldCascadeState
  generation: number
  parents?: readonly unknown[]
  targetRevision: number
  initialized: boolean
  waiting: boolean
}
const idle: DataViewFieldCascadeState = { status: 'idle', options: [], valueStatus: 'unverified' }

function copyState(state: DataViewFieldCascadeState): DataViewFieldCascadeState {
  return Object.freeze({ ...state, options: Object.freeze(state.options.map(row => Object.freeze({ ...row }))) })
}

/** 级联按输入值快照执行；选项结果和子值写入共享同一代次。 */
export class DataViewFieldCascadeRuntime {
  readonly #entries = new Map<string, Entry>()
  readonly #listeners = new Set<(address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void>()
  readonly #unsubscribe: () => void
  #disposed = false

  constructor(private readonly dataSet: DataSet, definitions: readonly DataViewFieldCascade[]) {
    for (const definition of definitions) {
      const address = { tableName: definition.tableName, viewId: definition.viewId, field: definition.targetField }
      const entry: Entry = { address, binding: new DataViewFieldCascadeBinding(dataSet, definition),
        state: idle, generation: 0, targetRevision: 0, initialized: false, waiting: false }
      this.#entries.set(this.key(address), entry)
      this.prime(entry)
    }
    this.#unsubscribe = dataSet.onAnyViewChange({
      editingFieldChanged: (table, view, event) => {
        for (const entry of this.#entries.values()) {
          if (entry.binding.isTargetEdit(table, view, event)) entry.targetRevision++
        }
        this.synchronize(table, view)
      },
      currentRowChanged: (table, view) => {
        this.invalidateTarget(table, view)
        this.synchronize(table, view)
      },
      selectedRowsChanged: (table, view) => this.synchronize(table, view),
      rowsChanged: (table, view) => {
        this.invalidateTarget(table, view)
        this.synchronize(table, view)
      },
      cleared: (table, view) => this.synchronize(table, view),
      requestStateChanged: (table, view) => this.synchronize(table, view),
      editingChanged: (table, view) => this.synchronize(table, view),
      editingDiscarded: (table, view, ids) => {
        for (const entry of this.#entries.values()) {
          if (!entry.binding.discardsTarget(table, view, ids)) continue
          entry.targetRevision++
          this.invalidate(entry)
          this.prime(entry)
        }
      },
    })
  }

  private key(address: DataViewFieldCascadeAddress): string {
    return JSON.stringify([address.tableName, address.viewId, address.field])
  }

  private entry(address: DataViewFieldCascadeAddress): Entry {
    if (Object.keys(address).some(key => !['tableName', 'viewId', 'field'].includes(key))) {
      throw new Error('FIELD_CASCADE_ADDRESS: 只接受值绑定地址 tableName/viewId/field')
    }
    const entry = this.#entries.get(this.key(address))
    if (!entry || this.#disposed || this.dataSet.destroyed) throw new Error('FIELD_CASCADE_ADDRESS: 定义不存在或空间已销毁')
    return entry
  }

  private prime(entry: Entry): void {
    try {
      const parents = entry.binding.parents()
      if (parents !== undefined && entry.binding.targetReady()) {
        entry.parents = parents
        entry.initialized = true
        entry.waiting = false
      }
    } catch (error) { this.fail(entry, error) }
  }

  private invalidateTarget(tableName: string, viewId: string): void {
    for (const entry of this.#entries.values()) {
      if (entry.address.tableName === tableName && entry.address.viewId === viewId) entry.targetRevision++
    }
  }

  private synchronize(tableName: string, viewId: string): void {
    if (this.#disposed) return
    for (const entry of this.#entries.values()) {
      if (!entry.binding.references(tableName, viewId)) continue
      try {
        const parents = entry.binding.parents()
        if (parents === undefined || !entry.binding.targetReady()) {
          entry.waiting = entry.initialized
          this.invalidate(entry)
          continue
        }
        if (!entry.initialized) {
          entry.parents = parents
          entry.initialized = true
          continue
        }
        if (entry.waiting || !DataViewFieldCascadeBinding.equal(entry.parents, parents)) {
          void this.run(entry, true)
        } else this.recompute(entry)
      } catch (error) { this.fail(entry, error) }
    }
  }

  getState(address: DataViewFieldCascadeAddress): DataViewFieldCascadeState {
    const entry = this.entry(address)
    this.recompute(entry)
    return copyState(entry.state)
  }

  onChange(listener: (address: DataViewFieldCascadeAddress, state: DataViewFieldCascadeState) => void): () => void {
    if (this.#disposed) throw new Error('FIELD_CASCADE_DISPOSED')
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  refresh(address: DataViewFieldCascadeAddress): Promise<DataViewFieldCascadeState> {
    return this.run(this.entry(address), false)
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

  private fail(entry: Entry, error: unknown): DataViewFieldCascadeState {
    entry.generation++
    return this.publish(entry, { status: 'error', options: [], valueStatus: 'unverified',
      error: error instanceof Error ? error.message : String(error) })
  }

  private invalidate(entry: Entry): void {
    entry.generation++
    if (entry.state.status !== 'idle') this.publish(entry, idle)
  }

  private recompute(entry: Entry): void {
    if (entry.state.status !== 'ready') return
    try {
      const value = entry.binding.captureTarget().value
      const evaluation = entry.binding.options().evaluate(value, entry.state.options)
      if (evaluation.status !== entry.state.valueStatus) this.publish(entry, { ...entry.state, valueStatus: evaluation.status })
    } catch (error) { this.fail(entry, error) }
  }

  private async run(entry: Entry, automatic: boolean): Promise<DataViewFieldCascadeState> {
    const generation = ++entry.generation
    const revision = entry.targetRevision
    try {
      const parents = entry.binding.parents()
      if (parents === undefined || !entry.binding.targetReady()) {
        entry.waiting = entry.initialized
        this.invalidate(entry)
        return copyState(idle)
      }
      const target = entry.binding.captureTarget()
      const options = entry.binding.options()
      const definition = entry.binding.definition
      entry.parents = parents
      entry.initialized = true
      entry.waiting = false
      const context = Object.fromEntries(definition.parents.map((parent, index) => [parent.parameter, parents[index]]))
      this.publish(entry, { status: 'loading', options: [], valueStatus: 'unverified' })
      const rows = await options.view.queryOptionRows({ fields: options.fields, context })
      if (this.#disposed || this.dataSet.destroyed || entry.generation !== generation || !options.isCurrent()
        || !DataViewFieldCascadeBinding.equal(parents, entry.binding.parents())) return copyState(idle)
      const current = entry.binding.captureTarget().value
      let evaluation = options.evaluate(current, rows)
      if (automatic && entry.targetRevision === revision && target.isCurrent()
        && DataViewFieldCascadeBinding.equal(target.value, current)) {
        const policy = definition.valuePolicy
        if (policy.mode !== 'retain') {
          const next = policy.mode === 'clear' ? policy.clearValue
            : evaluation.status === 'invalid' ? (evaluation.hasRetained ? evaluation.retained : policy.clearValue) : current
          if (!DataViewFieldCascadeBinding.equal(current, next)) target.write(next)
          evaluation = options.evaluate(entry.binding.captureTarget().value, rows)
        }
      }
      if (entry.generation !== generation) return copyState(idle)
      return this.publish(entry, { status: 'ready', options: rows, valueStatus: evaluation.status })
    } catch (error) {
      if (entry.generation !== generation || this.#disposed) return copyState(idle)
      return this.fail(entry, error)
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
