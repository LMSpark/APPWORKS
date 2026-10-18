/**
 * @module @spark-appworks/spark-component:components/display/useDisplayDataSource
 * 职责：提供 use Display Data Source 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 display-level/view-only，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * useDisplayDataSource — 轻量级数据读取 composable，供 display 组件使用
 *
 * 优先级：
 * 1. props.value（显式值）
 * 2. props.dataViewKey + props.dataMember + props.dataField（DataView 输出读取，依赖 PAGE_RUNTIME）
 * 3. props.field（从 DATA_ROW / DATA_SOURCE.currentRow 读取字段）
 */
import { computed, shallowRef, type ComputedRef } from 'vue'
import { useSparkConsume, DATA_ROW, DATA_SOURCE } from '../internal'
import { PAGE_RUNTIME } from '../internal'
import {
  FieldVisibility,
  resolveDataViewMember,
  type DataMember,
  type DataRow,
} from '@spark-appworks/spark-data'
import { usePermission } from '../../permission'
import { useDataViewEventBridge } from '../containers/runtime/useDataViewEventBridge'
import {resolveReactiveRow} from '../containers/support/scope/row-mirror-sync'

/** Display Data Props 的属性契约。 */
type DisplayDataProps = {
    /** DataView 定位键。 */
dataViewKey?: string | undefined
    /** DataView 成员名。 */
dataMember?: DataMember | `${DataMember}` | undefined
    /** DataView 成员字段路径。 */
dataField?: string | undefined
    /** field 字段。 */
field?: string | undefined
    /** 当前值。 */
value?: unknown}

/** Use Display Data Source Return 的语义模型。 */
type UseDisplayDataSourceReturn = {
    /** resolved Value 字段。 */
resolvedValue: ComputedRef<unknown>}

export function useDisplayDataSource(props: DisplayDataProps): UseDisplayDataSourceReturn {
  const { sparkConsume } = useSparkConsume()
  const contextData = sparkConsume(DATA_ROW)
  const dataSource = sparkConsume(DATA_SOURCE)
  const runtime = sparkConsume(PAGE_RUNTIME)
  const permission = usePermission()
  const boundView = computed(() => {
    if (props.value !== undefined || props.dataViewKey === undefined || props.dataMember === undefined) return null
    if (!runtime) throw new Error('PAGE_RUNTIME_MISSING')
    const view = runtime.resolveView(props.dataViewKey)
    if (!view) throw new Error(`DATA_VIEW_MISSING: ${props.dataViewKey}`)
    return view
  })
  const revision = shallowRef(0)
  const refresh = () => { revision.value++ }
  useDataViewEventBridge({resolvedView: computed(() => boundView.value ?? dataSource ?? null),
    onRowsChanged: refresh, onCurrentRowChanged: refresh, onSelectedRowsChanged: refresh,
    onCleared: refresh, onRequestStateChanged: refresh, onConfigChanged: refresh,
    onSummaryChanged: refresh, onSelectionSummaryChanged: refresh,
    onEditingChanged: refresh, onMutatingChanged: refresh,
  })

  function permittedValue(value: unknown, row: DataRow | null, field: string | undefined): unknown {
    if (row === null || !field) return value
    const state = permission.resolveFieldState(field, row)
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    return value
  }

  const resolvedValue = computed(() => {
    revision.value
    // 静态值优先（直接传入 value 的场景）
    const activeRow = resolveReactiveRow(contextData ?? dataSource?.currentRow)
    if (props.value !== undefined) return permittedValue(props.value, activeRow, props.field)

    // DataView 输出读取：支持 aggregateResult / currentRow / rows 等成员解析。
    if (
      props.dataViewKey !== undefined
      && props.dataMember !== undefined
    ) {
      const view = boundView.value
      if (!view) throw new Error(`DATA_VIEW_MISSING: ${props.dataViewKey}`)
      if ((props.dataMember === 'aggregateResult' || props.dataMember === 'selectionAggregateResult') && view.aggregateError) {
        return view.aggregateError.message
      }
      const computedError = view.computedColumnError(props.dataField ?? props.field ?? '')
      if (computedError) return computedError.message
      const boundValue = resolveDataViewMember({
        dataViewKey: `${view.tableName}@${view.viewId}`,
        dataMember: props.dataMember,
        dataField: props.dataField,
      }, view.dataSet)
      if (boundValue !== undefined) {
        const field = props.dataField ?? props.field
        const row = view.currentRow
        if (!row || !field) return boundValue
        const access = view.fieldAccess(row, field)
        return access.read === 'invisible' ? '' : access.read === 'masked' ? '••••' : boundValue
      }
    }

    // 从当前行数据读取字段
    const computedError = props.field ? dataSource?.computedColumnError(props.field) : null
    if (computedError) return computedError.message
    if (activeRow !== null && props.field && props.field in activeRow) {
      return permittedValue(activeRow[props.field], activeRow, props.field)
    }
    return undefined
  })

  return { resolvedValue }
}
