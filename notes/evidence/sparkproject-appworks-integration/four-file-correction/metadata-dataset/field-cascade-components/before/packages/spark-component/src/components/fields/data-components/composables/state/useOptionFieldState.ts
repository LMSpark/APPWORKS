/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useOptionFieldState
 * 职责：提供 useOptionFieldState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use option field state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import type { SparkOptionFieldProps } from '../../../../shared-types.js'
import { useFieldControlState } from './useFieldControlState'
import { useOptionField } from '../../../options/useFieldOptions'
import type { useFieldOptions } from '../../../options/useFieldOptions'
import type { FieldComposableProps } from '../../../context/field-composable-props'

/** 选项类字段组件共享的受控值和选项 props。 */
export type OptionFieldStateProps<TValue> = FieldComposableProps<Omit<SparkOptionFieldProps<TValue>, 'modelValue' | 'value' | 'options'>> & {
  /** Vue v-model 当前值。 */
  modelValue?: TValue | undefined
  /** 兼容非 v-model 场景的当前值。 */
  value?: TValue | undefined
  /** 原始选项集合，后续由 useFieldOptions 归一化。 */
  options?: unknown[] | undefined
}

/** 创建选项类字段运行态所需的输入。 */
type UseOptionFieldStateOptions<TValue> = {
  /** 选项字段组件 props。 */
  props: OptionFieldStateProps<TValue>
  /** 字段组件类型，用于字段上下文注册。 */
  fieldType: string
  /** 当前值缺失或无效时使用的默认值。 */
  fallbackValue: TValue
  /** 向 Vue v-model/update 事件发出新值。 */
  emitUpdate: (value: TValue) => void
  /** 将未知原始值转换成字段组件的值类型。 */
  coerce: (rawValue: unknown) => TValue
  /** 自定义当前值展示文本。 */
  formatDisplay?: (value: unknown, helpers: ReturnType<typeof useFieldOptions>) => string
}

export function useOptionFieldState<TValue>(options: UseOptionFieldStateOptions<TValue>) {
  const optionResult = useOptionField<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: optionResult,
    emitUpdate: value => options.emitUpdate(value),
  })

  function syncTextStorage(value: TValue): void {
    const storageField = options.props.textStorageField?.trim()
    if (!storageField || optionResult.contextData === null) return

    const labels = optionResult.findOptionLabels(value)
    optionResult.contextData[storageField] = labels.length > 1
      ? labels.join(options.props.textSeparator ?? ', ')
      : (labels[0] ?? '')
  }

  async function handleOptionFieldChange(value: TValue): Promise<void> {
    await handleControlledChange(value)
    syncTextStorage(value)
  }

  return {
    optionResult,
    fieldCtx,
    handleControlledChange: handleOptionFieldChange,
  }
}
