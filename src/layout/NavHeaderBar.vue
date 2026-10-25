<!--
@module app:layout/NavHeaderBar
职责：用 Element Plus 横向菜单呈现应用壳已授权的 RuntimeNavigationItem，并通过唯一 useNav 上下文处理选择。
边界：不创建导航数据、权限判定或路由；菜单溢出只改变现有 items 的呈现位置，活动身份仍由 useNav 提供。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/NavHeaderBar。
-->
<template>
  <nav class="nav-header-bar" aria-label="应用导航">
    <el-menu
      ref="menuRef"
      class="nav-header-bar__menu"
      mode="horizontal"
      :ellipsis="true"
      :collapse-transition="false"
      :router="false"
      :default-active="activeMenuIndex"
      :menu-trigger="'hover'"
      :show-timeout="180"
      :hide-timeout="120"
      :popper-class="'nav-header-bar__popper'"
      text-color="inherit"
      active-text-color="inherit"
      @select="handleSelect"
    >
      <template v-for="item in visibleItems" :key="item.id">
        <el-sub-menu
          v-if="hasDropdown(item)"
          :index="item.id"
          :disabled="item.disabled"
          :class="menuItemClass(item)"
        >
          <template #title>
            <span class="nav-header-bar__title" @click.stop="navigateTo(item)">
              <span v-if="item.icon" class="nav-header-bar__icon"><NavIcon :name="item.icon" /></span>
              <span class="nav-header-bar__label">{{ item.title }}</span>
              <span v-if="badge(item)" class="nav-header-bar__badge">{{ badge(item) }}</span>
            </span>
          </template>
          <template v-for="child in visibleChildren(item)" :key="child.id">
            <el-menu-item
              :index="child.id"
              :disabled="child.disabled"
              :aria-current="isCurrentPage(child) ? 'page' : undefined"
              :class="menuItemClass(child, true)"
            >
              <span v-if="child.icon" class="nav-header-bar__dropdown-icon"><NavIcon :name="child.icon" /></span>
              <span class="nav-header-bar__label">{{ child.title }}</span>
              <span v-if="badge(child)" class="nav-header-bar__badge">{{ badge(child) }}</span>
            </el-menu-item>
          </template>
        </el-sub-menu>
        <el-menu-item
          v-else
          :index="item.id"
          :disabled="item.disabled"
          :aria-current="isCurrentPage(item) ? 'page' : undefined"
          :class="menuItemClass(item)"
        >
          <span v-if="item.icon" class="nav-header-bar__icon"><NavIcon :name="item.icon" /></span>
          <span class="nav-header-bar__label">{{ item.title }}</span>
          <span v-if="badge(item)" class="nav-header-bar__badge">{{ badge(item) }}</span>
        </el-menu-item>
      </template>
    </el-menu>
  </nav>
</template>

<script setup lang="ts">
import {computed, nextTick, ref, watch} from 'vue'
import {useNav, type RuntimeNavigationItem} from '@spark-appworks/spark-app'
import NavIcon from '@/components/NavIcon.vue'

const props = withDefaults(defineProps<{
  items?: RuntimeNavigationItem[]
}>(), {
  items: () => [],
})

const nav = useNav()
const menuRef = ref<{handleResize?: () => void} | null>(null)

const visibleItems = computed(() => props.items.filter(item => !item.hidden))
const activeMenuIndex = computed(() => nav?.activePath.value.at(-1)?.id ?? '')

function badge(node: RuntimeNavigationItem): string | number | undefined {
  return nav?.getBadge(node.id)
}

function isActive(node: RuntimeNavigationItem): boolean {
  return nav?.isNodeActive(node) ?? false
}

function isCurrentPage(node: RuntimeNavigationItem): boolean {
  return isActive(node) && nav?.activePath.value.at(-1)?.id === node.id
}

function menuItemClass(node: RuntimeNavigationItem, dropdownItem = false): Record<string, boolean> {
  return {
    'nav-header-bar__item': true,
    'nav-header-bar__item--active': isActive(node),
    'nav-header-bar__item--disabled': node.disabled === true,
    'nav-header-bar__item--has-children': !dropdownItem && hasDropdown(node),
    'nav-header-bar__item--divider-after': node.dividerAfter === true,
    'nav-header-bar__dropdown-item': dropdownItem,
    'nav-header-bar__dropdown-item--active': dropdownItem && isActive(node),
  }
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

function navigateTo(node: RuntimeNavigationItem): void {
  if (node.disabled) return
  nav?.navigateTo(node)
}

function handleSelect(index: string): void {
  const node = findNode(index)
  if (!node || node.disabled) {
    return
  }
  nav?.navigateTo(node)
}

const measurementSignature = computed(() => JSON.stringify(visibleItems.value.map(item => ({
  id: item.id,
  title: item.title,
  icon: item.icon,
  badge: badge(item),
  disabled: item.disabled,
  dividerAfter: item.dividerAfter,
  children: hasDropdown(item) ? visibleChildren(item).map(child => ({
    id: child.id, title: child.title, icon: child.icon, badge: badge(child), disabled: child.disabled,
    dividerAfter: child.dividerAfter,
  })) : [],
}))))

watch(measurementSignature, () => {
  void nextTick(() => menuRef.value?.handleResize?.())
}, {flush: 'post'})
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

.nav-header-bar__menu {
  width: 100%;
  min-width: 0;
  height: 100%;
}

.nav-header-bar__icon,
.nav-header-bar__dropdown-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  margin-right: 5px;
  font-size: 15px;
}

.nav-header-bar__dropdown-icon {
  font-size: 14px;
}

.nav-header-bar__title,
.nav-header-bar__label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
}

.nav-header-bar__title {
  height: 100%;
  color: inherit;
  cursor: pointer;
}

.nav-header-bar__badge {
  flex: 0 0 auto;
  margin-left: 5px;
  padding: 2px 5px;
  border-radius: 8px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  line-height: 1;
}

:deep(.el-menu--horizontal) {
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: visible;
  border-bottom: 0;
  background: transparent;
}

:deep(.el-menu--horizontal > .el-menu-item),
:deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title) {
  position: relative;
  height: 100%;
  padding: 0 14px;
  color: inherit;
  font-size: 14px;
  line-height: normal;
  opacity: 0.75;
  transition: opacity 0.2s, background 0.2s;
}

:deep(.el-menu--horizontal > .el-menu-item:hover),
:deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  opacity: 1;
}

:deep(.el-menu--horizontal .nav-header-bar__item--active) {
  color: inherit;
  font-weight: 600;
  opacity: 1;
  box-shadow: inset 0 -2px 0 currentColor;
}

:deep(.el-menu--horizontal .nav-header-bar__item--disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}

:deep(.el-menu--horizontal .nav-header-bar__item--divider-after::after) {
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

:deep(.el-menu--horizontal > .el-menu-item.is-active:not(.nav-header-bar__item--active)) {
  border-bottom-color: transparent;
  color: inherit;
  font-weight: 400;
  opacity: 0.75;
  box-shadow: none;
}

:deep(.el-menu--horizontal > .el-sub-menu.nav-header-bar__item--active > .el-sub-menu__title) {
  border-bottom-color: transparent;
  color: inherit;
  font-weight: 600;
  opacity: 1;
  box-shadow: inset 0 -2px 0 currentColor;
}

:deep(.el-menu--horizontal > .el-sub-menu.is-active:not(.nav-header-bar__item--active) > .el-sub-menu__title) {
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

.nav-header-bar__popper .el-menu--popup .nav-header-bar__item--active {
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}

.nav-header-bar__popper .el-menu--popup .el-menu-item.is-active:not(.nav-header-bar__item--active) {
  background-color: transparent;
  color: var(--spark-text-regular, #606266);
  font-weight: 400;
}

.nav-header-bar__popper .el-menu--popup .el-sub-menu.is-active:not(.nav-header-bar__item--active) > .el-sub-menu__title {
  background-color: transparent;
  color: var(--spark-text-regular, #606266);
  font-weight: 400;
}

.nav-header-bar__popper .el-menu--popup .nav-header-bar__item--divider-after {
  position: relative;
}

.nav-header-bar__popper .el-menu--popup .nav-header-bar__item--divider-after::after {
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

.nav-header-bar__popper .nav-header-bar__dropdown-item {
  color: var(--spark-text-regular, #606266);
  font-size: 13px;
}

.nav-header-bar__popper .nav-header-bar__dropdown-item:hover {
  color: var(--spark-text-primary, #303133);
}

.nav-header-bar__popper .nav-header-bar__dropdown-item--active {
  color: var(--el-color-primary, #409eff);
  font-weight: 500;
}

.nav-header-bar__popper .nav-header-bar__dropdown-item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
