/**
 * @module app:composables/useNotifications
 * 职责：提供主应用 useNotifications 能力，围绕 NotificationItem 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 composables/useNotifications。
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import type { LowcodeNotificationMessage } from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { onNotificationEvent, onPageConfigChange } from '@/services/sse-events'
import type { FileChangeEvent } from '@/services/sse-events'

/** Notification Item 的语义模型。 */
export type NotificationItem = {
    /** 唯一标识。 */
id: number
    /** 显示标题。 */
title: string
    /** 用户可读消息。 */
message: string
    /** time 字段。 */
time: number
    /** read 字段。 */
read: boolean
    /** 后端消息 rowId；离线与实时重复到达时据此去重。 */
remoteId?: string
    /** 后端发送日志 ID；只有离线拉取的条目才有，已读确认只接受它。 */
messageLogId?: string
    /** category 字段；后端消息为 messageType。 */
category?: string
    /** 来源对象。 */
source?: string
}

/** 浏览器系统通知授权状态；unsupported 表示当前环境没有 Notification API。 */
export type DesktopNotificationPermission = NotificationPermission | 'unsupported'

/** 离线消息加载状态；failed 不等于没有消息。 */
export type OfflineNotificationStatus = 'idle' | 'loading' | 'loaded' | 'failed'

const MAX_NOTIFICATIONS = 50

// Shared notification state -------------------------------------------------

const notifications = reactive<NotificationItem[]>([])
const desktopPermission = ref<DesktopNotificationPermission>(readDesktopPermission())
const offlineStatus = ref<OfflineNotificationStatus>('idle')
const syncError = ref<string | null>(null)

let nextId = 1
let refCount = 0
let unsubscribers: Array<() => void> = []
let connectionRevision = 0

// Event adapters ------------------------------------------------------------

function createServerNotificationItem(message: LowcodeNotificationMessage, source: 'sse' | 'offline'): NotificationItem {
  const item: NotificationItem = {
    id: nextId++,
    title: message.title,
    message: message.content,
    time: message.createdAt ?? Date.now(),
    read: false,
    category: message.messageType,
    source,
  }
  if (message.messageId !== undefined) item.remoteId = message.messageId
  if (message.messageLogId !== undefined) item.messageLogId = message.messageLogId
  return item
}

function createPageConfigNotificationItem(event: FileChangeEvent): NotificationItem {
  return {
    id: nextId++,
    title: '页面配置变更',
    message: `${event.pageId} / ${event.file}`,
    time: event.timestamp,
    read: false,
    category: 'page-config',
    source: 'sse',
  }
}

function hasRemote(remoteId: string | undefined): boolean {
  return remoteId !== undefined && notifications.some(item => item.remoteId === remoteId)
}

function pushNotification(item: NotificationItem): NotificationItem {
  notifications.unshift(item)
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.splice(MAX_NOTIFICATIONS)
  }
  return notifications[0] ?? item
}

// Desktop notification --------------------------------------------------------

function readDesktopPermission(): DesktopNotificationPermission {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
}

/** 页面在前台时站内面板已可见，只在后台且已授权时弹系统通知；同一 remoteId 由 tag 合并。 */
function showDesktopNotification(item: NotificationItem): void {
  if (desktopPermission.value !== 'granted' || !document.hidden) return
  const desktop = new Notification(item.title, {
    body: item.message,
    ...(item.remoteId === undefined ? {} : { tag: item.remoteId }),
  })
  desktop.onclick = () => {
    window.focus()
    void markItemsRead([item])
    desktop.close()
  }
}

async function enableDesktopNotifications(): Promise<DesktopNotificationPermission> {
  if (desktopPermission.value === 'unsupported') return 'unsupported'
  desktopPermission.value = await Notification.requestPermission()
  return desktopPermission.value
}

// Offline and confirmation ----------------------------------------------------

async function loadOfflineMessages(): Promise<void> {
  const revision = connectionRevision
  offlineStatus.value = 'loading'
  try {
    const messages = await lowcodeApi.realtime.fetchOfflineMessages()
    if (revision !== connectionRevision) return
    const fresh = messages.filter(message => !hasRemote(message.messageId))
    for (const message of [...fresh].reverse()) pushNotification(createServerNotificationItem(message, 'offline'))
    offlineStatus.value = 'loaded'
  } catch (error) {
    if (revision !== connectionRevision) return
    offlineStatus.value = 'failed'
    syncError.value = `离线消息加载失败：${errorMessage(error)}`
  }
}

/** 先本地标记已读；带 messageLogId 的条目回写后端，失败时恢复未读并保留错误，不自动重试。 */
async function markItemsRead(items: readonly NotificationItem[]): Promise<void> {
  const pending = items.filter(item => !item.read)
  for (const item of pending) item.read = true
  const confirmable = pending.filter(item => item.messageLogId !== undefined)
  if (confirmable.length === 0) return
  try {
    await lowcodeApi.realtime.confirmMessages(confirmable.map(item => item.messageLogId ?? ''))
    syncError.value = null
  } catch (error) {
    for (const item of confirmable) item.read = false
    syncError.value = `已读状态同步失败：${errorMessage(error)}`
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// SSE lifecycle -------------------------------------------------------------

function connect(): void {
  if (unsubscribers.length > 0) return
  connectionRevision += 1
  unsubscribers = [
    onNotificationEvent((message) => {
      if (hasRemote(message.messageId)) return
      showDesktopNotification(pushNotification(createServerNotificationItem(message, 'sse')))
    }),
    onPageConfigChange((event) => {
      pushNotification(createPageConfigNotificationItem(event))
    }),
  ]
  void loadOfflineMessages()
}

function disconnect(): void {
  for (const unsubscribe of unsubscribers) {
    unsubscribe()
  }
  unsubscribers = []
  connectionRevision += 1
  offlineStatus.value = 'idle'
}

// Public composable ---------------------------------------------------------

export function useNotifications() {
  refCount += 1
  connect()

  onBeforeUnmount(() => {
    refCount -= 1
    if (refCount <= 0) {
      refCount = 0
      disconnect()
    }
  })

  const unreadCount = computed(() => notifications.filter(item => !item.read).length)

  function markRead(id: number): Promise<void> {
    const item = notifications.find(candidate => candidate.id === id)
    return item === undefined ? Promise.resolve() : markItemsRead([item])
  }

  function markAllRead(): Promise<void> {
    return markItemsRead(notifications)
  }

  /** 只清本地列表；未确认的离线消息下次登录仍会返回。 */
  function clearAll(): void {
    notifications.splice(0)
  }

  function removeItem(id: number): void {
    const index = notifications.findIndex(item => item.id === id)
    if (index >= 0) notifications.splice(index, 1)
  }

  return {
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
    retryOfflineMessages: loadOfflineMessages,
  }
}
