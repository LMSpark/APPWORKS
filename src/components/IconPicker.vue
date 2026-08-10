<!--
@module app:components/IconPicker
职责：提供主应用 IconPicker 能力，围绕 Props 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 components/IconPicker。
-->
<template>
  <el-popover trigger="click" :width="360" placement="bottom-start">
    <template #reference>
      <el-button class="icon-trigger" :style="{ width: triggerWidth }">
        <el-icon v-if="resolvedIcon" :size="18"><component :is="resolvedIcon" /></el-icon>
        <NavIcon v-else-if="props.modelValue" :name="props.modelValue" fallback="Document" :size="18" />
        <span v-else class="icon-placeholder">{{ props.placeholder }}</span>
      </el-button>
    </template>
    <div class="icon-search">
      <el-input v-model="keyword" placeholder="搜索图标…" :prefix-icon="Search" size="small" clearable />
    </div>
    <div class="icon-grid">
      <button
        v-for="name in filtered"
        :key="name"
        class="icon-cell"
        :class="{ active: name === resolvedIconName }"
        :title="name"
        @click="select(name)"
      ><el-icon :size="18"><component :is="resolveIcon(name)" /></el-icon></button>
    </div>
    <div v-if="!filtered.length" class="icon-empty">无匹配图标</div>
    <div v-if="props.modelValue" class="icon-footer">
      <span class="icon-name">{{ props.modelValue }}</span>
      <el-button size="small" link type="danger" @click="select('')">清除</el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import * as Icons from '@element-plus/icons-vue'
import NavIcon from './NavIcon.vue'

/** 图标选择器属性，描述当前图标值和输入外观。 */
type Props = {
  /** 当前选中的图标名称。 */
  modelValue?: string
  /** 未选择图标时的占位提示。 */
  placeholder?: string
  /** 图标选择器输入框宽度。 */
  width?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '选择图标',
  width: 60,
})

const triggerWidth = computed(() => {
  return typeof props.width === 'number' ? `${props.width}px` : props.width
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const iconEntries = Object.entries(Icons).filter(([name]) => name !== 'default')
const allNames = iconEntries.map(([name]) => name).sort()

const keyword = ref('')

const resolvedIconName = computed(() => {
  const raw = props.modelValue?.trim() ?? ''
  if (!raw) return ''
  return raw
})

function resolveIcon(name: string) {
  return iconEntries.find(([entryName]) => entryName === name)?.[1] ?? null
}

const resolvedIcon = computed(() => {
  if (!resolvedIconName.value) return null
  return resolveIcon(resolvedIconName.value)
})

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase()
  if (!kw) return allNames
  return allNames.filter(n => n.toLowerCase().includes(kw))
})

function select(name: string) {
  emit('update:modelValue', name)
}
</script>

<style scoped>
.icon-trigger {
  min-width: 42px;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
}
.icon-placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.icon-search {
  margin-bottom: 8px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}
.icon-cell {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-regular);
  transition: all 0.15s;
}
.icon-cell:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
.icon-cell.active {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}
.icon-empty {
  text-align: center;
  padding: 16px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
.icon-footer {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 4px;
}
.icon-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
