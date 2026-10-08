import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildPreAuthNavTree,
  buildComponentMap,
  getVuePageEntry,
  getPublicPaths,
  getVuePageOptions,
  hasVuePage,
} from '@/registries/vue-page-registry'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Vue page registry', () => {
  it('binds JSON page declarations to route metadata', () => {
    const publicPaths = getPublicPaths()
    const navTree = buildPreAuthNavTree()
    const options = getVuePageOptions()
    const homePage = getVuePageEntry('/')

    expect(homePage?.source).toBe('src/views/platform/HomePage.vue')
    expect(typeof homePage?.load).toBe('function')
    expect(hasVuePage('/about')).toBe(true)
    expect(hasVuePage('/missing')).toBe(false)
    expect(publicPaths.has('/login')).toBe(true)
    expect(publicPaths.has('/dashboard')).toBe(false)
    expect(navTree.homePath).toBe('/')
    expect(navTree.items.some(node => node.path === '/about')).toBe(true)
    expect(options.some(option => option.path === '/dev' && option.scope === 'app')).toBe(true)
    expect(options.some(option => option.path === '/workflow-designs' && option.source === 'src/views/app/WorkflowDesigns.vue')).toBe(true)
    expect(getVuePageEntry('/features/system/cache-management/ui/cache-management-page')?.source)
      .toBe('src/views/tenant/CacheManager.vue')
    expect(options.find(option => option.path === '/features/system/cache-management/ui/cache-management-page')?.shellTool)
      .toBe(false)
    expect([
      '/features/data-platform/database-management/ui/service-management-page',
      '/DataBaseManage/DataBaseManage/index',
      '/features/data-platform/database-management/table-and-view/ui/table-and-view-page',
    ].every(path => getVuePageEntry(path)?.source === 'src/views/app/DBMS.vue')).toBe(true)
    expect(getVuePageEntry('/features/application/application-manager/ui/application-manager-page')?.source)
      .toBe('src/views/tenant/AppList.vue')
  })

  it('does not load page modules while building the component map', async () => {
    const loads = getVuePageOptions().map(({ path }) => {
      const entry = getVuePageEntry(path)
      if (entry === undefined) throw new Error(`Expected the ${path} page registry entry`)
      return vi.spyOn(entry, 'load').mockResolvedValue({ default: defineComponent({ render: () => h('div') }) })
    })

    await buildComponentMap()

    expect(loads.every(load => load.mock.calls.length === 0)).toBe(true)
  })

  it('loads only the mounted page and reuses one async component for source aliases', async () => {
    const aboutEntry = getVuePageEntry('/about')
    if (aboutEntry === undefined) throw new Error('Expected the about page registry entry')
    const aboutSource = getVuePageOptions().filter(option => option.source === aboutEntry.source)
    const aboutLoads = aboutSource.map(({ path }) => {
      const sourceEntry = getVuePageEntry(path)
      if (sourceEntry === undefined) throw new Error(`Expected source entry for ${path}`)
      return vi.spyOn(sourceEntry, 'load').mockResolvedValue({
        default: defineComponent({ render: () => h('span', 'about loaded') }),
      })
    })
    const aliases = getVuePageOptions().filter(option => option.source === 'src/views/app/DBMS.vue')
    if (aliases.length < 2) throw new Error('Expected multiple DBMS source aliases')
    let aliasLoads = 0
    for (const alias of aliases) {
      const aliasEntry = getVuePageEntry(alias.path)
      if (aliasEntry === undefined) throw new Error(`Expected source entry for ${alias.path}`)
      vi.spyOn(aliasEntry, 'load').mockImplementation(() => {
        aliasLoads += 1
        return Promise.resolve({
          default: defineComponent({
            setup() {
              const count = ref(0)
              return () => h('button', { onClick: () => { count.value += 1 } }, String(count.value))
            },
          }),
        })
      })
    }

    const componentMap = await buildComponentMap()
    expect(aboutLoads.every(load => load.mock.calls.length === 0)).toBe(true)
    const about = mount(defineComponent({ render: () => h(componentMap['/about']!) }))
    await flushPromises()
    expect(aboutLoads.reduce((total, load) => total + load.mock.calls.length, 0)).toBe(1)
    expect(aliasLoads).toBe(0)
    expect(about.text()).toBe('about loaded')

    const firstAlias = mount(defineComponent({ render: () => h(componentMap[aliases[0]!.path]!) }))
    const secondAlias = mount(defineComponent({ render: () => h(componentMap[aliases[1]!.path]!) }))
    await flushPromises()
    expect(aliasLoads).toBe(1)
    await firstAlias.get('button').trigger('click')
    expect(firstAlias.text()).toBe('1')
    expect(secondAlias.text()).toBe('0')
    about.unmount()
    firstAlias.unmount()
    secondAlias.unmount()
  })

  it('uses a synchronous route host and renders the page through Vue Router', async () => {
    const entry = getVuePageEntry('/about')
    if (entry === undefined) throw new Error('Expected the about page registry entry')
    const sourcePaths = getVuePageOptions().filter(option => option.source === entry.source)
    for (const { path } of sourcePaths) {
      const sourceEntry = getVuePageEntry(path)
      if (sourceEntry === undefined) throw new Error(`Expected source entry for ${path}`)
      vi.spyOn(sourceEntry, 'load').mockResolvedValue({
        default: defineComponent({ render: () => h('main', 'router about page') }),
      })
    }
    const componentMap = await buildComponentMap()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: defineComponent({ render: () => h('main', 'home') }) },
        { path: '/about', component: componentMap['/about']! },
      ],
    })
    const warn = vi.spyOn(console, 'warn')
    const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router] },
    })
    await router.push('/about')
    await router.isReady()
    await flushPromises()

    expect(wrapper.text()).toContain('router about page')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('defineAsyncComponent')
    wrapper.unmount()
  })

  it('shows a page load error and reloads the current page on request', async () => {
    const entry = getVuePageEntry('/about')
    if (entry === undefined) throw new Error('Expected the about page registry entry')
    const sourcePaths = getVuePageOptions().filter(option => option.source === entry.source)
    for (const { path } of sourcePaths) {
      const sourceEntry = getVuePageEntry(path)
      if (sourceEntry === undefined) throw new Error(`Expected source entry for ${path}`)
      vi.spyOn(sourceEntry, 'load').mockRejectedValue(new Error('Chunk unavailable'))
    }
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    const componentMap = await buildComponentMap()
    const errors: unknown[] = []
    const wrapper = mount(defineComponent({ render: () => h(componentMap['/about']!) }), {
      global: { config: { errorHandler: error => errors.push(error) } },
    })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('页面加载失败')
    expect(wrapper.text()).toContain('Chunk unavailable')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ message: 'Chunk unavailable' })
    await wrapper.get('button').trigger('click')
    expect(reload).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
