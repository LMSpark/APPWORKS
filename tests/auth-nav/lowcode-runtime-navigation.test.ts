import type { LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import NavIcon from '@/components/NavIcon.vue'

import {
  assembleLowcodeRuntimeNavigation,
  lowcodeApplicationCatalogNavigation,
  lowcodeEnterpriseDisplayName,
} from '@/lowcode/lowcode-runtime'

function record(
  input: Readonly<{
    id: string
    parentId?: string
    title: string
    kind?: LowcodeProjectBlueprintRecord['kind']
    runtimeTarget?: string
    formKey?: string
    order?: number
  }>,
): LowcodeProjectBlueprintRecord {
  return {
    id: input.id,
    parentId: input.parentId ?? '',
    projectId: 'PROJECT-1',
    title: input.title,
    kind: input.kind ?? 'page',
    description: '',
    planningContent: '',
    prototypeHtml: '',
    formKey: input.formKey ?? '',
    dataSpaceType: '',
    runtimeTarget: input.runtimeTarget ?? '',
    fileVersionId: '',
    difficultyFactor: 0,
    manhour: 0,
    quantity: 0,
    sum: 0,
    total: 0,
    personInCharge: '',
    status: '',
    navigationType: 0,
    runtimeNavigationCandidate: true,
    order: input.order ?? 0,
    source: {},
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
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: 'SPARK薪酬管理',
      projectId: 'PROJECT-1',
      navigationRootId: 'ROOT-1',
      records: [
        record({ id: 'module-1', title: '工资管理', kind: 'module', order: 0 }),
        record({
          id: 'page-1',
          parentId: 'module-1',
          title: '工资核算',
          kind: 'page',
          runtimeTarget: 'vue:payroll/salary-calculation',
          formKey: 'FORM-1',
          order: 1,
        }),
      ],
      authorization: {
        items: [{
          id: 'module-1',
          target: '',
          targetKind: 'empty',
          formKey: null,
          children: [{
            id: 'page-1',
            target: 'vue:payroll/salary-calculation',
            targetKind: 'vue',
            formKey: 'FORM-1',
            children: [],
          }],
        }],
        contexts: [],
      },
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
