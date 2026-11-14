<!--
@module app:layout/NavContextSelector
职责：在应用头部呈现导航上下文（项目）选择，选择结果写回唯一 useNav 上下文。
边界：选项与当前值镜像 RuntimeNavigationContextState，经本地 DataView 绑定标准 FieldSelect；不持久化、不创建导航数据。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/NavContextSelector。
-->
<template>
  <div class="nav-context-selector">
    <span class="nav-context-selector__label">项目</span>
    <RendererForm v-if="local" class="nav-context-selector__select" :data-view-key="local.key(VALUE_TABLE)" label-width="0px" :grid-columns="1">
      <FieldSelect
        field="selected"
        label=""
        :option-data-view-key="local.key(OPTION_TABLE)"
        option-value-field="id"
        option-label-field="title"
        :placeholder="state.loading ? '加载中…' : (state.config.placeholder ?? '请选择')"
      />
    </RendererForm>
    <span v-if="state.error" class="nav-context-selector__error" :title="state.error">⚠</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import type { RuntimeNavigationContextState } from '@spark-appworks/spark-app'
import { useNav } from '@spark-appworks/spark-app'
import { FieldSelect, PAGE_RUNTIME, RendererForm, useSparkComponent } from '@spark-appworks/spark-component'
import { HostLocalRuntime } from './host-local-runtime'

const props = defineProps<{
  state: RuntimeNavigationContextState
}>()

const VALUE_TABLE = 'HostNavContext'
const OPTION_TABLE = 'HostNavContextOptions'
const VALUE_ROW = 'context'

const nav = useNav()
const { sparkProvide, sparkRemove } = useSparkComponent({ type: 'nav-context-selector' })
const local = shallowRef<HostLocalRuntime>()
let unsubscribe: (() => void) | undefined
let active = true

function selectedValue(): string {
  return props.state.selected !== null ? String(props.state.selected) : ''
}

function optionRows(): DataRow[] {
  return props.state.items.map(item => ({ id: String(item.id), title: item.title }))
}

void HostLocalRuntime.create({ scenarioId: 'host-nav-context', tables: {
  [VALUE_TABLE]: { columns: [{ name: 'id', type: 'string' }, { name: 'selected', type: 'string' }], rows: [{ id: VALUE_ROW, selected: selectedValue() }] },
  [OPTION_TABLE]: { columns: [{ name: 'id', type: 'string' }, { name: 'title', type: 'string' }], rows: optionRows() },
} }).then(created => {
  if (!active) { created.dispose(); return }
  created.replaceRows(OPTION_TABLE, optionRows())
  created.write(VALUE_TABLE, VALUE_ROW, { selected: selectedValue() })
  sparkProvide(PAGE_RUNTIME, created.runtime)
  unsubscribe = created.onFieldEdit(VALUE_TABLE, (field, value) => {
    if (field === 'selected') onSelect(typeof value === 'string' ? value : '')
  })
  local.value = created
})

watch(() => props.state.items, () => local.value?.replaceRows(OPTION_TABLE, optionRows()))
watch(selectedValue, value => local.value?.write(VALUE_TABLE, VALUE_ROW, { selected: value }))

function onSelect(val: string) {
  if (val === '') {
    nav?.setContextValue(null)
    return
  }
  // 回查原始 opt.id 类型，避免 number → string 隐式转换
  const item = props.state.items.find(o => String(o.id) === val)
  nav?.setContextValue(item?.id ?? val)
}

onBeforeUnmount(() => {
  active = false
  unsubscribe?.()
  sparkRemove(PAGE_RUNTIME)
  local.value?.dispose()
})
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

.nav-context-selector__select :deep(.el-form-item) {
  margin-bottom: 0;
}

.nav-context-selector__select :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--spark-border-color, #dcdfe6) inset;
  border-radius: 6px;
  transition: box-shadow 0.2s;
}

.nav-context-selector__select :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5, #79bbff) inset;
}

.nav-context-selector__select :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary, #409eff) inset;
}

.nav-context-selector__error {
  color: #f56c6c;
  font-size: 14px;
  cursor: help;
}
</style>
