import { mount } from '@vue/test-utils'
import { computed, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { NavigationContext, RuntimeNavigationItem } from '@spark-appworks/spark-app'
import { NAV_KEY } from '@spark-appworks/spark-app'
import AppSidebar from '@/layout/AppSidebar.vue'

const ElMenuStub = defineComponent({
  name: 'ElMenu',
  props: {
    defaultActive: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('ul', {
      ...attrs,
      class: 'el-menu',
      'data-default-active': props.defaultActive,
    }, slots['default']?.())
  },
})

const ElMenuItemStub = defineComponent({
  name: 'ElMenuItem',
  props: {
    index: String,
    disabled: Boolean,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: ['el-menu-item', attrs['class']],
      'data-index': props.index,
      'aria-disabled': String(props.disabled ?? false),
    }, slots['default']?.())
  },
})

const ElSubMenuStub = defineComponent({
  name: 'ElSubMenu',
  props: {
    index: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: 'el-sub-menu',
      'data-index': props.index,
    }, [
      h('div', { class: 'el-sub-menu__title' }, slots['title']?.()),
      h('ul', slots['default']?.()),
    ])
  },
})

const ElMenuItemGroupStub = defineComponent({
  name: 'ElMenuItemGroup',
  props: {
    title: String,
  },
  setup(props, { slots, attrs }) {
    return () => h('li', {
      ...attrs,
      class: 'el-menu-item-group',
      'data-title': props.title,
    }, [
      h('div', { class: 'el-menu-item-group__title' }, props.title),
      h('ul', slots['default']?.()),
    ])
  },
})

const DisplayIconStub = defineComponent({
  name: 'DisplayIcon',
  props: {
    icon: String,
  },
  setup(props) {
    return () => h('span', { class: 'display-icon-stub', 'data-icon': props.icon })
  },
})

function createNavigationContext(activePath: RuntimeNavigationItem[]): NavigationContext {
  const regionItems = computed(() => ({
    header: [],
    sidebar: [],
    toolbar: [],
    userMenu: [],
  }))
  return {
    activePath: computed(() => activePath),
    regionItems,
    regionVisibility: computed(() => ({
      header: false,
      sidebar: false,
      toolbar: false,
      userMenu: false,
    })),
    moduleContext: computed(() => null),
    navigateTo: vi.fn(),
    navigateToPath: vi.fn(),
    setContextValue: vi.fn(),
    isNodeActive: (node) => activePath.some((active) => active.id === node.id),
    getBadge: vi.fn(),
    setBadge: vi.fn(),
  }
}

describe('AppSidebar navigation rendering', () => {
  it('does not expose router records when the authorized navigation tree is empty', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/internal-only', component: { template: '<div />' }, meta: { title: '内部页面' } }],
    })
    await router.push('/internal-only')
    await router.isReady()

    const wrapper = mount(AppSidebar, {
      props: { items: [] },
      global: {
        plugins: [router],
        provide: { [NAV_KEY]: createNavigationContext([]) },
        stubs: {
          ElMenu: ElMenuStub,
          ElMenuItem: ElMenuItemStub,
          ElSubMenu: ElSubMenuStub,
          ElMenuItemGroup: ElMenuItemGroupStub,
          DisplayIcon: DisplayIconStub,
        },
      },
    })

    expect(wrapper.find('.el-menu').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('内部页面')
  })

  it('uses active nav node indexes for platform-prefixed routes and renders one divider', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/platform/dev', component: { template: '<div />' } }],
    })
    await router.push('/platform/dev')
    await router.isReady()

    const devCenter: RuntimeNavigationItem = {
      id: 'platform-dev-center',
      itemKind: 'module',
      title: '开发中心',
      childPlacement: 'sidebar',
    }
    const items: RuntimeNavigationItem[] = [
      {
        id: 'platform-dbms',
        itemKind: 'system-page',
        title: '数据库管理',
        icon: 'DataBase',
        path: '/dbms',
        dividerAfter: true,
      },
      {
        id: 'platform-dev',
        itemKind: 'system-page',
        title: '开发工作台',
        icon: 'Lightning',
        path: '/dev',
      },
      {
        id: 'platform-workflow',
        itemKind: 'system-page',
        title: '工作流设计',
        icon: 'Share',
        path: '/workflow-designs',
      },
    ]
    const platformDev = items[1]
    if (platformDev === undefined) throw new Error('Expected platform dev nav item')
    const nav = createNavigationContext([devCenter, platformDev])

    const wrapper = mount(AppSidebar, {
      props: {
        items,
      },
      global: {
        plugins: [router],
        provide: {
          [NAV_KEY]: nav,
        },
        stubs: {
          ElMenu: ElMenuStub,
          ElMenuItem: ElMenuItemStub,
          ElSubMenu: ElSubMenuStub,
          ElMenuItemGroup: ElMenuItemGroupStub,
          DisplayIcon: DisplayIconStub,
        },
      },
    })

    expect(wrapper.find('.el-menu').attributes('data-default-active')).toBe('platform-dev')
    expect(wrapper.findAll('.r-menu__separator')).toHaveLength(1)
    expect(wrapper.find('.r-menu__item--active').text()).toContain('开发工作台')
  })

  it('renders sidebar directory nodes with nested directory children as submenus', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/settings', component: { template: '<div />' } },
        { path: '/page-manager', component: { template: '<div />' } },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    const settingsLeaf: RuntimeNavigationItem = {
      id: 'settings-basic',
      itemKind: 'system-page',
      title: '基本设置',
      icon: 'Setting',
      path: '/settings',
    }
    const settingsGroup: RuntimeNavigationItem = {
      id: 'system-settings',
      itemKind: 'module',
      title: '系统设置',
      icon: 'Setting',
      childPlacement: 'parent',
      children: [settingsLeaf],
    }
    const rootGroup: RuntimeNavigationItem = {
      id: 'system-config',
      itemKind: 'module',
      title: '系统配置',
      icon: 'Tools',
      childPlacement: 'sidebar',
      children: [
        settingsGroup,
        {
          id: 'page-manager',
          itemKind: 'system-page',
          title: '页面管理',
          icon: 'Grid',
          path: '/page-manager',
        },
      ],
    }
    const nav = createNavigationContext([rootGroup, settingsGroup, settingsLeaf])

    const wrapper = mount(AppSidebar, {
      props: {
        items: [rootGroup],
      },
      global: {
        plugins: [router],
        provide: {
          [NAV_KEY]: nav,
        },
        stubs: {
          ElMenu: ElMenuStub,
          ElMenuItem: ElMenuItemStub,
          ElSubMenu: ElSubMenuStub,
          ElMenuItemGroup: ElMenuItemGroupStub,
          DisplayIcon: DisplayIconStub,
        },
      },
    })

    const submenuIndexes = wrapper.findAll('.el-sub-menu').map((node) => node.attributes('data-index'))
    expect(submenuIndexes).toEqual(expect.arrayContaining(['system-config', 'system-settings']))
    expect(wrapper.find('.el-menu-item-group[data-title="系统配置"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('基本设置')
  })
})

it('lets a routable nested sidebar parent and its child each be selected', async () => {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/parent', component: {template: '<div />'}},
    {path: '/child', component: {template: '<div />'}},
  ]})
  await router.push('/parent')
  const child: RuntimeNavigationItem = {id: 'child', itemKind: 'page', path: '/child', title: '子页'}
  const parent: RuntimeNavigationItem = {id: 'parent', itemKind: 'system-page', path: '/parent', title: '父页', children: [child]}
  const nav = createNavigationContext([parent])
  const wrapper = mount(AppSidebar, {
    props: {items: [parent]},
    global: {plugins: [router], provide: {[NAV_KEY]: nav}, stubs: {ElMenu: ElMenuStub,
      ElMenuItem: ElMenuItemStub, ElSubMenu: ElSubMenuStub, ElMenuItemGroup: ElMenuItemGroupStub, DisplayIcon: DisplayIconStub}},
  })
  try {
    expect(wrapper.find('.el-menu').attributes('data-default-active')).toBe('parent')
    expect(wrapper.find('[data-index="/child"]').text()).toContain('子页')
    await wrapper.find('[data-index="parent"] .r-menu__label--selectable').trigger('click')
    expect(nav.navigateTo).toHaveBeenCalledWith(parent)
    await wrapper.find('[data-index="/child"]').trigger('click')
    expect(nav.navigateTo).toHaveBeenLastCalledWith(child)
  } finally {
    wrapper.unmount()
  }
})

it('keeps same-path system nodes distinct after the last child is revoked', async () => {
  const router = createRouter({history: createMemoryHistory(), routes: [
    {path: '/shared', component: {template: '<div />'}},
  ]})
  await router.push('/shared')
  const child: RuntimeNavigationItem = {id: 'child', itemKind: 'page', path: '/child', title: '子页'}
  const parent: RuntimeNavigationItem = {id: 'parent', itemKind: 'system-page', path: '/shared', title: '父页'}
  const sibling: RuntimeNavigationItem = {id: 'sibling', itemKind: 'system-page', path: '/shared', title: '邻页'}
  const nav = createNavigationContext([parent])
  const wrapper = mount(AppSidebar, {
    props: {items: [{...parent, children: [child]}, sibling]},
    global: {plugins: [router], provide: {[NAV_KEY]: nav}, stubs: {ElMenu: ElMenuStub,
      ElMenuItem: ElMenuItemStub, ElSubMenu: ElSubMenuStub, ElMenuItemGroup: ElMenuItemGroupStub, DisplayIcon: DisplayIconStub}},
  })
  try {
    await wrapper.setProps({items: [parent, sibling]})
    const entries = wrapper.findAll('.el-menu-item')
    await entries.find(item => item.text() === '父页')?.trigger('click')
    expect(nav.navigateTo).toHaveBeenLastCalledWith(parent)
    await entries.find(item => item.text() === '邻页')?.trigger('click')
    expect(nav.navigateTo).toHaveBeenLastCalledWith(sibling)
    expect(wrapper.find('.el-menu').attributes('data-default-active')).toBe('parent')
  } finally {
    wrapper.unmount()
  }
})
