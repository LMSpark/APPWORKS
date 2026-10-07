/**
 * @module @spark-appworks/spark-component:components/fields/createPickerPreset
 * 职责：维护 @spark-appworks/spark-component 中 components/fields/createPickerPreset 的模块能力，围绕 PickerPresetDefaults 提供稳定的公开契约。
 * 边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
 * AI用途：需要定位 components/fields/createPickerPreset 的声明、导出和使用边界时，从本模块开始。
 */
/**
 * Picker 变体工厂 —— 配置驱动生成 EntityPicker 的预设包装组件。
 *
 * FieldUserPicker.vue 等预设组件从 `../createPickerPreset` 引入该工厂，
 * 再注册为 `r-user-picker` / `r-dept-picker` 等具体字段类型。
 *
 * 每个变体组件仅覆盖 FieldEntityPicker 的若干默认 prop，其余完全透传。
 */
import { computed, defineComponent, h } from 'vue'
import type { PageSelectorOption } from '../internal'
import type { SparkOptionValueMode } from '../shared-types'
import { emitFieldValueUpdate } from './data-components/composables/value/useControlledFieldChange'
import FieldEntityPicker from './data-components/picker/FieldEntityPicker/FieldEntityPicker.vue'

/** Picker Preset Defaults 的语义模型。 */
type PickerPresetDefaults = {
    /** 占位提示文本。 */
placeholder: string
    /** button Text 文本。 */
buttonText: string
    /** readonly Button Text 文本。 */
readonlyButtonText: string
    /** entity Name 名称。 */
entityName: string}

function isSparkOptionValueMode(value: unknown): value is SparkOptionValueMode {
  return value === 'auto' || value === 'array' || value === 'separated-string'
}

/**
 * 所有 picker 变体共享的 prop 声明。
 * 与 FieldEntityPicker 的 Props 接口一一对应，确保 v-bind 透传正确。
 */
const SHARED_PROPS = {
  /** 字段绑定名 */
  field: { type: String, default: undefined },
  /** 组件名称 */
  name: { type: String, default: undefined },
  /** 展示标签 */
  label: { type: String, default: undefined },
  /** 字段宽度 */
  width: { type: Number, default: undefined },
  /** 直接传入的值 */
  modelValue: { type: [String, Number, Array, Boolean], default: undefined },
  /** 可选项数组 */
  options: { type: Array, default: undefined },
  /** 选项 DataView 定位键 */
  optionDataViewKey: { type: String, default: undefined },
  /** 选项显示字段 */
  optionLabelField: { type: String, default: undefined },
  /** 选项值字段 */
  optionValueField: { type: String, default: undefined },
  /** 占位文案 */
  placeholder: { type: String, default: undefined },
  /** 主动作按钮文案 */
  buttonText: { type: String, default: undefined },
  /** 只读模式按钮文案 */
  readonlyButtonText: { type: String, default: undefined },
  /** 是否允许清空 */
  clearable: { type: Boolean, default: true },
  /** 是否启用多选 */
  multiple: { type: Boolean, default: false },
  /** 是否支持搜索 */
  searchable: { type: Boolean, default: true },
  /** 值分隔符 */
  valueSeparator: { type: String, default: undefined },
  /** 文本分隔符 */
  textSeparator: { type: String, default: undefined },
  /** 文本储存字段 */
  textStorageField: { type: String, default: undefined },
  /** 主值持久化模式 */
  valueMode: { type: String, default: 'auto', validator: isSparkOptionValueMode },
  /** 实体名称 */
  entityName: { type: String, default: undefined },
  children: { type: Array, default: undefined },
}

/**
 * 根据预设默认值创建一个 EntityPicker 变体组件。
 */
export function createPickerPreset(defaults: PickerPresetDefaults) {
  return defineComponent({
    name: `FieldEntityPicker[${defaults.entityName}]`,
    props: SHARED_PROPS,
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const forwardedProps = computed<Record<string, unknown>>(() => {
        const result: Record<string, unknown> = {}

        // 定义值 prop 列表（仅在 !== undefined 时透传，避免覆盖 EntityPicker 默认值）
        const conditionalKeys = [
          'label', 'width',
          'options', 'optionDataViewKey', 'optionLabelField', 'optionValueField', 'children',
        ] as const

        for (const key of conditionalKeys) {
          if (props[key] !== undefined) {
            result[key] = props[key]
          }
        }

        if (props['modelValue'] !== undefined) {
          result['modelValue'] = props['modelValue']
        }

        const resolvedField = props['field'] ?? props['name']
        if (resolvedField !== undefined) {
          result['field'] = resolvedField
        }

        // 带预设默认值的 prop —— 用户传值优先，否则使用 preset
        result['placeholder'] = props['placeholder'] ?? defaults.placeholder
        result['buttonText'] = props['buttonText'] ?? defaults.buttonText
        result['readonlyButtonText'] = props['readonlyButtonText'] ?? defaults.readonlyButtonText
        result['entityName'] = props['entityName'] ?? defaults.entityName

        // 始终透传的标量 prop
        result['clearable'] = props['clearable']
        result['multiple'] = props['multiple']
        result['searchable'] = props['searchable']
        if (props['valueSeparator'] !== undefined) {
          result['valueSeparator'] = props['valueSeparator']
        }
        if (props['textSeparator'] !== undefined) {
          result['textSeparator'] = props['textSeparator']
        }
        if (props['textStorageField'] !== undefined) {
          result['textStorageField'] = props['textStorageField']
        }
        result['valueMode'] = isSparkOptionValueMode(props['valueMode']) ? props['valueMode'] : 'auto'

        return result
      })

      return () => h(FieldEntityPicker, {
        type: 'r-entity-picker',
        ...forwardedProps.value,
        'onUpdate:modelValue': (value: PageSelectorOption['value'] | Array<PageSelectorOption['value']> | string) => emitFieldValueUpdate(emit, value),
      })
    },
  })
}
