import {describe, expect, it, vi} from 'vitest'
import {defineComponent, h, type Component} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus, {ElButton, ElTable, ElTableColumn} from 'element-plus'
import {PAGE_SERVICE, Spark, registerAllRenderers, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'
import Settings from '@/views/app/Settings.vue'

const pageService: PageServiceCapability = {
  copyText: async () => {}, showMessage: vi.fn(), showConfirm: async () => true, showPrompt: async () => null,
  showAlert: async () => {}, showDialog: async () => 'cancel', selectEntities: async () => [], browseFiles: async () => [],
  uploadFiles: async () => { throw new Error('settings fixture must not upload') }, showLoading: () => {}, navigate: () => {},
}

const SettingsHost: Component = defineComponent({setup() {
  useSparkComponent({type: 'settings-test-host'}).sparkProvide(PAGE_SERVICE, pageService)
  return () => h(Settings)
}})

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

/** 本地 DataView 装配为异步，多轮 flush 后表单与表格才挂载。 */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await flushPromises()
}

describe('Settings page', () => {
  it('shows runtime facts, applies theme and reloads navigation without fake settings', async () => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: defineComponent({setup: () => () => h('div')})}]})
    await router.push('/')
    const wrapper = mount(SettingsHost, {global: {plugins: [router, ElementPlus]}})
    await settle()

    expect(vi.mocked(pageService.showMessage).mock.calls).toEqual([])
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Alpha')
    expect(wrapper.text()).toContain('1 个')
    expect(wrapper.text()).not.toMatch(/保存设置|导出配置|日志级别|热重载|新建配置页面|最近操作/)

    await wrapper.find('input[value="dark"]').setValue(true)
    await settle()
    expect(state.theme.setMode).toHaveBeenCalledWith('dark')

    await wrapper.findAll('button').find(button => button.text() === '重载导航')!.trigger('click')
    await flushPromises()
    expect(state.reload).toHaveBeenCalledOnce()
  })

  it('lists only local page-file cache entries and deletes one without touching other storage', async () => {
    localStorage.clear()
    localStorage.setItem('spark_page_alpha', JSON.stringify({sourceTimestamp: 1_800_000_000_000, lastAccess: 1_800_000_000_000, expirationLevel: 1}))
    localStorage.setItem('spark_file_beta', 'not-json')
    localStorage.setItem('other_key', 'keep')
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: defineComponent({setup: () => () => h('div')})}]})
    await router.push('/')
    registerAllRenderers()
    vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
    const wrapper = mount(SettingsHost, {global: {plugins: [router, ElementPlus, Spark.createPlugin()], stubs: {'el-table': ElTable,
      'el-table-column': ElTableColumn, 'el-button': ElButton, SparkComponentRenderer: false, 'spark-component-renderer': false}}})
    await settle()

    expect(wrapper.text()).toContain('本机页面缓存')
    expect(wrapper.text()).toContain('共 2 条缓存')
    expect(wrapper.text()).toContain('spark_page_alpha')
    expect(wrapper.text()).not.toContain('other_key')

    const alphaRow = wrapper.findAll('tr').find(row => row.text().includes('spark_page_alpha'))!
    await alphaRow.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await settle()
    expect(localStorage.getItem('spark_page_alpha')).toBeNull()
    expect(localStorage.getItem('spark_file_beta')).toBe('not-json')
    expect(localStorage.getItem('other_key')).toBe('keep')
    expect(wrapper.text()).toContain('共 1 条缓存')
    expect(wrapper.text()).not.toContain('spark_page_alpha')
    expect(wrapper.text()).toContain('spark_file_beta')
    localStorage.clear()
  })
})
