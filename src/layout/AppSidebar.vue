<!--
@module app:layout/AppSidebar
职责：提供主应用 AppSidebar 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppSidebar。
-->
<template>
  <div class="app-sidebar">
    <div class="app-sidebar__logo">
      <span v-if="!collapsed" class="app-sidebar__logo-text">{{ title }}</span>
      <span v-else class="app-sidebar__logo-icon">S</span>
    </div>

    <!-- 导航模型驱动 -->
    <el-menu
      v-if="safeItems.length"
      :default-active="activeIndex"
      :background-color="'transparent'"
      text-color="var(--spark-sidebar-text)"
      active-text-color="var(--el-color-primary)"
      :collapse="collapsed"
    >
      <AppSidebarNode
        v-for="item in safeItems"
        :key="item.id"
        :item="item"
        :collapsed="collapsed"
        :show-text="!collapsed"
      />
    </el-menu>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import AppSidebarNode from './AppSidebarNode.vue'

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

function menuIndex(item: RuntimeNavigationItem): string {
  return item.path ?? item.id
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

.app-sidebar__menu-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.app-sidebar__menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-sidebar__menu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 透明背景让侧栏 CSS 变量生效 */
.app-sidebar :deep(.el-menu) {
  border-right: none;
  padding: 0;
  background: transparent;
}

.app-sidebar :deep(.el-menu-item),
.app-sidebar :deep(.el-sub-menu__title) {
  position: relative;
  height: 40px;
  line-height: 40px;
  margin: 4px 0;
  border-radius: 10px;
  padding-right: 12px !important;
}

.app-sidebar :deep(.el-menu--collapse > .el-menu-item),
.app-sidebar :deep(.el-menu--collapse > .el-sub-menu > .el-sub-menu__title) {
  padding-left: 12px !important;
}

.app-sidebar :deep(.el-menu-item:hover),
.app-sidebar :deep(.el-sub-menu__title:hover) {
  background: color-mix(in srgb, var(--spark-sidebar-text) 10%, transparent);
}

.app-sidebar :deep(.el-menu-item.is-active),
.app-sidebar :deep(.el-sub-menu .el-menu-item.is-active),
.app-sidebar :deep(.el-menu-item.app-sidebar__menu-item--active) {
  color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  font-weight: 600;
}

.app-sidebar :deep(.el-menu-item.is-active::before),
.app-sidebar :deep(.el-sub-menu .el-menu-item.is-active::before),
.app-sidebar :deep(.el-menu-item.app-sidebar__menu-item--active::before) {
  position: absolute;
  left: 0;
  top: 11px;
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: var(--el-color-primary);
  content: '';
}

.app-sidebar :deep(.el-menu--collapse .app-sidebar__menu-label) {
  justify-content: center;
}

.app-sidebar :deep(.el-menu-item-group__title) {
  color: color-mix(in srgb, var(--spark-sidebar-text) 75%, transparent);
  font-size: 12px;
  font-weight: 600;
}

.app-sidebar__node-divider {
  display: block;
  height: 1px;
  margin: 8px 12px;
  padding: 0;
  list-style: none;
  border: 0;
  background: color-mix(in srgb, var(--spark-sidebar-text) 18%, transparent);
  pointer-events: none;
}
</style>
