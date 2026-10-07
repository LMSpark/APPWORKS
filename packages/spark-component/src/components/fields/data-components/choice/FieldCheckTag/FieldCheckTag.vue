<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckTag/FieldCheckTag
职责：实现 FieldCheckTag（r-check-tag）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field check tag 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-check-tag
    v-if="isVisible"
    :checked="isChecked"
    :disabled="isDisabled"
    @change="handleChange"
  >
    <slot>{{ label }}</slot>
  </el-check-tag>
</template>

<script setup lang="ts">
/**
 * @description 标签选择字段，绑定 boolean 值。
 */
import { ref, watch } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import type { RCheckTagProps } from './FieldCheckTag.props'

const props = withDefaults(defineProps<RCheckTagProps>(), {
  type: 'r-check-tag',
  checked: false,
})

const emit = defineEmits<{
  /**
   * Checked state changed; 用户切换标签选中状态。
   * @param checked Next checked state.
   */
  change: [checked: boolean]
  /**
   * Checked state synced; 同步 checked 受控值。
   * @param checked Next checked state.
   */
  'update:checked': [checked: boolean]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const isChecked = ref(props.checked)

watch(() => props.checked, (v) => {
  isChecked.value = v
})

function handleChange(val: boolean) {
  isChecked.value = val
  emit('update:checked', val)
  emit('change', val)
}
</script>


