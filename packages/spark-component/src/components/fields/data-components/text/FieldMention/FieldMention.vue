<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldMention/FieldMention
职责：实现 FieldMention（r-mention）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field mention 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-mention
    v-if="isVisible"
    :model-value="textValue"
    :options="resolvedOptions"
    :prefix="resolvedPrefixes"
    :split="resolvedSplit"
    :filter-option="resolvedFilterOption"
    :placement="placement"
    :show-arrow="showArrow"
    :offset="offset"
    :whole="whole"
    :check-is-whole="checkIsWhole"
    :loading="loading"
    :disabled="isDisabled"
    :type="inputType"
    :placeholder="placeholder"
    :rows="rows"
    @update:model-value="handleTextInput"
    @select="handleSelect"
    @search="handleSearch"
  />
</template>

<script setup lang="ts">
/**
 * @description 提及输入字段，绑定 string 值。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { useFieldOptions } from '../../../options'
import { useActiveFieldRow } from '../../../context/useActiveFieldRow'
import type { RMentionProps } from './FieldMention.props'

type MentionResolvedOption = NonNullable<RMentionProps['options']>[number]
type MentionTrigger = NonNullable<RMentionProps['mentionTriggers']>[number]
type MentionRuntimeOption = MentionResolvedOption & {
  persistedValue?: string | number | boolean}

const props = withDefaults(defineProps<RMentionProps>(), {
  type: 'r-mention',
  placement: 'bottom',
  showArrow: false,
  inputType: 'text',
  rows: 3,
})

const emit = defineEmits<FieldValueUpdateEmits<string> & {
  /**
   * Mention option selected; 用户选择提及候选项。
   * @param option Selected mention option.
   * @param prefix Trigger prefix that matched the option.
   */
  select: [option: MentionResolvedOption, prefix: string]
  /**
   * Mention search changed; 用户在某个前缀下输入搜索文本。
   * @param pattern Current search keyword.
   * @param prefix Active mention trigger prefix.
   */
  search: [pattern: string, prefix: string]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)
const { activeRow } = useActiveFieldRow()
const activePrefix = ref<string | null>(null)

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

const mentionTriggers = computed<MentionTrigger[]>(() => {
  if (props.mentionTriggers !== undefined && props.mentionTriggers.length > 0) {
    return props.mentionTriggers
  }
  throw new Error('[r-mention] 必须提供 mentionTriggers，旧版 prefix/split 简写已移除。')
})

const resolvedPrefixes = computed(() => {
  const prefixes = mentionTriggers.value.map(trigger => trigger.prefix)
  if (prefixes.length === 0) {
    throw new Error('[r-mention] 至少需要一个 mention 触发前缀。')
  }
  if (prefixes.some(prefix => prefix.length !== 1)) {
    throw new Error('[r-mention] mentionTriggers.prefix 必须是单个字符，这与 el-mention 的底层约束一致。')
  }
  if (new Set(prefixes).size !== prefixes.length) {
    throw new Error('[r-mention] mentionTriggers.prefix 不能重复。')
  }
  return prefixes
})

const resolvedSplit = computed(() => {
  const configuredSplits = mentionTriggers.value
    .map(trigger => trigger.split)
    .filter((split): split is string => typeof split === 'string' && split.length > 0)

  const uniqueSplits = [...new Set(configuredSplits)]
  if (uniqueSplits.length > 1) {
    throw new Error('[r-mention] el-mention 只支持一个全局 split；mentionTriggers 中如果声明 split，所有项必须一致。')
  }

  if (uniqueSplits.length === 0) {
    throw new Error('[r-mention] mentionTriggers.split 必须显式声明且为单个字符。')
  }

  const split = uniqueSplits[0]
  if (split === undefined) {
    throw new Error('[r-mention] mentionTriggers.split 必须显式声明且为单个字符。')
  }

  if (split.length !== 1) {
    throw new Error('[r-mention] split 必须是单个字符，这与 el-mention 的底层约束一致。')
  }
  return split
})

const activeTrigger = computed<MentionTrigger>(() => {
  const matched = mentionTriggers.value.find(trigger => trigger.prefix === activePrefix.value)
  const fallback = mentionTriggers.value[0]
  if (!fallback) {
    throw new Error('[r-mention] 未找到可用的 mention 触发器配置。')
  }
  return matched ?? fallback
})

const resolvedFilterOption = computed(() => {
  if (activeTrigger.value.searchable === false) {
    return false
  }
  return undefined
})

// Mention 的公开配置输入只来自 mentionTriggers；
// `props.options` 只作为内部运行时结果覆盖值，不参与页面配置解析。
const mentionOptionSource = {
  get optionDataViewKey() {
    return activeTrigger.value.options?.dataViewKey
  },
  get optionLabelField() {
    return activeTrigger.value.options?.labelField
  },
  get optionValueField() {
    return activeTrigger.value.options?.valueField
  },
  get optionDisabledField() {
    return activeTrigger.value.options?.disabledField
  },
}

const { options: computedFieldOptions } = useFieldOptions(mentionOptionSource)

const resolvedOptions = computed<MentionRuntimeOption[]>(() => {
  if (props.options !== undefined) {
    return props.options.map(option => ({
      ...option,
      persistedValue: option.persistedValue ?? option.value,
    }))
  }

  return computedFieldOptions.value.map(option => {
    const mentionOption: MentionRuntimeOption = {
      value: option.label,
      label: option.label,
      persistedValue: option.value,
    }
    if (option.disabled === true) {
      mentionOption.disabled = true
    }
    return mentionOption
  })
})

const textValue = ref(normalizeTextValue(props.modelValue))

watch(() => props.modelValue, (v) => {
  const nextValue = normalizeTextValue(v)
  if (nextValue !== textValue.value) {
    textValue.value = nextValue
  }
})

function syncMainField(value: string): void {
  textValue.value = value
  emitFieldValueUpdate(emit, value)
  const row = activeRow.value
  if (row !== null && props.field) {
    row[props.field] = value
  }
}

function handleTextInput(value: string): void {
  syncMainField(value)
}

function handleSelect(option: MentionRuntimeOption, prefix: string) {
  activePrefix.value = prefix
  const writebackField = activeTrigger.value.writebackField
  const row = activeRow.value
  if (row !== null && writebackField) {
    row[writebackField] = option.persistedValue ?? option.value
  }
  emit('select', option, prefix)
}

function handleSearch(pattern: string, prefix: string) {
  activePrefix.value = prefix
  emit('search', pattern, prefix)
}
</script>
