<!--
@module @spark-appworks/spark-component:components/fields/data-components/file/FieldFileBrowser/FieldFileBrowser
职责：实现 FieldFileBrowser（r-file-browser）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field file browser 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="file-browser-value">{{ value }}</span>
    </template>
    <template #form>
      <div class="file-browser-field">
        <el-input
          :model-value="fieldValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="browse-action-button" :disabled="!hasBrowseCapabilityValue" @click="openFileDialog">{{ buttonText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
      </div>
    </template>
    <template #tree>
      <span class="file-browser-value">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value file-browser-value">{{ currentDisplayValue }}</span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 文件浏览器字段，绑定文件路径字符串，弹窗式文件选择，支持 MIME 类型过滤和目录浏览。
 * @notes 与 r-file-path 基本一致，差异在于内置的浏览器 UI 体验
 */
import { computed } from 'vue'
import { useFileFieldActions } from '../../../actions/useFileFieldActions'
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import { useFileBrowserFieldState } from '../../composables/state/useFileFieldState'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RFileBrowserProps } from './FieldFileBrowser.props'

const props = withDefaults(defineProps<RFileBrowserProps>(), {
  type: 'r-file-browser',
  accept: '',
  multiple: false,
  clearable: true,
  separator: ', ',
  placeholder: '请选择文件',
  buttonText: '浏览',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-file-browser',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const {
  displayLabel,
  pageService,
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
} = permission

const { hasBrowseCapability, browseFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

async function updateValue(value: string): Promise<void> {
  await handleControlledChange(value)
}

const {
  canBrowse: hasBrowseCapabilityValue,
  showClearButton,
  openFileDialog,
  clearValue,
} = useFileBrowserFieldState({
  displayLabel,
  currentRawStringValue,
  isCurrentFieldEditable,
  hasBrowseCapability,
  accept: computed(() => props.accept),
  multiple: computed(() => props.multiple),
  separator: computed(() => props.separator),
  canClear: computed(() => props.clearable),
  browseFiles,
  updateValue,
})
</script>

<style scoped>
.file-browser-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-browser-field :deep(.el-input) {
  flex: 1;
}

.file-browser-value {
  word-break: break-all;
}
</style>
