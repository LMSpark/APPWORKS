<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldImage
职责：实现 FieldImage（r-image）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field image 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <img v-if="showImage(String(value ?? ''))" :src="String(value ?? '')" class="image-thumb" alt="image" />
      <span v-else>{{ value }}</span>
    </template>
    <template #form>
      <div class="image-field-form">
        <div class="image-field-toolbar">
          <el-input
            :model-value="currentDisplayValue"
            readonly
            :placeholder="placeholder"
          />
          <el-button class="primary-action-button" type="primary" :disabled="!canPrimaryAction" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
          <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
        </div>
        <img v-if="showImage(currentDisplayValue)" :src="currentDisplayValue" class="image-preview" alt="image" />
      </div>
    </template>
    <template #tree>
      <span class="tree-node-image">
        <img v-if="showImage(currentDisplayValue)" :src="currentDisplayValue" class="image-thumb" alt="image" />
        <span v-else>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value">
          <img v-if="showImage(currentDisplayValue)" :src="currentDisplayValue" class="image-preview" alt="image" />
          <span v-else>{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 图片上传字段，绑定图片路径字符串，支持图片上传和缩略图预览显示。
 */
import { computed } from 'vue'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceStringValue } from './composables/fieldValueCoercion'
import { useUploadBrowseFieldState } from './composables/useFileFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RImageProps } from './FieldImage.props'

const props = withDefaults(defineProps<RImageProps>(), {
  type: 'r-image',
  action: '#',
  accept: 'image/*',
  multiple: false,
  separator: ', ',
  placeholder: '请选择图片',
  buttonText: '上传图片',
  readonlyButtonText: '浏览',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-image',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const {
  displayLabel,
  fieldName,
  pageService,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
} = permission

const { hasBrowseCapability, hasUploadCapability, primaryAction, browseFiles, uploadFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

function showImage(value: string): boolean {
  return !!value && value !== '••••'
}

async function updateValue(value: string): Promise<void> {
  await handleControlledChange(value)
}

const {
  canPrimaryAction,
  primaryActionText,
  showClearButton,
  handlePrimaryAction,
  clearValue,
} = useUploadBrowseFieldState({
  displayLabel,
  fieldName,
  currentRawStringValue,
  isCurrentFieldEditable,
  hasBrowseCapability,
  hasUploadCapability,
  primaryAction,
  buttonText: computed(() => props.buttonText),
  readonlyButtonText: computed(() => props.readonlyButtonText),
  canClear: computed(() => props.clearable),
  action: computed(() => props.action),
  accept: computed(() => props.accept),
  multiple: computed(() => props.multiple),
  separator: computed(() => props.separator),
  browseFiles,
  uploadFiles,
  updateValue,
})
</script>

<style scoped>
.image-field-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.image-field-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.image-field-toolbar :deep(.el-input) {
  flex: 1;
}
.image-thumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid #dcdfe6;
}
.image-preview {
  max-width: 160px;
  max-height: 120px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  object-fit: cover;
}
</style>
