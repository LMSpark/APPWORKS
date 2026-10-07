/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/value/useRangeFilterMode
 * 职责：提供 useRangeFilterMode（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use range filter mode 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { computed } from 'vue'
import type { SparkRangeFilterProps } from '../../../../shared-types.js'

export function useRangeFilterMode(props: SparkRangeFilterProps) {
  return computed(() => props.filterMode === 'range')
}