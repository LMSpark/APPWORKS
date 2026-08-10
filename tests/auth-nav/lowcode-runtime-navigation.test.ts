import type { RuntimeNavigationItem } from '@spark-appworks/spark-lowcode-api'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import NavIcon from '@/components/NavIcon.vue'

import {
  lowcodeApplicationCatalogNavigation,
  lowcodeEnterpriseDisplayName,
  projectRuntimeNavigation,
} from '@/lowcode/lowcode-runtime'

function navigationItem(
  input: Readonly<{
    id: string
    title: string
    target?: string
    itemKind?: RuntimeNavigationItem['itemKind']
    children?: readonly RuntimeNavigationItem[]
  }>,
): RuntimeNavigationItem {
  const target = input.target ?? ''
  return {
    id: input.id,
    parentId: '',
    title: input.title,
    target,
    targetKind: target.startsWith('vue:') ? 'vue' : target ? 'route' : 'empty',
    itemKind: input.itemKind ?? 'page',
    componentKey: target.startsWith('vue:') ? target : '',
    formKey: input.itemKind === 'module' ? null : 'FORM-1',
    icon: '',
    description: '',
    order: 0,
    disabled: false,
    children: input.children ?? [],
  }
}

describe('lowcode project navigation projection', () => {
  it('renders lowcode legacy icon classes as icons instead of raw class text', () => {
    const wrapper = mount(NavIcon, {
      props: { name: 'e-icons layui-icon layui-icon-app' },
      global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } },
    })

    expect(wrapper.text()).not.toContain('layui-icon')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('normalizes application icon aliases instead of rendering icon names as text', () => {
    for (const name of ['DataBase', 'FolderOpen']) {
      const wrapper = mount(NavIcon, {
        props: { name },
        global: { stubs: { 'el-icon': { template: '<i><slot /></i>' } } },
      })

      expect(wrapper.text()).not.toContain(name)
      expect(wrapper.find('svg').exists()).toBe(true)
    }
  })

  it('uses the Chinese enterprise short name as the AppWorks display label', () => {
    expect(lowcodeEnterpriseDisplayName({
      id: 'E1',
      name: 'QinYanTech',
      code: '武汉领码科技有限公司',
      shortName: 'NewApp',
      shortCode: '领码科技',
      raw: {},
    })).toBe('领码科技')
  })

  it('keeps every AppWorks tenant page reachable from the application catalog', () => {
    const catalog = lowcodeApplicationCatalogNavigation()

    expect(catalog.homePath).toBe('/app-list')
    expect(catalog.items.map((child) => child.path)).toEqual([
      '/settings',
      '/app-list',
      '/tenants',
      '/apps',
    ])
    expect(catalog.items.every((child) => child.itemKind === 'system-page')).toBe(true)
  })

  it('uses the first real nested page as the application home path', () => {
    const page = navigationItem({
      id: 'page-1',
      title: '工资核算',
      target: 'vue:payroll/salary-calculation',
    })
    const module = navigationItem({
      id: 'module-1',
      title: '工资管理',
      itemKind: 'module',
      children: [page],
    })

    const projection = projectRuntimeNavigation({
      applicationName: 'SPARK薪酬管理',
      navigationRootId: 'ROOT-1',
      items: [module],
    })

    expect(projection.homePath).toBe('/payroll/salary-calculation')
    expect(projection.items[0]?.dataSpaceId).toBeUndefined()
    expect(projection.items[0]?.children?.[0]).toMatchObject({
      path: '/payroll/salary-calculation',
      formKey: 'FORM-1',
      itemKind: 'system-page',
    })
    expect(projection.items[0]?.children?.[0]?.dataSpaceId).toBeUndefined()
    expect(projection.items.at(-1)).toMatchObject({
      id: 'appworks-system-tools',
      title: 'SPARK 工具',
      itemKind: 'module',
    })
    expect(projection.items.at(-1)?.children?.map((child) => child.path)).toEqual([
      '/demo/template-dsl',
      '/cache-manager',
      '/dashboard',
      '/capability-demo',
      '/workflow-designs',
      '/dev',
      '/dbms',
    ])
    expect(projection.items.at(-1)?.children?.every((child) => child.dataSpaceId === undefined)).toBe(true)
  })

})
