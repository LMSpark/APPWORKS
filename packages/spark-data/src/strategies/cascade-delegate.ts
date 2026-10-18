import { Logger } from '@spark-appworks/spark-utils'
import { RequestState } from '../types'
import type { DataView } from '../data-view'
import { DataViewCascadeValueBinding } from './cascade/cascade-value-binding'
import { DataViewQueryCascadeInputs } from './cascade/query-cascade-inputs'
import type { DataViewQueryContext } from '../types'

const logger = Logger('DataView:Cascade')

/** 视图事件只提供重读信号；输入值快照变化才重新查询。 */
export class CascadeDelegate {
  private cascadeUnsubscribers: Array<() => void> = []
  private generation = 0
  private contextDefaults: DataViewQueryContext | undefined
  private appliedInputs: unknown

  constructor(private readonly host: DataView) {}

  /** 查询编排在父值就绪后应用同一组输入；翻页等不重复覆盖未变化的输入。 */
  applyInputs(): boolean {
    const ds = this.host.dataSet
    if (!ds) return true
    const groups = ds.getParentCascades(this.host.tableName, this.host.viewId)
      .map(cascade => DataViewQueryCascadeInputs.read(ds, cascade))
    if (groups.some(group => group === null)) return false
    const inputs = groups.flatMap(group => group ?? [])
    if (!inputs.length || DataViewCascadeValueBinding.equal(inputs, this.appliedInputs)) return true
    this.contextDefaults ??= structuredClone(this.host.queryContext)
    DataViewQueryCascadeInputs.apply(this.host, inputs, this.contextDefaults)
    this.appliedInputs = structuredClone(inputs)
    return true
  }

  setupCascade(): void {
    this.teardownCascade()
    const dataSet = this.host.dataSet
    if (!dataSet) return
    const cascades = dataSet.getParentCascades(this.host.tableName, this.host.viewId)
    const read = () => cascades.map(cascade => {
      const filter = dataSet.resolveCascadeFilter(cascade), inputs = DataViewQueryCascadeInputs.read(dataSet, cascade)
      return filter === null || inputs === null ? null : {filter, inputs}
    })
    let previous: ReturnType<typeof read> | undefined
    const fail = (error: unknown) => {
      previous = undefined
      this.host.rejectCascade(error)
      logger.error(`级联输入 ${this.host.tableName}:${this.host.viewId} 失败`, error)
    }
    try { previous = read() } catch (error) { fail(error) }
    const generation = this.generation
    const handler = () => {
      try {
        const next = read()
        if (DataViewCascadeValueBinding.equal(previous, next)) return
        const manual = this.host.queryConfig.autoQuery === false
        const automatic = !manual && cascades.some((cascade, index) => cascade.autoLoad !== false
          && !DataViewCascadeValueBinding.equal(previous?.[index], next[index]))
        const changedInput = cascades.some((cascade, index) => (cascade.inputBindings?.length ?? 0) > 0
          && !DataViewCascadeValueBinding.equal(previous?.[index], next[index]))
        previous = next
        // 正在等待父查询的编排会在 await 后读取最新值。
        if (this.host.requestState === RequestState.Preparing && !manual) return
        if (next.some(value => value === null)) {
          this.host.clearAll()
          return
        }
        this.host.page = 1
        if (manual || !automatic && changedInput) this.host.resetState()
        if (automatic) void this.host.refresh().catch((error: unknown) => {
          if (generation === this.generation && !this.host.destroyed) fail(error)
        })
      } catch (error) { fail(error) }
    }
    const sources = new Set(cascades.map(cascade => `${cascade.parentTable}@${cascade.parentViewId}`))
    for (const source of sources) {
      const cascade = cascades.find(candidate => `${candidate.parentTable}@${candidate.parentViewId}` === source)
      if (!cascade) continue
      const view = dataSet.getView(cascade.parentTable, cascade.parentViewId)
      if (!view) throw new Error(`CASCADE_VALUE_VIEW: 输入视图不存在 ${source}`)
      for (const event of ['rowsChanged', 'cleared', 'currentRowChanged', 'selectedRowsChanged',
        'editingFieldChanged', 'editingChanged', 'editingDiscarded', 'requestStateChanged'] as const) {
        view.events.on(event, handler)
        this.cascadeUnsubscribers.push(() => view.events.off(event, handler))
      }
    }
  }

  teardownCascade(): void {
    this.generation++
    for (const unsubscribe of this.cascadeUnsubscribers) unsubscribe()
    this.cascadeUnsubscribers = []
  }

  destroy(): void {
    this.teardownCascade()
  }
}
