import type { LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import NavIcon from '@/components/NavIcon.vue'

import {
  assembleLowcodeRuntimeNavigation,
  lowcodeApplicationCatalogNavigation,
  lowcodeEnterpriseDisplayName,
} from '@/lowcode/lowcode-runtime'

type BlueprintFixtureInput = Readonly<{
  nodeId: string
  parentNodeId?: string
  name: string
  title: string
  kind?: LowcodeProjectBlueprintRecord['kind']
  target?: string
  scenarioId?: string
  order?: number
}>

function record(input: BlueprintFixtureInput): LowcodeProjectBlueprintRecord {
  return {
    nodeId: input.nodeId,
    parentNodeId: input.parentNodeId ?? '',
    projectId: 'PROJECT-1',
    kind: input.kind ?? 'page',
    capability: { name: input.name },
    navigation: { title: input.title, ...(input.target === undefined ? {} : { target: input.target }), order: input.order ?? 0,
      publishInMenu: true, showChildren: true, beginGroup: false },
    ...(input.scenarioId ? { dataSpace: { scenarioId: input.scenarioId, models: [] } } : {}),
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

  it.each(['Payroll.Calculate', 'Payroll.Calculate.Renamed'])('keeps the menu title and nested home path for capability %s', (name) => {
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: 'SPARK薪酬管理',
      projectId: 'PROJECT-1',
      navigationRootId: 'ROOT-1',
      records: [
        record({ nodeId: 'module-1', name: 'Payroll', title: '工资管理', kind: 'module', order: 0 }),
        record({
          nodeId: 'page-1',
          parentNodeId: 'module-1',
          name,
          title: '工资核算',
          kind: 'page',
          target: 'vue:payroll/salary-calculation',
          scenarioId: 'FORM-1',
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
    expect(projection.items[0]).not.toHaveProperty('dataSpaceId')
    expect(projection.items[0]?.children?.[0]).toMatchObject({
      title: '工资核算',
      path: '/payroll/salary-calculation',
      itemKind: 'system-page',
    })
    expect(projection.items[0]?.children?.[0]).not.toHaveProperty('formKey')
    expect(projection.items[0]?.children?.[0]).not.toHaveProperty('dataSpaceId')
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
    expect(projection.items.at(-1)?.children?.every((child) => !('dataSpaceId' in child))).toBe(true)
  })

  it('keeps the cfg tool target separate from the scenario call parameter', () => {
    const tool = record({ nodeId: 'NODE-1', name: 'Orders.Query', title: '订单查询',
      target: 'cfg:shared/orders', scenarioId: 'SCENE-1' })
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: '测试应用', projectId: 'PROJECT-1', navigationRootId: 'ROOT-1',
      records: [tool], authorization: { items: [{ id: 'NODE-1', target: 'cfg:shared/orders',
        targetKind: 'route', formKey: 'SCENE-1', children: [] }], contexts: [] },
    })

    expect(tool.navigation?.target).toBe('cfg:shared/orders')
    expect(projection.items[0]).toMatchObject({ id: 'NODE-1', title: '订单查询',
      itemKind: 'page', path: '/__page/NODE-1?scenarioId=SCENE-1', tool: { projectId: 'PROJECT-1', pageId: 'shared/orders' } })
    expect(projection.items[0]).not.toHaveProperty('formKey')
    expect(projection.items[0]?.path).not.toContain('shared/orders')
  })

  it('preserves native scene call parameters and hash while projecting the Vue resource', () => {
    const target = 'vue:/orders?scenarioId=SCENE-1&item=A&item=B&bare&empty=#details'
    const projection = assembleLowcodeRuntimeNavigation({
      applicationName: '测试应用', projectId: 'PROJECT-1', navigationRootId: 'ROOT-1',
      records: [record({ nodeId: 'native', name: 'Orders', title: '订单', target })],
      authorization: { items: [{ id: 'native', target, targetKind: 'vue', formKey: null, children: [] }], contexts: [] },
    })
    expect(projection.items[0]?.path).toBe('/orders?scenarioId=SCENE-1&item=A&item=B&bare&empty=#details')
  })
})
