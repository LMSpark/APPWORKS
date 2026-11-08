import {describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import Settings from '@/views/app/Settings.vue'

const state = vi.hoisted(() => ({
  theme: {mode: 'light', setMode: vi.fn()},
  reload: vi.fn(async () => undefined),
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: () => ({items: [{itemKind: 'page', path: '/config-page'}, {itemKind: 'page', path: '/vue-page'}]}),
  useTheme: () => state.theme,
}))
vi.mock('@/registries/vue-page-registry', () => ({
  getVuePageOptions: () => [{path: '/vue-page'}],
  hasVuePage: (path: string) => path === '/vue-page',
}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {application: {get: () => ({application: {name: 'Alpha'}})}},
}))
vi.mock('@/services/project/project-shell', () => ({reloadAndSyncNavigation: state.reload}))

describe('Settings page', () => {
  it('shows runtime facts, applies theme and reloads navigation without fake settings', async () => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: defineComponent({setup: () => () => h('div')})}]})
    await router.push('/')
    const wrapper = mount(Settings, {global: {plugins: [router, ElementPlus]}})
    await flushPromises()

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Alpha')
    expect(wrapper.text()).toContain('1 个')
    expect(wrapper.text()).not.toMatch(/保存设置|导出配置|日志级别|热重载|新建配置页面|最近操作/)

    await wrapper.find('input[value="dark"]').setValue(true)
    expect(state.theme.setMode).toHaveBeenCalledWith('dark')

    await wrapper.findAll('button').find(button => button.text() === '重载导航')!.trigger('click')
    await flushPromises()
    expect(state.reload).toHaveBeenCalledOnce()
  })
})
