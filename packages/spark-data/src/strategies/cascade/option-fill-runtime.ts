import type { DataSet } from '../../dataset'
import type { DataView } from '../../data-view'
import type { DataColumn, DataRow } from '../../types'
import { Logger } from '@spark-appworks/spark-utils'

const logger = Logger('DataView:OptionFill')
const empty = (value: unknown): boolean => value === null || value === undefined || value === ''

/**
 * 编辑时按列 `optionsView.fill` 回填同行字段：源字段经编辑通道改变后查询其选项来源，唯一匹配时写入各目标字段；
 * 源字段清空时清空目标。只采纳同一源字段最新一次编辑的结果；查询期间源值或目标值已被改动、目标不可写时不写。
 * 保存前回填与引用校验仍由 SaveRuleValidator 执行，保存前等待在途回填结束。
 */
export class DataViewOptionFillRuntime {
  readonly #generations = new Map<string, number>()
  readonly #pending = new Set<Promise<void>>()
  readonly #unsubscribe: () => void
  #disposed = false

  constructor(private readonly dataSet: DataSet) {
    this.#unsubscribe = dataSet.onAnyViewChange({
      editingFieldChanged: (tableName, viewId, event) => {
        const view = dataSet.getView(tableName, viewId)
        const column = view?.columns.find(item => item.name === event.field)
        if (!view || column?.optionsView?.fill === undefined) return
        const task = this.fill(view, column, event.rowId).catch((error: unknown) => {
          logger.warn(`选项回填失败 ${tableName}@${viewId}.${column.name}: ${error instanceof Error ? error.message : String(error)}`)
        })
        this.#pending.add(task)
        void task.finally(() => this.#pending.delete(task))
      },
    })
  }

  /** 是否有在途回填；无在途时保存不得插入额外异步步骤，保持派发时序。 */
  get pending(): boolean {
    return this.#pending.size > 0
  }

  /** 等待全部在途回填（含回填触发的后续回填）结束。 */
  async settled(): Promise<void> {
    while (this.#pending.size > 0) await Promise.all([...this.#pending])
  }

  private async fill(view: DataView, column: DataColumn, rowId: string | number): Promise<void> {
    const source = column.optionsView
    const fill = source?.fill
    if (source === undefined || fill === undefined) return
    const key = JSON.stringify([view.tableName, view.viewId, rowId, column.name])
    const generation = (this.#generations.get(key) ?? 0) + 1
    this.#generations.set(key, generation)
    const row = view.getEditingRow(rowId)
    if (!row) return
    const value = row[column.name]
    const before = Object.fromEntries(Object.keys(fill).map(target => [target, row[target]]))
    let match: DataRow | undefined
    if (!empty(value)) {
      const viewId = source.viewId ?? 'default'
      const options = this.dataSet.resolveOptionView(source)
      if (!options) throw new Error(`选项来源视图不存在 ${source.scope === undefined ? '' : `${source.scope}@`}${source.tableName}@${viewId}`)
      const context = source.context === undefined ? undefined
        : Object.fromEntries(Object.entries(source.context).map(([parameter, field]) => [parameter, row[field]]))
      const rows = await options.queryOptionRows({ fields: [...new Set([source.valueField, ...Object.values(fill)])],
        ...(context === undefined ? {} : { context }) })
      const matches = rows.filter(option => option[source.valueField] === value)
      if (matches.length !== 1) return
      match = matches[0]
    }
    if (this.#disposed || this.dataSet.destroyed || this.#generations.get(key) !== generation) return
    const current = view.getEditingRow(rowId)
    if (!current || current[column.name] !== value) return
    for (const [target, optionField] of Object.entries(fill)) {
      if (current[target] !== before[target]) continue
      const next = match !== undefined ? match[optionField]
        : view.columns.find(item => item.name === target)?.type === 'string' ? '' : null
      if (current[target] === next || (empty(current[target]) && empty(next))) continue
      if (view.fieldAccess(current, target).write !== 'allowed') continue
      view.updateEditingValue(rowId, target, next)
    }
  }

  destroy(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribe()
    this.#generations.clear()
  }
}
