import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {computed, nextTick, ref} from 'vue'
import ElementPlus, {ElMenu} from 'element-plus'
import type {NavigationContext, RuntimeNavigationItem} from '@spark-appworks/spark-app'
import {NAV_KEY} from '@spark-appworks/spark-app'
import NavHeaderBar from '@/layout/NavHeaderBar.vue'

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function navigationContext() {
  const activeItems = ref<RuntimeNavigationItem[]>([])
  const badges = ref(new Map<string, string | number>())
  const navigateTo = vi.fn()
  const nav: NavigationContext = {
    activePath: computed(() => activeItems.value),
    regionItems: computed(() => ({header: [], sidebar: [], toolbar: [], userMenu: []})),
    regionVisibility: computed(() => ({header: false, sidebar: false, toolbar: false, userMenu: false})),
    moduleContext: computed(() => null),
    navigateTo,
    navigateToPath: vi.fn(),
    setContextValue: vi.fn(),
    isNodeActive: node => activeItems.value.some(active => active.id === node.id),
    getBadge: nodeId => badges.value.get(nodeId),
    setBadge: vi.fn(),
  }
  return {nav, activeItems, badges, navigateTo}
}

function mountNav(items: RuntimeNavigationItem[], nav = navigationContext().nav) {
  const wrapper = mount(NavHeaderBar, {
    attachTo: document.body,
    props: {items},
    global: {plugins: [ElementPlus], provide: {[NAV_KEY]: nav}},
  })
  wrappers.push(wrapper)
  return wrapper
}

function title(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('span').find(node => node.text() === text)
  if (!found) throw new Error(`导航标题未渲染: ${text}`)
  return found
}

function bodyItem(text: string) {
  const found = [...document.body.querySelectorAll('.nav-header-bar__dropdown-item, .el-menu-item')]
    .find(node => node.textContent?.trim() === text)
  if (!found) throw new Error(`导航弹层标题未渲染: ${text}`)
  return found
}

async function waitForMenuPopper() {
  await new Promise(resolve => setTimeout(resolve, 350))
  await flushPromises()
}

function stubMenuResizeObserver() {
  class TestResizeObserver {
    constructor(private readonly callback: (entries: readonly unknown[], observer: TestResizeObserver) => void) {}
    observe(target: Element) {queueMicrotask(() => this.callback([{target}], this))}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
}

describe('NavHeaderBar Element Plus responsive menu behavior', () => {
  it('keeps top-level selection, parent-title navigation, and child selection as one navigateTo each', async () => {
    const leaf: RuntimeNavigationItem = {id: 'leaf', title: '顶层入口', itemKind: 'system-page', path: '/leaf'}
    const child: RuntimeNavigationItem = {id: 'child', title: '子入口', itemKind: 'system-page', path: '/child'}
    const parent: RuntimeNavigationItem = {id: 'parent', title: '父入口', itemKind: 'module', childPlacement: 'parent', children: [child]}
    const {nav, navigateTo} = navigationContext()
    const wrapper = mountNav([leaf, parent], nav)

    await title(wrapper, '顶层入口').trigger('click')
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenLastCalledWith(leaf)

    await title(wrapper, '父入口').trigger('click')
    expect(navigateTo).toHaveBeenCalledTimes(2)
    expect(navigateTo).toHaveBeenLastCalledWith(parent)

    await title(wrapper, '父入口').trigger('mouseenter')
    await waitForMenuPopper()
    const childTitle = bodyItem('子入口')
    childTitle.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledTimes(3)
    expect(navigateTo).toHaveBeenLastCalledWith(child)
  })

  it('does not navigate disabled items and omits hidden or disabled submenu children', async () => {
    const disabledRoot: RuntimeNavigationItem = {id: 'disabled-root', title: '禁用入口', path: '/disabled', disabled: true}
    const visibleChild: RuntimeNavigationItem = {id: 'visible-child', title: '可见子项', path: '/visible', dividerAfter: true}
    const parent: RuntimeNavigationItem = {id: 'parent', title: '父入口', itemKind: 'module', childPlacement: 'parent', children: [
      visibleChild,
      {id: 'hidden-child', title: '隐藏子项', path: '/hidden', hidden: true},
      {id: 'disabled-child', title: '禁用子项', path: '/disabled-child', disabled: true},
    ]}
    const {nav, navigateTo} = navigationContext()
    const wrapper = mountNav([disabledRoot, parent], nav)

    await title(wrapper, '禁用入口').trigger('click')
    expect(navigateTo).not.toHaveBeenCalled()
    await title(wrapper, '父入口').trigger('mouseenter')
    await waitForMenuPopper()
    expect(document.body.textContent).not.toContain('隐藏子项')
    expect(document.body.textContent).not.toContain('禁用子项')
    const visibleChildNode = bodyItem('可见子项')
    expect(visibleChildNode.classList.contains('nav-header-bar__item--divider-after')).toBe(true)
    visibleChildNode.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith(visibleChild)
  })

  it('follows an external SPA active-path change without retaining Element Plus active state on the old entry', async () => {
    const first: RuntimeNavigationItem = {id: 'first', title: '第一页', itemKind: 'system-page', path: '/first'}
    const second: RuntimeNavigationItem = {id: 'second', title: '第二页', itemKind: 'system-page', path: '/second'}
    const {nav, activeItems} = navigationContext()
    activeItems.value = [first]
    const wrapper = mountNav([first, second], nav)

    expect(wrapper.find('.nav-header-bar__item--active').text()).toContain('第一页')
    await title(wrapper, '第一页').trigger('click')
    const activeTitles = () => {
      return wrapper.findAll('.nav-header-bar__item--active').map(node => node.text().trim())
    }
    expect(activeTitles()).toContain('第一页')
    expect(wrapper.find('.el-menu-item[aria-current="page"]').text()).toContain('第一页')
    activeItems.value = [second]
    await flushPromises()
    expect(activeTitles()).toEqual(['第二页'])
    expect(wrapper.findAll('.el-menu-item[aria-current="page"]').map(node => node.text().trim())).toEqual(['第二页'])
  })

  it('keeps overflowed entries reachable in Element Plus ellipsis popper and navigates the selected item once', async () => {
    stubMenuResizeObserver()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('el-menu--horizontal') ? 150 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches('.el-menu-item, .el-sub-menu') ? 80 : 0
    })

    const first: RuntimeNavigationItem = {id: 'first', title: '可见入口', itemKind: 'system-page', path: '/first'}
    const overflowed: RuntimeNavigationItem = {id: 'external', title: '外部服务管理', itemKind: 'system-page', path: '/external', dividerAfter: true}
    const third: RuntimeNavigationItem = {id: 'third', title: '末尾入口', itemKind: 'system-page', path: '/third'}
    const {nav, activeItems, navigateTo} = navigationContext()
    activeItems.value = [first]
    const wrapper = mountNav([first, overflowed, third], nav)
    await flushPromises()

    const menu = wrapper.findComponent(ElMenu)
    expect(menu.exists()).toBe(true)
    await flushPromises()
    const moreTitle = wrapper.find('.el-sub-menu__hide-arrow .el-sub-menu__title')
    expect(moreTitle.exists()).toBe(true)
    await moreTitle.trigger('mouseenter')
    await waitForMenuPopper()
    expect(document.body.textContent).toContain('外部服务管理')
    const popup = document.body.querySelector('.el-menu--popup-container')
    expect(popup).not.toBeNull()
    const overflowedItem = [...document.body.querySelectorAll('.el-menu-item')]
      .find(node => node.textContent?.trim() === '外部服务管理')
    expect(overflowedItem).toBeDefined()
    expect(overflowedItem?.classList.contains('nav-header-bar__item--divider-after')).toBe(true)
    if (!(overflowedItem instanceof HTMLElement)) throw new Error('溢出项不是可渲染的菜单节点')
    overflowedItem?.dispatchEvent(new MouseEvent('click', {bubbles: true}))
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith(overflowed)
    expect(activeItems.value).toEqual([first])
    expect(overflowedItem.classList.contains('is-active')).toBe(true)
    expect(overflowedItem?.getAttribute('aria-current')).toBeNull()
    expect(overflowedItem?.classList.contains('nav-header-bar__item--active')).toBe(false)
    activeItems.value = [overflowed]
    await flushPromises()
    expect(overflowedItem.classList.contains('nav-header-bar__item--active')).toBe(true)
    expect(overflowedItem.getAttribute('aria-current')).toBe('page')
  })

  it('keeps parent active identity on the useNav-owned submenu item without marking it as a page', async () => {
    const child: RuntimeNavigationItem = {id: 'child', title: '子页', path: '/child'}
    const parent: RuntimeNavigationItem = {id: 'parent', title: '父模块', itemKind: 'module', childPlacement: 'parent', children: [child]}
    const {nav, activeItems} = navigationContext()
    activeItems.value = [parent, child]
    const wrapper = mountNav([parent], nav)

    const parentMenuItem = wrapper.find('.el-sub-menu.nav-header-bar__item--active')
    const parentTitle = wrapper.find('.el-sub-menu__title')
    expect(parentMenuItem.exists()).toBe(true)
    expect(parentTitle.exists()).toBe(true)
    expect(parentMenuItem.classes()).toContain('nav-header-bar__item--active')
    expect(parentTitle.classes()).not.toContain('nav-header-bar__item--active')
    expect(parentTitle.attributes('aria-current')).toBeUndefined()
    await parentTitle.trigger('mouseenter')
    await waitForMenuPopper()
    const currentPages = [...document.body.querySelectorAll('.el-menu-item[aria-current="page"]')]
    expect(currentPages.map(item => item.textContent?.trim())).toEqual(['子页'])
  })

  it('recalculates the same menu for badge and item changes, then removes its open teleported popper on unmount', async () => {
    stubMenuResizeObserver()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('el-menu--horizontal') ? 150 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.matches('.el-menu-item')) return this.textContent?.includes('999999') ? 100 : 60
      return this.matches('.el-sub-menu') ? 56 : 0
    })

    const first: RuntimeNavigationItem = {id: 'first', title: '入口甲', itemKind: 'system-page', path: '/first', dividerAfter: true}
    const second: RuntimeNavigationItem = {id: 'second', title: '入口乙', itemKind: 'system-page', path: '/second'}
    const third: RuntimeNavigationItem = {id: 'third', title: '入口丙', itemKind: 'system-page', path: '/third'}
    const {nav, badges} = navigationContext()
    const wrapper = mountNav([first, second, third], nav)
    await flushPromises()
    const menu = wrapper.findComponent(ElMenu)
    expect(menu.exists()).toBe(true)
    await flushPromises()
    const menuRoot = () => wrapper.element.querySelector('.el-menu--horizontal')
    expect(menuRoot()).not.toBeNull()

    const directLabels = () => [...(menuRoot()?.querySelectorAll(':scope > .el-menu-item') ?? [])]
      .map(node => node.textContent?.trim())
    expect(directLabels()).toContain('入口甲')
    expect(directLabels()).not.toContain('入口丙')

    badges.value = new Map([['first', '999999']])
    await nextTick()
    await flushPromises()
    expect(directLabels()).not.toContain('入口甲')
    expect(directLabels()).not.toContain('入口乙')

    const replacement: RuntimeNavigationItem[] = [
      {id: 'replacement-a', title: '新入口甲', itemKind: 'system-page', path: '/new-a'},
      {id: 'replacement-b', title: '新入口乙', itemKind: 'system-page', path: '/new-b'},
      {id: 'replacement-c', title: '新入口丙', itemKind: 'system-page', path: '/new-c'},
    ]
    await wrapper.setProps({items: replacement})
    await flushPromises()
    expect(wrapper.text()).not.toContain('入口丙')
    expect(wrapper.text()).toContain('新入口甲')

    const moreTitle = wrapper.find('.el-sub-menu__hide-arrow .el-sub-menu__title')
    expect(moreTitle.exists()).toBe(true)
    await moreTitle.trigger('mouseenter')
    await waitForMenuPopper()
    const renderedNavigationLabels = [...document.body.querySelectorAll('.el-menu-item, .el-sub-menu__title')]
      .map(node => node.textContent?.trim())
    expect(renderedNavigationLabels).toContain('新入口丙')
    expect(renderedNavigationLabels).not.toContain('入口丙')
    expect([...menuRoot()!.children].some(node => node.classList.contains('nav-header-bar__divider'))).toBe(false)

    wrapper.unmount()
    expect(document.body.textContent).not.toContain('新入口丙')
    expect(document.body.querySelector('.el-menu--popup-container')).toBeNull()
  })
})
