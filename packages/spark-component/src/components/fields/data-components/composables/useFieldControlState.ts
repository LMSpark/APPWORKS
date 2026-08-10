/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useFieldControlState
 * 职责：提供 useFieldControlState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use field control state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import type { ComputedRef } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { FormItemRule } from '../../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../shared-types.js'
import { useFieldContext } from '../../context/useFieldContext'
import type { FieldComposableProps } from '../../context/field-composable-props'
import { useControlledFieldChange } from './useControlledFieldChange'

/** 字段上下文对控件层暴露的只读显示和校验状态。 */
type FieldContextStateLike = {
  /** 字段绑定的数据列名。 */
  fieldName: ComputedRef<string>
  /** 字段显示标题，通常来自列标题或组件 title。 */
  displayLabel: ComputedRef<string>
  /** 当前字段在当前上下文下是否隐藏。 */
  isCurrentFieldHidden: ComputedRef<boolean>
  /** 当前字段是否应该渲染；隐藏和权限判断后的最终结果。 */
  shouldRenderCurrentField: ComputedRef<boolean>
  /** 当前字段的展示文本。 */
  currentDisplayValue: ComputedRef<string>
  /** 指定表格行中的该字段单元格是否隐藏。 */
  isTableCellHidden: (row: DataRow) => boolean
  /** 指定表格行中的该字段单元格展示文本。 */
  getTableCellDisplayValue: (row: DataRow) => string
  /** 当前字段的表单校验规则。 */
  validationRules: ComputedRef<FormItemRule[]>
}

/** 字段控件与数据源之间的受控值同步状态。 */
type ControlledFieldStateLike<TValue> = FieldContextStateLike & {
  /** 当前字段值，已经按字段组件类型收窄。 */
  fieldValue: ComputedRef<TValue>
  /** 当前字段所在的上下文数据行。 */
  contextData: DataRow | null
  /** 当前字段所在的数据源，可以是 DataView 或外部传入对象。 */
  dataSource: unknown
  /** 当前 DataView 当前行。 */
  currentRow: ComputedRef<DataRow | null>
  /** 将控件值同步回字段状态。 */
  syncValue: (value: TValue) => void
}

/** 字段控件层消费的通用组件属性子集。 */
type FieldControlProps = FieldComposableProps<Pick<SparkNodeProps,
  | 'type' | 'children'
>> & FieldComposableProps<Pick<SparkFieldSemanticProps,
  | 'width'
  | 'resizable'
  | 'onChange'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
>>

/** 创建字段控件运行态所需的输入。 */
type UseFieldControlStateOptions<TValue> = {
  /** 字段组件 props 中与字段上下文和 onChange 相关的子集。 */
  props: FieldControlProps
  /** 字段组件类型，props.type 缺失时作为默认值。 */
  fieldType: string
  /** 字段值、行上下文和展示上下文的聚合状态。 */
  state: ControlledFieldStateLike<TValue>
  /** 向 Vue v-model/update 事件发出新值。 */
  emitUpdate: (value: TValue) => void
}

export function useFieldControlState<TValue>(options: UseFieldControlStateOptions<TValue>) {
  const fieldCtx = useFieldContext({
    type: options.props.type ?? options.fieldType,
    width: options.props.width,
    ...(options.props.resizable !== undefined ? { resizable: options.props.resizable } : {}),
    ...(options.props.children !== undefined ? { children: options.props.children } : {}),
    ...(options.props.titleAlign !== undefined ? { titleAlign: options.props.titleAlign } : {}),
    ...(options.props.valueAlign !== undefined ? { valueAlign: options.props.valueAlign } : {}),
    ...(options.props.headerCellClassName !== undefined ? { headerCellClassName: options.props.headerCellClassName } : {}),
    ...(options.props.cellClassName !== undefined ? { cellClassName: options.props.cellClassName } : {}),
    ...(options.props.titleClassName !== undefined ? { titleClassName: options.props.titleClassName } : {}),
    ...(options.props.valueClassName !== undefined ? { valueClassName: options.props.valueClassName } : {}),
    ...(options.props.sortable !== undefined ? { sortable: options.props.sortable } : {}),
  }, options.state)

  const { handleControlledChange } = useControlledFieldChange<TValue>({
    getValue: () => options.state.fieldValue.value,
    emitUpdate: value => options.emitUpdate(value),
    syncValue: options.state.syncValue,
    handlerSource: {
      ...(options.props.onChange !== undefined ? { onChange: options.props.onChange } : {}),
    },
  })

  return {
    fieldCtx,
    handleControlledChange,
  }
}
