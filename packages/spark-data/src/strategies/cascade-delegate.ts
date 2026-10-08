import { Logger } from '@spark-appworks/spark-utils'
import { RequestState } from '../types'
import type { DataView } from '../data-view'
import { DataViewCascadeValueBinding } from './cascade/cascade-value-binding'

const logger = Logger('DataView:Cascade')

/** 视图事件只提供重读信号；输入值快照变化才重新查询。 */
export class CascadeDelegate {
  private cascadeUnsubscribers: Array<() => void> = []
  private generation = 0

  constructor(private readonly host: DataView) {}

  setupCascade(): void {
    this.teardownCascade()
    const dataSet = this.host.dataSet
    if (!dataSet) return
    const cascades = dataSet.getParentCascades(this.host.tableName, this.host.viewId)
    const read = () => cascades.map(cascade => dataSet.resolveCascadeFilter(cascade))
    let previous: ReturnType<typeof read> | undefined
    const fail = (error: unknown) => {
      this.host.rejectCascade(error)
      logger.error(`级联输入 ${this.host.tableName}:${this.host.viewId} 失败`, error)
    }
    try { previous = read() } catch (error) { fail(error) }
    const generation = this.generation
    const handler = () => {
      try {
        const next = read()
        if (DataViewCascadeValueBinding.equal(previous, next)) return
        const automatic = cascades.some((cascade, index) => cascade.autoLoad !== false
          && !DataViewCascadeValueBinding.equal(previous?.[index], next[index]))
        previous = next
        // 正在等待父查询的编排会在 await 后读取最新值。
        if (this.host.requestState === RequestState.Preparing) return
        if (next.some(value => value === null)) {
          this.host.clearAll()
          return
        }
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
