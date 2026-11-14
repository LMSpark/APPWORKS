import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'
import { Spark } from '@spark-appworks/spark-component'
import type { RuntimeNavigationItem } from '@spark-appworks/spark-app'
import AppHeader from '@/layout/AppHeader.vue'

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    notifications: ref([{ id: 'n1', title: '审批提醒', message: '有待办', time: 0, read: false }]),
    unreadCount: ref(1),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    clearAll: vi.fn(),
    removeItem: vi.fn(),
    desktopPermission: ref('granted'),
    enableDesktopNotifications: vi.fn(),
    offlineStatus: ref('idle'),
    syncError: ref(''),
    retryOfflineMessages: vi.fn(),
  }),
}))

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function mountHeader(toolbarItems: RuntimeNavigationItem[]) {
  const wrapper = mount(AppHeader, {
    attachTo: document.body,
    props: { toolbarItems, username: '测试用户' },
    global: { plugins: [ElementPlus, Spark.createPlugin()] },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('AppHeader standard components', () => {
  it('renders slotted toolbar icons and the unread badge inside standard buttons', async () => {
    const wrapper = mountHeader([
      { id: 'help', title: '帮助', icon: 'QuestionFilled', path: '/help' },
      { id: 'notifications', title: '通知', path: '/notifications' },
    ])
    await flushPromises()

    const buttons = wrapper.findAll('.header-btn')
    const help = buttons.find(button => button.find('svg').exists() && !button.find('.el-badge').exists() && button.attributes('title') !== '切换侧栏')
    if (!help) throw new Error('工具栏图标按钮未渲染图标')
    await help.trigger('click')
    expect(wrapper.emitted('user-command')).toEqual([['help']])

    const badge = wrapper.find('.header-btn .el-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('1')
    expect(badge.find('svg').exists()).toBe(true)

    await wrapper.find('.header-btn[title="切换侧栏"]').trigger('click')
    expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)
  })

  it('emits user menu commands from the standard dropdown and always appends logout', async () => {
    const wrapper = mountHeader([])
    await flushPromises()

    expect(wrapper.find('.header-user__name').text()).toBe('测试用户')
    await wrapper.find('.header-user').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()
    const labels = [...document.body.querySelectorAll('.el-dropdown-menu__item')].map(node => node.textContent?.trim())
    expect(labels).toEqual(['个人中心', '系统设置', '应用工场主页', '平台管理', '退出登录'])
    const logout = [...document.body.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node => node.textContent?.includes('退出登录'))
    logout?.click()
    await flushPromises()
    expect(wrapper.emitted('user-command')).toEqual([['logout']])
  })
})
