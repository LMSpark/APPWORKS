import { Logger } from '@spark-appworks/spark-utils'
import {DataViewParentResult} from '../../query/data-view-parent-result'
import { RequestState } from '../../types'
import type { DataView } from '../../data-view'
import { DataViewCascadeValueBinding } from './cascade-value-binding'
import { DataViewQueryCascadeInputs } from './query-cascade-inputs'
import type { DataViewQueryContext } from '../../types'

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
    if (this.host.queryConfig.parentResult) {
      // DataTable首次挂DataSet时尚未进入tables目录，正式订阅由结构就绪回调重挂。
      if (dataSet.tables[this.host.tableName] === this.host.dataTable) this.setupParentResult()
      return
    }
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
        // 空展示正在等待父查询时，原编排会在 await 后读取最新输入；不要提前完成原调用。
        // 已有旧行则仍走下方重置，避免新父查询失败后残留上一父对象的数据。
        if (this.host.requestState === RequestState.Preparing && !manual && this.host.rows.length === 0) return
        if (next.some(value => value === null)) {
          this.host.clearAll()
          return
        }
        this.host.page = 1
        // 父输入已变，旧结果与选择不能在新查询失败后仍冒充当前父对象的数据。
        // resetState 保留原生未保存/未确认提交守卫；拒绝时由 fail 留下可见错误。
        if (manual || automatic || changedInput) this.host.resetState()
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

  /** 父结果按引用与请求代次订阅，不使用字段级联的结构相等算法。 */
  private setupParentResult(): void {
    const parent = DataViewParentResult.resolve(this.host), source = this.host.queryConfig.parentResult
    if (!parent || !source) return
    const read = () => ({state: parent.requestState, disposed: parent.destroyed,
      capture: !parent.destroyed && parent.requestState === RequestState.Loaded ? parent.captureChildResult(source.childModelName) : undefined})
    const generation = this.generation
    const fail = (error: unknown) => {if (!this.host.destroyed) this.host.rejectCascade(error)}
    let previous: ReturnType<typeof read> | undefined
    try {previous = read()} catch (error) {fail(error)}
    let observedResult = previous?.capture !== undefined
    const handler = () => {
      if (this.host.destroyed || generation !== this.generation) return
      try {
        const next = read()
        if (next.state === previous?.state && next.disposed === previous.disposed
          && next.capture?.result === previous.capture?.result && next.capture?.parentRow === previous.capture?.parentRow
          && next.capture?.version === previous.capture?.version) return
        const hadResult = observedResult
        previous = next
        if (next.capture) observedResult = true
        if ((this.host.requestState === RequestState.Preparing || this.host.requestState === RequestState.Loading) && this.host.rows.length === 0) {
          if (hadResult && next.capture && this.host.queryConfig.autoQuery !== false) void this.host.requestRefresh().catch(fail)
          return
        }
        this.host.resetState()
        if (next.disposed || next.state === RequestState.Failed) {fail(new Error('DATA_VIEW_PARENT_SOURCE: 父查询失败或已释放')); return}
        if (next.capture && this.host.queryConfig.autoQuery !== false) queueMicrotask(() => {
          if (generation === this.generation && !this.host.destroyed && this.host.requestState === RequestState.Idle) {
            void this.host.requestData().catch(fail)
          }
        })
      } catch (error) {
        try {this.host.resetState()} catch (resetError) {fail(resetError); return}
        fail(error)
      }
    }
    for (const event of ['rowsChanged', 'cleared', 'currentRowChanged', 'requestStateChanged', 'configChanged', 'disposing'] as const) {
      parent.events.on(event, handler)
      this.cascadeUnsubscribers.push(() => parent.events.off(event, handler))
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
