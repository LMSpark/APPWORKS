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
import { computed, type ComputedRef } from 'vue'
import { useSparkConsume, DATA_ROW, DATA_SOURCE } from '../internal'
import { PAGE_RUNTIME } from '../internal'
import {
  FieldVisibility,
  resolveDataViewMember,
  type DataMember,
  type DataRow,
} from '@spark-appworks/spark-data'
import { usePermission } from '../../permission'

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

  function permittedValue(value: unknown, row: DataRow | null, field: string | undefined): unknown {
    if (row === null || !field) return value
    const state = permission.resolveFieldState(field, row)
    if (state?.visibility === FieldVisibility.Hidden) return ''
    if (state?.visibility === FieldVisibility.Masked) return state.displayValue ?? '••••'
    return value
  }

  const resolvedValue = computed(() => {
    // 静态值优先（直接传入 value 的场景）
    const activeRow = contextData ?? dataSource?.currentRow ?? null
    if (props.value !== undefined) return permittedValue(props.value, activeRow, props.field)

    // DataView 输出读取：支持 aggregateResult / currentRow / rows 等成员解析。
    if (
      props.dataViewKey !== undefined
      && props.dataMember !== undefined
    ) {
      if (!runtime) throw new Error('PAGE_RUNTIME_MISSING')
      const boundView = runtime.resolveView(props.dataViewKey)
      if (!boundView) throw new Error(`DATA_VIEW_MISSING: ${props.dataViewKey}`)
      const boundValue = resolveDataViewMember({
        dataViewKey: `${boundView.tableName}@${boundView.viewId}`,
        dataMember: props.dataMember,
        dataField: props.dataField,
      }, boundView.dataSet)
      if (boundValue !== undefined) {
        const field = props.dataField ?? props.field
        const row = boundView.currentRow
        if (!row || !field) return boundValue
        const access = boundView.fieldAccess(row, field)
        return access.read === 'invisible' ? '' : access.read === 'masked' ? '••••' : boundValue
      }
    }

    // 从当前行数据读取字段
    if (activeRow !== null && props.field && props.field in activeRow) {
      return permittedValue(activeRow[props.field], activeRow, props.field)
    }
    return undefined
  })

  return { resolvedValue }
}
