<!--
@module app:components/NavIcon
职责：提供主应用 NavIcon 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 components/NavIcon。
-->
<script setup lang="ts">
import { computed } from 'vue'
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{
  name?: string | undefined
  size?: number | undefined
  fallback?: string | undefined
}>()

const LEGACY_ICON_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'DataBase': 'Coin',
  'FolderOpen': 'FolderOpened',
  'e-data-validation': 'DataBoard',
  'e-date-occurring': 'Calendar',
  'e-folder-open': 'FolderOpened',
  'e-hyperlink-copy': 'Link',
  'e-layers': 'Coin',
  'e-paste-match-destination': 'RefreshLeft',
  'e-pentagon': 'DataBoard',
  'layui-icon-app': 'Grid',
  'layui-icon-component': 'Cpu',
  'layui-icon-fonts-code': 'Tickets',
  'layui-icon-group': 'UserFilled',
  'layui-icon-ie': 'Coin',
  'layui-icon-note': 'Collection',
  'layui-icon-senior': 'Lock',
  'layui-icon-table': 'Grid',
  'layui-icon-tabs': 'Operation',
  'layui-icon-templeate-1': 'Files',
  'layui-icon-template': 'Files',
  'layui-icon-template-1': 'Files',
  'layui-icon-transfer': 'Switch',
  'layui-icon-vercode': 'Lock',
  'layui-icon-windows': 'Monitor',
})

const normalizedName = computed(() => {
  const name = props.name?.trim()
  if (!name) return undefined
  return name
})

const resolvedIcon = computed(() => {
  const rawName = normalizedName.value
  if (!rawName) return null
  const tokens = rawName.split(/\s+/).filter(token => token !== 'e-icons')
  const directName = tokens.find(token => Object.hasOwn(Icons, token))
  const aliasName = tokens.map(token => LEGACY_ICON_ALIASES[token]).find(Boolean)
  const fallbackName = props.fallback?.trim() || (looksLikeLegacyIconClass(rawName) ? 'Document' : '')
  const iconName = directName ?? aliasName ?? fallbackName
  return iconName ? Object.entries(Icons).find(([name]) => name === iconName)?.[1] ?? null : null
})

const fallbackText = computed(() => {
  const rawName = normalizedName.value
  if (!rawName || looksLikeLegacyIconClass(rawName)) return ''
  return rawName
})

function looksLikeLegacyIconClass(value: string): boolean {
  return value.includes(' ') || /^(?:e-|layui-icon)/.test(value)
}
</script>

<template>
  <el-icon v-if="resolvedIcon" :size="size"><component :is="resolvedIcon" /></el-icon>
  <span v-else-if="fallbackText" class="nav-icon-emoji">{{ fallbackText }}</span>
</template>

<style scoped>
.nav-icon-emoji {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
