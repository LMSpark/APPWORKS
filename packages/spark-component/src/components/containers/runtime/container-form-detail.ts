/**
 * @module @spark-appworks/spark-component:components/containers/runtime/container-form-detail
 * 职责：提供 container form detail 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import { computed, inject, provide, shallowReactive, shallowRef, toRaw, toRef, watch } from 'vue'
import { DataMember, getSparkNodeChildren, type DataRow, type DataView, type SparkNode } from '@spark-appworks/spark-data'
import {
  DATA_SOURCE,
  MODULE_CONTEXT,
  useSparkPageComponent,
} from '../../internal.js'
import { createCurrentRowScope } from '../support/scope/scopeFactories'
import { syncReactiveRow } from '../support/scope/row-mirror-sync'
import { useContainerDataSource } from '../data-views/view-data-source.js'
import { useDataViewEventBridge } from './useDataViewEventBridge.js'
import { useContainerGrid } from './container-layout.js'
import { useContainerModuleContext } from './container-ui.js'
import { resolveDataViewEditingRow } from '../../fields/context/dataViewEditing'
import { sparkColumnToAutoFieldNode } from './column-auto-field.js'
import {FIELD_ROW_CONTEXT} from '../../fields/context/fieldRowContext'

// ============================================================
// § 常量
// ============================================================

/** 表单容器日志前缀。 */
const FORM_CONTAINER_LOG_PREFIX = 'RendererForm'
/** 详情容器日志前缀。 */
const DETAIL_CONTAINER_LOG_PREFIX = 'RendererDetail'

/**
 * 浅层同步时是否跳过同引用写入（减少不必要响应式抖动）。
 */
const CONTEXT_SYNC_SKIP_SAME_REF = true

/** CSS Grid 列数默认值。 */
const DEFAULT_GRID_COLUMNS = 24
/** CSS Grid 行高模板默认值。 */
const DEFAULT_AUTO_ROWS = 'minmax(32px, auto)'
/** CSS Grid 间距默认值（数字 0 由 normalizeGridGap 转为 '0px'）。 */
const DEFAULT_GRID_GAP = 0

// ============================================================
// § 入参类型
// ============================================================

/** 容器内部完整属性形状（包括私有布局字段）。 */
type FormDetailContainerProps = {
  /** 已由标准组件默认值确定的组件类型。 */
  type: string
  /** 运行时props允许未传入的可选项显式为undefined。 */
  id?: string | undefined
  /** 同一响应式props上的子组件配置。 */
  children?: SparkNode['children'] | undefined
  /** 表单自适应项宽；详情未声明时保留原固定栅格。 */
  gridMinWidth?: string | undefined
    /** DataView 定位键。 */
dataViewKey?: string | undefined
        /** context Data Member 字段。 */
contextDataMember?: DataMember | `${DataMember}` | undefined
        /** context Data Field 字段。 */
contextDataField?: string | undefined
/** 固定原行身份，仅表单声明该能力。 */
contextRowId?: string | number | undefined
        /** data Source 字段。 */
dataSource?: DataView | undefined
        /** auto Columns 字段。 */
autoColumns?: boolean | undefined
        /** grid Columns 字段。 */
gridColumns?: number | undefined
        /** grid Gap 字段。 */
gridGap?: number | string | undefined
        /** grid Auto Rows 字段。 */
gridAutoRows?: string | undefined}

// ============================================================
// § useFormDetailContainer
// ============================================================

/**
 * r-form / r-detail 容器完整编排。直接消费响应式props，标题、子组件、绑定与布局不得截成初始化快照。
 *
 * 返回模板层所需的全部响应式状态：布局、DataView、contextData、作用域。
 */
export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  const logPrefix = containerType === 'r-form' ? FORM_CONTAINER_LOG_PREFIX : DETAIL_CONTAINER_LOG_PREFIX
  const { sparkConsume, sparkProvide, sparkRemove, logger, registerApi } = useSparkPageComponent(props)
  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  const dataState = useContainerDataSource({
    externalDataSource: toRef(props, 'dataSource'),
    dataViewKey: toRef(props, 'dataViewKey'),
    inheritedDataSource: () => sparkConsume(DATA_SOURCE),
    contextDataMember: computed(() => props.contextDataMember ?? DataMember.CurrentRow),
    contextDataField: toRef(props, 'contextDataField'),
    sparkConsume,
    logger,
    logPrefix,
  })
  const inheritedRowContext = inject(FIELD_ROW_CONTEXT, undefined)
  let pinned: {view: DataView, id: string | number, row: DataRow} | undefined
  let pinStarted = false
  let pinInvalid = false
  watch([() => props.contextRowId, dataState.resolvedView], ([id, view], [oldId, oldView]) => {
    if (pinStarted && (id !== oldId || pinned && toRaw(view) !== toRaw(oldView))) pinInvalid = true
  }, {flush: 'sync'})
  /** 已开启的固定会话不可通过删除属性或同ID刷新恢复成游标绑定。 */
  function resolvePinnedRow(source: DataView | null | undefined): DataRow | null | undefined {
    const id = props.contextRowId
    const view = dataState.resolvedView.value
    if (id === undefined && !pinStarted) return inheritedRowContext?.row(source)
    pinStarted = true
    if (source && toRaw(source) !== toRaw(view)) return inheritedRowContext?.row(source)
    if (id === undefined) pinInvalid = true
    if (pinInvalid || id === undefined || !view || view.destroyed || view.dataSet?.destroyed) return null
    if (pinned && (toRaw(pinned.view) !== toRaw(view) || pinned.id !== id)) pinInvalid = true
    if (!pinned) {
      const row = view.rows.find(candidate => view.getPkKey(candidate) === id)
      if (row) pinned = {view, id, row}
    }
    if (!pinned || pinInvalid) return null
    if (!view.rows.some(row => toRaw(row) === toRaw(pinned?.row))) {
      pinInvalid = true
      return null
    }
    return pinned.row
  }
  provide(FIELD_ROW_CONTEXT, {row: resolvePinnedRow})
  // 能力消费者持有原视图；只有实例切换时重建消费子树，行/选择变化保留原字段会话。
  const dataScopeKey=shallowRef(0)
  watch(dataState.resolvedView,source=>{
    if(source)sparkProvide(DATA_SOURCE,source);else sparkRemove(DATA_SOURCE)
    dataScopeKey.value++
  },{immediate:true,flush:'sync'})

  // ==========================================================================
  // 分区 1：布局层（children → 网格投影）
  //
  // 目标：将容器 children 统一投影为可渲染网格结构，避免模板层重复计算。
  // ==========================================================================

  const contentChildren = computed(() => {
    const explicitChildren = props.children ?? []
    if (explicitChildren.length > 0 || props.autoColumns === false) return explicitChildren
    return dataState.columns.value
      .filter(column => column.isComputed !== true)
      .map(column => sparkColumnToAutoFieldNode(column, 'form'))
  })

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? DEFAULT_GRID_COLUMNS),
    autoFitMinWidth: computed(() => props.gridMinWidth ?? ''),
    gap: computed(() => props.gridGap ?? DEFAULT_GRID_GAP),
    autoRows: computed(() => props.gridAutoRows ?? DEFAULT_AUTO_ROWS),
  })

  // ==========================================================================
  // 分区 2：能力接入层（capability / DataView 解析）
  //
  // 目标：统一获取页面能力、模块上下文，并解析 dataViewKey 对应的 DataView 与上下文行。
  // ==========================================================================

  // ==========================================================================
  // 分区 3：上下文镜像层（DataView → contextData）
  //
  // 目标：将 DataView 的"当前行/汇总行"镜像到 contextData，供字段组件与表达式统一消费。
  // 约束：镜像是浅层同步，保持对象引用稳定，减少不必要响应式抖动。
  // ==========================================================================

  const contextData = shallowReactive<DataRow>({})
  let prevRow: unknown = Symbol('initial')

  function aggregateToDataRow(row: Readonly<Record<string, unknown>>): DataRow {
    return { ...row }
  }

  /**
   * 解析当前容器应绑定的"上下文行"。
   *
   * 优先级：
   * 1) contextDataMember 指向汇总结果 → 返回聚合行（aggregateResult / selectionAggregateResult）
   * 2) contextDataMember 已解析到的行（resolvedDataRow）
   * 3) 回落到 DataView.currentRow
   */
  function resolveContextRow(): DataRow | null {
    const view = dataState.resolvedView.value
    if (dataState.aggregateError.value && (props.contextDataMember === DataMember.AggregateResult
      || props.contextDataMember === DataMember.SelectionAggregateResult)) return null
    // 选中行汇总：仅统计 selectedRows 的聚合输出。
    if (props.contextDataMember === DataMember.SelectionAggregateResult) {
      return aggregateToDataRow(view?.selectionAggregateResult ?? dataState.selectionAggregateResult.value)
    }
    // 全量汇总：统计当前视图 rows 的聚合输出。
    if (props.contextDataMember === DataMember.AggregateResult) {
      return aggregateToDataRow(view?.aggregateResult ?? dataState.aggregateResult.value)
    }
    const scopedRow = resolvePinnedRow(view)
    if (scopedRow !== undefined) return resolveDataViewEditingRow(view, scopedRow) ?? scopedRow
    const row = dataState.resolvedDataRow.value ?? dataState.currentRow.value
    return resolveDataViewEditingRow(view, row) ?? row
  }

  /**
   * 将解析出的行同步到 contextData。
   *
   * `skipSameRef=true` 跳过同引用重复写入，避免无意义的浅层同步。
   */
  function syncContextDataFromCurrentRow(row: DataRow | null, options?: { skipSameRef?: boolean }): void {
    if (options?.skipSameRef === true && row === prevRow) return
    prevRow = row
    syncReactiveRow(contextData, row, true)
  }

  function syncResolvedContextRow(): void {
    syncContextDataFromCurrentRow(resolveContextRow())
  }

  // 响应式行变化：通过 watch 驱动 contextData 同步。
  watch(
    resolveContextRow,
    (resolvedRow) => {
      syncContextDataFromCurrentRow(resolvedRow, { skipSameRef: CONTEXT_SYNC_SKIP_SAME_REF })
    },
    { immediate: true },
  )

  // 事件桥接：捕获 DataView 细粒度变化，保证 contextData 与数据态持续一致。
  useDataViewEventBridge({
    resolvedView: dataState.resolvedView,
    // currentRow 变化：以 resolveContextRow 为准，确保汇总 contextDataMember 不被 currentRow 覆盖。
    onCurrentRowChanged: syncResolvedContextRow,
    // rows 变化可能导致 currentRow/聚合行失效，统一重算并同步。
    onRowsChanged: () => {
      syncResolvedContextRow()
    },
    // 插槽条件、表单模型和字段子组件读取同一编辑覆盖；丢弃时恢复原行。
    onEditingChanged: () => {
      syncResolvedContextRow()
    },
    // aggregateResult 重算后立即同步到 contextData。
    onSummaryChanged: () => {
      syncResolvedContextRow()
    },
    // selectionAggregateResult 重算后立即同步到 contextData。
    onSelectionSummaryChanged: () => {
      syncResolvedContextRow()
    },
  })

  // ==========================================================================
  // 分区 5：作用域构建层
  //
  // 目标：输出字段渲染所需默认作用域，保持 form/detail 的访问面一致。
  // ==========================================================================

  /**
   * 默认作用域：row/model 均绑定 contextData。
   * 字段组件在 form/detail 中使用同一份上下文，不区分 current/summary 场景。
   */
  function getDefaultScope() {
    return createCurrentRowScope({
      dataSource: dataState.resolvedView.value,
      moduleContext: moduleContext.value,
      row: contextData,
      model: contextData,
    })
  }

  // ==========================================================================
  // 分区 6：对外输出层
  // ==========================================================================

  return {
    registerApi,
    sparkProvide,
    logger,
    resolvedView: dataState.resolvedView,
    dataScopeKey,
    dataState,
    contextData,
    gridChildren,
    gridStyle,
    getChildGridStyle,
    getDefaultScope,
    aggregateResult: dataState.aggregateResult,
    selectionAggregateResult: dataState.selectionAggregateResult,
  }
}
