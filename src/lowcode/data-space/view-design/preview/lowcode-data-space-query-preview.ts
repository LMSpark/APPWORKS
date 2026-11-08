/**
 * @module app:lowcode/data-space/view-design/preview/lowcode-data-space-query-preview
 * 职责：经公共宿主持有查询预览的独立PageRuntime，查询实际命名DataView并管理释放。
 * 边界：不复制正式数据或权限，不保存配置；原DataView执行过滤、依赖与分页。
 * AI用途：原生设计页将标准组件绑定到runtime和dataViewKey，关闭时dispose。
 */
import * as SparkData from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {PageRuntime} from '@spark-appworks/spark-project-model'

/** 一次预览调用的参数值；不修改参数声明或场景文件。 */
type DataSpacePreviewQuery = Readonly<{
  /** 本次调用参数值，按原类型叠加视图配置参数。 */
  context: SparkData.DataViewQueryContext
  /** 显式覆盖本次请求的每页条数，按SPARK API合同范围1至1000。 */
  pageSize?: number
  /** 替换本预览目标视图的查询配置；省略沿用，空对象恢复默认。不保存到场景文件。 */
  queryConfig?: SparkData.ViewMetadata['queryConfig']
}>

/** 查询实例只供预览呈现；保留原查询的数据权限，释放后不得继续使用。 */
export class LowcodeDataSpaceQueryPreview {
  /** 仅本预览持有的运行实例，供标准子组件解析完整绑定。 */
  readonly runtime: PageRuntime
  readonly #session: NativePageRuntimeSession
  /** 目标空间ID@正式模型注册名@命名视图ID。 */
  readonly dataViewKey: string
  readonly #contexts = new Map<SparkData.DataView, SparkData.DataViewQueryContext>()
  readonly #disposeListeners = new Set<() => void>()
  #disposed = false
  #pending = false
  #unsubscribe: (() => void) | undefined

  /** 接管已装配的独立DataSet；文件通知或调用方关闭时释放。 */
  constructor(dataSet: SparkData.DataSet, modelName: string, viewId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; subscribe(listener: () => void): () => void}>) {
    const scenarioId = dataSet.scenarioId
    if (!scenarioId) throw new Error('SCENARIO_VIEW_PREVIEW_IDENTITY: 预览空间身份缺失')
    this.dataViewKey = SparkData.buildDataViewKey(modelName, viewId, scenarioId)
    this.#session = new NativePageRuntimeSession()
    this.runtime = this.#session.acquire({
      pageId: '/features/data-platform/data-set-management/design/ui/data-set-design-page',
      scenarioIds: [scenarioId],
      targetId: [scenarioId, modelName, viewId].join(':'),
      loadScenario: () => Promise.resolve(dataSet),
    })
    for (const table of Object.values(dataSet.tables)) for (const view of Object.values(table.views)) {
      this.#contexts.set(view, structuredClone(view.queryContext))
    }
    this.#unsubscribe = lifecycle.subscribe(() => this.dispose())
  }

  /** 已装配的实际命名视图，不是结果快照或另一份本地行。 */
  get view(): SparkData.DataView {
    this.assertCurrent()
    const view = this.runtime.resolveView(this.dataViewKey)
    if (!view) throw new Error('SCENARIO_VIEW_PREVIEW_VIEW: 预览视图不存在')
    return view
  }

  /** 当前目标沿具体parentResult链最终依赖的查询视图；参数和请求设置归它所有。 */
  get queryView(): SparkData.DataView {
    let view = this.view
    for (let parent = SparkData.DataViewParentResult.resolve(view); parent; parent = SparkData.DataViewParentResult.resolve(view)) view = parent
    return view
  }

  /** 同一根查询的实际具名消费视图，按父先子后排列；返回原视图，不复制运行数据。 */
  get resultViews(): readonly SparkData.DataView[] {
    const result = [this.queryView], seen = new Set(result)
    for (const parent of result) {
      for (const view of this.#contexts.keys()) {
        if (!seen.has(view) && view.queryConfig.parentResult && SparkData.DataViewParentResult.resolve(view) === parent) {
          seen.add(view); result.push(view)
        }
      }
    }
    return result
  }

  get disposed(): boolean {return this.#disposed}

  /**
   * 订阅本次预览的释放，供宿主撤下旧结果与操作；不订阅业务数据。
   * @param listener 运行实例释放后同步调用一次；已经释放时立即调用。
   * @returns 取消订阅函数；宿主卸载时调用，不影响预览本身。
   */
  onDispose(listener: () => void): () => void {
    if (this.#disposed) {listener(); return () => {}}
    this.#disposeListeners.add(listener)
    return () => {this.#disposeListeners.delete(listener)}
  }

  /** 将参数表绑定为查询级联输入；依赖视图只失效待用，结果视图自动重查。 */
  bindInputs(source: SparkData.DataView, bindings: readonly SparkData.DataViewCascadeInputBinding[]): void {
    this.assertCurrent()
    const target = this.queryView, ds = target.dataSet
    if (!ds || source.dataSet !== ds) throw new Error('SCENARIO_VIEW_PREVIEW_INPUT: 输入必须属于本次预览实例')
    for (const view of this.#contexts.keys()) {
      if (view === source || view.queryConfig.parentResult) continue
      const inputs = view === target ? bindings : bindings.filter(binding => binding.target === 'queryContext')
      if (!inputs.length) continue
      ds.addCascade({parentTable: source.tableName, parentViewId: source.viewId,
        childTable: view.tableName, childViewId: view.viewId, filterBindings: [], inputBindings: inputs, autoLoad: view === target})
    }
  }

  /** 已绑定输入的重试入口；查询配置、依赖和数据权限均由DataView执行。 */
  async refresh(): Promise<void> {
    this.assertCurrent()
    await this.queryView.refresh()
    for (const view of this.resultViews) {
      if (view !== this.queryView) await view.refresh()
      this.assertCurrent()
      if (view.requestState !== SparkData.RequestState.Loaded) throw view.loadingError ?? new Error('SCENARIO_VIEW_PREVIEW_QUERY: 来源链查询未完成')
    }
    this.assertCurrent()
    if (this.view.requestState !== SparkData.RequestState.Loaded) throw this.view.loadingError ?? new Error('SCENARIO_VIEW_PREVIEW_QUERY: 正式查询未完成')
  }

  private assertCurrent(): void {
    if (this.#disposed) throw new Error('SCENARIO_VIEW_PREVIEW_STALE: 预览已关闭或配置已变化')
    this.lifecycle.assertCurrent()
  }

  /** 按本次JSON参数查询；保留类型、视图默认参数、依赖过滤和分页，不写回设计配置。 */
  async query(input: DataSpacePreviewQuery): Promise<void> {
    if (this.#pending) throw new Error('SCENARIO_VIEW_PREVIEW_PENDING: 查询仍在进行')
    this.#pending = true
    try {
      this.assertCurrent()
      const scenarioId = this.runtime.call.scenarioIds[0]
      if (!scenarioId) throw new Error('SCENARIO_VIEW_PREVIEW_IDENTITY: 预览空间身份缺失')
      const context = PageRuntime.parseScenarioInputs(JSON.stringify({[scenarioId]: input.context}))[scenarioId]
      if (!context) throw new Error('SCENARIO_VIEW_PREVIEW_INPUT: 查询参数必须是JSON对象')
      if (input.pageSize !== undefined && (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 1000)) {
        throw new Error('预览每页条数必须为1至1000的整数')
      }
      const target = this.view
      const queryConfig = input.queryConfig === undefined ? target.queryConfig : SparkData.DataViewQuery.parse(input.queryConfig)
      SparkData.DataViewQuery.validateFields(queryConfig, new Set(target.queryColumns.map(column => column.name)))
      target.queryConfig = queryConfig
      for (const [view, original] of this.#contexts) {
        if (!view.queryConfig.parentResult) view.queryContext = structuredClone({...original, ...context})
      }
      // 预览每次运行清空旧输入的结果与选择，再交回公共依赖请求链。
      for (const view of this.#contexts.keys()) view.resetState()
      const view = this.queryView
      view.page = 1
      if (input.pageSize !== undefined) view.pageSize = input.pageSize
      await this.refresh()
      this.assertCurrent()
      if (view.requestState !== SparkData.RequestState.Loaded) throw view.loadingError ?? new Error('SCENARIO_VIEW_PREVIEW_QUERY: 正式查询未完成')
    } catch (cause) {
      try {this.assertCurrent()} catch {this.dispose()}
      throw cause
    }
    finally {this.#pending = false}
  }

  /** 为现有四文件预览提供可显示快照；不输出隐藏字段或原始脱敏值。 */
  snapshot() {
    const view = this.view
    if (view.requestState !== SparkData.RequestState.Loaded) throw new Error('SCENARIO_VIEW_PREVIEW_QUERY: 尚未取得有效查询结果')
    const {total, countReported, fields, rows} = view.readSnapshot()
    return {total, countReported, fields, rows}
  }

  /** 释放预览及其运行数据；取消不改动元数据和场景文件。 */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true; this.#unsubscribe?.(); this.#unsubscribe = undefined
    this.#session.dispose(); this.#contexts.clear()
    const listeners = [...this.#disposeListeners]
    this.#disposeListeners.clear()
    for (const listener of listeners) listener()
  }
}
