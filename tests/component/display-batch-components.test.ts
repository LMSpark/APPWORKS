/**
 * Tests for Batch 4-6 display components:
 * - DisplayIcon (display-icon)
 * - DisplayCalendar (display-calendar)
 * - DisplayCountdown (display-countdown)
 * - DisplayImage (display-image)
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import type { Component } from 'vue'
import {
  DisplayIcon,
  DisplayCalendar,
  DisplayCountdown,
  DisplayImage,
  Spark,
  useSparkComponent,
  DATA_ROW,
  SPARK_REGISTRY_KEY,
} from '@spark-appworks/spark-component'
import type { SparkNode } from '@spark-appworks/spark-component'

// ── Stubs ──

const ElIconStub = defineComponent({
  props: ['size', 'color'],
  setup(props, { slots }) {
    return () => h('i', {
      class: 'el-icon-stub',
      'data-size': String(props.size ?? ''),
      'data-color': props.color ?? '',
    }, slots['default']?.())
  },
})

const ElCalendarStub = defineComponent({
  props: ['modelValue'],
  setup(props) {
    return () => h('div', {
      class: 'el-calendar-stub',
      'data-value': String(props.modelValue ?? ''),
    })
  },
})

const ElCountdownStub = defineComponent({
  props: ['value', 'title', 'format'],
  setup(props) {
    return () => h('div', {
      class: 'el-countdown-stub',
      'data-value': String(props.value ?? ''),
      'data-title': props.title ?? '',
    })
  },
})

const ElImageStub = defineComponent({
  props: ['src', 'fit', 'lazy', 'alt', 'previewSrcList', 'initialIndex', 'zIndex', 'hideOnClickModal', 'previewTeleported', 'closeOnPressEscape'],
  setup(props) {
    return () => h('div', {
      class: 'el-image-stub',
      'data-src': props.src ?? '',
      'data-fit': props.fit ?? '',
    })
  },
})

// ── Helpers ──

function mountDisplayComponent(
  component: Component,
  config: SparkNode & Record<string, unknown>,
  stubs: Record<string, Component> | undefined,
  dataRow?: Record<string, unknown>,
) {
  const { registry, rootContext } = Spark.createSystem()

  const Provider = defineComponent({
    setup() {
      const node: SparkNode = { type: 'test-parent' }
      const { sparkProvide } = useSparkComponent(node, { parentContext: rootContext })
      if (dataRow) {
        sparkProvide(DATA_ROW, dataRow)
      }
      return () => h(component, config)
    },
  })

  return mount(Provider, {
    global: {
      ...(stubs !== undefined ? { stubs } : {}),
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })
}

// ── Tests ──

describe('DisplayIcon (display-icon)', () => {
  it('should render el-icon with resolved icon component', () => {
    const wrapper = mountDisplayComponent(
      DisplayIcon,
      { type: 'display-icon', icon: 'Edit' },
      { 'el-icon': ElIconStub },
    )

    expect(wrapper.find('.el-icon-stub').exists()).toBe(true)
  })

  it('should pass iconSize and color props', () => {
    const wrapper = mountDisplayComponent(
      DisplayIcon,
      { type: 'display-icon', icon: 'Search', iconSize: 24, color: '#ff0000' },
      { 'el-icon': ElIconStub },
    )

    const icon = wrapper.find('.el-icon-stub')
    expect(icon.attributes('data-size')).toBe('24')
    expect(icon.attributes('data-color')).toBe('#ff0000')
  })

  it('should respect visible=false', () => {
    const wrapper = mountDisplayComponent(
      DisplayIcon,
      { type: 'display-icon', icon: 'Edit', visible: false },
      { 'el-icon': ElIconStub },
    )

    expect(wrapper.find('.el-icon-stub').exists()).toBe(false)
  })
})

describe('DisplayCalendar (display-calendar)', () => {
  it('should render el-calendar', () => {
    const wrapper = mountDisplayComponent(
      DisplayCalendar,
      { type: 'display-calendar' },
      { 'el-calendar': ElCalendarStub },
    )

    expect(wrapper.find('.el-calendar-stub').exists()).toBe(true)
  })
})

describe('DisplayCountdown (display-countdown)', () => {
  it('should render el-countdown with value', () => {
    const target = Date.now() + 3600000
    const wrapper = mountDisplayComponent(
      DisplayCountdown,
      { type: 'display-countdown', value: target, title: '距离截止' },
      { 'el-countdown': ElCountdownStub },
    )

    const stub = wrapper.find('.el-countdown-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.attributes('data-title')).toBe('距离截止')
  })
})

describe('DisplayImage (display-image)', () => {
  it('should render el-image with static src', () => {
    const wrapper = mountDisplayComponent(
      DisplayImage,
      { type: 'display-image', src: 'https://example.com/logo.png' },
      { 'el-image': ElImageStub, 'el-icon': ElIconStub },
    )

    const stub = wrapper.find('.el-image-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.attributes('data-src')).toBe('https://example.com/logo.png')
  })

  it('should resolve src from data row field', () => {
    const dataRow = reactive({
      avatar: 'https://example.com/photo.jpg',
      lingma_sys_params: { r: [], e: [], h: [], m: [], d: false },
    })
    const wrapper = mountDisplayComponent(
      DisplayImage,
      { type: 'display-image', field: 'avatar', fit: 'cover' },
      { 'el-image': ElImageStub, 'el-icon': ElIconStub },
      dataRow,
    )

    const stub = wrapper.find('.el-image-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.attributes('data-src')).toBe('https://example.com/photo.jpg')
  })

  it('should not expose a hidden image field from the backend permission row', () => {
    const dataRow = reactive({
      avatar: 'https://example.com/private.jpg',
      lingma_sys_params: { r: [], e: [], h: ['avatar'], m: [], d: false },
    })
    const wrapper = mountDisplayComponent(
      DisplayImage,
      { type: 'display-image', field: 'avatar' },
      { 'el-image': ElImageStub, 'el-icon': ElIconStub },
      dataRow,
    )

    expect(wrapper.find('.el-image-stub').attributes('data-src')).toBe('')
  })

  it('should replace a masked image field instead of rendering its raw URL', () => {
    const dataRow = reactive({
      avatar: 'https://example.com/private.jpg',
      lingma_sys_params: { r: [], e: [], h: [], m: ['avatar'], d: false },
    })
    const wrapper = mountDisplayComponent(
      DisplayImage,
      { type: 'display-image', field: 'avatar' },
      { 'el-image': ElImageStub, 'el-icon': ElIconStub },
      dataRow,
    )

    expect(wrapper.find('.el-image-stub').attributes('data-src')).toBe('••••')
  })

  it('should default fit to cover', () => {
    const wrapper = mountDisplayComponent(
      DisplayImage,
      { type: 'display-image', src: 'https://example.com/photo.jpg' },
      { 'el-image': ElImageStub, 'el-icon': ElIconStub },
    )

    expect(wrapper.find('.el-image-stub').attributes('data-fit')).toBe('cover')
  })
})
