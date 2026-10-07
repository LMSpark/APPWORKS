/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useChoiceFieldState
 * 职责：提供 useChoiceFieldState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use choice field state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { useOptionFieldState } from './useOptionFieldState'
import type { OptionFieldStateProps } from './useOptionFieldState'

/** Use Choice Field State Options 的调用配置。 */
type UseChoiceFieldStateOptions<TValue> = {
    /** 组件属性集合。 */
props: OptionFieldStateProps<TValue>
    /** field Type 字段。 */
fieldType: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** coerce 回调。 */
coerce: (rawValue: unknown) => TValue}

export function useChoiceFieldState<TValue>(
  options: UseChoiceFieldStateOptions<TValue>,
) {
  const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    fallbackValue: options.fallbackValue,
    emitUpdate: value => options.emitUpdate(value),
    coerce: options.coerce,
  })

  return {
    fieldOptions: optionResult.options,
    fieldValue: optionResult.fieldValue,
    isCurrentFieldEditable: optionResult.isCurrentFieldEditable,
    fieldCtx,
    handleControlledChange,
  }
}
