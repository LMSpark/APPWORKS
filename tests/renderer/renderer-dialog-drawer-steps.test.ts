import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import {
  RendererDialog,
  RendererDrawer,
  RendererSteps,
  Spark,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import { isSparkNode, type SparkNodeChildren } from '@spark-appworks/spark-data'
import { defineCapability, isRecord } from '@spark-appworks/spark-utils'
import RendererStepItem from '../../packages/spark-component/src/components/containers/layout/RendererStepItem.vue'
import RendererToolbar from '../../packages/spark-component/src/components/containers/layout/RendererToolbar.vue'
import { createRendererDialogZeroCode } from '../../packages/spark-component/src/components/containers/layout/RendererDialog/zero-code'
import { createRendererDrawerZeroCode } from '../../packages/spark-component/src/components/containers/layout/RendererDrawer/zero-code'


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

function readStepMode(value: unknown): 'header' | 'content' {
  return value === 'header' || value === 'content' ? value : 'content'
}

function isStringCapability(value: unknown): value is string {
  return typeof value === 'string'
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

      if (type === 'r-step') {
        const children = readConfigChildren(config, propsMap)
        return h(RendererStepItem, {
          ...propsMap,
          children,
          index: readNumber(propsMap['index'], 0),
          mode: readStepMode(propsMap['mode']),
        })
      }

      return h('button', {
        class: 'spark-action-stub',
        'data-type': type,
      }, type)
    }
  },
})

const ElDialogStub = defineComponent({
  props: {
    modelValue: Boolean,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-dialog-stub', 'data-visible': String(props.modelValue) }, [
      slots['header']?.(),
      slots['default']?.(),
      slots['footer']?.(),
    ])
  },
})

const ElDrawerStub = defineComponent({
  props: {
    modelValue: Boolean,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-drawer-stub', 'data-visible': String(props.modelValue) }, [
      slots['header']?.(),
      slots['default']?.(),
      slots['footer']?.(),
    ])
  },
})

const ElStepsStub = defineComponent({
  props: {
    active: Number,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-steps-stub', 'data-active': String(props.active ?? '') }, slots['default']?.())
  },
})

const ElStepStub = defineComponent({
  props: {
    title: String,
    description: String,
    status: String,
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', {
      class: 'el-step-stub',
      'data-title': props.title,
      onClick: () => emit('click'),
    }, props.title)
  },
})

describe('RendererDialog, RendererDrawer and RendererSteps integration', () => {
  it('should keep drawer visibility in sync when API opens without external prop writeback', () => {
    const visibleValue = ref(false)
    const commitVisibleValue = vi.fn((value: boolean) => {
      visibleValue.value = value
    })
    const { drawerApi, handleModelUpdate } = createRendererDrawerZeroCode({
      visibleValue,
      commitVisibleValue,
      onOpen: undefined,
      onClose: undefined,
      onOpened: undefined,
      onClosed: undefined,
    })

    drawerApi.open()
    expect(visibleValue.value).toBe(true)
    expect(drawerApi.isVisible()).toBe(true)
    expect(commitVisibleValue).toHaveBeenCalledWith(true)

    handleModelUpdate(false)
    expect(visibleValue.value).toBe(false)
    expect(commitVisibleValue).toHaveBeenCalledWith(false)

    drawerApi.toggle()
    expect(visibleValue.value).toBe(true)
  })

  it('should keep dialog visibility in sync when API opens without external prop writeback', () => {
    const visibleValue = ref(false)
    const commitVisibleValue = vi.fn((value: boolean) => {
      visibleValue.value = value
    })
    const { dialogApi, handleModelUpdate } = createRendererDialogZeroCode({
      visibleValue,
      commitVisibleValue,
      onOpen: undefined,
      onClose: undefined,
      onOpened: undefined,
      onClosed: undefined,
    })

    dialogApi.open()
    expect(visibleValue.value).toBe(true)
    expect(dialogApi.isVisible()).toBe(true)
    expect(commitVisibleValue).toHaveBeenCalledWith(true)

    handleModelUpdate(false)
    expect(visibleValue.value).toBe(false)
    expect(commitVisibleValue).toHaveBeenCalledWith(false)

    dialogApi.toggle()
    expect(visibleValue.value).toBe(true)
  })

  it('should render dialog header/footer actions and body grid', () => {
    const wrapper = mount(RendererDialog, {
      props: {
        title: '编辑用户',
        value: true,
        gridGap: 12,
        header: { type: 'r-header', children: [{ type: 'dialog-header-action' }] },
        footer: { type: 'r-footer', children: [{ type: 'dialog-footer-action' }] },
        children: [
          { type: 'child-a', props: { colSpan: 8 } },
          { type: 'child-b', props: { colSpan: 16 } },
        ],
      },
      slots: {
        footer: ({ title }: Record<string, unknown>) => h('button', {
          class: 'biz-dialog-footer',
          'data-title': String(title ?? ''),
        }, 'biz-dialog-footer'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-dialog': ElDialogStub,
        },
      },
    })

    expect(wrapper.find('.renderer-dialog-title').text()).toContain('编辑用户')
    expect(wrapper.find('.spark-action-stub[data-type="dialog-header-action"]').exists()).toBe(true)
    expect(wrapper.find('.spark-action-stub[data-type="dialog-footer-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-dialog-footer').attributes('data-title')).toBe('编辑用户')
    expect(wrapper.find('.renderer-dialog-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.findAll('.renderer-dialog-grid-item')[0]?.attributes('style')).toContain('grid-column: span 8 / span 8;')
  })

  it('should emit drawer value updates and render footer slot', () => {
    const wrapper = mount(RendererDrawer, {
      props: {
        title: '抽屉详情',
        value: true,
      },
      slots: {
        footer: ({ visible }: Record<string, unknown>) => h('button', {
          class: 'biz-drawer-footer',
          'data-visible': String(visible ?? ''),
        }, 'biz-drawer-footer'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-drawer': ElDrawerStub,
        },
      },
    })

    wrapper.findComponent(ElDrawerStub).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.find('.biz-drawer-footer').attributes('data-visible')).toBe('true')
  })

  it('should render steps toolbar children and switch active step content', async () => {
    const onStepChange = vi.fn()
    const wrapper = mount(RendererSteps, {
      props: {
        onStepChange,
        toolbar: { type: 'r-toolbar', children: [{ type: 'steps-toolbar-action' }] },
        children: [
          {
            type: 'r-step',
            props: { title: '步骤一', name: 'step1', gridGap: 16 },
            children: [
              { type: 'child-a', props: { colSpan: 12 } },
            ],
          },
          {
            type: 'r-step',
            props: { title: '步骤二', name: 'step2' },
            children: [
              { type: 'child-b', props: { colSpan: 24 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-steps': ElStepsStub,
          'el-step': ElStepStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="steps-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('gap: 16px;')

    await wrapper.findAll('.el-step-stub')[1]?.trigger('click')
    expect(onStepChange).toHaveBeenCalledWith('step2', expect.objectContaining({ type: 'r-step' }), 1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['step2'])
  })

  it('should resolve step fields from props only', async () => {
    const onStepChange = vi.fn()
    const wrapper = mount(RendererSteps, {
      props: {
        onStepChange,
        children: [
          {
            type: 'r-step',
            props: { title: '根级步骤一', name: 'root-step-1', gridGap: 14 },
            children: [
              { type: 'child-a', props: { colSpan: 11 } },
            ],
          },
          {
            type: 'r-step',
            props: { title: '根级步骤二', name: 'root-step-2' },
            children: [
              { type: 'child-b', props: { colSpan: 24 } },
            ],
          },
        ],
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
          'el-steps': ElStepsStub,
          'el-step': ElStepStub,
        },
      },
    })

    expect(wrapper.find('.renderer-steps-content-body').attributes('style')).toContain('gap: 14px;')
    expect(wrapper.find('.renderer-steps-content-grid-item').attributes('style')).toContain('grid-column: span 11 / span 11;')

    await wrapper.findAll('.el-step-stub')[1]?.trigger('click')
    expect(onStepChange).toHaveBeenCalledWith('root-step-2', expect.objectContaining({ type: 'r-step' }), 1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['root-step-2'])
  })
})

// 验证 dialog/drawer slot 子组件能沿 Spark 上下文链消费到祖先提供的能力
const DIALOG_BRIDGE_MARKER = defineCapability<string>('test:dialog-bridge-marker', isStringCapability)

describe('Direct Vue children bridge (dialog / drawer)', () => {
  // ContextProbe 消费外层提供的标记能力：能消费到 → 上下文链穿过容器 slot 正常工作
  const ContextProbe = defineComponent({
    name: 'ContextProbe',
    setup() {
      const { sparkConsume } = useSparkComponent({ type: 'probe-field' })
      const marker = sparkConsume(DIALOG_BRIDGE_MARKER)
      return () => h('div', {
        class: 'context-probe',
        'data-connected': marker ?? 'none',
      }, 'probe')
    },
  })

  function mountWithSpark(component: any, options: Record<string, unknown>) {
    const plugin = Spark.createPlugin()
    return mount(component, {
      ...options,
      global: {
        plugins: [plugin],
        stubs: {
          'el-dialog': ElDialogStub,
          'el-drawer': ElDrawerStub,
        },
        ...(isRecord(options['global']) ? options['global'] : {}),
      },
    })
  }

  it('should propagate r-dialog parent context to direct Vue slot children', () => {
    // OuterProvider 注入标记能力，验证 RendererDialog slot 子组件能透过上下文链消费到
    const OuterProvider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'outer-provider' })
        sparkProvide(DIALOG_BRIDGE_MARKER, 'connected')
        return () => h(RendererDialog, { title: '对话框', value: true }, { default: () => h(ContextProbe) })
      },
    })
    const wrapper = mountWithSpark(OuterProvider, {})

    expect(wrapper.find('.context-probe').attributes('data-connected')).toBe('connected')
  })

  it('should propagate r-drawer parent context to direct Vue slot children', () => {
    const OuterProvider = defineComponent({
      setup() {
        const { sparkProvide } = useSparkComponent({ type: 'outer-provider' })
        sparkProvide(DIALOG_BRIDGE_MARKER, 'connected')
        return () => h(RendererDrawer, { title: '抽屉', value: true }, { default: () => h(ContextProbe) })
      },
    })
    const wrapper = mountWithSpark(OuterProvider, {})

    expect(wrapper.find('.context-probe').attributes('data-connected')).toBe('connected')
  })
})
