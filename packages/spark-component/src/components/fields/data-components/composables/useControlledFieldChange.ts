/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useControlledFieldChange
 * 职责：提供 useControlledFieldChange（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use controlled field change 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { useEventDefaults } from '../../../containers/support/index.js'

/** Field Value Update Emitter 的语义模型。 */
export type FieldValueUpdateEmitter<TValue> = {
  (event: 'update:modelValue', value: TValue): void}

/** Field Value Update Emits 的语义模型。 */
export type FieldValueUpdateEmits<TValue> = {
    /** update:model Value 字段。 */
'update:modelValue': [value: TValue]}

export function emitFieldValueUpdate<TValue>(
  emit: FieldValueUpdateEmitter<TValue>,
  value: TValue,
): void {
  emit('update:modelValue', value)
}

/** Use Controlled Field Change Options 的调用配置。 */
type UseControlledFieldChangeOptions<TValue> = {
    /** get Value 回调。 */
getValue: () => TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** sync Value 回调。 */
syncValue: (value: TValue) => void
    /** after Default 回调。 */
afterDefault?: (nextValue: TValue, previousValue: TValue) => void | Promise<void>
    /** handler Source 字段。 */
handlerSource?: Readonly<Record<string, unknown>>}

/**
 * 字段变更的统一 A/B/C 包装层。
 *
 * 对外保留字段语义（nextValue / previousValue / control），
 * 内部统一委托给 useEventDefaults，避免各字段组件重复拼装 change 分发逻辑。
 */
export function useControlledFieldChange<TValue>(options: UseControlledFieldChangeOptions<TValue>) {
  const { dispatch } = useEventDefaults<{ change: [nextValue: TValue, previousValue: TValue] }>({
    change: {
      systemDefault: async (nextValue, previousValue) => {
        options.emitUpdate(nextValue)
        options.syncValue(nextValue)
        await options.afterDefault?.(nextValue, previousValue)
      },
    },
  }, options.handlerSource ?? {})

  async function handleControlledChange(nextValue: TValue): Promise<void> {
    await dispatch('change', nextValue, options.getValue())
  }

  return {
    handleControlledChange,
  }
}
