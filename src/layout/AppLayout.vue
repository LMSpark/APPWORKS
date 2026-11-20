<!--
@module app:layout/AppLayout
职责：提供主应用 AppLayout 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppLayout。
-->
<template>
  <!-- 首覆盖左：header 全宽置顶，sidebar 在下方 -->
  <div v-if="headerFirst" class="spark-layout spark-layout--header-first">
    <!-- 顶部：首（全宽） -->
    <header v-if="showHeader" class="spark-layout__header spark-layout__header--full">
      <slot name="header" />
    </header>

    <!-- 下半部分：sidebar + body -->
    <div class="spark-layout__lower">
      <aside
        v-if="showSidebar"
        class="spark-layout__sidebar"
        :class="{ 'spark-layout__sidebar--collapsed': collapsed }"
      >
        <slot name="sidebar" />
      </aside>

      <div class="spark-layout__body">
        <!-- 面包屑 -->
        <div v-if="showBreadcrumb" class="spark-layout__breadcrumb">
          <slot name="breadcrumb" />
        </div>

        <!-- 标签栏（多页模式） -->
        <div v-if="showTabBar" class="spark-layout__tab-bar">
          <slot name="tab-bar" />
        </div>

        <!-- 中间区域（主 + 右侧边栏） -->
        <div class="spark-layout__center">
          <main class="spark-layout__main">
            <slot />
          </main>
          <aside v-if="showRightSidebar" class="spark-layout__sidebar-right">
            <slot name="sidebar-right" />
          </aside>
        </div>

        <!-- 底部：脚 -->
        <footer v-if="showFooter" class="spark-layout__footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </div>

  <!-- 左覆盖首（默认）：sidebar 全高，header 在右侧 -->
  <div v-else class="spark-layout">
    <aside
      v-if="showSidebar"
      class="spark-layout__sidebar"
      :class="{ 'spark-layout__sidebar--collapsed': collapsed }"
    >
      <slot name="sidebar" />
    </aside>

    <div class="spark-layout__body">
      <header v-if="showHeader" class="spark-layout__header">
        <slot name="header" />
      </header>

      <div v-if="showBreadcrumb" class="spark-layout__breadcrumb">
        <slot name="breadcrumb" />
      </div>

      <div v-if="showTabBar" class="spark-layout__tab-bar">
        <slot name="tab-bar" />
      </div>

      <div class="spark-layout__center">
        <main class="spark-layout__main">
          <slot />
        </main>
        <aside v-if="showRightSidebar" class="spark-layout__sidebar-right">
          <slot name="sidebar-right" />
        </aside>
      </div>

      <footer v-if="showFooter" class="spark-layout__footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  /** true = 首覆盖左（header 全宽置顶），false = 左覆盖首（sidebar 全高，默认） */
  headerFirst?: boolean
  showHeader?: boolean
  showBreadcrumb?: boolean
  showTabBar?: boolean
  showFooter?: boolean
  showSidebar?: boolean
  showRightSidebar?: boolean
  collapsed?: boolean
}>(), {
  headerFirst: false,
  showHeader: true,
  showBreadcrumb: true,
  showTabBar: false,
  showFooter: true,
  showSidebar: true,
  showRightSidebar: false,
  collapsed: false,
})
</script>

<style scoped>
.spark-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
}

/* ── 首覆盖左模式：纵向排列 ── */
.spark-layout--header-first {
  flex-direction: column;
}

.spark-layout__lower {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* ── 左侧边栏 ── */
.spark-layout__sidebar {
  width: var(--spark-sidebar-width);
  background: var(--spark-sidebar-bg);
  color: var(--spark-sidebar-text);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.3s ease, background-color 0.3s;
  overflow: hidden;
  z-index: 10;
}

.spark-layout__sidebar--collapsed {
  width: var(--spark-sidebar-collapsed-width);
}

/* ── 右侧主体 ── */
.spark-layout__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* ── 首（Header） ── */
.spark-layout__header {
  height: var(--spark-header-height);
  background: var(--spark-header-bg);
  color: var(--spark-header-text);
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
  z-index: 9;
  box-shadow: var(--spark-shadow-light);
  transition: background-color 0.3s, color 0.3s;
}

/* 首覆盖左模式下 header 全宽 */
.spark-layout__header--full {
  z-index: 11;
}

/* ── 面包屑 ── */
.spark-layout__breadcrumb {
  height: var(--spark-breadcrumb-height);
  background: var(--spark-breadcrumb-bg);
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--spark-border-light);
  font-size: 13px;
  color: var(--spark-text-secondary);
  transition: background-color 0.3s, color 0.3s;
}

/* ── 标签栏 ── */
.spark-layout__tab-bar {
  height: var(--spark-tab-bar-height, 34px);
  background: var(--spark-bg-page);
  border-bottom: 1px solid var(--spark-border-light);
  display: flex;
  align-items: flex-end;
  padding: 0 8px;
  flex-shrink: 0;
  transition: background-color 0.3s;
}

/* ── 中间区域 ── */
.spark-layout__center {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── 主内容 ── */
.spark-layout__main {
  flex: 1;
  padding: 16px;
  background: var(--spark-bg);
  overflow: auto;
  transition: background-color 0.3s;
}

/* ── 右侧边栏 ── */
.spark-layout__sidebar-right {
  width: var(--spark-sidebar-right-width);
  background: var(--spark-bg-page);
  border-left: 1px solid var(--spark-border-light);
  flex-shrink: 0;
  overflow: auto;
  transition: width 0.3s ease, background-color 0.3s;
}

/* ── 脚（Footer） ── */
.spark-layout__footer {
  height: var(--spark-footer-height);
  background: var(--spark-footer-bg);
  color: var(--spark-footer-text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  flex-shrink: 0;
  border-top: 1px solid var(--spark-border-light);
  font-size: 12px;
  transition: background-color 0.3s, color 0.3s;
}
</style>
