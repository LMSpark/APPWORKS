<!--
@module @spark-appworks/spark-app:page-ui/AppPageUiHost
职责：提供应用壳层 AppPageUiHost 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接导航、认证、插件、主题或 AI 宿主接线。
边界：只负责 spark-app 基础设施和运行时接线，不定义底层 DataSet，也不实现组件渲染细节。
AI用途：需要理解应用层如何把路由、服务和组件系统组装起来时，用本模块定位 page-ui/AppPageUiHost。
-->
<template>
  <el-dialog
    :model-value="appPageUiState.dialog.visible"
    :title="appPageUiState.dialog.title"
    :width="appPageUiState.dialog.width"
    append-to-body
    destroy-on-close
    @close="closeAppDialog"
    @update:model-value="handleDialogModelValueUpdate"
  >
    <div v-if="appPageUiState.dialog.dangerouslyUseHTMLString" v-html="appPageUiState.dialog.content"></div>
    <div v-else class="app-page-ui-content">{{ appPageUiState.dialog.content }}</div>

    <template #footer>
      <div class="app-page-ui-footer">
        <el-button v-if="appPageUiState.dialog.showCancelButton" @click="cancelAppDialog">
          {{ appPageUiState.dialog.cancelText }}
        </el-button>
        <el-button type="primary" @click="confirmAppDialog">
          {{ appPageUiState.dialog.confirmText }}
        </el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    :model-value="appPageUiState.selector.visible"
    :title="appPageUiState.selector.title"
    width="640px"
    append-to-body
    destroy-on-close
    @close="closeAppSelector"
    @update:model-value="handleSelectorModelValueUpdate"
  >
    <div class="app-page-selector-body">
      <el-input
        v-if="appPageUiState.selector.searchable"
        :model-value="appPageUiState.selector.searchKeyword"
        :placeholder="appPageUiState.selector.placeholder"
        class="app-page-selector-search"
        @update:model-value="handleSearchKeywordUpdate"
      />

      <div v-if="filteredSelectorOptions.length > 0" class="app-page-selector-list">
        <template v-if="appPageUiState.selector.multiple">
          <label
            v-for="option in filteredSelectorOptions"
            :key="String(option.value)"
            class="app-page-selector-option"
            :class="{ 'is-disabled': option.disabled === true }"
          >
            <input
              type="checkbox"
              :checked="appPageUiState.selector.selectedValues.includes(String(option.value))"
              :disabled="option.disabled === true"
              @change="handleSelectorCheckboxChange(option, $event)"
            />
            <span class="app-page-selector-texts">
              <span class="app-page-selector-label">{{ option.label }}</span>
              <span v-if="option.description" class="app-page-selector-description">{{ option.description }}</span>
            </span>
          </label>
        </template>

        <template v-else>
          <label
            v-for="option in filteredSelectorOptions"
            :key="String(option.value)"
            class="app-page-selector-option"
            :class="{ 'is-disabled': option.disabled === true }"
          >
            <input
              type="radio"
              name="app-page-selector-single"
              :checked="appPageUiState.selector.selectedValues[0] === String(option.value)"
              :disabled="option.disabled === true"
              @change="selectSingleOption(option)"
            />
            <span class="app-page-selector-texts">
              <span class="app-page-selector-label">{{ option.label }}</span>
              <span v-if="option.description" class="app-page-selector-description">{{ option.description }}</span>
            </span>
          </label>
        </template>
      </div>

      <div v-else class="app-page-selector-empty">{{ appPageUiState.selector.emptyText }}</div>
    </div>

    <template #footer>
      <div class="app-page-ui-footer">
        <el-button @click="cancelAppSelector">
          {{ appPageUiState.selector.cancelText }}
        </el-button>
        <el-button type="primary" @click="confirmAppSelector">
          {{ appPageUiState.selector.confirmText }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PageSelectorOption } from '@spark-appworks/spark-component'
import {
  appPageUiState,
  cancelAppDialog,
  cancelAppSelector,
  closeAppDialog,
  closeAppSelector,
  confirmAppDialog,
  confirmAppSelector,
} from './pageUiService'

const filteredSelectorOptions = computed(() => {
  const keyword = appPageUiState.selector.searchKeyword.trim().toLowerCase()
  if (!keyword) return appPageUiState.selector.options
  return appPageUiState.selector.options.filter((option) => {
    const label = option.label.toLowerCase()
    const description = option.description?.toLowerCase() ?? ''
    const value = String(option.value).toLowerCase()
    return label.includes(keyword) || description.includes(keyword) || value.includes(keyword)
  })
})

function handleDialogModelValueUpdate(value: boolean): void {
  if (!value) closeAppDialog()
}

function handleSelectorModelValueUpdate(value: boolean): void {
  if (!value) closeAppSelector()
}

function handleSearchKeywordUpdate(value: string): void {
  appPageUiState.selector.searchKeyword = value
}

function toggleSelectorOption(option: PageSelectorOption, checked: boolean): void {
  const key = String(option.value)
  if (checked) {
    if (!appPageUiState.selector.selectedValues.includes(key)) {
      appPageUiState.selector.selectedValues = [...appPageUiState.selector.selectedValues, key]
    }
    return
  }
  appPageUiState.selector.selectedValues = appPageUiState.selector.selectedValues.filter(value => value !== key)
}

function handleSelectorCheckboxChange(option: PageSelectorOption, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) {
    throw new Error('App page selector checkbox change event target must be an HTMLInputElement')
  }
  toggleSelectorOption(option, event.target.checked)
}

function selectSingleOption(option: PageSelectorOption): void {
  appPageUiState.selector.selectedValues = [String(option.value)]
}
</script>

<style scoped>
.app-page-ui-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.app-page-ui-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.app-page-selector-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-page-selector-search {
  width: 100%;
}

.app-page-selector-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow: auto;
}

.app-page-selector-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
}

.app-page-selector-option.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.app-page-selector-texts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app-page-selector-label {
  color: #303133;
  font-weight: 500;
}

.app-page-selector-description {
  color: #909399;
  font-size: 12px;
}

.app-page-selector-empty {
  padding: 32px 0;
  color: #909399;
  text-align: center;
}
</style>
