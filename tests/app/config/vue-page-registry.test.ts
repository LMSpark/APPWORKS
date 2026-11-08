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
  parseVuePagesConfig,
} from '@/registries/vue-page-registry'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Vue page registry', () => {
  it('normalizes an explicit dataSpaceId and leaves an omitted one unset', () => {
    const config = parseVuePagesConfig({
      protocol: 'spark-appworks.vue-pages',
      schemaVersion: 1,
      pages: [
        {path: '/configured', title: 'Configured', scope: 'catalog', source: 'src/views/app/Settings.vue', dataSpaceId: ' SPACE-ID '},
        {path: '/unconfigured', title: 'Unconfigured', scope: 'catalog', source: 'src/views/app/Settings.vue'},
      ],
    })

    expect(config.pages[0]?.dataSpaceId).toBe('SPACE-ID')
    expect(config.pages[1]?.dataSpaceId).toBeUndefined()
  })

  it('rejects a whitespace-only dataSpaceId', () => {
    expect(() => parseVuePagesConfig({
      protocol: 'spark-appworks.vue-pages',
      schemaVersion: 1,
      pages: [{path: '/blank', title: 'Blank', scope: 'catalog', source: 'src/views/app/Settings.vue', dataSpaceId: '   '}],
    })).toThrow('dataSpaceId must be a non-empty string')
  })

  it('keeps duplicate path rejection when dataSpaceId is present', () => {
    expect(() => parseVuePagesConfig({
      protocol: 'spark-appworks.vue-pages',
      schemaVersion: 1,
      pages: [
        {path: '/same', title: 'First', scope: 'catalog', source: 'src/views/app/Settings.vue', dataSpaceId: 'SPACE-1'},
        {path: '/same', title: 'Second', scope: 'catalog', source: 'src/views/app/Settings.vue', dataSpaceId: 'SPACE-2'},
      ],
    })).toThrow('duplicated page path "/same"')
  })

  it.each([
    ['/features/data-platform/data-set-management/ui/data-set-list-page', false],
    ['/features/data-platform/data-set-management/design/ui/data-set-design-page', false],
    ['/features/data-platform/semi-structured/json-data/ui/json-data-page', false],
    ['/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page', false],
    ['/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page', false],
    ['/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page', false],
    ['/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page', false],
    ['/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page', false],
    ['/features/data-platform/structured-config/data-code/ui/data-code-editor-page', false],
    ['/features/data-platform/structured-config/logic-view/ui/logic-view-design-page', false],
    ['/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page', false],
  ])('resolves the unchanged native navigation path to its matching source: %s', (path, shellTool) => {
    const entry = getVuePageEntry(path)
    expect(entry?.source).toBe(`src/views${path}.vue`)
    expect(entry?.scope).toBe('app')
    expect(entry?.shellTool).toBe(shellTool)
    expect(typeof entry?.load).toBe('function')
  })

  it('keeps only the blueprint design path; the self-built short path is removed', () => {
    expect(getVuePageEntry('/features/data-platform/data-set-management/design/ui/data-set-design-page')).toBeDefined()
    expect(getVuePageEntry('/data-space-design')).toBeUndefined()
  })

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
      .toBe('src/views/features/system/cache-management/ui/cache-management-page.vue')
    expect(options.find(option => option.path === '/features/system/cache-management/ui/cache-management-page')?.shellTool)
      .toBe(false)
    expect(getVuePageEntry('/features/data-platform/database-management/ui/service-management-page')?.source)
      .toBe('src/views/features/data-platform/database-management/ui/service-management-page.vue')
    expect(getVuePageEntry('/features/data-platform/database-management/table-and-view/ui/table-and-view-page')?.source)
      .toBe('src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue')
    expect(getVuePageEntry('/DataBaseManage/DataBaseManage/index')?.source)
      .toBe('src/views/DataBaseManage/DataBaseManage/index.vue')
    expect(getVuePageEntry('/dbms')).toBeUndefined()
    expect(getVuePageEntry('/features/application/application-manager/ui/application-manager-page')?.source)
      .toBe('src/views/app/AppList.vue')
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

  it('loads only the mounted page and reuses one async component for two formal paths', async () => {
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
    const applicationListSource = 'src/views/app/AppList.vue'
    const applicationLists = getVuePageOptions().filter(option => option.source === applicationListSource)
    if (applicationLists.length !== 2) throw new Error('Expected the catalog and blueprint application lists to share one page')
    let applicationListLoads = 0
    for (const page of applicationLists) {
      const pageEntry = getVuePageEntry(page.path)
      if (pageEntry === undefined) throw new Error(`Expected source entry for ${page.path}`)
      vi.spyOn(pageEntry, 'load').mockImplementation(() => {
        applicationListLoads += 1
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
    expect(applicationListLoads).toBe(0)
    expect(about.text()).toBe('about loaded')

    const catalog = mount(defineComponent({ render: () => h(componentMap[applicationLists[0]!.path]!) }))
    const blueprint = mount(defineComponent({ render: () => h(componentMap[applicationLists[1]!.path]!) }))
    await flushPromises()
    expect(applicationListLoads).toBe(1)
    await catalog.get('button').trigger('click')
    expect(catalog.text()).toBe('1')
    expect(blueprint.text()).toBe('0')
    about.unmount()
    catalog.unmount()
    blueprint.unmount()
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
