<!--
@module app:layout/NavContextSelector
职责：提供主应用 NavContextSelector 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/NavContextSelector。
-->
<template>
  <div class="nav-context-selector">
    <span class="nav-context-selector__label">项目</span>
    <el-select
      :model-value="state.selected !== null ? String(state.selected) : ''"
      :placeholder="state.config.placeholder ?? '请选择'"
      :loading="state.loading"
      size="small"
      class="nav-context-selector__select"
      @change="(val: string) => onSelect(val)"
    >
      <el-option
        v-for="opt in state.items"
        :key="String(opt.id)"
        :label="opt.title"
        :value="String(opt.id)"
      />
    </el-select>
    <span v-if="state.error" class="nav-context-selector__error" :title="state.error">⚠</span>
  </div>
</template>

<script setup lang="ts">
import type { RuntimeNavigationContextState } from '@spark-appworks/spark-app'
import { useNav } from '@spark-appworks/spark-app'

const props = defineProps<{
  state: RuntimeNavigationContextState
}>()

const nav = useNav()

function onSelect(val: string) {
  if (val === '') {
    nav?.setContextValue(null)
    return
  }
  // 回查原始 opt.id 类型，避免 number → string 隐式转换
  const item = props.state.items.find(o => String(o.id) === val)
  nav?.setContextValue(item?.id ?? val)
}
</script>

<style scoped>
.nav-context-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--spark-border-light, #e4e7ed);
}

.nav-context-selector__label {
  font-size: 12px;
  color: var(--spark-text-secondary, #909399);
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-context-selector__select {
  width: 180px;
}

/* 精细调整 el-select 外观：更紧凑、更圆润 */
:deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--spark-border-color, #dcdfe6) inset;
  border-radius: 6px;
  transition: box-shadow 0.2s;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5, #79bbff) inset;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary, #409eff) inset;
}

:deep(.el-input__inner) {
  font-size: 13px;
}

.nav-context-selector__error {
  color: #f56c6c;
  font-size: 14px;
  cursor: help;
}
</style>
