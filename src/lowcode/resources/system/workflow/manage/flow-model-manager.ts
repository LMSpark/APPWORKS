/**
 * @module app:lowcode/resources/system/workflow/manage/flow-model-manager
 * 职责：流程模型目录的正式读取与写入，供模型列表页编排新建、编辑与删除。
 * 边界：经 spark-data DataView 提交变更，不从前端 Vue 直接调用 lowcodeApi。
 */
import {DataViewFilter, type DataView, type DataRow, RequestState} from '@spark-appworks/spark-data'

export type FlowModelListResult = Readonly<{
  unresolvedCreateUserIds: readonly string[]
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function firstTextByKeys(source: DataRow, keys: readonly string[]): string {
  for (const key of keys) {
    const raw = source[key]
    if (raw === undefined || raw === null || typeof raw === 'boolean') continue
    const value = normalizeText(raw)
    if (value) return value
  }
  return ''
}

function requireView(view: DataView | undefined, title: string): DataView {
  if (!view || view.destroyed) throw new Error(`${title}缺少正式 WFM_FLOW_MODLE 视图`)
  return view
}

/** 绑定当前页正式模型列表视图的编排入口。 */
export class WorkflowFlowModelManager {
  readonly #view: DataView
  readonly #userView: DataView | undefined
  readonly #assertCurrent: () => void

  constructor(view: DataView, options: Readonly<{userView?: DataView | undefined; assertCurrent?: () => void}> = {}) {
    this.#view = requireView(view, '流程模型')
    this.#userView = options.userView
    this.#assertCurrent = options.assertCurrent ?? (() => undefined)
    Object.freeze(this)
  }

  async refresh(): Promise<FlowModelListResult> {
    this.#assertCurrent()
    await this.#view.refresh()
    this.#assertCurrent()
    if (this.#view.loadingError) throw this.#view.loadingError
    if (this.#view.requestState !== RequestState.Loaded) throw new Error('流程模型列表尚未加载')
    return this.#hydrateCreateUsers()
  }

  canAdd(): boolean {
    return this.#view.fieldAccess(null, 'TITLE').write === 'allowed'
  }

  canEditRow(row: DataRow): boolean {
    return this.#view.getPkKey(row) !== undefined && this.#view.fieldAccess(row, 'TITLE').write === 'allowed'
  }

  canDeleteRow(row: DataRow): boolean {
    return this.canEditRow(row)
  }

  async beginAdd(): Promise<void> {
    this.#assertCurrent()
    if (!this.canAdd()) throw new Error('当前不允许新增流程模型')
    const row = await this.#view.addRow({})
    if (!row || typeof row !== 'object') throw new Error('无法开始新增流程模型')
    this.#view.setCurrentRow(row)
  }

  beginEdit(row: DataRow): void {
    this.#assertCurrent()
    if (!this.canEditRow(row)) throw new Error('当前不允许编辑该流程模型')
    this.#view.setCurrentRow(row)
  }

  async saveCurrent(): Promise<void> {
    this.#assertCurrent()
    const dataSet = this.#view.dataSet
    if (!dataSet) throw new Error('流程模型 DataSet 已失效')
    const result = await dataSet.saveChanges()
    this.#assertCurrent()
    if (result && !result.success) throw result.error ?? new Error(result.message ?? '保存流程模型失败')
    await this.refresh()
  }

  async removeRow(row: DataRow): Promise<void> {
    this.#assertCurrent()
    if (!this.canDeleteRow(row)) throw new Error('当前不允许删除该流程模型')
    const id = this.#view.getPkKey(row)
    if (id === undefined) throw new Error('流程模型缺少 rowid')
    await this.#view.removeRow(id)
    const dataSet = this.#view.dataSet
    if (!dataSet) throw new Error('流程模型 DataSet 已失效')
    const result = await dataSet.saveChanges()
    this.#assertCurrent()
    if (result && !result.success) throw result.error ?? new Error(result.message ?? '保存流程模型失败')
    await this.refresh()
  }

  readModelKey(row: DataRow): string {
    return firstTextByKeys(row, ['rowid', 'ROWID'])
  }

  readWorkFormId(row: DataRow): string {
    return firstTextByKeys(row, ['workFormId', 'WorkFormId', 'WORKFORMID'])
  }

  async #hydrateCreateUsers(): Promise<FlowModelListResult> {
    const userView = this.#userView
    if (!userView) return {unresolvedCreateUserIds: []}
    const ids = [...new Set(this.#view.rows.map(row => normalizeText(firstTextByKeys(row, ['createuser', 'CRTUSER']))).filter(Boolean))]
    if (!ids.length) return {unresolvedCreateUserIds: []}
    const parsed = DataViewFilter.parse({
      logic: 'or',
      filters: [
        {field: 'rowid', operator: 'in', value: ids},
        {field: 'ID', operator: 'in', value: ids},
      ],
    })
    if (!parsed.ok) throw new Error('用户选项过滤无效')
    userView.filterExpression = parsed.value.toJSON()
    await userView.refresh()
    if (userView.loadingError) throw userView.loadingError
    const names = new Map<string, string>()
    for (const row of userView.rows) {
      const name = firstTextByKeys(row, ['UserName', 'username']) || firstTextByKeys(row, ['rowid', 'ID'])
      const rowId = firstTextByKeys(row, ['rowid', 'ROWID'])
      const id = firstTextByKeys(row, ['ID', 'Id'])
      if (rowId) names.set(rowId, name)
      if (id) names.set(id, name)
    }
    const unresolved: string[] = []
    for (const row of this.#view.rows) {
      const key = normalizeText(firstTextByKeys(row, ['createuser', 'CRTUSER']))
      if (!key) continue
      const mapped = names.get(key)
      if (mapped) row['createuser'] = mapped
      else unresolved.push(key)
    }
    return {unresolvedCreateUserIds: unresolved}
  }
}