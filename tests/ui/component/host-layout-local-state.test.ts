import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { computed } from 'vue'
import ElementPlus from 'element-plus'
import { Spark } from '@spark-appworks/spark-component'
import { NAV_KEY, type NavigationContext, type RuntimeNavigationContextState } from '@spark-appworks/spark-app'
import { HostLocalRuntime } from '@/layout/host-local-runtime'
import ThemeConfigurator from '@/layout/ThemeConfigurator.vue'
import NavContextSelector from '@/layout/NavContextSelector.vue'

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

async function settle() {
  for (let i = 0; i < 3; i++) await flushPromises()
}

function navigationContext() {
  const setContextValue = vi.fn()
  const nav: NavigationContext = {
    activePath: computed(() => []),
    regionItems: computed(() => ({ header: [], sidebar: [], toolbar: [], userMenu: [] })),
    regionVisibility: computed(() => ({ header: false, sidebar: false, toolbar: false, userMenu: false })),
    moduleContext: computed(() => null),
    navigateTo: vi.fn(),
    navigateToPath: vi.fn(),
    setContextValue,
    isNodeActive: () => false,
    getBadge: () => undefined,
    setBadge: vi.fn(),
  }
  return { nav, setContextValue }
}

function contextState(selected: string | number | null): RuntimeNavigationContextState {
  return {
    config: { source: 'projects', placeholder: '选择项目' },
    nodeId: 'project-context',
    selected,
    items: [{ id: 1, title: '项目甲' }, { id: 2, title: '项目乙' }],
    loading: false,
    error: null,
  }
}

describe('HostLocalRuntime', () => {
  it('reports user edits but not host write-backs', async () => {
    const local = await HostLocalRuntime.create({ scenarioId: 'host-test', tables: {
      Settings: { columns: [{ name: 'id', type: 'string' }, { name: 'on', type: 'boolean' }], rows: [{ id: 'row', on: false }] },
    } })
    const edits: Array<[string, unknown]> = []
    const unsubscribe = local.onFieldEdit('Settings', (field, value) => edits.push([field, value]))

    expect(local.key('Settings')).toBe('host-test@Settings@default')
    expect(local.view('Settings').commitMode).toBe('staged')
    local.write('Settings', 'row', { on: true })
    expect(local.view('Settings').getEditingRow('row')?.['on']).toBe(true)
    expect(edits).toEqual([])

    local.view('Settings').updateEditingValue('row', 'on', false)
    expect(edits).toEqual([['on', false]])
    expect(() => local.view('Missing')).toThrow('HOST_LOCAL_VIEW_MISSING')
    unsubscribe()
    local.dispose()
  })
})

describe('ThemeConfigurator local settings DataView', () => {
  it('binds standard switches to host settings and emits only user toggles', async () => {
    const wrapper = mount(ThemeConfigurator, {
      attachTo: document.body,
      props: { modelValue: true, headerFirst: false, collapsed: false, showFooter: true, mode: 'multi' },
      global: { plugins: [ElementPlus, Spark.createPlugin()] },
    })
    wrappers.push(wrapper)
    await settle()

    const switches = () => [...document.body.querySelectorAll<HTMLElement>('.config-form .el-switch')]
    expect(switches()).toHaveLength(3)
    expect(switches().map(node => node.classList.contains('is-checked'))).toEqual([true, false, true])

    await wrapper.setProps({ collapsed: true })
    await settle()
    expect(switches()[1]?.classList.contains('is-checked')).toBe(true)
    expect(wrapper.emitted('update:collapsed')).toBeUndefined()

    switches()[2]?.click()
    await settle()
    expect(wrapper.emitted('update:showFooter')).toEqual([[false]])
    switches()[0]?.click()
    await settle()
    expect(wrapper.emitted('update:mode')).toEqual([['single']])
  })
})

describe('NavContextSelector local context DataView', () => {
  it('writes the selected option back with its original id type and ignores host updates', async () => {
    const { nav, setContextValue } = navigationContext()
    const wrapper = mount(NavContextSelector, {
      attachTo: document.body,
      props: { state: contextState(1) },
      global: { plugins: [ElementPlus, Spark.createPlugin()], provide: { [NAV_KEY]: nav } },
    })
    wrappers.push(wrapper)
    await settle()

    const selectedText = () => wrapper.find('.el-select__selected-item:not(.is-hidden)').text()
    expect(wrapper.find('.nav-context-selector__select .el-select').exists()).toBe(true)
    expect(selectedText()).toBe('项目甲')

    await wrapper.setProps({ state: contextState(2) })
    await settle()
    expect(selectedText()).toBe('项目乙')
    expect(setContextValue).not.toHaveBeenCalled()

    await wrapper.find('.el-select__wrapper').trigger('click')
    await settle()
    const option = [...document.body.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node => node.textContent?.includes('项目甲'))
    if (!option) throw new Error('项目选项未渲染')
    option.click()
    await settle()
    expect(setContextValue).toHaveBeenCalledOnce()
    expect(setContextValue).toHaveBeenCalledWith(1)
  })
})
