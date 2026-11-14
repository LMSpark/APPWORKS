<!--
@module app:layout/NavHeaderBar
职责：用标准 RendererMenu 横向菜单呈现应用壳已授权的 RuntimeNavigationItem，并通过唯一 useNav 上下文处理选择。
边界：不创建导航数据、权限判定或路由；菜单溢出只改变现有 items 的呈现位置，活动身份仍由 useNav 提供。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/NavHeaderBar。
-->
<template>
  <nav class="nav-header-bar" aria-label="应用导航">
    <RendererMenu
      class="nav-header-bar__menu"
      mode="horizontal"
      :items="menuItems"
      :active-index="activeMenuIndex"
      menu-trigger="hover"
      :show-timeout="180"
      :hide-timeout="120"
      popper-class="nav-header-bar__popper"
      text-color="inherit"
      active-text-color="inherit"
      @select="handleSelect"
    />
  </nav>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useNav, type RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {RendererMenu, type MenuItem} from '@spark-appworks/spark-component'

const props = withDefaults(defineProps<{
  items?: RuntimeNavigationItem[]
}>(), {
  items: () => [],
})

const nav = useNav()

const visibleItems = computed(() => props.items.filter(item => !item.hidden))
const activeMenuIndex = computed(() => nav?.activePath.value.at(-1)?.id ?? '')

const menuItems = computed<MenuItem[]>(() => visibleItems.value.map(item => hasDropdown(item)
  ? {...menuItem(item), titleSelectable: true, children: visibleChildren(item).map(menuItem)}
  : menuItem(item)))

function menuItem(node: RuntimeNavigationItem): MenuItem {
  const badge = nav?.getBadge(node.id)
  return {
    index: node.id,
    label: node.title,
    ...(node.icon ? {icon: node.icon} : {}),
    ...(badge !== undefined ? {badge} : {}),
    ...(node.disabled ? {disabled: true} : {}),
    ...(isActive(node) ? {active: true} : {}),
    ...(isCurrentPage(node) ? {current: true} : {}),
    ...(node.dividerAfter ? {dividerAfter: true} : {}),
  }
}

function isActive(node: RuntimeNavigationItem): boolean {
  return nav?.isNodeActive(node) ?? false
}

function isCurrentPage(node: RuntimeNavigationItem): boolean {
  return isActive(node) && nav?.activePath.value.at(-1)?.id === node.id
}

function hasDropdown(item: RuntimeNavigationItem): boolean {
  if (item.itemKind !== 'module' && item.itemKind !== 'system-directory') return false
  const placement = item.childPlacement
  return Boolean(item.children?.length && (placement === 'parent' || placement === 'flat'))
}

function visibleChildren(item: RuntimeNavigationItem): RuntimeNavigationItem[] {
  return (item.children ?? []).filter(child => !child.hidden && !child.disabled)
}

function findNode(id: string): RuntimeNavigationItem | undefined {
  for (const item of visibleItems.value) {
    if (item.id === id) return item
    if (hasDropdown(item)) {
      const child = visibleChildren(item).find(candidate => candidate.id === id)
      if (child) return child
    }
  }
  return undefined
}

function handleSelect(index: string): void {
  const node = findNode(index)
  if (!node || node.disabled) return
  nav?.navigateTo(node)
}
</script>

<style scoped>
.nav-header-bar {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  color: inherit;
}

.nav-header-bar__menu.el-menu--horizontal {
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: visible;
  border-bottom: 0;
  background: transparent;
}

.nav-header-bar__menu > :deep(.el-menu-item),
.nav-header-bar__menu > :deep(.el-sub-menu > .el-sub-menu__title) {
  position: relative;
  height: 100%;
  padding: 0 14px;
  color: inherit;
  font-size: 14px;
  line-height: normal;
  opacity: 0.75;
  transition: opacity 0.2s, background 0.2s;
}

.nav-header-bar__menu :deep(.r-menu__label) {
  gap: 5px;
}

.nav-header-bar__menu > :deep(.el-menu-item:hover),
.nav-header-bar__menu > :deep(.el-sub-menu > .el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  opacity: 1;
}

.nav-header-bar__menu :deep(.r-menu__item--active) {
  color: inherit;
  font-weight: 600;
  opacity: 1;
  box-shadow: inset 0 -2px 0 currentColor;
}

.nav-header-bar__menu :deep(.r-menu__item--disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

.nav-header-bar__menu :deep(.r-menu__item--divider-after::after) {
  position: absolute;
  top: 50%;
  right: 0;
  width: 1px;
  height: 16px;
  background: currentColor;
  content: '';
  opacity: 0.2;
  transform: translateY(-50%);
  pointer-events: none;
}

.nav-header-bar__menu > :deep(.el-menu-item.is-active:not(.r-menu__item--active)) {
  border-bottom-color: transparent;
  color: inherit;
  font-weight: 400;
  opacity: 0.75;
  box-shadow: none;
}

.nav-header-bar__menu > :deep(.el-sub-menu.r-menu__item--active > .el-sub-menu__title) {
  border-bottom-color: transparent;
  color: inherit;
  font-weight: 600;
  opacity: 1;
  box-shadow: inset 0 -2px 0 currentColor;
}

.nav-header-bar__menu > :deep(.el-sub-menu.is-active:not(.r-menu__item--active) > .el-sub-menu__title) {
  border-bottom-color: transparent;
  color: inherit;
  font-weight: 400;
  opacity: 0.75;
  box-shadow: none;
}
</style>

<style>
.nav-header-bar__popper.el-popper {
  z-index: 3000;
}

.nav-header-bar__popper .el-menu--popup {
  min-width: 180px;
}

.nav-header-bar__popper .el-menu--popup .r-menu__item--active {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}

.nav-header-bar__popper .el-menu--popup .el-menu-item.is-active:not(.r-menu__item--active) {
  background-color: transparent;
  color: var(--spark-text-regular, #606266);
  font-weight: 400;
}

.nav-header-bar__popper .el-menu--popup .el-sub-menu.is-active:not(.r-menu__item--active) > .el-sub-menu__title {
  background-color: transparent;
  color: var(--spark-text-regular, #606266);
  font-weight: 400;
}

.nav-header-bar__popper .el-menu--popup .r-menu__item--divider-after {
  position: relative;
}

.nav-header-bar__popper .el-menu--popup .r-menu__item--divider-after::after {
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 1px;
  background: currentColor;
  content: '';
  opacity: 0.2;
  pointer-events: none;
}

.nav-header-bar__popper .r-menu__item--nested {
  color: var(--spark-text-regular, #606266);
  font-size: 13px;
}

.nav-header-bar__popper .r-menu__item--nested:hover {
  color: var(--spark-text-primary, #303133);
}

.nav-header-bar__popper .r-menu__item--nested.r-menu__item--active {
  color: var(--el-color-primary, #409eff);
  font-weight: 500;
}

.nav-header-bar__popper .r-menu__item--nested.r-menu__item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
