import { isRecord } from '@spark-appworks/spark-utils'
import { DataMember, resolveDataViewMember } from '../../core/data-view-key'
import type { DataSet } from '../../dataset'
import type { DataView } from '../../data-view'
import { RequestState } from '../../types'
import type { DataRow, DataViewEditingFieldChangeEvent, DataViewFieldCascade } from '../../types'
import { DataViewSelectionValue } from '../selection/data-view-selection-value'

type ValueSource = DataViewFieldCascade['parents'][number]
type Scalar = string | number | boolean | null

function scalar(value: unknown): value is Scalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

/** 行定位只在绑定边界存在；运行级联持有值快照和失效检查。 */
export class DataViewFieldCascadeBinding {
  constructor(private readonly dataSet: DataSet, readonly definition: DataViewFieldCascade) {}

  static equal(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => this.equal(value, right[index]))
    }
    if (isRecord(left) && isRecord(right)) {
      const keys = Object.keys(left)
      return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && this.equal(left[key], right[key]))
    }
    return false
  }

  private view(tableName: string, viewId: string): DataView {
    const view = this.dataSet.getView(tableName, viewId)
    if (!view || view.destroyed || this.dataSet.destroyed) throw new Error('FIELD_CASCADE_VIEW: 视图已失效')
    return view
  }

  private read(source: Pick<ValueSource, 'tableName' | 'viewId' | 'field'>): unknown {
    return resolveDataViewMember({ dataViewKey: `${source.tableName}@${source.viewId}`,
      dataMember: DataMember.Value, dataField: source.field }, this.dataSet)
  }

  references(tableName: string, viewId: string): boolean {
    const definition = this.definition
    return (definition.tableName === tableName && definition.viewId === viewId)
      || definition.parents.some(parent => parent.tableName === tableName && parent.viewId === viewId)
  }

  isTargetEdit(tableName: string, viewId: string, event: DataViewEditingFieldChangeEvent): boolean {
    const definition = this.definition
    if (tableName !== definition.tableName || viewId !== definition.viewId || event.field !== definition.targetField) return false
    const view = this.view(tableName, viewId)
    return view.currentRow !== null && view.getPkKey(view.currentRow) === event.rowId
  }

  discardsTarget(tableName: string, viewId: string, ids: ReadonlyArray<string | number> | undefined): boolean {
    const definition = this.definition
    const affectsField = (definition.tableName === tableName && definition.viewId === viewId)
      || definition.parents.some(parent => parent.tableName === tableName && parent.viewId === viewId && parent.field !== undefined)
    if (!affectsField || ids?.length === 0) return false
    const view = this.view(tableName, viewId)
    const row = view.currentRow
    return ids === undefined || (row !== null && ids.includes(view.getPkKey(row) ?? ''))
  }

  parents(): readonly unknown[] | undefined {
    const values: unknown[] = []
    for (const parent of this.definition.parents) {
      const view = this.view(parent.tableName, parent.viewId)
      if (view.requestState === RequestState.Loading || view.requestState === RequestState.Preparing
        || (view.requestState === RequestState.Idle && view.rows.length === 0)) return undefined
      if (view.requestState === RequestState.Failed) throw new Error('FIELD_CASCADE_PARENT: 父输入查询失败')
      const value = this.read(parent)
      if (value === undefined) return undefined
      values.push(value)
    }
    return values
  }

  targetReady(): boolean {
    const view = this.view(this.definition.tableName, this.definition.viewId)
    return view.requestState !== RequestState.Loading && view.requestState !== RequestState.Preparing
      && view.currentRow !== null && view.getPkKey(view.currentRow) !== undefined
  }

  captureTarget() {
    const definition = this.definition
    const view = this.view(definition.tableName, definition.viewId)
    const pointer = view.currentRow
    const key = pointer === null ? undefined : view.getPkKey(pointer)
    if (key === undefined) throw new Error('FIELD_CASCADE_TARGET: 目标值未绑定')
    const rows = view.rows
    const value = this.read({ ...definition, field: definition.targetField })
    const isCurrent = () => !view.destroyed && !this.dataSet.destroyed
      && this.dataSet.getView(definition.tableName, definition.viewId) === view
      && view.rows === rows && view.currentRow !== null && view.getPkKey(view.currentRow) === key
    return { value, isCurrent, write: (next: unknown): void => {
      if (!isCurrent()) throw new Error('FIELD_CASCADE_TARGET: 目标值绑定已失效')
      const row = view.getEditingRow(key)
      if (!row || view.fieldAccess(row, definition.targetField).write !== 'allowed') {
        throw new Error(`FIELD_CASCADE_WRITE: 目标字段不可写 ${definition.targetField}`)
      }
      view.updateEditingValue(key, definition.targetField, structuredClone(next))
    } }
  }

  options() {
    const reference = this.definition.optionsView
    const view = this.view(reference.tableName, reference.viewId)
    const configuredFields = view.valueField ?? (view.effectivePkFields.length === 1 ? view.effectivePkFields[0] : undefined)
    const valueFields = Array.isArray(configuredFields) ? [...configuredFields] : configuredFields
    if (valueFields === undefined || (Array.isArray(valueFields) && valueFields.length === 0)) {
      throw new Error('FIELD_CASCADE_OPTIONS: 选项视图必须明确 valueField 或唯一主键')
    }
    const fields = typeof valueFields === 'string' ? [valueFields] : [...valueFields]
    if (view.labelField !== undefined) fields.push(view.labelField)
    const delimiter = view.selectionDelimiter
    return { view, fields: [...new Set(fields)],
      isCurrent: () => !view.destroyed && this.dataSet.getView(reference.tableName, reference.viewId) === view
        && DataViewFieldCascadeBinding.equal(valueFields, view.valueField ?? view.effectivePkFields[0])
        && view.selectionDelimiter === delimiter,
      evaluate: (current: unknown, rows: readonly DataRow[]) => {
        const nativeOptions = rows.map(row => typeof valueFields === 'string' ? row[valueFields] : DataViewSelectionValue.token(row, valueFields))
        let values: readonly unknown[]
        let retained: unknown
        if (this.definition.valueFormat === 'selection-string') {
          if (current !== null && typeof current !== 'string') throw new Error('FIELD_CASCADE_VALUE: 选中值字符串格式不匹配')
          values = DataViewSelectionValue.split(current, delimiter)
          const validTokens = new Set(rows.map(row => DataViewSelectionValue.token(row, valueFields)))
          const remaining = values.filter((value): value is string => typeof value === 'string' && validTokens.has(value))
          retained = remaining.length === values.length ? current : DataViewSelectionValue.join(remaining, delimiter)
        } else {
          if (!scalar(current) && !(Array.isArray(current) && current.every(scalar))) throw new Error('FIELD_CASCADE_VALUE: 子值必须为标量或标量数组')
          values = current === null ? [] : Array.isArray(current) ? current : [current]
          const remaining = values.filter(value => nativeOptions.some(option => Object.is(option, value)))
          retained = Array.isArray(current) ? remaining : (remaining[0] ?? null)
        }
        const kept = this.definition.valueFormat === 'selection-string'
          ? DataViewSelectionValue.split(typeof retained === 'string' ? retained : null, delimiter).length
          : Array.isArray(retained) ? retained.length : retained === null ? 0 : 1
        return { status: values.length === 0 ? 'empty' as const : kept === values.length ? 'valid' as const : 'invalid' as const,
          retained, hasRetained: kept > 0 }
      } }
  }
}
