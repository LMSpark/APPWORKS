<!--
@module app:layout/AppBreadcrumb
职责：提供主应用 AppBreadcrumb 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppBreadcrumb。
-->
<template>
  <nav class="app-breadcrumb">
    <div class="app-breadcrumb__crumbs">
      <span class="app-breadcrumb__home" @click="goHome"><NavIcon name="HomeFilled" /></span>
      <template v-for="(item, index) in crumbs" :key="item.id ?? item.path">
        <span class="app-breadcrumb__separator">/</span>
        <span
          class="app-breadcrumb__item"
          :class="{ 'app-breadcrumb__item--active': index === crumbs.length - 1 }"
          @click="index < crumbs.length - 1 && onCrumbClick(item)"
        >
          <span v-if="item.icon" class="app-breadcrumb__item-icon"><NavIcon :name="item.icon" /></span>
          {{ item.title }}
        </span>
      </template>
    </div>
    <div v-if="$slots['trailing']" class="app-breadcrumb__trailing">
      <slot name="trailing" />
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getNavHomePath, useNav, type RuntimeNavigationItem } from '@spark-appworks/spark-app'
import NavIcon from '@/components/NavIcon.vue'

type BreadcrumbItem = {
  id?: string
  path: string
  title: string
  icon?: string | undefined}

const route = useRoute()
const router = useRouter()
const nav = useNav()
const safeActivePath = computed<RuntimeNavigationItem[]>(() => Array.isArray(nav?.activePath.value) ? nav.activePath.value : [])

function goHome() {
  nav?.navigateToPath(getNavHomePath())
}

const crumbs = computed<BreadcrumbItem[]>(() => {
  // 优先使用导航模型的 activePath
  if (safeActivePath.value.length > 0) {
    return safeActivePath.value.map((node: RuntimeNavigationItem) => ({
      id: node.id,
      path: node.path ?? '',
      title: node.title,
      icon: node.icon,
    }))
  }

  // 兜底：vue-router matched
  const items: BreadcrumbItem[] = []
  for (const record of route.matched) {
    const title = record.meta?.['title']
    if (typeof title === 'string' && title.length > 0) {
      items.push({ path: record.path, title })
    }
  }
  return items
})

function onCrumbClick(item: BreadcrumbItem) {
  // 优先使用导航模型的 navigateTo（处理重定向、首个叶子等）
  if (nav && item.id) {
    const node = safeActivePath.value.find((node: RuntimeNavigationItem) => node.id === item.id)
    if (node) {
      nav.navigateTo(node)
      return
    }
  }
  // item.path 来自 nav 或 route.matched，已包含完整路径
  if (item.path) {
    void router.push(item.path)
  }
}
</script>

<style scoped>
.app-breadcrumb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 100%;
  user-select: none;
}

.app-breadcrumb__crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.app-breadcrumb__trailing {
  flex-shrink: 0;
}

.app-breadcrumb__home {
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.app-breadcrumb__home:hover {
  opacity: 1;
}

.app-breadcrumb__separator {
  color: var(--spark-text-placeholder);
  font-size: 12px;
}

.app-breadcrumb__item {
  cursor: pointer;
  color: var(--spark-text-secondary);
  transition: color 0.2s;
  white-space: nowrap;
}

.app-breadcrumb__item:hover {
  color: var(--spark-text-primary);
}

.app-breadcrumb__item--active {
  color: var(--spark-text-primary);
  cursor: default;
  font-weight: 500;
}

.app-breadcrumb__item-icon {
  margin-right: 2px;
}
</style>
