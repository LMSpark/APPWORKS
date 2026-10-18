import {afterEach, describe, expect, it} from 'vitest'
import {defineComponent, h, ref} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {flushPromises, mount} from '@vue/test-utils'
import * as SystemPages from '../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import {setDynamicRouter} from '../../../../packages/spark-app/src/navigation/nav-access'
import {useTabPages} from '../../../../packages/spark-app/src/navigation/useTabPages'

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount())})

describe('native system page dirty sources', () => {
  it('guards close, single mode and project switching using the original source without storing drafts', async () => {
    expect(Reflect.get(SystemPages, 'useSystemPageDirtySource')).toBeTypeOf('function')
    const dirty = ref(true)
    const page = defineComponent({setup() {
      SystemPages.useSystemPageDirtySource({get isDirty() {return dirty.value}})
      return () => h('div', 'native edit')
    }})
    const clean = defineComponent({render: () => h('div', 'clean')})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    const dynamic = createDynamicRouter({router, pageComponent: clean,
      loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
        {id: 'edit', title: 'Edit', path: '/edit', itemKind: 'system-page'},
        {id: 'clean', title: 'Clean', path: '/clean', itemKind: 'system-page'},
      ]}), componentMap: {'/edit': page, '/clean': clean}})
    await dynamic.registerRoutes()
    setDynamicRouter(dynamic)
    await router.push('/edit?scenarioId=A')
    let tabs: ReturnType<typeof useTabPages> | undefined
    const host = mount(defineComponent({setup() {
      tabs = useTabPages(); tabs.setMode('multi')
      return () => h(RouterView)
    }}), {global: {plugins: [router]}})
    wrappers.push(host)
    await flushPromises()
    const first = dynamic.getSystemPageInstance(router.currentRoute.value)!
    expect(first.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(first.instanceId)).toThrow('未保存')
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    await expect(tabs!.closeTab(first.instanceId)).rejects.toThrow('未保存')
    expect(dynamic.getSystemPageInstanceById(first.instanceId)).toBeDefined()
    // A second instance owns its own sources; merely creating B does not inherit A's dirty state.
    await router.push('/edit?scenarioId=B')
    const second = dynamic.getSystemPageInstance(router.currentRoute.value)!
    expect(second.instanceId).not.toBe(first.instanceId)
    // The first component unmounted in this minimal RouterView host and unregisters its source.
    await flushPromises()
    expect(dynamic.getSystemPageInstanceById(first.instanceId)?.isDirty).toBe(false)
    const sourceHost = mount(first.view, {global: {plugins: [router]}})
    wrappers.push(sourceHost)
    await router.push('/clean')
    await flushPromises()
    expect(() => tabs!.setMode('single')).toThrow('未保存')
    await expect(tabs!.closeOthers(tabs!.activeTab.value)).rejects.toThrow('未保存')
    dirty.value = false
    expect(() => dynamic.assertPageRuntimesClean()).not.toThrow()
    await tabs!.closeTab(first.instanceId)
    expect(dynamic.getSystemPageInstanceById(first.instanceId)).toBeUndefined()
    tabs!.setMode('single')
    tabs!.setMode('multi')
  })

  it('still releases revoked identities and forced logout instances even when dirty', async () => {
    expect(Reflect.get(SystemPages, 'useSystemPageDirtySource')).toBeTypeOf('function')
    const page = defineComponent({setup() {
      SystemPages.useSystemPageDirtySource({isDirty: true})
      return () => h('div')
    }})
    const router = createRouter({history: createMemoryHistory(), routes: []})
    const dynamic = createDynamicRouter({router, pageComponent: page, componentMap: {'/edit': page},
      loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header',
        items: [{id: 'edit', title: 'Edit', path: '/edit', itemKind: 'system-page'}]})})
    await dynamic.registerRoutes()
    await router.push('/edit')
    const instance = dynamic.getSystemPageInstance(router.currentRoute.value)!
    wrappers.push(mount(instance.view, {global: {plugins: [router]}}))
    expect(instance.isDirty).toBe(true)
    dynamic.resetSystemPageInstances()
    expect(dynamic.getSystemPageInstanceById(instance.instanceId)).toBeUndefined()
  })
})
