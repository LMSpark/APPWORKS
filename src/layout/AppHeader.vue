<!--
@module app:layout/AppHeader
职责：提供主应用 AppHeader 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/AppHeader。
-->
<template>
  <div class="app-header">
    <!-- 左侧：折叠按钮 + 标题 -->
    <div class="app-header__left">
      <SparkComponent.RendererButton v-if="collapsible" class="header-btn" text :icon="collapsed ? 'Expand' : 'Fold'" title="切换侧栏" @click="$emit('toggle-collapse')" />
      <span class="app-header__title">{{ title }}</span>
    </div>

    <!-- 中间：导航槽位 -->
    <div class="app-header__center">
      <slot name="nav" />
    </div>

    <!-- 右侧：操作区（工具栏配置驱动） -->
    <div class="app-header__right">
      <!-- 自定义操作槽位 -->
      <slot name="actions" />

      <SparkComponent.RendererTooltip
        v-for="item in genericToolbarItems"
        :key="item.id"
        :content="item.title"
        placement="bottom"
        :show-after="300"
      >
        <SparkComponent.RendererButton class="header-btn" text :disabled="item.disabled === true" @click="$emit('user-command', toolbarCommand(item))">
          <SparkComponent.DisplayIcon v-if="item.icon" :icon="item.icon" />
        </SparkComponent.RendererButton>
      </SparkComponent.RendererTooltip>

      <!-- 搜索 -->
      <SparkComponent.RendererTooltip v-if="hasAction('search')" content="搜索" placement="bottom" :show-after="300">
        <SparkComponent.RendererButton class="header-btn" text icon="Search" @click="$emit('user-command', 'search')" />
      </SparkComponent.RendererTooltip>

      <!-- 全屏 -->
      <SparkComponent.RendererTooltip v-if="hasAction('fullscreen')" :content="isFullscreen ? '退出全屏' : '全屏'" placement="bottom" :show-after="300">
        <SparkComponent.RendererButton class="header-btn" text icon="FullScreen" @click="$emit('user-command', 'fullscreen')" />
      </SparkComponent.RendererTooltip>

      <!-- 通知 -->
      <SparkComponent.RendererPopover
        v-if="hasAction('notifications')"
        placement="bottom-end"
        :width="360"
        trigger="click"
        :show-arrow="false"
        popper-class="notification-popover"
      >
        <template #reference>
          <SparkComponent.RendererButton class="header-btn" text title="通知">
            <SparkComponent.DisplayBadge :badge-value="unreadCount" :hidden-badge="!unreadCount" :max="99">
              <SparkComponent.DisplayIcon icon="Bell" :icon-size="18" />
            </SparkComponent.DisplayBadge>
          </SparkComponent.RendererButton>
        </template>
        <div class="notification-panel">
          <div class="notification-panel__header">
            <span class="notification-panel__title">通知</span>
            <div class="notification-panel__actions">
              <SparkComponent.RendererButton v-if="desktopPermission === 'default'" link button-type="primary" label="开启桌面提醒" @click="enableDesktopNotifications" />
              <span v-else-if="desktopPermission === 'denied'" class="notification-panel__hint" title="请在浏览器网站设置中允许通知">桌面提醒已被浏览器禁止</span>
              <SparkComponent.RendererButton v-if="unreadCount > 0" link button-type="primary" label="全部已读" @click="markAllRead" />
              <SparkComponent.RendererButton v-if="notifications.length > 0" link button-type="primary" label="清空" @click="clearAll" />
            </div>
          </div>
          <div v-if="syncError" class="notification-panel__error">
            <span>{{ syncError }}</span>
            <SparkComponent.RendererButton v-if="offlineStatus === 'failed'" link button-type="primary" label="重试" @click="retryOfflineMessages" />
          </div>
          <div class="notification-panel__body">
            <div v-if="notifications.length === 0 && offlineStatus === 'loading'" class="notification-panel__empty">
              <p>正在加载离线消息…</p>
            </div>
            <SparkComponent.DisplayEmpty v-else-if="notifications.length === 0" description="暂无通知" :image-size="60" />
            <div
              v-for="item in notifications"
              :key="item.id"
              class="notification-item"
              :class="{ 'notification-item--unread': !item.read }"
              @click="markRead(item.id)"
            >
              <div class="notification-item__dot" v-if="!item.read" />
              <div class="notification-item__content">
                <div class="notification-item__title">{{ item.title }}</div>
                <div class="notification-item__message">{{ item.message }}</div>
                <div class="notification-item__time">{{ formatTime(item.time) }}</div>
              </div>
              <SparkComponent.RendererButton class="notification-item__close" link icon="Close" title="移除" @click.stop="removeItem(item.id)" />
            </div>
          </div>
        </div>
      </SparkComponent.RendererPopover>

      <!-- 主题切换 -->
      <SparkComponent.RendererTooltip v-if="hasAction('theme-toggle')" :content="isDark ? '浅色模式' : '深色模式'" placement="bottom" :show-after="300">
        <SparkComponent.RendererButton class="header-btn" text :icon="isDark ? 'Sunny' : 'Moon'" @click="$emit('user-command', 'theme-toggle')" />
      </SparkComponent.RendererTooltip>

      <!-- 分隔线 -->
      <SparkComponent.RendererDivider direction="vertical" class="header-divider" />

      <!-- 用户下拉 -->
      <SparkComponent.RendererDropdown trigger="click" :items="userMenu" @command="handleUserCommand">
        <div class="header-user">
          <SparkComponent.DisplayAvatar v-if="avatar" :avatar-size="28" :src="avatar" />
          <SparkComponent.DisplayAvatar v-else :avatar-size="28" :text="avatarText" />
          <span class="header-user__name">{{ username }}</span>
          <SparkComponent.DisplayIcon icon="ArrowDown" :icon-size="12" />
        </div>
      </SparkComponent.RendererDropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import { useNotifications } from '@/composables/useNotifications'
import type { RuntimeNavigationItem } from '@spark-appworks/spark-app'

const props = withDefaults(defineProps<{
  title?: string
  isDark?: boolean
  collapsed?: boolean
  collapsible?: boolean
  username?: string
  avatar?: string
  /** 工具栏导航项（由导航配置驱动，path 匹配内置按钮） */
  toolbarItems?: RuntimeNavigationItem[]
  /** 用户菜单导航项（由导航配置驱动，path 匹配内置命令） */
  userMenuItems?: RuntimeNavigationItem[]
}>(), {
  title: 'SPARK 应用工场',
  isDark: false,
  collapsed: false,
  collapsible: true,
  username: '管理员',
  avatar: '',
  toolbarItems: () => [],
  userMenuItems: () => [],
})

const emit = defineEmits<{
  'toggle-collapse': []
  'user-command': [command: string]
}>()

const safeToolbarItems = computed<RuntimeNavigationItem[]>(() => Array.isArray(props.toolbarItems) ? props.toolbarItems : [])
const safeUserMenuItems = computed<RuntimeNavigationItem[]>(() => Array.isArray(props.userMenuItems) ? props.userMenuItems : [])
const builtInToolbarActions = new Set(['search', 'fullscreen', 'notifications', 'theme-toggle'])
const genericToolbarItems = computed<RuntimeNavigationItem[]>(() =>
  safeToolbarItems.value.filter(item => !builtInToolbarActions.has(toolbarCommand(item))),
)

/** 检查导航配置中是否包含指定 action 的工具栏项 */
function hasAction(action: string): boolean {
  return safeToolbarItems.value.some(item => toolbarCommand(item) === action)
}

function toolbarCommand(item: RuntimeNavigationItem): string {
  return String(item.path ?? item.redirect ?? item.id).replace(/^\/+/, '')
}
/* 通知（SSE 实时驱动） */
const {
  notifications,
  unreadCount,
  markRead,
  markAllRead,
  clearAll,
  removeItem,
  desktopPermission,
  enableDesktopNotifications,
  offlineStatus,
  syncError,
  retryOfflineMessages,
} = useNotifications()

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/* 用户头像文字（取用户名首字） */
const avatarText = computed(() => {
  const username = typeof props.username === 'string' ? props.username : ''
  return username.charAt(0)
})

/* 全屏状态 */
const isFullscreen = ref(false)

function onFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

/* 用户菜单：导航配置驱动，未配置时使用内置项；退出登录始终在末尾 */
const DEFAULT_USER_MENU: readonly SparkComponent.DropdownItem[] = [
  { label: '个人中心', command: 'profile', icon: 'User' },
  { label: '系统设置', command: 'settings', icon: 'Setting' },
  { label: '应用工场主页', command: 'home', icon: 'HomeFilled', divided: true },
  { label: '平台管理', command: 'platform', icon: 'Monitor' },
]
const userMenu = computed<SparkComponent.DropdownItem[]>(() => {
  const items = safeUserMenuItems.value
  const configured = items.map((item, idx) => ({
    label: item.title,
    command: String(item.path ?? item.redirect ?? item.id),
    ...(item.icon ? { icon: item.icon } : {}),
    divided: idx > 0 && items[idx - 1]?.dividerAfter === true,
  }))
  return [...(configured.length ? configured : DEFAULT_USER_MENU), { label: '退出登录', command: 'logout', icon: 'SwitchButton', divided: true }]
})

function handleUserCommand(command: string) {
  emit('user-command', command)
}
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
  padding: 0 12px;
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.app-header__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.app-header__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  overflow: visible;
}

.app-header__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 通用操作按钮 */
.header-btn.el-button {
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border-radius: 6px;
  color: inherit;
  font-size: 18px;
  transition: background 0.2s;
}

.header-btn.el-button:hover,
.header-btn.el-button:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
}

.header-btn.el-button:active {
  background: rgba(255, 255, 255, 0.18);
}

/* 分隔线 */
.header-divider {
  --el-border-color: rgba(255, 255, 255, 0.2);
  margin: 0 6px;
  height: 20px;
}

.app-header__user-divider {
  height: 1px;
  padding: 0 !important;
  margin: 4px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  cursor: default;
  min-height: 0;
  line-height: 0;
}

/* 用户区域 */
.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: inherit;
  transition: background 0.2s;
}

.header-user:hover {
  background: rgba(255, 255, 255, 0.12);
}

.header-user__name {
  font-size: 13px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* el-badge 样式微调 */
:deep(.el-badge__content) {
  border: none;
}

/* ── 通知面板 ── */
.notification-panel {
  margin: -12px;
}

.notification-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.notification-panel__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.notification-panel__actions {
  display: flex;
  gap: 8px;
}

.notification-panel__actions :deep(.el-button) {
  margin: 0;
  font-size: 12px;
}

.notification-panel__hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  padding: 2px 4px;
}

.notification-panel__body {
  max-height: 360px;
  overflow-y: auto;
}

.notification-panel__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 16px;
  color: var(--el-color-danger);
  font-size: 12px;
}

.notification-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.notification-item:hover {
  background: var(--el-fill-color-light);
}

.notification-item--unread {
  background: var(--el-color-primary-light-9);
}

.notification-item__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  flex-shrink: 0;
  margin-top: 6px;
}

.notification-item__content {
  flex: 1;
  min-width: 0;
}

.notification-item__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 2px;
}

.notification-item__message {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-item__time {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

.notification-item__close.el-button {
  margin: 0;
  padding: 0 4px;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  flex-shrink: 0;
  visibility: hidden;
}

.notification-item:hover .notification-item__close {
  visibility: visible;
}

/* 小屏隐藏用户名 */
@media (max-width: 768px) {
  .header-user__name {
    display: none;
  }
}
</style>
