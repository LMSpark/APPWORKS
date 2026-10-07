/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/value/useSwitchNullValue
 * 职责：提供 useSwitchNullValue（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use switch null value 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { computed, watchEffect } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { ValueRef } from '../../../../shared-types.js'
import { isDataViewEditingSource } from '../../../context/dataViewEditing'

/** Bound Boolean Column 的语义模型。 */
type BoundBooleanColumn = {
    /** 类型标识。 */
type: string
    /** 是否 allow DBNull。 */
allowDBNull?: boolean | undefined}

/** Use Switch Null Value Options 的调用配置。 */
type UseSwitchNullValueOptions = {
    /** bound Column 字段。 */
boundColumn: ValueRef<BoundBooleanColumn | null | undefined>
    /** context Data 字段。 */
contextData: DataRow | null
    /** data Source 字段。 */
dataSource: unknown
    /** 绑定字段名。 */
fieldName: ValueRef<string>
    /** sync Value 回调。 */
syncValue: (value: boolean | null) => void}

export function useSwitchNullValue(options: UseSwitchNullValueOptions) {
  const normalizedEmptyValue = computed<boolean | null>(() => {
    const column = options.boundColumn.value
    if (!column) return false
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return false
    return column.allowDBNull === true ? null : false
  })

  watchEffect(() => {
    const contextData = options.contextData
    const fieldName = options.fieldName.value
    if (fieldName.length === 0 || contextData === null) return
    const column = options.boundColumn.value
    if (!column) return
    const colType = column.type.toLowerCase()
    if (colType !== 'boolean' && colType !== 'bool') return
    const raw = contextData[fieldName]
    if (raw === '' || raw === undefined) {
      if (isDataViewEditingSource(options.dataSource) && options.dataSource.getPkKey(contextData) === undefined) return
      options.syncValue(normalizedEmptyValue.value)
    }
  })

  return {
    normalizedEmptyValue,
  }
}