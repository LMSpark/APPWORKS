import { isRecord } from '@spark-appworks/spark-utils'
import { DataMember, resolveDataViewMember } from '../../core/data-view-key'
import type { DataSet } from '../../dataset'
import { RequestState, type DataViewFieldCascade } from '../../types'

type ValueSource = Pick<DataViewFieldCascade['parents'][number], 'tableName' | 'viewId' | 'field'>

/** 级联共享值边界：字段值或选中主键数组，行定位由原生绑定处理。 */
export class DataViewCascadeValueBinding {
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

  static read(dataSet: DataSet, source: ValueSource): unknown {
    return resolveDataViewMember({dataViewKey: `${source.tableName}@${source.viewId}`,
      dataMember: DataMember.Value, dataField: source.field}, dataSet)
  }

  static inputs(dataSet: DataSet, sources: readonly ValueSource[]): readonly unknown[] | undefined {
    const values: unknown[] = []
    for (const source of sources) {
      const view = dataSet.getView(source.tableName, source.viewId)
      if (!view || view.destroyed || dataSet.destroyed) throw new Error('CASCADE_VALUE_VIEW: 输入视图已失效')
      if (view.requestState === RequestState.Loading || view.requestState === RequestState.Preparing
        || (view.requestState === RequestState.Idle && view.rows.length === 0)) return undefined
      if (view.requestState === RequestState.Failed) throw new Error('CASCADE_VALUE_PARENT: 输入查询失败')
      const value = this.read(dataSet, source)
      if (value === undefined) return undefined
      values.push(value)
    }
    return values
  }
}
