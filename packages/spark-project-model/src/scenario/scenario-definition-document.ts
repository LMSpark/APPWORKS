/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-definition-document
 * 职责：把完整配置文本及撤销命令映射为正式定义DataView中的变更。
 * 边界：有效数据只在DataView；来源原文只作不可变根配置基线，历史只作撤销记录，不执行文件IO或保存。
 * AI用途：复杂配置编辑与历史恢复复用定义资源映射，提交仍调用同一个DataSet。
 */
import {RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {SnapshotHistory} from '@spark-appworks/spark-utils'
import {ScenarioDefinitionRecords} from './scenario-definition-records'
import {ScenarioViewConfig} from './scenario-view-config'

type DefinitionView = Readonly<{resource: string; view: DataView}>

/** 完整定义文档的交互命令；不持有另一份可编辑文本、行集合或保存通道。 */
export class ScenarioDefinitionDocument {
  readonly #history = new SnapshotHistory<string>(100)
  #applying = false
  #invalid = false
  #persisted: boolean
  readonly #release: Array<() => void> = []

  private constructor(readonly dataSet: DataSet, readonly scenarioId: string,
    private readonly baseline: ScenarioViewConfig, private readonly definitions: readonly DefinitionView[], persisted: boolean) {
    this.#persisted = persisted
    for (const {view} of definitions) {
      const invalidate = () => {this.#invalid = true}
      const onQuery = (state: RequestState) => {if (state !== RequestState.Loaded) invalidate()}
      let submitting = false
      const onSubmit = (mutating: boolean) => {
        if (mutating) submitting = true
        else if (submitting) {if (!view.mutatingError) this.#persisted = true; submitting = false}
      }
      view.events.on('configChanged', invalidate); view.events.on('requestStateChanged', onQuery)
      view.events.on('mutatingChanged', onSubmit)
      this.#release.push(() => {view.events.off('configChanged', invalidate); view.events.off('requestStateChanged', onQuery); view.events.off('mutatingChanged', onSubmit)})
    }
  }

  /** 显式打开完整配置工作区：查询五类定义，不查询目标业务行或尚未消费的字段目录。 */
  static async open(dataSet: DataSet, scenarioId: string): Promise<ScenarioDefinitionDocument> {
    const definitions = Object.entries(ScenarioDefinitionRecords.resources).map(([name, resource]) => {
      const table = dataSet.getTable(name), view = table?.getView('default')
      if (!view || table?.resourceType !== 'file' || table.resourceId !== resource || view.queryContext['dataSpaceId'] !== scenarioId) {
        throw new Error(`SCENARIO_DOCUMENT_IDENTITY: 缺少目标空间的正式定义视图 ${name}`)
      }
      return {resource, view}
    })
    for (const {view} of definitions) {
      if (view.requestState !== RequestState.Loaded) {
        const result = await view.loadFromServer({allPages: true, maxRows: 50000})
        if (!result.success) throw result.error ?? new Error(result.message ?? '定义读取失败')
      }
    }
    const source = definitions[0]
    if (!source) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 定义资源缺失')
    const snapshot = await source.view.previewSource()
    const baseline = new ScenarioViewConfig(scenarioId, snapshot.content ?? JSON.stringify({scenarioId, tables: {}, viewCascades: []}))
    const document = new ScenarioDefinitionDocument(dataSet, scenarioId, baseline, definitions, snapshot.content !== null)
    try {for (const {view, resource} of definitions) {
      const expected = new Set(ScenarioDefinitionRecords.read(baseline, resource).map(row => document.key(view, row)))
      const original = view.rows.filter(row => !view.dirtyTracking.isPendingCreate(view.getPkKey(row) ?? ''))
        .map(row => document.key(view, row))
      for (const id of view.dirtyTracking.pendingDeleteIds) {
        const row = view.dirtyTracking.getPendingDeleteSnapshot(id)
        if (row) original.push(document.key(view, row))
      }
      if (original.length !== expected.size || new Set(original).size !== original.length || original.some(key => !expected.has(key))) {
        throw new Error('SCENARIO_DOCUMENT_INCOMPLETE: 完整文本编辑需要完整定义查询；现有筛选、缺页或来源变化不能解释为删除')
      }
    }
      document.#history.push(document.getText())
      return document
    } catch (error) {document.dispose(); throw error}
  }

  /** 当前文档实际消费的原定义视图；保存只捕获其本次变更。 */
  get viewSelectors(): Array<{tableName: string; viewId: string}> {
    return this.definitions.map(({view}) => ({tableName: view.tableName, viewId: view.viewId}))
  }

  /** 只从原DataView读取编辑/待提交状态。 */
  get isDirty(): boolean {return this.definitions.some(({view}) => view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())}
  /** 来源存在或本次定义提交已收到真实成功回执；新增草稿不冒充已保存文件。 */
  get isPersisted(): boolean {return this.#persisted}
  /** 外部编辑后旧撤销历史不再适用，不能覆盖另一消费者的变更。 */
  get canUndo(): boolean {return !this.#invalid && !this.#applying && !this.definitions.some(({view}) => view.mutating)
    && this.#history.canUndo && this.#history.current === this.getText()}
  /** 外部编辑后旧重做历史不再适用。 */
  get canRedo(): boolean {return !this.#invalid && !this.#applying && !this.definitions.some(({view}) => view.mutating)
    && this.#history.canRedo && this.#history.current === this.getText()}

  private assertCurrent(editing = false): void {
    if (this.#invalid || this.dataSet.destroyed || !this.dataSet.scenarioId) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 元数据实例已释放或查询已改变，请重新打开配置投影')
    for (const {resource, view} of this.definitions) {
      if (view.destroyed || view.dataSet !== this.dataSet || view.dataTable?.resourceId !== resource
        || view.queryContext['dataSpaceId'] !== this.scenarioId || view.requestState !== RequestState.Loaded
        || editing && view.mutating || view.commitMode !== 'staged') throw new Error('SCENARIO_DOCUMENT_IDENTITY: 定义身份、查询或编辑状态已变化')
    }
  }

  private rows(view: DataView): DataRow[] {
    const rows = view.rows.map(row => {
      const id = view.getPkKey(row)
      if (id === undefined) throw new Error('SCENARIO_DOCUMENT_KEY: 定义行缺少身份')
      return Object.fromEntries(Object.entries(view.getEditingRow(id) ?? row).filter(([key, value]) => key !== '_pk' && value !== undefined))
    })
    const resource = view.dataTable?.resourceId
    if (!resource) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 缺少定义资源')
    const order = new Map(ScenarioDefinitionRecords.read(this.baseline, resource).map((row, index) => [this.key(view, row), index]))
    return rows.sort((left, right) => (order.get(this.key(view, left)) ?? order.size) - (order.get(this.key(view, right)) ?? order.size))
  }

  /** 文本是当前DataView有效行与未修改根配置的只读投影，不是保存真源。 */
  getText(): string {
    this.assertCurrent()
    const candidate = new ScenarioDefinitionRecords(this.baseline)
    for (const {resource, view} of this.definitions) {
      const rows = this.rows(view)
      if (ScenarioDefinitionRecords.json(rows) !== ScenarioDefinitionRecords.json(candidate.readRows(resource))) candidate.applyRows(resource, rows)
    }
    return JSON.stringify(candidate.toConfig().toJSON(), null, 2)
  }

  private key(view: DataView, row: DataRow): string {
    const fields = view.pk.effectivePkFields
    if (!fields.length || fields.some(field => row[field] === undefined || row[field] === null || row[field] === '')) {
      throw new Error('SCENARIO_DOCUMENT_KEY: 定义缺少完整主键')
    }
    return JSON.stringify(fields.map(field => row[field]))
  }

  private equal(left: unknown, right: unknown): boolean {
    return left === undefined || right === undefined ? left === right : ScenarioDefinitionRecords.json(left) === ScenarioDefinitionRecords.json(right)
  }

  /** 验证完整文本后，仅把实际定义差异写入原DataView；根级格式、版本和提交策略不能由文本绕过领域命令。 */
  async setText(text: string): Promise<void> {await this.applyText(text, true)}

  private async applyText(text: string, remember: boolean): Promise<void> {
    this.assertCurrent(true)
    if (this.#applying) throw new Error('SCENARIO_DOCUMENT_BUSY: 定义命令正在执行')
    const before = this.getText(), current = new ScenarioViewConfig(this.scenarioId, before), next = new ScenarioViewConfig(this.scenarioId, text)
    const roots = (config: ScenarioViewConfig) => Object.fromEntries(Object.entries(config.toJSON())
      .filter(([key]) => !['tables', 'layout', 'resourceRelations', 'viewCascades'].includes(key)))
    if (!this.equal(roots(current), roots(next))) throw new Error('SCENARIO_DOCUMENT_ROOT: 根级格式、版本及策略须保留，不能绕过关系转换或提交合同')
    const changes = this.definitions.map(({resource, view}) => ({resource, view, rows: ScenarioDefinitionRecords.read(next, resource)}))
      .filter(({view, rows}) => !this.equal(this.rows(view), rows))
    if (!changes.length) return
    const candidate = new ScenarioDefinitionRecords(current)
    for (const {resource, rows} of changes) candidate.applyRows(resource, rows)
    candidate.toConfig()
    // 在任何编辑前检查全部字段与行操作；权限仍来自原查询，不用文档校验授予写入。
    for (const {view, rows} of changes) {
      const desired = new Map(rows.map(row => [this.key(view, row), row]))
      const existing = new Map(view.rows.map(row => [this.key(view, row), row]))
      if (desired.size !== rows.length) throw new Error('SCENARIO_DOCUMENT_KEY: 定义主键重复')
      for (const [key, row] of existing) if (!desired.has(key)) {
        const id = view.getPkKey(row)
        if ((id === undefined || !view.dirtyTracking.isPendingCreate(id)) && view.deleteActionState(row) !== 'enabled') {
          throw new Error('SCENARIO_DOCUMENT_PERMISSION: 定义不可删除')
        }
      }
      for (const id of view.dirtyTracking.pendingDeleteIds) {
        const original = view.dirtyTracking.getPendingDeleteSnapshot(id)
        if (original) existing.set(this.key(view, original), original)
      }
      for (const [key, row] of desired) {
        const original = existing.get(key)
        if (!original) {if (view.addActionState() !== 'enabled') throw new Error('SCENARIO_DOCUMENT_PERMISSION: 定义不可新增'); continue}
        const values = view.getEditingRow(view.getPkKey(original) ?? '') ?? original
        for (const field of new Set([...Object.keys(values), ...Object.keys(row)])) {
          if (field === '_pk' || this.equal(values[field], row[field])) continue
          if (!view.columns.some(column => column.name === field) || view.fieldAccess(original, field).write !== 'allowed') {
            throw new Error(`SCENARIO_DOCUMENT_PERMISSION: 定义字段不可修改 ${field}`)
          }
        }
      }
    }
    this.#applying = true
    try {
      const operations: Array<Promise<unknown>> = []
      for (const {view, rows} of changes) {
        const desired = new Map(rows.map(row => [this.key(view, row), row]))
        // 撤销已删除定义时恢复原查询身份，再应用目标字段；不把它伪装为新记录。
        for (const id of [...view.dirtyTracking.pendingDeleteIds]) {
          const original = view.dirtyTracking.getPendingDeleteSnapshot(id)
          if (original && desired.has(this.key(view, original))) view.discardPendingChanges([id])
        }
        for (const row of [...view.rows]) if (!desired.has(this.key(view, row))) {
          const id = view.getPkKey(row)
          if (id !== undefined) {
            if (view.dirtyTracking.isPendingCreate(id)) view.discardPendingChanges([id])
            else operations.push(view.removeRow(id))
          }
        }
        const existing = new Map(view.rows.map(row => [this.key(view, row), row]))
        for (const [key, row] of desired) {
          const original = existing.get(key)
          if (!original) {operations.push(view.addRow(row)); continue}
          const id = view.getPkKey(original)
          if (id === undefined) throw new Error('SCENARIO_DOCUMENT_KEY: 原定义缺少身份')
          const values = view.getEditingRow(id) ?? original
          for (const field of new Set([...Object.keys(values), ...Object.keys(row)])) {
            if (field === '_pk' || this.equal(values[field], row[field])) continue
            view.updateEditingValue(id, field, this.equal(original[field], row[field]) ? original[field] : structuredClone(row[field]))
          }
        }
      }
      await Promise.all(operations)
      this.assertCurrent()
      const actual = this.getText()
      if (remember) {
        if (this.#history.current !== before) {this.#history.clear(); this.#history.push(before)}
        this.#history.push(actual)
      }
    } finally {this.#applying = false}
  }

  /** 撤销本交互历史；实际值恢复到原DataView，不回滚服务器。 */
  async undo(): Promise<boolean> {
    if (!this.canUndo) return false
    const previous = this.#history.undo()
    if (previous === null) return false
    try {await this.applyText(previous, false); return true} catch (error) {this.#history.redo(); throw error}
  }

  /** 重做本交互历史；仍只记录原DataView变更，不保存。 */
  async redo(): Promise<boolean> {
    if (!this.canRedo) return false
    const next = this.#history.redo()
    if (next === null) return false
    try {await this.applyText(next, false); return true} catch (error) {this.#history.undo(); throw error}
  }

  /** 释放文档监听与撤销历史；共享DataSet及其真实修改继续由工作区持有。 */
  dispose(): void {this.#invalid = true; this.#release.splice(0).forEach(release => release()); this.#history.clear()}
}
