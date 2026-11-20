/**
 * @module @spark-appworks/spark-component:components/fields/actions/useFieldActionMode
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/actions/useFieldActionMode 的模块能力，围绕 FieldActionMode、UseFieldActionModeOptions、UseFieldActionModeReturn 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/actions/useFieldActionMode 的声明、导出和使用边界时，从本模块开始。
 */
import { computed } from 'vue'
import type { ComputedRef } from 'vue'

/** Field Action Mode 的语义模型。 */
export type FieldActionMode = 'editable' | 'readonly'

/** Use Field Action Mode Options 的调用配置。 */
type UseFieldActionModeOptions = {
    /** 是否 is Editable。 */
isEditable: ComputedRef<boolean>}

/** Use Field Action Mode Return 的语义模型。 */
type UseFieldActionModeReturn = {
    /** action Mode 字段。 */
actionMode: ComputedRef<FieldActionMode>
    /** choose By Mode 回调。 */
chooseByMode: <T>(editableValue: T, readonlyValue: T) => ComputedRef<T>}

export function useFieldActionMode(options: UseFieldActionModeOptions): UseFieldActionModeReturn {
  const actionMode = computed<FieldActionMode>(() => (options.isEditable.value ? 'editable' : 'readonly'))

  function chooseByMode<T>(editableValue: T, readonlyValue: T): ComputedRef<T> {
    return computed(() => (actionMode.value === 'editable' ? editableValue : readonlyValue))
  }

  return {
    actionMode,
    chooseByMode,
  }
}