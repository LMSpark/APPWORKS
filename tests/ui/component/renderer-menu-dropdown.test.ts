import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import ElementPlus from 'element-plus'
import { RendererDropdown, RendererMenu, type MenuItem } from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function mountMenu(props: Record<string, unknown>) {
  const wrapper = mount(RendererMenu, { attachTo: document.body, props, global: { plugins: [ElementPlus] } })
  wrappers.push(wrapper)
  return wrapper
}

function label(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('.r-menu__text').find(node => node.text() === text)
  if (!found) throw new Error(`菜单文本未渲染: ${text}`)
  return found
}

const items: MenuItem[] = [
  { index: 'home', label: '首页', icon: 'HomeFilled', active: true, current: true, dividerAfter: true },
  { index: 'off', label: '停用', disabled: true },
  { index: 'group', label: '分组', group: true, children: [{ index: 'g1', label: '分组项', badge: 3 }] },
  { index: 'parent', label: '父级', titleSelectable: true, children: [{ index: 'child', label: '子项' }] },
]

describe('RendererMenu (r-menu)', () => {
  it('renders vertical items with active, current, badge, group and one separator', () => {
    const wrapper = mountMenu({ type: 'r-menu', items })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['r-menu', 'r-menu--vertical']))
    const active = wrapper.find('.r-menu__item--active')
    expect(active.text()).toContain('首页')
    expect(active.attributes('aria-current')).toBe('page')
    expect(wrapper.find('.r-menu__icon').exists()).toBe(true)
    expect(wrapper.findAll('.r-menu__separator')).toHaveLength(1)
    expect(wrapper.find('.el-menu-item-group').text()).toContain('分组')
    expect(wrapper.find('.r-menu__badge').text()).toBe('3')
    expect(wrapper.find('.r-menu__item--disabled').text()).toContain('停用')
  })

  it('reports leaf and selectable parent title selections once and ignores disabled items', async () => {
    const onSelect = vi.fn()
    const wrapper = mountMenu({ type: 'r-menu', items, onSelect })

    await label(wrapper, '首页').trigger('click')
    await label(wrapper, '停用').trigger('click')
    await label(wrapper, '父级').trigger('click')
    expect(onSelect.mock.calls.map(([index]) => index)).toEqual(['home', 'parent'])
    expect(onSelect.mock.calls[0]?.[1]).toMatchObject({ label: '首页' })
  })

  it('hides top-level labels and separators when collapsed', () => {
    const wrapper = mountMenu({ type: 'r-menu', items, collapse: true })

    expect(wrapper.classes()).toContain('el-menu--collapse')
    expect(wrapper.findAll('.r-menu__text').map(node => node.text())).not.toContain('首页')
    expect(wrapper.findAll('.r-menu__separator')).toHaveLength(0)
  })

  it('renders horizontal mode with divider classes instead of separator rows', () => {
    const wrapper = mountMenu({ type: 'r-menu', items, mode: 'horizontal', ellipsis: false })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['r-menu--horizontal', 'el-menu--horizontal']))
    expect(wrapper.findAll('.r-menu__separator')).toHaveLength(0)
    expect(wrapper.find('.r-menu__item--divider-after').text()).toContain('首页')
  })

  it('respects visible=false', () => {
    const wrapper = mountMenu({ type: 'r-menu', items, visible: false })
    expect(wrapper.find('.r-menu').exists()).toBe(false)
  })
})

describe('RendererDropdown (r-dropdown) command and trigger slot', () => {
  it('renders the default slot as trigger and forwards item commands through onCommand', async () => {
    const onCommand = vi.fn()
    const wrapper = mount(RendererDropdown, {
      attachTo: document.body,
      props: {
        type: 'r-dropdown',
        trigger: 'click',
        items: [{ label: '个人中心', command: 'profile', icon: 'User' }, { label: '退出', command: 'logout', divided: true }],
        onCommand,
      },
      slots: { default: () => h('span', { class: 'trigger-slot' }, '账号') },
      global: { plugins: [ElementPlus] },
    })
    wrappers.push(wrapper)

    expect(wrapper.find('.trigger-slot').text()).toBe('账号')
    await wrapper.find('.trigger-slot').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()
    const item = [...document.body.querySelectorAll('.el-dropdown-menu__item')].find(node => node.textContent?.includes('退出'))
    if (!(item instanceof HTMLElement)) throw new Error('下拉项未渲染')
    expect(document.body.querySelector('.r-dropdown__icon')).not.toBeNull()
    item.click()
    await flushPromises()
    expect(onCommand).toHaveBeenCalledWith('logout')
  })
})
