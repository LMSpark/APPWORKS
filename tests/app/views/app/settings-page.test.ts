import {describe, expect, it, vi} from 'vitest'
import {defineComponent, h, inject, provide} from 'vue'
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

  it('lists only local page-file cache entries and deletes one without touching other storage', async () => {
    localStorage.clear()
    localStorage.setItem('spark_page_alpha', JSON.stringify({sourceTimestamp: 1_800_000_000_000, lastAccess: 1_800_000_000_000, expirationLevel: 1}))
    localStorage.setItem('spark_file_beta', 'not-json')
    localStorage.setItem('other_key', 'keep')
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/', component: defineComponent({setup: () => () => h('div')})}]})
    await router.push('/')
    const TableRow = defineComponent({
      props: {row: {type: Object, required: true}},
      setup(props, {slots}) { provide('cache-row', props.row); return () => h('tr', slots['default']?.()) },
    })
    const TableStub = defineComponent({
      props: {data: {type: Array, default: () => []}},
      setup(props, {slots}) { return () => h('table', (props.data as Array<Record<string, unknown>>).map(row => h(TableRow, {row}, {default: () => slots['default']?.()}))) },
    })
    const ColumnStub = defineComponent({
      props: {prop: {type: String, default: ''}},
      setup(props, {slots}) {
        const row = inject<Record<string, unknown>>('cache-row', {})
        return () => h('td', slots['default'] ? slots['default']({row}) : String(row[props.prop] ?? ''))
      },
    })
    const wrapper = mount(Settings, {global: {plugins: [router, ElementPlus], stubs: {'el-table': TableStub, 'el-table-column': ColumnStub}}})
    await flushPromises()

    expect(wrapper.text()).toContain('本机页面缓存')
    expect(wrapper.text()).toContain('共 2 条缓存')
    expect(wrapper.text()).toContain('spark_page_alpha')
    expect(wrapper.text()).not.toContain('other_key')

    const alphaRow = wrapper.findAll('tr').find(row => row.text().includes('spark_page_alpha'))!
    await alphaRow.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await flushPromises()
    expect(localStorage.getItem('spark_page_alpha')).toBeNull()
    expect(localStorage.getItem('spark_file_beta')).toBe('not-json')
    expect(localStorage.getItem('other_key')).toBe('keep')
    expect(wrapper.text()).toContain('共 1 条缓存')
    localStorage.clear()
  })
})
