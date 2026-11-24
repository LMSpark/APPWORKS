/**
 * @module app:lowcode/resources/system/workflow/manage/flow-model-manager
 * 职责：流程模型目录的正式读取与写入，供模型列表页编排新建、编辑与删除。
 * 边界：经 spark-data DataView 提交变更，不从前端 Vue 直接调用 lowcodeApi。
 */
import {DataViewFilter, type DataView, type DataRow, RequestState} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {readLowcodePrincipal} from '@/platform-adapters/lowcode-runtime'

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
    return this.#loadCreateUsers()
  }

  canAdd(): boolean {
    return this.#view.newRowFieldAccess('TITLE').write === 'allowed'
  }

  canEditRow(row: DataRow): boolean {
    return this.#view.getPkKey(row) !== undefined && this.#view.fieldAccess(row, 'TITLE').write === 'allowed'
  }

  canDeleteRow(row: DataRow): boolean {
    return this.#view.deleteActionState(row) === 'enabled'
  }

  async beginAdd(): Promise<void> {
    this.#assertCurrent()
    if (!this.canAdd()) throw new Error('当前不允许新增流程模型')
    const principal = readLowcodePrincipal()
    if (!principal?.userId.trim()) throw new Error('流程模型新建缺少当前登录用户')
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const row = await this.#view.addRow({TITLE: '', MEMO: '', CRTUSER: principal.userId,
      CRTDATE: date, STATE: '1', BusinessTable: '', sysid: principal.applicationId ?? ''})
    this.#assertCurrent()
    if (!isRecord(row)) throw new Error('无法开始新增流程模型')
    this.#view.setCurrentRow(row)
  }

  beginEdit(row: DataRow): void {
    this.#assertCurrent()
    if (!this.canEditRow(row)) throw new Error('当前不允许编辑该流程模型')
    this.#view.setCurrentRow(row)
  }

  async saveCurrent(): Promise<void> {
    this.#assertCurrent()
    const current = this.#view.currentRow
    const key = current && this.#view.getPkKey(current)
    const row = key === null || key === undefined ? null : this.#view.getEditingRow(key)
    if (!row || key === null || key === undefined) throw new Error('尚未选择要保存的流程模型')
    const title = normalizeText(row['TITLE'])
    if (!title) throw new Error('请输入流程名称')
    if (this.#view.dirtyTracking.isPendingCreate(key) && !normalizeText(row['sysid'])) throw new Error('请选择应用系统')
    for (const field of ['TITLE', 'MEMO']) {
      if (typeof row[field] !== 'string') continue
      const value = normalizeText(row[field])
      if (row[field] !== value) this.#view.updateEditingValue(key, field, value)
    }
    await this.#saveAndRefresh()
  }

  async removeRow(row: DataRow): Promise<void> {
    this.#assertCurrent()
    if (!this.canDeleteRow(row)) throw new Error('当前不允许删除该流程模型')
    const id = this.#view.getPkKey(row)
    if (id === undefined) throw new Error('流程模型缺少 rowid')
    await this.#view.removeRow(id)
    await this.#saveAndRefresh()
  }

  async #saveAndRefresh(): Promise<void> {
    const dataSet = this.#view.dataSet
    if (!dataSet) throw new Error('流程模型 DataSet 已失效')
    const result = await dataSet.saveChanges({views:[{tableName:this.#view.tableName,viewId:this.#view.viewId}]})
    this.#assertCurrent()
    if (!result.success) throw result.error ?? new Error(result.message ?? '保存流程模型失败')
    await this.refresh()
  }

  readModelKey(row: DataRow): string {
    return firstTextByKeys(row, ['rowid', 'ROWID'])
  }

  readWorkFormId(row: DataRow): string {
    return firstTextByKeys(row, ['workFormId', 'WorkFormId', 'WORKFORMID'])
  }

  async #loadCreateUsers(): Promise<FlowModelListResult> {
    const userView = this.#userView
    if (!userView) return {unresolvedCreateUserIds: []}
    const ids = [...new Set(this.#view.rows.filter(row => this.#view.fieldAccess(row, 'createuser').read === 'visible')
      .map(row => normalizeText(row['createuser'])).filter(Boolean))]
    if (!ids.length) return {unresolvedCreateUserIds: []}
    const parsed = DataViewFilter.parse({
      field: 'rowid', operator: 'in', value: ids,
    })
    if (!parsed.ok) throw new Error('用户选项过滤无效')
    userView.filterExpression = parsed.value.toJSON()
    await userView.refresh()
    this.#assertCurrent()
    if (userView.loadingError) throw userView.loadingError
    return {unresolvedCreateUserIds: ids.filter(id => userView.rows.filter(row =>
      userView.fieldAccess(row, 'rowid').read === 'visible' && row['rowid'] === id).length !== 1)}
  }
}
