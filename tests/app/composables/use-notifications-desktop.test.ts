import type { LowcodeNotificationMessage } from '@spark-appworks/spark-lowcode-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

const sse = vi.hoisted(() => ({
  notify: null as ((message: LowcodeNotificationMessage) => void) | null,
}))

const realtime = vi.hoisted(() => ({
  fetchOfflineMessages: vi.fn(),
  confirmMessages: vi.fn(),
}))

vi.mock('@/services/sse-events', () => ({
  onNotificationEvent: (callback: (message: LowcodeNotificationMessage) => void) => {
    sse.notify = callback
    return () => { sse.notify = null }
  },
  onPageConfigChange: () => () => undefined,
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({ lowcodeApi: { realtime } }))

type FakeNotification = { title: string; options: NotificationOptions; onclick: (() => void) | null; close: () => void }

function installNotification(permission: NotificationPermission, requested: NotificationPermission = permission) {
  const created: FakeNotification[] = []
  const Fake = vi.fn(function (this: FakeNotification, title: string, options: NotificationOptions) {
    this.title = title
    this.options = options
    this.onclick = null
    this.close = vi.fn()
    created.push(this)
  })
  Object.assign(Fake, { permission, requestPermission: vi.fn(async () => requested) })
  vi.stubGlobal('Notification', Fake)
  return created
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

async function load() {
  const { useNotifications } = await import('@/composables/useNotifications')
  const scope = effectScope()
  const api = scope.run(() => useNotifications())
  if (api === undefined) throw new Error('useNotifications did not run')
  await nextTick()
  await Promise.resolve()
  return { api, scope }
}

const message = (overrides: Partial<LowcodeNotificationMessage> = {}): LowcodeNotificationMessage => ({
  messageType: 'SYSTEM_NOTIFICATION',
  title: '审批',
  content: '有新待办',
  createdAt: 1,
  messageId: 'M1',
  ...overrides,
})

describe('useNotifications', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    realtime.fetchOfflineMessages.mockReset().mockResolvedValue([])
    realtime.confirmMessages.mockReset().mockResolvedValue('ok')
    setHidden(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('shows a system notification only when granted and the page is hidden', async () => {
    const created = installNotification('granted')
    const { api, scope } = await load()

    sse.notify?.(message())
    expect(created).toHaveLength(0)

    setHidden(true)
    sse.notify?.(message({ messageId: 'M2' }))
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ title: '审批', options: { body: '有新待办', tag: 'M2' } })

    const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined)
    created[0]?.onclick?.()
    expect(focus).toHaveBeenCalled()
    expect(api.notifications[0]?.read).toBe(true)
    expect(api.unreadCount.value).toBe(1)
    scope.stop()
  })

  it('asks permission explicitly and stays silent when denied', async () => {
    const created = installNotification('default', 'denied')
    const { api, scope } = await load()
    setHidden(true)

    sse.notify?.(message())
    expect(created).toHaveLength(0)
    await expect(api.enableDesktopNotifications()).resolves.toBe('denied')
    sse.notify?.(message({ messageId: 'M2' }))
    expect(created).toHaveLength(0)
    expect(api.notifications).toHaveLength(2)
    scope.stop()
  })

  it('reports unsupported when the browser lacks the Notification API', async () => {
    Reflect.deleteProperty(window, 'Notification')
    const { api, scope } = await load()
    expect(api.desktopPermission.value).toBe('unsupported')
    await expect(api.enableDesktopNotifications()).resolves.toBe('unsupported')
    scope.stop()
  })

  it('loads offline messages once and dedupes realtime repeats by message id', async () => {
    installNotification('denied')
    realtime.fetchOfflineMessages.mockResolvedValue([
      message({ messageType: 'USER_MESSAGE', messageId: 'M1', messageLogId: 'L1', title: '旧1' }),
      message({ messageType: 'USER_MESSAGE', messageId: 'M2', messageLogId: 'L2', title: '旧2' }),
    ])
    const { api, scope } = await load()

    expect(api.offlineStatus.value).toBe('loaded')
    expect(api.notifications.map(item => item.title)).toEqual(['旧1', '旧2'])
    sse.notify?.(message({ messageId: 'M1' }))
    expect(api.notifications).toHaveLength(2)
    scope.stop()
  })

  it('marks offline load failure distinctly and can retry', async () => {
    installNotification('denied')
    realtime.fetchOfflineMessages.mockRejectedValueOnce(new Error("[500] query异常:org.springframework.jdbc.BadSqlGrammarException: bad SQL grammar [SELECT ...]；根因：Unknown column"))
    const { api, scope } = await load()

    expect(api.offlineStatus.value).toBe('failed')
    expect(api.syncError.value).toBe('离线消息加载失败：[500] query异常')
    realtime.fetchOfflineMessages.mockResolvedValueOnce([message({ messageLogId: 'L9' })])
    await api.retryOfflineMessages()
    expect(api.offlineStatus.value).toBe('loaded')
    expect(api.notifications).toHaveLength(1)
    scope.stop()
  })

  it('confirms only items that carry a message log id', async () => {
    installNotification('denied')
    realtime.fetchOfflineMessages.mockResolvedValue([message({ messageId: 'M1', messageLogId: 'L1' })])
    const { api, scope } = await load()
    sse.notify?.(message({ messageId: 'M2' }))

    await api.markAllRead()
    expect(realtime.confirmMessages).toHaveBeenCalledOnce()
    expect(realtime.confirmMessages).toHaveBeenCalledWith(['L1'])
    expect(api.unreadCount.value).toBe(0)
    scope.stop()
  })

  it('restores unread state when confirmation fails and does not retry', async () => {
    installNotification('denied')
    realtime.fetchOfflineMessages.mockResolvedValue([message({ messageId: 'M1', messageLogId: 'L1' })])
    realtime.confirmMessages.mockRejectedValueOnce(new Error('timeout'))
    const { api, scope } = await load()
    const id = api.notifications[0]?.id ?? -1

    await api.markRead(id)
    expect(api.notifications[0]?.read).toBe(false)
    expect(api.syncError.value).toContain('已读状态同步失败')
    expect(realtime.confirmMessages).toHaveBeenCalledOnce()
    scope.stop()
  })
})
