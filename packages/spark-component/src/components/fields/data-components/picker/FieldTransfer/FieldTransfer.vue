<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldTransfer/FieldTransfer
职责：实现 FieldTransfer（r-transfer）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field transfer 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-transfer
        :model-value="fieldValue"
        :data="transferData"
        :titles="titles"
        :filterable="filterable"
        :filter-placeholder="filterPlaceholder"
        :target-order="targetOrder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 穿梭框字段，绑定数组值，支持搜索过滤。
 */
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringNumberArray } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RTransferProps, TransferValue } from './FieldTransfer.props'

const props = withDefaults(defineProps<RTransferProps>(), {
  type: 'r-transfer',
  titles: () => ['待选', '已选'],
  filterable: false,
  filterPlaceholder: '请输入关键词',
  targetOrder: 'original',
})

const emit = defineEmits<FieldValueUpdateEmits<TransferValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TransferValue>({
  props,
  fieldType: 'r-transfer',
  fallbackValue: [],
  coerce: coerceStringNumberArray,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { transferData, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: TransferValue): Promise<void> {
  await handleControlledChange(value)
}
</script>

