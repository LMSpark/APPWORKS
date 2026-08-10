import type { SparkNode } from '@spark-appworks/spark-data'
/**
 * Tests for Batch 5-6 layout/container components:
 * - RendererContainer (r-container)
 * - RendererAside (r-aside)
 * - RendererMain (r-main)
 * - RendererLayoutHeader (r-layout-header)
 * - RendererLayoutFooter (r-layout-footer)
 * - RendererButtonGroup (r-button-group)
 * - RendererRow (r-row) — from Batch 1
 * - RendererCol (r-col) — from Batch 1
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import {
  RendererContainer,
  RendererAside,
  RendererMain,
  RendererLayoutHeader,
  RendererLayoutFooter,
  RendererButtonGroup,
  RendererRow,
  RendererCol,
  Spark,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import type { ComponentRegistry } from '@spark-appworks/spark-component'
import type { CapabilityContext } from '@spark-appworks/spark-utils'

// ── Stubs for Element Plus ──

const ElContainerStub = defineComponent({
  props: ['direction'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-container-stub',
      'data-direction': props.direction ?? '',
    }, slots['default']?.())
  },
})

const ElAsideStub = defineComponent({
  props: ['width'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-aside-stub',
      'data-width': props.width ?? '',
    }, slots['default']?.())
  },
})

const ElMainStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-main-stub' }, slots['default']?.())
  },
})

const ElHeaderStub = defineComponent({
  props: ['height'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-header-stub',
      'data-height': props.height ?? '',
    }, slots['default']?.())
  },
})

const ElFooterStub = defineComponent({
  props: ['height'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-footer-stub',
      'data-height': props.height ?? '',
    }, slots['default']?.())
  },
})

const ElButtonGroupStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-button-group-stub' }, slots['default']?.())
  },
})

const ElRowStub = defineComponent({
  props: ['gutter', 'justify', 'align', 'tag'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-row-stub',
      'data-gutter': String(props.gutter ?? ''),
    }, slots['default']?.())
  },
})

const ElColStub = defineComponent({
  props: ['span', 'offset', 'push', 'pull', 'xs', 'sm', 'md', 'lg', 'xl', 'tag'],
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-col-stub',
      'data-span': String(props.span ?? ''),
    }, slots['default']?.())
  },
})

const SparkComponentRendererStub = defineComponent(
  (props: { config: SparkNode }) => {
    return () => h('div', {
      class: 'renderer-stub',
      'data-type': props.config.type,
    })
  },
  {
    name: 'SparkComponentRenderer',
    props: {
      config: {
        type: Object,
        required: true,
      },
    },
  },
)

// ── Helpers ──

import { SPARK_REGISTRY_KEY } from '@spark-appworks/spark-component'

type TestSystem = { registry: ComponentRegistry; rootContext: CapabilityContext}

function createTestSystem(): TestSystem {
  return Spark.createSystem()
}

function mountWithSpark(
  component: Component,
  config: Record<string, unknown>,
  stubs: Record<string, unknown>,
) {
  const { registry, rootContext } = createTestSystem()

  const Provider = defineComponent({
    setup() {
      const node: SparkNode = { type: 'test-parent' }
      useSparkComponent(node, { parentContext: rootContext })
      return () => h(component, config)
    },
  })

  return mount(Provider, {
    global: {
      stubs: {
        SparkComponentRenderer: SparkComponentRendererStub,
        ...stubs,
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })
}

// ── Tests ──

describe('RendererContainer (r-container)', () => {
  it('should render el-container with children', () => {
    const wrapper = mountWithSpark(RendererContainer, {
      type: 'r-container',
      children: [
        { type: 'r-aside', props: {} },
        { type: 'r-main', props: {} },
      ],
    }, { 'el-container': ElContainerStub })

    expect(wrapper.find('.el-container-stub').exists()).toBe(true)
    expect(wrapper.findAll('.renderer-stub')).toHaveLength(2)
  })

  it('should pass direction prop', () => {
    const wrapper = mountWithSpark(RendererContainer, {
      type: 'r-container',
      direction: 'vertical',
    }, { 'el-container': ElContainerStub })

    expect(wrapper.find('.el-container-stub').attributes('data-direction')).toBe('vertical')
  })
})

describe('RendererAside (r-aside)', () => {
  it('should render el-aside with default width', () => {
    const wrapper = mountWithSpark(RendererAside, {
      type: 'r-aside',
    }, { 'el-aside': ElAsideStub })

    expect(wrapper.find('.el-aside-stub').exists()).toBe(true)
    expect(wrapper.find('.el-aside-stub').attributes('data-width')).toBe('300px')
  })

  it('should accept custom width', () => {
    const wrapper = mountWithSpark(RendererAside, {
      type: 'r-aside',
      width: '200px',
    }, { 'el-aside': ElAsideStub })

    expect(wrapper.find('.el-aside-stub').attributes('data-width')).toBe('200px')
  })
})

describe('RendererMain (r-main)', () => {
  it('should render el-main with children', () => {
    const wrapper = mountWithSpark(RendererMain, {
      type: 'r-main',
      children: [{ type: 'div', props: {} }],
    }, { 'el-main': ElMainStub })

    expect(wrapper.find('.el-main-stub').exists()).toBe(true)
  })
})

describe('RendererLayoutHeader (r-layout-header)', () => {
  it('should render el-header with default height', () => {
    const wrapper = mountWithSpark(RendererLayoutHeader, {
      type: 'r-layout-header',
    }, { 'el-header': ElHeaderStub })

    expect(wrapper.find('.el-header-stub').exists()).toBe(true)
    expect(wrapper.find('.el-header-stub').attributes('data-height')).toBe('60px')
  })

  it('should accept custom height', () => {
    const wrapper = mountWithSpark(RendererLayoutHeader, {
      type: 'r-layout-header',
      height: '80px',
    }, { 'el-header': ElHeaderStub })

    expect(wrapper.find('.el-header-stub').attributes('data-height')).toBe('80px')
  })
})

describe('RendererLayoutFooter (r-layout-footer)', () => {
  it('should render el-footer with default height', () => {
    const wrapper = mountWithSpark(RendererLayoutFooter, {
      type: 'r-layout-footer',
    }, { 'el-footer': ElFooterStub })

    expect(wrapper.find('.el-footer-stub').exists()).toBe(true)
    expect(wrapper.find('.el-footer-stub').attributes('data-height')).toBe('60px')
  })
})

describe('RendererButtonGroup (r-button-group)', () => {
  it('should render el-button-group with children', () => {
    const wrapper = mountWithSpark(RendererButtonGroup, {
      type: 'r-button-group',
      children: [
        { type: 'r-button', props: {} },
        { type: 'r-button', props: {} },
      ],
    }, { 'el-button-group': ElButtonGroupStub })

    expect(wrapper.find('.el-button-group-stub').exists()).toBe(true)
    expect(wrapper.findAll('.renderer-stub')).toHaveLength(2)
  })
})

describe('RendererRow (r-row)', () => {
  it('should render el-row with gutter', () => {
    const wrapper = mountWithSpark(RendererRow, {
      type: 'r-row',
      gutter: 20,
      children: [
        { type: 'r-col', props: { span: 12 } },
        { type: 'r-col', props: { span: 12 } },
      ],
    }, { 'el-row': ElRowStub })

    expect(wrapper.find('.el-row-stub').exists()).toBe(true)
    expect(wrapper.find('.el-row-stub').attributes('data-gutter')).toBe('20')
    expect(wrapper.findAll('.renderer-stub')).toHaveLength(2)
  })
})

describe('RendererCol (r-col)', () => {
  it('should render el-col with span', () => {
    const wrapper = mountWithSpark(RendererCol, {
      type: 'r-col',
      span: 8,
      children: [{ type: 'div', props: {} }],
    }, { 'el-col': ElColStub })

    expect(wrapper.find('.el-col-stub').exists()).toBe(true)
    expect(wrapper.find('.el-col-stub').attributes('data-span')).toBe('8')
  })
})
