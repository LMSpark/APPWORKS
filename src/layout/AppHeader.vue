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
      <button v-if="collapsible" class="header-btn" @click="$emit('toggle-collapse')" title="切换侧栏">
        <el-icon :size="18"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
      </button>
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

      <el-tooltip
        v-for="item in genericToolbarItems"
        :key="item.id"
        :content="item.title"
        placement="bottom"
        :show-after="300"
      >
        <button class="header-btn" :disabled="item.disabled" @click="$emit('user-command', toolbarCommand(item))">
          <NavIcon :name="item.icon" />
        </button>
      </el-tooltip>

      <!-- 搜索 -->
      <el-tooltip v-if="hasAction('search')" content="搜索" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('user-command', 'search')">
          <el-icon :size="18"><Search /></el-icon>
        </button>
      </el-tooltip>

      <!-- 全屏 -->
      <el-tooltip v-if="hasAction('fullscreen')" :content="isFullscreen ? '退出全屏' : '全屏'" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('user-command', 'fullscreen')">
          <el-icon :size="18"><FullScreen /></el-icon>
        </button>
      </el-tooltip>

      <!-- 通知 -->
      <el-popover
        v-if="hasAction('notifications')"
        placement="bottom-end"
        :width="360"
        trigger="click"
        :show-arrow="false"
        popper-class="notification-popover"
      >
        <template #reference>
          <button class="header-btn">
            <el-badge :value="unreadCount" :hidden="!unreadCount" :max="99">
              <el-icon :size="18"><Bell /></el-icon>
            </el-badge>
          </button>
        </template>
        <div class="notification-panel">
          <div class="notification-panel__header">
            <span class="notification-panel__title">通知</span>
            <div class="notification-panel__actions">
              <button v-if="unreadCount > 0" class="notification-panel__action" @click="markAllRead">全部已读</button>
              <button v-if="notifications.length > 0" class="notification-panel__action" @click="clearAll">清空</button>
            </div>
          </div>
          <div class="notification-panel__body">
            <div v-if="notifications.length === 0" class="notification-panel__empty">
              <el-icon :size="40" style="color: var(--el-text-color-placeholder)"><Bell /></el-icon>
              <p>暂无通知</p>
            </div>
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
              <button class="notification-item__close" @click.stop="removeItem(item.id)">&times;</button>
            </div>
          </div>
        </div>
      </el-popover>

      <!-- 主题切换 -->
      <el-tooltip v-if="hasAction('theme-toggle')" :content="isDark ? '浅色模式' : '深色模式'" placement="bottom" :show-after="300">
        <button class="header-btn" @click="$emit('user-command', 'theme-toggle')">
          <el-icon :size="18"><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>
      </el-tooltip>

      <!-- 分隔线 -->
      <el-divider direction="vertical" class="header-divider" />

      <!-- 用户下拉 -->
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="header-user">
          <el-avatar :size="28" :src="avatar || undefined">
            {{ avatarText }}
          </el-avatar>
          <span class="header-user__name">{{ username }}</span>
          <el-icon :size="12"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-if="safeUserMenuItems.length">
              <template v-for="(item, idx) in safeUserMenuItems" :key="item.id">
                <el-dropdown-item
                  :command="item.path ?? item.redirect ?? item.id"
                  :divided="idx > 0 && safeUserMenuItems[idx - 1]?.dividerAfter === true"
                >
                  <span v-if="item.icon" style="margin-right: 4px"><NavIcon :name="item.icon" /></span>{{ item.title }}
                </el-dropdown-item>
              </template>
            </template>
            <template v-else>
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>个人中心
              </el-dropdown-item>
              <el-dropdown-item command="settings">
                <el-icon><Setting /></el-icon>系统设置
              </el-dropdown-item>
              <el-dropdown-item divided command="home">
                <el-icon><HomeFilled /></el-icon>应用工场主页
              </el-dropdown-item>
            </template>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import {
  Fold, Expand, Search, FullScreen, Bell, Sunny, Moon,
  User, Setting, SwitchButton, ArrowDown, HomeFilled,
} from '@element-plus/icons-vue'
import { useNotifications } from '@/composables/useNotifications'
import type { RuntimeNavigationItem } from '@spark-appworks/spark-app'
import NavIcon from '@/components/NavIcon.vue'

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
const { notifications, unreadCount, markRead, markAllRead, clearAll, removeItem } = useNotifications()

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

/* 用户菜单命令 */
function handleUserCommand(command: string | number | object) {
  emit('user-command', String(command))
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
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}

.app-header__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 通用操作按钮 */
.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  transition: background 0.2s;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.header-btn:active {
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

.notification-panel__action {
  background: none;
  border: none;
  color: var(--el-color-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.notification-panel__action:hover {
  background: var(--el-fill-color-light);
}

.notification-panel__body {
  max-height: 360px;
  overflow-y: auto;
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

.notification-item__close {
  background: none;
  border: none;
  color: var(--el-text-color-placeholder);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
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
