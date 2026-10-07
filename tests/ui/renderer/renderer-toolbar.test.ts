import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { RendererToolbar } from '@spark-appworks/spark-component'
import type { SparkNode } from '@spark-appworks/spark-data'

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
