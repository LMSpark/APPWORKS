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
    /** 类型标识。 */
type: string
    /** display Label 字段。 */
displayLabel: string
    /** 绑定字段名。 */
fieldName: string
    /** width 字段。 */
width: number | undefined
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
  | 'resizable'
  | 'titleAlign' | 'valueAlign'
  | 'headerCellClassName' | 'cellClassName'
  | 'titleClassName' | 'valueClassName'
  | 'sortable'
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
      type: fieldProps.type,
      displayLabel: permission.displayLabel.value,
      fieldName: permission.fieldName.value,
      width: fieldProps.width,
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
