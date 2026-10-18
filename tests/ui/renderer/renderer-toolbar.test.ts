import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, shallowReactive, type Component } from 'vue'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import { RendererToolbar, RendererTable, RendererTree, RendererList, RendererForm, RendererDetail,
  RendererVirtualCard, RendererTabs, RendererSteps, RendererCollapse, RendererButton,
  Spark, PAGE_RUNTIME, useSparkComponent, type RToolbarProps } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import type { SparkNode } from '@spark-appworks/spark-data'
import type { BeforeRenderContext } from '../../../packages/spark-component/src/components/support/beforeRender'

const originalStubs = config.global.stubs
afterEach(() => { config.global.stubs = originalStubs; vi.unstubAllGlobals() })

const containers: Array<[string, Component]> = [
  ['table', RendererTable], ['tree', RendererTree], ['list', RendererList], ['form', RendererForm],
  ['detail', RendererDetail], ['virtual-card', RendererVirtualCard], ['tabs', RendererTabs],
  ['steps', RendererSteps], ['collapse', RendererCollapse],
]

async function mountContainer(component: Component, props: {toolbar?: RToolbarProps; actions?: RToolbarProps}) {
  const input = shallowReactive(props)
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  delete stubs['el-table']; delete stubs['el-table-column']
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'Toolbar', tables: {Items: {
    tableName: 'Items', modelBinding: {modelId: 'MODEL', modelName: 'Items'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}],
    views: {default: {rows: [{id: 'A', label: 'First'}, {id: 'B', label: 'Second'}]},
      other: {rows: [{id: 'C', label: 'Other'}]}},
  }}})
  ds.getView('Items', 'default')!.setCurrentRowById('A')
  ds.getView('Items', 'other')!.setCurrentRowById('C')
  const runtime = new PageRuntime({pageId: 'toolbar', scenarioIds: ['SCENE'], loadScenario: async () => ds})
  await runtime.load()
  const registry = Spark.createRegistry()
  registry.register({type: 'r-toolbar', component: RendererToolbar})
  registry.register({type: 'r-button', component: RendererButton})
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'toolbar-test-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(component, {dataViewKey: 'SCENE@Items@default', autoColumns: false,
      showDataViewMeta: false, showPagination: false, ...input}, {default: () => h('span', 'body')})
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn},
    stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  await flushPromises()
  return {wrapper, ds, input, dispose() {wrapper.unmount(); runtime.dispose()}}
}

describe('container toolbar contract through the real renderer', () => {
  it.each(containers)('%s uses declared defaults without expanding minimal configuration', async (name, component) => {
    const toolbar = {children: [{type: 'r-button', props: {label: 'Default action'}}]}
    const original = JSON.stringify(toolbar)
    const fixture = await mountContainer(component, {toolbar})
    try {
      expect(fixture.wrapper.get(`.renderer-${name}-layout`).classes()).toContain(`renderer-${name}-layout--top`)
      const node = fixture.wrapper.get('.renderer-toolbar')
      expect(node.text()).toContain('Default action')
      expect(node.attributes('style')).toContain('column-gap: 12px')
      expect(node.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 8px')
      expect(JSON.stringify(toolbar)).toBe(original)
    } finally {fixture.dispose()}
  })

  it.each(containers)('%s preserves a tail-only toolbar, layout and explicit DataView binding', async (name, component) => {
    const before = vi.fn((context: BeforeRenderContext) => ({label: `view:${context.dataSource?.viewId}/${context.row?.['id']}`}))
    const fixture = await mountContainer(component, {toolbar: {position: 'bottom', class: 'shared-toolbar',
      gap: 19, zoneGap: 27, align: 'end', justify: 'end', dataViewKey: 'SCENE@Items@other',
      tail: {class: 'shared-tail', children: [{type: 'r-button', props: {onBeforeRender: before}}]}}})
    try {
      const toolbar = fixture.wrapper.get('.renderer-toolbar')
      expect(toolbar.text()).toContain('view:other/C')
      expect(toolbar.classes()).toContain('shared-toolbar')
      expect(toolbar.attributes('style')).toContain('column-gap: 27px')
      expect(toolbar.get('.renderer-toolbar-lane--end').attributes('style')).toContain('gap: 19px')
      expect(toolbar.get('.renderer-toolbar-lane--end').classes()).toContain('shared-tail')
      expect(fixture.wrapper.get(`.renderer-${name}-layout`).classes()).toContain(`renderer-${name}-layout--bottom`)
      expect(before.mock.calls[0]?.[0].host?.type).toBe('r-toolbar')
      fixture.input.toolbar = {...fixture.input.toolbar, dataViewKey: 'SCENE@Items@default', dataMember: 'selectedRows'}
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/undefined')
      fixture.input.toolbar = {...fixture.input.toolbar, dataMember: 'currentRow'}
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/A')
      fixture.ds.getView('Items', 'default')!.setCurrentRowById('B')
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/B')
    } finally {fixture.dispose()}
  })

  it.each(containers.slice(0, 3))('%s renders tail-only row actions with each row context', async (_name, component) => {
    const before = vi.fn((context: BeforeRenderContext) => ({label: `row:${context.row?.['id']}`}))
    const fixture = await mountContainer(component, {actions: {gap: 17, class: 'shared-actions',
      tail: {children: [{type: 'r-button', props: {onBeforeRender: before}}]}}})
    try {
      expect(fixture.wrapper.text()).toContain('row:A')
      expect(fixture.wrapper.text()).toContain('row:B')
      expect(fixture.wrapper.findAll('.renderer-toolbar.shared-actions').length).toBe(2)
      expect(fixture.wrapper.get('.renderer-toolbar-lane--end').attributes('style')).toContain('gap: 17px')
    } finally {fixture.dispose()}
  })
})

const SparkActionStub = defineComponent(
  (props: { config: SparkNode }) => {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': props.config.type,
    }, props.config.type)
  },
  {
    props: {
      config: {
        type: Object,
        required: true,
      },
    },
  },
)

describe('RendererToolbar integration', () => {
  it('uses defaults for unassigned properties and preserves explicit zero spacing', async () => {
    const wrapper = mount(RendererToolbar, {props: {children: [{type: 'main'}]},
      global: {stubs: {SparkComponentRenderer: SparkActionStub}}})
    try {
      expect(wrapper.get('.renderer-toolbar').attributes('style')).toContain('column-gap: 12px')
      expect(wrapper.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 8px')
      await wrapper.setProps({gap: 0, zoneGap: 0})
      expect(wrapper.get('.renderer-toolbar').attributes('style')).toContain('column-gap: 0px')
      expect(wrapper.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 0px')
    } finally {wrapper.unmount()}
  })

  it('should render default and tail children in separate horizontal lanes', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        gap: 10,
        zoneGap: 24,
        children: [
          { type: 'action-a' },
          { type: 'action-b' },
        ],
        tail: { type: 'r-tail', children: [{ type: 'action-tail' }] },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('column-gap: 24px;')

    const startLane = wrapper.find('.renderer-toolbar-lane--start')
    const endLane = wrapper.find('.renderer-toolbar-lane--end')
    expect(startLane.exists()).toBe(true)
    expect(endLane.exists()).toBe(true)
    expect(startLane.attributes('style')).toContain('grid-auto-flow: column;')
    expect(startLane.attributes('style')).toContain('gap: 10px;')
    expect(endLane.attributes('style')).toContain('justify-content: end;')

    const startItems = startLane.findAll('.spark-action-stub')
    const endItems = endLane.findAll('.spark-action-stub')
    expect(startItems).toHaveLength(2)
    expect(endItems).toHaveLength(1)
    expect(startItems[0]?.attributes('data-type')).toBe('action-a')
    expect(startItems[1]?.attributes('data-type')).toBe('action-b')
    expect(endItems[0]?.attributes('data-type')).toBe('action-tail')
  })

  it('should apply classes from r-tail child props', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: { class: 'toolbar-tail-custom', children: [{ type: 'tail-action' }] },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-custom')
  })

  it('should render structured tail prop without requiring wrapper child input', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: {
          class: 'toolbar-tail-prop-custom',
          children: [{ type: 'tail-action-from-prop' }],
        },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-prop-custom')
    expect(wrapper.find('.spark-action-stub[data-type="tail-action-from-prop"]').exists()).toBe(true)
  })
})
