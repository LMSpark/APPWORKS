import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildPreAuthNavTree,
  buildComponentMap,
  getVuePageEntry,
  getPublicPaths,
  getSystemPageIdentityCompanions,
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
        {path: '/configured', title: 'Configured', scope: 'enterprise', source: 'src/views/app/Settings.vue', dataSpaceId: ' SPACE-ID '},
        {path: '/unconfigured', title: 'Unconfigured', scope: 'enterprise', source: 'src/views/app/Settings.vue'},
      ],
    })

    expect(config.pages[0]?.dataSpaceId).toBe('SPACE-ID')
    expect(config.pages[1]?.dataSpaceId).toBeUndefined()
  })

  it('rejects a whitespace-only dataSpaceId', () => {
    expect(() => parseVuePagesConfig({
      protocol: 'spark-appworks.vue-pages',
      schemaVersion: 1,
      pages: [{path: '/blank', title: 'Blank', scope: 'enterprise', source: 'src/views/app/Settings.vue', dataSpaceId: '   '}],
    })).toThrow('dataSpaceId must be a non-empty string')
  })

  it('keeps duplicate path rejection when dataSpaceId is present', () => {
    expect(() => parseVuePagesConfig({
      protocol: 'spark-appworks.vue-pages',
      schemaVersion: 1,
      pages: [
        {path: '/same', title: 'First', scope: 'enterprise', source: 'src/views/app/Settings.vue', dataSpaceId: 'SPACE-1'},
        {path: '/same', title: 'Second', scope: 'enterprise', source: 'src/views/app/Settings.vue', dataSpaceId: 'SPACE-2'},
      ],
    })).toThrow('duplicated page path "/same"')
  })

  it('rejects identityHost on a visible page and on a host of another scope', () => {
    const source = 'src/views/app/Settings.vue'
    expect(() => parseVuePagesConfig({protocol: 'spark-appworks.vue-pages', schemaVersion: 1, pages: [
      {path: '/host', title: 'Host', scope: 'enterprise', source},
      {path: '/companion', title: 'Companion', scope: 'enterprise', source, identityHost: '/host'},
    ]})).toThrow('identityHost requires hidden: true')
    expect(() => parseVuePagesConfig({protocol: 'spark-appworks.vue-pages', schemaVersion: 1, pages: [
      {path: '/host', title: 'Host', scope: 'app', source},
      {path: '/companion', title: 'Companion', scope: 'enterprise', source, hidden: true, identityHost: '/host'},
    ]})).toThrow('identityHost must be a visible page of the same scope')
  })

  it('requires dataSpaceId for navigationId and unique menu identities', () => {
    const source = 'src/views/app/Settings.vue'
    expect(() => parseVuePagesConfig({protocol: 'spark-appworks.vue-pages', schemaVersion: 1, pages: [
      {path: '/a', title: 'A', scope: 'enterprise', source, navigationId: 'NAV'},
    ]})).toThrow('navigationId requires dataSpaceId')
    expect(() => parseVuePagesConfig({protocol: 'spark-appworks.vue-pages', schemaVersion: 1, pages: [
      {path: '/a', title: 'A', scope: 'enterprise', source, dataSpaceId: 'SPACE'},
      {path: '/b', title: 'B', scope: 'enterprise', source, dataSpaceId: 'OTHER', navigationId: 'SPACE'},
    ]})).toThrow('duplicated navigation identity "SPACE"')
  })

  it('derives identity companions from identityHost declarations', () => {
    expect(getSystemPageIdentityCompanions()).toEqual(expect.arrayContaining([
      {path: '/features/data-platform/structured-config/logic-view/ui/logic-view-design-page',
        hostPath: '/features/data-platform/structured-config/logic-view/ui/logic-view-list-page'},
      {path: '/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page',
        hostPath: '/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page'},
    ]))
  })

  it.each([
    ['/features/data-platform/data-set-management/ui/data-set-list-page', 'app'],
    ['/features/data-platform/data-set-management/design/ui/data-set-design-page', 'app'],
    ['/features/data-platform/semi-structured/json-data/ui/json-data-page', 'enterprise'],
    ['/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page', 'enterprise'],
    ['/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page', 'enterprise'],
    ['/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page', 'enterprise'],
    ['/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page', 'enterprise'],
    ['/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page', 'app'],
    ['/features/data-platform/structured-config/data-code/ui/data-code-editor-page', 'app'],
    ['/features/data-platform/structured-config/logic-view/ui/logic-view-design-page', 'app'],
    ['/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page', 'app'],
    ['/features/organization/organization-structure/ui/organization-structure-page', 'enterprise'],
  ])('resolves the unchanged native navigation path to its matching source: %s', (path, scope) => {
    const entry = getVuePageEntry(path)
    expect(entry?.source).toBe(`src/views${path}.vue`)
    expect(entry?.scope).toBe(scope)
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
    expect(hasVuePage('/login')).toBe(true)
    expect(hasVuePage('/about')).toBe(false)
    expect(hasVuePage('/missing')).toBe(false)
    expect(publicPaths.has('/login')).toBe(true)
    expect(publicPaths.has('/dashboard')).toBe(false)
    expect(navTree.homePath).toBe('/')
    expect(navTree.items.find(node => node.path === '/login')).toMatchObject({hidden: true})
    expect(options.some(option => option.path === '/dev')).toBe(false)
    expect(options.some(option => option.path === '/tenants')).toBe(false)
    expect(options.some(option => option.path === '/workflow-designs' && option.source === 'src/views/app/WorkflowDesigns.vue')).toBe(true)
    expect(getVuePageEntry('/features/system/cache-management/ui/cache-management-page')).toMatchObject({
      source: 'src/views/features/system/cache-management/ui/cache-management-page.vue', scope: 'enterprise', group: '系统支持管理'})
    expect(getVuePageEntry('/features/data-platform/database-management/ui/service-management-page')?.source)
      .toBe('src/views/features/data-platform/database-management/ui/service-management-page.vue')
    expect(getVuePageEntry('/features/data-platform/database-management/table-and-view/ui/table-and-view-page')?.source)
      .toBe('src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue')
    expect(getVuePageEntry('/DataBaseManage/DataBaseManage/index')?.source)
      .toBe('src/views/DataBaseManage/DataBaseManage/index.vue')
    expect(getVuePageEntry('/dbms')).toBeUndefined()
    expect(getVuePageEntry('/features/application/application-manager/ui/application-manager-page')?.source)
      .toBe('src/views/features/application/application-manager/ui/application-manager-page.vue')
    const blueprintPath = '/features/application/application-function-management/ui/application-function-page'
    expect(getVuePageEntry(blueprintPath)).toMatchObject({
      source: `src/views${blueprintPath}.vue`,
      scope: 'app',
      order: 1,
    })
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

  it('loads only the mounted page and keeps the application manager source separate', async () => {
    const loginEntry = getVuePageEntry('/login')
    if (loginEntry === undefined) throw new Error('Expected the login page registry entry')
    const loginSource = getVuePageOptions().filter(option => option.source === loginEntry.source)
    const loginLoads = loginSource.map(({ path }) => {
      const sourceEntry = getVuePageEntry(path)
      if (sourceEntry === undefined) throw new Error(`Expected source entry for ${path}`)
      return vi.spyOn(sourceEntry, 'load').mockResolvedValue({
        default: defineComponent({ render: () => h('span', 'login loaded') }),
      })
    })
    const applicationListSource = 'src/views/app/AppList.vue'
    const applicationLists = getVuePageOptions().filter(option => option.source === applicationListSource)
    if (applicationLists.length !== 1) throw new Error('Expected the default application catalog to retain its own page')
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
    const managerPath = '/features/application/application-manager/ui/application-manager-page'
    const managerEntry = getVuePageEntry(managerPath)
    if (managerEntry === undefined) throw new Error('Expected the application manager page registry entry')
    let managerLoads = 0
    vi.spyOn(managerEntry, 'load').mockImplementation(() => {
      managerLoads += 1
      return Promise.resolve({default: defineComponent({render: () => h('span', 'application manager loaded')})})
    })

    const componentMap = await buildComponentMap()
    expect(loginLoads.every(load => load.mock.calls.length === 0)).toBe(true)
    const login = mount(defineComponent({ render: () => h(componentMap['/login']!) }))
    await flushPromises()
    expect(loginLoads.reduce((total, load) => total + load.mock.calls.length, 0)).toBe(1)
    expect(applicationListLoads).toBe(0)
    expect(managerLoads).toBe(0)
    expect(login.text()).toBe('login loaded')

    const catalog = mount(defineComponent({ render: () => h(componentMap[applicationLists[0]!.path]!) }))
    await flushPromises()
    expect(applicationListLoads).toBe(1)
    await catalog.get('button').trigger('click')
    expect(catalog.text()).toBe('1')
    const manager = mount(defineComponent({render: () => h(componentMap[managerPath]!)}))
    await flushPromises()
    expect(managerLoads).toBe(1)
    expect(manager.text()).toBe('application manager loaded')
    login.unmount()
    catalog.unmount()
    manager.unmount()
  })

  it('uses a synchronous route host and renders the page through Vue Router', async () => {
    const entry = getVuePageEntry('/login')
    if (entry === undefined) throw new Error('Expected the login page registry entry')
    const sourcePaths = getVuePageOptions().filter(option => option.source === entry.source)
    for (const { path } of sourcePaths) {
      const sourceEntry = getVuePageEntry(path)
      if (sourceEntry === undefined) throw new Error(`Expected source entry for ${path}`)
      vi.spyOn(sourceEntry, 'load').mockResolvedValue({
        default: defineComponent({ render: () => h('main', 'router login page') }),
      })
    }
    const componentMap = await buildComponentMap()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: defineComponent({ render: () => h('main', 'home') }) },
        { path: '/login', component: componentMap['/login']! },
      ],
    })
    const warn = vi.spyOn(console, 'warn')
    const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router] },
    })
    await router.push('/login')
    await router.isReady()
    await flushPromises()

    expect(wrapper.text()).toContain('router login page')
    expect(warn.mock.calls.flat().join(' ')).not.toContain('defineAsyncComponent')
    wrapper.unmount()
  })

  it('shows a page load error and reloads the current page on request', async () => {
    const entry = getVuePageEntry('/login')
    if (entry === undefined) throw new Error('Expected the login page registry entry')
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
    const wrapper = mount(defineComponent({ render: () => h(componentMap['/login']!) }), {
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
