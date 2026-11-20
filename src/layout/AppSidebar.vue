<!--
@module app:layout/AppSidebar
职责：用标准 RendererMenu 呈现应用壳已授权的 RuntimeNavigationItem 侧栏，并通过唯一 useNav 上下文处理选择与激活。
边界：不创建导航数据、权限判定或路由；只把导航树映射为菜单项。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppSidebar。
-->
<template>
  <div class="app-sidebar">
    <div class="app-sidebar__logo">
      <span v-if="!collapsed" class="app-sidebar__logo-text">{{ title }}</span>
      <span v-else class="app-sidebar__logo-icon">S</span>
    </div>

    <RendererMenu
      v-if="menuItems.length"
      class="app-sidebar__menu"
      :items="menuItems"
      :active-index="activeIndex"
      :collapse="collapsed"
      background-color="transparent"
      text-color="var(--spark-sidebar-text)"
      active-text-color="var(--el-color-primary)"
      @select="onSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { RendererMenu, type MenuItem } from '@spark-appworks/spark-component'

const props = withDefaults(defineProps<{
  title?: string
  collapsed?: boolean
  items?: RuntimeNavigationItem[]
}>(), {
  title: 'SPARK',
  collapsed: false,
  items: () => [],
})

const route = useRoute()
const nav = useNav()
const safeItems = computed<RuntimeNavigationItem[]>(() => Array.isArray(props.items) ? props.items : [])

/** 活动高亮索引 */
const activeIndex = computed(() => {
  const activePath = nav?.activePath.value ?? []
  const activeNode = [...activePath]
    .reverse()
    .find((node) => typeof node.path === 'string' && node.path.length > 0)
  return activeNode !== undefined ? menuIndex(activeNode) : route.path
})

const nodesByIndex = computed(() => {
  const nodes = new Map<string, RuntimeNavigationItem>()
  const visit = (items: readonly RuntimeNavigationItem[]) => items.forEach(item => {
    nodes.set(menuNodeIndex(item), item)
    visit(visibleChildren(item))
  })
  visit(safeItems.value)
  return nodes
})

const menuItems = computed<MenuItem[]>(() => safeItems.value.map(toMenuItem))

function toMenuItem(item: RuntimeNavigationItem): MenuItem {
  const children = visibleChildren(item)
  const base = { index: menuNodeIndex(item), label: item.title, ...(item.icon ? { icon: item.icon } : {}) }
  if (shouldRenderAsSubMenu(item)) return { ...base, children: children.map(toMenuItem) }
  if (isDirectoryNode(item) && children.length > 0) return { ...base, group: true, children: children.map(toMenuItem) }
  return {
    ...base,
    ...(item.disabled ? { disabled: true } : {}),
    ...(isActive(item) ? { active: true } : {}),
    ...(item.dividerAfter ? { dividerAfter: true } : {}),
  }
}

/** 子菜单与分组用节点 id，叶子用路径，与 activeIndex 一致。 */
function menuNodeIndex(item: RuntimeNavigationItem): string {
  return isDirectoryNode(item) && visibleChildren(item).length > 0 ? item.id : menuIndex(item)
}

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

function visibleChildren(item: RuntimeNavigationItem): RuntimeNavigationItem[] {
  return (item.children ?? []).filter((child) => !child.hidden)
}

function isActive(item: RuntimeNavigationItem): boolean {
  return nav?.isNodeActive(item) ?? menuIndex(item) === route.path
}

function onSelect(index: string) {
  const node = nodesByIndex.value.get(index)
  if (node) nav?.navigateTo(node)
}
</script>

<style scoped>
.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
}

.app-sidebar__logo {
  margin-bottom: 8px;
  padding: 14px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--spark-sidebar-text) 16%, transparent);
  text-align: center;
}

.app-sidebar__logo-text {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1.2px;
}

.app-sidebar__logo-icon {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-color-primary);
}

/* 透明背景让侧栏 CSS 变量生效 */
.app-sidebar__menu.el-menu {
  border-right: none;
  padding: 0;
  background: transparent;
}

.app-sidebar__menu :deep(.el-menu-item),
.app-sidebar__menu :deep(.el-sub-menu__title) {
  position: relative;
  height: 40px;
  line-height: 40px;
  margin: 4px 0;
  border-radius: 10px;
  padding-right: 12px !important;
}

.app-sidebar__menu.el-menu--collapse > :deep(.el-menu-item),
.app-sidebar__menu.el-menu--collapse > :deep(.el-sub-menu > .el-sub-menu__title) {
  padding-left: 12px !important;
}

.app-sidebar__menu :deep(.el-menu-item:hover),
.app-sidebar__menu :deep(.el-sub-menu__title:hover) {
  background: color-mix(in srgb, var(--spark-sidebar-text) 10%, transparent);
}

.app-sidebar__menu :deep(.el-menu-item.is-active),
.app-sidebar__menu :deep(.el-sub-menu .el-menu-item.is-active),
.app-sidebar__menu :deep(.el-menu-item.r-menu__item--active) {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  font-weight: 600;
}

.app-sidebar__menu :deep(.el-menu-item.is-active::before),
.app-sidebar__menu :deep(.el-sub-menu .el-menu-item.is-active::before),
.app-sidebar__menu :deep(.el-menu-item.r-menu__item--active::before) {
  position: absolute;
  left: 0;
  top: 11px;
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: var(--el-color-primary);
  content: '';
}

.app-sidebar__menu :deep(.el-menu-item-group__title) {
  color: color-mix(in srgb, var(--spark-sidebar-text) 75%, transparent);
  font-size: 12px;
  font-weight: 600;
}

.app-sidebar__menu :deep(.r-menu__separator) {
  background: color-mix(in srgb, var(--spark-sidebar-text) 18%, transparent);
}
</style>
