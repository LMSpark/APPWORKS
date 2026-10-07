/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useEntityPickerState
 * 职责：提供 useEntityPickerState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use entity picker state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import { computed } from 'vue'
import type { PageSelectorOption } from '../../../../internal'
import type { FieldOption } from '../../../options/index.js'
import type {
  SparkFieldSemanticProps,
  SparkOptionFieldProps,
  SparkOptionValueMode,
  SparkPrimaryActionTextProps,
  SparkReadonlyActionTextProps,
  ValueRef,
} from '../../../../shared-types.js'

type EntityPickerSelectOption = {
  label: string
  value: PageSelectorOption['value']
  disabled?: boolean
}

type EntityPickerSelectCommand = {
  /** 选择器标题。 */
  title: string
  /** 选择器展示的实体名称。 */
  entityName: string
  /** 搜索框或空值占位文本。 */
  placeholder: string
  /** 是否允许多选。 */
  multiple: boolean
  /** 是否允许搜索。 */
  searchable: boolean
  /** 打开选择器前的当前值。 */
  currentValue: PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string
  /** 当前可选实体集合。 */
  options: EntityPickerSelectOption[]
}

type EntityPickerSelectedOption = {
  label: string
  value: PageSelectorOption['value']
}

/** 实体选择字段的运行态输入，负责选择器弹出、值模式转换和清空行为。 */
type UseEntityPickerStateOptions = {
  /** 可编辑态选择按钮文本。 */
  buttonText: ValueRef<NonNullable<SparkPrimaryActionTextProps['buttonText']>>
  /** 只读态查看按钮文本。 */
  readonlyButtonText: ValueRef<NonNullable<SparkReadonlyActionTextProps['readonlyButtonText']>>
  /** 是否允许清空当前选择值。 */
  clearable: ValueRef<NonNullable<SparkFieldSemanticProps['clearable']>>
  /** 是否允许多选实体。 */
  multiple: ValueRef<NonNullable<SparkOptionFieldProps['multiple']>>
  /** 选择器是否开启搜索。 */
  searchable: ValueRef<boolean>
  /** 多选字符串模式下的值分隔符。 */
  valueSeparator: ValueRef<NonNullable<SparkOptionFieldProps['valueSeparator']>>
  /** 多选值写回模式：数组、字符串或按当前值自动判断。 */
  valueMode: ValueRef<SparkOptionValueMode>
  /** 选择器中展示的实体名称。 */
  entityName: ValueRef<string>
  /** 选择器搜索或空值提示。 */
  placeholder: ValueRef<NonNullable<SparkFieldSemanticProps['placeholder']>>
  /** 已归一化的一维可选实体集合。 */
  flatOptions: ValueRef<FieldOption[]>
  /** 当前字段原始值，保留数组或字符串等原始形态。 */
  currentRawValue: ValueRef<PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string>
  /** 当前字段值的字符串形态，用于判断是否有值。 */
  currentRawStringValue: ValueRef<string>
  /** 当前字段是否允许写入。 */
  isCurrentFieldEditable: ValueRef<boolean>
  /** 当前页面运行时是否提供实体选择器能力。 */
  hasSelectorCapability: ValueRef<boolean>
  /** 主按钮执行选择还是只读查看。 */
  primaryAction: ValueRef<'select' | 'view'>
  /** 打开实体选择器并返回用户选择结果。 */
  selectEntities: (options: EntityPickerSelectCommand) => Promise<EntityPickerSelectedOption[]>
  /** 将选择结果写回字段值。 */
  updateValue: (value: PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string) => void | Promise<void>
}

export function useEntityPickerState(options: UseEntityPickerStateOptions) {
  const primaryActionText = computed(() => (options.primaryAction.value === 'select' ? options.buttonText.value : options.readonlyButtonText.value))
  const hasValue = computed(() => Array.isArray(options.currentRawValue.value)
    ? options.currentRawValue.value.length > 0
    : options.currentRawStringValue.value.trim().length > 0)
  const showClearButton = computed(() => options.clearable.value && options.isCurrentFieldEditable.value && hasValue.value)

  function buildNextValue(values: Array<PageSelectorOption['value']>): PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string {
    if (options.multiple.value) {
      if (options.valueMode.value === 'array') return values
      if (options.valueMode.value === 'auto' && Array.isArray(options.currentRawValue.value)) return values
      return values.map(value => String(value)).join(options.valueSeparator.value)
    }
    return values[0] ?? ''
  }

  async function openSelector(): Promise<void> {
    const selected = await options.selectEntities({
      title: `${primaryActionText.value}${options.entityName.value}`,
      entityName: options.entityName.value,
      placeholder: options.placeholder.value,
      multiple: options.multiple.value,
      searchable: options.searchable.value,
      currentValue: options.currentRawValue.value,
      options: options.flatOptions.value.map(option => ({
        label: option.label,
        value: option.value,
        ...(option.disabled === true ? { disabled: true } : {}),
      })),
    })

    if (!options.isCurrentFieldEditable.value) return
    await options.updateValue(buildNextValue(selected.map(item => item.value)))
  }

  function clearValue(): void {
    void options.updateValue(options.multiple.value && (
      options.valueMode.value === 'array'
      || (options.valueMode.value === 'auto' && Array.isArray(options.currentRawValue.value))
    ) ? [] : '')
  }

  return {
    primaryActionText,
    hasValue,
    showClearButton,
    openSelector,
    clearValue,
  }
}
