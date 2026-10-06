<!--
@module app:layout/AppTabBar
职责：提供主应用 AppTabBar 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppTabBar。
-->
<template>
  <div class="app-tab-bar">
    <div class="app-tab-bar__tabs">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="app-tab-bar__tab"
        :class="{ 'app-tab-bar__tab--active': tab.id === activeTab }"
        @click="perform(() => switchTo(tab.id))"
        @contextmenu.prevent="onContextMenu($event, tab)"
      >
        <span class="app-tab-bar__tab-icon" v-if="tab.icon"><NavIcon :name="tab.icon" /></span>
        <span class="app-tab-bar__tab-title">{{ tab.title }}</span>
        <span
          v-if="tab.closable"
          class="app-tab-bar__tab-close"
          @click.stop="perform(() => closeTab(tab.id))"
        >×</span>
      </div>
    </div>

    <!-- 右侧区域：上下文选择器等 -->
    <div v-if="$slots['trailing']" class="app-tab-bar__trailing">
      <slot name="trailing" />
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxVisible"
        class="app-tab-bar__ctx-menu"
        :style="{ left: ctxPos.x + 'px', top: ctxPos.y + 'px' }"
      >
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('close')">关闭</div>
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('closeOthers')">关闭其他</div>
        <div class="app-tab-bar__ctx-item" @click="doCtxAction('closeAll')">关闭全部</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTabPages } from '@spark-appworks/spark-app'
import { ElMessage } from 'element-plus'
import type { TabPage } from '@spark-appworks/spark-app'
import NavIcon from '@/components/NavIcon.vue'
import { PROJECT_SWITCH_KEY } from '@/services/project/project-shell'
import { parseTenantScope } from '@/services/tenant-scope'

const router = useRouter()
const route = useRoute()
const projectSwitchService = inject(PROJECT_SWITCH_KEY, null)

function parseScopedProjectId(path: string): string | null {
  return parseTenantScope(path)?.projectId ?? null
}

async function navigateTab(fullPath: string): Promise<void> {
  const targetProjectId = parseScopedProjectId(fullPath)
  const currentProjectId = typeof route.params['projectId'] === 'string' ? route.params['projectId'] : null

  if (
    projectSwitchService !== null &&
    targetProjectId !== null &&
    currentProjectId !== null &&
    targetProjectId !== currentProjectId
  ) {
    await projectSwitchService.switchAndReload(targetProjectId)
  }

  if (await router.push(fullPath)) throw new Error('页面导航已取消，原实例保留')
}

const { tabs, activeTab, closeTab, closeOthers, closeAll, switchTo } = useTabPages({
  navigate: navigateTab,
})

function perform(action: () => Promise<void>): void {
  void action().catch(error => ElMessage.error(error instanceof Error ? error.message : String(error)))
}

/* ── 右键菜单 ── */
const ctxVisible = ref(false)
const ctxPos = reactive({ x: 0, y: 0 })
let ctxTarget: TabPage | null = null

function onContextMenu(e: MouseEvent, tab: TabPage) {
  ctxTarget = tab
  ctxPos.x = e.clientX
  ctxPos.y = e.clientY
  ctxVisible.value = true
}

function doCtxAction(action: 'close' | 'closeOthers' | 'closeAll') {
  ctxVisible.value = false
  if (!ctxTarget) return
  switch (action) {
    case 'close':
      perform(() => closeTab(ctxTarget?.id ?? ''))
      break
    case 'closeOthers':
      perform(() => closeOthers(ctxTarget?.id ?? ''))
      break
    case 'closeAll':
      perform(closeAll)
      break
  }
  ctxTarget = null
}

function hideCtxMenu() {
  ctxVisible.value = false
}

onMounted(() => document.addEventListener('click', hideCtxMenu))
onBeforeUnmount(() => document.removeEventListener('click', hideCtxMenu))
</script>

<style scoped>
.app-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.app-tab-bar__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  height: 100%;
  padding: 0 4px;
  flex: 1;
  min-width: 0;
}

.app-tab-bar__trailing {
  flex-shrink: 0;
  flex-grow: 0;
  min-width: fit-content;
  padding: 0 8px;
}

.app-tab-bar__tabs::-webkit-scrollbar {
  display: none;
}

.app-tab-bar__tab {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  color: var(--spark-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-bottom: none;
  transition: color 0.2s, background 0.2s;
  user-select: none;
}

.app-tab-bar__tab:hover {
  color: var(--spark-text-primary);
  background: var(--spark-bg-overlay);
}

.app-tab-bar__tab--active {
  color: var(--spark-text-primary);
  background: var(--spark-bg);
  border-color: var(--spark-border-light);
  font-weight: 500;
}

.app-tab-bar__tab-icon {
  font-size: 13px;
}

.app-tab-bar__tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-tab-bar__tab-close {
  font-size: 14px;
  line-height: 1;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-left: 2px;
  transition: background 0.15s, color 0.15s;
}

.app-tab-bar__tab-close:hover {
  background: var(--spark-border-color);
  color: var(--spark-text-primary);
}

/* ── 右键菜单 ── */
.app-tab-bar__ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--spark-bg-overlay);
  border: 1px solid var(--spark-border-light);
  border-radius: 4px;
  box-shadow: var(--spark-shadow);
  padding: 4px 0;
  min-width: 100px;
}

.app-tab-bar__ctx-item {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--spark-text-regular);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.app-tab-bar__ctx-item:hover {
  background: var(--spark-bg);
  color: var(--spark-text-primary);
}
</style>
