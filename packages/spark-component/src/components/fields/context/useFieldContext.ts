/**
 * @module @spark-appworks/spark-component:components/fields/context/useFieldContext
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/context/useFieldContext 的字段上下文投影。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/context/useFieldContext 的声明、导出和使用边界时，从本模块开始。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'

import { type DataRow, getSparkNodeChildren } from '@spark-appworks/spark-data'
import type { FormItemRule } from '../columnFormRules'
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../shared-types.js'
import type { SparkNode } from '@spark-appworks/spark-data'
import type { FieldComposableProps } from './field-composable-props'

/** Field Context Props 的属性契约。 */
export type FieldContextProps = {
  /** 数据绑定的配置诊断，独立于值和权限呈现。 */
  bindingError?: string
    /** 类型标识。 */
type: string
  /** 表格单元格是否允许双击进入字段控件。 */
  editOnDblclick?: boolean
  /** 字段绑定当前原始行；用于核对单元格身份，不复制编辑覆盖。 */
  editingContextRow: DataRow | null
  /** 当前字段经权限和交互锁定后是否可编辑。 */
  isCurrentFieldEditable: boolean
    /** display Label 字段。 */
displayLabel: string
    /** 绑定字段名。 */
fieldName: string
    /** width 字段。 */
width: number | undefined
  /** 表格字段的最小宽度，由标准字段属性显式传递；未配置时由表格分配。 */
  minWidth?: number
  /** 表格单元格溢出提示，仅消费权限处理后的显示内容。 */
  showOverflowTooltip?: boolean
  /** 标题下的标准组件区域，由所属组件提供自己的数据绑定。 */
  header?: SparkNode
    /** resizable 字段。 */
resizable?: boolean
    /** title Align 字段。 */
titleAlign?: 'left' | 'center' | 'right'
    /** value Align 字段。 */
valueAlign?: 'left' | 'center' | 'right'
    /** header Cell Class Name 名称。 */
headerCellClassName?: string
    /** cell Class Name 名称。 */
cellClassName?: string
    /** title Class Name 名称。 */
titleClassName?: string
    /** value Class Name 名称。 */
valueClassName?: string
    /** sortable 字段。 */
sortable: boolean | 'custom'
    /** merged Children 字段。 */
mergedChildren: SparkNode[]
    /** 是否 is Current Field Hidden。 */
isCurrentFieldHidden: boolean
    /** 是否 should Render Current Field。 */
shouldRenderCurrentField: boolean
    /** current Display Value 字段。 */
currentDisplayValue: string
    /** 是否 is Table Cell Hidden。 */
isTableCellHidden: (row: DataRow) => boolean
    /** get Table Cell Display Value 回调。 */
getTableCellDisplayValue: (row: DataRow) => string
    /** validation Rules 字段。 */
validationRules: FormItemRule[]}

/** Field Permission For Context 的运行上下文。 */
type FieldPermissionForContext = {
  /** 停算配置的只读诊断，不改变字段值可见性。 */
  bindingError?: ComputedRef<string | undefined>
  /** 原字段绑定的行上下文；不复制运行数据。 */
  contextData: ComputedRef<DataRow | null>
  /** 原查询许可与界面限制共同确定的可编辑性。 */
  isCurrentFieldEditable: ComputedRef<boolean>
    /** 绑定字段名。 */
fieldName: ComputedRef<string>
    /** display Label 字段。 */
displayLabel: ComputedRef<string>
    /** 是否 is Current Field Hidden。 */
isCurrentFieldHidden: ComputedRef<boolean>
    /** 是否 should Render Current Field。 */
shouldRenderCurrentField: ComputedRef<boolean>
    /** current Display Value 字段。 */
currentDisplayValue: ComputedRef<string>
    /** 是否 is Table Cell Hidden。 */
isTableCellHidden: (row: DataRow) => boolean
    /** get Table Cell Display Value 回调。 */
getTableCellDisplayValue: (row: DataRow) => string
    /** validation Rules 字段。 */
validationRules: ComputedRef<FormItemRule[]>}

/** Field Context Input Props 的属性契约。 */
type FieldContextInputProps = FieldComposableProps<Pick<SparkNodeProps,
  | 'type' | 'children'
>> & FieldComposableProps<Pick<SparkFieldSemanticProps,
  | 'width'
  | 'minWidth'
  | 'showOverflowTooltip'
  | 'header'
  | 'resizable'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
  | 'editOnDblclick'
>> & {
    /** 类型标识。 */
type: string}

export function useFieldContext(
  fieldProps: FieldContextInputProps,
  permission: FieldPermissionForContext,
): ComputedRef<FieldContextProps> {
  const mergedChildren = computed(() => {
    const children = fieldProps.children
    return getSparkNodeChildren(children)
  })

  return computed(() => {
    const result: FieldContextProps = {
      ...(permission.bindingError?.value ? {bindingError: permission.bindingError.value} : {}),
      type: fieldProps.type,
      ...(fieldProps.editOnDblclick !== undefined ? {editOnDblclick: fieldProps.editOnDblclick} : {}),
      editingContextRow: permission.contextData.value,
      isCurrentFieldEditable: permission.isCurrentFieldEditable.value,
      displayLabel: permission.displayLabel.value,
      fieldName: permission.fieldName.value,
      width: fieldProps.width,
      ...(fieldProps.header !== undefined ? {header: fieldProps.header} : {}),
      ...(fieldProps.minWidth !== undefined ? {minWidth: fieldProps.minWidth} : {}),
      ...(fieldProps.showOverflowTooltip !== undefined ? {showOverflowTooltip: fieldProps.showOverflowTooltip} : {}),
      ...(fieldProps.resizable !== undefined ? { resizable: fieldProps.resizable } : {}),
      ...(fieldProps.titleAlign !== undefined && { titleAlign: fieldProps.titleAlign }),
      ...(fieldProps.valueAlign !== undefined && { valueAlign: fieldProps.valueAlign }),
      ...(fieldProps.headerCellClassName !== undefined && { headerCellClassName: fieldProps.headerCellClassName }),
      ...(fieldProps.cellClassName !== undefined && { cellClassName: fieldProps.cellClassName }),
      ...(fieldProps.titleClassName !== undefined && { titleClassName: fieldProps.titleClassName }),
      ...(fieldProps.valueClassName !== undefined && { valueClassName: fieldProps.valueClassName }),
      sortable: fieldProps.sortable ?? true,
      mergedChildren: mergedChildren.value,
      isCurrentFieldHidden: permission.isCurrentFieldHidden.value,
      shouldRenderCurrentField: permission.shouldRenderCurrentField.value,
      currentDisplayValue: permission.currentDisplayValue.value,
      isTableCellHidden: permission.isTableCellHidden,
      getTableCellDisplayValue: permission.getTableCellDisplayValue,
      validationRules: permission.validationRules.value,
    }

    return result
  })
}
