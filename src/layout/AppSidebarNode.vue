<!--
@module app:layout/AppSidebarNode
职责：提供主应用 AppSidebarNode 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppSidebarNode。
-->
<template>
  <el-sub-menu v-if="shouldRenderAsSubMenu(item)" :index="item.id">
    <template #title>
      <span class="app-sidebar__menu-label">
        <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
        <span v-if="showText" class="app-sidebar__menu-text">{{ item.title }}</span>
      </span>
    </template>
    <AppSidebarNode
      v-for="child in visibleChildren(item)"
      :key="child.id"
      :item="child"
      :collapsed="collapsed"
      :show-text="true"
    />
  </el-sub-menu>

  <el-menu-item-group v-else-if="isDirectoryGroupNode(item)" :title="showText ? item.title : ''">
    <AppSidebarNode
      v-for="child in visibleChildren(item)"
      :key="child.id"
      :item="child"
      :collapsed="collapsed"
      :show-text="showText"
    />
  </el-menu-item-group>

  <template v-else>
    <el-menu-item
      :index="menuIndex(item)"
      :class="{ 'app-sidebar__menu-item--active': isActive(item) }"
      :disabled="item.disabled"
      @click="onItemClick(item)"
    >
      <template #default>
        <span class="app-sidebar__menu-label">
          <NavIcon :name="item.icon" class="app-sidebar__menu-icon" />
          <span v-if="showText" class="app-sidebar__menu-text">{{ item.title }}</span>
        </span>
      </template>
    </el-menu-item>
    <li v-if="showDividerAfter(item)" class="app-sidebar__node-divider" role="separator" aria-hidden="true" />
  </template>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import NavIcon from '@/components/NavIcon.vue'

const props = withDefaults(defineProps<{
  item: RuntimeNavigationItem
  collapsed?: boolean
  showText?: boolean
}>(), {
  collapsed: false,
  showText: true,
})

const route = useRoute()
const nav = useNav()

function menuIndex(item: RuntimeNavigationItem): string {
  return item.path ?? item.id
}

function shouldRenderAsSubMenu(item: RuntimeNavigationItem): boolean {
  const children = visibleChildren(item)
  if (children.length === 0) return false
  if (!isDirectoryNode(item)) return false
  const placement = item.childPlacement
  if (placement === 'parent' || placement === 'flat') return true
  return children.some((child) => isDirectoryNode(child) && visibleChildren(child).length > 0)
}

function isDirectoryNode(item: RuntimeNavigationItem): boolean {
  return item.itemKind === 'module' || item.itemKind === 'system-directory'
}

function isDirectoryGroupNode(item: RuntimeNavigationItem): boolean {
  return isDirectoryNode(item) && visibleChildren(item).length > 0
}

function visibleChildren(item: RuntimeNavigationItem): RuntimeNavigationItem[] {
  return (item.children ?? []).filter((child) => !child.hidden)
}

function isActive(item: RuntimeNavigationItem): boolean {
  return nav?.isNodeActive(item) ?? menuIndex(item) === route.path
}

function showDividerAfter(item: RuntimeNavigationItem): boolean {
  return !props.collapsed && item.dividerAfter === true
}

function onItemClick(item: RuntimeNavigationItem) {
  nav?.navigateTo(item)
}
</script>
