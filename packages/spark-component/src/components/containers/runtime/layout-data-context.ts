/**
 * @module @spark-appworks/spark-component:components/containers/runtime/layout-data-context
 * 职责：为标准布局容器解析同一 PageRuntime 的 DataView，并向子组件提供视图和稳定的行上下文。
 * 边界：默认不查询；工具栏可沿原DataView自动加载，不保存、不复制编辑状态或权限。行镜像只服务渲染。
 * AI用途：标签页等布局需要标准数据成员绑定时复用；视图实例变化须以 scopeKey 重建消费子树。
 */
import {computed, shallowReactive, shallowRef, toRef, watch} from 'vue'
import {resolveDataViewCapabilities, type DataRow} from '@spark-appworks/spark-data'
import {DATA_ROW, DATA_SOURCE, useSparkPageComponent} from '../../internal'
import type {SparkNodeProps, SparkTableModelProps} from '../../shared-types'
import type {SparkNodeInput} from '../../../core/useSparkComponent'
import {useContainerDataSource} from '../data-views/view-data-source'
import {syncReactiveRow} from '../support/scope/row-mirror-sync'

/** 布局定位视图、选择成员和成员字段的标准配置；未显式配置时保留父级行上下文。 */
export type LayoutDataContextProps = SparkNodeProps & {
  /** 完整视图键 scenarioId@modelName@viewId；未配置时继承原视图，不发起查询。 */
  dataViewKey?: SparkTableModelProps['dataViewKey']
  /** 原生 DataView 成员；数组或值成员不自动取当前行作为字段上下文。 */
  dataMember?: SparkTableModelProps['dataMember']
  /** 在所选成员上继续定位字段，复用 spark-data 的成员解析合同。 */
  dataField?: SparkTableModelProps['dataField']
}

/** 绑定原视图并提供行镜像；scopeKey 只在视图实例变化时递增，切换行不销毁子组件草稿。 */
export function useLayoutDataContext(
  props: SparkNodeInput & Pick<LayoutDataContextProps, 'dataViewKey' | 'dataMember' | 'dataField'>
    & {dataSource?: SparkTableModelProps['dataSource']},
  options: {autoLoad?: boolean} = {},
) {
  const component = useSparkPageComponent(props)
  const {sparkConsume, sparkProvide, sparkRemove} = component
  const inheritedView = sparkConsume(DATA_SOURCE), inheritedRow = sparkConsume(DATA_ROW)
  const state = useContainerDataSource({dataViewKey: toRef(props, 'dataViewKey'), externalDataSource: () => props.dataSource,
    inheritedDataSource: () => inheritedView, sparkConsume, skipAutoLoadEffect: options.autoLoad !== true})
  const scopeKey = shallowRef(0)
  const rowMirror = shallowReactive<DataRow>({})
  const aggregateError = computed(() => {
    const diagnostic = state.aggregateError.value
    return props.dataMember === 'aggregateResult' || props.dataMember === 'selectionAggregateResult'
      ? diagnostic : state.resolvedView.value?.computedAggregateError ?? null
  })

  watch(state.resolvedView, source => {
    if (source) sparkProvide(DATA_SOURCE, source)
    else sparkRemove(DATA_SOURCE)
    scopeKey.value++
  }, {immediate: true, flush: 'sync'})

  const row = computed(() => {
    // DataView is not Vue-reactive; these shared projections follow its events.
    state.currentRow.value; state.rows.value; state.selectedRows.value
    state.aggregateResult.value; state.selectionAggregateResult.value
    if (props.dataSource === undefined && props.dataViewKey === undefined && props.dataMember === undefined && props.dataField === undefined && inheritedRow !== null) return inheritedRow
    const source = state.resolvedView.value
    if (!source) return null
    if (aggregateError.value && (props.dataMember === 'aggregateResult' || props.dataMember === 'selectionAggregateResult')) return null
    return resolveDataViewCapabilities({dataViewKey: `${source.tableName}@${source.viewId}`,
      dataMember: props.dataMember ?? 'currentRow', dataField: props.dataField}, source.dataSet).dataRow
  })
  watch(row, value => {
    syncReactiveRow(rowMirror, value, true)
    // An empty row blocks a field from falling back to another currentRow when
    // the selected member is a collection/value or the explicit pointer is empty.
    if (state.resolvedView.value || value) sparkProvide(DATA_ROW, rowMirror)
    else sparkRemove(DATA_ROW)
  }, {immediate: true, deep: true, flush: 'sync'})

  return {...component, scopeKey, resolvedView: state.resolvedView, row, aggregateError}
}
