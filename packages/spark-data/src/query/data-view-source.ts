/**
 * @module @spark-appworks/spark-data:query/data-view-source
 * 职责：统一显式资源来源的预览、采用和原生修改取消保护。
 * 边界：不读取具体存储，不维护行草稿，不将来源采用当作保存或事务。
 * AI用途：扩展资源来源适配时复用DataView入口及同源修改保护，不在页面复制取消守卫。
 */
import type {DataView} from '../data-view'
import {RequestState} from '../types'

/** 来源预览；只承载存储原文和本地基线版本，不是业务行或权限凭据。 */
export type DataViewSourceSnapshot = Readonly<{
  /** 资源本地基线版本；null表示资源尚不存在。由资源适配解释并再次核对。 */
  version: string | number | null
  /** 已展示的远端原文；null表示远端不存在，不能解释为空集合。 */
  content: string | null
}>

/** 显式采用来源时允许取消的原生视图修改。 */
export type DataViewSourceAdoptOptions = Readonly<{
  /** 仅限同源视图；未列出的视图有修改时拒绝采用。省略时不允许取消任何修改。 */
  discardViews?: readonly DataView[]
}>

/** 来源存储的已保存版本；身份由适配器解释，与DataSet.version及当前查询代次分开。 */
export type DataViewSourceVersion = Readonly<{
  /** 原存储中的版本身份。 */ version: string | number
  /** 供用户选择的版本名称。 */ label: string
  /** 存储返回的毫秒时间戳；未知时为null。 */ lastModified: number | null
}>

/** 查询执行器可选的来源适配；具体存储保留冲突、作用域及未知结果核验责任。 */
export type DataViewSourceAdapter = Readonly<{
  /** 当前同一存储来源的全部视图，不只包含已查询视图；不同目标不能混入。 */
  views(view: DataView): readonly DataView[]
  /** 读取远端而不改变任何本地基线、查询结果或草稿。 */
  preview(view: DataView): Promise<DataViewSourceSnapshot>
  /** 再读并核版本和原文；成功后紧邻同步应用前调用beforeApply，失败不得应用。 */
  adopt(view: DataView, snapshot: DataViewSourceSnapshot, hooks: Readonly<{
    /** 异步校验后检查调用方仍有效；不得将此检查替代存储冲突核验。 */
    assertCurrent(): void
    /** 存储确认可同步应用后调用一次：检查并取消明确允许放弃的原生修改。 */
    beforeApply(): void
  }>): Promise<void>
  /** 可选来源历史；不接纳历史内容、不保存或恢复DataView行。 */
  history?: Readonly<{
    /** 列出原存储版本，不构造本地版本号。 */ list(view: DataView): Promise<readonly DataViewSourceVersion[]>
    /** 预览指定历史原文；恢复须由对应语义资源转换成DataView变更并提交。 */ preview(view: DataView, version: string | number): Promise<string>
    /** 为干净已保存的来源创建快照；每次异步边界、写入前及回读后核对hooks。 */
    create(view: DataView, hooks: Readonly<{assertCurrent(): void}>): Promise<void>
  }>
}>

/** 内部执行器：只保护DataView生命周期，来源I/O留给绑定的适配器。 */
export class DataViewSource {
  /** 由DataView以当前实例、唯一查询来源适配和原生身份校验创建，不由业务页面独立构造。 */
  constructor(private readonly view: DataView, private readonly adapter: DataViewSourceAdapter,
    private readonly assertIdentity: (view: DataView) => void) {}

  /** 读取来源并核对前后绑定身份，不接纳结果或修改视图。 */
  async preview(): Promise<DataViewSourceSnapshot> {
    const baseline = this.identity(this.view)
    const snapshot = await this.adapter.preview(this.view)
    if (baseline !== this.identity(this.view)) throw new Error('DATA_VIEW_SOURCE_STALE: 来源绑定在读取期间改变')
    return Object.freeze({...snapshot})
  }

  /** 列出真实来源历史，不改变当前查询、编辑或已确认基线。 */
  async listVersions(): Promise<readonly DataViewSourceVersion[]> {
    const baseline = this.identity(this.view), history = this.history()
    const result = await history.list(this.view)
    if (baseline !== this.identity(this.view) || history !== this.adapter.history) throw new Error('DATA_VIEW_SOURCE_STALE: 历史来源在读取期间改变')
    return result.map(item => Object.freeze({...item}))
  }

  /** 读取指定来源版本；历史内容不能直接作为当前来源采用或查询回执。 */
  async previewVersion(version: string | number): Promise<string> {
    const baseline = this.identity(this.view), history = this.history()
    const result = await history.preview(this.view, version)
    if (baseline !== this.identity(this.view) || history !== this.adapter.history) throw new Error('DATA_VIEW_SOURCE_STALE: 历史来源在读取期间改变')
    return result
  }

  /** 仅同源全部视图干净且在整个操作期间未变化时，允许存储适配创建来源快照。 */
  async createVersion(): Promise<void> {
    const history = this.history(), views = [...this.adapter.views(this.view)], dataSet = this.view.dataSet
    if (!views.includes(this.view) || new Set(views).size !== views.length || views.some(view => view.dataSet !== dataSet)) {
      throw new Error('DATA_VIEW_SOURCE_IDENTITY: 来源视图集合无效')
    }
    const signatures = new Map(views.map(view => [view, this.signature(view)]))
    let changed = false
    const onChanged = () => {changed = true}
    const events = ['editingChanged', 'configChanged', 'cleared', 'mutatingChanged', 'requestStateChanged'] as const
    const assertCurrent = () => {
      const current = this.adapter.views(this.view)
      if (history !== this.adapter.history || current.length !== views.length || current.some(view => !signatures.has(view))) {
        throw new Error('DATA_VIEW_SOURCE_IDENTITY: 来源视图或历史能力已改变')
      }
      for (const view of views) {
        if (changed || signatures.get(view) !== this.signature(view) || view.mutating
          || view.requestState === RequestState.Loading || view.requestState === RequestState.Preparing
          || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
          throw new Error(`DATA_VIEW_SOURCE_DIRTY: ${view.tableName}@${view.viewId} 有修改、正在请求或已变化，不能创建来源快照`)
        }
      }
    }
    assertCurrent()
    for (const view of views) for (const event of events) view.events.on(event, onChanged)
    try {await history.create(this.view, {assertCurrent}); assertCurrent()}
    finally {for (const view of views) for (const event of events) view.events.off(event, onChanged)}
  }

  private history(): NonNullable<DataViewSourceAdapter['history']> {
    const history = this.adapter.history
    if (!history) throw new Error('DATA_VIEW_SOURCE_UNSUPPORTED: 查询来源未提供历史能力')
    return history
  }

  /** 在来源再次核验成功后取消明确批准的修改；异步编辑、未决请求和其他草稿拒绝采用。 */
  async adopt(snapshot: DataViewSourceSnapshot, options: DataViewSourceAdoptOptions): Promise<void> {
    const views = [...this.adapter.views(this.view)], dataSet = this.view.dataSet
    if (!views.includes(this.view) || new Set(views).size !== views.length
      || views.some(view => view.dataSet !== dataSet)) throw new Error('DATA_VIEW_SOURCE_IDENTITY: 来源视图集合无效')
    const discarded = new Set(options.discardViews ?? [])
    if ([...discarded].some(view => !views.includes(view))) throw new Error('DATA_VIEW_SOURCE_IDENTITY: 只能取消同一来源的视图')
    const signatures = new Map(views.map(view => [view, this.signature(view)]))
    let changed = false
    const state = {applied: false}
    const onChanged = () => {changed = true}
    const events = ['editingChanged', 'configChanged', 'cleared', 'mutatingChanged', 'requestStateChanged'] as const
    const assertCurrent = () => {
      const current = this.adapter.views(this.view)
      if (current.length !== views.length || current.some(view => !signatures.has(view))) throw new Error('DATA_VIEW_SOURCE_DIRTY: 来源视图集合已变化')
      for (const view of views) {
        if (changed || signatures.get(view) !== this.signature(view) || view.mutating
          || view.requestState === RequestState.Loading || view.requestState === RequestState.Preparing) {
          throw new Error('DATA_VIEW_SOURCE_DIRTY: 采用来源期间视图已变化或正在请求')
        }
        if (!discarded.has(view) && (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) {
          throw new Error(`DATA_VIEW_SOURCE_DIRTY: 请先处理未允许放弃的 ${view.tableName}@${view.viewId} 修改`)
        }
      }
    }
    assertCurrent()
    for (const view of views) for (const event of events) view.events.on(event, onChanged)
    try {
      await this.adapter.adopt(this.view, {...snapshot}, {assertCurrent, beforeApply: () => {
        if (state.applied) throw new Error('DATA_VIEW_SOURCE_PROTOCOL: 来源只能应用一次')
        assertCurrent()
        state.applied = true
        for (const view of discarded) if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) view.discardPendingChanges()
      }})
      if (!state.applied) throw new Error('DATA_VIEW_SOURCE_PROTOCOL: 来源未确认应用')
    } finally {
      for (const view of views) for (const event of events) view.events.off(event, onChanged)
    }
  }

  private identity(view: DataView): string {
    this.assertIdentity(view)
    const table = view.dataTable, dataSet = view.dataSet
    if (view.destroyed || !table || !dataSet || dataSet.destroyed || table.getView(view.viewId) !== view
      || dataSet.getTable(table.tableName) !== table) throw new Error('DATA_VIEW_SOURCE_IDENTITY: 视图已释放或不属于当前运行实例')
    return JSON.stringify([dataSet.scenarioId, table.tableName, table.modelBinding, table.resourceType, table.resourceId, view.toJson()])
  }

  private signature(view: DataView): string {
    return JSON.stringify([this.identity(view), view.rows, view.editingRows,
      [...view.dirtyTracking.pendingCreateIds], [...view.dirtyTracking.dirtyRowIds], [...view.dirtyTracking.pendingDeleteIds]])
  }
}
