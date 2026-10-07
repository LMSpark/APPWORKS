import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { isRecord } from '@spark-appworks/spark-utils'
import { RendererTabs, RendererCollapse } from '@spark-appworks/spark-component'
import RendererTabPane from '../../../packages/spark-component/src/components/containers/layout/navigation/RendererTabs/RendererTabPane.vue'
import RendererCollapseItem from '../../../packages/spark-component/src/components/containers/layout/structure/RendererCollapse/RendererCollapseItem.vue'
import RendererToolbar from '../../../packages/spark-component/src/components/containers/layout/action/RendererToolbar/RendererToolbar.vue'
import { isSparkNode, type SparkNode, type SparkNodeChildren } from '@spark-appworks/spark-data'


function readSparkNodeChildren(value: unknown): SparkNodeChildren | undefined {
  return Array.isArray(value) && value.every(isSparkNode) ? value : undefined
}

function readConfigProps(config: Record<string, unknown>): Record<string, unknown> {
  const props = config['props']
  return isRecord(props) ? props : {}
}

function readConfigChildren(config: Record<string, unknown>, propsMap: Record<string, unknown>): SparkNodeChildren {
  return readSparkNodeChildren(propsMap['children']) ?? readSparkNodeChildren(config['children']) ?? []
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => {
      if (!isRecord(props.config)) {
        throw new TypeError('SparkActionStub config must be an object')
      }
      const config = props.config
      const type = String(config['type'] ?? '')
      const propsMap = readConfigProps(config)

      if (type === 'r-toolbar') {
        const children = readConfigChildren(config, propsMap)
        return h(RendererToolbar, {
          ...propsMap,
          children,
        })
      }

      if (type === 'r-tab-pane') {
        const children = readConfigChildren(config, propsMap)
        return h(RendererTabPane, {
          ...propsMap,
          children,
          index: readNumber(propsMap['index'], 0),
        })
      }

      if (type === 'r-collapse-item') {
        const children = readConfigChildren(config, propsMap)
        return h(RendererCollapseItem, {
          ...propsMap,
          children,
          index: readNumber(propsMap['index'], 0),
        })
      }

      return h('button', {
        class: 'spark-action-stub',
        'data-type': type,
      }, type)
    }
  },
})

const ElTabsStub = defineComponent({
  name: 'ElTabsStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-tabs-stub' }, slots['default']?.())
  },
})

const ElTabPaneStub = defineComponent({
  props: {
    label: String,
    name: [String, Number],
  },
  setup(props, { slots }) {
    return () => h('section', {
      class: 'el-tab-pane-stub',
      'data-label': props.label,
      'data-name': String(props.name ?? ''),
    }, slots['default']?.())
  },
})

const ElCollapseStub = defineComponent({
  name: 'ElCollapseStub',
  setup(_, { slots }) {
    return () => h('div', { class: 'el-collapse-stub' }, slots['default']?.())
  },
})

const ElCollapseItemStub = defineComponent({
  props: {
    title: String,
    name: [String, Number],
  },
  setup(props, { slots }) {
    return () => h('section', {
      class: 'el-collapse-item-stub',
      'data-title': props.title,
      'data-name': String(props.name ?? ''),
    }, slots['default']?.())
  },
})

describe('RendererTabs and RendererCollapse integration', () => {
  it('should render tabs panes with toolbar children and pane grid body', () => {
    const onTabChange = vi.fn()
    const wrapper = mount(RendererTabs, {
      props: {
        onTabChange,
        toolbar: { type: 'r-toolbar', children: [{ type: 'tabs-toolbar-action' }] },
        children: [
          {
            type: 'r-tab-pane',
            props: { label: '基本信息', name: 'base', gridGap: 16 },
            children: [
              { type: 'child-a', props: { colSpan: 12 } },
              { type: 'child-b', props: { colSpan: 12, rowSpan: 2 } },
            ],
          },
          {
            type: 'r-tab-pane',
            props: { label: '更多信息', name: 'more' },
            children: [],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="tabs-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.findAll('.el-tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('gap: 16px;')
    const gridItems = wrapper.findAll('.renderer-tabs-pane-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 12 / span 12;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-row: span 2 / span 2;')

    wrapper.findComponent(ElTabsStub).vm.$emit('tab-change', 'more')
    expect(onTabChange).toHaveBeenCalledWith('more')
  })

  it('should resolve pane fields from props only', () => {
    const wrapper = mount(RendererTabs, {
      props: {
        children: [
          {
            type: 'r-tab-pane',
            props: { label: '根级标签', name: 'root-pane', gridGap: 18 },
            children: [
              { type: 'child-a', props: { colSpan: 10 } },
              { type: 'child-b', props: { colSpan: 14, rowSpan: 2 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    const pane = wrapper.find('.el-tab-pane-stub')
    expect(pane.attributes('data-label')).toBe('根级标签')
    expect(pane.attributes('data-name')).toBe('root-pane')
    expect(wrapper.find('.renderer-tabs-pane-body').attributes('style')).toContain('gap: 18px;')
    const gridItems = wrapper.findAll('.renderer-tabs-pane-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 10 / span 10;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-row: span 2 / span 2;')
  })

  it('should emit tabs value updates', () => {
    const wrapper = mount(RendererTabs, {
      props: {
        children: [
          { type: 'r-tab-pane', props: { label: 'A', name: 'a' }, children: [] },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-tabs': ElTabsStub,
          'el-tab-pane': ElTabPaneStub,
        },
      },
    })

    wrapper.findComponent(ElTabsStub).vm.$emit('update:modelValue', 'a')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a'])
  })

  it('should render collapse items with toolbar children and item grid body', () => {
    const onChange = vi.fn()
    const wrapper = mount(RendererCollapse, {
      props: {
        onChange,
        toolbar: { type: 'r-toolbar', children: [{ type: 'collapse-toolbar-action' }] },
        children: [
          {
            type: 'r-collapse-item',
            props: { title: '分组一', name: 'one', gridGap: 12 },
            children: [
              { type: 'child-a', props: { colSpan: 8 } },
              { type: 'child-b', props: { colSpan: 16 } },
            ],
          },
          {
            type: 'r-collapse-item',
            props: { title: '分组二', name: 'two' },
            children: [],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-collapse': ElCollapseStub,
          'el-collapse-item': ElCollapseItemStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="collapse-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.findAll('.el-collapse-item-stub')).toHaveLength(2)
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('gap: 12px;')
    const gridItems = wrapper.findAll('.renderer-collapse-item-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 8 / span 8;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 16 / span 16;')

    wrapper.findComponent(ElCollapseStub).vm.$emit('change', ['one'])
    expect(onChange).toHaveBeenCalledWith(['one'])
  })

  it('should resolve collapse item fields from props only', () => {
    const wrapper = mount(RendererCollapse, {
      props: {
        children: [
          {
            type: 'r-collapse-item',
            props: { title: '根级分组', name: 'root-item', gridGap: 20 },
            children: [
              { type: 'child-a', props: { colSpan: 6 } },
              { type: 'child-b', props: { colSpan: 18 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-collapse': ElCollapseStub,
          'el-collapse-item': ElCollapseItemStub,
        },
      },
    })

    const item = wrapper.find('.el-collapse-item-stub')
    expect(item.attributes('data-title')).toBe('根级分组')
    expect(item.attributes('data-name')).toBe('root-item')
    expect(wrapper.find('.renderer-collapse-item-body').attributes('style')).toContain('gap: 20px;')
    const gridItems = wrapper.findAll('.renderer-collapse-item-grid-item')
    expect(gridItems[0]?.attributes('style')).toContain('grid-column: span 6 / span 6;')
    expect(gridItems[1]?.attributes('style')).toContain('grid-column: span 18 / span 18;')
  })
})
